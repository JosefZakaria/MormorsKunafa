# Production service and rotation inventory — 2026-08-20

This is a code- and owner-confirmed preparation record. It contains no secret
values and does not prove the production account configuration. Rotation,
deployment, account changes and mail tests remain deferred and supervised.

## Current service decisions

| Service | Status | Code-verified use | Supervised action later |
| --- | --- | --- | --- |
| Supabase | Owner confirms active, Free plan | Primary application database and service-role API | Create and restore-test the manual safety dump first; rotate database/service credentials; update every Vercel environment; apply and verify migrations only in the approved night window |
| Vercel | Owner confirms active, Hobby plan | Hosts separate Vite web and Express API projects, rewrites `/api`, runs daily cleanup cron | Current Hobby terms do not fit the commercial store; hosting decision is deferred. Until then record model-training preference, regions and every production/preview variable before rotation |
| Stripe | Owner confirms active | Card checkout, signed webhooks, payment reconciliation and refunds | Rotate secret/restricted keys and webhook signing secret; configure the exact new endpoint events; test payment, replay, partial/full refund and duplicate-payment refund in test mode |
| Sinch | Owner confirms active | Transactional SMS; code requires an explicit `eu`, `us` or `br` API host | Rotate API key pair; prove the production Conversation API app uses the EU region before deployment |
| Resend | Owner confirms active | Order/receipt email | Rotate API key; retain sending-domain evidence; verify non-PII test delivery after deployment |
| Upstash | Account status unknown; required by the hardened production code | Distributed rate limiting and single-use realtime tickets; production startup fails closed without both variables | Check Vercel for the two variable names and identify the owning account. Rotate if present; if absent, provision/approve a production Redis decision before deploying the hardened backend |
| Web Push/VAPID | Operational status unknown | Optional admin push; private VAPID key signs notifications | Check whether all three `WEB_PUSH_*` values exist. If the private key was exposed, rotate the pair, clear subscriptions and enrol only known devices |
| Gmail | Public contact selected; verification deferred | Receives customer service, complaint, privacy and security contact | Enable account recovery/2-step verification and test inbound/outbound delivery later; never assume a consumer Gmail account has a Workspace DPA |
| Swish | Owner confirms inactive | Checkout UI is compile-time disabled; backend support remains dormant | Revoke/delete any legacy certificate, key and environment values. Do not create replacement production credentials |
| Google/AWS | No active secret-consuming integration found | Current Google Maps use is an ordinary public URL; no AWS SDK/API integration is present | Revoke only credentials found in the old leak or an account inventory; do not create replacements without a real use |
| WordPress/WooCommerce | Owner believes inactive; migration code is legacy-only | No current runtime dependency | Revoke remaining admin/API/SMTP credentials and remove old accessible installations if account review finds them |
| Local receipt printer | Owner says it is not used; staff reads orders on a tablet | Printer code and `PRINTER_IP` remain optional | Keep the variable unset. No paper-destruction routine is required unless printing is activated later |

## Public DNS snapshot

Read-only DNS checks on 2026-08-20 established:

- authoritative nameservers are `pdns1.registrar-servers.com` and
  `pdns2.registrar-servers.com`, identifying the active DNS as Namecheap rather
  than GoDaddy;
- root SPF is `v=spf1 include:spf.easywp.com ~all`;
- Resend's `send.mormorskunafa.se` return-path has MX to
  `feedback-smtp.eu-west-1.amazonses.com` and SPF
  `v=spf1 include:amazonses.com ~all`;
- `resend._domainkey.mormorskunafa.se` publishes a DKIM public key;
- DMARC remains `v=DMARC1; p=none;`;
- the root has no receiving MX and no DS answer. Public complaints therefore
  depend on the selected Gmail address, whose delivery test is still deferred.

The DNS proves that the Resend SPF return path and DKIM records exist; it does
not prove that the live Resend account shows the domain as verified or that a
sample message passes aligned SPF/DKIM/DMARC. Preserve message headers from the
later non-PII delivery test before moving DMARC from monitoring to enforcement.
No DNS record was changed by this review.

## Rotation evidence rule

For each rotated credential record only provider, account owner, environments,
UTC rotation time, a non-secret identifier/last-four fingerprint, consumers
updated, old-credential rejection and rollback result. Never record the value.
Rotate provider credentials before application-only secrets, deploy once from
the reviewed commit, then prove every old credential/session fails.
