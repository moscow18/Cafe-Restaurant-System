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
    const sb = getSupabase();
    if (!sb) return null;

    try {
      const orderRow = {
        order_number: orderPayload.order_number || `QR-${Math.floor(1000 + Math.random() * 9000)}`,
        table_id: String(orderPayload.table_id || ''),
        table_name: String(orderPayload.table_name || 'طاولة'),
        customer_name: String(orderPayload.customer_name || 'عميل'),
        customer_phone: String(orderPayload.customer_phone || ''),
        items: orderPayload.items || [],
        subtotal: parseFloat(orderPayload.subtotal) || 0,
        tax_amount: parseFloat(orderPayload.tax_amount) || 0,
        service_amount: parseFloat(orderPayload.service_amount) || 0,
        total: parseFloat(orderPayload.total) || 0,
        status: 'pending'
      };

      const { data, error } = await sb
        .from('qr_orders')
        .insert([orderRow])
        .select()
        .single();

      if (error) {
        console.warn('[Supabase submitOrder Error]', error);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('[Supabase submitOrder Exception]', err);
      return null;
    }
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
              // Ensure event belongs exclusively to this order ID
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
  async updateOrderStatus(orderId, newStatus, reason = '') {
    const sb = getSupabase();
    if (!sb || !orderId) return false;

    try {
      const updateData = { status: newStatus };
      if (reason) {
        updateData.rejection_reason = reason;
        updateData.notes = reason;
      }
      
      let res = await sb
        .from('qr_orders')
        .update(updateData)
        .eq('id', orderId);

      // If updating with rejection_reason threw error due to schema column missing, fallback to notes
      if (res.error && reason) {
        res = await sb
          .from('qr_orders')
          .update({ status: newStatus, notes: reason })
          .eq('id', orderId);
      }

      return !res.error;
    } catch (e) {
      console.warn('[Supabase updateOrderStatus Error]', e);
      return false;
    }
  },

  /**
   * Get single order status and details by ID
   */
  async getOrderStatus(orderId) {
    const sb = getSupabase();
    if (!sb || !orderId) return null;
    try {
      const { data, error } = await sb
        .from('qr_orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (error) return null;
      return data;
    } catch(e) {
      return null;
    }
  },

  /**
   * Fetch recent pending orders for cashier on startup
   */
  async getRecentOrders() {
    const sb = getSupabase();
    if (!sb) return [];

    try {
      const { data, error } = await sb
        .from('qr_orders')
        .select('*')
        .order('id', { ascending: false })
        .limit(20);

      if (error) return [];
      return data || [];
    } catch (e) {
      return [];
    }
  }
};

window.CafeSupabase = CafeSupabase;
// Auto-init on load if SDK present
if (typeof window !== 'undefined') {
  getSupabase();
}
