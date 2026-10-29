import { useEffect, useState } from 'react';
import {
  api,
  errorMessage,
  type Availability,
  type AvailabilityCourt,
  type PublicConfig,
} from '../../lib/api.ts';
import { lowestPriceCents, nextFreeHours } from '../../lib/availability.ts';
import { dayText, formatMoney, todayInVenue } from '../../lib/format.ts';
import { formatHour12 } from '@canchas/core';
import './landing.css';

type Status = 'loading' | 'ready' | 'error';

/**
 * The door, not the room: the landing shows the live free hours of today and one
 * single action. The board itself lives on #/reservar.
 */
export function LandingPage() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  function load(): void {
    setStatus('loading');
    setError(null);
    api
      .config()
      .then((loaded) => {
        const today = todayInVenue(loaded.venueTimeZone);
        setConfig(loaded);
        setDate(today);
        return api.availability(today).then((loadedAvailability) => {
          setAvailability(loadedAvailability);
          setStatus('ready');
        });
      })
      .catch((cause: unknown) => {
        setAvailability(null);
        setError(errorMessage(cause));
        setStatus('error');
      });
  }

  useEffect(() => {
    load();
  }, []);

  const timeZone = config?.venueTimeZone ?? null;
  const currency = config?.currency ?? availability?.currency ?? 'HNL';
  const courts: AvailabilityCourt[] = availability?.courts ?? [];
  const free = nextFreeHours(courts, 4);
  const cancelHours = config?.cancelWindowHours ?? 3;

  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__intro">
          <p className="hero__eyebrow">
            {date !== null && timeZone !== null
              ? `Hoy · ${dayText(date, timeZone)}`
              : 'Hoy'}
          </p>
          <h1 className="hero__title" id="hero-title">
            Reserva tu cancha sin llamar a nadie
          </h1>
          <p className="hero__lead">
            Mira qué horas están libres hoy y en los próximos días. Eliges la cancha, eliges la
            hora y quedas dentro.
          </p>
          <div className="hero__actions">
            <a className="btn btn--primary btn--hero" href="#/reservar">
              Reservar ahora
            </a>
            <p className="hero__note">
              Ver horarios es gratis. Solo necesitas una cuenta para reservar.
            </p>
          </div>
        </div>

        <section className="hero__card" aria-labelledby="hero-card-title">
          <h2 className="hero__card-title" id="hero-card-title">
            Horas libres hoy
          </h2>
          <div className="hero__card-body" aria-live="polite">
            {status === 'loading' && <p className="muted">Buscando las horas libres de hoy…</p>}

            {status === 'error' && (
              <div className="notice notice--error" role="alert">
                <p>{error}</p>
                <button type="button" className="btn btn--ghost btn--small" onClick={load}>
                  Reintentar
                </button>
              </div>
            )}

            {status === 'ready' && free.length > 0 && (
              <>
                <ul className="hero__hours">
                  {free.map((hour) => (
                    <li className="hero__hour" key={hour.hour}>
                      {formatHour12(hour.hour)}
                      <small>{hour.courtName}</small>
                    </li>
                  ))}
                </ul>
                {courts.length > 0 && (
                  <p className="hero__price">
                    Desde {formatMoney(lowestPriceCents(courts), currency)} por hora
                  </p>
                )}
              </>
            )}

            {status === 'ready' && free.length === 0 && (
              <>
                <p>Hoy ya no quedan horas libres.</p>
                <a href="#/reservar">Ver los próximos días</a>
              </>
            )}
          </div>
        </section>
      </section>

      {status === 'ready' && courts.length > 0 && (
        <dl className="facts">
          <div className="facts__item">
            <dt className="facts__label">Canchas</dt>
            <dd className="facts__value">{courts.length}</dd>
          </div>
          <div className="facts__item">
            <dt className="facts__label">Horario</dt>
            <dd className="facts__value">24 horas</dd>
          </div>
          <div className="facts__item">
            <dt className="facts__label">Cancelación</dt>
            <dd className="facts__value">Gratis hasta {cancelHours} horas antes</dd>
          </div>
          <div className="facts__item">
            <dt className="facts__label">Pago</dt>
            <dd className="facts__value">En efectivo al llegar</dd>
          </div>
        </dl>
      )}

      <section className="landing__steps" aria-labelledby="landing-steps-title">
        <h2 className="panel__title" id="landing-steps-title">
          Así de simple
        </h2>
        <ol className="steps__list">
          <li className="steps__item">
            <span className="steps__number" aria-hidden="true">
              1
            </span>
            <span className="steps__title">Mira las horas libres</span>
            <p className="steps__text">
              El tablero muestra cada cancha por hora, para hoy y para los próximos días.
            </p>
          </li>
          <li className="steps__item">
            <span className="steps__number" aria-hidden="true">
              2
            </span>
            <span className="steps__title">Elige y confirma</span>
            <p className="steps__text">
              Toca una hora o varias seguidas, crea tu cuenta con el teléfono y quedas dentro.
            </p>
          </li>
          <li className="steps__item">
            <span className="steps__number" aria-hidden="true">
              3
            </span>
            <span className="steps__title">Llega y paga en efectivo</span>
            <p className="steps__text">
              No se cobra nada en línea. Si no puedes venir, cancela hasta {cancelHours} horas
              antes.
            </p>
          </li>
        </ol>
        <div className="landing__closing">
          <p className="muted">Las canchas de hoy se llenan primero.</p>
          <a className="btn btn--primary btn--hero" href="#/reservar">
            Elegir horario
          </a>
        </div>
      </section>
    </div>
  );
}
