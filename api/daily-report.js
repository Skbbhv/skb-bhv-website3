// api/daily-report.js
// Dagelijks overzicht voor de beheerder (Vercel Cron, zie vercel.json):
// wie is de afgelopen 24 uur geslaagd en welke BHV-pasjes moeten nog geprint worden.
// Mail gaat naar de eigenaar (ADMIN_OWNER_EMAIL). Beveiligd met CRON_SECRET.

import { Resend } from 'resend';
import { kv } from './_lib/kv.js';
import { ADMIN_OWNER_EMAIL } from './_lib/admin.js';
import { PACKAGE_NAMES, COMPANY_FOOTER_HTML, escapeHtml } from './_lib/accounts.js';
import { certRecipients } from './_lib/certmail.js';
import { huidigeMaand } from './_lib/fit.js';
import { isValidEmail, normalizeEmail } from './_lib/accounts.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';

function nlDate(d) {
  return new Date(d).toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function nlDateTime(d) {
  return new Date(d).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const DAG = 24 * 60 * 60 * 1000;
function geldigTot(p) {
  const d = new Date(p.passDate || p.finishedAt); d.setFullYear(d.getFullYear() + 1); return d;
}
function amsDag(d) { return new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }); } // JJJJ-MM-DD
function dagenTot(d, now) { return Math.round((Date.parse(amsDag(d)) - Date.parse(amsDag(now))) / DAG); }

function mailKader(titel, body) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#12161B;">
    <div style="background:#0B0D10;padding:22px 28px;border-bottom:6px solid #E0101F;">
      <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:1px;">SKB BHV</span>
      <span style="color:#FF5A66;font-size:12px;letter-spacing:3px;margin-left:10px;text-transform:uppercase;">Bedrijfshulpverlening</span></div>
    <div style="border:1px solid #E1E4E9;border-top:none;padding:28px;"><h2 style="margin-top:0;color:#0B0D10;">${titel}</h2>${body}
    <hr style="border:none;border-top:1px solid #E1E4E9;margin:24px 0;"><p style="font-size:12px;color:#8b939b;">${COMPANY_FOOTER_HTML}</p></div></div>`;
}
function knop(href, tekst) {
  return `<p style="text-align:center;margin:26px 0;"><a href="${href}" style="background:#E0101F;color:#fff;text-decoration:none;padding:13px 28px;border-radius:4px;font-weight:bold;display:inline-block;letter-spacing:.5px;">${tekst}</a></p>`;
}

// Herinnering 60 en 14 dagen voor het verlopen van het certificaat.
async function stuurHerinneringen(rows, now, siteUrl) {
  let n = 0;
  for (const r of rows) {
    const p = r.value;
    if (!p || p.status !== 'passed' || !p.certNumber) continue;
    const left = dagenTot(geldigTot(p), now);
    let veld = null;
    if (left <= 14 && left >= 0 && !p.remind14At) veld = 'remind14At';
    else if (left <= 60 && left > 14 && !p.remind60At) veld = 'remind60At';
    if (!veld) continue;
    const to = certRecipients(p);
    if (!to.length) continue;
    const naam = escapeHtml(p.first || '');
    const datum = escapeHtml(geldigTot(p).toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long', year: 'numeric' }));
    const html = mailKader(`${naam ? 'Hoi ' + naam + ', je' : 'Je'} BHV-certificaat verloopt ${left <= 14 ? 'bijna' : 'binnenkort'}`,
      `<p>Je BHV-certificaat (${escapeHtml(p.certNumber)}) is geldig tot <b>${datum}</b>${left <= 14 ? ` — nog <b>${left} dag${left === 1 ? '' : 'en'}</b>` : ''}.</p>
       <p>Een BHV-certificaat is 1 jaar geldig. Met de <b>BHV Herhaling</b> blijf je bevoegd: online, in je eigen tempo, en je nieuwe certificaat heb je direct.</p>
       ${knop(`${siteUrl}/?go=pricing&utm_source=herinnering`, 'HERHALING REGELEN')}
       <p style="font-size:13px;color:#666;">Regelt je werkgever dit voor je? Stuur deze mail dan even door.</p>`);
    try {
      await resend.emails.send({ from: FROM_EMAIL, to, subject: left <= 14 ? `Nog ${left} dagen: je BHV-certificaat verloopt` : 'Je BHV-certificaat verloopt binnenkort', html });
      await kv.update(r.key, { ...p, [veld]: new Date().toISOString() });
      n++;
    } catch (e) { console.error('herinnering mislukt', r.key, e); }
  }
  return n;
}

// Een dag na het slagen: vraag om een Google-review (alleen als GOOGLE_REVIEW_URL is ingesteld).
async function stuurReviewVerzoeken(rows, now) {
  const url = process.env.GOOGLE_REVIEW_URL;
  if (!url) return { n: 0, uit: true };
  let n = 0;
  for (const r of rows) {
    const p = r.value;
    if (!p || p.status !== 'passed' || p.reviewAskedAt || !p.passDate) continue;
    const ago = now - new Date(p.passDate).getTime();
    if (ago < 20 * 60 * 60 * 1000 || ago > 4 * DAG) continue;
    const to = certRecipients(p);
    if (!to.length) continue;
    const html = mailKader(`${p.first ? 'Hoi ' + escapeHtml(p.first) + ', hoe' : 'Hoe'} was je BHV-opleiding?`,
      `<p>Gefeliciteerd nogmaals met je BHV-certificaat! Wil je ons helpen met een korte review op Google? Het kost je 30 seconden en helpt andere bedrijven en BHV'ers om ons te vinden.</p>
       ${knop(url, 'REVIEW SCHRIJVEN')}<p style="font-size:13px;color:#666;">Bedankt! — Erik, SKB BHV</p>`);
    try {
      await resend.emails.send({ from: FROM_EMAIL, to, subject: 'Hoe was je BHV-opleiding bij SKB BHV?', html });
      await kv.update(r.key, { ...p, reviewAskedAt: new Date().toISOString() });
      n++;
    } catch (e) { console.error('review-verzoek mislukt', r.key, e); }
  }
  return { n, uit: false };
}

// BHV-fit: op de 1e van de maand (of de eerste run daarna) 3 opfrisvragen naar de BHV'ers
// van werkgevers die BHV-fit hebben aangezet. Alleen naar het eigen e-mailadres van de deelnemer.
async function stuurBhvFit(now, siteUrl) {
  const maand = huidigeMaand(now);
  const eerste = await kv.set(`fitsent:${maand}`, now.toString ? new Date(now).toISOString() : '1', { nx: true, ex: 60 * 60 * 24 * 40 });
  if (!eerste) return 0;
  const inst = await kv.scan('instellingen:', 2000);
  let n = 0;
  for (const r of inst) {
    if (!r.value || !r.value.bhvFit) continue;
    const werkgever = r.key.slice('instellingen:'.length);
    const ids = (await kv.smembers(`account-orders:${werkgever}`)) || [];
    const tokens = new Set();
    for (const id of ids) {
      const o = await kv.get(`order:${id}`);
      (o && Array.isArray(o.roster) ? o.roster : []).forEach((e) => e && e.token && tokens.add(e.token));
    }
    for (const t of tokens) {
      const p = await kv.get(`participant:${t}`);
      if (!p || p.status !== 'passed' || !p.verifyCode || p.fitUit) continue;
      const to = normalizeEmail(p.email);
      if (!isValidEmail(to) || to === normalizeEmail(werkgever)) continue;
      const link = `${siteUrl}/fit/${encodeURIComponent(p.verifyCode)}?m=${maand}`;
      const html = mailKader(`${p.first ? 'Hoi ' + escapeHtml(p.first) + ', ' : ''}ben jij BHV-fit?`,
        `<p>Drie korte vragen, 2 minuten. Zo blijft je BHV-kennis scherp voor het moment dat het ertoe doet.</p>${knop(link, 'START DE 3 VRAGEN')}
         <p style="font-size:12px;color:#888;">Je ontvangt deze maandelijkse mail omdat je werkgever BHV-fit van SKB BHV heeft aangezet.</p>`);
      try { await resend.emails.send({ from: FROM_EMAIL, to, subject: 'BHV-fit: 3 vragen van deze maand', html }); n++; }
      catch (e) { console.error('bhv-fit mail mislukt', t, e); }
    }
  }
  return n;
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
    const siteUrl0 = (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
    let rows = await kv.scan('participant:', 5000);
    const herinneringen = resend ? await stuurHerinneringen(rows, now, siteUrl0) : 0;
    const reviews = resend ? await stuurReviewVerzoeken(rows, now) : { n: 0, uit: true };
    if (herinneringen || reviews.n) rows = await kv.scan('participant:', 5000);
    const fitVerstuurd = resend ? await stuurBhvFit(now, siteUrl0) : 0;
    const people = rows.map((r) => r.value).filter((v) => v && typeof v === 'object');

    const geslaagd = people
      .filter((p) => p.status === 'passed' && p.passDate && new Date(p.passDate).getTime() >= since)
      .sort((a, b) => String(a.passDate).localeCompare(String(b.passDate)));
    const gezakt = people.filter((p) => p.status === 'failed' && p.finishedAt && new Date(p.finishedAt).getTime() >= since).length;
    const tePrinten = people
      .filter((p) => p.status === 'passed' && p.pasNumber && !p.pasPrintedAt)
      .sort((a, b) => String(a.passDate || '').localeCompare(String(b.passDate || '')));

    // Nieuwe leads (oefentoets, BHV-plan, rekentool) van de afgelopen 24 uur
    const leadRows = await kv.scan('lead:', 2000);
    const leads = leadRows.map((r) => r.value).filter((v) => v && v.at && new Date(v.at).getTime() >= since);
    const BRON = { oefentoets: 'Oefentoets', 'bhv-plan': 'BHV-plan template', rekentool: 'Rekentool' };
    const leadInfo = (l) => {
      const x = l.extra || {};
      if (l.bron === 'oefentoets') return `score ${x.score}/${x.van}`;
      if (l.bron === 'rekentool') return [x.bedrijf, x.mw && `${x.mw} medewerkers`, x.q && `${x.q} BHV'ers`, x.excl && `€${Number(x.excl).toFixed(2)} excl.`].filter(Boolean).join(' · ');
      return '';
    };

    // Back-up van alle gegevens als bijlage (JSON)
    let attachments = [];
    let backupInfo = 'Back-up mislukt — zie de logs.';
    try {
      const dump = await kv.dump();
      const json = JSON.stringify(dump);
      attachments = [{ filename: `skbbhv-backup-${amsDag(now)}.json`, content: Buffer.from(json).toString('base64') }];
      backupInfo = `In de bijlage: <b>skbbhv-backup-${amsDag(now)}.json</b> (${(dump.kv || []).length} records, ${Math.round(json.length / 1024)} kB). Bewaar deze mails; hiermee kan alles worden teruggezet.`;
    } catch (e) { console.error('back-up mislukt:', e); }

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
    const subject = `SKB BHV dagoverzicht + back-up ${vandaag}: ${geslaagd.length} geslaagd, ${tePrinten.length} pasje${tePrinten.length === 1 ? '' : 's'} te printen`;
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
      <h3 style="margin:22px 0 8px">Nieuwe leads (${leads.length})</h3>
      ${leads.length ? `<table style="border-collapse:collapse;width:100%"><tr><th style="${th}">E-mail</th><th style="${th}">Via</th><th style="${th}">Details</th></tr>${
        leads.map((l) => `<tr><td style="${td}"><a href="mailto:${escapeHtml(l.email)}">${escapeHtml(l.email)}</a>${l.extra && l.extra.nieuwsbrief ? ' <span style="color:#0a7a3a;font-size:12px">(wil tips)</span>' : ''}</td><td style="${td}">${escapeHtml(BRON[l.bron] || l.bron)}</td><td style="${td}">${escapeHtml(leadInfo(l))}</td></tr>`).join('')
      }</table>` : '<p style="color:#666">Geen nieuwe leads.</p>'}
      <h3 style="margin:22px 0 8px">Automatische mails</h3>
      <p style="font-size:14px;margin:0">Verloopherinneringen verstuurd: <b>${herinneringen}</b><br>Review-verzoeken verstuurd: <b>${reviews.uit ? 'uit (stel GOOGLE_REVIEW_URL in)' : reviews.n}</b><br>BHV-fit mails verstuurd: <b>${fitVerstuurd}</b></p>
      <h3 style="margin:22px 0 8px">Back-up</h3>
      <p style="font-size:14px;margin:0">${backupInfo}</p>
      <p style="color:#888;font-size:12px;margin-top:26px">${COMPANY_FOOTER_HTML}</p></div>`;

    if (!resend) return res.status(500).json({ error: 'RESEND_API_KEY ontbreekt.' });
    await resend.emails.send({ from: FROM_EMAIL, to: ADMIN_OWNER_EMAIL, subject, html, attachments });
    return res.status(200).json({ ok: true, geslaagd: geslaagd.length, tePrinten: tePrinten.length, gezakt, herinneringen, reviews: reviews.n, leads: leads.length, fit: fitVerstuurd, backup: attachments.length > 0 });
  } catch (err) {
    console.error('daily-report error:', err);
    return res.status(500).json({ error: 'Dagoverzicht mislukt.' });
  }
}
