import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.ts';

let context: TestContext;

afterEach(async () => {
  await context?.app.close();
});

describe('GET /api/config', () => {
  it('assumes mail can leave the process when the deployment does not say otherwise', async () => {
    context = createTestContext();

    const response = await context.app.inject({ method: 'GET', url: '/api/config' });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { mailTransport: string }).mailTransport).toBe('smtp');
  });

  it('reports a console mail channel, so the web stops promising an email', async () => {
    context = createTestContext({ mailTransport: 'console' });

    const response = await context.app.inject({ method: 'GET', url: '/api/config' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { mailTransport: string; googleSignIn: boolean };
    expect(body.mailTransport).toBe('console');
    expect(body.googleSignIn).toBe(false);
  });

  it('keeps the fields the board already reads', async () => {
    context = createTestContext();

    const body = (await context.app.inject({ method: 'GET', url: '/api/config' })).json() as Record<
      string,
      unknown
    >;

    expect(body.venueTimeZone).toBe('America/Tegucigalpa');
    expect(body.currency).toBe('HNL');
    expect(body.cancelWindowHours).toBe(3);
    expect(typeof body.maxAdvanceDays).toBe('number');
    expect(typeof body.maxActiveReservations).toBe('number');
    expect(typeof body.googleSignIn).toBe('boolean');
  });
});
