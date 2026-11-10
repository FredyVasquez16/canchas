export const VENUE_TIME_ZONE = 'America/Tegucigalpa';
export const CURRENCY = 'HNL';
export const COUNTRY_CODE = '504';

/** S6: cancelling at or before this point is free. */
export const CANCEL_WINDOW_HOURS = 3;

/** S16: anti-hoarding limits live in configuration, not in the panel. */
export const MAX_ADVANCE_DAYS = 30;
export const MAX_ACTIVE_RESERVATIONS = 2;

export const SESSION_TTL_MS = 30 * 24 * 3_600_000;

/**
 * S43: the session cookie carries `Secure` when the deployment speaks TLS. `COOKIE_SECURE`
 * overrides; otherwise production implies TLS and development does not.
 */
export function cookieSecure(env: NodeJS.ProcessEnv): boolean {
  const raw = (env.COOKIE_SECURE ?? '').trim().toLowerCase();
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

/**
 * S42: every auth attempt costs CPU or sends mail, so both are limited. The account limit is
 * what stops a brute force; the ip limit only stops a flood, because many clients of the
 * venue share one carrier address.
 */
export const LOGIN_WINDOW_MS = 5 * 60_000;
export const LOGIN_PER_ACCOUNT_LIMIT = 10;
export const LOGIN_PER_IP_LIMIT = 30;
export const REGISTER_WINDOW_MS = 60 * 60_000;
export const REGISTER_PER_IP_LIMIT = 10;
export const FORGOT_WINDOW_MS = 15 * 60_000;
export const FORGOT_PER_ACCOUNT_LIMIT = 5;
export const FORGOT_PER_IP_LIMIT = 20;

/** S31: a recovery link lives one hour, counted from the moment the client asked for it. */
export const PASSWORD_RESET_TTL_MS = 3_600_000;

/** S31: where the recovery link points when the deployment does not say otherwise. */
export const DEFAULT_WEB_BASE_URL = 'http://localhost:5173';

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
