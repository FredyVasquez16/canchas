import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../src/db/index.ts';
import { listCourts, setCourtActive, updateCourtPrice } from '../src/db/courts.ts';
import { seedCourts } from '../src/seed.ts';
import { createReservation } from '../src/db/reservations.ts';
import { createUser } from '../src/db/users.ts';
import { HOUR_MS, zonedToEpoch } from '@canchas/core';

const TZ = 'America/Tegucigalpa';
const NOW = zonedToEpoch('2025-03-10', 8, TZ);

function freshDatabase() {
  return openDatabase(':memory:');
}

function aUser(db: ReturnType<typeof freshDatabase>, email = 'ana@example.com') {
  return createUser(db, {
    email,
    passwordHash: 'scrypt:salt:hash',
    name: 'Ana',
    phone: '9999-8888',
    role: 'client',
    now: NOW,
  });
}

describe('migrations', () => {
  it('creates the schema once and is safe to run again', () => {
    const db = freshDatabase();
    migrate(db, NOW);
    migrate(db, NOW);

    const versions = db.prepare('SELECT version FROM schema_migrations').all();
    expect(versions).toHaveLength(1);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => String((row as { name: string }).name));
    expect(tables).toEqual(
      expect.arrayContaining([
        'client_blocks',
        'closures',
        'courts',
        'reservations',
        'sessions',
        'users',
      ]),
    );
  });
});

describe('seedCourts', () => {
  it('creates the three starting courts priced in lempiras', () => {
    const db = freshDatabase();
    const result = seedCourts(db, NOW);
    const courts = listCourts(db);

    expect(result.created).toBe(3);
    expect(courts).toHaveLength(3);
    expect(courts.map((court) => court.name)).toEqual(['Cancha 1', 'Cancha 2', 'Cancha 3']);
    expect(courts.every((court) => court.active)).toBe(true);
    expect(courts.every((court) => court.pricePerHourCents === 50_000)).toBe(true);
  });

  it('does not duplicate the courts when run twice', () => {
    const db = freshDatabase();
    seedCourts(db, NOW);
    seedCourts(db, NOW);
    expect(listCourts(db)).toHaveLength(3);
  });
});

describe('court administration', () => {
  it('lets the owner change a price without touching existing reservations', () => {
    const db = freshDatabase();
    seedCourts(db, NOW);
    const user = aUser(db);
    const court = listCourts(db)[0]!;
    const startAt = zonedToEpoch('2025-03-12', 20, TZ);

    createReservation(db, {
      courtId: court.id,
      userId: user.id,
      startAt,
      endAt: startAt + 2 * HOUR_MS,
      hours: 2,
      pricePerHourCents: court.pricePerHourCents,
      totalCents: 2 * court.pricePerHourCents,
      now: NOW,
    });

    updateCourtPrice(db, court.id, 75_000);

    expect(listCourts(db)[0]!.pricePerHourCents).toBe(75_000);
    const stored = db.prepare('SELECT total_cents, price_per_hour_cents FROM reservations').get() as {
      total_cents: number;
      price_per_hour_cents: number;
    };
    expect(stored.total_cents).toBe(100_000);
    expect(stored.price_per_hour_cents).toBe(50_000);
  });

  it('can deactivate a court without deleting its history', () => {
    const db = freshDatabase();
    seedCourts(db, NOW);
    const court = listCourts(db)[0]!;

    setCourtActive(db, court.id, false);

    expect(listCourts(db)).toHaveLength(2);
    expect(listCourts(db, { includeInactive: true })).toHaveLength(3);
  });
});

describe('reservation storage', () => {
  it('refuses a second active reservation on the same court and start', () => {
    const db = freshDatabase();
    seedCourts(db, NOW);
    const user = aUser(db);
    const court = listCourts(db)[0]!;
    const startAt = zonedToEpoch('2025-03-12', 20, TZ);
    const input = {
      courtId: court.id,
      userId: user.id,
      startAt,
      endAt: startAt + HOUR_MS,
      hours: 1,
      pricePerHourCents: court.pricePerHourCents,
      totalCents: court.pricePerHourCents,
      now: NOW,
    };

    createReservation(db, input);
    expect(() => createReservation(db, { ...input, userId: aUser(db, 'b@example.com').id })).toThrowError(
      /UNIQUE/i,
    );
  });
});
