// api/verify-session.js
// Wordt aangeroepen wanneer de klant terugkomt van Stripe Checkout, om server-side te
// bevestigen dat er echt betaald is (nooit de client blindelings vertrouwen).
// Vereist environment variable: STRIPE_SECRET_KEY

import Stripe from 'stripe';

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

    return res.status(200).json({
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
