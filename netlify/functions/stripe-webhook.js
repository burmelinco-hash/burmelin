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

function sendEmailNotification(resendKey, order) {
  return new Promise((resolve, reject) => {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f7f5f1;padding:32px;border-radius:12px">
        <div style="background:#0054A5;padding:20px 28px;border-radius:8px;margin-bottom:24px">
          <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:2px">BURMELIN</h1>
          <p style="color:rgba(255,255,255,.6);margin:4px 0 0;font-size:12px">New Order Received</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:8px;margin-bottom:16px">
          <h2 style="color:#111;margin:0 0 16px;font-size:16px">🛍️ New Order — ฿${order.amount}</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 0;color:#666;width:140px">Order ID</td><td style="padding:8px 0;font-weight:600">${order.orderId}</td></tr>
            <tr style="border-top:1px solid #eee"><td style="padding:8px 0;color:#666">Customer</td><td style="padding:8px 0;font-weight:600">${order.name}</td></tr>
            <tr style="border-top:1px solid #eee"><td style="padding:8px 0;color:#666">Email</td><td style="padding:8px 0">${order.email}</td></tr>
            <tr style="border-top:1px solid #eee"><td style="padding:8px 0;color:#666">Phone</td><td style="padding:8px 0">${order.phone}</td></tr>
            <tr style="border-top:1px solid #eee"><td style="padding:8px 0;color:#666">Shipping To</td><td style="padding:8px 0">${order.address}</td></tr>
            <tr style="border-top:1px solid #eee"><td style="padding:8px 0;color:#666">Amount Paid</td><td style="padding:8px 0;font-weight:700;color:#0054A5;font-size:16px">฿${order.amount}</td></tr>
          </table>
        </div>
        <div style="text-align:center;margin-top:20px">
          <a href="https://burmelin.com/admin.html" style="background:#0054A5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px">View in Admin Panel</a>
        </div>
        <p style="color:#999;font-size:11px;text-align:center;margin-top:20px">BURMELIN · Bangkok, Thailand</p>
      </div>`;

    const body = JSON.stringify({
      from: 'BURMELIN Orders <orders@burmelin.com>',
      to: ['burmelinco@gmail.com'],
      subject: `New Order ฿${order.amount} — ${order.name}`,
      html
    });

    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
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

function sendCustomerEmail(resendKey, order) {
  return new Promise((resolve, reject) => {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f7f5f1">

        <!-- Header -->
        <div style="background:#0054A5;padding:28px 32px 24px">
          <div style="font-size:26px;font-weight:700;letter-spacing:4px;color:#fff">BURMELIN</div>
          <div style="width:40px;height:2px;background:#C9A96E;margin:10px 0 0"></div>
        </div>

        <!-- Hero -->
        <div style="background:#fff;padding:36px 32px 28px;border-bottom:3px solid #C9A96E">
          <div style="font-size:13px;letter-spacing:3px;color:#C9A96E;text-transform:uppercase;margin-bottom:12px">Order Confirmed</div>
          <h1 style="margin:0 0 12px;font-size:24px;color:#111118;font-weight:700">Thank you, ${order.name.split(' ')[0]}.</h1>
          <p style="margin:0;color:#555;font-size:15px;line-height:1.6">Your order has been received and is being prepared with care. We will have it ready and dispatched within <strong>1–3 business days</strong>.</p>
        </div>

        <!-- Order Summary -->
        <div style="background:#fff;margin-top:2px;padding:28px 32px">
          <div style="font-size:11px;letter-spacing:2px;color:#999;text-transform:uppercase;margin-bottom:16px">Order Summary</div>
          <table style="width:100%;border-collapse:collapse">
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:12px 0;color:#111;font-size:14px">${order.items}</td>
              <td style="padding:12px 0;color:#0054A5;font-size:14px;font-weight:700;text-align:right">฿${order.amount}</td>
            </tr>
            <tr>
              <td style="padding:12px 0;color:#999;font-size:13px">Receipt</td>
              <td style="padding:12px 0;color:#555;font-size:13px;text-align:right">#${order.receiptId}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#999;font-size:13px">Shipping to</td>
              <td style="padding:4px 0;color:#555;font-size:13px;text-align:right">${order.address || 'Address on file'}</td>
            </tr>
          </table>
        </div>

        <!-- What happens next -->
        <div style="background:#0054A5;margin:2px 0;padding:28px 32px">
          <div style="font-size:11px;letter-spacing:2px;color:#C9A96E;text-transform:uppercase;margin-bottom:20px">What Happens Next</div>
          <div style="display:flex;margin-bottom:16px">
            <div style="width:28px;height:28px;border-radius:50%;background:#C9A96E;color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:28px;flex-shrink:0;margin-right:14px">1</div>
            <div style="color:rgba(255,255,255,.85);font-size:14px;padding-top:4px">Our team carefully prepares and quality-checks your item.</div>
          </div>
          <div style="display:flex;margin-bottom:16px">
            <div style="width:28px;height:28px;border-radius:50%;background:#C9A96E;color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:28px;flex-shrink:0;margin-right:14px">2</div>
            <div style="color:rgba(255,255,255,.85);font-size:14px;padding-top:4px">Your order is dispatched within 1–3 business days.</div>
          </div>
          <div style="display:flex">
            <div style="width:28px;height:28px;border-radius:50%;background:#C9A96E;color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:28px;flex-shrink:0;margin-right:14px">3</div>
            <div style="color:rgba(255,255,255,.85);font-size:14px;padding-top:4px">We'll notify you with tracking details once shipped.</div>
          </div>
        </div>

        <!-- Contact -->
        <div style="background:#fff;margin-top:2px;padding:28px 32px">
          <div style="font-size:11px;letter-spacing:2px;color:#999;text-transform:uppercase;margin-bottom:14px">Need Help?</div>
          <p style="color:#555;font-size:14px;margin:0 0 10px">We're here for you — reach out anytime.</p>
          <a href="https://wa.me/66835398811" style="display:inline-block;background:#25D366;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;margin-right:10px">WhatsApp Us</a>
          <a href="mailto:burmelinco@gmail.com" style="display:inline-block;background:#f0f0f0;color:#333;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Email Us</a>
        </div>

        <!-- Footer -->
        <div style="padding:20px 32px;text-align:center">
          <div style="font-size:13px;letter-spacing:3px;color:#0054A5;font-weight:700;margin-bottom:4px">BURMELIN</div>
          <div style="font-size:11px;color:#aaa">Bangkok, Thailand · burmelin.com</div>
          <div style="font-size:11px;color:#ccc;margin-top:12px">This email confirms your order. For payment queries, refer to your Stripe receipt.</div>
        </div>

      </div>`;

    const body = JSON.stringify({
      from: 'BURMELIN <orders@burmelin.com>',
      to: [order.email],
      subject: `Your BURMELIN order is confirmed — ฿${order.amount}`,
      html
    });

    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secretKey     = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl   = process.env.SUPABASE_URL;
  const serviceKey    = process.env.SUPABASE_SERVICE_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const resendKey     = process.env.RESEND_API_KEY;

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

    // Send owner notification
    if (resendKey) {
      try {
        await sendEmailNotification(resendKey, {
          orderId: orderId || 'N/A',
          name:    customer.name || 'Guest',
          email:   customer.email || '—',
          phone:   customer.phone || '—',
          address: fullAddress || '—',
          amount:  amountPaid
        });
        console.log('Owner notification sent');
      } catch(e) {
        console.error('Owner email failed:', e.message);
      }
    }

    // Send branded confirmation to customer
    if (resendKey && customer.email) {
      try {
        const lineItems = session.line_items && session.line_items.data
          ? session.line_items.data.map(i => `${i.description} × ${i.quantity}`).join(', ')
          : 'Your order';
        await sendCustomerEmail(resendKey, {
          name:      customer.name || 'Valued Customer',
          email:     customer.email,
          address:   fullAddress || '',
          amount:    amountPaid,
          receiptId: orderId || stripeEvent.data.object.id,
          items:     lineItems
        });
        console.log('Customer confirmation sent to', customer.email);
      } catch(e) {
        console.error('Customer email failed:', e.message);
      }
    }

    console.log(`Order ${orderId} completed — ${customer.name} — ฿${amountPaid} — ${fullAddress}`);

    return { statusCode: 200, body: JSON.stringify({ received: true, orderId }) };
  } catch (err) {
    console.error('Webhook error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
