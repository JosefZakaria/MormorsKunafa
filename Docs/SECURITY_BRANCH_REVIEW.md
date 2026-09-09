# Säkerhetsbranchens lokala granskningsrapport — 2026-09-08

**Status: granskningsunderlag med öppna hinder; inte godkänt för merge eller driftsättning.** Lokala rättningar och tester är genomförda. Ingen push, PR-publicering, merge till main, produktionsändring, verklig betalning eller nyckelrotation har gjorts. Nyckelrotation hanteras senare av ägaren.

## Låsta revisioner och omfattning

| Revision | Commit |
| --- | --- |
| Ursprunglig security-checks | `da42a4a483c47a6a4fb6b1dd3634ddd9b7cbbfe7` |
| Hämtad main, även omkontrollerad efter arbetet | `33602a4417a4a1d15e44040c2acf5187d5a547d7` |
| Vanlig merge in i security-checks, fryst säkerhetsdiff | `8b29d32befc3cfd2ca6511e0779be286758ee68a` |
| Slutligt kod-/beroendeunderlag för testresultaten | `cf12824f708b453275add1d62e2d68799ef0c62e` |

De 68 tidigare saknade main-commitsen finns i historiken. Förnyad fetch gav samma main-ID och `git rev-list --count HEAD..origin/main` gav 0. Befintlig historik är bevarad. Leveransens efterföljande dokumentationscommit ändrar inte det testade applikationsunderlaget.

Den frysta diffen main → merge omfattar **242 paths: 139 tillagda, 74 ändrade och 29 borttagna**. [Filinventeringen](SECURITY_REVIEW_FILES.md) skiljer dessa från senare rättningar. Den tidigare discovery-inventeringens 211 arbetsobjekt ska inte användas som ett exakt filantal. Granskningen omfattar kod, borttagningarnas påverkan, migrationer, dokumentation, beroenden och relevanta oförändrade anropare. Borttagna genererade filer och den separata mobillockfilen kontrolleras mot återbyggnad/root-lock. Obsoleta MySQL-/WordPress-muterare ersätts inte med körbara produktionsimporter. Arkivets binärinnehåll och gamla credentialbärande kopior har inte publicerats eller återinstallerats.

Betalningar, behörighet och dataövergångar följdes genom routes, tjänster och atomiska databasfunktioner. Separata skrivskyddade granskare användes där tillgängliga; vid nådd agentgräns gjordes en separat kritisk genomgång i huvudagenten. Lokala reproduktioner använder verklig Express/Supabase-klientkod och PostgreSQL med simulerad providertransport. Detta är en avgränsad granskning, inte ett bevis att all kod eller produktion saknar fel.

Codex Security-skanningen `208fe011-5177-429f-bdb0-a32a23144cb0` är avslutad och förseglad för den frysta main → merge-diffen, med uttryckligen partiell täckning. Dess snävare säkerhetsklassificering ersätter inte betalnings-/regressionsbedömningen nedan. Artefakten behåller även tidigare lägesanteckningar; denna rapport redovisar de senare rättningarna, sluttesterna och de kvarstående hindren vid kodrevision `cf12824f708b453275add1d62e2d68799ef0c62e`.

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
| Databas/gallring | Kompletterande migrationer behåller anropskontrakt, reparerar sekvens utan att vrida tillbaka den, roterar oklara avstämningskandidater och skyddar obestämda betalningar, pending refunds, legal hold och nytillkomna tillstånd från gallring. |
| Driftverktyg/push | Backup-/restore-kommandon isolerar alla PG-anslutningsinställningar och kontrollerar exakt identitet. Push-DNS tillåter giltig publik IPv4/IPv6 med Nodes båda callbackkontrakt och avvisar privata/blandade adresser. |
| Katalog/media/cache | Dolda/adminanpassade svar har privata cache-regler och Vary på cookie/Authorization. Generiska utåtriktade fel. Uppladdning kräver owner, CSRF, storleks- och rasterkontroll. Hosted Storage-success/ACL är inte simulerad. |
| Stora datauttag | Statistik och underhållsexporter hämtar alla sidor med id-cursor, även vid lägre servergräns än begärd sidstorlek. Senare fel eller maxgräns ger fel, inte tysta delresultat. 1007 betalda order/2014 rader verifieras; CLI- och dashboarddefinitioner bevaras. Flera läsningar är inte en atomisk bokföringssnapshot. |

## Verifierade resultat

Slutkontrollen använde Node **24.18.1**, npm **11.6.2**, PostgreSQL **17.11** och Playwright **1.63.0** med Chromium. PostgreSQL hämtas via [PostgreSQLs officiella Windows-sida](https://www.postgresql.org/download/windows/) och dess EDB-binärdistribution; version och SHA-256 är låsta i setupskriptet. Databasen heter enbart `mk_security_test`, binds till `127.0.0.1` och skapas med syntetiska data/roller i ett eget kluster per körning. Inga produktionsdumpningar används. Alla binärer, lösenord, databaser och testartefakter ligger utanför Git.

| Kommando/kontroll | Resultat | Praktisk begränsning |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Pass med ny isolerad cache | Första försöket fick integritetsfel i befintlig cache; kontrollerna försvagades inte. Ren omhämtning lyckades. |
| `npm run check` | Pass, **168 tester**, web/shared/backend-bygge, mobil- och underhållsskript-typkontroll samt lagring/deploy/artefaktkontroller | Vites befintliga stora-chunk-varning kvarstår; ingen bygg-/testfailure. |
| `npm run test:db` | Pass | Uppgradering från syntetisk main, applied-ledger, 25 migrationer i beroendeordning, gamla order/referenser, rollback, samtidig numrering efter #9999, sekvensdrift, RLS/RPC, retention och integritetskontroller. Bevisar inte hosted schema/locktider. |
| API: `node scripts/test-api.mjs`, `node scripts/test-catalog-api.mjs`, `node scripts/test-swish-api.mjs` | Samtliga pass | Samma tre flöden ingår i `npm run test:api`; slutkörningen återanvände det redan verifierade bygget för att inte radera dist under browserkörningen. Externa providers är simulerade. |
| `npm run test:browser` | **14/14 pass**, Desktop Chrome + Pixel 7 | Verkliga köp/Stripe-returer för avhämtning på båda platserna, status, styckvarukorg, admin och logout. Vissa status-/refundpresentationer har särskilt mockat API-svar. Inte full browsermatris för leverans/äta här, Safari eller mobilappen. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-PostgresConnectionIsolation.ps1` | Pass | Alla psql/pg_dump/pg_restore-kommandon mockas. Verklig integritets-SQL testas separat på syntetisk PostgreSQL. Ingen verklig backup/restore utförd. |
| `npm audit --json` + primäradvisories | 29 poster: **9 high, 20 moderate, 0 critical** | [Separat beroenderapport](DEPENDENCY_REVIEW_2026-09-08.md). Ingen ren audit eller releasegodkännande påstås. |

[Reproduktionsinstruktioner](LOCAL_SECURITY_TESTS.md) beskriver setup och säkerhetsgränser. Adapterlagret är avsiktligt litet: ingen full Supabase Storage/PostgREST-emulering, inga riktiga certifikat, konton, sms, mail, push eller bankanrop. Simulerade providerfel och nekade SQL-operationer syns i testloggar som förväntade negativa fall, inte som testfel.

## Öppna hinder före merge-/driftgodkännande

1. **Versionsövergång:** Gamla MAX-skrivare och den nya sekvensen får inte vara aktiva samtidigt. Cachade main-klienter saknar nya capability-/idempotens-/platskrav; gamla betalningar kan avstämmas i ledger men kundens gamla statusretur saknar åtkomsttoken. Fail-closed API-avslag är testade, en användbar kompatibel övergång är inte levererad. En separat verifierad föregående kompatibilitetsversion, dränering/versionering eller säker återhämtningsväg krävs. Kravet att hålla butiken öppen har inte ersatts med tillstånd att pausa den.
2. **Verklig databas:** Bekräfta schema, migration/checksummehistorik, aktiva adminroller, grants/RLS/RPC och Storage-policyer. Repetera migrering mot en representativ isolerad kopia; mät femsekunders locktimeout och index-/tabellås. Synthetic main motsvarar repoavtal, inte en exporterad produktionsdatabas.
3. **Preview och driftkonfiguration:** Den lokala webkonfigurationen genererar nu separata miljömål och stoppar Preview om API-origin saknas, är ogiltig, är en känd produktionsorigin eller inte finns i en separat committad allowlist. Allowlisten är avsiktligt tom tills en isolerad testbackend med separat databas, Upstash och providers finns och har verifierats. Same-origin `/api`, cookies/CSRF och SSE bevaras lokalt; faktisk Vercel-konfiguration och resursägarskap är fortsatt externa hinder. Ingen deployment gjordes.
4. **Betalningsleverantörer:** Bekräfta merchant-/miljökoppling, verkliga webhooks, sandboxrefunds/timeouts och betalningar som startats före cutover. Swishs giltiga wireformat stöds av [leverantörens integrationsguide](https://assets.ctfassets.net/zrqoyh8r449h/aBolaUxwMBZWntQ9CsuLD/c5b0c94c5fb2a298bda91bf4e567d039/Merchant_Integration_Guide_2.6.pdf), men denna äldre guide är inte aktuell konto-/retentionsverifiering. Ingen 404 får tolkas som rätt att skapa en ny oklar transfer.
5. **Beroenden:** Kvarvarande qs-advisories i API:t och PostCSS/image-size/decode-uri-component/uuid i mobilkedjan är explicit öppna. Ingen påvisad hög/kritisk webbexploatering etablerades av dessa kontroller, men high-paketposter är inte avfärdade eller åtgärdade. Riskacceptans eller verifierad kompatibel rättning krävs; ingen automatisk stor versionshöjning ingår.
6. **Drift och integritet:** Verifiera flerinstans-Upstash inklusive idempotenssvar med kunddata/status-token (24 timmar), notifieringsleverans och personalens orderkö. Mail/SMS/push saknar durable outbox. Ekonomiska auditposter är atomiska; varje adminutfall är inte garanterat beständigt. Historiskt inaktiv fysisk printer behöver separat kompatibilitetskontroll; dagens CSP kan blockera LAN-HTTP. Bredda inte CSP för att dölja det.
7. **Ägar-/verksamhetsarbete:** Rotation, incident-/historikåtgärder, juridiskt godkännande, leverantörsavtal, regioner, faktisk leveransförmåga och konto-/mailkontroller är separata öppna punkter. Ingen extern part har kontaktats. Full WCAG/skärmläsar-/kontrastkontroll och verklig mobilrelease är inte utförda.

## Framtida ordning för driftsättning

Detta är ett framtida villkorat förfarande, inte en utförd eller godkänd driftsättning.

1. Frys nya exakta release-ID:n och uppdatera denna diffgranskning om main ändras. Lös ovanstående versions- och beroendehinder. Utse ansvarig operatör, avstämningsansvarig och mätbara stoppsignaler.
2. Inventera verkligt schema, migrationer, roller, integrationer och aktiva gamla klienter/betalningar utan att exponera kunddata. Säkerställ en plan som uppfyller ägarens tillgänglighetskrav; annars förblir cutover blockerad.
3. Ta en åtkomstskyddad extern backup och provåterställ den till en **oberoende** disponibel databas med separata credentials. Matcha checksumma/källidentitet och kör integritets- och ekonomiavstämning. Hostnamnsskillnad ensam bevisar inte fysisk isolering.
4. Repetera pending migrationer i `migration-order.json` mot staging, inklusive redan tillämpade steg. Verifiera att historiska order, nya platsdata och pågående finansiella försök bevaras. Förbered endast kompatibla återställningsbyggen.
5. Genomför den separat godkända strategin för gamla skrivare/klienter; de två nummerallokeringarna får inte överlappa. Applicera endast granskade pending migrationer med timeout och verifiera grants/sekvens innan matchande backend/frontend får initiera nya köp.
6. Kontrollera båda platserna, priser/lager, cookie/scopning, nya och tidigare startade betalningar/refunds. Aktivera gallring först efter granskad dry-run. Följ faktisk ordermottagning, felkvoter, providerjournal och bemannad orderkö.

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
