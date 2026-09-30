# Rättning av uteblivet automatiskt orderljud

Branch: `fix/order-alarm-delivery`. Utgångspunkt: `385b7a7`.

## Var felet fanns

Testknappen anropar ljudspelaren direkt. Den automatiska vägen går däremot via
den autentiserade listan över betalda, inkommande ordrar. Den vägen hade två
oberoende spärrar: en saknad lokal adminprofil stängde av larmet trots en
inloggad session, och ett misslyckat eller långsamt svar för andra orderlistor
hindrade uppdateringen av inkommande ordrar.

## Ändrat beteende

- Samma inloggningsstatus styr adminrouten och larmet. Serverns befintliga
  behörighets- och platsfiltrering gäller fortfarande.
- Inkommande, aktiva och förbeställda ordrar hämtas oberoende. Inkommande
  ordrar startar larmet direkt när deras API-svar kommer.
- Varje lista har högst ett pågående anrop. Händelser under hämtning köar en
  ny hämtning; ett gammalt svar kan inte skriva över ett nyare.
- Ett nätverksfel behåller den senaste kön och ett redan pågående larm.
  Misslyckad hämtning av nya ordrar visar återanslutningsstatus.
- Polling fortsätter även när sidan rapporteras dold, var tionde sekund när
  webbläsaren tillåter det. Återansluten SSE och fokus hämtar kön direkt.
- Ljudvakten försöker återuppta ett tillfälligt avbrutet ljud när en order
  fortfarande väntar. Utgången session och avmontering stoppar larmet.
- Hanteringen av framtida förbeställningar, betalningar, databas och skrivare
  är oförändrad.

## Kör testerna

```sh
npm ci
npm run test:alarm --workspace=apps/web
npm run web:build
npm install --no-save --package-lock=false --ignore-scripts playwright@1.55.1
npx playwright install --with-deps chromium
npm run test:alarm:browser --workspace=apps/web
```

GitHub Actions kör samma kontroller. Webbläsartesterna kör det byggda
gränssnittet i Chromium med riktig AudioContext och mäter signalen med en
AnalyserNode. Testerna verifierar även att ljudkällan stoppas vid paus/accept.
API, SSE och betalade orderdata simuleras. Extern trafik blockeras;
testerna skapar inga riktiga beställningar eller betalningar och använder
inga fysiska skrivare.

Scenarierna omfattar normal polling utan SSE, saknad/trasig adminprofil,
felande och långsamma sidolistor, order under ljudtest, paus och ny order,
accept, nätverksfel/återhämtning, dolda flikar, samtidiga händelser,
återansluten SSE, utgången session samt initial laddning/omladdning.

## Gräns för verifieringen

Dold-flik-testet simulerar sidans visibilityState. Det är ingen mätning av
en låst Android-enhet, restaurangens högtalare eller faktisk ljudnivå i lokalen.
Webbläsaren måste få ljudbehörighet genom ett klick. En app eller sida som
operativsystemet har stoppat kan inte garanteras att köra JavaScript.
Kontrollerna avser branchens kod, inte publicerad produktion.
