# Live security verification — 2026-08-19

Read-only checks were run against the public production URLs at approximately
18:54 Europe/Stockholm. No deployment or account state was changed.

## Confirmed live

- `https://mormorskunafa.se/*` redirects with HTTP 307 to the `www` host.
- The final `www` host responds over HTTPS and sends
  `Strict-Transport-Security: max-age=63072000`.
- `/`, `/privacy` and `/terms` return HTTP 200. The latter two currently use the
  SPA fallback; rendering of their final client-side content was not counted as
  browser-verified because no controllable browser was available.
- The only script and stylesheet referenced by the live HTML contained no
  private-key block, AWS key, Google API key, Stripe secret-key pattern or known
  server-only environment-variable name.
- Neither live asset contains a `sourceMappingURL` reference. Requests for both
  corresponding `.map` URLs returned HTTP 403, so no source maps were exposed
  for the deployed entry assets.

## Confirmed production blockers

- The backend health endpoint returned a diagnostic development-shaped payload
  containing `"jwtConfigured":false`. The new production health response and a
  valid production `JWT_SECRET` have therefore not been deployed.
- Final frontend responses lacked the locally configured CSP,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` and COOP headers.
- `https://www.mormorskunafa.se/.well-known/security.txt` returned the SPA HTML
  document rather than `text/plain` security contact data.
- The live HTML still loads Google Fonts from `fonts.googleapis.com` and
  `fonts.gstatic.com`; the committed self-hosted-font change is not live.
- The live HSTS header did not include the committed `includeSubDomains`
  directive.

These findings are consistent with an older frontend/backend deployment. Do not
mark local fixes as production-complete until the required migrations,
environment rotation and deployments are performed in the documented order.

## Scope limits

The Windows TLS client successfully negotiated TLS 1.2, but its local Schannel
policy could not offer TLS 1.0 or 1.1. This does not prove the server rejects
those protocols, so the combined HTTPS/HSTS/modern-TLS checklist item remains
open. A real browser/accessibility pass and production account checks also
remain open.
