// api/account.js
// Inloggen op "Mijn omgeving" en het bewaren van de bestelling van de ingelogde klant.
//
// Alle verzoeken zijn POST met JSON { action, ... }. Acties:
//   login            { email, password }             → { token, account, orders }
//   me               (Authorization: Bearer <token>)  → { account, orders }
//   logout           (Authorization: Bearer <token>)  → { ok }
//   forgot           { email }                        → { ok }  (mailt een eenmalige resetlink, 30 min geldig)
//   reset            { token, password }              → { ok }  (nieuw wachtwoord via die link)
//   change-password  { current, next } + Bearer      → { ok }
//   save-order       { orderId, roster, invoiceNumber, nextPasNummer } + Bearer → { ok }
//
// Vereist: Vercel KV gekoppeld (KV_REST_API_URL, KV_REST_API_TOKEN) en voor e-mail RESEND_API_KEY.

import crypto from 'crypto';
import { kv } from './_lib/kv.js';
import {
  normalizeEmail, isValidEmail, getAccount, verifyPassword, createSession, getBearerToken,
  getSessionEmail, publicAccount, getOrdersForEmail, setNewPassword, sendResetLinkEmail,
} from './_lib/accounts.js';

const MAX_LOGIN_FAILS = 10;      // per e-mailadres per 15 minuten
const MAX_LOGIN_FAILS_IP = 30;   // per internetadres per 15 minuten
const RESET_TTL = 30 * 60;       // resetlink 30 minuten geldig

function clientIp(req) {
  // Vercel zet x-forwarded-for / x-real-ip zelf (niet door de bezoeker te vervalsen).
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'onbekend').split(',')[0].trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const body = req.body || {};
  try {
    switch (body.action) {
      case 'login': return await login(req, body, res);
      case 'me': return await me(req, res);
      case 'logout': return await logout(req, res);
      case 'forgot': return await forgot(body, res);
      case 'reset': return await resetPassword(body, res);
      case 'change-password': return await changePassword(req, body, res);
      case 'save-order': return await saveOrder(req, body, res);
      default: return res.status(400).json({ error: 'Onbekende actie.' });
    }
  } catch (err) {
    console.error('account API error:', err);
    return res.status(500).json({ error: 'Er ging iets mis. Probeer het later opnieuw.' });
  }
}

async function login(req, body, res) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!email || !password) {
    return res.status(400).json({ error: 'Vul je e-mailadres en wachtwoord in.' });
  }

  const failKey = `loginfail:${email}`;
  const ipFailKey = `loginfail-ip:${clientIp(req)}`;
  const fails = (await kv.get(failKey)) || 0;
  const ipFails = (await kv.get(ipFailKey)) || 0;
  if (fails >= MAX_LOGIN_FAILS || ipFails >= MAX_LOGIN_FAILS_IP) {
    return res.status(429).json({ error: 'Te veel mislukte pogingen. Probeer het over 15 minuten opnieuw of vraag een nieuw wachtwoord aan.' });
  }

  const account = await getAccount(email);
  if (!account || !verifyPassword(password, account)) {
    for (const key of [failKey, ipFailKey]) {
      const n = await kv.incr(key);
      if (n === 1) await kv.expire(key, 15 * 60);
    }
    return res.status(401).json({ error: 'E-mailadres of wachtwoord klopt niet.' });
  }

  await kv.del(failKey);
  const token = await createSession(account.email);
  const orders = await getOrdersForEmail(account.email);
  return res.status(200).json({ token, account: publicAccount(account), orders });
}

async function me(req, res) {
  const email = await getSessionEmail(req);
  if (!email) return res.status(401).json({ error: 'Niet ingelogd.' });
  const account = await getAccount(email);
  if (!account) return res.status(401).json({ error: 'Niet ingelogd.' });
  const orders = await getOrdersForEmail(email);
  return res.status(200).json({ account: publicAccount(account), orders });
}

async function logout(req, res) {
  const token = getBearerToken(req);
  if (token) await kv.del(`sess:${token}`);
  return res.status(200).json({ ok: true });
}

async function forgot(body, res) {
  const email = normalizeEmail(body.email);
  // Altijd hetzelfde antwoord, zodat niet te achterhalen is welke e-mailadressen een account hebben.
  const generic = { ok: true, message: 'Als dit e-mailadres bij ons bekend is, ontvang je binnen enkele minuten een e-mail met een link om een nieuw wachtwoord in te stellen. De link is 30 minuten geldig.' };
  if (!email || !isValidEmail(email)) return res.status(200).json(generic);

  const allowed = await kv.set(`forgot:${email}`, 1, { nx: true, ex: 5 * 60 });
  if (!allowed) return res.status(200).json(generic);

  const account = await getAccount(email);
  if (account) {
    // Het wachtwoord blijft ongewijzigd tot de klant via de link zelf een nieuw kiest.
    const token = crypto.randomBytes(32).toString('hex');
    await kv.set(`pwreset:${token}`, account.email, { ex: RESET_TTL });
    await sendResetLinkEmail(account, token);
  }
  return res.status(200).json(generic);
}

async function resetPassword(body, res) {
  const token = String(body.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: 'Deze resetlink is ongeldig of verlopen. Vraag een nieuwe aan.' });
  }
  const next = String(body.password || '');
  if (next.length < 8) {
    return res.status(400).json({ error: 'Kies een nieuw wachtwoord van minimaal 8 tekens.' });
  }
  const key = `pwreset:${token}`;
  const email = await kv.get(key);
  if (!email) return res.status(400).json({ error: 'Deze resetlink is ongeldig of verlopen. Vraag een nieuwe aan.' });
  await kv.del(key); // eenmalig
  const ok = await setNewPassword(email, next);
  if (!ok) return res.status(400).json({ error: 'Deze resetlink is ongeldig of verlopen. Vraag een nieuwe aan.' });
  await kv.del(`loginfail:${email}`);
  return res.status(200).json({ ok: true, email });
}

async function changePassword(req, body, res) {
  const email = await getSessionEmail(req);
  if (!email) return res.status(401).json({ error: 'Niet ingelogd.' });
  const account = await getAccount(email);
  if (!account || !verifyPassword(String(body.current || ''), account)) {
    return res.status(400).json({ error: 'Je huidige wachtwoord klopt niet.' });
  }
  const next = String(body.next || '');
  if (next.length < 8) {
    return res.status(400).json({ error: 'Kies een nieuw wachtwoord van minimaal 8 tekens.' });
  }
  await setNewPassword(email, next);
  return res.status(200).json({ ok: true });
}

// Bewaart alleen de voortgang (deelnemers, factuurnummer, pasnummer). Pakket, aantal en
// bedrag komen uit Stripe en kunnen hier niet worden aangepast.
async function saveOrder(req, body, res) {
  const email = await getSessionEmail(req);
  if (!email) return res.status(401).json({ error: 'Niet ingelogd.' });

  const orderId = String(body.orderId || '');
  const key = `order:${orderId}`;
  const record = orderId ? await kv.get(key) : null;
  if (!record || record.email !== email) {
    return res.status(404).json({ error: 'Bestelling niet gevonden.' });
  }

  const qty = (record.order && record.order.qty) || 1;
  const roster = Array.isArray(body.roster)
    ? await sanitizeRoster(body.roster.slice(0, qty), record.roster, email)
    : record.roster;
  const updated = {
    ...record,
    roster,
    invoiceNumber: body.invoiceNumber || record.invoiceNumber || null,
    nextPasNummer: body.nextPasNummer || record.nextPasNummer || null,
    updatedAt: new Date().toISOString(),
  };
  const size = JSON.stringify(updated).length;
  if (size > 200000) return res.status(413).json({ error: 'Bestelling te groot om op te slaan.' });

  await kv.set(key, updated);
  return res.status(200).json({ ok: true, roster });
}

// Uitslag en certificaatgegevens komen nooit van de client: ze worden overgenomen uit het
// deelnemersrecord (server-side nagekeken), of uit de eerder bewaarde lijst als die link al
// verlopen is. Anders kan een deelnemer in de lijst niet op 'geslaagd' staan.
const RESULT_FIELDS = ['status', 'correct', 'total', 'pct', 'certNumber', 'pasNumber', 'passDate'];

async function sanitizeRoster(roster, previous, email) {
  const prev = Array.isArray(previous) ? previous : [];
  return Promise.all(roster.map(async (entry, i) => {
    if (!entry || typeof entry !== 'object') return null;
    const e = { ...entry };
    let source = null;
    if (e.token) {
      const rec = await kv.get(`participant:${String(e.token).slice(0, 40)}`);
      if (rec && normalizeEmail(rec.buyerEmail) === email) source = rec;
    }
    if (!source) {
      const old = prev.find((p) => p && e.token && p.token === e.token) || prev[i];
      if (old && old.status === 'passed' && (old.token || null) === (e.token || null)) source = old;
    }
    if (source) {
      for (const f of RESULT_FIELDS) e[f] = source[f] ?? null;
    } else {
      if (e.status === 'passed') e.status = 'ready';
      e.certNumber = null; e.pasNumber = null; e.passDate = null;
    }
    return e;
  }));
}
