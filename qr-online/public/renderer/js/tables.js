'use strict';

let allTables = [];
let currentStatusFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  enforceAdminUI();
  await loadShopName();
  await loadTables();
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadShopName() {
  try {
    const res = await window.db.getSettings();
    if (res?.success && res.data) {
      if (res.data.company_name) {
        const el = document.getElementById('sidebarShopName');
        if (el) el.textContent = res.data.company_name;
      }
      const qrBtn = document.getElementById('btnTableQrModal');
      if (qrBtn) {
        if (res.data.enable_qr_menu !== undefined && Number(res.data.enable_qr_menu) === 0) {
          qrBtn.style.setProperty('display', 'none', 'important');
        } else {
          qrBtn.style.removeProperty('display');
        }
      }
    }
  } catch (e) {}
}

async function loadTables() {
  try {
    let loaded = false;
    if (window.tables && typeof window.tables.list === 'function') {
      const res = await window.tables.list();
      if (res && res.success && Array.isArray(res.data)) {
        allTables = res.data;
        loaded = true;
      }
    }
    if (!loaded && window.db && typeof window.db.query === 'function') {
      const res = await window.db.query(`
        SELECT t.*,
               i.id as active_invoice_id,
               i.invoice_number as active_invoice_number,
               i.net_total as active_invoice_total,
               c.name as customer_name
        FROM tables t
        LEFT JOIN invoices i ON i.id = (
          SELECT id FROM invoices 
          WHERE table_id = t.id AND status IN ('مفتوحة', 'مرسلة للمطبخ') 
          ORDER BY id DESC LIMIT 1
        )
        LEFT JOIN customers c ON c.id = i.customer_id
        WHERE t.is_active = 1
        ORDER BY t.section, t.name
      `, []);
      if (res && res.success && Array.isArray(res.data)) {
        allTables = res.data;
        loaded = true;
      }
    }
    if (!loaded) {
      allTables = [];
    }
  } catch (err) {
    console.warn('loadTables notice:', err.message);
    allTables = [];
  }

  updateSectionFilterOptions();
  updateCounts();
  renderTables();
}

function updateSectionFilterOptions() {
  const select = document.getElementById('sectionFilter');
  if (!select) return;
  const currentVal = select.value;
  const sections = [...new Set(allTables.map(t => t.section).filter(Boolean))];
  
  select.innerHTML = '<option value="">جميع الصالات / الأقسام</option>';
  sections.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  if (currentVal && sections.includes(currentVal)) {
    select.value = currentVal;
  }
}

function getEffectiveStatus(t) {
  if (t.active_invoice_id || t.status === 'مشغولة') return 'مشغولة';
  if (t.status === 'محجوزة' || t.reservation_name) return 'محجوزة';
  return 'فاضية';
}

function updateCounts() {
  const total = allTables.length;
  const empty = allTables.filter(t => getEffectiveStatus(t) === 'فاضية').length;
  const busy = allTables.filter(t => getEffectiveStatus(t) === 'مشغولة').length;
  const reserved = allTables.filter(t => getEffectiveStatus(t) === 'محجوزة').length;

  const elAll = document.getElementById('countAll');
  const elEmpty = document.getElementById('countEmpty');
  const elBusy = document.getElementById('countBusy');
  const elReserved = document.getElementById('countReserved');

  if (elAll) elAll.textContent = total;
  if (elEmpty) elEmpty.textContent = empty;
  if (elBusy) elBusy.textContent = busy;
  if (elReserved) elReserved.textContent = reserved;
}

function filterStatus(status) {
  currentStatusFilter = status;
  document.querySelectorAll('.tab-segment').forEach(btn => {
    if (btn.getAttribute('data-status') === status) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderTables();
}

function renderTables() {
  const container = document.getElementById('tablesGrid');
  if (!container) return;

  const section = document.getElementById('sectionFilter')?.value || '';
  const search = document.getElementById('searchTable')?.value.trim().toLowerCase() || '';

  let filtered = allTables.filter(t => {
    const eff = getEffectiveStatus(t);
    if (currentStatusFilter !== 'all' && eff !== currentStatusFilter) return false;
    if (section && t.section !== section) return false;
    if (search && !t.name.toLowerCase().includes(search)) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px; color:var(--text-muted);">
        <div style="width:48px; height:48px; border-radius:12px; background:#F5EFEB; margin:0 auto 12px; display:flex; align-items:center; justify-content:center; color:#78716C;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div style="font-size:15px; font-weight:800; color:#1E1B18;">لا توجد ترابيزات تطابق هذا الاختيار</div>
        <button class="btn btn-outline btn-sm" style="margin-top:14px; font-weight:700;" onclick="filterStatus('all')">عرض جميع الترابيزات</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(t => {
    const eff = getEffectiveStatus(t);
    const isBusy = eff === 'مشغولة';
    const isReserved = eff === 'محجوزة';

    const badgeClass = isBusy ? 'tbl-badge-busy' : (isReserved ? 'tbl-badge-reserved' : 'tbl-badge-empty');
    const badgeText = isBusy ? 'مشغولة' : (isReserved ? 'محجوزة' : 'متاحة');

    let bodyHTML = '';
    if (isBusy) {
      bodyHTML = `
        <div class="tbl-state-busy">
          <div class="tbl-busy-meta">
            <span class="tbl-inv-badge">#${escapeHtml(t.active_invoice_number || 'طلب')}</span>
            <span class="tbl-busy-cust">${escapeHtml(t.customer_name || 'عميل صالة')}</span>
          </div>
          <div class="tbl-busy-total">
            <span class="tbl-total-label">الحساب الحالي:</span>
            <span class="tbl-total-num">${fmt(t.active_invoice_total)} <small>ج.م</small></span>
          </div>
        </div>
      `;
    } else if (isReserved) {
      bodyHTML = `
        <div class="tbl-state-reserved">
          <div class="tbl-res-name">${escapeHtml(t.reservation_name || 'حجز مسبق')}</div>
          <div class="tbl-res-details">
            <span>${escapeHtml(t.reservation_time || 'اليوم')}</span>
            ${t.reservation_phone ? `<span>${escapeHtml(t.reservation_phone)}</span>` : ''}
          </div>
        </div>
      `;
    } else {
      bodyHTML = `
        <div class="tbl-state-available">
          <div class="tbl-seats-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <span>${t.seats || 4} مقاعد</span>
          </div>
          <span class="tbl-ready-tag">جاهزة للطلب</span>
        </div>
      `;
    }

    return `
      <div class="table-card" onclick="handleTableClick(${t.id})">
        <div class="tbl-card-head">
          <div class="tbl-title-box">
            <div class="tbl-name">${escapeHtml(t.name)}</div>
            <div class="tbl-section-tag">${escapeHtml(t.section || 'الصالة الرئيسية')}</div>
          </div>
          <span class="tbl-status-badge ${badgeClass}">${badgeText}</span>
        </div>

        <div class="tbl-card-body">
          ${bodyHTML}
        </div>

        <div class="tbl-card-footer" onclick="event.stopPropagation();">
          ${isBusy ? `
            <button type="button" class="btn-tbl-primary" onclick="openTableInPOS(${t.id}, ${t.active_invoice_id || 'null'}, '${escapeHtml(t.name)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>فتح الحساب</span>
            </button>
          ` : (isReserved ? `
            <button type="button" class="btn-tbl-primary" onclick="openNewOrderForTable(${t.id}, '${escapeHtml(t.name)}')">بدء طلب</button>
            <button type="button" class="btn-tbl-subtle" onclick="toggleReservation(${t.id}, 'فاضية')">إلغاء</button>
          ` : `
            <button type="button" class="btn-tbl-primary" onclick="openNewOrderForTable(${t.id}, '${escapeHtml(t.name)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>طلب جديد</span>
            </button>
            <button type="button" class="btn-tbl-subtle" onclick="openReserveModal(${t.id}, '${escapeHtml(t.name)}')">حجز</button>
          `)}
          <button type="button" class="btn-tbl-icon" onclick="editTable(${JSON.stringify(t).replace(/"/g, '&quot;')})" title="تعديل بيانات الترابيزة">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function handleTableClick(tableId) {
  const table = allTables.find(t => t.id === tableId);
  if (!table) return;

  if (table.status === 'مشغولة' && table.active_invoice_id) {
    openTableInPOS(table.id, table.active_invoice_id, table.name);
  } else {
    openNewOrderForTable(table.id, table.name);
  }
}

function openTableInPOS(tableId, invoiceId, tableName) {
  sessionStorage.setItem('pos_active_table_id', tableId);
  sessionStorage.setItem('pos_active_table_name', tableName);
  if (invoiceId) {
    sessionStorage.setItem('pos_resume_invoice_id', invoiceId);
  } else {
    sessionStorage.removeItem('pos_resume_invoice_id');
  }
  navigate('pos-invoice.html');
}

function openNewOrderForTable(tableId, tableName) {
  sessionStorage.setItem('pos_active_table_id', tableId);
  sessionStorage.setItem('pos_active_table_name', tableName);
  sessionStorage.removeItem('pos_resume_invoice_id');
  navigate('pos-invoice.html');
}

let allReservationCustomers = [];

async function loadReservationCustomers(mode = 'tables') {
  try {
    const res = await window.db.query('SELECT id, name, phone FROM customers ORDER BY name ASC', []);
    allReservationCustomers = res?.success && res.data ? res.data : [];
    
    const selectEl = document.getElementById(mode === 'pos' ? 'posReserveCustomerSelect' : 'reserveCustomerSelect');
    const nameListEl = document.getElementById(mode === 'pos' ? 'posReservationCustomersList' : 'tableReservationCustomersList');
    const phoneListEl = document.getElementById(mode === 'pos' ? 'posReservationPhonesList' : 'tableReservationPhonesList');

    if (selectEl) {
      selectEl.innerHTML = '<option value="">-- اختر من قائمة العملاء أو اكتب بيانات جديدة بالأسفل --</option>' +
        allReservationCustomers
          .map(c => `<option value="${c.id}" data-name="${escapeHtml(c.name)}" data-phone="${escapeHtml(c.phone || '')}">${escapeHtml(c.name)}${c.phone ? ' (' + escapeHtml(c.phone) + ')' : ''}</option>`)
          .join('');
    }

    if (nameListEl) {
      nameListEl.innerHTML = allReservationCustomers
        .filter(c => c.name)
        .map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.phone || '')}</option>`)
        .join('');
    }
    if (phoneListEl) {
      phoneListEl.innerHTML = allReservationCustomers
        .filter(c => c.phone)
        .map(c => `<option value="${escapeHtml(c.phone)}">${escapeHtml(c.name || '')}</option>`)
        .join('');
    }
  } catch (e) {
    console.warn('Failed to load reservation customers:', e);
  }
}

function onSelectExistingCustomer(custId, mode = 'tables') {
  if (!custId) return;
  const c = allReservationCustomers.find(x => String(x.id) === String(custId));
  if (!c) return;

  const nameInput = document.getElementById(mode === 'pos' ? 'posReserveCustomerName' : 'reserveCustomerName');
  const phoneInput = document.getElementById(mode === 'pos' ? 'posReserveCustomerPhone' : 'reserveCustomerPhone');

  if (nameInput) nameInput.value = c.name || '';
  if (phoneInput) phoneInput.value = c.phone || '';
}

function onReservationCustomerNameInput(val, mode = 'tables') {
  const match = allReservationCustomers.find(c => c.name && c.name.trim().toLowerCase() === val.trim().toLowerCase());
  if (match && match.phone) {
    const phoneInput = document.getElementById(mode === 'pos' ? 'posReserveCustomerPhone' : 'reserveCustomerPhone');
    if (phoneInput) phoneInput.value = match.phone;
  }
}

function onReservationCustomerPhoneInput(val, mode = 'tables') {
  const match = allReservationCustomers.find(c => c.phone && c.phone.trim() === val.trim());
  if (match && match.name) {
    const nameInput = document.getElementById(mode === 'pos' ? 'posReserveCustomerName' : 'reserveCustomerName');
    if (nameInput) nameInput.value = match.name;
  }
}

function openReserveModal(tableId, tableName) {
  document.getElementById('reserveTableId').value = tableId;
  document.getElementById('reserveTableName').value = tableName;
  document.getElementById('reserveModalTitle').textContent = `حجز ${tableName}`;
  const sel = document.getElementById('reserveCustomerSelect');
  if (sel) sel.value = '';
  document.getElementById('reserveCustomerName').value = '';
  document.getElementById('reserveCustomerPhone').value = '';
  document.getElementById('reservePartySize').value = '2';
  
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('reserveTime').value = now.toISOString().slice(0, 16);

  loadReservationCustomers('tables');
  openModal('reserveTableModal');
  setTimeout(() => document.getElementById('reserveCustomerName').focus(), 150);
}

async function confirmReserveTable() {
  const tableId = parseInt(document.getElementById('reserveTableId').value);
  const tableName = document.getElementById('reserveTableName').value;
  const name = document.getElementById('reserveCustomerName').value.trim();
  const phone = document.getElementById('reserveCustomerPhone').value.trim();
  const time = document.getElementById('reserveTime').value;
  const partySize = parseInt(document.getElementById('reservePartySize').value) || null;

  if (!name || !phone) {
    showToast('يرجى إدخال اسم العميل ورقم الهاتف/الواتساب', 'warning');
    return;
  }

  try {
    const res = await window.tables.reserve({
      tableId,
      name,
      phone,
      time: time ? time.replace('T', ' ') : null,
      partySize
    });

    if (res?.success) {
      closeModal('reserveTableModal');
      showToast(`تم حجز ${tableName} بنجاح للعميل ${name}`, 'success');
      await loadTables();

      // Send WhatsApp confirmation
      try {
        const setRes = await window.db.getSettings();
        const shopName = setRes?.data?.company_name || 'كافيه ومطعم برو';
        const formattedTime = time ? time.replace('T', ' ') : '';
        const msg = `أهلاً ${name} ☕\nتم تأكيد حجز ${tableName} في ${shopName}${formattedTime ? ` يوم/موعد: ${formattedTime}` : ''}${partySize ? ` لعدد: ${partySize} أفراد` : ''}.\nبانتظاركم بكل سرور 🤍`;
        
        if (window.whatsapp && typeof window.whatsapp.sendTableReservation === 'function') {
          await window.whatsapp.sendTableReservation({ phone, customerName: name, tableName, reserveTime: formattedTime, partySize });
          showToast('تم إرسال رسالة تأكيد الحجز عبر الواتساب ✓', 'success');
        } else if (window.whatsapp && typeof window.whatsapp.send === 'function') {
          const waRes = await window.whatsapp.send(phone, msg);
          if (waRes?.success) {
            showToast('تم إرسال رسالة تأكيد الحجز عبر الواتساب ✓', 'success');
          } else {
            console.warn('Auto WhatsApp notice:', waRes?.error);
            showToast('تم تسجيل الحجز بنجاح (تنبيه: رسالة الواتساب تتطلب فتح تطبيق الديسكتوب ومسح QR)', 'warning');
          }
        } else {
          showToast('تم تسجيل الحجز بنجاح (خدمة الواتساب تعمل عبر تطبيق الديسكتوب)', 'info');
        }
      } catch (waErr) {
        console.warn('Auto WhatsApp confirmation notice:', waErr);
      }
    } else {
      showToast('فشل تسجيل الحجز: ' + (res?.error || ''), 'error');
    }
  } catch (err) {
    showToast('حدث خطأ أثناء الحجز: ' + err.message, 'error');
  }
}

async function toggleReservation(tableId, newStatus) {
  try {
    let prevTable = null;
    if (newStatus === 'فاضية' && allTables) {
      prevTable = allTables.find(t => t.id === tableId);
    }

    const res = await window.tables.updateStatus(tableId, newStatus);
    if (res?.success) {
      if (newStatus === 'فاضية' && prevTable && prevTable.reservation_phone) {
        try {
          const setRes = await window.db.getSettings();
          const shopName = setRes?.data?.company_name || 'كافيه ومطعم برو';
          const cancelMsg = `أهلاً ${prevTable.reservation_name || 'عميلنا العزيز'} 🤍\nنود إعلامك بأنه تم إلغاء حجز ${prevTable.name} في ${shopName}.\nنتشرف بزيارتك دائماً في أي وقت آخر ☕`;
          if (window.whatsapp && typeof window.whatsapp.sendTableCancel === 'function') {
            await window.whatsapp.sendTableCancel({ phone: prevTable.reservation_phone, customerName: prevTable.reservation_name, tableName: prevTable.name });
          } else if (window.whatsapp && typeof window.whatsapp.send === 'function') {
            await window.whatsapp.send(prevTable.reservation_phone, cancelMsg);
          }
          showToast(`تم إلغاء الحجز وإرسال إشعار الإلغاء عبر الواتساب للعميل ✓`, 'success');
        } catch (e) {
          showToast('أصبحت الترابيزة فاضية ومتاحة', 'success');
        }
      } else {
        showToast(newStatus === 'محجوزة' ? 'تم حجز الترابيزة' : 'أصبحت الترابيزة فاضية ومتاحة', 'success');
      }
      await loadTables();
    }
  } catch (e) {
    showToast('حدث خطأ أثناء تعديل حالة الحجز', 'error');
  }
}

function openTableModal(isEdit = false) {
  document.getElementById('editTableId').value = '';
  document.getElementById('tableNameInput').value = '';
  document.getElementById('tableSectionInput').value = '';
  document.getElementById('tableSeatsInput').value = '4';
  document.getElementById('tableModalTitle').textContent = 'إضافة ترابيزة جديدة';
  document.getElementById('deleteTableBtn').style.display = 'none';
  openModal('tableModal');
}

function editTable(table) {
  document.getElementById('editTableId').value = table.id;
  document.getElementById('tableNameInput').value = table.name;
  document.getElementById('tableSectionInput').value = table.section || '';
  document.getElementById('tableSeatsInput').value = table.seats || 4;
  document.getElementById('tableModalTitle').textContent = `تعديل ${table.name}`;
  document.getElementById('deleteTableBtn').style.display = 'inline-block';
  openModal('tableModal');
}

async function saveTable() {
  const name = document.getElementById('tableNameInput').value.trim();
  const section = document.getElementById('tableSectionInput').value.trim();
  const seats = parseInt(document.getElementById('tableSeatsInput').value) || 4;
  const id = document.getElementById('editTableId').value;

  if (!name) {
    showToast('يرجى إدخال اسم أو رقم الترابيزة', 'warning');
    return;
  }

  try {
    const res = await window.tables.save({
      id: id ? parseInt(id) : null,
      name,
      section,
      seats
    });

    if (res?.success) {
      closeModal('tableModal');
      showToast('تم حفظ بيانات الترابيزة بنجاح ✓', 'success');
      await loadTables();
    } else {
      showToast('خطأ: ' + (res?.error || ''), 'error');
    }
  } catch (e) {
    showToast('فشل حفظ الترابيزة', 'error');
  }
}

async function deleteCurrentTable() {
  const id = document.getElementById('editTableId').value;
  if (!id) return;

  const result = await Swal.fire({
    title: 'تأكيد الحذف',
    text: 'هل أنت متأكد من حذف هذه الترابيزة؟',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم، حذف',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#DC2626'
  });

  if (result.isConfirmed) {
    const res = await window.tables.delete(parseInt(id));
    if (res?.success) {
      closeModal('tableModal');
      showToast('تم حذف الترابيزة', 'success');
      await loadTables();
    } else {
      showToast('خطأ: ' + (res?.error || ''), 'error');
    }
  }
}

function openTransferModal() {
  const busyTables = allTables.filter(t => t.status === 'مشغولة' && t.active_invoice_id);
  const emptyTables = allTables.filter(t => t.status === 'فاضية');

  const fromSel = document.getElementById('transferFromSelect');
  const toSel = document.getElementById('transferToSelect');

  if (busyTables.length === 0) {
    showToast('لا توجد ترابيزات مشغولة حالياً لتحويلها', 'info');
    return;
  }
  if (emptyTables.length === 0) {
    showToast('لا توجد ترابيزات فاضية لنقل الطلب إليها', 'warning');
    return;
  }

  fromSel.innerHTML = busyTables.map(t => `<option value="${t.id}">${t.name} (${t.section || 'صالة'}) — فاتورة: ${t.active_invoice_number || ''} (${fmt(t.active_invoice_total)} ج)</option>`).join('');
  toSel.innerHTML = emptyTables.map(t => `<option value="${t.id}">${t.name} (${t.section || 'صالة'})</option>`).join('');

  openModal('transferModal');
}

async function confirmTransfer() {
  const fromId = parseInt(document.getElementById('transferFromSelect').value);
  const toId = parseInt(document.getElementById('transferToSelect').value);

  if (!fromId || !toId || fromId === toId) {
    showToast('يرجى اختيار ترابيزتين مختلفتين', 'warning');
    return;
  }

  try {
    const res = await window.tables.transfer(fromId, toId);
    if (res?.success) {
      closeModal('transferModal');
      showToast('تم تحويل الطلب بنجاح ✓', 'success');
      await loadTables();
    } else {
      showToast('خطأ أثناء التحويل: ' + (res?.error || ''), 'error');
    }
  } catch (e) {
    showToast('حدث خطأ أثناء تحويل الطلب', 'error');
  }
}

function openMergeModal() {
  const busyTables = allTables.filter(t => t.status === 'مشغولة' && t.active_invoice_id);

  if (busyTables.length < 2) {
    showToast('يتطلب الدمج وجود ترابيزتين مشغولتين على الأقل ولديهما طلبات نشطة', 'warning');
    return;
  }

  const fromSel = document.getElementById('mergeFromSelect');
  const toSel = document.getElementById('mergeToSelect');

  fromSel.innerHTML = busyTables.map(t => `<option value="${t.id}">${t.name} (${t.section || 'صالة'}) — فاتورة: ${t.active_invoice_number || ''} (${fmt(t.active_invoice_total)} ج)</option>`).join('');
  toSel.innerHTML = busyTables.map(t => `<option value="${t.id}">${t.name} (${t.section || 'صالة'}) — فاتورة: ${t.active_invoice_number || ''} (${fmt(t.active_invoice_total)} ج)</option>`).join('');

  if (toSel.options.length > 1) {
    toSel.selectedIndex = 1;
  }

  openModal('mergeTablesModal');
}

async function confirmMergeTables() {
  const fromId = parseInt(document.getElementById('mergeFromSelect').value);
  const toId = parseInt(document.getElementById('mergeToSelect').value);

  if (!fromId || !toId || fromId === toId) {
    showToast('يرجى اختيار ترابيزتين مختلفتين للدمج', 'warning');
    return;
  }

  const fromTable = allTables.find(t => t.id === fromId);
  const toTable = allTables.find(t => t.id === toId);

  const ask = await Swal.fire({
    title: 'تأكيد دمج الترابيزتين؟',
    html: `
      <div style="font-size:14px; line-height:1.6; text-align:right;">
        هل أنت متأكد من دمج طلب <b>${fromTable?.name}</b> في طلب <b>${toTable?.name}</b>؟<br/>
        <span style="color:#dc2626; font-size:12px;">⚠️ سيتم نقل كل الأصناف إلى فاتورة ${toTable?.name}، وتصبح ${fromTable?.name} فاضية فوراً.</span>
      </div>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'نعم، ادمج الطلبين',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#b45309'
  });

  if (!ask.isConfirmed) return;

  try {
    const res = await window.tables.merge(fromId, toId);
    if (res?.success) {
      closeModal('mergeTablesModal');
      showToast(`تم دمج الطلبين بنجاح! الإجمالي الجديد: ${fmt(res.data?.newNetTotal || 0)} ج.م ✓`, 'success');
      await loadTables();
    } else {
      showToast('خطأ أثناء الدمج: ' + (res?.error || ''), 'error');
    }
  } catch (e) {
    showToast('حدث خطأ أثناء دمج الترابيزات: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ─── TABLE QR CODE GENERATION & PRINTING (طباعة كروت وكود QR للترابيزات)
// ══════════════════════════════════════════════════════════════════════════════

let _serverInfo = { localIp: '127.0.0.1', port: 3344, menuUrl: 'http://127.0.0.1:3344/menu' };

async function openTableQrModal() {
  openModal('tableQrModal');

  // Try to query server info for local network IP
  try {
    const res = await fetch('/api/server-info');
    if (res.ok) {
      _serverInfo = await res.json();
    }
  } catch (e) {
    _serverInfo = {
      localIp: window.location.hostname || '127.0.0.1',
      port: window.location.port || '3344',
      menuUrl: `${window.location.origin}/menu`
    };
  }

  const urlDisplay = document.getElementById('qrMenuBaseUrlDisplay');
  if (urlDisplay) {
    urlDisplay.textContent = `http://${_serverInfo.localIp}:${_serverInfo.port}/menu`;
  }
  const testBtn = document.getElementById('btnTestQrMenuDirect');
  if (testBtn) {
    testBtn.href = `http://${_serverInfo.localIp}:${_serverInfo.port}/menu`;
  }

  renderTableQrCards();
}

function renderTableQrCards() {
  const container = document.getElementById('tableQrCardsGrid');
  if (!container) return;

  if (!allTables || allTables.length === 0) {
    container.innerHTML = '<div style="padding:24px; text-align:center; color:#94A3B8;">لا توجد ترابيزات مسجلة</div>';
    return;
  }

  const baseOrigin = `http://${_serverInfo.localIp}:${_serverInfo.port}`;

  container.innerHTML = allTables.map(t => {
    const tableUrl = `${baseOrigin}/menu?table_id=${t.id}&table=${encodeURIComponent(t.name)}`;
    const qrImgUrl = `/api/qr-image?text=${encodeURIComponent(tableUrl)}`;

    return `
      <div style="background:#FFFFFF; border:1.5px solid #E2E8F0; border-radius:12px; padding:16px; text-align:center; box-shadow:0 3px 10px rgba(0,0,0,0.03); display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
            <span style="font-weight:900; font-size:14px; color:#1E1B18;">${escapeHtml(t.name)}</span>
            <span style="font-size:11px; font-weight:700; color:#FF5B22; background:#FFF5F0; padding:2px 8px; border-radius:6px; border:1px solid #FED7AA;">
              ${escapeHtml(t.section || 'الصالة')}
            </span>
          </div>

          <div style="background:#FAF8F5; border:1px solid #EFE9E2; border-radius:10px; padding:12px; display:inline-block; margin-bottom:10px;">
            <img src="${qrImgUrl}" alt="QR ${escapeHtml(t.name)}" style="width:140px; height:140px; display:block; margin:0 auto; object-fit:contain;" />
          </div>

          <div style="font-size:11.5px; font-weight:700; color:#475569; margin-bottom:4px;">
            امسح الكود بكاميرا الهاتف للطلب المباشر
          </div>
          <div style="font-size:10px; color:#94A3B8; font-family:monospace; direction:ltr; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom:12px;">
            ${escapeHtml(tableUrl)}
          </div>
        </div>

        <div style="display:flex; gap:6px; margin-top:8px;">
          <a href="${tableUrl}" target="_blank" class="btn btn-outline btn-sm" style="flex:1; font-size:11px; font-weight:700; padding:5px 8px; text-decoration:none; text-align:center;">
            معاينة ↗
          </a>
          <button type="button" class="btn btn-primary btn-sm" onclick="printSingleTableQrCard(${t.id})" style="flex:1; font-size:11px; font-weight:800; padding:5px 8px;">
            طباعة الكارت
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function buildTableQrPrintCardHTML(t) {
  const baseOrigin = `http://${_serverInfo.localIp}:${_serverInfo.port}`;
  const tableUrl = `${baseOrigin}/menu?table_id=${t.id}&table=${encodeURIComponent(t.name)}`;
  const qrImgUrl = `/api/qr-image?text=${encodeURIComponent(tableUrl)}`;

  return `
    <div class="print-qr-card" style="box-sizing:border-box; border:2px dashed #475569; border-radius:12px; padding:20px; text-align:center; font-family:'Cairo', sans-serif;">
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:8px;">
        <span style="font-size:18px; font-weight:900; color:#121110;">كافيه برو • CafePro</span>
      </div>
      <div style="display:inline-block; background:#FF5B22; color:#FFFFFF; font-size:16px; font-weight:900; padding:4px 18px; border-radius:8px; margin-bottom:12px;">
        ${escapeHtml(t.name)} ${t.section ? `(${escapeHtml(t.section)})` : ''}
      </div>
      <div style="margin:8px auto; width:160px; height:160px;">
        <img src="${qrImgUrl}" alt="QR" style="width:160px; height:160px;" />
      </div>
      <div style="font-size:13px; font-weight:800; color:#1E1B18; margin-top:8px;">
        امسح الكود واطلب من هاتفك مباشرة 📱
      </div>
      <div style="font-size:11px; color:#64748B; margin-top:2px;">
        طلبك يصلك مباشرة على ترابيزتك بكل سرعة وسهولة
      </div>
    </div>
  `;
}

function printAllTableQrCards() {
  const printContainer = document.getElementById('printableQrContainer');
  if (!printContainer) return;

  printContainer.innerHTML = `
    <div style="text-align:center; margin-bottom:16px;">
      <h2 style="margin:0; font-size:18px; font-weight:900;">كروت المنيو الإلكتروني للترابيزات — CafePro</h2>
      <p style="margin:4px 0 0; font-size:12px; color:#64748B;">قم بقص الكروت وثبيتها على الطاولات أو في حوامل الأكريليك</p>
    </div>
    <div class="print-qr-grid">
      ${allTables.map(t => buildTableQrPrintCardHTML(t)).join('')}
    </div>
  `;

  setTimeout(() => {
    window.print();
  }, 300);
}

function printSingleTableQrCard(tableId) {
  const table = allTables.find(t => t.id === tableId);
  if (!table) return;

  const printContainer = document.getElementById('printableQrContainer');
  if (!printContainer) return;

  printContainer.innerHTML = `
    <div style="max-width:320px; margin:20px auto;">
      ${buildTableQrPrintCardHTML(table)}
    </div>
  `;

  setTimeout(() => {
    window.print();
  }, 300);
}
