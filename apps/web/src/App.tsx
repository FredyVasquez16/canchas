import { useEffect, useState } from 'react';
import { BookingPage } from './features/booking/BookingPage.tsx';
import { AuthPage } from './features/booking/AuthPage.tsx';
import { MinePage } from './features/booking/MinePage.tsx';
import { PanelPage } from './features/panel/PanelPage.tsx';
import { useSession } from './lib/session.tsx';

const VENUE_NAME = (import.meta.env.VITE_VENUE_NAME as string | undefined) ?? 'Canchas';

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

  return (
    <div className="app">
      <header className="app-header">
        <a className="app-header__brand" href="#/">
          {VENUE_NAME}
        </a>
        <nav className="app-nav" aria-label="Navegación principal">
          <NavLink href="#/" label="Reservar" active={route === ''} />
          {user && <NavLink href="#/mis-reservas" label="Mis reservas" active={route === 'mis-reservas'} />}
          {isPanel && <NavLink href="#/panel" label="Panel" active={route === 'panel'} />}
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
        </nav>
      </header>

      <main className="app-main">
        {route === '' && <BookingPage />}
        {route === 'entrar' && <AuthPage />}
        {route === 'mis-reservas' && <MinePage />}
        {route === 'panel' && <PanelPage />}
        {route !== '' && route !== 'entrar' && route !== 'mis-reservas' && route !== 'panel' && (
          <div className="stack">
            <h1 className="page-head__title">Esa página no existe</h1>
            <p className="muted">
              Vuelve al <a href="#/">tablero de horarios</a> para reservar una cancha.
            </p>
          </div>
        )}
      </main>

      <footer className="app-footer">
        {VENUE_NAME} · abierto 24 horas · pago en efectivo al llegar · cancelación sin costo hasta 3
        horas antes
      </footer>
    </div>
  );
}
