import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PASSWORD_RESET_TTL_MS, SESSION_TTL_MS } from '../config.ts';
import type { Db } from '../db/index.ts';
import {
  createPasswordReset,
  destroyPasswordResets,
  findUsablePasswordReset,
} from '../db/password-resets.ts';
import { findUserByEmail, findUserById, updatePasswordHash } from '../db/users.ts';
import {
  createSession,
  destroyAllSessions,
  hashPassword,
  hashToken,
} from '../auth.ts';
import { publicUser, reject, sessionCookie } from '../http.ts';
import type { Mailer } from '../jobs.ts';

const forgotSchema = z.object({
  email: z.string().trim().pipe(z.email()),
});

const resetSchema = z.object({
  token: z.string().trim().min(16).max(200),
  password: z.string().min(8).max(200),
});

export interface RecoveryDeps {
  db: Db;
  now: () => number;
  mailer: Mailer;
  webBaseUrl: string;
}

/** S35: the mail explains the link in plain words; the page does the rest. */
function recoveryMessage(
  to: string,
  name: string,
  link: string,
): { to: string; subject: string; text: string } {
  return {
    to,
    subject: 'Recupera tu contraseña',
    text: [
      `Hola ${name},`,
      '',
      'Pediste recuperar la contraseña de tu cuenta.',
      'Abre este enlace para elegir una nueva:',
      link,
      '',
      'El enlace vence en 60 minutos y se puede usar una sola vez.',
      'Si no fuiste tú, ignora este mensaje: tu contraseña sigue igual.',
    ].join('\n'),
  };
}

export function resetLink(webBaseUrl: string, token: string): string {
  const base = webBaseUrl.replace(/\/+$/, '');
  return `${base}/#/nueva-clave?token=${encodeURIComponent(token)}`;
}

export function registerRecoveryRoutes(app: FastifyInstance, deps: RecoveryDeps): void {
  const { db, now, mailer, webBaseUrl } = deps;

  app.post('/api/auth/forgot-password', async (request, reply) => {
    const parsed = forgotSchema.safeParse(request.body);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }

    const user = findUserByEmail(db, parsed.data.email);
    // S32: the answer never says whether the account exists.
    if (user) {
      const token = randomBytes(32).toString('base64url');
      createPasswordReset(db, {
        tokenHash: hashToken(token),
        userId: user.id,
        now: now(),
        ttlMs: PASSWORD_RESET_TTL_MS,
      });

      const message = recoveryMessage(user.email, user.name, resetLink(webBaseUrl, token));
      try {
        await mailer.send(message);
      } catch (error) {
        // S32 holds even when the channel is down: the client gets the same answer.
        console.error('[mail] recovery message failed', error);
      }
    }

    return reply.code(202).send({ ok: true });
  });

  app.post('/api/auth/reset-password', async (request, reply) => {
    const parsed = resetSchema.safeParse(request.body);
    if (!parsed.success) {
      // S31: a short password is a form mistake, not a dead link, so the token survives.
      return reject(reply, 400, 'invalid_input');
    }

    const timestamp = now();
    const record = findUsablePasswordReset(db, hashToken(parsed.data.token), timestamp);
    if (!record) {
      return reject(reply, 400, 'invalid_token');
    }

    const user = findUserById(db, record.userId);
    if (!user) {
      return reject(reply, 400, 'invalid_token');
    }

    const passwordHash = hashPassword(parsed.data.password);
    db.exec('BEGIN IMMEDIATE');
    let token: string;
    try {
      // S33: one write closes the old password, every old session and the used link.
      updatePasswordHash(db, user.id, passwordHash);
      destroyPasswordResets(db, user.id);
      destroyAllSessions(db, user.id);
      token = createSession(db, user.id, timestamp, SESSION_TTL_MS);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const updated = findUserById(db, user.id)!;
    reply.header('Set-Cookie', sessionCookie(token, SESSION_TTL_MS));
    return reply.code(200).send({ user: publicUser(updated) });
  });
}
