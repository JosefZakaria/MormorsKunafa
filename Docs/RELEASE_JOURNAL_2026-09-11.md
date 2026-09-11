# Releasejournal — 2026-09-11

Status: endast lokal förberedelse är återupptagen efter ägarens paus.
Ägarens nya instruktion ersätter målfilens tidigare tillstånd till externa steg.
Ingen Vercel-åtkomst, providerinloggning, resursskapning, push, PR-publicering,
Preview-/Production-deployment eller merge får göras innan ägaren uttryckligen
säger till. Ingen produktionsåtkomst, driftändring eller påverkan på pågående köp.
Endast syntetiska data i nya lokala testdatabaser används i denna etapp.
Journalen innehåller inga hemligheter eller råa providerpayloads.

## Frysta utgångspunkter

| Kontroll | Verifierat resultat |
| --- | --- |
| Startbranch | `security-checks`, ren arbetskatalog |
| Startcommit | `2183660e81330f7c66144c8490b4aec19341ea5a` |
| `origin/main`, kontrollerad med `git ls-remote` 2026-09-11 | `33602a4417a4a1d15e44040c2acf5187d5a547d7` |
| Fjärrbranch vid start | `6bbffbff4346a705796916ff7e7fbfb4cc3da2b8` |
| Relation vid start | 0 saknade main-commits, 195 commits utöver main |
| Runtime | Lokal verifierad Node 24.18.1, npm 11.6.2 |

Den tidigare rapporten dokumenterar 179 unit-/backendtester, databas/API,
22 browserfall och mobilkontroller vid applikationscommit `da48e8e`.
Äldre kvarvarande råloggar visar andra testantal och används inte som bevis
för den slutrevisionen. Nya kod-/konfigurationsändringar verifieras separat.

## Aktuellt genomförande

- Expo uppgraderas i ordningen 54 → 55 → 56 → 57, med separat commit efter
  varje stabilt steg. Ingen force-installation eller osupportad major-override.
- SDK 55: officiell `expo@55.0.31`, React 19.2.0 och React Native 0.83.10.
  `expo install --fix` genomförd. Audit: 0 critical, 0 high, 18 moderate.
  Expo Doctor 20/20, mobil typkontroll, Android-/iOS-export och webbbygge
  passerar. Browseromprovet passerar 22/22 efter v1/v2-korrigeringen.
  Steget är sparat i `e278e86`.
- SDK 56: Expo 56.0.21, Router 56.2.20, React 19.2.3, React Native 0.85.3
  och faktisk mobil-TypeScript 6.0.3. Mobiltyper, Android/iOS-export,
  webbbygge/52 artefakter, beroende-/länkverifierare och 22 browserfall passerar.
  Audit: 0 critical/high, 14 moderate. Doctor 21/22: SDK:ns kända Hermes V1-
  minnesregression är kvar. Det är ett dokumenterat mellanläge, ingen godkänd
  release. Ingen Doctor-kontroll har undantagits; SDK 57 ska rätta felet.
- CI får tre oberoende jobb på exakt PR-HEAD med låst runtime, ren `npm ci`,
  Doctor, mobilexporter, audit och separat Ubuntu-Playwright/PostgreSQL.
- Preview får fail-closed testläge för Stripe, explicit isolerad retur/CORS
  och separat avstängning av ny Swish-checkout. Historisk avstämning bevaras.
- Metadata-only SQL, public-backup/restore och framtida RPC-behörigheter
  förstärks efter riktad syntetisk PostgreSQL-reproduktion.

| Ny commit | Avgränsning | Filstatistik |
| --- | --- | --- |
| `75d8e31` | Tre CI-jobb med exakt runtime och full isolerad matris | 2 filer, +138/-4 |
| `e278e86` | SDK 55, React 19.2.0, stödd paketmatris och Doctor/export-skript | 7 filer, +1 653/-1 598 |
| `2abedcf` | Stripe-testläge, Preview-origins, Swish-gate och separata v2-statusnycklar med v1-bevarande | 22 filer, +402/-41 |
| `344cb20` | SDK 56, Router-API, splash-plugin och RN-typanpassningar; dokumenterat Hermes-fel inför SDK 57 | 9 filer, +1 807/-2 977 |
| `eb2cd50` | Public-backup med bevarade ACL, metadatahash inklusive kolumnbehörigheter och privat funktionsdefault | 9 filer, +485/-12 |
| `47dc852` | Reproducerbart verkligt lokalt A/B-restoretest kopplat till Windows-CI | 4 filer, +179/-7 |
| `e90597a` | SDK 57 med stödd, deduplicerad native-matris och kompatibel xmldom-regel | 4 filer, +2 464/-2 522 |

SDK 57-steget passerar ren `npm ci` med Node 24.18.1/npm 11.6.2,
Expo Doctor 21/21, mobil-/backendtyper, 193 backendtester, Android-export
(1 732 moduler), iOS-export (1 648), webbbygge och kontroll av 52 artefakter.
Ny audit: 0 critical/high, 14 moderate från två grundadvisories; varje paketpost
är verifierad mot lock och installation. Kvarstående moderate, uuid-deprecation,
Vites 500 kB-varning och NO_COLOR/FORCE_COLOR-varningen hålls synliga.
Den frysta slutkandidatens fulla lokala matris och säkerhetsgranskning återstår.

Preview-/betalningsändringen har lokalt passerat 193 backendtester,
API-/Stripe-simulering, Swish-simulering med avstängd ny checkout och 22
browserfall. Det är separat lokal evidens och ersätter inte hosted-verifiering.

Backup-rättningen har passerat hela den lokala PostgreSQL-regressionen och
PowerShell-isoleringskontraktet. Det nya verkliga A/B-testet passerade på 85,8
sekunder: 1 syntetisk order, 1 rad, 100 öre betald brutto och 1 auditpost i källa
och mål; olika Storage-markörer bevarades och kolumn-ACL med grant option
återställdes. Detta är ett avgränsat test. Full ekonomisk A/B-avstämning och en
backup av verklig produktion har inte utförts eller verifierats.

## Externa förutsättningar

GitHub CLI var inte inloggad vid start. Tidigare inloggningsfrågor är nu inaktuella:
ägaren ska inte logga in som del av denna lokala etapp. Vercel- och Supabase-
inloggningssidor öppnades före pausen; ingen inloggning genomfördes och inga
nya providerresurser skapades eller användes. Vercels Git-koppling måste senare
verifieras före eventuell push, efter ett nytt uttryckligt ägarbesked.
Inga Preview-origins har godkänts. Stripe/Upstash och Supabase A/B är öppna.
Ingen 24-timmarsmätning har startats; ingen expiry påstås vara verifierad.

## Beslut som kräver namngiven människa

Samtliga rader är **ej godkända** tills beslut, ansvarig och UTC-tid anges.

| Beslutsrad | Ansvar | Status |
| --- | --- | --- |
| Bevara ekonomisk historik; historiska null-momssnapshots bedöms från originalunderlag utan automatisk backfill. | Ägare och redovisningsgranskare | Ej godkänt |
| Godkänn fält, undantag och intervall för 90/1 095 dagar; ingen muterande retention aktiveras före beslut. | Integritetsägare och redovisningsgranskare | Ej godkänt |
| Godkänn backup, oberoende restore och framåträttning; gammal backup får aldrig ersätta nya betalningar i aktiv databas. | Ägare/backupansvarig | Ej godkänt |
| Utse bemanning, omladdnings-/pollningsrutin och eskaleringsansvar när notifieringar är avstängda. | Verksamhetsägare | Ej godkänt |
| Bedöm varje kvarvarande moderate-kedja mot den slutliga auditen och nåbarhetsanalysen. | Teknisk ägare | Ej godkänt |
| Kandidaten omfattar endast kortbetalning. Swish, e-post, SMS och push ingår inte som färdiga eller verifierade funktioner. | Verksamhetsägare | Ej godkänt |

## Stoppregler

Ingen integration av förändrad main, merge, push, PR-publicering, deployment,
produktionsåtkomst, verklig betalning eller nyckelrotation i denna lokala etapp.
Det äldre målets metadata-only-förfarande är en framtida separat procedur,
inte ett tillstånd att ansluta till produktionen nu.
Den äldre `verify-security-posture.sql` läser orderdata och får därför i detta
arbete bara köras mot syntetiska testdatabaser. Ingen migration fortsätter efter
checksummefel, okänd journalpost, partiellt index eller invariantfel.
