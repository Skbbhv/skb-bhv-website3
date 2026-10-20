// api/send-certificate-email.js
// Wordt aangeroepen door de website zodra een deelnemer slaagt (80% of hoger).
// Stuurt een felicitatiemail met de examengegevens en een link om het certificaat
// (en eventueel BHV-pasje) te downloaden vanuit het dashboard.
//
// Beveiliging: de client stuurt alleen { token }. Alle gegevens (naam, score, nummers en
// het e-mailadres) komen uit het deelnemersrecord in de database. Er wordt alleen gemaild
// als de deelnemer server-side geslaagd is, en maximaal MAX_MAILS keer per deelnemer.
//
// Let op: het certificaat/pasje zelf wordt in de browser van de klant getekend (canvas),
// dus deze mail bevat geen bijlage met de afbeelding — alleen de gegevens en een link
// terug naar de site om het zelf te downloaden.
//
// Vereist environment variables: RESEND_API_KEY, SITE_URL (en optioneel FROM_EMAIL, NOTIFY_EMAIL)

import { Resend } from 'resend';
import { kv } from './_lib/kv.js';
import { COMPANY_FOOTER_HTML, PACKAGE_NAMES, escapeHtml, isValidEmail, normalizeEmail } from './_lib/accounts.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'info@skbbhv.nl';
const MAX_MAILS = 3;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = String((req.body || {}).token || '').trim().slice(0, 40);
    if (!token) return res.status(400).json({ error: 'Token ontbreekt.' });

    const key = `participant:${token}`;
    const record = await kv.get(key);
    if (!record) return res.status(404).json({ error: 'Deelnemer niet gevonden of link verlopen.' });
    if (record.status !== 'passed' || !record.certNumber) {
      return res.status(403).json({ error: 'Er is (nog) geen geslaagd examen voor deze deelnemer.' });
    }

    const recipients = [...new Set([record.buyerEmail, record.email].map(normalizeEmail))].filter(isValidEmail);
    if (!recipients.length) return res.status(400).json({ error: 'Er is geen e-mailadres bekend voor deze deelnemer.' });

    // Teller per deelnemer: maximaal MAX_MAILS keer versturen.
    const countKey = `certmail:${token}`;
    const count = await kv.incr(countKey);
    if (count === 1) await kv.expire(countKey, 60 * 60 * 24 * 365 * 2);
    if (count > MAX_MAILS) {
      return res.status(429).json({ sent: false, error: 'De certificaatmail is al verstuurd.' });
    }

    if (!resend) {
      console.warn('RESEND_API_KEY ontbreekt — certificaatmail wordt overgeslagen.');
      return res.status(200).json({ sent: false, reason: 'E-mail is niet geconfigureerd.' });
    }

    const siteUrl = process.env.SITE_URL || 'https://www.skbbhv.nl';
    const pkgName = PACKAGE_NAMES[record.pkg] || 'BHV-examen';
    const pasNumber = record.pasNumber || null;
    const certLink = `${siteUrl}/?p=${encodeURIComponent(token)}`;

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#12161B;">
      <div style="background:#12161B;padding:24px 28px;border-radius:12px 12px 0 0;">
        <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:0.5px;">SKB BHV</span>
      </div>
      <div style="border:1px solid #E1E4E9;border-top:none;padding:28px;border-radius:0 0 12px 12px;">
        <h2 style="margin-top:0;color:#00953C;">Gefeliciteerd, ${escapeHtml(record.first)}! 🎉</h2>
        <p>Je bent geslaagd voor je BHV-examen (${escapeHtml(pkgName)}) met een score van <b>${escapeHtml(record.pct)}%</b> (${escapeHtml(record.correct)} van de ${escapeHtml(record.total)} vragen goed).</p>
        <table style="width:100%;margin:20px 0;font-size:14px;">
          <tr><td style="padding:6px 0;color:#4B535C;">Certificaatnummer</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${escapeHtml(record.certNumber)}</td></tr>
          ${pasNumber ? `<tr><td style="padding:6px 0;color:#4B535C;">Pasnummer</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${escapeHtml(pasNumber)}</td></tr>` : ''}
        </table>
        ${pasNumber ? '<p>Je fysieke <b>BHV-pasje</b> wordt per post naar je verstuurd. Een digitale versie staat al in je omgeving.</p>' : ''}
        <p>Download je certificaat${pasNumber ? ' en digitale BHV-pasje' : ''} via je omgeving:</p>
        <p style="text-align:center;margin:26px 0;">
          <a href="${certLink}" style="background:#0A5CA8;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block;">Naar mijn certificaat</a>
        </p>
        <hr style="border:none;border-top:1px solid #E1E4E9;margin:24px 0;">
        <p style="font-size:12px;color:#8b939b;">
          ${COMPANY_FOOTER_HTML}
        </p>
      </div>
    </div>`;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      bcc: NOTIFY_EMAIL,
      subject: 'Gefeliciteerd — je bent geslaagd voor je BHV-examen!',
      html,
    });

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('Versturen van certificaatmail mislukt:', err);
    return res.status(500).json({ error: 'Kon de e-mail niet versturen.' });
  }
}
