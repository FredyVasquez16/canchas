import {
  HOUR_MS,
  addDays,
  formatVenueDate,
  venueHour,
  zonedToEpoch,
  type VenueDate,
} from '@canchas/core';
import type { Db } from './db/index.ts';
import { listCourts } from './db/courts.ts';
import { listClosuresOverlapping } from './db/closures.ts';
import { listReservationsStartingInPeriod } from './db/reservations.ts';
import { countClientsCreatedBetween, findPeopleByIds } from './db/users.ts';

export interface StatsInput {
  from: VenueDate;
  to: VenueDate;
  timeZone: string;
}

export interface StatsTotals {
  reservations: number;
  cancelled: number;
  lateCancels: number;
  noShows: number;
  bookedHours: number;
  capacityHours: number;
  occupancyRate: number;
  expectedCents: number;
  collectedCents: number;
  clients: number;
  newClients: number;
}

export interface DailyPoint {
  date: VenueDate;
  reservations: number;
  bookedHours: number;
  collectedCents: number;
}

export interface HourPoint {
  hour: number;
  reservations: number;
}

export interface TopClient {
  id: string;
  name: string;
  phone: string;
  reservations: number;
  failures: number;
}

export interface StatsPayload {
  from: VenueDate;
  to: VenueDate;
  timeZone: string;
  totals: StatsTotals;
  daily: DailyPoint[];
  byHour: HourPoint[];
  topClients: TopClient[];
}

function overlapHours(
  startAt: number,
  endAt: number,
  from: number,
  to: number,
): number {
  const overlapStart = Math.max(startAt, from);
  const overlapEnd = Math.min(endAt, to);
  return overlapEnd > overlapStart ? (overlapEnd - overlapStart) / HOUR_MS : 0;
}

/**
 * S23: everything the owner needs to read the health of the venue for a period.
 * Money is cash collected against money expected from booked hours; capacity
 * excludes hours the venue was closed.
 */
export function computeStats(db: Db, input: StatsInput): StatsPayload {
  const timeZone = input.timeZone;
  const fromAt = zonedToEpoch(input.from, 0, timeZone);
  const toAt = zonedToEpoch(addDays(input.to, 1), 0, timeZone);

  const reservations = listReservationsStartingInPeriod(db, fromAt, toAt);
  const courts = listCourts(db);
  const closures = listClosuresOverlapping(db, fromAt, toAt);

  const periodHours = (toAt - fromAt) / HOUR_MS;
  const closedHours = closures.reduce((total, closure) => {
    const hours = overlapHours(closure.startAt, closure.endAt, fromAt, toAt);
    return total + hours * (closure.courtId === null ? courts.length : 1);
  }, 0);
  const capacityHours = Math.max(0, courts.length * periodHours - closedHours);

  const booked = reservations.filter((reservation) => reservation.status === 'booked');
  const bookedHours = booked.reduce((total, reservation) => total + reservation.hours, 0);
  const expectedCents = booked.reduce((total, reservation) => total + reservation.totalCents, 0);
  const collectedCents = booked
    .filter((reservation) => reservation.arrivedAt !== null)
    .reduce((total, reservation) => total + reservation.totalCents, 0);

  const daily: DailyPoint[] = [];
  const dayCursor = input.from;
  const dayCount = Math.round((toAt - fromAt) / (24 * HOUR_MS));
  for (let index = 0; index < dayCount; index += 1) {
    const date = addDays(dayCursor, index);
    const dayStart = zonedToEpoch(date, 0, timeZone);
    const dayEnd = zonedToEpoch(addDays(date, 1), 0, timeZone);
    const ofDay = reservations.filter(
      (reservation) => reservation.startAt >= dayStart && reservation.startAt < dayEnd,
    );
    const bookedOfDay = ofDay.filter((reservation) => reservation.status === 'booked');
    daily.push({
      date,
      reservations: ofDay.length,
      bookedHours: bookedOfDay.reduce((total, reservation) => total + reservation.hours, 0),
      collectedCents: bookedOfDay
        .filter((reservation) => reservation.arrivedAt !== null)
        .reduce((total, reservation) => total + reservation.totalCents, 0),
    });
  }

  const byHour: HourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    reservations: 0,
  }));
  for (const reservation of booked) {
    const hour = venueHour(reservation.startAt, timeZone);
    const point = byHour[hour];
    if (point) {
      point.reservations += 1;
    }
  }

  const perClient = new Map<string, { reservations: number; failures: number }>();
  for (const reservation of booked) {
    const current = perClient.get(reservation.userId) ?? { reservations: 0, failures: 0 };
    current.reservations += 1;
    if (reservation.failureMarkedAt !== null) {
      current.failures += 1;
    }
    perClient.set(reservation.userId, current);
  }
  const ranked = [...perClient.entries()]
    .sort((left, right) => right[1].reservations - left[1].reservations)
    .slice(0, 5);
  const people = new Map(
    findPeopleByIds(
      db,
      ranked.map(([id]) => id),
    ).map((person) => [person.id, person]),
  );
  const topClients: TopClient[] = ranked.map(([id, counts]) => ({
    id,
    name: people.get(id)?.name ?? 'Cliente',
    phone: people.get(id)?.phone ?? '',
    reservations: counts.reservations,
    failures: counts.failures,
  }));

  return {
    from: input.from,
    to: input.to,
    timeZone,
    totals: {
      reservations: reservations.length,
      cancelled: reservations.filter((reservation) => reservation.status === 'cancelled').length,
      lateCancels: reservations.filter((reservation) => reservation.failureReason === 'late_cancel')
        .length,
      noShows: reservations.filter((reservation) => reservation.failureReason === 'no_show').length,
      bookedHours,
      capacityHours,
      occupancyRate: capacityHours > 0 ? bookedHours / capacityHours : 0,
      expectedCents,
      collectedCents,
      clients: perClient.size,
      newClients: countClientsCreatedBetween(db, fromAt, toAt),
    },
    daily,
    byHour,
    topClients,
  };
}

export { formatVenueDate };
