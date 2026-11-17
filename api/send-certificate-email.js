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

import { kv } from './_lib/kv.js';
import { sendCertificateMail, certRecipients } from './_lib/certmail.js';
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

    const recipients = certRecipients(record);
    if (!recipients.length) return res.status(400).json({ error: 'Er is geen e-mailadres bekend voor deze deelnemer.' });

    // Teller per deelnemer: maximaal MAX_MAILS keer versturen.
    const countKey = `certmail:${token}`;
    const count = await kv.incr(countKey);
    if (count === 1) await kv.expire(countKey, 60 * 60 * 24 * 365 * 2);
    if (count > MAX_MAILS) {
      return res.status(429).json({ sent: false, error: 'De certificaatmail is al verstuurd.' });
    }

    const result = await sendCertificateMail(record, token);
    if (!result.sent) return res.status(200).json(result);
    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('Versturen van certificaatmail mislukt:', err);
    return res.status(500).json({ error: 'Kon de e-mail niet versturen.' });
  }
}
