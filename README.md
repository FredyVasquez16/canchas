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
