const https = require('https');

function stripeGet(secretKey, sessionId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.stripe.com',
      path: '/v1/checkout/sessions/' + sessionId + '?expand[]=line_items&expand[]=customer_details',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + secretKey }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function patchSupabase(supabaseUrl, serviceKey, orderId, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(supabaseUrl + '/rest/v1/orders?order_id=eq.' + encodeURIComponent(orderId));
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendWhatsApp(phone, message) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: message } });
    // WhatsApp notification via simple HTTPS (optional — resolve silently if not configured)
    resolve();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secretKey   = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) return { statusCode: 500, body: 'STRIPE_SECRET_KEY not set' };

  let stripeEvent;

  // Verify webhook signature if secret is configured
  if (webhookSecret) {
    const sig = event.headers['stripe-signature'];
    try {
      // Manual signature verification (no stripe npm package needed)
      const payload = event.body;
      const parts = sig.split(',').reduce((acc, part) => {
        const [k, v] = part.split('=');
        acc[k] = v;
        return acc;
      }, {});

      const timestamp = parts['t'];
      const crypto = require('crypto');
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(timestamp + '.' + payload)
        .digest('hex');

      if (!parts['v1'] || parts['v1'] !== expectedSig) {
        return { statusCode: 400, body: 'Invalid signature' };
      }
    } catch (e) {
      return { statusCode: 400, body: 'Signature error: ' + e.message };
    }
  }

  try {
    stripeEvent = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: 'Ignored event: ' + stripeEvent.type };
  }

  try {
    const session  = await stripeGet(secretKey, stripeEvent.data.object.id);
    const customer = session.customer_details || {};
    const shipping = session.shipping_details || session.customer_details || {};
    const addr     = shipping.address || customer.address || {};
    const orderId  = session.metadata && session.metadata.order_id;

    const fullAddress = [
      addr.line1, addr.line2, addr.city,
      addr.state, addr.postal_code, addr.country
    ].filter(Boolean).join(', ');

    const amountPaid = ((session.amount_total || 0) / 100).toLocaleString();

    // Save full customer details to Supabase
    if (orderId && supabaseUrl && serviceKey) {
      await patchSupabase(supabaseUrl, serviceKey, orderId, {
        customer_name: customer.name || 'Stripe Customer',
        email:         customer.email || '',
        phone:         customer.phone || '',
        address:       fullAddress,
        status:        'Processing'
      });
    }

    console.log(`Order ${orderId} completed — ${customer.name} — ฿${amountPaid} — ${fullAddress}`);

    return { statusCode: 200, body: JSON.stringify({ received: true, orderId }) };
  } catch (err) {
    console.error('Webhook error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
