# Security incident rotation and deployment runbook

Use this runbook with a named incident lead and the restricted incident journal.
Never paste secret values, leaked payloads or personal data into Git, tickets or
ordinary chat. Record only timestamps, owners, provider-side identifiers and
verification outcomes.

## Stop conditions

- Do not rewrite Git history before all possibly exposed credentials are
  revoked or rotated.
- Do not deploy the matching backend before its database migrations are applied.
- Do not rotate a credential until its owner knows every production/preview
  consumer and has a rollback plan.
- Do not reuse one value for multiple environment variables.

## Ordered execution

1. Make the GitHub repository private and record the containment timestamp.
2. Export available GitHub audit, visibility, secret-scanning and traffic
   evidence to the restricted journal. Preserve the metadata snapshot in
   `Docs/GITHUB_INCIDENT_EVIDENCE.md`.
3. Invalidate or rotate external provider credentials first:
   Supabase/database, Stripe, Swish certificates/credentials, Sinch, Resend,
   Google/AWS, WooCommerce/WordPress and any legacy SMTP credentials.
4. Rotate application-only values independently: `JWT_SECRET`,
   `DELETE_PASSWORD`, `STATS_PASSWORD`, `CRON_SECRET`, Upstash credentials and
   VAPID keys. Re-hash the dedicated refund password as
   `REFUND_PASSWORD_HASH`; store only the bcrypt hash with cost 10 or higher.
5. Reset admin and affected legacy user passwords. Increment/revoke existing
   admin sessions and remove old push subscriptions before enrolling known
   devices again.
6. Apply the versioned Supabase migrations in the order documented in
   `backend/src/db/migrations/README.md`, including the duplicate Stripe refund
   ledger. Run `backend/src/db/verification/verify-security-posture.sql` and
   retain its result with the deployment record.
7. Deploy backend and frontend from the reviewed branch. The user pushes; this
   runbook does not authorize an automated push or force-push.
8. Perform the checks below before reopening checkout.
9. Only after credential rotation and verified deployment, rewrite all affected
   refs from a dedicated mirror clone, coordinate every developer clone and
   contact GitHub Support about cached/orphaned objects.

### History rewrite gate

Use `scripts/Invoke-SafeHistoryRewrite.ps1` first without
`-ExecuteLocalRewrite` to validate the mirror and exact origin. Keep the mirror
outside the active workspace and make an offline recovery copy before the
confirmed local rewrite. Then:

1. Run `scripts/Test-GitHistorySanitization.ps1` against the rewritten mirror.
2. Run an independent full secret/PII scan; the targeted verifier proves only
   that the two known blobs and their known paths are unreachable.
3. Compare the expected ref inventory with the mirror and coordinate clone
   replacement with every contributor.
4. The user performs the force-push. Neither prepared script can push.
5. Verify the remote refs from a fresh clone, then ask GitHub Support to clear
   cached views and unreachable sensitive objects where applicable.

Abort before force-push if any known blob remains, a ref is missing, a rotated
secret still works, or the matching deployment has not passed its checks.

## Post-deployment checks

- Backend `/api/health` returns only the minimal production shape and never
  reports `jwtConfigured:false` or configuration diagnostics.
- Admin login works with the new password; a pre-rotation cookie/token fails.
- Direct `/privacy`, `/terms` and `/.well-known/security.txt` responses work;
  security.txt is plain text rather than SPA HTML.
- CSP, HSTS with `includeSubDomains`, nosniff, frame denial, referrer policy,
  permissions policy and COOP appear on the final `www` response.
- A Stripe test order and a Swish test order are each marked paid only after
  exact provider verification. Signed webhook replay remains idempotent.
- Ordinary item refunds and the separate duplicate-Stripe refund flow are
  tested in provider test mode, including duplicate submission and interrupted
  response reconciliation.
- The abandoned-checkout maintenance endpoint runs with the rotated cron secret
  and preserves open/paid/mismatched attempts.
- Push works only on re-enrolled known devices.
- `npm run check` passes for the exact deployed commit.

## DNS and mail follow-up

The 2026-08-19 public snapshot found no MX, no DS and no CAA, with DMARC
`p=none`. Configure and verify MX with the chosen mailbox provider, test inbound
mail to `info@mormorskunafa.se`, align SPF/DKIM, then progress DMARC after
monitoring. Enable DNSSEC/DS and narrow CAA records through the authoritative
DNS/registrar account. Preserve before/after DNS answers in the journal.

## Completion evidence

For every step record: UTC timestamp, named owner, provider/account, affected
environment, non-secret credential identifier or last-four fingerprint,
verification result, rollback decision and follow-up ticket. Link the IMY risk
assessment and accounting review without copying their sensitive contents into
the repository.
