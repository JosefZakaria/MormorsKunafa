import 'dotenv/config';
import { db } from '../db/connection.js';

const updates: { id: string; name: string; description: string }[] = [
  {
    id: 'fc469599-82e8-4ea3-aa18-0436bc2a2afd',
    name: 'Ashta Baklawa',
    description:
      'En lyxig fusion av smaker\n\n' +
      'Ashta Baklawa är en härlig kombination av den klassiska baklawan med en rik och krämig ashta (arabiskt grädde) i mitten. ' +
      'Den smöriga, spröda degen omsluter det lena lagret av ashta och ger en perfekt balans mellan sött och krämigt. ' +
      'Toppad med finhackade pistage och bakad till perfektion, erbjuder denna baklawa en oemotståndlig smakupplevelse.\n\n' +
      'För vem?\n' +
      'För dig som vill njuta av en sofistikerad twist på en klassisk favorit, för dig som älskar den perfekta blandningen av smördeg och krämig fyllning, och för dig som söker något unikt och delikat.\n\n' +
      'Mer än bara en efterrätt – en smak av tradition och lyx.',
  },
  {
    id: '1ae3fd7a-0042-4220-b330-b27b3147a0a6',
    name: 'Baklawa Pistage',
    description:
      'Baklawa Pistage – ren smak, utan överdrift\n\n' +
      'Det första du märker är balansen.\n' +
      'Inte för söt. Inte för tung. Bara precis rätt.\n\n' +
      'Vi valde att hålla igen på sirapen för att lyfta fram det som verkligen betyder något:\n' +
      'De finaste pistagenötterna, den handrullade filodegen, och det äkta smöret som binder allt samman.\n' +
      'Resultatet? En baklawa du kan njuta av om och om igen, utan att tröttna.\n\n' +
      'Här handlar det inte om att överväldiga utan om att förfina.\n' +
      'Varje tugga är tydlig, krispig och rik på smak. En elegant tolkning av ett älskat klassiskt bakverk.',
  },
  {
    id: '054b4adf-4da3-42c0-aa9b-b939023aafad',
    name: 'Baklawa Valnöt',
    description:
      'Valnöt som den ska smaka\n\n' +
      'Inga genvägar. Inget överflöd. Bara äkta smak.\n\n' +
      'Vi har tagit fram en baklawa där valnöten får stå i centrum – rostad, grovhackad och precis så rik som den ska vara. ' +
      'Den krispiga filodegen möter lent smör och en lätt sockerlag, varsamt ringlad för att lyfta – inte ta över.\n\n' +
      'Här finns ingen tröttande sötma. Bara en varm, rund smak som stannar kvar.\n' +
      'En baklawa för dig som uppskattar det enkla, men välgjorda. ' +
      'Något att njuta av långsamt – med kaffe, med tystnad, med någon du tycker om.\n\n' +
      'Baklawa Valnöt – rustik, balanserad och minnesvärd.\n' +
      'Precis som den ska smaka.\n\n' +
      '500 gram blir ca. 16–20 små bitar.',
  },
  {
    id: '856b591e-08b3-40ec-b505-cb3b143293bb',
    name: 'Bröd (Kaek)',
    description:
      'Det är vanligt att njuta av Kunafa inuti bröd. Man lägger sirap i brödet och fyller det sedan med Kunafa. ' +
      'Välj hur många bröd du vill ha tillsammans med din Kunafa-beställning.',
  },
  {
    id: '77048580-fd68-454d-b34b-395b351a96d4',
    name: 'Finmald Kunafa',
    description:
      'Berättelsen börjar här…\n\n' +
      'Kanske har du haft en dag då du längtade efter värme. Efter ett ögonblick av stillhet som kramar om dig varsamt. ' +
      'En smak som tar dig tillbaka till barndomens trygghet. ' +
      'I just det ögonblicket finns det inget som slår en varm Kunafa som smälter i munnen, som en viskning från en svunnen tid.\n\n' +
      'Finmald Kunafa är en fin strimlad deg blandad med äkta arabiskt smör (Ghee), fylld med krämig ost, ' +
      'ringlad med lätt sockerlag och toppad med pistagenötter – som en gyllene slutpunkt på varje berättelse.\n\n' +
      'En produkt som förändrar allt\n\n' +
      'Kunafa är inte bara en efterrätt, den är en ritual, ett ögonblick, en hel upplevelse som börjar med doften och slutar med ett leende. ' +
      'Det är smaken av hem, av familj, av kvällar där man samlas runt en plåt och någon ropar: ' +
      '"Passa på Kunafan innan den tar slut!" ' +
      'Redan från första tuggan känner du skillnaden – en skillnad skapad av kvalitet, känsla och kärlek i varje lager.\n\n' +
      'Vem passar den för?\n\n' +
      '– För Smakälskare som vill ha en smakupplevelse att minnas.\n' +
      '– För dem som föredrar det mjuka framför det krispiga – något som smälter i hjärtat.\n' +
      '– Som en gåva fylld med omtanke och värme – för vår lena Kunafa är ett ätbart kärleksbrev.',
  },
  {
    id: '6c1efa0e-149c-4259-9bd0-f85fd35f4b62',
    name: 'Halawet El Jibn',
    description:
      'En söt och krämig delikatess\n\n' +
      'Halawet El Jibn är en himmelsk arabisk efterrätt som kombinerar den lena smaken av ost med en söt, mjuk deg. ' +
      'Fylld med en krämig blandning av ost och socker, rullas denna dessert till perfektion och toppas ofta med pistage eller sockerlag för extra smak. ' +
      'Den har en balanserad konsistens och är både söt och lätt, vilket gör den till en fantastisk avslutning på en måltid.\n\n' +
      'För vem?\n' +
      'För dig som älskar söta, ostbaserade desserter, för dig som söker en smakfull tradition och för dig som vill unna dig något riktigt mjukt och delikat.\n\n' +
      'Mer än en efterrätt – en himmelsk smakupplevelse.',
  },
  {
    id: '37b8b656-2604-4ca6-9745-e0d6f52338c1',
    name: 'Krispig Kunafa',
    description:
      'Där festen börjar… med ett ljud\n\n' +
      'Det finns ljud som fastnar i minnet – skratt från köket, skedar som rör i kastruller, och Mormors röst som fyller hela hemmet med värme. ' +
      'Minnen tar dig till barndomen eller till speciella högtider eller en vanlig dag som blev något speciellt. ' +
      'Men en sak minns du: hur allt stannade upp för en stund – när doften av smör, sirap och rostad deg spred sig i huset.\n\n' +
      'Det är här vår historia börjar, med en hyllning till tradition, från generation till generation.\n\n' +
      'Krispig kunafa som förr, men ännu bättre\n\n' +
      'Vi har bevarat det som gjorde den klassiska kunafan älskad: ' +
      'den gyllene ytan, de rostade trådarna, det ljuva lagret av ost eller Ashta, ' +
      'och den perfekt balanserade sirapen – men vi har lagt till något mer: ' +
      'vår tid, vår precision, vår passion. Krispig Kunafa, bakad på låg värme och hög känsla. ' +
      'Det är kärlek i varje lager.\n\n' +
      'Vem är den för?\n\n' +
      '– För dig som växte upp med "den riktiga kunafan"\n' +
      '– För dig som vill bjuda på något som hörs innan det smakas\n' +
      '– För dig som vet att det finns smaker som för folk närmare\n\n' +
      'Möjlig notering: Krispigheten kan försvinna efter en dag.',
  },
  {
    id: '94fd4a72-2685-4bc4-8813-0f5e5eaa4a1c',
    name: 'Mad bel Ashta',
    description:
      'Mad bel Ashta\n\n' +
      'En utsökt, krämig dessert fylld med den traditionella arabiska grädden "ashta". ' +
      'Denna läckra efterrätt kombinerar den lena smaken av ashta med smördeg, ' +
      'vilket skapar en perfekt balans av sötma och krämighet. ' +
      'Toppad med finhackad pistage och lätt bakad till en gyllene färg, ' +
      'erbjuder Mad bel Ashta en oförglömlig smakupplevelse som tar dig på en resa genom den arabiska matkulturen. ' +
      'En perfekt avslutning på en måltid eller som en söt stund att njuta av när helst.',
  },
  {
    id: '6312f48a-b156-431b-9f6d-103cc30bc9f8',
    name: 'Mamoul Pistage',
    description: '',
  },
  {
    id: 'f05b6a24-7b90-4dfb-8f2f-be67a475cbfa',
    name: 'Mormors Box – En Gåva av Äkta Smaker',
    description:
      'Upptäck Mormors Box, en lyxig samling av handgjorda orientaliska bakverk, perfekta som present eller för att bjuda dina gäster på något riktigt speciellt.\n\n' +
      'Vad finns i boxen?\n\n' +
      '• Baklava Pistage – Krispig filodeg fylld med finaste pistagenötter och söt sirap.\n' +
      '• Baklava Valnöt – En klassisk favorit med spröda lager och rik valnötsfyllning.\n' +
      '• Maamoul Mad Pistage – En mjuk och smakrik kaka fylld med pistagenötter.\n' +
      '• Maamoul Mad Valnöt – En mjuk och smakrik kaka fylld med valnötter.\n' +
      '• Turkisk Baklava Pistage – Extra krämig baklava fylld med premium finmald pistage.\n' +
      '• Harise – En saftig mannagrynskaka med perfekt balans av sötma.\n\n' +
      'Vikt: 1 kg',
  },
  {
    id: 'c005c8af-3f2e-401c-923f-7dac0f682cda',
    name: 'Mormorsbox – Baklawa Mix',
    description:
      'Upptäck Mormors Box, en lyxig samling av handgjorda orientaliska bakverk, perfekta som present eller för att bjuda dina gäster på något riktigt speciellt.\n\n' +
      'Vad finns i boxen?\n\n' +
      '• Baklava Pistage – Krispig filodeg fylld med finaste pistagenötter och söt sirap.\n' +
      '• Baklava Valnöt – En klassisk favorit med spröda lager och rik valnötsfyllning.\n' +
      '• Maamoul Mad Pistage – En mjuk och smakrik kaka fylld med pistagenötter.\n' +
      '• Maamoul Mad Valnöt – En mjuk och smakrik kaka fylld med valnötter.\n' +
      '• Turkisk Baklava Pistage – Extra krämig baklava fylld med premium finmald pistage.\n' +
      '• Harise – En saftig mannagrynskaka med perfekt balans av sötma.\n\n' +
      'Vikt: 1 kg',
  },
  {
    id: '9e6d210b-8637-4deb-889c-0726060288aa',
    name: 'Pistagemix',
    description:
      'Upptäck vår Baklawa Pistagemix – en exklusiv samling handgjorda baklawabitar fyllda med premium pistage. ' +
      'Perfekt som lyxig gåva eller för att imponera på gäster vid speciella tillfällen.\n\n' +
      'Vad finns i boxen?\n\n' +
      '• Fågelbo Pistage – Tunna, krispiga trådar av deg fyllda generöst med pistage.\n' +
      '• Röd Baloriye Pistage – Spröd och elegant baklawa med rik pistagefyllning.\n' +
      '• Vit Baloriye Baklawa Pistage – Extra len och lyxig variant med finmald pistage.\n\n' +
      'Vikt: 1350 gram\n' +
      'En pistagedröm i varje tugga – bakad med kärlek enligt traditionella recept.',
  },
];

async function run() {
  console.log('Fixar produktbeskrivningar och namn...\n');

  for (const item of updates) {
    await db.query(
      'UPDATE products SET name = ?, description = ? WHERE id = ?',
      [item.name, item.description, item.id]
    );
    console.log(`  ✓ ${item.name}`);
  }

  console.log('\nKlart! Alla produkter uppdaterade.');
  process.exit(0);
}

run();
