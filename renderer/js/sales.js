/**
 * CafePro System — Sales & Invoices Management Module
 * Professional ERP Sales Operations, Invoice Auditing & Financial Settlements
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────
function navigate(page) {
  if (window.electron && window.electron.navigate) {
    window.electron.navigate(page);
  } else {
    window.location.href = page;
  }
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.classList.add('show'), 50);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

// ─── State Management ─────────────────────────────────────────────────────────
let allSales = [];
let allCustomers = [];
let currentPage = 1;
const pageSize = 50;
let totalMatchingRecords = 0;
let currentViewingInvoice = null;
let currentViewingItems = [];
let pendingPayInvoice = null;

// ─── Initialization ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initDateFilters();
  await loadCustomersDropdown();
  await loadSales();
});

function initDateFilters() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fromStr = thirtyDaysAgo.toISOString().split('T')[0];

  const salesFrom = document.getElementById('salesFrom');
  const salesTo = document.getElementById('salesTo');
  if (salesFrom) salesFrom.value = fromStr;
  if (salesTo) salesTo.value = today;
}

function setDatePreset(preset) {
  const today = new Date().toISOString().split('T')[0];
  const salesFrom = document.getElementById('salesFrom');
  const salesTo = document.getElementById('salesTo');
  if (!salesFrom || !salesTo) return;

  if (preset === 'today') {
    salesFrom.value = today;
    salesTo.value = today;
  } else if (preset === 'this_week') {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday or Saturday
    const startOfWeek = new Date(d.setDate(diff)).toISOString().split('T')[0];
    salesFrom.value = startOfWeek;
    salesTo.value = today;
  } else if (preset === 'this_month') {
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    salesFrom.value = firstDay;
    salesTo.value = today;
  } else if (preset === 'all') {
    salesFrom.value = '';
    salesTo.value = '';
  }

  currentPage = 1;
  loadSales();
}

async function loadCustomersDropdown() {
  try {
    const res = await window.db.query('SELECT id, name, phone FROM customers ORDER BY name ASC', []);
    if (res && res.success) {
      allCustomers = res.data || [];
      const sel = document.getElementById('salesCustomerFilter');
      if (sel) {
        sel.innerHTML = '<option value="">كل العملاء</option>' +
          allCustomers.map(c => `<option value="${c.id}">${c.name}${c.phone ? ' (' + c.phone + ')' : ''}</option>`).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load customers:', err);
  }
}

// ─── Query Sales & Invoices ───────────────────────────────────────────────────
async function loadSales(page = 1) {
  currentPage = page;
  const tbody = document.getElementById('salesTableBody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="12" class="table-empty">جارٍ تحميل بيانات الفواتير والمبيعات...</td></tr>';
  }

  const query = (document.getElementById('salesSearchInput')?.value || '').trim();
  const from = document.getElementById('salesFrom')?.value || '';
  const to = document.getElementById('salesTo')?.value || '';
  const customerId = document.getElementById('salesCustomerFilter')?.value || '';
  const paymentMethod = document.getElementById('salesMethodFilter')?.value || '';
  const invoiceType = document.getElementById('salesTypeFilter')?.value || '';
  const invoiceStatus = document.getElementById('salesStatusFilter')?.value || '';
  const debtStatus = document.getElementById('salesDebtFilter')?.value || '';

  let whereClauses = ['1=1'];
  let params = [];

  // Search by invoice number, customer name, phone, notes
  if (query) {
    whereClauses.push('(i.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR i.notes LIKE ?)');
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
  }

  // Date range
  if (from) {
    whereClauses.push('i.invoice_date >= ?');
    params.push(from);
  }
  if (to) {
    whereClauses.push('i.invoice_date <= ?');
    params.push(to);
  }

  // Customer filter
  if (customerId) {
    whereClauses.push('i.customer_id = ?');
    params.push(parseInt(customerId));
  }

  // Payment method
  if (paymentMethod) {
    whereClauses.push('i.payment_method = ?');
    params.push(paymentMethod);
  }

  // Invoice type (صالة / تيك أواي / دليفري)
  if (invoiceType) {
    whereClauses.push('i.invoice_type = ?');
    params.push(invoiceType);
  }

  // Invoice status
  if (invoiceStatus) {
    if (invoiceStatus === 'is_returned') {
      whereClauses.push('i.is_returned = 1');
    } else {
      whereClauses.push('i.status = ?');
      params.push(invoiceStatus);
    }
  }

  // Debt status
  if (debtStatus === 'paid') {
    whereClauses.push('i.remaining <= 0');
  } else if (debtStatus === 'unpaid') {
    whereClauses.push('i.remaining > 0');
  }

  const whereSql = whereClauses.join(' AND ');

  try {
    // 1. Fetch summary stats for all matching records
    const statsSql = `
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(i.net_total), 0) as total_sales,
        COALESCE(SUM(i.amount_paid), 0) as total_paid,
        COALESCE(SUM(CASE WHEN i.remaining > 0 THEN i.remaining ELSE 0 END), 0) as total_remaining,
        COALESCE(SUM(CASE WHEN i.is_returned = 1 THEN 1 ELSE 0 END), 0) as total_returned_count
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE ${whereSql}
    `;
    const statsRes = await window.db.queryOne(statsSql, params);
    if (statsRes && statsRes.success && statsRes.data) {
      updateSummaryStats(statsRes.data);
      totalMatchingRecords = statsRes.data.count || 0;
    }

    // 2. Fetch paginated records
    const offset = (currentPage - 1) * pageSize;
    const listSql = `
      SELECT i.*, 
             c.name as customer_name, 
             c.phone as customer_phone,
             e.name as employee_name,
             t.name as table_name,
             (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) as items_count,
             (i.net_total - COALESCE((SELECT SUM(total_returned) FROM returns WHERE original_invoice_id = i.id), 0)) as dynamic_net_total
      FROM invoices i 
      LEFT JOIN customers c ON i.customer_id = c.id 
      LEFT JOIN employees e ON i.employee_id = e.id
      LEFT JOIN tables t ON i.table_id = t.id
      WHERE ${whereSql}
      ORDER BY i.id DESC
      LIMIT ? OFFSET ?
    `;
    const listParams = [...params, pageSize, offset];
    const listRes = await window.db.query(listSql, listParams);

    if (listRes && listRes.success) {
      allSales = listRes.data || [];
      renderSalesTable(allSales);
      renderPagination();
    } else {
      showToast('تعذر جلب الفواتير: ' + (listRes?.error || ''), 'error');
    }
  } catch (err) {
    console.error('Failed to load sales data:', err);
    showToast('حدث خطأ أثناء تحميل الفواتير', 'error');
  }
}

function updateSummaryStats(stats) {
  const countEl = document.getElementById('statTotalInvoicesCount');
  const salesEl = document.getElementById('statTotalSalesAmount');
  const paidEl = document.getElementById('statTotalPaidAmount');
  const remEl = document.getElementById('statTotalRemainingAmount');
  const retEl = document.getElementById('statTotalReturnedCount');
  const resultPill = document.getElementById('salesResultCount');

  if (countEl) countEl.textContent = stats.count || 0;
  if (salesEl) salesEl.textContent = fmt(stats.total_sales || 0);
  if (paidEl) paidEl.textContent = fmt(stats.total_paid || 0);
  if (remEl) remEl.textContent = fmt(stats.total_remaining || 0);
  if (retEl) retEl.textContent = stats.total_returned_count || 0;
  if (resultPill) resultPill.textContent = `${stats.count || 0} فاتورة`;
}

function filterSales() {
  currentPage = 1;
  loadSales();
}

function resetSalesFilters() {
  const sInput = document.getElementById('salesSearchInput');
  const cSel = document.getElementById('salesCustomerFilter');
  const mSel = document.getElementById('salesMethodFilter');
  const tSel = document.getElementById('salesTypeFilter');
  const stSel = document.getElementById('salesStatusFilter');
  const dSel = document.getElementById('salesDebtFilter');

  if (sInput) sInput.value = '';
  if (cSel) cSel.value = '';
  if (mSel) mSel.value = '';
  if (tSel) tSel.value = '';
  if (stSel) stSel.value = '';
  if (dSel) dSel.value = '';

  initDateFilters();
  currentPage = 1;
  loadSales();
}

// ─── Render Sales Data Table ──────────────────────────────────────────────────
function renderSalesTable(sales) {
  const tbody = document.getElementById('salesTableBody');
  if (!tbody) return;

  if (!sales.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="table-empty">
          <div style="padding:24px 0; color:var(--supp-text-muted);">
            لا توجد فواتير مطابقة لمعايير البحث والتصفية
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const offset = (currentPage - 1) * pageSize;

  tbody.innerHTML = sales.map((inv, idx) => {
    const netTotal = Number(inv.net_total || 0);
    const amountPaid = Number(inv.amount_paid || 0);
    const remaining = Number(inv.remaining || 0);
    const isReturned = inv.is_returned === 1;

    // Invoice Status Badge
    let statusBadge = '<span class="badge badge-neutral">مفتوحة</span>';
    if (isReturned) {
      statusBadge = '<span class="badge badge-danger">مرتجع</span>';
    } else if (inv.status === 'محاسَبة') {
      statusBadge = '<span class="badge badge-success">محاسَبة</span>';
    } else if (inv.status === 'مرسلة للمطبخ') {
      statusBadge = '<span class="badge badge-warning">بالمطبخ</span>';
    }

    // Payment Status Badge
    let debtBadge = remaining <= 0 
      ? '<span class="badge badge-success">مسددة</span>'
      : `<span class="badge badge-danger" title="متبقي دين">متبقي: ${fmt(remaining)}</span>`;

    // Order type representation
    let rawType = inv.invoice_type || 'صالة';
    let orderBadge = '';
    if (rawType === 'صالة') {
      orderBadge = `<span class="badge" style="background:#E0F2FE; color:#0369A1; font-weight:800;">صالة ${inv.table_name ? '(' + inv.table_name + ')' : ''}</span>`;
    } else if (rawType === 'تيك أواي') {
      orderBadge = `<span class="badge" style="background:#FEF3C7; color:#B45309; font-weight:800;">تيك أواي</span>`;
    } else if (rawType === 'دليفري') {
      orderBadge = `<span class="badge" style="background:#F3E8FF; color:#7E22CE; font-weight:800;">دليفري</span>`;
    } else if (rawType === 'قهوة') {
      orderBadge = `<span class="badge" style="background:#DCFCE7; color:#15803D; font-weight:800;">قهوة / بار</span>`;
    } else {
      orderBadge = `<span class="badge badge-neutral">${escapeHtml(rawType)}</span>`;
    }

    return `
      <tr style="${isReturned ? 'opacity:0.75;' : ''}">
        <td style="color:var(--supp-text-muted); font-size:11px; text-align:center;">${offset + idx + 1}</td>
        <td>
          <code style="font-weight:700; color:var(--supp-espresso);">${inv.invoice_number}</code>
        </td>
        <td>
          <div style="font-weight:700; color:var(--supp-espresso);">${inv.customer_name || 'عميل نقدي'}</div>
          ${inv.customer_phone ? `<div style="font-size:11px; color:var(--supp-text-muted); direction:ltr; text-align:right;">${inv.customer_phone}</div>` : ''}
        </td>
        <td style="font-size:12px;">${orderBadge}</td>
        <td style="font-size:12px; color:var(--supp-text-secondary); direction:ltr; text-align:right;">${inv.invoice_date || '—'}</td>
        <td style="text-align:center; font-weight:700;">${inv.items_count || 0}</td>
        <td style="text-align:right; font-weight:800; color:var(--supp-espresso); font-variant-numeric:tabular-nums;">${fmt(netTotal)} ج.م</td>
        <td style="text-align:right; font-weight:700; color:var(--supp-emerald); font-variant-numeric:tabular-nums;">${fmt(amountPaid)} ج.م</td>
        <td style="text-align:right; font-weight:700; color:${remaining > 0 ? 'var(--supp-red)' : 'var(--supp-text-muted)'}; font-variant-numeric:tabular-nums;">${remaining > 0 ? fmt(remaining) + ' ج.م' : '—'}</td>
        <td style="font-size:12px; color:var(--supp-text-secondary);">${inv.payment_method || 'نقدي'}</td>
        <td style="text-align:center;">
          <div style="display:flex; flex-direction:column; gap:3px; align-items:center;">
            ${statusBadge}
            ${debtBadge}
          </div>
        </td>
        <td style="text-align:center;">
          <div style="display:inline-flex; gap:6px; align-items:center;">
            <button class="btn btn-outline btn-sm" onclick="viewInvoiceDetails(${inv.id})" title="عرض تفاصيل الفاتورة">
              عرض
            </button>
            ${remaining > 0 && !isReturned ? `
              <button class="btn btn-success btn-sm" onclick="openPayRemainingModal(${inv.id}, ${remaining})" title="سداد المبلغ المتبقي">
                سداد
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Pagination Controls ──────────────────────────────────────────────────────
function renderPagination() {
  const container = document.getElementById('salesPagination');
  if (!container) return;

  const totalPages = Math.ceil(totalMatchingRecords / pageSize) || 1;

  if (totalPages <= 1) {
    container.innerHTML = `<span style="font-size:12px; color:var(--supp-text-muted);">إجمالي: ${totalMatchingRecords} فاتورة</span>`;
    return;
  }

  container.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <button class="btn btn-outline btn-sm" onclick="loadSales(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>
        السابق
      </button>
      <span style="font-size:12px; font-weight:700; color:var(--supp-espresso); padding:0 8px;">
        صفحة ${currentPage} من ${totalPages}
      </span>
      <button class="btn btn-outline btn-sm" onclick="loadSales(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>
        التالي
      </button>
      <span style="font-size:11px; color:var(--supp-text-muted); margin-right:8px;">
        (إجمالي ${totalMatchingRecords} فاتورة)
      </span>
    </div>
  `;
}

// ─── Invoice Document Details & Audit View ────────────────────────────────────
async function viewInvoiceDetails(invoiceId) {
  try {
    const invRes = await window.db.queryOne(`
      SELECT i.*, 
             c.name as customer_name, 
             c.phone as customer_phone,
             c.address as customer_address,
             e.name as employee_name,
             t.name as table_name,
             d.name as driver_name
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN employees e ON i.employee_id = e.id
      LEFT JOIN tables t ON i.table_id = t.id
      LEFT JOIN employees d ON i.driver_id = d.id
      WHERE i.id = ?
    `, [invoiceId]);

    if (!invRes || !invRes.success || !invRes.data) {
      showToast('تعذر العثور على بيانات الفاتورة', 'error');
      return;
    }

    const itemsRes = await window.db.query(`
      SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC
    `, [invoiceId]);

    const returnsRes = await window.db.query(`
      SELECT * FROM returns WHERE original_invoice_id = ?
    `, [invoiceId]);

    const invoice = invRes.data;
    const items = itemsRes.success ? (itemsRes.data || []) : [];
    const returns = returnsRes.success ? (returnsRes.data || []) : [];

    currentViewingInvoice = invoice;
    currentViewingItems = items;

    // Header modal title
    const titleEl = document.getElementById('invoiceDetailsTitle');
    const subEl = document.getElementById('invoiceDetailsSub');
    const bodyEl = document.getElementById('invoiceDetailsBody');

    if (titleEl) {
      titleEl.textContent = `مستند فاتورة مبيعات #${invoice.invoice_number}`;
    }

    if (subEl) {
      subEl.textContent = `تاريخ الإصدار: ${invoice.invoice_date || '—'} | الكاشير: ${invoice.employee_name || 'عام'} | الحالة: ${invoice.status || 'محاسَبة'}`;
    }

    // Render items list
    const itemsHtml = items.map((it, idx) => `
      <tr>
        <td style="color:var(--supp-text-muted); font-size:11px; text-align:center;">${idx + 1}</td>
        <td style="font-weight:700; color:var(--supp-espresso);">${it.service_name || '—'}</td>
        <td style="font-size:12px; color:var(--supp-text-muted);">${it.category_name || 'عام'}</td>
        <td style="text-align:center; font-weight:800; font-variant-numeric:tabular-nums;">${it.quantity}</td>
        <td style="text-align:right; font-variant-numeric:tabular-nums;">${fmt(it.sell_price)} ج.م</td>
        <td style="text-align:right; font-variant-numeric:tabular-nums; color:${it.item_discount > 0 ? 'var(--supp-red)' : 'var(--supp-text-muted)'};">${it.item_discount > 0 ? fmt(it.item_discount) + ' ج.م' : '—'}</td>
        <td style="text-align:right; font-weight:800; color:var(--supp-espresso); font-variant-numeric:tabular-nums;">${fmt(it.total)} ج.م</td>
      </tr>
    `).join('');

    const returnsTotal = returns.reduce((sum, r) => sum + Number(r.total_returned || 0), 0);
    const subtotal = Number(invoice.subtotal || 0);
    const discount = Number(invoice.discount_amount || 0);
    const deliveryFee = Number(invoice.delivery_fee || 0);
    const netTotal = Number(invoice.net_total || 0);
    const paid = Number(invoice.amount_paid || 0);
    const remaining = Number(invoice.remaining || 0);

    if (bodyEl) {
      bodyEl.innerHTML = `
        <!-- Meta Details Box -->
        <div style="background:#F8FAFC; border:1px solid var(--supp-border); border-radius:8px; padding:14px; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px;">
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--supp-text-muted);">العميل:</div>
            <div style="font-size:14px; font-weight:800; color:var(--supp-espresso); margin-top:2px;">${invoice.customer_name || 'عميل نقدي'}</div>
            ${invoice.customer_phone ? `<div style="font-size:12px; color:var(--supp-text-secondary); direction:ltr; text-align:right;">${invoice.customer_phone}</div>` : ''}
            ${invoice.customer_address ? `<div style="font-size:11px; color:var(--supp-text-muted);">${invoice.customer_address}</div>` : ''}
          </div>
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--supp-text-muted);">بيانات الطلب والخدمة:</div>
            <div style="font-size:13px; font-weight:700; color:var(--supp-espresso); margin-top:2px;">
              ${(() => {
                const t = invoice.invoice_type || 'صالة';
                if (t === 'صالة') return `<span class="badge" style="background:#E0F2FE; color:#0369A1; font-weight:800;">طلب صالة ${invoice.table_name ? '(' + invoice.table_name + ')' : ''}</span>`;
                if (t === 'تيك أواي') return `<span class="badge" style="background:#FEF3C7; color:#B45309; font-weight:800;">طلب تيك أواي (سفري)</span>`;
                if (t === 'دليفري') return `<span class="badge" style="background:#F3E8FF; color:#7E22CE; font-weight:800;">طلب دليفري (توصيل)</span>`;
                if (t === 'قهوة') return `<span class="badge" style="background:#DCFCE7; color:#15803D; font-weight:800;">طلب قهوة / بار سريع</span>`;
                return `<span class="badge badge-neutral">${escapeHtml(t)}</span>`;
              })()}
            </div>
            ${invoice.driver_name ? `<div style="font-size:12px; color:var(--supp-text-secondary);">طيار التوصيل: ${invoice.driver_name}</div>` : ''}
            <div style="font-size:11px; color:var(--supp-text-muted);">الخزينة المودع بها: ${invoice.treasury_type || 'الخزينة النقدية'}</div>
          </div>
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--supp-text-muted);">طريقة الدفع والحالة:</div>
            <div style="font-size:13px; font-weight:700; color:var(--supp-espresso); margin-top:2px;">${invoice.payment_method || 'نقدي'}</div>
            <div style="margin-top:4px;">
              <span class="badge ${invoice.status === 'محاسَبة' ? 'badge-success' : 'badge-neutral'}">${invoice.status || 'محاسَبة'}</span>
              ${invoice.is_returned === 1 ? '<span class="badge badge-danger">مُسترجع</span>' : ''}
            </div>
          </div>
        </div>

        <!-- Invoice Items Table -->
        <div class="table-container-surface" style="margin-top:10px;">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:36px; text-align:center;">#</th>
                <th>الصنف / المشروب</th>
                <th style="width:110px;">القسم</th>
                <th style="text-align:center; width:80px;">الكمية</th>
                <th style="text-align:right; width:110px;">السعر</th>
                <th style="text-align:right; width:100px;">الخصم</th>
                <th style="text-align:right; width:120px;">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml || '<tr><td colspan="7" class="table-empty">لا توجد عناصر مسجلة</td></tr>'}
            </tbody>
          </table>
        </div>

        <!-- Financial Summary Grid -->
        <div style="background:#FFFFFF; border:1px solid var(--supp-border); border-radius:8px; padding:14px; margin-top:10px; display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; text-align:center;">
          <div style="background:#F8FAFC; padding:10px; border-radius:6px; border:1px solid var(--supp-border);">
            <div style="font-size:11px; font-weight:700; color:var(--supp-text-muted);">المجموع الفرعي:</div>
            <div style="font-size:15px; font-weight:800; color:var(--supp-espresso); margin-top:2px;">${fmt(subtotal)} ج.م</div>
          </div>
          ${discount > 0 ? `
            <div style="background:#FFFBEB; padding:10px; border-radius:6px; border:1px solid #FDE68A;">
              <div style="font-size:11px; font-weight:700; color:#92400E;">الخصم التجاري:</div>
              <div style="font-size:15px; font-weight:800; color:#B45309; margin-top:2px;">-${fmt(discount)} ج.م</div>
            </div>
          ` : ''}
          ${deliveryFee > 0 ? `
            <div style="background:#F8FAFC; padding:10px; border-radius:6px; border:1px solid var(--supp-border);">
              <div style="font-size:11px; font-weight:700; color:var(--supp-text-muted);">خدمة التوصيل:</div>
              <div style="font-size:15px; font-weight:800; color:var(--supp-espresso); margin-top:2px;">+${fmt(deliveryFee)} ج.م</div>
            </div>
          ` : ''}
          <div style="background:#EFF6FF; padding:10px; border-radius:6px; border:1px solid #DBEAFE;">
            <div style="font-size:11px; font-weight:700; color:#1E40AF;">الإجمالي الصافي:</div>
            <div style="font-size:18px; font-weight:900; color:#1D4ED8; margin-top:2px;">${fmt(netTotal)} ج.م</div>
          </div>
          <div style="background:#ECFDF5; padding:10px; border-radius:6px; border:1px solid #A7F3D0;">
            <div style="font-size:11px; font-weight:700; color:#065F46;">المسدد:</div>
            <div style="font-size:18px; font-weight:900; color:#059669; margin-top:2px;">${fmt(paid)} ج.م</div>
          </div>
          <div style="background:${remaining > 0 ? '#FEF2F2' : '#F8FAFC'}; padding:10px; border-radius:6px; border:1px solid ${remaining > 0 ? '#FECACA' : 'var(--supp-border)'};">
            <div style="font-size:11px; font-weight:700; color:${remaining > 0 ? '#991B1B' : 'var(--supp-text-muted)'};">المتبقي دين:</div>
            <div style="font-size:18px; font-weight:900; color:${remaining > 0 ? '#DC2626' : 'var(--supp-text-muted)'}; margin-top:2px;">${fmt(remaining)} ج.م</div>
          </div>
        </div>

        ${returnsTotal > 0 ? `
          <div style="font-size:12px; color:#B91C1C; background:#FEF2F2; border:1px solid #FECACA; border-radius:6px; padding:10px 14px; margin-top:10px; display:flex; align-items:center; gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            <span>يوجد مرتجعات سابقة على هذه الفاتورة بإجمالي: <b>${fmt(returnsTotal)} ج.م</b></span>
          </div>
        ` : ''}

        ${invoice.notes ? `
          <div style="font-size:12px; color:var(--supp-text-secondary); background:#F8FAFC; border:1px solid var(--supp-border); border-radius:6px; padding:8px 12px; margin-top:10px;">
            <b>ملاحظات الفاتورة:</b> ${invoice.notes}
          </div>
        ` : ''}
      `;
    }

    openModal('invoiceDetailsModal');
  } catch (err) {
    console.error('View invoice details error:', err);
  }
}

// ─── Settle Remaining Invoice Debt ────────────────────────────────────────────
function openPayRemainingModal(invoiceId, maxAmount) {
  pendingPayInvoice = { invoiceId, maxAmount };
  const amtInput = document.getElementById('payDebtAmount');
  const maxLabel = document.getElementById('payDebtMaxNotice');

  if (amtInput) amtInput.value = maxAmount;
  if (maxLabel) maxLabel.textContent = `المبلغ المتبقي على الفاتورة: ${fmt(maxAmount)} ج.م`;

  openModal('payRemainingModal');
}

async function submitPayRemaining() {
  if (!pendingPayInvoice) return;
  const amt = parseFloat(document.getElementById('payDebtAmount')?.value || 0);
  const treasury = document.getElementById('payDebtTreasury')?.value || 'الخزينة';

  if (isNaN(amt) || amt <= 0) {
    showToast('يرجى إدخال مبلغ صحيح', 'warning');
    return;
  }

  if (amt > pendingPayInvoice.maxAmount) {
    showToast('المبلغ المدخل أكبر من المتبقي على الفاتورة', 'warning');
    return;
  }

  try {
    const res = await window.db.payInvoiceRemaining(pendingPayInvoice.invoiceId, amt, treasury);
    if (res && res.success) {
      showToast('تم تسجيل سداد المبلغ وإيداعه في الخزينة بنجاح ✅', 'success');
      closeModal('payRemainingModal');
      await loadSales(currentPage);
    } else {
      showToast('فشل سداد المبلغ: ' + (res?.error || ''), 'error');
    }
  } catch (err) {
    console.error('Submit pay remaining error:', err);
    showToast('حدث خطأ أثناء تسجيل السداد', 'error');
  }
}

// ─── Print Invoice Receipt ────────────────────────────────────────────────────
function printCurrentInvoice() {
  window.print();
}

// ─── Export Sales to CSV / Excel ──────────────────────────────────────────────
async function exportSalesToCSV() {
  try {
    showToast('جارٍ تجهيز ملف التصدير...', 'info');
    const query = (document.getElementById('salesSearchInput')?.value || '').trim();
    const from = document.getElementById('salesFrom')?.value || '';
    const to = document.getElementById('salesTo')?.value || '';

    let whereClauses = ['1=1'];
    let params = [];
    if (query) {
      whereClauses.push('(i.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    if (from) { whereClauses.push('i.invoice_date >= ?'); params.push(from); }
    if (to) { whereClauses.push('i.invoice_date <= ?'); params.push(to); }

    const sql = `
      SELECT i.*, c.name as customer_name, c.phone as customer_phone, e.name as employee_name
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN employees e ON i.employee_id = e.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY i.id DESC
      LIMIT 2000
    `;
    const res = await window.db.query(sql, params);
    if (!res || !res.success || !res.data || !res.data.length) {
      showToast('لا توجد بيانات مطابقة لتصديرها', 'warning');
      return;
    }

    const headers = ['رقم الفاتورة', 'العميل', 'الهاتف', 'التاريخ', 'الكاشير', 'نوع الطلب', 'المجموع الفرعي', 'الخصم', 'الإجمالي الصافي', 'المدفوع', 'المتبقي', 'طريقة الدفع', 'الحالة'];
    const rows = res.data.map(i => [
      `"${i.invoice_number || ''}"`,
      `"${i.customer_name || 'عميل نقدي'}"`,
      `"${i.customer_phone || ''}"`,
      `"${i.invoice_date || ''}"`,
      `"${i.employee_name || ''}"`,
      `"${i.invoice_type || 'صالة'}"`,
      i.subtotal || 0,
      i.discount_amount || 0,
      i.net_total || 0,
      i.amount_paid || 0,
      i.remaining || 0,
      `"${i.payment_method || 'نقدي'}"`,
      `"${i.status || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sales_invoices_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('تم تصدير ملف المبيعات بنجاح ✅', 'success');
  } catch (err) {
    console.error('Export CSV error:', err);
    showToast('حدث خطأ أثناء تصدير الملف', 'error');
  }
}
