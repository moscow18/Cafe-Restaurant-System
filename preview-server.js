const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3344;
const BASE_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// ─── Persistent Python DB Bridge ──────────────────────────────────────────────
let pyProc = null;
const reqQueue = [];

function getPyProc() {
  if (pyProc && !pyProc.killed) return pyProc;
  const bridgePath = path.join(BASE_DIR, 'scripts', 'database_bridge.py');
  pyProc = spawn('python', [bridgePath], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });

  let buffer = '';
  pyProc.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf-8');
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line && reqQueue.length > 0) {
        const resolve = reqQueue.shift();
        try {
          resolve(JSON.parse(line));
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      }
    }
  });

  pyProc.on('exit', () => {
    pyProc = null;
    while (reqQueue.length > 0) {
      const resolve = reqQueue.shift();
      resolve({ success: false, error: 'Database bridge exited' });
    }
  });

  return pyProc;
}

function sendToBridge(payload) {
  return new Promise((resolve) => {
    try {
      const proc = getPyProc();
      reqQueue.push(resolve);
      proc.stdin.write(JSON.stringify(payload) + '\n');
    } catch(e) {
      resolve({ success: false, error: e.message });
    }
  });
}

// ─── Real-Time Push Engine (Server-Sent Events / SSE) ─────────────────────────
const sseClients = new Set();

function broadcastRealtimeEvent(event, data, filterFn) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      if (!filterFn || filterFn(client)) {
        client.res.write(payload);
      }
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Keep-alive ping every 20s
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.res.write(': ping\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 20000);

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = decodeURI(urlObj.pathname);

  // ─── Real-Time Stream (Server-Sent Events) ─────────────────────────────────
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
      clientType: urlObj.searchParams.get('client') || 'all',
      orderId: urlObj.searchParams.get('order_id') ? Number(urlObj.searchParams.get('order_id')) : null,
      storeSlug: urlObj.searchParams.get('store') || 'cafe-pro'
    };
    sseClients.add(clientObj);

    req.on('close', () => {
      sseClients.delete(clientObj);
    });
    return;
  }

  // ─── API Routes (Connected directly to SQLite DB) ──────────────────────────
  if (pathname === '/api/qr-image') {
    const text = urlObj.searchParams.get('text') || '';
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'text parameter required' }));
    }
    try {
      const QRCode = require('qrcode');
      const pngBuffer = await QRCode.toBuffer(text, {
        width: 320,
        margin: 2,
        color: { dark: '#121110', light: '#FFFFFF' }
      });
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      });
      return res.end(pngBuffer);
    } catch(err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (pathname === '/api/server-info') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: true,
      port: PORT,
      localIp: getLocalIp(),
      menuUrl: `http://${getLocalIp()}:${PORT}/menu`
    }));
  }

  if (pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let parsedBody = {};
      try { if (body) parsedBody = JSON.parse(body); } catch(e) {}

      let result = { success: false, error: 'Endpoint not found' };

      try {
        if (pathname === '/api/db/query') {
          result = await sendToBridge({ action: 'query', sql: parsedBody.sql, params: parsedBody.params || [] });
        } else if (pathname === '/api/db/queryOne') {
          result = await sendToBridge({ action: 'queryOne', sql: parsedBody.sql, params: parsedBody.params || [] });
        } else if (pathname === '/api/db/run') {
          result = await sendToBridge({ action: 'run', sql: parsedBody.sql, params: parsedBody.params || [] });
        } else if (pathname === '/api/db/preview-invoice-number') {
          result = await sendToBridge({ action: 'previewInvoiceNumber' });
        } else if (pathname === '/api/tables/list') {
          result = await sendToBridge({ action: 'tablesList' });
        } else if (pathname === '/api/tables/reserve') {
          result = await sendToBridge({ action: 'tablesReserve', ...parsedBody });
        } else if (pathname === '/api/tables/updateStatus') {
          result = await sendToBridge({ action: 'tablesUpdateStatus', ...parsedBody });
        } else if (pathname === '/api/tables/save') {
          result = await sendToBridge({ action: 'tablesSave', ...parsedBody });
        } else if (pathname === '/api/tables/delete') {
          result = await sendToBridge({ action: 'tablesDelete', ...parsedBody });
        } else if (pathname === '/api/db/settings') {
          result = await sendToBridge({ action: 'getSettings' });
        } else if (pathname === '/api/db/updateSettings') {
          result = await sendToBridge({ action: 'updateSettings', data: parsedBody });
        } else if (pathname === '/api/services/sizes') {
          const serviceId = urlObj.searchParams.get('serviceId');
          if (serviceId) {
            result = await sendToBridge({ action: 'getSizes', service_id: Number(serviceId) });
          } else {
            result = await sendToBridge({ action: 'getAllSizes' });
          }
        } else if (pathname === '/api/db/saveInvoice') {
          result = await sendToBridge({ action: 'saveInvoice', data: parsedBody.data, items: parsedBody.items });
        } else if (pathname === '/api/db/daily-report') {
          result = await sendToBridge({ action: 'getDailyReport', date: parsedBody.date });
        } else if (pathname === '/api/auth/login') {
          result = await sendToBridge({ action: 'authLogin', username: parsedBody.username, password: parsedBody.password });
        } else if (pathname === '/api/auth/session') {
          result = await sendToBridge({ action: 'authSession' });
        } else if (pathname === '/api/auth/logout') {
          result = await sendToBridge({ action: 'authLogout' });
        } else if (pathname === '/api/auth/verify-admin') {
          result = await sendToBridge({ action: 'verifyAdminPassword', password: parsedBody.password });
        } else if (pathname === '/api/qr-menu/data') {
          result = await sendToBridge({ action: 'qrMenuGetData' });
        } else if (pathname === '/api/qr-menu/submit-order') {
          result = await sendToBridge({ action: 'qrMenuSubmitOrder', data: parsedBody });
          if (result && result.success) {
            broadcastRealtimeEvent('new_order', {
              order_id: result.order_id,
              order_number: result.order_number,
              table_name: result.table_name,
              total: result.total,
              created_at: new Date().toISOString()
            });
          }
        } else if (pathname === '/api/qr-menu/order-status') {
          const orderId = urlObj.searchParams.get('order_id') || parsedBody.order_id;
          result = await sendToBridge({ action: 'qrMenuGetOrderStatus', order_id: Number(orderId) });
        } else if (pathname === '/api/qr-orders/pending') {
          result = await sendToBridge({ action: 'qrOrdersGetPending' });
        } else if (pathname === '/api/qr-orders/approve') {
          result = await sendToBridge({ action: 'qrOrdersApprove', order_id: Number(parsedBody.order_id) });
          if (result && result.success) {
            broadcastRealtimeEvent('order_status_changed', {
              order_id: Number(parsedBody.order_id),
              status: 'approved',
              order: result.data
            });
          }
        } else if (pathname === '/api/qr-orders/reject') {
          result = await sendToBridge({ action: 'qrOrdersReject', order_id: Number(parsedBody.order_id), reason: parsedBody.reason || '' });
          if (result && result.success) {
            broadcastRealtimeEvent('order_status_changed', {
              order_id: Number(parsedBody.order_id),
              status: 'rejected',
              reason: parsedBody.reason || ''
            });
          }
        } else if (pathname === '/api/qr-orders/update-status') {
          result = await sendToBridge({ action: 'qrOrdersUpdateStatus', order_id: Number(parsedBody.order_id), status: parsedBody.status });
          if (result && result.success) {
            broadcastRealtimeEvent('order_status_changed', {
              order_id: Number(parsedBody.order_id),
              status: parsedBody.status,
              order: result.data
            });
          }
        }
      } catch(e) {
        result = { success: false, error: e.message };
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  // ─── Static File Serving ───────────────────────────────────────────────────
  let reqPath = pathname;
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/renderer/login.html';
  } else if (reqPath === '/menu' || reqPath === '/qr' || reqPath === '/qr-menu') {
    reqPath = '/renderer/qr-menu.html';
  }

  const filePath = path.join(BASE_DIR, reqPath);

  // Security check
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

function getLocalIp() {
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIp = getLocalIp();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Preview Server] Connected to SQLite DB & Running at http://127.0.0.1:${PORT}/renderer/main-dashboard.html`);
  console.log(`[QR Digital Menu] Customer Mobile Menu available at: http://${localIp}:${PORT}/menu`);
});
