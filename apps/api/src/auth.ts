import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from './db/index.ts';
import { findUserById, type UserRecord } from './db/users.ts';

const KEY_LENGTH = 64;

/**
 * S42: the synchronous scrypt blocked the event loop for ~50-100 ms per attempt, which is
 * enough to freeze the single-threaded API under a burst. The asynchronous form runs on the
 * libuv pool. The salt, the length and the stored format are unchanged, so every hash that
 * is already in the database keeps verifying.
 */
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * S40: an account created with Google stores no usable password. `verifyPassword` already
 * refuses anything that is not a scrypt tuple, so this value can never match a guess.
 */
export const NO_PASSWORD_HASH = 'google-only';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, expected] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !expected) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (expectedBuffer.length !== KEY_LENGTH) {
    return false;
  }
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
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

/** S33: a recovered password signs the account out everywhere, including this device. */
export function destroyAllSessions(db: Db, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}
