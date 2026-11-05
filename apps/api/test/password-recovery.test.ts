import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext, login, registerClient, type TestContext } from './helpers.ts';

let context: TestContext;

afterEach(async () => {
  await context?.app.close();
});

const HOUR_MS = 3_600_000;

function tokenFromMail(text: string): string {
  const match = /#\/nueva-clave\?token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) {
    throw new Error(`No reset link in mail: ${text}`);
  }
  return match[1];
}

async function forgot(context: TestContext, email: string) {
  return context.app.inject({
    method: 'POST',
    url: '/api/auth/forgot-password',
    payload: { email },
  });
}

async function reset(context: TestContext, payload: Record<string, unknown>) {
  return context.app.inject({
    method: 'POST',
    url: '/api/auth/reset-password',
    payload,
  });
}

async function me(context: TestContext, cookie: string) {
  return context.app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { cookie },
  });
}

describe('POST /api/auth/forgot-password', () => {
  it('answers 202, sends exactly one mail to the account and never returns the token', async () => {
    context = createTestContext();
    const client = await registerClient(context, { email: 'olvido@example.com', name: 'Ana' });

    const response = await forgot(context, '  Olvido@Example.com ');

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ ok: true });
    expect(context.mails).toHaveLength(1);

    const mail = context.mails[0]!;
    expect(mail.to).toBe('olvido@example.com');
    expect(mail.text).toContain('Ana');
    expect(mail.text).toContain('60 minutos');

    const token = tokenFromMail(mail.text);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.body).not.toContain(token);
    expect(client.cookie).toContain('session=');

    // The token is stored hashed: the raw value never reaches the database.
    const rows = context.db
      .prepare('SELECT token_hash FROM password_resets')
      .all() as Array<{ token_hash: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toBe(token);
  });

  it('answers exactly the same for an unknown email and sends nothing', async () => {
    context = createTestContext();

    const response = await forgot(context, 'nadie@example.com');

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ ok: true });
    expect(context.mails).toHaveLength(0);
    const rows = context.db.prepare('SELECT COUNT(*) AS total FROM password_resets').all() as Array<
      { total: number }
    >;
    expect(Number(rows[0]!.total)).toBe(0);
  });

  it('rejects a malformed email without sending anything', async () => {
    context = createTestContext();

    const response = await forgot(context, 'no-es-un-correo');

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('invalid_input');
    expect(context.mails).toHaveLength(0);
  });

  it('keeps only the newest link valid when the client asks twice', async () => {
    context = createTestContext();
    await registerClient(context, { email: 'dos@example.com' });

    await forgot(context, 'dos@example.com');
    const first = tokenFromMail(context.mails[0]!.text);
    await forgot(context, 'dos@example.com');
    const second = tokenFromMail(context.mails[1]!.text);

    expect(second).not.toBe(first);
    const stale = await reset(context, { token: first, password: 'nueva12345' });
    expect(stale.statusCode).toBe(400);
    expect((stale.json() as { error: string }).error).toBe('invalid_token');

    const fresh = await reset(context, { token: second, password: 'nueva12345' });
    expect(fresh.statusCode).toBe(200);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('rotates the password, opens a session and closes every older session', async () => {
    context = createTestContext();
    const client = await registerClient(context, {
      email: 'rota@example.com',
      password: 'original123',
    });
    await forgot(context, 'rota@example.com');
    const token = tokenFromMail(context.mails[0]!.text);

    const response = await reset(context, { token, password: 'nueva12345' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { user: Record<string, unknown> };
    expect(body.user.email).toBe('rota@example.com');
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(body)).not.toContain('scrypt');

    const cookies = response.headers['set-cookie'];
    const raw = Array.isArray(cookies) ? cookies.join(';') : String(cookies);
    expect(raw).toContain('session=');
    expect(raw).toContain('HttpOnly');
    const freshCookie = raw.slice(raw.indexOf('session='), raw.indexOf(';', raw.indexOf('session=')));

    expect((await me(context, freshCookie)).statusCode).toBe(200);
    expect((await me(context, client.cookie)).statusCode).toBe(401);

    expect((await login(context, 'rota@example.com', 'original123')).statusCode).toBe(401);
    expect((await login(context, 'rota@example.com', 'nueva12345')).statusCode).toBe(200);

    const stored = context.db
      .prepare('SELECT password_hash FROM users WHERE email = ?')
      .get('rota@example.com') as { password_hash: string };
    expect(stored.password_hash.startsWith('scrypt:')).toBe(true);
    expect(stored.password_hash).not.toContain('nueva12345');
  });

  it('refuses a token that was already used', async () => {
    context = createTestContext();
    await registerClient(context, { email: 'unico@example.com' });
    await forgot(context, 'unico@example.com');
    const token = tokenFromMail(context.mails[0]!.text);

    expect((await reset(context, { token, password: 'primera123' })).statusCode).toBe(200);

    const replay = await reset(context, { token, password: 'segunda123' });
    expect(replay.statusCode).toBe(400);
    expect((replay.json() as { error: string }).error).toBe('invalid_token');
    expect((await login(context, 'unico@example.com', 'primera123')).statusCode).toBe(200);
    expect((await login(context, 'unico@example.com', 'segunda123')).statusCode).toBe(401);
  });

  it('refuses a link after 60 minutes and leaves the old password working', async () => {
    context = createTestContext();
    await registerClient(context, { email: 'tarde@example.com', password: 'original123' });
    await forgot(context, 'tarde@example.com');
    const token = tokenFromMail(context.mails[0]!.text);

    context.clock.now += 59 * 60_000;
    const almost = await reset(context, { token, password: 'nueva12345' });
    expect(almost.statusCode).toBe(200);

    const second = await registerClient(context, { email: 'tarde2@example.com', password: 'original123' });
    await forgot(context, 'tarde2@example.com');
    const lateToken = tokenFromMail(context.mails[1]!.text);
    context.clock.now += 61 * 60_000;

    const late = await reset(context, { token: lateToken, password: 'otra12345' });
    expect(late.statusCode).toBe(400);
    expect((late.json() as { error: string }).error).toBe('invalid_token');
    expect(late.headers['set-cookie']).toBeUndefined();
    expect((await login(context, 'tarde2@example.com', 'original123')).statusCode).toBe(200);
    expect(second.cookie).toContain('session=');
  });

  it('refuses an invented token', async () => {
    context = createTestContext();

    const response = await reset(context, { token: 'inventado-'.repeat(5), password: 'nueva12345' });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('invalid_token');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('refuses a short or invented token as a dead link, not as a form mistake', async () => {
    context = createTestContext();

    for (const token of ['abc', 'A'.repeat(43), 'x'.repeat(80)]) {
      const response = await reset(context, { token, password: 'nueva12345' });
      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toBe('invalid_token');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('answers 202 even when the mail channel never resolves', async () => {
    context = createTestContext({ mailer: { send: () => new Promise<void>(() => {}) } });
    await registerClient(context, { email: 'lento@example.com' });

    const known = await forgot(context, 'lento@example.com');
    const unknown = await forgot(context, 'nadie@example.com');

    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.body).toBe(unknown.body);
  });

  it('refuses a short password and keeps the link usable', async () => {
    context = createTestContext();
    await registerClient(context, { email: 'corta@example.com', password: 'original123' });
    await forgot(context, 'corta@example.com');
    const token = tokenFromMail(context.mails[0]!.text);

    const short = await reset(context, { token, password: 'corta' });
    expect(short.statusCode).toBe(400);
    expect((short.json() as { error: string }).error).toBe('invalid_input');
    expect((await login(context, 'corta@example.com', 'original123')).statusCode).toBe(200);

    expect((await reset(context, { token, password: 'suficiente123' })).statusCode).toBe(200);
    expect((await login(context, 'corta@example.com', 'suficiente123')).statusCode).toBe(200);
  });

  it('keeps the reset window honest about the hour', async () => {
    context = createTestContext();
    await registerClient(context, { email: 'reloj@example.com' });
    await forgot(context, 'reloj@example.com');

    const row = context.db
      .prepare('SELECT created_at, expires_at FROM password_resets')
      .get() as { created_at: number; expires_at: number };
    expect(Number(row.expires_at) - Number(row.created_at)).toBe(HOUR_MS);
  });
});
