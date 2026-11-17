#!/usr/bin/env python3
"""Genereert de losse pagina's van skbbhv.nl in public/ (rekentool, oefentoets, echtheid,
BHV-plan, lokale cursuspagina's) plus sitemap.xml.  Draai:  python3 scripts/make-pages.py
"""
import os, re, json, html, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
SITE = 'https://www.skbbhv.nl'
_idx = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
LOGO = re.search(r'const SKB_LOGO_URI = "(data:image/png;base64,[^"]+)"', _idx).group(1)
TODAY = datetime.date.today().isoformat()
E = html.escape

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Oswald:wght@500;600;700&family=Public+Sans:wght@400;600;700;800&display=swap">')

NAV = [('/', 'Home'), ('/?go=pricing', 'Cursus & prijzen'), ('/bhv-cursus-op-locatie', 'Op locatie'), ('/rekentool', 'Rekentool'),
       ('/oefentoets', 'Oefentoets'), ('/bhv-plan', 'BHV-plan'), ('/echtheid', 'Echtheidscheck'), ('/?go=contact', 'Contact')]

ORG = {"@type": "EducationalOrganization", "@id": SITE + "/#org", "name": "SKB BHV", "url": SITE,
       "logo": SITE + "/icon-512.png", "email": "info@skbbhv.nl", "telephone": "+31624626638",
       "parentOrganization": {"@type": "Organization", "name": "Oibase B.V."},
       "address": {"@type": "PostalAddress", "streetAddress": "Goordelaan 19", "postalCode": "9591 CB",
                   "addressLocality": "Onstwedde", "addressCountry": "NL"}}


def page(slug, title, desc, body, active=None, jsonld=None, extra_head='', script=''):
    nav = ''.join(f'<a href="{h}"{" class=actief" if h == active else ""}>{E(t)}</a>' for h, t in NAV)
    ld = ''
    if jsonld:
        ld = '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@graph": jsonld}, ensure_ascii=False) + '</script>'
    url = SITE + ('/' + slug if slug else '/')
    doc = f'''<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{url}"><meta property="og:image" content="{SITE}/og-image.png"><meta name="theme-color" content="#0B0D10">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" href="/favicon-64.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
{FONTS}
<link rel="stylesheet" href="/assets/pagina.css">
{extra_head}{ld}
</head>
<body>
<header class="kop"><div class="wrap">
  <a class="logo" href="/" aria-label="SKB BHV home"><img src="{LOGO}" alt="SKB BHV logo"></a>
  <nav id="nav">{nav}</nav>
  <a class="knop rood knop-kop" href="/?go=pricing">Direct bestellen</a>
  <button class="menu" aria-label="Menu" onclick="document.getElementById('nav').classList.toggle('open')">☰</button>
</div></header>
<div class="lint"></div>
<main>
{body}
</main>
<footer class="voet"><div class="wrap">
  <div><h4>SKB BHV</h4><p style="margin:0;color:#9AA4B1">Online BHV-examen met direct een digitaal certificaat, en de praktijkdag bij jullie op locatie. Onderdeel van Oibase B.V.</p>
    <p style="margin:10px 0 0;color:#9AA4B1">Goordelaan 19, 9591 CB Onstwedde<br>info@skbbhv.nl · 06 24 62 66 38</p></div>
  <div><h4>Handig</h4><a href="/rekentool">Rekentool voor bedrijven</a><a href="/oefentoets">Gratis BHV-oefentoets</a><a href="/bhv-plan">BHV-plan template</a><a href="/echtheid">Certificaat controleren</a></div>
  <div><h4>Op locatie</h4>{''.join(f'<a href="/bhv-cursus-{c["slug"]}">BHV-cursus {E(c["naam"])}</a>' for c in STEDEN[:6])}<a href="/bhv-cursus-op-locatie">Alle plaatsen →</a></div>
  <div class="rechts">© {datetime.date.today().year} SKB BHV — onderdeel van Oibase B.V. · KVK 42117378 · BTW NL869807729B01 · <a href="/?go=terms" style="display:inline">Voorwaarden</a> · <a href="/?go=privacy" style="display:inline">Privacy</a></div>
</div></footer>
<a class="wa" href="https://wa.me/31624626638?text=Hallo%20SKB%20BHV%2C%20" target="_blank" rel="noopener" aria-label="WhatsApp"><svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z"/></svg></a>
<script>
function skbLead(bron, email, extra){{
  return fetch('/api/lead',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{bron:bron,email:email,extra:extra||{{}}}})}})
    .then(function(r){{return r.json().then(function(j){{if(!r.ok) throw new Error(j.error||'Er ging iets mis.');return j;}});}});
}}
</script>
{script}
</body>
</html>
'''
    name = (slug or 'index') + '.html'
    open(os.path.join(PUB, name), 'w', encoding='utf-8').write(doc)
    return url


def cta(titel='Klaar om je BHV te regelen?', tekst='Online examen vanaf €79 p.p. excl. btw — certificaat direct, praktijkdag op locatie mogelijk.'):
    return f'''<section class="sectie"><div class="wrap"><div class="cta"><div><h2>{titel}</h2><p>{tekst}</p></div>
<a class="knop" href="/?go=pricing">Bekijk pakketten →</a></div></div></section>'''


def faq_ld(items):
    return {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in items]}


def faq_html(items):
    return ''.join(f'<details><summary>{E(q)}</summary><p>{E(a)}</p></details>' for q, a in items)


COURSES = [
    {"@type": "Course", "name": "BHV Basisexamen (online)", "description": "Online BHV-theorie-examen: 75 vragen over EHBO, reanimatie & AED, brandbestrijding, ontruiming en wet- en regelgeving.",
     "provider": {"@id": SITE + "/#org"}, "offers": {"@type": "Offer", "price": "79.00", "priceCurrency": "EUR", "category": "Paid"},
     "hasCourseInstance": {"@type": "CourseInstance", "courseMode": "online"}},
    {"@type": "Course", "name": "BHV Theorie + Praktijk", "description": "Online BHV-examen plus praktijkdag: reanimatie, AED-gebruik en blussen onder begeleiding, ook op locatie.",
     "provider": {"@id": SITE + "/#org"}, "offers": {"@type": "Offer", "price": "179.00", "priceCurrency": "EUR", "category": "Paid"},
     "hasCourseInstance": {"@type": "CourseInstance", "courseMode": "blended"}},
    {"@type": "Course", "name": "BHV Herhaling (online)", "description": "Online BHV-herhalingsexamen voor wie al eerder een BHV-certificaat behaalde.",
     "provider": {"@id": SITE + "/#org"}, "offers": {"@type": "Offer", "price": "49.00", "priceCurrency": "EUR", "category": "Paid"},
     "hasCourseInstance": {"@type": "CourseInstance", "courseMode": "online"}},
]

# ---------------------------------------------------------------- lokale pagina's
STEDEN = [
    {"slug": "groningen", "naam": "Groningen", "prov": "Groningen", "regio": "de stad Groningen, Haren, Zuidhorn en de rest van de provincie"},
    {"slug": "assen", "naam": "Assen", "prov": "Drenthe", "regio": "Assen, Beilen, Gieten en omgeving"},
    {"slug": "emmen", "naam": "Emmen", "prov": "Drenthe", "regio": "Emmen, Klazienaveen, Nieuw-Amsterdam en Zuidoost-Drenthe"},
    {"slug": "stadskanaal", "naam": "Stadskanaal", "prov": "Groningen", "regio": "Stadskanaal, Musselkanaal, Mussel en de Veenkoloniën"},
    {"slug": "veendam", "naam": "Veendam", "prov": "Groningen", "regio": "Veendam, Wildervank, Pekela en omgeving"},
    {"slug": "winschoten", "naam": "Winschoten", "prov": "Groningen", "regio": "Winschoten, Scheemda, Bad Nieuweschans en heel Oldambt"},
    {"slug": "hoogezand", "naam": "Hoogezand", "prov": "Groningen", "regio": "Hoogezand, Sappemeer, Slochteren en Midden-Groningen"},
    {"slug": "hoogeveen", "naam": "Hoogeveen", "prov": "Drenthe", "regio": "Hoogeveen, Zuidwolde, Pesse en omgeving"},
    {"slug": "leeuwarden", "naam": "Leeuwarden", "prov": "Friesland", "regio": "Leeuwarden, Grou, Stiens en omgeving"},
    {"slug": "zwolle", "naam": "Zwolle", "prov": "Overijssel", "regio": "Zwolle, Kampen, Hattem en omgeving"},
    {"slug": "westerwolde", "naam": "Westerwolde", "prov": "Groningen", "regio": "Onstwedde, Ter Apel, Vlagtwedde, Sellingen en Bourtange — onze thuisbasis"},
]


def stad_pagina(c):
    n = E(c['naam'])
    faq = [
        (f"Komen jullie voor de praktijkdag naar {c['naam']}?", f"Ja. Vanaf 4 deelnemers verzorgen we de praktijkdag (reanimatie, AED en blussen) bij jullie op de werkvloer in {c['naam']} en omgeving. De locatietoeslag is eenmalig €395 excl. btw per bestelling."),
        ("Hoe werkt het theorie-examen?", "Het theorie-examen maak je online, in je eigen tempo en op elk apparaat: 75 vragen over EHBO, reanimatie & AED, brandbestrijding, ontruiming en wet- en regelgeving. Met 80% goed ben je geslaagd en download je direct je certificaat."),
        ("Hoe lang is het BHV-certificaat geldig?", "Het certificaat is 1 jaar geldig. Daarna houd je je bevoegdheid met de BHV Herhaling (€49 p.p. excl. btw)."),
        ("Is het certificaat te controleren?", "Ja. Elk SKB BHV-certificaat en -pasje heeft een QR-code. Een werkgever of inspecteur scant die en ziet direct of het certificaat echt en geldig is."),
    ]
    body = f'''
<section class="hero"><div class="wrap">
  <span class="kicker">BHV op locatie · {E(c['prov'])}</span>
  <h1>BHV-cursus in <em>{n}</em></h1>
  <p class="lead">Je BHV-certificaat halen in {n}? Bij SKB BHV maak je het theorie-examen online, en komt de praktijkdag naar jullie toe: reanimatie, AED en blussen op jullie eigen werkplek. Voor bedrijven in {E(c['regio'])}.</p>
  <p style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px"><a class="knop rood" href="/?go=pricing">Bekijk pakketten</a><a class="knop rand" href="/rekentool">Bereken je prijs</a></p>
</div></section>
<section class="sectie donker"><div class="wrap">
  <span class="kicker">Zo werkt het</span><h2>Van aanmelden tot certificaat</h2>
  <div class="raster r4" style="margin-top:20px">
    <div class="kaart"><div class="nr">01</div><h3>Bestellen</h3><p>Kies het pakket en het aantal deelnemers. Vanaf 10 deelnemers 5% korting, vanaf 25 deelnemers 10%.</p></div>
    <div class="kaart"><div class="nr">02</div><h3>Online theorie</h3><p>Elke deelnemer krijgt een eigen examenlink: 75 vragen, in eigen tempo, op elk apparaat.</p></div>
    <div class="kaart"><div class="nr">03</div><h3>Praktijk in {n}</h3><p>Vanaf 4 deelnemers komen we naar jullie locatie voor reanimatie, AED en blussen.</p></div>
    <div class="kaart"><div class="nr">04</div><h3>Certificaat &amp; pasje</h3><p>Direct een digitaal certificaat en desgewenst een BHV-pasje met QR-code voor de echtheidscheck.</p></div>
  </div>
</div></section>
<section class="sectie"><div class="wrap">
  <span class="kicker">Prijzen</span><h2>Wat kost BHV in {n}?</h2>
  <div class="raster r3" style="margin-top:20px">
    <div class="kaart"><h3>BHV Basisexamen</h3><div class="prijs">€79 <small>p.p. excl. btw</small></div><ul class="vink"><li>Online theorie-examen</li><li>1 gratis herkansing</li><li>Certificaat direct</li></ul></div>
    <div class="kaart" style="border-color:#FF2D3D"><h3>Theorie + Praktijk</h3><div class="prijs">€179 <small>p.p. excl. btw</small></div><ul class="vink"><li>Online examen + praktijkdag</li><li>Op locatie in {n} vanaf 4 deelnemers (+€395 eenmalig)</li><li>Certificaat direct</li></ul></div>
    <div class="kaart"><h3>BHV Herhaling</h3><div class="prijs">€49 <small>p.p. excl. btw</small></div><ul class="vink"><li>Voor wie al BHV'er is</li><li>Online, in eigen tempo</li><li>Nieuw certificaat direct</li></ul></div>
  </div>
  <p class="klein" style="margin-top:12px">Optioneel BHV-pasje met QR-code: €12,50 p.p. Alle prijzen excl. 21% btw.</p>
</div></section>
<section class="sectie donker"><div class="wrap" style="max-width:860px">
  <span class="kicker">Vragen</span><h2>Veelgestelde vragen</h2>{faq_html(faq)}
</div></section>
{cta(f"BHV regelen voor jullie team in {n}?")}
'''
    ld = [ORG, faq_ld(faq), {"@type": "Service", "name": f"BHV-cursus op locatie in {c['naam']}", "provider": {"@id": SITE + "/#org"},
          "areaServed": {"@type": "City", "name": c['naam']}, "serviceType": "BHV-opleiding (bedrijfshulpverlening)"}]
    return page(f"bhv-cursus-{c['slug']}", f"BHV-cursus {c['naam']} — online examen + praktijk op locatie | SKB BHV",
                f"BHV-cursus in {c['naam']}: online theorie-examen en praktijkdag op jullie locatie. Vanaf €79 p.p. excl. btw, certificaat direct, met QR-echtheidscheck.",
                body, active='/bhv-cursus-op-locatie', jsonld=ld)


def locatie_overzicht():
    kaarten = ''.join(f'<a class="kaart" href="/bhv-cursus-{c["slug"]}"><h3>BHV {E(c["naam"])}</h3><p>{E(c["regio"])}</p><span class="meer">Bekijk →</span></a>' for c in STEDEN)
    body = f'''
<section class="hero"><div class="wrap">
  <span class="kicker">BHV op locatie</span><h1>De praktijkdag komt <em>naar jullie toe</em></h1>
  <p class="lead">Het theorie-examen maak je online. Voor de praktijk — reanimatie, AED en blussen — komen we vanaf 4 deelnemers bij jullie op de werkvloer. Vanuit Onstwedde werken we in heel Noord-Nederland.</p>
</div></section>
<section class="sectie donker"><div class="wrap"><span class="kicker">Plaatsen</span><h2>Kies je regio</h2>
  <div class="raster r3" style="margin-top:20px">{kaarten}</div>
  <p class="klein" style="margin-top:14px">Staat jullie plaats er niet tussen? Neem contact op — we komen in heel Noord-Nederland.</p>
</div></section>
{cta()}'''
    return page('bhv-cursus-op-locatie', 'BHV-cursus op locatie in Noord-Nederland | SKB BHV',
                'BHV-praktijkdag op jullie eigen locatie in Groningen, Drenthe, Friesland en Overijssel. Online theorie-examen, certificaat direct.',
                body, active='/bhv-cursus-op-locatie', jsonld=[ORG])


# ---------------------------------------------------------------- rekentool
def rekentool():
    body = '''
<section class="hero niet-printen"><div class="wrap">
  <span class="kicker">Voor werkgevers</span><h1>BHV <em>rekentool</em></h1>
  <p class="lead">Vul het aantal medewerkers in en zie direct hoeveel BHV'ers je nodig hebt en wat het kost — inclusief staffelkorting. Download meteen een offerte als PDF.</p>
</div></section>
<section class="sectie niet-printen" style="padding-top:10px"><div class="wrap">
 <div class="raster r2" style="align-items:start">
  <div class="kaart">
    <h3>Jullie situatie</h3>
    <label class="veld" for="mw">Aantal medewerkers</label><input id="mw" type="number" min="1" value="40" oninput="reken()">
    <label class="veld" for="bhv">Aantal BHV'ers dat je wilt opleiden</label><input id="bhv" type="number" min="1" value="1" oninput="handmatig=true;reken()">
    <p class="klein" id="advies" style="margin:6px 0 0"></p>
    <label class="veld">Opleiding</label>
    <select id="pkg" onchange="reken()">
      <option value="combi">BHV Theorie + Praktijk — €179 p.p.</option>
      <option value="basis">BHV Basisexamen (online) — €79 p.p.</option>
      <option value="herhaling">BHV Herhaling (online) — €49 p.p.</option>
    </select>
    <label class="check"><input type="checkbox" id="pasje" onchange="reken()"> BHV-pasje met QR-code (€12,50 p.p.)</label>
    <label class="check" id="locWrap"><input type="checkbox" id="loc" onchange="reken()"> Praktijkdag op onze locatie (+€395 eenmalig, vanaf 4 deelnemers)</label>
    <label class="veld" for="bedrijf">Bedrijfsnaam (voor op de offerte)</label><input id="bedrijf" placeholder="Bedrijf B.V." oninput="reken()">
  </div>
  <div class="kaart" style="border-color:rgba(255,45,61,.5)">
    <h3>Jullie prijs</h3>
    <div id="regels"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
      <a class="knop rood" href="/?go=pricing">Direct bestellen</a>
      <button class="knop rand" onclick="offerte()">Offerte als PDF</button>
    </div>
    <div style="margin-top:22px;border-top:1px solid #242A33;padding-top:16px">
      <h3 style="font-size:17px">Liever dat we je bellen?</h3>
      <p class="klein" style="margin:0 0 8px">Laat je e-mailadres achter, dan sturen we binnen 1 werkdag een voorstel op maat.</p>
      <div style="display:flex;gap:8px"><input id="lmail" type="email" placeholder="naam@bedrijf.nl"><button class="knop rood" style="padding:11px 16px" onclick="terugbellen()">Stuur</button></div>
      <div id="lmsg"></div>
    </div>
  </div>
 </div>
</div></section>
<section id="offerteDoc" style="display:none"></section>
'''
    script = r'''<style>
.regel{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #242A33;font-size:15px;color:#C9CFD8}
.regel b{color:#fff}.regel.totaal{border-bottom:none;font-size:20px;padding-top:12px}.regel.totaal b{font-family:'Archivo Black',Arial,sans-serif;font-weight:400;font-size:28px;color:#fff}
.korting{color:#19D36B !important}
@media print{
  body *{visibility:hidden}
  #offerteDoc,#offerteDoc *{visibility:visible}
  #offerteDoc{display:block !important;position:absolute;left:0;top:0;width:100%;color:#000;background:#fff;font-family:Arial,sans-serif;padding:0 8mm}
  @page{size:A4;margin:14mm}
}
#offerteDoc table{width:100%;border-collapse:collapse;margin:16px 0}
#offerteDoc td,#offerteDoc th{padding:8px 6px;border-bottom:1px solid #ddd;text-align:left;font-size:13px}
#offerteDoc th{background:#0B0D10;color:#fff;font-size:11px;letter-spacing:1px;text-transform:uppercase}
#offerteDoc .r{text-align:right}
</style>
<script>
var P={combi:{n:'BHV Theorie + Praktijk',p:179},basis:{n:'BHV Basisexamen (online)',p:79},herhaling:{n:'BHV Herhaling (online)',p:49}};
var handmatig=false, laatst=null;
function eur(v){return '€'+v.toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});}
function korting(q){return q>=25?0.10:(q>=10?0.05:0);}
function reken(){
  var mw=Math.max(1,parseInt(document.getElementById('mw').value,10)||1);
  var nodig=Math.max(1,Math.ceil(mw/50));
  if(!handmatig) document.getElementById('bhv').value=Math.max(nodig, Math.min(mw, Math.ceil(mw/25)));
  var q=Math.max(1,parseInt(document.getElementById('bhv').value,10)||1);
  document.getElementById('advies').innerHTML='Vuistregel: minimaal <b style="color:#fff">'+nodig+'</b> BHV\'er'+(nodig===1?'':'s')+' (1 per 50 medewerkers). Houd rekening met ploegendiensten, vakanties en verzuim — wij adviseren <b style="color:#fff">'+Math.max(nodig,Math.ceil(mw/25))+'</b>.';
  var pk=document.getElementById('pkg').value, pas=document.getElementById('pasje').checked;
  var locMag=pk==='combi'&&q>=4; var lw=document.getElementById('locWrap'); lw.style.opacity=locMag?1:.45; document.getElementById('loc').disabled=!locMag;
  var loc=locMag&&document.getElementById('loc').checked;
  var k=korting(q), stuk=Math.round(P[pk].p*(1-k)*100)/100, cursus=stuk*q, pasjes=pas?12.5*q:0, locatie=loc?395:0;
  var excl=cursus+pasjes+locatie, btw=Math.round(excl*0.21*100)/100, incl=excl+btw;
  laatst={mw:mw,q:q,pk:pk,k:k,stuk:stuk,cursus:cursus,pas:pas,pasjes:pasjes,loc:loc,locatie:locatie,excl:excl,btw:btw,incl:incl,bedrijf:document.getElementById('bedrijf').value.trim()};
  var h='';
  h+='<div class="regel"><span>'+q+' × '+P[pk].n+'</span><b>'+eur(P[pk].p*q)+'</b></div>';
  if(k) h+='<div class="regel korting"><span>Staffelkorting '+(k*100)+'%</span><b class="korting">− '+eur(P[pk].p*q-cursus)+'</b></div>';
  if(pas) h+='<div class="regel"><span>'+q+' × BHV-pasje</span><b>'+eur(pasjes)+'</b></div>';
  if(loc) h+='<div class="regel"><span>Praktijkdag op locatie</span><b>'+eur(locatie)+'</b></div>';
  h+='<div class="regel"><span>Totaal excl. btw</span><b>'+eur(excl)+'</b></div><div class="regel"><span>21% btw</span><b>'+eur(btw)+'</b></div>';
  h+='<div class="regel totaal"><span>Totaal incl. btw</span><b>'+eur(incl)+'</b></div>';
  if(!k && q>=7) h+='<p class="klein" style="margin:10px 0 0">Tip: vanaf 10 deelnemers krijg je 5% korting.</p>';
  if(k===0.05 && q>=20) h+='<p class="klein" style="margin:10px 0 0">Tip: vanaf 25 deelnemers krijg je 10% korting.</p>';
  document.getElementById('regels').innerHTML=h;
}
function offerte(){
  var L=laatst, d=new Date(), geldig=new Date(d.getTime()+30*864e5);
  var nr='OF-'+d.toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*900)+100);
  var f=function(x){return x.toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});};
  var rij=function(a,b,c,e){return '<tr><td>'+a+'</td><td class="r">'+b+'</td><td class="r">'+c+'</td><td class="r">'+e+'</td></tr>';};
  var t=rij(P[L.pk].n, L.q, eur(L.stuk), eur(L.cursus));
  if(L.pas) t+=rij('BHV-pasje met QR-code', L.q, eur(12.5), eur(L.pasjes));
  if(L.loc) t+=rij('Praktijkdag op locatie (eenmalig)', 1, eur(395), eur(395));
  document.getElementById('offerteDoc').innerHTML=
   '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:6px solid #E0101F;padding-bottom:12px"><img src="'+document.querySelector('.kop .logo img').src+'" style="height:52px"><div style="text-align:right;font-size:12px;color:#444">SKB BHV — onderdeel van Oibase B.V.<br>Goordelaan 19, 9591 CB Onstwedde<br>info@skbbhv.nl · 06 24 62 66 38<br>KVK 42117378 · BTW NL869807729B01</div></div>'+
   '<h1 style="font-family:Arial,sans-serif;font-size:28px;color:#000;text-transform:uppercase;margin:22px 0 4px">Offerte BHV-opleiding</h1>'+
   '<p style="color:#333;margin:0">Offertenummer <b>'+nr+'</b> · Datum '+f(d)+' · Geldig tot '+f(geldig)+'</p>'+
   (L.bedrijf?'<p style="color:#333">Voor: <b>'+L.bedrijf.replace(/</g,'&lt;')+'</b></p>':'')+
   '<p style="color:#333">Op basis van <b>'+L.mw+'</b> medewerkers adviseren wij minimaal <b>'+Math.max(1,Math.ceil(L.mw/50))+'</b> BHV\'er(s) (vuistregel 1 per 50).</p>'+
   '<table><tr><th>Omschrijving</th><th class="r">Aantal</th><th class="r">Prijs p.st.</th><th class="r">Bedrag</th></tr>'+t+
   (L.k?'<tr><td colspan="4" style="color:#0a7a3a">Inclusief '+(L.k*100)+'% staffelkorting op de opleiding.</td></tr>':'')+
   '<tr><td colspan="3" class="r">Totaal excl. btw</td><td class="r"><b>'+eur(L.excl)+'</b></td></tr><tr><td colspan="3" class="r">21% btw</td><td class="r">'+eur(L.btw)+'</td></tr>'+
   '<tr><td colspan="3" class="r"><b>Totaal incl. btw</b></td><td class="r"><b>'+eur(L.incl)+'</b></td></tr></table>'+
   '<p style="color:#333;font-size:13px">Inbegrepen per deelnemer: online examen van 75 vragen, 1 gratis herkansing en een digitaal certificaat (1 jaar geldig) met QR-echtheidscheck.'+(L.loc?' De praktijkdag plannen we in overleg op jullie locatie.':'')+'</p>'+
   '<p style="color:#333;font-size:13px">Akkoord? Bestel direct op <b>www.skbbhv.nl</b> of mail deze offerte terug naar <b>info@skbbhv.nl</b>.</p>';
  window.print();
}
function terugbellen(){
  var m=document.getElementById('lmail').value.trim(), o=document.getElementById('lmsg');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){o.innerHTML='<div class="melding fout">Vul een geldig e-mailadres in.</div>';return;}
  skbLead('rekentool', m, laatst).then(function(){o.innerHTML='<div class="melding ok">Bedankt! We sturen je binnen 1 werkdag een voorstel.</div>';})
   .catch(function(e){o.innerHTML='<div class="melding fout">'+e.message+'</div>';});
}
reken();
</script>'''
    return page('rekentool', "BHV rekentool: hoeveel BHV'ers heb je nodig? | SKB BHV",
                "Bereken hoeveel BHV'ers jullie bedrijf nodig heeft en wat het kost, inclusief staffelkorting. Download direct een offerte als PDF.",
                body, active='/rekentool', jsonld=[ORG], script=script)


# ---------------------------------------------------------------- oefentoets
VRAGEN = [
    ("Wat doe je altijd als eerste bij een ongeval?", ["Het slachtoffer direct verplaatsen", "Letten op gevaar voor jezelf, omstanders en het slachtoffer", "Meteen beginnen met reanimeren", "Het slachtoffer iets te drinken geven"], 1,
     "Eerst je eigen veiligheid. Als jij ook slachtoffer wordt, kun je niemand meer helpen."),
    ("Iemand reageert niet en ademt niet normaal. Wat doe je?", ["Wachten tot hij bijkomt", "Laten bellen naar 112 en starten met reanimeren", "In de stabiele zijligging leggen", "Water in het gezicht gooien"], 1,
     "Geen normale ademhaling = reanimeren. Laat iemand 112 bellen en een AED halen."),
    ("Wat is de verhouding borstcompressies en beademingen bij een volwassene?", ["15 : 2", "30 : 2", "5 : 1", "30 : 5"], 1,
     "30 borstcompressies, gevolgd door 2 beademingen."),
    ("In welk tempo geef je borstcompressies?", ["60–80 per minuut", "80–100 per minuut", "100–120 per minuut", "140–160 per minuut"], 2,
     "Druk 100 tot 120 keer per minuut, ongeveer 5 tot 6 centimeter diep."),
    ("Wanneer sluit je een AED aan bij een reanimatie?", ["Pas na 10 minuten reanimeren", "Zo snel mogelijk, zodra hij er is", "Alleen als de ambulance dat zegt", "Alleen bij kinderen"], 1,
     "Hoe eerder de AED wordt aangesloten, hoe groter de overlevingskans."),
    ("Iemand is niet aanspreekbaar maar ademt normaal. Wat doe je?", ["Starten met reanimeren", "In de stabiele zijligging leggen en de ademhaling blijven controleren", "Rechtop laten zitten", "Alleen laten en hulp zoeken"], 1,
     "De stabiele zijligging houdt de luchtweg vrij. Blijf de ademhaling controleren."),
    ("Hoe koel je een brandwond?", ["Met ijs, 1 minuut", "Met lauw, zacht stromend water, minimaal 10 minuten", "Met boter of zalf", "Niet koelen, meteen afdekken"], 1,
     "Koel met lauw stromend water, minimaal 10 minuten. Geen ijs, boter of zalf."),
    ("Waaruit bestaat de branddriehoek?", ["Rook, vuur en hitte", "Brandbare stof, zuurstof en ontbrandingstemperatuur", "Hout, papier en gas", "Water, schuim en poeder"], 1,
     "Haal één van de drie weg en het vuur dooft."),
    ("Waarmee blus je een vlam in de pan zeker NIET?", ["Een deksel", "Een blusdeken", "Water", "Het vuur uitzetten en afdekken"], 2,
     "Water op brandend vet geeft een steekvlam. Deksel of blusdeken erop en het vuur uit."),
    ("Wie is volgens de Arbowet verantwoordelijk voor goede BHV in een bedrijf?", ["De brandweer", "De werkgever", "De BHV'er zelf", "De gemeente"], 1,
     "De werkgever moet zorgen voor voldoende en goed opgeleide BHV'ers."),
]


def oefentoets():
    data = json.dumps([{"q": q, "o": o, "a": a, "u": u} for q, o, a, u in VRAGEN], ensure_ascii=False)
    body = '''
<section class="hero"><div class="wrap" style="max-width:860px">
  <span class="kicker">Gratis · 10 vragen · 3 minuten</span><h1>BHV <em>oefentoets</em></h1>
  <p class="lead">Test je BHV-kennis met 10 vragen over eerste hulp, reanimatie, brand en ontruiming. Je uitslag met uitleg krijg je direct te zien.</p>
</div></section>
<section class="sectie" style="padding-top:0"><div class="wrap" style="max-width:860px">
  <div class="kaart" id="toets"></div>
</div></section>
''' + cta('Klaar voor het echte examen?', 'Het BHV-examen heeft 75 vragen; met 80% goed heb je direct je certificaat.')
    script = r'''<style>
.voortgang{height:6px;background:#1A1E25;border-radius:3px;overflow:hidden;margin-bottom:18px}.voortgang i{display:block;height:100%;background:linear-gradient(90deg,#FF2D3D,#FF6A1A);transition:width .3s}
.optie{display:block;width:100%;text-align:left;background:#0E1115;border:1px solid #2A313B;color:#ECEFF3;border-radius:5px;padding:13px 15px;margin:8px 0;font:inherit;font-size:16px;cursor:pointer}
.optie:hover{border-color:#FF2D3D}
.uitleg{border-bottom:1px solid #242A33;padding:12px 0}.uitleg:last-child{border-bottom:none}
.goed{color:#19D36B}.fout{color:#FF6B76}
.score{font-family:'Archivo Black',Arial,sans-serif;font-size:64px;line-height:1;color:#fff}
</style>
<script>
var V=''' + data + r''', i=0, ant=[];
function esc(v){return String(v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}
function toon(){
  var t=document.getElementById('toets');
  if(i<V.length){
    var v=V[i];
    t.innerHTML='<div class="voortgang"><i style="width:'+(i/V.length*100)+'%"></i></div><p class="klein" style="margin:0 0 6px">Vraag '+(i+1)+' van '+V.length+'</p><h3 style="font-size:22px;text-transform:none;letter-spacing:0">'+esc(v.q)+'</h3>'+
      v.o.map(function(o,k){return '<button class="optie" onclick="kies('+k+')">'+String.fromCharCode(65+k)+'. '+esc(o)+'</button>';}).join('');
    return;
  }
  t.innerHTML='<div class="voortgang"><i style="width:100%"></i></div><h3 style="font-size:24px">Klaar! Waar sturen we je uitslag heen?</h3>'+
   '<p>Vul je e-mailadres in om je score en de uitleg per vraag te zien.</p>'+
   '<label class="veld" for="m">E-mailadres</label><input id="m" type="email" placeholder="naam@voorbeeld.nl">'+
   '<label class="check"><input type="checkbox" id="opt"> Stuur mij af en toe BHV-tips en aanbiedingen (afmelden kan altijd)</label>'+
   '<button class="knop rood" style="margin-top:10px" onclick="uitslag()">Toon mijn uitslag</button><div id="mm"></div>'+
   '<p class="klein" style="margin-top:12px">We gebruiken je e-mailadres alleen voor SKB BHV en delen het met niemand.</p>';
}
function kies(k){ant[i]=k;i++;toon();}
function uitslag(){
  var m=document.getElementById('m').value.trim(), o=document.getElementById('mm');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){o.innerHTML='<div class="melding fout">Vul een geldig e-mailadres in.</div>';return;}
  var goed=V.filter(function(v,k){return ant[k]===v.a;}).length;
  skbLead('oefentoets', m, {score:goed, van:V.length, nieuwsbrief:document.getElementById('opt').checked}).catch(function(){});
  var t=document.getElementById('toets'), pct=Math.round(goed/V.length*100);
  var oordeel=pct>=80?'<span class="goed">Geslaagd-niveau!</span> Je zit boven de 80% van het echte examen.':'<span class="fout">Nog even oefenen.</span> Voor het echte examen heb je 80% nodig.';
  t.innerHTML='<p class="klein" style="margin:0">Jouw score</p><div class="score">'+goed+'/'+V.length+'</div><p style="font-size:18px">'+oordeel+'</p>'+
   '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 20px"><a class="knop rood" href="/?go=pricing">Echt examen doen</a><button class="knop rand" onclick="i=0;ant=[];toon()">Opnieuw</button></div>'+
   V.map(function(v,k){var ok=ant[k]===v.a;return '<div class="uitleg"><b class="'+(ok?'goed':'fout')+'">'+(ok?'✓':'✗')+' '+esc(v.q)+'</b><br><span class="klein">Juist: '+esc(v.o[v.a])+'. '+esc(v.u)+'</span></div>';}).join('');
}
toon();
</script>'''
    quiz = {"@type": "Quiz", "name": "BHV oefentoets", "about": "Bedrijfshulpverlening", "educationalLevel": "beginner",
            "provider": {"@id": SITE + "/#org"}, "isAccessibleForFree": True}
    return page('oefentoets', 'Gratis BHV-oefentoets (10 vragen) | SKB BHV',
                'Test gratis je BHV-kennis: 10 oefenvragen over EHBO, reanimatie, AED, brand en ontruiming, met direct je uitslag en uitleg.',
                body, active='/oefentoets', jsonld=[ORG, quiz], script=script)


# ---------------------------------------------------------------- echtheid
def echtheid():
    faq = [("Hoe controleer ik een BHV-certificaat van SKB BHV?", "Scan de QR-code op het certificaat of pasje met de camera van je telefoon. Je ziet direct of het certificaat echt en geldig is. Zonder QR kun je ook het certificaatnummer en de geboortedatum invullen op skbbhv.nl/check."),
           ("Welke gegevens zie ik bij de controle?", "Naam, geboortejaar, waarvoor de houder geslaagd is (theorie en/of praktijk), de behaaldatum, geldig-tot-datum, certificaatnummer en pasnummer. Vergelijk naam en geboortejaar met een identiteitsbewijs."),
           ("Wat als een certificaat niet gevonden wordt?", "Dan staat het niet in ons register. Het kan vervalst zijn of de gegevens zijn verkeerd overgenomen. Neem bij twijfel contact op via info@skbbhv.nl.")]
    body = f'''
<section class="hero"><div class="wrap">
  <span class="kicker">Echtheidscheck</span><h1>Elk certificaat is <em>te controleren</em></h1>
  <p class="lead">Op ieder SKB BHV-certificaat en -pasje staat een QR-code. Scannen is genoeg: binnen een seconde zie je of de BHV'er echt en geldig gecertificeerd is. Zo weet je als werkgever, inspecteur of opdrachtgever zeker dat het klopt.</p>
  <p style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px"><a class="knop rood" href="/check">Certificaat controleren</a><a class="knop rand" href="/?go=pricing">BHV regelen</a></p>
</div></section>
<section class="sectie donker"><div class="wrap">
 <div class="raster r2" style="align-items:center">
  <div><img src="/certificaat-pasje.jpg" alt="SKB BHV-certificaat en BHV-pasje met QR-code" loading="lazy" style="border-radius:6px;border:1px solid #242A33"></div>
  <div><span class="kicker">Zo werkt het</span><h2>Scan. Zie. Klaar.</h2>
   <div class="raster" style="margin-top:14px">
    <div class="kaart"><h3>1 · Scan de QR</h3><p>Met de gewone camera van elke smartphone, zonder app.</p></div>
    <div class="kaart"><h3>2 · Bekijk de status</h3><p><b style="color:#19D36B">Groen</b> = echt en geldig, <b style="color:#FFB020">oranje</b> = echt maar verlopen, <b style="color:#FF6B76">rood</b> = niet gevonden.</p></div>
    <div class="kaart"><h3>3 · Vergelijk met ID</h3><p>Naam en geboortejaar vergelijken met een identiteitsbewijs, en je weet het zeker.</p></div>
   </div></div>
 </div>
</div></section>
<section class="sectie"><div class="wrap" style="max-width:860px"><span class="kicker">Vragen</span><h2>Over de echtheidscheck</h2>{faq_html(faq)}</div></section>
{cta('Ook BHV&#39;ers met een controleerbaar certificaat?')}'''
    return page('echtheid', 'Echtheidscheck BHV-certificaat met QR-code | SKB BHV',
                'Elk SKB BHV-certificaat en -pasje heeft een QR-code. Scan en zie direct of de BHV\'er echt en geldig gecertificeerd is.',
                body, active='/echtheid', jsonld=[ORG, faq_ld(faq)])


# ---------------------------------------------------------------- BHV-plan
PLAN = [
    ("1. Gegevens bedrijf", "Bedrijfsnaam: …\nAdres en vestiging: …\nAantal medewerkers (ook flexkrachten): …\nOpeningstijden / werktijden en ploegen: …\nAanwezige bezoekers of klanten (gemiddeld): …"),
    ("2. Risico's (uit de RI&E)", "Belangrijkste risico's op deze locatie, bijvoorbeeld: brand in de werkplaats, opslag van gevaarlijke stoffen, werken op hoogte, bedrijfsongevallen met machines, alleen werken in de avond.\n…"),
    ("3. BHV-organisatie", "Aantal BHV'ers (vuistregel minimaal 1 per 50 aanwezigen, rekening houden met ploegen, vakantie en verzuim): …\nHoofd BHV: naam … · telefoon …\nBHV'ers: naam … · afdeling … · telefoon …\nVervanging bij afwezigheid geregeld door: …"),
    ("4. Alarmering", "Intern alarmnummer: …\nHoe wordt alarm gegeven (sirene, omroep, app)? …\nWie belt 112 en wat zeg je: wie je bent, wat er is gebeurd, adres en ingang, hoeveel slachtoffers.\nWie vangt de hulpdiensten op bij de ingang? …"),
    ("5. Ontruiming", "Vluchtroutes en nooduitgangen: …\nVerzamelplaats: …\nWie controleert ruimtes en toiletten? …\nHoe wordt geteld wie er is (presentielijst, bezoekersregistratie)? …\nHulp voor minder zelfredzame personen: …"),
    ("6. Middelen", "Locatie AED: …\nLocatie EHBO-koffer(s): …\nBrandblussers en blusdekens (type en plek): …\nPlattegronden hangen bij: …\nControle en onderhoud middelen door: … (datum laatste controle: …)"),
    ("7. Opleiding en oefenen", "BHV-certificaten worden jaarlijks herhaald (BHV Herhaling). Overzicht van geldigheid: zie Mijn BHV-team op skbbhv.nl.\nOntruimingsoefening minimaal 1× per jaar, gepland op: …\nEvaluatie na elke oefening of incident door: …"),
    ("8. Na een incident", "Melding van ernstige arbeidsongevallen aan de Nederlandse Arbeidsinspectie.\nOpvang en nazorg van medewerkers door: …\nRegistratie in het ongevallenregister door: …\nBHV-plan bijgewerkt op: …"),
]


def bhv_plan():
    secties = ''.join(f'<div class="plan-sectie"><h3>{E(t)}</h3><div class="plan-tekst" contenteditable="true">{E(x)}</div></div>' for t, x in PLAN)
    body = f'''
<section class="hero niet-printen"><div class="wrap" style="max-width:900px">
  <span class="kicker">Gratis template</span><h1>BHV-plan <em>template</em></h1>
  <p class="lead">Een kant-en-klaar BHV- en ontruimingsplan met alle onderdelen die je nodig hebt. Vul het direct online in en sla het op als PDF.</p>
</div></section>
<section class="sectie" style="padding-top:0"><div class="wrap" style="max-width:900px">
  <div class="kaart niet-printen" id="slot">
    <h3>Ontvang direct toegang</h3>
    <p>Vul je e-mailadres in en de template opent meteen hieronder.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="pm" type="email" placeholder="naam@bedrijf.nl" style="flex:1;min-width:220px"><button class="knop rood" onclick="ontgrendel()">Open template</button></div>
    <label class="check"><input type="checkbox" id="popt"> Stuur mij af en toe BHV-tips en aanbiedingen</label>
    <div id="pmsg"></div>
  </div>
  <div id="plan" style="display:none">
    <div class="melding let niet-printen">Klik in de tekst om alles op jullie situatie aan te passen. Klaar? Druk op <b>Opslaan als PDF</b> en kies in het printvenster "Opslaan als PDF".</div>
    <div class="plan-doc">
      <div class="plan-kop"><img src="{LOGO}" alt="SKB BHV logo"><div><b>BHV- en ontruimingsplan</b><span contenteditable="true">Bedrijfsnaam · versie 1 · datum</span></div></div>
      {secties}
      <p class="plan-voet">Template door SKB BHV · www.skbbhv.nl · Dit is een hulpmiddel; de werkgever blijft verantwoordelijk voor een BHV-organisatie die past bij de eigen RI&amp;E.</p>
    </div>
    <p class="niet-printen" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><button class="knop rood" onclick="window.print()">Opslaan als PDF</button><a class="knop rand" href="/rekentool">Hoeveel BHV'ers heb ik nodig?</a></p>
  </div>
</div></section>
{cta('BHV&#39;ers opleiden voor jullie plan?')}'''
    script = r'''<style>
.plan-doc{background:#fff;color:#111;border-radius:6px;padding:34px 38px}
.plan-kop{display:flex;align-items:center;gap:18px;border-bottom:6px solid #E0101F;padding-bottom:14px;margin-bottom:18px}
.plan-kop img{height:54px}.plan-kop b{display:block;font-family:'Archivo Black',Arial,sans-serif;font-weight:400;font-size:26px;text-transform:uppercase}
.plan-kop span{color:#555;font-size:14px}
.plan-sectie{margin:0 0 16px;break-inside:avoid}.plan-sectie h3{color:#0B0D10;font-size:18px;border-left:5px solid #E0101F;padding-left:10px;margin-bottom:6px}
.plan-tekst{white-space:pre-wrap;font-size:14.5px;line-height:1.6;color:#222;border:1px dashed #ccc;border-radius:4px;padding:10px 12px;outline:none}
.plan-tekst:focus{border-color:#E0101F;background:#FFF7F7}
.plan-voet{font-size:11.5px;color:#777;margin-top:20px}
@media print{.plan-doc{padding:0}.plan-tekst{border:none;padding:2px 0}@page{size:A4;margin:16mm}main .cta,section.sectie:last-of-type{display:none}}
</style>
<script>
function ontgrendel(){
  var m=document.getElementById('pm').value.trim(), o=document.getElementById('pmsg');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){o.innerHTML='<div class="melding fout">Vul een geldig e-mailadres in.</div>';return;}
  skbLead('bhv-plan', m, {nieuwsbrief:document.getElementById('popt').checked}).catch(function(){});
  try{localStorage.setItem('skb-plan-open','1');}catch(e){}
  open_();
}
function open_(){document.getElementById('slot').style.display='none';document.getElementById('plan').style.display='';}
try{if(localStorage.getItem('skb-plan-open')==='1') open_();}catch(e){}
</script>'''
    return page('bhv-plan', 'Gratis BHV-plan template (ontruimingsplan) | SKB BHV',
                'Download gratis een BHV- en ontruimingsplan template. Online invullen en opslaan als PDF: organisatie, alarmering, ontruiming, middelen en oefenen.',
                body, active='/bhv-plan', jsonld=[ORG], script=script)


def fit_pagina():
    body = '''
<section class="hero"><div class="wrap" style="max-width:760px">
  <span class="kicker">BHV-fit · 2 minuten</span><h1>Blijf <em>scherp</em></h1>
  <p class="lead" id="intro">Drie korte vragen om je BHV-kennis op peil te houden.</p>
</div></section>
<section class="sectie" style="padding-top:0"><div class="wrap" style="max-width:760px"><div class="kaart" id="fit"><p>Laden…</p></div></div></section>'''
    script = r'''<style>.optie{display:block;width:100%;text-align:left;background:#0E1115;border:1px solid #2A313B;color:#ECEFF3;border-radius:5px;padding:12px 14px;margin:7px 0;font:inherit;cursor:pointer}
.optie.gekozen{border-color:#FF2D3D;background:rgba(255,45,61,.12)}.vraag{margin-bottom:18px}.goed{color:#19D36B}.fout{color:#FF6B76}</style>
<script>
var m=location.pathname.match(/^\/fit\/([A-Za-z0-9]{6,20})/), code=m?m[1]:new URLSearchParams(location.search).get('c'), maand=new URLSearchParams(location.search).get('m')||'';
var keuze=[null,null,null], data=null;
function esc(v){return String(v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}
function toon(){
  var f=document.getElementById('fit');
  f.innerHTML=data.vragen.map(function(v,k){return '<div class="vraag"><h3 style="text-transform:none;letter-spacing:0;font-size:19px">'+(k+1)+'. '+esc(v.q)+'</h3>'+v.o.map(function(o,j){return '<button class="optie'+(keuze[k]===j?' gekozen':'')+'" onclick="kies('+k+','+j+')">'+esc(o)+'</button>';}).join('')+'</div>';}).join('')+
   '<button class="knop rood" onclick="stuur()" '+(keuze.indexOf(null)>-1?'disabled':'')+'>Bekijk mijn score</button>';
}
function kies(k,j){keuze[k]=j;toon();}
function uitslag(r){
  document.getElementById('fit').innerHTML='<p class="klein" style="margin:0">Jouw score deze maand</p><div style="font-family:Archivo Black,Arial;font-size:60px;line-height:1;color:#fff">'+r.score+'/3</div>'+
   '<p>'+(r.score===3?'<span class="goed">Top! Je bent BHV-fit.</span>':'<span class="fout">Goed om even op te frissen.</span>')+(r.alGedaan?' (Je had deze maand al meegedaan.)':'')+'</p>'+
   r.uitleg.map(function(x){return '<p><b class="'+(x.goed?'goed':'fout')+'">'+(x.goed?'✓':'✗')+' '+esc(x.q)+'</b><br><span class="klein">Juist: '+esc(x.juist)+'. '+esc(x.u)+'</span></p>';}).join('')+
   '<p style="margin-top:18px"><a class="knop rand" href="/oefentoets">Meer oefenen</a></p>';
}
function stuur(){fetch('/api/fit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code,m:data.maand,antwoorden:keuze})}).then(function(r){return r.json()}).then(uitslag);}
fetch('/api/fit?code='+encodeURIComponent(code||'')+'&m='+encodeURIComponent(maand)).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error);return j;});}).then(function(j){
  data=j; document.getElementById('intro').textContent=(j.naam?'Hoi '+j.naam+', ':'')+'drie korte vragen om je BHV-kennis op peil te houden.';
  if(j.gedaan){document.getElementById('fit').innerHTML='<h3>Al gedaan deze maand ✓</h3><p>Je scoorde '+j.gedaan.score+'/3. Volgende maand krijg je nieuwe vragen.</p>';return;}
  toon();
}).catch(function(e){document.getElementById('fit').innerHTML='<p class="fout">'+esc(e.message||'Link ongeldig.')+'</p>';});
</script>'''
    return page('fit', 'BHV-fit — maandelijkse opfrisvragen | SKB BHV', 'Drie korte vragen per maand om je BHV-kennis scherp te houden.',
                body, jsonld=None, extra_head='<meta name="robots" content="noindex,nofollow">', script=script)


if __name__ == '__main__':
    urls = [SITE + '/']
    urls.append(rekentool()); urls.append(oefentoets()); urls.append(echtheid()); urls.append(bhv_plan())
    urls.append(locatie_overzicht())
    for c in STEDEN:
        urls.append(stad_pagina(c))
    fit_pagina()
    urls.append(SITE + '/check')
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
        f'  <url><loc>{u}</loc><lastmod>{TODAY}</lastmod></url>\n' for u in urls) + '</urlset>\n'
    open(os.path.join(PUB, 'sitemap.xml'), 'w').write(sm)
    print(len(urls), 'pagina\'s + sitemap gemaakt')
