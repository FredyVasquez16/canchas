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
  return { ...toUser(row), passwordHash: row.password_hash };
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  phone: string;
  role?: Role;
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
  };

  runSql(
    db,
    `INSERT INTO users (id, email, password_hash, name, phone, phone_normalized, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.email,
      row.password_hash,
      row.name,
      row.phone,
      row.phone_normalized,
      row.role,
      row.created_at,
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
