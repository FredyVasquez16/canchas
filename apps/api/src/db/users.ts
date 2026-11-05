import { randomUUID } from 'node:crypto';
import { allRows, oneRow, runSql, type Db } from './index.ts';
import { normalizePhone } from '../phone.ts';

export type Role = 'admin' | 'staff' | 'client';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  role: Role;
  createdAt: number;
}

export interface UserRecord extends User {
  passwordHash: string;
  /** S37: the Google subject when the account was created or linked with Google. */
  googleId: string | null;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  phone: string;
  phone_normalized: string;
  role: Role;
  created_at: number;
  google_id: string | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    phoneNormalized: row.phone_normalized,
    role: row.role,
    createdAt: Number(row.created_at),
  };
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    ...toUser(row),
    passwordHash: row.password_hash,
    googleId: row.google_id ?? null,
  };
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  phone: string;
  role?: Role;
  googleId?: string;
  now: number;
}

export function createUser(db: Db, input: CreateUserInput): User {
  const row: UserRow = {
    id: randomUUID(),
    email: input.email.trim().toLowerCase(),
    password_hash: input.passwordHash,
    name: input.name.trim(),
    phone: input.phone.trim(),
    phone_normalized: normalizePhone(input.phone),
    role: input.role ?? 'client',
    created_at: input.now,
    google_id: input.googleId ?? null,
  };

  runSql(
    db,
    `INSERT INTO users (id, email, password_hash, name, phone, phone_normalized, role, created_at, google_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.email,
      row.password_hash,
      row.name,
      row.phone,
      row.phone_normalized,
      row.role,
      row.created_at,
      row.google_id,
    ],
  );

  return toUser(row);
}

export function findUserByEmail(db: Db, email: string): UserRecord | null {
  const row = oneRow<UserRow>(db, 'SELECT * FROM users WHERE email = ?', [
    email.trim().toLowerCase(),
  ]);
  return row ? toUserRecord(row) : null;
}

export function findUserById(db: Db, id: string): UserRecord | null {
  const row = oneRow<UserRow>(db, 'SELECT * FROM users WHERE id = ?', [id]);
  return row ? toUserRecord(row) : null;
}

/** S37: the Google subject is the way back into the account on every later sign-in. */
export function findUserByGoogleId(db: Db, googleId: string): UserRecord | null {
  const row = oneRow<UserRow>(db, 'SELECT * FROM users WHERE google_id = ?', [googleId]);
  return row ? toUserRecord(row) : null;
}

/** S37: an existing account with the same verified email is linked, never duplicated. */
export function linkGoogleId(db: Db, userId: string, googleId: string): void {
  runSql(db, 'UPDATE users SET google_id = ? WHERE id = ?', [googleId, userId]);
}

export function findUserByPhone(db: Db, phone: string): UserRecord | null {
  const row = oneRow<UserRow>(db, 'SELECT * FROM users WHERE phone_normalized = ? LIMIT 1', [
    normalizePhone(phone),
  ]);
  return row ? toUserRecord(row) : null;
}

export interface ClientFailureCount {
  id: string;
  name: string;
  email: string;
  phone: string;
  phoneNormalized: string;
  failures: number;
}

/** S10: failures of a month are derived from the marks, never typed by hand. */
export function listClientFailureCounts(
  db: Db,
  monthStart: number,
  monthEnd: number,
): ClientFailureCount[] {
  return allRows<{
    id: string;
    name: string;
    email: string;
    phone: string;
    phone_normalized: string;
    failures: number;
  }>(
    db,
    `SELECT u.id, u.name, u.email, u.phone, u.phone_normalized,
            COALESCE(SUM(CASE WHEN r.failure_marked_at IS NOT NULL
                              AND r.failure_marked_at >= ?
                              AND r.failure_marked_at < ? THEN 1 ELSE 0 END), 0) AS failures
     FROM users u
     LEFT JOIN reservations r ON r.user_id = u.id
     WHERE u.role = 'client'
     GROUP BY u.id
     ORDER BY failures DESC, u.name`,
    [monthStart, monthEnd],
  ).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    phoneNormalized: row.phone_normalized,
    failures: Number(row.failures),
  }));
}

export function countClientsCreatedBetween(db: Db, from: number, to: number): number {
  const row = oneRow<{ total: number }>(
    db,
    `SELECT COUNT(*) AS total FROM users
     WHERE role = 'client' AND created_at >= ? AND created_at < ?`,
    [from, to],
  );
  return row ? Number(row.total) : 0;
}

export interface PersonSummary {
  id: string;
  name: string;
  phone: string;
}

export function findPeopleByIds(db: Db, ids: string[]): PersonSummary[] {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => '?').join(', ');
  return allRows<{ id: string; name: string; phone: string }>(
    db,
    `SELECT id, name, phone FROM users WHERE id IN (${placeholders})`,
    ids,
  );
}

export interface ProfileUpdate {
  name?: string;
  phone?: string;
}

export function updateUserProfile(db: Db, id: string, update: ProfileUpdate): void {
  if (update.name !== undefined) {
    runSql(db, 'UPDATE users SET name = ? WHERE id = ?', [update.name.trim(), id]);
  }
  if (update.phone !== undefined) {
    runSql(db, 'UPDATE users SET phone = ?, phone_normalized = ? WHERE id = ?', [
      update.phone.trim(),
      normalizePhone(update.phone),
      id,
    ]);
  }
}

export function updatePasswordHash(db: Db, id: string, passwordHash: string): void {
  runSql(db, 'UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
}
