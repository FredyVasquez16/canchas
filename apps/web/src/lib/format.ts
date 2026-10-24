import {
  addDays,
  formatHour12,
  formatHour12Range,
  formatVenueDate,
  venueHour,
  zonedToEpoch,
} from '@canchas/core';

const SYMBOLS: Record<string, string> = { HNL: 'L' };

export function formatMoney(cents: number, currency = 'HNL'): string {
  const symbol = SYMBOLS[currency] ?? currency;
  const whole = Math.floor(Math.abs(cents) / 100).toString();
  const fraction = (Math.abs(cents) % 100).toString().padStart(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : ''}${symbol} ${grouped}.${fraction}`;
}

export function todayInVenue(timeZone: string): string {
  return formatVenueDate(Date.now(), timeZone);
}

/** S21: people read 12-hour hours; the grid stays 24 hours internally. */
export function hourText(epochMs: number, timeZone: string): string {
  return formatHour12(venueHour(epochMs, timeZone));
}

export function rangeText(startAt: number, endAt: number, timeZone: string): string {
  return formatHour12Range(venueHour(startAt, timeZone), venueHour(endAt, timeZone));
}

export function dayText(date: string, timeZone: string): string {
  const noon = zonedToEpoch(date, 12, timeZone);
  return new Intl.DateTimeFormat('es-HN', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(noon);
}

export interface DayOption {
  date: string;
  weekday: string;
  day: string;
  relative: string | null;
}

export function upcomingDays(
  from: string,
  timeZone: string,
  count = 7,
): DayOption[] {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(from, index);
    const noon = zonedToEpoch(date, 12, timeZone);
    const parts = new Intl.DateTimeFormat('es-HN', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).formatToParts(noon);
    const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return {
      date,
      weekday: read('weekday').replace('.', ''),
      day: `${read('day')} ${read('month').replace('.', '')}`,
      relative: index === 0 ? 'hoy' : index === 1 ? 'mañana' : null,
    };
  });
}

export function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)} %`;
}

/** `2026-09-24` -> `24 sep`, for chart axes and dense tables. */
export function shortDate(date: string, timeZone: string): string {
  const noon = zonedToEpoch(date, 12, timeZone);
  return new Intl.DateTimeFormat('es-HN', {
    timeZone,
    day: 'numeric',
    month: 'short',
  })
    .format(noon)
    .replace('.', '');
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}
