// api/participant.js
// Beheert unieke, deelbare links per deelnemer, zodat iedereen zijn eigen examen kan maken
// op zijn eigen apparaat — zonder wachtwoord of account. Gegevens worden opgeslagen in
// Vercel KV (een gratis, kant-en-klare database die je koppelt via het Vercel-dashboard,
// tabblad "Storage" → "Create Database" → KV/Redis → "Connect to Project").
//
// Vereist environment variables (worden automatisch gezet zodra je de KV-database koppelt):
//   KV_REST_API_URL, KV_REST_API_TOKEN

import { kv } from '@vercel/kv';

const TTL_SECONDS = 60 * 60 * 24 * 90; // links blijven 90 dagen geldig

function randomToken() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
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
        const token = randomToken();
        const record = {
          token,
          first, last, birthdate, pkg,
          withPasje: !!withPasje,
          onLocation: !!onLocation,
          buyerEmail: buyerEmail || '',
          status: 'ready', // ready -> in-progress -> passed / failed
          correct: 0, total: 75, pct: 0,
          certNumber: null, pasNumber: null, passDate: null,
          createdAt: new Date().toISOString(),
        };
        await kv.set(`participant:${token}`, record, { ex: TTL_SECONDS });
        return res.status(200).json({ token });
      }

      if (body.action === 'update') {
        const { token, ...updates } = body;
        if (!token) return res.status(400).json({ error: 'Token ontbreekt.' });
        const existing = await kv.get(`participant:${token}`);
        if (!existing) return res.status(404).json({ error: 'Deelnemer niet gevonden of link verlopen.' });
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
    return res.status(500).json({ error: 'Er ging iets mis. Is de database (Vercel KV) gekoppeld?' });
  }
}
