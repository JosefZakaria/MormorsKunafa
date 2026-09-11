# Säkerhetsbranchens lokala granskningsrapport — 2026-09-11

**Aktuell etapp: lokal förberedelse pågår.** Ägarens nya instruktion efter pausen
ersätter det äldre målets externa tillstånd. Ingen Vercel-/providerkontoåtkomst,
push, PR-publicering, Preview-/Production-deployment, merge, main-integration
eller produktionsåtkomst får göras nu. Pågående köp och den levande databasen
berörs inte. Se [uppdaterad måltext](LOCAL_GOAL_OBJECTIVE.md) och
[releasejournalen](RELEASE_JOURNAL_2026-09-11.md).

Arbetet startade från `2183660` med ren arbetskatalog. Main-baslinjen
`33602a4417a4a1d15e44040c2acf5187d5a547d7` kontrollerades före pausen och
behålls fryst lokalt. Ingen ny main har integrerats.

SDK 55 (`e278e86`) har passerat Doctor, typer, båda exporter och browserprov.
SDK 56 (`344cb20`) har passerat typer/exporter/webb och 22 browserfall men
behåller det dokumenterade upstream-Hermes-felet i mellansteget. SDK 57
(`e90597a`) passerar ren installation, Doctor 21/21, typer, Android-/iOS-export,
webbbygge och 193 backendtester. Alla installerade native-paket följer Expos
matris. Ny audit visar 0 critical/high och 14 moderate, individuellt analyserade
utan ägarens riskgodkännande. Den revisionsbundna slutmatrisen återstår.

`2abedcf` förstärker Stripe-testläge/Preview-origins, avstängd ny Swish-checkout
och separata v2-statusnycklar med bevarad v1-åtkomst. Dess lokala underlag är
193 backendtester, API-/betalningssimulering och 22 browserfall.

`eb2cd50` behåller public-arkivets ACL och kräver säkerhetsmetadatahash, inklusive
kolumnbehörigheter. Verklig obehörig refundmutation genom kolumngrant reproducerades
och verifieraren rättades. En ny kompletterande migration rättar funktionsdefault;
gamla migrationsfiler är oförändrade. Antalet är nu 30 Phase 1-steg plus separat
Phase 4, och 33 fresh-filer. Hela lokala databasregressionen passerar.

`47dc852` lägger till ett riktigt lokalt tvåklusterprov i Windows-CI. Testet
passerade på 85,8 sekunder och kontrollerar 1 order/1 rad/100 öre/1 auditpost,
bevarade kolumn-ACL/grant options och separat Storage-markör i målklustret.
Detta är varken produktionsbackup eller full hosted ekonomisk A/B-avstämning.

Tre CI-jobb är konfigurerade med exakt Node 24.18.1/npm 11.6.2 och ren `npm ci`.
Faktisk GitHub-körning och alla externa releasekontroller är avsiktligt inaktiva.
Slutkandidatens kompletta lokala testmatris och nya fullständiga säkerhetsdiffscan
återstår. Ingen slutlig release- eller säkerhetsbedömning dras från mellanresultat.

## Historisk rapport från 2026-09-10

Resten av dokumentet bevarar det tidigare underlaget vid `da48e8e`, inklusive
dess dåvarande versioner, testantal och externa procedurer. Det ger inga nya
åtgärdstillstånd och ersätter inte ovanstående aktuella etapp eller dess slutprov.

**Status: lokalt förberedd för mänsklig PR-granskning; inte godkänd för merge eller driftsättning.** Inga bekräftade olösta kritiska/höga kodfynd får finnas vid slutgranskningen. Externa miljö-, ekonomi-, integritets- och ägarspärrar nedan är fortfarande öppna. Ingen push, PR-publicering, merge till main, produktionsändring, verklig betalning eller nyckelrotation har gjorts. Nyckelrotation hanteras senare av ägaren.

## Låsta revisioner och omfattning

| Revision | Commit |
| --- | --- |
| Ursprunglig security-checks | `da42a4a483c47a6a4fb6b1dd3634ddd9b7cbbfe7` |
| Hämtad main, även omkontrollerad efter arbetet | `33602a4417a4a1d15e44040c2acf5187d5a547d7` |
| Vanlig merge in i security-checks, fryst säkerhetsdiff | `8b29d32befc3cfd2ca6511e0779be286758ee68a` |
| Slutligt applikationsunderlag för testresultaten | `da48e8ec427832b89ed062faffc888e0b709f49b` |

De 68 tidigare saknade main-commitsen finns i historiken. Den senaste lokala refkontrollen gav samma main-ID, `git rev-list --count HEAD..origin/main` = 0 och 194 branchcommits utöver main vid applikationsrevisionen. Befintlig historik är bevarad. Leveransens efterföljande dokumentationscommit ändrar inte det testade applikationsunderlaget och anges separat i slutöverlämningen eftersom en commit inte kan innehålla sin egen hash.

Den frysta diffen main → merge omfattar **242 paths: 139 tillagda, 74 ändrade och 29 borttagna**. [Filinventeringen](SECURITY_REVIEW_FILES.md) skiljer dessa från senare rättningar. Den tidigare discovery-inventeringens 211 arbetsobjekt ska inte användas som ett exakt filantal. Granskningen omfattar kod, borttagningarnas påverkan, migrationer, dokumentation, beroenden och relevanta oförändrade anropare. Borttagna genererade filer och den separata mobillockfilen kontrolleras mot återbyggnad/root-lock. Obsoleta MySQL-/WordPress-muterare ersätts inte med körbara produktionsimporter. Arkivets binärinnehåll och gamla credentialbärande kopior har inte publicerats eller återinstallerats.

Betalningar, behörighet och dataövergångar följdes genom routes, tjänster och atomiska databasfunktioner. Separata skrivskyddade granskare användes där tillgängliga; vid nådd agentgräns gjordes en separat kritisk genomgång i huvudagenten. Lokala reproduktioner använder verklig Express/Supabase-klientkod och PostgreSQL med simulerad providertransport. Detta är en avgränsad granskning, inte ett bevis att all kod eller produktion saknar fel.

Den förseglade Codex Security-skanningen `5cca3392-1dfc-42ee-b5b5-fa2bdfaed882` granskade den oföränderliga diffen `33602a4417a4a1d15e44040c2acf5187d5a547d7..71dbc2b39ac04d41d35b9787f7e56f58d534ade3`. Samtliga 260 kompakta inventeringsobjekt (verktygsrapporterade 405 ändrade paths) behandlades utan uppskjutna kandidater. Skanningen fann två low-fynd: läsbar fullständig checkout-replay och svält i den begränsade legacy-avstämningskön. De är rättade efter den förseglade baslinjen i `6896b99` respektive `ed1faa1` och har riktade tester. Två privilegierade redovisningskandidater som policyn inte rapporterade som sårbarheter härdades ändå i `ca84f53` och `3aa5ada`; en äldre klientprisväg täcks av serverprissättning och den fail-closed-övergången i `da48e8e`. Skannerns slutmetadata märkte coverage som partial efter `token_record_invalid`, så varken skanningen eller denna rapport gör ett heltäckande frånvaro-påstående. Rapporten redovisar rättningarna, sluttesterna och kvarstående hinder vid applikationsrevision `da48e8ec427832b89ed062faffc888e0b709f49b`.

## Bevarade beteenden och rättningar

| Område | Resultat och regressionsskydd |
| --- | --- |
| Platser och köp | Höja/Möllevången, roller/platsbegränsning, locationId, platslager, pauser, menyredigering, dolda produkter, variantpriser och adminlayout bevaras. API och databas testar båda platserna, äta här/avhämtning samt leveransens serveravgift. |
| Pris och varukorg | Klientens namn/pris ignoreras; serverkatalog, tillåten variant och antal styr. Styckvaror bevarar enhetspris vid ändrat antal. Äldre stycketiketter tolereras bara för identifierade styckprodukter; riktiga paketvarianter behåller sitt pris. |
| Stripe-webhooks | Behandlingslås får ägda tokens. Gamla arbetare kan inte slutföra eller felmarkera en ny arbetares försök. Upptagna event får retrybart 503; duplicerad verifierad betalning ger en ekonomisk övergång/auditpost. |
| Refunds | Ordinarie och separat dubbelbetalningsrefund reserveras före externa anrop. Efter accepterat men förlorat svar används kanonisk matchning; osäkra försök efter Stripe-nyckelns säkra replayfönster återanvänds inte för en ny transfer. Timeout, dubbletter, konkurrens, del/full refund och utgångna provider-nycklar testas. |
| Swish | Wire-ID är 32 versala hextecken; äldre bindestrecksreferenser matchas utan omskrivning av sparat värde. Belopp/valuta/order/mottagare/ID verifieras även vid återförsök/status. Refundreferensen sparas före första PUT; senare försök läser kanoniskt tillstånd, även för historiskt saknad referens. Oklar 404 behålls för manuell avstämning. |
| Avbokning | Pending onlinebetalning får inte avbokas som om den säkert vore obetald. Betalda order kräver full avstämd refund; CAS och databasgräns skyddar samtidiga tillstånd. Genuin sen betalning till historiskt avbruten order bevaras i journalen utan att tyst återöppna tillagning. |
| Sessioner | Cookie/CSRF kombineras med aktuell aktiv admin, känd roll, plats och token_version. Logout blir klart först efter bekräftad revokering och tål förlorat svar både före och efter revokering. Äldre revokering får inte återkalla en nyare session. |
| Kundstatus | Minimal capability-skyddad DTO skiljer obetalt, förbeställt, leverans och avslutat. Statusåtkomst räcker genom tillåten bokning plus sju dagar; inga kund-/providerfält läggs tillbaka för kompatibilitet. |
| Versionsövergång | Den fasade legacy-manifesten delar ordernummerallokering mellan gammal MAX-skrivare och ny RPC. Därefter går den grindade backend ut först i ett kort fail-closed checkoutfönster; gamla klienter får 426 före skrivning. Webben går ut först när alla API-origins är grindade och startar aldrig betalning från ett legacy/oklart create-svar. Explicit dränering föregår constraints. Hosted rehearsal/dränering återstår. |
| Databas/gallring | Kompletterande migrationer behåller anropskontrakt, reparerar sekvens utan att vrida tillbaka den, roterar oklara avstämningskandidater och skyddar obestämda betalningar, pending refunds, legal hold och nytillkomna tillstånd från gallring. 90/1 095 dagar är oschemalagda tekniska miniminivåer, inte godkända juridiska intervall. |
| Bokföringshistorik | Adminens raderingsfunktioner är borttagna, kompatibilitets-API returnerar 409 och en databastrigger tillåter fysisk radering enbart av `ny`/`pending`-utkast. Testet bevarar ordernummer, typ, total, rader, refund/allokering, providerreferens och ekonomisk audit genom båda PII-passen. |
| Kvitto/moms | Ny verifierad betalning snapshotsparar aktuell kvittomomssats och inkluderat momsbelopp atomiskt med betalningsaudit. E-post samt backend-/webbskrivare föredrar snapshot. En trigger tillåter den exakta engångsskrivningen men blockerar senare omskrivning och order-`TRUNCATE`. Äldre betalda rader lämnas null och måste bedömas från originalunderlag. |
| Driftverktyg/notiser | Backup-/restore-kommandon isolerar alla PG-anslutningsinställningar och kontrollerar exakt identitet. Manifest v3 binder exakt public-tabellkatalog och `legacy-core`/`secured-ledgers`-profil; partiella ledgeruppsättningar kan inte få verifierad status. Push-DNS avvisar privata/blandade adresser. Realtime- och pushfel fångas separat; den betalda ordern kvarstår i korrekt platsbegränsad PostgreSQL-kö. |
| Katalog/media/cache | Dolda/adminanpassade svar har privata cache-regler och Vary på cookie/Authorization. Generiska utåtriktade fel. Uppladdning kräver owner, CSRF, storleks- och rasterkontroll. Upstash hashar rå nyckel och AES-256-GCM-förseglar en minimerad replay utan kund-/leverans-/artikeldata i 86 400 sekunder; lagringsnyckel/payload binds och 600-sekunderslåset bevaras. Legacyvärden läses endast under befintlig TTL. Hosted Storage/Upstash är inte simulerade. |
| Stora datauttag | Statistik och underhållsexporter hämtar alla sidor med id-cursor, även vid lägre servergräns än begärd sidstorlek. Senare fel eller maxgräns ger fel, inte tysta delresultat. 1007 betalda order/2014 rader verifieras; CLI- och dashboarddefinitioner bevaras. Flera läsningar är inte en atomisk bokföringssnapshot. |

## Verifierade resultat

Slutkontrollen använde Node **24.18.1**, npm **11.6.2**, PostgreSQL **17.11** och Playwright **1.63.0** med Chromium. PostgreSQL hämtas via [PostgreSQLs officiella Windows-sida](https://www.postgresql.org/download/windows/) och dess EDB-binärdistribution; version och SHA-256 är låsta i setupskriptet. Databasen heter enbart `mk_security_test`, binds till `127.0.0.1` och skapas med syntetiska data/roller i ett eget kluster per körning. Inga produktionsdumpningar används. Alla binärer, lösenord, databaser och testartefakter ligger utanför Git.

| Kommando/kontroll | Resultat | Praktisk begränsning |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Pass med ny isolerad cache | Första försöket fick integritetsfel i befintlig cache; kontrollerna försvagades inte. Ren omhämtning lyckades. |
| `npm run check` | Pass, **179 tester**, web/shared/backend-bygge, mobil- och underhållsskript-typkontroll samt lagring/deploy/artefaktkontroller | Vites befintliga stora-chunk-varning kvarstår; ingen bygg-/testfailure. |
| `npm run test:db` | Pass | Uppgradering från syntetisk main, applied-ledger, 32 filer i fresh-spåret/30 steg i legacy-spåret, gamla order/referenser, rollback, samtidig numrering efter #9999, sekvensdrift, roterande avstämningskö, RLS/RPC, PII-pass, raderings-/trunkeringsskydd, oföränderlig moms-snapshot samt legacy/full/partial restoreprofiler. Bevisar inte hosted schema/locktider. |
| API: `node scripts/test-api.mjs`, `node scripts/test-catalog-api.mjs`, `node scripts/test-swish-api.mjs` | Samtliga pass | Samma tre flöden ingår i `npm run test:api`; slutkörningen återanvände det redan verifierade bygget för att inte radera dist under browserkörningen. Externa providers är simulerade. |
| `npm run test:browser` | **22/22 pass**, Desktop Chrome + Pixel 7 | Verkliga lokala köp/Stripe-returer för avhämtning på båda platserna, legacy/nytt svarskontrakt, oklar svarsåterhämtning, status, styckvarukorg, admin och logout. Vissa status-/refundpresentationer har särskilt mockat API-svar. Inte full browsermatris för leverans/äta här, Safari eller mobilappen. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-PostgresConnectionIsolation.ps1` | Pass | Alla psql/pg_dump/pg_restore-kommandon mockas. Verklig integritets-SQL testas separat på syntetisk PostgreSQL. Ingen verklig backup/restore utförd. |
| `npm audit --json` + primäradvisories | 26 poster: **9 high, 17 moderate, 0 critical** | qs och båda js-yaml-linjerna är verifierat rättade. Fyra underliggande mobil-/buildkedjor återstår; se [separat beroenderapport](DEPENDENCY_REVIEW_2026-09-08.md). Ingen ren audit eller releasegodkännande påstås. |
| Windows CI `integration-windows` | Konfiguration lokalt YAML-validerad; jobben installerar låst PostgreSQL och kör databas-, API- och PowerShell-isolering sekventiellt | Faktisk GitHub Actions-körning på exakt commit återstår tills en människa väljer att publicera PR:n. Inga externa providers används. |

[Reproduktionsinstruktioner](LOCAL_SECURITY_TESTS.md) beskriver setup och säkerhetsgränser. Adapterlagret är avsiktligt litet: ingen full Supabase Storage/PostgREST-emulering, inga riktiga certifikat, konton, sms, mail, push eller bankanrop. Simulerade providerfel och nekade SQL-operationer syns i testloggar som förväntade negativa fall, inte som testfel.

## Öppna hinder före merge-/driftgodkännande

1. **Versionsövergång:** En lokalt testad fyrfasövergång levereras: delad databasallokering, grindad backend först med ett kort fail-closed checkoutfönster, därefter aktuell webb/aliasdränering och sist constraints. Den måste repeteras mot en separat Supabase-testresurs och faktisk alias-/writerinventering. Phase 4 får inte köras förrän gamla skrivare är dränerade. Om verksamheten inte godkänner det planerade checkoutfönstret är cutover blockerad; öppna inte gamla backendens klientprisväg som kompromiss.
2. **Verklig databas:** Bekräfta schema, migration/checksummehistorik, aktiva adminroller, grants/RLS/RPC och Storage-policyer. Repetera migrering mot en separat syntetisk testprojektresurs; mät femsekunders locktimeout och index-/tabellås. Lokal synthetic main motsvarar repoavtal, inte verkligt hosted schema. Följ [den exakta externa checklistan](EXTERNAL_RELEASE_VERIFICATION.md); kopiera inte kunddata.
3. **Preview och driftkonfiguration:** Den lokala webkonfigurationen genererar nu separata miljömål och stoppar Preview om API-origin saknas, är ogiltig, är en känd produktionsorigin eller inte finns i en separat committad allowlist. Allowlisten är avsiktligt tom tills en isolerad testbackend med separat databas, Upstash och providers finns och har verifierats. Same-origin `/api`, cookies/CSRF och SSE bevaras lokalt; faktisk Vercel-konfiguration och resursägarskap är fortsatt externa hinder. Ingen deployment gjordes.
4. **Betalningsleverantörer:** Bekräfta merchant-/miljökoppling, verkliga webhooks, sandboxrefunds/timeouts och betalningar som startats före cutover. Swishs giltiga wireformat stöds av [leverantörens integrationsguide](https://assets.ctfassets.net/zrqoyh8r449h/aBolaUxwMBZWntQ9CsuLD/c5b0c94c5fb2a298bda91bf4e567d039/Merchant_Integration_Guide_2.6.pdf), men denna äldre guide är inte aktuell konto-/retentionsverifiering. Ingen 404 får tolkas som rätt att skapa en ny oklar transfer.
5. **Beroenden:** qs och js-yaml är kompatibelt rättade. PostCSS, image-size, decode-uri-component och uuid återstår i Expo-/Metro-/byggkedjorna: 26 auditposter, varav 9 high och 17 moderate. Ingen nåbar hög/kritisk webb-/backendväg etablerades av kontrollerna, men paketposterna är inte avfärdade. Riskacceptans eller en verifierad SDK-kompatibel uppdatering krävs; ingen tvingad inkompatibel majorversion ingår.
6. **Drift och integritet:** Verifiera flerinstans-Upstash, krypterad/minimerad replay, övergångsläsning, region/åtkomst/backup och observerad 600-/86 400-sekunders expiry. Lokalt är notifierfel isolerade och korrekt platsbegränsad orderkö beständig; faktisk mail/SMS/push/SSE-leverans, bemanning och reconnect måste provas. Notiser saknar durable outbox. Ekonomiska auditposter är atomiska; varje adminutfall är inte garanterat beständigt. Historiskt inaktiv fysisk printer behöver separat kompatibilitetskontroll; bredda inte CSP för att dölja LAN-HTTP-problem.
7. **Bokföring och integritet:** [Bevarandematrisen](ACCOUNTING_DATA_PRESERVATION.md) kräver redovisnings-/ägarbeslut för originalunderlag, historiska null-momssnapshots, arkivslut, backuper och externa kopior. 90/1 095 dagar är bara oschemalagda kodgränser; båda muterande PII-passen är blockerade tills fält och intervall godkänts. Det publika policydokumentet är nu uttryckligen ett opublicerat utkast och får inte driftsättas som färdig policy.
8. **Ägar-/verksamhetsarbete:** Rotation, incident-/historikåtgärder, juridiskt godkännande, leverantörsavtal, regioner, faktisk leveransförmåga och konto-/mailkontroller är separata öppna punkter. Ingen extern part har kontaktats. Full WCAG/skärmläsar-/kontrastkontroll och verklig mobilrelease är inte utförda.

## Framtida ordning för driftsättning

Detta är ett framtida villkorat förfarande, inte en utförd eller godkänd driftsättning.

1. Frys nya exakta release-ID:n och uppdatera denna diffgranskning om main ändras. Godkänn den fasade versionsövergången och hantera beroenderisken. Utse ansvarig operatör, avstämningsansvarig och mätbara stoppsignaler.
2. Inventera verkligt schema, migrationer, roller, integrationer och aktiva gamla klienter/betalningar utan att exponera kunddata. Säkerställ en plan som uppfyller ägarens tillgänglighetskrav; annars förblir cutover blockerad.
3. Slutför [bevarandematrisen](ACCOUNTING_DATA_PRESERVATION.md). Ta därefter en åtkomstskyddad extern backup och provåterställ den till en **oberoende** disponibel databas med separata credentials. Matcha checksumma, källidentitet, manifestets exakta tabellkatalog och den uttryckligen förväntade ekonomiprofilen; stäm av orderrader, belopp, momssnapshots, providerhändelser, audit och samtliga refundledgers. Hostnamnsskillnad ensam bevisar inte fysisk isolering.
4. Repetera pending migrationer i `migration-order.json` mot staging, inklusive redan tillämpade steg. Verifiera att historiska order, nya platsdata och pågående finansiella försök bevaras. Förbered endast kompatibla återställningsbyggen.
5. Genomför den separat godkända strategin för gamla skrivare/klienter: applicera endast granskade pending migrationer, verifiera grants/sekvens, aktivera sedan grindad backend under det godkända fail-closed checkoutfönstret. Dränera alla gamla API-origins innan aktuell webb får initiera nya köp; slå aldrig på legacybetalningar för att undvika fönstret.
6. Kontrollera båda platserna, priser/lager, cookie/scopning, nya och tidigare startade betalningar/refunds. Låt gallring vara avstängd tills fält/intervall godkänts och den granskade dry-runen passerat. Följ faktisk ordermottagning, felkvoter, providerjournal och bemannad orderkö.

## Återställning som bevarar nya betalningar

- Föredra en framåträttning eller ett förberett, kompatibelt backend/frontend-bygge. Behåll kompletterande schema, sekvens, token-/sessionskontrakt, eventanspråk och refundledger.
- Återställ **inte** en gammal fullständig backup ovanpå en databas som har fått nya order/betalningar. Revertera inte migrationer som tar bort finansiella fält eller lägger tillbaka gammal MAX-allokering.
- Om fel upptäcks: använd den förhandsgodkända begränsningen av nya betalningsinitieringar, behåll åtkomst för avstämning och giltiga webhooks, dokumentera exakt avgränsning/tidpunkt och bevara nytillkomna order, provider-ID:n, belopp, event, refunds och auditposter. En stoppåtgärd får inte improviseras mot ägarens tillgänglighetskrav.
- Stäm av providerjournalen mot alla order/refunds sedan cutover och mot öppna äldre försök innan återöppning. Skriv inte över nya rader med gamla ögonblicksbilder. Godkänn återgång först när nummer, kundåtkomst, ekonomiska totalsummor och verksamhetens mottagning åter är verifierade.

## Lokal masterchecklista och commits

`SecurityFixesAlper.md` är fortsatt ignorerad och är master; `SecurityFixes.md` används som bakgrund, `SECURITY.md` som rapporteringspolicy. Checklistan skiljer aktuell lokal evidens från historiska/live-/verksamhetspåståenden och återöppnar tidigare överdrivna avbockningar. 229 av 348 punkter är lokalt avprickade; 119 är öppna/uppskjutna. Referensrader räknas inte som separata säkerhetskontroller. Andelen är inte ett kvalitets- eller produktionsgodkännande.

Varje nedanstående meningsfullt steg committades under arbetet efter gröna relevanta kontroller. Inga färdiga ändringar delades upp i efterhand. Main-commitsen fördes in med merge och är utelämnade från denna lista över egna lokala steg.

| Commit | Meddelande |
| --- | --- |
| `ccf6d81fae669e1078ae02c14afbd451583dd6e8` | test(db): add isolated PostgreSQL verification harness |
| `8b29d32befc3cfd2ca6511e0779be286758ee68a` | fix(integration): preserve current storefront features with security controls |
| `a58e783694ebb37997058924d9baa6d81a0cd8f8` | test(security): verify isolated checkout and admin flows |
| `f49e8147dded7d197debd6619bc9463bc3b9c05d` | fix(payments): fence webhook attempts and retain retries |
| `775d5002bf8b897633bba02a64516de92563183b` | fix(refunds): reconcile ambiguous transfers before retrying |
| `c96a14011f783c93d8930d7d698b6150ae83251a` | fix(orders): guard cancellation against payment transitions |
| `0affc94e17de4b4ac1eb2d9c8eedbc09e54179b2` | fix(db): preserve payment evidence and repair rollout sequencing |
| `7b00898887a9d34f36444c54079cc80ad0c1edd7` | fix(checkout): preserve scheduled and private order status flows |
| `387fb59439440d86dc854bc419b41a94b9d8ab66` | fix(auth): confirm session revocation before completing logout |
| `729ac5382fb1d054e0f57bad4802ed2cc0e27787` | fix(ops): isolate backup and restore database connections |
| `1db9a2c3d206507fcd5fbf7b0e8a5dbd3071ffaf` | fix(push): preserve public DNS transport behind address guards |
| `c9bd0d525c2bd5f93bbd9b79a78f8a12f28d7753` | fix(refunds): recover ambiguous duplicate payment refunds |
| `da4de6b193a21ae05b1fbb677bfffbc49dccb845` | fix(catalog): preserve piece and bundle checkout contracts |
| `dae581f1f7b565e07b82d1e5fc762b970c04c877` | fix(swish): preserve payment identity across retries and callbacks |
| `2bb7663ebcbc41e4b5cbe2d2960c1ec9adf2bbe6` | fix(reports): paginate statistics and maintenance exports |
| `ea873b6f3a9d1685e3c35aef6d897822c7def774` | fix(swish): reconcile reserved refunds without resubmitting transfers |
| `cf12824f708b453275add1d62e2d68799ef0c62e` | chore(deps): apply compatible fixes and document remaining advisories |
| `1dc3115131c5b5785288a26b1bf0a2e3e018b23b` | docs(security): record verified results and remaining rollout gates |
| `8d4997527dc895e682281189c4f0b3e721bd896d` | fix(deploy): block unisolated preview API routes |
| `9dc6816ca415de4a3afa21d6c9a8c3c463be44ca` | fix(db): bridge legacy and atomic order writers |
| `f13f5499da02b7a28cafc570c20742a7e6c94241` | test(api): isolate statistics fixture order numbers |
| `d72fc5887b6838031e7d32244296d9483f762f4a` | fix(checkout): bridge legacy clients safely |
| `0166bb94915826a90d5b2e82af4a148304dff5d5` | fix(deps): migrate backend to Express 5 |
| `867795a6d57868b5ab156e5c2bc0a8f8afc702bf` | test(browser): handle closed-hours checkout |
| `e9782946ed7a107b416093a1dcc81a92cd34f0ae` | fix(deps): apply supported mobile security patches |
| `61c139c4bf3e6c6d8b17066061666c068f79f269` | fix(db): protect accounting order history |
| `01600c022949ba82d85971e23d87460e1f5e78f3` | fix(ops): contain paid-order notification failures |
| `48bfe2742c42ddec719987c43829049d62ac2a99` | test(cache): document order replay privacy contract |
| `8b175bda01178fdb4823ba280e90ca3ca29192bb` | ci: run isolated PostgreSQL integration checks |
| `1cc11c6c84882773ac0dea6442e3d9dda61949c2` | fix(receipts): snapshot VAT at verified payment |
| `e8b7edf50a1e7fa268a58f252be1e42c32b6bc7e` | fix(privacy): label unapproved retention draft |
| `71dbc2b39ac04d41d35b9787f7e56f58d534ade3` | docs(security): define external accounting gates |
| `6896b99` | fix(cache): seal minimized checkout replay |
| `ed1faa1` | fix(db): rotate legacy reconciliation queue |
| `ca84f53` | fix(db): enforce receipt history immutability |
| `3aa5ada` | fix(backup): verify accounting ledger profile |
| `da48e8e` | fix(checkout): refuse legacy payment initiation |
