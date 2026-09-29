// api/_lib/accounts.js
// Gedeelde logica voor klantaccounts van "Mijn omgeving".
// Bestanden in een map die met "_" begint worden door Vercel NIET als losse API-route
// gepubliceerd; ze worden alleen meegebundeld door de routes die ze importeren.
//
// Opslag in Vercel KV (dezelfde database als api/participant.js):
//   account:<email>          → { email, first, last, company, passHash, passSalt, createdAt }
//   account-orders:<email>   → set met Stripe checkout-sessie-id's van deze klant
//   order:<sessionId>        → { id, email, createdAt, order, buyer, roster, invoiceNumber, nextPasNummer }
//   sess:<token>             → email (inlogsessie, 30 dagen geldig)
//   loginfail:<email>        → teller mislukte inlogpogingen (15 minuten)
//   forgot:<email>           → blokkeert 'wachtwoord vergeten' 5 minuten na een verzoek

import crypto from 'crypto';
import { kv } from './kv.js';
import { Resend } from 'resend';

export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 dagen ingelogd blijven
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';

export const PACKAGE_NAMES = {
  basis: 'BHV Basisexamen',
  herhaling: 'BHV Herhaling',
  combi: 'BHV Theorie + Praktijk',
};

export const COMPANY_FOOTER_HTML =
  'SKB BHV — onderdeel van Oibase B.V.<br>Goordelaan 19, 9591 CB Onstwedde · KVK 42117378<br>Vragen? Mail info@skbbhv.nl';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Leesbaar wachtwoord zonder verwarrende tekens (geen 0/O, 1/l/I).
export function generatePassword(length = 10) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, account) {
  if (!account || !account.passHash || !account.passSalt) return false;
  const { hash } = hashPassword(password, account.passSalt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(account.passHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function createSession(email) {
  const token = crypto.randomBytes(32).toString('hex');
  await kv.set(`sess:${token}`, email, { ex: SESSION_TTL });
  return token;
}

export function getBearerToken(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer\s+([a-f0-9]{64})$/i);
  return match ? match[1] : null;
}

// Geeft het e-mailadres van de ingelogde klant terug, of null.
export async function getSessionEmail(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const email = await kv.get(`sess:${token}`);
  return email || null;
}

export async function getAccount(email) {
  return await kv.get(`account:${normalizeEmail(email)}`);
}

export function publicAccount(account) {
  if (!account) return null;
  return {
    email: account.email,
    first: account.first || '',
    last: account.last || '',
    company: account.company || '',
  };
}

// Alle bestellingen van een klant, nieuwste eerst.
export async function getOrdersForEmail(email) {
  const ids = (await kv.smembers(`account-orders:${normalizeEmail(email)}`)) || [];
  if (!ids.length) return [];
  const orders = await Promise.all(ids.map((id) => kv.get(`order:${id}`)));
  return orders
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Zet de geverifieerde Stripe-sessie om naar een bestelling in de database, en maakt
// zo nodig een account aan. Veilig om vaker aan te roepen (webhook én terugkeer van
// de klant): de bestelling en het account worden maar één keer aangemaakt.
// Geeft { email, created, password, orderRecord } terug; password alleen als het
// account in DEZE aanroep is aangemaakt.
export async function ensureAccountForStripeSession(session) {
  const meta = session.metadata || {};
  const email = normalizeEmail(meta.buyerEmail || session.customer_email);
  if (!email) return { email: null, created: false, password: null, orderRecord: null };

  // 1) Bestelling vastleggen (alleen de eerste keer)
  const orderKey = `order:${session.id}`;
  let orderRecord = await kv.get(orderKey);
  if (!orderRecord) {
    let locationRequest = null;
    if (meta.locationRequest) {
      try { locationRequest = JSON.parse(meta.locationRequest); } catch (e) { /* negeren */ }
    }
    const candidate = {
      id: session.id,
      email,
      createdAt: new Date((session.created || Date.now() / 1000) * 1000).toISOString(),
      order: {
        pkg: meta.pkg,
        qty: parseInt(meta.qty, 10) || 1,
        withPasje: meta.withPasje === 'true',
        onLocation: meta.onLocation === 'true',
        locationRequest,
        total: (session.amount_total || 0) / 100,
      },
      buyer: {
        first: meta.buyerFirst || '',
        last: meta.buyerLast || '',
        email,
        company: meta.buyerCompany || '',
      },
      roster: null, // wordt door de website gevuld zodra de klant deelnemers invult
      invoiceNumber: null,
      nextPasNummer: null,
    };
    const ok = await kv.set(orderKey, candidate, { nx: true });
    orderRecord = ok ? candidate : await kv.get(orderKey);
  }
  await kv.sadd(`account-orders:${email}`, session.id);

  // 2) Account aanmaken als het nog niet bestaat
  let created = false;
  let password = null;
  const existing = await kv.get(`account:${email}`);
  if (!existing) {
    const newPassword = generatePassword();
    const { hash, salt } = hashPassword(newPassword);
    const account = {
      email,
      first: meta.buyerFirst || '',
      last: meta.buyerLast || '',
      company: meta.buyerCompany || '',
      passHash: hash,
      passSalt: salt,
      createdAt: new Date().toISOString(),
    };
    const ok = await kv.set(`account:${email}`, account, { nx: true });
    if (ok) {
      created = true;
      password = newPassword;
      await sendCredentialsEmail(account, newPassword, 'new');
    }
  }

  return { email, created, password, orderRecord };
}

export async function setNewPassword(email, newPassword) {
  const account = await getAccount(email);
  if (!account) return false;
  const { hash, salt } = hashPassword(newPassword);
  await kv.set(`account:${account.email}`, { ...account, passHash: hash, passSalt: salt });
  return true;
}

// kind: 'new' (na bestelling) of 'reset' (wachtwoord vergeten)
export async function sendCredentialsEmail(account, password, kind) {
  if (!resend) {
    console.warn('RESEND_API_KEY ontbreekt — mail met inloggegevens wordt overgeslagen.');
    return false;
  }
  const siteUrl = process.env.SITE_URL || 'https://www.skbbhv.nl';
  const intro = kind === 'reset'
    ? 'Je hebt een nieuw wachtwoord aangevraagd voor Mijn omgeving. Hieronder staan je nieuwe inloggegevens.'
    : 'Bedankt voor je bestelling. Er is een persoonlijke omgeving voor je aangemaakt. Daar vul je de deelnemers in, start je de cursusvragen en download je certificaten en facturen.';
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111418;">
    <div style="background:#0B1F33;padding:24px 28px;border-radius:12px 12px 0 0;">
      <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:0.5px;">SKB BHV</span>
    </div>
    <div style="border:1px solid #E3E6EA;border-top:none;padding:28px;border-radius:0 0 12px 12px;">
      <h2 style="margin-top:0;">Je inloggegevens voor Mijn omgeving</h2>
      <p>Hallo ${escapeHtml(account.first || '')},</p>
      <p>${intro}</p>
      <table style="width:100%;margin:20px 0;font-size:15px;background:#F5F6F8;border-radius:8px;">
        <tr><td style="padding:12px 16px;color:#4A525B;">E-mailadres</td><td style="padding:12px 16px;font-weight:bold;">${escapeHtml(account.email)}</td></tr>
        <tr><td style="padding:12px 16px;color:#4A525B;">Wachtwoord</td><td style="padding:12px 16px;font-weight:bold;font-family:monospace;font-size:17px;">${escapeHtml(password)}</td></tr>
      </table>
      <p style="text-align:center;margin:26px 0;">
        <a href="${siteUrl}/?login=1" style="background:#0A5CA8;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block;">Inloggen op Mijn omgeving</a>
      </p>
      <p style="font-size:13px;color:#4A525B;">Tip: wijzig je wachtwoord na het inloggen via "Wachtwoord wijzigen".</p>
      <hr style="border:none;border-top:1px solid #E3E6EA;margin:24px 0;">
      <p style="font-size:12px;color:#6B737C;">${COMPANY_FOOTER_HTML}</p>
    </div>
  </div>`;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: account.email,
      subject: kind === 'reset' ? 'Je nieuwe wachtwoord voor SKB BHV' : 'Je inloggegevens voor SKB BHV',
      html,
    });
    return true;
  } catch (err) {
    console.error('Versturen van inloggegevens mislukt:', err);
    return false;
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
