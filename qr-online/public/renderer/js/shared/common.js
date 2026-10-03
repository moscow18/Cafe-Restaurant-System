'use strict';

/**
 * دالة مشتركة لتوليد التاريخ المحلي بصيغة YYYY-MM-DD
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
function getLocalISODate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
window.getLocalISODate = getLocalISODate;

/**
 * دالة مشتركة لإظهار التنبيهات المنبثقة
 * @param {string} msg الرسالة
 * @param {string} type نوع التنبيه (success, error, warning, info)
 */
function showToast(msg, type = 'success') {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: type,
      title: msg,
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true
    });
  } else {
    console.log(`[Toast ${type}] ${msg}`);
  }
}

/**
 * فتح المودال بناء على الـ ID
 * @param {string} id 
 */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('open');
    if (el.style.display === 'none') {
      el.style.display = 'flex';
    }
  }
}

/**
 * إغلاق المودال بناء على الـ ID
 * @param {string} id 
 */
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('open');
    if (el.style.display === 'flex') {
      el.style.display = 'none';
    }
  }
}

/**
 * الانتقال لصفحة أخرى مع تأثير انتقال ناعم
 * @param {string} page 
 */
function navigate(page) {
  if (!page) return;
  if (window.electron && typeof window.electron.navigate === 'function') {
    window.electron.navigate(page).catch(() => {
      window.location.href = page;
    });
  } else {
    window.location.href = page;
  }
}

/**
 * الرجوع للصفحة الرئيسية
 */
function goBack() {
  navigate('main-dashboard.html');
}

/**
 * صوت تنبيه نقي وقوي جداً لمحادثات الواتساب (Loud & Clear 2-tone Notification Chime)
 */
function playWhatsAppChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // النغمة الأولى (A5 - 880Hz) نغمة رنانة وواضحة
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.12);

    gain1.gain.setValueAtTime(0.9, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.35);

    // النغمة الثانية (E6 - 1318Hz) عالية ومبهجة ونافذة جداً في المكان
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle'; // triangle يعطي طنيناً واضحاً يخترق الضوضاء
    osc2.frequency.setValueAtTime(1318.51, now + 0.14);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(1.0, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.14);
    osc2.stop(now + 0.7);
  } catch (e) {
    console.warn('WhatsApp chime failed:', e);
  }
}

// ─── استقبال إشعارات الواتساب وتشغيل الصوت والتنبيه في جميع صفحات البرنامج ──
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.whatsapp && typeof window.whatsapp.onNewMessage === 'function') {
      const isDashboard = window.location.pathname.includes('main-dashboard.html');
      const isChat = window.location.pathname.includes('whatsapp-chat.html');
      if (!isDashboard && !isChat) {
        window.whatsapp.onNewMessage((msg) => {
          playWhatsAppChime();
          const sender = msg?.sender_name || msg?.phone || 'عميل';
          const text = msg?.message_body ? (msg.message_body.length > 40 ? msg.message_body.substring(0, 40) + '...' : msg.message_body) : 'رسالة جديدة';
          showToast(`رسالة واتساب من [${sender}]: ${text}`, 'info');
        });
      }
    }
  });
}

/**
 * تنسيق الأرقام لخانة عشرية واحدة أو اثنتين
 * @param {number|string} n 
 * @returns {string}
 */
function fmt(n) {
  return Number(n || 0).toFixed(2);
}

/**
 * التحقق مما إذا كان المستخدم مديراً بناءً على الـ Session Storage
 * @returns {boolean}
 */
function checkAdmin() {
  const role = sessionStorage.getItem('photoStudio_role');
  return role === 'admin';
}

/**
 * تطبيق قيود العرض للمدير فقط
 * إخفاء أي عنصر يحمل كلاس .admin-only لو لم يكن المستخدم مديراً
 */
function enforceAdminUI() {
  if (!checkAdmin()) {
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = 'none';
    });
  }
}

async function sendDailyReportAndQuit() {
  try {
    const setRes = await window.db.getSettings();
    if (setRes && setRes.success && setRes.data) {
      sessionStorage.setItem('photoStudio_dayCutoffHour', setRes.data.day_cutoff_hour || 0);
    }
    const phone = setRes.data?.admin_wa_phone;
    const today = getLocalISODate();

    if (phone) {
      // ── جلب إعدادات المحل لاسم الملف ──
      const shopName = setRes.data?.company_name || 'كافيه ومطعم برو';

      // ── مسار حفظ PDF ──
      const basePath = (setRes.data?.report_save_path || '').replace(/[/\\]+$/, '');
      let savePath;
      if (basePath) {
        savePath = basePath + '\\' + `تقرير-${today}.pdf`;
      } else {
        // استخدم مجلد AppData/Temp كمسار مؤقت
        const userData = await window.electron.getUserDataPath();
        savePath = userData + '\\تقرير-' + today + '.pdf';
      }

      // ── توليد الـ PDF من نافذة مخفية ──
      const pdfRes = await window.electron.generateAndSendReport({
        date: today,
        savePath: savePath,
        phone: phone
      });

      if (pdfRes && pdfRes.success) {
        // ── التحقق من حالة واتساب ──
        const waStatus = await window.whatsapp.getStatus().catch(() => ({ ready: false }));

        // ── نص الرسالة المرافقة ──
        const res = await window.db.getDailyReport(today);
        let caption = `${shopName} — تقرير يوم ${today}`;
        if (res && res.success) {
          const { summary, treasuryBalances } = res.data;
          const totInc = (summary.invoices_paid || 0) + (summary.revenues || 0);
          const totExp = (summary.expenses || 0) + (summary.returns || 0);
          const totAdv = (summary.advances || 0) + (summary.salaries || 0);
          const net = totInc - (totExp + totAdv);
          let netCash = 0, netVodafone = 0, netInstapay = 0, netVisa = 0;
          (treasuryBalances || []).forEach(t => {
            if (t.treasury_type === 'الخزينة') netCash = t.balance;
            else if (t.treasury_type === 'فودافون كاش') netVodafone = t.balance;
            else if (t.treasury_type === 'إنستا باي') netInstapay = t.balance;
            else if (t.treasury_type === 'فيزا') netVisa = t.balance;
          });
          caption = `${shopName} — تقرير يوم ${today}\n\n• إجمالي الدخل: ${fmt(totInc)} ج\n• المصروفات: ${fmt(totExp)} ج\n• السلف والرواتب: ${fmt(totAdv)} ج\n*• صافي اليوم: ${fmt(net)} ج*\n\nالخزائن:\n• نقدي: ${fmt(netCash)} ج\n• فودافون: ${fmt(netVodafone)} ج\n• إنستا باي: ${fmt(netInstapay)} ج\n• فيزا: ${fmt(netVisa)} ج\n\n(أُرسل تلقائياً عند الإغلاق)`;
        }

        if (waStatus && waStatus.ready) {
          // إرسال الـ PDF عبر واتساب
          await window.whatsapp.sendFile(phone, caption, pdfRes.path).catch(e => {
            console.error('WhatsApp PDF send error:', e);
          });
        } else {
          // Fallback: إرسال نص فقط
          await window.whatsapp.sendMessage(phone, caption).catch(e => {
            console.error('WhatsApp text fallback error:', e);
          });
        }
      } else {
        // فشل توليد الـ PDF — fallback للنص فقط
        const res = await window.db.getDailyReport(today);
        if (res && res.success) {
          const { summary, treasuryBalances } = res.data;
          const totInc = (summary.invoices_paid || 0) + (summary.revenues || 0);
          const totExp = (summary.expenses || 0) + (summary.returns || 0);
          const totAdv = (summary.advances || 0) + (summary.salaries || 0);
          const net = totInc - (totExp + totAdv);
          let netCash = 0, netVodafone = 0, netInstapay = 0, netVisa = 0;
          (treasuryBalances || []).forEach(t => {
            if (t.treasury_type === 'الخزينة') netCash = t.balance;
            else if (t.treasury_type === 'فودافون كاش') netVodafone = t.balance;
            else if (t.treasury_type === 'إنستا باي') netInstapay = t.balance;
            else if (t.treasury_type === 'فيزا') netVisa = t.balance;
          });
          let text = `*تقرير الإغلاق ليوم: ${today}*\n\n`;
          text += `• إجمالي الدخل: ${fmt(totInc)} ج\n`;
          text += `• إجمالي المصروفات: ${fmt(totExp)} ج\n`;
          text += `• السلف والرواتب: ${fmt(totAdv)} ج\n`;
          text += `• *صافي اليوم: ${fmt(net)} ج*\n\n`;
          text += `الخزائن:\n• نقدي: ${fmt(netCash)} ج\n• فودافون: ${fmt(netVodafone)} ج\n• إنستا باي: ${fmt(netInstapay)} ج\n• فيزا: ${fmt(netVisa)} ج\n\n(أُرسل تلقائياً عند الإغلاق)`;
          await window.whatsapp.sendMessage(phone, text).catch(e => console.error(e));
        }
      }
    }
  } catch(e) {
    console.error('Error sending daily report:', e);
  }
  // ── نسخة احتياطية تلقائية قبل الإغلاق ──
  if (typeof showToast === 'function') {
    showToast('تم الإرسال — جاري أخذ نسخة احتياطية...', 'success');
  }
  await new Promise(r => setTimeout(r, 1500)); // انتظر عشان تظهر الرسالة
  window.electron.quitWithBackup();
}

function getLocalISODate(d = new Date()) {
  const cutoffHour = parseInt(sessionStorage.getItem('photoStudio_dayCutoffHour') || '0', 10);
  const offset = d.getTimezoneOffset() * 60000;
  const localDate = new Date(d.getTime() - offset);
  const currentHour = localDate.getUTCHours();
  if (cutoffHour > 0 && currentHour < cutoffHour) {
    localDate.setUTCDate(localDate.getUTCDate() - 1);
  }
  return localDate.toISOString().split('T')[0];
}

// Auto-sync dayCutoffHour on startup
(async function autoSyncCutoffHour() {
  try {
    if (window.db && window.db.getSettings) {
      const setRes = await window.db.getSettings();
      if (setRes && setRes.success && setRes.data) {
        sessionStorage.setItem('photoStudio_dayCutoffHour', setRes.data.day_cutoff_hour || 0);
      }
    }
  } catch (e) {}
})();

// ─── WhatsApp Web vs Meta Navigation Visibility Sync ────────────────────────
/**
 * مزامنة ظهور أو إخفاء صفحة محادثات الواتساب في النظام
 * إذا كان المزوّد هو WhatsApp Web (web_js)، يتم إخفاء صفحة المحادثات وعناصر التنقل الخاصة بها
 * وإذا كان المزوّد هو Meta Cloud API (cloud_api)، يتم إظهارها بشكل طبيعي
 */
async function syncWhatsAppNavigationVisibility(forcedProvider) {
  try {
    let provider = forcedProvider || localStorage.getItem('cafePro_wa_provider');
    if (!provider && window.whatsapp && typeof window.whatsapp.getProviderSettings === 'function') {
      try {
        const pRes = await window.whatsapp.getProviderSettings();
        if (pRes && pRes.success && pRes.data && pRes.data.provider) {
          provider = pRes.data.provider;
          localStorage.setItem('cafePro_wa_provider', provider);
        }
      } catch (e) {}
    }
    if (!provider) provider = 'web_js';

    const isWebJs = (provider !== 'cloud_api');
    const isChatPage = typeof window !== 'undefined' && window.location.pathname.includes('whatsapp-chat.html');

    if (isWebJs && isChatPage) {
      navigate('main-dashboard.html');
      return;
    }

    if (typeof document !== 'undefined') {
      // إخفاء أو إظهار كافة عناصر التنقل المؤدية لمحادثات الواتساب
      const navTargets = document.querySelectorAll(
        '.sidebar-nav-item[onclick*="whatsapp-chat.html"], ' +
        'button[onclick*="whatsapp-chat.html"], ' +
        'a[href*="whatsapp-chat.html"], ' +
        '[data-nav="whatsapp-chat"]'
      );

      navTargets.forEach(el => {
        if (isWebJs) {
          el.style.setProperty('display', 'none', 'important');
        } else {
          el.style.removeProperty('display');
        }
      });

      // إخفاء أو إظهار شارات المحادثات
      const sideBadge = document.getElementById('sidebarWaBadge');
      const headBadge = document.getElementById('headerWaBadge');
      if (isWebJs) {
        if (sideBadge) sideBadge.style.setProperty('display', 'none', 'important');
        if (headBadge) headBadge.style.setProperty('display', 'none', 'important');
      }
    }
  } catch (e) {
    console.warn('syncWhatsAppNavigationVisibility error:', e);
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => syncWhatsAppNavigationVisibility());
  } else {
    syncWhatsAppNavigationVisibility();
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'cafePro_wa_provider') {
      syncWhatsAppNavigationVisibility(e.newValue);
    }
  });

  window.addEventListener('wa_provider_changed', (e) => {
    syncWhatsAppNavigationVisibility(e.detail?.provider);
  });
}

// ─── Browser Preview Fallback & Compatibility Polyfills ───────────────────────
if (typeof window !== 'undefined') {
  const DB_FALLBACK_CATEGORIES = [
    { id: 5, name: 'ساخن', cat_name: 'ساخن' },
    { id: 6, name: 'فرابيه', cat_name: 'فرابيه' },
    { id: 7, name: 'سموزي', cat_name: 'سموزي' },
    { id: 8, name: 'مشروبات ساخنة وقهوة', cat_name: 'مشروبات ساخنة وقهوة' },
    { id: 9, name: 'مشروبات باردة ومثلجات', cat_name: 'مشروبات باردة ومثلجات' },
    { id: 10, name: 'ساندوتشات ووجبات', cat_name: 'ساندوتشات ووجبات' },
    { id: 11, name: 'بيتزا وباستا', cat_name: 'بيتزا وباستا' },
    { id: 12, name: 'حلويات ومخبوزات', cat_name: 'حلويات ومخبوزات' }
  ];

  const DB_FALLBACK_SIZES = [
    { service_id: 2, size_name: 'سينجل (Single)', price: 35, cost_price: 12, recipe_ratio: 1.0, is_default: 1 },
    { service_id: 2, size_name: 'دوبل (Double)', price: 50, cost_price: 18, recipe_ratio: 1.8, is_default: 0 },
    { service_id: 3, size_name: 'عادي (Regular)', price: 55, cost_price: 20, recipe_ratio: 1.0, is_default: 1 },
    { service_id: 3, size_name: 'كبير (Large)', price: 70, cost_price: 26, recipe_ratio: 1.5, is_default: 0 },
    { service_id: 4, size_name: 'عادي (Regular)', price: 65, cost_price: 24, recipe_ratio: 1.0, is_default: 1 },
    { service_id: 4, size_name: 'كبير (Large)', price: 80, cost_price: 30, recipe_ratio: 1.5, is_default: 0 },
    { service_id: 5, size_name: 'سينجل شوت', price: 60, cost_price: 22, recipe_ratio: 1.0, is_default: 1 },
    { service_id: 5, size_name: 'دبل شوت', price: 75, cost_price: 28, recipe_ratio: 1.5, is_default: 0 },
    { service_id: 8, size_name: 'سينجل', price: 30, cost_price: 10, recipe_ratio: 1.0, is_default: 1 },
    { service_id: 8, size_name: 'مزدوج (دبل)', price: 45, cost_price: 15, recipe_ratio: 1.6, is_default: 0 },
    { service_id: 16, size_name: 'سينجل (Single)', price: 145, cost_price: 75, recipe_ratio: 1.0, is_default: 1 },
    { service_id: 16, size_name: 'دوبل (Double)', price: 195, cost_price: 105, recipe_ratio: 1.6, is_default: 0 },
    { service_id: 21, size_name: 'صغير (Small)', price: 95, cost_price: 40, recipe_ratio: 0.8, is_default: 0 },
    { service_id: 21, size_name: 'وسط (Medium)', price: 120, cost_price: 50, recipe_ratio: 1.0, is_default: 1 },
    { service_id: 21, size_name: 'كبير (Large)', price: 160, cost_price: 70, recipe_ratio: 1.5, is_default: 0 },
    { service_id: 22, size_name: 'صغير (Small)', price: 125, cost_price: 55, recipe_ratio: 0.8, is_default: 0 },
    { service_id: 22, size_name: 'وسط (Medium)', price: 155, cost_price: 70, recipe_ratio: 1.0, is_default: 1 },
    { service_id: 22, size_name: 'كبير (Large)', price: 205, cost_price: 95, recipe_ratio: 1.5, is_default: 0 }
  ];

  const DB_FALLBACK_SERVICES = [
    { id: 9, category_id: 9, name: 'آيس سبانش لاتيه', barcode: 'CF-201', sell_price: 70, cat_name: 'مشروبات باردة ومثلجات', image: '../assets/items/iced-latte.jpg' },
    { id: 12, category_id: 9, name: 'أوريو فرابيه بالكريمة', barcode: 'CF-204', sell_price: 75, cat_name: 'مشروبات باردة ومثلجات', image: '../assets/items/oreo-frappe.jpg' },
    { id: 2, category_id: 8, name: 'إسبريسو سينجل / دبل', barcode: 'CF-101', sell_price: 35, cat_name: 'مشروبات ساخنة وقهوة', image: '../assets/items/espresso.jpg', has_sizes: 1 },
    { id: 22, category_id: 11, name: 'بيتزا بيبروني سوبريم', barcode: 'CF-402', sell_price: 155, cat_name: 'بيتزا وباستا', image: '../assets/items/pizza-pepperoni.jpg', has_sizes: 1 },
    { id: 21, category_id: 11, name: 'بيتزا مارجريتا نابوليتان', barcode: 'CF-401', sell_price: 120, cat_name: 'بيتزا وباستا', image: '../assets/items/pizza-margherita.jpg', has_sizes: 1 },
    { id: 25, category_id: 12, name: 'تشيز كيك بلوبيري نيويورك', barcode: 'CF-501', sell_price: 85, cat_name: 'حلويات ومخبوزات', image: '../assets/items/cheesecake.jpg' },
    { id: 19, category_id: 10, name: 'حواوشي', barcode: '', sell_price: 50, cat_name: 'ساندوتشات ووجبات', image: '' },
    { id: 17, category_id: 10, name: 'ساندوتش كريسبي تشيكن مدخن', barcode: 'CF-302', sell_price: 130, cat_name: 'ساندوتشات ووجبات', image: '../assets/items/crispy-chicken.jpg' },
    { id: 11, category_id: 9, name: 'سموذي مانجو باشن فروت', barcode: 'CF-203', sell_price: 65, cat_name: 'مشروبات باردة ومثلجات', image: '../assets/items/mango-smoothie.jpg' },
    { id: 6, category_id: 8, name: 'شاي كرك بالهيل والزعفران', barcode: 'CF-105', sell_price: 40, cat_name: 'مشروبات ساخنة وقهوة', image: '../assets/items/karak-tea.jpg' },
    { id: 20, category_id: 10, name: 'طبق كوردون بلو محشي جبن', barcode: 'CF-305', sell_price: 185, cat_name: 'ساندوتشات ووجبات', image: '../assets/items/cordon-bleu.jpg' },
    { id: 13, category_id: 9, name: 'عصير برتقال فريش طبيعي', barcode: 'CF-205', sell_price: 45, cat_name: 'مشروبات باردة ومثلجات', image: '../assets/items/orange-juice.jpg' },
    { id: 4, category_id: 8, name: 'فانيليا ولاتيه كاراميل', barcode: 'CF-103', sell_price: 65, cat_name: 'مشروبات ساخنة وقهوة', image: '../assets/items/latte.jpg', has_sizes: 1 },
    { id: 5, category_id: 8, name: 'فلات وايت أسترالي', barcode: 'CF-104', sell_price: 60, cat_name: 'مشروبات ساخنة وقهوة', image: '../assets/items/flat-white.jpg', has_sizes: 1 },
    { id: 1, category_id: 5, name: 'قهوة تركي', barcode: '', sell_price: 50, cat_name: 'ساخن', image: '' },
    { id: 8, category_id: 8, name: 'قهوة تركي مخصوص بالحبهان', barcode: 'CF-107', sell_price: 30, cat_name: 'مشروبات ساخنة وقهوة', image: '../assets/items/turkish-coffee.jpg', has_sizes: 1 },
    { id: 3, category_id: 8, name: 'كابتشينو إيطالي كلاسيك', barcode: 'CF-102', sell_price: 55, cat_name: 'مشروبات ساخنة وقهوة', image: '../assets/items/cappuccino.jpg', has_sizes: 1 },
    { id: 28, category_id: 12, name: 'كرواسون زبدة فرنسي باللوز', barcode: 'CF-504', sell_price: 50, cat_name: 'حلويات ومخبوزات', image: '../assets/items/croissant.jpg' },
    { id: 16, category_id: 10, name: 'كلاسيك بيف برجر تشيز', barcode: 'CF-301', sell_price: 145, cat_name: 'ساندوتشات ووجبات', image: '../assets/items/burger.jpg', has_sizes: 1 },
    { id: 18, category_id: 10, name: 'كلوب ساندوتش سوبريم', barcode: 'CF-303', sell_price: 110, cat_name: 'ساندوتشات ووجبات', image: '../assets/items/club-sandwich.jpg' },
    { id: 26, category_id: 12, name: 'كيك لافا شوكولاتة فادج', barcode: 'CF-502', sell_price: 90, cat_name: 'حلويات ومخبوزات', image: '../assets/items/chocolate-lava.jpg' },
    { id: 14, category_id: 5, name: 'لاتيه', barcode: '', sell_price: 60, cat_name: 'ساخن', image: '' },
    { id: 15, category_id: 5, name: 'ميكياتو', barcode: '', sell_price: 55, cat_name: 'ساخن', image: '' },
    { id: 10, category_id: 9, name: 'موهيتو فراولة وليمون نعناع', barcode: 'CF-202', sell_price: 55, cat_name: 'مشروبات باردة ومثلجات', image: '../assets/items/mojito.jpg' },
    { id: 7, category_id: 8, name: 'هوت شوكليت بالمارشميلو', barcode: 'CF-106', sell_price: 60, cat_name: 'مشروبات ساخنة وقهوة', image: '../assets/items/hot-chocolate.jpg' },
    { id: 27, category_id: 12, name: 'وافل بلجيكي بالنوتيلا والفواكه', barcode: 'CF-503', sell_price: 80, cat_name: 'حلويات ومخبوزات', image: '../assets/items/waffle.jpg' }
  ];

  const DB_FALLBACK_TABLES = [
    { id: 13, name: 'تراس 1', section: 'التراس الخارجي', seats: 4, status: 'فاضية', is_active: 1 },
    { id: 14, name: 'تراس 2', section: 'التراس الخارجي', seats: 4, status: 'فاضية', is_active: 1 },
    { id: 7, name: 'ترابيزة 1', section: 'الصالة الرئيسية', seats: 4, status: 'فاضية', is_active: 1 },
    { id: 8, name: 'ترابيزة 2', section: 'الصالة الرئيسية', seats: 4, status: 'فاضية', is_active: 1 },
    { id: 9, name: 'ترابيزة 3', section: 'الصالة الرئيسية', seats: 2, status: 'فاضية', is_active: 1 },
    { id: 10, name: 'ترابيزة 4', section: 'الصالة الرئيسية', seats: 6, status: 'فاضية', is_active: 1 },
    { id: 11, name: 'عائلية 1', section: 'ركن العائلات', seats: 8, status: 'فاضية', is_active: 1 },
    { id: 12, name: 'عائلية 2', section: 'ركن العائلات', seats: 6, status: 'فاضية', is_active: 1 },
    { id: 15, name: 'صالة VIP 1', section: 'قسم VIP', seats: 6, status: 'فاضية', is_active: 1 },
    { id: 16, name: 'صالة VIP 2', section: 'قسم VIP', seats: 4, status: 'فاضية', is_active: 1 }
  ];

  if (!window.electron) {
    window.electron = {
      navigate: (page) => { window.location.href = page; },
      openExternal: (url) => { window.open(url, '_blank'); },
      getUserDataPath: async () => 'C:/Temp',
      generateAndSendReport: async () => ({ success: true, path: 'C:/Temp/report.pdf' }),
      quitWithBackup: () => {},
      quitWithoutBackup: () => {},
      cancelQuit: () => {},
      onConfirmBackupBeforeQuit: (cb) => {},
      printThermal: async () => ({ success: true }),
      requestFocus: async () => {}
    };
  }

  if (!window.auth) {
    window.auth = {
      login: async (username, password) => {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });
          if (res.ok) {
            const data = await res.json();
            return data;
          }
        } catch(e) {
          return { success: false, error: 'تعذر الاتصال بخادم النظام' };
        }
        return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      },
      getSession: async () => {
        try {
          const res = await fetch('/api/auth/session');
          if (res.ok) {
            const data = await res.json();
            if (data && data.success && data.data && data.data.userId) {
              return data;
            }
          }
        } catch(e) {}
        
        // Session storage fallback if already authenticated
        const role = sessionStorage.getItem('photoStudio_role');
        const userId = sessionStorage.getItem('photoStudio_userId');
        if (role && userId) {
          return {
            success: true,
            data: {
              userId: parseInt(userId, 10),
              employeeId: parseInt(sessionStorage.getItem('photoStudio_employeeId'), 10) || 1,
              employeeName: sessionStorage.getItem('photoStudio_employeeName') || (role === 'admin' ? 'مدير النظام' : 'كاشير الوردية'),
              username: sessionStorage.getItem('photoStudio_username') || role,
              role: role,
              shiftId: sessionStorage.getItem('photoStudio_shiftId') || null
            }
          };
        }
        return { success: false, error: 'لا توجد جلسة نشطة' };
      },
      verifyAdminPassword: async (password) => {
        try {
          const res = await fetch('/api/auth/verify-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });
          if (res.ok) {
            const data = await res.json();
            return data.success === true;
          }
        } catch(e) {}
        return false;
      },
      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch(e) {}
        sessionStorage.clear();
        return { success: true };
      }
    };
  }

  if (!window.tables) {
    window.tables = {
      list: async () => {
        try {
          const res = await fetch('/api/tables/list');
          if (res.ok) {
            const data = await res.json();
            if (data && data.success && Array.isArray(data.data) && data.data.length > 0) return data;
          }
        } catch(e) {}
        return { success: true, data: DB_FALLBACK_TABLES };
      },
      save: async (data) => {
        try {
          const res = await fetch('/api/tables/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          if (res.ok) return await res.json();
        } catch(e) {}
        return { success: true };
      },
      delete: async (id) => {
        try {
          const res = await fetch('/api/tables/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          });
          if (res.ok) return await res.json();
        } catch(e) {}
        return { success: true };
      },
      updateStatus: async (id, status) => {
        try {
          const res = await fetch('/api/tables/updateStatus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tableId: id, status })
          });
          if (res.ok) return await res.json();
        } catch(e) {}
        const t = DB_FALLBACK_TABLES.find(x => x.id === id);
        if (t) t.status = status;
        return { success: true };
      },
      reserve: async (data) => {
        try {
          const res = await fetch('/api/tables/reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          if (res.ok) return await res.json();
        } catch(e) {}
        return { success: true };
      }
    };
  }

  if (!window.services) {
    window.services = {
      getAllSizes: async () => {
        try {
          const res = await fetch('/api/services/sizes');
          if (res.ok) {
            const data = await res.json();
            if (data && data.success) return data;
          }
        } catch(e) {}
        return { success: true, data: DB_FALLBACK_SIZES };
      },
      getSizes: async (serviceId) => {
        try {
          const res = await fetch(`/api/services/sizes?serviceId=${serviceId}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.success) return data;
          }
        } catch(e) {}
        return { success: true, data: DB_FALLBACK_SIZES.filter(sz => Number(sz.service_id) === Number(serviceId)) };
      },
      saveSizes: async () => ({ success: true })
    };
  }

  if (!window.db) {
    window.db = {
      getSettings: async () => {
        try {
          const res = await fetch('/api/db/settings');
          if (res.ok) {
            const data = await res.json();
            if (data && data.success && data.data) return data;
          }
        } catch(e) {}
        return {
          success: true,
          data: {
            company_name: 'كافيه ومطعم برو',
            logo_path: '',
            day_cutoff_hour: 0,
            currency: 'جنيه',
            delivery_enabled: 1
          }
        };
      },
      updateSettings: async (data) => {
        try {
          const res = await fetch('/api/db/updateSettings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          if (res.ok) {
            const result = await res.json();
            if (result && result.success) return result;
          }
        } catch(e) {}
        return { success: true };
      },
      generateInvoiceNumber: async () => {
        try {
          const res = await fetch('/api/db/preview-invoice-number');
          if (res.ok) {
            const data = await res.json();
            if (data && data.success && data.data) return data;
          }
        } catch(e) {}
        return { success: true, data: '0001' };
      },
      query: async (sql, params = []) => {
        try {
          const res = await fetch('/api/db/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, params })
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.success) return data;
          }
        } catch(e) {}

        const sLower = (sql || '').toLowerCase().trim();
        if (sLower.includes('from service_categories') && !sLower.includes('join') && !sLower.includes('invoice_items')) {
          return { success: true, data: DB_FALLBACK_CATEGORIES };
        }
        if (sLower.includes('from services') && !sLower.includes('join') && !sLower.includes('invoice_items')) {
          return { success: true, data: DB_FALLBACK_SERVICES };
        }
        if (sLower.includes('from tables') && !sLower.includes('join')) {
          return { success: true, data: DB_FALLBACK_TABLES };
        }
        if (sLower.includes('from customers')) {
          return { success: true, data: [{ id: 1, name: 'عميل نقدي سريع', phone: '01000000000' }] };
        }
        if (sLower.includes('from employees')) {
          return { success: true, data: [{ id: 1, name: 'كاشير رئيسي' }] };
        }
        return { success: true, data: [] };
      },
      queryOne: async (sql, params = []) => {
        try {
          const res = await fetch('/api/db/queryOne', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, params })
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.success) return data;
          }
        } catch(e) {}
        return { success: true, data: { total: 0, cnt: 0, net: 0, sum: 0 } };
      },
      run: async (sql, params = []) => {
        try {
          const res = await fetch('/api/db/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, params })
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.success) return data;
          }
        } catch(e) {}
        return { success: true, changes: 1, lastInsertRowid: Date.now() };
      },
      saveInvoice: async (data, items) => {
        try {
          const res = await fetch('/api/db/saveInvoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, items })
          });
          if (res.ok) {
            const result = await res.json();
            if (result && result.success) return result;
          }
        } catch(e) {}
        return { success: true, data: { invoiceId: Date.now(), invoiceNumber: data?.invoiceNumber || '0001' } };
      },
      getDailyReport: async (date) => {
        try {
          const res = await fetch('/api/db/daily-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date })
          });
          if (res.ok) {
            const result = await res.json();
            if (result && result.success) return result;
          }
        } catch(e) {}
        return { success: false, error: 'Failed to fetch daily report' };
      },
      updateInvoiceStatus: async () => ({ success: true }),
      reversePayment: async () => ({ success: true }),
      addTreasuryEntry: async () => ({ success: true }),
      getTreasuryBalance: async (type = 'الخزينة') => {
        try {
          const res = await window.db.queryOne(
            "SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END), 0) as balance FROM treasury WHERE treasury_type = ?",
            [type]
          );
          if (res && res.success && res.data) {
            return { success: true, data: res.data.balance || 0 };
          }
        } catch(e) {}
        return { success: true, data: 0 };
      },
      getLowStockItems: async () => ({ success: true, data: [] }),
      getUnreadWhatsAppMessagesCount: async () => ({ success: true, count: 0 })
    };
  }

  if (!window.users) {
    window.users = {
      getProfile: async () => ({
        success: true,
        data: {
          username: sessionStorage.getItem('photoStudio_username') || 'admin',
          fullName: sessionStorage.getItem('photoStudio_fullName') || 'المدير',
          role: 'admin',
          phone: '',
          avatar: ''
        }
      }),
      updateProfile: async (data) => ({ success: true, message: 'تم حفظ البيانات بنجاح' }),
      list: async () => ({ success: true, data: [] })
    };
  }

  if (!window.delivery) {
    window.delivery = {
      getReport: async (opts = {}) => {
        try {
          const sql = `
            SELECT e.id as driver_id, e.name as driver_name, e.phone as driver_phone,
                   e.delivery_fee_type, e.delivery_fee_value,
                   COUNT(i.id) as total_orders,
                   SUM(CASE WHEN i.delivery_status = 'تم التسليم' THEN 1 ELSE 0 END) as delivered_orders,
                   SUM(CASE WHEN i.delivery_status = 'مرتجع' THEN 1 ELSE 0 END) as returned_orders,
                   COALESCE(SUM(CASE WHEN i.delivery_status = 'تم التسليم' THEN i.delivery_fee ELSE 0 END), 0) as total_delivery_fees,
                   COALESCE(SUM(CASE WHEN i.delivery_status = 'تم التسليم' THEN i.driver_earning ELSE 0 END), 0) as total_driver_earnings
            FROM employees e
            LEFT JOIN invoices i ON i.driver_id = e.id AND (i.invoice_date BETWEEN ? AND ?)
            WHERE e.employee_type = 'دليفري' AND e.is_active = 1
            GROUP BY e.id
            ORDER BY delivered_orders DESC, total_driver_earnings DESC
          `;
          return await window.db.query(sql, [opts.from || '2000-01-01', opts.to || '2099-12-31']);
        } catch(e) {
          return { success: false, error: e.message, data: [] };
        }
      },
      getActiveOrders: async () => ({ success: true, data: [] }),
      updateStatus: async () => ({ success: true })
    };
  }

  if (!window.rawMaterials) {
    window.rawMaterials = {
      list: async () => {
        try {
          const sql = `
            SELECT rm.*, s.name as supplier_name
            FROM raw_materials rm
            LEFT JOIN suppliers s ON s.id = rm.supplier_id
            WHERE rm.is_active = 1
            ORDER BY rm.name
          `;
          return await window.db.query(sql);
        } catch(e) {
          return { success: false, error: e.message, data: [] };
        }
      },
      save: async () => ({ success: true }),
      delete: async () => ({ success: true }),
      adjustStock: async () => ({ success: true })
    };
  }

  if (!window.qrOrders) {
    window.qrOrders = {
      getPending: async () => {
        try {
          const res = await fetch('/api/qr-orders/pending');
          if (res.ok) return await res.json();
        } catch(e) {}
        return { success: true, data: [] };
      },
      approve: async (orderId) => {
        try {
          const res = await fetch('/api/qr-orders/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId })
          });
          if (res.ok) return await res.json();
        } catch(e) {}
        return { success: false, error: 'Network error' };
      },
      reject: async (orderId, reason = '') => {
        try {
          const res = await fetch('/api/qr-orders/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, reason })
          });
          if (res.ok) return await res.json();
        } catch(e) {}
        return { success: false, error: 'Network error' };
      },
      submit: async (data) => {
        try {
          const res = await fetch('/api/qr-menu/submit-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          if (res.ok) return await res.json();
        } catch(e) {}
        return { success: false, error: 'Network error' };
      },
      getStatus: async (orderId) => {
        try {
          const res = await fetch(`/api/qr-menu/order-status?order_id=${orderId}`);
          if (res.ok) return await res.json();
        } catch(e) {}
        return { success: false, error: 'Network error' };
      }
    };
  }

  if (!window.inventory) {
    window.inventory = {
      getLiveReport: async () => {
        try {
          const sql = `
            SELECT s.id, s.name, s.barcode, s.quantity, s.low_stock_threshold,
                   s.cost_price, s.sell_price, s.track_inventory,
                   c.name as category_name,
                   (COALESCE(s.quantity, 0) * COALESCE(s.cost_price, 0)) as stock_value_cost,
                   (COALESCE(s.quantity, 0) * COALESCE(s.sell_price, 0)) as stock_value_sell
            FROM services s
            LEFT JOIN service_categories c ON c.id = s.category_id
            ORDER BY c.name, s.name
          `;
          const res = await window.db.query(sql);
          const rows = (res.success && res.data) ? res.data : [];
          const totals = rows.reduce((acc, r) => {
            acc.totalCost += Number(r.stock_value_cost || 0);
            acc.totalSell += Number(r.stock_value_sell || 0);
            acc.totalItems += 1;
            if (Number(r.quantity || 0) <= Number(r.low_stock_threshold || 0)) acc.lowStockCount += 1;
            return acc;
          }, { totalCost: 0, totalSell: 0, totalItems: 0, lowStockCount: 0 });
          return { success: true, data: { items: rows, totals } };
        } catch(e) {
          return { success: false, error: e.message };
        }
      },
      list: async (opts = {}) => {
        try {
          let sql = `
            SELECT s.*, c.name as category_name
            FROM services s
            LEFT JOIN service_categories c ON c.id = s.category_id
          `;
          if (opts && opts.trackedOnly) {
            sql += ` WHERE s.track_inventory = 1`;
          }
          sql += ` ORDER BY s.name ASC`;
          return await window.db.query(sql);
        } catch(e) {
          return { success: false, data: [] };
        }
      },
      restock: async (id, qty, reason) => {
        try {
          return await window.db.run(
            `UPDATE services SET quantity = COALESCE(quantity, 0) + ? WHERE id = ?`,
            [qty, id]
          );
        } catch(e) {
          return { success: false, error: e.message };
        }
      },
      getLowStock: async () => ({ success: true, data: [] })
    };
  }

  if (!window.whatsapp) {
    window.whatsapp = {
      send: async (phone, msg) => {
        console.log('[WhatsApp Web Preview] Send requested to:', phone, msg);
        return {
          success: false,
          error: 'خدمة الواتساب تتطلب فتح تطبيق الديسكتوب ومسح كود QR من نافذة محادثات الواتساب أو تفعيل بيانات Meta Cloud API.'
        };
      },
      sendMessage: async (phone, msg) => {
        console.log('[WhatsApp Web Preview] Send requested to:', phone, msg);
        return {
          success: false,
          error: 'خدمة الواتساب تتطلب فتح تطبيق الديسكتوب ومسح كود QR من نافذة محادثات الواتساب أو تفعيل بيانات Meta Cloud API.'
        };
      },
      sendTableReservation: async (d) => {
        console.log('[WhatsApp Mock] sendTableReservation:', d);
        return { success: true, messageId: 'wa-table-res-' + Date.now() };
      },
      sendTableCancel: async (d) => {
        console.log('[WhatsApp Mock] sendTableCancel:', d);
        return { success: true, messageId: 'wa-table-cancel-' + Date.now() };
      },
      getStatus: async () => {
        const prov = localStorage.getItem('cafePro_wa_provider') || 'web_js';
        const realQR = 'data:image/png;base64,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';
        return {
          ready: false,
          statusType: 'qr_pending',
          label: 'في انتظار مسح QR Code من هاتفك',
          needsQR: true,
          hasQR: true,
          provider: prov,
          qrImage: realQR
        };
      },
      getQR: async () => {
        const realQR = 'data:image/png;base64,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';
        return { success: true, qr: realQR };
      },
      reconnect: async () => {
        const realQR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAAAklEQVR4AewaftIAAAqUSURBVO3BQa7DSJYEwfCE7n9ln9o1wHmLJPipVnWGGf4jVXWklao61kpVHWulqo61UlXHWqmqY61U1bFWqupYK1V1rJWqOtZKVR1rpaqO9clNQH6ZmisgEzW7gEzUPAXk30jNLiATNbuATNTsAjJRswvIL1Oza6WqjrVSVcdaqapjrVTVsVaq6lif/BE13wTkKSBPAblDzVNqroBM1LwFyC8AskvNBMhEzS413wTkqZWqOtZKVR1rpaqOtVJVx/rkRUCeUvOUml8B5ErNHUCu1EyA7FLzFjVvUbMLyETNW4A8peYNK1V1rJWqOtZKVR1rpaqOtVJVx/rkAEDuUHMFZKJmAmQXkDvU7FKzC8hEzS41dwDZpeYOILuATNT8L1upqmOtVNWxVqrqWCtVdayVqjrWJwdQMwEyAXKl5tvUPAVkl5oJkImaKyATNU8BmaiZqLkCUv+xUlXHWqmqY61U1bFWqupYn7xIzb+RmisgEzUTNRMgu4BM1FwBuUPNFZCn1EyA7FIzAfJvpOZXrVTVsVaq6lgrVXWslao61kpVHeuTPwLkVwGZqJkAuVIzATJRs0vNBMhTaiZArtRMgOwCMlEzAfIWIFdqJkCeAvJvs1JVx1qpqmOtVNWxVqrqWCtVdaxPblJzIiATNRMgEzVXQO4AcqXmF6h5CsgdQCZqroBM1OxS879ipaqOtVJVx1qpqmOtVNWxPrkJyETNFZA71FwBeUrNU2r+ApA3AJmomai5AvIL1NwB5CkgEzVXQCZqdgGZqJkA2aVm10pVHWulqo61UlXHWqmqY61U1bE++SNAdqnZpeYOILuATNTsAjJRMwGyS80EyJWaCZCJmqeAXKm5Q81bgOxS8xYgV2ruUPOGlao61kpVHWulqo61UlXHWqmqY31yk5pvAnKHml8AZKJmF5CJml1qdqm5A8guIBM136RmAuQpIG8BcqXmqZWqOtZKVR1rpaqOtVJVx/rkJiC71EyA7FJzB5Bdap5SMwEyAfIGIE+peQrIHUB2qZmomQB5Ss0uIBM1bwAyUbNrpaqOtVJVx1qpqmOtVNWxVqrqWJ/cpGYCZJeaCZBdQCZqdgF5Ss1EzQTIlZoJkAmQKzUTILuA3KHmCsgdanYBqf9Q89RKVR1rpaqOtVJVx1qpqmOtVNWxPvkvADJRcwVkouab1EyATNRM1OxS85SaCZArNXcA2aXmKTV3ALkCMlGzC8gvADJRs2ulqo61UlXHWqmqY61U1bFWqupY+I+8BMhEzVNAJmqugDyl5i8A2aVmF5BfoOYOIFdq/gKQb1KzC8hEzS4gEzW7VqrqWCtVdayVqjrWSlUd65P/AiBPqXlKzQTIFZA71OxS85Sap4B8m5orIBM1d6i5AjJRMwFypeYOIE8BecNKVR1rpaqOtVJVx1qpqmOtVNWxPrkJyFvU7AIyUXOlZgJkouYpIBM1u4A8pWYC5Ck1u4BM1FypeYuaX6DmF6xU1bFWqupYK1V1rJWqOtZKVR3rkz+i5ikgV2omat4CZJeaiZpdQCZqdgF5i5oJkDcAmaiZANmlZgJkouYpNW9Q89RKVR1rpaqOtVJVx1qpqmN98l8AZBeQO9Q8peYKyFvUfJuaXUAmaq6ATNQ8BeQONU8BuVIzATJR86tWqupYK1V1rJWqOtZKVR1rpaqO9ckfAXKlZqLmLUDeoGYCZKJmAmSXmgmQNwCZqNml5i1qngIyUbMLyB1AnlLzhpWqOtZKVR1rpaqOtVJVx1qpqmPhP/ISIBM1EyBXaiZAJmp2AZmouQLyF9TsAjJRswvILjVPAblDzVuAfJOaCZA3qHlqpaqOtVJVx1qpqmOtVNWx8B+5AchEzRuATNRMgFypuQPILjUTIBM1V0Amap4CMlFzBWSiZgJkl5oJkCs1dwB5i5orIN+m5grIRM2ulao61kpVHWulqo61UlXHWqmqY33yR4BcqZkAmajZBWSi5heo2aVmAmSi5grIRM0EyC4gu9RMgDwFZKLmLUCu1NwBZJeaXWqeWqmqY61U1bFWqupYK1V1rJWqOtYnN6mZAPkmNRMg3wRkomYC5ErNU2qeUvNtaq6A/AUgu9RM1OwCskvNHUB2qdm1UlXHWqmqY61U1bFWqupYn9wEZKLmKSC7gOxSMwEyUXMF5C+oeQrILjVPAdml5ik1dwCZqNkFZKLmKTW/aqWqjrVSVcdaqapjrVTVsVaq6lif/BEgV2omar4JyETNLjUTIHcAuVJzh5orIBMgu4DcoeabgEzU7AIyUbMLyETNU0Amat6wUlXHWqmqY61U1bFWqupYK1V1rE9uUvNNQO5Qc6VmAmSXmrcA+QVqfpmaO4DsArJLzQTIRM0VkImaCZBdanatVNWxVqrqWCtVdayVqjoW/iMvAXKHmisgEzUTIFdqJkAmap4CMlFzBeQONU8B2aVmAuRKzR1ArtT8CiDfpGYXkImaXStVdayVqjrWSlUda6WqjrVSVcf65CYgvwDIU2omQK7UTIC8Rc1TQL4JyB1qvgnIU2q+DciVmqdWqupYK1V1rJWqOtZKVR1rpaqO9clNanYBmaiZALlScweQXUAmar5JzR1AfoGaXUDeAmSi5krNBMhEzS4gEzW7gEzUXAGZqNm1UlXHWqmqY61U1bFWqupYK1V1rE9uAjJRc6XmLUAmanap+QVAJmp2qZkAmai5AvIWNRMgV2ruUPMWIFdq7gCyS80uNU+tVNWxVqrqWCtVdayVqjoW/iMvATJRMwGyS81TQN6iZgLkSs0EyFvU7AKyS81TQN6i5ikgT6mZAHlKza6VqjrWSlUda6WqjrVSVcdaqapjffJHgFypmQDZpWYCZJeaiZpdQCZq3qJmF5CJmgmQXWp2AfkVaq6A/BupuQLy1EpVHWulqo61UlXHWqmqY61U1bHwH/kfB2SiZheQiZoJkG9SMwHyTWomQN6iZgLkKTVPAblScweQKzVPrVTVsVaq6lgrVXWslao61ic3AfllanYB2aXmDjW7gEzU7AIyUfMWIE+peQrIRM0VkKeATNT826xU1bFWqupYK1V1rJWqOtZKVR3rkz+i5puA/AIg3wbkSs23qdml5i1qJkDeoOYpIBM1EzVXQCZqdq1U1bFWqupYK1V1rJWqOtZKVR3rkxcBeUrNU2ruALJLzR1AdgGZqHkKyC41bwFypeYtaiZAJkC+CchEzZWap1aq6lgrVXWslao61kpVHeuTAwB5Csgdap5S8xSQiZorIBMgT6nZBeQONbuATNQ8BWSiZheQCZArNU+tVNWxVqrqWCtVdayVqjrWSlUd65P6f9RcAZmomQCZqLkCMgHyFiBXaiZAJmqugEyA7FIzAfJtQK7U/AIgEzW7VqrqWCtVdayVqjrWSlUda6WqjvXJi9T8AjUTIG9RMwFypeYpIBM1u4BM1DylZgLkCshfUHMFZALkLUB2qZkAuVLz1EpVHWulqo61UlXHWqmqY33yR4D8KiBvAXKHmisgEzUTILuATNQ8BWQXkImaKyBvUTMB8pSaCZArNb9gpaqOtVJVx1qpqmOtVNWxVqrqWPiPVNWRVqrqWCtVdayVqjrWSlUda6WqjrVSVcdaqapjrVTVsVaq6lgrVXWs/wN2ScMWm35HiAAAAABJRU5ErkJggg==';
        return {
          success: true,
          status: {
            ready: false,
            statusType: 'qr_pending',
            label: 'في انتظار مسح QR Code من هاتفك',
            needsQR: true,
            hasQR: true,
            provider: localStorage.getItem('cafePro_wa_provider') || 'web_js',
            qrImage: realQR
          }
        };
      },
      disconnect: async () => ({ success: true }),
      getProviderSettings: async () => ({
        success: true,
        data: {
          provider: localStorage.getItem('cafePro_wa_provider') || 'web_js',
          web_session_client_id: 'photostudio-whatsapp'
        }
      }),
      saveProviderSettings: async (settings) => {
        if (settings && settings.provider) {
          localStorage.setItem('cafePro_wa_provider', settings.provider);
          syncWhatsAppNavigationVisibility(settings.provider);
        }
        return { success: true };
      },
      getTemplateMap: async () => ({ success: true, data: {} }),
      saveTemplateMap: async () => ({ success: true }),
      verifyTemplates: async () => ({ success: true, data: { results: [], metaTemplatesCount: 0 } }),
      getWebhookInfo: async () => ({ success: true, data: { tunnel: { status: 'disabled' }, server: { isRunning: false } } }),
      onQR: (cb) => { setTimeout(() => cb('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220"><rect width="220" height="220" fill="white"/><rect x="20" y="20" width="60" height="60" fill="black"/><rect x="30" y="30" width="40" height="40" fill="white"/><rect x="40" y="40" width="20" height="20" fill="black"/><rect x="140" y="20" width="60" height="60" fill="black"/><rect x="150" y="30" width="40" height="40" fill="white"/><rect x="160" y="40" width="20" height="20" fill="black"/><rect x="20" y="140" width="60" height="60" fill="black"/><rect x="30" y="150" width="40" height="40" fill="white"/><rect x="40" y="160" width="20" height="20" fill="black"/><rect x="100" y="100" width="20" height="20" fill="%2325D366"/><text x="110" y="195" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="%231E1B18">WhatsApp QR</text></svg>'), 800); },
      onReady: () => {},
      onAuthenticated: () => {},
      onDisconnected: () => {},
      onLoading: () => {},
      onError: () => {},
      onNewMessage: () => () => {},
      onTunnelStatus: () => () => {},
      onMetaSynced: () => () => {}
    };
  }
}

// ─── Universal Global Logout Function ─────────────────────────────────────────
async function logout() {
  try {
    sessionStorage.clear();
    if (window.auth && typeof window.auth.logout === 'function') {
      await window.auth.logout();
    }
  } catch (e) {}
  window.location.href = 'login.html';
}
window.logout = logout;
