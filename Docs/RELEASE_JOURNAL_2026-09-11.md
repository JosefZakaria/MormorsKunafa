# Releasejournal — 2026-09-11

Status: den lokala förberedelsen efter ägarens paus är slutförd.
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

- Expo uppgraderades i ordningen 54 → 55 → 56 → 57, med separat commit efter
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
Den fulla slutmatrisen och källgranskningen är klara; verktygets partial-flagga förklaras nedan.

Preview-/betalningsändringen har lokalt passerat 193 backendtester,
API-/Stripe-simulering, Swish-simulering med avstängd ny checkout och 22
browserfall. Det är separat lokal evidens och ersätter inte hosted-verifiering.

Backup-rättningen har passerat hela den lokala PostgreSQL-regressionen och
PowerShell-isoleringskontraktet. Det nya verkliga A/B-testet passerade på 85,8
sekunder: 1 syntetisk order, 1 rad, 100 öre betald brutto och 1 auditpost i källa
och mål; olika Storage-markörer bevarades och kolumn-ACL med grant option
återställdes. Detta är ett avgränsat test. Full ekonomisk A/B-avstämning och en
backup av verklig produktion har inte utförts eller verifierats.

## Slutlig lokal överlämning

Slutlig lokal kodkandidat: `ec04965833c8a6667e6886d3509757dc2e3b55e6`. Hela den lokala matrisen passerar
med Node 24.18.1/npm 11.6.2: vanlig ren `npm ci`, säkerhetsverifierare, webbbygge,
193 backendtester (0 fel/överhoppade), mobiltyper, Doctor 21/21,
Android-/iOS-export, PostgreSQL, anslutningsisolering, API-/betalningssimulering,
verklig oberoende lokal backup/restore och 22/22 browserfall. Audit: 0 critical,
0 high, 14 individuellt analyserade moderate-poster utan ägarens riskgodkännande.
Råbevis och tidsstämplar finns i ignorerade `.cache/security-test/verified-*`
och `final-local-matrix-results.json`. Dokumentationsändringar efter denna
kodkandidat kräver inte omkörning av oförändrad kod.

Den nya förseglade Codex Security-granskningen `eab014d1-3da0-4ed5-a3e0-fe8e67e5b403` omfattar den
oföränderliga diffen `33602a4417a4a1d15e44040c2acf5187d5a547d7..2d200f0c45b5a37cf53d8edf480437454cf54868`: **315 ändrade paths**,
271 kompakta inventeringsobjekt plus 44 kompletterande paths. Alla paths är
genomgångna inom uttryckliga undantag och inga rapporterade sårbarheter återstår.
Den förseglade rapportens täckningsflagga är dock **partial**: slutverktyget
behöll två gamla checkpointposter om ej färdig discovery/validering. Sista
accepterade slututkastet hade complete och tom deferred-lista; kandidatens
validering och attackbeslut ignore var redan registrerade. De gamla posterna
motsvarar inte kvarvarande granskningsarbete. Rapporten ändras inte i efterhand;
detta påstås inte vara en förseglad complete-status. Tre oberoende granskare täckte klient, runtime/CI
och databas; huvudgranskaren täckte återstående filer. En separat granskare
reproducerade hjälpskriptets råa adressutskrift med syntetiska värden. Kandidaten
undertrycktes uttryckligen i attackanalysen: endast operatörens skyddade lokala
Git-konfiguration, utan visad lägre behörighetsnivå eller privilegieökning.
Utskriften togs ändå bort som försiktighetsåtgärd efter skanningen.

Det borttagna `backend/backend.zip` granskades endast som Git-metadata; dess
innehåll är uttryckligen undantaget. Historiska dump-/arkivblobbar är fortfarande
nåbara i Git-historiken. Ingen rådata, historikomskrivning eller nyckelrotation
ingick. Full täckning av denna diff är inte ett bevis att produktionen är säker.
De efterföljande två små skripträttningarna har separat oberoende diffgranskning
och ovanstående fulla lokala matris på `ec04965`. Skanningens låsta hash ändras inte.

Skannerns slutmetadata redovisar mätt användning (coverage=complete):
25 432 799 totalTokens, 25 317 214 inputTokens och 24 029 184 cachedInputTokens,
från codex_rollout över sju tasks. Detta är verktygets tokenmått inklusive
cachad kontext, inte ett kostnadsestimat eller ett påstående om complete-kodtäckning.

Dokumentationscommit `2d200f0` föregår den förseglade skanningen.
Efterföljande lokala kodcommits:

- `40e73d5 fix(test): retry transient Windows cluster cleanup locks`
- `ec04965 fix(ops): omit remote URLs from history preflight output`

Ändringsstatistik från start `2183660` till `ec04965`: 55 files changed, 6128 insertions(+), 5562 deletions(-).
Relation till fryst main: 0 saknade och 205 egna commits.
Fjärrstatus har inte uppdaterats under den lokala etappen. Dokumentationscommitten
som innehåller denna överlämning tillkommer efter testad kod och anges i slutmeddelandet.

Första slutmatrisen vid `2d200f0` hade godkända restoredata men exit1 vid
Windows-städning (`EBUSY`). Den körningen bevaras som misslyckad i
`final-candidate-results.json`. Tre begränsade återförsök rättar den reproducerade
transienta fillåssituationen; permanent lås är fortsatt ett fel. Ny full matris
passerar även restore/städning. Den äldre restkatalogen utan ägarmarkör lämnas orörd.

**Beslut: lokal etapp klar; NO-GO för merge/deployment.** Externa checklistan
har 0/71 avprickat, och sex ägarbeslut är öppna. Ingen PR eller hosted CI-länk
finns. Ingen Preview, ingen push eller produktionstestning. Fysisk skrivare är
inte verifierad: webbläsarens CSP kan blockera HTTP till LAN-skrivare, och backendens
standard-IP gör att saknad PRINTER_IP inte ensam bevisar avstängning. Den framtida
övergångens fail-closed-fönster är inte godkänt och ger inget nollavbrottslöfte.

Under slutmatrisen kunde Node-startad Windows PowerShell först inte hitta
Get-FileHash eftersom pwsh 7:s PSModulePath följde med. Endast den ignorerade
körarens ärvda modulsökväg rensades; kod/konfiguration/lock var oförändrade.
Redan godkända kontroller på samma commit återanvändes, medan den felande
isoleringskontrollen och återstående steg kördes med korrekt miljö. Första
felet och omprovets resultat behålls separat i loggar och previousAttempts.

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
