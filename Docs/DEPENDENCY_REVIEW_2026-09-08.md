# Dependency review — 2026-09-08 (updated 2026-09-09)

Scope: the root npm workspace lockfile, web/backend and mobile transitive dependencies. Registry/advisory queries are read-only. No `npm audit fix --force`, framework major upgrade or production installation was performed.

## Applied and checked resolutions

| Package | Previous lock | Current lock | Evidence |
| --- | --- | --- | --- |
| `@xmldom/xmldom` | 0.8.14 | 0.8.15 | [Maintainer advisory](https://github.com/xmldom/xmldom/security/advisories/GHSA-6gmq-8vp8-gcm6): XML serialization fix |
| `browserslist` | 4.28.1 | 4.28.9 | [Maintainer advisory](https://github.com/browserslist/browserslist/security/advisories/GHSA-73wf-gq98-2v4g); patched line starts at 4.28.7; related browser metadata packages updated |
| Root `postcss` | 8.5.26 | 8.5.28 | Compatible patch update; does not repair the separate mobile 8.4.49 copy |
| Express / `body-parser` / `qs` | 4.22.2 / 1.20.6 / 6.15.3 | 5.2.1 / 2.3.0 / 6.16.0 | Express 5 migration plus scalar query parsing, body/routing compatibility tests and direct regressions for [GHSA-4mjr-xmp4-gh2g](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g) and [GHSA-x5fp-wj9c-mxmx](https://github.com/ljharb/qs/security/advisories/GHSA-x5fp-wj9c-mxmx) |
| `js-yaml` | 3.15.1 / 4.3.1 | 3.15.2 / 4.3.2 | Both supported majors now count empty merge sources against `maxTotalMergeKeys`, fixing [GHSA-2883-xcg3-v3hh](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh) |
| Expo SDK 54 patch line | Expo 54.0.25 and older SDK-compatible modules | Expo 54.0.37, Router 6.0.24 and the matching Constants/Font/Gradient/Linking/Splash/StatusBar/WebBrowser patches | Matches Expo's [SDK 54 bundled-module map](https://github.com/expo/expo/blob/5b42e3d21e0ac5e086752361ca8a5cb4de53bec1/packages/expo/bundledNativeModules.json); Expo Doctor passes 18/18 and both native-platform exports bundle |
| React / React Navigation | duplicate React 19.1.0/19.2.3 and Navigation 7.1.22 | one React/React DOM 19.1.0 and Navigation 7.3.18 | Removes native-module duplication while retaining the SDK 54 React version; this compatibility alignment does not resolve the transitive query-string advisory |

The 2026-09-08 review ended at 29 affected package entries (9 high, 20 moderate). A fresh 2026-09-09 audit reported 30 (10 high, 20 moderate), including the newly published `js-yaml` advisory. After the Express/qs and js-yaml fixes it reports **26 entries: 9 high, 17 moderate and 0 critical**. These are dependency-graph counts, not 26 independently demonstrated application exploits. Raw audit JSON is kept only in `.cache/security-test`.

## Unresolved advisories and exposure

| Package / advisory | Actual remaining version and reachability | Disposition |
| --- | --- | --- |
| `postcss`, [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) and related source-map advisories | `@expo/metro-config@54.0.17` requires the 8.4 line and installs 8.4.49. Metro reads repository/dependency CSS during build; deployed web/backend requests and public media uploads do not feed it CSS. | High package advisory remains in mobile tooling. The patched line begins after 8.5.22 and is outside the SDK 54 parent range. Do not force the incompatible root copy into this chain; review untrusted build inputs and re-evaluate with a supported Expo update. |
| `image-size`, [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr), GHSA-5p2g-fcmc-qvqq | `@expo/metro@54.2.0 → metro@0.83.3 → image-size@1.2.1`; used for repository/dependency assets during Metro builds. Public media upload handlers do not call this parser. | High dependency advisory remains; the affected range includes every published version through latest 2.0.2. No compatible upstream fix exists to install today. |
| `decode-uri-component`, [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | `expo-router@6.0.24 → query-string@7.1.3 → decode-uri-component@0.2.2`. The package chain is installed, but Expo Router's inbound `getStateFromPath` fork parses queries with `URL`/`URLSearchParams`; no current inbound call to `decodeUriComponent()` was demonstrated. A valid query and a bounded malformed query pass through that actual fork helper. | Moderate dependency advisory remains, with application reachability unproven. `query-string` is still used by Expo Router's outbound path serializer, while patched `decode-uri-component@0.5.0` is outside its CommonJS parent range. Do not force the incompatible substitution; re-evaluate with a supported Router update and validate links on devices. |
| `uuid`, [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | `@expo/config-plugins@54.0.5 → xcode@3.0.1 → uuid@7.0.3`; build/config-plugin tooling only. The repository has no call to the affected v3/v5/v6 buffer APIs. | Moderate tooling advisory remains. Patched 11.1.1 is an unsupported major substitution for the parent, so it was not forced into SDK 54. |

An override declaration alone is not evidence of an installed fix. The earlier behavior matches [npm's workspace-link override issue](https://github.com/npm/cli/issues/9659), and the incompatible mobile PostCSS copy still demonstrates the boundary. `scripts/verify-dependency-security.mjs` therefore checks the installed copies of reviewed direct packages and performs lock-wide assertions for qs, undici, both js-yaml majors, and deduplicated React/React Navigation. The qs override is now supported by Express 5's parent ranges and is actually installed; the mobile PostCSS override is not claimed to repair the incompatible nested copy.

## Verification and limits

The local runs use the declared Node 24.18.1 and npm 11.6.2. The portable Node ZIP is downloaded from the official Node distribution and verified against SHA-256 `ec56b84a7551893ab2324ebdfdc4ab974a63b4781162600b68a1293cc3e53765`; both runtimes stay in the ignored cache. Verification includes lockfile reproduction with lifecycle scripts disabled, installed-tree checks, direct qs/js-yaml regressions, Expo's dependency check, Expo Doctor 18/18, mobile TypeScript, an Expo Router inbound-query smoke test, and Android/iOS Metro exports. Native iOS signing/device execution still requires macOS/EAS and remains external.

No claim of a clean dependency audit or blanket PR/release approval is made. The four underlying mobile advisory chains remain review gates. A future dependency change must rerun the audit and actual consumers, not only compare manifest declarations.
