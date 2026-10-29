import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api.ts';
import { useSession } from '../../lib/session.tsx';
import './account.css';

interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

const NEW_PASSWORD_MIN_LENGTH = 8;

function Feedback({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div
      className={`notice notice--${notice.tone}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      <p>{notice.text}</p>
    </div>
  );
}

export function AccountPage() {
  const { user, loading, refresh } = useSession();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileNotice, setProfileNotice] = useState<Notice | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordNotice, setPasswordNotice] = useState<Notice | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
  }, [user?.id, user?.name, user?.phone]);

  async function submitProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (savingProfile) return;
    setProfileNotice(null);
    setPasswordNotice(null);
    setSavingProfile(true);
    try {
      await api.updateAccount({ name: name.trim(), phone: phone.trim() });
      setProfileNotice({ tone: 'ok', text: 'Guardamos tus datos personales.' });
      await refresh();
    } catch (error) {
      setProfileNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (savingPassword) return;
    setPasswordNotice(null);
    setProfileNotice(null);
    if (newPassword.length < NEW_PASSWORD_MIN_LENGTH) {
      setPasswordNotice({
        tone: 'error',
        text: 'La contraseña nueva debe tener 8 caracteres o más.',
      });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordNotice({ tone: 'error', text: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    setSavingPassword(true);
    try {
      await api.updateAccount({ password: newPassword, currentPassword });
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setPasswordNotice({
        tone: 'ok',
        text: 'Cambiamos tu contraseña y cerramos la sesión en tus otros dispositivos.',
      });
    } catch (error) {
      setPasswordNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return (
      <section className="stack">
        <div className="page-head">
          <h1 className="page-head__title">Mi cuenta</h1>
        </div>
        <p className="muted">Cargando…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="stack">
        <div className="page-head">
          <h1 className="page-head__title">Mi cuenta</h1>
        </div>
        <p className="muted">
          Entra a tu cuenta para ver y actualizar tus datos. <a href="#/entrar">Entrar</a>
        </p>
      </section>
    );
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1 className="page-head__title">Mi cuenta</h1>
        <p className="page-head__hint">
          Revisa tus datos de contacto y cambia tu contraseña cuando lo necesites.
        </p>
      </div>

      <div className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Datos personales</h2>
        </div>
        <div className="panel__body">
          <Feedback notice={profileNotice} />

          <div className="account__identity">
            <span className="field__label">Correo</span>
            <span className="account__email">{user.email}</span>
            <p className="hint">
              El correo identifica tu cuenta y no se puede cambiar. Para usar otro correo, crea
              una cuenta nueva.
            </p>
          </div>

          <form className="form" noValidate onSubmit={(event) => void submitProfile(event)}>
            <div className="field">
              <label className="field__label" htmlFor="account-name">
                Nombre
              </label>
              <input
                id="account-name"
                className="input"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="account-phone">
                Teléfono
              </label>
              <input
                id="account-phone"
                className="input"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <p className="hint">Lo usamos para recordatorios y para contactarte.</p>
            </div>
            <button type="submit" className="btn btn--primary" disabled={savingProfile}>
              {savingProfile ? 'Guardando…' : 'Guardar datos'}
            </button>
          </form>
        </div>
      </div>

      <div className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Contraseña</h2>
          <span className="panel__hint">
            Al cambiarla cerramos la sesión en tus otros dispositivos.
          </span>
        </div>
        <div className="panel__body">
          <Feedback notice={passwordNotice} />

          <form className="form" noValidate onSubmit={(event) => void submitPassword(event)}>
            <div className="field">
              <label className="field__label" htmlFor="account-current-password">
                Contraseña actual
              </label>
              <input
                id="account-current-password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="account-new-password">
                Contraseña nueva
              </label>
              <input
                id="account-new-password"
                className="input"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <p className="hint">Mínimo 8 caracteres.</p>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="account-new-password-confirm">
                Confirmar contraseña nueva
              </label>
              <input
                id="account-new-password-confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                value={newPasswordConfirm}
                onChange={(event) => setNewPasswordConfirm(event.target.value)}
              />
              <p className="hint">Escríbela otra vez para evitar errores.</p>
            </div>
            <button type="submit" className="btn btn--primary" disabled={savingPassword}>
              {savingPassword ? 'Cambiando…' : 'Cambiar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
