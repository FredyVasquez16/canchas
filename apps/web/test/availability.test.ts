import { describe, expect, it } from 'vitest';
import type { AvailabilityCourt, Slot, SlotStatus } from '../src/lib/api.ts';
import { lowestPriceCents, nextFreeHours } from '../src/lib/availability.ts';

const slot = (hour: number, status: SlotStatus): Slot => ({
  hour,
  label: `${String(hour).padStart(2, '0')}:00 - ${String((hour + 1) % 24).padStart(2, '0')}:00`,
  startAt: hour * 3_600_000,
  endAt: (hour + 1) * 3_600_000,
  status,
});

const courtRow = (name: string, statuses: Record<number, SlotStatus>): AvailabilityCourt => ({
  court: { id: name, name, pricePerHourCents: 50_000, active: true },
  slots: Array.from({ length: 24 }, (_, hour) => slot(hour, statuses[hour] ?? 'past')),
});

describe('nextFreeHours', () => {
  it('returns the first free hours in ascending order with the court that has them', () => {
    const courts = [
      courtRow('Cancha 1', { 18: 'available', 19: 'available' }),
      courtRow('Cancha 2', { 20: 'available' }),
    ];

    expect(nextFreeHours(courts, 3)).toEqual([
      { hour: 18, courtName: 'Cancha 1', label: '18:00 - 19:00' },
      { hour: 19, courtName: 'Cancha 1', label: '19:00 - 20:00' },
      { hour: 20, courtName: 'Cancha 2', label: '20:00 - 21:00' },
    ]);
  });

  it('lists an hour once even when several courts have it free', () => {
    const courts = [
      courtRow('Cancha 1', { 21: 'available' }),
      courtRow('Cancha 2', { 21: 'available' }),
    ];

    expect(nextFreeHours(courts, 4)).toEqual([
      { hour: 21, courtName: 'Cancha 1', label: '21:00 - 22:00' },
    ]);
  });

  it('ignores occupied, closed and past hours', () => {
    const courts = [
      courtRow('Cancha 1', { 15: 'occupied', 16: 'closed', 17: 'past', 18: 'available' }),
    ];

    expect(nextFreeHours(courts, 4)).toEqual([
      { hour: 18, courtName: 'Cancha 1', label: '18:00 - 19:00' },
    ]);
  });

  it('stops at the requested limit', () => {
    const courts = [courtRow('Cancha 1', { 10: 'available', 11: 'available', 12: 'available' })];
    expect(nextFreeHours(courts, 2)).toHaveLength(2);
  });

  it('returns nothing when the day is full', () => {
    expect(nextFreeHours([courtRow('Cancha 1', {})], 4)).toEqual([]);
  });
});

describe('lowestPriceCents', () => {
  it('reports the smallest hourly price among the courts', () => {
    const courts = [
      courtRow('Cancha 1', {}),
      { ...courtRow('Cancha 2', {}), court: { id: 'b', name: 'Cancha 2', pricePerHourCents: 65_000, active: true } },
    ];
    expect(lowestPriceCents(courts)).toBe(50_000);
  });

  it('is zero when there are no courts', () => {
    expect(lowestPriceCents([])).toBe(0);
  });
});
