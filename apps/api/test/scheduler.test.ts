import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatVenueDate } from '@canchas/core';
import type { JobResult, Mailer } from '../src/jobs.ts';
import { startScheduler } from '../src/scheduler.ts';
import { createTestContext, NOW, registerClient, type TestContext } from './helpers.ts';

const INTERVAL_MS = 60_000;
const DATE = formatVenueDate(NOW, 'America/Tegucigalpa');

let context: TestContext;
let stop: (() => void) | undefined;

beforeEach(() => {
  stop = undefined;
});

afterEach(async () => {
  stop?.();
  vi.useRealTimers();
  await context?.app.close();
});

/** Test double that records every message and can hold a pass open. */
class DeferredMailer implements Mailer {
  readonly messages: Array<{ to: string; subject: string; text: string }> = [];
  active = 0;
  maxActive = 0;
  private releaseOne: (() => void) | null = null;

  send(message: { to: string; subject: string; text: string }): Promise<void> {
    this.messages.push({ ...message });
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    return new Promise<void>((resolve) => {
      this.releaseOne = () => {
        this.active -= 1;
        this.releaseOne = null;
        resolve();
      };
    });
  }

  release(): void {
    this.releaseOne?.();
  }
}

/** Test double that fails the first attempt and succeeds after that. */
class FlakyMailer implements Mailer {
  calls = 0;
  readonly messages: Array<{ to: string; subject: string; text: string }> = [];

  send(message: { to: string; subject: string; text: string }): void {
    this.calls += 1;
    if (this.calls === 1) {
      throw new Error('smtp is down');
    }
    this.messages.push({ ...message });
  }
}

/** Lets every pending promise chain settle without advancing the fake clock. */
async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}

async function bookingRig(): Promise<string> {
  context = createTestContext();
  const client = await registerClient(context);
  const courts = await context.app.inject({ method: 'GET', url: '/api/courts' });
  const courtId = (courts.json() as { courts: Array<{ id: string }> }).courts[0]!.id;
  const booking = await context.app.inject({
    method: 'POST',
    url: '/api/reservations',
    headers: { cookie: client.cookie },
    payload: { courtId, date: DATE, startHour: 11, hours: 2 },
  });
  if (booking.statusCode !== 201) {
    throw new Error(`booking failed: ${booking.statusCode} ${booking.body}`);
  }
  return client.email;
}

describe('scheduler (S24)', () => {
  it('runs the first pass immediately, without waiting for the interval', async () => {
    const email = await bookingRig();
    vi.useFakeTimers();

    const mailer = new DeferredMailer();
    const results: JobResult[] = [];
    stop = startScheduler({
      db: context.db,
      mailer,
      now: () => NOW,
      intervalMs: INTERVAL_MS,
      onResult: (result) => results.push(result),
    });

    await flushAsyncWork();

    expect(mailer.messages).toHaveLength(1);
    expect(mailer.messages[0]!.to).toBe(email);

    mailer.release();
    await flushAsyncWork();

    expect(results).toEqual([{ noShowsMarked: 0, remindersSent: 1, remindersSkipped: 0 }]);
  });

  it('runs another pass after the interval elapses', async () => {
    await bookingRig();
    vi.useFakeTimers();

    const mailer = new DeferredMailer();
    const results: JobResult[] = [];
    stop = startScheduler({
      db: context.db,
      mailer,
      now: () => NOW,
      intervalMs: INTERVAL_MS,
      onResult: (result) => results.push(result),
    });

    await flushAsyncWork();
    mailer.release();
    await flushAsyncWork();
    expect(results).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    await flushAsyncWork();

    expect(results).toHaveLength(2);
    expect(results[1]).toEqual({ noShowsMarked: 0, remindersSent: 0, remindersSkipped: 1 });
  });

  it('skips ticks while a pass is still in flight', async () => {
    await bookingRig();
    vi.useFakeTimers();

    const mailer = new DeferredMailer();
    const results: JobResult[] = [];
    stop = startScheduler({
      db: context.db,
      mailer,
      now: () => NOW,
      intervalMs: INTERVAL_MS,
      onResult: (result) => results.push(result),
    });

    // The first pass is open because the mailer never resolves it.
    await flushAsyncWork();
    expect(mailer.messages).toHaveLength(1);
    expect(mailer.maxActive).toBe(1);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    await flushAsyncWork();

    expect(mailer.messages).toHaveLength(1);
    expect(mailer.maxActive).toBe(1);
    expect(results).toHaveLength(0);

    mailer.release();
    await flushAsyncWork();
    expect(results).toHaveLength(1);
  });

  it('reports a mailer failure through onError and keeps the schedule alive', async () => {
    await bookingRig();
    vi.useFakeTimers();

    const mailer = new FlakyMailer();
    const results: JobResult[] = [];
    const errors: unknown[] = [];
    stop = startScheduler({
      db: context.db,
      mailer,
      now: () => NOW,
      intervalMs: INTERVAL_MS,
      onResult: (result) => results.push(result),
      onError: (error) => errors.push(error),
    });

    await flushAsyncWork();

    expect(mailer.calls).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect(results).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    await flushAsyncWork();

    expect(mailer.calls).toBe(2);
    expect(results).toEqual([{ noShowsMarked: 0, remindersSent: 1, remindersSkipped: 0 }]);
  });

  it('stops sending passes once the returned function is called', async () => {
    await bookingRig();
    vi.useFakeTimers();

    const mailer = new DeferredMailer();
    const results: JobResult[] = [];
    const stopFn = startScheduler({
      db: context.db,
      mailer,
      now: () => NOW,
      intervalMs: INTERVAL_MS,
      onResult: (result) => results.push(result),
    });
    stop = stopFn;

    await flushAsyncWork();
    mailer.release();
    await flushAsyncWork();
    expect(results).toHaveLength(1);

    stopFn();

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    await flushAsyncWork();

    expect(results).toHaveLength(1);
    expect(mailer.messages).toHaveLength(1);
  });
});
