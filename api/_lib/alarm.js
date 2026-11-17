// api/_lib/alarm.js
// BHV-alarmknop: de werkgever slaat alarm, alle BHV'ers van het team krijgen direct een
// pushmelding op hun telefoon (via de digitale pas) en een e-mail als vangnet.
// BHV'ers reageren met "Ik kom eraan" / "Ik kan niet"; de werkgever ziet dat live.

import crypto from 'crypto';
import { Resend } from 'resend';
import { kv } from './kv.js';
import { stuurPush, pushIngesteld, VAPID_PUBLIC_KEY } from './webpush.js';
import { escapeHtml, isValidEmail, normalizeEmail, getOrdersForEmail, COMPANY_FOOTER_HTML } from './accounts.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';
const SITE = process.env.SITE_URL || 'https://www.skbbhv.nl';

export const SOORTEN = {
  brand: { label: 'Brand', icoon: '🔥' },
  ehbo: { label: 'EHBO / letsel', icoon: '🩹' },
  reanimatie: { label: 'Reanimatie / AED', icoon: '❤️' },
  ontruiming: { label: 'Ontruiming', icoon: '🚪' },
  overig: { label: 'Calamiteit', icoon: '⚠️' },
};
const ALARM_TTL = 7 * 24 * 3600;
const PUSH_TTL = 400 * 24 * 3600;

const tekst = (v, n) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const codeOk = (c) => /^[A-Za-z0-9]{6,20}$/.test(String(c || ''));

async function tokenVoorCode(code) {
  if (!codeOk(code)) return null;
  const t = await kv.get(`verify:${code}`);
  return typeof t === 'string' ? t : null;
}

// ---- BHV'er: meldingen aanzetten op de digitale pas ----
export async function abonneer(body) {
  const token = await tokenVoorCode(body.code);
  if (!token) return { status: 404, json: { error: 'Pas niet gevonden.' } };
  const s = body.subscription || {};
  const endpoint = String(s.endpoint || '');
  if (!/^https:\/\/[^\s]{10,800}$/.test(endpoint) || !s.keys || !s.keys.p256dh || !s.keys.auth) {
    return { status: 400, json: { error: 'Ongeldig abonnement.' } };
  }
  const sub = { endpoint, keys: { p256dh: tekst(s.keys.p256dh, 200), auth: tekst(s.keys.auth, 64) } };
  // Meerdere toestellen per BHV'er (max 5).
  let lijst = (await kv.get(`push:${token}`)) || [];
  if (!Array.isArray(lijst)) lijst = [];
  lijst = lijst.filter((x) => x && x.endpoint !== endpoint);
  lijst.push({ ...sub, at: new Date().toISOString() });
  await kv.set(`push:${token}`, lijst.slice(-5), { ex: PUSH_TTL });
  if (body.test) {
    await stuurPush(sub, { titel: '✅ Alarmmeldingen staan aan', tekst: 'Je krijgt nu direct een melding als je werkgever BHV-alarm slaat.', url: `/pas/${body.code}` }, { ttl: 300, urgentie: 'normal' });
  }
  return { status: 200, json: { ok: true } };
}

export async function afmelden(body) {
  const token = await tokenVoorCode(body.code);
  if (!token) return { status: 404, json: { error: 'Pas niet gevonden.' } };
  let lijst = (await kv.get(`push:${token}`)) || [];
  if (Array.isArray(lijst)) {
    lijst = lijst.filter((x) => x && x.endpoint !== String(body.endpoint || ''));
    await kv.set(`push:${token}`, lijst, { ex: PUSH_TTL });
  }
  return { status: 200, json: { ok: true } };
}

// ---- Werkgever: alarm slaan ----
async function teamBhvers(werkgever) {
  const orders = await getOrdersForEmail(werkgever);
  const tokens = [...new Set(orders.flatMap((o) => (o.roster || []).map((e) => e && e.token).filter(Boolean)))].slice(0, 300);
  const uit = [];
  for (const t of tokens) {
    const p = await kv.get(`participant:${t}`);
    if (!p || p.status !== 'passed' || !p.verifyCode) continue;
    uit.push({ token: t, p });
  }
  return uit;
}

function alarmMail(a, naam, link) {
  const s = SOORTEN[a.soort] || SOORTEN.overig;
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#12161B;">
    <div style="background:#E0101F;padding:22px 28px;"><span style="color:#fff;font-size:26px;font-weight:bold;letter-spacing:1px;">${a.test ? 'TESTALARM' : 'BHV-ALARM'} ${s.icoon}</span></div>
    <div style="border:1px solid #E1E4E9;border-top:none;padding:26px 28px;">
      <h2 style="margin:0 0 10px;color:#0B0D10;">${escapeHtml(s.label)}${a.locatie ? ' — ' + escapeHtml(a.locatie) : ''}</h2>
      ${a.bericht ? `<p style="font-size:16px;">${escapeHtml(a.bericht)}</p>` : ''}
      <p style="color:#555;">${naam ? 'Hoi ' + escapeHtml(naam) + ', ' : ''}${a.test ? 'dit is een <b>oefening</b> van' : 'er is alarm geslagen door'} ${escapeHtml(a.bedrijf || 'je werkgever')} om ${new Date(a.at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })}.</p>
      <p style="text-align:center;margin:24px 0;"><a href="${link}" style="background:#E0101F;color:#fff;text-decoration:none;padding:15px 30px;border-radius:4px;font-weight:bold;display:inline-block;font-size:17px;">IK KOM ERAAN / IK KAN NIET</a></p>
      <p style="font-size:13px;color:#888;">Bij levensgevaar: bel altijd eerst <b>112</b>.</p>
      <hr style="border:none;border-top:1px solid #E1E4E9;margin:22px 0;"><p style="font-size:12px;color:#8b939b;">${COMPANY_FOOTER_HTML}</p></div></div>`;
}

export async function slaAlarm(werkgever, body, account) {
  const soort = SOORTEN[body.soort] ? body.soort : 'overig';
  const test = !!body.test;
  // Niet per ongeluk dubbel: max. 1 alarm per 30 seconden per werkgever.
  const vrij = await kv.set(`alarmslot:${werkgever}`, '1', { nx: true, ex: 30 });
  if (!vrij) return { status: 429, json: { error: 'Er is net al alarm geslagen. Wacht een halve minuut.' } };

  const team = await teamBhvers(werkgever);
  if (!team.length) return { status: 400, json: { error: 'Er zijn nog geen geslaagde BHV\'ers in je team.' } };

  const id = crypto.randomBytes(9).toString('base64url');
  const inst = (await kv.get(`instellingen:${werkgever}`)) || {};
  const a = {
    id, werkgever, test, soort,
    bedrijf: tekst(inst.alarmNaam || (account && (account.company || account.bedrijf)) || '', 80),
    locatie: tekst(body.locatie, 120),
    bericht: tekst(body.bericht, 400),
    at: new Date().toISOString(),
    ontvangers: team.map(({ token, p }) => ({ token, naam: `${p.first || ''} ${p.last || ''}`.trim() })),
    reacties: {},
    bereik: { push: 0, mail: 0 },
  };
  await kv.set(`alarm:${id}`, a, { ex: ALARM_TTL });

  const s = SOORTEN[soort];
  const titel = `${test ? 'TESTALARM' : 'BHV-ALARM'} ${s.icoon} ${s.label}`;
  await Promise.all(team.map(async ({ token, p }) => {
    const url = `/pas/${p.verifyCode}?alarm=${id}`;
    let subs = (await kv.get(`push:${token}`)) || [];
    if (!Array.isArray(subs)) subs = [];
    let gelukt = false; let opruimen = false;
    for (const sub of subs) {
      const r = await stuurPush(sub, { titel, tekst: [a.locatie, a.bericht].filter(Boolean).join(' — ') || 'Kom direct in actie.', url, alarm: id, test }, { ttl: 600 });
      if (r.ok) gelukt = true;
      if (r.verlopen) { sub.weg = true; opruimen = true; }
    }
    if (opruimen) await kv.set(`push:${token}`, subs.filter((x) => !x.weg), { ex: PUSH_TTL });
    if (gelukt) a.bereik.push++;
    const to = normalizeEmail(p.email);
    if (resend && isValidEmail(to) && to !== normalizeEmail(werkgever)) {
      try {
        await resend.emails.send({ from: FROM_EMAIL, to, subject: `${titel}${a.locatie ? ' — ' + a.locatie : ''}`, html: alarmMail(a, p.first, SITE + url) });
        a.bereik.mail++;
      } catch (e) { console.error('alarmmail mislukt', e); }
    }
  }));
  await kv.update(`alarm:${id}`, { ...(await kv.get(`alarm:${id}`)), bereik: a.bereik });

  let hist = (await kv.get(`alarms:${werkgever}`)) || [];
  if (!Array.isArray(hist)) hist = [];
  hist.unshift({ id, at: a.at, soort, test, locatie: a.locatie });
  await kv.set(`alarms:${werkgever}`, hist.slice(0, 20));
  return { status: 200, json: { ok: true, alarm: publiekVoorWerkgever({ ...a }), pushIngesteld: pushIngesteld() } };
}

function publiekVoorWerkgever(a) {
  return {
    id: a.id, test: a.test, soort: a.soort, locatie: a.locatie, bericht: a.bericht, at: a.at, bereik: a.bereik,
    ontvangers: a.ontvangers.map((o) => ({ naam: o.naam, reactie: (a.reacties[o.token] || {}).status || null, om: (a.reacties[o.token] || {}).at || null })),
  };
}

export async function alarmStatus(werkgever, body) {
  let id = String(body.id || '');
  if (!id) {
    const hist = (await kv.get(`alarms:${werkgever}`)) || [];
    if (!hist.length) return { status: 200, json: { ok: true, alarm: null, geschiedenis: [] } };
    id = hist[0].id;
  }
  const a = await kv.get(`alarm:${id}`);
  if (!a || a.werkgever !== werkgever) return { status: 200, json: { ok: true, alarm: null } };
  return { status: 200, json: { ok: true, alarm: publiekVoorWerkgever(a), geschiedenis: ((await kv.get(`alarms:${werkgever}`)) || []).slice(0, 10) } };
}

// ---- BHV'er: alarm bekijken en reageren (vanaf de pas) ----
export async function alarmVoorBhver(body) {
  const token = await tokenVoorCode(body.code);
  const a = token && (await kv.get(`alarm:${String(body.id || '').slice(0, 30)}`));
  if (!a || !a.ontvangers.some((o) => o.token === token)) return { status: 404, json: { error: 'Alarm niet gevonden.' } };
  if (body.reactie) {
    const status = body.reactie === 'komt' ? 'komt' : 'kan-niet';
    a.reacties[token] = { status, at: new Date().toISOString() };
    await kv.update(`alarm:${a.id}`, a);
  }
  const s = SOORTEN[a.soort] || SOORTEN.overig;
  const komt = Object.values(a.reacties).filter((r) => r.status === 'komt').length;
  return { status: 200, json: {
    ok: true, id: a.id, test: a.test, soort: s.label, icoon: s.icoon, locatie: a.locatie, bericht: a.bericht, at: a.at,
    bedrijf: a.bedrijf, mijnReactie: (a.reacties[token] || {}).status || null, komt, totaal: a.ontvangers.length,
  } };
}

export function pushSleutel() {
  return { status: 200, json: { ok: true, key: VAPID_PUBLIC_KEY, aan: pushIngesteld() } };
}
