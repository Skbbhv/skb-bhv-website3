// api/send-certificate-email.js
// Wordt aangeroepen door de website zodra een deelnemer slaagt (80% of hoger).
// Stuurt een felicitatiemail met de examengegevens en een link om het certificaat
// (en eventueel BHV-pasje) te downloaden vanuit het dashboard.
//
// Let op: het certificaat/pasje zelf wordt in de browser van de klant getekend (canvas),
// dus deze mail bevat geen bijlage met de afbeelding — alleen de gegevens en een link
// terug naar de site om het zelf te downloaden.
//
// Vereist environment variables: RESEND_API_KEY, SITE_URL (en optioneel FROM_EMAIL, NOTIFY_EMAIL)

import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'info@skbbhv.nl';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!resend) {
    console.warn('RESEND_API_KEY ontbreekt — certificaatmail wordt overgeslagen.');
    return res.status(200).json({ sent: false, reason: 'E-mail is niet geconfigureerd.' });
  }

  try {
    const { email, first, last, pkgName, pct, correct, total, certNumber, pasNumber } = req.body || {};
    if (!email || !first) {
      return res.status(400).json({ error: 'Naam en e-mailadres zijn verplicht.' });
    }

    const siteUrl = process.env.SITE_URL || `${req.headers.origin || ''}`;

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#12161B;">
      <div style="background:#12161B;padding:24px 28px;border-radius:12px 12px 0 0;">
        <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:0.5px;">SKB BHV</span>
      </div>
      <div style="border:1px solid #E1E4E9;border-top:none;padding:28px;border-radius:0 0 12px 12px;">
        <h2 style="margin-top:0;color:#00953C;">Gefeliciteerd, ${first}! 🎉</h2>
        <p>Je bent geslaagd voor je BHV-examen (${pkgName || ''}) met een score van <b>${pct}%</b> (${correct} van de ${total} vragen goed).</p>
        <table style="width:100%;margin:20px 0;font-size:14px;">
          <tr><td style="padding:6px 0;color:#4B535C;">Certificaatnummer</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${certNumber || '—'}</td></tr>
          ${pasNumber ? `<tr><td style="padding:6px 0;color:#4B535C;">Pasnummer</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${pasNumber}</td></tr>` : ''}
        </table>
        <p>Download je certificaat${pasNumber ? ' en BHV-pasje' : ''} via je dashboard:</p>
        <p style="text-align:center;margin:26px 0;">
          <a href="${siteUrl}" style="background:#0A5CA8;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block;">Naar mijn dashboard</a>
        </p>
        <hr style="border:none;border-top:1px solid #E1E4E9;margin:24px 0;">
        <p style="font-size:12px;color:#8b939b;">
          SKB BHV — onderdeel van Zuurman B.V.<br>
          Goordelaan 19, 9591 CB Onstwedde · KVK 86597396<br>
          Vragen? Mail info@skbbhv.nl
        </p>
      </div>
    </div>`;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
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
