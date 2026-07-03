// api/webhook.js
// Stripe stuurt hier een server-naar-server melding zodra een betaling écht is afgerond —
// dit werkt ook als de klant zijn browser sluit vóór de success_url geladen wordt.
// Bij een geslaagde betaling wordt hier automatisch een factuur gemaild naar de klant
// (en een kopie naar SKB BHV zelf).
//
// Vereist environment variables:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   RESEND_API_KEY        (voor het versturen van e-mails, zie README.md)
//   FROM_EMAIL             (optioneel, bijv. "SKB BHV <facturen@skbbhv.nl>")
//   NOTIFY_EMAIL            (optioneel, standaard info@skbbhv.nl)
//
// Registreer deze endpoint-URL (https://jouw-domein/api/webhook) in het Stripe Dashboard
// onder Developers → Webhooks, voor het event "checkout.session.completed".

import Stripe from 'stripe';
import { Resend } from 'resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.FROM_EMAIL || 'SKB BHV <onboarding@resend.dev>';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'info@skbbhv.nl';

const PACKAGES = {
  basis: { name: 'BHV Basisexamen' },
  herhaling: { name: 'BHV Herhaling' },
  combi: { name: 'BHV Theorie + Praktijk' },
};

// Belangrijk: de raw request body is nodig om de Stripe-handtekening te verifiëren,
// dus de standaard bodyParser van Vercel/Next.js moet uitstaan voor deze route.
export const config = {
  api: { bodyParser: false },
};

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

function formatEuro(cents) {
  return '€' + (cents / 100).toFixed(2).replace('.', ',');
}

function invoiceHtml(session) {
  const meta = session.metadata || {};
  const pkg = PACKAGES[meta.pkg] || { name: meta.pkg || 'BHV-pakket' };
  const qty = parseInt(meta.qty, 10) || 1;
  const withPasje = meta.withPasje === 'true';
  const onLocation = meta.onLocation === 'true';
  const invoiceNumber = `SKB-F-${new Date().getFullYear()}-${session.id.slice(-6).toUpperCase()}`;
  const dateStr = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' });

  const rows = [];
  rows.push(`<tr><td style="padding:8px 0;">${pkg.name}</td><td style="padding:8px 0;text-align:right;">× ${qty}</td></tr>`);
  if (withPasje) rows.push(`<tr><td style="padding:8px 0;">BHV-pasje</td><td style="padding:8px 0;text-align:right;">× ${qty}</td></tr>`);
  if (onLocation) rows.push(`<tr><td style="padding:8px 0;">Locatietoeslag (praktijkdag op locatie)</td><td style="padding:8px 0;text-align:right;">× 1</td></tr>`);

  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#12161B;">
    <div style="background:#12161B;padding:24px 28px;border-radius:12px 12px 0 0;">
      <span style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:0.5px;">SKB BHV</span>
    </div>
    <div style="border:1px solid #E1E4E9;border-top:none;padding:28px;border-radius:0 0 12px 12px;">
      <h2 style="margin-top:0;">Bedankt voor je bestelling</h2>
      <p>Hieronder vind je een overzicht van je betaling. Bewaar deze e-mail als factuur.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <thead>
          <tr style="border-bottom:2px solid #12161B;">
            <th style="text-align:left;padding-bottom:8px;">Omschrijving</th>
            <th style="text-align:right;padding-bottom:8px;">Aantal</th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      <table style="width:100%;margin-top:10px;">
        <tr><td>Totaal betaald</td><td style="text-align:right;font-weight:bold;font-size:18px;">${formatEuro(session.amount_total)}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #E1E4E9;margin:24px 0;">
      <p style="font-size:13px;color:#4B535C;">
        <b>Factuurnummer:</b> ${invoiceNumber}<br>
        <b>Factuurdatum:</b> ${dateStr}<br>
        <b>Besteller:</b> ${meta.buyerFirst || ''} ${meta.buyerLast || ''}${meta.buyerCompany ? ' — ' + meta.buyerCompany : ''}<br>
        <b>E-mail:</b> ${meta.buyerEmail || session.customer_email || ''}
      </p>
      <hr style="border:none;border-top:1px solid #E1E4E9;margin:24px 0;">
      <p style="font-size:12px;color:#8b939b;">
        SKB BHV — onderdeel van Zuurman B.V.<br>
        Goordelaan 19, 9591 CB Onstwedde · KVK 86597396 · BTW NL864018228B01<br>
        Vragen? Mail info@skbbhv.nl
      </p>
    </div>
  </div>`;
}

async function sendInvoiceEmail(session) {
  if (!resend) {
    console.warn('RESEND_API_KEY ontbreekt — factuurmail wordt overgeslagen.');
    return;
  }
  const to = session.metadata?.buyerEmail || session.customer_email;
  if (!to) {
    console.warn('Geen e-mailadres van de besteller gevonden — factuurmail wordt overgeslagen.');
    return;
  }
  const html = invoiceHtml(session);
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      bcc: NOTIFY_EMAIL,
      subject: 'Je factuur van SKB BHV',
      html,
    });
    console.log('📧 Factuurmail verstuurd naar', to);
  } catch (err) {
    console.error('Versturen van factuurmail mislukt:', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method not allowed');
  }

  const sig = req.headers['stripe-signature'];
  const buf = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verificatie mislukt:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('✅ Betaling voltooid:', session.id, session.metadata);
      await sendInvoiceEmail(session);
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object;
      console.log('⌛ Checkout-sessie verlopen zonder betaling:', session.id);
      break;
    }
    default:
      // Andere events negeren we hier bewust.
      break;
  }

  res.status(200).json({ received: true });
}
