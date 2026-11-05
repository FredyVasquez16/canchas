import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRecord } from './db/users.ts';

export function cookieValue(request: FastifyRequest, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (trimmed.slice(0, separator) === name) {
      return trimmed.slice(separator + 1);
    }
  }
  return null;
}

export function tokenFrom(request: FastifyRequest): string | null {
  return cookieValue(request, 'session');
}

export function sessionCookie(token: string, ttlMs: number): string {
  return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttlMs / 1000)}`;
}

export const CLEAR_COOKIE = 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: UserRecord['role'];
}

export function publicUser(user: Pick<UserRecord, 'id' | 'email' | 'name' | 'phone' | 'role'>): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
  };
}

export function reject(reply: FastifyReply, status: number, error: string): FastifyReply {
  return reply.code(status).send({ error });
}
