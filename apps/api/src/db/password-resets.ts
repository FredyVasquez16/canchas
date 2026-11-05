import { oneRow, runSql, type Db } from './index.ts';

export interface PasswordResetRecord {
  tokenHash: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
}

interface PasswordResetRow {
  token_hash: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
}

function toRecord(row: PasswordResetRow): PasswordResetRecord {
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    usedAt: row.used_at === null ? null : Number(row.used_at),
  };
}

export interface CreatePasswordResetInput {
  tokenHash: string;
  userId: string;
  now: number;
  ttlMs: number;
}

/**
 * S31: one live link per account. Asking again drops every previous unused token, so an
 * older mail cannot be replayed after the client requested a new one.
 */
export function createPasswordReset(db: Db, input: CreatePasswordResetInput): void {
  runSql(db, 'DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', [input.userId]);
  runSql(
    db,
    `INSERT INTO password_resets (token_hash, user_id, created_at, expires_at, used_at)
     VALUES (?, ?, ?, ?, NULL)`,
    [input.tokenHash, input.userId, input.now, input.now + input.ttlMs],
  );
}

/** S34: a used or expired token is not a token; the caller cannot tell which case it was. */
export function findUsablePasswordReset(
  db: Db,
  tokenHash: string,
  now: number,
): PasswordResetRecord | null {
  const row = oneRow<PasswordResetRow>(
    db,
    'SELECT * FROM password_resets WHERE token_hash = ?',
    [tokenHash],
  );
  if (!row) {
    return null;
  }
  const record = toRecord(row);
  if (record.usedAt !== null || record.expiresAt <= now) {
    return null;
  }
  return record;
}

/** S33: burning every token of the account keeps a leaked link from outliving the change. */
export function destroyPasswordResets(db: Db, userId: string): void {
  runSql(db, 'DELETE FROM password_resets WHERE user_id = ?', [userId]);
}
