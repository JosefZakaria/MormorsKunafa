# Public provider evidence snapshot — 2026-08-19

This snapshot records public provider material only. It does **not** prove which
plan, contract, region, retention setting or subprocessor list applies to the
production accounts. Save account-side evidence in the restricted compliance
journal; do not commit contracts containing signatures, customer identifiers or
other confidential information.

| Provider | Public evidence established | Production-account evidence still required |
| --- | --- | --- |
| Vercel | The [Terms](https://vercel.com/legal/terms) limit Hobby to personal/non-commercial use. The [DPA](https://vercel.com/legal/dpa) applies to Pro and Enterprise, identifies US/global processing, incorporates cross-border mechanisms and links the subprocessor list. | Paid plan, accepted DPA/version, data-preference opt-out, function region, logs/retention, subprocessors and EU-region feasibility. |
| Supabase | The current [DPA](https://supabase.com/downloads/docs/Supabase%2BDPA%2B260601.pdf) describes processing/transfer terms. [Regions](https://supabase.com/docs/guides/platform/regions) include Stockholm and other EU locations; [backup behavior](https://supabase.com/docs/guides/platform/backups) varies by plan/configuration. | Project region, plan, accepted DPA, backup/PITR retention, restore test and production result from `verify-security-posture.sql`. |
| Stripe | Stripe's [DPA](https://stripe.com/legal/dpa) describes processor/controller activities, global/US transfers, SCC/DPF mechanisms and subprocessors; its [provider list](https://stripe.com/legal/service-providers) is separately maintained. | Applicable Swedish merchant agreement, enabled products, accepted terms, role split, retention/export/deletion settings and current provider-list snapshot. |
| Swish/bank | Bankgirot states that participating banks are controllers and processing is governed through their agreements in its [personal-data information](https://www.bankgirot.se/om-bankgirot/kontakta-oss/behandling-av-personuppgifter/). | Merchant bank, Swish Handel agreement, Getswish/bank/processor role chain, retention, support/incident contacts and certificate owner. |
| Resend | The [DPA](https://resend.com/legal/dpa) includes EU SCCs, links subprocessors, distinguishes controller activities and states deletion within 90 days after termination. Its [region documentation](https://resend.com/docs/dashboard/domains/regions) says residency requirements still require review of the provider chain. | Accepted DPA, sending region/domain setting, message/log retention, subprocessors, deletion controls and transfer-impact decision. |
| Google Gmail | Google's [general retention explanation](https://policies.google.com/technologies/retention) describes varying deletion periods. Google publishes a [Cloud Data Processing Addendum](https://workspace.google.com/terms/dpa_terms.html) with SCC provisions for qualifying Google Workspace agreements. A public `@gmail.com` address does not by itself prove that a Workspace agreement or that addendum applies. | Confirm whether `Mormorskunafa@gmail.com` is a consumer Gmail or managed Workspace account, applicable terms/role, accepted DPA if available, region/transfers, retention/deletion, recovery access and two-step verification. Consider a managed domain mailbox if business-account evidence cannot be established. |
| Sinch | The [DPA](https://sinch.com/legal/terms-and-conditions/other-sinch-terms-conditions/data-processing-agreement/) includes SCCs and subprocessors, states a 90-day post-termination deletion period, and says Sinch is an independent controller for parts of communications delivery. | Contracting Sinch entity, EU Conversation API project/region, exact controller/processor split, log/content retention and current subprocessors. |
| Upstash | The [DPA](https://upstash.com/trust/dpa.pdf) covers processor activity and excludes restricted/sensitive data. [Compliance documentation](https://upstash.com/docs/common/help/compliance) links legal/security material and backup information. | Redis database region, TLS, eviction/retention, plan/DPA applicability, subprocessors and confirmation that only hashed rate-limit identifiers are stored. |
| GitHub | GitHub publishes [customer agreements](https://github.com/customer-terms), a [subprocessor list](https://docs.github.com/en/site-policy/privacy-policies/github-subprocessors) and SCC information. DPA scope depends on the purchased organization/team product. | Repository owner/plan, visibility, DPA applicability, secret scanning, access/audit evidence and completed incident/history cleanup. |
| Browser push providers | The application validates provider endpoints and stores only subscriptions registered by admins, but the actual browser provider is determined by each endpoint. | Reset subscriptions, re-enrol known devices, inventory endpoint origins and retain the applicable browser/provider privacy terms. |

## Approval gate

For each active provider, the controller must record the account owner, service
purpose, data categories, role, legal basis, contract/DPA version, region,
retention, transfer mechanism, subprocessors, incident deadline, deletion/export
method, annual review date and exit plan. Public availability of a DPA is not
evidence that it applies to the current account.

Do not mark the provider/DPA/TIA checklist complete until those account-specific
facts and any required transfer-impact assessment are approved.
