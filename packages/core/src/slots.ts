import { HOUR_MS, type Slot, type VenueDate } from './types.ts';
import { zonedToEpoch } from './time.ts';

export const SLOTS_PER_DAY = 24;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The venue is open 24 hours, so every day has 24 bookable one-hour slots.
 * Slot 23 ends at the next venue midnight.
 */
export function daySlots(date: VenueDate, timeZone: string): Slot[] {
  const slots: Slot[] = [];
  for (let hour = 0; hour < SLOTS_PER_DAY; hour += 1) {
    const startAt = zonedToEpoch(date, hour, timeZone);
    slots.push({
      date,
      hour,
      startAt,
      endAt: startAt + HOUR_MS,
      label: `${pad(hour)}:00 - ${pad((hour + 1) % 24)}:00`,
    });
  }
  return slots;
}

export interface TimeRange {
  startAt: number;
  endAt: number;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}
