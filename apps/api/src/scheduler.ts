import type { Db } from './db/index.ts';
import { runScheduledJob, type JobResult, type Mailer } from './jobs.ts';

/** S24: one pass every 15 minutes unless the process is told otherwise. */
export const DEFAULT_SCHEDULER_INTERVAL_MS = 900_000;

export interface SchedulerOptions {
  db: Db;
  mailer: Mailer;
  now?: () => number;
  intervalMs?: number;
  onResult?: (result: JobResult) => void;
  onError?: (error: unknown) => void;
}

/**
 * S24: keep the reminders automatic while the API process is up.
 *
 * One pass runs immediately after startup and then once per interval. A tick that lands
 * while the previous pass is still in flight is dropped instead of queued, so two passes
 * never overlap. A failing pass is reported through `onError` and the schedule survives it.
 * The returned function clears the timer; it does not wait for a pass already in flight,
 * which is why a stopped scheduler may still report one last result.
 */
export function startScheduler(options: SchedulerOptions): () => void {
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? DEFAULT_SCHEDULER_INTERVAL_MS;

  let running = false;
  let stopped = false;

  const pass = async (): Promise<void> => {
    if (running || stopped) {
      return;
    }
    running = true;
    try {
      const result = await runScheduledJob(options.db, now(), options.mailer);
      options.onResult?.(result);
    } catch (error) {
      options.onError?.(error);
    } finally {
      running = false;
    }
  };

  void pass();

  const timer = setInterval(() => {
    void pass();
  }, intervalMs);
  if (typeof timer === 'object' && timer !== null && typeof timer.unref === 'function') {
    timer.unref();
  }

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
