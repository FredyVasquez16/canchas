import type { FastifyInstance } from 'fastify';
import { SESSION_TTL_MS } from '../config.ts';
import { NO_PASSWORD_HASH, createSession } from '../auth.ts';
import type { Db } from '../db/index.ts';
import {
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  linkGoogleId,
  type UserRecord,
} from '../db/users.ts';
import {
  CLEAR_GOOGLE_STATE_COOKIE,
  GoogleExchangeError,
  createGoogleState,
  fetchGoogleProfile,
  googleAuthorizeUrl,
  googleStateCookie,
  isValidGoogleState,
  type GoogleConfig,
  type GoogleProfile,
} from '../google.ts';
import { cookieValue, reject, sessionCookie } from '../http.ts';

export interface GoogleDeps {
  db: Db;
  now: () => number;
  google: GoogleConfig;
  webBaseUrl: string;
  /** Injected by the tests so the suite never reaches the network. */
  fetchImpl?: typeof fetch;
}

/**
 * S37: one row per Google subject. An existing account with the same verified email is
 * linked instead of duplicated, so the client keeps its reservations and its history.
 */
function findOrLinkGoogleUser(db: Db, profile: GoogleProfile, timestamp: number): UserRecord {
  const byGoogleId = findUserByGoogleId(db, profile.googleId);
  if (byGoogleId) {
    return byGoogleId;
  }

  const byEmail = findUserByEmail(db, profile.email);
  if (byEmail) {
    linkGoogleId(db, byEmail.id, profile.googleId);
    return findUserByGoogleId(db, profile.googleId)!;
  }

  createUser(db, {
    email: profile.email,
    // S40: the sentinel can never match a password guess.
    passwordHash: NO_PASSWORD_HASH,
    name: profile.name,
    phone: '',
    googleId: profile.googleId,
    now: timestamp,
  });
  return findUserByGoogleId(db, profile.googleId)!;
}

export function registerGoogleRoutes(app: FastifyInstance, deps: GoogleDeps): void {
  const { db, now, google, fetchImpl } = deps;

  app.get('/api/auth/google/start', async (_request, reply) => {
    const state = createGoogleState(google.clientSecret, now());
    reply.header('Set-Cookie', googleStateCookie(state));
    return reply.redirect(googleAuthorizeUrl(google, state), 302);
  });

  app.get('/api/auth/google/callback', async (request, reply) => {
    const query = request.query as { code?: unknown; state?: unknown };
    const state = typeof query.state === 'string' ? query.state : '';
    const code = typeof query.code === 'string' ? query.code : '';
    const cookieState = cookieValue(request, 'oauth_state') ?? '';

    const timestamp = now();

    // S39: a callback this browser did not start cannot sign anyone in.
    if (
      state === '' ||
      cookieState === '' ||
      state !== cookieState ||
      !isValidGoogleState(google.clientSecret, state, timestamp)
    ) {
      return reject(reply, 400, 'invalid_state');
    }
    if (code === '') {
      return reject(reply, 400, 'invalid_request');
    }

    let profile: GoogleProfile;
    try {
      profile = await fetchGoogleProfile(google, code, fetchImpl);
    } catch (error) {
      if (error instanceof GoogleExchangeError) {
        return reject(reply, 502, 'google_exchange_failed');
      }
      throw error;
    }

    if (!profile.emailVerified) {
      return reject(reply, 403, 'google_email_unverified');
    }

    let user: UserRecord;
    db.exec('BEGIN IMMEDIATE');
    try {
      user = findOrLinkGoogleUser(db, profile, timestamp);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const token = createSession(db, user.id, timestamp, SESSION_TTL_MS);
    // S38: a Google account starts without a phone, and the app asks for it before booking.
    const destination = user.phone.trim() === '' ? '#/completar-perfil' : '#/mis-reservas';
    reply.header('Set-Cookie', [sessionCookie(token, SESSION_TTL_MS), CLEAR_GOOGLE_STATE_COOKIE]);
    return reply.redirect(`${deps.webBaseUrl.replace(/\/+$/, '')}/${destination}`, 302);
  });
}
