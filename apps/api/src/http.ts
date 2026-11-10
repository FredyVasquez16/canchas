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

/** S43: `Secure` keeps the cookie off plain HTTP when the deployment speaks TLS. */
export function sessionCookie(token: string, ttlMs: number, secure = false): string {
  return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttlMs / 1000)}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure = false): string {
  return `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

/** S42: the one answer every limited auth attempt gets, with the wait it should respect. */
export function tooMany(reply: FastifyReply, retryAfterSeconds: number): FastifyReply {
  reply.header('Retry-After', String(retryAfterSeconds));
  return reject(reply, 429, 'too_many_requests');
}

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
