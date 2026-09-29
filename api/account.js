// api/account.js
// Inloggen op "Mijn omgeving" en het bewaren van de bestelling van de ingelogde klant.
//
// Alle verzoeken zijn POST met JSON { action, ... }. Acties:
//   login            { email, password }             → { token, account, orders }
//   me               (Authorization: Bearer <token>)  → { account, orders }
//   logout           (Authorization: Bearer <token>)  → { ok }
//   forgot           { email }                        → { ok }  (mailt een nieuw wachtwoord)
//   change-password  { current, next } + Bearer      → { ok }
//   save-order       { orderId, roster, invoiceNumber, nextPasNummer } + Bearer → { ok }
//
// Vereist: Vercel KV gekoppeld (KV_REST_API_URL, KV_REST_API_TOKEN) en voor e-mail RESEND_API_KEY.

import { kv } from './_lib/kv.js';
import {
  normalizeEmail, isValidEmail, getAccount, verifyPassword, createSession, getBearerToken,
  getSessionEmail, publicAccount, getOrdersForEmail, generatePassword, setNewPassword,
  sendCredentialsEmail,
} from './_lib/accounts.js';

const MAX_LOGIN_FAILS = 10;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const body = req.body || {};
  try {
    switch (body.action) {
      case 'login': return await login(body, res);
      case 'me': return await me(req, res);
      case 'logout': return await logout(req, res);
      case 'forgot': return await forgot(body, res);
      case 'change-password': return await changePassword(req, body, res);
      case 'save-order': return await saveOrder(req, body, res);
      default: return res.status(400).json({ error: 'Onbekende actie.' });
    }
  } catch (err) {
    console.error('account API error:', err);
    return res.status(500).json({ error: 'Er ging iets mis. Probeer het later opnieuw.' });
  }
}

async function login(body, res) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!email || !password) {
    return res.status(400).json({ error: 'Vul je e-mailadres en wachtwoord in.' });
  }

  const failKey = `loginfail:${email}`;
  const fails = (await kv.get(failKey)) || 0;
  if (fails >= MAX_LOGIN_FAILS) {
    return res.status(429).json({ error: 'Te veel mislukte pogingen. Probeer het over 15 minuten opnieuw of vraag een nieuw wachtwoord aan.' });
  }

  const account = await getAccount(email);
  if (!account || !verifyPassword(password, account)) {
    await kv.incr(failKey);
    await kv.expire(failKey, 15 * 60);
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
  const generic = { ok: true, message: 'Als dit e-mailadres bij ons bekend is, ontvang je binnen enkele minuten een nieuw wachtwoord.' };
  if (!email || !isValidEmail(email)) return res.status(200).json(generic);

  const allowed = await kv.set(`forgot:${email}`, 1, { nx: true, ex: 5 * 60 });
  if (!allowed) return res.status(200).json(generic);

  const account = await getAccount(email);
  if (account) {
    const newPassword = generatePassword();
    await setNewPassword(email, newPassword);
    await sendCredentialsEmail(account, newPassword, 'reset');
    await kv.del(`loginfail:${email}`);
  }
  return res.status(200).json(generic);
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
  const roster = Array.isArray(body.roster) ? body.roster.slice(0, qty) : record.roster;
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
  return res.status(200).json({ ok: true });
}
