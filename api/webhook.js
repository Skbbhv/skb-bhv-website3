// api/webhook.js
// Optioneel maar aanbevolen: Stripe stuurt hier een server-naar-server melding zodra een
// betaling écht is afgerond — dit werkt ook als de klant zijn browser sluit vóór de
// success_url geladen wordt. Gebruik dit voor het opslaan van bestellingen in een database
// of het versturen van een bevestigingsmail.
//
// Vereist environment variables: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// Registreer deze endpoint-URL (https://jouw-domein/api/webhook) in het Stripe Dashboard
// onder Developers → Webhooks, voor het event "checkout.session.completed".

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
      // TODO: sla de bestelling op in je eigen database en/of stuur een bevestigingsmail
      // naar session.metadata.buyerEmail en info@skbbhv.nl.
      console.log('✅ Betaling voltooid:', session.id, session.metadata);
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
