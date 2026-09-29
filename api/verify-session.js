// api/verify-session.js
// Wordt aangeroepen wanneer de klant terugkomt van Stripe Checkout, om server-side te
// bevestigen dat er echt betaald is (nooit de client blindelings vertrouwen).
// Vereist environment variable: STRIPE_SECRET_KEY

import Stripe from 'stripe';
import { ensureAccountForStripeSession, createSession } from './_lib/accounts.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).json({ error: 'session_id ontbreekt.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(200).json({ paid: false });
    }

    let locationRequest = null;
    if (session.metadata.locationRequest) {
      try { locationRequest = JSON.parse(session.metadata.locationRequest); } catch (e) { /* negeren */ }
    }

    // Account + bestelling vastleggen in de database. Een nieuw account krijgt een
    // wachtwoord dat we één keer aan de klant tonen (en ook mailen). Direct na de
    // betaling (binnen 2 uur) wordt de klant automatisch ingelogd.
    let account = null;
    try {
      const result = await ensureAccountForStripeSession(session);
      if (result.email) {
        const fresh = (Date.now() / 1000 - (session.created || 0)) < 2 * 60 * 60;
        account = {
          email: result.email,
          created: result.created,
          password: result.password, // alleen gevuld als het account nu pas is aangemaakt
          sessionToken: fresh ? await createSession(result.email) : null,
          savedOrder: result.orderRecord && result.orderRecord.roster ? result.orderRecord : null,
        };
      }
    } catch (e) {
      // Zonder database blijft de bestelling werken zoals voorheen (alleen in deze browser).
      console.error('Account aanmaken mislukt (is Vercel KV gekoppeld?):', e);
    }

    return res.status(200).json({
      orderId: session.id,
      account,
      paid: true,
      amount_total: session.amount_total, // in centen
      pkg: session.metadata.pkg,
      qty: parseInt(session.metadata.qty, 10) || 1,
      withPasje: session.metadata.withPasje === 'true',
      onLocation: session.metadata.onLocation === 'true',
      buyer: {
        first: session.metadata.buyerFirst,
        last: session.metadata.buyerLast,
        email: session.metadata.buyerEmail,
        company: session.metadata.buyerCompany,
      },
      locationRequest,
    });
  } catch (err) {
    console.error('Stripe verify-session error:', err);
    return res.status(500).json({ error: 'Kon de betaling niet verifiëren.' });
  }
}
