import { randomUUID } from 'node:crypto';
import type { Court } from '@canchas/core';
import { allRows, oneRow, runSql, type Db } from './index.ts';

export interface CourtRecord extends Court {
  sortOrder: number;
}

interface CourtRow {
  id: string;
  name: string;
  price_per_hour_cents: number;
  active: number;
  sort_order: number;
}

function toCourt(row: CourtRow): CourtRecord {
  return {
    id: row.id,
    name: row.name,
    pricePerHourCents: Number(row.price_per_hour_cents),
    active: Number(row.active) === 1,
    sortOrder: Number(row.sort_order),
  };
}

export interface ListCourtsOptions {
  includeInactive?: boolean;
}

export function listCourts(db: Db, options: ListCourtsOptions = {}): CourtRecord[] {
  const sql = options.includeInactive
    ? 'SELECT * FROM courts ORDER BY sort_order, name'
    : 'SELECT * FROM courts WHERE active = 1 ORDER BY sort_order, name';
  return allRows<CourtRow>(db, sql).map(toCourt);
}

export function getCourt(db: Db, id: string): CourtRecord | null {
  const row = oneRow<CourtRow>(db, 'SELECT * FROM courts WHERE id = ?', [id]);
  return row ? toCourt(row) : null;
}

export interface CreateCourtInput {
  name: string;
  pricePerHourCents: number;
  sortOrder?: number;
  now: number;
}

export function createCourt(db: Db, input: CreateCourtInput): CourtRecord {
  const row: CourtRow = {
    id: randomUUID(),
    name: input.name.trim(),
    price_per_hour_cents: input.pricePerHourCents,
    active: 1,
    sort_order: input.sortOrder ?? 0,
  };
  runSql(
    db,
    `INSERT INTO courts (id, name, price_per_hour_cents, active, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.id, row.name, row.price_per_hour_cents, row.active, row.sort_order, input.now],
  );
  return toCourt(row);
}

export function updateCourtPrice(db: Db, courtId: string, pricePerHourCents: number): void {
  runSql(db, 'UPDATE courts SET price_per_hour_cents = ? WHERE id = ?', [
    pricePerHourCents,
    courtId,
  ]);
}

export function setCourtActive(db: Db, courtId: string, active: boolean): void {
  runSql(db, 'UPDATE courts SET active = ? WHERE id = ?', [active ? 1 : 0, courtId]);
}

export function renameCourt(db: Db, courtId: string, name: string): void {
  runSql(db, 'UPDATE courts SET name = ? WHERE id = ?', [name.trim(), courtId]);
}

/**
 * A court with history is never deleted: its reservations carry the money and the
 * statistics. Deactivate it instead, so the history keeps its court name.
 */
export function deleteCourt(db: Db, courtId: string): void {
  runSql(db, 'DELETE FROM courts WHERE id = ?', [courtId]);
}
