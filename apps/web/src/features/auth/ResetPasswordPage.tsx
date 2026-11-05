import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api.ts';
import { resetTokenFromHash } from '../../lib/recovery.ts';
import { useSession } from '../../lib/session.tsx';

/** S33, S34: the screen behind the recovery link. A dead link says so and offers another. */
export function ResetPasswordPage() {
  const { refresh } = useSession();
  const [token, setToken] = useState(() => resetTokenFromHash(window.location.hash));
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The route is the same with and without a token, so React keeps this component mounted
  // when the client opens a newer link in the same tab. Read the token again on every hash
  // change instead of trusting the first render.
  useEffect(() => {
    const onHashChange = () => {
      setToken(resetTokenFromHash(window.location.hash));
      setError(null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (!token) {
    return (
      <section className="stack">
        <div className="page-head">
          <h1 className="page-head__title">Enlace incompleto</h1>
        </div>
        <div className="notice notice--error" role="alert">
          <p>Este enlace no trae el código de recuperación. Pide uno nuevo.</p>
        </div>
        <p className="hint">
          <a href="#/recuperar">Pedir un enlace nuevo</a>
        </p>
      </section>
    );
  }

  // A plain const keeps the token narrowed inside the submit closure.
  const recoveryToken: string = token;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (!password || !passwordConfirm) {
      setError('Escribe la contraseña nueva dos veces.');
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

    setBusy(true);
    try {
      await api.resetPassword({ token: recoveryToken, password });
      await refresh();
      window.location.hash = '#/mis-reservas';
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1 className="page-head__title">Contraseña nueva</h1>
        <p className="page-head__hint">
          Al guardarla cerramos las sesiones abiertas en otros equipos. Este equipo queda
          adentro.
        </p>
      </div>

      <form className="form" noValidate onSubmit={(event) => void submit(event)}>
        {error && (
          <div className="notice notice--error" role="alert">
            <p>{error}</p>
          </div>
        )}
        <div className="field">
          <label className="field__label" htmlFor="reset-password">
            Contraseña nueva
          </label>
          <input
            id="reset-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="hint">Mínimo 8 caracteres.</p>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="reset-password-confirm">
            Confirmar contraseña
          </label>
          <input
            id="reset-password-confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>

      {error !== null && (
        <p className="hint">
          ¿El enlace venció? <a href="#/recuperar">Pide uno nuevo</a>.
        </p>
      )}
    </section>
  );
}
