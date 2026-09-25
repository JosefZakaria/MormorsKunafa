# Starkt orderlarm i webbens adminvy

## Ändringen

- Den gamla ringsignalen ersätts av ett lokalt genererat kökslarm med växlande
  950/1450 Hz-toner och övertoner. En ljudbuffert loopar i Web Audio utan en
  JavaScript-timer som måste starta varje ny signal.
- Signalen normaliseras till 0,95 i toppnivå. Larmnivån är 100 % från start,
  även på enheter som hade sparat den gamla standardnivån 80 %. Efterföljande
  val sparas med nyckeln `admin_alarm_volume_v2` (80–100 %).
- Serverns befintliga platsavgränsade kö med betalda, väntande ordrar styr larmet.
  Omladdning markerar inte längre väntande ordrar som redan hanterade.
- Personalen kan pausa nuvarande ordrar i 30 sekunder och får då fram ordervyn.
  En ny order bryter pausen direkt. Larmet återkommer för fortfarande väntande
  ordrar; accepterade eller borttagna ordrar slutar larma.
- Ett femsekunderstest kan aldrig stoppa ett pågående orderlarm. Ordrar tar
  över testuppspelningen och ogiltigförklarar dess stoppfunktion.
- Avbrutet ljud återupptas när webbläsaren tillåter det. Annars visas en
  aktiveringsknapp även i orderdialogen. Texten säger att ljudet är aktiverat,
  inte att en fysisk högtalare bevisligen hörs.
- Återanslutning av SSE efter fokus använder samma funktion som registrerar
  orderhändelser och felhantering. Det separata korta pipet som stängde sin
  ljudmotor omedelbart är borttaget.

## Lokal verifiering 2026-09-25

`npm run web:build` och `npm run test:alarm --workspace=apps/web` verifierar
bygget respektive ljudmotorn. De 12 automatiska testerna täcker signalnivå,
volymvärden, order/test-kollisioner, teststopp, återhämtning och städning.

Chrome 153.0.8010.53 har också körts mot den lokala webbappen med simulerade
API-svar. Inga riktiga ordrar, betalningar eller skrivare användes. Kontroller:

- Första laddning och omladdning med väntande order.
- Ny order under paus, flera ordrar, återlarm efter 30 sekunder och accept.
- Order under ljudtest och stopp när serverkön töms eller användaren loggar ut.
- Riktig AudioContext med simulerat nekat `resume()`, samt automatisk
  återhämtning när `resume()` tillåts igen.
- Återhämtning efter simulerad inaktivitet och felaktigt nätverkssvar.
- Orderhändelse via den återanslutna EventSource-instansen med pollingen pausad.
- 1280×800, 800×1280 och 375×812 utan horisontell överströmning.
- Inga ohanterade JavaScript-fel under scenarierna.

Mätning med Chromes `OfflineAudioContext`, mono, 48 kHz, 100 % larmnivå.
Den gamla koden lästes från `f1689ea`; hela respektive repetitionscykeln,
inklusive pauser, ingår i RMS-värdet.

| Mätning | Gammal ringsignal | Nytt kökslarm |
| --- | ---: | ---: |
| Toppnivå | 0,4934 | 0,9500 |
| RMS | 0,09897 | 0,70569 |
| RMS i dBFS | −20,09 | −3,03 |
| Cykellängd | 2,5 s | 1,1 s |

Skillnaden är **+17,06 dB RMS i den digitala signalen**, utan digital klippning.
Det är inte ett uppmätt ljudtryck i restaurangen eller en garanti för samma
skillnad efter Androids och högtalarens ljudbehandling.

Lokala granskningsartefakter finns i `output/playwright/`: körskriptet
`verify-order-alarm.cjs`, rapporten `order-alarm-verification.json`,
skärmbilder och WAV-filer för gammalt och nytt ljud. Artefakterna är ignorerade
av Git. Körskriptet använder Playwright och installerad Chrome som testverktyg.

## Kontroll på restaurangens Android-padda före godkänd drift

1. Öppna den verifierade webbversionen i Chrome. Aktivera och provlyssna på
   larmet med den högtalare och placering som används under arbetspasset.
   Kontrollera Androids medievolym och högtalarens egen volym.
2. Bekräfta att personalen hör larmet från arbetsplatserna med normalt köksbuller.
3. Verifiera en godkänd betald order, paus och accept. Prova även omladdning med
   väntande order samt en ny order under ljudtestet.
4. Prova efter längre verklig inaktivitet, ett kort Wi-Fi-avbrott och eventuell
   frånkoppling/återanslutning av den externa högtalaren.

Driftsättning, fysisk hörbarhet och dessa riktiga enhetskontroller är inte
verifierade av de lokala testerna. Wake Lock ersätter inte Chrome/Androids
begränsningar om webbläsaren stängs eller enheten låses.
