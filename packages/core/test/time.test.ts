import { describe, expect, it } from 'vitest';
import { formatVenueDate, venueHour, zonedToEpoch } from '../src/index.ts';

const HONDURAS = 'America/Tegucigalpa';
const NEW_YORK = 'America/New_York';

describe('zonedToEpoch', () => {
  it('converts a Honduras wall clock time to UTC (fixed offset -06:00)', () => {
    // 10:00 in Honduras (UTC-6) is 16:00 UTC.
    expect(zonedToEpoch('2025-03-10', 10, HONDURAS)).toBe(
      Date.UTC(2025, 2, 10, 16, 0, 0, 0),
    );
  });

  it('converts midnight correctly', () => {
    expect(zonedToEpoch('2025-03-10', 0, HONDURAS)).toBe(
      Date.UTC(2025, 2, 10, 6, 0, 0, 0),
    );
  });

  it('respects daylight saving time transitions', () => {
    // 2025-03-09 is the US spring-forward day: 10:00 local is 14:00 UTC (EDT).
    expect(zonedToEpoch('2025-03-09', 10, NEW_YORK)).toBe(
      Date.UTC(2025, 2, 9, 14, 0, 0, 0),
    );
    // 2025-01-15 is standard time: 10:00 local is 15:00 UTC (EST).
    expect(zonedToEpoch('2025-01-15', 10, NEW_YORK)).toBe(
      Date.UTC(2025, 0, 15, 15, 0, 0, 0),
    );
  });
});

describe('formatVenueDate', () => {
  it('reports the venue calendar date, not the UTC date', () => {
    // 03:00 UTC on March 11 is still 21:00 on March 10 in Honduras.
    const instant = Date.UTC(2025, 2, 11, 3, 0, 0, 0);
    expect(formatVenueDate(instant, HONDURAS)).toBe('2025-03-10');
    expect(venueHour(instant, HONDURAS)).toBe(21);
  });
});
