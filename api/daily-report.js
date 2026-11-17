// api/daily-report.js
// Dagelijks overzicht voor de beheerder (Vercel Cron, zie vercel.json):
// wie is de afgelopen 24 uur geslaagd en welke BHV-pasjes moeten nog geprint worden.
// Mail gaat naar de eigenaar (ADMIN_OWNER_EMAIL). Beveiligd met CRON_SECRET.

import { Resend } from 'resend';
import { kv } from './_lib/kv.js';
import { ADMIN_OWNER_EMAIL } from './_lib/admin.js';
import { PACKAGE_NAMES, COMPANY_FOOTER_HTML, escapeHtml } from './_lib/accounts.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';

function nlDate(d) {
  return new Date(d).toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function nlDateTime(d) {
  return new Date(d).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  const key = (req.query && req.query.key) || '';
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
    return res.status(401).json({ error: 'Niet toegestaan.' });
  }
  try {
    const now = Date.now();
    const since = now - 24 * 60 * 60 * 1000;
    const rows = await kv.scan('participant:', 5000);
    const people = rows.map((r) => r.value).filter((v) => v && typeof v === 'object');

    const geslaagd = people
      .filter((p) => p.status === 'passed' && p.passDate && new Date(p.passDate).getTime() >= since)
      .sort((a, b) => String(a.passDate).localeCompare(String(b.passDate)));
    const gezakt = people.filter((p) => p.status === 'failed' && p.finishedAt && new Date(p.finishedAt).getTime() >= since).length;
    const tePrinten = people
      .filter((p) => p.status === 'passed' && p.pasNumber && !p.pasPrintedAt)
      .sort((a, b) => String(a.passDate || '').localeCompare(String(b.passDate || '')));

    const naam = (p) => escapeHtml(`${p.first || ''} ${p.last || ''}`.trim() || '—');
    const pakket = (p) => escapeHtml(PACKAGE_NAMES[p.pkg] || p.pkg || '');
    const td = 'padding:8px 10px;border-bottom:1px solid #eee;font-size:14px;';
    const th = 'padding:8px 10px;text-align:left;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#fff;background:#0B0D10;';

    const tabelGeslaagd = geslaagd.length
      ? `<table style="border-collapse:collapse;width:100%"><tr><th style="${th}">Naam</th><th style="${th}">Pakket</th><th style="${th}">Score</th><th style="${th}">Certificaat</th><th style="${th}">Pasje</th></tr>${
          geslaagd.map((p) => `<tr><td style="${td}"><b>${naam(p)}</b><br><span style="color:#888;font-size:12px">${escapeHtml(nlDateTime(p.passDate))}</span></td><td style="${td}">${pakket(p)}</td><td style="${td}">${p.pct != null ? escapeHtml(p.pct) + '%' : '—'}</td><td style="${td}">${escapeHtml(p.certNumber || '—')}</td><td style="${td}">${p.pasNumber ? escapeHtml(p.pasNumber) : 'nee'}</td></tr>`).join('')
        }</table>`
      : '<p style="color:#666">Niemand geslaagd in de afgelopen 24 uur.</p>';

    const tabelPrinten = tePrinten.length
      ? `<table style="border-collapse:collapse;width:100%"><tr><th style="${th}">Pasnummer</th><th style="${th}">Naam</th><th style="${th}">Geslaagd op</th></tr>${
          tePrinten.map((p) => `<tr><td style="${td}"><b>${escapeHtml(p.pasNumber)}</b></td><td style="${td}">${naam(p)}</td><td style="${td}">${p.passDate ? escapeHtml(nlDate(p.passDate)) : '—'}</td></tr>`).join('')
        }</table>`
      : '<p style="color:#666">Geen pasjes te printen. Alles is bij.</p>';

    const siteUrl = (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
    const vandaag = nlDate(now);
    const subject = `SKB BHV dagoverzicht ${vandaag}: ${geslaagd.length} geslaagd, ${tePrinten.length} pasje${tePrinten.length === 1 ? '' : 's'} te printen`;
    const html = `<div style="font-family:Arial,sans-serif;color:#111;max-width:640px;margin:0 auto">
      <div style="background:#0B0D10;color:#fff;padding:18px 22px;border-bottom:6px solid #E0101F">
        <div style="font-size:12px;letter-spacing:3px;color:#FF5A66;text-transform:uppercase">SKB BHV · Beheerder</div>
        <div style="font-size:24px;font-weight:bold;margin-top:4px">Dagoverzicht ${escapeHtml(vandaag)}</div>
      </div>
      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin:10px 0"><tr>
        <td style="background:#F2F3F5;border-top:4px solid #19D36B;padding:12px;width:33%"><div style="font-size:28px;font-weight:bold">${geslaagd.length}</div><div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px">Geslaagd (24 u)</div></td>
        <td style="background:#F2F3F5;border-top:4px solid #E0101F;padding:12px;width:33%"><div style="font-size:28px;font-weight:bold;color:#E0101F">${tePrinten.length}</div><div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px">Pasjes te printen</div></td>
        <td style="background:#F2F3F5;border-top:4px solid #999;padding:12px;width:33%"><div style="font-size:28px;font-weight:bold">${gezakt}</div><div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px">Gezakt (24 u)</div></td>
      </tr></table>
      <h3 style="margin:18px 0 8px">Geslaagd in de afgelopen 24 uur</h3>${tabelGeslaagd}
      <h3 style="margin:22px 0 8px">Pasjes die je nog moet maken</h3>${tabelPrinten}
      ${tePrinten.length ? `<p style="margin:22px 0"><a href="${siteUrl}/beheer#pasjes" style="display:inline-block;background:#E0101F;color:#fff;padding:13px 24px;border-radius:4px;text-decoration:none;font-weight:bold">Pasjes printen in de beheer-app</a></p>` : ''}
      <p style="color:#888;font-size:12px;margin-top:26px">${COMPANY_FOOTER_HTML}</p></div>`;

    if (!resend) return res.status(500).json({ error: 'RESEND_API_KEY ontbreekt.' });
    await resend.emails.send({ from: FROM_EMAIL, to: ADMIN_OWNER_EMAIL, subject, html });
    return res.status(200).json({ ok: true, geslaagd: geslaagd.length, tePrinten: tePrinten.length, gezakt });
  } catch (err) {
    console.error('daily-report error:', err);
    return res.status(500).json({ error: 'Dagoverzicht mislukt.' });
  }
}
