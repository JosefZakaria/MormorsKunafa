# AI-telefonbeställningar: förberedelser steg 1–2

Kontrollerat 2026-11-05. Detta dokument skiljer ägarens verksamhetsregler
från aktuella produktdata och sådant som ännu saknas.

## Status och avgränsning

- `backend/src/utils/voiceOrderPolicy.ts` innehåller en fristående regelmodul.
- `backend/src/utils/voiceOpeningHours.ts` förbereder lokalernas grundschema och mottagning
  av upplösta öppettider från en framtida gemensam öppettidstjänst.
- Den används ännu inte av någon route, ElevenLabs, orderkö eller telefonanslutning.
- Inga produktpriser, lageruppgifter eller produktposter har ändrats i databasen.
- Steg 1 är förberett i kod och dokumentation. Steg 2 är inventerat; produktkompletteringar återstår.
- `priced` i modulens katalogresultat betyder bara att produktkoppling och pris finns.
  Det är inte ett godkännande av lager, öppettider, pausstatus eller registrering.

## Bekräftade verksamhetsregler från ägaren

- Ostkunafa på tallrik: malen eller krispig; liten för 2 och stor för 4 personer.
- Kunafa med ashta: endast krispig; liten för 3 och stor för 6 personer.
  Ägaren har bekräftat liten 179 kr och stor 299 kr. Beloppen finns som
  `setupPriceOre` inför skapandet av produktposterna, inte som ersättning för runtime-priser.
- Kunafa i bröd: endast malen; räknas per styck, utan tallriksstorlek.
- Bara bröd/kake: en separat produkt. Vid oklar beställning av kake behöver fyllningen förtydligas.
- Vid ”två kunafa” förtydligas först bröd/tallrik om sammanhanget inte redan anger det.
  Antal och portionsstorlek hålls isär; inga fria gissningar från transkriptionen till en produkt.
- Stor bricka: 20–25 personer; föreslås inte för små sällskap.
  Ägaren har bekräftat priset 1 000 kr per bricka; produktkopplingen saknas ännu.
- Extra/mindre ost samt utan sirap/pistage är gratis för ostkunafa.
  Anpassningar kopplas till rätt orderrad och föreslås inte på eget initiativ.
- Ingen offert eller beställningsregistrering för specialupplägg till bröllop/förlovning/fest.
  Kunden skickar själv sms till 0728682592; personal ringer upp utan garanterad tid.
- All hemleverans hänvisas till https://mormorskunafa.se, oavsett ort.
- Kunden väljer Höja eller Möllevången och uppger namn före bekräftelse av en beställning.
- Ingen fråga om datum/tid som standard. Kunden kan själv begära annan tid/dag.
- Normalt 15 minuter; fler än 4 stora kunafa ger 20 minuter. Exakt 4 ger 15 minuter.
  Modulen räknar ihop stora ostkunafa (4 personer) och stora ashta (6 personer) över alla rader.
  Bröd och små kunafa ökar inte antalet stora. Regeln ändrar ännu inte befintlig ordertid.
- Tidsregeln för 20–25-personersbrickan är inte fastställd; modulen ger inget automatiskt tidsbesked för den.
- Priser nämns bara på fråga. Koden räknar ändå totalsumman från aktuella priser.
- Arabiska ord: ناعمة = malen, خشنة = krispig, قطر = sirap,
  فستق = pistage, جبنة = ost, قشطة = ashta.
- مدلوقة erbjuds inte och شعيبيات erbjuds inte längre.
- Språkbyte ändrar inte orderuppgifterna. Kunden hör endast naturliga repliker,
  aldrig verktygsparametrar. Allergifrihet utlovas aldrig.
- Testläge får aldrig skapa order i personalens operativa kö eller utlova riktig tillagning.

## Verifierade produktkopplingar

Källa: läsning av `GET https://mormors-kunafa-backend.vercel.app/api/products` 2026-11-05.
Priser i API:t är i öre. Nedan visas kronor. Detta är en daterad kontroll, inte runtime-konfiguration.

- Kunafa i bröd: `59ea8dfb-0d29-4792-bc24-5826cda4c09a`; 69 kr/st.
- Finmald Kunafa (talad benämning ”malen”): `77048580-fd68-454d-b34b-395b351a96d4`;
  `2 personer`: 139 kr, `4 personer`: 239 kr.
- Krispig Kunafa: `37b8b656-2604-4ca6-9745-e0d6f52338c1`;
  `2 personer`: 139 kr, `4 personer`: 239 kr.
- Bröd (kaek): `856b591e-08b3-40ec-b505-cb3b143293bb`; `st`: 15 kr.
- Pistage Baklawa: 250 g 89 kr, 500 g 179 kr, 1 kg 349 kr.
- Baklawa Valnöt: 250 g 69 kr, 500 g 129 kr, 1 kg 249 kr.
- Ashta Baklawa: 500 g 149 kr, 1 kg 249 kr. Är inte kunafa med ashta.
- Halawet El Jibn: 250 g 79 kr, 500 g 149 kr, 1 kg 249 kr.
- Mad bel Ashta: 250 g 79 kr, 500 g 149 kr, 1 kg 249 kr. Är inte kunafa med ashta.
- Mormorsbox – BaklawaMix: 299 kr för produkten.
- Mamoul Pistage: 500 g 179 kr, 1 kg 349 kr.
- Baklawa Pistage 32 bitar: 349 kr/förpackning. Tidigare sparad AI-prislista angav 299 kr och är inaktuell här.
- Harise: 149 kr för produkten.

Vid denna kontroll var Halawet El Jibn i lager i båda lokalerna och Mamoul Pistage
slut i båda. Den tidigare inventeringen hade annan lagerstatus. Dessa uppgifter
ska hämtas aktuellt per lokal; dokumentet är inte ett löfte om lagerstatus.

Den offentliga listan omfattade 13 produkter. En efterföljande skrivskyddad SQL-läsning
av hela `public.products` i projektet `MormorsKunafa` (`zwxdvyxrvixlsetylhur`) bekräftade
samma 13 poster och priser, samtliga med `hidden=false`. Det finns alltså ingen dold
produktpost för kunafa med ashta eller 20–25-personersbrickan i denna tabell vid kontrollen.
Modulens två kopplingar lämnas `null` tills rätt ID och priser har lagts till och
kontrollerats. Ingen matchning görs enbart på ordet ”ashta”.

## Källor för priser och produktdata

- Produkt-ID används för bindning; produktbeskrivningar är inte en priskälla.
- Variantens pris ska läsas från aktuellt `products.variant_prices`.
- En produkt utan storleksval, exempelvis kunafa i bröd, använder `price_ore`.
- Bröd använder det uttryckliga enhetspriset `st` i `variant_prices`.
- Regelmodulen kräver råa databasfält; den ska inte matas med
  `rowToProduct`-resultat som redan har fått gamla reservpriser från `variantPricesForProduct`.
- Saknat/ogiltigt variantpris får inte ersättas med produktens frånpris eller
  de gamla 149/249-kronorspriserna i `defaultVariantPrices.ts`.
- Livekatalogens prisresultat använder inga fasta reservpriser. Ändrade indata ger ändrat prisresultat.
  De nya ägarbekräftade priserna används endast som underlag för kommande produktregistrering.
  `setupPriceOre` tas bort ur resultatet från `buildVoiceProductChoices`, så en saknad
  databasprodukt fortfarande får `product_missing` och inte kan prissättas därifrån.
- Katalogmappningen omfattar i detta steg de särskilda kunafaprodukterna och bröd.
  Övriga bakverk ska få egna verifierade regler innan de används i orderverktyget.

## Lokaler och öppettider

Källa: `GET https://mormors-kunafa-backend.vercel.app/api/locations` 2026-11-05.

- Höja: `2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601`, Karolingatan 1, 212 34 Malmö.
  Ägaren bekräftar benämningarna gamla/äldre lokalen och vid Coop i Höja.
- Möllevången: `2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f602`, Bergsgatan 35, 214 22 Malmö.
  Ägaren bekräftar att ”Mellovången” avser Möllevången.
- Båda var öppna för takeaway och inte pausade i API:t vid kontrollen.
  Detta är beställningsflaggor, inte besked om att lokalen är öppen just nu.
- Ägaren har nu bekräftat ordinarie schema: Höja tisdag–söndag 11–22, stängt måndag;
  Möllevången alla dagar 11–22. Det används i den fristående öppettidsmodulen.
- Befintliga `shared/utils/openingHours.ts` använder fortfarande 11–22 alla dagar.
  Hemsidans orderflöde har inte ändrats i detta arbete. Höjas måndagsundantag behöver
  kopplas till det gemensamma öppettidsflödet innan AI-beställningar släpps live.
- Superadmin ska enligt ägaren snart kunna ändra schema och specifika datum i dashboarden.
  Den funktionen byggs separat. AI:n ska använda samma upplösta aktuella data som hemsidan,
  för rätt lokal och datum. Företräde: datumundantag, därefter ordinarie schema.
- Adapterns `current_schedule` tar emot det redan upplösta resultatet från den gemensamma
  tjänsten. Ett uttryckligt `hours=null` betyder stängt. Andra öppettider kan även öppna
  Höja en enskild måndag. Fel lokal/datum eller ogiltiga tider ger hänvisning till hemsidan.
- `owner_schedule` är ett uttryckligt val för grundschemat innan dashboarden ansluts.
  När dashboarden väl är källa får en misslyckad uppslagning aldrig återgå till det gamla
  schemat. Använd `unavailable`, låt AI:n säga att aktuella tider finns på hemsidan och
  bekräfta inte någon hämtningstid utifrån okända öppettider.
- Inga webbsideändringar bevakas eller skrapas automatiskt av denna modul.
  Den framtida läsrouten behöver faktiskt hämta aktuella data; en prompt uppdaterar dem inte.
- Att Höja tekniskt kan hantera hemsidans leveranser ändrar inte telefonregeln:
  agenten hänvisar alla hemleveransbeställningar till hemsidan.

## Återstående arbete före en orderkoppling

1. Skapa rätt katalogposter för ashtakunafa (179/299 kr) och stor bricka (1 000 kr).
   Den aktuella kontrollen omfattar även dolda produkter; inga motsvarande poster hittades.
2. Fastställ den stora brickans fyllning/variant och tillagningstid.
3. Anslut superadmins kommande schema/datumundantag som gemensam källa för hemsida och AI.
   Ordinarie tider är nu bekräftade, inklusive Höjas måndagsstängning.
4. Koppla verifierad katalog, lager, pausflaggor och öppettider till en skyddad läsroute (planens steg 3).
5. Koppla 15/20-minutersregeln till orderkontroll och hantera kundvald tid separat (steg 4).
6. Spara anpassningar per orderrad. Nuvarande manuella telefonorder har en generell notis,
   men sätter `modifications_json` till null.
7. Lägg till kundbekräftelse, atomiskt sparande, dubbleringsskydd och separat integrationstillgång.
   Återanvänd inte ägarens inloggning. Nuvarande telefonroute kräver ägarbehörighet.
8. Bygg testflöde utan operativa order/notiser innan ElevenLabs kopplas till skrivande verktyg.

## Verifiering

`npm run test:voice-order-policy --workspace=@mormors-kunafa/backend`

Tester omfattar gränsen 4/5 stora, blandade orderrader, små/bröd, ashtastorlekar,
aktuella prisändringar, saknade priser, separata brödprodukter samt saknade/dolda
katalogposter. Öppettidstester omfattar Höjas måndagsstängning, Möllevångens måndagsöppet,
datumundantag, olika lokaler och hänvisning till hemsidan vid uppslagningsfel.
De ringer inte Fish/ElevenLabs och skriver inte till någon databas.
