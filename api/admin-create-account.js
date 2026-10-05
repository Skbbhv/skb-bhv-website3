// api/admin-create-account.js
// Beheerpagina (https://www.skbbhv.nl/?admin=1): maakt handmatig een klantaccount met
// bestelling aan, bijvoorbeeld als de klant contant of per bankoverschrijving heeft betaald.
// De klant kan daarna inloggen op "Mijn omgeving", deelnemers invullen en de cursusvragen maken.
//
// - Bestaat er nog geen account met dit e-mailadres: er wordt een account aangemaakt en de
//   inloggegevens worden gemaild (en in het antwoord teruggegeven, zodat de beheerder ze ook
//   direct kan doorgeven).
// - Bestaat het account al: de bestelling wordt eraan toegevoegd en de klant krijgt een mail
//   dat hij met zijn bestaande gegevens kan inloggen.
//
// Vereist environment variables: ADMIN_PASSWORD, REDIS_URL (of Redis_REDIS_URL),
// RESEND_API_KEY, FROM_EMAIL, SITE_URL

import crypto from 'crypto';
import { kv } from './_lib/kv.js';
import { checkAdmin } from './_lib/admin.js';
import { Resend } from 'resend';
import {
  PACKAGE_NAMES, COMPANY_FOOTER_HTML, escapeHtml, isValidEmail, normalizeEmail,
  generatePassword, hashPassword, sendCredentialsEmail,
} from './_lib/accounts.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';

// Zelfde prijzen als api/create-checkout-session.js
const PRICES = { basis: 79, herhaling: 49, combi: 179 };
const PASJE_PRICE = 12.5;
const LOCATION_SURCHARGE = 395;
function getDiscountRate(qty) {
  if (qty >= 25) return 0.10;
  if (qty >= 10) return 0.05;
  return 0;
}

const PAYMENT_LABELS = { contant: 'Contant', overboeking: 'Bankoverschrijving', pin: 'Pin', anders: 'Anders' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  try {
    const body = req.body || {};
    const denied = await checkAdmin(req, body);
    if (denied) return res.status(denied.status).json({ error: denied.error });
    const first = String(body.first || '').trim();
    const last = String(body.last || '').trim();
    const company = String(body.company || '').trim();
    const email = normalizeEmail(body.email);
    const pkg = PACKAGE_NAMES[body.pkg] ? body.pkg : null;
    const qty = Math.min(50, Math.max(1, parseInt(body.qty, 10) || 1));
    const withPasje = !!body.withPasje;
    const onLocation = !!body.onLocation;
    const paymentMethod = PAYMENT_LABELS[body.paymentMethod] ? body.paymentMethod : 'contant';

    if (!first || !last || !pkg || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Vul voornaam, achternaam, een geldig e-mailadres en het pakket in.' });
    }

    // Bedrag berekenen zoals bij een online bestelling
    const discount = getDiscountRate(qty);
    const unitPrice = Math.round(PRICES[pkg] * (1 - discount) * 100) / 100;
    let total = unitPrice * qty;
    if (withPasje) total += PASJE_PRICE * qty;
    if (onLocation) total += LOCATION_SURCHARGE;
           const subtotalEx = Math.round(total * 100) / 100;
       const vat = Math.round(subtotalEx * 0.21 * 100) / 100;
       total = Math.round((subtotalEx + vat) * 100) / 100;

    // 1) Bestelling vastleggen
    const orderId = `handmatig_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const orderRecord = {
      id: orderId,
      email,
      createdAt: new Date().toISOString(),
      order: { pkg, qty, withPasje, onLocation, locationRequest: null, total, paymentMethod },
      buyer: { first, last, email, company },
      roster: null,
      invoiceNumber: null,
      nextPasNummer: null,
      createdBy: 'admin',
    };
    await kv.set(`order:${orderId}`, orderRecord);
    await kv.sadd(`account-orders:${email}`, orderId);

    // 2) Account aanmaken of bestaand account gebruiken
    const existing = await kv.get(`account:${email}`);
    let created = false;
    let password = null;
    let emailSent = false;

    if (!existing) {
      password = generatePassword();
      const { hash, salt } = hashPassword(password);
      const account = {
        email, first, last, company,
        passHash: hash, passSalt: salt,
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
      };
      await kv.set(`account:${email}`, account);
      created = true;
      emailSent = await sendCredentialsEmail(account, password, 'new');
    } else {
      emailSent = await sendExistingAccountEmail(existing, pkg, qty);
    }

    return res.status(200).json({
      ok: true,
      created,
      email,
      password, // alleen gevuld bij een nieuw account
      emailSent,
      total,
      orderId,
    });
  } catch (err) {
    console.error('admin-create-account error:', err);
    return res.status(500).json({ error: 'Er ging iets mis. Is de database gekoppeld?' });
  }
}

async function sendExistingAccountEmail(account, pkg, qty) {
  if (!resend) return false;
  const siteUrl = process.env.SITE_URL || 'https://www.skbbhv.nl';
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: account.email,
      subject: 'Je nieuwe bestelling staat klaar in Mijn omgeving',
      html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111418;">
        <div style="background:#0B1F33;padding:24px 28px;border-radius:12px 12px 0 0;">
          <span style="color:#fff;font-size:22px;font-weight:bold;">SKB BHV</span>
        </div>
        <div style="border:1px solid #E3E6EA;border-top:none;padding:28px;border-radius:0 0 12px 12px;">
          <h2 style="margin-top:0;">Hallo ${escapeHtml(account.first || '')},</h2>
          <p>Bedankt voor je betaling. Je bestelling <b>${escapeHtml(PACKAGE_NAMES[pkg])} × ${qty}</b> is toegevoegd aan je omgeving. Log in met je bestaande e-mailadres en wachtwoord om de deelnemers in te vullen en de cursusvragen te starten.</p>
          <p style="text-align:center;margin:26px 0;">
            <a href="${siteUrl}/?login=1" style="background:#0A5CA8;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block;">Inloggen op Mijn omgeving</a>
          </p>
          <p style="font-size:13px;color:#4A525B;">Wachtwoord vergeten? Klik op de inlogpagina op "Wachtwoord vergeten?".</p>
          <hr style="border:none;border-top:1px solid #E3E6EA;margin:24px 0;">
          <p style="font-size:12px;color:#6B737C;">${COMPANY_FOOTER_HTML}</p>
        </div>
      </div>`,
    });
    return true;
  } catch (err) {
    console.error('Versturen van bestelmail mislukt:', err);
    return false;
  }
}
