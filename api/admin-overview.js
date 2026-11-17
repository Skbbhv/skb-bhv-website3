// api/admin-overview.js
// Beheer-app: inloggen, overzicht van deelnemers/bestellingen en pasjes als geprint markeren.
// Vereist: ADMIN_EMAIL, ADMIN_PASSWORD (zie api/_lib/admin.js) en de Supabase-opslag (api/_lib/kv.js).

import { kv } from './_lib/kv.js';
import crypto from 'crypto';
import { Resend } from 'resend';
import Stripe from 'stripe';
import { checkAdmin, ADMIN_OWNER_EMAIL } from './_lib/admin.js';
import { hashPassword, COMPANY_FOOTER_HTML, PACKAGE_NAMES, isValidEmail, normalizeEmail } from './_lib/accounts.js';
import { issueCertNumber, issuePasNumber, PASSED_TTL_SECONDS, newVerifyCode, ensureVerifyCode } from './_lib/numbers.js';
import { sendCertificateMail } from './_lib/certmail.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';
const RESET_TTL = 30 * 60;

const P_FIELDS = ['token', 'first', 'last', 'birthdate', 'pkg', 'status', 'correct', 'total', 'pct', 'certNumber',
  'pasNumber', 'passDate', 'withPasje', 'theorie', 'praktijk', 'verifyCode', 'onLocation', 'buyerEmail', 'orderId', 'createdAt', 'createdBy', 'attempts', 'pasPrintedAt'];

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
      for (const r of parts) {
        if (r.value && r.value.status === 'passed' && !r.value.verifyCode) {
          r.value = await ensureVerifyCode(r.key.slice('participant:'.length), r.value);
        }
      }
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

    if (body.action === 'omzet') {
      const maandVan = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }).slice(0, 7);
      const nu = new Date();
      const maanden = [];
      for (let k = 11; k >= 0; k--) { const d = new Date(nu.getFullYear(), nu.getMonth() - k, 15); maanden.push(d.toISOString().slice(0, 7)); }
      const leeg = () => ({ stripeBruto: 0, stripeKosten: 0, stripeNetto: 0, terugbetaald: 0, handmatig: 0, handmatigPer: {}, bestellingen: 0 });
      const per = Object.fromEntries(maanden.map((m) => [m, leeg()]));
      const start = Math.floor(new Date(nu.getFullYear(), nu.getMonth() - 11, 1).getTime() / 1000);
      let stripeOk = false, stripeFout = null;
      if (process.env.STRIPE_SECRET_KEY) {
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
          let n = 0;
          for await (const bt of stripe.balanceTransactions.list({ created: { gte: start }, limit: 100 })) {
            if (++n > 5000) break;
            const m = maandVan(bt.created * 1000);
            if (!per[m]) continue;
            if (bt.type === 'charge' || bt.type === 'payment') {
              per[m].stripeBruto += bt.amount / 100; per[m].stripeKosten += bt.fee / 100; per[m].stripeNetto += bt.net / 100;
            } else if (bt.type === 'refund' || bt.type === 'payment_refund') {
              per[m].terugbetaald += -bt.amount / 100; per[m].stripeNetto += bt.net / 100; per[m].stripeKosten += bt.fee / 100;
            }
          }
          stripeOk = true;
        } catch (e) { console.error('stripe omzet', e); stripeFout = 'Stripe kon niet worden uitgelezen.'; }
      } else stripeFout = 'STRIPE_SECRET_KEY ontbreekt.';
      const orders = await kv.scan('order:', 5000);
      for (const r of orders) {
        const o = r.value; if (!o || !o.createdAt) continue;
        const m = maandVan(new Date(o.createdAt).getTime()); if (!per[m]) continue;
        per[m].bestellingen++;
        const total = Number(o.order && o.order.total) || 0;
        const handmatig = o.createdBy === 'admin' || String(o.id || '').startsWith('handmatig_');
        if (handmatig) {
          per[m].handmatig += total;
          const pm = (o.order && o.order.paymentMethod) || 'contant';
          per[m].handmatigPer[pm] = (per[m].handmatigPer[pm] || 0) + total;
        } else if (!stripeOk) {
          per[m].stripeBruto += total; // terugval: bedrag uit de bestelling
        }
      }
      const rond = (x) => Math.round(x * 100) / 100;
      const lijst = maanden.map((m) => {
        const x = per[m];
        const totaalIncl = x.stripeBruto - x.terugbetaald + x.handmatig;
        return { maand: m, stripeBruto: rond(x.stripeBruto), stripeKosten: rond(x.stripeKosten), stripeNetto: rond(x.stripeNetto), terugbetaald: rond(x.terugbetaald),
          handmatig: rond(x.handmatig), handmatigPer: Object.fromEntries(Object.entries(x.handmatigPer).map(([k, v]) => [k, rond(v)])),
          bestellingen: x.bestellingen, totaalIncl: rond(totaalIncl), totaalExcl: rond(totaalIncl / 1.21), btw: rond(totaalIncl - totaalIncl / 1.21) };
      });
      return res.status(200).json({ ok: true, stripeOk, stripeFout, maanden: lijst });
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

    if (body.action === 'addPassed') {
      const clean = (v, max = 60) => String(v ?? '').trim().slice(0, max);
      const first = clean(body.first), last = clean(body.last);
      const birthdate = clean(body.birthdate, 10);
      const email = normalizeEmail(body.email);
      const pkg = PACKAGE_NAMES[body.pkg] ? body.pkg : null;
      if (!body.theorie && !body.praktijk) return res.status(400).json({ error: 'Vink theorie, praktijk of allebei aan.' });
      if (!first || !last || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate) || !pkg || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Vul voornaam, achternaam, geboortedatum, pakket en een geldig e-mailadres in.' });
      }
      let pct = body.pct === '' || body.pct == null ? null : Math.round(Number(body.pct));
      if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) return res.status(400).json({ error: 'Score moet tussen 0 en 100 liggen.' });
      const passDay = /^\d{4}-\d{2}-\d{2}$/.test(String(body.passDate || '')) ? String(body.passDate) : null;
      const passDate = passDay ? new Date(passDay + 'T12:00:00Z').toISOString() : new Date().toISOString();

      const token = crypto.randomBytes(9).toString('base64url');
      const record = {
        token, first, last, birthdate, pkg,
        withPasje: !!body.withPasje, onLocation: false,
        theorie: !!body.theorie, praktijk: !!body.praktijk,
        buyerEmail: email, email,
        status: 'passed',
        correct: pct != null ? Math.round(75 * pct / 100) : null, total: pct != null ? 75 : null, pct,
        certNumber: null, pasNumber: null, passDate, finishedAt: passDate,
        attempts: 0, createdAt: new Date().toISOString(), createdBy: 'admin-geslaagd',
      };
      record.certNumber = await issueCertNumber(token);
      record.verifyCode = await newVerifyCode(token);
      if (record.withPasje) record.pasNumber = await issuePasNumber();
      await kv.set(`participant:${token}`, record, { ex: PASSED_TTL_SECONDS });

      let mail = { sent: false, reason: 'Niet verstuurd (uitgezet).' };
      if (body.sendMail !== false) {
        try { mail = await sendCertificateMail(record, token); await kv.set(`certmail:${token}`, 1, { ex: PASSED_TTL_SECONDS }); }
        catch (e) { console.error('certificaatmail (beheer) mislukt:', e); mail = { sent: false, reason: 'Versturen mislukt.' }; }
      }
      const siteUrl = (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
      return res.status(200).json({ ok: true, token, certNumber: record.certNumber, pasNumber: record.pasNumber,
        verifyCode: record.verifyCode, link: `${siteUrl}/?p=${token}`, mailSent: !!mail.sent, mailReason: mail.reason || null });
    }

    if (body.action === 'resendCert') {
      const token = String(body.token || '').slice(0, 40);
      const rec = token ? await kv.get(`participant:${token}`) : null;
      if (!rec || rec.status !== 'passed' || !rec.certNumber) return res.status(404).json({ error: 'Geen geslaagde deelnemer gevonden.' });
      const mail = await sendCertificateMail(rec, token);
      return res.status(200).json({ ok: true, mailSent: !!mail.sent, mailReason: mail.reason || null });
    }

    return res.status(400).json({ error: 'Onbekende actie.' });
  } catch (err) {
    console.error('admin-overview error:', err);
    return res.status(500).json({ error: 'Er ging iets mis. Probeer het later opnieuw.' });
  }
}
