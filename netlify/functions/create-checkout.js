const https = require('https');

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
