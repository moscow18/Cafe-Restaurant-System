// ─── Strict Role Guard: Cashier is NEVER allowed to access the dashboard ──────
(function guardCashierAccess() {
  const role = sessionStorage.getItem('photoStudio_role');
  if (role === 'cashier') {
    if (window.electron && typeof window.electron.navigate === 'function') {
      window.electron.navigate('pos-invoice.html');
    } else {
      window.location.replace('pos-invoice.html');
    }
  }
})();

// ─── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clockDisplay').textContent = now.toLocaleTimeString('ar-EG-u-nu-latn');
  document.getElementById('dateDisplay').textContent = now.toLocaleDateString('ar-EG-u-nu-latn', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}
setInterval(updateClock, 1000);
updateClock();



// ─── Dashboard Stats & Recent Activity ──────────────────────────────────────────
async function loadStats() {
  if (document.hidden) return; // Skip DB queries when window/tab is hidden
  const today = getLocalISODate();

  // Dynamic greeting based on time of day
  const hour = new Date().getHours();
  const greetingEl = document.getElementById('greetingHeader');
  if (greetingEl) {
    greetingEl.textContent = hour < 12 ? 'صباح الخير، أهلاً بك!' : 'مساء الخير، أهلاً بك!';
  }

  try {
    const [salesRes, expRes, netCashRes, netVCRes, netIPRes, netVisaRes, advRes, balRes, custRes, topDishesRes, yestRes] = await Promise.all([
      window.db.queryOne(
        `SELECT COALESCE(SUM(net_total),0) as total, COUNT(*) as cnt FROM invoices WHERE invoice_date=? AND is_returned=0`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE date=?`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date=? AND treasury_type='الخزينة'`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date=? AND treasury_type='فودافون كاش'`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date=? AND treasury_type='إنستا باي'`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date=? AND treasury_type='فيزا'`,
        [today]
      ),
      window.db.queryOne(
        `SELECT COALESCE(SUM(amount),0) as total FROM advances WHERE date=?`,
        [today]
      ),
      window.db.getTreasuryBalance('الخزينة'),
      window.db.queryOne(`SELECT COUNT(*) as cnt FROM customers`),
      window.db.query(`SELECT service_name, SUM(quantity) as qty, SUM(total) as rev FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE is_returned=0) GROUP BY service_name ORDER BY qty DESC LIMIT 5`),
      window.db.queryOne(
        `SELECT COALESCE(SUM(net_total),0) as total, COUNT(*) as cnt FROM invoices WHERE invoice_date=date(?,'-1 day') AND is_returned=0`,
        [today]
      )
    ]);

    const totalSales = Number((salesRes && salesRes.data) ? salesRes.data.total : 0);
    const totalOrders = Number((salesRes && salesRes.data) ? salesRes.data.cnt : 0);
    const totalCustomers = Number((custRes && custRes.data) ? custRes.data.cnt : 0);
    const yestSales = Number((yestRes && yestRes.data) ? yestRes.data.total : 0);
    const yestOrders = Number((yestRes && yestRes.data) ? yestRes.data.cnt : 0);
    const avgOrder = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

    const elSales = document.getElementById('todaySales');
    if (elSales) {
      elSales.textContent = totalSales.toLocaleString('en-US');
    }

    const elOrders = document.getElementById('todayOrdersCount');
    if (elOrders) {
      elOrders.textContent = totalOrders.toLocaleString('en-US');
    }

    const elCustomers = document.getElementById('totalCustomersCount');
    if (elCustomers) {
      elCustomers.textContent = totalCustomers.toLocaleString('en-US');
    }

    const elAvg = document.getElementById('avgOrderValue');
    if (elAvg) {
      elAvg.textContent = avgOrder.toLocaleString('en-US');
    }

    // Dynamic Trend Footers (Zero Static Data)
    const elSalesTrend = document.getElementById('salesTrendFooter');
    if (elSalesTrend) {
      if (yestSales > 0) {
        const diff = Math.round(((totalSales - yestSales) / yestSales) * 100);
        if (diff >= 0) {
          elSalesTrend.innerHTML = `<span class="trend-pill-up">↑ ${diff}%</span> <span class="trend-sub-note">مقارنة بالأمس</span>`;
        } else {
          elSalesTrend.innerHTML = `<span class="trend-pill-down" style="background:#FEE2E2; color:#DC2626; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800;">↓ ${Math.abs(diff)}%</span> <span class="trend-sub-note">مقارنة بالأمس</span>`;
        }
      } else if (totalSales > 0) {
        elSalesTrend.innerHTML = `<span class="trend-pill-up">↑ 100%</span> <span class="trend-sub-note">بداية حركة اليوم</span>`;
      } else {
        elSalesTrend.innerHTML = `<span class="trend-sub-note" style="color:#94A3B8;">— لا توجد مبيعات بعد</span>`;
      }
    }

    const elOrdersTrend = document.getElementById('ordersTrendFooter');
    if (elOrdersTrend) {
      if (yestOrders > 0) {
        const diff = Math.round(((totalOrders - yestOrders) / yestOrders) * 100);
        if (diff >= 0) {
          elOrdersTrend.innerHTML = `<span class="trend-pill-up">↑ ${diff}%</span> <span class="trend-sub-note">مقارنة بالأمس</span>`;
        } else {
          elOrdersTrend.innerHTML = `<span class="trend-pill-down" style="background:#FEE2E2; color:#DC2626; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800;">↓ ${Math.abs(diff)}%</span> <span class="trend-sub-note">مقارنة بالأمس</span>`;
        }
      } else if (totalOrders > 0) {
        elOrdersTrend.innerHTML = `<span class="trend-pill-up">↑ ${totalOrders}</span> <span class="trend-sub-note">طلبات مسجلة اليوم</span>`;
      } else {
        elOrdersTrend.innerHTML = `<span class="trend-sub-note" style="color:#94A3B8;">— بانتظار أول طلب</span>`;
      }
    }

    const elCustomersTrend = document.getElementById('customersTrendFooter');
    if (elCustomersTrend) {
      if (totalCustomers > 0) {
        elCustomersTrend.innerHTML = `<span class="trend-pill-up" style="background:#ECFDF5; color:#059669; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800;">نشط</span> <span class="trend-sub-note">إجمالي المسجلين</span>`;
      } else {
        elCustomersTrend.innerHTML = `<span class="trend-sub-note" style="color:#94A3B8;">— لا يوجد عملاء بعد</span>`;
      }
    }

    const elAvgTrend = document.getElementById('avgTrendFooter');
    if (elAvgTrend) {
      if (totalOrders > 0) {
        elAvgTrend.innerHTML = `<span class="trend-pill-up" style="background:#FEF3C7; color:#D97706; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800;">معدل</span> <span class="trend-sub-note">متوسط السلة الحالية</span>`;
      } else {
        elAvgTrend.innerHTML = `<span class="trend-sub-note" style="color:#94A3B8;">— عند تسجيل الطلبات</span>`;
      }
    }

    // Dynamic Sparkline Mini Curves (flatline when 0)
    const spSales = document.getElementById('sparklineSalesPath');
    if (spSales) spSales.setAttribute('d', totalSales > 0 ? 'M0 24 Q15 10 30 20 T60 8 T80 14' : 'M0 28 L80 28');

    const spOrders = document.getElementById('sparklineOrdersPath');
    if (spOrders) spOrders.setAttribute('d', totalOrders > 0 ? 'M0 26 Q20 28 40 12 T70 18 T80 6' : 'M0 28 L80 28');

    const spCust = document.getElementById('sparklineCustomersPath');
    if (spCust) spCust.setAttribute('d', totalCustomers > 0 ? 'M0 24 Q18 8 36 22 T65 10 T80 12' : 'M0 28 L80 28');

    const spAvg = document.getElementById('sparklineAvgPath');
    if (spAvg) spAvg.setAttribute('d', avgOrder > 0 ? 'M0 22 Q25 24 45 8 T70 14 T80 4' : 'M0 28 L80 28');

    // Chart footer numbers
    const elChartRev = document.getElementById('chartTodayRevenue');
    if (elChartRev) elChartRev.textContent = totalSales.toLocaleString('en-US') + ' ج.م';

    const elChartOrd = document.getElementById('chartTodayOrders');
    if (elChartOrd) elChartOrd.textContent = totalOrders.toLocaleString('en-US') + ' طلب';

    // Dynamic analytics sections
    await Promise.all([
      loadPeakHours(today),
      loadCategoryBreakdown(today),
      loadOrderStatusGauge(today),
      loadBusinessInsights(today, totalSales, totalOrders, topDishesRes),
      renderTopDishes(topDishesRes),
      loadSalesTrendChart(currentTrendPeriod)
    ]);

    const elExp = document.getElementById('todayExpenses');
    if (elExp && expRes.success && expRes.data) {
      elExp.textContent = Number(expRes.data.total).toLocaleString('en-US');
    }

    const elCash = document.getElementById('dailyNetCash');
    if (elCash && netCashRes.success && netCashRes.data) {
      elCash.textContent = Number(netCashRes.data.net).toLocaleString('en-US');
    }

    const elVC = document.getElementById('dailyNetVodafone');
    if (elVC && netVCRes.success && netVCRes.data) {
      elVC.textContent = Number(netVCRes.data.net).toLocaleString('en-US');
    }

    const elIP = document.getElementById('dailyNetInstapay');
    if (elIP && netIPRes.success && netIPRes.data) {
      elIP.textContent = Number(netIPRes.data.net).toLocaleString('en-US');
    }

    const elVisa = document.getElementById('dailyNetVisa');
    if (elVisa && netVisaRes.success && netVisaRes.data) {
      elVisa.textContent = Number(netVisaRes.data.net).toLocaleString('en-US');
    }

    const elAdv = document.getElementById('todayAdvances');
    if (elAdv && advRes.success && advRes.data) {
      elAdv.textContent = Number(advRes.data.total).toLocaleString('en-US');
    }

    const elBal = document.getElementById('treasuryBalance');
    if (elBal && balRes) {
      const treasuryVal = (typeof balRes.data !== 'undefined') ? Number(balRes.data) : Number(balRes || 0);
      elBal.textContent = treasuryVal.toLocaleString('en-US');
    }

    loadTodayInvoices();
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

async function loadTodayInvoices() {
  try {
    const res = await window.db.query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.net_total, i.amount_paid, i.remaining, i.is_returned, i.status, i.payment_method, i.invoice_type, i.created_at,
              COALESCE(c.name, 'عميل نقدي') as customer_name,
              COALESCE(t.name, i.invoice_type, 'طلب مباشر') as location_name
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id
       LEFT JOIN tables t ON i.table_id = t.id
       ORDER BY i.id DESC
       LIMIT 15`
    );
    const tbody = document.getElementById('todayInvoicesBody');
    if (!tbody) return;

    if (!res || !res.success || !res.data || res.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:32px; color:#94A3B8; font-size:13px;">لا توجد فواتير أو طلبات مسجلة حتى الآن</td></tr>`;
      return;
    }

    tbody.innerHTML = res.data.map(inv => {
      const paid = Number(inv.amount_paid || 0);
      const total = Number(inv.net_total || 0);
      const isReturned = inv.is_returned == 1;
      const isSettled = inv.status === 'محاسَبة' || inv.status === 'تم التسليم' || (paid >= total && total > 0);
      const statusBadge = isReturned
        ? `<span class="order-status-pill badge-returned">مرتجع</span>`
        : isSettled
          ? `<span class="order-status-pill badge-settled">محاسَبة</span>`
          : `<span class="order-status-pill badge-open">${inv.status || 'مفتوحة'}</span>`;

      // Extract time from created_at
      let timeStr = '';
      if (inv.created_at) {
        try {
          const parts = inv.created_at.split(' ');
          timeStr = parts[1] ? parts[1].slice(0, 5) : inv.created_at;
        } catch(e) { timeStr = inv.invoice_date || '—'; }
      } else {
        timeStr = inv.invoice_date || '—';
      }

      return `<tr style="cursor:pointer;" onclick="navigate('reports.html')" title="معاينة الفاتورة في التقارير">
        <td style="font-weight:800; color:var(--dash-primary); font-family:monospace; font-size:13px;">${inv.invoice_number || '—'}</td>
        <td>
          <div style="font-weight:700; color:var(--dash-text); font-size:12.5px;">${inv.customer_name}</div>
          <div style="font-size:10.5px; color:var(--dash-text-muted);">${inv.location_name} • ${inv.payment_method || 'نقدي'}</div>
        </td>
        <td style="color:var(--dash-text-muted); font-size:12px; font-variant-numeric:tabular-nums;">${timeStr}</td>
        <td style="font-weight:800; color:var(--dash-text); text-align:left; font-variant-numeric:tabular-nums; font-size:13px;">${Number(total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style="font-size:10px; font-weight:700; color:#94A3B8;">ج.م</span></td>
        <td style="text-align:center;">${statusBadge}</td>
      </tr>`;
    }).join('');
  } catch(err) {
    console.error('Error loading today invoices feed:', err);
  }
}

// ─── Global Logout Handler ──────────────────────────────────────────────────
async function handleLogout() {
  try {
    sessionStorage.clear();
    if (window.auth && typeof window.auth.logout === 'function') {
      await window.auth.logout();
    }
  } catch (e) {}
  window.location.href = 'login.html';
}
window.handleLogout = handleLogout;
window.logout = handleLogout;

// ─── Dashboard Stats ──────────────────────────────────────────────────────────


// ─── Dynamic Analytics Helpers (Peak, Categories, Gauge, Insights) ────────────
async function loadPeakHours(today) {
  try {
    const res = await window.db.query(
      `SELECT strftime('%H', created_at) as hr, COUNT(*) as cnt, SUM(net_total) as rev
       FROM invoices
       WHERE invoice_date=? AND is_returned=0
       GROUP BY hr
       ORDER BY rev DESC
       LIMIT 1`,
      [today]
    );
    const peakRevEl = document.getElementById('chartPeakRevenue');
    const peakOrdEl = document.getElementById('chartPeakOrders');
    const insightPeak = document.getElementById('insightPeakHourVal');
    if (res && res.success && res.data && res.data.length > 0) {
      const p = res.data[0];
      const hrNum = parseInt(p.hr, 10);
      const period = hrNum >= 12 ? 'م' : 'ص';
      const hr12 = hrNum % 12 || 12;
      const hrStr = `${hr12} ${period}`;
      if (peakRevEl) peakRevEl.textContent = `${Number(p.rev || 0).toLocaleString('en-US')} ج.م | ${hrStr}`;
      if (peakOrdEl) peakOrdEl.textContent = `${p.cnt} طلب | ${hrStr}`;
      if (insightPeak) insightPeak.textContent = `${hr12}:00 ${period} – ${hr12 + 1}:00 ${period}`;
    } else {
      if (peakRevEl) peakRevEl.innerHTML = '0 ج.م | &mdash;';
      if (peakOrdEl) peakOrdEl.innerHTML = '0 طلب | &mdash;';
      if (insightPeak) insightPeak.innerHTML = '&mdash; قيد التسجيل';
    }
  } catch(e) {
    console.error('Error loading peak hours:', e);
  }
}

// ─── Dynamic Sales & Orders Trend Chart ───────────────────────────────────────
let currentTrendPeriod = 'today';

async function switchTrendPeriod(period, btn) {
  currentTrendPeriod = period;
  if (btn) {
    document.querySelectorAll('.pill-tabs-small .pill-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  await loadSalesTrendChart(period);
}

async function loadSalesTrendChart(period = 'today') {
  try {
    const today = getLocalISODate();
    let points = [];
    let xLabels = [];
    let totalSalesPeriod = 0;
    let totalOrdersPeriod = 0;
    let peakRev = 0;
    let peakRevLabel = '—';
    let peakOrd = 0;
    let peakOrdLabel = '—';

    if (period === 'today') {
      xLabels = ['12 AM', '4 AM', '8 AM', '12 PM', '4 PM', '8 PM', '11 PM'];
      const hourMap = {};

      if (window.db && typeof window.db.query === 'function') {
        const res = await window.db.query(
          `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hr, COUNT(*) as cnt, SUM(net_total) as rev
           FROM invoices
           WHERE invoice_date = ? AND is_returned = 0
           GROUP BY hr`,
          [today]
        );
        if (res && res.success && res.data) {
          res.data.forEach(r => {
            const h = Number(r.hr);
            hourMap[h] = { rev: Number(r.rev) || 0, ord: Number(r.cnt) || 0 };
            totalSalesPeriod += Number(r.rev) || 0;
            totalOrdersPeriod += Number(r.cnt) || 0;
          });
        }
      }

      for (let h = 0; h <= 23; h++) {
        const val = hourMap[h] || { rev: 0, ord: 0 };
        const hr12 = h % 12 || 12;
        const periodStr = h >= 12 ? 'م' : 'ص';
        const label = `${hr12} ${periodStr}`;
        if (val.rev > peakRev) {
          peakRev = val.rev;
          peakRevLabel = label;
        }
        if (val.ord > peakOrd) {
          peakOrd = val.ord;
          peakOrdLabel = label;
        }
        points.push({
          x: 25 + (h / 23) * 600,
          rev: val.rev,
          ord: val.ord,
          label: label
        });
      }

    } else if (period === 'week') {
      const days = [];
      const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      xLabels = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        const dayName = dayNames[d.getDay()];
        days.push({ iso, label: dayName });
        xLabels.push(dayName);
      }

      const dayMap = {};
      if (window.db && typeof window.db.query === 'function') {
        const res = await window.db.query(
          `SELECT invoice_date as d, COUNT(*) as cnt, SUM(net_total) as rev
           FROM invoices
           WHERE invoice_date >= date('now', '-6 days') AND is_returned = 0
           GROUP BY invoice_date`,
          []
        );
        if (res && res.success && res.data) {
          res.data.forEach(r => {
            dayMap[r.d] = { rev: Number(r.rev) || 0, ord: Number(r.cnt) || 0 };
            totalSalesPeriod += Number(r.rev) || 0;
            totalOrdersPeriod += Number(r.cnt) || 0;
          });
        }
      }

      days.forEach((day, idx) => {
        const val = dayMap[day.iso] || { rev: 0, ord: 0 };
        if (val.rev > peakRev) {
          peakRev = val.rev;
          peakRevLabel = day.label;
        }
        if (val.ord > peakOrd) {
          peakOrd = val.ord;
          peakOrdLabel = day.label;
        }
        points.push({
          x: 25 + (idx / (days.length - 1)) * 600,
          rev: val.rev,
          ord: val.ord,
          label: day.label
        });
      });

    } else if (period === 'month') {
      const now = new Date();
      const numDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      xLabels = ['1', '5', '10', '15', '20', '25', `${numDays}`];

      const monthMap = {};
      if (window.db && typeof window.db.query === 'function') {
        const res = await window.db.query(
          `SELECT CAST(strftime('%d', invoice_date) AS INTEGER) as day_num, COUNT(*) as cnt, SUM(net_total) as rev
           FROM invoices
           WHERE strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now') AND is_returned = 0
           GROUP BY day_num`,
          []
        );
        if (res && res.success && res.data) {
          res.data.forEach(r => {
            const dn = Number(r.day_num);
            monthMap[dn] = { rev: Number(r.rev) || 0, ord: Number(r.cnt) || 0 };
            totalSalesPeriod += Number(r.rev) || 0;
            totalOrdersPeriod += Number(r.cnt) || 0;
          });
        }
      }

      for (let d = 1; d <= numDays; d++) {
        const val = monthMap[d] || { rev: 0, ord: 0 };
        if (val.rev > peakRev) {
          peakRev = val.rev;
          peakRevLabel = `يوم ${d}`;
        }
        if (val.ord > peakOrd) {
          peakOrd = val.ord;
          peakOrdLabel = `يوم ${d}`;
        }
        points.push({
          x: 25 + ((d - 1) / (numDays - 1)) * 600,
          rev: val.rev,
          ord: val.ord,
          label: `يوم ${d}`
        });
      }
    }

    renderTrendSvg(points, peakRev, peakRevLabel, peakOrd, peakOrdLabel, xLabels);

    // Update bottom footer KPIs
    const elChartRev = document.getElementById('chartTodayRevenue');
    if (elChartRev) elChartRev.textContent = `${Math.round(totalSalesPeriod).toLocaleString('en-US')} ج.م`;

    const elChartOrd = document.getElementById('chartTodayOrders');
    if (elChartOrd) elChartOrd.textContent = `${totalOrdersPeriod} طلب`;

    const elPeakRev = document.getElementById('chartPeakRevenue');
    if (elPeakRev) {
      elPeakRev.textContent = peakRev > 0 ? `${Math.round(peakRev).toLocaleString('en-US')} ج.م | ${peakRevLabel}` : '0 ج.م | —';
    }

    const elPeakOrd = document.getElementById('chartPeakOrders');
    if (elPeakOrd) {
      elPeakOrd.textContent = peakOrd > 0 ? `${peakOrd} طلب | ${peakOrdLabel}` : '0 طلب | —';
    }

  } catch (err) {
    console.error('Error loading sales trend chart:', err);
  }
}

function renderTrendSvg(points, maxRev, peakRevLabel, maxOrd, peakOrdLabel, xLabels) {
  const container = document.getElementById('trendChartContainer') || document.querySelector('.trend-svg-container');
  if (!container) return;

  const baselineY = 172;
  const topY = 35;
  const chartHeight = baselineY - topY;

  let revPoints = [];
  let ordPoints = [];

  points.forEach(p => {
    const yRev = maxRev > 0 ? baselineY - (p.rev / maxRev) * chartHeight : baselineY;
    const yOrd = maxOrd > 0 ? baselineY - (p.ord / maxOrd) * (chartHeight * 0.88) : baselineY;
    revPoints.push({ x: p.x, y: yRev, rev: p.rev });
    ordPoints.push({ x: p.x, y: yOrd, ord: p.ord });
  });

  function buildCurvedPath(pts) {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  const revPath = buildCurvedPath(revPoints);
  const ordPath = buildCurvedPath(ordPoints);

  const startX = points[0].x.toFixed(1);
  const endX = points[points.length - 1].x.toFixed(1);

  const revArea = maxRev > 0 ? `${revPath} L ${endX},180 L ${startX},180 Z` : '';
  const ordArea = maxOrd > 0 ? `${ordPath} L ${endX},180 L ${startX},180 Z` : '';

  let peakRevMarkerHtml = '';
  if (maxRev > 0) {
    const peakPt = revPoints.find(p => p.rev === maxRev) || revPoints[0];
    const peakX = Math.min(Math.max(peakPt.x, 50), 590);
    const peakY = peakPt.y;
    const txt = maxRev >= 1000 ? `${(maxRev / 1000).toFixed(1)}K ج.م` : `${Math.round(maxRev)} ج.م`;
    peakRevMarkerHtml = `
      <circle cx="${peakPt.x.toFixed(1)}" cy="${peakY.toFixed(1)}" r="5" fill="#FF5B22" stroke="#FFFFFF" stroke-width="2"/>
      <rect x="${(peakX - 38).toFixed(1)}" y="${Math.max(6, peakY - 26).toFixed(1)}" width="76" height="20" rx="6" fill="#FF5B22"/>
      <text x="${peakX.toFixed(1)}" y="${(Math.max(6, peakY - 26) + 14).toFixed(1)}" fill="#FFFFFF" font-size="10.5" font-weight="800" text-anchor="middle">${txt}</text>
    `;
  }

  let peakOrdMarkerHtml = '';
  if (maxOrd > 0) {
    const peakOrdPt = ordPoints.find(p => p.ord === maxOrd) || ordPoints[0];
    const peakOrdX = Math.min(Math.max(peakOrdPt.x, 40), 600);
    const peakOrdY = peakOrdPt.y;
    peakOrdMarkerHtml = `
      <circle cx="${peakOrdPt.x.toFixed(1)}" cy="${peakOrdY.toFixed(1)}" r="4.5" fill="#10B981" stroke="#FFFFFF" stroke-width="2"/>
      <rect x="${(peakOrdX - 28).toFixed(1)}" y="${Math.max(28, peakOrdY - 24).toFixed(1)}" width="56" height="18" rx="5" fill="#10B981"/>
      <text x="${peakOrdX.toFixed(1)}" y="${(Math.max(28, peakOrdY - 24) + 13).toFixed(1)}" fill="#FFFFFF" font-size="9.5" font-weight="800" text-anchor="middle">${maxOrd} طلب</text>
    `;
  }

  const emptyNotice = (maxRev === 0 && maxOrd === 0) ? `
    <text x="325" y="105" fill="#A8A29E" font-size="12" font-weight="700" text-anchor="middle">لا توجد حركات مبيعات مسجلة في هذه الفترة</text>
  ` : '';

  container.innerHTML = `
    <svg viewBox="0 0 650 200" preserveAspectRatio="none" style="width:100%; height:100%; display:block;">
      <defs>
        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FF5B22" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#FF5B22" stop-opacity="0.0"/>
        </linearGradient>
        <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10B981" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#10B981" stop-opacity="0.0"/>
        </linearGradient>
      </defs>

      <!-- Horizontal Grid Lines -->
      <line x1="0" y1="40" x2="650" y2="40" stroke="#F1EFEA" stroke-width="1" stroke-dasharray="3 3"/>
      <line x1="0" y1="90" x2="650" y2="90" stroke="#F1EFEA" stroke-width="1" stroke-dasharray="3 3"/>
      <line x1="0" y1="140" x2="650" y2="140" stroke="#F1EFEA" stroke-width="1" stroke-dasharray="3 3"/>
      <line x1="0" y1="172" x2="650" y2="172" stroke="#E5DCD5" stroke-width="1.2"/>

      ${emptyNotice}

      <!-- Revenue Curve & Fill -->
      ${revArea ? `<path d="${revArea}" fill="url(#revenueGrad)"/>` : ''}
      <path d="${revPath}" fill="none" stroke="#FF5B22" stroke-width="${maxRev > 0 ? 3 : 1.5}" stroke-linecap="round" stroke-linejoin="round" opacity="${maxRev > 0 ? '1' : '0.35'}"/>

      <!-- Orders Curve & Fill -->
      ${ordArea ? `<path d="${ordArea}" fill="url(#ordersGrad)"/>` : ''}
      <path d="${ordPath}" fill="none" stroke="#10B981" stroke-width="${maxOrd > 0 ? 2.5 : 1.5}" stroke-linecap="round" stroke-linejoin="round" opacity="${maxOrd > 0 ? '1' : '0.35'}"/>

      <!-- Dynamic Peaks -->
      ${peakRevMarkerHtml}
      ${peakOrdMarkerHtml}
    </svg>

    <!-- Dynamic Time/Date Axis Labels -->
    <div style="display:flex; justify-content:space-between; font-size:10px; font-weight:700; color:#8E847C; padding-top:6px; padding-left:14px; padding-right:14px;">
      ${xLabels.map(l => `<span>${l}</span>`).join('')}
    </div>
  `;
}

async function loadCategoryBreakdown(today) {
  try {
    let res = await window.db.query(
      `SELECT 
         COALESCE(c.name, ii.category_name, 'أصناف متنوعة') as cat_name,
         COUNT(ii.id) as orders_count,
         SUM(ii.quantity) as total_qty,
         SUM(ii.total) as total_rev
       FROM invoice_items ii
       LEFT JOIN services s ON ii.service_id = s.id
       LEFT JOIN service_categories c ON s.category_id = c.id
       JOIN invoices inv ON ii.invoice_id = inv.id
       WHERE inv.invoice_date=? AND inv.is_returned=0
       GROUP BY cat_name
       ORDER BY total_qty DESC
       LIMIT 5`,
      [today]
    );

    if (!res || !res.success || !res.data || res.data.length === 0) {
      res = await window.db.query(
        `SELECT 
           COALESCE(c.name, ii.category_name, 'أصناف متنوعة') as cat_name,
           COUNT(ii.id) as orders_count,
           SUM(ii.quantity) as total_qty,
           SUM(ii.total) as total_rev
         FROM invoice_items ii
         LEFT JOIN services s ON ii.service_id = s.id
         LEFT JOIN service_categories c ON s.category_id = c.id
         JOIN invoices inv ON ii.invoice_id = inv.id
         WHERE inv.is_returned=0
         GROUP BY cat_name
         ORDER BY total_qty DESC
         LIMIT 5`
      );
    }

    const legendList = document.getElementById('categoryLegendList');
    const donutSvg = document.getElementById('donutSvg');
    const donutTotal = document.getElementById('donutTotalOrders');
    const catTitle = document.getElementById('catHighlightTitle');
    const catDesc = document.getElementById('catHighlightDesc');
    const colors = ['#FF5B22', '#F59E0B', '#10B981', '#8B5CF6', '#3B82F6'];

    if (res && res.success && res.data && res.data.length > 0) {
      const data = res.data;
      const sumQty = data.reduce((s, d) => s + Number(d.total_qty || 0), 0);
      if (donutTotal) donutTotal.textContent = sumQty.toLocaleString('en-US');

      const circ = 364.4;
      let accum = 0;
      let slicesHtml = `<circle cx="80" cy="80" r="58" fill="none" stroke="#F4EFEA" stroke-width="20"/>`;
      let legendHtml = '';

      data.forEach((d, idx) => {
        const qty = Number(d.total_qty || 0);
        const pct = sumQty > 0 ? Math.round((qty / sumQty) * 100) : 0;
        const color = colors[idx % colors.length];
        const sliceLen = Math.max(4, (pct / 100) * circ);

        slicesHtml += `<circle cx="80" cy="80" r="58" fill="none" stroke="${color}" stroke-width="20"
          stroke-dasharray="${sliceLen} ${circ}" stroke-dashoffset="${-accum}" stroke-linecap="round"/>`;
        accum += sliceLen + 2;

        legendHtml += `
          <div class="category-legend-entry">
            <div class="cat-entry-left">
              <span class="cat-color-dot" style="background:${color};"></span>
              <div>
                <div class="cat-name-text">${d.cat_name || d.name || 'أصناف عامة'}</div>
                <div class="cat-orders-count">${qty.toLocaleString('en-US')} طلب</div>
              </div>
            </div>
            <span class="cat-percent-badge">${pct}%</span>
          </div>`;
      });

      if (donutSvg) donutSvg.innerHTML = slicesHtml;
      if (legendList) legendList.innerHTML = legendHtml;

      const topCat = data[0];
      const topPct = sumQty > 0 ? Math.round((Number(topCat.total_qty || 0) / sumQty) * 100) : 0;
      if (catTitle) catTitle.textContent = `الفئة الأكثر طلباً: ${topCat.cat_name || topCat.name || ''}`;
      if (catDesc) catDesc.textContent = `تمثل ${topPct}% من إجمالي حركة المبيعات المسجلة.`;
    } else {
      const catRes = await window.db.query(`SELECT name FROM service_categories LIMIT 5`);
      if (catRes && catRes.success && catRes.data && catRes.data.length > 0) {
        if (donutTotal) donutTotal.textContent = '0';
        if (donutSvg) donutSvg.innerHTML = `<circle cx="80" cy="80" r="58" fill="none" stroke="#F4EFEA" stroke-width="20"/>`;
        if (legendList) {
          legendList.innerHTML = catRes.data.map((c, i) => `
            <div class="category-legend-entry">
              <div class="cat-entry-left">
                <span class="cat-color-dot" style="background:${colors[i % colors.length]};"></span>
                <div>
                  <div class="cat-name-text">${c.name || c.cat_name || 'عام'}</div>
                  <div class="cat-orders-count">0 طلب اليوم</div>
                </div>
              </div>
              <span class="cat-percent-badge">0%</span>
            </div>
          `).join('');
        }
      } else {
        if (donutTotal) donutTotal.textContent = '0';
        if (legendList) legendList.innerHTML = '<div style="text-align:center; padding:16px; color:#8E847C; font-size:12px;">لا توجد أصناف أو مبيعات بعد</div>';
      }
    }
  } catch(e) {
    console.error('Error loading category breakdown:', e);
  }
}

async function loadOrderStatusGauge(today) {
  try {
    let res = await window.db.queryOne(
      `SELECT 
         COUNT(CASE WHEN is_returned=1 THEN 1 END) as cancelled_cnt,
         COUNT(CASE WHEN is_returned=0 AND (paid_amount < net_total AND paid_amount > 0) THEN 1 END) as partial_cnt,
         COUNT(CASE WHEN is_returned=0 AND (paid_amount = 0 OR status='معلق') THEN 1 END) as pending_cnt,
         COUNT(CASE WHEN is_returned=0 AND (paid_amount >= net_total OR status='محاسَبة' OR status='مكتمل') THEN 1 END) as completed_cnt,
         COUNT(*) as total_cnt
       FROM invoices
       WHERE invoice_date=?`,
      [today]
    );

    if (!res || !res.success || !res.data || res.data.total_cnt === 0) {
      res = await window.db.queryOne(
        `SELECT 
           COUNT(CASE WHEN is_returned=1 THEN 1 END) as cancelled_cnt,
           COUNT(CASE WHEN is_returned=0 AND (paid_amount < net_total AND paid_amount > 0) THEN 1 END) as partial_cnt,
           COUNT(CASE WHEN is_returned=0 AND (paid_amount = 0 OR status='معلق') THEN 1 END) as pending_cnt,
           COUNT(CASE WHEN is_returned=0 AND (paid_amount >= net_total OR status='محاسَبة' OR status='مكتمل') THEN 1 END) as completed_cnt,
           COUNT(*) as total_cnt
         FROM invoices`
      );
    }

    const d = res && res.data ? res.data : { total_cnt: 0, completed_cnt: 0, partial_cnt: 0, pending_cnt: 0, cancelled_cnt: 0 };
    const tot = d.total_cnt || 0;
    const cPct = tot > 0 ? Math.round((d.completed_cnt / tot) * 100) : 0;
    const partPct = tot > 0 ? Math.round((d.partial_cnt / tot) * 100) : 0;
    const pendPct = tot > 0 ? Math.round((d.pending_cnt / tot) * 100) : 0;
    const canPct = tot > 0 ? Math.round((d.cancelled_cnt / tot) * 100) : 0;

    const elCPct = document.getElementById('gaugeCompletedPct');
    const elCLbl = document.getElementById('gaugeCompletedLbl');
    const elPPct = document.getElementById('gaugePrepPct');
    const elPLbl = document.getElementById('gaugePrepLbl');
    const elPendPct = document.getElementById('gaugePendingPct');
    const elPendLbl = document.getElementById('gaugePendingLbl');
    const elCanPct = document.getElementById('gaugeCancelledPct');
    const elCanLbl = document.getElementById('gaugeCancelledLbl');
    const gaugeArc = document.getElementById('gaugeCompletedArc');

    if (elCPct) elCPct.textContent = `${cPct}%`;
    if (elCLbl) elCLbl.textContent = `مكتمل (${d.completed_cnt || 0})`;
    if (elPPct) elPPct.textContent = `${partPct}%`;
    if (elPLbl) elPLbl.textContent = `جزئي (${d.partial_cnt || 0})`;
    if (elPendPct) elPendPct.textContent = `${pendPct}%`;
    if (elPendLbl) elPendLbl.textContent = `معلق (${d.pending_cnt || 0})`;
    if (elCanPct) elCanPct.textContent = `${canPct}%`;
    if (elCanLbl) elCanLbl.textContent = `مرتجع (${d.cancelled_cnt || 0})`;

    if (gaugeArc) {
      const arcLen = (cPct / 100) * 251.3;
      gaugeArc.setAttribute('stroke-dasharray', `${arcLen} 252`);
    }
  } catch(e) {
    console.error('Error loading order status gauge:', e);
  }
}

async function loadBusinessInsights(today, totalSales, totalOrders, topDishesRes) {
  try {
    const yestRes = await window.db.queryOne(
      `SELECT COALESCE(SUM(net_total),0) as yest_total FROM invoices WHERE invoice_date=date(?,'-1 day') AND is_returned=0`,
      [today]
    );
    const yestTotal = Number(yestRes && yestRes.data ? yestRes.data.yest_total : 0);

    const growthEl = document.getElementById('insightGrowthVal');
    if (growthEl) {
      if (yestTotal > 0) {
        const diff = Math.round(((totalSales - yestTotal) / yestTotal) * 100);
        if (diff >= 0) {
          growthEl.textContent = `+${diff}% مقارنة بالأمس`;
          growthEl.style.color = '#10B981';
        } else {
          growthEl.textContent = `${diff}% مقارنة بالأمس`;
          growthEl.style.color = '#EF4444';
        }
      } else if (totalSales > 0) {
        growthEl.textContent = `نشاط بيعي جديد`;
        growthEl.style.color = '#10B981';
      } else {
        growthEl.innerHTML = '&mdash; قيد التسجيل';
        growthEl.style.color = '#8E847C';
      }
    }

    const topDishEl = document.getElementById('insightTopDishVal');
    const topQtyEl = document.getElementById('insightTopQtyVal');

    if (topDishesRes && topDishesRes.data && topDishesRes.data.length > 0) {
      const topRev = [...topDishesRes.data].sort((a,b) => Number(b.rev||0) - Number(a.rev||0))[0];
      const topQty = [...topDishesRes.data].sort((a,b) => Number(b.qty||0) - Number(a.qty||0))[0];
      if (topDishEl) topDishEl.textContent = topRev?.service_name || '—';
      if (topQtyEl) topQtyEl.textContent = topQty?.service_name || '—';
    } else {
      if (topDishEl) topDishEl.innerHTML = '&mdash;';
      if (topQtyEl) topQtyEl.innerHTML = '&mdash;';
    }

    const bannerEl = document.getElementById('insightMotivationalBanner');
    if (bannerEl) {
      if (totalSales > 0) {
        bannerEl.textContent = `أداء متميز! تم تسجيل إجمالي مبيعات ${totalSales.toLocaleString('en-US')} ج.م عبر ${totalOrders} طلب اليوم.`;
      } else {
        bannerEl.textContent = 'متابعة مباشرة ودقيقة لبيانات الكافيه والمطعم من واقع الفواتير المسجلة.';
      }
    }
  } catch(e) {
    console.error('Error loading business insights:', e);
  }
}

async function renderTopDishes(topDishesRes) {
  const container = document.getElementById('topDishesList');
  if (!container) return;

  let items = (topDishesRes && topDishesRes.success && topDishesRes.data) ? topDishesRes.data : [];

  if (items.length === 0) {
    const sRes = await window.db.query(`SELECT name as service_name, price as rev FROM services LIMIT 5`);
    if (sRes && sRes.success && sRes.data) {
      items = sRes.data.map(s => ({ service_name: s.service_name, qty: 0, rev: s.rev }));
    }
  }

  if (items.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:24px; color:#8E847C; font-size:12px;">لا توجد أصناف بالمنيو بعد</div>';
    return;
  }

  container.innerHTML = items.slice(0, 5).map((d, idx) => `
    <div class="dish-rank-item">
      <div class="dish-info-side">
        <span class="dish-rank-num" style="${idx === 0 ? 'background:#FFF0E6; color:#FF5B22;' : ''}">${idx + 1}</span>
        <div class="dish-thumb-icon" style="display:flex; align-items:center; justify-content:center;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5B22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>
        </div>
        <div class="dish-text-wrap">
          <div class="dish-name-title">${d.service_name || 'صنف'}</div>
          <div class="dish-orders-sub">${Number(d.qty || 0) > 0 ? Number(d.qty).toLocaleString('en-US') + ' طلب مسجل' : 'جاهز بالمنيو'}</div>
        </div>
      </div>
      <div class="dish-price-side">${Number(d.rev || 0).toLocaleString('en-US')} ج.م</div>
    </div>
  `).join('');
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
async function openWhatsApp() {
  const result = await Swal.fire({
    title: 'الدعم الفني',
    text: 'اختر رقم الدعم الفني للتواصل معنا عبر واتساب (Dev Blue Tech):',
    icon: 'info',
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'تواصل مع 01129021377',
    denyButtonText: 'تواصل مع 01204165586',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#25d366',
    denyButtonColor: '#128c7e'
  });

  if (result.isConfirmed) {
    window.electron.openExternal('https://wa.me/201129021377');
  } else if (result.isDenied) {
    window.electron.openExternal('https://wa.me/201204165586');
  }
}

// ─── Current User & Role-Based Visibility ─────────────────────────────────────
let currentUser = { id: null, name: '', role: 'admin' };

async function loadSystemLogo() {
  const res = await window.db.getSettings();
  if (res.success && res.data) {
    if (res.data.logo_path) {
      const iconDiv = document.getElementById('navbarLogoIcon');
      const safeLogo = 'file:///' + res.data.logo_path.replace(/\\/g, '/');
      iconDiv.innerHTML = `<img src="${safeLogo}" style="width:100%; height:100%; object-fit:contain; border-radius:12px;">`;
      iconDiv.style.background = 'transparent';
      iconDiv.style.boxShadow = 'none';
    }
    if (res.data.company_name) {
      document.getElementById('navbarLogoText').textContent = res.data.company_name;
    }
  }
}

async function loadCurrentUser() {
  // Try from auth session first
  let loadedName = 'المدير';
  const sessionRes = await window.auth.getSession();
  if (sessionRes.success && sessionRes.data) {
    const s = sessionRes.data;
    currentUser = { id: s.employeeId, name: s.employeeName, role: s.role };
    loadedName = s.employeeName || 'المدير';
    document.getElementById('currentUserName').textContent = loadedName;
    document.getElementById('userAvatarLetter').textContent = loadedName.charAt(0);
    document.getElementById('userRoleBadge').textContent = s.role === 'admin' ? 'المدير' : 'كاشير';

    // Store in sessionStorage for other pages
    sessionStorage.setItem('photoStudio_userId', s.userId);
    sessionStorage.setItem('photoStudio_employeeId', s.employeeId);
    sessionStorage.setItem('photoStudio_employeeName', loadedName);
    sessionStorage.setItem('photoStudio_role', s.role);
    sessionStorage.setItem('photoStudio_shiftId', s.shiftId || '');

    // Apply role-based visibility
    applyRoleVisibility(s.role);
  } else {
    // Fallback (check sessionStorage or default to admin)
    const role = sessionStorage.getItem('photoStudio_role') || 'admin';
    loadedName = sessionStorage.getItem('photoStudio_employeeName') || 'المدير';
    currentUser = {
      id: parseInt(sessionStorage.getItem('photoStudio_employeeId')) || 1,
      name: loadedName,
      role: role
    };
    document.getElementById('currentUserName').textContent = loadedName;
    document.getElementById('userAvatarLetter').textContent = loadedName.charAt(0);
    document.getElementById('userRoleBadge').textContent = role === 'admin' ? 'المدير' : 'كاشير';
    applyRoleVisibility(role);
  }

  // Load avatar if profile has one saved
  try {
    if (window.users && typeof window.users.getProfile === 'function') {
      const pRes = await window.users.getProfile();
      if (pRes && pRes.success && pRes.data) {
        if (pRes.data.fullName) {
          document.getElementById('currentUserName').textContent = pRes.data.fullName;
          document.getElementById('userAvatarLetter').textContent = pRes.data.fullName.charAt(0);
        }
        if (pRes.data.avatar) {
          const img = document.getElementById('userAvatarImg');
          const letter = document.getElementById('userAvatarLetter');
          if (img && letter) {
            img.src = pRes.data.avatar;
            img.style.display = 'block';
            letter.style.display = 'none';
          }
        }
      }
    }
  } catch (e) {}
}

async function applyRoleVisibility(role) {
  if (role === 'cashier') {
    // Cashier has ZERO dashboard permissions - redirect strictly to POS!
    if (window.electron && typeof window.electron.navigate === 'function') {
      window.electron.navigate('pos-invoice.html');
    } else {
      window.location.href = 'pos-invoice.html';
    }
    return;
  }
}


// ─── Logout ───────────────────────────────────────────────────────────────────
async function handleLogout() {
  const result = await Swal.fire({
    title: 'تسجيل الخروج',
    text: 'هل تريد بالتأكيد تسجيل الخروج من النظام؟',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#E05252',
    cancelButtonColor: '#94A3B8',
    confirmButtonText: 'نعم، خروج',
    cancelButtonText: 'إلغاء'
  });
  if (!result.isConfirmed) return;
  await window.auth.logout();
  sessionStorage.clear();
  window.electron.navigate('login.html');
}

// ─── Attendance Modal Logic ───────────────────────────────────────────────────
async function handleAttendance(type) { // type = 'in' or 'out'
  document.getElementById('attendanceModal').classList.add('open');
  
  // Set default date and time
  const now = new Date();
  document.getElementById('attDate').value = now.toISOString().split('T')[0];
  document.getElementById('attTimeIn').value = now.toTimeString().substring(0, 5);
  document.getElementById('attTimeOut').value = now.toTimeString().substring(0, 5);

  // Toggle fields based on type
  if (type === 'in') {
    document.getElementById('attModalTitle').innerHTML = 'تسجيل حضور';
    document.getElementById('attTimeInGroup').style.display = 'block';
    document.getElementById('attTimeOutGroup').style.display = 'none';
    document.getElementById('btnSubmitAttIn').style.display = 'block';
    document.getElementById('btnSubmitAttOut').style.display = 'none';
    document.getElementById('btnSubmitAttOutAll').style.display = 'none';
  } else {
    document.getElementById('attModalTitle').innerHTML = 'تسجيل انصراف';
    document.getElementById('attTimeInGroup').style.display = 'none';
    document.getElementById('attTimeOutGroup').style.display = 'block';
    document.getElementById('btnSubmitAttIn').style.display = 'none';
    document.getElementById('btnSubmitAttOut').style.display = 'block';
    document.getElementById('btnSubmitAttOutAll').style.display = 'block';
  }

  // Load active employees
  const sel = document.getElementById('attEmpSelect');
  sel.innerHTML = '<option value="">-- اختر الموظف --</option>';
  const res = await window.db.query('SELECT id, name FROM employees WHERE is_active=1 ORDER BY name', []);
  if (res.success) {
    res.data.forEach(e => {
      sel.innerHTML += `<option value="${e.id}">${e.name}</option>`;
    });
  }
}

async function saveDashboardAttendance() {
  const empId = document.getElementById('attEmpSelect').value;
  const date = document.getElementById('attDate').value;
  const timeIn = document.getElementById('attTimeIn').value;
  
  if (!empId || !date || !timeIn) {
    showToast('يجب اختيار الموظف وإدخال التاريخ ووقت الحضور', 'warning');
    return;
  }
  
  const dateTime = `${date}T${timeIn}:00`;
  const currentShift = await window.shift.getCurrent();
  const shiftId = currentShift?.id || null;

  await window.db.run(
    `INSERT INTO attendance (employee_id, date, check_in, shift_id) VALUES (?,?,?,?)`,
    [empId, date, dateTime, shiftId]
  );
  showToast('تم تسجيل الحضور بنجاح', 'success');
  closeModal('attendanceModal');
}

async function saveDashboardCheckout() {
  const empId = document.getElementById('attEmpSelect').value;
  const date = document.getElementById('attDate').value;
  const timeOut = document.getElementById('attTimeOut').value;
  
  if (!empId || !date || !timeOut) {
    showToast('يجب اختيار الموظف وإدخال التاريخ ووقت الانصراف', 'warning');
    return;
  }
  
  // Check if check in exists
  const attRes = await window.db.queryOne(
    `SELECT * FROM attendance WHERE employee_id=? AND date=? AND check_out IS NULL ORDER BY id DESC LIMIT 1`,
    [empId, date]
  );
  if (!attRes.success || !attRes.data) {
    showToast('لا يوجد حضور مسجل لليوم، لا يمكن تسجيل انصراف', 'warning');
    return;
  }

  const dateTime = `${date}T${timeOut}:00`;
  const outDate = new Date(dateTime);
  const checkInTime = new Date(attRes.data.check_in);
  
  const empRes = await window.db.queryOne('SELECT work_hours_per_day FROM employees WHERE id=?', [empId]);
  const workHours = empRes.data?.work_hours_per_day || 8;
  const requiredMinutes = Math.floor(workHours * 60);

  const workedMinutes = Math.floor((outDate - checkInTime) / 60000);
  
  let lateMinutes = 0;
  let extraMinutes = 0;
  
  if (workedMinutes < requiredMinutes) {
    lateMinutes = requiredMinutes - workedMinutes;
  } else if (workedMinutes > requiredMinutes) {
    extraMinutes = workedMinutes - requiredMinutes;
  }

  await window.db.run(
    `UPDATE attendance SET check_out=?, late_minutes=?, extra_minutes=? WHERE id=?`, 
    [dateTime, lateMinutes, extraMinutes, attRes.data.id]
  );
  showToast('تم تسجيل الانصراف بنجاح', 'success');
  closeModal('attendanceModal');
}

async function saveDashboardCheckoutAll() {
  const chkRes = await Swal.fire({
    title: 'انصراف جماعي',
    text: 'هل تريد تسجيل انصراف لكل من سجل حضور اليوم ولم ينصرف بعد؟ (سيتم احتساب وقت الانصراف ليتطابق مع ساعات عملهم الرسمية بدون تأخير أو زيادة)',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#1B2A4A',
    cancelButtonColor: '#94A3B8',
    confirmButtonText: 'نعم، سجّل الانصراف',
    cancelButtonText: 'إلغاء'
  });
  if (!chkRes.isConfirmed) return;

  const date = document.getElementById('attDate').value;
  if (!date) {
    showToast('يجب تحديد التاريخ أولاً', 'error');
    return;
  }

  // Get all active attendances without checkout for this date
  const attListRes = await window.db.query(
    `SELECT a.*, e.work_hours_per_day FROM attendance a JOIN employees e ON a.employee_id = e.id WHERE a.date=? AND a.check_out IS NULL`,
    [date]
  );

  if (!attListRes.success || !attListRes.data || attListRes.data.length === 0) {
    showToast('لا يوجد موظفين حاضرين بدون انصراف لهذا اليوم', 'info');
    return;
  }

  let count = 0;
  for (const att of attListRes.data) {
    const checkInTime = new Date(att.check_in);
    const workHours = att.work_hours_per_day || 8;
    
    // Add workHours to check_in time to get ideal check_out time
    const idealCheckOut = new Date(checkInTime.getTime() + workHours * 60 * 60 * 1000);
    
    // Format to local ISO string keeping local timezone (since the DB expects local time)
    // We can just construct it manually or use simple string slicing if we offset by timezone
    const offsetMs = idealCheckOut.getTimezoneOffset() * 60000;
    const localIso = new Date(idealCheckOut.getTime() - offsetMs).toISOString().slice(0,19);

    await window.db.run(
      `UPDATE attendance SET check_out=?, late_minutes=0, extra_minutes=0 WHERE id=?`,
      [localIso, att.id]
    );
    count++;
  }

  showToast(`تم تسجيل الانصراف لعدد ${count} موظفين بنجاح`, 'success');
  closeModal('attendanceModal');
}

// ─── Auto-Checkout Missing Previous Days ──────────────────────────────────────
async function autoCheckoutMissing() {
  if (!window.db || typeof window.db.query !== 'function') return;
  try {
    const today = getLocalISODate();
    // Select attendance older than today without checkout
    const res = await window.db.query(
      `SELECT a.*, e.work_hours_per_day FROM attendance a JOIN employees e ON a.employee_id = e.id WHERE a.date < ? AND a.check_out IS NULL`,
      [today]
    );
    if (res && res.success && res.data && res.data.length > 0) {
      for (const att of res.data) {
        const checkInTime = new Date(att.check_in);
        const workHours = att.work_hours_per_day || 8;
        const idealCheckOut = new Date(checkInTime.getTime() + workHours * 60 * 60 * 1000);
        const offsetMs = idealCheckOut.getTimezoneOffset() * 60000;
        const localIso = new Date(idealCheckOut.getTime() - offsetMs).toISOString().slice(0,19);
        if (typeof window.db.run === 'function') {
          await window.db.run(
            `UPDATE attendance SET check_out=?, late_minutes=0, extra_minutes=0 WHERE id=?`,
            [localIso, att.id]
          );
        }
      }
      console.log(`[Auto-Checkout] Fixed ${res.data.length} missing checkouts from previous days.`);
    }
  } catch (err) {
    console.error('[Auto-Checkout] Error:', err);
  }
}
// Run auto checkout silently when dashboard loads
setTimeout(autoCheckoutMissing, 2000);



// ─── End Shift — Navigate to end-shift screen (cashier only) ────────────────────
function endShift() {
  const role = sessionStorage.getItem('photoStudio_role');
  if (role === 'admin') {
    showToast('إنهاء الشيفت مخصص للكاشير فقط وليس لمدير النظام', 'warning');
    return;
  }
  navigate('end-shift.html');
}

// ─── New Customer ─────────────────────────────────────────────────────────────
function showNewCustomerModal() { openModal('newCustomerModal'); }
async function saveNewCustomer() {
  const name = document.getElementById('newCustName').value.trim();
  if (!name) { showToast('الرجاء إدخال اسم العميل', 'error'); return; }
  const phone = document.getElementById('newCustPhone').value.trim();
  const address = document.getElementById('newCustAddress').value.trim();
  const balance = parseFloat(document.getElementById('newCustBalance').value) || 0;

  // التحقق من عدم تكرار رقم التليفون
  if (phone) {
    const checkPhone = await window.db.queryOne(
      `SELECT id, name FROM customers WHERE phone=? LIMIT 1`, [phone]
    );
    if (checkPhone.success && checkPhone.data) {
      showToast(`رقم التليفون "${phone}" مسجل مسبقاً للعميل: ${checkPhone.data.name}`, 'error');
      return;
    }
  }

  const res = await window.db.run(
    `INSERT INTO customers (name, phone, address, opening_balance, current_balance) VALUES (?,?,?,?,?)`,
    [name, phone, address, balance, balance]
  );
  if (res.success) {
    showToast(`تم إضافة العميل "${name}" بنجاح `, 'success');
    closeModal('newCustomerModal');
    document.getElementById('newCustName').value = '';
    document.getElementById('newCustPhone').value = '';
    document.getElementById('newCustAddress').value = '';
    document.getElementById('newCustBalance').value = '0';
  } else {
    showToast('حدث خطأ: ' + res.error, 'error');
  }
}

// ─── New Supplier ─────────────────────────────────────────────────────────────
function showNewSupplierModal() { openModal('newSupplierModal'); }
async function saveNewSupplier() {
  const name = document.getElementById('newSuppName').value.trim();
  if (!name) { showToast('الرجاء إدخال اسم المورد', 'error'); return; }
  const phone = document.getElementById('newSuppPhone').value.trim();
  const address = document.getElementById('newSuppAddress').value.trim();
  const balance = parseFloat(document.getElementById('newSuppBalance').value) || 0;
  const res = await window.db.run(
    `INSERT INTO suppliers (name, phone, address, opening_balance, current_balance) VALUES (?,?,?,?,?)`,
    [name, phone, address, balance, balance]
  );
  if (res.success) {
    showToast(`تم إضافة المورد "${name}" بنجاح `, 'success');
    closeModal('newSupplierModal');
    document.getElementById('newSuppName').value = '';
    document.getElementById('newSuppPhone').value = '';
    document.getElementById('newSuppAddress').value = '';
    document.getElementById('newSuppBalance').value = '0';
  } else {
    showToast('حدث خطأ: ' + res.error, 'error');
  }
}

// ─── Advance ──────────────────────────────────────────────────────────────────
async function showAdvanceModal() {
  openModal('advanceModal');
  const res = await window.db.query(`SELECT id, name FROM employees WHERE is_active=1`, []);
  const sel = document.getElementById('advEmpId');
  sel.innerHTML = '<option value="">اختر الموظف</option>';
  if (res.success) {
    res.data.forEach(e => { sel.innerHTML += `<option value="${e.id}">${e.name}</option>`; });
  }
}

async function saveAdvance() {
  const empId = document.getElementById('advEmpId').value;
  const amount = parseFloat(document.getElementById('advAmount').value);
  const notes = document.getElementById('advNotes').value.trim();
  const treasury = document.getElementById('advTreasury').value || 'الخزينة';
  if (!empId || !amount || amount <= 0) { showToast('يرجى اختيار الموظف وإدخال المبلغ', 'error'); return; }
  const res = await window.db.run(
    `INSERT INTO advances (employee_id, amount, notes) VALUES (?,?,?)`, [empId, amount, notes]
  );
  if (res.success) {
    await window.db.addTreasuryEntry('مصروف', `سلفة موظف`, amount, treasury);
    showToast('تم تسجيل السلفة بنجاح ', 'success');
    closeModal('advanceModal');
    document.getElementById('advAmount').value = '';
    document.getElementById('advNotes').value = '';
    loadStats();
  } else {
    showToast('حدث خطأ: ' + res.error, 'error');
  }
}


// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'F1') { e.preventDefault(); navigate('pos-invoice.html'); }
  if (e.key === 'F2') { e.preventDefault(); navigate('daily-report.html'); }
  if (e.key === 'F3') { e.preventDefault(); navigate('finance.html'); }
  if (e.key === 'F4') { e.preventDefault(); showAdvanceModal(); }
});

// ─── Trial Check ─────────────────────────────────────────────────────────────
async function checkTrialStatus() {
  try {
    if (!window.activation || typeof window.activation.getStatus !== 'function') return;
    const status = await window.activation.getStatus();
    const banner = document.getElementById('trialBanner');
    const bannerText = document.getElementById('trialBannerText');

    if (!status.activated && !status.trialExpired) {
      // فترة تجربة نشطة — اعرض التحذير
      banner.style.display = 'flex';
      const days = status.daysLeft;
      bannerText.textContent = days === 1
        ? 'باقي يوم واحد فقط على انتهاء فترة التجربة المجانية!'
        : `باقي ${days} ${days <= 10 ? 'أيام' : 'يوم'} على انتهاء فترة التجربة المجانية`;
      if (days <= 2) {
        banner.style.background = 'linear-gradient(135deg,#7f1d1d,#991b1b)';
        bannerText.style.color = '#FCA5A5';
      }
    } else if (status.trialExpired && !status.activated) {
      // انتهت التجربة أو التفعيل المؤقت — إغلاق كامل للنظام
      banner.style.display = 'flex';
      bannerText.textContent = 'انتهت فترة الصلاحية. الرجاء تفعيل النظام للاستمرار.';
      banner.style.background = 'linear-gradient(135deg,#4a1d1d,#5c1a1a)';
      bannerText.style.color = '#FCA5A5';
      showFullLockOverlay();
    } else if (status.activated && status.isTimed) {
      // تفعيل مؤقت نشط — اعرض الأيام المتبقية كمعلومة
      banner.style.display = 'flex';
      const days = status.daysLeft;
      bannerText.textContent = days === 1
        ? 'باقي يوم واحد فقط على انتهاء اشتراكك!'
        : `اشتراكك الحالي ساري ومتبقي ${days} ${days <= 10 ? 'أيام' : 'يوم'} على انتهائه.`;
      
      // تغيير لون البانر ليكون مختلف (مثلاً أزرق/ذهبي)
      if (days <= 5) {
        banner.style.background = 'linear-gradient(135deg,#7f1d1d,#991b1b)'; // تحذير إذا اقترب الانتهاء
        bannerText.style.color = '#FCA5A5';
      } else {
        banner.style.background = 'linear-gradient(135deg,#1B2A4A,#2d4373)';
        banner.style.borderColor = '#C9A84C';
        bannerText.style.color = '#F8FAFC';
      }
    }
  } catch (e) { /* ignore if activation API not available */ }
}

function showFullLockOverlay() {
  let overlay = document.getElementById('lockOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lockOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
    overlay.style.zIndex = '99999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.backdropFilter = 'blur(10px)';
    
    overlay.innerHTML = `
      <div style="background:var(--card); padding:40px; border-radius:16px; border:1px solid var(--danger); text-align:center; max-width:500px; box-shadow:0 10px 40px rgba(0,0,0,0.5);">
        <div style="margin-bottom:16px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h2 style="color:var(--danger); font-size:24px; font-weight:900; margin-bottom:12px;">انتهت فترة التجربة</h2>
        <p style="color:var(--text-secondary); font-size:15px; line-height:1.6; margin-bottom:24px;">
          لقد انتهت فترة التجربة المجانية للنظام. لم يعد بإمكانك استخدام البرنامج إلا بعد شراء النسخة الكاملة وتفعيلها.
        </p>
        <button class="btn btn-primary" style="width:100%; padding:12px; font-size:16px;" onclick="window.electron.navigate('activation.html')">
          الانتقال لصفحة التفعيل
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
  }
}

// ─── WhatsApp Unread Badge ──────────────────────────────────────────────────
async function updateWhatsAppUnreadBadge() {
  try {
    if (!window.db || !window.db.getWhatsAppUnreadTotal) return;
    const res = await window.db.getWhatsAppUnreadTotal();
    const sideBadge = document.getElementById('sidebarWaBadge');
    const headBadge = document.getElementById('headerWaBadge');

    if (res.success && res.total > 0) {
      if (sideBadge) { sideBadge.textContent = res.total; sideBadge.style.display = 'inline-block'; }
      if (headBadge) { headBadge.textContent = res.total; headBadge.style.display = 'inline-block'; }
    } else {
      if (sideBadge) sideBadge.style.display = 'none';
      if (headBadge) headBadge.style.display = 'none';
    }
  } catch (e) {}
}

if (window.whatsapp && typeof window.whatsapp.onNewMessage === 'function') {
  window.whatsapp.onNewMessage((msg) => {
    // تشغيل صوت الرنين العالي والواضح
    if (typeof playWhatsAppChime === 'function') {
      playWhatsAppChime();
    }
    updateWhatsAppUnreadBadge();

    // إشعار فوري لطيف في أعلى الشاشة يوضح اسم العميل وبداية الرسالة
    if (typeof showToast === 'function') {
      const sender = msg?.sender_name || msg?.phone || 'عميل';
      const text = msg?.message_body ? (msg.message_body.length > 40 ? msg.message_body.substring(0, 40) + '...' : msg.message_body) : 'رسالة جديدة';
      showToast(`رسالة واتساب من [${sender}]: ${text}`, 'info');
    }
  });
}

// ─── Quit Confirmation ────────────────────────────────────────────────────────
if (window.electron && typeof window.electron.onConfirmBackupBeforeQuit === 'function') {
  window.electron.onConfirmBackupBeforeQuit(() => {
    const qModal = document.getElementById('quitModal');
    if (qModal) qModal.classList.add('open');
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadCurrentUser();
loadSystemLogo();
loadStats();
updateWhatsAppUnreadBadge();
updateLowStockBadge();
checkTrialStatus();

// Optimized polling intervals (only run when document is visible)
setInterval(() => {
  if (!document.hidden) {
    loadStats();
  }
}, 8000); // 8s polling is responsive yet gentle on SQLite IPC

setInterval(() => {
  if (!document.hidden) updateWhatsAppUnreadBadge();
}, 15000);

setInterval(() => {
  if (!document.hidden) updateLowStockBadge();
}, 60000);

// Immediate refresh on window focus (e.g. returning from pos-invoice or another tab)
window.addEventListener('focus', () => {
  loadStats();
  updateWhatsAppUnreadBadge();
  updateLowStockBadge();
});

// ─── Low Stock Badge ──────────────────────────────────────────────────────────
async function updateLowStockBadge() {
  try {
    if (!window.inventory) return;
    const res = await window.inventory.getLowStock();
    const count = (res.success && res.data) ? res.data.length : 0;
    const sideBadge = document.getElementById('sidebarInventoryBadge');
    const btnBadge  = document.getElementById('lowStockBadge');
    const dashCount = document.getElementById('dashLowStockCount');
    if (count > 0) {
      if (sideBadge) { sideBadge.textContent = count; sideBadge.style.display = 'inline-block'; }
      if (btnBadge)  { btnBadge.textContent = count;  btnBadge.style.display = 'flex'; }
      if (dashCount) dashCount.innerHTML = `${count} <small style="font-size:11px; font-weight:600; color:#DC2626;">صنف</small>`;
    } else {
      if (sideBadge) sideBadge.style.display = 'none';
      if (btnBadge)  btnBadge.style.display  = 'none';
      if (dashCount) dashCount.innerHTML = `0 <small>صنف</small>`;
    }
  } catch (e) {}
  updateHeaderNotifications();
}

let _currentNotifications = [];

async function updateHeaderNotifications() {
  const dot = document.getElementById('headerNotificationDot');
  const countBadge = document.getElementById('notificationsCountBadge');
  const listEl = document.getElementById('notificationsList');

  _currentNotifications = [];

  // 1. Low stock items check
  try {
    if (window.inventory && typeof window.inventory.getLowStock === 'function') {
      const res = await window.inventory.getLowStock();
      const lowItems = (res.success && res.data) ? res.data : [];
      if (lowItems.length > 0) {
        _currentNotifications.push({
          type: 'warning',
          icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
          title: `نواقص في المخزون (${lowItems.length} صنف)`,
          desc: `أصناف وصلت للحد الأدنى مثل: ${lowItems.slice(0, 2).map(i => i.name).join('، ')}${lowItems.length > 2 ? ' وغيرها' : ''}.`,
          action: () => navigate('inventory-report.html')
        });
      }
    }
  } catch(e) {}

  // 2. Unread WhatsApp messages check
  try {
    if (window.db && typeof window.db.getWhatsAppUnreadTotal === 'function') {
      const res = await window.db.getWhatsAppUnreadTotal();
      if (res && res.success && res.total > 0) {
        _currentNotifications.push({
          type: 'info',
          icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
          title: `رسائل واتساب جديدة (${res.total})`,
          desc: 'يوجد استفسارات ورسائل غير مقروءة من العملاء عبر محادثات الواتساب.',
          action: () => navigate('whatsapp-chat.html')
        });
      }
    }
  } catch(e) {}

  const total = _currentNotifications.length;
  if (dot) dot.style.display = total > 0 ? 'block' : 'none';
  if (countBadge) {
    countBadge.textContent = total;
    countBadge.style.display = total > 0 ? 'inline-block' : 'none';
  }

  if (listEl) {
    if (total === 0) {
      listEl.innerHTML = `
        <div style="padding:22px 16px; text-align:center; color:#64748B; font-size:12px;">
          <div style="width:36px; height:36px; border-radius:50%; background:#F1F5F9; color:#94A3B8; display:flex; align-items:center; justify-content:center; margin:0 auto 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
          <div style="font-weight:700; color:#334155;">لا توجد إشعارات جديدة</div>
          <div style="font-size:11px; color:#94A3B8; margin-top:2px;">كل العمليات والمخزون في حالة ممتازة</div>
        </div>
      `;
    } else {
      listEl.innerHTML = _currentNotifications.map((n, idx) => `
        <div onclick="_currentNotifications[${idx}].action()" style="display:flex; align-items:flex-start; gap:10px; padding:10px 14px; cursor:pointer; transition:background 0.15s; border-bottom:1px solid #F1F5F9;" onmouseover="this.style.background='#F8FAFC'" onmouseout="this.style.background='transparent'">
          <span style="font-size:18px; line-height:1; flex-shrink:0;">${n.icon}</span>
          <div style="flex:1; min-width:0;">
            <div style="font-size:12px; font-weight:800; color:#1E293B; margin-bottom:2px;">${escapeHtml(n.title)}</div>
            <div style="font-size:11px; color:#64748B; line-height:1.4;">${escapeHtml(n.desc)}</div>
          </div>
        </div>
      `).join('');
    }
  }
}

function toggleNotificationsMenu(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('notificationsDropdown');
  if (!dropdown) return;
  const isOpen = dropdown.style.display === 'block';
  dropdown.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    updateHeaderNotifications();
  }
}

document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notificationsDropdown');
  const btn = document.getElementById('headerNotificationBtn');
  if (dropdown && dropdown.style.display === 'block') {
    if (!dropdown.contains(e.target) && !btn?.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  }
});

// ─── Barcode Print Modal ──────────────────────────────────────────────────────
let _allBarcodeItems = [];
let _selectedBarcodeIds = new Set();

async function openPrintBarcodeModal() {
  _selectedBarcodeIds.clear();
  document.getElementById('barcodeSearchInput').value = '';
  document.getElementById('barcodeCopiesInput').value = '1';
  openModal('printBarcodeModal');
  const res = await window.inventory.list({ trackedOnly: false });
  _allBarcodeItems = (res.success && res.data) ? res.data.filter(i => i.barcode) : [];
  searchBarcodeItems();
}

function searchBarcodeItems() {
  const q = (document.getElementById('barcodeSearchInput').value || '').toLowerCase();
  const filtered = _allBarcodeItems.filter(i =>
    i.name.toLowerCase().includes(q) || (i.barcode||'').toLowerCase().includes(q)
  );
  const list = document.getElementById('barcodeItemsList');
  if (!filtered.length) {
    list.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px;">لا توجد أصناف مطابقة</div>';
    updateBarcodeSelectedCount();
    return;
  }
  list.innerHTML = filtered.map(i => {
    const qty = i.quantity != null ? Number(i.quantity) : 0;
    const isAvailable = qty > 0;
    const isChecked = _selectedBarcodeIds.has(i.id);
    return `
    <label style="display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.15s; background:${isChecked ? 'rgba(37,99,235,0.04)' : ''};"
           onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='${isChecked ? 'rgba(37,99,235,0.04)' : ''}'">
      <input type="checkbox" ${isChecked ? 'checked' : ''}
             onchange="toggleBarcodeItem(${i.id}, this.checked)" style="width:17px;height:17px;cursor:pointer;accent-color:var(--primary);" />
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i.name}</div>
        <div style="font-size:11px; color:var(--text-muted); display:flex; gap:8px; align-items:center; margin-top:2px;">
          <span>${i.barcode}</span>
          ${i.category_name ? `<span style="color:var(--border);">•</span><span>${i.category_name}</span>` : ''}
        </div>
      </div>
      <div style="text-align:left; display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0;">
        <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px; ${isAvailable ? 'background:#e6f4ea; color:#137333;' : 'background:#fce8e6; color:#c5221f;'}">
          المتوفر: ${qty}
        </span>
        <span style="font-size:12px; color:var(--success); font-weight:700;">${Number(i.sell_price||0).toFixed(2)} ج.م</span>
      </div>
    </label>
    `;
  }).join('');
  updateBarcodeSelectedCount();
}

function toggleBarcodeItem(id, checked) {
  if (checked) _selectedBarcodeIds.add(id);
  else _selectedBarcodeIds.delete(id);
  updateBarcodeSelectedCount();
}

function selectAllBarcodeItems(check) {
  const q = (document.getElementById('barcodeSearchInput').value || '').toLowerCase();
  const currentList = _allBarcodeItems.filter(i =>
    !q || i.name.toLowerCase().includes(q) || (i.barcode||'').toLowerCase().includes(q)
  );
  currentList.forEach(i => {
    if (check) _selectedBarcodeIds.add(i.id);
    else _selectedBarcodeIds.delete(i.id);
  });
  searchBarcodeItems();
}

function selectAvailableBarcodeItems() {
  const q = (document.getElementById('barcodeSearchInput').value || '').toLowerCase();
  const currentList = _allBarcodeItems.filter(i =>
    !q || i.name.toLowerCase().includes(q) || (i.barcode||'').toLowerCase().includes(q)
  );
  _selectedBarcodeIds.clear();
  currentList.forEach(i => {
    if ((Number(i.quantity) || 0) > 0) {
      _selectedBarcodeIds.add(i.id);
    }
  });
  searchBarcodeItems();
}

function updateBarcodeSelectedCount() {
  const el = document.getElementById('barcodeSelectedCount');
  if (!el) return;
  const n = _selectedBarcodeIds.size;
  if (n === 0) {
    el.innerHTML = '<span style="color:var(--text-muted); font-weight:normal;">لا توجد أصناف محددة</span>';
    return;
  }
  let totalStock = 0;
  _allBarcodeItems.forEach(i => {
    if (_selectedBarcodeIds.has(i.id)) {
      totalStock += Math.max(0, parseInt(i.quantity) || 0);
    }
  });
  el.innerHTML = `تم تحديد <strong style="color:var(--primary);">${n}</strong> صنف &nbsp;|&nbsp; إجمالي الرصيد بالمخزن: <strong style="color:var(--success); font-size:13px;">${totalStock}</strong> قطعة`;
}

// طباعة بعدد نسخ ثابت لكل صنف محدد
async function doPrintBarcodeLabels() {
  if (_selectedBarcodeIds.size === 0) { showToast('يرجى تحديد صنف واحد على الأقل', 'warning'); return; }
  const copies = parseInt(document.getElementById('barcodeCopiesInput').value) || 1;
  const items = _allBarcodeItems.filter(i => _selectedBarcodeIds.has(i.id)).map(i => ({
    id: i.id, name: i.name, barcode: i.barcode, sell_price: i.sell_price, copies
  }));
  showToast(`جارٍ طباعة ${items.length * copies} ملصق...`, 'info');
  const res = await window.inventory.printBarcodeLabels(items, copies);
  if (res.success) showToast('تمت الطباعة بنجاح', 'success');
  else showToast('خطأ في الطباعة: ' + (res.error || ''), 'error');
}

// طباعة بعدد الكمية المتاحة في المخزن لكل صنف محدد بضغطة واحدة
async function doPrintBarcodeByStock() {
  if (_selectedBarcodeIds.size === 0) {
    showToast('يرجى تحديد الأصناف المراد طباعتها أولاً', 'warning');
    return;
  }
  const selectedItems = _allBarcodeItems.filter(i => _selectedBarcodeIds.has(i.id));
  const availableItems = selectedItems.filter(i => (parseInt(i.quantity) || 0) > 0);

  if (availableItems.length === 0) {
    showToast('الأصناف المحددة رصيدها 0 في المخزن، لا توجد كمية متاحة للطباعة', 'warning');
    return;
  }

  const itemsToPrint = availableItems.map(i => ({
    id: i.id,
    name: i.name,
    barcode: i.barcode,
    sell_price: i.sell_price,
    copies: parseInt(i.quantity)
  }));

  const totalLabels = itemsToPrint.reduce((s, it) => s + it.copies, 0);
  showToast(`جارٍ طباعة ${totalLabels} ملصق بعدد الكمية المتاحة...`, 'info');

  const res = await window.inventory.printBarcodeLabels(itemsToPrint, 1);
  if (res.success) {
    showToast(`تمت طباعة ${totalLabels} ملصق باركود بنجاح`, 'success');
  } else {
    showToast('خطأ في الطباعة: ' + (res.error || ''), 'error');
  }
}

// ─── Admin Profile Management ────────────────────────────────────────────────
let adminAvatarBase64 = null;

async function openAdminProfileModal() {
  const modal = document.getElementById('adminProfileModal');
  if (!modal) return;

  // Reset password inputs
  const curPass = document.getElementById('profCurrentPass');
  const newPass = document.getElementById('profNewPass');
  const confPass = document.getElementById('profConfirmPass');
  if (curPass) curPass.value = '';
  if (newPass) newPass.value = '';
  if (confPass) confPass.value = '';

  try {
    if (window.users && typeof window.users.getProfile === 'function') {
      const res = await window.users.getProfile();
      if (res && res.success && res.data) {
        const u = res.data;
        const uName = document.getElementById('profUsername');
        const fName = document.getElementById('profFullName');
        const phone = document.getElementById('profPhone');
        const dispName = document.getElementById('profDisplayName');
        if (uName) uName.value = u.username || '';
        if (fName) fName.value = u.fullName || 'المدير';
        if (phone) phone.value = u.phone || '';
        if (dispName) dispName.textContent = u.fullName || u.username || 'المدير';

        adminAvatarBase64 = u.avatar || null;
        updateAdminAvatarPreview(u.avatar, u.fullName || u.username);
      }
    }
  } catch (err) {
    console.error('Error fetching admin profile:', err);
  }

  modal.classList.add('open');
}

function closeAdminProfileModal() {
  const modal = document.getElementById('adminProfileModal');
  if (modal) modal.classList.remove('open');
}

function updateAdminAvatarPreview(avatarSrc, name = 'المدير') {
  const img = document.getElementById('profAvatarPreview');
  const letter = document.getElementById('profAvatarLetter');
  if (avatarSrc) {
    if (img) { img.src = avatarSrc; img.style.display = 'block'; }
    if (letter) letter.style.display = 'none';
  } else {
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (letter) {
      letter.textContent = (name || 'م').charAt(0);
      letter.style.display = 'block';
    }
  }
}

function handleAdminAvatarUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showToast('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 2 ميجابايت', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    adminAvatarBase64 = e.target.result;
    updateAdminAvatarPreview(adminAvatarBase64, document.getElementById('profFullName')?.value || 'المدير');
  };
  reader.readAsDataURL(file);
}

function removeAdminAvatar() {
  adminAvatarBase64 = '';
  updateAdminAvatarPreview(null, document.getElementById('profFullName')?.value || 'المدير');
}

async function saveAdminProfile() {
  const username = document.getElementById('profUsername')?.value.trim();
  const fullName = document.getElementById('profFullName')?.value.trim();
  const phone = document.getElementById('profPhone')?.value.trim();
  const currentPassword = document.getElementById('profCurrentPass')?.value;
  const newPassword = document.getElementById('profNewPass')?.value;
  const confirmPassword = document.getElementById('profConfirmPass')?.value;

  if (!username) {
    showToast('يرجى إدخال اسم المستخدم', 'warning');
    return;
  }
  if (!fullName) {
    showToast('يرجى إدخال الاسم الكامل للمدير', 'warning');
    return;
  }

  if (newPassword) {
    if (!currentPassword) {
      showToast('يرجى إدخال كلمة المرور الحالية لتغيير كلمة المرور', 'warning');
      return;
    }
    if (newPassword.length < 4) {
      showToast('كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('كلمة المرور الجديدة غير متطابقة مع التأكيد', 'warning');
      return;
    }
  }

  const saveBtn = document.getElementById('btnSaveAdminProfile');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'جارٍ الحفظ...';
  }

  try {
    const res = await window.users.updateProfile({
      username,
      fullName,
      phone,
      currentPassword: currentPassword || undefined,
      newPassword: newPassword || undefined,
      avatar: adminAvatarBase64
    });

    if (res && res.success) {
      showToast('تم تحديث بيانات الملف الشخصي بنجاح', 'success');
      closeAdminProfileModal();

      // Update Header elements immediately
      const headerName = document.getElementById('currentUserName');
      if (headerName) headerName.textContent = fullName;
      sessionStorage.setItem('photoStudio_employeeName', fullName);

      const headerImg = document.getElementById('userAvatarImg');
      const headerLetter = document.getElementById('userAvatarLetter');
      if (adminAvatarBase64) {
        if (headerImg) { headerImg.src = adminAvatarBase64; headerImg.style.display = 'block'; }
        if (headerLetter) headerLetter.style.display = 'none';
      } else {
        if (headerImg) { headerImg.src = ''; headerImg.style.display = 'none'; }
        if (headerLetter) {
          headerLetter.textContent = fullName.charAt(0);
          headerLetter.style.display = 'block';
        }
      }
    } else {
      showToast('فشل التحديث: ' + (res?.error || 'حدث خطأ غير متوقع'), 'error');
    }
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ الملف الشخصي: ' + err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'حفظ التعديلات';
    }
  }
}