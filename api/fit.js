// api/fit.js — BHV-fit vragen ophalen (GET) en beantwoorden (POST). Per BHV'er via zijn verificatiecode.
import { kv } from './_lib/kv.js';
import { FIT_VRAGEN, vragenVoorMaand, huidigeMaand } from './_lib/fit.js';

async function deelnemer(code) {
  const c = String(code || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  const token = c ? await kv.get(`verify:${c}`) : null;
  const rec = token ? await kv.get(`participant:${token}`) : null;
  return rec && rec.status === 'passed' ? { token, rec } : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const src = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const maand = /^\d{4}-\d{2}$/.test(String(src.m || '')) ? String(src.m) : huidigeMaand();
    const d = await deelnemer(src.code);
    if (!d) return res.status(404).json({ error: 'Deze link is niet (meer) geldig.' });
    const idx = vragenVoorMaand(maand);
    const key = `fit:${d.token}:${maand}`;
    const eerder = await kv.get(key);
    if (req.method === 'GET') {
      return res.status(200).json({ naam: d.rec.first || '', maand, gedaan: eerder || null,
        vragen: idx.map((i) => ({ q: FIT_VRAGEN[i].q, o: FIT_VRAGEN[i].o })) });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
    const ant = Array.isArray(src.antwoorden) ? src.antwoorden.slice(0, 3) : [];
    const uitleg = idx.map((i, k) => ({ q: FIT_VRAGEN[i].q, goed: ant[k] === FIT_VRAGEN[i].c, juist: FIT_VRAGEN[i].o[FIT_VRAGEN[i].c], u: FIT_VRAGEN[i].u }));
    const score = uitleg.filter((x) => x.goed).length;
    if (!eerder) await kv.set(key, { score, van: 3, at: new Date().toISOString() }, { ex: 60 * 60 * 24 * 400 });
    return res.status(200).json({ score: eerder ? eerder.score : score, van: 3, uitleg, alGedaan: !!eerder });
  } catch (err) {
    console.error('fit error:', err);
    return res.status(500).json({ error: 'Er ging iets mis.' });
  }
}
