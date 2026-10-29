import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import { findUserById, updatePasswordHash, updateUserProfile } from '../db/users.ts';
import {
  destroyOtherSessions,
  findSessionUser,
  hashPassword,
  verifyPassword,
} from '../auth.ts';
import { publicUser, reject, tokenFrom } from '../http.ts';
import { isValidHonduranPhone } from '../phone.ts';

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().optional(),
  password: z.string().min(8).optional(),
  currentPassword: z.string().min(1).optional(),
  email: z.string().optional(),
});

export function registerAccountRoutes(
  app: FastifyInstance,
  deps: { db: Db; now: () => number },
): void {
  const { db, now } = deps;

  function sessionUser(request: FastifyRequest) {
    const token = tokenFrom(request);
    return token ? findSessionUser(db, token, now()) : null;
  }

  app.patch('/api/account', async (request, reply) => {
    const user = sessionUser(request);
    if (!user) {
      return reject(reply, 401, 'unauthenticated');
    }

    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const { name, phone, password, currentPassword, email } = parsed.data;

    // The email is the account identity: it is shown, never edited (S30).
    if (email !== undefined) {
      return reject(reply, 400, 'email_immutable');
    }

    if (phone !== undefined && !isValidHonduranPhone(phone)) {
      return reject(reply, 400, 'invalid_input');
    }

    if (password !== undefined) {
      if (currentPassword === undefined) {
        return reject(reply, 400, 'current_password_required');
      }
      if (!verifyPassword(currentPassword, user.passwordHash)) {
        return reject(reply, 403, 'invalid_current_password');
      }
    }

    if (name === undefined && phone === undefined && password === undefined) {
      return reject(reply, 400, 'invalid_input');
    }

    updateUserProfile(db, user.id, { name, phone });
    if (password !== undefined) {
      updatePasswordHash(db, user.id, hashPassword(password));
      const token = tokenFrom(request);
      if (token) {
        destroyOtherSessions(db, user.id, token);
      }
    }

    const updated = findUserById(db, user.id)!;
    return reply.code(200).send({ user: publicUser(updated) });
  });
}
