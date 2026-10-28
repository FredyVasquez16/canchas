import { useCallback, useEffect, useState } from 'react';
import { addDays } from '@canchas/core';
import { api, errorMessage, type PublicConfig, type StatsResponse } from '../../lib/api.ts';
import { formatMoney, percent, todayInVenue } from '../../lib/format.ts';
import { Section } from './Section.tsx';
import { CourtChart, DailyChart, HourChart } from './charts.tsx';

const RANGES = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
] as const;

export function StatsTab({ config }: { config: PublicConfig }) {
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const to = todayInVenue(config.venueTimeZone);
    const from = addDays(to, -(days - 1));
    try {
      setStats(await api.stats(from, to));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [days, config.venueTimeZone]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = stats?.totals;
  const pendingCents = totals ? Math.max(0, totals.expectedCents - totals.collectedCents) : 0;

  return (
    <div className="stack">
      <div className="row">
        <span className="segmented" role="group" aria-label="Período de las estadísticas">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              className="segmented__btn"
              aria-pressed={days === range.days}
              onClick={() => setDays(range.days)}
            >
              {range.label}
            </button>
          ))}
        </span>
        {stats !== null && (
          <span className="hint">
            del {stats.from} al {stats.to}
          </span>
        )}
      </div>

      {error && (
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {totals && (
        <section className="kpis" aria-label="Indicadores del período">
          <article className="kpi">
            <span className="kpi__label">Reservas</span>
            <strong className="kpi__value">{totals.reservations}</strong>
            <span className="kpi__hint">
              {totals.cancelled} canceladas · {totals.bookedHours} horas vendidas
            </span>
          </article>
          <article className="kpi">
            <span className="kpi__label">Ocupación del complejo</span>
            <strong className="kpi__value">{percent(totals.occupancyRate)}</strong>
            <span className="kpi__hint">
              {totals.bookedHours} de {Math.round(totals.capacityHours)} horas disponibles
            </span>
          </article>
          <article className="kpi">
            <span className="kpi__label">Cobrado en efectivo</span>
            <strong className="kpi__value">
              {formatMoney(totals.collectedCents, config.currency)}
            </strong>
            <span className="kpi__hint">{formatMoney(pendingCents, config.currency)} por cobrar</span>
          </article>
          <article className="kpi">
            <span className="kpi__label">Faltas registradas</span>
            <strong className="kpi__value">{totals.noShows + totals.lateCancels}</strong>
            <span className="kpi__hint">
              {totals.noShows} no llegaron · {totals.lateCancels} cancelaron tarde
            </span>
          </article>
          <article className="kpi">
            <span className="kpi__label">Clientes</span>
            <strong className="kpi__value">{totals.clients}</strong>
            <span className="kpi__hint">{totals.newClients} cuentas nuevas</span>
          </article>
        </section>
      )}

      {stats !== null && stats.daily.length > 0 && (
        <Section title="Reservas por día" hint="Cada barra es un día del período.">
          <DailyChart
            points={stats.daily}
            timeZone={stats.timeZone}
            currency={config.currency}
          />
        </Section>
      )}

      {stats !== null && (
        <Section title="Demanda por hora" hint="A qué horas se vende más la cancha.">
          <HourChart points={stats.byHour} />
        </Section>
      )}

      {stats !== null && (
        <Section title="Cancha más reservada" hint="Ranking de reservas por cancha en el período.">
          <CourtChart courts={stats.byCourt} />
        </Section>
      )}

      {stats !== null && (
        <Section title="Clientes con más reservas" hint="En el período elegido.">
          {stats.topClients.length === 0 ? (
            <p className="empty">Todavía no hay reservas en este período.</p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Teléfono</th>
                    <th>Reservas</th>
                    <th>Faltas</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topClients.map((client) => (
                    <tr key={client.id}>
                      <td>{client.name}</td>
                      <td>{client.phone}</td>
                      <td className="num">{client.reservations}</td>
                      <td className="num">{client.failures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {stats === null && error === null && <p className="muted">Calculando estadísticas…</p>}
    </div>
  );
}
