import { Fragment, useEffect, useState } from 'react';
import { formatVenueDate } from '@canchas/core';
import {
  api,
  errorMessage,
  type Court,
  type PublicConfig,
  type Reservation,
} from '../../lib/api.ts';
import { dayText, formatMoney, rangeText } from '../../lib/format.ts';
import { useSession } from '../../lib/session.tsx';

interface Notice {
  tone: 'ok' | 'info' | 'error';
  text: string;
}

function hoursPhrase(hours: number): string {
  return hours === 1 ? '1 hora' : `${hours} horas`;
}

export function MinePage() {
  const { user, loading: sessionLoading } = useSession();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function load(): void {
    setStatus('loading');
    setLoadError(null);
    Promise.all([api.myReservations(), api.courts(), api.config()])
      .then(([mine, courtList, venueConfig]) => {
        setReservations(mine.reservations);
        setCourts(courtList.courts);
        setConfig(venueConfig);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        setLoadError(errorMessage(error));
        setStatus('error');
      });
  }

  useEffect(() => {
    if (!user) return;
    setNotice(null);
    setConfirmId(null);
    load();
  }, [user]);

  async function cancelReservation(reservation: Reservation): Promise<void> {
    setBusyId(reservation.id);
    setNotice(null);
    try {
      const result = await api.cancelReservation(reservation.id);
      setConfirmId(null);
      setNotice(
        result.marked
          ? {
              tone: 'info',
              text: 'Tu cancelación quedó registrada como marca de inasistencia. Una marca no es una penalización.',
            }
          : { tone: 'ok', text: 'Cancelamos tu reserva. No tuvo ninguna consecuencia.' },
      );
      load();
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
      setConfirmId(null);
    } finally {
      setBusyId(null);
    }
  }

  if (sessionLoading) {
    return (
      <section className="stack">
        <div className="page-head">
          <h1 className="page-head__title">Mis reservas</h1>
        </div>
        <p className="muted">Cargando…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="stack">
        <div className="page-head">
          <h1 className="page-head__title">Mis reservas</h1>
        </div>
        <p className="muted">
          Entra a tu cuenta para ver tus reservas. <a href="#/entrar">Entrar</a>
        </p>
      </section>
    );
  }

  const timeZone = config?.venueTimeZone ?? null;
  const currency = config?.currency ?? 'HNL';
  const cancelWindowHours = config?.cancelWindowHours ?? 3;
  const cancelRule = `Puedes cancelar sin consecuencia hasta ${hoursPhrase(
    cancelWindowHours,
  )} antes de la hora reservada. Si cancelas más tarde, la reserva queda con una marca de inasistencia que el complejo revisará.`;
  const courtName = (courtId: string): string =>
    courts.find((court) => court.id === courtId)?.name ?? courtId;

  const upcoming = reservations
    .filter((reservation) => reservation.status === 'booked' && reservation.endAt > Date.now())
    .sort((a, b) => b.startAt - a.startAt);

  return (
    <section className="stack">
      <div className="page-head">
        <h1 className="page-head__title">Mis reservas</h1>
        <p className="page-head__hint">Cancela desde aquí si no puedes asistir.</p>
      </div>

      {notice && (
        <div
          className={`notice notice--${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          <p>{notice.text}</p>
        </div>
      )}

      {status === 'loading' && <p className="muted">Cargando tus reservas…</p>}

      {status === 'error' && (
        <div className="notice notice--error" role="alert">
          <p>{loadError}</p>
          <button type="button" className="btn btn--ghost" onClick={load}>
            Reintentar
          </button>
        </div>
      )}

      {status === 'ready' &&
        (upcoming.length === 0 ? (
          <div className="empty">
            No tienes reservas próximas. Mira los <a href="#/reservar">horarios disponibles</a> y reserva
            cuando quieras.
          </div>
        ) : (
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Cancha</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Horario</th>
                  <th scope="col">Horas</th>
                  <th scope="col">Total</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((reservation) => (
                  <Fragment key={reservation.id}>
                    <tr>
                      <td>{courtName(reservation.courtId)}</td>
                      <td>
                        {timeZone !== null
                          ? dayText(formatVenueDate(reservation.startAt, timeZone), timeZone)
                          : ''}
                      </td>
                      <td>
                        {timeZone !== null
                          ? rangeText(reservation.startAt, reservation.endAt, timeZone)
                          : ''}
                      </td>
                      <td className="num">{reservation.hours}</td>
                      <td className="num">{formatMoney(reservation.totalCents, currency)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--danger btn--small"
                          onClick={() => setConfirmId(reservation.id)}
                          disabled={busyId !== null}
                        >
                          Cancelar
                        </button>
                      </td>
                    </tr>
                    {confirmId === reservation.id && (
                      <tr>
                        <td colSpan={6}>
                          <p className="hint">¿Cancelar esta reserva? {cancelRule}</p>
                          <div className="row">
                            <button
                              type="button"
                              className="btn btn--danger btn--small"
                              onClick={() => void cancelReservation(reservation)}
                              disabled={busyId === reservation.id}
                            >
                              {busyId === reservation.id ? 'Cancelando…' : 'Sí, cancelar'}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--small"
                              onClick={() => setConfirmId(null)}
                            >
                              Volver
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
