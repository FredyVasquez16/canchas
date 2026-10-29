import { useEffect, useState } from 'react';
import { AccountPage } from './features/account/AccountPage.tsx';
import { AuthPage } from './features/booking/AuthPage.tsx';
import { BookingPage } from './features/booking/BookingPage.tsx';
import { MinePage } from './features/booking/MinePage.tsx';
import { LandingPage } from './features/landing/LandingPage.tsx';
import { PanelPage } from './features/panel/PanelPage.tsx';
import { useSession } from './lib/session.tsx';
import {
  VENUE_CITY,
  VENUE_EMAIL,
  VENUE_NAME,
  VENUE_PHONE,
  VENUE_PHONE_DIGITS,
} from './lib/venue.ts';

const ROUTES = ['', 'reservar', 'entrar', 'mis-reservas', 'cuenta', 'panel'] as const;

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
            <>
              <NavLink href="#/cuenta" label="Mi cuenta" active={route === 'cuenta'} />
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
            </>
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
        {route === 'cuenta' && <AccountPage />}
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
        <div className="app-footer__top">
          <div className="app-footer__brand">
            <strong>{VENUE_NAME}</strong>
            <span className="app-footer__tagline">
              {VENUE_CITY === ''
                ? 'Cancha de fútbol · abierto 24 horas'
                : `Cancha de fútbol en ${VENUE_CITY} · abierto 24 horas`}
            </span>
          </div>

          <nav className="app-footer__links" aria-label="Enlaces del sitio">
            <span className="app-footer__heading">El sitio</span>
            <a href="#/">Inicio</a>
            <a href="#/reservar">Reservar una cancha</a>
            <a href="#/mis-reservas">Mis reservas</a>
            <a href="#/cuenta">Mi cuenta</a>
          </nav>

          <div className="app-footer__contact">
            <span className="app-footer__heading">Contáctanos</span>
            {VENUE_PHONE !== '' && (
              <>
                <a href={`https://wa.me/${VENUE_PHONE_DIGITS}`}>WhatsApp</a>
                <a href={`tel:+${VENUE_PHONE_DIGITS}`}>{VENUE_PHONE}</a>
              </>
            )}
            {VENUE_EMAIL !== '' && <a href={`mailto:${VENUE_EMAIL}`}>{VENUE_EMAIL}</a>}
            {VENUE_PHONE === '' && VENUE_EMAIL === '' && (
              <span>Pregunta por nosotros en el complejo</span>
            )}
          </div>
        </div>

        <div className="app-footer__legal">
          <span>
            © {new Date().getFullYear()} {VENUE_NAME}. Todos los derechos reservados.
          </span>
          <span className="app-footer__note">
            Pago en efectivo al llegar · cancelación sin costo hasta 3 horas antes
          </span>
        </div>
      </footer>
    </div>
  );
}
