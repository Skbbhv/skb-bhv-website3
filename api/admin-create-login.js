// api/admin-create-login.js
// Gebruikt door de beheerpagina (https://www.skbbhv.nl/?admin=1): maakt handmatig een
// persoonlijke examenlink aan voor één deelnemer en mailt die direct, buiten een
// Stripe-bestelling om.
//
// Vereist environment variables:
//   ADMIN_PASSWORD      het beheerderswachtwoord (zelf kiezen, minimaal 12 tekens)
//   KV_REST_API_URL, KV_REST_API_TOKEN   (Vercel KV)
//   RESEND_API_KEY, SITE_URL  (en optioneel FROM_EMAIL)

import crypto from 'crypto';
import { kv } from './_lib/kv.js';
import { Resend } from 'resend';
import { PACKAGE_NAMES, COMPANY_FOOTER_HTML, escapeHtml, isValidEmail, normalizeEmail } from './_lib/accounts.js';

const TTL_SECONDS = 60 * 60 * 24 * 90; // gelijk aan api/participant.js
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD is nog niet ingesteld in Vercel.' });
  }

  try {
    const ip = String(req.headers['x-forwarded-for'] || 'onbekend').split(',')[0].trim();
    const failKey = `adminfail:${ip}`;
    if (((await kv.get(failKey)) || 0) >= 10) {
      return res.status(429).json({ error: 'Te veel mislukte pogingen. Probeer het later opnieuw.' });
    }

    const body = req.body || {};
    if (!safeEqual(body.adminPassword || '', adminPassword)) {
      await kv.incr(failKey);
      await kv.expire(failKey, 15 * 60);
      return res.status(401).json({ error: 'Beheerderswachtwoord klopt niet.' });
    }

    const first = String(body.first || '').trim();
    const last = String(body.last || '').trim();
    const birthdate = String(body.birthdate || '').trim();
    const pkg = PACKAGE_NAMES[body.pkg] ? body.pkg : null;
    const sendToEmail = normalizeEmail(body.sendToEmail);
    if (!first || !last || !birthdate || !pkg || !isValidEmail(sendToEmail)) {
      return res.status(400).json({ error: 'Vul naam, geboortedatum, pakket en een geldig e-mailadres in.' });
    }

    // Zelfde opbouw als api/participant.js (action "create"), zodat de link identiek werkt.
    const token = crypto.randomBytes(9).toString('base64url');
    const record = {
      token, first, last, birthdate, pkg,
      withPasje: !!body.withPasje,
      onLocation: !!body.onLocation,
      buyerEmail: sendToEmail,
      status: 'ready',
      correct: 0, total: 75, pct: 0,
      certNumber: null, pasNumber: null, passDate: null,
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
    };
    await kv.set(`participant:${token}`, record, { ex: TTL_SECONDS });

    const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;
    const link = `${siteUrl}/?p=${token}`;

    let emailSent = false;
    if (resend) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: sendToEmail,
          subject: 'Je persoonlijke link voor het BHV-examen',
          html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111418;">
            <div style="background:#0B1F33;padding:24px 28px;border-radius:12px 12px 0 0;">
              <span style="color:#fff;font-size:22px;font-weight:bold;">SKB BHV</span>
            </div>
            <div style="border:1px solid #E3E6EA;border-top:none;padding:28px;border-radius:0 0 12px 12px;">
              <h2 style="margin-top:0;">Hallo ${escapeHtml(first)},</h2>
              <p>Er staat een BHV-examen voor je klaar: <b>${escapeHtml(PACKAGE_NAMES[pkg])}</b>. Via onderstaande knop start je het examen. De link is persoonlijk en 90 dagen geldig.</p>
              <p style="text-align:center;margin:26px 0;">
                <a href="${link}" style="background:#0A5CA8;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block;">Start mijn examen</a>
              </p>
              <p style="font-size:13px;color:#4A525B;">75 vragen in 5 onderdelen van elk 8 minuten. Met 80% of meer ben je geslaagd.</p>
              <hr style="border:none;border-top:1px solid #E3E6EA;margin:24px 0;">
              <p style="font-size:12px;color:#6B737C;">${COMPANY_FOOTER_HTML}</p>
            </div>
          </div>`,
        });
        emailSent = true;
      } catch (err) {
        console.error('Versturen van examenlink mislukt:', err);
      }
    }

    await kv.del(failKey);
    return res.status(200).json({ ok: true, link, emailSent });
  } catch (err) {
    console.error('admin-create-login error:', err);
    return res.status(500).json({ error: 'Er ging iets mis. Is de database (Vercel KV) gekoppeld?' });
  }
}
