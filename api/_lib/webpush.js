// api/_lib/webpush.js
// Web Push zonder externe pakketten: VAPID (ES256-JWT, RFC 8292) en versleuteling aes128gcm (RFC 8291).
// Vereist env: VAPID_PUBLIC_KEY (base64url, 65 bytes ongecomprimeerd) en VAPID_PRIVATE_KEY (base64url, 32 bytes).

import crypto from 'crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@skbbhv.nl';

export function pushIngesteld() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function vapidSleutel() {
  const pub = unb64u(process.env.VAPID_PUBLIC_KEY);
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: process.env.VAPID_PRIVATE_KEY, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
}

function vapidJwt(endpoint) {
  const aud = new URL(endpoint).origin;
  const kop = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const inhoud = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT }));
  const data = `${kop}.${inhoud}`;
  const sig = crypto.sign('sha256', Buffer.from(data), { key: vapidSleutel(), dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64u(sig)}`;
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// Versleutelt payload voor één abonnement (RFC 8291, één record).
export function versleutel(subscription, payload, opties = {}) {
  const uaPublic = unb64u(subscription.keys.p256dh);
  const authSecret = unb64u(subscription.keys.auth);
  const ecdh = opties.ecdh || crypto.createECDH('prime256v1');
  if (!opties.ecdh) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const gedeeld = ecdh.computeSecret(uaPublic);
  const salt = opties.salt || crypto.randomBytes(16);

  const prkKey = hmac(authSecret, gedeeld);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo).subarray(0, 32);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const tekst = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const versleuteld = Buffer.concat([cipher.update(tekst), cipher.final(), cipher.getAuthTag()]);

  const kop = Buffer.alloc(21);
  salt.copy(kop, 0);
  kop.writeUInt32BE(4096, 16);
  kop.writeUInt8(asPublic.length, 20);
  return Buffer.concat([kop, asPublic, versleuteld]);
}

// Stuurt een melding. Geeft { ok, status, verlopen } terug; verlopen=true → abonnement verwijderen.
export async function stuurPush(subscription, data, { ttl = 3600, urgentie = 'high' } = {}) {
  if (!pushIngesteld()) return { ok: false, status: 0, reden: 'Push is niet ingesteld.' };
  if (!subscription || !subscription.endpoint || !subscription.keys) return { ok: false, status: 0, verlopen: true };
  try {
    const body = versleutel(subscription, JSON.stringify(data));
    const r = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        TTL: String(ttl),
        Urgency: urgentie,
        Authorization: `vapid t=${vapidJwt(subscription.endpoint)}, k=${VAPID_PUBLIC_KEY}`,
      },
      body,
    });
    return { ok: r.status >= 200 && r.status < 300, status: r.status, verlopen: r.status === 404 || r.status === 410 };
  } catch (e) {
    return { ok: false, status: 0, reden: e.message };
  }
}

// Alleen voor tests: ontsleutelen zoals een browser dat doet.
export function _ontsleutel(uaEcdh, authSecret, body) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const data = body.subarray(21 + idlen);
  const uaPublic = uaEcdh.getPublicKey();
  const gedeeld = uaEcdh.computeSecret(asPublic);
  const prkKey = hmac(authSecret, gedeeld);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])])).subarray(0, 32);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const p = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  return p.subarray(0, p.length - 1).toString();
}
export { b64u, unb64u };
