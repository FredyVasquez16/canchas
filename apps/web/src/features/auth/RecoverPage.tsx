import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, type PublicConfig } from '../../lib/api.ts';

/** S32: the same confirmation for every email, so the form cannot list accounts. */
export function RecoverPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .config()
      .then((loaded) => {
        if (!cancelled) {
          setConfig(loaded);
        }
      })
      .catch(() => {
        // Without the configuration the screen keeps its neutral wording.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Escribe el correo de tu cuenta.');
      return;
    }

    setBusy(true);
    try {
      await api.forgotPassword({ email: cleanEmail });
      setSent(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1 className="page-head__title">Recuperar contraseña</h1>
        <p className="page-head__hint">
          Te enviamos un enlace al correo de tu cuenta para que elijas una contraseña nueva.
        </p>
      </div>

      {sent ? (
        <>
          <div className="notice notice--ok" role="status">
            <p>
              Si ese correo tiene una cuenta, el enlace ya va en camino. Revisa tu correo y la
              carpeta de spam.
            </p>
            <p>El enlace vence en 60 minutos y sirve una sola vez.</p>
          </div>
          {config?.mailTransport === 'console' && (
            <div className="notice notice--info" role="note">
              <p>
                Este servidor todavía no tiene un proveedor de correo configurado, así que no
                envía correos. El mensaje con el enlace quedó escrito en la salida de la API, para
                quien administra el sistema.
              </p>
            </div>
          )}
        </>
      ) : (
        <form className="form" noValidate onSubmit={(event) => void submit(event)}>
          {error && (
            <div className="notice notice--error" role="alert">
              <p>{error}</p>
            </div>
          )}
          <div className="field">
            <label className="field__label" htmlFor="recover-email">
              Correo
            </label>
            <input
              id="recover-email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>
      )}

      <p className="hint">
        <a href="#/entrar">Volver a entrar</a>
      </p>
    </section>
  );
}
