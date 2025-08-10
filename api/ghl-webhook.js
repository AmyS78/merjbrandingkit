// api/ghl-webhook.js
export default async function handler(req, res) {
  // Allow only POST (forms/webhooks)
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Read JSON body from GHL (or your form)
    const intake = req.body || {};

    // Minimal validation (tweak as you like)
    const business_name = intake.business_name || intake.businessName || 'Unknown Business';
    const business_desc = intake.business_desc || '';
    const products_services = intake.products_services || '';

    // TODO: put your real processing here (call your pipeline, email, etc.)
    // For now we return a simple “echo” so you can confirm end-to-end works.
    const result = {
      received_at: new Date().toISOString(),
      business_name,
      business_desc,
      products_services,
    };

    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
