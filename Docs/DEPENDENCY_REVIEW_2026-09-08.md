# Beroendegranskning — 2026-09-08, uppdaterad 2026-09-11

**Slutlig lokal rapport. SDK 55, SDK 56 och SDK 57 är separat committade. SDK 56:s kända Hermes-fel är dokumenterat utan undantag. SDK 57 (`e90597a`) passerar ren installation, Expo Doctor 21/21, typer, Android-/iOS-export, webbbygge och 193 backendtester. Audit visar 0 high/critical och 14 moderate. Hela den lokala slutmatrisen på `ec04965` passerar; den nya fullständiga diffgranskningen och separata efterföljande skriptgranskningen är klara.** Ett rent high/critical-resultat är inte ett releasegodkännande. Kvarvarande moderate-risker är analyserade men inte godkända av ägaren.

Omfattningen är monorepots npm-workspaces, root-lockfilen och de faktiskt installerade webb-, backend- och mobilberoendena. Uppgraderingen görs sekventiellt på `security-checks`, med en separat commit efter varje stabilt SDK-steg. Ingen `npm audit fix --force`, `--legacy-peer-deps`, produktionsinstallation eller ostödd transitive major-override ingår. Råa audit- och testartefakter hålls i den ignorerade projektcachen. Den återupptagna uppgiften är endast lokal förberedelse: inga providerinloggningar eller externa resurser, ingen push/PR, deployment, merge eller produktionsåtkomst ingår. GitHub CI-resultat eller native-byggen får därför inte tillskrivas lokala kontroller.

## Sekventiella SDK-steg och evidens

Expo rekommenderar [ett SDK-steg i taget](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), följt av `expo install --fix`, Expo Doctor och versionsspecifika migrationsåtgärder. Följande versionsmatriser verifierades mot offentlig npm-metadata och Expos gitHead-bundna paketmatriser den 11 september 2026. Installerade mobilversioner skiljs nedan från slutförda tester och commits.

| Steg | Expo / Router | React och React DOM / React Native | Commit och status | Audit |
| --- | --- | --- | --- | --- |
| SDK 54, tidigare baslinje | 54.0.37 / 6.0.24 | 19.1.0 / 0.81.5 | Tidigare dokumenterad lokal baslinje före uppgraderingen | 26 paketposter: 0 critical, 9 high, 17 moderate |
| SDK 54 → 55 | 55.0.31 / 55.0.18 | 19.2.0 / 0.83.10 | `e278e86ee951e3357f0793941e10cc50fa9982ed`, `chore(mobile): upgrade to Expo SDK 55 with aligned React` | Sparad SDK 55-audit: 0 critical, 0 high, 18 moderate |
| SDK 55 → 56 | 56.0.21 / 56.2.20 | 19.2.3 / 0.85.3 | `344cb2002c0a3d4e689140c91eefdf7a982ac8c4`, `chore(mobile): migrate Expo SDK 56 and Router APIs`; Doctor 21/22 med känt kvarstående Hermes-fel | Sparad SDK 56-audit: 0 critical, 0 high, 14 moderate |
| SDK 56 → 57 | Rent installerat: 57.0.22 / 57.0.21 | 19.2.3 / 0.86.3 | `e90597a7e34769a748aee47e7a4d535eae6081f3`; Doctor 21/21, typer, exporter, webb och 193 backendtester passerar | Ny audit efter ren installation: 0 critical, 0 high, 14 moderate |

Primärunderlag: [SDK 55-matris](https://raw.githubusercontent.com/expo/expo/30a1c5b4871a5a3f0f6545be0c2d1f67521a5e6f/packages/expo/bundledNativeModules.json), [SDK 56-matris](https://raw.githubusercontent.com/expo/expo/1b8eb0e13635d3ef52c1c11d305ff927d01390ae/packages/expo/bundledNativeModules.json), [SDK 57-matris](https://raw.githubusercontent.com/expo/expo/9e5319c0f821a27b7924841903abae50e2b41790/packages/expo/bundledNativeModules.json) och [Expos SDK-referens](https://docs.expo.dev/versions/latest/).

SDK 55-commiten uppdaterar React/React DOM i root, webb och mobil till samma stödda version och tar bort root-overrides som låste React till SDK 54. Mobilens typer, test-renderer och native-paket anpassas. Borttagna appkonfigurationsfält rensas, Font/WebBrowser-plugins deklareras och färgtemats typning hanterar React Natives aktuella returvärden. Expo Doctor låses till 1.20.4. Verifieraren kontrollerar installerade SDK-versioner och enhetlig React-upplösning; det gamla undici-beroendet har försvunnit och dess override tagits bort.

| Verifiering av SDK 55-steget | Resultat och gräns |
| --- | --- |
| Expo Doctor 1.20.4 | 20/20 kontroller passerar |
| Mobil TypeScript | Pass |
| Android- och iOS-export | Båda Metro-exporterna passerar; detta är inte kompilerade eller enhetstestade native-appar |
| Playwright | 22/22 passerar på Desktop Chrome och Pixel 7-profil; avser webbflöden, inte mobilappen |
| `npm audit --json` | `.cache/security-test/sdk55-audit.json`: 18 moderate, 0 high, 0 critical; tabellen nedan dokumenterar just denna snapshot |
| Slutlig ren installation och full test-/CI-matris på kandidatcommitten | Slutlig lokal matris på `ec04965` passerar. Hosted CI är inte körd. |

Den sparade SDK 55-auditen skapades före SDK-stegets commit. Den ska inte beskrivas som en separat audit körd på exakt slutligt PR-HEAD. Senare deduplicering och SDK-steg kräver ett nytt resultat för den slutliga lockfilen.

## SDK 56: verifierat mellanresultat med öppet upstreamfel

Commit `344cb2002c0a3d4e689140c91eefdf7a982ac8c4` innehåller Expo 56.0.21, Router 56.2.20, React/React DOM 19.2.3, React Native 0.85.3 och TypeScript 6.0.3. Appens React Navigation-import flyttas till Routers motsvarande export. Splash-konfigurationen flyttas till plugin-formatet och kod anpassas till ColorValue-propkrav samt borttagen `StyleSheet.absoluteFillObject`.

Identiska dubbletter i native-modulerna löstes med riktad, kompatibel deduplicering efter att generell `npm dedupe` gav ERESOLVE. Slutinstallationen använde inga peer-undantag eller transitive major-overrides och gav inga peer-varningar. js-yaml 3 försvann ur det installerade trädet; den kvarvarande 4.3.2-kopian hämtas från det verkliga xcpretty-beroendet för regressionstestet.

| SDK 56-kontroll | Faktiskt resultat |
| --- | --- |
| Expo Doctor | **21/22; kvarstående fel är den kända Hermes-regressionen. Inte godkänd som 22/22.** |
| Mobil TypeScript | Pass med den faktiskt upplösta kompilatorn 6.0.3 |
| Android-export | Pass, 1 701 bundlade moduler |
| iOS-export | Pass, 1 624 bundlade moduler |
| Webbbygge och artefaktkontroll | Pass; 52 artefaktkontroller |
| Beroende- och länkkontroller | Pass |
| Playwright | 22/22 pass, cirka fyra minuter |
| Sparad audit | `.cache/security-test/sdk56-audit.json`: 0 critical, 0 high, 14 moderate |

Den första Doctor-körningen gav 19/22. De lokala splash-/dubblettproblemen rättades; det återstående Hermes-felet lämnades synligt utan undantag eller undertryckt kontroll. SDK 56 är ett mellanled som inte rekommenderas för release i detta skick. SDK 57 måste bevisligen installera den rättade React Native/Hermes-versionen och få en godkänd Doctor-körning.

## SDK 57: ren installation och slutlig lokal verifiering

Den första installationen placerade React Native 0.86.3, Reanimated 4.5.1 och Worklets 0.10.1 i mobilens workspace men behöll SDK 56-gruppen 0.85.3/4.3.1/0.8.3 i root. Gruppens egna peer-intervall höll kvar den, bland annat versionsbundna virtualized-lists och Reanimated/Worklets-intervall som slutar vid RN 0.85. Riktade installationer och uppdateringar gav inget installationsfel men avlägsnade inte gruppen. Doctor-felet lämnades synligt.

Den rena lösningen skapades av npm i en lokal fixture utan gammalt lock eller node_modules. Alla direkta beroenden begränsades där till redan verifierade versioner under den första upplösningen. Därefter återställdes originalmanifestens intervall och npm normaliserade låsfilen. Inga permanenta extra root-pins, manuella ändringar av transitiva lockposter eller peer-undantag användes. Det följer [npm install:s låsfilsbeteende](https://docs.npmjs.com/cli/v11/commands/npm-install/). Projektets npm 11.6.2-källa kontrollerades också: utan lock kan ett gammalt node_modules annars återanvändas.

Två kompatibilitetsrättningar gjordes i deklarationerna. Gesture Handler var automatiskt installerad som 3.3.0 trots SDK 57-matrisens `~2.32.0`; mobilappen deklarerar nu detta stödda intervall. Den tidigare globala xmldom-låsningen till 0.8.15 skulle också ha träffat `plist@3.1.1`, som kräver `^0.9.10`. Root-overriden begränsas därför till `@xmldom/xmldom@^0.8`: `@expo/plist@0.8.1` får fortsatt rättad 0.8.15 och plist får kompatibel 0.9.12. Genomgång av 828 faktiska installerade manifest före den rena installationen hittade ingen annan inkompatibel aktiv override-kant.

Den normaliserade fixture-låsfilen granskades separat före antagande som root-lock:

| Kontroll | Resultat |
| --- | --- |
| SDK 57:s bundledNativeModules-matris | 32/32 förekommande paketposter uppfyller respektive semverintervall, även transitiva och automatiskt installerade peers; inga dubbla vägar för dessa namn |
| RN / Reanimated / Worklets / Gesture Handler | Endast 0.86.3 / 4.5.1 / 0.10.1 / 2.32.0 |
| Direkta root-/workspace-beroenden | Samtliga 73 behåller upplöst version jämfört med trädet efter SDK 57-deklarationerna; Stripe 22.1.1 och Supabase 2.106.1 bevaras |
| Beroendekanternas fullständighet | 1 941 kontrollerade dependencies/dev/optional/peer-kanter; inga obligatoriska luckor eller inkompatibla semverintervall. 21 uttryckligen valfria peers saknas, vilket deras manifest tillåter. |
| Manifest och workspace-länkar | Alla fem fixture-manifest motsvarar projektets originaldeklarationer och lockets manifestfält; fyra relativa workspace-länkar har befintliga mål |
| Registry och integritetsmetadata | 870 registrypaket har HTTPS npmjs-adresser och integrity. 18 tidigare ofullständiga poster återfår metadata; inga befintliga värden ändras för samma namn/version. Inga file-/absoluta fixturesökvägar finns. |
| Plattformsberoenden | Alla deklarerade optionalDependency-kanter finns, inklusive Rollup/Esbuild-varianter och Linux LZMA-paketet |

Lösningen innehåller 879 lockposter mot 912 före omupplösningen. Av 62 ändrade versionsmängder gäller många borttagna SDK 56-kopior och 25 Rollup-plattformsvarianter. Även kompatibla transitiva uppdateringar ingår: tre Babel-transformer 7.27.1 → 7.29.7, sourcemap-codec 1.5.5 → 1.6.0, Supabase phoenix 0.4.2 → 0.4.5, estree-typer 1.0.8 → 1.0.9, bn.js 4.12.3 → 4.12.5, Rollup 4.60.1 → 4.63.1, tinyglobby 0.2.15 → 0.2.17, yaml 2.8.3 → 2.9.0 och fyra Browserslist-data-/uppdateringspaket inom respektive intervall. Inga transitiva majors framtvingas. Den granskade låsfilen har nu antagits och installerats med ren `npm ci`. Strukturell lockgranskning bevisar inte runtimefunktion; kvarstående typer, exporter och funktionsprov redovisas separat nedan.

| SDK 57-kontroll efter ren installation | Faktiskt resultat |
| --- | --- |
| Runtime och ren installation | Node 24.18.1 / npm 11.6.2; `npm ci` installerar 789 paket utan peer-/override-varningar. uuid 7:s deprecation visas och är inte undertryckt. |
| Expo Doctor 1.20.4 | **21/21 passerar; inga undantag eller undertryckta kontroller** |
| Installerade native-versioner | Samtliga förekommande paket i SDK-matrisen verifieras med semver, även transitiva paket |
| Beroende-, länk-, webbläsarlagrings- och lokal distributionskonfiguration | Pass; den sistnämnda är en lokal konfigurationskontroll, ingen deployment |
| Webbbygge och artefakter | Pass; 1 798 moduler, 52 artefaktkontroller. `index-Bw75IWxL.js` är 539,08 kB; Vites 500 kB-varning visas. |
| Ny `npm audit --json` | `.cache/security-test/sdk57-audit.json`: 0 critical, 0 high, 14 moderate. Samtliga 14 poster och deras versioner matchar både slutligt antaget lock och faktisk installation. |
| Mobil-/backendtyper och backendtester | Pass; 193 tester, 0 fel, 0 överhoppade |
| Android-/iOS-export | Pass; 1 732 respektive 1 648 moduler |
| SDK 57-commit | `e90597a`, 4 filer, +2 464/-2 522 |
| Revisionsbunden slutmatris inklusive webbläsartester | Pass på `ec04965`, inklusive 22/22 browserfall och verklig lokal restore |

## Tidigare rättningar som bevaras

| Paket eller kedja | Verifierad ändring och betydelse |
| --- | --- |
| `@xmldom/xmldom` | 0.8.14 → 0.8.15; [underhållarens serialiseringsadvisory](https://github.com/xmldom/xmldom/security/advisories/GHSA-6gmq-8vp8-gcm6) |
| `browserslist` | 4.28.1 → 4.28.9; [underhållarens advisory](https://github.com/browserslist/browserslist/security/advisories/GHSA-73wf-gq98-2v4g) |
| Express / `body-parser` / `qs` | 4.22.2 / 1.20.6 / 6.15.3 → 5.2.1 / 2.3.0 / 6.16.0, med Express 5-anpassning och direkta regressionskontroller för [qs DoS](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g) och [constructor/isBuffer](https://github.com/ljharb/qs/security/advisories/GHSA-x5fp-wj9c-mxmx) |
| `js-yaml` | SDK 55 hade rättade 3.15.2 och 4.3.2; SDK 56 har endast 4.3.2 installerad. Verifieraren kontrollerar det verkliga trädet och att tomma merge-källor förbrukar den angivna resursbudgeten enligt [underhållarens advisory](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh). Den kvarvarande deklarationen för js-yaml 3 i root-overrides innebär inte att paketet är installerat. |
| `postcss` | SDK 54 hade en separat berörd 8.4.49-kopia. SDK 55:s Metro Config accepterar `^8.5.14`; den granskade SDK 55-lockfilen innehåller endast 8.5.28. Det är en faktiskt installerad kompatibel lösning, inte enbart en override-deklaration. |
| `image-size` | SDK 54:s Metro-kedja installerade 1.2.1. SDK 55 använder `@expo/metro@55.1.2` / `metro@0.83.8`, och `image-size` finns inte längre i den granskade lockfilen. Den berörda kedjan har därmed tagits bort; detta påstår inte att gamla image-size-versioner är rättade. |

Äldre auditresultat var 29 poster den 8 september och 30 före Express/js-yaml-rättningarna den 9 september. Därefter återstod 26 poster i SDK 54. SDK 55:s sparade audit visar att high-kedjorna har försvunnit. Den sparade SDK 57-auditen behåller 0 high/critical. Slutkandidatens revisionsbundna audit på `ec04965` bekräftar 0 critical/high och 14 moderate.

En override ensam bevisar ingen rättning; se även [npm:s workspace-problem](https://github.com/npm/cli/issues/9659). `scripts/verify-dependency-security.mjs` jämför därför faktisk paketupplösning och lockfil samt behåller qs/js-yaml-regressionskontrollerna.

## Individuell genomgång av moderate-paketposterna

Detta är **två grundadvisories som sprids genom beroendegrafen**. SDK 55 har 18 paketposter: åtta via `decode-uri-component`, tio via `uuid`. SDK 56 och SDK 57:s nya audit efter ren installation har vardera 14: tre via `decode-uri-component`, elva via `uuid`. Fem externa React Navigation-poster försvann och inline-modules tillkom som verktygsförälder. Varje rad har kontrollerats mot respektive audits `via` och källkoden; överordnade paket har ingen ytterligare egen advisory i dessa snapshots. SDK 57-kolumnen kommer från den nya `.cache/security-test/sdk57-audit.json` efter ren `npm ci`. Alla dess paketnoder har jämförts med både det antagna root-locket och respektive installerat package.json. SDK-commit `e90597a` och separat slutkontroll på `ec04965` är klara. `—` betyder att paketet inte är en auditpost i det SDK-steget.

| Paket | SDK 55 | SDK 56 | SDK 57 efter ren installation | Grundadvisory och faktisk roll |
| --- | --- | --- | --- | --- |
| `decode-uri-component` | 0.2.2 | 0.2.2 | 0.2.2 | Decoder-advisory; berörd runtimeavkodare |
| `query-string` | 7.1.3 | 7.1.3 | 7.1.3 | Decoder-advisory via decoder; `parse()` avkodar, medan `stringify()` inte anropar avkodaren |
| `@react-navigation/core` | 7.21.13 | — | — | Decoder-advisory via query-string; dess generella inkommande parser anropar `queryString.parse()` |
| `@react-navigation/native` | 7.3.18 | — | — | Decoder-advisory via core; navigationens runtimeberoende |
| `@react-navigation/elements` | 2.9.40 | — | — | Decoder-advisory via native; navigationens UI-beroende |
| `@react-navigation/bottom-tabs` | 7.18.18 | — | — | Decoder-advisory via elements/native; runtime för fliknavigation |
| `@react-navigation/native-stack` | 7.18.10 | — | — | Decoder-advisory via elements/native; runtime för stacknavigation |
| `expo-router` | 55.0.18 | 56.2.20 | 57.0.21 | Decoder-advisory; runtime med egen inkommande parser och query-string för utgående länkar |
| `uuid` | 7.0.3 | 7.0.3 | 7.0.3 | UUID-advisory; installerat genom Xcode-verktyg |
| `xcode` | 3.0.1 | 3.0.1 | 3.0.1 | UUID-advisory via uuid; projektgeneratorn använder `uuid.v4()` utan buffer/offset |
| `@expo/config-plugins` | 55.0.11 | 56.0.16 | 57.0.9 | UUID-advisory via xcode; konfiguration och generering av native-projekt |
| `@expo/config` | 55.0.21 | 56.0.14 | 57.0.9 | UUID-advisory via config-plugins; konfigurationsverktyg |
| `@expo/prebuild-config` | 55.0.22 | 56.0.23 | 57.0.16 | UUID-advisory via config/config-plugins; native-projektgenerering |
| `@expo/inline-modules` | — | 0.0.16 | 0.1.7 | UUID-advisory via config-plugins; verktyg för inline-native-moduler |
| `@expo/local-build-cache-provider` | 55.0.16 | 56.0.12 | 57.0.8 | UUID-advisory via config; lokalt byggverktyg |
| `@expo/metro-config` | 55.0.27 | 56.0.19 | 57.0.12 | UUID-advisory via config; bundlerkonfiguration |
| `@expo/cli` | 55.0.36 | 56.1.25 | 57.0.24 | UUID-advisory via konfigurations-/prebuildverktyg; CLI |
| `expo` | 55.0.31 | 56.0.21 | 57.0.22 | UUID-advisory via verktygsberoenden; posten visar inte en sårbar Expo-runtimefunktion |
| `expo-splash-screen` | 55.0.25 | 56.0.15 | 57.0.9 | UUID-advisory via prebuild-config i SDK 55, direkt via config-plugins i SDK 56/57; visar inte sårbar splash-runtimekod |

### decode-uri-component: kvarstående runtimekedja

[Underhållarens GHSA-vcc3-ghjq-m6fr / CVE-2026-45822](https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-vcc3-ghjq-m6fr) gäller överdriven CPU-belastning när särskilt felaktig procentkodning når `decodeUriComponent()`. Versioner till och med 0.4.2 är berörda; 0.5.0 innehåller rättningen. I denna installation kräver `query-string@7.1.3` avkodaren `^0.2.2`.

Publicerad paketkod för `expo-router@55.0.18` och `57.0.21` granskades utan installation: SDK 55 vid gitHead `764641f87074c1e49d004790c5a5983f4b5bfc6b`, SDK 57 vid `9e5319c0f821a27b7924841903abae50e2b41790`. Appens normala Router-linking binds genom `getLinkingConfig` och `link/linking` till `fork/getStateFromPath`; dess `parseQueryParams` använder `URL.searchParams`. De granskade utgående Router-serialiserarna använder `queryString.stringify()`. [Query-string 7.1.3-källan](https://github.com/sindresorhus/query-string/blob/v7.1.3/index.js) skiljer dessa kodvägar.

Det finns samtidigt en alternativ generell inkommande parser: SDK 55:s `@react-navigation/core` anropar `queryString.parse()`, och SDK 57 behåller samma typ av anrop i `build/react-navigation/core/getStateFromPath.js`. SDK 57:s forkning av React Navigation betyder därför inte att avkodningskedjan är borta. En exploaterbar väg genom appens normala Router-konfiguration har inte demonstrerats. Det har heller inte bevisats att berörd kod saknas i slutbundlarna eller att alla alternativa parseringångar är skyddade.

`verify:mobile-links` kör den faktiska Router-forkens hjälpfunktion med en giltig query och ett begränsat felaktigt exempel. Testet bevisar dessa två fall. Det bevisar inte alla parseringångar, stora eller andra felaktiga indata, värsta tidskomplexitet eller enhetens verkliga deep-link-flöde. Det får inte beskrivas som att advisoryn är rättad.

Offentlig npm-metadata den 11 september visar att senaste `query-string` är 9.5.1 med `decode-uri-component@^0.5.0`, medan senaste 7.x fortfarande är 7.1.3. Router 55 och 57 kräver `^7.1.3`. En uppgradering till 9.x eller override till decoder 0.5.0 ligger utanför förälderns stödda intervall och ingår inte. **Kvarstående moderate; ägarens riskbeslut är öppet.**

### uuid: kvarstående verktygskedja

[Underhållarens GHSA-w5hq-g745-h8pq / CVE-2026-41907](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) gäller saknad gränskontroll i API-metoderna `v3/v5/v6` när anroparen lämnar en för liten utdata-buffer eller felaktig offset. Det kan ge tysta partiella identifierarskrivningar. Den berörda installerade linjen är 7.0.3; den rättade 11.x-linjen börjar vid 11.1.1.

[Xcode 3.0.1:s `generateUuid`](https://github.com/apache/cordova-node-xcode/blob/3.0.1/lib/pbxProject.js) anropar `uuid.v4()` utan buffer/offset och omformar den returnerade strängen för Xcode-projektet. Den granskade anropsvägen uppfyller alltså inte advisoryns förutsättningar. Appens webb-/backend-/mobilkod har inga egna importer av uuid-paketet i den granskade sökningen.

SDK 57:s config-plugins 57.0.9 kräver fortfarande `xcode@^3.0.1`, och dess Xcode-anrop ligger i iOS-konfiguration/projektgenerering. [Config-plugins paketmanifest](https://raw.githubusercontent.com/expo/expo/52fc013ec8c75e89ba8f83c167e4b6b0416e6bf7/packages/@expo/config-plugins/package.json). Senaste publicerade xcode är fortfarande 3.0.1 med `uuid@^7.0.3`. Ingen stödd kompatibel upstreamuppdatering är därmed tillgänglig i denna kedja. En framtvingad uuid-major ingår inte. **Kvarstående moderate i verktyg, utan visad påverkad anropsväg; ägarens riskbeslut är öppet.**

Audits föreslagna Expo 46-/Router 5-versioner är nedgraderingar utanför den aktuella SDK-matrisen. `fixAvailable` är inte bevis på att en sådan ändring är kompatibel. Antalet paketposter kan förändras vid deduplicering och när SDK 56/57 ersätter föräldrapaket; båda grundkedjorna måste fortfarande kontrolleras mot slutlig lockfil och kod.

## SDK 56-regression och native-verifieringsgräns

[SDK 56-releaseinformationen](https://expo.dev/changelog/sdk-56) anger Hermes v1 som standard och en känd minnesregression för appar som importerar Reanimated/Worklets. Appen använder dessa bibliotek, så ett lyckat Metro-exportsteg för SDK 56 bevisar inte att regressionsrisken saknas. SDK 56 är ett mellanled med dokumenterat öppet Doctor-fel; det är inte slutkandidat.

[SDK 57-releaseinformationen](https://expo.dev/changelog/sdk-57) anger rättning av minnesregressionen från Expo 57.0.9 och rättning av utvecklingsstartregressionen i 57.0.17 med React Native 0.86.3. Målet 57.0.22 ligger efter dessa versioner. Den rena installationen har endast Expo 57.0.22, React Native 0.86.3, Reanimated 4.5.1 och Worklets 0.10.1 i den berörda gruppen. Expo Doctor passerar 21/21, så den tidigare versionsbundna Hermes-kontrollen är nu godkänd. Detta är inte en mätning av appens minnesbeteende på fysisk enhet.

SDK 56 höjer även TypeScript till 6.0.3 via `expo install --fix`, iOS-minimum till 16.4 och Xcode-minimum till 26.4. [Router-migrationen 55 → 56](https://docs.expo.dev/router/migrate/sdk-55-to-56/) kräver att direkta `@react-navigation/*`-importer i appkod flyttas till motsvarande `expo-router`-exporter. Dessa ändringar måste dokumenteras utifrån de genomförda SDK-stegen, inte enbart från releaseinformationen.

Lokala kontroller använder Node 24.18.1 och npm 11.6.2. Expo Doctor, TypeScript och Android-/iOS-export kontrollerar beroenden, typer och JavaScript-/assetbundling. De bevisar inte Xcode-/Gradle-kompilering, signering, installationsstart, faktisk native-modulkompatibilitet, minnesbeteende, deep links eller fysisk enhetsfunktion. Native iOS-bygge kräver en kompatibel macOS/Xcode-miljö eller EAS; någon sådan slutförd verifiering påstås inte här. Playwrights mobilprofil provar webbappen i Chromium och ersätter inte native-testning.

## Slutläge och återstående externa beslut

Slutlig lokal kodkandidat: `ec04965833c8a6667e6886d3509757dc2e3b55e6`. Hela den lokala matrisen passerar
med Node 24.18.1/npm 11.6.2: vanlig ren `npm ci`, säkerhetsverifierare, webbbygge,
193 backendtester (0 fel/överhoppade), mobiltyper, Doctor 21/21,
Android-/iOS-export, PostgreSQL, anslutningsisolering, API-/betalningssimulering,
verklig oberoende lokal backup/restore och 22/22 browserfall. Audit: 0 critical,
0 high, 14 individuellt analyserade moderate-poster utan ägarens riskgodkännande.
Råbevis och tidsstämplar finns i ignorerade `.cache/security-test/verified-*`
och `final-local-matrix-results.json`. Dokumentationsändringar efter denna
kodkandidat kräver inte omkörning av oförändrad kod.

SDK 56:s verkliga 21/22-resultat bevaras. SDK 57:s rena träd passerar Doctor
21/21; fysisk native-/minnesverifiering är separat och inte utförd. Inga
paketvarningar har dolts. De 14 moderate-posterna är inte rättade eller godkända
bara för att high/critical-grinden passerar. GitHub CI, signering och enhetstest
är framtida separat verifiering. Ägarens moderate-beslut är fortfarande öppet.
