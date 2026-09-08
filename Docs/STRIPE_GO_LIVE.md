# Stripe rollout verification

Status 2026-09-08: future authorized operator work. The branch work used simulated Stripe responses only; it did not make a real payment, publish a webhook or change a merchant account.

The customer first creates an order with an `Idempotency-Key`. The server selects authoritative product/variant prices, location stock and delivery fee. It returns an order-bound status capability. Starting Checkout and reading customer status require that capability; a UUID alone does not grant access. The backend reserves one Checkout attempt and verifies amount, currency, order, method, mode and stored session identity before recording payment.

Configure Production secrets only in Production. Preview requires an independent backend/database/merchant test environment and isolated same-origin API rewrite; the checked-in web rewrite otherwise reaches the production backend. Do not copy `.env` or production credentials into Preview. See [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md).

The production web client uses `/api` through its proxy. Set backend `PUBLIC_WEB_APP_URL` explicitly to the matching web origin; `VITE_API_BASE_URL` is not a production cross-origin switch and `VITE_STRIPE_PUBLIC_KEY` is unused for hosted Checkout. Refunds require a bcrypt `REFUND_PASSWORD_HASH` with cost at least 10, scoped authorization and order-bound confirmation.

The merchant webhook endpoint is `/api/stripe/webhook`. Subscribe to `checkout.session.completed`, `refund.created`, `refund.updated` and `refund.failed`, with the signing secret for that endpoint and environment. A live processing lease returns `503` with `Retry-After`; a completed event can be acknowledged as a duplicate. Do not treat every non-200 as proof the payment failed, or every health 200 as proof the integration works.

Before rollout, verify in a separately approved provider sandbox: checkout/return, duplicate clicks, provider timeout, delayed and reordered webhooks, partial/full refunds, concurrent refund reservations and accepted-response loss. After provider idempotency expiry, recover a canonical matching refund; an absent/ambiguous match must stay pending for manual reconciliation rather than create another transfer. Repeat with payments initiated by the previous version. Status-token/old-client incompatibility remains a deployment gate.

Any later real-money smoke test needs a named operator, order/payment/refund references, expected totals and reconciliation evidence in a restricted journal. It was not performed in this task. Confirm both database state and provider state, plus optional email delivery; notifications are not the payment ledger. Preserve new financial records during recovery as described in [the branch report](SECURITY_BRANCH_REVIEW.md).
