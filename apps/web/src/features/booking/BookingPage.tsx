import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { formatHour12Short, formatVenueDate, venueHour } from '@canchas/core';
import {
  api,
  errorMessage,
  type Availability,
  type Court,
  type PublicConfig,
  type Slot,
} from '../../lib/api.ts';
import { dayText, formatMoney, todayInVenue, upcomingDays } from '../../lib/format.ts';
import {
  selectHour,
  selectionLabel,
  selectionTotalCents,
  type SlotSelection,
} from '../../lib/selection.ts';
import { useSession } from '../../lib/session.tsx';
import './booking.css';

const PENDING_KEY = 'pending-booking';

/** The four blocks of a 24 hour venue, used as board headers. */
const DAY_BANDS = ['madrugada', 'mañana', 'tarde', 'noche'];

/** Shape stored in sessionStorage when a guest selection is sent to login. */
interface PendingBooking {
  courtId: string;
  date: string;
  start: number;
  hours: number;
}

interface Notice {
  tone: 'ok' | 'info' | 'error';
  text: string;
  linkToReservations?: boolean;
}

function readPending(): PendingBooking | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) {
      sessionStorage.removeItem(PENDING_KEY);
      return null;
    }
    const entry = value as Partial<PendingBooking>;
    const valid =
      typeof entry.courtId === 'string' &&
      typeof entry.date === 'string' &&
      typeof entry.start === 'number' &&
      Number.isInteger(entry.start) &&
      entry.start >= 0 &&
      entry.start < 24 &&
      typeof entry.hours === 'number' &&
      Number.isInteger(entry.hours) &&
      entry.hours >= 1 &&
      entry.start + entry.hours <= 24;
    if (!valid) {
      sessionStorage.removeItem(PENDING_KEY);
      return null;
    }
    return { courtId: entry.courtId as string, date: entry.date as string, start: entry.start as number, hours: entry.hours as number };
  } catch {
    return null;
  }
}

function clearPending(): void {
  sessionStorage.removeItem(PENDING_KEY);
}

function SlotCell({
  court,
  slot,
  selection,
  onClick,
}: {
  court: Court;
  slot: Slot;
  selection: SlotSelection | null;
  onClick: (courtId: string, hour: number) => void;
}) {
  const isSelected =
    selection !== null &&
    selection.courtId === court.id &&
    slot.hour >= selection.start &&
    slot.hour < selection.start + selection.hours;

  if (slot.status === 'available') {
    return (
      <button
        type="button"
        className={isSelected ? 'slot slot--available slot--selected' : 'slot slot--available'}
        aria-pressed={isSelected}
        aria-label={`${court.name}, ${slot.label}, disponible`}
        data-court-id={court.id}
        onClick={() => onClick(court.id, slot.hour)}
      />
    );
  }

  const reason =
    slot.status === 'occupied' ? 'ocupada' : slot.status === 'closed' ? 'cerrada' : 'ya pasó';
  return (
    <button
      type="button"
      className={`slot slot--${slot.status}`}
      disabled
      aria-label={`${court.name}, ${slot.label}, ${reason}`}
      data-court-id={court.id}
    />
  );
}

export function BookingPage() {
  const { user, loading: sessionLoading } = useSession();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configStatus, setConfigStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SlotSelection | null>(null);
  const [pending, setPending] = useState<PendingBooking | null>(readPending);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const availRequest = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);

  function loadConfig(): void {
    setConfigStatus('loading');
    setConfigError(null);
    api
      .config()
      .then((loaded) => {
        setConfig(loaded);
        setSelectedDate(todayInVenue(loaded.venueTimeZone));
        setConfigStatus('ready');
      })
      .catch((error: unknown) => {
        setConfigError(errorMessage(error));
        setConfigStatus('error');
      });
  }

  function loadAvailability(date: string): void {
    const token = availRequest.current + 1;
    availRequest.current = token;
    setAvailLoading(true);
    setAvailError(null);
    api
      .availability(date)
      .then((loaded) => {
        if (token !== availRequest.current) return;
        setAvailability(loaded);
        setAvailLoading(false);
      })
      .catch((error: unknown) => {
        if (token !== availRequest.current) return;
        setAvailability(null);
        setAvailError(errorMessage(error));
        setAvailLoading(false);
      });
  }

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    loadAvailability(selectedDate);
  }, [selectedDate]);

  // A guest selection comes back from the login page: restore it when every
  // hour is still free, otherwise explain and drop it.
  useEffect(() => {
    if (sessionLoading || !availability || !pending) return;
    if (!user) return;
    if (selection) {
      setPending(null);
      clearPending();
      return;
    }
    if (availability.date !== pending.date) {
      setSelectedDate(pending.date);
      return;
    }
    const row = availability.courts.find((entry) => entry.court.id === pending.courtId);
    const stillFree =
      row !== undefined &&
      Array.from({ length: pending.hours }, (_, index) => pending.start + index).every(
        (hour) => row.slots.find((slot) => slot.hour === hour)?.status === 'available',
      );
    if (stillFree) {
      setSelection({ courtId: pending.courtId, start: pending.start, hours: pending.hours });
    } else {
      setNotice({
        tone: 'info',
        text: 'La selección que guardaste ya no está disponible. Elige otros horarios.',
      });
    }
    setPending(null);
    clearPending();
  }, [sessionLoading, user, availability, pending, selection]);

  function pickDate(date: string): void {
    if (date === selectedDate) return;
    setSelectedDate(date);
    setSelection(null);
    setPending(null);
    clearPending();
    setNotice(null);
  }

  function onSlotClick(courtId: string, hour: number): void {
    if (!availability) return;
    const row = availability.courts.find((entry) => entry.court.id === courtId);
    if (!row) return;
    const next = selectHour(
      selection,
      courtId,
      hour,
      (candidate) => row.slots.find((slot) => slot.hour === candidate)?.status === 'available',
    );
    setSelection(next);
    if (next === null) clearPending();
    setNotice(null);
  }

  function discardSelection(): void {
    setSelection(null);
    setPending(null);
    clearPending();
    setNotice(null);
  }

  function goToLogin(): void {
    if (!selection || !selectedDate) return;
    const entry: PendingBooking = {
      courtId: selection.courtId,
      date: selectedDate,
      start: selection.start,
      hours: selection.hours,
    };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(entry));
    setPending(entry);
    window.location.hash = '#/entrar';
  }

  async function confirmReservation(): Promise<void> {
    if (!selection || !selectedDate || !availability) return;
    setConfirming(true);
    setNotice(null);
    try {
      const result = await api.createReservation({
        courtId: selection.courtId,
        date: selectedDate,
        startHour: selection.start,
        hours: selection.hours,
      });
      setNotice({
        tone: 'ok',
        text: `Reserva confirmada: ${result.court.name}, ${selectionLabel(selection)}, total ${formatMoney(
          result.reservation.totalCents,
          availability.currency,
        )}.`,
        linkToReservations: true,
      });
      setPending(null);
      clearPending();
      setSelection(null);
      loadAvailability(selectedDate);
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setConfirming(false);
    }
  }

  // A 24 hour board is wider than a phone: start the view at the current hour,
  // so the client does not have to scroll through the whole night to find it.
  useEffect(() => {
    const scroller = boardRef.current;
    if (!scroller || !availability || scrolledFor.current === availability.date) {
      return;
    }
    scrolledFor.current = availability.date;
    const headerCell = scroller.querySelector<HTMLElement>('.board__hour');
    const courtCell = scroller.querySelector<HTMLElement>('.board__court');
    const cellWidth = headerCell?.getBoundingClientRect().width ?? 34;
    const stickyWidth = courtCell?.getBoundingClientRect().width ?? 112;
    const now = Date.now();
    const isToday = formatVenueDate(now, availability.timeZone) === availability.date;
    const hour = isToday ? venueHour(now, availability.timeZone) : 0;
    // Keep the sticky court column in place and show the current hour right after it.
    scroller.scrollLeft = Math.max(0, (hour - 1) * (cellWidth + 4.5) - stickyWidth);
  }, [availability]);

  const timeZone = config?.venueTimeZone ?? null;
  const currency = availability?.currency ?? config?.currency ?? 'HNL';
  const days = useMemo(
    () => (timeZone !== null ? upcomingDays(todayInVenue(timeZone), timeZone) : []),
    [timeZone],
  );
  const headerSlots = availability?.courts[0]?.slots ?? [];
  const selectedRow =
    selection && availability
      ? availability.courts.find((entry) => entry.court.id === selection.courtId) ?? null
      : null;

  return (
    <section className="stack">
      <div className="page-head">
        <h1 className="page-head__title">Horarios</h1>
        <p className="page-head__hint">
          Elige un día y toca las horas libres. Cada bloque es una hora de cancha.
        </p>
      </div>

      {notice && (
        <div
          className={`notice notice--${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          <p>
            {notice.text}
            {notice.linkToReservations && (
              <>
                {' '}
                <a href="#/mis-reservas">Ver mis reservas</a>.
              </>
            )}
          </p>
        </div>
      )}

      {configStatus === 'loading' && <p className="muted">Cargando horarios…</p>}

      {configStatus === 'error' && (
        <div className="notice notice--error" role="alert">
          <p>{configError}</p>
          <button type="button" className="btn btn--ghost" onClick={loadConfig}>
            Reintentar
          </button>
        </div>
      )}

      {configStatus === 'ready' && timeZone !== null && (
        <Fragment>
          {availability !== null && availability.courts.length > 0 && (
            <dl className="facts">
              <div className="facts__item">
                <dt className="facts__label">Canchas</dt>
                <dd className="facts__value">{availability.courts.length}</dd>
              </div>
              <div className="facts__item">
                <dt className="facts__label">Cada turno</dt>
                <dd className="facts__value">1 hora</dd>
              </div>
              <div className="facts__item">
                <dt className="facts__label">Desde</dt>
                <dd className="facts__value">
                  {formatMoney(
                    Math.min(...availability.courts.map((entry) => entry.court.pricePerHourCents)),
                    currency,
                  )}{' '}
                  por hora
                </dd>
              </div>
              <div className="facts__item">
                <dt className="facts__label">Pago</dt>
                <dd className="facts__value">en efectivo al llegar</dd>
              </div>
              <div className="facts__item">
                <dt className="facts__label">Cancelación</dt>
                <dd className="facts__value">
                  gratis hasta {config?.cancelWindowHours ?? 3} h antes
                </dd>
              </div>
            </dl>
          )}

          <div className="date-strip" role="group" aria-label="Elegir el día de la reserva">
            {days.map((day) => (
              <button
                key={day.date}
                type="button"
                className="date-chip"
                aria-pressed={day.date === selectedDate}
                onClick={() => pickDate(day.date)}
              >
                <span>{day.weekday}</span>
                <strong>{day.day}</strong>
                {day.relative !== null && (
                  <span className="date-chip__relative">{day.relative}</span>
                )}
              </button>
            ))}
            <label className="date-picker">
              <span className="field__label">Otra fecha</span>
              <input
                type="date"
                className="input"
                value={selectedDate ?? ''}
                min={days[0]?.date}
                onChange={(event) => {
                  if (event.target.value !== '') pickDate(event.target.value);
                }}
              />
            </label>
          </div>

          {availLoading && <p className="muted">Cargando horarios…</p>}

          {!availLoading && availError !== null && (
            <div className="notice notice--error" role="alert">
              <p>{availError}</p>
              {selectedDate !== null && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => loadAvailability(selectedDate)}
                >
                  Reintentar
                </button>
              )}
            </div>
          )}

          {!availLoading &&
            availError === null &&
            availability !== null &&
            availability.courts.length === 0 && (
              <div className="empty">
                No hay canchas publicadas para esta fecha. Vuelve a consultar más tarde.
              </div>
            )}

          {!availLoading &&
            availError === null &&
            availability !== null &&
            availability.courts.length > 0 && (
              <div className="board">
                <div className="board__scroll" ref={boardRef}>
                  <div
                    className="board__grid"
                    role="group"
                    aria-label={
                      selectedDate !== null
                        ? `Disponibilidad del ${dayText(selectedDate, timeZone)} por cancha y hora`
                        : 'Disponibilidad por cancha y hora'
                    }
                  >
                    <div className="board__row">
                      <div className="board__court">
                        <span className="sr-only">Hora</span>
                      </div>
                      {DAY_BANDS.map((band) => (
                        <div key={band} className="board__band">
                          {band}
                        </div>
                      ))}
                    </div>
                    <div className="board__row">
                      <div className="board__court" aria-hidden="true" />
                      {headerSlots.map((slot) => (
                        <div key={slot.hour} className="board__hour" title={slot.label}>
                          {formatHour12Short(slot.hour)}
                        </div>
                      ))}
                    </div>
                    {availability.courts.map(({ court, slots }) => (
                      <div key={court.id} className="board__row" data-court-id={court.id}>
                        <div className="board__court">
                          {court.name}
                          <small>{formatMoney(court.pricePerHourCents, currency)} / hora</small>
                        </div>
                        {slots.map((slot) => (
                          <SlotCell
                            key={slot.hour}
                            court={court}
                            slot={slot}
                            selection={selection}
                            onClick={onSlotClick}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <ul className="board__legend">
                  <li>
                    <span className="legend__swatch legend__swatch--available" aria-hidden="true" />
                    libre
                  </li>
                  <li>
                    <span className="legend__swatch legend__swatch--selected" aria-hidden="true" />
                    tu selección
                  </li>
                  <li>
                    <span className="legend__swatch legend__swatch--occupied" aria-hidden="true" />
                    ocupada
                  </li>
                  <li>
                    <span className="legend__swatch legend__swatch--closed" aria-hidden="true" />
                    cerrada
                  </li>
                  <li>
                    <span className="legend__swatch legend__swatch--past" aria-hidden="true" />
                    hora pasada
                  </li>
                </ul>
              </div>
            )}

          {selectedRow !== null && selection !== null && (
            <div className="selection-bar">
              <div className="selection-bar__summary">
                <strong>{selectedRow.court.name}</strong>
                <span className="muted">
                  {' · '}
                  {selectionLabel(selection)}
                  {' · '}
                  {selection.hours === 1 ? '1 hora' : `${selection.hours} horas`}
                </span>
              </div>
              <span className="selection-bar__price">
                {formatMoney(selectionTotalCents(selection, selectedRow.court.pricePerHourCents), currency)}
              </span>
              <div className="row">
                <button type="button" className="btn btn--ghost" onClick={discardSelection}>
                  Descartar
                </button>
                {user ? (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void confirmReservation()}
                    disabled={confirming}
                  >
                    {confirming ? 'Confirmando…' : 'Confirmar reserva'}
                  </button>
                ) : (
                  <button type="button" className="btn btn--primary" onClick={goToLogin}>
                    Entrar para reservar
                  </button>
                )}
              </div>
            </div>
          )}
          <section className="steps" aria-labelledby="how-it-works">
            <h2 id="how-it-works" className="panel__title">
              Cómo funciona
            </h2>
            <ol className="steps__list">
              <li className="steps__item">
                <span className="steps__number" aria-hidden="true">
                  1
                </span>
                <span className="steps__title">Elige la cancha y la hora</span>
                <p className="steps__text">
                  El tablero muestra las horas libres de cada cancha. Toca una hora y, si quieres
                  más, toca la siguiente.
                </p>
              </li>
              <li className="steps__item">
                <span className="steps__number" aria-hidden="true">
                  2
                </span>
                <span className="steps__title">Confirma con tu cuenta</span>
                <p className="steps__text">
                  Ver horarios es libre. Solo necesitas una cuenta para reservar, con tu nombre y
                  tu teléfono.
                </p>
              </li>
              <li className="steps__item">
                <span className="steps__number" aria-hidden="true">
                  3
                </span>
                <span className="steps__title">Paga en efectivo al llegar</span>
                <p className="steps__text">
                  No se cobra nada en línea. Si no puedes venir, cancela hasta{' '}
                  {config?.cancelWindowHours ?? 3} horas antes y no queda registrado nada.
                </p>
              </li>
            </ol>
          </section>
        </Fragment>
      )}
    </section>
  );
}
