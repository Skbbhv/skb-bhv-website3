// api/participant.js
// Beheert unieke, deelbare links per deelnemer, zodat iedereen zijn eigen examen kan maken
// op zijn eigen apparaat — zonder wachtwoord of account. Het examen wordt hier ook
// server-side klaargezet en nagekeken: de antwoordsleutel staat alleen in api/_lib/examen.js.
//
// Acties (POST, JSON { action, ... }):
//   create     { orderId, first, last, birthdate, email? } + Bearer (besteller)
//              → { token, emailSent }
//              Alleen voor een eigen bestelling waarvan nog plekken over zijn. Pakket, pasje en
//              locatie komen uit de bestelling (niet van de client). Met een e-mailadres van de
//              deelnemer wordt de examenlink direct gemaild.
//   send-link  { token } + Bearer (besteller)  → { ok, emailSent }   (link opnieuw mailen)
//   delete     { token, orderId? } + Bearer (besteller) → { ok }    (link intrekken, niet na slagen)
//   start      { token }                       → { examId, questions: [{cat,q,options}] }
//   finish     { token, examId, answers: [..] } → { status, correct, total, pct, passed,
//                                                  certNumber, pasNumber, passDate, wrong, perCategory }
//   update     { token, currentQ? }            → { ok }   (alleen onschuldige voortgangsvelden)
// GET ?token=… → gegevens van de deelnemer (zonder examensleutel)
//
// Opslag:
//   participant:<token>     → deelnemer (90 dagen; na slagen 2 jaar)
//   order-slots:<orderId>   → set met tokens die op deze bestelling zijn aangemaakt
//   certnr:<nummer>         → token (houdt certificaatnummers uniek)
//   counter:pasnummer       → oplopend pasnummer (server-side)
//
// Vereist: REDIS_URL (of Redis_REDIS_URL); voor e-mail RESEND_API_KEY, FROM_EMAIL, SITE_URL.

import crypto from 'crypto';
import { kv } from './_lib/kv.js';
import { Resend } from 'resend';
import {
  getSessionEmail, isValidEmail, normalizeEmail, escapeHtml, PACKAGE_NAMES, COMPANY_FOOTER_HTML,
} from './_lib/accounts.js';
import { buildExam, gradeExam } from './_lib/examen.js';

const TTL_SECONDS = 60 * 60 * 24 * 90; // links blijven 90 dagen geldig
const PASSED_TTL_SECONDS = 60 * 60 * 24 * 365 * 2; // certificaatgegevens 2 jaar bewaren
const PAS_OFFSET = 10000; // server-side pasnummers beginnen boven de oude (browser-)nummers
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';

function randomToken() {
  return crypto.randomBytes(9).toString('base64url');
}

function cleanText(value, max = 80) {
  return String(value ?? '').trim().slice(0, max);
}

// Velden die de client te zien krijgt (nooit de examensleutel).
const MAX_POGINGEN = 2; // eerste poging + 1 herkansing
const POGINGEN_OP = 'Je hebt het examen al 2 keer gemaakt (1 herkansing). Neem contact op met info@skbbhv.nl voor een nieuwe poging.';

function publicRecord(record) {
  const { exam, ...rest } = record;
  return rest;
}

async function saveRecord(record) {
  const ttl = record.status === 'passed' ? PASSED_TTL_SECONDS : TTL_SECONDS;
  await kv.set(`participant:${record.token}`, record, { ex: ttl });
}

// Uniek certificaatnummer in het bestaande formaat SKB-BHV-<jaar>-<4 cijfers>.
async function issueCertNumber(token) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 25; attempt++) {
    const digits = attempt < 20 ? crypto.randomInt(1000, 10000) : crypto.randomInt(10000, 100000);
    const number = `SKB-BHV-${year}-${digits}`;
    const ok = await kv.set(`certnr:${number}`, token, { nx: true });
    if (ok) return number;
  }
  throw new Error('Kon geen uniek certificaatnummer uitgeven.');
}

async function issuePasNumber() {
  const n = await kv.incr('counter:pasnummer');
  return `SKB-P-${String(PAS_OFFSET + n).padStart(6, '0')}`;
}

async function sendExamLinkEmail(record, req) {
  if (!resend || !record.email) return false;
  const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;
  const link = `${siteUrl}/?p=${record.token}`;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: record.email,
      subject: 'Je persoonlijke link voor het BHV-examen',
      html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111418;">
        <div style="background:#0B1F33;padding:24px 28px;border-radius:12px 12px 0 0;">
          <span style="color:#fff;font-size:22px;font-weight:bold;">SKB BHV</span>
        </div>
        <div style="border:1px solid #E3E6EA;border-top:none;padding:28px;border-radius:0 0 12px 12px;">
          <h2 style="margin-top:0;">Hallo ${escapeHtml(record.first)},</h2>
          <p>Er staat een BHV-examen voor je klaar: <b>${escapeHtml(PACKAGE_NAMES[record.pkg] || 'BHV-examen')}</b>. Via onderstaande knop start je het examen. De link is persoonlijk en 90 dagen geldig.</p>
          <p style="text-align:center;margin:26px 0;">
            <a href="${link}" style="background:#0A5CA8;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block;">Start mijn examen</a>
          </p>
          <p style="font-size:13px;color:#4A525B;">75 vragen in 5 onderdelen van elk 8 minuten. Met 80% of meer ben je geslaagd. Je kunt tussendoor stoppen en later via dezelfde link verdergaan.</p>
          <hr style="border:none;border-top:1px solid #E3E6EA;margin:24px 0;">
          <p style="font-size:12px;color:#6B737C;">${COMPANY_FOOTER_HTML}</p>
        </div>
      </div>`,
    });
    return true;
  } catch (err) {
    console.error('Versturen van examenlink mislukt:', err);
    return false;
  }
}

async function getOwnedOrder(orderId, sessionEmail) {
  if (!orderId) return null;
  const order = await kv.get(`order:${orderId}`);
  if (!order || normalizeEmail(order.email) !== sessionEmail) return null;
  return order;
}

async function create(req, body, res) {
  const sessionEmail = await getSessionEmail(req);
  if (!sessionEmail) return res.status(401).json({ error: 'Log in op Mijn omgeving om deelnemers toe te voegen.' });

  const orderId = cleanText(body.orderId, 200);
  const order = await getOwnedOrder(orderId, sessionEmail);
  if (!order || !order.order) return res.status(404).json({ error: 'Bestelling niet gevonden.' });

  const first = cleanText(body.first);
  const last = cleanText(body.last);
  const birthdate = cleanText(body.birthdate, 10);
  if (!first || !last || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
    return res.status(400).json({ error: 'Naam en geboortedatum zijn verplicht.' });
  }
  const email = normalizeEmail(body.email);
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'Het e-mailadres van de deelnemer klopt niet.' });
  }

  // Plek reserveren: eerst toevoegen, dan tellen — zo kan ook een gelijktijdig verzoek
  // het aantal deelnemers niet overschrijden.
  const qty = parseInt(order.order.qty, 10) || 1;
  const token = randomToken();
  const slotsKey = `order-slots:${orderId}`;
  await kv.sadd(slotsKey, token);
  const used = await kv.scard(slotsKey);
  if (used > qty) {
    await kv.srem(slotsKey, token);
    return res.status(409).json({ error: `Alle ${qty} deelnemersplekken van deze bestelling zijn al in gebruik.` });
  }

  const record = {
    token,
    orderId,
    first, last, birthdate,
    pkg: PACKAGE_NAMES[order.order.pkg] ? order.order.pkg : 'basis',
    email: email || '',
    withPasje: !!order.order.withPasje,
    onLocation: !!order.order.onLocation,
    buyerEmail: sessionEmail,
    status: 'ready', // ready -> progress -> passed / failed
    correct: 0, total: 75, pct: 0,
    certNumber: null, pasNumber: null, passDate: null,
    createdAt: new Date().toISOString(),
  };
  await saveRecord(record);

  const emailSent = email ? await sendExamLinkEmail(record, req) : false;
  return res.status(200).json({ token, emailSent });
}

async function sendLink(req, body, res) {
  const sessionEmail = await getSessionEmail(req);
  if (!sessionEmail) return res.status(401).json({ error: 'Log opnieuw in om de link te mailen.' });
  const record = body.token ? await kv.get(`participant:${body.token}`) : null;
  if (!record) return res.status(404).json({ error: 'Deelnemer niet gevonden of link verlopen.' });
  if (normalizeEmail(record.buyerEmail) !== sessionEmail) {
    return res.status(403).json({ error: 'Deze deelnemer hoort niet bij jouw bestelling.' });
  }
  if (!record.email) return res.status(400).json({ error: 'Er is geen e-mailadres bekend voor deze deelnemer.' });
  const emailSent = await sendExamLinkEmail(record, req);
  return res.status(200).json({ ok: true, emailSent });
}

async function remove(req, body, res) {
  const sessionEmail = await getSessionEmail(req);
  if (!sessionEmail) return res.status(401).json({ error: 'Log opnieuw in om deze deelnemer te wijzigen.' });
  const token = cleanText(body.token, 40);
  if (!token) return res.status(400).json({ error: 'Token ontbreekt.' });

  const record = await kv.get(`participant:${token}`);
  if (record) {
    if (normalizeEmail(record.buyerEmail) !== sessionEmail) {
      return res.status(403).json({ error: 'Deze deelnemer hoort niet bij jouw bestelling.' });
    }
    if (record.status === 'passed') {
      return res.status(409).json({ error: 'Deze deelnemer is al geslaagd; het certificaat kan niet meer worden ingetrokken.' });
    }
    await kv.del(`participant:${token}`);
    if (record.orderId) await kv.srem(`order-slots:${record.orderId}`, token);
    return res.status(200).json({ ok: true });
  }

  // Link al verlopen: alleen de plek op de eigen bestelling vrijgeven.
  const order = await getOwnedOrder(cleanText(body.orderId, 200), sessionEmail);
  if (order) {
    const members = (await kv.smembers(`order-slots:${order.id}`)) || [];
    if (members.includes(token)) await kv.srem(`order-slots:${order.id}`, token);
  }
  return res.status(200).json({ ok: true });
}

async function start(body, res) {
  const token = cleanText(body.token, 40);
  const record = token ? await kv.get(`participant:${token}`) : null;
  if (!record) return res.status(404).json({ error: 'Deelnemer niet gevonden of link verlopen.' });
  if (record.status === 'passed') return res.status(409).json({ error: 'Deze deelnemer is al geslaagd.' });
  if ((record.attempts || 0) >= MAX_POGINGEN) return res.status(409).json({ error: POGINGEN_OP });

  const { items, questions } = buildExam();
  const examId = crypto.randomBytes(12).toString('hex');
  record.exam = { id: examId, items, startedAt: new Date().toISOString() };
  record.status = 'progress';
  await saveRecord(record);
  return res.status(200).json({ examId, questions });
}

async function finish(body, res) {
  const token = cleanText(body.token, 40);
  if (!token) return res.status(400).json({ error: 'Token ontbreekt.' });

  // Eén nakijkronde tegelijk per deelnemer.
  const lockKey = `finishlock:${token}`;
  const locked = await kv.set(lockKey, 1, { nx: true, ex: 30 });
  if (!locked) return res.status(429).json({ error: 'Het examen wordt al nagekeken. Een moment geduld.' });
  try {
    const record = await kv.get(`participant:${token}`);
    if (!record) return res.status(404).json({ error: 'Deelnemer niet gevonden of link verlopen.' });
    if (record.status === 'passed') return res.status(409).json({ error: 'Deze deelnemer is al geslaagd.' });
    if (!record.exam || !Array.isArray(record.exam.items) || record.exam.id !== String(body.examId || '')) {
      return res.status(409).json({ error: 'Dit examen is niet (meer) actief. Start het examen opnieuw.' });
    }
    const answers = Array.isArray(body.answers) ? body.answers.slice(0, record.exam.items.length) : [];
    const result = gradeExam(record.exam.items, answers);

    const updated = { ...record };
    delete updated.exam; // elk gestart examen kan maar één keer worden ingeleverd
    updated.attempts = (record.attempts || 0) + 1;
    updated.correct = result.correct;
    updated.total = result.total;
    updated.pct = result.pct;
    updated.status = result.passed ? 'passed' : 'failed';
    updated.finishedAt = new Date().toISOString();
    if (result.passed) {
      updated.certNumber = await issueCertNumber(token);
      updated.passDate = updated.finishedAt;
      updated.pasNumber = record.withPasje ? (record.pasNumber || await issuePasNumber()) : null;
    }
    await saveRecord(updated);

    return res.status(200).json({
      status: updated.status,
      passed: result.passed,
      correct: result.correct,
      total: result.total,
      pct: result.pct,
      certNumber: updated.certNumber || null,
      pasNumber: updated.pasNumber || null,
      passDate: updated.passDate || null,
      wrong: result.wrong,
      perCategory: result.perCategory,
      attempts: updated.attempts,
      attemptsLeft: result.passed ? 0 : Math.max(0, MAX_POGINGEN - updated.attempts),
    });
  } finally {
    await kv.del(lockKey);
  }
}

// Alleen onschuldige voortgangsvelden; status, score en nummers zet alleen de server.
const UPDATE_WHITELIST = {
  currentQ: (v) => (Number.isInteger(v) && v >= 0 && v < 200 ? v : undefined),
};

async function update(body, res) {
  const token = cleanText(body.token, 40);
  if (!token) return res.status(400).json({ error: 'Token ontbreekt.' });
  const existing = await kv.get(`participant:${token}`);
  if (!existing) return res.status(404).json({ error: 'Deelnemer niet gevonden of link verlopen.' });
  const updated = { ...existing };
  for (const [field, check] of Object.entries(UPDATE_WHITELIST)) {
    if (field in body) {
      const v = check(body[field]);
      if (v !== undefined) updated[field] = v;
    }
  }
  updated.lastActiveAt = new Date().toISOString();
  await saveRecord(updated);
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') {
      const body = req.body || {};
      switch (body.action) {
        case 'create': return await create(req, body, res);
        case 'send-link': return await sendLink(req, body, res);
        case 'delete': return await remove(req, body, res);
        case 'start': return await start(body, res);
        case 'finish': return await finish(body, res);
        case 'update': return await update(body, res);
        default: return res.status(400).json({ error: 'Onbekende actie.' });
      }
    }

    if (req.method === 'GET') {
      const { token } = req.query;
      if (!token) return res.status(400).json({ error: 'Token ontbreekt.' });
      const record = await kv.get(`participant:${token}`);
      if (!record) return res.status(404).json({ error: 'Deelnemer niet gevonden of link verlopen.' });
      return res.status(200).json(publicRecord(record));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('participant API error:', err);
    return res.status(500).json({ error: 'Er ging iets mis. Is de database gekoppeld?' });
  }
}
