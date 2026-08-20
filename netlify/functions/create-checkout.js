const https = require('https');

// ── SHIPPING ───────────────────────────────────────────
//
// Shipping is free, in Thailand and worldwide.
//
// Both options cost 0. They exist as two entries so the customer sees a
// realistic delivery window for where they are, and so the name they pick
// is recorded on the order. Hosted Checkout fixes these when the session is
// created and cannot vary them by the address typed inside Checkout, so the
// customer self-selects.
const SHIPPING_OPTIONS = [
  { name: 'Free Shipping — Thailand',      min: 1, max: 3  },
  { name: 'Free Shipping — International', min: 7, max: 21 },
];

// Every destination Stripe accepts for shipping_address_collection.
// Stripe rejects the whole session if any code is unsupported, so the
// handful it excludes (sanctioned and a few US minor territories) are
// deliberately left out: AS CC CX CU HM IR KP MH FM NF MP PW SY UM VI.
// Verified against Stripe's allowed_countries enum - this is all 238.
// Known-good subset, used only if Stripe rejects the full list above.
const CORE_COUNTRIES = ['TH','US','GB','AU','SG','MY','DE','FR','JP','HK','TW','KR',
  'AE','SA','CN','NL','IT','ES','CA','NZ','SE','CH','DK','NO'];

const SHIPPING_COUNTRIES = [
  'AC','AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS',
  'BT','BV','BW','BY','BZ','CA','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO',
  'CR','CV','CW','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER',
  'ES','ET','FI','FJ','FK','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL',
  'GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HN','HR','HT','HU','ID',
  'IE','IL','IM','IN','IO','IQ','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI',
  'KM','KN','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV',
  'LY','MA','MC','MD','ME','MF','MG','MK','ML','MM','MN','MO','MQ','MR','MS','MT',
  'MU','MV','MW','MX','MY','MZ','NA','NC','NE','NG','NI','NL','NO','NP','NR','NU',
  'NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PY','QA',
  'RE','RO','RS','RU','RW','SA','SB','SC','SE','SG','SH','SI','SJ','SK','SL','SM',
  'SD','SN','SO','SR','SS','ST','SV','SX','SZ','TA','TC','TD','TF','TG','TH','TJ','TK',
  'TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','US','UY','UZ','VA','VC',
  'VE','VG','VN','VU','WF','WS','XK','YE','YT','ZA','ZM','ZW','ZZ',
];

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
    // Service key so the price check still sees every product once RLS is on
    // (the public policy exposes active products only). Falls back to anon.
    const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
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

    SHIPPING_COUNTRIES.forEach((c, i) => {
      params['shipping_address_collection[allowed_countries][' + i + ']'] = c;
    });

    // Shipping is free everywhere. Two options rather than one so the
    // customer sees an honest delivery estimate for where they are, and so
    // the chosen name lands on the order to say which service to use.
    // Stripe allows at most 5 shipping_options on a session.
    SHIPPING_OPTIONS.forEach((opt, i) => {
      const k = 'shipping_options[' + i + '][shipping_rate_data]';
      params[k + '[type]']                     = 'fixed_amount';
      params[k + '[fixed_amount][amount]']     = '0';
      params[k + '[fixed_amount][currency]']   = 'thb';
      params[k + '[display_name]']             = opt.name;
      params[k + '[delivery_estimate][minimum][unit]']  = 'business_day';
      params[k + '[delivery_estimate][minimum][value]'] = String(opt.min);
      params[k + '[delivery_estimate][maximum][unit]']  = 'business_day';
      params[k + '[delivery_estimate][maximum][value]'] = String(opt.max);
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

    const encode = obj => Object.entries(obj)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&');

    let session = await stripeRequest(secretKey, encode(params));

    // The worldwide country list is long, and Stripe rejects the entire
    // session if it does not recognise even one code. Rather than let that
    // take checkout down, fall back to the short list that was in use before
    // and try once more. A customer in a rare destination loses the option;
    // everyone else still gets through.
    if (session.error && /countr/i.test(session.error.message || '')) {
      console.error('Falling back to core shipping countries:', session.error.message);
      Object.keys(params)
        .filter(k => k.startsWith('shipping_address_collection'))
        .forEach(k => delete params[k]);
      CORE_COUNTRIES.forEach((c, i) => {
        params['shipping_address_collection[allowed_countries][' + i + ']'] = c;
      });
      session = await stripeRequest(secretKey, encode(params));
    }

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
