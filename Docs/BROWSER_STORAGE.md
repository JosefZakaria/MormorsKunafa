# Browser storage register

Policy version: 1  
Last code review: 2026-08-19

The public application does not load analytics, advertising tags, remote fonts
or embedded maps. Google Maps is an ordinary external link activated by the
user. Consequently there is no optional tracking category and no consent state
is stored. Adding any optional third-party script requires a new legal/security
review and a consent mechanism before the script is loaded.

## Persistent first-party storage

| Key | Audience | Purpose | Maximum lifetime |
| --- | --- | --- | --- |
| `mormors-kunafa-cart` | Customer | Preserve an unfinished shopping cart | 30 days from the last cart change |
| `language` | Customer | Preserve an explicitly selected language | 365 days from the last selection |
| `printer_ip` | Admin | Connect to the explicitly configured local kitchen printer | 365 days from the last save |
| `printer_devid` | Admin | Select the configured Epson printer device | 365 days from the last save |
| `admin_alarm_volume` | Admin | Preserve the explicitly selected order-alarm volume | 365 days from the last change |

All values use the versioned envelope implemented in
`apps/web/src/utils/browserStorage.ts`. Expired, malformed or unknown-version
values are deleted before use. Printer configuration accepts only a literal
IPv4 address and a bounded device identifier.

## Session-only first-party storage

| Key | Purpose | Lifetime |
| --- | --- | --- |
| `orderType` | Carry the selected fulfillment method into checkout | Current browser tab |
| `order-status-token:<order UUID>` | Authorize access to the matching customer's minimized order status | Current browser tab; server token expires after seven days and is revocable |

The legacy `deliveryInfo`, `authToken` and `adminInfo` keys are removed and are
never written by the current application.

## Strictly necessary admin cookies

| Cookie | Access | Purpose | Lifetime |
| --- | --- | --- | --- |
| `mk_admin_session` | HttpOnly | Authenticated admin session | 30 minutes |
| `mk_csrf` | Script-readable, SameSite Strict | Double-submit CSRF proof for the same admin session | 30 minutes |

Both cookies use `SameSite=Strict`, `Path=/` and `Secure` in production. Logout
expires them immediately. No customer authentication or tracking cookie exists.

## Maintenance rule

Every new use of `localStorage`, `sessionStorage`, IndexedDB or a cookie must be
added to this register in the same pull request. It must have a bounded value,
purpose, audience, retention period and deletion path. Optional storage must not
be created before valid consent, and consent refusal must be as easy as consent.
