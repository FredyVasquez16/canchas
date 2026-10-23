/** Milliseconds in one hour. */
export const HOUR_MS = 3_600_000;

/** Calendar date in the venue time zone, formatted as `YYYY-MM-DD`. */
export type VenueDate = string;

export type CourtId = string;

export interface Court {
  id: CourtId;
  name: string;
  /** Price for one hour, in the currency minor unit (centavos). */
  pricePerHourCents: number;
  active: boolean;
}

export type ReservationStatus = 'booked' | 'cancelled';

export interface CourtReservation {
  id: string;
  courtId: CourtId;
  /** Inclusive start instant, epoch milliseconds. */
  startAt: number;
  /** Exclusive end instant, epoch milliseconds. */
  endAt: number;
  status: ReservationStatus;
}

export interface Closure {
  id: string;
  /** `null` closes every court; a court id closes only that court. */
  courtId: CourtId | null;
  startAt: number;
  endAt: number;
}

export interface Slot {
  date: VenueDate;
  hour: number;
  startAt: number;
  endAt: number;
  label: string;
}

export type SlotStatus = 'available' | 'occupied' | 'closed' | 'past';

export interface DaySlotAvailability {
  slot: Slot;
  status: SlotStatus;
}

export interface CourtAvailability {
  court: Court;
  slots: DaySlotAvailability[];
}
