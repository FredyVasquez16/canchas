import {
  HOUR_MS,
  formatHour12Range,
  formatVenueDate,
  venueHour,
} from '@canchas/core';
import { CURRENCY, VENUE_TIME_ZONE } from './config.ts';
import type { Db } from './db/index.ts';
import {
  listRemindersBetween,
  listReservationsEndedWithoutOutcome,
  markFailure,
  markReminded,
  type ReminderCandidate,
} from './db/reservations.ts';
import { formatMoney } from './money.ts';

/** Anything the job can hand a message to; a real provider plugs in here later. */
export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void> | void;
}

export interface JobResult {
  noShowsMarked: number;
  remindersSent: number;
  remindersSkipped: number;
}

/** S15: reservations starting within this window from `now` get their reminder email. */
export const REMINDER_WINDOW_MS = 24 * HOUR_MS;

/** S21: the mail shows the reserved hours on a 12-hour clock, never the internal grid. */
function hourRangeLabel(startAt: number, endAt: number): string {
  return formatHour12Range(
    venueHour(startAt, VENUE_TIME_ZONE),
    venueHour(endAt, VENUE_TIME_ZONE),
  );
}

function reminderMessage(candidate: ReminderCandidate): {
  to: string;
  subject: string;
  text: string;
} {
  const day = formatVenueDate(candidate.startAt, VENUE_TIME_ZONE);
  const text = [
    `Hola ${candidate.clientName}, te recordamos tu reserva en ${candidate.courtName}.`,
    `Fecha: ${day}`,
    `Hora: ${hourRangeLabel(candidate.startAt, candidate.endAt)} (${candidate.hours} h).`,
    `Total a pagar en efectivo al llegar: ${formatMoney(candidate.totalCents, CURRENCY)}.`,
  ].join('\n');
  return { to: candidate.clientEmail, subject: `Recordatorio de reserva en ${candidate.courtName}`, text };
}

/**
 * One pass of the scheduled maintenance job.
 *
 * S7: every reservation that reached its end without an arrival is marked as a no-show,
 * exactly once.
 * S15: every booked reservation starting within the next 24 hours gets exactly one
 * reminder email; already reminded reservations are counted as skipped, never re-sent.
 */
export async function runScheduledJob(db: Db, now: number, mailer: Mailer): Promise<JobResult> {
  const ended = listReservationsEndedWithoutOutcome(db, now);
  for (const reservation of ended) {
    markFailure(db, reservation.id, 'no_show', now);
  }

  let remindersSent = 0;
  let remindersSkipped = 0;
  for (const candidate of listRemindersBetween(db, now, now + REMINDER_WINDOW_MS)) {
    if (candidate.remindedAt !== null) {
      remindersSkipped += 1;
      continue;
    }
    await mailer.send(reminderMessage(candidate));
    markReminded(db, candidate.id, now);
    remindersSent += 1;
  }

  return { noShowsMarked: ended.length, remindersSent, remindersSkipped };
}
