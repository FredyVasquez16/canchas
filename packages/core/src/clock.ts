/**
 * Presentation helpers for a 12-hour clock. The booking grid keeps 24 hours;
 * only what a person reads uses AM/PM (S21).
 */

function normalizeHour(hour: number): number {
  return ((Math.trunc(hour) % 24) + 24) % 24;
}

function meridiem(hour: number): 'AM' | 'PM' {
  return normalizeHour(hour) < 12 ? 'AM' : 'PM';
}

function hourOnClock(hour: number): number {
  const normalized = normalizeHour(hour) % 12;
  return normalized === 0 ? 12 : normalized;
}

/** `20` -> `8:00 PM`, `0` -> `12:00 AM`. */
export function formatHour12(hour: number): string {
  return `${hourOnClock(hour)}:00 ${meridiem(hour)}`;
}

/** `8` -> `8 AM`, for dense headings where minutes would not fit. */
export function formatHour12Short(hour: number): string {
  return `${hourOnClock(hour)} ${meridiem(hour)}`;
}

/** `20, 22` -> `8:00 PM - 10:00 PM`; a range may wrap past midnight. */
export function formatHour12Range(startHour: number, endHour: number): string {
  return `${formatHour12(startHour)} - ${formatHour12(endHour)}`;
}
