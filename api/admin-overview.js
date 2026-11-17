// api/admin-overview.js
// Beheer-app: inloggen, overzicht van deelnemers/bestellingen en pasjes als geprint markeren.
// Vereist: ADMIN_EMAIL, ADMIN_PASSWORD (zie api/_lib/admin.js) en de Supabase-opslag (api/_lib/kv.js).

import { kv } from './_lib/kv.js';
import crypto from 'crypto';
import { Resend } from 'resend';
import { checkAdmin, ADMIN_OWNER_EMAIL } from './_lib/admin.js';
import { hashPassword, COMPANY_FOOTER_HTML } from './_lib/accounts.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';
const RESET_TTL = 30 * 60;

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

    // Wachtwoord instellen/vergeten: link gaat altijd naar de mailbox van de eigenaar.
    if (body.action === 'resetRequest') {
      const allowed = await kv.set('adminreset-lock', 1, { nx: true, ex: 60 });
      if (allowed && resend) {
        const token = crypto.randomBytes(24).toString('base64url');
        await kv.set(`adminreset:${token}`, 1, { ex: RESET_TTL });
        const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;
        const link = `${siteUrl.replace(/\/$/, '')}/beheer?reset=${token}`;
        await resend.emails.send({
          from: FROM_EMAIL, to: ADMIN_OWNER_EMAIL, subject: 'Beheerderswachtwoord instellen – SKB BHV',
          html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;line-height:1.6">
            <h2 style="margin:0 0 12px">Beheerderswachtwoord instellen</h2>
            <p>Klik op de knop om een nieuw wachtwoord voor de SKB BHV beheer-app in te stellen. De link werkt 30 minuten en één keer.</p>
            <p><a href="${link}" style="display:inline-block;background:#E0101F;color:#fff;padding:12px 22px;border-radius:4px;text-decoration:none;font-weight:bold">Wachtwoord instellen</a></p>
            <p style="color:#666;font-size:13px">Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p><p style="color:#888;font-size:12px">${COMPANY_FOOTER_HTML}</p></div>`,
        });
      }
      if (!resend) return res.status(500).json({ error: 'E-mail versturen is niet ingesteld (RESEND_API_KEY).' });
      return res.status(200).json({ ok: true, to: ADMIN_OWNER_EMAIL });
    }
    if (body.action === 'resetSet') {
      const token = String(body.token || '').slice(0, 64);
      const pw = String(body.newPassword || '');
      if (pw.length < 8) return res.status(400).json({ error: 'Kies een wachtwoord van minimaal 8 tekens.' });
      if (!token || !(await kv.get(`adminreset:${token}`))) {
        return res.status(400).json({ error: 'Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.' });
      }
      await kv.del(`adminreset:${token}`);
      const { hash, salt } = hashPassword(pw);
      await kv.set('admin:auth', { email: ADMIN_OWNER_EMAIL, passHash: hash, passSalt: salt, updatedAt: new Date().toISOString() });
      const ip = String(req.headers['x-forwarded-for'] || 'onbekend').split(',')[0].trim();
      await kv.del(`adminfail:${ip}`);
      return res.status(200).json({ ok: true, email: ADMIN_OWNER_EMAIL });
    }

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
