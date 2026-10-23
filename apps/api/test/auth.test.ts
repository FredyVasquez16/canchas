import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext, login, registerClient, type TestContext } from './helpers.ts';

let context: TestContext;

afterEach(async () => {
  await context?.app.close();
});

describe('POST /api/auth/register', () => {
  it('creates a client, starts a session and never returns the password hash', async () => {
    context = createTestContext();
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'Ana@Example.com',
        password: 'secreto123',
        name: 'Ana Lopez',
        phone: '9999-8888',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { user: Record<string, unknown> };
    expect(body.user.email).toBe('ana@example.com');
    expect(body.user.role).toBe('client');
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(body)).not.toContain('scrypt');
    expect(String(response.headers['set-cookie'])).toContain('HttpOnly');
  });

  it('rejects a duplicate email', async () => {
    context = createTestContext();
    await registerClient(context, { email: 'dup@example.com' });
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'dup@example.com',
        password: 'secreto123',
        name: 'Otro',
        phone: '8888-7777',
      },
    });

    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toBe('email_taken');
  });

  it('rejects an invalid phone number', async () => {
    context = createTestContext();
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'sin-telefono@example.com',
        password: 'secreto123',
        name: 'Sin Telefono',
        phone: '123',
      },
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('invalid_input');
  });

  it('rejects a short password', async () => {
    context = createTestContext();
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'corta@example.com',
        password: '123',
        name: 'Clave Corta',
        phone: '9999-8888',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    context = createTestContext();
    await registerClient(context, { email: 'login@example.com', password: 'correcta123' });

    const bad = await login(context, 'login@example.com', 'incorrecta123');
    expect(bad.statusCode).toBe(401);

    const good = await login(context, 'login@example.com', 'correcta123');
    expect(good.statusCode).toBe(200);
    expect(good.cookie).toContain('session=');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the signed in user and 401 without a session', async () => {
    context = createTestContext();
    const anonymous = await context.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(anonymous.statusCode).toBe(401);

    const client = await registerClient(context, { email: 'me@example.com' });
    const response = await context.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: client.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { user: { email: string } }).user.email).toBe('me@example.com');
  });

  it('stops accepting the session after logout', async () => {
    context = createTestContext();
    const client = await registerClient(context, { email: 'bye@example.com' });

    await context.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: client.cookie },
    });

    const after = await context.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: client.cookie },
    });
    expect(after.statusCode).toBe(401);
  });
});
