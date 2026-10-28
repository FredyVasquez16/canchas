import type { AvailabilityCourt } from './api.ts';

export interface FreeHour {
  hour: number;
  courtName: string;
  label: string;
}

/**
 * The next free hours of a day, for a hero that shows live availability instead
 * of advertising. An hour appears once, credited to the first court that has it.
 */
export function nextFreeHours(courts: AvailabilityCourt[], limit = 4): FreeHour[] {
  const free: FreeHour[] = [];

  for (let hour = 0; hour < 24 && free.length < limit; hour += 1) {
    for (const row of courts) {
      const slot = row.slots.find((candidate) => candidate.hour === hour);
      if (slot && slot.status === 'available') {
        free.push({ hour, courtName: row.court.name, label: slot.label });
        break;
      }
    }
  }

  return free;
}

export function lowestPriceCents(courts: AvailabilityCourt[]): number {
  if (courts.length === 0) {
    return 0;
  }
  return Math.min(...courts.map((row) => row.court.pricePerHourCents));
}
