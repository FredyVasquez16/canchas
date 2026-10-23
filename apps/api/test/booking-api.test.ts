import { afterEach, describe, expect, it } from 'vitest';
import { HOUR_MS, zonedToEpoch } from '@canchas/core';
import { createBlock } from '../src/db/blocks.ts';
import { createTestContext, registerClient, type TestContext } from './helpers.ts';

let context: TestContext;

afterEach(async () => {
  await context?.app.close();
});

const DATE = '2025-03-12';

async function courtsOf(ctx: TestContext) {
  const response = await ctx.app.inject({ method: 'GET', url: '/api/courts' });
  return (response.json() as { courts: Array<{ id: string; name: string; pricePerHourCents: number }> })
    .courts;
}

function book(
  ctx: TestContext,
  cookie: string | null,
  payload: { courtId: string; date: string; startHour: number; hours: number },
) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/reservations',
    headers: cookie ? { cookie } : {},
    payload,
  });
}

describe('GET /api/availability', () => {
  it('shows every court and its 24 slots to an anonymous visitor', async () => {
    context = createTestContext();
    const response = await context.app.inject({
      method: 'GET',
      url: `/api/availability?date=${DATE}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      date: string;
      currency: string;
      courts: Array<{ court: { name: string; pricePerHourCents: number }; slots: Array<{ hour: number; status: string }> }>;
    };
    expect(body.date).toBe(DATE);
    expect(body.currency).toBe('HNL');
    expect(body.courts).toHaveLength(3);
    expect(body.courts[0]!.slots).toHaveLength(24);
    expect(body.courts[0]!.court.pricePerHourCents).toBe(50_000);
    expect(body.courts[0]!.slots.every((slot) => slot.status === 'available')).toBe(true);
  });

  it('rejects a missing or malformed date', async () => {
    context = createTestContext();
    const missing = await context.app.inject({ method: 'GET', url: '/api/availability' });
    expect(missing.statusCode).toBe(400);

    const malformed = await context.app.inject({
      method: 'GET',
      url: '/api/availability?date=12-03-2025',
    });
    expect(malformed.statusCode).toBe(400);
  });

  it('reflects a booking in the availability of that court only', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courts = await courtsOf(context);

    await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 20,
      hours: 2,
    });

    const response = await context.app.inject({
      method: 'GET',
      url: `/api/availability?date=${DATE}`,
    });
    const body = response.json() as {
      courts: Array<{ court: { id: string }; slots: Array<{ hour: number; status: string }> }>;
    };
    const first = body.courts.find((entry) => entry.court.id === courts[0]!.id)!;
    const second = body.courts.find((entry) => entry.court.id === courts[1]!.id)!;

    expect(first.slots[20]!.status).toBe('occupied');
    expect(first.slots[21]!.status).toBe('occupied');
    expect(first.slots[19]!.status).toBe('available');
    expect(second.slots[20]!.status).toBe('available');
  });
});

describe('POST /api/reservations', () => {
  it('requires an account', async () => {
    context = createTestContext();
    const courts = await courtsOf(context);
    const response = await book(context, null, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 10,
      hours: 1,
    });

    expect(response.statusCode).toBe(401);
  });

  it('creates the reservation and snapshots the price', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courts = await courtsOf(context);

    const response = await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 10,
      hours: 3,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      reservation: { totalCents: number; hours: number; status: string; startAt: number };
    };
    expect(body.reservation.totalCents).toBe(150_000);
    expect(body.reservation.hours).toBe(3);
    expect(body.reservation.status).toBe('booked');
    expect(body.reservation.startAt).toBe(zonedToEpoch(DATE, 10, context.clock.now === 0 ? 'UTC' : 'America/Tegucigalpa'));

    const stored = context.db
      .prepare('SELECT price_per_hour_cents, total_cents FROM reservations')
      .get() as { price_per_hour_cents: number; total_cents: number };
    expect(stored.price_per_hour_cents).toBe(50_000);
  });

  it('allows back to back reservations on the same court', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courts = await courtsOf(context);

    const first = await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 12,
      hours: 1,
    });
    const second = await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 13,
      hours: 1,
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
  });

  it('refuses the same slot twice, even when two clients race for it', async () => {
    context = createTestContext();
    const ana = await registerClient(context, { phone: '9999-1111' });
    const luis = await registerClient(context, { phone: '9999-2222' });
    const courts = await courtsOf(context);
    const payload = { courtId: courts[0]!.id, date: DATE, startHour: 18, hours: 1 };

    const responses = await Promise.all([
      book(context, ana.cookie, payload),
      book(context, luis.cookie, payload),
    ]);
    const statuses = responses.map((response) => response.statusCode).sort();

    expect(statuses).toEqual([201, 409]);
    expect(context.db.prepare('SELECT COUNT(*) AS total FROM reservations').get()).toMatchObject({
      total: 1,
    });
  });

  it('refuses a range that overlaps an existing reservation', async () => {
    context = createTestContext();
    const ana = await registerClient(context, { phone: '9999-1111' });
    const luis = await registerClient(context, { phone: '9999-2222' });
    const courts = await courtsOf(context);

    await book(context, ana.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 12,
      hours: 2,
    });
    const overlapping = await book(context, luis.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 13,
      hours: 1,
    });

    expect(overlapping.statusCode).toBe(409);
    expect((overlapping.json() as { error: string }).error).toBe('occupied');
  });

  it('rejects an unknown court', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const response = await book(context, client.cookie, {
      courtId: 'no-existe',
      date: DATE,
      startHour: 10,
      hours: 1,
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects an hour that already started', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courts = await courtsOf(context);

    const response = await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: '2025-03-10',
      startHour: 8,
      hours: 1,
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('past');
  });

  it('rejects a booking beyond the advance limit', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courts = await courtsOf(context);

    const response = await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: '2025-06-01',
      startHour: 10,
      hours: 1,
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('advance_limit');
  });

  it('rejects a booking from a blocked phone number', async () => {
    context = createTestContext();
    const client = await registerClient(context, { phone: '9999-3333' });
    const courts = await courtsOf(context);

    createBlock(context.db, {
      userId: null,
      phone: '(+504) 9999-3333',
      startsAt: context.clock.now,
      endsAt: null,
      reason: 'plantones repetidos',
      createdBy: null,
      now: context.clock.now,
    });

    const response = await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 16,
      hours: 1,
    });

    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: string }).error).toBe('blocked');
  });

  it('stops a client from hoarding more than the configured active reservations', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courts = await courtsOf(context);

    const first = await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 10,
      hours: 1,
    });
    const second = await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 11,
      hours: 1,
    });
    const third = await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 12,
      hours: 1,
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(third.statusCode).toBe(403);
    expect((third.json() as { error: string }).error).toBe('active_limit');
  });
});

describe('POST /api/reservations/:id/cancel', () => {
  it('cancels for free well before the deadline and frees the slot', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courts = await courtsOf(context);

    const created = await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 20,
      hours: 1,
    });
    const id = (created.json() as { reservation: { id: string } }).reservation.id;

    const response = await context.app.inject({
      method: 'POST',
      url: `/api/reservations/${id}/cancel`,
      headers: { cookie: client.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { marked: boolean }).marked).toBe(false);

    const availability = await context.app.inject({
      method: 'GET',
      url: `/api/availability?date=${DATE}`,
    });
    const body = availability.json() as {
      courts: Array<{ court: { id: string }; slots: Array<{ hour: number; status: string }> }>;
    };
    const court = body.courts.find((entry) => entry.court.id === courts[0]!.id)!;
    expect(court.slots[20]!.status).toBe('available');
  });

  it('marks the failure when the client cancels inside the three hour window', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courts = await courtsOf(context);

    const created = await book(context, client.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 12,
      hours: 1,
    });
    const id = (created.json() as { reservation: { id: string } }).reservation.id;

    // Two hours before the reserved hour: inside the window.
    context.clock.now = zonedToEpoch(DATE, 12, 'America/Tegucigalpa') - 2 * HOUR_MS;

    const response = await context.app.inject({
      method: 'POST',
      url: `/api/reservations/${id}/cancel`,
      headers: { cookie: client.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { marked: boolean }).marked).toBe(true);
    const stored = context.db
      .prepare('SELECT failure_marked_at, failure_reason, status FROM reservations WHERE id = ?')
      .get(id) as { failure_marked_at: number; failure_reason: string; status: string };
    expect(stored.status).toBe('cancelled');
    expect(stored.failure_marked_at).not.toBeNull();
    expect(stored.failure_reason).toBe('late_cancel');
  });

  it('does not let a client cancel someone else reservation', async () => {
    context = createTestContext();
    const ana = await registerClient(context, { phone: '9999-1111' });
    const luis = await registerClient(context, { phone: '9999-2222' });
    const courts = await courtsOf(context);

    const created = await book(context, ana.cookie, {
      courtId: courts[0]!.id,
      date: DATE,
      startHour: 20,
      hours: 1,
    });
    const id = (created.json() as { reservation: { id: string } }).reservation.id;

    const response = await context.app.inject({
      method: 'POST',
      url: `/api/reservations/${id}/cancel`,
      headers: { cookie: luis.cookie },
    });

    expect(response.statusCode).toBe(404);
  });
});
