# Gallring och pågående ärenden

Superadmin (`owner`) kan under **Orderhistorik → Gallring** kontrollera och sedan gallra valda kunduppgifter, en order i taget. Ingen gallring sker automatiskt vid merge eller driftsättning. Befintliga order, orderrader, belopp, moms, betalningsreferenser, produktanpassningar och avbeställningsunderlag bevaras.

## Installera

1. Granska och kör **endast** `backend/src/db/migrations/20261117165627_order_retention_holds.sql` i Supabase före driftsättning. Den skapar undantagstabellen, körloggen och backendens gallringsfunktion. Installationen rensar inga orderuppgifter. Migrationen har inte körts i produktion av denna implementation.
2. Driftsätt backend och webb tillsammans. Befintlig Stripe-konfiguration används; inga nya miljövariabler behövs.
3. Logga in som superadmin, öppna gallringskontrollen och hämta aktuella uppgifter. Saknad migration eller ofullständigt lästa undantag stoppar kontrollen.

## Användning och regler

- **Övergivna kortköp:** namn/adress, kontaktuppgifter och rena arbetsanteckningar kan väljas först 30 dagar efter sista utgångna betalningssessionen. Alla matchande sessioner måste vara utgångna och obetalda. Orderkoppling, belopp, valuta, läge och datum kontrolleras på nytt vid körning. Saknad betalningsreferens eller osäker kontroll medger ingen sådan gallring. Kontant-, Swish- och telefonorder behandlas inte automatiskt som övergivna köp.
- **Avslutade order:** ange och bekräfta datum då ordern och berörda kundärenden faktiskt var avslutade. Köksklar och `updated_at` används aldrig som påhittade avslutsdatum. Ordinarie tidsgräns är 3 år för telefon/e-post och 90 dagar för rena arbetsanteckningar. Tidigare gallring av betalda, avslutade order kräver en separat individuell bekräftelse att behovet upphört; det loggas som `purpose_ended`. Tiderna är verksamhetens förslag, inte lagstadgade minimitider.
- **Bekräftelse:** ansvarig måste kontrollera att valda uppgifter inte behövs för bokföring, leverans, betalningsfordran eller ett pågående ärende. Anteckningar kräver dessutom uttrycklig bekräftelse att de enbart är tillfälliga arbetsinstruktioner. Namn/adress på genomförda order rensas inte av funktionen.
- **Undantag:** välj berörda fält, anledning och omprövningsdatum. Registrerande superadmin är ansvarig. Förfallna datum avslutar inte undantaget; det måste avslutas uttryckligen. Överlappande undantag gäller oberoende av varandra.
- **Körning:** markera uppgifter, bekräfta förutsättningarna och välj **Gallra valda uppgifter**. Servern läser om underlaget. Databasen låser ordern, kontrollerar version och aktiva undantag, rensar endast valda fält och skriver körloggen i samma transaktion. Vid fel i loggningen rullas rensningen tillbaka. Ändrad order eller saknade underlag stoppar körningen.

Telefon/e-post rensas både från orderns egna fält och, när den gruppen väljs, från motsvarande nycklar i leveransinformationen. Leveransens `pricing` och övriga uppgifter lämnas kvar. Inga hela order raderas. Bokföringens preliminära datum använder svenskt kalenderår men kan inte i sig godkänna radering av underlaget.

Kortförsök som är minst 30 dagar gamla kan inte startas om via Checkout-anropet. Det behövs för att ett redan övergivet köp inte ska börja betalas medan kunduppgifterna gallras. Nya beställningar, telefonorder och redan bekräftade betalningar behåller sina flöden.

Stripe-läsningen är begränsad till 20 sidor/2 000 sessioner och cirka 20 sekunder per kontroll. Om gränsen nås stoppas gallring av övergivna köp. Använd en annan avstämningsmetod om kontot växer över den gränsen.

## Körlogg och återställning

`order_retention_runs` innehåller orderreferens, valda fält, regel, ansvarigs admin-ID, tidpunkt och eventuellt bekräftat avslutsdatum. Inga raderade kundvärden kopieras dit. Tabellen är skyddad med RLS och nekad klientåtkomst; backend kan inte ändra eller radera loggposter.

Funktionen rensar orderfält i Supabase. Äldre krypterade backuper och kopior hos leverantörer rensas inte av detta anrop. Spara aktuell körlogg separat och skyddat före återställning; återställ isolerat och återtillämpa senare gallringar innan uppgifterna åter används. Om aktuell logg saknas måste behovet bedömas på nytt innan en gammal backup öppnas i verksamheten. Den lokala backupens vanliga rotation fortsätter som tidigare.

## Tester

- `npm run test:retention --workspace=@mormors-kunafa/backend`
- Windows PowerShell: `backend/tests/retention-migration.test.ps1` med lokala PostgreSQL-verktyg. Testar faktisk rensning, rättigheter, undantag, bevarade ekonomiska värden, versionskonflikt och återställning vid loggningsfel.
- `npm run web:build`
- `npm run test:retention:browser --workspace=@mormors-kunafa/web` med samma isolerade Playwright-verktyg som larmtesterna.

`backend/src/db/verification/order-retention-holds.sql` är en **isolerad testfil** och ska inte köras i produktion. Alla rensningstester använder syntetiska data; inga produktionsuppgifter har gallrats.
