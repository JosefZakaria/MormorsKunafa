# Releasejournal — 2026-09-11, ersättande status 2026-09-12

## Ersättande status — 2026-09-12

Det nya målet i [LOCAL_GOAL_OBJECTIVE.md](LOCAL_GOAL_OBJECTIVE.md) ersätter
motstridiga scope- och färdigpåståenden nedan. Den daterade 2026-09-11-posten
bevaras som historik för den då testade kandidaten; den ger inte tillstånd till
externa steg och är inte ett godkännande av dagens lokala ändringar.

Nuvarande branch är `security-checks`. Verifierad historisk kodkandidat är
`ec04965833c8a6667e6886d3509757dc2e3b55e6`; `a119c99` ändrade därefter bara
dokument. Arbetskatalogen innehåller 2026-09-12 lokala implementationer där
standard-`Ta emot` bevarar lagrad `estimated_ready_at`/`scheduled_at`, en
uttrycklig plus/minusjustering flyttar klartiden, framtida betalda
förbeställningar finns i mottagningskön och förgrundslarmet härleds från hela
väntande kön utan separat `Tysta`-kvittering. De är **implementerade och
verifierade lokalt** tillsammans med den beständiga meddelande-outboxen,
arbetaren, det skyddade maintenance-anropet och personalvyn för kvarstående
utskicksfel. Detta är inte ett releasegodkännande: schemalagd körning, verklig
leverans och hela den fysiska bakgrundslarmkedjan återstår.

### Verifierat

- Den nya arbetskatalogen passerade ren `npm ci` och `npm run check`: webbbygge,
  mobiltypkontroll och 206/206 backendtester. Expo Doctor passerade 21/21,
  Android- och iOS-export lyckades och audit gav 0 critical, 0 high och
  14 moderate utan brytande automatisk fix.
- `test:db`, `test:api`, PostgreSQL-isolering och backup/restore passerade.
  Ett nytt identiskt A/B-restoreprov tog 80,506 sekunder och verifierade
  `orders=1`, `items=1`, `paidGrossOre=100`, `audit=1`, en Storage-bucket,
  mål-sentinel samt bevarad ACL- och säkerhetsmetadata.
- Riktat admin-Playwright passerade 4/4 och full desktop-/mobilsvit 22/22. En
  tidigare fullkörning visade att det korrekta orderlarmet blockerade testets
  logout; testet ändrades till att ta emot ordern via produktionsflödet utan att
  dölja eller försvaga larmet.
- En första ny security scan reproducerade två driftsfel utan säkerhetspåverkan:
  Resend-transportfel utan HTTP-status behövde vara retryable och
  leveransordrars utskicksfel behövde använda samma ansvarsscope som orderkön.
  Båda rättades; därefter passerade 206/206 backendtester och hela `test:api`.
- Slutscan `8a3fdec0-93a2-4fcb-a10e-3d1cf051aced` förseglade snapshot
  `codex-security-snapshot/v1:sha256:95f4bc1909b3e0c7ff13d046f4c7c405f12b616c912c958508dc8dd642f6a6f9`
  med complete täckning 33/33: 0 critical, 0 high, 0 medium och 1 low. Tre
  kandidater undertrycktes efter validering. Low-fyndet gäller kvarvarande
  PushSubscription över sekventiella personal-/platskonton på en delad enhet;
  payloaden är begränsad men fyndet är öppet för rättning eller riskbeslut.
- `ec04965` passerade den sparade lokala matrisen med Node 24.18.1/npm 11.6.2:
  ren `npm ci`, säkerhetskontroller, webbbygge, 193/193 backendtester,
  mobiltypkontroll, Doctor 21/21, Android-/iOS-export, PostgreSQL,
  anslutningsisolering, API-/betalningssimulering, 22/22 browserfall och lokalt
  oberoende A/B-backup-/restoreprov. Audit: 0 critical, 0 high, 14 moderate.
- Det godkända restoreprovet på `ec04965` tog 80,9 sekunder och jämförde 1
  syntetisk order, 1 rad, 100 öre betald brutto och 1 auditpost samt valda ACL-
  och metadataegenskaper. Det är inte produktionsbackup, Auth-/Storage-restore
  eller full ekonomisk A=B-avstämning.
- Checkoutkontrakt `order-v2`, serverprissättning, lokal betalningsidempotens,
  platsavgränsad beständig PostgreSQL-orderkö och fyrfasens migrationskontrakt
  ingår i den historiska verifieringen för oförändrad kod.
- Dokumentändringar efter `ec04965` behöver inte ensamma utlösa omkörning av
  oförändrade långa tester.

#### Skannerstatusavvikelse

Den förseglade skanningen `eab014d1-3da0-4ed5-a3e0-fe8e67e5b403` omfattade
315 frysta diffpaths till `2d200f0`. Discovery, validering och attackanalys
slutfördes utan kvarvarande kandidat eller rapporterbar sårbarhet. Den
förseglade artefakten visar ändå `partial` därför att två gamla checkpointposter
om ofärdig discovery/validering överlevde det accepterade slututkastet, vars
status var `complete` med tom deferred-lista. Artefakten bevaras och beskrivs
inte som formellt complete.

Det separata `coverage=complete` i verktygets användningsmetadata avser
tokenredovisning, inte kodtäckning. En äldre skannings `token_record_invalid` är
ett annat historiskt partialresultat. Avvikelsen döljas inte, men motiverar inte
ensamt en ny fullständig granskning. Den nya källkandidaten har nu en separat,
formellt complete slutscan enligt resultatet ovan; efterföljande ändringar är
endast denna dokumentuppdatering.

### Återstående

- Frys den säkerhetsgranskade arbetskatalogen som exakt commit och slutför route
  audit mot alla verkliga skrivande vägar och alias.
- Åtgärda eller fatta ett uttryckligt riskbeslut om low-fyndet för delad Web
  Push-bindning före sekventiell användning av olika konton på samma enhet.
- Schemalägg och verifiera skyddade `POST
  /api/internal/maintenance/process-outbound-messages` i ett separat godkänt
  externt block; kör därefter verkliga allowlistade mejl-, SMS- och pushprov.
- Kör den fysiska Android-matrisen på båda butiksplattorna med respektive
  platskonto, aldrig owner-kontot, samt reservtelefonen: öppen vy, annan app,
  låst skärm, reconnect, delad kvittering och senare order.
- Identifiera exakt kompatibelt rollbackbygge eller framåträttning, mät reservtid
  och dokumentera avbrytpunkten.
- Välj backupalternativ, kostnad, retention, RPO/RTO och reservperson; genomför
  sedan extern tidsmätt restore, cutover och rollback efter nytt godkännande.

### Blockerat

- Hosted CI och verklig kontroll av Vercels Gitkoppling, deploymentregler,
  alias, miljöer och resursbindningar.
- Separata Supabase A/B-, Upstash-, Stripe-test-, backend- och webbresurser.
- Verkliga allowlistade mejl-, SMS- och pushprov.
- Fysisk larmmatris på Höja- och Möllevången-plattorna samt reservtelefonen:
  ordervy öppen, annan app, låst skärm, nätavbrott/återanslutning, delad
  kvittering och platsisolering.
- Produktionsbackup, oberoende restore, full ekonomisk avstämning, tidsmätt
  sexstegs cutover/rollback och uppföljning av första försäljningspasset.

Inget av detta får påbörjas utan ett beskrivet externt arbetsblock och ägarens
nya uttryckliga tillstånd. Push och PR-publicering räknas som externa eftersom
de kan starta CI och deployment.

### Kräver ägarbeslut

| Beslut | Alternativ/underlag | Status |
| --- | --- | --- |
| Backup | Välj alternativ A eller B nedan; godkänn total kostnad, RPO/RTO, retention och testkopior | Öppet |
| Reservansvar | Utse reservperson för backuplarm och säkra separat nyckel-/kontoåtkomst | Öppet |
| Integrationstest | Godkänn testresurser, mottagare för mejl/SMS/push och providerkostnader | Öppet |
| Fysiskt larmprov | Ordna personal, båda butikers Android-plattor och reservtelefon | Öppet |
| Releasefönster | Godkänn datum, högst 90 minuters checkoutstopp, avbrytpunkt och slutlig release | Öppet |
| Risk/ekonomi | Bedöm 14 moderate-poster och kontrollera verkliga köp, refunds, kvitton och bokföringskälla | Öppet |
| Retention | Ingen ny gallring aktiveras; eventuella 90/1 095-dagarsregler kräver separat integritets-/redovisningsbeslut | Öppet men inte aktiverat |

Swish är beslutat uppskjutet. Ordermejl, befintliga SMS, personalpush och
ljudlarm är däremot releasekrav och får inte längre listas som accepterade
exkluderingar.

#### Kostnadsjämförda backupalternativ

Offentliga USD-listpriser kontrollerade 2026-09-12; skatt, valutaväxling,
överförbrukning, vald runner, mejltjänst och operatörstid tillkommer. Verifiera
priserna igen före köp.

| Egenskap | A — Supabase Pro + PITR + oberoende kopia | B — egen automatisk export till privat R2 |
| --- | --- | --- |
| Total bas | Pro $25 + Small compute $15 − $10 inkluderad compute credit + 7 dagars PITR cirka $100 = **cirka $130/månad** från nuvarande Free. Permanent extra Micro-restoremål ger cirka **$140/månad**. | Supabase Free $0 + privat runner/monitorering/restoremål. R2 är $0 inom 10 GB-månad/free operationer; därefter $0.015/GB-månad. Exakt total är öppen tills runner och datamängd valts. |
| Intervall/RPO | Providerhanterad PITR med upp till sekundval och beskriven worst-case RPO runt två minuter; föreslagen krypterad oberoende databas-/Storagekopia varje timme ger fortfarande upp till en timmes leverantörsoberoende lucka. | Föreslaget krypterat public-schema-dump var 15:e minut när checkout är öppen; upp till 15 minuters köp kan saknas efter senaste lyckade export och längre vid missat jobb. Inte likvärdigt med PITR. |
| RTO | Okänd tills tidsmätt restore vid representativ storlek; Supabase anger att downtime beror på databasstorlek. | Okänd tills full restore, Storage/Auth-återuppbyggnad och rollkontroll tidsmätts; större eget driftansvar. |
| Belastning/ansvar | PITR hanteras av Supabase; ägaren ansvarar för extern kopia, Storage/Auth, nycklar, larm och månatligt restoreprov. | Täta fulla exporter belastar CPU/I/O/nät/anslutningar. Ägaren ansvarar för runner, kryptering, schemaändringar, retry, larm, retention och restore. |

Källor: [Supabase backups](https://supabase.com/docs/guides/platform/backups),
[Supabase pricing](https://supabase.com/pricing) och
[Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Båda alternativen ska använda klientkryptering före upload, privat separat
lagring, separat nyckelförvaring, larm för misslyckad **och utebliven** backup
till ägare och reservperson, hantering av Auth/Storage, månatliga automatiserade
restoreprov och godkänd lagringstid/radering. Om senaste-order-luckan inte är
acceptabel till godkänd kostnad förblir release blockerad.

#### Fysisk larmmatris som ska fyllas efter godkänt prov

| Enhet | Öppen ordervy | Annan app | Låst skärm | Nätavbrott/reconnect | Delad `Ta emot` och senare order |
| --- | --- | --- | --- | --- | --- |
| Höja-platta | Ej provat | Ej provat | Ej provat | Ej provat | Ej provat |
| Möllevången-platta | Ej provat | Ej provat | Ej provat | Ej provat | Ej provat |
| Reservtelefon, mobildata | Ej provat | Ej provat | Ej provat | Ej provat | Ej provat |

Ett underkänt obligatoriskt fall stoppar release. Om Android/webbplattformen
inte kan ge tillförlitligt upprepat bakgrundslarm ska avgränsade alternativ och
konsekvenser presenteras; kravet får inte tyst sänkas.

#### Sexstegs cutover och rollback

1. Kontrollera verkligt schema, migrationsjournal och filchecksummor; välj
   legacyspåret, aldrig fresh-install-spåret, för befintlig produktion.
2. Ta och provåterställ vald backup, fånga ekonomisk källprofil och applicera
   kompatibla Phase 1-steg utan att skada gammal/ny orderhistorik.
3. Stäng checkout och aktivera skyddad backend. Avvisa gamla köp före skrivning,
   men låt redan startade betalningar slutföras och avstämmas.
4. Koppla bort alla gamla skrivande backendvägar/alias och publicera den granskade
   webben; kontrollera gamla URL:er, öppna flikar och cache.
5. Applicera Phase 4-regler först när gamla skrivare bevisligen är dränerade.
6. Kontrollera köp för båda butiker, meddelanden, ordermottagning/larm och
   ekonomisk integritet innan checkout öppnas.

Genrepets rollback ska innehålla betalningar som skapats efter backupgränsen.
Återställ aldrig den äldre backupen ovanpå aktiv databas. Rå `main` är inte en
säker standardrollback; använd en provad kompatibel build eller framåträttning.
Planera högst 90 minuter när båda butikerna är stängda och sätt avbrytpunkten
från uppmätt reservtid. Starta inte utan bevisad reservåtgärd och tidsmarginal.

## Historisk status — 2026-09-11

Status vid den tidpunkten: den lokala förberedelsen efter ägarens paus bedömdes
som slutförd för dåvarande scope.
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
PowerShell-isoleringskontraktet. Det första A/B-försöket bekräftade data men
slutade med exit 1 efter cirka 85,8 sekunder på Windows-städning (`EBUSY`). Det
senare godkända provet på `ec04965` tog 80,9 sekunder: 1 syntetisk order, 1 rad,
100 öre betald brutto och 1 auditpost i källa och mål; olika Storage-markörer
bevarades och kolumn-ACL med grant option återställdes. Detta är ett avgränsat
test. Full ekonomisk A=B-avstämning och en backup av verklig produktion har inte
utförts eller verifierats.

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

**Historiskt beslut 2026-09-11: lokal etapp klar för dåvarande scope; NO-GO för
merge/deployment.** Den dåvarande externa checklistan hade 0/71 avprickat och
sex ägarbeslut öppna. Ingen PR eller hosted CI-länk
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
| Historiskt förslag: utse bemanning, omladdnings-/pollningsrutin och eskaleringsansvar när notifieringar var avstängda. | Verksamhetsägare | Ersatt 2026-09-12 av verifieringskrav för mejl/SMS/push/larm |
| Bedöm varje kvarvarande moderate-kedja mot den slutliga auditen och nåbarhetsanalysen. | Teknisk ägare | Ej godkänt |
| Historiskt scopeförslag: kortbetalning med Swish, e-post, SMS och push utanför kandidaten. | Verksamhetsägare | Ersatt 2026-09-12: endast Swish är uppskjutet; övriga kanaler är releasekrav |

## Stoppregler

Ingen integration av förändrad main, merge, push, PR-publicering, deployment,
produktionsåtkomst, verklig betalning eller nyckelrotation i denna lokala etapp.
Det äldre målets metadata-only-förfarande är en framtida separat procedur,
inte ett tillstånd att ansluta till produktionen nu.
Den äldre `verify-security-posture.sql` läser orderdata och får därför i detta
arbete bara köras mot syntetiska testdatabaser. Ingen migration fortsätter efter
checksummefel, okänd journalpost, partiellt index eller invariantfel.
