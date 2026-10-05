// api/participant.js
// Beheert unieke, deelbare links per deelnemer, zodat iedereen zijn eigen examen kan maken
// op zijn eigen apparaat — zonder wachtwoord of account.
//
// Acties (POST, JSON { action, ... }):
//   create     { first, last, birthdate, pkg, withPasje, onLocation, buyerEmail, email? }
//              → { token, emailSent }
//              Is er een e-mailadres van de deelnemer meegegeven én is de besteller ingelogd
//              (Authorization: Bearer <sessie>), dan wordt de examenlink direct gemaild.
//   update     { token, ...velden }            → { ok }
//   send-link  { token } + Bearer (besteller)  → { ok, emailSent }   (link opnieuw mailen)
// GET ?token=… → gegevens van de deelnemer
//
// Vereist: REDIS_URL (of Redis_REDIS_URL); voor e-mail RESEND_API_KEY, FROM_EMAIL, SITE_URL.

import crypto from 'crypto';
import { kv } from './_lib/kv.js';
import { Resend } from 'resend';
import {
  getSessionEmail, isValidEmail, normalizeEmail, escapeHtml, PACKAGE_NAMES, COMPANY_FOOTER_HTML,
} from './_lib/accounts.js';

const TTL_SECONDS = 60 * 60 * 24 * 90; // links blijven 90 dagen geldig
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';

function randomToken() {
  return crypto.randomBytes(9).toString('base64url');
}

async function sendExamLinkEmail(record, req) {
  if (!resend || !record.email) return false;
  const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;
  const link = `${siteUrl}/?p=${record.token}`;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: record.email,
      subject: 'Je persoonlijke link voor het BHV-examen',
      html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111418;">
        <div style="background:#0B1F33;padding:24px 28px;border-radius:12px 12px 0 0;">
          <span style="color:#fff;font-size:22px;font-weight:bold;">SKB BHV</span>
        </div>
        <div style="border:1px solid #E3E6EA;border-top:none;padding:28px;border-radius:0 0 12px 12px;">
          <h2 style="margin-top:0;">Hallo ${escapeHtml(record.first)},</h2>
          <p>Er staat een BHV-examen voor je klaar: <b>${escapeHtml(PACKAGE_NAMES[record.pkg] || 'BHV-examen')}</b>. Via onderstaande knop start je het examen. De link is persoonlijk en 90 dagen geldig.</p>
          <p style="text-align:center;margin:26px 0;">
            <a href="${link}" style="background:#0A5CA8;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block;">Start mijn examen</a>
          </p>
          <p style="font-size:13px;color:#4A525B;">75 vragen in 5 onderdelen van elk 8 minuten. Met 80% of meer ben je geslaagd. Je kunt tussendoor stoppen en later via dezelfde link verdergaan.</p>
          <hr style="border:none;border-top:1px solid #E3E6EA;margin:24px 0;">
          <p style="font-size:12px;color:#6B737C;">${COMPANY_FOOTER_HTML}</p>
        </div>
      </div>`,
    });
    return true;
  } catch (err) {
    console.error('Versturen van examenlink mislukt:', err);
    return false;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.action === 'create') {
        const { first, last, birthdate, pkg, withPasje, onLocation, buyerEmail } = body;
        if (!first || !last || !birthdate || !pkg) {
          return res.status(400).json({ error: 'Naam, geboortedatum en pakket zijn verplicht.' });
        }
        const email = normalizeEmail(body.email);
        if (email && !isValidEmail(email)) {
          return res.status(400).json({ error: 'Het e-mailadres van de deelnemer klopt niet.' });
        }
        // Alleen een ingelogde besteller mag de site een e-mail laten versturen.
        const sessionEmail = email ? await getSessionEmail(req) : null;

        const token = randomToken();
        const record = {
          token,
          first, last, birthdate, pkg,
          email: email || '',
          withPasje: !!withPasje,
          onLocation: !!onLocation,
          buyerEmail: sessionEmail || buyerEmail || '',
          status: 'ready', // ready -> in-progress -> passed / failed
          correct: 0, total: 75, pct: 0,
          certNumber: null, pasNumber: null, passDate: null,
          createdAt: new Date().toISOString(),
        };
        await kv.set(`participant:${token}`, record, { ex: TTL_SECONDS });

        const emailSent = sessionEmail ? await sendExamLinkEmail(record, req) : false;
        return res.status(200).json({ token, emailSent });
      }

      if (body.action === 'send-link') {
        const sessionEmail = await getSessionEmail(req);
        if (!sessionEmail) return res.status(401).json({ error: 'Log opnieuw in om de link te mailen.' });
        const record = body.token ? await kv.get(`participant:${body.token}`) : null;
        if (!record) return res.status(404).json({ error: 'Deelnemer niet gevonden of link verlopen.' });
        if (normalizeEmail(record.buyerEmail) !== sessionEmail) {
          return res.status(403).json({ error: 'Deze deelnemer hoort niet bij jouw bestelling.' });
        }
        if (!record.email) return res.status(400).json({ error: 'Er is geen e-mailadres bekend voor deze deelnemer.' });
        const emailSent = await sendExamLinkEmail(record, req);
        return res.status(200).json({ ok: true, emailSent });
      }

      if (body.action === 'update') {
        const { token, ...updates } = body;
        if (!token) return res.status(400).json({ error: 'Token ontbreekt.' });
        const existing = await kv.get(`participant:${token}`);
        if (!existing) return res.status(404).json({ error: 'Deelnemer niet gevonden of link verlopen.' });
        delete updates.action;
        delete updates.buyerEmail; // de besteller kan niet via een update worden gewijzigd
        delete updates.email;
        const updated = { ...existing, ...updates };
        await kv.set(`participant:${token}`, updated, { ex: TTL_SECONDS });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Onbekende actie.' });
    }

    if (req.method === 'GET') {
      const { token } = req.query;
      if (!token) return res.status(400).json({ error: 'Token ontbreekt.' });
      const record = await kv.get(`participant:${token}`);
      if (!record) return res.status(404).json({ error: 'Deelnemer niet gevonden of link verlopen.' });
      return res.status(200).json(record);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('participant API error:', err);
    return res.status(500).json({ error: 'Er ging iets mis. Is de database gekoppeld?' });
  }
}
