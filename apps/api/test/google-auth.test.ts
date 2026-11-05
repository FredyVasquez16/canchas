import { afterEach, describe, expect, it } from 'vitest';
import type { GoogleConfig } from '../src/google.ts';
import { createTestContext, login, registerClient, type TestContext } from './helpers.ts';

let context: TestContext;

afterEach(async () => {
  await context?.app.close();
});

const GOOGLE: GoogleConfig = {
  clientId: 'cliente-de-prueba.apps.googleusercontent.com',
  clientSecret: 'secreto-de-prueba',
  redirectUri: 'http://localhost:3000/api/auth/google/callback',
};

const WEB = 'http://localhost:5173';

interface FakeProfile {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

function fakeGoogle(
  profile: FakeProfile,
  options: { tokenStatus?: number; profileStatus?: number } = {},
) {
  const calls: Array<{ url: string; body: string | null }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : null });
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(
        JSON.stringify({ access_token: 'access-123', token_type: 'Bearer' }),
        { status: options.tokenStatus ?? 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return new Response(
        JSON.stringify({
          sub: 'google-sub-1',
          email: 'gente@example.com',
          email_verified: true,
          name: 'Gente Google',
          ...profile,
        }),
        { status: options.profileStatus ?? 200, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function setCookieValues(headers: Record<string, unknown>): string[] {
  const raw = headers['set-cookie'];
  const values = Array.isArray(raw) ? raw : [raw];
  return values.filter((value): value is string => typeof value === 'string');
}

function sessionHeader(headers: Record<string, unknown>): string | null {
  for (const value of setCookieValues(headers)) {
    if (value.startsWith('session=')) {
      return value.split(';')[0]!;
    }
  }
  return null;
}

function stateCookie(headers: Record<string, unknown>): string | null {
  for (const value of setCookieValues(headers)) {
    if (value.startsWith('oauth_state=')) {
      return value.split(';')[0]!;
    }
  }
  return null;
}

async function start(context: TestContext) {
  return context.app.inject({ method: 'GET', url: '/api/auth/google/start' });
}

async function callback(context: TestContext, state: string, cookie?: string) {
  const query = `code=code-123&state=${encodeURIComponent(state)}`;
  return context.app.inject({
    method: 'GET',
    url: `/api/auth/google/callback?${query}`,
    headers: cookie ? { cookie } : {},
  });
}

function googleState(location: string): string {
  const url = new URL(location);
  const state = url.searchParams.get('state');
  if (!state) {
    throw new Error(`No state in authorize url: ${location}`);
  }
  return state;
}

describe('Google sign-in switched off', () => {
  it('does not offer the button and refuses the flow', async () => {
    context = createTestContext();

    const config = await context.app.inject({ method: 'GET', url: '/api/config' });
    expect((config.json() as { googleSignIn: boolean }).googleSignIn).toBe(false);

    const response = await start(context);
    expect(response.statusCode).toBe(503);
    expect((response.json() as { error: string }).error).toBe('google_not_configured');
    expect(response.headers['location']).toBeUndefined();
    expect(sessionHeader(response.headers as Record<string, unknown>)).toBeNull();
  });

  it('answers google_not_configured on a stray callback instead of crashing', async () => {
    context = createTestContext();

    const response = await callback(context, 'cualquier-cosa');
    expect(response.statusCode).toBe(503);
    expect((response.json() as { error: string }).error).toBe('google_not_configured');
  });
});

describe('GET /api/auth/google/start', () => {
  it('redirects to Google with the client, the redirect uri and a signed httpOnly state', async () => {
    context = createTestContext({ google: GOOGLE });
    const config = await context.app.inject({ method: 'GET', url: '/api/config' });
    expect((config.json() as { googleSignIn: boolean }).googleSignIn).toBe(true);

    const response = await start(context);

    expect(response.statusCode).toBe(302);
    const location = String(response.headers['location']);
    const url = new URL(location);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(GOOGLE.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(GOOGLE.redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_.-]{20,}$/);

    const cookie = stateCookie(response.headers as Record<string, unknown>);
    expect(cookie).not.toBeNull();
    expect(cookie).toBe(`oauth_state=${googleState(location)}`);
    const raw = setCookieValues(response.headers as Record<string, unknown>).join('|');
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('Max-Age=600');
  });
});

describe('GET /api/auth/google/callback', () => {
  it('refuses a state this browser never started', async () => {
    const fake = fakeGoogle({});
    context = createTestContext({ google: GOOGLE, fetchImpl: fake.fetchImpl });

    const started = await start(context);
    const good = stateCookie(started.headers as Record<string, unknown>)!;

    const noCookie = await callback(context, googleState(String(started.headers['location'])));
    expect(noCookie.statusCode).toBe(400);
    expect((noCookie.json() as { error: string }).error).toBe('invalid_state');
    expect(sessionHeader(noCookie.headers as Record<string, unknown>)).toBeNull();

    const wrong = await callback(context, 'state-falso-que-no-es-el-mio', good);
    expect(wrong.statusCode).toBe(400);
    expect((wrong.json() as { error: string }).error).toBe('invalid_state');
    expect(sessionHeader(wrong.headers as Record<string, unknown>)).toBeNull();

    expect(fake.calls).toHaveLength(0);
    const users = context.db.prepare('SELECT COUNT(*) AS total FROM users').all() as Array<{
      total: number;
    }>;
    expect(Number(users[0]!.total)).toBe(0);
  });

  it('creates the client, sends it to complete the phone and never allows a password', async () => {
    const fake = fakeGoogle({});
    context = createTestContext({ google: GOOGLE, fetchImpl: fake.fetchImpl });
    const started = await start(context);
    const state = googleState(String(started.headers['location']));
    const cookie = stateCookie(started.headers as Record<string, unknown>)!;

    const response = await callback(context, state, cookie);

    expect(response.statusCode).toBe(302);
    expect(String(response.headers['location'])).toBe(`${WEB}/#/completar-perfil`);
    const session = sessionHeader(response.headers as Record<string, unknown>);
    expect(session).not.toBeNull();

    const me = await context.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: session! },
    });
    expect(me.statusCode).toBe(200);
    const user = (me.json() as { user: Record<string, unknown> }).user;
    expect(user.email).toBe('gente@example.com');
    expect(user.name).toBe('Gente Google');
    expect(user.role).toBe('client');
    expect(user.phone).toBe('');

    const stored = context.db
      .prepare('SELECT google_id, password_hash FROM users WHERE email = ?')
      .get('gente@example.com') as { google_id: string; password_hash: string };
    expect(stored.google_id).toBe('google-sub-1');
    expect(stored.password_hash.startsWith('scrypt:')).toBe(false);

    // The exchange sent the code and the secret to the token endpoint, not to the browser.
    const exchange = fake.calls[0]!;
    expect(exchange.url).toBe('https://oauth2.googleapis.com/token');
    expect(exchange.body).toContain('code=code-123');
    expect(exchange.body).toContain('client_id=');
    expect(fake.calls[1]!.url).toBe('https://openidconnect.googleapis.com/v1/userinfo');

    expect((await login(context, 'gente@example.com', 'cualquier123')).statusCode).toBe(401);
  });

  it('links an existing account by verified email and keeps its password working', async () => {
    const fake = fakeGoogle({ email: 'ya-existe@example.com', name: 'Nombre de Google' });
    context = createTestContext({ google: GOOGLE, fetchImpl: fake.fetchImpl });
    await registerClient(context, {
      email: 'ya-existe@example.com',
      password: 'original123',
      name: 'Nombre Original',
      phone: '9999-7777',
    });

    const started = await start(context);
    const state = googleState(String(started.headers['location']));
    const cookie = stateCookie(started.headers as Record<string, unknown>)!;
    const response = await callback(context, state, cookie);

    expect(response.statusCode).toBe(302);
    expect(String(response.headers['location'])).toBe(`${WEB}/#/mis-reservas`);

    const users = context.db.prepare('SELECT id, name, google_id FROM users').all() as Array<{
      id: string;
      name: string;
      google_id: string | null;
    }>;
    expect(users).toHaveLength(1);
    expect(users[0]!.google_id).toBe('google-sub-1');
    expect(users[0]!.name).toBe('Nombre Original');
    expect((await login(context, 'ya-existe@example.com', 'original123')).statusCode).toBe(200);
  });

  it('signs in again by the Google id and remembers the completed phone', async () => {
    const fake = fakeGoogle({});
    context = createTestContext({ google: GOOGLE, fetchImpl: fake.fetchImpl });

    async function signIn(): Promise<{ location: string; session: string }> {
      const started = await start(context);
      const state = googleState(String(started.headers['location']));
      const cookie = stateCookie(started.headers as Record<string, unknown>)!;
      const response = await callback(context, state, cookie);
      const session = sessionHeader(response.headers as Record<string, unknown>);
      expect(session).not.toBeNull();
      return { location: String(response.headers['location']), session: session! };
    }

    const first = await signIn();
    expect(first.location).toBe(`${WEB}/#/completar-perfil`);

    const patched = await context.app.inject({
      method: 'PATCH',
      url: '/api/account',
      headers: { cookie: first.session },
      payload: { name: 'Gente Google', phone: '9999-5555' },
    });
    expect(patched.statusCode).toBe(200);

    const second = await signIn();
    expect(second.location).toBe(`${WEB}/#/mis-reservas`);

    const users = context.db.prepare('SELECT id, phone FROM users').all() as Array<{
      id: string;
      phone: string;
    }>;
    expect(users).toHaveLength(1);
    expect(users[0]!.phone).toBe('9999-5555');
  });

  it('refuses an unverified Google email and creates nothing', async () => {
    const fake = fakeGoogle({ email_verified: false });
    context = createTestContext({ google: GOOGLE, fetchImpl: fake.fetchImpl });
    const started = await start(context);
    const state = googleState(String(started.headers['location']));
    const cookie = stateCookie(started.headers as Record<string, unknown>)!;

    const response = await callback(context, state, cookie);

    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: string }).error).toBe('google_email_unverified');
    expect(sessionHeader(response.headers as Record<string, unknown>)).toBeNull();
    const users = context.db.prepare('SELECT COUNT(*) AS total FROM users').all() as Array<{
      total: number;
    }>;
    expect(Number(users[0]!.total)).toBe(0);
  });

  it('reports a failed code exchange without creating a user', async () => {
    const fake = fakeGoogle({}, { tokenStatus: 400 });
    context = createTestContext({ google: GOOGLE, fetchImpl: fake.fetchImpl });
    const started = await start(context);
    const state = googleState(String(started.headers['location']));
    const cookie = stateCookie(started.headers as Record<string, unknown>)!;

    const response = await callback(context, state, cookie);

    expect(response.statusCode).toBe(502);
    expect((response.json() as { error: string }).error).toBe('google_exchange_failed');
    expect(sessionHeader(response.headers as Record<string, unknown>)).toBeNull();
    const users = context.db.prepare('SELECT COUNT(*) AS total FROM users').all() as Array<{
      total: number;
    }>;
    expect(Number(users[0]!.total)).toBe(0);
  });

  it('refuses to book until the Google account has a phone (S38)', async () => {
    const fake = fakeGoogle({ email: 'sin-telefono@example.com' });
    context = createTestContext({ google: GOOGLE, fetchImpl: fake.fetchImpl });
    const started = await start(context);
    const state = googleState(String(started.headers['location']));
    const cookie = stateCookie(started.headers as Record<string, unknown>)!;
    const signedIn = await callback(context, state, cookie);
    const session = sessionHeader(signedIn.headers as Record<string, unknown>)!;

    const courts = (
      (await context.app.inject({ method: 'GET', url: '/api/courts' })).json() as {
        courts: Array<{ id: string }>;
      }
    ).courts;
    const booking = { courtId: courts[0]!.id, date: '2025-03-12', startHour: 10, hours: 1 };

    const refused = await context.app.inject({
      method: 'POST',
      url: '/api/reservations',
      headers: { cookie: session },
      payload: booking,
    });
    expect(refused.statusCode).toBe(403);
    expect((refused.json() as { error: string }).error).toBe('phone_required');
    const before = context.db
      .prepare('SELECT COUNT(*) AS total FROM reservations')
      .get() as { total: number };
    expect(Number(before.total)).toBe(0);

    const patched = await context.app.inject({
      method: 'PATCH',
      url: '/api/account',
      headers: { cookie: session },
      payload: { name: 'Gente Google', phone: '9999-4444' },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { user: { phone: string } }).user.phone).toBe('9999-4444');

    const booked = await context.app.inject({
      method: 'POST',
      url: '/api/reservations',
      headers: { cookie: session },
      payload: booking,
    });
    expect(booked.statusCode).toBe(201);
    const after = context.db
      .prepare('SELECT COUNT(*) AS total FROM reservations')
      .get() as { total: number };
    expect(Number(after.total)).toBe(1);
  });

  it('lets a Google client set a password through recovery and then sign in with it (S40)', async () => {
    const fake = fakeGoogle({ email: 'solo-google@example.com' });
    context = createTestContext({ google: GOOGLE, fetchImpl: fake.fetchImpl });
    const started = await start(context);
    const state = googleState(String(started.headers['location']));
    const cookie = stateCookie(started.headers as Record<string, unknown>)!;
    await callback(context, state, cookie);

    await context.app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'solo-google@example.com' },
    });
    const token = /#\/nueva-clave\?token=([A-Za-z0-9_-]+)/.exec(context.mails[0]!.text)![1]!;

    const reset = await context.app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, password: 'nueva12345' },
    });
    expect(reset.statusCode).toBe(200);
    expect((await login(context, 'solo-google@example.com', 'nueva12345')).statusCode).toBe(200);

    const stored = context.db
      .prepare('SELECT google_id FROM users WHERE email = ?')
      .get('solo-google@example.com') as { google_id: string };
    expect(stored.google_id).toBe('google-sub-1');
  });
});
