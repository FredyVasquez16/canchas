# Reservas de canchas — self-service booking for a 24h football venue

Feature: replace the manual WhatsApp booking flow with a public PWA that shows real
availability and lets a client book a court without staff intervention, plus an
owner/staff panel for court setup, closures, attendance and penalties.

Read until `## Log` before acting on any task in this document.

## Specs

S1. Registration uses email + password. Name and phone are required at registration;
the phone feeds reminders and blocking.
S2. Anyone can see availability for a chosen date without an account. Booking requires
an account ("sin solo podra ver pero no reservar").
S3. Time grid is fixed 60-minute blocks, 24 slots per day, 00:00 through 23:59, because
"es un local 24 horas". Flow: pick date -> see free hours -> select a consecutive range
("de tal hora a tal hora").
S4. Price is per court per hour, set by the owner. Total = booked hours x court price.
S5. Payment is cash at the venue on arrival; the app never charges.
S6. Cancelling 3 hours or more before the reserved hour has no consequence. Cancelling
inside that window produces an automatic failure mark. Boundary: exactly 3 hours before
is still free.
S7. A reservation that reaches its end without an arrival record produces an automatic
failure mark.
S8. When staff collects the cash they mark "arrived"; the reservation counts as fulfilled
and never produces a failure mark.
S9. A failure mark is not a penalty. Penalties (N days without booking) are applied only
by the owner, who can also remove them at any time.
S10. Panel shows marked clients, how many times each failed in the month, lets the owner
set N penalty days, remove a penalty, and see court availability and reservations.
S11. A block applies to the phone number and to the account, so a new account with the
same phone cannot book.
S12. The owner closes the venue for a date range or an hour range; those slots cannot be
booked ("que no se puede reservar de cierta ora a cierta hora o de cierta fecha a cierta
fecha").
S13. Changing a price never alters existing reservations; the price is snapshotted at
booking time.
S14. Roles: admin (everything) and staff (agenda, arrivals, failure marks, closures; no
prices, no accounts).
S15. Reminder is sent automatically by email; a manual WhatsApp link is available in the
panel. No WhatsApp API in v1.
S16. Limits live in configuration, not in the UI: maximum advance booking 30 days,
maximum 2 active reservations per client.
S17. Development runs locally; deployment is decided later.
S18. Venue facts: Honduras, currency HNL (minor unit = centavos), time zone
`America/Tegucigalpa`, 3 courts at start, 24h schedule.
S19. The owner can change the number of courts, the price per hour and the closed days
from the panel ("el dueno puede modificar estas aspectos como el numero de canchas
disponibles, los precios por hora, los dias que no estaran abiertos").
S20. There is no maximum number of consecutive hours per reservation ("no hay un limite
de horas a poder reservar"); only availability limits it.

S21. Every hour shown to a person uses a 12-hour clock with AM/PM: the board, the
selection summary, my reservations, the panel, the WhatsApp message and the reminder email.
Internally the grid stays 24 hours; only presentation changes.
S22. The public page must read as a finished product, not an empty demo: venue identity in
the header, a strip of real venue facts, a legend for the board states, and loading, empty
and error states that say what to do next.
S23. The owner has a statistics view for a chosen period: reservations, cancellations,
no-shows, clients (total and new), cash collected, expected revenue, occupancy rate,
reservations per day, demand by hour and the clients with the most reservations.
S24. Reminders are sent by the system on a schedule, without anyone running a command.
When SMTP settings are present the mail leaves through them; otherwise the message is logged
and the settings that are missing are reported.

## Tasks

| ID | Specs | Route | Commit |
| --- | --- | --- | --- |
| T1 | — | Scaffold npm workspaces monorepo: `packages/core`, `apps/api`, `apps/web`, Vitest, TypeScript strict | done — 8a6206d |
| T2 | S3, S12, S18, S20 | Core TDD: venue time zone helpers, 24-slot grid, availability with reservations crossing midnight and closures | done — 4fc12c3 |
| T3 | S4, S6, S7, S8, S9, S16 | Core TDD: booking validation, price snapshot, cancellation window and failure-mark evaluation | done — 4fc12c3 |
| T4 | S1, S4, S11, S12, S13, S14 | API: schema, migration, seed (3 courts, HNL prices, 24h), repositories | done — fdbdc93 |
| T5 | S1, S14 | API: register/login with email + password, sessions, roles admin/staff | done — b5328c9 |
| T6 | S2, S3, S4, S11, S16, S20 | API: public availability endpoint and transactional booking | done — b5328c9 |
| T7 | S6, S7, S8, S9, S10, S12, S15, S19 | API: panel endpoints (courts, prices, closures, arrival, failures, penalties, blocks, WhatsApp link) | done — 8e68ba1 |
| T8 | S7, S15 | API: scheduled job marking no-shows, plus one email reminder per reservation | done — 5a45381 |
| T9 | S2, S3, S4, S5 | Web: PWA client flow date -> free hours -> range -> login -> confirm, and my reservations with cancel | done — 06985a4 |
| T10 | S10, S12, S14, S19 | Web: panel for admin and staff | done — b5c32f3 |

Round two (2026-10-23), requested by the owner:

| ID | Specs | Route | Commit |
| --- | --- | --- | --- |
| T11 | S21 | 12-hour clock: pure formatter in core, web formatting, WhatsApp and reminder text | done — 61d299f, fe16c52, e7a5202 |
| T12 | S22 | Visual pass: venue identity, facts strip, board legend and day bands, richer states | done — e7a5202 |
| T13 | S23 | Statistics endpoint and panel tab | done — fe16c52, e7a5202 |
| T14 | S24 | Scheduled reminders inside the API process with an SMTP mailer | done — 0b1fab3 |
| T15 | — | Verification: tests, typecheck, build and browser smoke | done — verified in e7a5202 |

## Log` before acting on any task in this document.

## Specs

S1. Registration uses email + password. Name and phone are required at registration;
the phone feeds reminders and blocking.
S2. Anyone can see availability for a chosen date without an account. Booking requires
an account ("sin solo podra ver pero no reservar").
S3. Time grid is fixed 60-minute blocks, 24 slots per day, 00:00 through 23:59, because
"es un local 24 horas". Flow: pick date -> see free hours -> select a consecutive range
("de tal hora a tal hora").
S4. Price is per court per hour, set by the owner. Total = booked hours x court price.
S5. Payment is cash at the venue on arrival; the app never charges.
S6. Cancelling 3 hours or more before the reserved hour has no consequence. Cancelling
inside that window produces an automatic failure mark. Boundary: exactly 3 hours before
is still free.
S7. A reservation that reaches its end without an arrival record produces an automatic
failure mark.
S8. When staff collects the cash they mark "arrived"; the reservation counts as fulfilled
and never produces a failure mark.
S9. A failure mark is not a penalty. Penalties (N days without booking) are applied only
by the owner, who can also remove them at any time.
S10. Panel shows marked clients, how many times each failed in the month, lets the owner
set N penalty days, remove a penalty, and see court availability and reservations.
S11. A block applies to the phone number and to the account, so a new account with the
same phone cannot book.
S12. The owner closes the venue for a date range or an hour range; those slots cannot be
booked ("que no se puede reservar de cierta ora a cierta hora o de cierta fecha a cierta
fecha").
S13. Changing a price never alters existing reservations; the price is snapshotted at
booking time.
S14. Roles: admin (everything) and staff (agenda, arrivals, failure marks, closures; no
prices, no accounts).
S15. Reminder is sent automatically by email; a manual WhatsApp link is available in the
panel. No WhatsApp API in v1.
S16. Limits live in configuration, not in the UI: maximum advance booking 30 days,
maximum 2 active reservations per client.
S17. Development runs locally; deployment is decided later.
S18. Venue facts: Honduras, currency HNL (minor unit = centavos), time zone
`America/Tegucigalpa`, 3 courts at start, 24h schedule.
S19. The owner can change the number of courts, the price per hour and the closed days
from the panel ("el dueno puede modificar estas aspectos como el numero de canchas
disponibles, los precios por hora, los dias que no estaran abiertos").
S20. There is no maximum number of consecutive hours per reservation ("no hay un limite
de horas a poder reservar"); only availability limits it.

S21. Every hour shown to a person uses a 12-hour clock with AM/PM: the board, the
selection summary, my reservations, the panel, the WhatsApp message and the reminder email.
Internally the grid stays 24 hours; only presentation changes.
S22. The public page must read as a finished product, not an empty demo: venue identity in
the header, a strip of real venue facts, a legend for the board states, and loading, empty
and error states that say what to do next.
S23. The owner has a statistics view for a chosen period: reservations, cancellations,
no-shows, clients (total and new), cash collected, expected revenue, occupancy rate,
reservations per day, demand by hour and the clients with the most reservations.
S24. Reminders are sent by the system on a schedule, without anyone running a command.
When SMTP settings are present the mail leaves through them; otherwise the message is logged
and the settings that are missing are reported.

## Tasks

| ID | Specs | Route | Commit |
| --- | --- | --- | --- |
| T1 | — | Scaffold npm workspaces monorepo: `packages/core`, `apps/api`, `apps/web`, Vitest, TypeScript strict | done — 8a6206d |
| T2 | S3, S12, S18, S20 | Core TDD: venue time zone helpers, 24-slot grid, availability with reservations crossing midnight and closures | done — 4fc12c3 |
| T3 | S4, S6, S7, S8, S9, S16 | Core TDD: booking validation, price snapshot, cancellation window and failure-mark evaluation | done — 4fc12c3 |
| T4 | S1, S4, S11, S12, S13, S14 | API: schema, migration, seed (3 courts, HNL prices, 24h), repositories | done — fdbdc93 |
| T5 | S1, S14 | API: register/login with email + password, sessions, roles admin/staff | done — b5328c9 |
| T6 | S2, S3, S4, S11, S16, S20 | API: public availability endpoint and transactional booking | done — b5328c9 |
| T7 | S6, S7, S8, S9, S10, S12, S15, S19 | API: panel endpoints (courts, prices, closures, arrival, failures, penalties, blocks, WhatsApp link) | done — 8e68ba1 |
| T8 | S7, S15 | API: scheduled job marking no-shows, plus one email reminder per reservation | done — 5a45381 |
| T9 | S2, S3, S4, S5 | Web: PWA client flow date -> free hours -> range -> login -> confirm, and my reservations with cancel | done — 06985a4 |
| T10 | S10, S12, S14, S19 | Web: panel for admin and staff | done — b5c32f3 |

Surface added after T8 to close real gaps:

| Commit | What |
| --- | --- |
| b3128b5 | `GET /api/config` (venue time zone, currency, limits), `GET /api/admin/courts` with deactivated courts, `create-admin` CLI |

## Log` before acting on any task in this document.

## Specs

S1. Registration uses email + password. Name and phone are required at registration;
the phone feeds reminders and blocking.
S2. Anyone can see availability for a chosen date without an account. Booking requires
an account ("sin solo podra ver pero no reservar").
S3. Time grid is fixed 60-minute blocks, 24 slots per day, 00:00 through 23:59, because
"es un local 24 horas". Flow: pick date -> see free hours -> select a consecutive range
("de tal hora a tal hora").
S4. Price is per court per hour, set by the owner. Total = booked hours x court price.
S5. Payment is cash at the venue on arrival; the app never charges.
S6. Cancelling 3 hours or more before the reserved hour has no consequence. Cancelling
inside that window produces an automatic failure mark. Boundary: exactly 3 hours before
is still free.
S7. A reservation that reaches its end without an arrival record produces an automatic
failure mark.
S8. When staff collects the cash they mark "arrived"; the reservation counts as fulfilled
and never produces a failure mark.
S9. A failure mark is not a penalty. Penalties (N days without booking) are applied only
by the owner, who can also remove them at any time.
S10. Panel shows marked clients, how many times each failed in the month, lets the owner
set N penalty days, remove a penalty, and see court availability and reservations.
S11. A block applies to the phone number and to the account, so a new account with the
same phone cannot book.
S12. The owner closes the venue for a date range or an hour range; those slots cannot be
booked ("que no se puede reservar de cierta ora a cierta hora o de cierta fecha a cierta
fecha").
S13. Changing a price never alters existing reservations; the price is snapshotted at
booking time.
S14. Roles: admin (everything) and staff (agenda, arrivals, failure marks, closures; no
prices, no accounts).
S15. Reminder is sent automatically by email; a manual WhatsApp link is available in the
panel. No WhatsApp API in v1.
S16. Limits live in configuration, not in the UI: maximum advance booking 30 days,
maximum 2 active reservations per client.
S17. Development runs locally; deployment is decided later.
S18. Venue facts: Honduras, currency HNL (minor unit = centavos), time zone
`America/Tegucigalpa`, 3 courts at start, 24h schedule.
S19. The owner can change the number of courts, the price per hour and the closed days
from the panel ("el dueno puede modificar estas aspectos como el numero de canchas
disponibles, los precios por hora, los dias que no estaran abiertos").
S20. There is no maximum number of consecutive hours per reservation ("no hay un limite
de horas a poder reservar"); only availability limits it.

## Tasks

| ID | Specs | Route | Commit |
| --- | --- | --- | --- |
| T1 | — | Scaffold npm workspaces monorepo: `packages/core`, `apps/api`, `apps/web`, Vitest, TypeScript strict | pending |
| T2 | S3, S12, S18, S20 | Core TDD: venue time zone helpers, 24-slot grid, availability with reservations crossing midnight and closures | pending |
| T3 | S4, S6, S7, S8, S9, S16 | Core TDD: booking validation, price snapshot, cancellation window and failure-mark evaluation | pending |
| T4 | S1, S4, S11, S12, S13, S14 | API: Drizzle schema, migration, seed (3 courts, HNL prices, 24h), repositories | pending |
| T5 | S1, S14 | API: register/login with email + password, sessions, roles admin/staff | pending |
| T6 | S2, S3, S4, S11, S16, S20 | API: public availability endpoint and transactional booking with a uniqueness guarantee | pending |
| T7 | S6, S7, S8, S9, S10, S12, S15, S19 | API: panel endpoints (courts, prices, closures, arrival mark, failures per client/month, penalties, phone blocks, WhatsApp link) | pending |
| T8 | S6, S7 | API: scheduled job marking late cancellations and no-shows, plus email reminders | pending |
| T9 | S2, S3, S4, S5 | Web: PWA client flow date -> free hours -> range -> login -> confirm, and "my reservations" with cancel | pending |
| T10 | S10, S12, S14, S19 | Web: panel for admin and staff | pending |

## Log

L1 (user, verbatim): quiero crear otro proyecto, el problema es el siguiente, aqui en mi
ciudad hay varios lugares donde rentan canchas de futball pero todo lo hacen manualmente,
el cliente tiene que mandar un mensaje por whatsapp y el lugar contesta para hcer la
reserva o para responder si hay o no una chancha disponible, entonces la idea es hacer una
aplicacion donde los clientes puedan hacer sus reservas y que el sistema lo haga todo, que
notenga que esatr alguien haciendo las reservas, entonces el cliente solo entra, y mira
para cuando y a que hora hay canchas y que chancha des las que hay, hay disponibles, y si
hay disponibles pues el cliente puede hacer la reserva, esa es mas o menos la idea, quiero
que tu me ayudes a desarrollar la idea y la app, quiero que me hagas preguntas hasta
llenar los gaps y las contradiciones, recuerda usar tdd, rdd y si hace falta odd

L2 (user, verbatim, on commitment): es como la opcion de reservar de manera gratis pero si
el cliente queda mal queda como marcado pra proximas reservaciones, luego de cimplir esa
penalidad de varias reservas mascadas este cliente pues pasa a ser desmarcado y es como
uno de los demas clientes

L3 (user, verbatim, on owner panel): quiero que se haga todo manual principalmente, porque
aqui los precios son los mismos todo el tiempo, no importa si es de noche o de dia, pero
tambienquiero que el administrador osea el dueno pueda tener cierto control sobre el
sistema, que si derrepente estara cerrado el local pueda poner que no se puede reservar de
cierta ora a cierta hora o de cierta fecha a cierta fecha, que tambien el pueda bloquear
poe ejemplo a un cliente para que no pueda reservar mas cnachas, tambien que el pueda ver
que canchas estan dispobibles en que horarios pueda ver las reservas, que el puda poner los
precios a las canchas, por si en algun caso sube los precios por reservar una cancha etc

L4 (user, verbatim, on identity): con correo y contrasena, pero en el registro quiero que
tambien pongan su nombre y su numero de telefono, pra poder mandar recordatorios de que
tiene una reserva para tal ora

L5 (user, verbatim, on the grid): quiero que sea como las reservas de los cines, el cliente
puede entrar poner en que fecha quiere hacer la reserva y luego le muestra que horas hay
disponibles para esa hora, en caso de que el cliente quiera mas de una hora pude
seleccionar de tal hora a tal hora, pero cada turno es un bloque de 60 minutos osea una
hora

L6 (user, verbatim, on penalties): el dueno puede ver las personas que estan marcadas y
pueden ver en el mes cuantas veces han fallado en su reserva y el pude decidir si bloquear
o no a una persona, el pued poner cuantos dias de penalizacion quiere ponerle para que ese
cliente no pueda hacer reservas durante esa penalizacion, y tambien el dueno puede o no
quitar cuando el quiera la penalizacion

L7 (user, verbatim, on public availability): el cliente puede sin cuenta ver que horas hay
disponibles en el dia elegido pero si quiero hacer la reserva tiene nque tener una cuenta,
sin solo podra ver pero no reservar

L8 (user, verbatim, on attendance): como el cliente tiene que llegar a pagar en efectivo,
entonces en ese momento el dueno tiene que marcar como que si llego a su reserva, y las
faltas automaticas seran cuando el cliente cnacelo despues de el timepo limite para
cancelar, entonces el timepo limite para cancelar es de 3 horas antes de la hora reservada,
si el cliente no cancelo antes de esas tres oras tiene una marca automatica, pero recuerda
la marca no es lo mismo que la penalizacion, todos los que no cumplan con la reserva estan
marcados, pero la penalizacion solo la decide el dueno

L9 (user, verbatim, venue facts): empieza con tres canchas, la moneda en lempiras
hondurenos, los horarios desde las 00:00 hasta las 23:59 osea todo el dia porque es un
local 24 horas, pero recuerda qu de igual manera al dueno puede modificar estas aspectos
como el numero de canchas disponibles, los precios por hora, los dias que no estaran
abiertos, tambien quiero aclarar que no hay un limite de horas a poder reservar

L10 (decision): single venue, single owner with staff accounts; multi-tenant marketplace is
out of scope for v1.
L11 (decision): PWA instead of native apps.
L12 (decision): email reminders automatic, WhatsApp as a manual `wa.me` link.
L13 (decision): staff accounts with limited permissions exist from v1, so attendance can be
marked when someone else is at the venue.
L14 (decision): local development first; no deployment target chosen yet, so the database is
SQLite + Drizzle (portable to Postgres later).
L15 (decision): a failure mark is recorded per reservation; the monthly count is derived
from those marks, never typed by hand.

L16 (implementation): the machine has no Docker, so the persistence layer is
`node:sqlite` with explicit SQL instead of a Postgres container. This supersedes the Drizzle
part of L14; portability to Postgres now means rewriting the repository layer, not the domain.
L17 (implementation): the client cannot guess the venue time zone, so `GET /api/config` exposes
it with the currency and the limits; the browser date is never trusted for business rules.
L18 (implementation): the date strip covers seven days and an explicit date input reaches any
day inside the 30 day advance limit.
L19 (implementation): the owner needs to reactivate a court, so `GET /api/admin/courts` returns
deactivated courts for the admin only.
L20 (implementation): there is no public path to the first owner account, so `create-admin`
creates it from environment variables and is idempotent by email.
L21 (verification): 58 API tests, 10 web unit tests, `npm run typecheck` and the web build pass.
A browser smoke run (Playwright, not committed) exercised board, range selection, registration,
booking, cancellation and every panel tab against a real server.
L22 (known gaps, not part of the accepted scope): no email provider, no deployment, no rate
limit on login, and the browser smoke run lives outside the repository.

L23 (user, verbatim, round two): funciona, me gusta, pero quiero que cambias a el estilo de
hora en vez de un formato de 24 horas a uno de 12 am y pm, tambien quiero que se vea mas
profecional la pagina, porque no se se mira como algo vacia y muy cencilla, talvez para el
administrador se podria agregar un apartado de estadisticas, no se numero de clientes, no se
analiza que estadisticas se pueden sacar y me gustaria que los recordatorios fuean tambien
automaticos, que sea el sistema quien los mande, tambien dime que mas mejoras se podrian hacer
si tienes ideas

L24 (implementation): real delivery uses nodemailer through SMTP_HOST, SMTP_USER,
SMTP_PASS and MAIL_FROM, with SMTP_PORT and SMTP_SECURE optional. Without them the message
is logged and the startup line names what is missing, so development needs no mailbox.
Reminders run inside the API process every 15 minutes (REMINDER_INTERVAL_MS).
L25 (implementation): statistics default to the last 30 days; occupancy divides booked hours
by active courts x period hours minus closure hours; cash collected counts only reservations
marked as arrived, so expected and collected are always shown together.
L26 (implementation): the board opens at the current hour and keeps the court column stuck
while hours scroll; the home page gained a facts strip, day bands, a legend and a how-it-works
sequence, which is what the owner called too empty.
L27 (verification): 140 tests green (58 core, 71 API, 11 web), typecheck and build clean, and a
browser run over a demo database with 75 seeded reservations reviewed at 1440 px and 390 px.
L28 (pending): real email delivery needs the four SMTP variables, and deployment is still
undecided; both are the owner's call, not implementation gaps.
