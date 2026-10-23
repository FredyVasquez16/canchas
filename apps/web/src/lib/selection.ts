export interface SlotSelection {
  courtId: string;
  /** First booked hour, 0-23. */
  start: number;
  /** Consecutive hours in the selection. */
  hours: number;
}

/**
 * Cinema style selection: the first click picks one hour, later clicks on the same
 * court extend the range. A range only grows across free hours, so a gap can never
 * produce an invalid reservation.
 */
export function selectHour(
  current: SlotSelection | null,
  courtId: string,
  hour: number,
  isAvailable: (hour: number) => boolean,
): SlotSelection | null {
  if (!current || current.courtId !== courtId) {
    return { courtId, start: hour, hours: 1 };
  }

  if (current.hours === 1 && current.start === hour) {
    return null;
  }

  const currentEnd = current.start + current.hours - 1;
  const from = Math.min(current.start, hour);
  const to = Math.max(currentEnd, hour);

  for (let candidate = from; candidate <= to; candidate += 1) {
    if (!isAvailable(candidate)) {
      return { courtId, start: hour, hours: 1 };
    }
  }

  return { courtId, start: from, hours: to - from + 1 };
}

export function selectionHours(selection: SlotSelection): number[] {
  return Array.from({ length: selection.hours }, (_, index) => selection.start + index);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function selectionLabel(selection: SlotSelection): string {
  const start = selection.start % 24;
  const end = (selection.start + selection.hours) % 24;
  return `${pad(start)}:00 - ${pad(end)}:00`;
}

export function selectionTotalCents(
  selection: SlotSelection,
  pricePerHourCents: number,
): number {
  return selection.hours * pricePerHourCents;
}
