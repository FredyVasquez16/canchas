import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext, login, registerClient, type TestContext } from './helpers.ts';

let context: TestContext;

afterEach(async () => {
  await context?.app.close();
});

function patch(context: TestContext, cookie: string, payload: Record<string, unknown>) {
  return context.app.inject({
    method: 'PATCH',
    url: '/api/account',
    headers: { cookie },
    payload,
  });
}

describe('PATCH /api/account', () => {
  it('requires a session', async () => {
    context = createTestContext();
    const response = await context.app.inject({
      method: 'PATCH',
      url: '/api/account',
      payload: { name: 'Nuevo Nombre' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('updates the name and the phone, and never returns the password hash', async () => {
    context = createTestContext();
    const client = await registerClient(context, { name: 'Ana', phone: '9999-1111' });

    const response = await patch(context, client.cookie, {
      name: 'Ana Maria Lopez',
      phone: '9999-2222',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { user: Record<string, unknown> };
    expect(body.user.name).toBe('Ana Maria Lopez');
    expect(body.user.phone).toBe('9999-2222');
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(body)).not.toContain('scrypt');

    const me = await context.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: client.cookie },
    });
    expect((me.json() as { user: { name: string; phone: string } }).user.name).toBe(
      'Ana Maria Lopez',
    );
    expect((me.json() as { user: { phone: string } }).user.phone).toBe('9999-2222');
  });

  it('refuses a malformed phone', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const response = await patch(context, client.cookie, { phone: '123' });
    expect(response.statusCode).toBe(400);
  });

  it('refuses to change the email', async () => {
    context = createTestContext();
    const client = await registerClient(context, { email: 'fijo@example.com' });
    const response = await patch(context, client.cookie, {
      email: 'otro@example.com',
      name: 'Ana',
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toBe('email_immutable');
  });

  it('requires the current password before accepting a new one', async () => {
    context = createTestContext();
    const client = await registerClient(context, {
      email: 'clave@example.com',
      password: 'original123',
    });

    const missing = await patch(context, client.cookie, { password: 'nueva12345' });
    expect(missing.statusCode).toBe(400);

    const wrong = await patch(context, client.cookie, {
      password: 'nueva12345',
      currentPassword: 'incorrecta',
    });
    expect(wrong.statusCode).toBe(403);

    const stillWorks = await login(context, 'clave@example.com', 'original123');
    expect(stillWorks.statusCode).toBe(200);
  });

  it('changes the password, keeps the current session and closes the others', async () => {
    context = createTestContext();
    const first = await registerClient(context, {
      email: 'dos@example.com',
      password: 'original123',
    });
    const second = await login(context, 'dos@example.com', 'original123');
    expect(second.cookie).toBeDefined();

    const response = await patch(context, first.cookie, {
      password: 'nueva12345',
      currentPassword: 'original123',
    });
    expect(response.statusCode).toBe(200);

    const withFirst = await context.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: first.cookie },
    });
    expect(withFirst.statusCode).toBe(200);

    const withSecond = await context.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: second.cookie! },
    });
    expect(withSecond.statusCode).toBe(401);

    expect((await login(context, 'dos@example.com', 'original123')).statusCode).toBe(401);
    expect((await login(context, 'dos@example.com', 'nueva12345')).statusCode).toBe(200);
  });
});
