let posAllInvoices = [];

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPosHistory(invoices) {
  const tbody = document.getElementById('historyTableBody');
  if (!invoices || invoices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:24px; text-align:center; color:var(--pos-text-muted);">لا توجد فواتير مطابقة</td></tr>';
  } else {
    tbody.innerHTML = invoices.map(inv => {
      let statusBg = '#E0F2FE';
      let statusColor = '#0369A1';
      let statusBorder = '#BAE6FD';
      if (inv.status === 'محاسبة' || inv.status === 'محاسَبة') {
        statusBg = '#DCFCE7';
        statusColor = '#15803D';
        statusBorder = '#BBF7D0';
      } else if (inv.status === 'ملغاة') {
        statusBg = '#FEE2E2';
        statusColor = '#B91C1C';
        statusBorder = '#FECACA';
      } else if (inv.status === 'مرسلة للمطبخ') {
        statusBg = '#FEF3C7';
        statusColor = '#B45309';
        statusBorder = '#FDE68A';
      }

      const rawType = inv.invoice_type || 'صالة';
      let typeBadge = '';
      if (rawType === 'صالة') {
        typeBadge = `<span style="display:inline-block; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:800; background:#E0F2FE; color:#0369A1;">صالة ${inv.table_id ? `(${inv.table_id})` : ''}</span>`;
      } else if (rawType === 'تيك أواي') {
        typeBadge = `<span style="display:inline-block; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:800; background:#FEF3C7; color:#B45309;">تيك أواي</span>`;
      } else if (rawType === 'دليفري') {
        typeBadge = `<span style="display:inline-block; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:800; background:#F3E8FF; color:#7E22CE;">دليفري</span>`;
      } else if (rawType === 'قهوة') {
        typeBadge = `<span style="display:inline-block; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:800; background:#DCFCE7; color:#15803D;">قهوة / بار</span>`;
      } else {
        typeBadge = `<span style="display:inline-block; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:800; background:#F1F5F9; color:#475569;">${escapeHtml(rawType)}</span>`;
      }

      return `
        <tr data-id="${inv.id}" data-invnum="${(inv.invoice_number||'').toLowerCase()}" data-custname="${(inv.customer_name||'').toLowerCase()}" data-custphone="${(inv.customer_phone||'').toLowerCase()}" style="border-bottom:1px solid var(--pos-border); transition:background 0.15s ease;">
          <td style="padding:10px 12px; font-weight:800; color:var(--pos-espresso); font-family:monospace; font-size:12px;">${escapeHtml(inv.invoice_number)}</td>
          <td style="padding:10px 12px;">
            <div style="font-weight:700; color:var(--pos-text);">${escapeHtml(inv.customer_name || 'عميل نقدي')}</div>
            <div style="font-size:11px; margin-top:2px;">${typeBadge}</div>
          </td>
          <td style="padding:10px 12px; font-weight:900; color:var(--pos-espresso); text-align:right;">${fmt(inv.dynamic_net_total)} ج.م</td>
          <td style="padding:10px 12px; font-size:12px; color:var(--pos-text-muted);">${escapeHtml(inv.invoice_date)}</td>
          <td style="padding:10px 12px; text-align:center;">
            <span style="display:inline-block; padding:3px 9px; border-radius:6px; font-size:11px; font-weight:800; background:${statusBg}; color:${statusColor}; border:1px solid ${statusBorder};">
              ${escapeHtml(inv.status || 'مفتوحة')}
            </span>
          </td>
          <td style="padding:10px 12px; text-align:center;">
            <button class="btn btn-sm btn-outline" style="padding:5px 14px; font-size:11px; font-weight:800; border-radius:8px; border-color:var(--pos-espresso); color:var(--pos-espresso); background:#FFFFFF; transition:all 0.15s;" onclick="viewPastInvoice(${inv.id})">معاينة الإيصال</button>
          </td>
        </tr>
      `;
    }).join('');
  }
}

let _currentViewingInvoice = null;
let _currentViewingItems = [];

async function viewPastInvoice(invId) {
  try {
    const invRes = await window.db.queryOne('SELECT i.*, c.name as customer_name, c.phone as customer_phone, e.name as emp_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id LEFT JOIN employees e ON i.employee_id = e.id WHERE i.id = ?', [invId]);
    if (!invRes.success || !invRes.data) {
      showToast('تعذر العثور على بيانات الفاتورة', 'error');
      return;
    }
    const inv = invRes.data;
    _currentViewingInvoice = inv;

    const itemsRes = await window.db.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [invId]);
    const items = itemsRes.success ? itemsRes.data : [];
    _currentViewingItems = items;
    inv.items = items;

    // Populate modal title
    const numEl = document.getElementById('posViewInvoiceNumber');
    if (numEl) numEl.textContent = `معاينة الفاتورة #${inv.invoice_number}`;

    const subEl = document.getElementById('posViewInvoiceSubtitle');
    if (subEl) subEl.textContent = `طريقة الدفع: ${inv.payment_method || 'نقدي'} | الكاشير: ${inv.emp_name || 'غير محدد'}`;

    // Render realistic thermal receipt preview
    const receiptContainer = document.getElementById('posThermalReceiptContainer');
    if (receiptContainer) {
      receiptContainer.innerHTML = buildReceiptHTML(inv);
    }

    openModal('posInvoiceViewModal');
  } catch (err) {
    showToast('خطأ أثناء عرض الفاتورة: ' + err.message, 'error');
  }
}

async function updateInvoiceStatusFromPosView() {
  if (!_currentViewingInvoice) return;
  const newStatus = document.getElementById('posViewStatusSelect')?.value;
  if (!newStatus) return;

  try {
    const res = await window.db.updateInvoiceStatus(_currentViewingInvoice.id, newStatus);
    if (res && res.success) {
      _currentViewingInvoice.status = newStatus;
      showToast(`تم تحديث حالة الفاتورة #${_currentViewingInvoice.invoice_number} إلى "${newStatus}" بنجاح ✓`, 'success');
      const match = posAllInvoices.find(x => x.id === _currentViewingInvoice.id);
      if (match) match.status = newStatus;
      filterPosHistory();
    } else {
      showToast('فشل تحديث الحالة: ' + (res?.error || ''), 'error');
    }
  } catch (e) {
    showToast('خطأ: ' + e.message, 'error');
  }
}

async function printInvoiceFromPosView() {
  if (!_currentViewingInvoice) return;
  lastSavedInvoice = {
    ..._currentViewingInvoice,
    items: _currentViewingItems
  };
  await directPrintReceipt(false, false);
}

async function sendWhatsAppFromPosView() {
  if (!_currentViewingInvoice) return;
  const phone = _currentViewingInvoice.customer_phone;
  if (!phone) {
    showToast('العميل ليس لديه رقم هاتف مسجل', 'warning');
    return;
  }
  await sendWhatsAppFromHistory(_currentViewingInvoice);
}

// debounce لتأخير البحث حتى لا يعلق الجهاز بكل ضغطة
let _filterTimer = null;
function filterPosHistory() {
  clearTimeout(_filterTimer);
  _filterTimer = setTimeout(_doFilter, 300);
}
function _doFilter() {
  const query    = (document.getElementById('posHistorySearch').value || '').toLowerCase();
  const phone    = (document.getElementById('posHistoryPhone').value || '').toLowerCase();

  if (!query && !phone) {
    renderPosHistory(posAllInvoices.slice(0, 30));
    return;
  }

  const filtered = posAllInvoices.filter(inv => {
    const invNum           = (inv.invoice_number || '').toLowerCase();
    const custName         = (inv.customer_name  || '').toLowerCase();
    const custPhone        = (inv.customer_phone || '').toLowerCase();
    const dynamicNetTotal  = (inv.dynamic_net_total || 0).toString();

    const matchQuery  = !query || invNum.includes(query) || custName.includes(query) || dynamicNetTotal.includes(query);
    const matchPhone  = !phone || custPhone.includes(phone);
    return matchQuery && matchPhone;
  });

  renderPosHistory(filtered);
}



// ─── State ────────────────────────────────────────────────────────────────────
let invoiceItems = [];
let categories = [];
let allServices = [];
let allServiceSizes = [];
let currentInvoiceNumber = '';
let lastSavedInvoice = null;
let sessionRole = null;
let settings = { company_name: 'CafePro System', currency: 'جنيه', receipt_footer: 'شكراً لزيارتكم' };
let currentOrderType = 'صالة'; // 'صالة' | 'تيك أواي' | 'دليفري'
let currentTableId = null;
let currentInvoiceId = null;
let allTables = [];
let allDeliveryDrivers = [];

// ─── Init ─────────────────────────────────────────────────────────────────────────────
async function init() {
  sessionRole = sessionStorage.getItem('photoStudio_role');
  
  // Date default
  const dateEl = document.getElementById('invoiceDate');
  if (dateEl) dateEl.value = getLocalISODate();

  // ─── Realistic Fallback Data Matching Real SQLite Database ──────────────────────
  const defaultCategories = [
    { id: 5, name: 'ساخن' },
    { id: 6, name: 'فرابيه' },
    { id: 7, name: 'سموزي' },
    { id: 8, name: 'مشروبات ساخنة وقهوة' },
    { id: 9, name: 'مشروبات باردة ومثلجات' },
    { id: 10, name: 'ساندوتشات ووجبات' },
    { id: 11, name: 'بيتزا وباستا' },
    { id: 12, name: 'حلويات ومخبوزات' }
  ];

  const defaultServices = [
    { id: 9, category_id: 9, name: 'آيس سبانش لاتيه', barcode: 'CF-201', sell_price: 70, image: '../assets/items/iced-latte.jpg', cat_name: 'مشروبات باردة ومثلجات' },
    { id: 12, category_id: 9, name: 'أوريو فرابيه بالكريمة', barcode: 'CF-204', sell_price: 75, image: '../assets/items/oreo-frappe.jpg', cat_name: 'مشروبات باردة ومثلجات' },
    { id: 2, category_id: 8, name: 'إسبريسو سينجل / دبل', barcode: 'CF-101', sell_price: 35, image: '../assets/items/espresso.jpg', cat_name: 'مشروبات ساخنة وقهوة' },
    { id: 22, category_id: 11, name: 'بيتزا بيبروني سوبريم', barcode: 'CF-402', sell_price: 155, image: '../assets/items/pizza-pepperoni.jpg', cat_name: 'بيتزا وباستا' },
    { id: 21, category_id: 11, name: 'بيتزا مارجريتا نابوليتان', barcode: 'CF-401', sell_price: 120, image: '../assets/items/pizza-margherita.jpg', cat_name: 'بيتزا وباستا' },
    { id: 25, category_id: 12, name: 'تشيز كيك بلوبيري نيويورك', barcode: 'CF-501', sell_price: 85, image: '../assets/items/cheesecake.jpg', cat_name: 'حلويات ومخبوزات' },
    { id: 19, category_id: 10, name: 'حواوشي', barcode: '', sell_price: 50, image: '', cat_name: 'ساندوتشات ووجبات' },
    { id: 17, category_id: 10, name: 'ساندوتش كريسبي تشيكن مدخن', barcode: 'CF-302', sell_price: 130, image: '../assets/items/crispy-chicken.jpg', cat_name: 'ساندوتشات ووجبات' },
    { id: 11, category_id: 9, name: 'سموذي مانجو باشن فروت', barcode: 'CF-203', sell_price: 65, image: '../assets/items/mango-smoothie.jpg', cat_name: 'مشروبات باردة ومثلجات' },
    { id: 6, category_id: 8, name: 'شاي كرك بالهيل والزعفران', barcode: 'CF-105', sell_price: 40, image: '../assets/items/karak-tea.jpg', cat_name: 'مشروبات ساخنة وقهوة' },
    { id: 20, category_id: 10, name: 'طبق كوردون بلو محشي جبن', barcode: 'CF-305', sell_price: 185, image: '../assets/items/cordon-bleu.jpg', cat_name: 'ساندوتشات ووجبات' },
    { id: 13, category_id: 9, name: 'عصير برتقال فريش طبيعي', barcode: 'CF-205', sell_price: 45, image: '../assets/items/orange-juice.jpg', cat_name: 'مشروبات باردة ومثلجات' },
    { id: 4, category_id: 8, name: 'فانيليا ولاتيه كاراميل', barcode: 'CF-103', sell_price: 65, image: '../assets/items/latte.jpg', cat_name: 'مشروبات ساخنة وقهوة' },
    { id: 5, category_id: 8, name: 'فلات وايت أسترالي', barcode: 'CF-104', sell_price: 60, image: '../assets/items/flat-white.jpg', cat_name: 'مشروبات ساخنة وقهوة' },
    { id: 1, category_id: 5, name: 'قهوة تركي', barcode: '', sell_price: 50, image: '', cat_name: 'ساخن' },
    { id: 8, category_id: 8, name: 'قهوة تركي مخصوص بالحبهان', barcode: 'CF-107', sell_price: 30, image: '../assets/items/turkish-coffee.jpg', cat_name: 'مشروبات ساخنة وقهوة' },
    { id: 3, category_id: 8, name: 'كابتشينو إيطالي كلاسيك', barcode: 'CF-102', sell_price: 55, image: '../assets/items/cappuccino.jpg', cat_name: 'مشروبات ساخنة وقهوة' },
    { id: 28, category_id: 12, name: 'كرواسون زبدة فرنسي باللوز', barcode: 'CF-504', sell_price: 50, image: '../assets/items/croissant.jpg', cat_name: 'حلويات ومخبوزات' },
    { id: 16, category_id: 10, name: 'كلاسيك بيف برجر تشيز', barcode: 'CF-301', sell_price: 145, image: '../assets/items/burger.jpg', cat_name: 'ساندوتشات ووجبات' },
    { id: 18, category_id: 10, name: 'كلوب ساندوتش سوبريم', barcode: 'CF-303', sell_price: 110, image: '../assets/items/club-sandwich.jpg', cat_name: 'ساندوتشات ووجبات' },
    { id: 26, category_id: 12, name: 'كيك لافا شوكولاتة فادج', barcode: 'CF-502', sell_price: 90, image: '../assets/items/chocolate-lava.jpg', cat_name: 'حلويات ومخبوزات' },
    { id: 14, category_id: 5, name: 'لاتيه', barcode: '', sell_price: 60, image: '', cat_name: 'ساخن' },
    { id: 15, category_id: 5, name: 'ميكياتو', barcode: '', sell_price: 55, image: '', cat_name: 'ساخن' },
    { id: 10, category_id: 9, name: 'موهيتو فراولة وليمون نعناع', barcode: 'CF-202', sell_price: 55, image: '../assets/items/mojito.jpg', cat_name: 'مشروبات باردة ومثلجات' },
    { id: 7, category_id: 8, name: 'هوت شوكليت بالمارشميلو', barcode: 'CF-106', sell_price: 60, image: '../assets/items/hot-chocolate.jpg', cat_name: 'مشروبات ساخنة وقهوة' },
    { id: 27, category_id: 12, name: 'وافل بلجيكي بالنوتيلا والفواكه', barcode: 'CF-503', sell_price: 80, image: '../assets/items/waffle.jpg', cat_name: 'حلويات ومخبوزات' }
  ];

  let invRes = null, setRes = null, catRes = null, srvRes = null, custRes = null, empRes = null, sizesRes = null;

  // جلب البيانات مع حماية كاملة من أي استثناء أو انقطاع
  try {
    if (window.db && typeof window.db.generateInvoiceNumber === 'function') {
      invRes = await window.db.generateInvoiceNumber().catch(() => null);
    }
  } catch(e) {}
  if (!invRes || !invRes.success) {
    invRes = { success: true, data: '0001' };
  }

  try {
    if (window.db && typeof window.db.getSettings === 'function') {
      setRes = await window.db.getSettings().catch(() => null);
    }
  } catch(e) {}
  if (!setRes || !setRes.success) {
    setRes = { success: true, data: { company_name: 'كافيه ومطعم برو', currency: 'جنيه', delivery_enabled: 1 } };
  }

  try {
    if (window.db && typeof window.db.query === 'function') {
      catRes = await window.db.query('SELECT * FROM service_categories ORDER BY id', []).catch(() => null);
    }
  } catch(e) {}

  try {
    if (window.db && typeof window.db.query === 'function') {
      srvRes = await window.db.query('SELECT s.*, sc.name as cat_name FROM services s LEFT JOIN service_categories sc ON s.category_id=sc.id ORDER BY s.name', []).catch(() => null);
    }
  } catch(e) {}

  try {
    if (window.db && typeof window.db.query === 'function') {
      custRes = await window.db.query('SELECT id,name,phone FROM customers ORDER BY name', []).catch(() => null);
    }
  } catch(e) {}
  if (!custRes || !custRes.success) {
    custRes = { success: true, data: [{ id: 1, name: 'عميل نقدي سريع', phone: '01000000000' }] };
  }

  try {
    if (window.db && typeof window.db.query === 'function') {
      empRes = await window.db.query('SELECT id,name FROM employees WHERE is_active=1 ORDER BY name', []).catch(() => null);
    }
  } catch(e) {}
  if (!empRes || !empRes.success) {
    empRes = { success: true, data: [{ id: 1, name: 'كاشير رئيسي' }] };
  }

  try {
    if (window.services && typeof window.services.getAllSizes === 'function') {
      sizesRes = await window.services.getAllSizes().catch(() => null);
    }
  } catch(e) {}
  if (!sizesRes || !sizesRes.success) {
    sizesRes = { success: true, data: [] };
  }

  if (sizesRes && sizesRes.success) {
    allServiceSizes = sizesRes.data || [];
  }

  // Invoice number
  if (invRes && invRes.success) {
    currentInvoiceNumber = invRes.data;
    const invEl = document.getElementById('invoiceNumberDisplay');
    if (invEl) invEl.textContent = invRes.data;
  }

  // Settings
  if (setRes && setRes.success && setRes.data) {
    settings = {...settings, ...setRes.data};
    let logoSrc = '../assets/logo.png';
    if (settings.logo_path) {
      if (settings.logo_path.startsWith('http') || settings.logo_path.startsWith('data:')) {
        logoSrc = settings.logo_path;
      } else if (settings.logo_path.startsWith('assets/')) {
        logoSrc = '../' + settings.logo_path;
      } else if (settings.logo_path.startsWith('../')) {
        logoSrc = settings.logo_path;
      } else if (window.electron && typeof window.electron.getLogoPath === 'function') {
        logoSrc = (await window.electron.getLogoPath(settings.logo_path)) || '../assets/logo.png';
      } else {
        logoSrc = 'file:///' + settings.logo_path.replace(/\\/g, '/');
      }
    }
    const iconEl = document.getElementById('posLogoIcon');
    if (iconEl) {
      iconEl.innerHTML = `<img src="${logoSrc}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:8px;" onerror="this.onerror=null;this.src='../assets/logo.png';" />`;
    }
    const titleEl = document.querySelector('#posLogoContainer .logo-text');
    if (titleEl && settings.company_name) {
      titleEl.textContent = settings.company_name;
    }

    // Toggle delivery controls
    const delBtn = document.getElementById('typeDeliveryBtn');
    const actDelBtn = document.getElementById('btnActiveDelivery');
    if (delBtn) delBtn.style.display = 'flex';
    if (actDelBtn) actDelBtn.style.display = 'inline-block';

    // QR Menu feature visibility from settings
    const qrBtn = document.getElementById('btnQrOrdersBadge');
    if (qrBtn) {
      if (settings.enable_qr_menu !== undefined && Number(settings.enable_qr_menu) === 0) {
        qrBtn.style.setProperty('display', 'none', 'important');
      } else {
        qrBtn.style.removeProperty('display');
      }
    }

    if (sessionRole === 'cashier') {
      if (Number(settings.prevent_cashier_price_edit) === 1) {
        const pEl = document.getElementById('itemPrice');
        if (pEl) pEl.disabled = true;
      }
      if (Number(settings.cashier_prevent_discount) === 1) {
        const dPct = document.getElementById('discountPercent');
        const dAmt = document.getElementById('discountAmount');
        const dItm = document.getElementById('itemDiscount');
        if (dPct) dPct.disabled = true;
        if (dAmt) dAmt.disabled = true;
        if (dItm) dItm.disabled = true;
      }
      if (Number(settings.cashier_lock_to_pos) === 1) {
        const backBtn = document.getElementById('btnPosBackOrLogout');
        if (backBtn) {
          backBtn.innerHTML = 'تسجيل خروج';
          backBtn.style.color = '#fca5a5';
          backBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          backBtn.style.background = 'rgba(239, 68, 68, 0.1)';
          backBtn.title = 'تسجيل الخروج من البرنامج';
        }
      }
    }
  }

  // Categories
  if (catRes && catRes.success && Array.isArray(catRes.data) && catRes.data.length > 0) {
    categories = catRes.data;
  } else {
    categories = defaultCategories;
  }
  renderCategoryBtns();
  populateCategorySelect();

  // Make categories scrollable with mouse wheel
  const catListElem = document.getElementById('categoryBtns');
  if (catListElem) {
    catListElem.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) { e.preventDefault(); catListElem.scrollLeft += e.deltaY; }
    });
  }

  // Services
  if (srvRes && srvRes.success && Array.isArray(srvRes.data) && srvRes.data.length > 0) {
    allServices = srvRes.data;
  } else {
    // If services table query with JOIN returned 0 rows, try simple SELECT * FROM services
    let fallbackServices = null;
    if (window.db && typeof window.db.query === 'function') {
      try {
        const fRes = await window.db.query('SELECT * FROM services ORDER BY name', []).catch(() => null);
        if (fRes && fRes.success && Array.isArray(fRes.data) && fRes.data.length > 0) {
          fallbackServices = fRes.data;
        }
      } catch(e) {}
    }
    allServices = fallbackServices || defaultServices;
  }
  populateServiceSelect(allServices);
  renderServiceGrid(allServices);

  // Customers
  const cList = document.getElementById('customersList');
  if (custRes && custRes.success && Array.isArray(custRes.data)) {
    window.allCustomers = custRes.data;
    let custHtml = '';
    custRes.data.forEach(c => {
      custHtml += `<option value="${c.name} - ${c.phone||""}" data-id="${c.id}" data-phone="${c.phone||""}"></option>`;
    });
    if (cList) cList.innerHTML = custHtml;
  }

  // Employees
  const empSel  = document.getElementById('employeeSelect');
  if (empRes && empRes.success && Array.isArray(empRes.data)) {
    window.allEmployees = empRes.data;
    let empHtml = '<option value="">اختر الكاشير/البائع</option>';
    empRes.data.forEach(e => {
      empHtml += `<option value="${e.id}">${e.name}</option>`;
    });
    if (empSel) empSel.innerHTML = empHtml;
  } else {
    if (empSel) empSel.innerHTML = '<option value="">اختر الكاشير/البائع</option>';
  }

  // Auto-select current employee as cashier
  const empIdSession = sessionStorage.getItem('photoStudio_employeeId');
  if (empIdSession && empSel && empSel.querySelector(`option[value="${empIdSession}"]`)) {
    empSel.value = empIdSession;
  }

  // Load Tables & Drivers & Reservation Autocomplete
  await loadTables();
  await loadDeliveryDrivers();
  loadReservationCustomersInPOS();

  // Check if opened from tables.html
  const activeTableId = sessionStorage.getItem('pos_active_table_id');
  const resumeInvoiceId = sessionStorage.getItem('pos_resume_invoice_id');
  sessionStorage.removeItem('pos_active_table_id');
  sessionStorage.removeItem('pos_resume_invoice_id');

  if (activeTableId) {
    setOrderType('صالة');
    const tblSel = document.getElementById('posTableSelect');
    if (tblSel) tblSel.value = activeTableId;
    currentTableId = parseInt(activeTableId);
    await onTableSelectChange();
  } else if (resumeInvoiceId) {
    await resumeInvoiceById(parseInt(resumeInvoiceId));
  } else {
    // Open mandatory Order Type Gate Modal
    openOrderTypeGateModal();
  }
}

// ─── Mandatory Order Type Gate Modal ──────────────────────────────────────────
function openOrderTypeGateModal() {
  const gateDel = document.getElementById('gateDeliveryBtn');
  if (gateDel) {
    gateDel.style.display = 'block';
  }
  const modal = document.getElementById('orderTypeGateModal');
  if (modal) modal.classList.add('open');
}

function closeOrderTypeGateModal() {
  const modal = document.getElementById('orderTypeGateModal');
  if (modal) modal.classList.remove('open');
}

async function selectOrderTypeFromGate(type) {
  closeOrderTypeGateModal();
  if (type === 'صالة') {
    setOrderType('صالة');
    await openTablePickerModal();
  } else {
    setOrderType(type);
  }
}

// ─── Visual Table Picker Modal ───────────────────────────────────────────────
let pickerCurrentFilter = 'all';

async function openTablePickerModal() {
  await loadTables();
  updatePickerCounts();
  renderTablePickerGrid();
  const modal = document.getElementById('posTablePickerModal');
  if (modal) modal.classList.add('open');
}

function updatePickerCounts() {
  const total = allTables.length;
  const empty = allTables.filter(t => t.status === 'فاضية').length;
  const busy = allTables.filter(t => t.status === 'مشغولة').length;
  const reserved = allTables.filter(t => t.status === 'محجوزة').length;

  const cAll = document.getElementById('pickerCountAll');
  const cEmpty = document.getElementById('pickerCountEmpty');
  const cBusy = document.getElementById('pickerCountBusy');
  const cRes = document.getElementById('pickerCountReserved');
  if (cAll) cAll.textContent = total;
  if (cEmpty) cEmpty.textContent = empty;
  if (cBusy) cBusy.textContent = busy;
  if (cRes) cRes.textContent = reserved;
}

function filterTablePicker(status, btn) {
  pickerCurrentFilter = status;
  document.querySelectorAll('.table-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTablePickerGrid();
}

function renderTablePickerGrid() {
  const container = document.getElementById('posTablePickerGrid');
  if (!container) return;

  const search = (document.getElementById('pickerSearchTable')?.value || '').trim().toLowerCase();

  let filtered = allTables.filter(t => {
    if (pickerCurrentFilter !== 'all' && t.status !== pickerCurrentFilter) return false;
    if (search && !t.name.toLowerCase().includes(search) && !(t.section || '').toLowerCase().includes(search)) return false;
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted); font-size:14px; font-weight:700;">لا توجد ترابيزات مطابقة</div>';
    return;
  }

  container.innerHTML = filtered.map(t => {
    const isBusy = t.status === 'مشغولة';
    const isReserved = t.status === 'محجوزة';
    const statusClass = isBusy ? 'status-busy' : (isReserved ? 'status-reserved' : 'status-empty');
    const badgeColor = isBusy ? '#dc2626' : (isReserved ? '#d97706' : '#059669');
    const badgeBg = isBusy ? '#fee2e2' : (isReserved ? '#fef3c7' : '#d1fae5');
    const badgeText = isBusy ? 'مشغولة' : (isReserved ? 'محجوزة' : 'فاضية');

    let extraInfo = '';
    if (isBusy) {
      extraInfo = `
        <div style="font-size:11px; margin-top:6px; background:rgba(220,38,38,0.08); padding:5px 8px; border-radius:6px;">
          <div style="font-weight:700; color:#dc2626;">فاتورة: ${escapeHtml(t.active_invoice_number || 'مفتوحة')}</div>
          <div style="font-weight:900; color:#991b1b; font-size:12px; margin-top:2px;">${fmt(t.active_invoice_total || 0)} ج.م</div>
        </div>
      `;
    } else if (isReserved) {
      extraInfo = `
        <div style="font-size:11px; margin-top:6px; color:#b45309; background:rgba(217,119,6,0.08); padding:5px 8px; border-radius:6px;">
          <div style="font-weight:800;">حجز: ${escapeHtml(t.reservation_name || 'مسبقاً')} (${escapeHtml(t.reservation_phone || '')})</div>
          ${t.reservation_time ? `<div style="font-size:10px; margin-top:2px; display:flex; align-items:center; gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${escapeHtml(t.reservation_time)} | ${t.reservation_party_size || 2} أفراد</div>` : ''}
          <div style="display:flex; gap:6px; margin-top:6px;">
            <button class="btn btn-sm btn-success" style="padding:2px 8px; font-size:10px; font-weight:700;" onclick="selectTableFromPicker(${t.id}); event.stopPropagation();">بدء الطلب للعميل</button>
            <button class="btn btn-sm btn-outline" style="padding:2px 6px; font-size:10px; color:#dc2626;" onclick="cancelTableReservationFromPOS(${t.id}, event)">إلغاء الحجز</button>
          </div>
        </div>
      `;
    } else {
      extraInfo = `
        <div style="font-size:11px; margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
          <span style="color:#059669; font-weight:700;">جاهزة لطلب جديد</span>
          <button class="btn btn-sm btn-outline" style="padding:2px 8px; font-size:10px; font-weight:700; color:#b45309; border-color:#fcd34d; background:#fffbeb;" onclick="openReserveModalFromPOS(${t.id}, '${escapeHtml(t.name)}', event)" title="حجز هذه الترابيزة">حجز</button>
        </div>
      `;
    }

    return `
      <div class="table-picker-card ${statusClass}" onclick="selectTableFromPicker(${t.id})">
        <div style="display:flex; justify-content:space-between; align-items:start;">
          <div>
            <div style="font-weight:900; font-size:15px; color:var(--text);">${escapeHtml(t.name)}</div>
            <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(t.section || 'الصالة')}</div>
          </div>
          <span style="font-size:11px; font-weight:800; padding:2px 8px; border-radius:12px; background:${badgeBg}; color:${badgeColor};">
            ${badgeText}
          </span>
        </div>
        ${extraInfo}
        <div style="font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center; margin-top:8px; border-top:1px dashed var(--border); padding-top:6px;">
          <span style="display:flex; align-items:center; gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> ${t.seats || 4} مقاعد</span>
          <span style="color:var(--primary); font-weight:800; font-size:12px;">اختيار</span>
        </div>
      </div>
    `;
  }).join('');
}

async function selectTableFromPicker(tableId) {
  closeModal('posTablePickerModal');
  const tblSel = document.getElementById('posTableSelect');
  if (tblSel) tblSel.value = tableId;
  await onTableSelectChange();
}

// ─── Table Reservation From POS ───────────────────────────────────────────────
async function openReserveModalFromPOS(tableId = null, tableName = '', e = null) {
  if (e) e.stopPropagation();
  await loadTables();

  const sel = document.getElementById('posReserveTableSelect');
  if (sel) {
    sel.innerHTML = '<option value="">اختر ترابيزة</option>' +
      allTables.map(t => `<option value="${t.id}" ${t.status === 'فاضية' ? 'style="color:#059669; font-weight:700;"' : ''}>${t.name} (${t.status})</option>`).join('');
    if (tableId) sel.value = tableId;
    else if (currentTableId) sel.value = currentTableId;
  }

  const custSel = document.getElementById('posReserveCustomerSelect');
  if (custSel) custSel.value = '';
  document.getElementById('posReserveCustomerName').value = '';
  document.getElementById('posReserveCustomerPhone').value = '';
  document.getElementById('posReservePartySize').value = '2';

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('posReserveTime').value = now.toISOString().slice(0, 16);

  loadReservationCustomersInPOS();
  openModal('posReserveTableModal');
  setTimeout(() => document.getElementById('posReserveCustomerName')?.focus(), 150);
}

async function confirmReserveTableFromPOS() {
  const tableId = parseInt(document.getElementById('posReserveTableSelect')?.value);
  const name = document.getElementById('posReserveCustomerName')?.value.trim();
  const phone = document.getElementById('posReserveCustomerPhone')?.value.trim();
  const time = document.getElementById('posReserveTime')?.value;
  const partySize = parseInt(document.getElementById('posReservePartySize')?.value) || 2;

  if (!tableId) {
    showToast('يرجى اختيار الترابيزة المراد حجزها', 'warning');
    return;
  }
  if (!name || !phone) {
    showToast('يرجى إدخال اسم العميل ورقم هاتفه', 'warning');
    return;
  }

  const table = allTables.find(t => t.id === tableId);
  const tableName = table ? table.name : `ترابيزة ${tableId}`;

  try {
    const res = await window.tables.reserve({
      tableId,
      name,
      phone,
      time: time ? time.replace('T', ' ') : null,
      partySize
    });

    if (res?.success) {
      closeModal('posReserveTableModal');
      showToast(`تم تسجيل حجز ${tableName} للعميل ${name} بنجاح ✓`, 'success');
      await loadTables();
      updatePickerCounts();
      renderTablePickerGrid();

      // Send WhatsApp confirmation
      try {
        const setRes = await window.db.getSettings();
        const shopName = setRes?.data?.company_name || 'CafePro';
        const formattedTime = time ? time.replace('T', ' ') : '';
        const msg = `أهلاً ${name}\nتم تأكيد حجز ${tableName} في ${shopName}${formattedTime ? ` يوم/موعد: ${formattedTime}` : ''}${partySize ? ` لعدد: ${partySize} أفراد` : ''}.\nبانتظاركم بكل سرور`;
        await window.whatsapp.send(phone, msg);
        showToast('تم إرسال تأكيد الحجز عبر الواتساب ✓', 'success');
      } catch (waErr) {
        console.warn('WhatsApp notice:', waErr);
      }
    } else {
      showToast('فشل تسجيل الحجز: ' + (res?.error || ''), 'error');
    }
  } catch (err) {
    showToast('خطأ أثناء الحجز: ' + err.message, 'error');
  }
}

async function cancelTableReservationFromPOS(tableId, e = null) {
  if (e) e.stopPropagation();
  const table = allTables.find(t => t.id === tableId);
  const tableName = table ? table.name : `ترابيزة ${tableId}`;
  const custName = table?.reservation_name || '';
  const custPhone = table?.reservation_phone || '';

  const ask = await Swal.fire({
    title: 'إلغاء حجز الترابيزة؟',
    text: `هل أنت متأكد من إلغاء حجز ${tableName} وإعادتها لحالة فاضية؟`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم، ألغِ الحجز',
    cancelButtonText: 'تراجع',
    confirmButtonColor: '#dc2626'
  });
  if (!ask.isConfirmed) return;

  const res = await window.tables.updateStatus(tableId, 'فاضية');
  if (res?.success) {
    if (custPhone) {
      try {
        const setRes = await window.db.getSettings();
        const shopName = setRes?.data?.company_name || 'CafePro';
        const cancelMsg = `أهلاً ${custName || 'عميلنا العزيز'} 🤍\nنود إعلامك بأنه تم إلغاء حجز ${tableName} في ${shopName}.\nنتشرف بزيارتك دائماً في أي وقت آخر ☕`;
        if (window.whatsapp && typeof window.whatsapp.sendTableCancel === 'function') {
          await window.whatsapp.sendTableCancel({ phone: custPhone, customerName: custName, tableName });
        } else if (window.whatsapp && typeof window.whatsapp.send === 'function') {
          await window.whatsapp.send(custPhone, cancelMsg);
        }
        showToast('تم إلغاء الحجز وإرسال إشعار الإلغاء عبر الواتساب للعميل ✓', 'success');
      } catch (err) {
        console.warn('Cancel WA notice err:', err);
      }
    } else {
      showToast('تم إلغاء الحجز وأصبحت الترابيزة متاحة ✓', 'success');
    }
    await loadTables();
    updatePickerCounts();
    renderTablePickerGrid();
  } else {
    showToast('خطأ: ' + (res?.error || ''), 'error');
  }
}

// ─── Table & Cafe Helpers ──────────────────────────────────────────────────────
async function loadTables() {
  try {
    let res = null;
    if (window.tables && typeof window.tables.list === 'function') {
      res = await window.tables.list();
    }
    if ((!res || !res.success || !res.data || !res.data.length) && window.db && typeof window.db.query === 'function') {
      res = await window.db.query('SELECT * FROM tables WHERE is_active = 1 ORDER BY section, name', []);
    }
    if (res && res.success && res.data && res.data.length > 0) {
      allTables = res.data;
    }
  } catch (e) {
    console.warn('Error loading tables from DB:', e);
  }

  // Graceful fallback to 10 clean cafe tables if DB is initializing
  if (!allTables || allTables.length === 0) {
    allTables = [
      { id: 7, name: 'ترابيزة 1', section: 'الصالة الرئيسية', seats: 4, status: 'فاضية', is_active: 1 },
      { id: 8, name: 'ترابيزة 2', section: 'الصالة الرئيسية', seats: 4, status: 'فاضية', is_active: 1 },
      { id: 9, name: 'ترابيزة 3', section: 'الصالة الرئيسية', seats: 2, status: 'فاضية', is_active: 1 },
      { id: 10, name: 'ترابيزة 4', section: 'الصالة الرئيسية', seats: 6, status: 'فاضية', is_active: 1 },
      { id: 11, name: 'عائلية 1', section: 'ركن العائلات', seats: 8, status: 'فاضية', is_active: 1 },
      { id: 12, name: 'عائلية 2', section: 'ركن العائلات', seats: 6, status: 'فاضية', is_active: 1 },
      { id: 13, name: 'تراس 1', section: 'التراس الخارجي', seats: 4, status: 'فاضية', is_active: 1 },
      { id: 14, name: 'تراس 2', section: 'التراس الخارجي', seats: 4, status: 'فاضية', is_active: 1 },
      { id: 15, name: 'صالة VIP 1', section: 'قسم VIP', seats: 6, status: 'فاضية', is_active: 1 },
      { id: 16, name: 'صالة VIP 2', section: 'قسم VIP', seats: 4, status: 'فاضية', is_active: 1 }
    ];
  }

  const tblSel = document.getElementById('posTableSelect');
  if (tblSel) {
    tblSel.innerHTML = '<option value="">اختر ترابيزة</option>' +
      allTables.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${t.status})</option>`).join('');
    if (currentTableId) tblSel.value = currentTableId;
  }
}

function getSelectedTableName() {
  const tblSel = document.getElementById('posTableSelect');
  if (!tblSel || !tblSel.value) return '';
  const opt = tblSel.options[tblSel.selectedIndex];
  return opt ? opt.textContent : '';
}

async function onTableSelectChange() {
  const tblSel = document.getElementById('posTableSelect');
  if (!tblSel) return;
  const tableId = parseInt(tblSel.value) || null;

  // 1. Confirm before switching if unsaved items exist in current cart
  if (invoiceItems.length > 0 && !currentInvoiceId && currentTableId && currentTableId !== tableId) {
    const ask = await Swal.fire({
      title: 'تنبيه: السلة بها أصناف!',
      text: 'عندك أصناف في السلة لسه ما اتبعتش، هل تريد تجاهلها والانتقال للترابيزة الجديدة؟',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#E05252',
      cancelButtonColor: '#94A3B8',
      confirmButtonText: 'نعم، تجاهل وانتقل',
      cancelButtonText: 'إلغاء والعودة'
    });
    if (!ask.isConfirmed) {
      if (currentTableId) tblSel.value = currentTableId;
      return;
    }
  }

  // 2. Set new table and clear cart
  currentTableId = tableId;
  currentInvoiceId = null;
  invoiceItems = [];
  renderItemsTable();
  recalcTotals();

  // Reset invoice number to a fresh one
  try {
    if (window.db && typeof window.db.generateInvoiceNumber === 'function') {
      const invRes = await window.db.generateInvoiceNumber().catch(() => null);
      if (invRes && invRes.success) {
        currentInvoiceNumber = invRes.data;
        const disp = document.getElementById('invoiceNumberDisplay');
        if (disp) disp.textContent = invRes.data;
      }
    }
  } catch(e) {}

  const cartTitle = document.getElementById('cartOrderTitle');
  if (cartTitle) {
    cartTitle.textContent = tableId ? `طلب صالة — ${getSelectedTableName()}` : 'طلب صالة — ترابيزة جديدة';
  }

  // 3. Search for open invoice on the selected table
  if (tableId) {
    const checkRes = await window.db.queryOne(
      `SELECT id FROM invoices WHERE table_id = ? AND status IN ('مفتوحة', 'مرسلة للمطبخ') ORDER BY id DESC LIMIT 1`,
      [tableId]
    );
    if (checkRes.success && checkRes.data) {
      await resumeInvoiceById(checkRes.data.id);
    }
  }
}

async function loadDeliveryDrivers() {
  try {
    const res = await window.db.query("SELECT * FROM employees WHERE employee_type = 'دليفري' AND is_active = 1", []);
    if (res.success) {
      allDeliveryDrivers = res.data || [];
      const drvSel = document.getElementById('posDriverSelect');
      if (drvSel) {
        drvSel.innerHTML = '<option value="">اختر الدليفري</option>' +
          allDeliveryDrivers.map(d => `<option value="${d.id}">${d.name} (${d.phone||''})</option>`).join('');
      }
    }
  } catch (e) { console.error('Error loading delivery drivers:', e); }
}

function setOrderType(type) {
  // Only 3 standard types: صالة, تيك أواي, دليفري
  if (type === 'قهوة') type = 'تيك أواي';
  currentOrderType = type;
  const dInBtn = document.getElementById('typeDineInBtn');
  const tkBtn = document.getElementById('typeTakeawayBtn');
  const delBtn = document.getElementById('typeDeliveryBtn');

  if (dInBtn) dInBtn.classList.toggle('active', type === 'صالة');
  if (tkBtn) tkBtn.classList.toggle('active', type === 'تيك أواي');
  if (delBtn) delBtn.classList.toggle('active', type === 'دليفري');

  const tblGroup = document.getElementById('tableControlGroup');
  const delGroup = document.getElementById('deliveryControlGroup');
  const custGroup = document.getElementById('customerControlGroup');
  const cartIcon = document.getElementById('cartOrderTypeIcon');
  const cartTitle = document.getElementById('cartOrderTitle');
  const delFeeRow = document.getElementById('cartDeliveryFeeRow');

  // Customer control is ALWAYS accessible so cashier can identify customers for any order
  if (custGroup) custGroup.style.display = 'flex';

  if (type === 'صالة') {
    if (tblGroup) tblGroup.style.display = 'flex';
    if (delGroup) delGroup.style.display = 'none';
    if (delFeeRow) delFeeRow.style.display = 'none';
    if (cartIcon) cartIcon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5B22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><line x1="6" y1="16" x2="6" y2="20"/><line x1="18" y1="16" x2="18" y2="20"/></svg>';
    const tblName = getSelectedTableName();
    if (cartTitle) cartTitle.textContent = `طلب صالة — ${tblName || 'ترابيزة جديدة'}`;
  } else if (type === 'دليفري') {
    if (tblGroup) tblGroup.style.display = 'none';
    if (delGroup) delGroup.style.display = 'flex';
    if (delFeeRow) delFeeRow.style.display = 'flex';
    if (cartIcon) cartIcon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5B22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"></circle><path d="M12 17.5V14l-3-3 4-3 2 3h2"></path></svg>';
    if (cartTitle) cartTitle.textContent = `طلب دليفري وتوصيل`;
  } else {
    // تيك أواي
    if (tblGroup) tblGroup.style.display = 'none';
    if (delGroup) delGroup.style.display = 'none';
    if (delFeeRow) delFeeRow.style.display = 'none';
    if (cartIcon) cartIcon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5B22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>';
    if (cartTitle) cartTitle.textContent = `طلب تيك أواي (سفري)`;
  }

  // Kitchen button [F3] MUST always be visible for all order types!
  const btnKitchen = document.getElementById('btnSendToKitchen');
  if (btnKitchen) {
    btnKitchen.style.display = 'flex';
  }
  recalcTotals();
  if (invoiceItems && invoiceItems.length > 0) {
    renderInvoiceItems();
  }
}

async function resumeInvoiceById(id) {
  const invRes = await window.db.queryOne('SELECT * FROM invoices WHERE id = ?', [id]);
  if (!invRes.success || !invRes.data) return;
  const inv = invRes.data;

  const itemsRes = await window.db.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [id]);
  const items = itemsRes.success ? itemsRes.data : [];

  currentInvoiceId = inv.id;
  currentInvoiceNumber = inv.invoice_number;
  const numDisplay = document.getElementById('invoiceNumberDisplay');
  if (numDisplay) numDisplay.textContent = inv.invoice_number;

  if (inv.table_id || inv.invoice_type === 'صالة') {
    setOrderType('صالة');
    const tblSel = document.getElementById('posTableSelect');
    if (tblSel) tblSel.value = inv.table_id;
    currentTableId = inv.table_id;
  } else if (inv.invoice_type === 'دليفري') {
    setOrderType('دليفري');
    const drvSel = document.getElementById('posDriverSelect');
    const feeEl = document.getElementById('posDeliveryFee');
    if (drvSel && inv.driver_id) drvSel.value = inv.driver_id;
    if (feeEl && inv.delivery_fee) feeEl.value = inv.delivery_fee;
  } else {
    setOrderType('تيك أواي');
  }

  if (inv.customer_id) {
    const custSel = document.getElementById('customerSelect');
    const custSearch = document.getElementById('customerSearchInput');
    const clearBtn = document.getElementById('btnClearCustomer');
    const cartCustEl = document.getElementById('cartCustomerDisplay');
    if (custSel) custSel.value = inv.customer_id;
    const cust = (window.allCustomers || []).find(c => c.id === inv.customer_id);
    if (cust && custSearch) {
      custSearch.value = `${cust.name}${cust.phone ? ' - ' + cust.phone : ''}`;
      if (clearBtn) clearBtn.style.display = 'block';
      if (cartCustEl) {
        cartCustEl.style.display = 'block';
        cartCustEl.innerHTML = `👤 <span style="color:#0F172A;">العميل:</span> <strong style="color:#FF5B22;">${escapeHtml(cust.name)}</strong> ${cust.phone ? `<span style="font-size:11px; opacity:0.8;">(${escapeHtml(cust.phone)})</span>` : ''}`;
      }
    }
  } else {
    clearSelectedCustomer();
  }

  const dPct = document.getElementById('discountPercent');
  const dAmt = document.getElementById('discountAmount');
  const notes = document.getElementById('invoiceNotes');
  if (dPct) dPct.value = inv.discount_percent || 0;
  if (dAmt) dAmt.value = inv.discount_amount || 0;
  if (notes) notes.value = inv.notes || '';

  invoiceItems = items.map(it => ({
    service_id: it.service_id,
    category_name: it.category_name || '',
    service_name: it.service_name,
    barcode: it.barcode || '',
    sell_price: Number(it.sell_price !== undefined ? it.sell_price : (it.unit_price || 0)),
    quantity: Number(it.quantity || 1),
    item_discount: Number(it.item_discount !== undefined ? it.item_discount : (it.discount || 0)),
    total: Number(it.total || 0),
    notes: it.notes || '',
    sent_qty: Number(it.sent_qty || 0)
  }));

  renderItemsTable();
  recalcTotals();
  showToast(`تم فتح الفاتورة الحالية #${inv.invoice_number}`, 'info');
}

// ─── Active Delivery Orders Modal ─────────────────────────────────────────────
async function openActiveDeliveryModal() {
  const res = await window.delivery.getActiveOrders();
  const tbody = document.getElementById('deliveryOrdersBody');
  if (!tbody) return;

  if (!res.success || !res.data || !res.data.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">لا توجد طلبات دليفري قيد التوصيل الآن</td></tr>';
  } else {
    tbody.innerHTML = res.data.map(ord => `
      <tr>
        <td style="font-weight:700;">#${ord.invoice_number}</td>
        <td>
          <div style="font-weight:700;">${ord.customer_name || 'عميل نقدي'}</div>
          <div style="font-size:11px; color:var(--text-muted);">${ord.customer_address || ord.customer_phone || ''}</div>
        </td>
        <td><b>${ord.driver_name || 'لم يحدد طيار'}</b></td>
        <td style="text-align:right; font-weight:800; color:var(--primary);">${fmt(ord.net_total)} ج.م</td>
        <td style="text-align:center;"><span class="badge badge-warning">${ord.delivery_status}</span></td>
        <td style="text-align:center;">
          <div style="display:flex; gap:4px; justify-content:center;">
            ${ord.delivery_status === 'قيد التجهيز' ? `<button class="btn btn-primary btn-sm" onclick="updateDeliveryOrderStatus(${ord.id}, 'مع الدليفري')">خرج مع الدليفري</button>` : ''}
            ${ord.delivery_status === 'مع الدليفري' ? `<button class="btn btn-success btn-sm" onclick="updateDeliveryOrderStatus(${ord.id}, 'تم التسليم')">تم التسليم</button>` : ''}
            <button class="btn btn-hairline-danger btn-sm" onclick="updateDeliveryOrderStatus(${ord.id}, 'مرتجع')">مرتجع</button>
          </div>
        </td>
      </tr>
    `).join('');
  }
  openModal('deliveryOrdersModal');
}

async function updateDeliveryOrderStatus(invId, newStatus) {
  const res = await window.delivery.updateStatus(invId, newStatus);
  if (res.success) {
    try {
      const ordRes = await window.db.queryOne(
        `SELECT i.*, c.name as customer_name, c.phone as customer_phone, e.name as driver_name 
         FROM invoices i 
         LEFT JOIN customers c ON i.customer_id = c.id 
         LEFT JOIN employees e ON i.driver_id = e.id 
         WHERE i.id = ? LIMIT 1`, [invId]
      );
      if (ordRes?.success && ordRes.data && ordRes.data.customer_phone) {
        const ord = ordRes.data;
        const shopName = settings?.company_name || 'كافيه ومطعم برو';
        if (newStatus === 'مع الدليفري') {
          const msg = `أهلاً ${ord.customer_name || 'عميلنا العزيز'} 🛵\nطلبك خرج الآن للتوصيل مع مندوب الدليفري (${ord.driver_name || 'الكابتن'}) وهو في الطريق لعنوانكم!\nفاتورة رقم: #${ord.invoice_number}\nالمبلغ المطلوب: ${fmt(ord.net_total)} ج.م\nنتمنى لكم وجبة شهية ومشروب رائع ☕\n${shopName}`;
          if (window.whatsapp && typeof window.whatsapp.sendOrderReady === 'function') {
            await window.whatsapp.sendOrderReady({ phone: ord.customer_phone, customerName: ord.customer_name, invoiceNumber: ord.invoice_number, total: fmt(ord.net_total), driverName: ord.driver_name });
          } else if (window.whatsapp && typeof window.whatsapp.send === 'function') {
            await window.whatsapp.send(ord.customer_phone, msg);
          }
          showToast(`تم تحويل الطلب للدليفري وإرسال إشعار الواتساب للعميل ✓`, 'success');
        } else if (newStatus === 'تم التسليم') {
          const msg = `أهلاً ${ord.customer_name || 'عميلنا العزيز'} 🤍\nشكراً لطلبك من ${shopName} ☕\nتم تسليم طلبكم رقم #${ord.invoice_number} بنجاح ✅\nنتشرف بخدمتك دائماً وبالهناء والشفاء 🤍`;
          if (window.whatsapp && typeof window.whatsapp.sendDelivered === 'function') {
            await window.whatsapp.sendDelivered({ phone: ord.customer_phone, customerName: ord.customer_name, invoiceNumber: ord.invoice_number, total: fmt(ord.net_total) });
          } else if (window.whatsapp && typeof window.whatsapp.send === 'function') {
            await window.whatsapp.send(ord.customer_phone, msg);
          }
          showToast(`تم تأكيد تسليم الطلب وإرسال رسالة الشكر عبر الواتساب ✓`, 'success');
        } else {
          showToast(`تم تحديث حالة الطلب إلى "${newStatus}"`, 'success');
        }
      } else {
        showToast(`تم تحديث حالة الطلب إلى "${newStatus}"`, 'success');
      }
    } catch (e) {
      showToast(`تم تحديث حالة الطلب إلى "${newStatus}"`, 'success');
    }
    openActiveDeliveryModal();
  } else {
    showToast('خطأ: ' + res.error, 'error');
  }
}


function handleCustomerSelect() {
  const searchInput = document.getElementById('customerSearchInput');
  const searchVal = searchInput ? searchInput.value.trim() : '';
  const hiddenInput = document.getElementById('customerSelect');
  const clearBtn = document.getElementById('btnClearCustomer');
  const cartCustEl = document.getElementById('cartCustomerDisplay');

  if (!searchVal) {
    if (hiddenInput) hiddenInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (cartCustEl) {
      cartCustEl.style.display = 'none';
      cartCustEl.innerHTML = '';
    }
    return;
  }
  
  if (window.allCustomers) {
    let match = window.allCustomers.find(c => (c.name + ' - ' + (c.phone||'')) === searchVal);
    if (!match) match = window.allCustomers.find(c => c.name === searchVal);
    if (!match && !isNaN(searchVal)) {
      match = window.allCustomers.find(c => c.phone && c.phone.includes(searchVal));
    }
    
    if (match) {
      if (hiddenInput) hiddenInput.value = match.id;
      if (searchInput) searchInput.value = `${match.name}${match.phone ? ' - ' + match.phone : ''}`;
      if (clearBtn) clearBtn.style.display = 'block';
      if (cartCustEl) {
        cartCustEl.style.display = 'block';
        cartCustEl.innerHTML = `👤 <span style="color:#0F172A;">العميل:</span> <strong style="color:#FF5B22;">${escapeHtml(match.name)}</strong> ${match.phone ? `<span style="font-size:11px; opacity:0.8;">(${escapeHtml(match.phone)})</span>` : ''}`;
      }
    } else {
      if (hiddenInput) hiddenInput.value = '';
      if (clearBtn) clearBtn.style.display = 'block';
      if (cartCustEl) {
        cartCustEl.style.display = 'none';
        cartCustEl.innerHTML = '';
      }
    }
  }
}

function handleCustomerInput(inputEl) {
  const clearBtn = document.getElementById('btnClearCustomer');
  if (clearBtn) {
    clearBtn.style.display = inputEl && inputEl.value.trim() ? 'block' : 'none';
  }
}

function clearSelectedCustomer() {
  const searchInput = document.getElementById('customerSearchInput');
  const hiddenInput = document.getElementById('customerSelect');
  const clearBtn = document.getElementById('btnClearCustomer');
  const cartCustEl = document.getElementById('cartCustomerDisplay');

  if (searchInput) searchInput.value = '';
  if (hiddenInput) hiddenInput.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  if (cartCustEl) {
    cartCustEl.style.display = 'none';
    cartCustEl.innerHTML = '';
  }
}

// ─── Categories & Services Grid ─────────────────────────────────────────────
function renderCategoryBtns() {
  const container = document.getElementById('categoryBtns');
  container.innerHTML = `<div class="cat-btn active" onclick="selectCategory(0,this)">الكل</div>`;
  categories.forEach(c=>{
    container.innerHTML += `<div class="cat-btn" onclick="selectCategory(${c.id},this)">${c.name}</div>`;
  });
}

function selectCategory(catId, btn) {
  document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  window._currentCatId = Number(catId);
  const filtered = Number(catId)===0 ? allServices : allServices.filter(s=>Number(s.category_id)===Number(catId));
  populateServiceSelect(filtered);
  renderServiceGrid(filtered);
  // Also sync category select in item entry bar
  const itmCat = document.getElementById('itemCategory');
  if (itmCat) itmCat.value = catId || '';
  const itmSvc = document.getElementById('itemService');
  if (itmSvc) itmSvc.value = '';
  const itmPrc = document.getElementById('itemPrice');
  if (itmPrc) itmPrc.value = '';
  const itmBar = document.getElementById('itemBarcode');
  if (itmBar) itmBar.value = '';
  // Clear search when switching category
  const svcSearch = document.getElementById('svcSearchInput');
  if (svcSearch) svcSearch.value = '';
}

// Fix 4: Live product search by name or barcode
function filterServicesBySearch(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    // Restore current category filter
    const activeCatId = window._currentCatId || 0;
    const restored = activeCatId === 0 ? allServices : allServices.filter(s => Number(s.category_id) === activeCatId);
    renderServiceGrid(restored);
    // re-select active btn
    document.querySelectorAll('.cat-btn').forEach(b => {
      const matches = (activeCatId === 0 && b.textContent.trim() === 'الكل') ||
                      b.getAttribute('onclick')?.includes(`selectCategory(${activeCatId},`);
      if (matches) b.classList.add('active');
      else b.classList.remove('active');
    });
    return;
  }
  const filtered = allServices.filter(s =>
    (s.name && s.name.toLowerCase().includes(q)) ||
    (s.barcode && s.barcode.toLowerCase().includes(q))
  );
  renderServiceGrid(filtered);
  // Deselect category buttons during search
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
}


function renderServiceGrid(services) {
  const grid = document.getElementById('servicesGrid');
  if(!services.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted);font-size:12px;">لا توجد خدمات</div>';
    return;
  }
  grid.innerHTML = services.map(s => {
    // Show a subtle out-of-stock indicator only when item is completely out
    let outIndicator = '';
    if (s.track_inventory === 1 && Number(s.quantity || 0) <= 0) {
      outIndicator = `<div style="font-size:9px;font-weight:700;color:#ef4444;margin-top:2px;">نفد</div>`;
    }

    const hasSizes = s.has_sizes === 1 || String(s.has_sizes) === '1' || allServiceSizes.some(sz => Number(sz.service_id) === Number(s.id));
    const sizeBadge = hasSizes ? `<div style="font-size:10px; font-weight:800; color:var(--pos-caramel); margin-top:2px;">أحجام متعددة</div>` : '';

    const visualHtml = s.image
      ? `<div class="s-img-wrap"><img src="${s.image}" class="s-img" alt="${escapeHtml(s.name)}" /></div>`
      : `<div class="s-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg></div>`;

    return `
      <div class="svc-btn" onclick="addServiceFromGrid(${s.id})">
        ${visualHtml}
        <div class="s-name">${escapeHtml(s.name)}</div>
        <div class="s-price">${fmt(s.sell_price)} ${settings.currency||'جنيه'}</div>
        ${sizeBadge}
        ${outIndicator}
      </div>
    `;
  }).join('');
}

function addServiceFromGrid(svcId) {
  const svc = allServices.find(s => s.id === svcId);
  if(!svc) return;

  // 1. If item already has sizes in memory cache, open size picker immediately
  const itemSizes = allServiceSizes.filter(sz => Number(sz.service_id) === Number(svcId));
  if (itemSizes && itemSizes.length > 0) {
    openSizePickerModal(svc, itemSizes);
    return;
  }

  // 2. Query live sizes from database
  if (window.services && typeof window.services.getSizes === 'function') {
    window.services.getSizes(svcId).then(szRes => {
      if (szRes && szRes.success && Array.isArray(szRes.data) && szRes.data.length > 0) {
        allServiceSizes = allServiceSizes.filter(sz => Number(sz.service_id) !== Number(svcId)).concat(szRes.data);
        openSizePickerModal(svc, szRes.data);
      } else {
        continueAddServiceDirectly(svc);
      }
    }).catch(() => continueAddServiceDirectly(svc));
    return;
  }

  continueAddServiceDirectly(svc);
}

function continueAddServiceDirectly(svc) {
  const exist = invoiceItems.find(i=>i.service_id===svc.id && i.sell_price===svc.sell_price && parseFloat(i.item_discount)===0 && !i.size_name);
  const targetQty = (exist ? exist.quantity : 0) + 1;

  if (svc.track_inventory === 1) {
    const available = Number(svc.quantity || 0);
    const behavior = settings.stock_out_behavior || 'warn';

    if (targetQty > available) {
      if (behavior === 'block') {
        Swal.fire({
          title: 'المخزون غير كافٍ!',
          text: `الكمية المتاحة في المخزن من "${svc.name}" هي (${available}) قطعة فقط!`,
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
        return;
      } else {
        showToast(`تنبيه: الكمية المطلوبة (${targetQty}) تتجاوز رصيد المخزن (${available})`, 'warning');
      }
    } else {
      const remainingStock = available - targetQty;
      const threshold = Number(svc.low_stock_threshold || 0);
      if (threshold > 0 && remainingStock <= threshold) {
        showToast(`انتبه: رصيد "${svc.name}" المتبقي (${remainingStock}) وصل لحد التنبيه (${threshold})`, 'warning');
      }
    }
  }

  if(exist) {
    exist.quantity++;
    exist.total = exist.quantity * exist.sell_price;
  } else {
    invoiceItems.push({
      service_id: svc.id,
      category_name: svc.cat_name || 'بدون قسم',
      service_name: svc.name,
      barcode: svc.barcode,
      sell_price: svc.sell_price,
      quantity: 1,
      item_discount: 0,
      total: svc.sell_price,
      notes: ''
    });
  }
  renderItemsTable();
  recalcTotals();

  // Item added smoothly to cart. Modifiers modal can be opened by tapping the notes badge.
}

function openSizePickerModal(svc, sizes) {
  const titleEl = document.getElementById('sizePickerTitle');
  if (titleEl) titleEl.textContent = `اختر الحجم — ${svc.name}`;
  const grid = document.getElementById('sizePickerGrid');
  if (!grid) return;

  grid.innerHTML = sizes.map(sz => {
    const p = Number(sz.price !== undefined ? sz.price : (sz.sell_price || 0));
    return `
    <button type="button" class="size-pick-card" onclick='selectServiceSize(${svc.id}, ${JSON.stringify(sz).replace(/'/g, "&apos;")})'
      style="padding:16px 12px; display:flex; flex-direction:column; align-items:center; gap:8px; border-radius:12px; border:1.5px solid #E2E8F0; background:#FFFFFF; cursor:pointer; transition:all 0.18s ease; min-height:90px; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.03);"
      onmouseover="this.style.borderColor='#FF5B22'; this.style.transform='translateY(-2px)';" onmouseout="this.style.borderColor='#E2E8F0'; this.style.transform='translateY(0)';">
      <span style="font-weight:800; font-size:15px; color:#1E1B18;">${escapeHtml(sz.size_name)}</span>
      <span style="font-weight:900; font-size:14px; color:#FF5B22; background:#FFF5F0; padding:4px 12px; border-radius:6px; border:1px solid rgba(255,91,34,0.2);">${fmt(p)} ${settings.currency || 'ج.م'}</span>
      ${sz.recipe_ratio && sz.recipe_ratio !== 1 ? `<span style="font-size:10px; color:#94A3B8; font-weight:700;">معامل: x${sz.recipe_ratio}</span>` : ''}
    </button>
  `;
  }).join('');

  openModal('sizePickerModal');
}

function selectServiceSize(svcId, sz) {
  closeModal('sizePickerModal');
  const svc = allServices.find(s => s.id === svcId);
  if (!svc) return;

  const sizePrice = Number(sz.price !== undefined ? sz.price : (sz.sell_price || 0));
  const sizeName = sz.size_name;
  const fullItemName = `${svc.name} (${sizeName})`;
  const ratio = Number(sz.recipe_ratio) || (svc.sell_price > 0 ? Math.round((sizePrice / svc.sell_price) * 100) / 100 : 1);

  // Check inventory if tracking
  const exist = invoiceItems.find(i => i.service_id === svc.id && i.size_name === sizeName && i.sell_price === sizePrice && parseFloat(i.item_discount) === 0);
  const targetQty = (exist ? exist.quantity : 0) + 1;

  if (svc.track_inventory === 1) {
    const available = Number(svc.quantity || 0);
    const behavior = settings.stock_out_behavior || 'warn';
    if (targetQty > available) {
      if (behavior === 'block') {
        Swal.fire({
          title: 'المخزون غير كافٍ!',
          text: `الكمية المتاحة في المخزن من "${svc.name}" هي (${available}) قطعة فقط!`,
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
        return;
      } else {
        showToast(`تنبيه: الكمية المطلوبة (${targetQty}) تتجاوز رصيد المخزن (${available})`, 'warning');
      }
    }
  }

  let targetIndex = -1;
  if (exist) {
    exist.quantity++;
    exist.total = exist.quantity * exist.sell_price;
    targetIndex = invoiceItems.indexOf(exist);
  } else {
    invoiceItems.push({
      service_id: svc.id,
      category_name: svc.cat_name || 'بدون قسم',
      service_name: fullItemName,
      size_name: sizeName,
      recipe_ratio: ratio,
      barcode: sz.barcode || svc.barcode || '',
      sell_price: sizePrice,
      quantity: 1,
      item_discount: 0,
      total: sizePrice,
      notes: ''
    });
    targetIndex = invoiceItems.length - 1;
  }

  renderItemsTable();
  recalcTotals();

  // Open item modifiers/notes modal immediately after selecting the size
  if (targetIndex >= 0) {
    setTimeout(() => {
      openItemModifierModal(targetIndex);
    }, 120);
  }
}

function populateCategorySelect() {
  const sel = document.getElementById('itemCategory');
  if (!sel) return;
  sel.innerHTML = '<option value="">الكل</option>';
  categories.forEach(c=>{ sel.innerHTML+=`<option value="${c.id}">${c.name}</option>`; });
}

function populateServiceSelect(services) {
  const sel = document.getElementById('itemService');
  if (!sel) return;
  sel.innerHTML = '<option value="">اختر الخدمة أو الصنف</option>';
  services.forEach(s=>{
    const stockInfo = s.track_inventory === 1 ? ` (متاح: ${s.quantity||0})` : '';
    sel.innerHTML+=`<option value="${s.id}" data-price="${s.sell_price}" data-barcode="${s.barcode||''}" data-cat="${s.cat_name||''}">${s.name}${stockInfo}</option>`;
  });
}

function loadCategoryServices() {
  const itmCat = document.getElementById('itemCategory');
  const catId = itmCat ? (parseInt(itmCat.value) || 0) : 0;
  const filtered = Number(catId)===0 ? allServices : allServices.filter(s=>Number(s.category_id)===Number(catId));
  populateServiceSelect(filtered);
  renderServiceGrid(filtered);
}

function onServiceSelect() {
  const sel = document.getElementById('itemService');
  const opt = sel.options[sel.selectedIndex];
  if(!opt || !opt.value) return;
  document.getElementById('itemPrice').value = opt.dataset.price || '0';
  document.getElementById('itemBarcode').value = opt.dataset.barcode || '';
}

function lookupBarcode() {
  const bc = document.getElementById('itemBarcode').value.trim();
  if(!bc) return;

  // First check if barcode matches any size in allServiceSizes
  const matchedSize = allServiceSizes.find(sz => sz.barcode && sz.barcode.trim() === bc);
  if (matchedSize) {
    selectServiceSize(matchedSize.service_id, matchedSize);
    document.getElementById('itemBarcode').value = '';
    showToast(`تم إضافة الحجم "${matchedSize.size_name}" من خلال الباركود`, 'success');
    return;
  }

  const svc = allServices.find(s=>s.barcode===bc);
  if(!svc){ showToast('لم يتم العثور على الباركود','warning'); return; }

  // Check if item has sizes
  const itemSizes = allServiceSizes.filter(sz => sz.service_id === svc.id);
  if (itemSizes && itemSizes.length > 0) {
    openSizePickerModal(svc, itemSizes);
    document.getElementById('itemBarcode').value = '';
    return;
  }

  const exist = invoiceItems.find(i => i.service_id === svc.id);
  const targetQty = (exist ? exist.quantity : 0) + 1;

  if (svc.track_inventory === 1) {
    const available = Number(svc.quantity || 0);
    const behavior = settings.stock_out_behavior || 'warn';

    if (targetQty > available) {
      if (behavior === 'block') {
        Swal.fire({
          title: 'المخزون غير كافٍ!',
          text: `الكمية المتاحة في المخزن من "${svc.name}" هي (${available}) قطعة فقط!`,
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
        document.getElementById('itemBarcode').value = '';
        return;
      } else {
        showToast(`تنبيه: الكمية المطلوبة (${targetQty}) تتجاوز رصيد المخزن (${available})`, 'warning');
      }
    } else {
      const remainingStock = available - targetQty;
      const threshold = Number(svc.low_stock_threshold || 0);
      if (threshold > 0 && remainingStock <= threshold) {
        showToast(`انتبه: رصيد "${svc.name}" المتبقي (${remainingStock}) وصل لحد التنبيه (${threshold})`, 'warning');
      }
    }
  }

  // إن كان الصنف موجوداً بالفعل في الفاتورة، زِد الكمية مباشرةً
  if(exist){
    exist.quantity++;
    exist.total = exist.quantity * (exist.sell_price - (parseFloat(exist.item_discount)||0));
    renderItemsTable();
    recalcTotals();
    document.getElementById('itemBarcode').value = '';
    showToast(`تم زيادة كمية "${svc.name}" ← ${exist.quantity}`, 'success');
    return;
  }

  // صنف جديد، أضفه
  document.getElementById('itemService').value = svc.id;
  document.getElementById('itemPrice').value = svc.sell_price;
  addItemToInvoice();
}

// ─── Add Item ─────────────────────────────────────────────────────────────────
function addItemToInvoice() {
  const svcSel = document.getElementById('itemService');
  const opt = svcSel.options[svcSel.selectedIndex];
  const price = parseFloat(document.getElementById('itemPrice').value)||0;
  const qty = parseInt(document.getElementById('itemQty').value)||1;
  const discount = parseFloat(document.getElementById('itemDiscount').value)||0;
  const barcode = document.getElementById('itemBarcode').value.trim();

  let svcId = null, svcName = 'خدمة يدوية', catName = '', svcBarcode = barcode;
  if(opt && opt.value){
    svcId = parseInt(opt.value);
    svcName = opt.text.replace(/\s*\(متاح:\s*\d+\)$/, '');
    catName = opt.dataset.cat || '';
    svcBarcode = opt.dataset.barcode || barcode;
  }
  if(price<=0){ showToast('يرجى إدخال السعر','error'); return; }

  // فحص المخزون للصنف المختار
  if(svcId) {
    const svc = allServices.find(s => s.id === svcId);
    if(svc && svc.track_inventory === 1) {
      const exist = invoiceItems.find(i => i.service_id === svcId);
      const targetQty = (exist ? exist.quantity : 0) + qty;
      const available = Number(svc.quantity || 0);
      const behavior = settings.stock_out_behavior || 'warn';

      if(targetQty > available) {
        if(behavior === 'block') {
          Swal.fire({
            title: 'المخزون غير كافٍ!',
            text: `الكمية المتوفرة بالمخزن من "${svc.name}" هي (${available}) فقط، لا يمكن بيع (${targetQty}) قطعة!`,
            icon: 'error',
            confirmButtonText: 'حسناً'
          });
          return;
        } else {
          showToast(`تنبيه: الكمية المطلوبة (${targetQty}) تتجاوز رصيد المخزن (${available})`, 'warning');
        }
      } else {
        const remainingStock = available - targetQty;
        const threshold = Number(svc.low_stock_threshold || 0);
        if(threshold > 0 && remainingStock <= threshold) {
          showToast(`انتبه: رصيد "${svc.name}" المتبقي (${remainingStock}) وصل لحد التنبيه (${threshold})`, 'warning');
        }
      }
    }
  }

  // إن كان الصنف نفسه موجوداً بنفس السعر والخصم وبدون ملاحظات خاصة، زِد الكمية
  if(svcId){
    const exist = invoiceItems.find(i =>
      i.service_id === svcId &&
      i.sell_price === price &&
      parseFloat(i.item_discount) === discount &&
      !(i.notes && i.notes.trim() !== '')
    );
    if(exist){
      exist.quantity += qty;
      exist.total = exist.quantity * (exist.sell_price - (parseFloat(exist.item_discount)||0));
      renderItemsTable();
      recalcTotals();
      document.getElementById('itemService').value='';
      document.getElementById('itemPrice').value='';
      document.getElementById('itemQty').value='1';
      document.getElementById('itemDiscount').value='0';
      document.getElementById('itemBarcode').value='';
      document.getElementById('itemService').focus();
      return;
    }
  }

  const priceAfterDiscount = price - discount;
  const total = (priceAfterDiscount * qty);

  invoiceItems.push({
    service_id: svcId,
    category_name: catName,
    service_name: svcName,
    barcode: svcBarcode,
    sell_price: price,
    quantity: qty,
    item_discount: discount,
    total,
    notes: ''
  });

  renderItemsTable();
  recalcTotals();
  // Reset entry fields
  document.getElementById('itemService').value='';
  document.getElementById('itemPrice').value='';
  document.getElementById('itemQty').value='1';
  document.getElementById('itemDiscount').value='0';
  document.getElementById('itemBarcode').value='';
  document.getElementById('itemService').focus();
}

// ─── Render Table ─────────────────────────────────────────────────────────────
function renderItemsTable() {
  const tbody = document.getElementById('invoiceItemsBody');
  const isSaved = lastSavedInvoice !== null;
  
  if(!invoiceItems.length){
    tbody.innerHTML=`<tr id="emptyRow"><td colspan="6" class="table-empty" style="padding:45px 10px; text-align:center;"><div style="width:44px; height:44px; margin:0 auto 10px; display:flex; align-items:center; justify-content:center; background:#F8FAFC; border:1px solid var(--pos-border); border-radius:10px; color:var(--pos-espresso);"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div><div style="font-weight:800; font-size:14px; color:var(--pos-espresso);">سلة الطلبات فارغة</div><div style="font-size:11px; color:var(--pos-text-muted); margin-top:3px;">اضغط على أي صنف من القائمة لإضافته للطلب</div></td></tr>`;
    return;
  }
  tbody.innerHTML = invoiceItems.map((item,i) => {
    const sentQty = Number(item.sent_qty || 0);
    const unsentQty = Math.max(0, item.quantity - sentQty);
    let kitchenStatusBadge = '';
    if (unsentQty > 0) {
      if (sentQty === 0) {
        kitchenStatusBadge = `<span style="display:inline-flex; align-items:center; background:#F8FAFC; color:#C2410C; border:1px solid #FED7AA; padding:1px 6px; border-radius:6px; font-size:10px; font-weight:800; margin-right:4px;" title="لم يُرسل هذا الصنف لطابعة المطبخ بعد">لم يُرسل للمطبخ</span>`;
      } else {
        kitchenStatusBadge = `<span style="display:inline-flex; align-items:center; background:#F8FAFC; color:#C2410C; border:1px solid #FED7AA; padding:1px 6px; border-radius:6px; font-size:10px; font-weight:800; margin-right:4px;" title="تم إرسال ${sentQty} من قبل، وهناك ${unsentQty} جديد">+${unsentQty} جديد للمطبخ</span>`;
      }
    }

    const isDrink = getItemCategoryType(item) === 'drink';
    const isTakeawayOrDelivery = currentOrderType === 'تيك أواي' || currentOrderType === 'دليفري';
    let quickCupsHTML = '';
    if (isDrink && (isTakeawayOrDelivery || (item.notes && item.notes.includes('كوب')))) {
      const isCarton = item.notes && item.notes.includes('كوب كرتون');
      const isPlastic = item.notes && item.notes.includes('كوب بلاستيك');
      quickCupsHTML = `
        <span class="quick-cup-wrap">
          <button type="button" class="quick-cup-btn ${isCarton ? 'active' : ''}" onclick="event.stopPropagation(); setItemQuickCup(${i}, 'carton')" title="كوب كرتون ورقي ساخن">🥤 كرتون</button>
          <button type="button" class="quick-cup-btn ${isPlastic ? 'active' : ''}" onclick="event.stopPropagation(); setItemQuickCup(${i}, 'plastic')" title="كوب بلاستيك شفاف بارد">🥤 بلاستيك</button>
        </span>
      `;
    }

    return `
      <tr>
        <td style="color:var(--text-muted);font-size:11px;">${i+1}</td>
        <td>
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; cursor:pointer;" onclick="openItemModifierModal(${i})" title="انقر لتعديل الملاحظات والتخصيص">
            <span style="font-weight:800; color:var(--text); font-size:13px; line-height:1.25;">
              ${escapeHtml(item.service_name)}
            </span>
            ${kitchenStatusBadge}
          </div>
          <div style="margin-top:3px; display:flex; align-items:center; flex-wrap:wrap; gap:5px;">
            ${quickCupsHTML}
            ${item.notes ? `
              <span class="item-notes-badge" onclick="openItemModifierModal(${i})" title="انقر لتعديل التخصيص أو الملاحظات">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:3px; vertical-align:middle;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span>${escapeHtml(item.notes)}</span>
              </span>
            ` : `
              <span class="item-notes-add-link" onclick="openItemModifierModal(${i})" title="إضافة تخصيص أو ملاحظة للصنف" style="display:inline-flex; align-items:center; gap:2px; font-size:10.5px; font-weight:700; color:var(--pos-caramel); cursor:pointer;">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>+ ملاحظة / تخصيص</span>
              </span>
            `}
          </div>
        </td>
        <td style="text-align:center; white-space:nowrap;">
          <button class="qty-control-btn" onclick="stepQty(${i}, -1)">-</button>
          <input type="number" class="qty-display-input" value="${item.quantity}" min="1"
            onchange="updateQty(${i}, this.value)" ${isSaved?'disabled':''} />
          <button class="qty-control-btn" onclick="stepQty(${i}, 1)">+</button>
        </td>
        <td style="text-align:right; font-weight:700; color:var(--text-muted);">${fmt(item.sell_price)}</td>
        <td style="text-align:right; font-weight:900; color:var(--primary); font-size:13px;">${fmt(item.total)}</td>
        <td style="text-align:center;">
          ${isSaved ? '—' : `<button class="delete-row-btn" onclick="removeItem(${i})" title="حذف">✕</button>`}
        </td>
      </tr>
    `;
  }).join('');
}

function setItemQuickCup(i, cupType) {
  if (!invoiceItems[i]) return;
  const isCarton = cupType === 'carton';
  const newCupText = isCarton ? 'كوب كرتون (ورقي ساخن)' : 'كوب بلاستيك شفاف (بارد)';
  let notes = (invoiceItems[i].notes || '').trim();
  const cupPattern = /(كوب كرتون[^\,\.\n]*|كوب بلاستيك[^\,\.\n]*|مج زجاجي[^\,\.\n]*|دبل كرتون[^\,\.\n]*)/g;

  if (cupPattern.test(notes)) {
    if (notes.includes(newCupText)) {
      notes = notes.replace(cupPattern, '').replace(/^\s*[\-\,\/]\s*|\s*[\-\,\/]\s*$/g, '').trim();
    } else {
      notes = notes.replace(cupPattern, newCupText).trim();
    }
  } else {
    notes = notes ? `${newCupText} - ${notes}` : newCupText;
  }
  invoiceItems[i].notes = notes;
  renderInvoiceItems();
}
window.setItemQuickCup = setItemQuickCup;

// ─── Item Modifiers Modal & Dynamic Category Logic ────────────────────────────
let currentModifyingItemIndex = -1;

function getItemCategoryType(item) {
  const cat = (item.category_name || '').toLowerCase();
  const name = (item.service_name || '').toLowerCase();

  // 1. Food / Meals / Pizza / Pasta / Sandwiches / Burgers
  const isFood = (
    cat.includes('بيتزا') || cat.includes('باستا') || cat.includes('ساندوتش') || cat.includes('وجبات') || cat.includes('طعام') || cat.includes('مأكولات') ||
    name.includes('بيتزا') || name.includes('مارجريتا') || name.includes('بيبروني') || name.includes('باستا') || name.includes('فوتشيني') ||
    name.includes('بيني') || name.includes('برجر') || name.includes('ساندوتش') || name.includes('ستيك') || name.includes('كوردون بلو') ||
    name.includes('تشيكن') || name.includes('لحم') || name.includes('دجاج') || name.includes('ريب آي') || name.includes('كلوب')
  );
  if (isFood) return 'food';

  // 2. Desserts / Bakery / Sweets / Pastries
  const isDessert = (
    cat.includes('حلويات') || cat.includes('مخبوزات') || cat.includes('حلو') || cat.includes('كيك') ||
    name.includes('كيك') || name.includes('تشيز كيك') || name.includes('وافل') || name.includes('كرواسون') ||
    name.includes('شوكولاتة') || name.includes('لافا') || name.includes('فادج') || name.includes('نوتيلا') ||
    name.includes('بلوبيري') || name.includes('لوتس') || name.includes('سينابون') || name.includes('دونات')
  );
  if (isDessert) return 'dessert';

  // 3. Drinks / Coffee / Smoothies / Juices (Default for Cafe)
  return 'drink';
}

function renderCategoryModifiers(item) {
  const container = document.getElementById('dynamicModifierGroupsContainer');
  if (!container) return;

  const type = getItemCategoryType(item);
  let groups = [];

  if (type === 'food') {
    groups = [
      {
        title: 'الطهي والشطة (Spiciness & Doneness):',
        chips: [
          'عادي (غير حار)',
          'سبايسي (حار)',
          'حار إكسترا',
          'بدون شطة نهائياً',
          'تسوية زيادة (Well Done)',
          'تسوية متوسطة (Medium)'
        ]
      },
      {
        title: 'الجبن والإضافات والمقبلات:',
        chips: [
          'إكسترا جبنة موتزاريلا',
          'إكسترا صوص رانش',
          'صوص باربيكيو',
          'صوص شيدر ذائب',
          'إكسترا مشروم',
          'إكسترا زيتون'
        ]
      },
      {
        title: 'الاستبعاد وطلبات خاصة (بدون):',
        chips: [
          'بدون بصل',
          'بدون طماطم',
          'بدون مخلل',
          'بدون مايونيز',
          'بدون كاتشب',
          'بدون زيتون',
          'الصوصات جانباً'
        ]
      },
      {
        title: 'طريقة التقديم والتقطيع:',
        chips: [
          'تقطيع 8 قطع',
          'تقطيع 6 قطع',
          'تقطيع 4 قطع',
          'سفري (تيك أواي)',
          'محلي (صالة)',
          'مغلف دليفري بعناية'
        ]
      }
    ];
  } else if (type === 'dessert') {
    groups = [
      {
        title: 'الصوصات والتغطيات:',
        chips: [
          'شوكولاتة نوتيلا',
          'صوص لوتس',
          'صوص كراميل',
          'صوص بلوبيري',
          'صوص بستاشيو (فستق)',
          'بدون صوصات إضافية'
        ]
      },
      {
        title: 'الإضافات والمرافقة:',
        chips: [
          'إضافة بولة آيس كريم فانيليا',
          'إضافة مكسرات محمصة',
          'إضافة فواكه فريش (موز/فراولة)',
          'سكر بودرة زيادة',
          'بدون مكسرات (حساسية)'
        ]
      },
      {
        title: 'طريقة التقديم والتسخين:',
        chips: [
          'تسخين دافئ',
          'بارد',
          'سفري في علبة حفظ',
          'محلي للتقديم الفوري'
        ]
      }
    ];
  } else {
    // Drink / Coffee
    groups = [
      {
        title: '🥤 نوع الكوب والتقديم (كرتون / بلاستيك تيك أواي):',
        chips: [
          'كوب كرتون (ورقي ساخن)',
          'كوب بلاستيك شفاف (بارد)',
          'كوب بلاستيك + غطاء فلات',
          'كوب بلاستيك + غطاء دوم',
          'دبل كرتون (عازل حراري)',
          'بدون شاليموه / بدون غطاء',
          'مج زجاجي (صالة)'
        ]
      },
      {
        title: 'السكر / درجة التحلية:',
        chips: [
          'بدون سكر (سادة)',
          'سكر خفيف',
          'سكر مضبوط',
          'سكر زيادة',
          'سكر دايت (ستيفيا)'
        ]
      },
      {
        title: 'الحليب والبدائل:',
        chips: [
          'حليب كامل الدسم',
          'حليب خالي الدسم',
          'حليب شوفان',
          'حليب لوز',
          'بدون حليب (بلاك)'
        ]
      },
      {
        title: 'النكهات والإضافات:',
        chips: [
          'شوت إسبريسو إضافي',
          'سيرب كراميل',
          'سيرب فانيليا',
          'سيرب بندق',
          'كريمة مخفوقة (Whipped Cream)',
          'صوص شوكولاتة'
        ]
      },
      {
        title: 'الحرارة والثلج والتقديم:',
        chips: [
          'بدون ثلج',
          'ثلج خفيف',
          'ثلج زيادة',
          'ساخن جداً (Extra Hot)'
        ]
      }
    ];
  }

  container.innerHTML = groups.map(g => `
    <div class="mod-group">
      <div class="mod-group-title">${g.title}</div>
      <div class="mod-chips-wrap">
        ${g.chips.map(chip => `<span class="mod-chip" onclick="toggleModifierChip('${chip}')">${chip}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function openItemModifierModal(index) {
  if (index < 0 || index >= invoiceItems.length) return;
  currentModifyingItemIndex = index;
  const item = invoiceItems[index];
  const titleEl = document.getElementById('modifierItemTitle');
  if (titleEl) titleEl.textContent = item.service_name;

  // Render category-smart modifier chips
  renderCategoryModifiers(item);

  const noteInput = document.getElementById('modifierFreeTextInput');
  if (noteInput) {
    noteInput.value = item.notes || '';
    refreshModifierChipsState(item.notes || '');
  }
  openModal('itemModifierModal');
  setTimeout(() => {
    if (noteInput) noteInput.focus();
  }, 150);
}

function toggleModifierChip(chipText) {
  const noteInput = document.getElementById('modifierFreeTextInput');
  if (!noteInput) return;
  let currentVal = noteInput.value.trim();
  let parts = currentVal ? currentVal.split(/[,،]\s*|\s*-\s*/).map(p => p.trim()).filter(Boolean) : [];
  
  // Smart exclusive cup selection
  const cupTypes = [
    'كوب كرتون (ورقي ساخن)',
    'كوب بلاستيك شفاف (بارد)',
    'كوب بلاستيك + غطاء فلات',
    'كوب بلاستيك + غطاء دوم',
    'مج زجاجي (صالة)'
  ];

  if (cupTypes.includes(chipText)) {
    const isAlreadySelected = parts.includes(chipText);
    parts = parts.filter(p => !cupTypes.includes(p));
    if (!isAlreadySelected) {
      parts.unshift(chipText);
    }
  } else {
    const idx = parts.indexOf(chipText);
    if (idx >= 0) {
      parts.splice(idx, 1);
    } else {
      parts.push(chipText);
    }
  }
  noteInput.value = parts.join('، ');
  refreshModifierChipsState(noteInput.value);
}

function refreshModifierChipsState(currentText) {
  const chips = document.querySelectorAll('#itemModifierModal .mod-chip');
  chips.forEach(ch => {
    const txt = ch.textContent.trim();
    if (currentText.includes(txt)) {
      ch.classList.add('active');
    } else {
      ch.classList.remove('active');
    }
  });
}

function saveItemModifier() {
  if (currentModifyingItemIndex < 0 || currentModifyingItemIndex >= invoiceItems.length) {
    closeModal('itemModifierModal');
    return;
  }
  const noteInput = document.getElementById('modifierFreeTextInput');
  const text = noteInput ? noteInput.value.trim() : '';
  invoiceItems[currentModifyingItemIndex].notes = text;
  closeModal('itemModifierModal');
  renderItemsTable();
  showToast('تم حفظ ملاحظات الصنف ✓', 'info');
}

function clearItemModifiers() {
  const noteInput = document.getElementById('modifierFreeTextInput');
  if (noteInput) noteInput.value = '';
  refreshModifierChipsState('');
}

// ─── Kitchen Void Protection & Audit Logging ─────────────────────────────────
async function requestVoidKitchenItem(item, requestedNewQty) {
  const sentQty = Number(item.sent_qty || 0);
  if (sentQty <= 0) return true; // Not sent to kitchen yet, normal delete/reduction allowed

  const voidQty = sentQty - Math.max(0, requestedNewQty);
  if (voidQty <= 0) return true; // Not reducing below sent quantity

  const { value: formValues } = await Swal.fire({
    title: 'تصريح إلغاء صنف بعد إرساله للمطبخ',
    html: `
      <div style="text-align:right; font-size:13px; line-height:1.6; margin-bottom:14px;">
        الصنف: <b style="color:var(--primary); font-size:14px;">${escapeHtml(item.service_name)}</b><br/>
        الكمية المرسلة للمطبخ: <b style="color:#dc2626;">${sentQty}</b> | الكمية المراد إلغاؤها: <b style="color:#dc2626;">${voidQty}</b><br/>
        <span style="color:#64748b; font-size:11px;">هذا الصنف تم إرساله للمطبخ بالفعل. يتطلب الحذف أو التخفيض إدخال كلمة مرور المدير وتحديد سبب الإلغاء لتوثيقه في سجل الرقابة (Audit Log).</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; text-align:right;">
        <div>
          <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">سبب الإلغاء *</label>
          <select id="swalVoidReason" class="swal2-select" style="width:100%; margin:0; height:38px; font-size:13px;">
            <option value="طلب العميل إلغاء الصنف">طلب العميل إلغاء الصنف</option>
            <option value="خطأ كاشير في تسجيل الصنف">خطأ كاشير في تسجيل الصنف</option>
            <option value="تأخر تحضير الطلب بالمطبخ">تأخر تحضير الطلب بالمطبخ</option>
            <option value="عدم توفر المكونات بالمطبخ">عدم توفر المكونات بالمطبخ</option>
            <option value="تلف أو خطأ في التشغيل">تلف أو خطأ في التشغيل</option>
          </select>
        </div>
        <div>
          <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">كلمة مرور المدير *</label>
          <input type="password" id="swalAdminPass" class="swal2-input" placeholder="أدخل كلمة مرور المدير" style="width:100%; margin:0; height:38px; font-size:14px;" />
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'تأكيد الإلغاء والتوثيق',
    cancelButtonText: 'تراجع',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    preConfirm: () => {
      const pass = document.getElementById('swalAdminPass')?.value;
      const reason = document.getElementById('swalVoidReason')?.value;
      if (!pass) {
        Swal.showValidationMessage('يرجى إدخال كلمة مرور المدير');
        return false;
      }
      return { pass, reason };
    }
  });

  if (!formValues) return false;

  try {
    const authRes = await window.auth.verifyAdminPassword(formValues.pass);
    if (!authRes || !authRes.success) {
      await Swal.fire({
        title: 'فشل التحقق',
        text: authRes?.error || 'كلمة المرور غير صحيحة!',
        icon: 'error',
        confirmButtonText: 'حسناً'
      });
      return false;
    }

    // Log to audit_log
    const oldVal = {
      invoice_number: currentInvoiceNumber,
      invoice_id: currentInvoiceId,
      table_id: currentTableId,
      service_name: item.service_name,
      original_qty: item.quantity,
      sent_qty: item.sent_qty,
      void_qty: voidQty,
      price: item.sell_price
    };
    const newVal = {
      new_qty: requestedNewQty,
      reason: formValues.reason,
      authorized_by: authRes.admin?.username || 'admin',
      time: new Date().toISOString()
    };

    await window.audit.log(
      requestedNewQty <= 0 ? 'حذف صنف بعد إرساله للمطبخ' : 'تخفيض كمية صنف بعد إرساله للمطبخ',
      'invoice_items',
      currentInvoiceId || 0,
      oldVal,
      newVal
    );

    // If invoice is already active in database, update it immediately
    if (currentInvoiceId && item.service_id) {
      if (requestedNewQty <= 0) {
        await window.db.run('DELETE FROM invoice_items WHERE invoice_id = ? AND service_id = ?', [currentInvoiceId, item.service_id]);
      } else {
        const itemTot = (item.sell_price - (item.item_discount || 0)) * requestedNewQty;
        await window.db.run(
          'UPDATE invoice_items SET quantity = ?, sent_qty = ?, total = ? WHERE invoice_id = ? AND service_id = ?',
          [requestedNewQty, requestedNewQty, itemTot, currentInvoiceId, item.service_id]
        );
      }
      const sumRes = await window.db.queryOne('SELECT COALESCE(SUM(total), 0) as subtotal FROM invoice_items WHERE invoice_id = ?', [currentInvoiceId]);
      const newSub = sumRes?.data?.subtotal || 0;
      await window.db.run('UPDATE invoices SET subtotal = ?, net_total = ? WHERE id = ?', [newSub, newSub, currentInvoiceId]);
    }

    showToast(`تم توثيق إلغاء (${voidQty}) من "${item.service_name}" بسجل الرقابة ✓`, 'success');
    return true;
  } catch (err) {
    showToast('حدث خطأ أثناء توثيق الإلغاء: ' + err.message, 'error');
    return false;
  }
}

async function stepQty(idx, delta) {
  const item = invoiceItems[idx];
  if (!item) return;
  const current = item.quantity || 1;
  const newQty = current + delta;
  if (newQty <= 0) {
    await removeItem(idx);
    return;
  }
  await updateQty(idx, newQty);
}

async function updateQty(idx, val) {
  const qty = parseInt(val) || 1;
  const item = invoiceItems[idx];
  if (!item) return;

  if (qty <= 0) {
    await removeItem(idx);
    return;
  }

  // Intercept void if reducing below sent_qty
  if (item.sent_qty && qty < item.sent_qty) {
    const ok = await requestVoidKitchenItem(item, qty);
    if (!ok) {
      renderItemsTable();
      return;
    }
    item.sent_qty = qty;
  }

  const svc = allServices.find(s => s.id === item.service_id);

  if (svc && svc.track_inventory === 1) {
    const available = Number(svc.quantity || 0);
    const behavior = settings.stock_out_behavior || 'warn';

    if (qty > available) {
      if (behavior === 'block') {
        Swal.fire({
          title: 'الكمية غير متوفرة!',
          text: `الكمية المتوفرة بالمخزن من "${svc.name}" هي (${available}) فقط، لا يمكن بيع (${qty}) قطعة!`,
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
        item.quantity = available > 0 ? available : 1;
        item.total = (item.sell_price - item.item_discount) * item.quantity;
        renderItemsTable();
        recalcTotals();
        return;
      } else {
        showToast(`تنبيه: الكمية المطلوبة (${qty}) تتجاوز رصيد المخزن (${available})!`, 'warning');
      }
    } else {
      const remainingStock = available - qty;
      const threshold = Number(svc.low_stock_threshold || 0);
      if (threshold > 0 && remainingStock <= threshold) {
        showToast(`انتبه: المتبقي بالمخزن من "${svc.name}" (${remainingStock}) وصل لحد التنبيه (${threshold})`, 'warning');
      }
    }
  }

  item.quantity = qty;
  item.total = (item.sell_price - item.item_discount) * qty;
  renderItemsTable();
  recalcTotals();
}

function updateItemDiscount(index, val) {
  const d = parseFloat(val)||0;
  invoiceItems[index].item_discount = d;
  invoiceItems[index].total = (invoiceItems[index].sell_price - d) * invoiceItems[index].quantity;
  renderItemsTable();
  recalcTotals();
}

function updateItemPrice(index, val) {
  const p = parseFloat(val)||0;
  invoiceItems[index].sell_price = p;
  invoiceItems[index].total = (p - invoiceItems[index].item_discount) * invoiceItems[index].quantity;
  renderItemsTable();
  recalcTotals();
}

async function removeItem(idx) {
  const item = invoiceItems[idx];
  if (!item) return;

  if (item.sent_qty && item.sent_qty > 0) {
    const ok = await requestVoidKitchenItem(item, 0);
    if (!ok) return;
  }

  invoiceItems.splice(idx, 1);
  renderItemsTable();
  recalcTotals();
  showToast('تم حذف الصنف من الطلب', 'info');
}

// ─── Totals ───────────────────────────────────────────────────────────────────
function recalcTotals() {
  const subtotal = invoiceItems.reduce((s,i)=>s+(i.sell_price*i.quantity),0);
  const itemDiscounts = invoiceItems.reduce((s,i)=>s+(i.item_discount*i.quantity),0);

  let discountAmt = parseFloat(document.getElementById('discountAmount')?.value)||0;
  const discountPct = parseFloat(document.getElementById('discountPercent')?.value)||0;

  // Business rule: % first, then override with fixed if > 0
  let totalDiscount = itemDiscounts;
  if(discountPct>0) {
    totalDiscount = itemDiscounts + ((subtotal-itemDiscounts) * discountPct/100);
    const dAmtEl = document.getElementById('discountAmount');
    if (dAmtEl) dAmtEl.value = fmt((subtotal-itemDiscounts)*discountPct/100);
  }
  if(discountAmt>0 && discountPct===0) {
    totalDiscount = itemDiscounts + discountAmt;
  }

  let deliveryFee = 0;
  if (currentOrderType === '\u062f\u0644\u064a\u0641\u0631\u064a') {
    deliveryFee = parseFloat(document.getElementById('posDeliveryFee')?.value) || 0;
    const feeDisp = document.getElementById('cartDeliveryFeeDisplay');
    if (feeDisp) feeDisp.textContent = fmt(deliveryFee);
  }

  const afterDiscount = Math.max(0, subtotal - totalDiscount);

  // ─── Service Charge: only for dine-in ────────────────────────────────────
  let serviceAmount = 0;
  const svcEnabled = Number(settings.service_charge_enabled) === 1;
  const svcRate = Number(settings.service_charge_rate || 0);
  if (svcEnabled && svcRate > 0 && currentOrderType === '\u0635\u0627\u0644\u0629') {
    serviceAmount = Math.round(afterDiscount * svcRate / 100 * 100) / 100;
  }

  // ─── VAT / Tax ────────────────────────────────────────────────────────────
  let taxAmount = 0;
  const taxEnabled = Number(settings.tax_enabled) === 1;
  const taxRate = Number(settings.tax_rate || 0);
  const taxType = settings.tax_type || 'exclusive';
  const taxExemptTakeaway = Number(settings.tax_exempt_takeaway) === 1;
  const isTakeaway = currentOrderType === '\u062a\u064a\u0643 \u0623\u0648\u0627\u064a';
  const skipTax = isTakeaway && taxExemptTakeaway;

  if (taxEnabled && taxRate > 0 && !skipTax) {
    const taxBase = afterDiscount + serviceAmount;
    if (taxType === 'inclusive') {
      taxAmount = Math.round((taxBase - (taxBase / (1 + taxRate / 100))) * 100) / 100;
    } else {
      taxAmount = Math.round(taxBase * taxRate / 100 * 100) / 100;
    }
  }

  // Store for doSaveInvoice
  window._lastCalc = { serviceRate: svcRate, serviceAmount, taxRate, taxAmount, taxType, orderType: currentOrderType };

  const netTotal = afterDiscount + serviceAmount + (taxType === 'inclusive' ? 0 : taxAmount) + deliveryFee;
  const paid = parseFloat(document.getElementById('amountPaid')?.value)||0;
  const remaining = Math.max(0, netTotal - paid);
  const totalQty = invoiceItems.reduce((s,i)=>s+i.quantity,0);

  const tQtyEl = document.getElementById('totalQtyDisplay');
  const subEl = document.getElementById('subtotalDisplay');
  const discEl = document.getElementById('discountDisplay');
  const netEl = document.getElementById('netTotalDisplay');
  const paidEl = document.getElementById('paidDisplay');
  const remEl = document.getElementById('remainingDisplay');

  if (tQtyEl) tQtyEl.textContent = totalQty;
  if (subEl) subEl.textContent = fmt(subtotal);
  if (discEl) discEl.textContent = fmt(totalDiscount);
  if (netEl) netEl.textContent = fmt(netTotal) + ' \u062c.\u0645';
  if (paidEl) paidEl.textContent = fmt(paid);
  if (remEl) remEl.textContent = fmt(remaining);

  // Live service charge row
  const svcRow = document.getElementById('cartServiceChargeRow');
  if (svcRow) {
    svcRow.style.display = serviceAmount > 0 ? 'flex' : 'none';
    const svcDisp = document.getElementById('cartServiceChargeDisplay');
    if (svcDisp) svcDisp.textContent = fmt(serviceAmount);
  }
  // Live tax row
  const taxRow = document.getElementById('cartTaxRow');
  if (taxRow) {
    taxRow.style.display = taxAmount > 0 ? 'flex' : 'none';
    const taxDisp = document.getElementById('cartTaxDisplay');
    if (taxDisp) taxDisp.textContent = fmt(taxAmount);
    const taxLbl = document.getElementById('cartTaxLabel');
    if (taxLbl) taxLbl.textContent = taxType === 'inclusive'
      ? `\u0636\u0631\u064a\u0628\u0629 \u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 (${taxRate}% \u0634\u0627\u0645\u0644):`
      : `\u0636\u0631\u064a\u0628\u0629 \u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 (${taxRate}%):`;
  }
}

function payFull() {
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const net = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  document.getElementById('amountPaid').value = fmt(net);
  recalcTotals();
}

// ─── Payment & Checkout Modal Flow ──────────────────────────────────────────
let pendingAction = null; // 'save' | 'saveAndPrint' | 'savePrintAndWhatsApp'

function selectPaymentMethodCard(method) {
  document.getElementById('selectedPaymentMethod').value = method;
  
  // Update card active classes
  const cards = {
    'نقدي': 'methodCard-cash',
    'فيزا': 'methodCard-visa',
    'فودافون كاش': 'methodCard-vodafone',
    'إنستا باي': 'methodCard-instapay'
  };
  Object.keys(cards).forEach(key => {
    const el = document.getElementById(cards[key]);
    if (el) {
      if (key === method) el.classList.add('active');
      else el.classList.remove('active');
    }
  });

  const cashSec = document.getElementById('cashDenominationsSection');
  const amountLbl = document.getElementById('checkoutAmountLabel');

  if (method === 'نقدي') {
    if (cashSec) cashSec.style.display = 'block';
    if (amountLbl) amountLbl.textContent = 'المبلغ المستلم من العميل (ج.م) *';
  } else {
    // Electronic: Auto full-pay
    if (cashSec) cashSec.style.display = 'none';
    if (amountLbl) amountLbl.textContent = `المبلغ المسدد عبر (${method}) *`;
    setCheckoutPaidExact();
  }
  onCheckoutPaidChange();
}

function setCheckoutPaidExact() {
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  const input = document.getElementById('checkoutAmountPaid');
  if (input) input.value = netTotal.toFixed(2);
  onCheckoutPaidChange();
}

function setCheckoutPaidDenom(val) {
  const input = document.getElementById('checkoutAmountPaid');
  if (input) input.value = Number(val).toFixed(2);
  onCheckoutPaidChange();
}

function addCheckoutPaidDelta(delta) {
  const input = document.getElementById('checkoutAmountPaid');
  if (input) {
    const cur = parseFloat(input.value) || 0;
    input.value = Number(cur + delta).toFixed(2);
  }
  onCheckoutPaidChange();
}

function onCheckoutPaidChange() {
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  const paidVal = document.getElementById('checkoutAmountPaid')?.value;
  const paid = parseFloat(paidVal) || 0;
  const diff = paid - netTotal;
  
  const banner = document.getElementById('checkoutChangeBanner');
  const lbl = document.getElementById('checkoutChangeLabel');
  const amt = document.getElementById('checkoutChangeAmount');
  if (!banner || !lbl || !amt) return;

  banner.className = 'change-alert-banner';

  if (Math.abs(diff) < 0.001) {
    banner.classList.add('exact');
    lbl.textContent = '✓ المبلغ مسدد بالكامل (المضبوط)';
    amt.textContent = '0.00 ج.م';
  } else if (diff > 0) {
    banner.classList.add('give-change');
    lbl.textContent = 'الباقي للعميل (فكة):';
    amt.textContent = fmt(diff) + ' ج.م';
  } else {
    banner.classList.add('remaining-debt');
    lbl.textContent = 'المتبقي آجل على العميل:';
    amt.textContent = fmt(Math.abs(diff)) + ' ج.م';
  }
}

async function openCheckoutModal(action) {
  if (!invoiceItems.length) {
    showToast('لا توجد أصناف في الطلب', 'error');
    return;
  }

  pendingAction = action || 'saveAndPrint';
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  
  const netEl = document.getElementById('checkoutNetTotal');
  if (netEl) netEl.textContent = fmt(netTotal) + ' ج.م';

  const badgeEl = document.getElementById('checkoutOrderTypeBadge');
  if (badgeEl) {
    const tblName = getSelectedTableName();
    badgeEl.textContent = currentOrderType === 'صالة' 
      ? `طلب صالة (${tblName || 'ترابيزة'})` 
      : (currentOrderType === 'دليفري' 
          ? 'طلب دليفري' 
          : (currentOrderType === 'قهوة' ? 'طلب قهوة / بار' : 'طلب تيك أواي'));
  }

  // Pre-fill amount paid exact
  const paidInput = document.getElementById('checkoutAmountPaid');
  if (paidInput) paidInput.value = netTotal.toFixed(2);

  // Default to Cash
  selectPaymentMethodCard('نقدي');

  openModal('checkoutModal');
  setTimeout(() => {
    if (paidInput) {
      paidInput.focus();
      paidInput.select();
    }
  }, 150);
}

async function executeConfirmedCheckout(withPrint = true) {
  const paidVal = document.getElementById('checkoutAmountPaid')?.value;
  if (paidVal === '' || isNaN(parseFloat(paidVal)) || parseFloat(paidVal) < 0) {
    Swal.fire('تنبيه', 'يرجى إدخال المبلغ المدفوع بشكل صحيح (أو 0 في حالة الآجل)', 'warning');
    return;
  }
  
  const paid = parseFloat(paidVal);
  const method = document.getElementById('selectedPaymentMethod')?.value || 'نقدي';
  
  // Sync hidden fields on main page
  const mainPaidEl = document.getElementById('amountPaid');
  if (mainPaidEl) mainPaidEl.value = paid;
  
  // Determine treasury_type
  let treasuryType = 'الخزينة';
  if (method === 'فودافون كاش') treasuryType = 'فودافون كاش';
  else if (method === 'إنستا باي') treasuryType = 'إنستا باي';
  else if (method === 'فيزا') treasuryType = 'فيزا';

  closeModal('checkoutModal');
  
  const success = await doSaveInvoice({
    payment_method: method,
    treasury_type: treasuryType,
    amount_paid: paid
  }, withPrint);

  if (success) {
    const isWhatsApp = (pendingAction === 'savePrintAndWhatsApp');

    // Auto-dispatch any unsent items to kitchen/barista for ALL order types!
    const unsentItems = (invoiceItems || []).map(it => {
      const sent = Number(it.sent_qty || 0);
      const curr = Number(it.quantity || 1);
      return { ...it, diffQty: Math.max(0, curr - sent) };
    }).filter(it => it.diffQty > 0);

    if (unsentItems.length > 0) {
      try {
        await printKitchenTicket(unsentItems);
        invoiceItems.forEach(it => { it.sent_qty = Number(it.quantity || 1); });
        await new Promise(r => setTimeout(r, 650));
      } catch (kErr) { console.error('Kitchen ticket print error:', kErr); }
    }

    if (withPrint) {
      await directPrintReceipt(isWhatsApp, false);
    } else {
      showToast('تم حفظ الفاتورة وإرسال البون للتجهيز بنجاح ✓', 'success');
    }
    const settledTableId = currentTableId;
    if (settledTableId) {
      try { await window.tables.updateStatus(settledTableId, 'فاضية'); } catch(e){}
    }
    await newInvoice();
    openOrderTypeGateModal();
  }
}

async function fastCashCheckout() {
  if (!invoiceItems.length) {
    showToast('لا توجد أصناف في الطلب', 'error');
    return;
  }
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  
  const mainPaidEl = document.getElementById('amountPaid');
  if (mainPaidEl) mainPaidEl.value = netTotal;
  
  const settledTableId = currentTableId;
  const itemsSnapshot = [...invoiceItems];

  const success = await doSaveInvoice({
    payment_method: 'نقدي',
    treasury_type: 'الخزينة',
    amount_paid: netTotal
  }, true);

  if (success) {
    // Auto-dispatch any unsent items to kitchen/barista for ALL order types!
    const unsentItems = (itemsSnapshot || []).map(it => {
      const sent = Number(it.sent_qty || 0);
      const curr = Number(it.quantity || 1);
      return { ...it, diffQty: Math.max(0, curr - sent) };
    }).filter(it => it.diffQty > 0);

    if (unsentItems.length > 0) {
      try {
        await printKitchenTicket(unsentItems);
        await new Promise(r => setTimeout(r, 650));
      } catch (kErr) { console.error('Kitchen ticket print error:', kErr); }
    }

    await directPrintReceipt(false, false);
    showToast(`تم الدفع كاش سريع (${fmt(netTotal)} ج.م) وإرسال بون التجهيز ✓`, 'success');
    if (settledTableId) {
      try { await window.tables.updateStatus(settledTableId, 'فاضية'); } catch(e){}
    }
    await newInvoice();
    openOrderTypeGateModal();
  }
}

// ─── Button Interceptors ──────────────────────────────────────────────────────
async function saveInvoice() {
  await openCheckoutModal('save');
}

async function saveAndPrint() {
  await openCheckoutModal('saveAndPrint');
}

async function savePrintAndWhatsApp() {
  await openCheckoutModal('saveAndPrint');
}

// ─── Kitchen Ticket Silent Printing ───────────────────────────────────────────
async function sendOrderToKitchen() {
  if (!invoiceItems.length) {
    showToast('لا توجد أصناف في الطلب لإرسالها للمطبخ', 'error');
    return;
  }

  // Calculate diff items: items with unsent quantities
  const diffItems = invoiceItems
    .map(it => {
      const sent = Number(it.sent_qty || 0);
      const curr = Number(it.quantity || 1);
      const diff = curr - sent;
      return { ...it, diffQty: diff };
    })
    .filter(it => it.diffQty > 0);

  if (!diffItems.length) {
    showToast('تم إرسال جميع الأصناف والكميات الحالية للمطبخ مسبقاً ✓', 'info');
    return;
  }

  // Update sent_qty for all items to match current quantity
  invoiceItems.forEach(it => {
    it.sent_qty = Number(it.quantity || 1);
  });

  const subtotal = parseFloat(document.getElementById('subtotalDisplay')?.textContent) || 0;
  const discountAmt = parseFloat(document.getElementById('discountAmount')?.value) || 0;
  const discountPct = parseFloat(document.getElementById('discountPercent')?.value) || 0;
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  const tableId = currentOrderType === 'صالة' ? (parseInt(document.getElementById('posTableSelect')?.value) || null) : null;
  if (currentOrderType === 'صالة' && !tableId) {
    showToast('يرجى تحديد ترابيزة أولاً لطلب الصالة قبل الإرسال للمطبخ', 'warning');
    return;
  }
  const driverId = currentOrderType === 'دليفري' ? (parseInt(document.getElementById('posDriverSelect')?.value) || null) : null;
  const deliveryFee = currentOrderType === 'دليفري' ? (parseFloat(document.getElementById('posDeliveryFee')?.value) || 0) : 0;

  const calc = window._lastCalc || {};
  const invoiceData = {
    id: currentInvoiceId || undefined,
    table_id: tableId,
    driver_id: driverId,
    delivery_fee: deliveryFee,
    delivery_status: currentOrderType === 'دليفري' ? 'قيد التجهيز' : null,
    customer_id: parseInt(document.getElementById('customerSelect')?.value) || null,
    employee_id: parseInt(document.getElementById('employeeSelect')?.value) || parseInt(sessionStorage.getItem('photoStudio_employeeId')) || null,
    invoice_date: document.getElementById('invoiceDate')?.value || getLocalISODate(),
    invoiceNumber: currentInvoiceNumber || null,
    payment_method: 'نقدي',
    invoice_type: currentOrderType,
    order_type: currentOrderType,
    treasury_type: 'الخزينة',
    subtotal, discount_percent: discountPct, discount_amount: discountAmt,
    net_total: netTotal, amount_paid: 0, remaining: netTotal,
    status: 'مرسلة للمطبخ',
    tax_rate: calc.taxRate || 0,
    tax_amount: calc.taxAmount || 0,
    service_rate: calc.serviceRate || 0,
    service_amount: calc.serviceAmount || 0
  };

  const res = await window.db.saveInvoice(invoiceData, invoiceItems);
  if (res.success) {
    currentInvoiceId = res.data.invoiceId || currentInvoiceId;
    currentInvoiceNumber = res.data.invoiceNumber || currentInvoiceNumber;
    document.getElementById('invoiceNumberDisplay').textContent = currentInvoiceNumber;

    // Silent print to Kitchen Thermal Printer: ONLY diff items
    await printKitchenTicket(diffItems);
    showToast('تم إرسال الأصناف الجديدة للتجهيز بنجاح ✓', 'success');
    renderItemsTable();
    if (tableId) {
      await loadTables();
    }
  } else {
    showToast('فشل إرسال الطلب للمطبخ: ' + res.error, 'error');
  }
}

// Helper: strip status like (مشغولة) / (فاضية) from table name
function getCleanTableName(name) {
  if (!name) return '';
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

async function printThermalDocument(html, frameId = 'posThermalFrame') {
  // Try silent IPC print first (no dialog)
  if (window.electron && typeof window.electron.printThermal === 'function') {
    const printerKey = frameId === 'posKitchenFrame' ? 'printer_kitchen' : 'printer_receipt';
    const printerName = (settings && settings[printerKey]) ? settings[printerKey] : (settings && settings.printer_receipt ? settings.printer_receipt : '');
    try {
      const result = await window.electron.printThermal(html, printerName);
      if (result && result.success) return;
      // Fall through to iframe if silent print fails
      console.warn('Silent print failed:', result && result.error);
    } catch (e) {
      console.warn('printThermal IPC error:', e);
    }
  }
  // Fallback: iframe print (shows dialog)
  let iframe = document.getElementById(frameId);
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = frameId;
    iframe.style.cssText = 'position:fixed;right:-9999px;bottom:-9999px;width:72mm;height:100px;border:none;';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 350);
}

function buildKitchenTicketStandaloneHTML(diffItems = null) {
  const time = new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const rawTableName = getSelectedTableName ? getSelectedTableName() : '';
  const tblName = getCleanTableName(rawTableName);

  let orderTitle, tableLabel;
  if (currentOrderType === 'صالة') {
    orderTitle = 'طلب صالة (داخلي)';
    tableLabel = tblName || 'ترابيزة غير محددة';
  } else if (currentOrderType === 'دليفري') {
    orderTitle = 'طلب دليفري (توصيل)';
    tableLabel = '';
  } else {
    orderTitle = 'طلب سفري (تيك أواي)';
    tableLabel = '';
  }

  const itemsToPrint = diffItems && diffItems.length ? diffItems : invoiceItems;
  if (!itemsToPrint || !itemsToPrint.length) return '';

  const invNum = currentInvoiceNumber || (lastSavedInvoice?.invoiceNumber) || '';

  const itemsRows = itemsToPrint.map(it => {
    const printQty = it.diffQty !== undefined ? it.diffQty : it.quantity;
    return `
      <tr style="border-bottom:1.5px dashed #000;">
        <td style="padding:5px 0; vertical-align:middle; text-align:right;">
          <div style="font-size:16px; font-weight:900; line-height:1.2; color:#000;">
            ${escapeHtml(it.service_name)}
          </div>
          ${it.notes ? `
            <div style="font-size:13px; font-weight:900; color:#000; background:#f0f0f0; border-right:3px solid #000; padding:2px 6px; margin-top:2px; display:inline-block;">
              ↳ *** ${escapeHtml(it.notes)} ***
            </div>
          ` : ''}
        </td>
        <td style="font-size:22px; font-weight:900; text-align:center; vertical-align:middle; width:48px; padding:5px 0; color:#000;">
          ${printQty}
        </td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>بون تجهيز - مطبخ</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      background: #fff;
      color: #000;
      direction: rtl;
      font-family: 'Cairo', Arial, sans-serif;
      font-size: 13px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .thermal-page {
      width: 100%;
      padding: 2mm 5mm 2mm 2mm;
      box-sizing: border-box;
      direction: rtl;
      text-align: right;
    }
  </style>
</head>
<body>
  <div class="thermal-page">
    <div style="text-align:center; border:2.5px solid #000; border-radius:6px; padding:6px 4px; margin-bottom:5px; background:#fff;">
      <div style="font-size:22px; font-weight:900; letter-spacing:0.5px; line-height:1.2;">
        【 ${orderTitle} 】
      </div>
      ${tableLabel ? `<div style="font-size:18px; font-weight:900; margin-top:3px; background:#000; color:#fff; padding:2px 8px; border-radius:4px; display:inline-block;">ترابيزة: ${tableLabel}</div>` : ''}
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:900; margin-top:4px; border-top:1.5px dashed #000; padding-top:3px;">
        <span>الوقت: ${time}</span>
        <span>فاتورة: #${invNum}</span>
      </div>
    </div>
    <table style="width:100%; border-collapse:collapse; text-align:right; margin:2px 0;">
      <thead>
        <tr style="border-bottom:2px solid #000; font-size:14px; font-weight:900;">
          <th style="padding:2px 0; text-align:right;">الصنف والتخصيص</th>
          <th style="text-align:center; width:48px; padding:2px 0;">الكمية</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>
    <div style="border-top:2px solid #000; margin-top:6px;"></div>
  </div>
</body>
</html>`;
}

function printKitchenTicket(diffItems = null) {
  const html = buildKitchenTicketStandaloneHTML(diffItems);
  if (!html) return;
  printThermalDocument(html, 'posKitchenFrame');
}

// ─── Actual Save Invoice ──────────────────────────────────────────────────────
async function doSaveInvoice(checkoutData, isPrint = false) {
  const subtotal = parseFloat(document.getElementById('subtotalDisplay')?.textContent) || 0;
  const discountAmt = parseFloat(document.getElementById('discountAmount')?.value) || 0;
  const discountPct = parseFloat(document.getElementById('discountPercent')?.value) || 0;
  const netText = document.getElementById('netTotalDisplay')?.textContent || '0';
  const netTotal = parseFloat(netText.replace(/[^\d.]/g, '')) || 0;
  const amtPaidRaw = Number(checkoutData.amount_paid || 0);
  // Cap paid at net_total: customer overpayment means change is given back, not recorded as extra revenue
  const amtPaid = amtPaidRaw > netTotal ? netTotal : amtPaidRaw;
  const remaining = Math.max(0, netTotal - amtPaid);
  // Store the actual cash received for display (change due shown in UI before save)
  const cashReceived = amtPaidRaw;

  const tableId = currentOrderType === 'صالة' ? (parseInt(document.getElementById('posTableSelect')?.value) || null) : null;
  const driverId = currentOrderType === 'دليفري' ? (parseInt(document.getElementById('posDriverSelect')?.value) || null) : null;
  const deliveryFee = currentOrderType === 'دليفري' ? (parseFloat(document.getElementById('posDeliveryFee')?.value) || 0) : 0;

  const calc = window._lastCalc || {};

  const invoiceData = {
    id: currentInvoiceId || undefined,
    customer_id: parseInt(document.getElementById('customerSelect')?.value) || null,
    employee_id: parseInt(document.getElementById('employeeSelect')?.value) || parseInt(sessionStorage.getItem('photoStudio_employeeId')) || null,
    table_id: tableId,
    driver_id: driverId,
    delivery_status: currentOrderType === '\u062f\u0644\u064a\u0641\u0631\u064a' ? (remaining <= 0 && amtPaid > 0 ? '\u062a\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645' : '\u0642\u064a\u062f \u0627\u0644\u062a\u062c\u0647\u064a\u0632') : null,
    delivery_fee: deliveryFee,
    invoice_date: document.getElementById('invoiceDate')?.value || getLocalISODate(),
    invoiceNumber: currentInvoiceNumber || null,
    payment_method: checkoutData.payment_method || '\u0646\u0642\u062f\u064a',
    invoice_type: currentOrderType,
    order_type: currentOrderType,
    treasury_type: checkoutData.treasury_type || '\u0627\u0644\u062e\u0632\u064a\u0646\u0629',
    subtotal,
    discount_percent: discountPct,
    discount_amount: discountAmt,
    net_total: netTotal,
    amount_paid: amtPaid,
    remaining,
    notes: document.getElementById('invoiceNotes')?.value || null,
    status: remaining <= 0 && amtPaid > 0 ? '\u0645\u062d\u0627\u0633\u064e\u0628\u0629' : '\u0645\u0641\u062a\u0648\u062d\u0629',
    tax_rate: calc.taxRate || 0,
    tax_amount: calc.taxAmount || 0,
    service_rate: calc.serviceRate || 0,
    service_amount: calc.serviceAmount || 0
  };

  const res = await window.db.saveInvoice(invoiceData, invoiceItems);
  if(res.success){
    currentInvoiceId = res.data.invoiceId;
    currentInvoiceNumber = res.data.invoiceNumber || currentInvoiceNumber;

    const custPhone = getSelectedCustomerPhone();
    const custName = getSelectedCustomerName();
    lastSavedInvoice = { 
      ...invoiceData, 
      id: res.data.invoiceId,
      items:[...invoiceItems], 
      invoiceNumber:res.data.invoiceNumber,
      customer_phone: custPhone,
      customer_name: custName,
      cash_received: cashReceived
    };

    await reloadServicesStock();
    await loadTables();
    showToast('تم حفظ الفاتورة بنجاح', 'success');

    return true;
  } else {
    showToast('خطأ في الحفظ: '+res.error,'error');
    return false;
  }
}

// ── مساعد: جلب رقم هاتف العميل المختار ──────────────────────────────────────
function getSelectedCustomerPhone() {
  const custId = document.getElementById('customerSelect').value;
  if (!custId || !window.allCustomers) return null;
  const cust = window.allCustomers.find(c => c.id === parseInt(custId));
  return cust?.phone || null;
}

function getSelectedCustomerName() {
  const custId = document.getElementById('customerSelect').value;
  if (!custId || !window.allCustomers) return 'عميلنا العزيز';
  const cust = window.allCustomers.find(c => c.id === parseInt(custId));
  return cust?.name || 'عميلنا العزيز';
}

// ── إرسال واتساب من نافذة النجاح (بعد حفظ الفاتورة) ──────────────────────────
async function sendWhatsApp() {
  if (!lastSavedInvoice) { showToast('لا توجد فاتورة محفوظة', 'error'); return; }

  const phone = lastSavedInvoice.customer_phone || getSelectedCustomerPhone();
  if (!phone) { showToast('العميل ليس لديه رقم هاتف مسجل', 'warning'); return; }

  const waBtn = document.getElementById('savedModalWaBtn');
  let originalBtnHtml = '';
  if (waBtn) {
    originalBtnHtml = waBtn.innerHTML;
    waBtn.disabled = true;
    waBtn.style.opacity = '0.7';
    waBtn.innerHTML = `جاري الإرسال...`;
  }

  showToast('جاري إرسال واتساب للعميل...', 'info');

  try {
    const status = await window.whatsapp.getStatus();
    if (!status.ready) {
      showToast('واتساب غير متصل — يرجى فتح الواتساب ومسح رمز QR من الإعدادات', 'warning');
      if (waBtn) {
        waBtn.disabled = false;
        waBtn.style.opacity = '1';
        waBtn.innerHTML = originalBtnHtml;
      }
      return;
    }

    const shopName = settings.company_name || 'كافيه ومطعم برو';
    const customerName = lastSavedInvoice.customer_name || getSelectedCustomerName();
    
    let sellerName = 'غير محدد';
    const empSelect = document.getElementById('employeeSelect');
    if (empSelect && empSelect.selectedIndex >= 0) {
      sellerName = empSelect.options[empSelect.selectedIndex]?.text || 'غير محدد';
    }
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute:'2-digit' });

    const res = await window.whatsapp.sendInvoiceConfirm({
      phone,
      customerName,
      invoiceNumber: lastSavedInvoice.invoiceNumber,
      total: fmt(lastSavedInvoice.net_total || 0),
      paid: fmt(lastSavedInvoice.amount_paid || 0),
      remaining: fmt(lastSavedInvoice.remaining || 0),
      shopName,
      sellerName: sellerName,
      date: lastSavedInvoice.invoice_date,
      time: timeStr
    });

    if (res && res.success) {
      showToast('تم إرسال واتساب للعميل بنجاح ✓', 'success');
      if (waBtn) {
        waBtn.disabled = false;
        waBtn.style.opacity = '1';
        waBtn.style.background = '#16a34a';
        waBtn.style.borderColor = '#16a34a';
        waBtn.innerHTML = `✓ تم الإرسال`;
      }
    } else {
      showToast(`فشل الإرسال: ${res?.error || 'خطأ غير معروف'}`, 'error');
      if (waBtn) {
        waBtn.disabled = false;
        waBtn.style.opacity = '1';
        waBtn.innerHTML = originalBtnHtml;
      }
    }
  } catch (err) {
    showToast(`خطأ في الإرسال: ${err.message}`, 'error');
    if (waBtn) {
      waBtn.disabled = false;
      waBtn.style.opacity = '1';
      waBtn.innerHTML = originalBtnHtml;
    }
  }
}

// ── إرسال واتساب من سجل الفواتير ───────────────────────────────────────────────
async function sendWhatsAppFromHistory(inv) {
  const phone = inv.customer_phone;
  if (!phone) { showToast('العميل ليس لديه رقم هاتف مسجل', 'warning'); return; }

  showToast('جاري إرسال واتساب للعميل...', 'info');

  try {
    const status = await window.whatsapp.getStatus();
    if (!status.ready) {
      showToast('واتساب غير متصل — تحقق من الإعدادات', 'warning');
      return;
    }

    const shopName = settings.company_name || 'كافيه ومطعم برو';
    const customerName = inv.customer_name || 'عميلنا العزيز';

    const res = await window.whatsapp.sendInvoiceConfirm({
      phone, 
      customerName,
      invoiceNumber: inv.invoice_number,
      total: fmt(inv.net_total || 0),
      paid: fmt(inv.amount_paid || 0),
      remaining: fmt(inv.remaining || 0),
      shopName,
      sellerName: inv.emp_name || 'غير محدد',
      date: inv.invoice_date || '',
      time: ''
    });

    if (res && res.success) {
      showToast('تم إرسال واتساب للعميل بنجاح ✓', 'success');
    } else {
      showToast(`فشل الإرسال: ${res?.error || 'خطأ غير معروف'}`, 'error');
    }
  } catch (err) {
    showToast(`خطأ في الإرسال: ${err.message}`, 'error');
  }
}

// ─── Print Receipt ────────────────────────────────────────────────────────────
function buildReceiptHTML(inv) {
  const curr = settings.currency || 'ج.م';
  const invNum = inv.invoiceNumber || inv.invoice_number || currentInvoiceNumber;
  const date = inv.invoice_date || new Date().toLocaleDateString('ar-EG-u-nu-latn');
  const time = new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const subtotal = fmt(inv.subtotal || 0);
  const discount = fmt(inv.discount_amount || 0);
  const net = fmt(inv.net_total || 0);
  const paid = fmt(inv.amount_paid || 0);
  const remaining = fmt(inv.remaining || 0);
  const hasDiscount = parseFloat(inv.discount_amount || 0) > 0;
  const deliveryFee = parseFloat(inv.delivery_fee || 0);
  const serviceAmount = parseFloat(inv.service_amount || (window._lastCalc?.serviceAmount) || 0);
  const serviceRate = parseFloat(inv.service_rate || (window._lastCalc?.serviceRate) || 0);
  const taxAmount = parseFloat(inv.tax_amount || (window._lastCalc?.taxAmount) || 0);
  const taxRate = parseFloat(inv.tax_rate || (window._lastCalc?.taxRate) || 0);
  const taxType = inv.tax_type || settings.tax_type || 'exclusive';

  // Logo: prominent and centered
  let logoHTML = '';
  if (settings.logo_path) {
    let safeLogo = settings.logo_path;
    if (!safeLogo.startsWith('data:') && !safeLogo.startsWith('http')) {
      if (safeLogo.startsWith('assets/')) safeLogo = '../' + safeLogo;
      else if (!safeLogo.startsWith('../')) safeLogo = 'file:///' + safeLogo.replace(/\\/g, '/');
    }
    logoHTML = `<div style="text-align:center; margin:0 auto 8px;"><img src="${safeLogo}" style="max-height:90px; max-width:220px; object-fit:contain; display:block; margin:0 auto;" onerror="this.src='../assets/logo.png'"></div>`;
  } else {
    logoHTML = `<div style="text-align:center; margin:0 auto 8px;"><img src="../assets/logo.png" style="max-height:90px; max-width:220px; object-fit:contain; display:block; margin:0 auto;" onerror="this.style.display='none'"></div>`;
  }
  
  // Compact contact info
  let contactDetails = [];
  if (settings.phone) contactDetails.push(`ت: ${settings.phone}`);
  if (settings.address) contactDetails.push(settings.address);
  const contactHTML = contactDetails.length > 0 
    ? `<div style="text-align:center; font-size:11px; font-weight:800; color:#333; margin-bottom:2px;">${contactDetails.join(' | ')}</div>` 
    : '';

  // Customer Name
  let custName = '';
  if (inv.customer_name && inv.customer_name !== 'عميل نقدي') {
    custName = inv.customer_name;
  } else if (inv.customer_id && window.allCustomers) {
    const c = window.allCustomers.find(x => x.id == inv.customer_id);
    if (c && c.name && c.name !== 'عميل نقدي') custName = c.name;
  }

  // Order type and table — clean, no status
  const rawInvTable = (inv.invoice_type === 'صالة' || currentOrderType === 'صالة')
    ? (inv.table_name || getCleanTableName(getSelectedTableName ? getSelectedTableName() : ''))
    : '';
  let orderTypeStr = inv.invoice_type || currentOrderType || 'تيك أواي';
  let orderBadgeText = '';
  let orderDetailText = '';
  if (orderTypeStr === 'صالة') {
    orderBadgeText = 'طلب صالة (داخلي)';
    orderDetailText = rawInvTable ? `ترابيزة: ${rawInvTable}` : 'جلوس بالصالة';
  } else if (orderTypeStr === 'دليفري') {
    orderBadgeText = 'طلب دليفري (توصيل)';
    orderDetailText = inv.driver_name ? `الطيار: ${inv.driver_name}` : 'توصيل خارجي';
  } else {
    orderBadgeText = 'طلب سفري (تيك أواي)';
    orderDetailText = 'استلام فوري من الكاشير';
  }

  // Items: 3 compact columns with VERY BOLD typography
  const items = inv.items || invoiceItems;
  const itemsRows = items.map((item) => `
    <tr style="border-bottom:1px dashed #666;">
      <td style="padding:3px 1px; vertical-align:middle;">
        <div style="font-size:13px; font-weight:900; line-height:1.2; color:#000;">
          ${escapeHtml(item.service_name)}
        </div>
        ${(item.notes && item.notes.trim()) ? `
          <div style="font-size:10.5px; font-weight:800; color:#222; margin-top:1px;">
            ↳ (${escapeHtml(item.notes.trim())})
          </div>
        ` : ''}
      </td>
      <td style="text-align:center; padding:3px 1px; font-size:14px; font-weight:900; vertical-align:middle; width:38px;">
        ${item.quantity}
      </td>
      <td style="text-align:left; padding:3px 1px; font-size:13px; font-weight:900; vertical-align:middle; width:65px;">
        ${fmt(item.total)}
      </td>
    </tr>
  `).join('');

  // Only display notes if explicitly entered for this order - NO boilerplate notes!
  const notesStr = (inv.notes || document.getElementById('invoiceNotes')?.value || '').trim();
  const notesHTML = notesStr ? `<div style="font-size:11px; font-weight:800; border-top:1px dashed #000; padding-top:2px; margin-top:2px;">ملاحظات: ${escapeHtml(notesStr)}</div>` : '';

  return `
    <div class="receipt" style="
      width:100%;
      max-width:100%;
      box-sizing:border-box;
      font-family:'Cairo',Arial,sans-serif;
      color:#000;
      direction:rtl;
      text-align:right;
      padding:0;
      margin:0;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    ">
      ${logoHTML}
      <div style="text-align:center; font-size:18px; font-weight:900; line-height:1.2; margin-bottom:2px; letter-spacing:0.3px;">
        ${settings.company_name || 'كافيه ومطعم برو'}
      </div>
      ${contactHTML}

      <!-- Prominent Order Type Boxed Badge -->
      <div style="text-align:center; margin:5px 0 6px; padding:6px 4px; border:2.5px solid #000; border-radius:6px; background:#fff;">
        <div style="font-size:17px; font-weight:900; color:#000; letter-spacing:0.5px; line-height:1.2;">
          ★ ${orderBadgeText} ★
        </div>
        ${orderDetailText ? `<div style="font-size:13px; font-weight:900; color:#000; margin-top:2px;">${orderDetailText}</div>` : ''}
      </div>

      <!-- Compact Meta Divider -->
      <table style="width:100%; border-collapse:collapse; font-size:12px; font-weight:900; line-height:1.4; margin-bottom:3px;">
        <tr>
          <td style="text-align:right; padding:0;">فاتورة: #${invNum}</td>
          <td style="text-align:left; padding:0;">النوع: <b>${orderBadgeText}</b></td>
        </tr>
        <tr style="font-size:11px; font-weight:800; color:#222;">
          <td style="text-align:right; padding:0;">${date} — ${time}</td>
          <td style="text-align:left; padding:0;">${custName ? `العميل: ${escapeHtml(custName)}` : ''}</td>
        </tr>
      </table>
      <div style="border-top:1.5px dashed #000; margin:2px 0;"></div>

      <!-- Items Table: Bold, clear, compact -->
      <table style="width:100%; border-collapse:collapse; text-align:right; margin:2px 0;">
        <thead>
          <tr style="border-bottom:1.5px solid #000; font-size:12px; font-weight:900;">
            <th style="padding:2px 1px;">الصنف والتخصيص</th>
            <th style="text-align:center; width:38px; padding:2px 1px;">الكمية</th>
            <th style="text-align:left; width:65px; padding:2px 1px;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <!-- Totals: Compact and Super Bold -->
      <div style="border-top:1px dashed #000; margin:2px 0;"></div>
      ${hasDiscount ? `
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800;">
          <span>الإجمالي قبل الخصم:</span>
          <span>${subtotal} ${curr}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800; color:#000;">
          <span>قيمة الخصم:</span>
          <span>-${discount} ${curr}</span>
        </div>
      ` : ''}
      ${deliveryFee > 0 ? `
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800;">
          <span>خدمة التوصيل:</span>
          <span>+${fmt(deliveryFee)} ${curr}</span>
        </div>
      ` : ''}
      ${serviceAmount > 0 ? `
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800; color:#5b21b6;">
          <span>خدمة الصالة (${serviceRate}%):</span>
          <span>+${fmt(serviceAmount)} ${curr}</span>
        </div>
      ` : ''}
      ${taxAmount > 0 ? `
        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800; color:#92400e;">
          <span>ضريبة ق.م (${taxRate}% ${taxType === 'inclusive' ? 'شامل' : ''}):</span>
          <span>+${fmt(taxAmount)} ${curr}</span>
        </div>
      ` : ''}

      <!-- Net Total: Huge & Bold -->
      <div style="border-top:2px solid #000; border-bottom:2px solid #000; padding:2px 0; margin:2px 0; display:flex; justify-content:space-between; font-size:17px; font-weight:900;">
        <span>الصافي المطلوب:</span>
        <span>${net} ${curr}</span>
      </div>

      <!-- Paid, Change Due -->
      <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:800; margin-top:2px;">
        <span>المدفوع: ${paid} ${curr}</span>
        ${(inv.cash_received && parseFloat(inv.cash_received) > parseFloat(inv.net_total || 0)) ? `<span>المستلم: ${fmt(inv.cash_received)} ${curr}</span>` : ''}
      </div>
      ${(inv.cash_received && parseFloat(inv.cash_received) > parseFloat(inv.net_total || 0)) ? `
      <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:900; margin-top:2px; color:#166534;">
        <span>الباقي للعميل:</span>
        <span>${fmt(parseFloat(inv.cash_received) - parseFloat(inv.net_total || 0))} ${curr}</span>
      </div>` : (parseFloat(inv.remaining || 0) > 0 ? `
      <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:800; margin-top:2px; color:#dc2626;">
        <span>المتبقي:</span>
        <span>${remaining} ${curr}</span>
      </div>` : '')}

      ${notesHTML}
      <div style="border-top:1.5px dashed #000; margin:4px 0 2px;"></div>
    </div>
  `;
}

async function reversePaymentPrompt(invoiceId, amountPaid) {
  const res = await Swal.fire({
    title: 'إرجاع التسديد',
    text: `المبلغ المسدد الحالي هو ${amountPaid} جنيه. ما هو المبلغ الذي تريد إرجاعه؟`,
    input: 'number',
    inputAttributes: { min: 1, max: amountPaid, step: 0.5 },
    inputValue: amountPaid,
    showCancelButton: true,
    confirmButtonText: 'إرجاع',
    cancelButtonText: 'إلغاء'
  });
  if (res.isConfirmed && res.value) {
    const amt = parseFloat(res.value);
    if (amt > 0 && amt <= amountPaid) {
      const dbRes = await window.db.reversePayment(invoiceId, amt);
      if (dbRes.success) {
        showToast('تم إرجاع التسديد بنجاح', 'success');
        openHistoryModal(); // refresh
      } else {
        showToast('خطأ: ' + dbRes.error, 'error');
      }
    } else {
      showToast('مبلغ غير صحيح', 'error');
    }
  }
}

function printAndReset() {
  printReceipt(false);
}

function buildReceiptStandaloneHTML(inv) {
  const content = buildReceiptHTML(inv);
  return '<!DOCTYPE html>' +
'<html dir="rtl" lang="ar">' +
'<head>' +
'  <meta charset="utf-8">' +
'  <title>فاتورة</title>' +
'  <style>' +
'    * { box-sizing: border-box; margin: 0; padding: 0; }' +
'    html, body {' +
'      width: 100%;' +
'      background: #fff;' +
'      color: #000;' +
'      direction: rtl;' +
'      font-family: Arial, "Cairo", sans-serif;' +
'      font-size: 13px;' +
'      -webkit-print-color-adjust: exact;' +
'      print-color-adjust: exact;' +
'    }' +
'    .thermal-page {' +
'      width: 100%;' +
'      padding: 2mm 6mm 2mm 2mm;' +
'      box-sizing: border-box;' +
'      direction: rtl;' +
'      text-align: right;' +
'    }' +
'  </style>' +
'</head>' +
'<body>' +
'  <div class="thermal-page">' +
     content +
'  </div>' +
'</body>' +
'</html>';
}

function directPrintReceipt(withWhatsApp = false, resetAfter = true) {
  try {
    const inv = lastSavedInvoice || {
      items: invoiceItems,
      invoice_date: document.getElementById('invoiceDate')?.value || getLocalISODate(),
      subtotal: parseFloat(document.getElementById('subtotalDisplay')?.textContent) || 0,
      discount_amount: parseFloat(document.getElementById('discountAmount')?.value) || 0,
      net_total: parseFloat(document.getElementById('netTotalDisplay')?.textContent) || 0,
      amount_paid: parseFloat(document.getElementById('amountPaid')?.value) || 0,
      remaining: parseFloat(document.getElementById('remainingDisplay')?.textContent) || 0
    };
    const html = buildReceiptStandaloneHTML(inv);
    printThermalDocument(html, 'posReceiptFrame');

    if (withWhatsApp) {
      sendWhatsApp();
    }
    
    // Start fresh invoice after direct printing/messaging if requested
    if (resetAfter) {
      newInvoice();
    }
  } catch (err) {
    showToast('حدث خطأ في الطباعة: ' + err.message, 'error');
  }
}

function printReceipt(withWhatsApp = false, resetAfter = true) {
  return directPrintReceipt(withWhatsApp, resetAfter);
}

async function reloadServicesStock() {
  try {
    const srvRes = await window.db.query('SELECT s.*, sc.name as cat_name FROM services s LEFT JOIN service_categories sc ON s.category_id=sc.id ORDER BY s.name', []);
    if (srvRes.success && srvRes.data) {
      allServices = srvRes.data;
      populateServiceSelect(allServices);
      renderServiceGrid(allServices);
    }
  } catch (e) {
    console.error('reloadServicesStock error:', e);
  }
}

// ─── New / Reset Invoice ──────────────────────────────────────────────────────
async function newInvoice() {
  invoiceItems = [];
  lastSavedInvoice = null;
  currentInvoiceId = null;
  currentTableId = null;
  const tblSel = document.getElementById('posTableSelect');
  if (tblSel) tblSel.value = '';
  const cartTitle = document.getElementById('cartOrderTitle');
  if (cartTitle) cartTitle.textContent = 'طلب جديد';

  renderItemsTable();
  recalcTotals();
  const dPct = document.getElementById('discountPercent');
  const dAmt = document.getElementById('discountAmount');
  const aPaid = document.getElementById('amountPaid');
  const notes = document.getElementById('invoiceNotes');
  const cSearch = document.getElementById('customerSearchInput');
  const cSel = document.getElementById('customerSelect');
  const iDate = document.getElementById('invoiceDate');

  if (dPct) dPct.value = '0';
  if (dAmt) dAmt.value = '0';
  if (aPaid) aPaid.value = '0';
  if (notes) notes.value = '';
  clearSelectedCustomer();
  if (iDate) iDate.value = getLocalISODate();

  window._resumedInvoiceNumber = null;
  window._resumedPaymentMethod = null;
  closeModal('savedModal');
  await reloadServicesStock();
  await loadTables();

  if (window.db && window.db.generateInvoiceNumber) {
    const invRes = await window.db.generateInvoiceNumber();
    if (invRes && invRes.success) {
      currentInvoiceNumber = invRes.data;
      document.getElementById('invoiceNumberDisplay').textContent = invRes.data;
    }
  } else {
    currentInvoiceNumber = '0001';
    document.getElementById('invoiceNumberDisplay').textContent = currentInvoiceNumber;
  }
}

function resetInvoice() {
  if(!invoiceItems.length) return;
  Swal.fire({
    title: 'هل أنت متأكد؟',
    text: "سيتم مسح جميع الأصناف من الفاتورة!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'نعم، امسح',
    cancelButtonText: 'إلغاء'
  }).then((result) => {
    if (result.isConfirmed) {
      invoiceItems=[]; renderItemsTable(); recalcTotals();
    }
  });
}

function deleteInvoice() {
  Swal.fire({
    title: 'إلغاء الفاتورة؟',
    text: "سيتم إلغاء هذه الفاتورة والبدء من جديد",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'نعم، إلغاء',
    cancelButtonText: 'تراجع'
  }).then((result) => {
    if (result.isConfirmed) newInvoice();
  });
}

// ─── New Customer ─────────────────────────────────────────────────────────────
function openNewCustomerModal(){ openModal('newCustomerModal'); }
async function saveNewCustomer(){
  const name = document.getElementById('nc_name').value.trim();
  if(!name){ showToast('يرجى إدخال اسم العميل','error'); return; }
  const phoneVal = document.getElementById('nc_phone').value.trim();

  // التحقق من عدم تكرار رقم التليفون
  if (phoneVal) {
    const checkPhone = await window.db.queryOne(
      `SELECT id, name FROM customers WHERE phone=? LIMIT 1`, [phoneVal]
    );
    if (checkPhone.success && checkPhone.data) {
      showToast(`رقم التليفون "${phoneVal}" مسجل مسبقاً للعميل: ${checkPhone.data.name}`, 'error');
      return;
    }
  }

  const res = await window.db.run(
    `INSERT INTO customers (name,phone,address,opening_balance,current_balance) VALUES (?,?,?,?,?)`,
    [name, phoneVal, document.getElementById('nc_address').value.trim(),
      parseFloat(document.getElementById('nc_balance').value)||0, parseFloat(document.getElementById('nc_balance').value)||0]
  );
  if(res.success){
    // Update global array
    const newId = res.lastInsertRowid;
    if(!window.allCustomers) window.allCustomers = [];
    window.allCustomers.push({ id: newId, name: name, phone: phoneVal });
    
    // Update datalist
    const cList = document.getElementById('customersList');
    cList.innerHTML += `<option value="${name} - ${phoneVal}" data-id="${newId}" data-phone="${phoneVal}"></option>`;
    
    // Auto select
    document.getElementById('customerSearchInput').value = `${name}${phoneVal ? ' - ' + phoneVal : ''}`;
    document.getElementById('customerSelect').value = newId;
    handleCustomerSelect();

    showToast(`تم إضافة العميل "${name}" `,'success');
    closeModal('newCustomerModal');
    document.getElementById('nc_name').value='';
    document.getElementById('nc_phone').value='';
    document.getElementById('nc_address').value='';
    document.getElementById('nc_balance').value='0';
  } else { showToast('خطأ: '+res.error,'error'); }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
async function goBack() {
  if (invoiceItems && invoiceItems.length > 0) {
    const res = await Swal.fire({
      title: 'تنبيه',
      text: 'الأصناف الموجودة في الفاتورة سيتم مسحها. هل تريد الرجوع؟',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'نعم، رجوع',
      cancelButtonText: 'إلغاء'
    });
    if (!res.isConfirmed) return;
  }
  navigate('main-dashboard.html');
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'itemBarcode') {
    e.preventDefault();
    lookupBarcode();
  }
  if (e.key === 'F1') {
    e.preventDefault();
    openCheckoutModal('saveAndPrint');
  }
  if (e.key === 'F2') {
    e.preventDefault();
    fastCashCheckout();
  }
  if (e.key === 'F3') {
    e.preventDefault();
    sendOrderToKitchen();
  }
  if (e.key === 'Escape') {
    const gateModal = document.getElementById('orderTypeGateModal');
    if (gateModal && gateModal.classList.contains('open')) {
      e.preventDefault();
      closeOrderTypeGateModal();
      return;
    }
    const resModal = document.getElementById('posReserveTableModal');
    if (resModal && resModal.classList.contains('open')) {
      e.preventDefault();
      closeModal('posReserveTableModal');
      return;
    }
    const tablePickerModal = document.getElementById('posTablePickerModal');
    if (tablePickerModal && tablePickerModal.classList.contains('open')) {
      e.preventDefault();
      closeModal('posTablePickerModal');
      return;
    }
    const itemModModal = document.getElementById('itemModifierModal');
    if (itemModModal && itemModModal.classList.contains('open')) {
      e.preventDefault();
      closeModal('itemModifierModal');
      return;
    }
    const checkoutModal = document.getElementById('checkoutModal');
    if (checkoutModal && checkoutModal.classList.contains('open')) {
      e.preventDefault();
      closeModal('checkoutModal');
      return;
    }
    const savedModal = document.getElementById('savedModal');
    if (savedModal && savedModal.classList.contains('open')) {
      e.preventDefault();
      newInvoice();
      return;
    }
    const historyModal = document.getElementById('historyModal');
    if (historyModal && historyModal.classList.contains('open')) {
      e.preventDefault();
      closeModal('historyModal');
      return;
    }
    goBack();
  }
});

// ─── Invoices History ───────────────────────────────────────────────────────────
async function openHistoryModal() {
  document.getElementById('posHistorySearch').value = '';
  if (document.getElementById('posHistoryPhone')) document.getElementById('posHistoryPhone').value = '';

  // جلب آخر 300 فاتورة فقط — لتجنب بطء الجلب عند كثرة الفواتير
  const res = await window.db.query(`
    SELECT i.*, 
           c.name as customer_name, 
           c.phone as customer_phone,
           (i.net_total - COALESCE((SELECT SUM(total_returned) FROM returns WHERE original_invoice_id = i.id), 0)) as dynamic_net_total
    FROM invoices i 
    LEFT JOIN customers c ON i.customer_id = c.id
    ORDER BY i.id DESC
    LIMIT 300
  `, []);
  if (res.success && res.data) {
    posAllInvoices = res.data;
  } else {
    posAllInvoices = [];
  }
  
  renderPosHistory(posAllInvoices.slice(0, 30));
  openModal('historyModal');
}

async function reprintPastInvoice(inv) {
  closeModal('historyModal');
  
  // Fetch items for this invoice
  const itemsRes = await window.db.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [inv.id]);
  const items = itemsRes.success ? itemsRes.data : [];
  
  // Reuse existing receipt logic
  lastSavedInvoice = {
    ...inv,
    items: items,
    customer_name: inv.customer_name,
    customer_phone: inv.customer_phone
  };
  
  await directPrintReceipt(false, false);
}

// ─── POS Navigation / Cashier Logout ──────────────────────────────────────────
async function handlePosBackOrLogout() {
  if (sessionRole === 'cashier') {
    if (invoiceItems && invoiceItems.length > 0) {
      const warn = await Swal.fire({
        title: 'تنبيه: السلة بها أصناف!',
        text: 'الأصناف الموجودة في الطلب الحالي لم تُحفظ. هل تريد إلغاءها وتسجيل الخروج؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'نعم، تسجيل خروج',
        cancelButtonText: 'إلغاء والعودة للطلب'
      });
      if (!warn.isConfirmed) return;
    }
    const ask = await Swal.fire({
      title: 'تسجيل الخروج',
      text: 'هل أنت متأكد من تسجيل الخروج وإنهاء جلسة الكاشير؟',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'تسجيل الخروج',
      cancelButtonText: 'إلغاء'
    });
    if (ask.isConfirmed) {
      await window.auth.logout();
      sessionStorage.clear();
      window.electron.navigate('login.html');
    }
  } else {
    await goBack();
  }
}

// ─── POS Reservation Customer Autocomplete & Quick Linking ────────────────────
function loadReservationCustomersInPOS() {
  const cList = document.getElementById('posReservationCustomersList');
  const pList = document.getElementById('posReservationPhonesList');
  const sList = document.getElementById('posReserveCustomerSelect');
  if (!window.allCustomers) return;

  if (sList) {
    sList.innerHTML = '<option value="">-- اختر عميل سابق أو اكتب أدناه --</option>' +
      window.allCustomers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.phone ? ' (' + escapeHtml(c.phone) + ')' : ''}</option>`).join('');
  }
  if (cList) {
    cList.innerHTML = window.allCustomers.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.phone || '')}</option>`).join('');
  }
  if (pList) {
    pList.innerHTML = window.allCustomers.filter(c => c.phone).map(c => `<option value="${escapeHtml(c.phone)}">${escapeHtml(c.name)}</option>`).join('');
  }
}

function onSelectExistingCustomerInPOS(custId) {
  if (!custId || !window.allCustomers) return;
  const c = window.allCustomers.find(x => String(x.id) === String(custId));
  if (!c) return;
  const nameInput = document.getElementById('posReserveCustomerName');
  const phoneInput = document.getElementById('posReserveCustomerPhone');
  if (nameInput) nameInput.value = c.name || '';
  if (phoneInput) phoneInput.value = c.phone || '';
}

function onReservationCustomerNameInput(val, mode) {
  if (!val || !window.allCustomers) return;
  const match = window.allCustomers.find(c => c.name.toLowerCase() === val.trim().toLowerCase());
  if (match && match.phone) {
    const phoneInput = document.getElementById('posReserveCustomerPhone');
    if (phoneInput && !phoneInput.value) {
      phoneInput.value = match.phone;
    }
  }
}

function onReservationCustomerPhoneInput(val, mode) {
  if (!val || !window.allCustomers) return;
  const cleanPhone = val.trim();
  const match = window.allCustomers.find(c => c.phone && c.phone.trim() === cleanPhone);
  if (match) {
    const nameInput = document.getElementById('posReserveCustomerName');
    if (nameInput && !nameInput.value) {
      nameInput.value = match.name;
    }
  }
}

// ─── POS Petty Expenses & Employee Advances ───────────────────────────────────
let currentPosExpenseTab = 'expense';

async function openPosExpenseAdvanceModal() {
  currentPosExpenseTab = 'expense';
  switchPosExpenseTab('expense');

  // Load expense types
  const expTypeSel = document.getElementById('posExpType');
  if (expTypeSel) {
    try {
      const res = await window.db.query('SELECT * FROM expense_types ORDER BY name', []);
      if (res.success && res.data.length > 0) {
        expTypeSel.innerHTML = res.data.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
      } else {
        expTypeSel.innerHTML = `
          <option value="1">نثريات كافيه</option>
          <option value="2">شراء خامات يومية (نعناع، لبن، ثلج، بن)</option>
          <option value="3">صيانة ونظافة</option>
          <option value="4">إكراميات ونقل</option>
        `;
      }
    } catch(e) {
      expTypeSel.innerHTML = `<option value="1">نثريات كافيه</option>`;
    }
  }

  // Load active employees for advances
  const advEmpSel = document.getElementById('posAdvEmp');
  if (advEmpSel) {
    try {
      const empRes = await window.db.query('SELECT id, name FROM employees WHERE is_active = 1 ORDER BY name', []);
      if (empRes.success && empRes.data) {
        advEmpSel.innerHTML = '<option value="">اختر الموظف</option>' +
          empRes.data.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
      }
    } catch(e) {}
  }

  // Clear inputs
  const expAmt = document.getElementById('posExpAmount');
  const expDesc = document.getElementById('posExpDesc');
  const advAmt = document.getElementById('posAdvAmount');
  const advNotes = document.getElementById('posAdvNotes');
  if (expAmt) expAmt.value = '';
  if (expDesc) expDesc.value = '';
  if (advAmt) advAmt.value = '';
  if (advNotes) advNotes.value = '';

  openModal('posExpenseAdvanceModal');
  setTimeout(() => { if (expAmt) expAmt.focus(); }, 150);
}

function switchPosExpenseTab(tab) {
  currentPosExpenseTab = tab;
  const expForm = document.getElementById('posFormExpense');
  const advForm = document.getElementById('posFormAdvance');
  const expBtn = document.getElementById('posTabExpenseBtn');
  const advBtn = document.getElementById('posTabAdvanceBtn');

  if (tab === 'expense') {
    if (expForm) expForm.style.display = 'block';
    if (advForm) advForm.style.display = 'none';
    if (expBtn) {
      expBtn.style.background = '#FFFFFF';
      expBtn.style.color = '#FF5B22';
      expBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
    }
    if (advBtn) {
      advBtn.style.background = 'transparent';
      advBtn.style.color = '#64748B';
      advBtn.style.boxShadow = 'none';
    }
    setTimeout(() => document.getElementById('posExpAmount')?.focus(), 100);
  } else {
    if (expForm) expForm.style.display = 'none';
    if (advForm) advForm.style.display = 'block';
    if (expBtn) {
      expBtn.style.background = 'transparent';
      expBtn.style.color = '#64748B';
      expBtn.style.boxShadow = 'none';
    }
    if (advBtn) {
      advBtn.style.background = '#FFFFFF';
      advBtn.style.color = '#FF5B22';
      advBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
    }
    setTimeout(() => document.getElementById('posAdvAmount')?.focus(), 100);
  }
}

async function savePosExpenseOrAdvance() {
  const shiftId = sessionStorage.getItem('photoStudio_shiftId');
  const empId = sessionStorage.getItem('photoStudio_employeeId');
  const today = getLocalISODate();
  const time = new Date().toTimeString().slice(0, 5);

  if (currentPosExpenseTab === 'expense') {
    const typeSel = document.getElementById('posExpType');
    const typeId = typeSel ? typeSel.value : null;
    const typeName = typeSel && typeSel.selectedIndex >= 0 ? typeSel.options[typeSel.selectedIndex].text : 'نثريات';
    const amount = parseFloat(document.getElementById('posExpAmount')?.value) || 0;
    const desc = document.getElementById('posExpDesc')?.value.trim() || '';
    const source = document.getElementById('posExpSource')?.value || 'الخزينة';

    if (amount <= 0) {
      showToast('يرجى إدخال مبلغ المصروف بشكل صحيح', 'warning');
      return;
    }

    try {
      const res = await window.db.run(
        'INSERT INTO expenses (type_id, type_name, amount, description, employee_id, payment_source, date, time, shift_id) VALUES (?,?,?,?,?,?,?,?,?)',
        [typeId, typeName, amount, desc, empId || null, source, today, time, shiftId ? parseInt(shiftId) : null]
      );
      if (res && res.success) {
        await window.db.addTreasuryEntry('مصروف', `${typeName}: ${desc || 'مصروف من نقطة البيع'}`, amount, source);
        closeModal('posExpenseAdvanceModal');
        showToast(`تم تسجيل المصروف (${fmt(amount)} ج.م) وخصمه من الدرج بنجاح ✓`, 'success');
      } else {
        showToast('فشل تسجيل المصروف: ' + (res?.error || ''), 'error');
      }
    } catch(err) {
      showToast('خطأ: ' + err.message, 'error');
    }
  } else {
    // Advance
    const advEmpSel = document.getElementById('posAdvEmp');
    const targetEmpId = advEmpSel ? parseInt(advEmpSel.value) : null;
    const empName = advEmpSel && advEmpSel.selectedIndex >= 0 ? advEmpSel.options[advEmpSel.selectedIndex].text : '';
    const amount = parseFloat(document.getElementById('posAdvAmount')?.value) || 0;
    const notes = document.getElementById('posAdvNotes')?.value.trim() || '';
    const source = document.getElementById('posAdvSource')?.value || 'الخزينة';

    if (!targetEmpId) {
      showToast('يرجى اختيار الموظف المستلف', 'warning');
      return;
    }
    if (amount <= 0) {
      showToast('يرجى إدخال مبلغ السلفة بشكل صحيح', 'warning');
      return;
    }

    try {
      const res = await window.db.run(
        'INSERT INTO advances (employee_id, amount, notes, date) VALUES (?,?,?,?)',
        [targetEmpId, amount, notes, today]
      );
      if (res && res.success) {
        await window.db.addTreasuryEntry('سلفة', `سلفة موظف: ${empName}${notes ? ' - ' + notes : ''} [${source}]`, amount, source);
        closeModal('posExpenseAdvanceModal');
        showToast(`تم تسجيل سلفة (${fmt(amount)} ج.م) للموظف ${empName} وخصمها من ${source === 'الخزينة' ? 'درج الكاشير' : source} ✓`, 'success');
      } else {
        showToast('فشل تسجيل السلفة: ' + (res?.error || ''), 'error');
      }
    } catch(err) {
      showToast('خطأ: ' + err.message, 'error');
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ─── LIVE QR MENU ORDERS INTEGRATION (استقبال وموافقة طلبات المنيو الإلكتروني)
// ══════════════════════════════════════════════════════════════════════════════

let _lastQrPendingCount = 0;
let _cachedQrOrders = [];
let _qrMonitorInterval = null;

function playQrOrderChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Elegant 3-chord sequence (G5 -> C6 -> E6)
    [
      { freq: 783.99, delay: 0, dur: 0.25 },
      { freq: 1046.50, delay: 0.12, dur: 0.28 },
      { freq: 1318.51, delay: 0.24, dur: 0.55 }
    ].forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, now + note.delay);
      gain.gain.setValueAtTime(0, now + note.delay);
      gain.gain.linearRampToValueAtTime(0.8, now + note.delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.delay + note.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.delay);
      osc.stop(now + note.delay + note.dur);
    });
  } catch (e) {
    console.warn('QR chime audio failed:', e);
  }
}

async function checkPendingQrOrders() {
  try {
    if (!window.qrOrders || typeof window.qrOrders.getPending !== 'function') return;
    const res = await window.qrOrders.getPending();
    if (!res || !res.success) return;
    const orders = res.data || [];
    _cachedQrOrders = orders;
    const count = orders.length;

    const badge = document.getElementById('qrPendingBadge');
    const btn = document.getElementById('btnQrOrdersBadge');
    const modalBadge = document.getElementById('qrModalCountBadge');

    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (btn) {
      if (count > 0) {
        btn.classList.add('has-pending');
      } else {
        btn.classList.remove('has-pending');
      }
    }

    if (modalBadge) {
      modalBadge.textContent = `${count} طلبات معلقة`;
    }

    // New order alert sound & notification
    if (count > _lastQrPendingCount) {
      playQrOrderChime();
      const latest = orders[0];
      const tableText = latest ? (latest.table_name || `ترابيزة ${latest.table_id || ''}`) : '';
      showToast(`🔔 طلب زبون جديد وارد عبر المنيو QR (${tableText})!`, 'info');
      // If modal is open, refresh its content live
      const modal = document.getElementById('posQrOrdersModal');
      if (modal && modal.classList.contains('active')) {
        renderQrOrdersList(orders);
      }
    }

    _lastQrPendingCount = count;
  } catch (err) {
    console.error('Error polling QR orders:', err);
  }
}

async function openQrOrdersModal() {
  openModal('posQrOrdersModal');
  await fetchAndRenderQrOrders();
}

async function fetchAndRenderQrOrders() {
  const body = document.getElementById('posQrOrdersBody');
  if (body) {
    body.innerHTML = `
      <div style="text-align:center; padding:36px; color:#94A3B8;">
        <div style="display:inline-block; width:28px; height:28px; border:2px solid rgba(255,255,255,0.1); border-top-color:#FF8F6B; border-radius:50%; animation:spin 0.8s linear infinite; margin-bottom:12px;"></div>
        <div style="font-size:13px; font-weight:700; color:#E2E8F0;">جاري تحميل طلبات الـ QR الواردة...</div>
      </div>
    `;
  }
  try {
    const res = await window.qrOrders.getPending();
    const orders = (res && res.success) ? (res.data || []) : [];
    _cachedQrOrders = orders;
    renderQrOrdersList(orders);
    
    // Update badge counters
    const badge = document.getElementById('qrPendingBadge');
    const btn = document.getElementById('btnQrOrdersBadge');
    const modalBadge = document.getElementById('qrModalCountBadge');
    if (badge) {
      if (orders.length > 0) {
        badge.textContent = orders.length;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
    if (btn) {
      if (orders.length > 0) btn.classList.add('has-pending');
      else btn.classList.remove('has-pending');
    }
    if (modalBadge) modalBadge.textContent = `${orders.length} معلقة`;
    _lastQrPendingCount = orders.length;
  } catch (err) {
    if (body) {
      body.innerHTML = `<div style="text-align:center; padding:24px; color:#F87171;">تعذر تحميل الطلبات: ${escapeHtml(err.message)}</div>`;
    }
  }
}

function renderQrOrdersList(orders) {
  const body = document.getElementById('posQrOrdersBody');
  if (!body) return;

  if (!orders || orders.length === 0) {
    body.innerHTML = `
      <div style="text-align:center; padding:48px 20px; background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.08); border-radius:14px;">
        <div style="width:52px; height:52px; border-radius:12px; background:#1C1E24; border:1px solid rgba(255,255,255,0.08); color:#64748B; display:flex; align-items:center; justify-content:center; margin:0 auto 14px;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
        </div>
        <div style="font-size:14.5px; font-weight:800; color:#F1F5F9; margin-bottom:4px;">
          لا توجد طلبات معلقة حالياً
        </div>
        <div style="font-size:12px; color:#94A3B8; max-width:340px; margin:0 auto; line-height:1.5;">
          أي طلب يتم إرساله من هواتف الزبائن على الطاولات سيصل فوراً هنا عبر البث المباشر (SSE) مع تنبيه صوتي.
        </div>
      </div>
    `;
    return;
  }

  body.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      ${orders.map(order => {
        const tableName = order.table_name || (order.table_id ? `طاولة ${order.table_id}` : 'طاولة غير محددة');
        const items = order.items || [];
        const timeStr = order.created_at ? new Date(order.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';

        return `
          <div style="background:#17181D; border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:16px; box-shadow:0 4px 18px rgba(0,0,0,0.25);">
            <!-- Order Header Strip -->
            <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:12px; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="background:rgba(224,106,59,0.18); color:#FF9B79; border:1px solid rgba(224,106,59,0.32); font-weight:800; font-size:12px; padding:3px 12px; border-radius:6px;">
                  ${escapeHtml(tableName)}
                </span>
                <span style="font-family:monospace; font-weight:800; font-size:13px; color:#CBD5E1;">
                  #${escapeHtml(order.order_number)}
                </span>
                <span style="font-size:11.5px; color:#64748B; font-variant-numeric:tabular-nums;">
                  ${escapeHtml(timeStr)}
                </span>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${order.customer_name ? `<span style="font-size:11.5px; font-weight:700; color:#E2E8F0; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); padding:3px 10px; border-radius:6px;">${escapeHtml(order.customer_name)}</span>` : ''}
                ${order.customer_phone ? `<span style="font-size:11.5px; font-weight:700; color:#38BDF8; background:rgba(56,189,248,0.1); border:1px solid rgba(56,189,248,0.2); padding:3px 10px; border-radius:6px; font-family:monospace;">${escapeHtml(order.customer_phone)}</span>` : ''}
              </div>
            </div>

            <!-- Items List Table -->
            <div style="margin-bottom:12px; border:1px solid rgba(255,255,255,0.06); border-radius:8px; overflow:hidden;">
              <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
                <thead>
                  <tr style="background:#1E2026; color:#94A3B8; text-align:right; border-bottom:1px solid rgba(255,255,255,0.07);">
                    <th style="padding:8px 12px; font-weight:700;">الصنف والتفاصيل</th>
                    <th style="padding:8px 12px; font-weight:700; text-align:center;">الكمية</th>
                    <th style="padding:8px 12px; font-weight:700; text-align:left;">السعر</th>
                    <th style="padding:8px 12px; font-weight:700; text-align:left;">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map(it => {
                    let cupBadge = '';
                    if (it.notes && it.notes.includes('كوب كرتون')) {
                      cupBadge = '<span style="background:rgba(245,158,11,0.12); color:#FCD34D; border:1px solid rgba(245,158,11,0.22); padding:1px 7px; border-radius:4px; font-size:10px; font-weight:700; margin-right:4px;">كوب كرتون</span>';
                    } else if (it.notes && it.notes.includes('كوب بلاستيك')) {
                      cupBadge = '<span style="background:rgba(56,189,248,0.12); color:#38BDF8; border:1px solid rgba(56,189,248,0.22); padding:1px 7px; border-radius:4px; font-size:10px; font-weight:700; margin-right:4px;">كوب بلاستيك</span>';
                    } else if (it.notes && it.notes.includes('كوب زجاجي')) {
                      cupBadge = '<span style="background:rgba(16,185,129,0.12); color:#34D399; border:1px solid rgba(16,185,129,0.22); padding:1px 7px; border-radius:4px; font-size:10px; font-weight:700; margin-right:4px;">زجاجي للصالة</span>';
                    }
                    return `
                      <tr style="border-bottom:1px solid rgba(255,255,255,0.04); background:rgba(0,0,0,0.1);">
                        <td style="padding:9px 12px; font-weight:700; color:#FFFFFF;">
                          <div style="display:flex; align-items:center; gap:6px;">
                            <span>${escapeHtml(it.service_name)}</span>
                            ${cupBadge}
                          </div>
                          ${it.notes ? `<div style="font-size:11px; color:#FDBA74; font-weight:600; margin-top:2px;">• ${escapeHtml(it.notes)}</div>` : ''}
                        </td>
                        <td style="padding:9px 12px; text-align:center;">
                          <span style="font-weight:800; color:#FFFFFF; font-size:13px; background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:4px; font-variant-numeric:tabular-nums;">${it.quantity}</span>
                        </td>
                        <td style="padding:9px 12px; text-align:left; color:#94A3B8; font-size:12px; font-variant-numeric:tabular-nums;">
                          ${fmt(it.price)} ج.م
                        </td>
                        <td style="padding:9px 12px; text-align:left; font-weight:800; color:#FFFFFF; font-size:13px; font-variant-numeric:tabular-nums;">
                          ${fmt(it.total || (it.price * it.quantity))} ج.م
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- Notes if any -->
            ${order.notes ? `
              <div style="background:#1D1F26; border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:8px 12px; margin-bottom:12px; font-size:11.5px; color:#E2E8F0;">
                <strong style="color:#FF8F6B;">ملاحظة العميل:</strong> ${escapeHtml(order.notes)}
              </div>
            ` : ''}

            <!-- Bottom Row: Total & Action Buttons -->
            <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; flex-wrap:wrap; gap:12px;">
              <div style="display:flex; align-items:baseline; gap:6px;">
                <span style="font-size:12.5px; font-weight:700; color:#94A3B8;">الإجمالي المطلوب:</span>
                <span style="font-size:19px; font-weight:900; color:#FF9B79; font-variant-numeric:tabular-nums;">${fmt(order.total)} ج.م</span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <button type="button" onclick="rejectQrOrder(${order.id})" style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.22); color:#F87171; font-weight:700; font-size:12px; padding:7px 14px; border-radius:8px; cursor:pointer; transition:all 0.15s ease;">
                  رفض الطلب
                </button>
                <button type="button" onclick="approveAndDispatchQrOrder(${order.id})" style="background:linear-gradient(135deg, #E06A3B 0%, #D05929 100%); border:none; color:#FFFFFF; font-weight:800; font-size:12.5px; padding:8px 18px; border-radius:8px; cursor:pointer; box-shadow:0 4px 14px rgba(224,106,59,0.3); display:inline-flex; align-items:center; gap:7px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>اعتماد وإرسال للمطبخ</span>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function approveAndDispatchQrOrder(orderId) {
  let order = _cachedQrOrders.find(o => o.id === orderId);
  if (!order) {
    const res = await window.qrOrders.getStatus(orderId);
    if (res && res.success && res.data) order = res.data;
  }
  if (!order) {
    showToast('تعذر العثور على بيانات الطلب', 'error');
    return;
  }

  try {
    // 1. Mark order as approved in QR database
    const approveRes = await window.qrOrders.approve(orderId);
    if (!approveRes || !approveRes.success) {
      showToast('تعذر تحديث حالة الطلب: ' + (approveRes?.error || ''), 'error');
      return;
    }

    // 2. Set POS to Dine-in order mode
    setOrderType('صالة');

    // 3. Switch to table & load any open invoice for that table
    if (order.table_id) {
      const tblSel = document.getElementById('posTableSelect');
      if (tblSel) {
        tblSel.value = String(order.table_id);
      }
      await onTableSelectChange();
    }

    // 4. Update customer info if entered
    if (order.customer_name) {
      const custInput = document.getElementById('customerSearchInput');
      if (custInput) custInput.value = order.customer_name;
    }

    // 5. Populate items into active POS cart
    const items = order.items || [];
    for (const qrItem of items) {
      let svc = allServices.find(s => s.id === qrItem.service_id);
      if (!svc) {
        svc = allServices.find(s => s.name.trim().toLowerCase() === qrItem.service_name.trim().toLowerCase());
      }

      const svcId = svc ? svc.id : (qrItem.service_id || null);
      const catName = svc ? (svc.category_name || '') : '';
      const barcode = svc ? (svc.barcode || '') : '';
      const price = parseFloat(qrItem.price) || (svc ? svc.price : 0);
      const qty = parseInt(qrItem.quantity) || 1;
      const notes = qrItem.notes || '';

      invoiceItems.push({
        service_id: svcId,
        category_name: catName,
        service_name: qrItem.service_name,
        barcode: barcode,
        sell_price: price,
        quantity: qty,
        item_discount: 0,
        total: price * qty,
        notes: notes,
        sent_qty: 0 // Unsent so sendOrderToKitchen will print it
      });
    }

    renderItemsTable();
    recalcTotals();

    // 6. Automatically dispatch order to kitchen printer
    await sendOrderToKitchen();

    // 7. Show calm, refined notification & close modal
    closeModal('posQrOrdersModal');
    playQrOrderChime();
    showToast(`تم اعتماد طلب ${order.table_name || order.order_number} وإرسال البون للمطبخ بنجاح ✓`, 'success');

    // Refresh pending count
    await checkPendingQrOrders();
  } catch (err) {
    console.error('Error approving QR order:', err);
    showToast('حدث خطأ أثناء معالجة الطلب: ' + err.message, 'error');
  }
}

async function rejectQrOrder(orderId) {
  const result = await Swal.fire({
    title: 'رفض طلب الـ QR',
    text: 'يرجى كتابة سبب الرفض لتوضيحه للزبون على شاشته:',
    input: 'text',
    inputPlaceholder: 'مثال: الصنف غير متوفر حالياً / يرجى مناداة الويتر',
    inputValue: 'الصنف غير متوفر حالياً، يرجى طلب صنف آخر',
    showCancelButton: true,
    confirmButtonColor: '#EF4444',
    cancelButtonColor: '#94A3B8',
    confirmButtonText: 'تأكيد الرفض',
    cancelButtonText: 'إلغاء'
  });

  if (!result.isConfirmed) return;
  const reason = (result.value || '').trim() || 'تم إلغاء الطلب من الكاشير';

  try {
    const res = await window.qrOrders.reject(orderId, reason);
    if (res && res.success) {
      showToast('تم رفض الطلب وإبلاغ العميل ✓', 'info');
      await fetchAndRenderQrOrders();
    } else {
      showToast('تعذر رفض الطلب: ' + (res?.error || ''), 'error');
    }
  } catch (err) {
    showToast('خطأ: ' + err.message, 'error');
  }
}

let _posSseSource = null;

function setupPosRealtimeSSE() {
  if (_posSseSource) {
    try { _posSseSource.close(); } catch(e) {}
    _posSseSource = null;
  }

  try {
    _posSseSource = new EventSource('/api/realtime/stream?client=pos');

    _posSseSource.addEventListener('new_order', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[POS RealTime SSE] Incoming QR order received instantly:', data);
        playQrOrderChime();
        showToast(`🔔 طلب جديد وارد عبر المنيو QR (${data.table_name || 'طاولة'})!`, 'info');
        checkPendingQrOrders();
        
        const modal = document.getElementById('posQrOrdersModal');
        if (modal && modal.classList.contains('active')) {
          fetchAndRenderQrOrders();
        }
      } catch(err) {
        console.error('[POS SSE Parse Error]', err);
      }
    });

    _posSseSource.addEventListener('order_status_changed', (e) => {
      try {
        checkPendingQrOrders();
        const modal = document.getElementById('posQrOrdersModal');
        if (modal && modal.classList.contains('active')) {
          fetchAndRenderQrOrders();
        }
      } catch(err) {}
    });

    _posSseSource.onerror = () => {
      // Native browser auto-reconnects
    };
  } catch (err) {
    console.warn('[POS SSE Setup Failed]', err);
  }
}

init().then(() => {
  // Start Real-Time push listener only if QR menu is enabled in settings
  if (settings.enable_qr_menu === undefined || Number(settings.enable_qr_menu) !== 0) {
    checkPendingQrOrders();
    setupPosRealtimeSSE();
  } else {
    const qrBtn = document.getElementById('btnQrOrdersBadge');
    if (qrBtn) qrBtn.style.setProperty('display', 'none', 'important');
  }
});

// ─── Quit Confirmation ────────────────────────────────────────────────────────
if (window.electron && window.electron.onConfirmBackupBeforeQuit) {
  window.electron.onConfirmBackupBeforeQuit(() => {
  Swal.fire({
    title: 'إغلاق البرنامج',
    html: `
      <p style="font-size:14px;font-weight:600;margin-bottom:8px;">هل تريد إنشاء نسخة احتياطية قبل الخروج؟</p>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:16px;">
        <button class="btn btn-primary" onclick="Swal.close(); sendDailyReportAndQuit();">إرسال التقرير وإنهاء</button>
        <button class="btn btn-success" onclick="Swal.close(); window.electron.quitWithBackup();">نسخ وخروج</button>
        <button class="btn btn-danger" onclick="Swal.close(); window.electron.quitWithoutBackup();">خروج بدون نسخة</button>
        <button class="btn btn-outline" onclick="Swal.close(); window.electron.cancelQuit();">إلغاء</button>
      </div>
    `,
    showConfirmButton: false,
    allowOutsideClick: false
  });
  });
}