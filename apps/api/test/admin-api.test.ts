import { afterEach, describe, expect, it } from 'vitest';
import { zonedToEpoch } from '@canchas/core';
import { hashPassword } from '../src/auth.ts';
import { createUser } from '../src/db/users.ts';
import { createTestContext, registerClient, type TestContext } from './helpers.ts';

let context: TestContext;

afterEach(async () => {
  await context?.app.close();
});

const DATE = '2025-03-12';

async function signInAs(context: TestContext, role: 'admin' | 'staff', email: string) {
  createUser(context.db, {
    email,
    passwordHash: hashPassword('panel1234'),
    name: role === 'admin' ? 'Dueno' : 'Encargado',
    phone: role === 'admin' ? '9999-0000' : '9999-0001',
    role,
    now: context.clock.now,
  });
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'panel1234' },
  });
  const raw = response.headers['set-cookie'];
  const cookieHeader = Array.isArray(raw) ? raw[0]! : String(raw);
  return cookieHeader.split(';')[0]!;
}

function get(context: TestContext, url: string, cookie: string) {
  return context.app.inject({ method: 'GET', url, headers: { cookie } });
}

function post(
  context: TestContext,
  url: string,
  cookie: string,
  payload: Record<string, unknown> = {},
) {
  return context.app.inject({ method: 'POST', url, headers: { cookie }, payload });
}

async function bookFor(
  context: TestContext,
  cookie: string,
  payload: { courtId: string; date: string; startHour: number; hours: number },
) {
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/reservations',
    headers: { cookie },
    payload,
  });
  if (response.statusCode !== 201) {
    throw new Error(`booking failed: ${response.statusCode} ${response.body}`);
  }
  return (response.json() as { reservation: { id: string } }).reservation.id;
}

async function firstCourt(context: TestContext) {
  const response = await context.app.inject({ method: 'GET', url: '/api/courts' });
  return (response.json() as { courts: Array<{ id: string }> }).courts[0]!.id;
}

describe('panel access', () => {
  it('requires a session', async () => {
    context = createTestContext();
    const response = await context.app.inject({
      method: 'GET',
      url: `/api/admin/agenda?date=${DATE}`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('does not let a client into the panel', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const response = await get(context, `/api/admin/agenda?date=${DATE}`, client.cookie);
    expect(response.statusCode).toBe(403);
  });
});

describe('daily agenda and attendance', () => {
  it('shows the reservations of the day with the client contact details', async () => {
    context = createTestContext();
    const cookie = await signInAs(context, 'staff', 'staff@example.com');
    const client = await registerClient(context, { name: 'Ana Lopez', phone: '9999-4444' });
    const courtId = await firstCourt(context);
    await bookFor(context, client.cookie, { courtId, date: DATE, startHour: 19, hours: 2 });

    const response = await get(context, `/api/admin/agenda?date=${DATE}`, cookie);
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      reservations: Array<{
        startAt: number;
        client: { name: string; phone: string };
        courtName: string;
      }>;
    };
    expect(body.reservations).toHaveLength(1);
    expect(body.reservations[0]!.client.name).toBe('Ana Lopez');
    expect(body.reservations[0]!.client.phone).toBe('9999-4444');
    expect(body.reservations[0]!.startAt).toBe(zonedToEpoch(DATE, 19, 'America/Tegucigalpa'));
  });

  it('records the arrival when the cash is collected', async () => {
    context = createTestContext();
    const cookie = await signInAs(context, 'staff', 'staff@example.com');
    const client = await registerClient(context);
    const courtId = await firstCourt(context);
    const id = await bookFor(context, client.cookie, {
      courtId,
      date: DATE,
      startHour: 19,
      hours: 1,
    });

    context.clock.now = zonedToEpoch(DATE, 19, 'America/Tegucigalpa') + 5 * 60_000;
    const response = await post(context, `/api/admin/reservations/${id}/arrive`, cookie);

    expect(response.statusCode).toBe(200);
    const stored = context.db
      .prepare('SELECT arrived_at FROM reservations WHERE id = ?')
      .get(id) as { arrived_at: number | null };
    expect(stored.arrived_at).toBe(context.clock.now);
  });

  it('marks and clears a failure by hand', async () => {
    context = createTestContext();
    const cookie = await signInAs(context, 'admin', 'admin@example.com');
    const client = await registerClient(context);
    const courtId = await firstCourt(context);
    const id = await bookFor(context, client.cookie, {
      courtId,
      date: DATE,
      startHour: 9,
      hours: 1,
    });

    const marked = await post(context, `/api/admin/reservations/${id}/failure`, cookie, {
      reason: 'no_show',
    });
    expect(marked.statusCode).toBe(200);

    const cleared = await context.app.inject({
      method: 'DELETE',
      url: `/api/admin/reservations/${id}/failure`,
      headers: { cookie },
    });
    expect(cleared.statusCode).toBe(200);
    expect((await get(context, '/api/admin/clients', cookie)).json<{ clients: Array<{ failures: number }> }>()
      .clients.every((entry) => entry.failures === 0)).toBe(true);
  });
});

describe('clients, failures and penalties', () => {
  it('counts the failures of the month per client', async () => {
    context = createTestContext();
    const cookie = await signInAs(context, 'admin', 'admin@example.com');
    const client = await registerClient(context, { name: 'Luis' });
    const courtId = await firstCourt(context);
    const first = await bookFor(context, client.cookie, {
      courtId,
      date: DATE,
      startHour: 9,
      hours: 1,
    });
    const second = await bookFor(context, client.cookie, {
      courtId,
      date: DATE,
      startHour: 10,
      hours: 1,
    });

    await post(context, `/api/admin/reservations/${first}/failure`, cookie, {});
    await post(context, `/api/admin/reservations/${second}/failure`, cookie, {});

    const response = await get(context, '/api/admin/clients?month=2025-03', cookie);
    const body = response.json() as {
      clients: Array<{ name: string; failures: number; block: unknown }>;
    };
    const luis = body.clients.find((entry) => entry.name === 'Luis')!;
    expect(luis.failures).toBe(2);
    expect(luis.block).toBeNull();
  });

  it('applies a penalty of N days that blocks booking, and revokes it', async () => {
    context = createTestContext();
    const cookie = await signInAs(context, 'admin', 'admin@example.com');
    const client = await registerClient(context, { name: 'Pedro', phone: '9999-5555' });
    const courtId = await firstCourt(context);

    const penalty = await post(context, `/api/admin/clients/${client.userId}/penalty`, cookie, {
      days: 7,
      reason: 'tres plantones',
    });
    expect(penalty.statusCode).toBe(201);
    const block = (penalty.json() as { block: { id: string; endsAt: number } }).block;
    expect(block.endsAt).toBe(context.clock.now + 7 * 24 * 3_600_000);

    const blocked = await context.app.inject({
      method: 'POST',
      url: '/api/reservations',
      headers: { cookie: client.cookie },
      payload: { courtId, date: DATE, startHour: 15, hours: 1 },
    });
    expect(blocked.statusCode).toBe(403);
    expect((blocked.json() as { error: string }).error).toBe('blocked');

    const revoked = await context.app.inject({
      method: 'DELETE',
      url: `/api/admin/blocks/${block.id}`,
      headers: { cookie },
    });
    expect(revoked.statusCode).toBe(200);

    const allowed = await context.app.inject({
      method: 'POST',
      url: '/api/reservations',
      headers: { cookie: client.cookie },
      payload: { courtId, date: DATE, startHour: 15, hours: 1 },
    });
    expect(allowed.statusCode).toBe(201);
  });

  it('keeps the penalty decision away from staff', async () => {
    context = createTestContext();
    const cookie = await signInAs(context, 'staff', 'staff@example.com');
    const client = await registerClient(context);

    const response = await post(context, `/api/admin/clients/${client.userId}/penalty`, cookie, {
      days: 3,
    });
    expect(response.statusCode).toBe(403);
  });

  it('blocks a phone permanently even through a new account', async () => {
    context = createTestContext();
    const cookie = await signInAs(context, 'admin', 'admin@example.com');
    const client = await registerClient(context, { phone: '9999-6666' });
    const courtId = await firstCourt(context);

    const blocked = await post(context, `/api/admin/clients/${client.userId}/block`, cookie, {
      reason: 'agresion al personal',
    });
    expect(blocked.statusCode).toBe(201);

    const second = await registerClient(context, { phone: '9999-6666', email: 'otra@example.com' });
    const attempt = await context.app.inject({
      method: 'POST',
      url: '/api/reservations',
      headers: { cookie: second.cookie },
      payload: { courtId, date: DATE, startHour: 16, hours: 1 },
    });
    expect(attempt.statusCode).toBe(403);
  });
});

describe('courts and closures', () => {
  it('lists every court, including the deactivated ones, for the admin', async () => {
    context = createTestContext();
    const admin = await signInAs(context, 'admin', 'admin@example.com');
    const staff = await signInAs(context, 'staff', 'staff@example.com');
    const courtId = await firstCourt(context);

    await context.app.inject({
      method: 'PATCH',
      url: `/api/admin/courts/${courtId}`,
      headers: { cookie: admin },
      payload: { active: false },
    });

    const adminView = await get(context, '/api/admin/courts', admin);
    expect(adminView.statusCode).toBe(200);
    expect((adminView.json() as { courts: unknown[] }).courts).toHaveLength(3);

    const staffView = await get(context, '/api/admin/courts', staff);
    expect(staffView.statusCode).toBe(403);
  });

  it('lets the admin change a price and staff cannot', async () => {
    context = createTestContext();
    const admin = await signInAs(context, 'admin', 'admin@example.com');
    const staff = await signInAs(context, 'staff', 'staff@example.com');
    const courtId = await firstCourt(context);

    const refused = await context.app.inject({
      method: 'PATCH',
      url: `/api/admin/courts/${courtId}`,
      headers: { cookie: staff },
      payload: { pricePerHourCents: 90_000 },
    });
    expect(refused.statusCode).toBe(403);

    const updated = await context.app.inject({
      method: 'PATCH',
      url: `/api/admin/courts/${courtId}`,
      headers: { cookie: admin },
      payload: { pricePerHourCents: 90_000 },
    });
    expect(updated.statusCode).toBe(200);

    const courts = (await context.app.inject({ method: 'GET', url: '/api/courts' })).json() as {
      courts: Array<{ id: string; pricePerHourCents: number }>;
    };
    expect(courts.courts.find((court) => court.id === courtId)!.pricePerHourCents).toBe(90_000);
  });

  it('closes a range and the range stops being bookable', async () => {
    context = createTestContext();
    const staff = await signInAs(context, 'staff', 'staff@example.com');
    const client = await registerClient(context, { phone: '9999-7777' });
    const courtId = await firstCourt(context);

    const closed = await post(context, '/api/admin/closures', staff, {
      date: DATE,
      startHour: 8,
      hours: 4,
      note: 'mantenimiento',
    });
    expect(closed.statusCode).toBe(201);

    const attempt = await context.app.inject({
      method: 'POST',
      url: '/api/reservations',
      headers: { cookie: client.cookie },
      payload: { courtId, date: DATE, startHour: 9, hours: 1 },
    });
    expect(attempt.statusCode).toBe(400);
    expect((attempt.json() as { error: string }).error).toBe('closed');
  });

  it('removes a closure', async () => {
    context = createTestContext();
    const staff = await signInAs(context, 'staff', 'staff@example.com');
    const created = await post(context, '/api/admin/closures', staff, {
      date: DATE,
      startHour: 8,
      hours: 2,
    });
    const id = (created.json() as { closure: { id: string } }).closure.id;

    const removed = await context.app.inject({
      method: 'DELETE',
      url: `/api/admin/closures/${id}`,
      headers: { cookie: staff },
    });
    expect(removed.statusCode).toBe(200);
  });
});

describe('whatsapp reminder', () => {
  it('builds a wa.me link with the reservation details', async () => {
    context = createTestContext();
    const staff = await signInAs(context, 'staff', 'staff@example.com');
    const client = await registerClient(context, { name: 'Ana', phone: '9999-8888' });
    const courtId = await firstCourt(context);
    const id = await bookFor(context, client.cookie, {
      courtId,
      date: DATE,
      startHour: 20,
      hours: 2,
    });

    const response = await get(context, `/api/admin/reservations/${id}/whatsapp`, staff);
    expect(response.statusCode).toBe(200);
    const body = response.json() as { url: string };
    expect(body.url.startsWith('https://wa.me/50499998888?text=')).toBe(true);
    const text = decodeURIComponent(body.url);
    expect(text).toContain('8:00 PM - 10:00 PM');
    expect(text).not.toContain('20:00');
    expect(text).toContain('L 1,000.00');
  });
});

describe('statistics', () => {
  async function courtIds(context: TestContext) {
    const response = await context.app.inject({ method: 'GET', url: '/api/courts' });
    return (response.json() as { courts: Array<{ id: string }> }).courts.map((court) => court.id);
  }

  async function bookAt(
    context: TestContext,
    clientCookie: string,
    courtId: string,
    startHour: number,
    hours: number,
  ) {
    return bookFor(context, clientCookie, { courtId, date: DATE, startHour, hours });
  }

  it('keeps statistics to the owner', async () => {
    context = createTestContext();
    const staff = await signInAs(context, 'staff', 'staff@example.com');

    const anonymous = await context.app.inject({ method: 'GET', url: '/api/admin/stats' });
    expect(anonymous.statusCode).toBe(401);

    const refused = await get(context, '/api/admin/stats', staff);
    expect(refused.statusCode).toBe(403);
  });

  it('reports an empty period without inventing numbers', async () => {
    context = createTestContext();
    const admin = await signInAs(context, 'admin', 'admin@example.com');

    const response = await get(context, '/api/admin/stats?from=2025-03-01&to=2025-03-31', admin);
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      totals: { reservations: number; expectedCents: number; collectedCents: number; occupancyRate: number };
      daily: unknown[];
      byHour: unknown[];
      topClients: unknown[];
    };
    expect(body.totals.reservations).toBe(0);
    expect(body.totals.expectedCents).toBe(0);
    expect(body.totals.collectedCents).toBe(0);
    expect(body.totals.occupancyRate).toBe(0);
    expect(body.topClients).toEqual([]);
    expect(Array.isArray(body.daily)).toBe(true);
    expect(Array.isArray(body.byHour)).toBe(true);
  });

  it('counts reservations, hours, money and clients of the period', async () => {
    context = createTestContext();
    const admin = await signInAs(context, 'admin', 'admin@example.com');
    const client = await registerClient(context, { name: 'Ana', phone: '9999-1111' });
    const courts = await courtIds(context);

    const first = await bookAt(context, client.cookie, courts[0]!, 20, 2);
    await bookAt(context, client.cookie, courts[1]!, 8, 1);

    // The client pays cash on arrival for the first reservation.
    context.clock.now = zonedToEpoch(DATE, 20, 'America/Tegucigalpa') + 5 * 60_000;
    await post(context, `/api/admin/reservations/${first}/arrive`, admin);

    const response = await get(context, '/api/admin/stats?from=2025-03-01&to=2025-03-31', admin);
    const body = response.json() as {
      totals: {
        reservations: number;
        bookedHours: number;
        expectedCents: number;
        collectedCents: number;
        clients: number;
        newClients: number;
        capacityHours: number;
        occupancyRate: number;
      };
      byHour: Array<{ hour: number; reservations: number }>;
      topClients: Array<{ name: string; reservations: number }>;
    };

    expect(body.totals.reservations).toBe(2);
    expect(body.totals.bookedHours).toBe(3);
    expect(body.totals.expectedCents).toBe(150_000);
    expect(body.totals.collectedCents).toBe(100_000);
    expect(body.totals.clients).toBe(1);
    expect(body.totals.newClients).toBe(1);
    // 3 courts x 24 hours x 31 days
    expect(body.totals.capacityHours).toBe(3 * 24 * 31);
    expect(body.totals.occupancyRate).toBeCloseTo(3 / (3 * 24 * 31), 5);
    expect(body.byHour.find((entry) => entry.hour === 20)?.reservations).toBe(1);
    expect(body.topClients[0]?.name).toBe('Ana');
    expect(body.topClients[0]?.reservations).toBe(2);
  });

  it('separates cancellations and failures from real bookings', async () => {
    context = createTestContext();
    const admin = await signInAs(context, 'admin', 'admin@example.com');
    const client = await registerClient(context, { phone: '9999-2222' });
    const courts = await courtIds(context);

    const cancelled = await bookAt(context, client.cookie, courts[0]!, 10, 1);
    context.clock.now = zonedToEpoch(DATE, 10, 'America/Tegucigalpa') - 60 * 60_000;
    await context.app.inject({
      method: 'POST',
      url: `/api/reservations/${cancelled}/cancel`,
      headers: { cookie: client.cookie },
    });

    const response = await get(context, '/api/admin/stats?from=2025-03-01&to=2025-03-31', admin);
    const body = response.json() as {
      totals: { reservations: number; cancelled: number; lateCancels: number; expectedCents: number };
    };
    expect(body.totals.reservations).toBe(1);
    expect(body.totals.cancelled).toBe(1);
    expect(body.totals.lateCancels).toBe(1);
    expect(body.totals.expectedCents).toBe(0);
  });

  it('subtracts closures from the available capacity', async () => {
    context = createTestContext();
    const admin = await signInAs(context, 'admin', 'admin@example.com');

    await post(context, '/api/admin/closures', admin, {
      date: DATE,
      startHour: 8,
      hours: 4,
      courtId: null,
      note: 'mantenimiento',
    });

    const response = await get(context, '/api/admin/stats?from=2025-03-12&to=2025-03-12', admin);
    const body = response.json() as { totals: { capacityHours: number } };
    expect(body.totals.capacityHours).toBe(3 * 24 - 3 * 4);
  });
});

describe('statistics by court', () => {
  it('ranks every court by reservations, including the ones without any', async () => {
    context = createTestContext();
    const admin = await signInAs(context, 'admin', 'admin@example.com');
    const client = await registerClient(context, { phone: '9999-7777', name: 'Ana' });
    const courtsResponse = await context.app.inject({ method: 'GET', url: '/api/courts' });
    const courtIds = (courtsResponse.json() as { courts: Array<{ id: string }> }).courts.map(
      (court) => court.id,
    );

    await bookFor(context, client.cookie, {
      courtId: courtIds[1]!,
      date: DATE,
      startHour: 18,
      hours: 2,
    });
    await bookFor(context, client.cookie, {
      courtId: courtIds[1]!,
      date: DATE,
      startHour: 20,
      hours: 1,
    });

    const response = await get(
      context,
      '/api/admin/stats?from=2025-03-12&to=2025-03-12',
      admin,
    );
    const body = response.json() as {
      byCourt: Array<{
        courtId: string;
        courtName: string;
        reservations: number;
        bookedHours: number;
        share: number;
      }>;
    };

    expect(body.byCourt).toHaveLength(3);
    expect(body.byCourt[0]?.courtId).toBe(courtIds[1]);
    expect(body.byCourt[0]?.courtName).toBe('Cancha 2');
    expect(body.byCourt[0]?.reservations).toBe(2);
    expect(body.byCourt[0]?.bookedHours).toBe(3);
    expect(body.byCourt[0]?.share).toBe(1);
    expect(body.byCourt[1]?.reservations).toBe(0);
    expect(body.byCourt[1]?.share).toBe(0);
  });
});

describe('deleting a court', () => {
  it('removes a court that was created by accident', async () => {
    context = createTestContext();
    const admin = await signInAs(context, 'admin', 'admin@example.com');

    const created = await post(context, '/api/admin/courts', admin, {
      name: 'Cancha de prueba',
      pricePerHourCents: 40_000,
    });
    expect(created.statusCode).toBe(201);
    const courtId = (created.json() as { court: { id: string } }).court.id;

    const removed = await context.app.inject({
      method: 'DELETE',
      url: `/api/admin/courts/${courtId}`,
      headers: { cookie: admin },
    });
    expect(removed.statusCode).toBe(200);

    const remaining = await get(context, '/api/admin/courts', admin);
    const ids = (remaining.json() as { courts: Array<{ id: string }> }).courts.map(
      (court) => court.id,
    );
    expect(ids).not.toContain(courtId);
  });

  it('refuses to delete a court that already has reservations', async () => {
    context = createTestContext();
    const admin = await signInAs(context, 'admin', 'admin@example.com');
    const client = await registerClient(context, { phone: '9999-8888' });
    const courtId = await firstCourt(context);
    await bookFor(context, client.cookie, { courtId, date: DATE, startHour: 19, hours: 1 });

    const response = await context.app.inject({
      method: 'DELETE',
      url: `/api/admin/courts/${courtId}`,
      headers: { cookie: admin },
    });

    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('court_in_use');
    expect(await firstCourt(context)).toBe(courtId);
  });

  it('is not available to staff', async () => {
    context = createTestContext();
    const staff = await signInAs(context, 'staff', 'staff@example.com');
    const courtId = await firstCourt(context);

    const response = await context.app.inject({
      method: 'DELETE',
      url: `/api/admin/courts/${courtId}`,
      headers: { cookie: staff },
    });
    expect(response.statusCode).toBe(403);
  });
});
