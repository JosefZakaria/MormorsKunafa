# Lokal rättning av Web Push-kontobyte

Utgångspunkt: `security-checks`, `1b1b28ae960a7b3fba4b5de91a1c1e3fa1c8ee7a`.
Fynd: `occ_c48da99caef6e0bad7c14e1e`, scan
`f9ef03af-a3a9-4df2-832d-2c475b1c7ead`.

## Säkerhetsgräns och ändring

En registrering kan överföra en gemensam webbläsares push-endpoint efter
sändarens sista databasobservation men före extern sändning. Det tidigare
lokala reproduktionsprovet visade att den gamla butikens ordermetadata då
följde med. Ingen databastransaktion kan återkalla redan skickade meddelanden.

Transportpayloaden är nu konstant: `type: order_wakeup`, generisk titel/text
och `/admin/dashboard`. Den saknar event-id, order-id, ordernummer, tid,
plats, orderspecifik tagg och query-parametrar. Interna realtime-event och
leveransloggar behåller sina identiteter för befintlig funktion.

Service workern ignorerar all inkommande text och navigeringsdata, även från
äldre payloads. Före OS-notifiering gör den en ny same-origin GET med aktuella
cookies, `cache: no-store` och utan redirects till
`/api/admin/notifications/pending`. Endast ett lyckat svar med exakt
`shouldNotify: true` tillåter notifiering. Klick öppnar alltid dashboarden.

Endpointen kräver aktuell admins giltiga session och läser aktuell roll,
plats och leveransansvar från databasen. Den returnerar endast en boolean
för samma betalda `ny`-kö som dashboarden, inklusive förbeställningar.
Platskonton kan inte använda en annan butiks takeaway-/serveringskö;
leveransorder följer aktuellt leveransansvar. Owner behåller sin befintliga
behörighet över alla butiker. Drift på surfplattorna ska använda platskonton.

Unik aktiv endpoint, atomisk kontoöverföring, exakt versionskontroll,
endpoint-specifik logout och skydd mot gamla sändares uppdateringar är
oförändrade. Ingen databaslåsning hålls över extern sändning. Push eller dess
kontroll kvitterar aldrig en order; PostgreSQL-kön driver fortsatt larmet.

## Riktade bevis

- Det tidigare reproduktionsprovet kördes före ombyggnad och reproducerade
  metadataöverföringen på baslinjens kompilerade sändare.
- `npm run build:backend`: passerade.
- `node --test scripts/test-push-worker.mjs`: 11/11 passerade. Verifierar
  fördröjt godkännande, fast same-origin-anrop, äldre/manipulerad payload,
  fast klickmål, tom kö/fel butik, 401, 403, 503, nätverksfel, ogiltig JSON,
  felaktiga svar och förnyad kontroll efter logout/kvittering.
- `node scripts/test-push-wakeup-api.mjs`: passerade med riktig lokal
  PostgreSQL och applikationens routes. Ett deterministiskt barriärtest
  pausar efter verklig slutrevalidering, överför endpoint via verklig
  registrering och släpper därefter fram transporten. Exakt payloadkontroll
  bevisar frånvaro av all orderspecifik metadata. Kontobytet kan slutföras
  under barriären och den nya butikens tomma kö ger ingen OS-notifiering.
  Testet täcker också båda platserna, aktuell databasplats, ändrat
  leveransansvar, owner, betald förbeställning, obetald/mottagen order,
  inaktiv admin, utloggning och beständig kö.
- Oberoende läsande granskning fann inget konkret kvarvarande kringgående
  eller regression i kandidatens anropare och livscykler.

## Slutmatris

Hela slutmatrisen kördes en gång efter riktade tester. Alla sju kommandon
avslutades med kod 0. `npm_config_offline=true`, `EXPO_OFFLINE=1`,
`EXPO_NO_TELEMETRY=1` och `CI=1` användes. API/providergränser var syntetiska
och browsertrafik utanför loopback fångades av testsviten.

| Kommando | Utfall | Tid |
| --- | --- | --- |
| `npm run check` | Webbbygge, statiska kontroller, 207 backendtester, 11 worker-tester och mobiltypkontroll godkända | 49,06 s |
| `npm run test:db` | Migrationer, samtidighet, behörigheter och säkerhetsmetadata godkända | 66,75 s |
| `npm run test:api` | Hela sviten inklusive nya barriär-/wakeup-testet godkänd | 246,55 s |
| `npm run test:browser` | 24/24, dator och mobil; kontobyte, logout-retry och beständig kö | 200,72 s |
| `npm run test:backup-restore` | Två oberoende lokala kluster; A/B-data, sentinel, ACL och metadata godkända | 57,83 s |
| `npm run export:mobile:android` | Offlineexport godkänd | 50,33 s |
| `npm run export:mobile:ios` | Offlineexport godkänd | 18,56 s |

Lokala loggar och maskinläsbara utfall finns i
`.cache/security-validation/wakeup-final/`. Första riktade databastestets
sandboxade serverstart misslyckades innan applikationstestet; samma test
kördes sedan framgångsrikt med tillåten lokal processåtkomst. Detta ändrade
inga nätverksgränser. Expo Doctor och npm audit har inte körts om.

Den följande säkerhetsdiffen ska använda hela intervallet från `a119c99`
till checkpointcommitten som innehåller detta underlag. Scan-id, exakt
commit och förseglat utfall redovisas i överlämningen och scanens rapport,
utan att ändra den frysta committen efter granskning.

## Avgränsningar och release

All verifiering här är lokal. Providertransport och OS-visning ersätts av
testgränser; riktig pushleverans och fysiska Android-plattor är inte provade.
En gammal installerad service worker saknar den nya kontrollen, och redan
skickade gamla payloads kan inte återkallas. Vid separat godkänd release
måste båda plattorna bekräftas ha den nya workern innan bakgrundslarmet
godkänns; gamla meddelandens TTL är 60 sekunder. Ett generiskt wakeup kan
fortfarande nå en överförd endpoint, men innehåller inga orderuppgifter.

Webbläsarens cookiebyte och OS-visning kan inte göras atomiska med en
server-GET. Kontrollbeslutet gäller sessionen vid anropet; visad text och
navigering är därför alltid generiska. Testerna bevisar att en redan
utloggad/felplacerad session inte får notifiering för en annan butiks kö.

Extern Expo Doctor/npm audit, providerprov, fysisk Android-matris och
extern backup/restore kvarstår till separata uttryckliga godkännanden.
Ingen PR, push, merge eller deployment ingår. Release är fortsatt NO-GO.
