import { describe, expect, it } from 'vitest';
import {
  HOUR_MS,
  cancellationDeadline,
  evaluateReservation,
  zonedToEpoch,
} from '../src/index.ts';

const TZ = 'America/Tegucigalpa';
const DATE = '2025-03-10';
const START = zonedToEpoch(DATE, 20, TZ);
const END = START + HOUR_MS;
const WINDOW = 3;

const evaluate = (overrides: {
  now: number;
  cancelledAt?: number | null;
  arrivedAt?: number | null;
}) =>
  evaluateReservation({
    startAt: START,
    endAt: END,
    cancelWindowHours: WINDOW,
    ...overrides,
  });

describe('cancellationDeadline', () => {
  it('is three hours before the reserved hour', () => {
    expect(cancellationDeadline(START, WINDOW)).toBe(START - 3 * HOUR_MS);
  });
});

describe('evaluateReservation', () => {
  it('treats a cancellation four hours ahead as free', () => {
    const result = evaluate({ now: START - 5 * HOUR_MS, cancelledAt: START - 4 * HOUR_MS });
    expect(result.outcome).toBe('cancelled_free');
    expect(result.markFailure).toBe(false);
  });

  it('treats a cancellation exactly at the deadline as free', () => {
    const result = evaluate({
      now: START - 3 * HOUR_MS,
      cancelledAt: START - 3 * HOUR_MS,
    });
    expect(result.outcome).toBe('cancelled_free');
    expect(result.markFailure).toBe(false);
  });

  it('marks a cancellation made one minute after the deadline', () => {
    const result = evaluate({
      now: START - 2 * HOUR_MS,
      cancelledAt: START - 3 * HOUR_MS + 60_000,
    });
    expect(result.outcome).toBe('cancelled_late');
    expect(result.markFailure).toBe(true);
  });

  it('does not mark a reservation that is still in the future', () => {
    const result = evaluate({ now: START - 30 * 60_000 });
    expect(result.outcome).toBe('upcoming');
    expect(result.markFailure).toBe(false);
  });

  it('marks a reservation that ended without an arrival record', () => {
    const result = evaluate({ now: END + 60_000 });
    expect(result.outcome).toBe('no_show');
    expect(result.markFailure).toBe(true);
  });

  it('never marks a reservation that was paid for on arrival', () => {
    const result = evaluate({ now: END + 60_000, arrivedAt: START + 5 * 60_000 });
    expect(result.outcome).toBe('fulfilled');
    expect(result.markFailure).toBe(false);
  });

  it('keeps an arrival as fulfilled even if the reservation was later cancelled', () => {
    const result = evaluate({
      now: END + 60_000,
      arrivedAt: START + 5 * 60_000,
      cancelledAt: START - 10 * 60_000,
    });
    expect(result.outcome).toBe('fulfilled');
    expect(result.markFailure).toBe(false);
  });
});
