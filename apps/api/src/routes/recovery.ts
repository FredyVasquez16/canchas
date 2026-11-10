import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  FORGOT_PER_ACCOUNT_LIMIT,
  FORGOT_PER_IP_LIMIT,
  FORGOT_WINDOW_MS,
  PASSWORD_RESET_TTL_MS,
  SESSION_TTL_MS,
} from '../config.ts';
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
import { publicUser, reject, sessionCookie, tooMany } from '../http.ts';
import type { Mailer } from '../jobs.ts';
import type { RateLimiter } from '../rate-limit.ts';

const forgotSchema = z.object({
  email: z.string().trim().pipe(z.email()),
});

const resetSchema = z.object({
  // Any non-empty token reaches the lookup, so a truncated or invented link answers
  // `invalid_token` instead of a form error (S34).
  token: z.string().trim().min(1).max(200),
  password: z.string().min(8).max(200),
});

export interface RecoveryDeps {
  db: Db;
  now: () => number;
  mailer: Mailer;
  webBaseUrl: string;
  limiter: RateLimiter;
  cookieSecure: boolean;
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
  const { db, now, mailer, webBaseUrl, limiter, cookieSecure } = deps;

  app.post('/api/auth/forgot-password', async (request, reply) => {
    const parsed = forgotSchema.safeParse(request.body);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }

    // S42: asking for a link costs a database row and an email, so it is limited per account
    // and per ip, before anything is written.
    const emailKey = parsed.data.email.trim().toLowerCase();
    const accountLimit = limiter.check(
      `forgot:account:${emailKey}`,
      FORGOT_PER_ACCOUNT_LIMIT,
      FORGOT_WINDOW_MS,
    );
    if (!accountLimit.allowed) {
      return tooMany(reply, accountLimit.retryAfterSeconds);
    }
    const ipLimit = limiter.check(`forgot:ip:${request.ip}`, FORGOT_PER_IP_LIMIT, FORGOT_WINDOW_MS);
    if (!ipLimit.allowed) {
      return tooMany(reply, ipLimit.retryAfterSeconds);
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
      // S32: the answer never waits on the mail channel. Awaiting it would make a slow
      // provider answer later for a real account than for an unknown one, which is a
      // scriptable oracle even though the body is identical.
      try {
        void Promise.resolve(mailer.send(message)).catch((error: unknown) => {
          console.error('[mail] recovery message failed', error);
        });
      } catch (error) {
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

    const passwordHash = await hashPassword(parsed.data.password);
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
    reply.header('Set-Cookie', sessionCookie(token, SESSION_TTL_MS, cookieSecure));
    return reply.code(200).send({ user: publicUser(updated) });
  });
}
