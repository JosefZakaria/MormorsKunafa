# Security branch integration plan

Integrate GitHub main `385b7a7` with local security-checks `6ba4105` on `fix/security-main-integration`. Implementation and verification remain local; production deployment and provider changes are separate.

1. Resolve backend contracts: authoritative delivery quotes, required email, atomic/idempotent creation, one notification path per paid transition, minimal private order status.
2. Integrate current main migrations into fresh and phased upgrade manifests. Test upgrades from the current main schema, preserving historical financial data and edited delivery prices.
3. Preserve current checkout layout/retry behavior, resilient order alarm and per-location printing while retaining session, storage, privacy and refund protections.
4. Update regression tests and CI: delivery, alarms/printers, checkout replay after quote changes, synthetic VAPID build configuration, and PR merge-result checkout.
5. Verify the combined candidate with clean install, check, database, API, browser, backup/restore and mobile checks. Review the final diff and record exact results before declaring it locally ready.

## Invariants

- No client-authoritative product or delivery prices; preserve frozen order totals and delivery terms.
- No duplicate order/payment/notification caused by retries or integration.
- No weakening of location scope, cookie/CSRF/session revocation, order capabilities, accounting immutability or durable outbound jobs.
- Preserve required email, mobile checkout fields, removed delivery information box, delivery-price retry and location-specific printer settings.
- Local synthetic tests never contact real messaging/payment services or production databases.

## Results

All five implementation steps and local verification are complete. No unresolved
integration defect was found in the final reviewed/tested candidate. This is a
locally verified candidate for PR/hosted CI, not a guarantee of a risk-free merge
or a production deployment approval.

The integrated candidate preserves main's delivery settings, required email,
checkout layout, order alarm and per-store printers. It retains security's
atomic/idempotent checkout, private status capabilities, scoped realtime tickets,
durable outbound jobs and refund authorization. A paid transition uses one
notification dispatcher. Delivery terms are frozen with the order; committed
replays precede mutable quote checks. A rejected quote may be explicitly retried.

Free delivery needed an additional migration and changes to refund overview and
restore verification: a single non-product delivery row may have price zero;
products remain positive, and zero-value lines cannot be selected in the refund
UI. Upgrade tests now include an existing free-delivery row and edited prices.

CI checks the actual PR merge result and runs the main delivery/alarm tests too.
Browser builds generate an ephemeral public VAPID key. The API test adapter uses
real isolated PostgreSQL, but substitutes provider transports and PostgREST;
hosted behavior and physical devices remain separate release checks.

Expo Doctor identified four SDK 57 patch mismatches. Updated Expo to 57.0.25,
Constants to 57.0.19, Linking to 57.0.11 and Router to 57.0.23 with the lockfile.
Reviewed upstream [Expo](https://github.com/expo/expo/blob/sdk-57/packages/expo/CHANGELOG.md),
[Constants](https://github.com/expo/expo/blob/sdk-57/packages/expo-constants/CHANGELOG.md),
[Linking](https://github.com/expo/expo/blob/sdk-57/packages/expo-linking/CHANGELOG.md) and
[Router](https://github.com/expo/expo/blob/sdk-57/packages/expo-router/CHANGELOG.md)
release notes. No SDK major upgrade or opt-in native lifecycle change is enabled.

## Verification record (2026-09-29)

GitHub main was rechecked during final verification and remains
`385b7a766e6d9fd4ce23c0472bb263634dd15a49`. The integrated security source is the
local `6ba410508fce640e82515a3ba4e634efdace7292`, not the older remote branch.

| Check | Result |
| --- | --- |
| Clean install of final lockfile, Node 24.18.1 / npm 11.6.2 | Passed, 789 packages |
| `npm run check` | Passed; 12 shared + 209 backend + 11 push-worker + 12 alarm + 3 printer tests, web build and mobile typecheck |
| `npm run test:db` | Passed fresh install and phased current-main upgrade, preserved free-delivery history/prices, accounting and ACL checks |
| `npm run test:api` | Passed all six suites, including the new delivery integration and refund overview |
| `npm run test:backup-restore` | Passed independent PostgreSQL source/target restore including a free-delivery item and unchanged accounting totals |
| `Test-PostgresConnectionIsolation.ps1` | Passed |
| `npm audit --package-lock-only --audit-level=high` | Passed gate: 0 high/critical; 14 moderate findings remain |
| Expo Doctor | Passed 21/21 |
| Android export | Passed |
| iOS export | Passed |
| Final browser run | 26/26 passed, desktop and Pixel 7 Chromium, 5.9 minutes |

Local logs are retained under the original repository's ignored `output/`:
`integration-final-install.log`, `integration-final-check.log`,
`integration-api.log`, `integration-restore.log`, `integration-audit.json`,
`integration-final-mobile.log` and `integration-final-browser.log`.
An earlier browser run failed on a test-selector encoding error, leaving pending
orders that obstructed later tests; the selectors were corrected before the final
run. Tests use synthetic customers, isolated PostgreSQL 17.11 and simulated
payment/messaging transports. The API adapter's generic SQL error code differs
from hosted PostgREST, so the missing-schema test asserts denial without claiming
an identical hosted error mapping.

Hosted CI, real provider/device behavior, deployed schema and rollout sequencing
are not established by local verification. The existing main checkout and other
worktrees remain untouched.

### Hosted PR verification (2026-09-29)

PR #123 is open for `fix/security-main-integration`; it has not been merged.
At commit `818bece`, GitHub build-and-test and integration-windows passed.
The Ubuntu browser job failed before tests started because PostgreSQL tried to
create its Unix socket lock under the runner's unwritable `/var/run/postgresql`.
The test harness now disables Unix sockets explicitly, retaining authenticated
IPv4 loopback connections, and asserts the effective setting. Fresh and phased
database tests passed locally after this correction; Linux CI must verify it.

Vercel's frontend Preview failed with `PREVIEW_API_ORIGIN must be an explicit
HTTPS origin without a path`. The committed Preview allowlist is intentionally
empty until an isolated backend's database, Upstash and providers are verified.
A successful backend deployment alone does not establish that isolation. This
external Preview prerequisite remains open; do not bypass the guard or point
Preview at Production to clear the check. No production migration or manual
deployment was performed.
