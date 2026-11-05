import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api.ts';
import { useSession } from '../../lib/session.tsx';

/**
 * S38: the account created with Google has no phone yet, and the venue needs it to reach
 * the client. This screen is the only way forward before booking.
 */
export function CompleteProfilePage() {
  const { user, loading, refresh } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <section className="stack">
        <div className="page-head">
          <h1 className="page-head__title">Completar mi cuenta</h1>
        </div>
        <p className="muted">
          Entra a tu cuenta para terminar el registro: <a href="#/entrar">entrar</a>.
        </p>
      </section>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (name.trim().length < 2) {
      setError('Escribe tu nombre completo.');
      return;
    }
    if (!phone.trim()) {
      setError('Escribe tu teléfono: lo usamos para recordatorios y para contactarte.');
      return;
    }

    setBusy(true);
    try {
      await api.updateAccount({ name: name.trim(), phone: phone.trim() });
      await refresh();
      window.location.hash =
        sessionStorage.getItem('pending-booking') !== null ? '#/reservar' : '#/mis-reservas';
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1 className="page-head__title">Completa tu cuenta</h1>
        <p className="page-head__hint">
          Ya entraste con Google. Solo falta tu teléfono para poder reservar.
        </p>
      </div>

      <form className="form" noValidate onSubmit={(event) => void submit(event)}>
        {error && (
          <div className="notice notice--error" role="alert">
            <p>{error}</p>
          </div>
        )}
        <div className="field">
          <label className="field__label" htmlFor="profile-email">
            Correo
          </label>
          <input id="profile-email" className="input" type="email" value={user.email} readOnly disabled />
          <p className="hint">El correo de Google identifica tu cuenta y no se cambia aquí.</p>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="profile-name">
            Nombre
          </label>
          <input
            id="profile-name"
            className="input"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="profile-phone">
            Teléfono
          </label>
          <input
            id="profile-phone"
            className="input"
            type="tel"
            autoComplete="tel"
            placeholder="9999-8888"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <p className="hint">8 dígitos. Lo usamos para recordatorios y para contactarte.</p>
        </div>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar y continuar'}
        </button>
      </form>
    </section>
  );
}
