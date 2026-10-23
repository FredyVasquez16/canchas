export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        phone_normalized TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'client')),
        created_at INTEGER NOT NULL
      );
      CREATE INDEX users_phone_idx ON users (phone_normalized);

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE courts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price_per_hour_cents INTEGER NOT NULL CHECK (price_per_hour_cents >= 0),
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE closures (
        id TEXT PRIMARY KEY,
        court_id TEXT REFERENCES courts (id) ON DELETE CASCADE,
        start_at INTEGER NOT NULL,
        end_at INTEGER NOT NULL,
        note TEXT,
        created_by TEXT REFERENCES users (id),
        created_at INTEGER NOT NULL,
        CHECK (end_at > start_at)
      );
      CREATE INDEX closures_range_idx ON closures (start_at, end_at);

      CREATE TABLE reservations (
        id TEXT PRIMARY KEY,
        court_id TEXT NOT NULL REFERENCES courts (id),
        user_id TEXT NOT NULL REFERENCES users (id),
        start_at INTEGER NOT NULL,
        end_at INTEGER NOT NULL,
        hours INTEGER NOT NULL CHECK (hours > 0),
        price_per_hour_cents INTEGER NOT NULL,
        total_cents INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('booked', 'cancelled')),
        arrived_at INTEGER,
        cancelled_at INTEGER,
        failure_marked_at INTEGER,
        failure_reason TEXT,
        created_at INTEGER NOT NULL,
        CHECK (end_at > start_at)
      );
      CREATE INDEX reservations_court_range_idx ON reservations (court_id, start_at, end_at);
      CREATE INDEX reservations_user_idx ON reservations (user_id, start_at);
      CREATE UNIQUE INDEX reservations_court_start_active_idx
        ON reservations (court_id, start_at)
        WHERE status = 'booked';

      CREATE TABLE client_blocks (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users (id),
        phone_normalized TEXT NOT NULL,
        start_at INTEGER NOT NULL,
        ends_at INTEGER,
        reason TEXT,
        created_by TEXT REFERENCES users (id),
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE INDEX client_blocks_phone_idx ON client_blocks (phone_normalized, revoked_at);
    `,
  },
];
