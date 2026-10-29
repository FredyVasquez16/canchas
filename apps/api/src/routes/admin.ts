import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  HOUR_MS,
  addDays,
  formatHour12Range,
  formatVenueDate,
  isVenueDate,
  venueHour,
  zonedToEpoch,
} from '@canchas/core';
import { apiConfig } from '../config.ts';
import type { Db } from '../db/index.ts';
import { findSessionUser } from '../auth.ts';
import { findUserById, listClientFailureCounts, type UserRecord } from '../db/users.ts';
import {
  countReservationsForCourt,
  getReservation,
  listAgendaBetween,
  markArrival,
  markFailure,
  clearFailure,
} from '../db/reservations.ts';
import { createBlock, getBlock, listActiveBlocks, revokeBlock } from '../db/blocks.ts';
import { createClosure, deleteClosure, getClosure, listUpcomingClosures } from '../db/closures.ts';
import {
  createCourt,
  deleteCourt,
  getCourt,
  listCourts,
  renameCourt,
  setCourtActive,
  updateCourtPrice,
} from '../db/courts.ts';
import { formatMoney } from '../money.ts';
import { computeStats } from '../stats.ts';
import { reject, tokenFrom } from '../http.ts';

export interface AdminDeps {
  db: Db;
  now: () => number;
}

const dateQuerySchema = z.object({
  date: z.string().refine(isVenueDate, 'invalid_date'),
});

const monthQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'invalid_month')
    .optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });
const clientParamsSchema = z.object({ userId: z.string().min(1) });

const failureSchema = z.object({
  reason: z.enum(['no_show', 'late_cancel', 'owner']).optional(),
});

const penaltySchema = z.object({
  days: z.number().int().min(1).max(365),
  reason: z.string().trim().max(500).optional(),
});

const blockSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const courtPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  pricePerHourCents: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

const courtCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  pricePerHourCents: z.number().int().min(0),
});

const statsQuerySchema = z.object({
  from: z.string().refine(isVenueDate, 'invalid_date').optional(),
  to: z.string().refine(isVenueDate, 'invalid_date').optional(),
});

const closureSchema = z.object({
  date: z.string().refine(isVenueDate, 'invalid_date'),
  startHour: z.number().int().min(0).max(23),
  hours: z.number().int().min(1).max(24 * 60),
  courtId: z.string().min(1).nullable().optional(),
  note: z.string().trim().max(200).optional(),
});

function monthRange(month: string | undefined, now: number): { start: number; end: number } {
  const timeZone = apiConfig.venueTimeZone;
  const reference = formatVenueDate(now, timeZone);
  const key = month ?? reference.slice(0, 7);
  const [year, monthNumber] = key.split('-').map(Number) as [number, number];
  const next = monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`;
  return {
    start: zonedToEpoch(`${key}-01`, 0, timeZone),
    end: zonedToEpoch(next, 0, timeZone),
  };
}

export function registerAdminRoutes(app: FastifyInstance, deps: AdminDeps): void {
  const { db, now } = deps;

  function sessionUser(request: FastifyRequest): UserRecord | null {
    const token = tokenFrom(request);
    return token ? findSessionUser(db, token, now()) : null;
  }

  function requirePanel(request: FastifyRequest, reply: FastifyReply): UserRecord | null {
    const user = sessionUser(request);
    if (!user) {
      reject(reply, 401, 'unauthenticated');
      return null;
    }
    if (user.role === 'client') {
      reject(reply, 403, 'forbidden');
      return null;
    }
    return user;
  }

  function requireAdmin(request: FastifyRequest, reply: FastifyReply): UserRecord | null {
    const user = requirePanel(request, reply);
    if (!user) {
      return null;
    }
    if (user.role !== 'admin') {
      reject(reply, 403, 'forbidden');
      return null;
    }
    return user;
  }

  app.get('/api/admin/agenda', async (request, reply) => {
    if (!requirePanel(request, reply)) return reply;
    const parsed = dateQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const { date } = parsed.data;
    const timeZone = apiConfig.venueTimeZone;
    const dayStart = zonedToEpoch(date, 0, timeZone);
    const dayEnd = zonedToEpoch(addDays(date, 1), 0, timeZone);

    const reservations = listAgendaBetween(db, dayStart, dayEnd).map((entry) => ({
      id: entry.id,
      courtId: entry.courtId,
      courtName: entry.courtName,
      startAt: entry.startAt,
      endAt: entry.endAt,
      hours: entry.hours,
      totalCents: entry.totalCents,
      status: entry.status,
      arrivedAt: entry.arrivedAt,
      failureMarkedAt: entry.failureMarkedAt,
      failureReason: entry.failureReason,
      client: {
        id: entry.userId,
        name: entry.clientName,
        phone: entry.clientPhone,
      },
    }));

    return reply.code(200).send({
      date,
      timeZone,
      currency: apiConfig.currency,
      courts: listCourts(db),
      reservations,
      closures: listUpcomingClosures(db, dayStart).filter((closure) => closure.startAt < dayEnd),
    });
  });

  app.post('/api/admin/reservations/:id/arrive', async (request, reply) => {
    const user = requirePanel(request, reply);
    if (!user) return reply;
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const reservation = getReservation(db, parsed.data.id);
    if (!reservation) {
      return reject(reply, 404, 'reservation_not_found');
    }
    if (reservation.status !== 'booked') {
      return reject(reply, 409, 'already_cancelled');
    }
    markArrival(db, reservation.id, now());
    return reply.code(200).send({ reservation: getReservation(db, reservation.id) });
  });

  app.post('/api/admin/reservations/:id/failure', async (request, reply) => {
    if (!requirePanel(request, reply)) return reply;
    const parsed = idParamsSchema.safeParse(request.params);
    const body = failureSchema.safeParse(request.body ?? {});
    if (!parsed.success || !body.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const reservation = getReservation(db, parsed.data.id);
    if (!reservation) {
      return reject(reply, 404, 'reservation_not_found');
    }
    markFailure(db, reservation.id, body.data.reason ?? 'owner', now());
    return reply.code(200).send({ reservation: getReservation(db, reservation.id) });
  });

  app.delete('/api/admin/reservations/:id/failure', async (request, reply) => {
    if (!requirePanel(request, reply)) return reply;
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    if (!getReservation(db, parsed.data.id)) {
      return reject(reply, 404, 'reservation_not_found');
    }
    clearFailure(db, parsed.data.id);
    return reply.code(200).send({ reservation: getReservation(db, parsed.data.id) });
  });

  app.get('/api/admin/stats', async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const parsed = statsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const timeZone = apiConfig.venueTimeZone;
    const to = parsed.data.to ?? formatVenueDate(now(), timeZone);
    const from = parsed.data.from ?? addDays(to, -29);
    if (from > to) {
      return reject(reply, 400, 'invalid_input');
    }
    return reply.code(200).send(computeStats(db, { from, to, timeZone }));
  });

  app.get('/api/admin/clients', async (request, reply) => {
    if (!requirePanel(request, reply)) return reply;
    const parsed = monthQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const { start, end } = monthRange(parsed.data.month, now());
    const blocks = listActiveBlocks(db, now());
    const clients = listClientFailureCounts(db, start, end).map((client) => {
      const block =
        blocks.find(
          (candidate) =>
            candidate.userId === client.id ||
            candidate.phoneNormalized === client.phoneNormalized,
        ) ?? null;
      return { ...client, block };
    });

    return reply.code(200).send({ month: formatVenueDate(start, apiConfig.venueTimeZone).slice(0, 7), clients });
  });

  app.post('/api/admin/clients/:userId/penalty', async (request, reply) => {
    const admin = requireAdmin(request, reply);
    if (!admin) return reply;
    const parsed = clientParamsSchema.safeParse(request.params);
    const body = penaltySchema.safeParse(request.body ?? {});
    if (!parsed.success || !body.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const client = findUserById(db, parsed.data.userId);
    if (!client) {
      return reject(reply, 404, 'client_not_found');
    }

    const timestamp = now();
    const block = createBlock(db, {
      userId: client.id,
      phone: client.phone,
      startsAt: timestamp,
      endsAt: timestamp + body.data.days * 24 * HOUR_MS,
      reason: body.data.reason ?? null,
      createdBy: admin.id,
      now: timestamp,
    });

    return reply.code(201).send({ block });
  });

  app.post('/api/admin/clients/:userId/block', async (request, reply) => {
    const admin = requireAdmin(request, reply);
    if (!admin) return reply;
    const parsed = clientParamsSchema.safeParse(request.params);
    const body = blockSchema.safeParse(request.body ?? {});
    if (!parsed.success || !body.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const client = findUserById(db, parsed.data.userId);
    if (!client) {
      return reject(reply, 404, 'client_not_found');
    }

    const timestamp = now();
    const block = createBlock(db, {
      userId: client.id,
      phone: client.phone,
      startsAt: timestamp,
      endsAt: null,
      reason: body.data.reason ?? null,
      createdBy: admin.id,
      now: timestamp,
    });

    return reply.code(201).send({ block });
  });

  app.delete('/api/admin/blocks/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    if (!getBlock(db, parsed.data.id)) {
      return reject(reply, 404, 'block_not_found');
    }
    revokeBlock(db, parsed.data.id, now());
    return reply.code(200).send({ ok: true });
  });

  app.get('/api/admin/courts', async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return reply.code(200).send({ courts: listCourts(db, { includeInactive: true }) });
  });

  app.post('/api/admin/courts', async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const parsed = courtCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const court = createCourt(db, {
      name: parsed.data.name,
      pricePerHourCents: parsed.data.pricePerHourCents,
      now: now(),
    });
    return reply.code(201).send({ court });
  });

  app.patch('/api/admin/courts/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const parsed = idParamsSchema.safeParse(request.params);
    const body = courtPatchSchema.safeParse(request.body ?? {});
    if (!parsed.success || !body.success) {
      return reject(reply, 400, 'invalid_input');
    }
    if (!getCourt(db, parsed.data.id)) {
      return reject(reply, 404, 'court_not_found');
    }

    if (body.data.name !== undefined) {
      renameCourt(db, parsed.data.id, body.data.name);
    }
    if (body.data.pricePerHourCents !== undefined) {
      updateCourtPrice(db, parsed.data.id, body.data.pricePerHourCents);
    }
    if (body.data.active !== undefined) {
      setCourtActive(db, parsed.data.id, body.data.active);
    }

    return reply.code(200).send({ court: getCourt(db, parsed.data.id) });
  });

  app.delete('/api/admin/courts/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    if (!getCourt(db, parsed.data.id)) {
      return reject(reply, 404, 'court_not_found');
    }
    if (countReservationsForCourt(db, parsed.data.id) > 0) {
      return reject(reply, 409, 'court_in_use');
    }
    deleteCourt(db, parsed.data.id);
    return reply.code(200).send({ ok: true });
  });

  app.get('/api/admin/closures', async (request, reply) => {
    if (!requirePanel(request, reply)) return reply;
    return reply.code(200).send({ closures: listUpcomingClosures(db, now()) });
  });

  app.post('/api/admin/closures', async (request, reply) => {
    const user = requirePanel(request, reply);
    if (!user) return reply;
    const parsed = closureSchema.safeParse(request.body);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const { date, startHour, hours, courtId, note } = parsed.data;
    if (courtId && !getCourt(db, courtId)) {
      return reject(reply, 404, 'court_not_found');
    }

    const startAt = zonedToEpoch(date, startHour, apiConfig.venueTimeZone);
    const closure = createClosure(db, {
      courtId: courtId ?? null,
      startAt,
      endAt: startAt + hours * HOUR_MS,
      note: note ?? null,
      createdBy: user.id,
      now: now(),
    });

    return reply.code(201).send({ closure });
  });

  app.delete('/api/admin/closures/:id', async (request, reply) => {
    if (!requirePanel(request, reply)) return reply;
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    if (!getClosure(db, parsed.data.id)) {
      return reject(reply, 404, 'closure_not_found');
    }
    deleteClosure(db, parsed.data.id);
    return reply.code(200).send({ ok: true });
  });

  app.get('/api/admin/reservations/:id/whatsapp', async (request, reply) => {
    if (!requirePanel(request, reply)) return reply;
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reject(reply, 400, 'invalid_input');
    }
    const reservation = getReservation(db, parsed.data.id);
    if (!reservation) {
      return reject(reply, 404, 'reservation_not_found');
    }
    const court = getCourt(db, reservation.courtId);
    const client = findUserById(db, reservation.userId);
    if (!court || !client) {
      return reject(reply, 404, 'reservation_not_found');
    }

    const timeZone = apiConfig.venueTimeZone;
    const day = formatVenueDate(reservation.startAt, timeZone);
    const hourRange = formatHour12Range(
      venueHour(reservation.startAt, timeZone),
      venueHour(reservation.endAt, timeZone),
    );

    const text = [
      `Hola ${client.name}, te recordamos tu reserva en ${court.name}.`,
      `Fecha: ${day}`,
      `Hora: ${hourRange} (${reservation.hours} h).`,
      `Total a pagar en efectivo al llegar: ${formatMoney(reservation.totalCents, apiConfig.currency)}.`,
    ].join('\n');

    return reply.code(200).send({
      url: `https://wa.me/${client.phoneNormalized}?text=${encodeURIComponent(text)}`,
    });
  });
}

export { monthRange };
