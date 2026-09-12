# Ersättande mål — färdigställ och förbered trygg publicering

Status 2026-09-12: detta mål ersätter äldre motstridiga målformuleringar för
`security-checks`. Den tidigare verifierade kodbaslinjen är
`ec04965833c8a6667e6886d3509757dc2e3b55e6`; dokumentbaslinjen är `a119c99`.
Den nya lokala slutkandidaten är nu **implementerad och verifierad lokalt** med
den fulla matrisen nedan. Standard-`Ta emot` bevarar lagrade kundtider,
uttrycklig plus/minusjustering flyttar klartiden, framtida betalda
förbeställningar ingår i mottagningskön, och larmet drivs av hela väntande kön
utan separat `Tysta`-kvittering. Beständig meddelande-outbox, arbetare och den
skyddade maintenance-routen är också lokalt implementerade och verifierade med
syntetiska databas-/API-/providerfall. Det är inte bevis för schemalagd körning,
verklig leverans eller larm när appen inte är i förgrunden.

Inga externa steg är godkända genom detta dokument. Innan kontoåtkomst eller
externa ändringar ska ett konkret arbetsblock beskrivas och ägaren ge ett nytt
uttryckligt tillstånd. Det gäller även Vercel, skapande av testresurser, push,
PR-publicering, merge och deployment eftersom de kan påverka driften.

## Beslutad omfattning

| Område | Beslut |
| --- | --- |
| Plattform | Webbplatsen, även på mobil. Ingen separat apppublicering. |
| Butiker | Både Höja och Möllevången. |
| Betalning | Kort. Ny Swish-funktion utvecklas separat senare. |
| Beställningssätt | Bevara alla befintliga fungerande alternativ. |
| Kundmeddelanden | Verifierade ordermejl och befintliga SMS-flöden. Ingen ny SMS-funktion för hemleverans. |
| Personal | Android-surfplattor med reservtelefon på mobildata. Butikssurfplattorna ska använda respektive platskonto, aldrig owner-kontot. Push- och ljudlarm ingår i releasekraven. |
| Backup | Återkommande automatiskt skydd, separat privat lagring och provad återställning. |
| Historik | Bevara order-, betalnings-, återbetalnings-, revisions- och bokföringsuppgifter. Ingen ny gallring aktiveras. |
| Produktion | Användaren utför produktionsstegen med Codex vägledning. Användaren och ägaren godkänner release och kostnader. |

## Verifierat lokalt underlag

På den nya lokala slutkandidaten lyckades ren `npm ci`. `npm run check`
lyckades med 206/206 backendtester, webbbygge och mobiltypkontroll. Expo Doctor
passerade 21/21, Android- och iOS-export lyckades, och `npm audit` rapporterade
0 critical, 0 high och 14 moderate. Ingen potentiellt brytande automatisk audit-
fix kördes. `test:db`, `test:api`, PostgreSQL-isolering och backup/restore
lyckades. Riktade Playwrightfall för admin passerade 4/4 och hela
Playwrightsviten passerade 22/22.

Det oberoende identiska A/B-restoreprovet med separata lokala
PostgreSQL-kluster tog **80,506 sekunder**. Källa och mål hade
`orders=1`, `items=1`, `paidGrossOre=100`, `audit=1` och en Storage-bucket;
målklustrets sentinel samt ACL- och säkerhetsmetadata bevarades. Detta verifierar
den avgränsade lokala restoremekanismen, inte en hosted eller produktionsbackup,
full återställning av Auth/Storage-objekt eller full ekonomisk A=B-avstämning.

En tidigare fullkörning hittade en testregression: det korrekta, fortfarande
aktiva orderlarmet blockerade testets logout. Testet korrigerades för det avsedda
beteendet utan att larmet doldes eller sänktes. Därefter passerade riktat admin-
Playwright 4/4 och full Playwright 22/22.

Den första nya säkerhetsgranskningen reproducerade också två icke-säkerhets-
relaterade driftsfel: ett Resend-transportfel utan HTTP-status klassades som
permanent och leveransordrar kunde falla utanför ansvarig personals utskicksfel.
Båda rättades. Därefter passerade åter 206/206 backendtester och hela
`test:api`, inklusive notifieringsintegrationen.

Den historiskt förseglade säkerhetsgranskningen
`eab014d1-3da0-4ed5-a3e0-fe8e67e5b403` behandlade 315 frysta diffpaths till
`2d200f0`. Den förseglade flaggan är `partial` därför att två gamla
checkpointposter överlevde ett accepterat slututkast med `complete` och tom
deferred-lista. Detta redovisas öppet men motiverar inte ensamt en ny full
granskning.

Den nya slutkandidaten förseglades därefter i Codex Security-scan
`8a3fdec0-93a2-4fcb-a10e-3d1cf051aced` med snapshot
`codex-security-snapshot/v1:sha256:95f4bc1909b3e0c7ff13d046f4c7c405f12b616c912c958508dc8dd642f6a6f9`.
Täckningen är **complete**, 33/33 inventeringsposter granskades och resultatet är
0 critical, 0 high, 0 medium och 1 low. Tre övriga kandidater undertrycktes efter
validering eftersom de saknade en lägre privilegierad angreppsväg eller konkret
säkerhetspåverkan. Det öppna low-fyndet gäller att samma webbläsares
PushSubscription kan ligga kvar för flera personal-/platskonton vid sekventiell
användning av en delad enhet. Payloaden är begränsad till order-id, ordernummer
och tid och navigeringen är fortsatt serverauktoriserad, men kontobindningen ska
åtgärdas eller uttryckligen riskbedömas före delad kontoanvändning.

## Verifierat i den lokala slutkandidaten

### Personalens ordermottagning och larm

- En betald order ska vara beständigt sparad och synlig i rätt butiks orderlista
  före personalåtgärd.
- Larmet ska fortsätta så länge butiken har order med status `ny` som inte tagits
  emot. `Ta emot` kvitterar just den ordern och flyttar den vidare i befintligt
  orderflöde; ingen separat sedd-/tystad-status införs.
- Kvittering ska delas mellan butikens anslutna enheter. Andra väntande order ska
  fortsätta larma, och en senare order ska larma även efter en tidigare kvittering.
- Den andra butiken får varken ordern eller dess larm.
- Omladdning, nätavbrott och återanslutning ska återhämta väntande order från den
  beständiga kön. Larmet får inte bero enbart på ett tillfälligt pushmeddelande.
- De lokala tids-, kö-, flera-order-, samtidighets-, förbeställnings-,
  butiksscope- och reconnectkontrakten har verifierats av databas/API- och
  browsermatrisen. Verkligt Android-/push-/låsskärmsbeteende återstår.

Bakgrundslarm är ett releasekrav. Öppen ordervy, annan app och låst skärm ska
provas på båda butikernas faktiska plattor och på reservtelefonen. Om upprepat
larm inte fungerar tillförlitligt ska arbetet stoppas för den delen och
avgränsade alternativ med konsekvenser presenteras. Kravet får inte sänkas.

### Kundens timer

`Ta emot` bevarar som standard den redan visade `estimated_ready_at`. Om en
30-minutersprognos har fem minuter bakom sig ska kunden ha cirka 25 minuter kvar,
inte få en ny 30-minutersperiod. Bara en uttrycklig personaländring får flytta
klartiden. Förbeställningar behåller sina särskilda tidsregler. Detta är lokalt
implementerat och verifierat i de riktade API-/integrationstesterna.

### Mejl, SMS och push

Befintliga meddelandetyper och mottagarregler ska behållas. Ett meddelandefel får
inte göra en lyckad betalning misslyckad eller ta bort ordern. Inför beständiga
utskicksjobb som:

- är unika per order, händelse och kanal;
- sparas i samma relevanta orderövergång;
- har begränsade omförsök, leasing/låsning och skydd mot samtidiga arbetare;
- hanterar osäkra leverantörssvar utan blind omsändning;
- visar kvarstående fel för ansvarig personal;
- låter kundens ordersida och personalens orderlista fungera när en
  meddelandetjänst ligger nere.

Checkoutkontraktet `order-v2`, skydd mot dubbla köp och serverns prisberäkning
ska bevaras. Nya jobb, arbetare och databasändringar ska ha minsta behörighet och
versionsstyrd kompatibilitet.

Outboxens databasövergångar, claim/leasing, success/retry/uncertain/permanent-
utfall, arbetare och skyddade `POST
/api/internal/maintenance/process-outbound-messages` är implementerade och
verifierade lokalt med syntetiska tester. Verklig schemaläggning av routen,
provider-/pushleverans och driftlarm är fortfarande releaseblockerande.

## Återstående före release

- frys den säkerhetsgranskade arbetskatalogen som exakt commit och slutför route
  audit för alla verkliga skrivande vägar och alias;
- åtgärda eller fatta ett uttryckligt riskbeslut om low-fyndet för kvarvarande
  Web Push-bindning innan en fysisk enhet används sekventiellt med olika konton;
- verifiera och dokumentera schemaläggningen av den skyddade maintenance-routen;
- genomför verkliga allowlistade mejl-, SMS- och pushprov;
- kör hela fysiska Android-matrisen på båda butiksplattorna med platskonton och
  reservtelefonen, inklusive annan app, låst skärm och reconnect;
- välj backupkostnad, retention, accepterad RPO/RTO och reservperson;
- genomför extern tidsmätt A/B-restore samt sexstegs cutover/rollback och
  kontrollera samtliga verkliga skrivande routes/alias.

Releasebeslutet är därför fortsatt **NO-GO**.

## Test- och granskningsregel

Riktade tester och relevant full matris har passerat för den lokala
slutkandidaten. Den förseglade security diff scanen täcker snapshotens 33/33
inventeringsposter utan critical/high/medium-fynd. Dokumentändringarna efter
scanen ändrar inte den granskade källkoden och utlöser därför inte omkörning av
långa sviter. Frys samma källkandidat som exakt commit före extern överlämning.

## Senare, separat godkända arbetsblock

Efter ägarens uttryckliga tillstånd ska separata resurser för webb/backend,
Supabase A/B, Upstash och Stripe-testläge skapas med syntetiska order och
avgränsade mottagare för mejl, SMS och push. Verifiera köp för båda butiker och
alla befintliga beställningssätt, övergångsbetalningar, dubbla/fördröjda besked,
refunds, notifierfel, ordermottagning och full backupavstämning.

Före merge ska Vercels verkliga Git-/deploymentkoppling och alla gamla
skrivande backendvägar kartläggas. Ett tidsmätt genrep ska följa denna ordning:

1. kontrollera verkligt schema, migrationsjournal och filchecksummor;
2. ta/prova backup och inför kompatibla Phase 1-databassteg;
3. aktivera skyddad backend under checkoutstoppet och låt redan påbörjade
   betalningar avslutas;
4. ta bort gamla skrivande backendvägar och publicera rätt webbversion;
5. inför Phase 4-regler först när gamla skrivare och alias är dränerade;
6. kontrollera köp, meddelanden, ordermottagning och ekonomisk integritet innan
   checkout öppnas.

Rollback ska provas med order som tillkommit efter backupgränsen. En gammal
backup får inte läggas ovanpå en aktiv databas och rå `main` är inte automatiskt
en kompatibel återgång. Förbered en granskad kompatibel återgång eller
framåtriktad rättning som bevarar nya order och betalningar.

Planera högst 90 minuters checkoutstopp när båda butikerna är stängda. Bestäm
avbrytpunkten från uppmätt reservtid och starta inte utan fungerande reservåtgärd
och marginal till öppning.

## Absoluta gränser

- Ingen Vercel-/providerinloggning eller extern resurs utan nytt tillstånd.
- Ingen push, PR-publicering, merge, deployment eller integration av ändrad main.
- Ingen produktionsåtkomst, migration, gallring, riktig betalning eller
  nyckelrotation.
- Inga produktionskopior i Git, chatten eller vanliga utvecklingstester.
- Inga hemligheter, råa providerpayloads eller kunduppgifter i loggar.

Den lokala implementationens testmatris och security diff scan är verifierade;
den exakta committen ska fortfarande frysas före extern överlämning och low-
fyndet om delad Web Push-prenumeration ska få ett uttryckligt beslut.
Produktionssläppet är fortsatt NO-GO och blir klart först efter godkända externa
integrationer, schemalagd outboxkörning, fungerande fysisk ordermottagning,
provad backup/rollback, full route audit, kontrollerad publiceringsordning och
ägarens uttryckliga releasebeslut.
