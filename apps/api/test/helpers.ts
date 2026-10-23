import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db/index.ts';
import { seedCourts } from '../src/seed.ts';
import { zonedToEpoch } from '@canchas/core';

export const TZ = 'America/Tegucigalpa';
export const NOW = zonedToEpoch('2025-03-10', 8, TZ);

export interface TestContext {
  app: FastifyInstance;
  db: ReturnType<typeof openDatabase>;
  clock: { now: number };
}

export function createTestContext(): TestContext {
  const db = openDatabase(':memory:');
  seedCourts(db, NOW);
  const clock = { now: NOW };
  const app = buildApp({ db, now: () => clock.now });
  return { app, db, clock };
}

function extractSessionCookie(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'];
  const values = Array.isArray(raw) ? raw : [raw];
  for (const value of values) {
    if (typeof value === 'string' && value.startsWith('session=')) {
      return value.split(';')[0]!;
    }
  }
  throw new Error(`No session cookie in response headers: ${JSON.stringify(raw)}`);
}

export interface RegisteredClient {
  cookie: string;
  userId: string;
  email: string;
}

let counter = 0;

export async function registerClient(
  context: TestContext,
  overrides: { email?: string; phone?: string; name?: string; password?: string } = {},
): Promise<RegisteredClient> {
  counter += 1;
  const email = overrides.email ?? `client${counter}@example.com`;
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email,
      password: overrides.password ?? 'secreto123',
      name: overrides.name ?? 'Cliente',
      phone: overrides.phone ?? '9999-8888',
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`register failed: ${response.statusCode} ${response.body}`);
  }

  const body = response.json() as { user: { id: string } };
  return {
    cookie: extractSessionCookie(response.headers as Record<string, unknown>),
    userId: body.user.id,
    email,
  };
}

export async function login(
  context: TestContext,
  email: string,
  password: string,
): Promise<{ statusCode: number; cookie?: string; body: unknown }> {
  const response = await context.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    return { statusCode: response.statusCode, body: response.json() };
  }
  return {
    statusCode: response.statusCode,
    cookie: extractSessionCookie(response.headers as Record<string, unknown>),
    body: response.json(),
  };
}
