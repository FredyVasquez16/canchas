import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Db } from './db/index.ts';
import { findUserById, type UserRecord } from './db/users.ts';

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !expected) {
    return false;
  }
  const derived = scryptSync(password, salt, KEY_LENGTH);
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (expectedBuffer.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(derived, expectedBuffer);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(
  db: Db,
  userId: string,
  now: number,
  ttlMs: number,
): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(hashToken(token), userId, now, now + ttlMs);
  return token;
}

export function destroySession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function findSessionUser(db: Db, token: string, now: number): UserRecord | null {
  const row = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(hashToken(token)) as { user_id: string; expires_at: number } | undefined;
  if (!row) {
    return null;
  }
  if (Number(row.expires_at) <= now) {
    destroySession(db, token);
    return null;
  }
  return findUserById(db, row.user_id);
}

/** S30: a password change closes every other session, so a stolen cookie dies with it. */
export function destroyOtherSessions(db: Db, userId: string, keepToken: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(
    userId,
    hashToken(keepToken),
  );
}
