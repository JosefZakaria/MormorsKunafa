# Dependency review — 2026-09-08

Scope: the root npm workspace lockfile, web/backend and mobile transitive dependencies. Registry/advisory queries are read-only. No `npm audit fix --force`, framework major upgrade or production installation was performed.

## Applied and checked resolutions

| Package | Previous lock | Current lock | Evidence |
| --- | --- | --- | --- |
| `@xmldom/xmldom` | 0.8.14 | 0.8.15 | [Maintainer advisory](https://github.com/xmldom/xmldom/security/advisories/GHSA-6gmq-8vp8-gcm6): XML serialization fix |
| `browserslist` | 4.28.1 | 4.28.9 | [Maintainer advisory](https://github.com/browserslist/browserslist/security/advisories/GHSA-73wf-gq98-2v4g); patched line starts at 4.28.7; related browser metadata packages updated |
| Root `postcss` | 8.5.26 | 8.5.28 | Compatible patch update; does not repair the separate mobile 8.4.49 copy |

The initial audit reported 31 affected package entries (10 high, 21 moderate). After these changes it reports 29 (9 high, 20 moderate), with no critical entry. These are dependency graph counts, not 29 independently demonstrated application exploits. Raw audit JSON is kept only in `.cache/security-test`.

## Unresolved advisories and exposure

| Package / advisory | Actual remaining version and reachability | Disposition |
| --- | --- | --- |
| `qs`, [GHSA-4mjr-xmp4-gh2g](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g), GHSA-x5fp-wj9c-mxmx | 6.15.3 through Express/body-parser. Web API dependency; the reported `parse → stringify` and comma-array configurations were not demonstrated as reachable application exploit paths. | Moderate advisory remains. 6.16.0 exists, but root overrides were ignored across workspace links; do not claim it installed. Requires a verified resolver/parent-package solution. |
| `postcss`, [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) and related source-map advisories | Mobile Metro uses 8.4.49. Repository CSS/build inputs; absent from deployed web/backend request parsing. | High package advisory remains in mobile tooling. Root override alone did not replace the workspace copy. Review before mobile build/release and before processing untrusted assets. |
| `image-size`, [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr), GHSA-5p2g-fcmc-qvqq | Mobile 1.2.1 through Metro/Expo asset processing. Public media upload handlers do not call this parser. | High dependency advisory remains; the advertised affected range includes latest 2.0.2. No verified compatible upstream fix was found. |
| `decode-uri-component`, [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Mobile 0.2.2 through CommonJS `query-string` 7.1.3/navigation; malicious deep links require separate mobile runtime validation. | Moderate. Patched 0.5.0 is ESM; replacing the CommonJS dependency without migration would break its consumer contract. |
| `uuid`, [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Mobile 7.0.3 through xcode tooling; advisory concerns caller-supplied buffers in v3/v5/v6. | Moderate. Moving to 11.1.1 is a major change, not applied automatically. |

The root override declarations must not be used as evidence of an installed fix. The observed behavior matches [npm's workspace-link override issue](https://github.com/npm/cli/issues/9659). Both the declared npm 11.6.2 and a read-only lock-resolution trial with npm 11.16.0 retained the affected workspace copies. Root package constraints are left consistent with the versions actually selected, rather than presenting an unapplied qs update as complete.

## Verification and limits

The final local build/test run uses the declared Node 24.18.1 and npm 11.6.2. The portable Node ZIP is downloaded from the official Node distribution and verified against SHA-256 `ec56b84a7551893ab2324ebdfdc4ab974a63b4781162600b68a1293cc3e53765`; both runtimes stay in the ignored cache. `npm ci --ignore-scripts` checks lockfile reproducibility, followed by `npm run check` and isolated API/browser/database verification described in the branch report.

No claim of a clean dependency audit or blanket PR/release approval is made. The mobile advisories and hosted build configuration remain review gates; the web/API qs advisory remains explicitly unresolved. A future dependency change must rerun the audit and actual consumers, not only compare the root override object.
