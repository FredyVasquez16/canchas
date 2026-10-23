import { describe, expect, it } from 'vitest';
import {
  HOUR_MS,
  validateBooking,
  zonedToEpoch,
  type Closure,
  type Court,
  type CourtReservation,
} from '../src/index.ts';

const TZ = 'America/Tegucigalpa';
const DATE = '2025-03-10';
const beforeDay = zonedToEpoch(DATE, 0, TZ) - HOUR_MS;

const court = (pricePerHourCents = 50_000): Court => ({
  id: 'A',
  name: 'Cancha A',
  pricePerHourCents,
  active: true,
});

const booked = (
  courtId: string,
  date: string,
  hour: number,
  hours = 1,
): CourtReservation => {
  const startAt = zonedToEpoch(date, hour, TZ);
  return {
    id: `${courtId}:${date}:${hour}`,
    courtId,
    startAt,
    endAt: startAt + hours * HOUR_MS,
    status: 'booked',
  };
};

const closure = (courtId: string | null, startHour: number, hours: number): Closure => {
  const startAt = zonedToEpoch(DATE, startHour, TZ);
  return { id: 'closure', courtId, startAt, endAt: startAt + hours * HOUR_MS };
};

const baseInput = () => ({
  reservations: [] as CourtReservation[],
  closures: [] as Closure[],
  now: beforeDay,
  policy: { timeZone: TZ, maxAdvanceDays: 30 },
});

describe('validateBooking', () => {
  it('accepts a single hour and computes the total from the court price', () => {
    const result = validateBooking({
      ...baseInput(),
      request: { court: court(), date: DATE, startHour: 10, hours: 1 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.startAt).toBe(zonedToEpoch(DATE, 10, TZ));
    expect(result.endAt).toBe(zonedToEpoch(DATE, 11, TZ));
    expect(result.totalCents).toBe(50_000);
    expect(result.hours).toBe(1);
  });

  it('multiplies the hourly price by the number of hours', () => {
    const result = validateBooking({
      ...baseInput(),
      request: { court: court(42_000), date: DATE, startHour: 14, hours: 5 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalCents).toBe(210_000);
  });

  it('places no cap on consecutive hours', () => {
    const result = validateBooking({
      ...baseInput(),
      request: { court: court(), date: DATE, startHour: 6, hours: 12 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hours).toBe(12);
    expect(result.endAt - result.startAt).toBe(12 * HOUR_MS);
  });

  it('accepts a reservation that crosses midnight when the next hours are free', () => {
    const result = validateBooking({
      ...baseInput(),
      request: { court: court(), date: DATE, startHour: 23, hours: 3 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.startAt).toBe(zonedToEpoch(DATE, 23, TZ));
    expect(result.endAt).toBe(zonedToEpoch('2025-03-11', 2, TZ));
  });

  it.each([0, -1, 1.5])('rejects an invalid duration of %s hours', (hours) => {
    const result = validateBooking({
      ...baseInput(),
      request: { court: court(), date: DATE, startHour: 10, hours },
    });

    expect(result).toEqual({ ok: false, reason: 'invalid_duration' });
  });

  it.each([24, -1, 24.5])('rejects an invalid start hour of %s', (startHour) => {
    const result = validateBooking({
      ...baseInput(),
      request: { court: court(), date: DATE, startHour, hours: 1 },
    });

    expect(result).toEqual({ ok: false, reason: 'invalid_start' });
  });

  it('rejects a start hour that already began', () => {
    const result = validateBooking({
      ...baseInput(),
      now: zonedToEpoch(DATE, 10, TZ) + 60_000,
      request: { court: court(), date: DATE, startHour: 10, hours: 1 },
    });

    expect(result).toEqual({ ok: false, reason: 'past' });
  });

  it('rejects a start instant that lies beyond the advance limit', () => {
    const result = validateBooking({
      ...baseInput(),
      request: { court: court(), date: '2025-05-10', startHour: 10, hours: 1 },
    });

    expect(result).toEqual({ ok: false, reason: 'advance_limit' });
  });

  it('allows a start instant exactly at the advance limit', () => {
    const startAt = zonedToEpoch('2025-04-09', 0, TZ);
    const result = validateBooking({
      ...baseInput(),
      now: startAt - 30 * 24 * HOUR_MS,
      request: { court: court(), date: '2025-04-09', startHour: 0, hours: 1 },
    });

    expect(result.ok).toBe(true);
  });

  it('rejects the whole range when a single hour is occupied', () => {
    const result = validateBooking({
      ...baseInput(),
      reservations: [booked('A', DATE, 13)],
      request: { court: court(), date: DATE, startHour: 12, hours: 3 },
    });

    expect(result).toEqual({ ok: false, reason: 'occupied' });
  });

  it('does not let another court block the range', () => {
    const result = validateBooking({
      ...baseInput(),
      reservations: [{ ...booked('B', DATE, 12), courtId: 'B' }],
      request: { court: court(), date: DATE, startHour: 12, hours: 2 },
    });

    expect(result.ok).toBe(true);
  });

  it('ignores cancelled reservations', () => {
    const cancelled = { ...booked('A', DATE, 12), status: 'cancelled' as const };
    const result = validateBooking({
      ...baseInput(),
      reservations: [cancelled],
      request: { court: court(), date: DATE, startHour: 12, hours: 1 },
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a range that touches a closure', () => {
    const result = validateBooking({
      ...baseInput(),
      closures: [closure(null, 15, 2)],
      request: { court: court(), date: DATE, startHour: 13, hours: 3 },
    });

    expect(result).toEqual({ ok: false, reason: 'closed' });
  });

  it('accepts a range that ends exactly when a closure starts', () => {
    const result = validateBooking({
      ...baseInput(),
      closures: [closure(null, 15, 2)],
      request: { court: court(), date: DATE, startHour: 13, hours: 2 },
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a booking on an inactive court', () => {
    const result = validateBooking({
      ...baseInput(),
      request: {
        court: { ...court(), active: false },
        date: DATE,
        startHour: 10,
        hours: 1,
      },
    });

    expect(result).toEqual({ ok: false, reason: 'court_inactive' });
  });
});
