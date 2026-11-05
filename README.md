# canchas

Self-service booking for a 24-hour football venue in Honduras: a public landing page, a
booking board, client accounts and an owner panel. No payments online; the client pays cash
when they arrive.

## Requirements

- Node.js 22 or newer (the API uses the built-in `node:sqlite`).
- npm 10 or newer.

## First run

```bash
npm install

# create the first owner account (idempotent by email)
DATABASE_PATH=./data/canchas.sqlite \
ADMIN_EMAIL=dueno@tucanchas.com \
ADMIN_PASSWORD=tuclave123 \
ADMIN_PHONE=9999-8888 \
npm run create-admin -w @canchas/api
```

Then keep two terminals open:

```bash
# terminal 1: API on http://localhost:3000, seeds the three courts on boot
DATABASE_PATH=./data/canchas.sqlite npm run start -w @canchas/api

# terminal 2: web on http://localhost:5173, proxies /api to the API
npm run dev -w @canchas/web
```

Workspace scripts run with the workspace folder as the working directory, so
`./data/canchas.sqlite` resolves to `apps/api/data/canchas.sqlite`. Delete that file to start
from zero. The API does not watch: restart it after changing it.

## Routes

| URL | Screen |
| --- | --- |
| `#/` | Landing with the live free hours of today |
| `#/reservar` | Booking board |
| `#/entrar` | Sign in and registration |
| `#/recuperar` | Ask for a password recovery link by email |
| `#/nueva-clave` | Choose a new password from that link |
| `#/completar-perfil` | Name and phone for a new Google account |
| `#/mis-reservas` | Client reservations and cancellation |
| `#/panel` | Owner and staff panel |

## Environment variables

API:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `./data/canchas.sqlite` | SQLite file |
| `PORT` | `3000` | HTTP port |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | unset | Real email delivery; without them reminders are logged |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | unset | `"true"` for implicit TLS (port 465) |
| `REMINDER_INTERVAL_MS` | `900000` | Reminder scheduler interval |
| `WEB_BASE_URL` | `http://localhost:5173` | Base of the web app, used to build the recovery link |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | unset | Turns Google sign-in on; both are required |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/api/auth/google/callback` | Must match the Google Cloud console |

Web (build time):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_VENUE_NAME` | `Canchas` | Venue name in the header and footer |
| `VITE_VENUE_CITY` | unset | Adds the city to the footer line |
| `VITE_VENUE_PHONE` | unset | Phone and WhatsApp links in the footer |
| `VITE_VENUE_EMAIL` | unset | Contact email in the footer |

## Scheduled job

The API marks no-shows and sends reminders by itself, every 15 minutes. A manual pass:

```bash
DATABASE_PATH=./data/canchas.sqlite npm run job -w @canchas/api
```

## Accounts

A client who forgot the password asks for a link on `#/recuperar` and receives a mail with
`#/nueva-clave?token=...`. The token lives 60 minutes, works once, and only its hash is
stored; asking again invalidates the previous link. Finishing the change closes every
session that existed before and leaves the device that made the change signed in. The answer
is always the same, so the form cannot be used to discover which emails have an account.

Without SMTP the recovery mail is written to the API log, so the flow works before a mail
provider exists:

```
[mail] to=cliente@example.com subject="Recupera tu contraseña" text="... | http://localhost:5173/#/nueva-clave?token=XXXX | ..."
```

Copy that link into the browser, or configure SMTP (see above) to deliver it. Anyone who can
read the API log can use the link, so do not leave it in a shared log on a real deployment.
While the channel is the console, the recovery screen says so instead of promising an email,
and the API warns at startup that its mail is not leaving the process.

Google sign-in is **off** unless the API starts with `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. To turn it on:

1. In Google Cloud Console create an OAuth client of type "Web application".
2. Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`, or whatever
   `GOOGLE_REDIRECT_URI` says.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart the API.

With the credentials absent the API answers `google_not_configured` and the web hides the
button, so the app never shows a dead entry. A Google account arrives without a phone, so
after the consent screen the app asks for name and phone on `#/completar-perfil`, and the API
refuses a reservation with `phone_required` until it is saved. Such an account has no
password: to also sign in with email and password, the client uses the recovery link once,
which sets one.

## Checks

```bash
npm test                 # domain, API and web
npm run typecheck
npm run build -w @canchas/web
```

## Notes

- Prices are stored in cents (HNL) and snapshotted on the reservation, so changing a price
  never alters existing bookings.
- A court can be deleted only while it has no reservations; otherwise deactivate it, which
  keeps the history and the statistics intact.
- A failure mark is recorded automatically (late cancellation, or a reservation that ended
  without an arrival). The penalty days are always the owner's decision.
- The recovery link is the only way to give a Google-only account a password.
