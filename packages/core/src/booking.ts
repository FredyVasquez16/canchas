import { HOUR_MS, type Closure, type Court, type CourtReservation, type VenueDate } from './types.ts';
import { zonedToEpoch } from './time.ts';
import { rangesOverlap } from './slots.ts';

export type BookingRejectionReason =
  | 'invalid_duration'
  | 'invalid_start'
  | 'court_inactive'
  | 'past'
  | 'advance_limit'
  | 'closed'
  | 'occupied';

export interface BookingRequest {
  court: Court;
  date: VenueDate;
  startHour: number;
  hours: number;
}

export interface BookingPolicy {
  timeZone: string;
  maxAdvanceDays: number;
}

export interface BookingSuccess {
  ok: true;
  startAt: number;
  endAt: number;
  hours: number;
  pricePerHourCents: number;
  totalCents: number;
}

export type BookingResult = BookingSuccess | { ok: false; reason: BookingRejectionReason };

export interface BookingInput {
  request: BookingRequest;
  reservations: CourtReservation[];
  closures: Closure[];
  now: number;
  policy: BookingPolicy;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Validates a whole booking range before anything is written. The range is one
 * interval, so a single occupied or closed hour rejects the entire request.
 */
export function validateBooking(input: BookingInput): BookingResult {
  const { request, policy } = input;

  if (!isPositiveInteger(request.hours)) {
    return { ok: false, reason: 'invalid_duration' };
  }
  if (!Number.isInteger(request.startHour) || request.startHour < 0 || request.startHour > 23) {
    return { ok: false, reason: 'invalid_start' };
  }
  if (!request.court.active) {
    return { ok: false, reason: 'court_inactive' };
  }

  const startAt = zonedToEpoch(request.date, request.startHour, policy.timeZone);
  const endAt = startAt + request.hours * HOUR_MS;

  if (startAt <= input.now) {
    return { ok: false, reason: 'past' };
  }
  if (startAt > input.now + policy.maxAdvanceDays * 24 * HOUR_MS) {
    return { ok: false, reason: 'advance_limit' };
  }

  const range = { startAt, endAt };
  const closed = input.closures.some(
    (closure) =>
      (closure.courtId === null || closure.courtId === request.court.id) &&
      rangesOverlap(closure, range),
  );
  if (closed) {
    return { ok: false, reason: 'closed' };
  }

  const occupied = input.reservations.some(
    (reservation) =>
      reservation.status === 'booked' &&
      reservation.courtId === request.court.id &&
      rangesOverlap(reservation, range),
  );
  if (occupied) {
    return { ok: false, reason: 'occupied' };
  }

  return {
    ok: true,
    startAt,
    endAt,
    hours: request.hours,
    pricePerHourCents: request.court.pricePerHourCents,
    totalCents: request.hours * request.court.pricePerHourCents,
  };
}
