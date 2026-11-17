// api/lead.js
// Slaat een lead op (oefentoets, BHV-plan, rekentool). Verschijnt in het dagoverzicht en de beheer-app.
import crypto from 'crypto';
import { kv } from './_lib/kv.js';
import { isValidEmail, normalizeEmail } from './_lib/accounts.js';

const BRONNEN = ['oefentoets', 'bhv-plan', 'rekentool'];
const TTL = 60 * 60 * 24 * 365 * 2;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const bron = BRONNEN.includes(body.bron) ? body.bron : null;
    if (!bron || !isValidEmail(email)) return res.status(400).json({ error: 'Vul een geldig e-mailadres in.' });
    const ip = String(req.headers['x-forwarded-for'] || 'onbekend').split(',')[0].trim();
    const k = `leadrate:${ip}`;
    const n = await kv.incr(k); if (n === 1) await kv.expire(k, 60 * 60);
    if (n > 20) return res.status(429).json({ error: 'Te veel aanvragen. Probeer het later opnieuw.' });
    const extra = {};
    const src = body.extra && typeof body.extra === 'object' ? body.extra : {};
    for (const [key, v] of Object.entries(src).slice(0, 20)) {
      if (['string', 'number', 'boolean'].includes(typeof v)) extra[String(key).slice(0, 30)] = typeof v === 'string' ? v.slice(0, 200) : v;
    }
    const at = new Date().toISOString();
    await kv.set(`lead:${at}:${crypto.randomBytes(3).toString('hex')}`, { email, bron, extra, at }, { ex: TTL });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('lead error:', err);
    return res.status(500).json({ error: 'Er ging iets mis. Probeer het later opnieuw.' });
  }
}
