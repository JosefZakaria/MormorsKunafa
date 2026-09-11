# Uppdaterat mål — lokal förberedelse av security-checks

Status 2026-09-11: den lokala etappen är genomförd på `ec04965`.
Utgå från releasejournalens sparade resultat; kör inte om oförändrade tester.
Den förseglade skannerns partial-flagga och dess två gamla checkpointposter
förklaras i granskningsrapporten. Inga externa steg är godkända.
Det pausade målobjektet har inte återupptagits eller ändrats automatiskt.

Fortsätt i C:\Users\alper\MormorsKunafa på branchen security-checks med endast
lokal teknisk förberedelse. Detta ersätter det tidigare målets tillstånd till
provideråtkomst, resursskapning, Preview-deployment, push och Draft PR.

Slutför Expo 54 → 55 → 56 → 57 i separata granskbara commits, med officiellt
stödda versioner. Kör ren npm ci med Node 24.18.1/npm 11.6.2, lokala byggen,
säkerhetsverifierare, backendtester, mobil typkontroll, Expo Doctor,
Android-/iOS-exporter, PostgreSQL/API/betalningssimulering, 22 browserfall och
det verkliga lokala backup-/restoreprovet mellan två oberoende testdatabaser.
Kräv 0 critical/high i npm audit och dokumentera varje kvarvarande moderate-post.

Bevara betalnings-, order-, refund-, revisions- och bokföringshistorik.
Använd endast syntetiska data och nyss skapade lokala testresurser.
Verifiera att backup/restore bevarar data och behörigheter inom de lokala
testernas dokumenterade omfattning. Påstå aldrig att produktionsbackup eller
full hosted A/B-avstämning är verifierad genom ett lokalt test.

När kod och konfiguration är färdiga, kör en komplett säkerhetsdiffgranskning
mot den lokalt frysta main-baslinjen med relevanta skills och subagents.
Rätta bekräftade critical/high-fynd, verifiera rättningarna och redovisa
eventuella verkliga täckningsluckor. Uppdatera dokumentation, PR-underlag,
releasejournal och den lokala masterchecklistan efter faktiska resultat.

Absoluta gränser i denna etapp:
- Gå inte in i Vercel eller andra driftleverantörers konton.
- Inga externa resurser, inloggningsförsök eller providerändringar.
- Ingen push eller PR-publicering eftersom det kan utlösa deployment.
- Ingen deployment, varken Preview eller Production.
- Ingen merge till main och ingen integration av förändrad main.
- Ingen produktionsåtkomst, datamigrering, gallring eller driftpåverkan.
- Inga riktiga betalningar, produktionsnyckelrotationer eller hemligheter i loggar.

Användaren ska få en tydlig förklaring innan något Vercel-/externt steg föreslås.
Sådana steg får börja först när användaren uttryckligen säger till. Den levande
webbplatsen och pågående köp ska förbli opåverkade av detta arbete.

Den lokala etappen är klar när ändringarna är granskbara och committade,
arbetskatalogen är ren, slutkandidatens lokala tester är gröna och en enkel
svensk rapport redovisar resultat, kvarstående risker och externa kontroller
som ännu inte har utförts. Rapporten är underlag för användarens nästa beslut,
inte ett merge- eller deploymentgodkännande. Lämna alla formella ägarbeslut öppna.
