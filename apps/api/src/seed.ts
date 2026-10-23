import type { Db } from './db/index.ts';
import { createCourt, listCourts } from './db/courts.ts';
import { SEED_COURTS } from './config.ts';

export interface SeedResult {
  created: number;
  skipped: number;
}

/**
 * Creates the starting courts. Idempotent by name, so running it again after the
 * owner renamed or deactivated courts does not resurrect duplicates.
 */
export function seedCourts(db: Db, now: number = Date.now()): SeedResult {
  const existing = new Set(listCourts(db, { includeInactive: true }).map((court) => court.name));
  let created = 0;

  for (const court of SEED_COURTS) {
    if (existing.has(court.name)) {
      continue;
    }
    createCourt(db, {
      name: court.name,
      pricePerHourCents: court.pricePerHourCents,
      sortOrder: court.sortOrder,
      now,
    });
    created += 1;
  }

  return { created, skipped: SEED_COURTS.length - created };
}
