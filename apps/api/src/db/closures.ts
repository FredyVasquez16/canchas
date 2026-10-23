import { randomUUID } from 'node:crypto';
import { allRows, oneRow, runSql, type Db } from './index.ts';

export interface ClosureRecord {
  id: string;
  courtId: string | null;
  startAt: number;
  endAt: number;
  note: string | null;
  createdBy: string | null;
  createdAt: number;
}

interface ClosureRow {
  id: string;
  court_id: string | null;
  start_at: number;
  end_at: number;
  note: string | null;
  created_by: string | null;
  created_at: number;
}

function toClosure(row: ClosureRow): ClosureRecord {
  return {
    id: row.id,
    courtId: row.court_id,
    startAt: Number(row.start_at),
    endAt: Number(row.end_at),
    note: row.note,
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
  };
}

export interface CreateClosureInput {
  courtId: string | null;
  startAt: number;
  endAt: number;
  note: string | null;
  createdBy: string | null;
  now: number;
}

export function createClosure(db: Db, input: CreateClosureInput): ClosureRecord {
  const id = randomUUID();
  runSql(
    db,
    `INSERT INTO closures (id, court_id, start_at, end_at, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.courtId, input.startAt, input.endAt, input.note, input.createdBy, input.now],
  );
  return getClosure(db, id)!;
}

export function getClosure(db: Db, id: string): ClosureRecord | null {
  const row = oneRow<ClosureRow>(db, 'SELECT * FROM closures WHERE id = ?', [id]);
  return row ? toClosure(row) : null;
}

export function listClosuresOverlapping(
  db: Db,
  startAt: number,
  endAt: number,
): ClosureRecord[] {
  return allRows<ClosureRow>(
    db,
    'SELECT * FROM closures WHERE start_at < ? AND ? < end_at ORDER BY start_at',
    [endAt, startAt],
  ).map(toClosure);
}

export function listUpcomingClosures(db: Db, from: number): ClosureRecord[] {
  return allRows<ClosureRow>(db, 'SELECT * FROM closures WHERE end_at > ? ORDER BY start_at', [
    from,
  ]).map(toClosure);
}

export function deleteClosure(db: Db, id: string): void {
  runSql(db, 'DELETE FROM closures WHERE id = ?', [id]);
}
