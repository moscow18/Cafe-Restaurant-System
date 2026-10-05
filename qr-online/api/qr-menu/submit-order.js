// Vercel Serverless Function: /api/qr-menu/submit-order
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const orderPayload = (typeof req.body === 'string') ? JSON.parse(req.body) : (req.body || {});

    let customerName = (orderPayload.customer_name || 'عميل').trim();
    const generalNote = (orderPayload.notes || '').trim();
    if (generalNote) {
      customerName = `${customerName} (${generalNote})`;
    }

    const rawItems = Array.isArray(orderPayload.items) ? orderPayload.items : [];
    const itemsList = rawItems.map((it, idx) => ({
      id: it.id || it.service_id || idx + 1,
      name: it.display_name || it.service_name || it.name || 'صنف',
      service_name: it.service_name || it.name || 'صنف',
      display_name: it.display_name || it.service_name || it.name || 'صنف',
      price: parseFloat(it.price || it.unit_price) || 0,
      quantity: parseInt(it.quantity || it.qty, 10) || 1,
      line_total: parseFloat(it.line_total) || ((parseFloat(it.price || it.unit_price) || 0) * (parseInt(it.quantity || it.qty, 10) || 1)),
      notes: it.notes || ''
    }));

    if (generalNote && itemsList.length > 0 && !itemsList[0].notes) {
      itemsList[0].notes = `ملاحظة: ${generalNote}`;
    }

    const orderRow = {
      order_number: orderPayload.order_number || `QR-${Math.floor(1000 + Math.random() * 9000)}`,
      table_id: String(orderPayload.table_id || ''),
      table_name: String(orderPayload.table_name || 'طاولة'),
      customer_name: customerName,
      customer_phone: String(orderPayload.customer_phone || ''),
      items: itemsList,
      subtotal: parseFloat(orderPayload.subtotal) || 0,
      tax_amount: parseFloat(orderPayload.tax_amount) || 0,
      service_amount: parseFloat(orderPayload.service_amount) || 0,
      total: parseFloat(orderPayload.total) || 0,
      status: 'pending'
    };

    const SUPABASE_URL = 'https://xscozuclfrftorflsobh.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzY296dWNsZnJmdG9yZmxzb2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMzA4MzgsImV4cCI6MjEwNjYwNjgzOH0.v9fw6cFScrLybSat1MQe9Kr-WqC-N9WpwHUcaWXoOg8';

    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/qr_orders`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify([orderRow])
    });

    if (!sbRes.ok) {
      const errText = await sbRes.text();
      return res.status(500).json({ success: false, error: errText });
    }

    const created = await sbRes.json();
    const orderData = created && created[0];

    return res.status(200).json({
      success: true,
      order_id: orderData.id,
      id: orderData.id,
      order_number: orderData.order_number,
      table_id: orderData.table_id,
      table_name: orderData.table_name,
      customer_name: orderData.customer_name,
      status: orderData.status,
      items: orderData.items,
      total: orderData.total
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
