import { randomUUID } from 'node:crypto';
import { allRows, oneRow, runSql, type Db } from './index.ts';

export type ReservationStatus = 'booked' | 'cancelled';
export type FailureReason = 'late_cancel' | 'no_show' | 'owner';

export interface Reservation {
  id: string;
  courtId: string;
  userId: string;
  startAt: number;
  endAt: number;
  hours: number;
  pricePerHourCents: number;
  totalCents: number;
  status: ReservationStatus;
  arrivedAt: number | null;
  cancelledAt: number | null;
  failureMarkedAt: number | null;
  failureReason: FailureReason | null;
  createdAt: number;
}

interface ReservationRow {
  id: string;
  court_id: string;
  user_id: string;
  start_at: number;
  end_at: number;
  hours: number;
  price_per_hour_cents: number;
  total_cents: number;
  status: ReservationStatus;
  arrived_at: number | null;
  cancelled_at: number | null;
  failure_marked_at: number | null;
  failure_reason: FailureReason | null;
  created_at: number;
}

interface AgendaRow extends ReservationRow {
  court_name: string;
  client_name: string;
  client_phone: string;
}

export interface AgendaEntry extends Reservation {
  courtName: string;
  clientName: string;
  clientPhone: string;
}

export function toReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    courtId: row.court_id,
    userId: row.user_id,
    startAt: Number(row.start_at),
    endAt: Number(row.end_at),
    hours: Number(row.hours),
    pricePerHourCents: Number(row.price_per_hour_cents),
    totalCents: Number(row.total_cents),
    status: row.status,
    arrivedAt: row.arrived_at === null ? null : Number(row.arrived_at),
    cancelledAt: row.cancelled_at === null ? null : Number(row.cancelled_at),
    failureMarkedAt: row.failure_marked_at === null ? null : Number(row.failure_marked_at),
    failureReason: row.failure_reason,
    createdAt: Number(row.created_at),
  };
}

export interface CreateReservationInput {
  courtId: string;
  userId: string;
  startAt: number;
  endAt: number;
  hours: number;
  pricePerHourCents: number;
  totalCents: number;
  now: number;
}

export function createReservation(db: Db, input: CreateReservationInput): Reservation {
  const id = randomUUID();
  runSql(
    db,
    `INSERT INTO reservations
       (id, court_id, user_id, start_at, end_at, hours, price_per_hour_cents, total_cents,
        status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?)`,
    [
      id,
      input.courtId,
      input.userId,
      input.startAt,
      input.endAt,
      input.hours,
      input.pricePerHourCents,
      input.totalCents,
      input.now,
    ],
  );
  return getReservation(db, id)!;
}

export function getReservation(db: Db, id: string): Reservation | null {
  const row = oneRow<ReservationRow>(db, 'SELECT * FROM reservations WHERE id = ?', [id]);
  return row ? toReservation(row) : null;
}

/** Booked reservations overlapping an instant range. */
export function listBookedOverlapping(
  db: Db,
  startAt: number,
  endAt: number,
  courtId?: string,
): Reservation[] {
  if (courtId) {
    return allRows<ReservationRow>(
      db,
      `SELECT * FROM reservations
       WHERE status = 'booked' AND court_id = ? AND start_at < ? AND ? < end_at`,
      [courtId, endAt, startAt],
    ).map(toReservation);
  }
  return allRows<ReservationRow>(
    db,
    `SELECT * FROM reservations
     WHERE status = 'booked' AND start_at < ? AND ? < end_at
     ORDER BY start_at`,
    [endAt, startAt],
  ).map(toReservation);
}

export function listReservationsForUser(
  db: Db,
  userId: string,
  from: number,
): Reservation[] {
  return allRows<ReservationRow>(
    db,
    `SELECT * FROM reservations
     WHERE user_id = ? AND end_at > ? AND status = 'booked'
     ORDER BY start_at`,
    [userId, from],
  ).map(toReservation);
}

export function countActiveReservationsForUser(db: Db, userId: string, now: number): number {
  const row = oneRow<{ total: number }>(
    db,
    `SELECT COUNT(*) AS total FROM reservations
     WHERE user_id = ? AND status = 'booked' AND end_at > ?`,
    [userId, now],
  );
  return row ? Number(row.total) : 0;
}

export function listReservationsBetween(
  db: Db,
  startAt: number,
  endAt: number,
): Reservation[] {
  return allRows<ReservationRow>(
    db,
    `SELECT * FROM reservations
     WHERE end_at > ? AND start_at < ?
     ORDER BY start_at, court_id`,
    [startAt, endAt],
  ).map(toReservation);
}

export function cancelReservation(db: Db, id: string, now: number): void {
  runSql(
    db,
    "UPDATE reservations SET status = 'cancelled', cancelled_at = ? WHERE id = ?",
    [now, id],
  );
}

export function markArrival(db: Db, id: string, now: number): void {
  runSql(db, 'UPDATE reservations SET arrived_at = ? WHERE id = ?', [now, id]);
}

export function markFailure(db: Db, id: string, reason: FailureReason, now: number): void {
  runSql(db, 'UPDATE reservations SET failure_marked_at = ?, failure_reason = ? WHERE id = ?', [
    now,
    reason,
    id,
  ]);
}

export function clearFailure(db: Db, id: string): void {
  runSql(db, 'UPDATE reservations SET failure_marked_at = NULL, failure_reason = NULL WHERE id = ?', [
    id,
  ]);
}

export function listReservationsEndedWithoutOutcome(
  db: Db,
  endedBefore: number,
): Reservation[] {
  return allRows<ReservationRow>(
    db,
    `SELECT * FROM reservations
     WHERE status = 'booked' AND end_at <= ?
       AND arrived_at IS NULL AND failure_marked_at IS NULL
     ORDER BY end_at`,
    [endedBefore],
  ).map(toReservation);
}

export function listReservationsStartingBetween(
  db: Db,
  after: number,
  before: number,
): Reservation[] {
  return allRows<ReservationRow>(
    db,
    `SELECT * FROM reservations
     WHERE status = 'booked' AND start_at > ? AND start_at <= ?
     ORDER BY start_at`,
    [after, before],
  ).map(toReservation);
}

/** Agenda rows joined with the court name and the client contact details. */
export function listAgendaBetween(
  db: Db,
  startAt: number,
  endAt: number,
): AgendaEntry[] {
  return allRows<AgendaRow>(
    db,
    `SELECT r.*, c.name AS court_name, u.name AS client_name, u.phone AS client_phone
     FROM reservations r
     JOIN courts c ON c.id = r.court_id
     JOIN users u ON u.id = r.user_id
     WHERE r.end_at > ? AND r.start_at < ?
     ORDER BY r.start_at, c.sort_order`,
    [startAt, endAt],
  ).map((row) => ({
    ...toReservation(row),
    courtName: row.court_name,
    clientName: row.client_name,
    clientPhone: row.client_phone,
  }));
}
