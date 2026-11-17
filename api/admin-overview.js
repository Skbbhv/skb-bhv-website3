// api/admin-overview.js
// Beheer-app: inloggen, overzicht van deelnemers/bestellingen en pasjes als geprint markeren.
// Vereist: ADMIN_EMAIL, ADMIN_PASSWORD (zie api/_lib/admin.js) en de Supabase-opslag (api/_lib/kv.js).

import { kv } from './_lib/kv.js';
import { checkAdmin } from './_lib/admin.js';

const P_FIELDS = ['token', 'first', 'last', 'birthdate', 'pkg', 'status', 'correct', 'total', 'pct', 'certNumber',
  'pasNumber', 'passDate', 'withPasje', 'onLocation', 'buyerEmail', 'orderId', 'createdAt', 'createdBy', 'attempts', 'pasPrintedAt'];

function pick(obj, fields) {
  const out = {};
  for (const f of fields) if (obj && obj[f] !== undefined) out[f] = obj[f];
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = req.body || {};
    const denied = await checkAdmin(req, body);
    if (denied) return res.status(denied.status).json({ error: denied.error });

    if (body.action === 'login') return res.status(200).json({ ok: true });

    if (body.action === 'overview') {
      const [parts, orders, accounts] = await Promise.all([
        kv.scan('participant:', 5000), kv.scan('order:', 5000), kv.scan('account:', 5000),
      ]);
      const participants = parts
        .filter((r) => r.value && typeof r.value === 'object')
        .map((r) => ({ token: r.key.slice('participant:'.length), ...pick(r.value, P_FIELDS) }));
      const orderList = orders
        .filter((r) => r.value && typeof r.value === 'object')
        .map((r) => {
          const o = r.value;
          return {
            id: o.id || r.key.slice(6), email: o.email || null, createdAt: o.createdAt || null,
            pkg: o.order && o.order.pkg, qty: o.order && o.order.qty, withPasje: !!(o.order && o.order.withPasje),
            onLocation: !!(o.order && o.order.onLocation), total: o.order && o.order.total,
            company: (o.buyer && o.buyer.company) || '', buyer: o.buyer ? `${o.buyer.first || ''} ${o.buyer.last || ''}`.trim() : '',
            payment: o.payment || o.paidVia || null,
            roster: Array.isArray(o.roster) ? o.roster.filter(Boolean).map((e) => pick(e, P_FIELDS)) : [],
          };
        });
      return res.status(200).json({ ok: true, participants, orders: orderList, accounts: accounts.length, at: new Date().toISOString() });
    }

    if (body.action === 'markPrinted') {
      const tokens = Array.isArray(body.tokens) ? body.tokens.slice(0, 500).map((t) => String(t).slice(0, 40)) : [];
      const now = body.undo ? null : new Date().toISOString();
      let n = 0;
      for (const t of tokens) {
        const rec = await kv.get(`participant:${t}`);
        if (!rec) continue;
        if (await kv.update(`participant:${t}`, { ...rec, pasPrintedAt: now })) n++;
      }
      return res.status(200).json({ ok: true, updated: n });
    }

    return res.status(400).json({ error: 'Onbekende actie.' });
  } catch (err) {
    console.error('admin-overview error:', err);
    return res.status(500).json({ error: 'Er ging iets mis. Probeer het later opnieuw.' });
  }
}
