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

// Resolves each cart line against the database.
//
// Two jobs at once:
//   * flag sold-out variants
//   * pin the price to the database row, because item.price arrives from
//     the browser and cannot be trusted
//
// Carts saved before the id was added carry only a name, so fall back to it.
// A line with no matching row keeps its posted price - index.html sells a
// hardcoded featured shirt, and both listings fall back to a built-in
// PRODUCTS array when Supabase is unreachable, so refusing unknown names
// would break real sales.
function resolveCart(items, products) {
  const byId   = new Map(products.map(p => [String(p.id), p]));
  const byName = new Map(products.map(p => [String(p.name).trim().toLowerCase(), p]));

  const soldOut = [];
  const prices  = [];

  items.forEach((item, i) => {
    const p = (item.id && byId.get(String(item.id)))
           || byName.get(String(item.name || '').trim().toLowerCase());

    if (!p) { prices[i] = null; return; }

    const hasSizes = Array.isArray(p.sizes) && p.sizes.length;
    if (!isAvailable(p, item.color || '', hasSizes ? (item.size || '') : '')) {
      soldOut.push([p.name, item.color, item.size].filter(Boolean).join(' · '));
    }

    const dbPrice = Number(p.price);
    prices[i] = Number.isFinite(dbPrice) && dbPrice >= 0 ? dbPrice : null;
  });

  return { soldOut, prices };
}

// The posted price is only ever a fallback, and never a negative or
// nonsensical one.
function safePrice(posted) {
  const n = Number(posted);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function safeQty(posted) {
  const n = parseInt(posted, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 99);
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
    // Prices resolved from the database, by cart index. A null entry means
    // the line had no matching row and keeps its posted price.
    let dbPrices = [];

    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_ANON_KEY;
    if (sbUrl && sbKey) {
      try {
        const products = await supabaseGet(
          sbUrl + '/rest/v1/products?select=id,name,price,sizes,variants', sbKey
        );
        if (Array.isArray(products)) {
          const { soldOut, prices } = resolveCart(items, products);
          dbPrices = prices;
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
      // Database price wins; the posted one is only used for lines with no
      // matching row, so a tampered cart cannot set its own price.
      const unitPrice = dbPrices[i] != null ? dbPrices[i] : safePrice(item.price);

      params['line_items[' + i + '][price_data][currency]'] = 'thb';
      params['line_items[' + i + '][price_data][product_data][name]'] = item.name;
      params['line_items[' + i + '][price_data][product_data][description]'] = 'Color: ' + item.color + ' | Size: ' + item.size;
      params['line_items[' + i + '][price_data][unit_amount]'] = String(Math.round(unitPrice * 100));
      params['line_items[' + i + '][quantity]'] = String(safeQty(item.qty || item.quantity));
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
