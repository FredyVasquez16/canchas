import { useEffect, useState } from 'react';
import { AuthPage } from './features/booking/AuthPage.tsx';
import { BookingPage } from './features/booking/BookingPage.tsx';
import { MinePage } from './features/booking/MinePage.tsx';
import { LandingPage } from './features/landing/LandingPage.tsx';
import { PanelPage } from './features/panel/PanelPage.tsx';
import { useSession } from './lib/session.tsx';

const VENUE_NAME = (import.meta.env.VITE_VENUE_NAME as string | undefined) ?? 'Canchas';

const ROUTES = ['', 'reservar', 'entrar', 'mis-reservas', 'panel'] as const;

function currentRoute(): string {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return hash.split('?')[0] ?? '';
}

function useRoute(): string {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a href={href} aria-current={active ? 'page' : undefined}>
      {label}
    </a>
  );
}

export function App() {
  const route = useRoute();
  const { user, loading, signOut } = useSession();
  const isPanel = user !== null && user.role !== 'client';
  const known = (ROUTES as readonly string[]).includes(route);

  return (
    <div className="app">
      <header className="app-header">
        <a className="app-header__brand" href="#/">
          <strong>{VENUE_NAME}</strong>
        </a>
        <nav className="app-nav" aria-label="Navegación principal">
          <NavLink href="#/" label="Inicio" active={route === ''} />
          <NavLink href="#/reservar" label="Reservar" active={route === 'reservar'} />
          {user && (
            <NavLink
              href="#/mis-reservas"
              label="Mis reservas"
              active={route === 'mis-reservas'}
            />
          )}
          {isPanel && <NavLink href="#/panel" label="Panel" active={route === 'panel'} />}
        </nav>
        <div className="app-header__session">
          {loading ? null : user ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => {
                void signOut().then(() => {
                  window.location.hash = '#/';
                });
              }}
            >
              Salir
            </button>
          ) : (
            <NavLink href="#/entrar" label="Entrar" active={route === 'entrar'} />
          )}
        </div>
      </header>

      <main className="app-main">
        {route === '' && <LandingPage />}
        {route === 'reservar' && <BookingPage />}
        {route === 'entrar' && <AuthPage />}
        {route === 'mis-reservas' && <MinePage />}
        {route === 'panel' && <PanelPage />}
        {!known && (
          <div className="stack">
            <h1 className="page-head__title">Esa página no existe</h1>
            <p className="muted">
              Vuelve al <a href="#/reservar">tablero de horarios</a> para reservar una cancha.
            </p>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>{VENUE_NAME} · reservas en línea sin llamadas ni mensajes</span>
        <span className="app-footer__note">
          pago en efectivo al llegar · cancelación sin costo hasta 3 horas antes
        </span>
      </footer>
    </div>
  );
}
