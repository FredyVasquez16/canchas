/*
 * Dependency-free charts for the statistics tab: plain markup, a CSS grid and the
 * existing turf/amber palette. No canvas, no chart library, no SVG.
 *
 * Every chart states its data in words (aria-label, title, a sentence) so colour is
 * never the only signal, and the bars keep a visible floor so a zero day reads as an
 * empty column instead of a missing one.
 */

import { useState, type CSSProperties } from 'react';
import { formatHour12, formatHour12Short } from '@canchas/core';
import type { StatsResponse } from '../../lib/api.ts';
import { formatMoney, percent, shortDate } from '../../lib/format.ts';

type DailyPoint = StatsResponse['daily'][number];
type HourPoint = StatsResponse['byHour'][number];
type CourtPoint = StatsResponse['byCourt'][number];

const METRICS = [
  { id: 'reservations', label: 'Reservas' },
  { id: 'bookedHours', label: 'Horas vendidas' },
  { id: 'collectedCents', label: 'Cobrado' },
] as const;

type MetricId = (typeof METRICS)[number]['id'];

/** Hours that carry an axis tick: every three hours plus the last one. */
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 23] as const;

function dailyValue(point: DailyPoint, metric: MetricId): number {
  switch (metric) {
    case 'reservations':
      return point.reservations;
    case 'bookedHours':
      return point.bookedHours;
    default:
      return point.collectedCents;
  }
}

function dailyText(value: number, metric: MetricId, currency: string): string {
  switch (metric) {
    case 'collectedCents':
      return formatMoney(value, currency);
    case 'bookedHours':
      return value === 1 ? '1 hora vendida' : `${value} horas vendidas`;
    default:
      return reservationsText(value);
  }
}

function reservationsText(count: number): string {
  return count === 1 ? '1 reserva' : `${count} reservas`;
}

function gridColumns(count: number): CSSProperties {
  return { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` };
}

/** Ticks sit on their own column; the first and the last stay inside the chart. */
function tickClass(index: number, count: number): string {
  if (index === 0) {
    return 'chart__tick chart__tick--start';
  }
  if (index === count - 1) {
    return 'chart__tick chart__tick--end';
  }
  return 'chart__tick';
}

/** Five or seven evenly spaced labels, always including both ends. */
function tickIndexes(count: number): number[] {
  if (count === 0) {
    return [];
  }
  const wanted = count <= 8 ? count : count <= 31 ? 5 : 7;
  if (count <= wanted) {
    return Array.from({ length: count }, (_, index) => index);
  }
  const ticks = new Set<number>();
  for (let step = 0; step < wanted; step += 1) {
    ticks.add(Math.round((step * (count - 1)) / (wanted - 1)));
  }
  return [...ticks].sort((left, right) => left - right);
}

function joinList(items: string[]): string {
  const [first] = items;
  if (first === undefined) {
    return '';
  }
  if (items.length === 1) {
    return first;
  }
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]!}`;
}

/** Three inner gridlines plus the top one, drawn behind the bars on the value scale. */
function Gridlines() {
  return (
    <>
      {[0, 25, 50, 75].map((fromTop) => (
        <span
          key={fromTop}
          className={fromTop === 0 ? 'chart__gridline chart__gridline--top' : 'chart__gridline'}
          style={{ top: `${fromTop}%` }}
          aria-hidden="true"
        />
      ))}
      <span className="chart__baseline" aria-hidden="true" />
    </>
  );
}

export function DailyChart({
  points,
  timeZone,
  currency,
}: {
  points: DailyPoint[];
  timeZone: string;
  currency: string;
}) {
  const [metric, setMetric] = useState<MetricId>('reservations');
  const metricLabel = METRICS.find((entry) => entry.id === metric)?.label ?? 'Reservas';

  if (points.length === 0) {
    return <p className="empty">Todavía no hay días en este período.</p>;
  }

  const values = points.map((point) => dailyValue(point, metric));
  const max = values.reduce((highest, value) => Math.max(highest, value), 0);
  const scale = max > 0 ? max : 1;
  const busiest = points.reduce<DailyPoint>(
    (best, point) => (dailyValue(point, metric) > dailyValue(best, metric) ? point : best),
    points[0]!,
  );
  const columns = gridColumns(points.length);
  const summary = `${metricLabel} por día: ${points.length} días en el período, máximo ${dailyText(
    max,
    metric,
    currency,
  )} el ${shortDate(busiest.date, timeZone)}.`;

  return (
    <div className="chart">
      <div className="chart__head">
        <div className="segmented" role="group" aria-label="Métrica del gráfico por día">
          {METRICS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="segmented__btn"
              aria-pressed={metric === entry.id}
              onClick={() => setMetric(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <span className="chart__max">Máximo {dailyText(max, metric, currency)}</span>
      </div>

      <div
        className={points.length > 45 ? 'chart__plot chart__plot--dense' : 'chart__plot'}
        style={columns}
        role="img"
        aria-label={summary}
      >
        <Gridlines />
        {points.map((point, index) => {
          const value = values[index] ?? 0;
          return (
            <div
              key={point.date}
              className="chart__col"
              title={`${shortDate(point.date, timeZone)}: ${dailyText(value, metric, currency)}`}
            >
              {value > 0 ? (
                <div className="chart__bar" style={{ height: `${(value / scale) * 100}%` }} />
              ) : (
                <div className="chart__bar chart__bar--zero" />
              )}
            </div>
          );
        })}
      </div>

      <div className="chart__axis" style={columns} aria-hidden="true">
        {tickIndexes(points.length).map((index) => (
          <span
            key={index}
            className={tickClass(index, points.length)}
            style={{ gridColumn: index + 1 }}
          >
            {shortDate(points[index]!.date, timeZone)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HourChart({ points }: { points: HourPoint[] }) {
  const hours = Array.from(
    { length: 24 },
    (_, hour): HourPoint => points.find((point) => point.hour === hour) ?? { hour, reservations: 0 },
  );
  const max = hours.reduce((highest, point) => Math.max(highest, point.reservations), 0);
  const scale = max > 0 ? max : 1;
  const busiest = hours.reduce<HourPoint>(
    (best, point) => (point.reservations > best.reservations ? point : best),
    hours[0]!,
  );
  const topThree = [...hours]
    .filter((point) => point.reservations > 0)
    .sort((left, right) => right.reservations - left.reservations)
    .slice(0, 3);
  const peaks = new Set(topThree.map((point) => point.hour));
  const columns = gridColumns(hours.length);
  const summary =
    max === 0
      ? 'Reservas por hora: ninguna reserva en el período.'
      : `Reservas por hora: el máximo es ${reservationsText(max)} a las ${formatHour12(busiest.hour)}.`;

  return (
    <div className="chart chart--hours">
      <div className="chart__plot" style={columns} role="img" aria-label={summary}>
        <Gridlines />
        {hours.map((point) => (
          <div
            key={point.hour}
            className="chart__col"
            title={`${formatHour12(point.hour)}: ${reservationsText(point.reservations)}`}
          >
            {point.reservations > 0 ? (
              <div
                className={peaks.has(point.hour) ? 'chart__bar chart__bar--peak' : 'chart__bar'}
                style={{ height: `${(point.reservations / scale) * 100}%` }}
              />
            ) : (
              <div className="chart__bar chart__bar--zero" />
            )}
          </div>
        ))}
      </div>

      <div className="chart__axis" style={columns} aria-hidden="true">
        {HOUR_TICKS.map((hour) => (
          <span key={hour} className={tickClass(hour, hours.length)} style={{ gridColumn: hour + 1 }}>
            {formatHour12Short(hour)}
          </span>
        ))}
      </div>

      {topThree.length > 0 && (
        <p className="chart__note">
          Las horas con más reservas fueron{' '}
          {joinList(
            topThree.map(
              (point) => `${formatHour12(point.hour)} (${reservationsText(point.reservations)})`,
            ),
          )}
          .
        </p>
      )}
    </div>
  );
}

export function CourtChart({ courts }: { courts: CourtPoint[] }) {
  const total = courts.reduce((sum, court) => sum + court.reservations, 0);
  if (courts.length === 0 || total === 0) {
    return <p className="empty">Todavía no hay reservas en este período.</p>;
  }

  const top = courts.reduce<CourtPoint>(
    (best, court) => (court.reservations > best.reservations ? court : best),
    courts[0]!,
  );
  const summary = `Reservas por cancha: ${courts
    .map((court) => `${court.courtName} ${reservationsText(court.reservations)}`)
    .join(', ')}.`;

  return (
    <div className="chart chart--courts">
      <p className="chart__note">
        {top.courtName} concentra el {percent(top.share)} de las reservas del período.
      </p>
      <ul className="courtbars" aria-label={summary}>
        {courts.map((court) => {
          const isTop = court.courtId === top.courtId;
          return (
            <li key={court.courtId} className={isTop ? 'courtrow courtrow--top' : 'courtrow'}>
              <div className="courtrow__head">
                <span className="courtrow__name" title={court.courtName}>
                  {court.courtName}
                </span>
                {isTop && <span className="tag tag--ok">Más reservada</span>}
                <span className="courtrow__count">{reservationsText(court.reservations)}</span>
                <span className="courtrow__share">{percent(court.share)}</span>
              </div>
              <div className="courtrow__track">
                {court.reservations > 0 ? (
                  <div
                    className="courtrow__fill"
                    style={{ width: `${court.share * 100}%` }}
                  />
                ) : (
                  <div className="courtrow__fill courtrow__fill--zero" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
