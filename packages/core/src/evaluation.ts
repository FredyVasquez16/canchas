import { HOUR_MS } from './types.ts';

export type ReservationOutcome =
  | 'upcoming'
  | 'fulfilled'
  | 'cancelled_free'
  | 'cancelled_late'
  | 'no_show';

export interface ReservationEvaluationInput {
  startAt: number;
  endAt: number;
  now: number;
  cancelWindowHours: number;
  cancelledAt?: number | null;
  arrivedAt?: number | null;
}

export interface ReservationEvaluation {
  outcome: ReservationOutcome;
  /** A failure mark is recorded, but a penalty is always a separate owner decision. */
  markFailure: boolean;
  cancellationDeadline: number;
}

/** Last instant at which cancelling is still free. */
export function cancellationDeadline(startAt: number, cancelWindowHours: number): number {
  return startAt - cancelWindowHours * HOUR_MS;
}

/**
 * Attendance wins over everything else: if the money was collected, the client
 * is never marked. A cancellation after the deadline, or a reservation that
 * ended with no arrival record, is a failure.
 */
export function evaluateReservation(input: ReservationEvaluationInput): ReservationEvaluation {
  const deadline = cancellationDeadline(input.startAt, input.cancelWindowHours);

  if (input.arrivedAt != null) {
    return { outcome: 'fulfilled', markFailure: false, cancellationDeadline: deadline };
  }

  if (input.cancelledAt != null) {
    const late = input.cancelledAt > deadline;
    return {
      outcome: late ? 'cancelled_late' : 'cancelled_free',
      markFailure: late,
      cancellationDeadline: deadline,
    };
  }

  if (input.now >= input.endAt) {
    return { outcome: 'no_show', markFailure: true, cancellationDeadline: deadline };
  }

  return { outcome: 'upcoming', markFailure: false, cancellationDeadline: deadline };
}
