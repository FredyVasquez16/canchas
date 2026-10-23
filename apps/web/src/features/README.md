# Web app contract

The shell is owned by the orchestrator. Feature code lives in two folders and must not
edit anything outside them.

## Shared modules (read only for features)

- `src/lib/api.ts` — every HTTP call. Types mirror the API responses. Errors are
  `ApiError`; use `errorMessage(error)` to turn one into written Spanish for the user.
- `src/lib/session.tsx` — `useSession()` gives `{ user, loading, refresh, signOut }`.
  Call `refresh()` after signing in.
- `src/lib/format.ts` — `formatMoney`, `todayInVenue`, `rangeText`, `hourText`, `dayText`,
  `upcomingDays`, `monthKey`.
- `src/lib/selection.ts` — pure range selection for the board, already covered by tests.
- `src/styles.css` — the class inventory is documented at the top of the file. Reuse those
  classes; a feature may add its own CSS file inside its own folder.

## Feature entry points

| Component | Route | File |
| --- | --- | --- |
| `BookingPage` | `#/` | `src/features/booking/BookingPage.tsx` |
| `AuthPage` | `#/entrar` | `src/features/booking/AuthPage.tsx` |
| `MinePage` | `#/mis-reservas` | `src/features/booking/MinePage.tsx` |
| `PanelPage` | `#/panel` | `src/features/panel/PanelPage.tsx` |

Named exports are required; the shell imports them by name.

## Behaviour rules that belong to the feature

- The board is the first screen: date strip, then courts by hour. It is the hero.
- Available slots are the only clickable ones; occupied, closed and past slots are inert
  and must say why in their accessible name.
- The selection bar summarises court, hour range, hours and total, and is the only place
  where the primary action lives.
- Money is always shown as `L 500.00` through `formatMoney`; never hand-format prices.
- All copy is Spanish, neutral and professional, sentence case, active voice. Name things
  the way the client would: cancha, hora, reserva, efectivo, penalización.
- Mobile first: the board scrolls horizontally and never breaks the page width.
- Keyboard and screen readers: real buttons, `aria-pressed` on slots, `aria-label` with the
  hour and its state, visible focus.
