import type { VenueDate } from './types.ts';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

interface VenueParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function readPart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const found = parts.find((part) => part.type === type);
  return found ? Number(found.value) : 0;
}

function venueParts(epochMs: number, timeZone: string): VenueParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(epochMs));
  const hour = readPart(parts, 'hour');
  return {
    year: readPart(parts, 'year'),
    month: readPart(parts, 'month'),
    day: readPart(parts, 'day'),
    // Some engines report midnight as hour 24.
    hour: hour === 24 ? 0 : hour,
    minute: readPart(parts, 'minute'),
    second: readPart(parts, 'second'),
  };
}

/** Offset of the venue time zone at an instant, in milliseconds (east positive). */
function offsetAt(epochMs: number, timeZone: string): number {
  const truncated = Math.floor(epochMs / 1000) * 1000;
  const parts = venueParts(truncated, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - truncated;
}

function parseDate(date: VenueDate): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Invalid venue date: ${date}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isVenueDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts a wall clock time in the venue time zone into an epoch instant.
 * Two offset lookups keep it correct across daylight saving transitions.
 */
export function zonedToEpoch(date: VenueDate, hour: number, timeZone: string): number {
  const [year, month, day] = parseDate(date);
  const guess = Date.UTC(year, month - 1, day, hour, 0, 0, 0);
  const firstPass = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(firstPass, timeZone);
}

export function formatVenueDate(epochMs: number, timeZone: string): VenueDate {
  const parts = venueParts(epochMs, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function venueHour(epochMs: number, timeZone: string): number {
  return venueParts(epochMs, timeZone).hour;
}

export function addDays(date: VenueDate, days: number): VenueDate {
  const [year, month, day] = parseDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}
