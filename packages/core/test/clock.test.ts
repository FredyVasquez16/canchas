import { describe, expect, it } from 'vitest';
import { formatHour12, formatHour12Range, formatHour12Short } from '../src/index.ts';

describe('formatHour12', () => {
  it.each([
    [0, '12:00 AM'],
    [1, '1:00 AM'],
    [11, '11:00 AM'],
    [12, '12:00 PM'],
    [13, '1:00 PM'],
    [20, '8:00 PM'],
    [23, '11:00 PM'],
  ])('formats hour %s as %s', (hour, expected) => {
    expect(formatHour12(hour)).toBe(expected);
  });

  it('wraps an hour that belongs to the next day', () => {
    expect(formatHour12(24)).toBe('12:00 AM');
    expect(formatHour12(26)).toBe('2:00 AM');
  });
});

describe('formatHour12Short', () => {
  it.each([
    [0, '12 AM'],
    [9, '9 AM'],
    [12, '12 PM'],
    [18, '6 PM'],
  ])('formats hour %s as %s', (hour, expected) => {
    expect(formatHour12Short(hour)).toBe(expected);
  });
});

describe('formatHour12Range', () => {
  it('joins both ends with AM and PM', () => {
    expect(formatHour12Range(20, 22)).toBe('8:00 PM - 10:00 PM');
  });

  it('keeps the meridiem of each end when the range crosses noon', () => {
    expect(formatHour12Range(11, 13)).toBe('11:00 AM - 1:00 PM');
  });

  it('wraps past midnight', () => {
    expect(formatHour12Range(23, 2)).toBe('11:00 PM - 2:00 AM');
  });
});
