import { randomUUID } from 'node:crypto';
import { allRows, oneRow, runSql, type Db } from './index.ts';
import { normalizePhone } from '../phone.ts';

export interface ClientBlock {
  id: string;
  userId: string | null;
  phoneNormalized: string;
  startsAt: number;
  /** `null` means the block has no end date. */
  endsAt: number | null;
  reason: string | null;
  createdBy: string | null;
  createdAt: number;
  revokedAt: number | null;
}

interface BlockRow {
  id: string;
  user_id: string | null;
  phone_normalized: string;
  start_at: number;
  ends_at: number | null;
  reason: string | null;
  created_by: string | null;
  created_at: number;
  revoked_at: number | null;
}

function toBlock(row: BlockRow): ClientBlock {
  return {
    id: row.id,
    userId: row.user_id,
    phoneNormalized: row.phone_normalized,
    startsAt: Number(row.start_at),
    endsAt: row.ends_at === null ? null : Number(row.ends_at),
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
    revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
  };
}

export interface CreateBlockInput {
  userId: string | null;
  phone: string;
  startsAt: number;
  endsAt: number | null;
  reason: string | null;
  createdBy: string | null;
  now: number;
}

export function createBlock(db: Db, input: CreateBlockInput): ClientBlock {
  const id = randomUUID();
  runSql(
    db,
    `INSERT INTO client_blocks
       (id, user_id, phone_normalized, start_at, ends_at, reason, created_by, created_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      id,
      input.userId,
      normalizePhone(input.phone),
      input.startsAt,
      input.endsAt,
      input.reason,
      input.createdBy,
      input.now,
    ],
  );
  return getBlock(db, id)!;
}

export function getBlock(db: Db, id: string): ClientBlock | null {
  const row = oneRow<BlockRow>(db, 'SELECT * FROM client_blocks WHERE id = ?', [id]);
  return row ? toBlock(row) : null;
}

/**
 * A block matches by account or by normalized phone, so registering again with
 * the same number does not restore the ability to book (S11).
 */
export function findActiveBlock(
  db: Db,
  input: { userId: string | null; phone: string; at: number },
): ClientBlock | null {
  const row = oneRow<BlockRow>(
    db,
    `SELECT * FROM client_blocks
     WHERE revoked_at IS NULL
       AND start_at <= ?
       AND (ends_at IS NULL OR ends_at > ?)
       AND ((user_id IS NOT NULL AND user_id = ?) OR phone_normalized = ?)
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.at, input.at, input.userId, normalizePhone(input.phone)],
  );
  return row ? toBlock(row) : null;
}

export function listActiveBlocks(db: Db, at: number): ClientBlock[] {
  return allRows<BlockRow>(
    db,
    `SELECT * FROM client_blocks
     WHERE revoked_at IS NULL AND start_at <= ? AND (ends_at IS NULL OR ends_at > ?)
     ORDER BY created_at DESC`,
    [at, at],
  ).map(toBlock);
}

export function listBlocksForPhone(db: Db, phone: string): ClientBlock[] {
  return allRows<BlockRow>(
    db,
    'SELECT * FROM client_blocks WHERE phone_normalized = ? ORDER BY created_at DESC',
    [normalizePhone(phone)],
  ).map(toBlock);
}

export function revokeBlock(db: Db, id: string, now: number): void {
  runSql(db, 'UPDATE client_blocks SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [
    now,
    id,
  ]);
}
