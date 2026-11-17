// api/_lib/fit.js — BHV-fit: elke maand 3 korte opfrisvragen per BHV'er.
// c = index van het goede antwoord, u = korte uitleg.
export const FIT_VRAGEN = [
  { q: 'Wat controleer je altijd als eerste bij een ongeval?', o: ['Of het slachtoffer verzekerd is', 'Gevaar voor jezelf, omstanders en slachtoffer', 'Of er een AED in de buurt is'], c: 1, u: 'Eerst je eigen veiligheid: een tweede slachtoffer helpt niemand.' },
  { q: 'Verhouding borstcompressies en beademingen bij een volwassene?', o: ['30 : 2', '15 : 2', '5 : 1'], c: 0, u: '30 compressies, dan 2 beademingen.' },
  { q: 'Hoe diep druk je bij reanimatie van een volwassene?', o: ['2–3 cm', '5–6 cm', '8–10 cm'], c: 1, u: 'Ongeveer 5 tot 6 centimeter.' },
  { q: 'In welk tempo geef je borstcompressies?', o: ['60–80 per minuut', '100–120 per minuut', '150 per minuut'], c: 1, u: '100 tot 120 keer per minuut.' },
  { q: 'Wanneer sluit je de AED aan?', o: ['Zo snel mogelijk', 'Na 10 minuten reanimeren', 'Alleen op advies van de huisarts'], c: 0, u: 'Hoe eerder de AED, hoe groter de overlevingskans.' },
  { q: 'Iemand is niet aanspreekbaar maar ademt normaal. Wat doe je?', o: ['Reanimeren', 'Stabiele zijligging en ademhaling blijven controleren', 'Rechtop zetten'], c: 1, u: 'De stabiele zijligging houdt de luchtweg vrij.' },
  { q: 'Hoe lang koel je een brandwond?', o: ['1 minuut', 'Minimaal 10 minuten met lauw stromend water', 'Niet koelen'], c: 1, u: 'Lauw, zacht stromend water, minimaal 10 minuten.' },
  { q: 'Wat doe je bij een neusbloeding?', o: ['Hoofd achterover', 'Voorover buigen en neusvleugels dichtknijpen', 'Plat liggen'], c: 1, u: 'Voorover, zodat er geen bloed in de keel loopt.' },
  { q: 'Iemand verslikt zich en kan niet meer hoesten of praten. Wat doe je?', o: ['Water laten drinken', 'Slagen tussen de schouderbladen en buikstoten', 'Wachten tot het overgaat'], c: 1, u: 'Rugslagen, en als dat niet helpt buikstoten (Heimlich).' },
  { q: 'Wat is de eerste maatregel bij een ernstige bloeding?', o: ['Directe druk op de wond', 'De wond spoelen', 'Afwachten'], c: 0, u: 'Druk op de wond stopt het bloedverlies.' },
  { q: 'Waaruit bestaat de branddriehoek?', o: ['Rook, vuur en hitte', 'Brandbare stof, zuurstof en ontbrandingstemperatuur', 'Water, schuim en poeder'], c: 1, u: 'Haal één element weg en het vuur dooft.' },
  { q: 'Waarmee blus je een vlam in de pan?', o: ['Water', 'Deksel of blusdeken', 'Een natte theedoek uitslaan'], c: 1, u: 'Zuurstof afsluiten. Nooit water op brandend vet.' },
  { q: 'Welke blusser bij een brand in elektrische apparatuur?', o: ['CO2-blusser', 'Emmer water', 'Waterblusser'], c: 0, u: 'CO2 geleidt geen stroom en laat geen resten achter.' },
  { q: 'Een deur waarachter brand kan zijn: wat doe je eerst?', o: ['Snel openen', 'Met de rug van je hand voelen of hij heet is', 'Intrappen'], c: 1, u: 'Hete deur? Niet openen: daar woedt brand.' },
  { q: 'De brand is te groot om zelf te blussen. Wat doe je?', o: ['Doorgaan met blussen', 'Deuren sluiten, ruimte verlaten, alarmeren', 'Ramen openzetten'], c: 1, u: 'Deuren dicht houdt rook en vuur tegen.' },
  { q: 'Mag je de lift gebruiken bij een ontruiming?', o: ['Ja, dat gaat sneller', 'Nee, gebruik de trap', 'Alleen naar beneden'], c: 1, u: 'Liften kunnen uitvallen of naar de brandverdieping gaan.' },
  { q: 'Waarom tel je mensen op de verzamelplaats?', o: ['Voor de urenregistratie', 'Om te weten of iedereen buiten is', 'Dat hoeft niet'], c: 1, u: 'Vermiste personen meld je direct aan de brandweer.' },
  { q: 'Iemand weigert het gebouw te verlaten. Wat doe je?', o: ['Achterlaten en niets zeggen', 'Aandringen, gevaar uitleggen en melden aan de coördinator', 'Met geweld meenemen'], c: 1, u: 'Jouw eigen veiligheid gaat voor; meld het zodat de hulpdiensten het weten.' },
  { q: 'Wat zeg je als eerste tegen de meldkamer van 112?', o: ['Je naam en functie', 'Welke hulpdienst je nodig hebt en waar', 'Hoe laat het is'], c: 1, u: 'Brandweer, ambulance of politie, en het adres.' },
  { q: 'Wie is verantwoordelijk voor voldoende BHV in het bedrijf?', o: ['De brandweer', 'De werkgever', 'De gemeente'], c: 1, u: 'Dat staat in de Arbowet.' },
  { q: 'Hoe lang is een BHV-certificaat meestal geldig?', o: ['1 jaar', '5 jaar', 'Onbeperkt'], c: 0, u: 'Jaarlijks herhalen houdt je kennis en bevoegdheid op peil.' },
  { q: 'Wat doe je bij een gasgeur in het gebouw?', o: ['Licht aandoen om te zoeken', 'Geen schakelaars gebruiken, ventileren en melden', 'Aansteker gebruiken om te testen'], c: 1, u: 'Een vonk kan een explosie veroorzaken.' },
  { q: 'Waarom wissel je elke 2 minuten van reanimator?', o: ['Om de kwaliteit van de compressies hoog te houden', 'Dat is wettelijk verplicht', 'Om te rusten tot de ambulance komt'], c: 0, u: 'Vermoeidheid maakt compressies te ondiep.' },
  { q: 'Wat doe je bij een chemische stof in het oog?', o: ['Wrijven', 'Minimaal 15 minuten spoelen met water', 'Melk erin'], c: 1, u: 'Lang en ruim spoelen, van de neus af naar buiten.' },
];

// 3 vragen per maand, rouleert door de hele lijst
export function vragenVoorMaand(maand) {
  const [j, m] = String(maand).split('-').map(Number);
  const start = (((j * 12 + m) * 3) % FIT_VRAGEN.length);
  return [0, 1, 2].map((k) => (start + k) % FIT_VRAGEN.length);
}

export function huidigeMaand(d = new Date()) {
  return new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }).slice(0, 7);
}
