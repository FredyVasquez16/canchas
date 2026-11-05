# Recuperar contraseña y entrar con Google

Feature: a client who forgot the password recovers the account by a single-use link sent to
their email, and the sign-in screen offers Google when the venue has Google credentials.
Read until `## Log` before acting on any task in this document.

## Specs

S31. A client who forgot the password recovers it through a link sent to their email
("Link por email"). The link opens `#/nueva-clave?token=...`, expires 60 minutes after it
was requested and works exactly once.
S32. Asking for the link always answers the same (202), whether or not the email has an
account, so the screen never reveals which emails are registered.
S33. The new password needs at least 8 characters. Completing the change closes every
session that existed before it and leaves the session that made the change open.
S34. A link that expired, was already used or was invented is refused with `invalid_token`,
and the screen offers to ask for another one.
S35. The recovery mail leaves through the same channel as the reminders (S24): SMTP when it
is configured, and without SMTP the message is written to the API log.
S36. "Iniciar sesión con Google" is implemented and off ("Sin Google por ahora"): the button
only appears when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set; without them
the app does not offer it and the flow answers `google_not_configured`.
S37. A Google account is identified by its verified email: an existing account with that
email is linked, and otherwise a client account is created without a usable password.
S38. After the Google consent screen the account asks for name and phone on
`#/completar-perfil` ("No hay sesión usable hasta cargar el teléfono"); without a phone the
API refuses a reservation with `phone_required`.
S39. The Google flow carries a signed `state` in an httpOnly cookie, so a callback that this
browser did not start cannot sign anyone in.
S40. A Google account cannot sign in with email and password until it sets a password
through the recovery flow.

## Tasks

| ID | Specs | Route | Commit |
| --- | --- | --- | --- |
| T26 | S31, S32, S33, S34, S35 | API: `forgot-password` and `reset-password` with a single-use hashed token, rotation and session invalidation | done — 20ce061 |
| T27 | S36, S37, S39 | API: Google OAuth start and callback behind env credentials, account linking and signed state | done — 20ce061 |
| T28 | S38, S40 | API: `phone_required` gate on booking, so a Google account completes its profile first | done — 20ce061 |
| T29 | S31, S32, S34 | Web: "¿Olvidaste tu contraseña?" and `#/nueva-clave` screens | done — a880fb3 |
| T30 | S36, S38 | Web: Google entry only when enabled, `#/completar-perfil` route and its gate | done — a880fb3 |
| T31 | — | Docs: README environment variables and routes, decisions recorded | done — README and this document |

## Log

L1 (user, verbatim): quiero que continuemos con el proyecto de las canchas, quiero que
implementes para poder rcuperar la contrasena en caso de que el cliente la haya olvidado, y
que se pueda iniciar sesion con google

L2 (user, chosen option, verbatim): Link por email. Preview authoring: token de un solo uso
por correo; sin SMTP configurado el link se imprime en el log de la API.

L3 (user, chosen option, verbatim): Sin Google por ahora. Preview authoring: hago solo la
recuperación de contraseña y dejamos Google para cuando tengas credenciales; entrego
recuperación de contraseña completa y dejo el trabajo de Google listo pero apagado (feature
flag por variables de entorno).

L4 (user, chosen option, verbatim): Pedirlo en el mismo alta. Preview authoring: después del
consentimiento de Google, una pantalla pide el teléfono antes de terminar el alta; no hay
sesión usable hasta cargar el teléfono.
