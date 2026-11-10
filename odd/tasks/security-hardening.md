# Endurecimiento de seguridad

Feature: close the five findings of the external security review of `reservas-canchas`
(`Evidencia.png`, read on 2026-11-04). Read until `## Log` before acting on any task here.

## Specs

S42. The auth routes do not block the event loop and do not accept unlimited attempts
("DoS por scryptSync + sin rate limiting (lo más serio)"): password hashing is asynchronous
and login, register and forgot-password have a limit per client and per account.
S43. The session cookie carries `Secure` when the deployment uses TLS ("Cookie de sesión sin
Secure"), and keeps working over plain HTTP in development.
S44. `hours` has a ceiling in the booking schema ("hours sin máximo en `createReservationSchema`
(solo `min(1)`). … poné `max(24)`"), so a giant range cannot reach the overlap queries.
S45. An uncaught exception never returns internal messages: a generic `setErrorHandler`
answers 500 without detail ("Errores 500 por defecto").
S46. No development dependency has a critical advisory: vitest moves to 5 ("Dependencias
vulnerables (dev) … actualizá a vitest 5").

## Decisions

- **Rate limits** live in `config.ts` as constants, like the other policy numbers, and are
  counted with the injected clock so tests are deterministic. A fixed window per key,
  in process, bounded: expired entries are dropped on access.
  - `login`: 10 attempts per (ip, email) and 30 per ip, window 5 minutes.
  - `register`: 10 attempts per ip, window 1 hour.
  - `forgot-password`: 5 requests per email and 20 per ip, window 15 minutes.
  - The answer is `429 { error: 'too_many_requests' }` with `Retry-After`. A limited login
    is refused even with the right password, and a limited forgot-password creates no
    token and sends no mail.
- **Limits are per ip on purpose, plus per account**, because many clients share a carrier
  NAT: the account limit is the one that stops brute force, the ip limit only stops floods.
- **Async hashing** uses `node:crypto`'s `scrypt` through `promisify`, same salt, same
  `KEY_LENGTH`, same stored format, so existing password hashes keep working.
- **`Secure` is driven by configuration**: `COOKIE_SECURE=true|false` overrides, otherwise it
  follows `NODE_ENV === 'production'`.

## Tasks

| ID | Specs | Route | Commit |
| --- | --- | --- | --- |
| T33 | S42 | API: async scrypt in `auth.ts`, await every call site (register, login, account, reset, create-admin) | done — 284d4d3 |
| T34 | S42 | API: fixed-window limiter with the injected clock, wired to login, register and forgot-password | done — 284d4d3 |
| T35 | S43 | API: `Secure` on the session and clear cookies, driven by `cookieSecure()` | done — 284d4d3 |
| T36 | S44, S45 | API: `hours` max 24 in the booking schema, generic error handler with no internals | done — 284d4d3 |
| T37 | S46 | Tooling: vitest 5, lockfile updated, whole suite still green | done — 8e41e54 |

Slice boundary: the change is 646 authored lines in two commits (lock files excluded), so the
review unit is the API commit `284d4d3`; `8e41e54` only moves a dev dependency.

## Log

L1 (user, verbatim): C:\Users\fredy\Downloads\Evidencia.png quiero que revises estas
vulnerabilidades y las corrijas

L2 (review, quoted from the image): 1. DoS por scryptSync + sin rate limiting (lo más serio).
Cada login/register/reset ejecuta scrypt sincrónicamente, bloqueando el event loop de Fastify
(~50-100ms de CPU por intento) … y no hay rate limiting en login, register ni forgot-password
(brute force + mail-bombing) … Fix: scrypt asíncrono (promisify) y un @fastify/rate-limit.
2. Cookie de sesión sin Secure … agregalo (condicional a entorno). 3. Dependencias
vulnerables (dev): vitest@3 arrastra tinypool <=2.1.1 con 2 críticas (RCE por prototype
pollution) y @vitest/mocker moderada (path traversal) … actualizá a vitest 5. 4. hours sin
máximo en createReservationSchema (solo min(1)) … poné max(24) … 5. Errores 500 por defecto:
Fastify puede filtrar mensajes internos de excepciones no capturadas. Un setErrorHandler
genérico lo resuelve.

L3 (parent, verified before writing): `npm audit` reports 3 advisories (2 critical tinypool
<=2.1.1, 1 moderate @vitest/mocker) and `npm view vitest version` answers 5.1.0, so the review
is accurate on all five points. The limiter is hand-rolled instead of `@fastify/rate-limit`
because the project keeps its policy numbers in `config.ts` and its tests drive an injected
clock; a new dependency would also be a delivery risk the finding never asked for.

L4 (execution): the package-owned writer could not prepare the repository ("Writer repository
preparation was unavailable or its session/target changed"), so the work was done inline and
that fallback is reported. One deviation from the original plan: the concurrency test uses 8
simultaneous logins instead of 20, because the new per-account limit refuses the eleventh. The
asynchronous hashing itself is pinned by asserting that `hashPassword` returns a Promise and
keeps the `scrypt:salt:hash` format. Results: core 58, API 122, web 26, typecheck clean, web
build green, `npm audit` 0 vulnerabilities.

L5 (verification, 2026-11-04): the independent read-only review returned PASS on S42 through
S46 with no blockers and five advisories, and four were closed in the same round. `trustProxy`
was off, so behind the reverse proxy that S43 itself assumes every client shared the proxy
address and the per-ip limits became a venue-wide cap; `TRUST_PROXY=true` now feeds Fastify
the forwarded address, off by default because a direct deployment would let any client forge
it. A successful login counted against the account limit, so ten honest sign-ins ended in
429; a right password now resets that account's counter. The register limit ran before the
schema, so ten malformed bodies spent the hourly budget; the schema runs first, as in login.
`REGISTER_PER_IP_LIMIT` went from 10 to 30 per hour, because registration is one-shot and the
flood it stopped is now cheap to absorb. Kept and documented instead: the counter lives in
the process (a restart clears it, two instances do not share it), the 4xx body for a malformed
JSON payload is now `{error:'invalid_request'}` instead of Fastify's own shape with the status
unchanged, and a production deployment over plain HTTP must set `COOKIE_SECURE=false`. A hash
written by the old synchronous scrypt still verifies, which a test now pins so nobody has to
reset a password after the deploy.
