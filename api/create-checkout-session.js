// api/create-checkout-session.js
// Maakt een echte Stripe Checkout Session aan op basis van het bestelde SKB BHV-pakket.
// Vereist environment variables: STRIPE_SECRET_KEY, SITE_URL

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PACKAGES = {
  basis: { name: 'BHV Basisexamen', price: 79 },
  herhaling: { name: 'BHV Herhaling', price: 49 },
  combi: { name: 'BHV Theorie + Praktijk', price: 179 },
};
const PASJE_PRICE = 12.50;
const LOCATION_SURCHARGE = 395;

function getDiscountRate(qty) {
  if (qty >= 25) return 0.10;
  if (qty >= 10) return 0.05;
  return 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pkg, qty, withPasje, onLocation, buyer, locationRequest } = req.body || {};

    const packageInfo = PACKAGES[pkg];
    if (!packageInfo) {
      return res.status(400).json({ error: 'Onbekend pakket.' });
    }
    if (!buyer || !buyer.email || !buyer.first || !buyer.last) {
      return res.status(400).json({ error: 'Bestellersgegevens ontbreken.' });
    }

    const quantity = Math.min(50, Math.max(1, parseInt(qty, 10) || 1));
    const discount = getDiscountRate(quantity);
    const unitPrice = Math.round(packageInfo.price * (1 - discount) * 100) / 100;

    const line_items = [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: packageInfo.name + (discount > 0 ? ` — ${Math.round(discount * 100)}% groepskorting` : ''),
          },
          unit_amount: Math.round(unitPrice * 100), // Stripe werkt in centen
        },
        quantity,
      },
    ];

    if (withPasje) {
      line_items.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'BHV-pasje' },
          unit_amount: Math.round(PASJE_PRICE * 100),
        },
        quantity,
      });
    }

    if (onLocation) {
      line_items.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Locatietoeslag (praktijkdag op locatie)' },
          unit_amount: Math.round(LOCATION_SURCHARGE * 100),
        },
        quantity: 1,
      });
    }

    // Stripe metadata mag alleen strings bevatten en is beperkt in lengte (500 tekens per veld).
    const metadata = {
      pkg,
      qty: String(quantity),
      withPasje: String(!!withPasje),
      onLocation: String(!!onLocation),
      buyerFirst: buyer.first,
      buyerLast: buyer.last,
      buyerEmail: buyer.email,
      buyerCompany: buyer.company || '',
    };
    if (locationRequest) {
      metadata.locationRequest = JSON.stringify(locationRequest).slice(0, 490);
    }

    const siteUrl = process.env.SITE_URL || `${req.headers.origin || ''}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['ideal', 'card', 'bancontact'],
      customer_email: buyer.email,
      line_items,
      success_url: `${siteUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?payment=cancelled`,
      metadata,
      // Zet automatische facturatie aan als je facturen via Stripe wilt laten genereren i.p.v. de eigen factuurpagina:
      // invoice_creation: { enabled: true },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout session error:', err);
    return res.status(500).json({ error: 'Er ging iets mis bij het aanmaken van de betaling. Probeer het later opnieuw.' });
  }
}
