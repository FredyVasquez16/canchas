import { afterEach, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth.ts';
import { createRateLimiter } from '../src/rate-limit.ts';
import { createTestContext, registerClient, type TestContext } from './helpers.ts';

let context: TestContext;

afterEach(async () => {
  await context?.app.close();
});

function cookieHeader(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'];
  return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).join(' | ');
}

describe('createRateLimiter (S42)', () => {
  it('allows exactly `limit` attempts inside the window and refuses the next one', () => {
    const clock = { now: 1_000 };
    const limiter = createRateLimiter({ now: () => clock.now });

    expect(limiter.check('k', 2, 60_000).allowed).toBe(true);
    expect(limiter.check('k', 2, 60_000).allowed).toBe(true);
    const refused = limiter.check('k', 2, 60_000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(60);
  });

  it('opens the window again once it expires', () => {
    const clock = { now: 1_000 };
    const limiter = createRateLimiter({ now: () => clock.now });

    limiter.check('k', 1, 5_000);
    expect(limiter.check('k', 1, 5_000).allowed).toBe(false);

    clock.now += 5_001;
    expect(limiter.check('k', 1, 5_000).allowed).toBe(true);
  });

  it('keeps the keys independent', () => {
    const clock = { now: 1_000 };
    const limiter = createRateLimiter({ now: () => clock.now });

    limiter.check('login:account:a@example.com', 1, 60_000);
    expect(limiter.check('login:account:a@example.com', 1, 60_000).allowed).toBe(false);
    expect(limiter.check('login:account:b@example.com', 1, 60_000).allowed).toBe(true);
  });

  it('drops expired keys instead of growing forever', () => {
    const clock = { now: 1_000 };
    const limiter = createRateLimiter({ now: () => clock.now });

    for (let index = 0; index < 50; index += 1) {
      limiter.check(`key-${index}`, 5, 1_000);
    }
    expect(limiter.size()).toBe(50);

    clock.now += 2_000;
    limiter.check('fresh', 5, 1_000);
    expect(limiter.size()).toBe(1);
  });
});

describe('password hashing runs off the event loop (S42)', () => {
  it('is asynchronous and keeps the stored scrypt format', async () => {
    const pending = hashPassword('secreto123');
    expect(pending).toBeInstanceOf(Promise);

    const stored = await pending;
    expect(stored).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verifyPassword('secreto123', stored)).toBe(true);
    expect(await verifyPassword('otra-cosa', stored)).toBe(false);
    expect(await verifyPassword('secreto123', 'google-only')).toBe(false);
    expect(await verifyPassword('secreto123', 'basura')).toBe(false);
  });

  it('answers concurrent logins without a 500', async () => {
    context = createTestContext();
    const client = await registerClient(context, {
      email: 'burst@example.com',
      password: 'secreto123',
    });

    const answers = await Promise.all(
      Array.from({ length: 8 }, () =>
        context.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: client.email, password: 'secreto123' },
        }),
      ),
    );

    expect(answers.map((answer) => answer.statusCode)).toEqual(Array(8).fill(200));
  });
});

describe('POST /api/auth/login limit (S42)', () => {
  it('refuses after ten attempts, even with the right password, and reopens later', async () => {
    context = createTestContext();
    const client = await registerClient(context, {
      email: 'limite@example.com',
      password: 'correcta123',
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const wrong = await context.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: client.email, password: 'incorrecta123' },
      });
      expect(wrong.statusCode).toBe(401);
    }

    const refused = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: client.email, password: 'correcta123' },
    });
    expect(refused.statusCode).toBe(429);
    expect((refused.json() as { error: string }).error).toBe('too_many_requests');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(refused.headers['set-cookie']).toBeUndefined();

    context.clock.now += 5 * 60_000 + 1_000;
    const later = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: client.email, password: 'correcta123' },
    });
    expect(later.statusCode).toBe(200);
  });
});

describe('POST /api/auth/forgot-password limit (S42)', () => {
  it('stops creating tokens and sending mails after five requests', async () => {
    context = createTestContext();
    await registerClient(context, { email: 'bomba@example.com' });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const accepted = await context.app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: 'bomba@example.com' },
      });
      expect(accepted.statusCode).toBe(202);
    }

    const refused = await context.app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'bomba@example.com' },
    });
    expect(refused.statusCode).toBe(429);
    expect((refused.json() as { error: string }).error).toBe('too_many_requests');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);

    expect(context.mails).toHaveLength(5);
    const rows = context.db.prepare('SELECT COUNT(*) AS total FROM password_resets').get() as {
      total: number;
    };
    expect(Number(rows.total)).toBe(1);
  });
});

describe('POST /api/reservations hours ceiling (S44)', () => {
  it('refuses 25 hours and creates nothing', async () => {
    context = createTestContext();
    const client = await registerClient(context, { email: 'rango@example.com' });
    const courts = (
      (await context.app.inject({ method: 'GET', url: '/api/courts' })).json() as {
        courts: Array<{ id: string }>;
      }
    ).courts;

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/reservations',
      headers: { cookie: client.cookie },
      payload: { courtId: courts[0]!.id, date: '2025-03-12', startHour: 10, hours: 25 },
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('invalid_input');
    const rows = context.db.prepare('SELECT COUNT(*) AS total FROM reservations').get() as {
      total: number;
    };
    expect(Number(rows.total)).toBe(0);
  });

  it('still accepts 24 hours', async () => {
    context = createTestContext();
    const client = await registerClient(context, { email: 'veinticuatro@example.com' });
    const courts = (
      (await context.app.inject({ method: 'GET', url: '/api/courts' })).json() as {
        courts: Array<{ id: string }>;
      }
    ).courts;

    const response = await context.app.inject({
      method: 'POST',
      url: '/api/reservations',
      headers: { cookie: client.cookie },
      payload: { courtId: courts[0]!.id, date: '2025-03-12', startHour: 0, hours: 24 },
    });

    expect(response.statusCode).toBe(201);
  });
});

describe('uncaught errors (S45)', () => {
  it('answers 500 without leaking the internal message', async () => {
    context = createTestContext();
    context.app.get('/boom', async () => {
      throw new Error('interno secreto con ruta C:/privado/canchas.sqlite');
    });

    const response = await context.app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal_error' });
    expect(response.body).not.toContain('interno secreto');
    expect(response.body).not.toContain('canchas.sqlite');
    expect(response.body).not.toContain('at ');
  });

  it('keeps the known 4xx bodies as they are', async () => {
    context = createTestContext();
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nadie@example.com', password: 'x' },
    });
    expect(response.statusCode).toBe(401);
    expect((response.json() as { error: string }).error).toBe('invalid_credentials');
  });
});

describe('session cookie Secure flag (S43)', () => {
  it('is absent when the deployment does not ask for it', async () => {
    context = createTestContext();
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'plano@example.com',
        password: 'secreto123',
        name: 'Plano',
        phone: '9999-8888',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(cookieHeader(response.headers as Record<string, unknown>)).not.toContain('Secure');
  });

  it('marks both the session and the clearing cookie when TLS is in use', async () => {
    context = createTestContext({ cookieSecure: true });
    const registered = await context.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'tls@example.com',
        password: 'secreto123',
        name: 'Tls',
        phone: '9999-8888',
      },
    });

    const registeredCookie = cookieHeader(registered.headers as Record<string, unknown>);
    expect(registeredCookie).toContain('HttpOnly');
    expect(registeredCookie).toContain('Secure');
    const session = registeredCookie.split(';')[0]!;

    const loggedOut = await context.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: session },
    });
    const clearedCookie = cookieHeader(loggedOut.headers as Record<string, unknown>);
    expect(clearedCookie).toContain('Secure');
    expect(clearedCookie).toContain('Max-Age=0');

    const after = await context.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: session },
    });
    expect(after.statusCode).toBe(401);
  });
});
