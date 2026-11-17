// api/_lib/numbers.js
// Uitgifte van certificaat- en pasnummers (gedeeld door examen en beheer).
import crypto from 'crypto';
import { kv } from './kv.js';

export const PASSED_TTL_SECONDS = 60 * 60 * 24 * 365 * 2; // certificaatgegevens 2 jaar bewaren
const PAS_OFFSET = 10000; // server-side pasnummers beginnen boven de oude (browser-)nummers

// Uniek certificaatnummer in het bestaande formaat SKB-BHV-<jaar>-<4 cijfers>.
export async function issueCertNumber(token) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 25; attempt++) {
    const digits = attempt < 20 ? crypto.randomInt(1000, 10000) : crypto.randomInt(10000, 100000);
    const number = `SKB-BHV-${year}-${digits}`;
    const ok = await kv.set(`certnr:${number}`, token, { nx: true });
    if (ok) return number;
  }
  throw new Error('Kon geen uniek certificaatnummer uitgeven.');
}

export async function issuePasNumber() {
  const n = await kv.incr('counter:pasnummer');
  return `SKB-P-${String(PAS_OFFSET + n).padStart(6, '0')}`;
}

// Willekeurige verificatiecode voor de QR-code (niet te raden, 10 tekens).
const ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export async function newVerifyCode(token) {
  for (let i = 0; i < 10; i++) {
    let code = '';
    const bytes = crypto.randomBytes(10);
    for (const b of bytes) code += ALFABET[b % ALFABET.length];
    const ok = await kv.set(`verify:${code}`, token, { nx: true, ex: PASSED_TTL_SECONDS });
    if (ok) return code;
  }
  throw new Error('Kon geen verificatiecode maken.');
}

// Zorgt dat een geslaagde deelnemer een verificatiecode heeft (voor oudere records).
export async function ensureVerifyCode(token, record) {
  if (!record || record.status !== 'passed' || record.verifyCode) return record;
  const verifyCode = await newVerifyCode(token);
  const updated = { ...record, verifyCode };
  await kv.update(`participant:${token}`, updated);
  return updated;
}
