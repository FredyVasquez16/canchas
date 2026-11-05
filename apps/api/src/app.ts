import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  HOUR_MS,
  addDays,
  buildDayAvailability,
  evaluateReservation,
  formatVenueDate,
  isVenueDate,
  validateBooking,
  zonedToEpoch,
  type Closure as CoreClosure,
  type Court,
  type CourtReservation,
} from '@canchas/core';
import { SESSION_TTL_MS, DEFAULT_WEB_BASE_URL, apiConfig } from './config.ts';
import type { Db } from './db/index.ts';
import { createUser, findUserByEmail, type UserRecord } from './db/users.ts';
import {
  createSession,
  destroySession,
  findSessionUser,
  hashPassword,
  verifyPassword,
} from './auth.ts';
import { getCourt, listCourts } from './db/courts.ts';
import { listClosuresOverlapping } from './db/closures.ts';
import {
  cancelReservation,
  countActiveReservationsForUser,
  createReservation,
  getReservation,
  listBookedOverlapping,
  listReservationsForUser,
  markFailure,
} from './db/reservations.ts';
import { findActiveBlock } from './db/blocks.ts';
import { isValidHonduranPhone } from './phone.ts';
import { CLEAR_COOKIE, publicUser, reject, sessionCookie, tokenFrom } from './http.ts';
import { ConsoleMailer } from './mailer.ts';
import type { Mailer } from './jobs.ts';
import type { GoogleConfig } from './google.ts';
import { registerAdminRoutes } from './routes/admin.ts';
import { registerAccountRoutes } from './routes/account.ts';
import { registerGoogleRoutes } from './routes/google.ts';
import { registerRecoveryRoutes } from './routes/recovery.ts';

export interface AppDeps {
  db: Db;
  now?: () => number;
  /** S35: the channel that carries reminders and the recovery link. */
  mailer?: Mailer;
  /** S31: where the recovery link points; the web dev server by default. */
  webBaseUrl?: string;
  /** S36: null or absent keeps Google sign-in off. */
  google?: GoogleConfig | null;
  /** S37: injected by the tests so the suite never reaches the network. */
  fetchImpl?: typeof fetch;
}

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().trim().min(2),
  phone: z.string().refine(isValidHonduranPhone, 'invalid_phone'),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const availabilityQuerySchema = z.object({
  date: z.string().refine(isVenueDate, 'invalid_date'),
});

const createReservationSchema = z.object({
  courtId: z.string().min(1),
  date: z.string().refine(isVenueDate, 'invalid_date'),
  startHour: z.number().int().min(0).max(23),
  hours: z.number().int().min(1),
});

function toCoreCourt(court: {
  id: string;
  name: string;
  pricePerHourCents: number;
  active: boolean;
}): Court {
  return {
    id: court.id,
    name: court.name,
    pricePerHourCents: court.pricePerHourCents,
    active: court.active,
  };
}

export function buildApp(deps: AppDeps, options: { logger?: boolean } = {}): FastifyInstance {
  const { db } = deps;
  const now = deps.now ?? (() => Date.now());
  const app = Fastify({ logger: options.logger ?? false });

  function currentUser(request: FastifyRequest): UserRecord | null {
    const token = tokenFrom(request);
    if (!token) {
      return null;
    }
    return findSessionUser(db, token, now());
  }

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/api/config', async (_request, reply) =>
    reply.code(200).send({
      venueTimeZone: apiConfig.venueTimeZone,
      currency: apiConfig.currency,
      cancelWindowHours: apiConfig.cancelWindowHours,
      maxAdvanceDays: apiConfig.maxAdvanceDays,
      maxActiveReservations: apiConfig.maxActiveReservations,
      googleSignIn: deps.google !== undefined && deps.google !== null,
    }),
  );

  app.post('/api/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    if (findUserByEmail(db, parsed.data.email)) {
      return reject(reply, 409, 'email_taken');
    }

    const user = createUser(db, {
      email: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
      name: parsed.data.name,
      phone: parsed.data.phone,
      now: now(),
    });
    const token = createSession(db, user.id, now(), SESSION_TTL_MS);

    reply.header('Set-Cookie', sessionCookie(token, SESSION_TTL_MS));
    return reply.code(201).send({ user: publicUser(user) });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }

    const user = findUserByEmail(db, parsed.data.email);
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return reject(reply, 401, 'invalid_credentials');
    }

    const token = createSession(db, user.id, now(), SESSION_TTL_MS);
    reply.header('Set-Cookie', sessionCookie(token, SESSION_TTL_MS));
    return reply.code(200).send({ user: publicUser(user) });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = tokenFrom(request);
    if (token) {
      destroySession(db, token);
    }
    reply.header('Set-Cookie', CLEAR_COOKIE);
    return reply.code(200).send({ ok: true });
  });

  app.get('/api/auth/me', async (request, reply) => {
    const user = currentUser(request);
    if (!user) {
      return reject(reply, 401, 'unauthenticated');
    }
    return reply.code(200).send({ user: publicUser(user) });
  });

  app.get('/api/courts', async (_request, reply) => {
    return reply.code(200).send({ courts: listCourts(db) });
  });

  app.get('/api/availability', async (request, reply) => {
    const parsed = availabilityQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const { date } = parsed.data;
    const timeZone = apiConfig.venueTimeZone;
    const dayStart = zonedToEpoch(date, 0, timeZone);
    const dayEnd = zonedToEpoch(addDays(date, 1), 0, timeZone);

    const courts = listCourts(db).map(toCoreCourt);
    const reservations: CourtReservation[] = listBookedOverlapping(db, dayStart, dayEnd).map(
      (reservation) => ({
        id: reservation.id,
        courtId: reservation.courtId,
        startAt: reservation.startAt,
        endAt: reservation.endAt,
        status: reservation.status,
      }),
    );
    const closures: CoreClosure[] = listClosuresOverlapping(db, dayStart, dayEnd).map((closure) => ({
      id: closure.id,
      courtId: closure.courtId,
      startAt: closure.startAt,
      endAt: closure.endAt,
    }));

    const availability = buildDayAvailability({
      date,
      timeZone,
      courts,
      reservations,
      closures,
      now: now(),
    });

    return reply.code(200).send({
      date,
      timeZone,
      currency: apiConfig.currency,
      cancelWindowHours: apiConfig.cancelWindowHours,
      courts: availability.map((entry) => ({
        court: entry.court,
        slots: entry.slots.map(({ slot, status }) => ({
          hour: slot.hour,
          label: slot.label,
          startAt: slot.startAt,
          endAt: slot.endAt,
          status,
        })),
      })),
    });
  });

  app.post('/api/reservations', async (request, reply) => {
    const user = currentUser(request);
    if (!user) {
      return reject(reply, 401, 'unauthenticated');
    }

    // S38: a Google account has no phone until it completes the profile, and the venue
    // needs that phone to reach the client.
    if (user.phone.trim() === '') {
      return reject(reply, 403, 'phone_required');
    }

    const parsed = createReservationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const { courtId, date, startHour, hours } = parsed.data;

    const courtRecord = getCourt(db, courtId);
    if (!courtRecord) {
      return reject(reply, 404, 'court_not_found');
    }

    const timestamp = now();
    if (findActiveBlock(db, { userId: user.id, phone: user.phone, at: timestamp })) {
      return reject(reply, 403, 'blocked');
    }

    if (countActiveReservationsForUser(db, user.id, timestamp) >= apiConfig.maxActiveReservations) {
      return reject(reply, 403, 'active_limit');
    }

    const timeZone = apiConfig.venueTimeZone;
    const startAt = zonedToEpoch(date, startHour, timeZone);
    const endAt = startAt + hours * HOUR_MS;

    db.exec('BEGIN IMMEDIATE');
    try {
      const overlapping: CourtReservation[] = listBookedOverlapping(
        db,
        startAt,
        endAt,
        courtId,
      ).map((reservation) => ({
        id: reservation.id,
        courtId: reservation.courtId,
        startAt: reservation.startAt,
        endAt: reservation.endAt,
        status: reservation.status,
      }));
      const closures: CoreClosure[] = listClosuresOverlapping(db, startAt, endAt).map(
        (closure) => ({
          id: closure.id,
          courtId: closure.courtId,
          startAt: closure.startAt,
          endAt: closure.endAt,
        }),
      );

      const result = validateBooking({
        request: { court: toCoreCourt(courtRecord), date, startHour, hours },
        reservations: overlapping,
        closures,
        now: timestamp,
        policy: { timeZone, maxAdvanceDays: apiConfig.maxAdvanceDays },
      });

      if (!result.ok) {
        db.exec('ROLLBACK');
        const status = result.reason === 'occupied' ? 409 : 400;
        return reject(reply, status, result.reason);
      }

      const reservation = createReservation(db, {
        courtId,
        userId: user.id,
        startAt: result.startAt,
        endAt: result.endAt,
        hours: result.hours,
        pricePerHourCents: result.pricePerHourCents,
        totalCents: result.totalCents,
        now: timestamp,
      });
      db.exec('COMMIT');

      return reply.code(201).send({
        reservation,
        court: {
          id: courtRecord.id,
          name: courtRecord.name,
          pricePerHourCents: result.pricePerHourCents,
        },
      });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });

  app.get('/api/reservations/mine', async (request, reply) => {
    const user = currentUser(request);
    if (!user) {
      return reject(reply, 401, 'unauthenticated');
    }
    const reservations = listReservationsForUser(db, user.id, now());
    return reply.code(200).send({ reservations });
  });

  app.post('/api/reservations/:id/cancel', async (request, reply) => {
    const user = currentUser(request);
    if (!user) {
      return reject(reply, 401, 'unauthenticated');
    }
    const { id } = request.params as { id: string };
    const reservation = getReservation(db, id);
    if (!reservation || reservation.userId !== user.id) {
      return reject(reply, 404, 'reservation_not_found');
    }
    if (reservation.status !== 'booked') {
      return reject(reply, 409, 'already_cancelled');
    }

    const timestamp = now();
    if (timestamp >= reservation.startAt) {
      return reject(reply, 409, 'already_started');
    }

    const evaluation = evaluateReservation({
      startAt: reservation.startAt,
      endAt: reservation.endAt,
      now: timestamp,
      cancelWindowHours: apiConfig.cancelWindowHours,
      cancelledAt: timestamp,
      arrivedAt: reservation.arrivedAt,
    });

    cancelReservation(db, reservation.id, timestamp);
    if (evaluation.markFailure) {
      markFailure(db, reservation.id, 'late_cancel', timestamp);
    }

    return reply.code(200).send({
      reservation: getReservation(db, reservation.id),
      marked: evaluation.markFailure,
      cancellationDeadline: evaluation.cancellationDeadline,
    });
  });

  registerAccountRoutes(app, { db, now });
  registerRecoveryRoutes(app, {
    db,
    now,
    mailer: deps.mailer ?? new ConsoleMailer(),
    webBaseUrl: deps.webBaseUrl ?? DEFAULT_WEB_BASE_URL,
  });
  if (deps.google) {
    registerGoogleRoutes(app, {
      db,
      now,
      google: deps.google,
      webBaseUrl: deps.webBaseUrl ?? DEFAULT_WEB_BASE_URL,
      fetchImpl: deps.fetchImpl,
    });
  } else {
    // S36: with no credentials the flow answers exactly that, instead of a 404 nobody reads.
    app.get('/api/auth/google/start', async (_request, reply) =>
      reject(reply, 503, 'google_not_configured'),
    );
    app.get('/api/auth/google/callback', async (_request, reply) =>
      reject(reply, 503, 'google_not_configured'),
    );
  }
  registerAdminRoutes(app, { db, now });

  return app;
}

export { HOUR_MS, formatVenueDate };
