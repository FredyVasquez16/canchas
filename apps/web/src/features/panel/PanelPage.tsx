import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { formatVenueDate } from '@canchas/core';
import {
  api,
  errorMessage,
  type Agenda,
  type ClientRow,
  type Closure,
  type Court,
  type PublicConfig,
} from '../../lib/api.ts';
import { dayText, formatMoney, monthKey, rangeText, todayInVenue } from '../../lib/format.ts';
import { useSession } from '../../lib/session.tsx';
import './panel.css';

type TabId = 'agenda' | 'cierres' | 'canchas' | 'clientes';

const TABS: Array<{ id: TabId; label: string; adminOnly: boolean }> = [
  { id: 'agenda', label: 'Día de hoy', adminOnly: false },
  { id: 'cierres', label: 'Cierres', adminOnly: false },
  { id: 'canchas', label: 'Canchas y precios', adminOnly: true },
  { id: 'clientes', label: 'Clientes', adminOnly: true },
];

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function inputToCents(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{title}</h2>
        {hint && <span className="hint">{hint}</span>}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}

function FailureTag({ entry }: { entry: Agenda['reservations'][number] }) {
  if (entry.arrivedAt !== null) {
    return <span className="tag tag--ok">asistió</span>;
  }
  if (entry.failureMarkedAt !== null) {
    const label =
      entry.failureReason === 'late_cancel'
        ? 'falta: canceló tarde'
        : entry.failureReason === 'no_show'
          ? 'falta: no llegó'
          : 'falta';
    return <span className="tag tag--warn">{label}</span>;
  }
  if (entry.status === 'cancelled') {
    return <span className="tag tag--muted">cancelada</span>;
  }
  return <span className="tag">pendiente de cobro</span>;
}

function AgendaTab({ config }: { config: PublicConfig }) {
  const [date, setDate] = useState(() => todayInVenue(config.venueTimeZone));
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAgenda(await api.agenda(date));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: () => Promise<unknown>): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <label className="field__label" htmlFor="agenda-date">
          Día
        </label>
        <input
          id="agenda-date"
          className="input"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        {agenda && <span className="muted">{dayText(date, config.venueTimeZone)}</span>}
      </div>

      {error && (
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
        </div>
      )}

      <Section
        title="Reservas del día"
        hint="Marca la llegada cuando el cliente paga en efectivo."
      >
        {agenda === null && <p className="muted">Cargando reservas…</p>}
        {agenda !== null && agenda.reservations.length === 0 && (
          <p className="empty">No hay reservas para este día.</p>
        )}
        {agenda !== null && agenda.reservations.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Cancha</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {agenda.reservations.map((entry) => (
                  <tr key={entry.id}>
                    <td className="num">
                      {rangeText(entry.startAt, entry.endAt, config.venueTimeZone)}
                      <small className="muted"> · {entry.hours} h</small>
                    </td>
                    <td>{entry.courtName}</td>
                    <td>
                      {entry.client.name}
                      <small className="muted"> · {entry.client.phone}</small>
                    </td>
                    <td className="num">{formatMoney(entry.totalCents, config.currency)}</td>
                    <td>
                      <FailureTag entry={entry} />
                    </td>
                    <td>
                      <div className="agenda-actions">
                        <button
                          type="button"
                          className="btn btn--small btn--primary"
                          disabled={
                            busyId === entry.id ||
                            entry.arrivedAt !== null ||
                            entry.status === 'cancelled'
                          }
                          onClick={() => void act(entry.id, () => api.markArrived(entry.id))}
                        >
                          Llegó
                        </button>
                        <button
                          type="button"
                          className="btn btn--small"
                          disabled={busyId === entry.id || entry.status === 'cancelled'}
                          onClick={() => void act(entry.id, () => api.markFailure(entry.id, 'no_show'))}
                        >
                          Falta
                        </button>
                        {entry.failureMarkedAt !== null && (
                          <button
                            type="button"
                            className="btn btn--small btn--ghost"
                            disabled={busyId === entry.id}
                            onClick={() => void act(entry.id, () => api.clearFailure(entry.id))}
                          >
                            Quitar falta
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--small btn--ghost"
                          disabled={busyId === entry.id}
                          onClick={() =>
                            void act(entry.id, async () => {
                              const link = await api.whatsappLink(entry.id);
                              window.open(link.url, '_blank', 'noopener,noreferrer');
                            })
                          }
                        >
                          WhatsApp
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Cierres que afectan este día">
        {agenda === null || agenda.closures.length === 0 ? (
          <p className="empty">El complejo está abierto todo el día.</p>
        ) : (
          <ul className="plain-list">
            {agenda.closures.map((closure) => (
              <li key={closure.id}>
                {rangeText(closure.startAt, closure.endAt, config.venueTimeZone)} ·{' '}
                {closure.courtId === null
                  ? 'todo el complejo'
                  : agenda.courts.find((court) => court.id === closure.courtId)?.name ??
                    'una cancha'}
                {closure.note ? ` · ${closure.note}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ClosuresTab({ config }: { config: PublicConfig }) {
  const [closures, setClosures] = useState<Closure[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [date, setDate] = useState(() => todayInVenue(config.venueTimeZone));
  const [startHour, setStartHour] = useState('8');
  const [hours, setHours] = useState('2');
  const [courtId, setCourtId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [closureResult, courtResult] = await Promise.all([api.closures(), api.courts()]);
      setClosures(closureResult.closures);
      setCourts(courtResult.courts);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(): Promise<void> {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.createClosure({
        date,
        startHour: Number(startHour),
        hours: Number(hours),
        courtId: courtId === '' ? null : courtId,
        note: note.trim() === '' ? undefined : note.trim(),
      });
      setNotice('Cierre guardado. Esas horas ya no se pueden reservar.');
      setNote('');
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setError(null);
    try {
      await api.deleteClosure(id);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="stack">
      {error && (
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
        </div>
      )}
      {notice && (
        <div className="notice notice--ok" role="status">
          <p>{notice}</p>
        </div>
      )}

      <Section
        title="Cerrar el complejo"
        hint="Sirve para mantenimiento, torneos o días sin servicio."
      >
        <div className="inline-form">
          <div className="field">
            <label className="field__label" htmlFor="closure-date">
              Desde la fecha
            </label>
            <input
              id="closure-date"
              className="input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="closure-hour">
              Desde las
            </label>
            <select
              id="closure-hour"
              className="input"
              value={startHour}
              onChange={(event) => setStartHour(event.target.value)}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={String(hour)}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="closure-hours">
              Cuántas horas
            </label>
            <input
              id="closure-hours"
              className="input"
              type="number"
              min={1}
              max={1440}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="closure-court">
              Alcance
            </label>
            <select
              id="closure-court"
              className="input"
              value={courtId}
              onChange={(event) => setCourtId(event.target.value)}
            >
              <option value="">Todo el complejo</option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="closure-note">
              Motivo (opcional)
            </label>
            <input
              id="closure-note"
              className="input"
              type="text"
              maxLength={200}
              value={note}
              placeholder="mantenimiento del césped"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Guardar cierre'}
          </button>
        </div>
      </Section>

      <Section title="Cierres programados">
        {closures.length === 0 ? (
          <p className="empty">No hay cierres programados.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Horas</th>
                  <th>Alcance</th>
                  <th>Motivo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {closures.map((closure) => (
                  <tr key={closure.id}>
                    <td>
                      {formatVenueDate(closure.startAt, config.venueTimeZone)}
                    </td>
                    <td className="num">
                      {rangeText(closure.startAt, closure.endAt, config.venueTimeZone)}
                    </td>
                    <td>
                      {closure.courtId === null
                        ? 'Todo el complejo'
                        : courts.find((court) => court.id === closure.courtId)?.name ?? 'Una cancha'}
                    </td>
                    <td>{closure.note ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--small btn--danger"
                        onClick={() => void remove(closure.id)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function CourtRow({ court, onSaved }: { court: Court; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(court.name);
  const [price, setPrice] = useState(centsToInput(court.pricePerHourCents));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    setError(null);
    const cents = inputToCents(price);
    if (cents === null) {
      setError('Escribe un precio válido.');
      return;
    }
    setSaving(true);
    try {
      await api.patchCourt(court.id, { name: name.trim(), pricePerHourCents: cents });
      await onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(): Promise<void> {
    setError(null);
    setSaving(true);
    try {
      await api.patchCourt(court.id, { active: !court.active });
      await onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>
        <input
          className="input"
          value={name}
          aria-label={`Nombre de ${court.name}`}
          onChange={(event) => setName(event.target.value)}
        />
      </td>
      <td>
        <input
          className="input input--price"
          value={price}
          inputMode="decimal"
          aria-label={`Precio por hora de ${court.name}`}
          onChange={(event) => setPrice(event.target.value)}
        />
      </td>
      <td>
        <span className={court.active ? 'tag tag--ok' : 'tag tag--muted'}>
          {court.active ? 'disponible' : 'desactivada'}
        </span>
      </td>
      <td>
        <div className="agenda-actions">
          <button
            type="button"
            className="btn btn--small btn--primary"
            onClick={() => void save()}
            disabled={saving}
          >
            Guardar
          </button>
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => void toggleActive()}
            disabled={saving}
          >
            {court.active ? 'Desactivar' : 'Activar'}
          </button>
        </div>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
      </td>
    </tr>
  );
}

function CourtsTab({ config }: { config: PublicConfig }) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('500.00');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.adminCourts();
      setCourts(result.courts);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(): Promise<void> {
    setError(null);
    const cents = inputToCents(newPrice);
    if (newName.trim() === '' || cents === null) {
      setError('Escribe un nombre y un precio válido para la cancha nueva.');
      return;
    }
    setCreating(true);
    try {
      await api.createCourt({ name: newName.trim(), pricePerHourCents: cents });
      setNewName('');
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="stack">
      {error && (
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
        </div>
      )}
      <Section title="Canchas" hint="Cambiar un precio no altera las reservas ya hechas.">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Precio por hora ({config.currency})</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {courts.map((court) => (
                <CourtRow key={court.id} court={court} onSaved={load} />
              ))}
            </tbody>
          </table>
        </div>
        {courts.length === 0 && <p className="empty">Todavía no hay canchas registradas.</p>}
      </Section>

      <Section title="Agregar una cancha">
        <div className="inline-form">
          <div className="field">
            <label className="field__label" htmlFor="new-court-name">
              Nombre
            </label>
            <input
              id="new-court-name"
              className="input"
              value={newName}
              placeholder="Cancha 4"
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="new-court-price">
              Precio por hora
            </label>
            <input
              id="new-court-price"
              className="input input--price"
              value={newPrice}
              inputMode="decimal"
              onChange={(event) => setNewPrice(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void create()}
            disabled={creating}
          >
            {creating ? 'Creando…' : 'Crear cancha'}
          </button>
        </div>
      </Section>
    </div>
  );
}

function ClientActions({ client, onChanged }: { client: ClientRow; onChanged: () => Promise<void> }) {
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack client-actions">
      <div className="row">
        <label className="sr-only" htmlFor={`days-${client.id}`}>
          Días de penalización para {client.name}
        </label>
        <input
          id={`days-${client.id}`}
          className="input input--days"
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(event) => setDays(event.target.value)}
        />
        <button
          type="button"
          className="btn btn--small"
          disabled={busy}
          onClick={() =>
            void run(() =>
              api.applyPenalty(client.id, {
                days: Number(days),
                reason: 'decidido por el dueño',
              }),
            )
          }
        >
          Penalizar
        </button>
        <button
          type="button"
          className="btn btn--small btn--danger"
          disabled={busy}
          onClick={() => void run(() => api.blockClient(client.id, { reason: 'bloqueo del dueño' }))}
        >
          Bloquear
        </button>
        {client.block !== null && (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            disabled={busy}
            onClick={() => void run(() => api.revokeBlock(client.block!.id))}
          >
            Quitar bloqueo
          </button>
        )}
      </div>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ClientsTab({ config }: { config: PublicConfig }) {
  const [month, setMonth] = useState(() => monthKey(todayInVenue(config.venueTimeZone)));
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.clients(month);
      setClients(result.clients);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  function blockLabel(client: ClientRow): ReactNode {
    if (client.block === null) {
      return <span className="tag tag--muted">sin bloqueo</span>;
    }
    if (client.block.endsAt === null) {
      return <span className="tag tag--warn">bloqueado sin fecha</span>;
    }
    return (
      <span className="tag tag--warn">
        penalizado hasta {formatVenueDate(client.block.endsAt, config.venueTimeZone)}
      </span>
    );
  }

  return (
    <div className="stack">
      <div className="row">
        <label className="field__label" htmlFor="clients-month">
          Mes
        </label>
        <input
          id="clients-month"
          className="input"
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
        <span className="hint">
          La falta se registra sola; la penalización la decides tú y puedes quitarla cuando quieras.
        </span>
      </div>

      {error && (
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
        </div>
      )}

      <Section title="Clientes y faltas del mes">
        {clients.length === 0 ? (
          <p className="empty">Todavía no hay clientes registrados.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th>Faltas en el mes</th>
                  <th>Bloqueo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      {client.name}
                      <small className="muted"> · {client.email}</small>
                    </td>
                    <td>{client.phone}</td>
                    <td className="num">{client.failures}</td>
                    <td>{blockLabel(client)}</td>
                    <td>
                      <ClientActions client={client} onChanged={load} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

export function PanelPage() {
  const { user, loading } = useSession();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('agenda');

  useEffect(() => {
    let alive = true;
    api
      .config()
      .then((loaded) => {
        if (alive) setConfig(loaded);
      })
      .catch((caught: unknown) => {
        if (alive) setError(errorMessage(caught));
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return <p className="muted">Cargando…</p>;
  }

  if (user === null || user.role === 'client') {
    return (
      <section className="stack">
        <div className="page-head">
          <h1 className="page-head__title">Panel del complejo</h1>
          <p className="page-head__hint">
            Este panel es para el dueño y los encargados. Si vienes a reservar, vuelve al tablero
            de horarios.
          </p>
        </div>
        <div className="row">
          <a className="btn btn--primary" href="#/">
            Ver horarios
          </a>
          {user === null && (
            <a className="btn" href="#/entrar">
              Entrar con una cuenta del panel
            </a>
          )}
        </div>
      </section>
    );
  }

  if (error !== null) {
    return (
      <div className="notice notice--error" role="alert">
        <p>{error}</p>
      </div>
    );
  }

  if (config === null) {
    return <p className="muted">Cargando panel…</p>;
  }

  const isAdmin = user.role === 'admin';
  const visibleTabs = TABS.filter((entry) => !entry.adminOnly || isAdmin);

  return (
    <section className="stack">
      <div className="page-head">
        <h1 className="page-head__title">Panel del complejo</h1>
        <p className="page-head__hint">
          {isAdmin ? 'Dueño' : 'Encargado'} · {user.email}
        </p>
      </div>

      <div className="tabs" role="tablist" aria-label="Secciones del panel">
        {visibleTabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`tab-${entry.id}`}
            className="tab"
            aria-selected={tab === entry.id}
            aria-controls={`panel-${entry.id}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'agenda' && <AgendaTab config={config} />}
        {tab === 'cierres' && <ClosuresTab config={config} />}
        {tab === 'canchas' && isAdmin && <CourtsTab config={config} />}
        {tab === 'clientes' && isAdmin && <ClientsTab config={config} />}
      </div>
    </section>
  );
}
