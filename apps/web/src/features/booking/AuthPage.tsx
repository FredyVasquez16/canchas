import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api.ts';
import { useSession } from '../../lib/session.tsx';

type Mode = 'login' | 'register';

export function AuthPage() {
  const { user, loading, refresh } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return (
      <section className="stack">
        <div className="page-head">
          <h1 className="page-head__title">Ya tienes una sesión activa</h1>
        </div>
        <p className="muted">
          Vuelve al <a href="#/reservar">tablero de horarios</a> o revisa{' '}
          <a href="#/mis-reservas">tus reservas</a>.
        </p>
      </section>
    );
  }

  function switchMode(next: Mode): void {
    setMode(next);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const cleanEmail = email.trim();
    if (mode === 'login') {
      if (!cleanEmail || !password) {
        setError('Escribe tu correo y tu contraseña.');
        return;
      }
    } else {
      if (!name.trim() || !phone.trim() || !cleanEmail || !password || !passwordConfirm) {
        setError('Completa nombre, teléfono, correo y las dos contraseñas.');
        return;
      }
      if (password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres.');
        return;
      }
      if (password !== passwordConfirm) {
        setError('Las contraseñas no coinciden.');
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        await api.login({ email: cleanEmail, password });
      } else {
        await api.register({
          email: cleanEmail,
          password,
          name: name.trim(),
          phone: phone.trim(),
        });
      }
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
        <h1 className="page-head__title">Entrar</h1>
        <p className="page-head__hint">
          Ver horarios no requiere cuenta. Para reservar, entra o crea tu cuenta.
        </p>
      </div>

      <div className="tabs" role="tablist" aria-label="Acceso a la cuenta">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={mode === 'login'}
          onClick={() => switchMode('login')}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={mode === 'register'}
          onClick={() => switchMode('register')}
        >
          Crear cuenta
        </button>
      </div>

      {error && (
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {mode === 'login' ? (
        <form
          className="form"
          role="tabpanel"
          aria-label="Entrar"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <div className="field">
            <label className="field__label" htmlFor="login-email">
              Correo
            </label>
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="login-password">
              Contraseña
            </label>
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      ) : (
        <form
          className="form"
          role="tabpanel"
          aria-label="Crear cuenta"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <div className="field">
            <label className="field__label" htmlFor="register-name">
              Nombre
            </label>
            <input
              id="register-name"
              className="input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="register-phone">
              Teléfono
            </label>
            <input
              id="register-phone"
              className="input"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <p className="hint">Lo usamos para recordatorios y para contactarte.</p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="register-email">
              Correo
            </label>
            <input
              id="register-email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="register-password">
              Contraseña
            </label>
            <input
              id="register-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="hint">Mínimo 8 caracteres.</p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="register-password-confirm">
              Confirmar contraseña
            </label>
            <input
              id="register-password-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />
            <p className="hint">Escríbela otra vez para evitar errores.</p>
          </div>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
          <p className="hint">El pago de las reservas es en efectivo en el complejo.</p>
        </form>
      )}
    </section>
  );
}
