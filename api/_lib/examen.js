// api/_lib/examen.js
// De vragenbank van het BHV-examen MET antwoordsleutel. Staat bewust alleen op de server:
// de website krijgt via /api/participant (action "start") de vragen met geschudde
// antwoordopties, zonder te weten welk antwoord goed is. Nakijken gebeurt in action "finish".
// Bestanden in een map met "_" worden door Vercel niet als losse functie gepubliceerd.
//
// c = index (in o) van het goede antwoord.

import crypto from 'crypto';

export const QUESTIONS = [
 {"cat":"EHBO","q":"Wat is de eerste stap bij het aantreffen van een slachtoffer?","o":["De veiligheid van de omgeving beoordelen","Direct beginnen met reanimeren","Het slachtoffer verplaatsen naar een andere ruimte","Meteen familie van het slachtoffer bellen"],"c":0},
 {"cat":"EHBO","q":"Wat houdt een shocktoestand primair in?","o":["Een tekort aan bloedtoevoer naar vitale organen","Een allergische huidreactie","Een tijdelijke black-out door stress","Verhoogde lichaamstemperatuur"],"c":0},
 {"cat":"EHBO","q":"Hoe controleer je het beste of iemand bij bewustzijn is?","o":["Aanspreken en voorzichtig aan de schouders schudden","Even wachten of hij vanzelf reageert","Zijn pols meten zonder verder contact","Direct beademen"],"c":0},
 {"cat":"EHBO","q":"Wat doe je bij een bewusteloos slachtoffer dat wel normaal ademt?","o":["In stabiele zijligging leggen","Rechtop laten zitten","Meteen beginnen met borstcompressies","Water laten drinken"],"c":0},
 {"cat":"EHBO","q":"Wat is de juiste volgorde van de basisstappen in eerste hulp (DR ABC)?","o":["Danger, Response, Airway, Breathing, Circulation","Airway, Danger, Response, Circulation, Breathing","Breathing, Airway, Danger, Circulation, Response","Response, Circulation, Danger, Airway, Breathing"],"c":0},
 {"cat":"EHBO","q":"Wat is bij een ernstige uitwendige bloeding de eerste maatregel?","o":["Directe druk uitoefenen op de wond","Het lichaamsdeel omhoog laten hangen zonder druk","Wachten op de ambulance zonder in te grijpen","De wond direct spoelen met water"],"c":0},
 {"cat":"EHBO","q":"Wat is een typisch teken van een shocktoestand?","o":["Bleke, klamme huid en een snelle, zwakke pols","Blozende wangen en een trage hartslag","Hoge bloeddruk en warme, droge huid","Verhoogde eetlust"],"c":0},
 {"cat":"EHBO","q":"Wat is het advies bij brandwonden?","o":["Koelen met lauw stromend water, minimaal 10-20 minuten","Ijsklontjes direct op de wond leggen","Boter of olie op de wond smeren","De wond meteen afdekken zonder te koelen"],"c":0},
 {"cat":"EHBO","q":"Wat doe je bij een vermoede botbreuk als BHV'er?","o":["Het lichaamsdeel zoveel mogelijk stilhouden en niet zelf rechtzetten","Het lichaamsdeel voorzichtig weer rechtzetten","Het slachtoffer laten lopen op de breuk","Het lichaamsdeel stevig masseren"],"c":0},
 {"cat":"EHBO","q":"Wat is het belangrijkste bij een epileptische aanval?","o":["De omgeving vrijmaken van gevaarlijke voorwerpen en niet vasthouden","Het slachtoffer stevig vasthouden","Iets tussen de tanden steken","Het slachtoffer overeind zetten"],"c":0},
 {"cat":"EHBO","q":"Wat is de juiste houding bij een neusbloeding?","o":["Voorover buigen en de neusvleugels dichtknijpen","Achterover leunen en het hoofd in de nek leggen","Plat liggen met de benen omhoog","Rechtop staan zonder de neus aan te raken"],"c":0},
 {"cat":"EHBO","q":"Wat pas je toe bij verslikking waarbij iemand niet meer kan hoesten of praten?","o":["Stoten tussen de schouderbladen, gevolgd door buikstoten (Heimlich)","Alleen op de rug kloppen met vlakke hand","Water laten drinken om door te slikken","Het hoofd naar achteren kantelen"],"c":0},
 {"cat":"EHBO","q":"Wanneer bel je 112 bij een ongeval op de werkvloer?","o":["Zodra er sprake is van een levensbedreigende situatie","Alleen als de bedrijfsarts dat toestaat","Pas nadat alle collega's zijn ingelicht","Nooit, altijd eerst de leidinggevende bellen"],"c":0},
 {"cat":"EHBO","q":"Wat is de functie van de stabiele zijligging?","o":["De luchtweg vrijhouden en braaksel niet laten inademen","Het slachtoffer warm houden","De bloeddruk verhogen","Pijn verminderen bij botbreuken"],"c":0},
 {"cat":"EHBO","q":"Hoe spoel je een oog na contact met een chemische stof?","o":["Met veel schoon water, minimaal 15 minuten, van neus naar buiten","Met een doekje het oog droogwrijven","Met melk in plaats van water","Alleen als er pijn optreedt"],"c":0},
 {"cat":"AED","q":"Waarmee start je de reanimatie bij een circulatiestilstand?","o":["30 borstcompressies gevolgd door 2 beademingen","2 beademingen gevolgd door 30 compressies","Direct de AED aansluiten zonder compressies","10 compressies en dan pauzeren"],"c":0},
 {"cat":"AED","q":"Wat is de juiste compressiediepte bij reanimatie van een volwassene?","o":["Ongeveer 5-6 cm","Ongeveer 1-2 cm","Ongeveer 10 cm","Zo diep mogelijk zonder limiet"],"c":0},
 {"cat":"AED","q":"Wat is het juiste compressietempo bij reanimatie?","o":["100-120 compressies per minuut","40-60 compressies per minuut","150-180 compressies per minuut","Geen vast tempo nodig"],"c":0},
 {"cat":"AED","q":"Wanneer sluit je een AED aan tijdens reanimatie?","o":["Zo snel mogelijk zodra het apparaat beschikbaar is","Pas na 10 minuten reanimeren","Alleen als een arts aanwezig is","Nooit zonder toestemming van het slachtoffer"],"c":0},
 {"cat":"AED","q":"Wat doet een AED voordat het eventueel een schok toedient?","o":["Het analyseert automatisch het hartritme","Het meet de lichaamstemperatuur","Het vraagt om een wachtwoord","Het belt automatisch de huisarts"],"c":0},
 {"cat":"AED","q":"Mag je een AED gebruiken bij een nat slachtoffer?","o":["Nee, eerst de borstkas drogen voor het plakken van de elektroden","Ja, natheid maakt niets uit","Alleen buiten bij regen","Alleen als het zoetwater is"],"c":0},
 {"cat":"AED","q":"Waarom stop je even met reanimeren tijdens de AED-analyse?","o":["Beweging kan de hartritmeanalyse verstoren","Om zelf op adem te komen","Om het slachtoffer te laten bijkomen","Dat hoeft niet, je gaat altijd door"],"c":0},
 {"cat":"AED","q":"Hoe reanimeer je een zwangere vrouw?","o":["Op dezelfde wijze als bij een niet-zwangere volwassene","Alleen met beademing, geen compressies","Nooit, wacht altijd op een verloskundige","Met halve compressiediepte"],"c":0},
 {"cat":"AED","q":"Hoe vaak wissel je van persoon tijdens langdurige reanimatie?","o":["Elke 2 minuten, om vermoeidheid en kwaliteitsverlies te voorkomen","Nooit, één persoon reanimeert door tot de ambulance er is","Elke 30 seconden","Alleen als degene het zelf aangeeft"],"c":0},
 {"cat":"AED","q":"Wat doe je als eerste bij het aantreffen van een levenloos slachtoffer?","o":["De ademhaling controleren gedurende maximaal 10 seconden","Meteen 112 bellen zonder te controleren","Het slachtoffer direct optillen","Wachten op een collega"],"c":0},
 {"cat":"AED","q":"Hoe start je reanimatie bij een kind ouder dan 1 jaar?","o":["Met 5 initiële beademingen, daarna 30:2 compressies en beademingen","Direct met de AED, zonder compressies","Met alleen borstcompressies, geen beademing","Met 2 compressies en 30 beademingen"],"c":0},
 {"cat":"AED","q":"Waarom is snel handelen bij een circulatiestilstand zo belangrijk?","o":["Elke minuut zonder reanimatie verlaagt de overlevingskans aanzienlijk","Het maakt voor de overlevingskans weinig uit","Alleen de eerste 30 minuten zijn relevant","Reanimeren kan altijd wachten tot de ambulance er is"],"c":0},
 {"cat":"AED","q":"Mag je stoppen met reanimeren zodra ambulancepersoneel arriveert?","o":["Ja, je draagt de reanimatie over aan de professionele hulpverleners","Nee, je moet altijd zelf doorgaan","Alleen als je het zelf wilt","Nee, tenzij de politie dat toestaat"],"c":0},
 {"cat":"AED","q":"Waar plaats je de elektroden van een AED?","o":["Eén onder het rechtersleutelbeen en één op de linkerzij onder de oksel","Beide midden op de borst naast elkaar","Eén op het voorhoofd en één op de buik","Beide op de rug van het slachtoffer"],"c":0},
 {"cat":"AED","q":"Wat betekent het als de AED aangeeft 'geen schok geadviseerd'?","o":["Je gaat direct door met borstcompressies en beademing","Je stopt met alle hulpverlening","Je wacht tot de AED opnieuw analyseert zonder iets te doen","Je verwijdert de elektroden meteen"],"c":0},
 {"cat":"Brand","q":"Welke drie elementen zijn nodig voor een brand (branddriehoek)?","o":["Brandstof, zuurstof en een ontstekingsbron","Water, wind en warmte","Rook, licht en zuurstof","Hitte, kou en vocht"],"c":0},
 {"cat":"Brand","q":"Welk blusmiddel gebruik je niet bij een vetbrand?","o":["Water, omdat dit een steekvlam kan veroorzaken","Een blusdeken","Een schuimblusser geschikt voor vet","Zand"],"c":0},
 {"cat":"Brand","q":"Wat is het doel van een blusdeken?","o":["Het afsluiten van zuurstof om een beginnende brand of vlam te doven","Het blussen van elektrische branden met water","Het opvangen van rook","Het beschermen tegen koude"],"c":0},
 {"cat":"Brand","q":"Wat beschrijft de PASS-techniek bij een handblusser?","o":["Pin eruit, Aanwijzen, Samenknijpen, Spuiten van links naar rechts","Pak op, Activeer, Spring weg, Schreeuw","Plaats, Adem in, Spuit, Stop","Pin erin, Aan de kant, Spuiten, Stoppen"],"c":0},
 {"cat":"Brand","q":"Wat doe je bij een beginnende brand in een prullenbak?","o":["Grijp naar een geschikte kleine blusser of blusdeken, na risico-inschatting","Loop meteen weg zonder iets te doen","Gooi er benzine bij om te testen","Wacht op de brandweer zonder te handelen"],"c":0},
 {"cat":"Brand","q":"Wat doe je als de brand te groot is om zelf te blussen?","o":["Sluit deuren, verlaat de ruimte en waarschuw de brandweer","Blijf proberen te blussen tot het lukt","Open alle ramen en deuren voor ventilatie","Verstop je in een kast"],"c":0},
 {"cat":"Brand","q":"Waarom is rook vaak gevaarlijker dan vlammen?","o":["Rook bevat giftige gassen en beperkt zicht en ademhaling","Rook is altijd heter dan vlammen","Rook verspreidt zich niet","Rook heeft geen effect op de luchtwegen"],"c":0},
 {"cat":"Brand","q":"Wat is het advies bij het openen van een deur waarachter mogelijk brand is?","o":["Voel de deur en open deze langzaam en gecontroleerd","Trap de deur meteen open","Open de deur zo snel mogelijk voor frisse lucht","Nooit een deur aanraken, ook niet voelen"],"c":0},
 {"cat":"Brand","q":"Welk type blusser gebruik je bij een elektrische brand?","o":["Een CO2-blusser, omdat deze geen elektrisch geleidend blusmiddel gebruikt","Een waterblusser","Een schuimblusser","Een emmer water"],"c":0},
 {"cat":"Brand","q":"Wat is een vluchtroute?","o":["De kortste veilige weg naar een nooduitgang of verzamelplaats","De route die de brandweer gebruikt om binnen te komen","Elke gang in het gebouw","Alleen de hoofdingang van het pand"],"c":0},
 {"cat":"Brand","q":"Waarom moeten vluchtwegen altijd vrij van obstakels blijven?","o":["Om een snelle en veilige evacuatie mogelijk te maken","Om het gebouw er netjes uit te laten zien","Dat is niet verplicht","Alleen belangrijk tijdens kantooruren"],"c":0},
 {"cat":"Brand","q":"Wat doe je als je kleding vlam vat?","o":["Stop, ga liggen en rol (stop, drop and roll)","Ga hard rennen om het vuur uit te blazen","Blijf stilstaan en wacht op hulp","Trek de kleding niet uit, ook niet later"],"c":0},
 {"cat":"Brand","q":"Wat is de functie van een rookmelder binnen BHV?","o":["Vroegtijdige detectie zodat sneller gealarmeerd en gehandeld kan worden","Het blussen van een brand","Het ventileren van de ruimte","Het registreren van de temperatuur voor de administratie"],"c":0},
 {"cat":"Brand","q":"Wat is de juiste eerste actie bij een gasgeur op de werkvloer?","o":["Geen elektrische schakelaars gebruiken, direct ventileren en melden","Meteen een lichtschakelaar omzetten om te kijken","Een vlam gebruiken om de bron te vinden","Niets doen, gasgeur is meestal onschuldig"],"c":0},
 {"cat":"Brand","q":"Wat is het belangrijkste doel van brandpreventie binnen een bedrijf?","o":["Voorkomen dat een brand kan ontstaan of zich kan uitbreiden","Zo snel mogelijk kunnen blussen","Verzekeringspremies verlagen","Voldoen aan interne huisregels"],"c":0},
 {"cat":"Ontruiming","q":"Wat is de rol van een BHV'er bij een ontruiming?","o":["Mensen begeleiden naar de uitgang en ruimtes controleren op achterblijvers","Alleen zichzelf in veiligheid brengen","Wachten op instructies van de brandweer voordat je iets doet","De receptie bemannen tijdens de ontruiming"],"c":0},
 {"cat":"Ontruiming","q":"Wat is een verzamelplaats?","o":["Een vooraf aangewezen veilige plek buiten het gebouw waar mensen zich melden","De hoofdingang van het gebouw","Een plek binnen het gebouw om te schuilen","De parkeerplaats van de directie"],"c":0},
 {"cat":"Ontruiming","q":"Waarom is een hoofdtelling na ontruiming belangrijk?","o":["Om te controleren of iedereen het gebouw veilig heeft verlaten","Om de tijdregistratie van medewerkers bij te werken","Om te bepalen wie te laat op werk was","Dat is niet nodig als er geen brand zichtbaar is"],"c":0},
 {"cat":"Ontruiming","q":"Wat doe je als iemand weigert het gebouw te verlaten tijdens een ontruiming?","o":["Dring aan, leg het gevaar uit en meld dit direct aan de coördinator","Laat diegene gewoon achter zonder iets te melden","Sleep de persoon fysiek naar buiten","Negeer het en ga zelf verder"],"c":0},
 {"cat":"Ontruiming","q":"Wat is de taak van de ontruimingscoördinator?","o":["Overzicht houden en de ontruiming centraal aansturen en coördineren","Zelf als enige alle verdiepingen controleren","De brandweer vervangen","De telefooncentrale bedienen"],"c":0},
 {"cat":"Ontruiming","q":"Hoe communiceer je het beste als BHV'er tijdens een calamiteit?","o":["Kalm, kort en duidelijk, met concrete instructies","Zo snel mogelijk en met veel details tegelijk","Alleen schriftelijk, nooit mondeling","Zo min mogelijk, om geen paniek te veroorzaken"],"c":0},
 {"cat":"Ontruiming","q":"Wat doe je met minder valide personen tijdens een ontruiming?","o":["Extra begeleiding bieden of hen naar een veilige wachtplek brengen","Hen als laatste helpen, na alle anderen","Negeren, zij regelen dit zelf","Hen in een aparte ruimte opsluiten tot het voorbij is"],"c":0},
 {"cat":"Ontruiming","q":"Wanneer gebruik je de lift tijdens een ontruiming bij brand?","o":["Nooit, gebruik altijd de trap bij een brandmelding","Alleen op de begane grond","Als er meer dan 5 verdiepingen zijn","Als de brandweer nog niet aanwezig is"],"c":0},
 {"cat":"Ontruiming","q":"Wat is het doel van een ontruimingsoefening?","o":["Iedereen laten wennen aan de procedure zodat een echte ontruiming vlot verloopt","Vooral om de brandweer te testen","Om te bepalen wie ontslagen wordt bij fouten","Verplicht alleen voor nieuwe medewerkers"],"c":0},
 {"cat":"Ontruiming","q":"Wat meld je als eerste bij het alarmeren van de meldkamer?","o":["Wat er aan de hand is en de exacte locatie van het incident","Je eigen naam en functie","Het aantal jaren dat je BHV'er bent","De naam van je leidinggevende"],"c":0},
 {"cat":"Ontruiming","q":"Wat staat het NAWEA(H)-principe bij alarmering voor?","o":["Naam, Adres, Wat is er gebeurd, Eventuele gewonden, Al gedaan, Hoe bereikbaar","Naam, Afdeling, Wachten, Evacueren, Alarmeren","Nummer, Adres, Wachttijd, Ernst, Actie","Naam, Auto, Water, Eten, Ambulance"],"c":0},
 {"cat":"Ontruiming","q":"Wat is de juiste eerste reactie bij een bommelding?","o":["Blijf kalm, noteer details en waarschuw direct de leidinggevende en politie","Meteen zelf het gebouw doorzoeken naar het object","De melding negeren tenzij je een explosie hoort","Direct alle telefoons uitschakelen"],"c":0},
 {"cat":"Ontruiming","q":"Wat is de functie van een BHV-plan binnen een organisatie?","o":["Vastleggen wie wat doet bij calamiteiten, zodat iedereen weet hoe te handelen","Een overzicht van vakantiedagen van BHV'ers","Een lijst met noodnummers van klanten","Een verslag van eerdere brandoefeningen zonder verdere functie"],"c":0},
 {"cat":"Ontruiming","q":"Wat is belangrijk bij het instrueren van paniekerige collega's?","o":["Rustig blijven, korte zinnen gebruiken en oogcontact houden","Hard roepen om aandacht te trekken","Zoveel mogelijk informatie in één keer geven","Wachten tot ze vanzelf kalmeren"],"c":0},
 {"cat":"Ontruiming","q":"Waarom is een evaluatie na een incident belangrijk?","o":["Om te leren van het incident en procedures waar nodig te verbeteren","Om te bepalen wie schuldig is","Dat is wettelijk niet nodig","Alleen relevant bij grote branden"],"c":0},
 {"cat":"Wetgeving","q":"In welke wet is de verplichting tot BHV vastgelegd?","o":["De Arbeidsomstandighedenwet (Arbowet)","Het Burgerlijk Wetboek","De Wegenverkeerswet","De Wet publieke gezondheid"],"c":0},
 {"cat":"Wetgeving","q":"Hoe vaak wordt een BHV-certificaat gemiddeld verlengd?","o":["Jaarlijks, via een herhalingstraining","Elke 5 jaar","Nooit, het is levenslang geldig","Elke maand"],"c":0},
 {"cat":"Wetgeving","q":"Wie is uiteindelijk verantwoordelijk voor een goede BHV-organisatie?","o":["De werkgever","Elke individuele werknemer apart","De brandweer","De gemeente"],"c":0},
 {"cat":"Wetgeving","q":"Wat moet minimaal aanwezig zijn volgens de Arbowet op het gebied van hulpverlening?","o":["Voldoende opgeleide bedrijfshulpverleners, afgestemd op de risico's","Eén BHV'er per gebouw, ongeacht de grootte","Alleen een EHBO-koffer, BHV'ers zijn niet verplicht","Een externe beveiligingsdienst"],"c":0},
 {"cat":"Wetgeving","q":"Wat is een RI&E in relatie tot BHV?","o":["Een risico-inventarisatie en -evaluatie die de basis vormt voor het BHV-plan","Een interne rapportage over ziekteverzuim","Een reglement over interne e-mailverkeer","Een examenformulier voor BHV'ers"],"c":0},
 {"cat":"Wetgeving","q":"Wat bepaalt vooral het aantal benodigde BHV'ers in een organisatie?","o":["Het aantal aanwezige personen en de specifieke risico's van het bedrijf","Uitsluitend de grootte van het gebouw in vierkante meters","De leeftijd van de medewerkers","Het aantal verdiepingen, ongeacht de risico's"],"c":0},
 {"cat":"Wetgeving","q":"Kan een werkgever een boete krijgen bij onvoldoende BHV-organisatie?","o":["Ja, de Nederlandse Arbeidsinspectie kan handhavend optreden","Nee, BHV is volledig vrijwillig","Alleen bij bedrijven met meer dan 500 medewerkers","Alleen als er al een ongeval heeft plaatsgevonden"],"c":0},
 {"cat":"Wetgeving","q":"Wat is het doel van een ontruimingsplan?","o":["Vastleggen hoe een gebouw snel en veilig ontruimd kan worden","Een overzicht geven van parkeerplaatsen","Een agenda voor personeelsvergaderingen","Alleen bedoeld voor kantoorpanden boven de 5 verdiepingen"],"c":0},
 {"cat":"Wetgeving","q":"Wie stelt doorgaans het BHV-plan op binnen een organisatie?","o":["De werkgever, vaak in samenwerking met de preventiemedewerker","Uitsluitend een externe brandweerinspecteur","De ondernemingsraad zonder overleg met de werkgever","Elke medewerker individueel"],"c":0},
 {"cat":"Wetgeving","q":"Is een BHV'er wettelijk verplicht om hulp te verlenen buiten werktijd?","o":["Nee, de BHV-taak geldt alleen tijdens de uitoefening van de functie op het werk","Ja, altijd en overal, ook privé","Alleen in het weekend","Alleen als de werkgever daarom vraagt via app"],"c":0},
 {"cat":"Wetgeving","q":"Wat is de relatie tussen een preventiemedewerker en BHV?","o":["De preventiemedewerker adviseert over arbeidsrisico's en ondersteunt de BHV-organisatie","Zij hebben geen enkele relatie met elkaar","De preventiemedewerker vervangt alle BHV'ers","BHV'ers rapporteren nooit aan de preventiemedewerker"],"c":0},
 {"cat":"Wetgeving","q":"Wat moet er volgens de Arbowet gebeuren na een ernstig ongeval?","o":["Ernstige ongevallen moeten worden gemeld en geregistreerd","Er hoeft niets gemeld te worden zolang niemand gewond is geraakt op papier","Alleen de politie hoeft ingelicht te worden","Het ongeval mag pas na een jaar gemeld worden"],"c":0},
 {"cat":"Wetgeving","q":"Wat is het doel van periodieke BHV-oefeningen volgens de wet?","o":["Zorgen dat de BHV-organisatie daadwerkelijk effectief functioneert in de praktijk","Alleen om aan een administratieve verplichting te voldoen","Ze zijn wettelijk niet nodig als er een BHV-plan ligt","Enkel bedoeld voor nieuwe gebouwen"],"c":0},
 {"cat":"Wetgeving","q":"Mag een BHV'er weigeren op te treden bij eigen onveiligheid?","o":["Ja, eigen veiligheid gaat altijd voor","Nee, een BHV'er moet altijd ingrijpen, ongeacht het risico","Alleen als de werkgever hier vooraf toestemming voor gaf","Nee, dat is nooit toegestaan volgens de Arbowet"],"c":0},
 {"cat":"Wetgeving","q":"Wat gebeurt er als een BHV-certificaat is verlopen?","o":["De persoon mag niet meer als bevoegd BHV'er worden ingezet tot herhaling is gevolgd","Er verandert niets, het certificaat blijft geldig","De werkgever moet een boete betalen aan de certificaathouder","Het certificaat wordt automatisch verlengd na 30 dagen"],"c":0},
];

export const SECTION_SIZE = 15; // vragen per onderdeel (5 onderdelen van 8 minuten)
export const PASS_PCT = 80;     // slagingsgrens in procenten

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Bouwt een vers, geschud examen: onderdelen in wisselende volgorde, vragen binnen een
// onderdeel geschud en antwoordopties geschud. Geeft { items, questions } terug:
//   items     → server-side bewaren: [{ i: index in QUESTIONS, perm: [oorspronkelijke optie-index per getoonde positie] }]
//   questions → naar de client: [{ cat, q, options }] (zonder antwoord)
export function buildExam() {
  const byCat = {};
  QUESTIONS.forEach((q, i) => { (byCat[q.cat] = byCat[q.cat] || []).push(i); });
  const items = [];
  shuffle(Object.keys(byCat)).forEach((cat) => {
    shuffle(byCat[cat].slice()).forEach((i) => {
      items.push({ i, perm: shuffle(QUESTIONS[i].o.map((_, idx) => idx)) });
    });
  });
  return { items, questions: questionsFor(items) };
}

export function questionsFor(items) {
  return items.map(({ i, perm }) => ({
    cat: QUESTIONS[i].cat,
    q: QUESTIONS[i].q,
    options: perm.map((p) => QUESTIONS[i].o[p]),
  }));
}

// Kijkt de antwoorden na (answers[k] = gekozen getoonde positie, -1 = niet beantwoord,
// bijv. omdat de tijd van het onderdeel om was). Zelfde regels als voorheen in de website:
// pct = afgerond percentage goed, geslaagd bij 80% of meer (60 van de 75).
export function gradeExam(items, answers) {
  const list = Array.isArray(answers) ? answers : [];
  let correct = 0;
  const wrong = [];
  const perCategory = {};
  items.forEach(({ i, perm }, k) => {
    const q = QUESTIONS[i];
    const raw = list[k];
    const a = Number.isInteger(raw) && raw >= 0 && raw < perm.length ? raw : -1;
    const ok = a !== -1 && perm[a] === q.c;
    const pc = perCategory[q.cat] || (perCategory[q.cat] = { correct: 0, total: 0 });
    pc.total++;
    if (ok) {
      correct++;
      pc.correct++;
    } else {
      wrong.push({ cat: q.cat, q: q.q, chosen: a === -1 ? null : q.o[perm[a]], correct: q.o[q.c] });
    }
  });
  const total = items.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  return { correct, total, pct, passed: pct >= PASS_PCT, wrong, perCategory };
}
