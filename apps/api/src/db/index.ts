import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations.ts';

export type Db = DatabaseSync;

export function migrate(db: Db, now: number = Date.now()): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  const rows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>;
  const applied = new Set(rows.map((row) => Number(row.version)));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        now,
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function openDatabase(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }
  migrate(db);
  return db;
}

export type SqlParams = Array<string | number | bigint | null | Uint8Array>;

/** Typed row list; the driver returns untyped records. */
export function allRows<T>(db: Db, sql: string, params: SqlParams = []): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function oneRow<T>(db: Db, sql: string, params: SqlParams = []): T | null {
  const row = db.prepare(sql).get(...params) as unknown as T | undefined;
  return row ?? null;
}

export function runSql(db: Db, sql: string, params: SqlParams = []): void {
  db.prepare(sql).run(...params);
}
