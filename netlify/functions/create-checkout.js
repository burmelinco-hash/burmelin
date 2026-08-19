const https = require('https');

// ── AVAILABILITY ──────────────────────────────────────────────────────
//
// The browser already greys out sold-out sizes and colours, but that check
// lives in the page and can be edited away. This is the authoritative one.
//
// Mirrors the `variants` map written by the admin panel:
//   { "Navy": { "S": false } }
// A missing key means AVAILABLE — only an explicit false is sold out.

function isAvailable(p, colorName, sizeName) {
  const v = p && p.variants;
  if (!v || typeof v !== 'object') return true;
  const row = v[colorName || ''];
  if (!row || typeof row !== 'object') return true;
  return row[sizeName || ''] !== false;
}

function supabaseGet(url, key) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid response from Supabase')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Returns a list of human-readable descriptions of sold-out cart lines.
// Carts saved before this change carry no product id, so fall back to name.
function findSoldOut(items, products) {
  const byId   = new Map(products.map(p => [String(p.id), p]));
  const byName = new Map(products.map(p => [String(p.name).trim().toLowerCase(), p]));

  const bad = [];
  for (const item of items) {
    const p = (item.id && byId.get(String(item.id)))
           || byName.get(String(item.name || '').trim().toLowerCase());

    // Unknown product: leave it alone rather than block a legitimate sale.
    if (!p) continue;

    const hasSizes = Array.isArray(p.sizes) && p.sizes.length;
    if (!isAvailable(p, item.color || '', hasSizes ? (item.size || '') : '')) {
      bad.push([p.name, item.color, item.size].filter(Boolean).join(' · '));
    }
  }
  return bad;
}

function stripeRequest(secretKey, bodyStr) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.stripe.com',
      path: '/v1/checkout/sessions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid response from Stripe: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'STRIPE_SECRET_KEY is not set in Netlify environment variables.' }),
    };
  }

  try {
    const { items, origin, orderId } = JSON.parse(event.body);

    if (!items || !items.length) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Cart is empty' }),
      };
    }

    // Re-check availability against the database before taking any money.
    // If Supabase is unreachable we let the sale through rather than block
    // every customer on an outage - the admin panel stays the source of truth.
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_ANON_KEY;
    if (sbUrl && sbKey) {
      try {
        const products = await supabaseGet(
          sbUrl + '/rest/v1/products?select=id,name,sizes,variants', sbKey
        );
        if (Array.isArray(products)) {
          const soldOut = findSoldOut(items, products);
          if (soldOut.length) {
            return {
              statusCode: 409,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                error: 'Sold out: ' + soldOut.join(', ') +
                       '. Please remove it from your cart and try again.',
                soldOut,
              }),
            };
          }
        }
      } catch (e) {
        console.error('Availability check skipped:', e.message);
      }
    }

    const baseUrl = origin || process.env.URL || 'https://burmelin.com';

    const params = {};
    params['mode'] = 'payment';
    params['success_url'] = baseUrl + '/success.html?session_id={CHECKOUT_SESSION_ID}';
    params['cancel_url'] = baseUrl + '/products.html';
    params['phone_number_collection[enabled]'] = 'true';
    if (orderId) params['metadata[order_id]'] = orderId;

    const countries = ['TH','US','GB','AU','SG','MY','DE','FR','JP','HK','TW','KR','AE','SA','CN','NL','IT','ES','CA','NZ','SE','CH','DK','NO'];
    countries.forEach((c, i) => {
      params['shipping_address_collection[allowed_countries][' + i + ']'] = c;
    });

    items.forEach((item, i) => {
      params['line_items[' + i + '][price_data][currency]'] = 'thb';
      params['line_items[' + i + '][price_data][product_data][name]'] = item.name;
      params['line_items[' + i + '][price_data][product_data][description]'] = 'Color: ' + item.color + ' | Size: ' + item.size;
      params['line_items[' + i + '][price_data][unit_amount]'] = String(Math.round(item.price * 100));
      params['line_items[' + i + '][quantity]'] = String(item.qty || item.quantity || 1);
      if (item.img) {
        params['line_items[' + i + '][price_data][product_data][images][0]'] = item.img;
      }
    });

    const bodyStr = Object.entries(params)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&');

    const session = await stripeRequest(secretKey, bodyStr);

    if (session.error) {
      throw new Error(session.error.message);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };

  } catch (err) {
    console.error('Checkout error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
