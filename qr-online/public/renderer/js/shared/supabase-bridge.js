'use strict';

/**
 * CafePro Supabase Cloud Realtime Bridge
 * Enables 24/7 instant cross-device sync between Mobile QR Menus, Cashier POS, and Dashboard.
 */

const SUPABASE_CONFIG = {
  url: 'https://xscozuclfrftorflsobh.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzY296dWNsZnJmdG9yZmxzb2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMzA4MzgsImV4cCI6MjEwNjYwNjgzOH0.v9fw6cFScrLybSat1MQe9Kr-WqC-N9WpwHUcaWXoOg8'
};

let _supabaseInstance = null;

function getSupabase() {
  if (_supabaseInstance) return _supabaseInstance;
  if (typeof window !== 'undefined' && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    try {
      _supabaseInstance = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
      window.supabaseClient = _supabaseInstance;
      return _supabaseInstance;
    } catch(e) {
      console.warn('[Supabase Init Error]', e);
    }
  }
  return null;
}

const CafeSupabase = {
  getClient: getSupabase,

  /**
   * Submit an order from customer phone QR menu
   */
  async submitOrder(orderPayload) {
    if (!orderPayload) return null;

    // Attach any customer notes to customer_name to ensure cashier sees it clearly without schema issues
    let customerName = (orderPayload.customer_name || 'عميل').trim();
    const generalNote = (orderPayload.notes || '').trim();
    if (generalNote) {
      customerName = `${customerName} (${generalNote})`;
    }

    // Ensure items have proper structure
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

    // If there's a general note, also add it to first item for kitchen visibility
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

    // 1. Try Supabase Client SDK first
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('qr_orders')
          .insert([orderRow])
          .select()
          .single();

        if (!error && data && data.id) {
          return data;
        }
        if (error) {
          console.warn('[Supabase SDK submitOrder Error]', error);
        }
      } catch (err) {
        console.warn('[Supabase SDK submitOrder Exception]', err);
      }
    }

    // 2. Direct REST Fallback (Zero dependencies, 100% reliable on cellular 4G/5G mobile data)
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/qr_orders`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify([orderRow])
      });

      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          return rows[0];
        }
      } else {
        const errText = await res.text();
        console.warn('[Supabase REST submitOrder Error]', res.status, errText);
      }
    } catch (fetchErr) {
      console.warn('[Supabase REST submitOrder Exception]', fetchErr);
    }

    return null;
  },

  /**
   * Subscribe customer phone to order status updates
   */
  subscribeToOrderStatus(orderId, onUpdate) {
    const sb = getSupabase();
    if (!sb || !orderId) return null;

    try {
      const channel = sb
        .channel(`order-track-${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'qr_orders',
            filter: `id=eq.${orderId}`
          },
          (payload) => {
            if (payload && payload.new && typeof onUpdate === 'function') {
              if (String(payload.new.id) !== String(orderId)) return;
              onUpdate(payload.new);
            }
          }
        )
        .subscribe();

      return channel;
    } catch(e) {
      console.warn('[Supabase subscribeToOrderStatus Error]', e);
      return null;
    }
  },

  /**
   * Cashier POS subscription: Listen for incoming table orders in real-time
   */
  subscribeToIncomingOrders(onNewOrder) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
      const channel = sb
        .channel('kitchen-realtime-feed')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'qr_orders'
          },
          (payload) => {
            if (payload && payload.new && typeof onNewOrder === 'function') {
              onNewOrder(payload.new);
            }
          }
        )
        .subscribe();

      return channel;
    } catch (e) {
      console.warn('[Supabase subscribeToIncomingOrders Error]', e);
      return null;
    }
  },

  /**
   * Update order status (approved, preparing, completed, rejected)
   */
  async updateOrderStatus(orderId, newStatus) {
    if (!orderId) return false;
    const sb = getSupabase();
    const updateData = { status: newStatus };

    if (sb) {
      try {
        const res = await sb
          .from('qr_orders')
          .update(updateData)
          .eq('id', orderId);

        if (!res.error) return true;
      } catch (e) {
        console.warn('[Supabase updateOrderStatus Error]', e);
      }
    }

    // Direct REST fallback
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/qr_orders?id=eq.${orderId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      return res.ok;
    } catch (e) {
      console.warn('[Supabase REST updateOrderStatus Error]', e);
      return false;
    }
  },

  /**
   * Get single order status and details by ID
   */
  async getOrderStatus(orderId) {
    if (!orderId) return null;
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('qr_orders')
          .select('*')
          .eq('id', orderId)
          .maybeSingle();

        if (!error && data) return data;
      } catch(e) {}
    }

    // Direct REST fallback
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/qr_orders?id=eq.${orderId}&select=*`, {
        headers: {
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
        }
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) return rows[0];
      }
    } catch(e) {}
    return null;
  },

  /**
   * Fetch recent pending orders for cashier on startup or polling
   */
  async getRecentOrders(limit = 20) {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('qr_orders')
          .select('*')
          .order('id', { ascending: false })
          .limit(limit);

        if (!error && Array.isArray(data)) return data;
      } catch (e) {}
    }

    // Direct REST fallback
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/qr_orders?select=*&order=id.desc&limit=${limit}`, {
        headers: {
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
        }
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) return rows;
      }
    } catch(e) {}
    return [];
  }
};

window.CafeSupabase = CafeSupabase;
// Auto-init on load if SDK present
if (typeof window !== 'undefined') {
  getSupabase();
}
