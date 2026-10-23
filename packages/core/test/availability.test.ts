import { describe, expect, it } from 'vitest';
import {
  buildDayAvailability,
  daySlots,
  type Closure,
  type Court,
  type CourtReservation,
  zonedToEpoch,
} from '../src/index.ts';

const TZ = 'America/Tegucigalpa';
const HOUR_MS = 3_600_000;

const court = (id: string): Court => ({
  id,
  name: `Cancha ${id}`,
  pricePerHourCents: 50_000,
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

const closure = (
  startDate: string,
  startHour: number,
  hours: number,
  courtId: string | null = null,
): Closure => {
  const startAt = zonedToEpoch(startDate, startHour, TZ);
  return { id: `c:${startDate}:${startHour}:${hours}`, courtId, startAt, endAt: startAt + hours * HOUR_MS };
};

const DATE = '2025-03-10';
const beforeDay = zonedToEpoch(DATE, 0, TZ) - HOUR_MS;

describe('daySlots', () => {
  it('produces 24 one-hour slots from 00:00 through 23:00 for a 24 hour venue', () => {
    const slots = daySlots(DATE, TZ);
    expect(slots).toHaveLength(24);
    expect(slots[0]?.hour).toBe(0);
    expect(slots[0]?.label).toBe('00:00 - 01:00');
    expect(slots[23]?.hour).toBe(23);
    expect(slots[23]?.label).toBe('23:00 - 00:00');
    for (const slot of slots) {
      expect(slot.endAt - slot.startAt).toBe(HOUR_MS);
    }
  });

  it('lets the last slot of the day end exactly at the next venue midnight', () => {
    const slots = daySlots(DATE, TZ);
    expect(slots[23]?.endAt).toBe(zonedToEpoch('2025-03-11', 0, TZ));
  });
});

describe('buildDayAvailability', () => {
  it('reports every slot of every active court as available on an empty day', () => {
    const availability = buildDayAvailability({
      date: DATE,
      timeZone: TZ,
      courts: [court('A'), court('B')],
      reservations: [],
      closures: [],
      now: beforeDay,
    });

    expect(availability).toHaveLength(2);
    for (const entry of availability) {
      expect(entry.slots).toHaveLength(24);
      expect(entry.slots.every((s) => s.status === 'available')).toBe(true);
    }
  });

  it('marks only the reserved hour of the affected court as occupied', () => {
    const availability = buildDayAvailability({
      date: DATE,
      timeZone: TZ,
      courts: [court('A'), court('B')],
      reservations: [booked('A', DATE, 10)],
      closures: [],
      now: beforeDay,
    });

    const a = availability.find((entry) => entry.court.id === 'A');
    const b = availability.find((entry) => entry.court.id === 'B');
    expect(a?.slots[10]?.status).toBe('occupied');
    expect(a?.slots[9]?.status).toBe('available');
    expect(a?.slots[11]?.status).toBe('available');
    expect(b?.slots[10]?.status).toBe('available');
  });

  it('marks every hour of a multi-hour reservation as occupied', () => {
    const availability = buildDayAvailability({
      date: DATE,
      timeZone: TZ,
      courts: [court('A')],
      reservations: [booked('A', DATE, 20, 4)],
      closures: [],
      now: beforeDay,
    });

    const slots = availability[0]!.slots;
    for (const hour of [20, 21, 22, 23]) {
      expect(slots[hour]?.status).toBe('occupied');
    }
    expect(slots[19]?.status).toBe('available');
  });

  it('spills a reservation that crosses midnight into the next day', () => {
    const reservations = [booked('A', DATE, 23, 3)];

    const today = buildDayAvailability({
      date: DATE,
      timeZone: TZ,
      courts: [court('A')],
      reservations,
      closures: [],
      now: beforeDay,
    });
    expect(today[0]!.slots[23]?.status).toBe('occupied');

    const tomorrow = buildDayAvailability({
      date: '2025-03-11',
      timeZone: TZ,
      courts: [court('A')],
      reservations,
      closures: [],
      now: beforeDay,
    });
    expect(tomorrow[0]!.slots[0]?.status).toBe('occupied');
    expect(tomorrow[0]!.slots[1]?.status).toBe('occupied');
    expect(tomorrow[0]!.slots[2]?.status).toBe('available');
  });

  it('marks a full-day closure as closed', () => {
    const availability = buildDayAvailability({
      date: DATE,
      timeZone: TZ,
      courts: [court('A')],
      reservations: [],
      closures: [closure(DATE, 0, 24)],
      now: beforeDay,
    });

    expect(availability[0]!.slots.every((s) => s.status === 'closed')).toBe(true);
  });

  it('marks only the closed hours of a partial closure', () => {
    const availability = buildDayAvailability({
      date: DATE,
      timeZone: TZ,
      courts: [court('A')],
      reservations: [],
      closures: [closure(DATE, 8, 4)],
      now: beforeDay,
    });

    const slots = availability[0]!.slots;
    for (const hour of [8, 9, 10, 11]) {
      expect(slots[hour]?.status).toBe('closed');
    }
    expect(slots[7]?.status).toBe('available');
    expect(slots[12]?.status).toBe('available');
  });

  it('scopes a closure to a single court when a court id is given', () => {
    const availability = buildDayAvailability({
      date: DATE,
      timeZone: TZ,
      courts: [court('A'), court('B')],
      reservations: [],
      closures: [closure(DATE, 8, 4, 'A')],
      now: beforeDay,
    });

    const a = availability.find((entry) => entry.court.id === 'A')!;
    const b = availability.find((entry) => entry.court.id === 'B')!;
    expect(a.slots[8]?.status).toBe('closed');
    expect(b.slots[8]?.status).toBe('available');
  });

  it('marks hours that already started as past', () => {
    const availability = buildDayAvailability({
      date: DATE,
      timeZone: TZ,
      courts: [court('A')],
      reservations: [],
      closures: [],
      now: zonedToEpoch(DATE, 14, TZ) + 30 * 60_000,
    });

    const slots = availability[0]!.slots;
    for (let hour = 0; hour <= 14; hour += 1) {
      expect(slots[hour]?.status).toBe('past');
    }
    expect(slots[15]?.status).toBe('available');
  });

  it('frees the slot of a cancelled reservation', () => {
    const reservation = booked('A', DATE, 10);
    reservation.status = 'cancelled';

    const availability = buildDayAvailability({
      date: DATE,
      timeZone: TZ,
      courts: [court('A')],
      reservations: [reservation],
      closures: [],
      now: beforeDay,
    });

    expect(availability[0]!.slots[10]?.status).toBe('available');
  });

  it('ignores inactive courts', () => {
    const availability = buildDayAvailability({
      date: DATE,
      timeZone: TZ,
      courts: [{ ...court('A'), active: false }, court('B')],
      reservations: [],
      closures: [],
      now: beforeDay,
    });

    expect(availability.map((entry) => entry.court.id)).toEqual(['B']);
  });
});
