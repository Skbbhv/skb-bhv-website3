// api/verify.js
// Echtheidscheck van een SKB BHV-certificaat/-pasje.
//   GET  /api/verify?code=<verificatiecode>          (uit de QR-code)
//   POST { certNumber, birthdate }                   (handmatig, beide nodig)
// Geeft alleen terug wat nodig is om de houder te controleren.

import { kv } from './_lib/kv.js';
import { PACKAGE_NAMES } from './_lib/accounts.js';

function onderdelen(r) {
  if (r.theorie == null && r.praktijk == null) {
    return r.pkg === 'combi' ? 'Theorie + Praktijk' : 'Theorie';
  }
  return [r.theorie && 'Theorie', r.praktijk && 'Praktijk'].filter(Boolean).join(' + ');
}

function antwoord(r) {
  const pass = new Date(r.passDate || r.finishedAt || Date.now());
  const until = new Date(pass); until.setFullYear(until.getFullYear() + 1);
  return {
    found: true,
    valid: Date.now() <= until.getTime(),
    name: `${r.first || ''} ${r.last || ''}`.trim(),
    birthYear: r.birthdate ? String(r.birthdate).slice(0, 4) : null,
    certNumber: r.certNumber || null,
    pasNumber: r.pasNumber || null,
    opleiding: PACKAGE_NAMES[r.pkg] || 'BHV',
    onderdelen: onderdelen(r),
    herhaling: r.pkg === 'herhaling',
    passDate: pass.toISOString(),
    validUntil: until.toISOString(),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    let token = null;
    if (req.method === 'GET') {
      const code = String((req.query && req.query.code) || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
      if (!code) return res.status(400).json({ error: 'Code ontbreekt.' });
      token = await kv.get(`verify:${code}`);
    } else if (req.method === 'POST') {
      const ip = String(req.headers['x-forwarded-for'] || 'onbekend').split(',')[0].trim();
      const k = `verifyfail:${ip}`;
      if (((await kv.get(k)) || 0) >= 20) return res.status(429).json({ error: 'Te veel pogingen. Probeer het later opnieuw.' });
      const body = req.body || {};
      const nr = String(body.certNumber || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 30);
      const bd = String(body.birthdate || '').trim().slice(0, 10);
      if (!nr || !/^\d{4}-\d{2}-\d{2}$/.test(bd)) return res.status(400).json({ error: 'Vul certificaatnummer en geboortedatum in.' });
      const t = await kv.get(`certnr:${nr}`);
      const rec = t ? await kv.get(`participant:${t}`) : null;
      if (!rec || String(rec.birthdate) !== bd) {
        const n = await kv.incr(k); if (n === 1) await kv.expire(k, 60 * 60);
        return res.status(200).json({ found: false });
      }
      token = t;
    } else {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const rec = token ? await kv.get(`participant:${token}`) : null;
    if (!rec || rec.status !== 'passed' || !rec.certNumber) return res.status(200).json({ found: false });
    return res.status(200).json(antwoord(rec));
  } catch (err) {
    console.error('verify error:', err);
    return res.status(500).json({ error: 'Controle mislukt. Probeer het later opnieuw.' });
  }
}
