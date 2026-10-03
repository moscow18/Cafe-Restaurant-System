/**
 * CafePro System — Purchases & Procurement Management Module
 * Professional ERP purchasing workstation and invoice auditing.
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

// ─── Module State ─────────────────────────────────────────────────────────────
let allPurchases = [];
let allSuppliers = [];
let allRawMaterials = [];
let allServices = [];
let purchaseLineItems = [];
let currentDetailedPurchase = null;

// ─── Initialization ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initDateFilters();
  await loadSuppliersList();
  await loadStockItems();
  await loadPurchases();
});

function initDateFilters() {
  const today = new Date().toISOString().split('T')[0];
  const pDate = document.getElementById('purchDate');
  if (pDate) pDate.value = today;

  // By default, set filter from 30 days ago to today
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fromStr = thirtyDaysAgo.toISOString().split('T')[0];

  const purchFrom = document.getElementById('purchFrom');
  const purchTo = document.getElementById('purchTo');
  if (purchFrom) purchFrom.value = fromStr;
  if (purchTo) purchTo.value = today;
}

function setPurchDatePreset(preset) {
  const today = new Date().toISOString().split('T')[0];
  const purchFrom = document.getElementById('purchFrom');
  const purchTo = document.getElementById('purchTo');
  if (!purchFrom || !purchTo) return;

  if (preset === 'today') {
    purchFrom.value = today;
    purchTo.value = today;
  } else if (preset === 'this_month') {
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    purchFrom.value = firstDay;
    purchTo.value = today;
  } else if (preset === 'all') {
    purchFrom.value = '';
    purchTo.value = '';
  }

  loadPurchases();
}

// ─── Load Reference Data ──────────────────────────────────────────────────────
async function loadSuppliersList() {
  try {
    const res = await window.suppliers.list();
    if (res && res.success) {
      allSuppliers = res.data || [];
      populateSuppliersDropdowns();
    }
  } catch (err) {
    console.error('Failed to load suppliers:', err);
  }
}

function populateSuppliersDropdowns() {
  const filterSel = document.getElementById('purchSupplierFilter');
  const modalSel = document.getElementById('purchSupplierSelect');

  const filterOptions = '<option value="">كل الموردين</option>' + 
    allSuppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  const modalOptions = allSuppliers.map(s => 
    `<option value="${s.id}">${s.name} (الرصيد القائم: ${fmt(s.current_balance)} ج.م)</option>`
  ).join('');

  if (filterSel) filterSel.innerHTML = filterOptions;
  if (modalSel) modalSel.innerHTML = modalOptions;
}

async function loadStockItems() {
  try {
    const [rRes, sRes] = await Promise.all([
      window.rawMaterials.list(),
      window.inventory.list()
    ]);
    if (rRes && rRes.success) allRawMaterials = rRes.data || [];
    if (sRes && sRes.success) allServices = sRes.data || [];
    populatePurchaseItemSelect();
  } catch (err) {
    console.error('Failed to load stock items:', err);
  }
}

function populatePurchaseItemSelect() {
  const type = document.getElementById('itemTypeSelect')?.value || 'raw';
  const sel = document.getElementById('purchItemSelect');
  const costInput = document.getElementById('purchItemCost');
  if (!sel) return;

  if (type === 'raw') {
    sel.innerHTML = allRawMaterials.map(rm => 
      `<option value="${rm.id}" data-cost="${rm.cost_per_unit || 0}" data-unit="${rm.unit || 'وحدة'}">${rm.name} (${rm.unit || 'وحدة'})</option>`
    ).join('');
  } else {
    sel.innerHTML = allServices.map(s => 
      `<option value="${s.id}" data-cost="${s.cost_price || 0}" data-unit="قطعة">${s.name}</option>`
    ).join('');
  }

  // Update default cost input
  if (sel.options.length > 0 && costInput) {
    costInput.value = sel.options[0].getAttribute('data-cost') || 0;
  }
}

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'purchItemSelect') {
    const opt = e.target.options[e.target.selectedIndex];
    if (opt) {
      const costInput = document.getElementById('purchItemCost');
      if (costInput) costInput.value = opt.getAttribute('data-cost') || 0;
    }
  }
});

// ─── Purchases Query & Table ──────────────────────────────────────────────────
async function loadPurchases() {
  try {
    const suppId = document.getElementById('purchSupplierFilter')?.value;
    const from = document.getElementById('purchFrom')?.value;
    const to = document.getElementById('purchTo')?.value;

    const res = await window.purchases.list({
      supplier_id: suppId ? parseInt(suppId) : undefined,
      from: from || undefined,
      to: to || undefined
    });

    if (!res || !res.success) {
      showToast('تعذر تحميل بيانات المشتريات: ' + (res?.error || ''), 'error');
      return;
    }

    allPurchases = res.data || [];
    updateSummaryStats(allPurchases);
    filterPurchases();
  } catch (err) {
    console.error('Failed to fetch purchases:', err);
    showToast('خطأ في الاتصال بقاعدة البيانات', 'error');
  }
}

function updateSummaryStats(purchases) {
  const count = purchases.length;
  const totalAmount = purchases.reduce((sum, p) => sum + Number(p.total || 0), 0);
  const paidAmount = purchases.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
  const remainingAmount = purchases.reduce((sum, p) => sum + Number(p.remaining || 0), 0);

  const elCount = document.getElementById('statTotalPurchasesCount');
  const elTotal = document.getElementById('statTotalPurchasesAmount');
  const elPaid = document.getElementById('statTotalPaidAmount');
  const elRemaining = document.getElementById('statTotalRemainingAmount');

  if (elCount) elCount.textContent = count;
  if (elTotal) elTotal.textContent = fmt(totalAmount);
  if (elPaid) elPaid.textContent = fmt(paidAmount);
  if (elRemaining) elRemaining.textContent = fmt(remainingAmount);
}

function filterPurchases() {
  const query = (document.getElementById('purchSearchInput')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('purchStatusFilter')?.value || '';

  const filtered = allPurchases.filter(p => {
    // Search query matches invoice number, supplier name, notes
    const matchesQuery = !query || 
      (p.invoice_number && p.invoice_number.toLowerCase().includes(query)) ||
      (p.supplier_name && p.supplier_name.toLowerCase().includes(query)) ||
      (p.notes && p.notes.toLowerCase().includes(query));

    // Status matches
    const matchesStatus = !statusFilter || p.payment_status === statusFilter;

    return matchesQuery && matchesStatus;
  });

  renderPurchasesTable(filtered);
}

function renderPurchasesTable(purchases) {
  const tbody = document.getElementById('purchasesTableBody');
  const countPill = document.getElementById('purchResultCount');
  if (!tbody) return;

  if (countPill) {
    countPill.textContent = `${purchases.length} عملية شراء`;
  }

  if (!purchases.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="table-empty">
          <div style="padding:18px 0; color:var(--supp-text-muted);">
            لا توجد فواتير مشتريات مطابقة لمعايير البحث والتصفية
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = purchases.map((p, idx) => {
    const statusMap = {
      'مسددة': 'badge-success',
      'جزئي': 'badge-warning',
      'آجل': 'badge-danger'
    };
    const bClass = statusMap[p.payment_status] || 'badge-neutral';
    const total = Number(p.total || 0);
    const paid = Number(p.amount_paid || 0);
    const remaining = Number(p.remaining || 0);

    return `
      <tr>
        <td style="color:var(--supp-text-muted); font-size:11px; text-align:center;">${idx + 1}</td>
        <td>
          <code style="font-weight:700; color:var(--supp-espresso);">${p.invoice_number}</code>
        </td>
        <td>
          <div style="font-weight:700; color:var(--supp-espresso);">${p.supplier_name || 'مورد عام'}</div>
          ${p.supplier_phone ? `<div style="font-size:11px; color:var(--supp-text-muted); direction:ltr; text-align:right;">${p.supplier_phone}</div>` : ''}
        </td>
        <td style="font-size:12px; color:var(--supp-text-secondary);">${p.purchase_date}</td>
        <td style="text-align:center; font-weight:700;">${p.items_count || 0}</td>
        <td style="text-align:right; font-weight:800; color:var(--supp-espresso); font-variant-numeric:tabular-nums;">${fmt(total)} ج.م</td>
        <td style="text-align:right; font-weight:700; color:var(--supp-emerald); font-variant-numeric:tabular-nums;">${fmt(paid)} ج.م</td>
        <td style="text-align:right; font-weight:700; color:${remaining > 0 ? 'var(--supp-red)' : 'var(--supp-text-muted)'}; font-variant-numeric:tabular-nums;">${remaining > 0 ? fmt(remaining) + ' ج.م' : '—'}</td>
        <td style="font-size:12px; color:var(--supp-text-secondary);">${p.treasury_type || 'الخزينة'}</td>
        <td style="text-align:center;">
          <span class="badge ${bClass}">${p.payment_status}</span>
        </td>
        <td style="text-align:center;">
          <div style="display:inline-flex; gap:6px; align-items:center;">
            <button class="btn btn-outline btn-sm" onclick="viewPurchaseDetails(${p.id})" title="عرض تفاصيل الفاتورة">
              عرض التفاصيل
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Purchase Workstation: Create New Purchase ─────────────────────────────────
function openNewPurchaseModal() {
  purchaseLineItems = [];
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const defaultInvoiceNo = 'PUR-' + now.getFullYear().toString().slice(-2) + 
                           String(now.getMonth() + 1).padStart(2, '0') + 
                           String(now.getDate()).padStart(2, '0') + '-' + 
                           Date.now().toString().slice(-4);

  const numInput = document.getElementById('purchInvoiceNum');
  const dateInput = document.getElementById('purchDate');
  const paidInput = document.getElementById('purchPaidInput');
  const notesInput = document.getElementById('purchNotes');

  if (numInput) numInput.value = defaultInvoiceNo;
  if (dateInput) dateInput.value = today;
  if (paidInput) paidInput.value = '0';
  if (notesInput) notesInput.value = '';

  populatePurchaseItemSelect();
  renderPurchaseLineItemsTable();
  openModal('purchaseModal');
}

function addPurchaseLineItem() {
  const type = document.getElementById('itemTypeSelect').value;
  const sel = document.getElementById('purchItemSelect');
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;

  const itemId = parseInt(sel.value);
  const itemName = opt.textContent;
  const qty = parseFloat(document.getElementById('purchItemQty').value);
  const cost = parseFloat(document.getElementById('purchItemCost').value);

  if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
    showToast('يرجى إدخال كمية صحيحة وسعر تكلفة صحيح', 'warning');
    return;
  }

  // Check if item already exists in line items list
  const existingIdx = purchaseLineItems.findIndex(it => 
    (type === 'raw' && it.raw_material_id === itemId) ||
    (type === 'service' && it.service_id === itemId)
  );

  if (existingIdx !== -1) {
    purchaseLineItems[existingIdx].quantity += qty;
    purchaseLineItems[existingIdx].unit_cost = cost;
    purchaseLineItems[existingIdx].total = purchaseLineItems[existingIdx].quantity * cost;
  } else {
    purchaseLineItems.push({
      item_type: type === 'raw' ? 'raw_material' : 'service',
      raw_material_id: type === 'raw' ? itemId : null,
      service_id: type === 'service' ? itemId : null,
      item_name: itemName,
      quantity: qty,
      unit_cost: cost,
      total: qty * cost
    });
  }

  renderPurchaseLineItemsTable();
}

function removePurchaseLineItem(index) {
  purchaseLineItems.splice(index, 1);
  renderPurchaseLineItemsTable();
}

function renderPurchaseLineItemsTable() {
  const tbody = document.getElementById('purchaseLineItemsBody');
  const totalDisplay = document.getElementById('purchTotalDisplay');
  if (!tbody) return;

  if (!purchaseLineItems.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty" style="padding:22px;">أضف عناصر الفاتورة أعلاه</td></tr>';
    if (totalDisplay) totalDisplay.textContent = '0.00 ج.م';
    calcPurchRemaining();
    return;
  }

  let grandTotal = 0;
  tbody.innerHTML = purchaseLineItems.map((it, idx) => {
    grandTotal += it.total;
    return `
      <tr>
        <td style="color:var(--supp-text-muted); font-size:11px; text-align:center;">${idx + 1}</td>
        <td style="font-weight:700; color:var(--supp-espresso);">${it.item_name}</td>
        <td>
          <span class="badge ${it.item_type === 'raw_material' ? 'badge-accent' : 'badge-neutral'}">
            ${it.item_type === 'raw_material' ? 'مادة خام' : 'صنف مباشر'}
          </span>
        </td>
        <td style="text-align:center; font-weight:800; font-variant-numeric:tabular-nums;">${it.quantity}</td>
        <td style="text-align:right; font-variant-numeric:tabular-nums;">${fmt(it.unit_cost)} ج.م</td>
        <td style="text-align:right; font-weight:800; color:var(--supp-espresso); font-variant-numeric:tabular-nums;">${fmt(it.total)} ج.م</td>
        <td style="text-align:center;">
          <button class="btn btn-hairline-danger btn-sm" onclick="removePurchaseLineItem(${idx})" title="حذف البند">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  if (totalDisplay) totalDisplay.textContent = fmt(grandTotal) + ' ج.م';
  calcPurchRemaining();
}

function calcPurchRemaining() {
  const grandTotal = purchaseLineItems.reduce((s, it) => s + (it.total || 0), 0);
  const paid = parseFloat(document.getElementById('purchPaidInput')?.value) || 0;
  const rem = Math.max(0, grandTotal - paid);
  const notice = document.getElementById('purchRemainingNotice');
  if (notice) {
    if (rem > 0) {
      notice.textContent = `المتبقي دين على المحل للمورد: ${fmt(rem)} ج.م`;
      notice.style.color = 'var(--supp-red)';
    } else {
      notice.textContent = 'الفاتورة مسددة بالكامل (خالص)';
      notice.style.color = 'var(--supp-emerald)';
    }
  }
}

async function savePurchaseInvoice() {
  const suppId = parseInt(document.getElementById('purchSupplierSelect')?.value);
  if (!suppId) {
    showToast('يرجى تحديد المورد من القائمة', 'warning');
    return;
  }
  if (!purchaseLineItems.length) {
    showToast('يجب إضافة بند واحد على الأقل في الفاتورة', 'warning');
    return;
  }

  const grandTotal = purchaseLineItems.reduce((s, it) => s + (it.total || 0), 0);
  const paid = parseFloat(document.getElementById('purchPaidInput')?.value) || 0;
  const invoiceNum = document.getElementById('purchInvoiceNum')?.value.trim();
  const date = document.getElementById('purchDate')?.value;
  const tType = document.getElementById('purchTreasurySelect')?.value || 'الخزينة';
  const notes = document.getElementById('purchNotes')?.value.trim();

  const purchaseData = {
    invoice_number: invoiceNum,
    supplier_id: suppId,
    purchase_date: date,
    total: grandTotal,
    amount_paid: paid,
    treasury_type: tType,
    notes: notes
  };

  try {
    const res = await window.purchases.save(purchaseData, purchaseLineItems);
    if (res && res.success) {
      showToast('تم حفظ فاتورة التوريد وإضافة الكميات للمخزن بنجاح ✅', 'success');
      closeModal('purchaseModal');
      await loadPurchases();
      await loadStockItems();
      await loadSuppliersList();
    } else {
      showToast('فشل حفظ الفاتورة: ' + (res?.error || 'خطأ غير معروف'), 'error');
    }
  } catch (err) {
    console.error('Save purchase error:', err);
    showToast('حدث خطأ أثناء حفظ الفاتورة', 'error');
  }
}

// ─── Purchase Document Details & Audit View ───────────────────────────────────
async function viewPurchaseDetails(purchaseId) {
  try {
    const res = await window.purchases.getDetails(purchaseId);
    if (!res || !res.success) {
      showToast('تعذر جلب تفاصيل الفاتورة: ' + (res?.error || ''), 'error');
      return;
    }

    const { purchase, items } = res.data;
    currentDetailedPurchase = { purchase, items };

    const titleEl = document.getElementById('detailsModalTitle');
    const subEl = document.getElementById('detailsModalSub');
    const bodyEl = document.getElementById('purchaseDetailsBody');

    if (titleEl) {
      titleEl.textContent = `مستند فاتورة شراء وتوريد #${purchase.invoice_number}`;
    }

    if (subEl) {
      subEl.textContent = `المورد: ${purchase.supplier_name || '—'} | التاريخ: ${purchase.purchase_date} | الحالة: ${purchase.payment_status}`;
    }

    const itemsHtml = (items || []).map((it, idx) => `
      <tr>
        <td style="color:var(--supp-text-muted); font-size:11px; text-align:center;">${idx + 1}</td>
        <td style="font-weight:700; color:var(--supp-espresso);">${it.item_name}</td>
        <td>
          <span class="badge ${it.item_type === 'raw_material' ? 'badge-accent' : 'badge-neutral'}">
            ${it.item_type === 'raw_material' ? 'مادة خام' : 'صنف مباشر'}
          </span>
        </td>
        <td style="text-align:center; font-weight:800; font-variant-numeric:tabular-nums;">${it.quantity}</td>
        <td style="text-align:right; font-variant-numeric:tabular-nums;">${fmt(it.unit_cost)} ج.م</td>
        <td style="text-align:right; font-weight:800; color:var(--supp-espresso); font-variant-numeric:tabular-nums;">${fmt(it.total)} ج.م</td>
      </tr>
    `).join('');

    const statusMap = {
      'مسددة': 'badge-success',
      'جزئي': 'badge-warning',
      'آجل': 'badge-danger'
    };
    const bClass = statusMap[purchase.payment_status] || 'badge-neutral';

    if (bodyEl) {
      bodyEl.innerHTML = `
        <!-- Document Meta Header -->
        <div style="background:#F8FAFC; border:1px solid var(--supp-border); border-radius:8px; padding:14px; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--supp-text-muted);">المورد أو الشركة:</div>
            <div style="font-size:14px; font-weight:800; color:var(--supp-espresso); margin-top:2px;">${purchase.supplier_name || '—'}</div>
            <div style="font-size:12px; color:var(--supp-text-secondary); direction:ltr; text-align:right;">${purchase.supplier_phone || ''}</div>
          </div>
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--supp-text-muted);">تاريخ الفاتورة:</div>
            <div style="font-size:14px; font-weight:800; color:var(--supp-espresso); margin-top:2px;">${purchase.purchase_date}</div>
            <div style="font-size:11px; color:var(--supp-text-muted);">الخزينة: ${purchase.treasury_type || 'الخزينة النقدية'}</div>
          </div>
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--supp-text-muted);">حالة السداد المحاسبي:</div>
            <div style="margin-top:4px;">
              <span class="badge ${bClass}" style="font-size:12px; padding:3px 10px;">${purchase.payment_status}</span>
            </div>
          </div>
        </div>

        <!-- Items Table -->
        <div class="table-container-surface" style="margin-top:10px;">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:36px; text-align:center;">#</th>
                <th>البند المورد</th>
                <th style="width:100px;">النوع</th>
                <th style="text-align:center; width:90px;">الكمية</th>
                <th style="text-align:right; width:120px;">سعر الوحدة</th>
                <th style="text-align:right; width:130px;">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml || '<tr><td colspan="6" class="table-empty">لا توجد بنود مسجلة</td></tr>'}
            </tbody>
          </table>
        </div>

        <!-- Financial Summary Bar -->
        <div style="background:#FFFFFF; border:1px solid var(--supp-border); border-radius:8px; padding:14px; margin-top:10px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; text-align:center;">
          <div style="background:#F8FAFC; padding:10px; border-radius:6px; border:1px solid var(--supp-border);">
            <div style="font-size:11px; font-weight:700; color:var(--supp-text-muted);">إجمالي الفاتورة:</div>
            <div style="font-size:18px; font-weight:900; color:var(--supp-espresso); margin-top:2px;">${fmt(purchase.total)} ج.م</div>
          </div>
          <div style="background:#ECFDF5; padding:10px; border-radius:6px; border:1px solid #A7F3D0;">
            <div style="font-size:11px; font-weight:700; color:#065F46;">المسدد نقداً:</div>
            <div style="font-size:18px; font-weight:900; color:#059669; margin-top:2px;">${fmt(purchase.amount_paid)} ج.م</div>
          </div>
          <div style="background:#FEF2F2; padding:10px; border-radius:6px; border:1px solid #FECACA;">
            <div style="font-size:11px; font-weight:700; color:#991B1B;">المتبقي آجل (دين للمورد):</div>
            <div style="font-size:18px; font-weight:900; color:#DC2626; margin-top:2px;">${fmt(purchase.remaining)} ج.م</div>
          </div>
        </div>

        ${purchase.notes ? `
          <div style="font-size:12px; color:var(--supp-text-secondary); background:#F8FAFC; border:1px solid var(--supp-border); border-radius:6px; padding:8px 12px; margin-top:8px;">
            <b>ملاحظات الفاتورة:</b> ${purchase.notes}
          </div>
        ` : ''}

        <div style="display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; color:var(--supp-emerald); margin-top:8px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <span>تم تسجيل حركة التوريد المخزني وترحيل أثرها للمخزن وحساب المورد فور حفظ الفاتورة.</span>
        </div>
      `;
    }

    openModal('purchaseDetailsModal');
  } catch (err) {
    console.error('View purchase details error:', err);
  }
}

// ─── Export to CSV ────────────────────────────────────────────────────────────
function exportPurchasesToCSV() {
  if (!allPurchases.length) {
    showToast('لا توجد بيانات مشتريات لتصديرها', 'warning');
    return;
  }

  const headers = ['رقم الفاتورة', 'المورد', 'الهاتف', 'التاريخ', 'عدد الأصناف', 'إجمالي الفاتورة', 'المدفوع', 'المتبقي', 'طريقة السداد', 'حالة السداد', 'ملاحظات'];
  const rows = allPurchases.map(p => [
    `"${p.invoice_number || ''}"`,
    `"${p.supplier_name || ''}"`,
    `"${p.supplier_phone || ''}"`,
    `"${p.purchase_date || ''}"`,
    p.items_count || 0,
    p.total || 0,
    p.amount_paid || 0,
    p.remaining || 0,
    `"${p.treasury_type || ''}"`,
    `"${p.payment_status || ''}"`,
    `"${p.notes || ''}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `purchases_report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('تم تصدير ملف إكسيل/CSV بنجاح', 'success');
}

// ─── Printable Voucher ────────────────────────────────────────────────────────
function printPurchaseVoucher() {
  window.print();
}
