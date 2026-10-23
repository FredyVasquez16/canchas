import { describe, expect, it } from 'vitest';
import {
  selectHour,
  selectionHours,
  selectionLabel,
  selectionTotalCents,
  type SlotSelection,
} from '../src/lib/selection.ts';

const allFree = () => true;
const freeExcept = (...blocked: number[]) => (hour: number) => !blocked.includes(hour);

describe('selectHour', () => {
  it('selects a single hour on the first click', () => {
    expect(selectHour(null, 'court-a', 20, allFree)).toEqual({
      courtId: 'court-a',
      start: 20,
      hours: 1,
    });
  });

  it('extends the range forward when the clicked hour is later', () => {
    const current: SlotSelection = { courtId: 'court-a', start: 20, hours: 1 };
    expect(selectHour(current, 'court-a', 22, allFree)).toEqual({
      courtId: 'court-a',
      start: 20,
      hours: 3,
    });
  });

  it('extends the range backward when the clicked hour is earlier', () => {
    const current: SlotSelection = { courtId: 'court-a', start: 21, hours: 1 };
    expect(selectHour(current, 'court-a', 19, allFree)).toEqual({
      courtId: 'court-a',
      start: 19,
      hours: 3,
    });
  });

  it('refuses to span an occupied hour and starts over from the clicked one', () => {
    const current: SlotSelection = { courtId: 'court-a', start: 18, hours: 1 };
    expect(selectHour(current, 'court-a', 21, freeExcept(19, 20))).toEqual({
      courtId: 'court-a',
      start: 21,
      hours: 1,
    });
  });

  it('starts over when the client switches court', () => {
    const current: SlotSelection = { courtId: 'court-a', start: 20, hours: 2 };
    expect(selectHour(current, 'court-b', 21, allFree)).toEqual({
      courtId: 'court-b',
      start: 21,
      hours: 1,
    });
  });

  it('clears the selection when the only selected hour is clicked again', () => {
    const current: SlotSelection = { courtId: 'court-a', start: 20, hours: 1 };
    expect(selectHour(current, 'court-a', 20, allFree)).toBeNull();
  });
});

describe('selectionHours', () => {
  it('lists every hour of the range', () => {
    expect(selectionHours({ courtId: 'court-a', start: 20, hours: 3 })).toEqual([20, 21, 22]);
  });
});

describe('selectionLabel', () => {
  it('shows the start and the end of the range', () => {
    expect(selectionLabel({ courtId: 'court-a', start: 20, hours: 2 })).toBe('20:00 - 22:00');
  });

  it('wraps past midnight for a late range', () => {
    expect(selectionLabel({ courtId: 'court-a', start: 23, hours: 2 })).toBe('23:00 - 01:00');
  });
});

describe('selectionTotalCents', () => {
  it('multiplies the hours by the court price', () => {
    expect(selectionTotalCents({ courtId: 'court-a', start: 20, hours: 3 }, 50_000)).toBe(150_000);
  });
});
