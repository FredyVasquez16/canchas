import { afterEach, describe, expect, it } from 'vitest';
import { zonedToEpoch } from '@canchas/core';
import { markArrival } from '../src/db/reservations.ts';
import { runScheduledJob, type JobResult, type Mailer } from '../src/jobs.ts';
import { createTestContext, NOW, registerClient, TZ, type TestContext } from './helpers.ts';

let context: TestContext;

afterEach(async () => {
  await context?.app.close();
});

const DATE = '2025-03-10';

/** Test double that records every message the job hands it. */
class RecordingMailer implements Mailer {
  readonly messages: Array<{ to: string; subject: string; text: string }> = [];

  send(message: { to: string; subject: string; text: string }): void {
    this.messages.push({ ...message });
  }
}

async function firstCourtId(ctx: TestContext): Promise<string> {
  const response = await ctx.app.inject({ method: 'GET', url: '/api/courts' });
  return (response.json() as { courts: Array<{ id: string }> }).courts[0]!.id;
}

async function bookCourt(
  ctx: TestContext,
  cookie: string,
  payload: { courtId: string; date: string; startHour: number; hours: number },
): Promise<{ id: string; totalCents: number }> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/reservations',
    headers: { cookie },
    payload,
  });
  if (response.statusCode !== 201) {
    throw new Error(`booking failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as { reservation: { id: string; totalCents: number } };
  return { id: body.reservation.id, totalCents: body.reservation.totalCents };
}

function storedReservation(db: TestContext['db'], id: string) {
  return db
    .prepare(
      'SELECT status, arrived_at, failure_marked_at, failure_reason, reminded_at FROM reservations WHERE id = ?',
    )
    .get(id) as {
    status: string;
    arrived_at: number | null;
    failure_marked_at: number | null;
    failure_reason: string | null;
    reminded_at: number | null;
  };
}

describe('scheduled job - no shows (S7)', () => {
  it('marks an ended reservation without an arrival as no_show exactly once', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courtId = await firstCourtId(context);
    const booked = await bookCourt(context, client.cookie, {
      courtId,
      date: DATE,
      startHour: 9,
      hours: 2,
    });

    // The reservation ended at 11:00 venue time; the job runs at noon.
    const jobNow = zonedToEpoch(DATE, 12, TZ);
    const mailer = new RecordingMailer();
    const first: JobResult = await runScheduledJob(context.db, jobNow, mailer);

    expect(first).toEqual({ noShowsMarked: 1, remindersSent: 0, remindersSkipped: 0 });
    expect(mailer.messages).toHaveLength(0);
    const stored = storedReservation(context.db, booked.id);
    expect(stored.status).toBe('booked');
    expect(stored.arrived_at).toBeNull();
    expect(stored.failure_marked_at).toBe(jobNow);
    expect(stored.failure_reason).toBe('no_show');

    // A second run must not mark it again.
    const second = await runScheduledJob(context.db, jobNow + 3_600_000, new RecordingMailer());
    expect(second.noShowsMarked).toBe(0);
    expect(storedReservation(context.db, booked.id).failure_marked_at).toBe(jobNow);
  });

  it('never marks a reservation whose client arrived', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courtId = await firstCourtId(context);
    const booked = await bookCourt(context, client.cookie, {
      courtId,
      date: DATE,
      startHour: 9,
      hours: 1,
    });

    // Staff collected the cash at the venue: the stay is fulfilled (S8).
    markArrival(context.db, booked.id, zonedToEpoch(DATE, 9, TZ));

    const result = await runScheduledJob(context.db, zonedToEpoch(DATE, 12, TZ), new RecordingMailer());
    expect(result).toEqual({ noShowsMarked: 0, remindersSent: 0, remindersSkipped: 0 });
    const stored = storedReservation(context.db, booked.id);
    expect(stored.failure_marked_at).toBeNull();
    expect(stored.failure_reason).toBeNull();
  });

  it('leaves a late-cancelled reservation that is already marked untouched', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courtId = await firstCourtId(context);
    const booked = await bookCourt(context, client.cookie, {
      courtId,
      date: DATE,
      startHour: 12,
      hours: 1,
    });

    // Cancel two hours before the reserved hour: automatic late_cancel mark (S6).
    context.clock.now = zonedToEpoch(DATE, 10, TZ);
    const cancel = await context.app.inject({
      method: 'POST',
      url: `/api/reservations/${booked.id}/cancel`,
      headers: { cookie: client.cookie },
    });
    expect(cancel.statusCode).toBe(200);

    const markedAt = storedReservation(context.db, booked.id).failure_marked_at;
    expect(markedAt).not.toBeNull();

    const result = await runScheduledJob(context.db, zonedToEpoch(DATE, 14, TZ), new RecordingMailer());
    expect(result).toEqual({ noShowsMarked: 0, remindersSent: 0, remindersSkipped: 0 });
    const stored = storedReservation(context.db, booked.id);
    expect(stored.status).toBe('cancelled');
    expect(stored.failure_marked_at).toBe(markedAt);
    expect(stored.failure_reason).toBe('late_cancel');
  });
});

describe('scheduled job - email reminders (S15)', () => {
  it('sends exactly one reminder with the court, date, hours and total, and never again', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courtId = await firstCourtId(context);
    const booked = await bookCourt(context, client.cookie, {
      courtId,
      date: DATE,
      startHour: 11,
      hours: 2,
    });

    // The reservation starts at 11:00, three hours ahead of NOW (08:00).
    const mailer = new RecordingMailer();
    const first: JobResult = await runScheduledJob(context.db, NOW, mailer);

    expect(first).toEqual({ noShowsMarked: 0, remindersSent: 1, remindersSkipped: 0 });
    expect(mailer.messages).toHaveLength(1);
    const message = mailer.messages[0]!;
    expect(message.to).toBe(client.email);
    expect(message.text).toContain('Cancha 1');
    expect(message.text).toContain('2025-03-10');
    expect(message.text).toContain('11:00');
    expect(message.text).toContain('13:00');
    expect(message.text).toContain('L 1,000.00');
    expect(storedReservation(context.db, booked.id).reminded_at).toBe(NOW);

    // Running the job again must not send a second email for the same reservation.
    const second = await runScheduledJob(context.db, NOW, new RecordingMailer());
    expect(second).toEqual({ noShowsMarked: 0, remindersSent: 0, remindersSkipped: 1 });
    expect(storedReservation(context.db, booked.id).reminded_at).toBe(NOW);
  });

  it('reminds a reservation starting exactly 24 hours ahead', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courtId = await firstCourtId(context);
    await bookCourt(context, client.cookie, {
      courtId,
      date: '2025-03-11',
      startHour: 8,
      hours: 1,
    });

    const result = await runScheduledJob(context.db, NOW, new RecordingMailer());
    expect(result).toEqual({ noShowsMarked: 0, remindersSent: 1, remindersSkipped: 0 });
  });

  it('does not remind a reservation 30 hours ahead yet', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courtId = await firstCourtId(context);
    const booked = await bookCourt(context, client.cookie, {
      courtId,
      date: '2025-03-11',
      startHour: 14,
      hours: 1,
    });

    const result = await runScheduledJob(context.db, NOW, new RecordingMailer());
    expect(result.remindersSent).toBe(0);
    expect(storedReservation(context.db, booked.id).reminded_at).toBeNull();
  });

  it('does not remind a cancelled reservation', async () => {
    context = createTestContext();
    const client = await registerClient(context);
    const courtId = await firstCourtId(context);
    const booked = await bookCourt(context, client.cookie, {
      courtId,
      date: DATE,
      startHour: 11,
      hours: 1,
    });

    // Cancelled exactly at the three hour boundary: free cancel, but no reminder either.
    const cancel = await context.app.inject({
      method: 'POST',
      url: `/api/reservations/${booked.id}/cancel`,
      headers: { cookie: client.cookie },
    });
    expect(cancel.statusCode).toBe(200);

    const result = await runScheduledJob(context.db, NOW, new RecordingMailer());
    expect(result).toEqual({ noShowsMarked: 0, remindersSent: 0, remindersSkipped: 0 });
    expect(storedReservation(context.db, booked.id).reminded_at).toBeNull();
  });
});
