export type Role = 'admin' | 'staff' | 'client';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: Role;
}

export interface Court {
  id: string;
  name: string;
  pricePerHourCents: number;
  active: boolean;
  sortOrder?: number;
}

export type SlotStatus = 'available' | 'occupied' | 'closed' | 'past';

export interface Slot {
  hour: number;
  label: string;
  startAt: number;
  endAt: number;
  status: SlotStatus;
}

export interface AvailabilityCourt {
  court: Court;
  slots: Slot[];
}

export interface Availability {
  date: string;
  timeZone: string;
  currency: string;
  cancelWindowHours: number;
  courts: AvailabilityCourt[];
}

export interface Reservation {
  id: string;
  courtId: string;
  userId: string;
  startAt: number;
  endAt: number;
  hours: number;
  pricePerHourCents: number;
  totalCents: number;
  status: 'booked' | 'cancelled';
  arrivedAt: number | null;
  cancelledAt: number | null;
  failureMarkedAt: number | null;
  failureReason: 'late_cancel' | 'no_show' | 'owner' | null;
  createdAt: number;
}

export interface AgendaEntry {
  id: string;
  courtId: string;
  courtName: string;
  startAt: number;
  endAt: number;
  hours: number;
  totalCents: number;
  status: 'booked' | 'cancelled';
  arrivedAt: number | null;
  failureMarkedAt: number | null;
  failureReason: string | null;
  client: { id: string; name: string; phone: string };
}

export interface Agenda {
  date: string;
  timeZone: string;
  currency: string;
  courts: Court[];
  reservations: AgendaEntry[];
  closures: Closure[];
}

export interface StatsResponse {
  from: string;
  to: string;
  timeZone: string;
  totals: {
    reservations: number;
    cancelled: number;
    lateCancels: number;
    noShows: number;
    bookedHours: number;
    capacityHours: number;
    occupancyRate: number;
    expectedCents: number;
    collectedCents: number;
    clients: number;
    newClients: number;
  };
  daily: Array<{ date: string; reservations: number; bookedHours: number; collectedCents: number }>;
  byHour: Array<{ hour: number; reservations: number }>;
  byCourt: Array<{
    courtId: string;
    courtName: string;
    reservations: number;
    bookedHours: number;
    collectedCents: number;
    share: number;
  }>;
  topClients: Array<{ id: string; name: string; phone: string; reservations: number; failures: number }>;
}

export interface ClientBlock {
  id: string;
  userId: string | null;
  phoneNormalized: string;
  startsAt: number;
  endsAt: number | null;
  reason: string | null;
  createdAt: number;
  revokedAt: number | null;
}

export interface ClientRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  phoneNormalized: string;
  failures: number;
  block: ClientBlock | null;
}

export interface Closure {
  id: string;
  courtId: string | null;
  startAt: number;
  endAt: number;
  note: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as unknown) : null;

  if (!response.ok) {
    const code =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : 'error';
    throw new ApiError(response.status, code);
  }

  return data as T;
}

function jsonBody(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

export interface PublicConfig {
  venueTimeZone: string;
  currency: string;
  cancelWindowHours: number;
  maxAdvanceDays: number;
  maxActiveReservations: number;
}

export const api = {
  register: (input: { email: string; password: string; name: string; phone: string }) =>
    request<{ user: User }>('/auth/register', jsonBody(input)),

  login: (input: { email: string; password: string }) =>
    request<{ user: User }>('/auth/login', jsonBody(input)),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  me: () => request<{ user: User }>('/auth/me'),

  config: () => request<PublicConfig>('/config'),

  courts: () => request<{ courts: Court[] }>('/courts'),

  availability: (date: string) =>
    request<Availability>(`/availability?date=${encodeURIComponent(date)}`),

  createReservation: (input: { courtId: string; date: string; startHour: number; hours: number }) =>
    request<{ reservation: Reservation; court: { id: string; name: string; pricePerHourCents: number } }>(
      '/reservations',
      jsonBody(input),
    ),

  myReservations: () => request<{ reservations: Reservation[] }>('/reservations/mine'),

  cancelReservation: (id: string) =>
    request<{ reservation: Reservation; marked: boolean }>(`/reservations/${id}/cancel`, {
      method: 'POST',
    }),

  agenda: (date: string) => request<Agenda>(`/admin/agenda?date=${encodeURIComponent(date)}`),

  markArrived: (id: string) =>
    request<{ reservation: Reservation }>(`/admin/reservations/${id}/arrive`, { method: 'POST' }),

  markFailure: (id: string, reason: 'no_show' | 'late_cancel' | 'owner' = 'owner') =>
    request<{ reservation: Reservation }>(`/admin/reservations/${id}/failure`, jsonBody({ reason })),

  clearFailure: (id: string) =>
    request<{ reservation: Reservation }>(`/admin/reservations/${id}/failure`, {
      method: 'DELETE',
    }),

  whatsappLink: (id: string) => request<{ url: string }>(`/admin/reservations/${id}/whatsapp`),

  clients: (month?: string) =>
    request<{ month: string; clients: ClientRow[] }>(
      `/admin/clients${month ? `?month=${encodeURIComponent(month)}` : ''}`,
    ),

  applyPenalty: (userId: string, input: { days: number; reason?: string }) =>
    request<{ block: ClientBlock }>(`/admin/clients/${userId}/penalty`, jsonBody(input)),

  blockClient: (userId: string, input: { reason?: string } = {}) =>
    request<{ block: ClientBlock }>(`/admin/clients/${userId}/block`, jsonBody(input)),

  revokeBlock: (blockId: string) =>
    request<{ ok: boolean }>(`/admin/blocks/${blockId}`, { method: 'DELETE' }),

  adminCourts: () => request<{ courts: Court[] }>('/admin/courts'),

  stats: (from: string, to: string) =>
    request<StatsResponse>(`/admin/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  createCourt: (input: { name: string; pricePerHourCents: number }) =>
    request<{ court: Court }>('/admin/courts', jsonBody(input)),

  patchCourt: (id: string, input: { name?: string; pricePerHourCents?: number; active?: boolean }) =>
    request<{ court: Court }>(`/admin/courts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  closures: () => request<{ closures: Closure[] }>('/admin/closures'),

  createClosure: (input: {
    date: string;
    startHour: number;
    hours: number;
    courtId?: string | null;
    note?: string;
  }) => request<{ closure: Closure }>('/admin/closures', jsonBody(input)),

  deleteClosure: (id: string) =>
    request<{ ok: boolean }>(`/admin/closures/${id}`, { method: 'DELETE' }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const map: Record<string, string> = {
      invalid_input: 'Revisa los datos: hay algo incompleto o mal escrito.',
      email_taken: 'Ese correo ya tiene una cuenta.',
      invalid_credentials: 'Correo o contraseña incorrectos.',
      unauthenticated: 'Entra a tu cuenta para continuar.',
      forbidden: 'Tu cuenta no tiene permiso para eso.',
      occupied: 'Ese horario acaba de ocuparse. Elige otro.',
      closed: 'Esa franja está cerrada por el complejo.',
      past: 'Ese horario ya pasó.',
      advance_limit: 'Todavía es muy pronto para reservar esa fecha.',
      blocked: 'No puedes reservar mientras tengas una penalización activa.',
      active_limit: 'Ya tienes dos reservas activas. Cancela una o espera a jugar.',
      court_not_found: 'Esa cancha ya no está disponible.',
      already_cancelled: 'Esa reserva ya fue cancelada.',
      already_started: 'Esa reserva ya comenzó.',
      reservation_not_found: 'No encontramos esa reserva.',
    };
    return map[error.code] ?? `No se pudo completar la acción (${error.code}).`;
  }
  return 'No hubo conexión con el servidor. Intenta de nuevo.';
}
