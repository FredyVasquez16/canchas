export const VENUE_TIME_ZONE = 'America/Tegucigalpa';
export const CURRENCY = 'HNL';
export const COUNTRY_CODE = '504';

/** S6: cancelling at or before this point is free. */
export const CANCEL_WINDOW_HOURS = 3;

/** S16: anti-hoarding limits live in configuration, not in the panel. */
export const MAX_ADVANCE_DAYS = 30;
export const MAX_ACTIVE_RESERVATIONS = 2;

export const SESSION_TTL_MS = 30 * 24 * 3_600_000;

/** S24: the API process pushes reminders itself; one pass every 15 minutes by default. */
export const REMINDER_INTERVAL_MS = 900_000;

/** Accepts `REMINDER_INTERVAL_MS` only when it is a positive number of milliseconds. */
export function reminderIntervalMs(env: NodeJS.ProcessEnv): number {
  const parsed = Number((env.REMINDER_INTERVAL_MS ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : REMINDER_INTERVAL_MS;
}

/** S18: three courts at start, priced in lempiras. */
export const SEED_COURTS = [
  { name: 'Cancha 1', pricePerHourCents: 50_000, sortOrder: 1 },
  { name: 'Cancha 2', pricePerHourCents: 50_000, sortOrder: 2 },
  { name: 'Cancha 3', pricePerHourCents: 50_000, sortOrder: 3 },
] as const;

export const apiConfig = {
  venueTimeZone: VENUE_TIME_ZONE,
  currency: CURRENCY,
  cancelWindowHours: CANCEL_WINDOW_HOURS,
  maxAdvanceDays: MAX_ADVANCE_DAYS,
  maxActiveReservations: MAX_ACTIVE_RESERVATIONS,
} as const;
