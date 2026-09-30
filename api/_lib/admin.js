// api/_lib/admin.js
// Controle voor de beheerpagina: beheerder logt in met e-mailadres + wachtwoord.
//
// Vereist environment variables in Vercel:
//   ADMIN_EMAIL      het e-mailadres van de beheerder (bijv. info@oibase.nl)
//   ADMIN_PASSWORD   het wachtwoord van de beheerder
//
// Na 10 mislukte pogingen vanaf hetzelfde internetadres wordt het 15 minuten geblokkeerd.

import crypto from 'crypto';
import { kv } from './kv.js';

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Geeft null terug als de beheerder klopt, anders { status, error }.
export async function checkAdmin(req, body) {
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    return { status: 500, error: 'ADMIN_EMAIL en ADMIN_PASSWORD moeten allebei ingesteld zijn in Vercel.' };
  }

  const ip = String(req.headers['x-forwarded-for'] || 'onbekend').split(',')[0].trim();
  const failKey = `adminfail:${ip}`;
  if (((await kv.get(failKey)) || 0) >= 10) {
    return { status: 429, error: 'Te veel mislukte pogingen. Probeer het over 15 minuten opnieuw.' };
  }

  const email = String(body.adminEmail || '').trim().toLowerCase();
  const emailOk = safeEqual(email, adminEmail);
  const passwordOk = safeEqual(body.adminPassword || '', adminPassword);
  if (!emailOk || !passwordOk) {
    await kv.incr(failKey);
    await kv.expire(failKey, 15 * 60);
    return { status: 401, error: 'E-mailadres of wachtwoord van de beheerder klopt niet.' };
  }

  await kv.del(failKey);
  return null;
}
