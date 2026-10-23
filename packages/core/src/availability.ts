import { daySlots, rangesOverlap } from './slots.ts';
import type {
  Closure,
  Court,
  CourtAvailability,
  CourtReservation,
  Slot,
  SlotStatus,
  VenueDate,
} from './types.ts';

export interface AvailabilityInput {
  date: VenueDate;
  timeZone: string;
  courts: Court[];
  reservations: CourtReservation[];
  closures: Closure[];
  now: number;
}

function closureApplies(closure: Closure, courtId: string): boolean {
  return closure.courtId === null || closure.courtId === courtId;
}

function slotStatus(
  slot: Slot,
  courtId: string,
  input: AvailabilityInput,
): SlotStatus {
  const closed = input.closures.some(
    (closure) => closureApplies(closure, courtId) && rangesOverlap(closure, slot),
  );
  if (closed) {
    return 'closed';
  }

  const occupied = input.reservations.some(
    (reservation) =>
      reservation.status === 'booked' &&
      reservation.courtId === courtId &&
      rangesOverlap(reservation, slot),
  );
  if (occupied) {
    return 'occupied';
  }

  if (slot.startAt <= input.now) {
    return 'past';
  }

  return 'available';
}

/**
 * Availability per active court for one venue day. Reservations that start the
 * previous day and cross midnight are included, because overlap is computed by
 * instant, not by slot index.
 */
export function buildDayAvailability(input: AvailabilityInput): CourtAvailability[] {
  const slots = daySlots(input.date, input.timeZone);
  return input.courts
    .filter((court) => court.active)
    .map((court) => ({
      court,
      slots: slots.map((slot) => ({
        slot,
        status: slotStatus(slot, court.id, input),
      })),
    }));
}
