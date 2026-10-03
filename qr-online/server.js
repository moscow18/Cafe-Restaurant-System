/**
 * CafePro Online QR Menu & Cloud Real-Time Relay Server
 * 
 * Multi-Tenant Architecture:
 * - Each client/cafe has their own unique `store_slug` (e.g. 'cafe-alpha', 'cafe-beta').
 * - All SSE streams, customer menus, orders, and POS events are strictly isolated by `store_slug`.
 * - Zero polling: Instant push via Server-Sent Events (SSE).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3355;
const PUBLIC_DIR = path.join(__dirname, 'public');
const STORES_DIR = path.join(__dirname, 'stores');

if (!fs.existsSync(STORES_DIR)) {
  fs.mkdirSync(STORES_DIR, { recursive: true });
}

// ─── Real-Time Stream Registry (Scoped by store_slug) ─────────────────────────
// Map<store_slug, Set<ClientResponse>>
const tenantStreams = new Map();

function getStoreStreams(storeSlug) {
  const slug = (storeSlug || 'default').toLowerCase().trim();
  if (!tenantStreams.has(slug)) {
    tenantStreams.set(slug, new Set());
  }
  return tenantStreams.get(slug);
}

function broadcastToStore(storeSlug, eventName, data, filterFn) {
  const clients = getStoreStreams(storeSlug);
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      if (!filterFn || filterFn(client)) {
        client.res.write(payload);
      }
    } catch (err) {
      clients.delete(client);
    }
  }
}

// Heartbeat ping every 20 seconds
setInterval(() => {
  for (const [slug, clients] of tenantStreams.entries()) {
    for (const client of clients) {
      try {
        client.res.write(': ping\n\n');
      } catch (e) {
        clients.delete(client);
      }
    }
  }
}, 20000);

// ─── File-Based Store Database per Tenant ─────────────────────────────────────
function getStoreFilePath(storeSlug) {
  const safeSlug = (storeSlug || 'default').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return path.join(STORES_DIR, `${safeSlug}.json`);
}

function loadStoreData(storeSlug) {
  const filePath = getStoreFilePath(storeSlug);
  const defaultPath = path.join(STORES_DIR, 'default.json');
  let defaultData = null;
  if (fs.existsSync(defaultPath)) {
    try {
      defaultData = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'));
    } catch(e) {}
  }

  if (!fs.existsSync(filePath)) {
    const initial = defaultData ? {
      ...defaultData,
      store_slug: storeSlug,
      orders: [],
      order_sequence: 1
    } : {
      store_slug: storeSlug,
      store_name: 'كافيه ومطعم برو',
      currency: 'ج.م',
      service_mode: 'order',
      categories: [
        { id: 1, name: 'مشروبات ساخنة' },
        { id: 2, name: 'مشروبات باردة ومثلجة' },
        { id: 3, name: 'حلويات ومخبوزات' }
      ],
      products: [],
      tables: [
        { id: 1, name: 'طاولة 1' },
        { id: 2, name: 'طاولة 2' },
        { id: 3, name: 'طاولة 3' }
      ],
      orders: [],
      order_sequence: 1
    };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // If products array is empty but default has products, fill it in
    if ((!parsed.products || parsed.products.length === 0) && defaultData && defaultData.products && defaultData.products.length > 0) {
      parsed.products = defaultData.products;
      parsed.categories = defaultData.categories;
      fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
    }
    return parsed;
  } catch(e) {
    return { store_slug: storeSlug, orders: [] };
  }
}

function saveStoreData(storeSlug, data) {
  const filePath = getStoreFilePath(storeSlug);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Store-Slug');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = decodeURI(urlObj.pathname);
  const storeSlug = (urlObj.searchParams.get('store') || req.headers['x-store-slug'] || 'default').toLowerCase().trim();

  // 1. Real-Time SSE Stream (Tenant Isolated)
  if (pathname === '/api/realtime/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');

    const clientObj = {
      res,
      storeSlug,
      clientType: urlObj.searchParams.get('client') || 'all',
      orderId: urlObj.searchParams.get('order_id') ? Number(urlObj.searchParams.get('order_id')) : null
    };

    const streamSet = getStoreStreams(storeSlug);
    streamSet.add(clientObj);

    req.on('close', () => {
      streamSet.delete(clientObj);
    });
    return;
  }

  // 2. API Endpoints
  if (pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let parsed = {};
      try { if (body) parsed = JSON.parse(body); } catch(e) {}

      // Get Menu Data for this specific store
      if (pathname === '/api/qr-menu/data') {
        const store = loadStoreData(storeSlug);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          data: {
            categories: store.categories || [],
            services: store.products || [],
            tables: store.tables || [],
            storeInfo: {
              name: store.store_name,
              currency: store.currency,
              slug: store.store_slug
            }
          }
        }));
      }

      // Customer Submits Order (Online)
      if (pathname === '/api/qr-menu/submit-order') {
        const store = loadStoreData(storeSlug);
        const orderId = store.order_sequence || (store.orders.length + 1);
        store.order_sequence = orderId + 1;

        const orderNum = `QR-${String(orderId).padStart(4, '0')}`;
        const items = (parsed.items || []).map((it, idx) => ({
          id: idx + 1,
          order_id: orderId,
          service_id: it.service_id,
          service_name: it.service_name,
          price: parseFloat(it.price) || 0,
          quantity: parseInt(it.quantity) || 1,
          total: (parseFloat(it.price) || 0) * (parseInt(it.quantity) || 1),
          notes: it.notes || ''
        }));

        const total = items.reduce((s, it) => s + it.total, 0);

        const newOrder = {
          id: orderId,
          order_number: orderNum,
          table_id: parsed.table_id || null,
          table_name: parsed.table_name || 'طاولة',
          customer_name: parsed.customer_name || 'عميل طاولة',
          customer_phone: parsed.customer_phone || '',
          notes: parsed.notes || '',
          subtotal: total,
          total: total,
          status: 'pending',
          items: items,
          created_at: new Date().toISOString()
        };

        store.orders.unshift(newOrder);
        saveStoreData(storeSlug, store);

        // Instantly push event to the Desktop POS connected for this tenant ONLY
        broadcastToStore(storeSlug, 'new_order', newOrder, c => c.clientType === 'pos' || c.clientType === 'all');

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          order_id: orderId,
          order_number: orderNum,
          total: total,
          table_name: newOrder.table_name
        }));
      }

      // Get Order Status
      if (pathname === '/api/qr-menu/order-status') {
        const oId = Number(urlObj.searchParams.get('order_id') || parsed.order_id);
        const store = loadStoreData(storeSlug);
        const ord = (store.orders || []).find(o => o.id === oId);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        if (ord) {
          return res.end(JSON.stringify({ success: true, data: ord }));
        }
        return res.end(JSON.stringify({ success: false, error: 'الطلب غير موجود' }));
      }

      // POS: Approve Order
      if (pathname === '/api/qr-orders/approve') {
        const oId = Number(parsed.order_id);
        const store = loadStoreData(storeSlug);
        const ord = (store.orders || []).find(o => o.id === oId);
        if (ord) {
          ord.status = 'approved';
          ord.updated_at = new Date().toISOString();
          saveStoreData(storeSlug, store);

          // Real-Time Push to Customer's phone (0ms)
          broadcastToStore(storeSlug, 'order_status_changed', {
            order_id: oId,
            status: 'approved',
            order: ord
          });

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, data: ord }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: 'الطلب غير موجود' }));
      }

      // POS: Reject Order
      if (pathname === '/api/qr-orders/reject') {
        const oId = Number(parsed.order_id);
        const reason = parsed.reason || 'اعتذار الكاشير عن الطلب';
        const store = loadStoreData(storeSlug);
        const ord = (store.orders || []).find(o => o.id === oId);
        if (ord) {
          ord.status = 'rejected';
          ord.rejection_reason = reason;
          ord.updated_at = new Date().toISOString();
          saveStoreData(storeSlug, store);

          // Real-Time Push to Customer's phone
          broadcastToStore(storeSlug, 'order_status_changed', {
            order_id: oId,
            status: 'rejected',
            reason: reason
          });

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: 'الطلب غير موجود' }));
      }

      // Desktop POS Catalog Sync (Upload products from local SQLite to Cloud)
      if (pathname === '/api/sync/catalog') {
        const store = loadStoreData(storeSlug);
        if (parsed.categories) store.categories = parsed.categories;
        if (parsed.services) store.products = parsed.services;
        if (parsed.tables) store.tables = parsed.tables;
        if (parsed.store_name) store.store_name = parsed.store_name;
        saveStoreData(storeSlug, store);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, message: 'Catalog synced successfully' }));
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Route not found' }));
    });
    return;
  }

  // 3. Static Files (Customer Menu & Assets)
  let filePath;
  if (pathname.startsWith('/assets/')) {
    filePath = path.join(__dirname, '..', pathname);
  } else {
    filePath = path.join(PUBLIC_DIR, pathname === '/' || pathname === '/menu' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
  }[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[CafePro Cloud QR Server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[Multi-Tenant Ready] Independent folders per store in: ${STORES_DIR}`);
});
