'use strict';

const bcrypt = require('bcryptjs');

function seedData(db) {
  // ─── Company Settings ────────────────────────────────────────────────────────
  const settings = db.prepare('SELECT COUNT(*) as cnt FROM company_settings').get();
  if (settings.cnt === 0) {
    db.prepare(`
      INSERT INTO company_settings (id, company_name, receipt_footer, receipt_notes, show_customer_phone, currency, recipe_mode_enabled, delivery_enabled)
      VALUES (1, 'كافيه ومطعم برو', 'شكراً لزيارتكم ونتمنى لكم وقتاً ممتعاً', '', 1, 'جنيه', 0, 0)
    `).run();
  } else {
    try {
      db.prepare(`
        UPDATE company_settings
        SET receipt_notes       = COALESCE(receipt_notes, ''),
            show_customer_phone = COALESCE(show_customer_phone, 1)
        WHERE id = 1
      `).run();
    } catch (e) { /* columns may not exist yet in old schema */ }
  }

  // ─── Invoice Sequence (Resetting Monthly with 4 Digits) ─────────────────────
  const seqRow = db.prepare('SELECT COUNT(*) as cnt FROM invoice_sequence').get();
  if (seqRow.cnt === 0) {
    const now = new Date();
    db.prepare('INSERT INTO invoice_sequence (id, last_number, year, month) VALUES (1, 0, ?, ?)').run(now.getFullYear(), now.getMonth() + 1);
  }

  // ─── Default Admin Employee ──────────────────────────────────────────────────
  const empCount = db.prepare('SELECT COUNT(*) as cnt FROM employees').get();
  if (empCount.cnt === 0) {
    db.prepare(`
      INSERT INTO employees (name, job_title, employee_type, username, password, is_active, monthly_salary)
      VALUES ('مدير النظام', 'مدير', 'مدير', 'admin', 'admin', 1, 0)
    `).run();
  }

  // ─── Default Users (Admin & Cashier) ───────────────────────────────────────
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
  if (userCount.cnt === 0) {
    const adminEmp = db.prepare(`SELECT id FROM employees WHERE username = 'admin' OR job_title = 'مدير' LIMIT 1`).get();
    const empId = adminEmp ? adminEmp.id : null;
    const hash = bcrypt.hashSync('1234', 10);
    db.prepare(`
      INSERT INTO users (employee_id, username, password_hash, role, is_active)
      VALUES (?, 'admin', ?, 'admin', 1)
    `).run(empId, hash);

    // Default Cashier Employee & User
    const cashierEmp = db.prepare(`
      INSERT INTO employees (name, job_title, employee_type, username, password, is_active, monthly_salary)
      VALUES ('كاشير الوردية', 'كاشير', 'كاشير', 'cashier', '1234', 1, 3000)
    `).run();
    db.prepare(`
      INSERT INTO users (employee_id, username, password_hash, role, is_active)
      VALUES (?, 'cashier', ?, 'cashier', 1)
    `).run(cashierEmp.lastInsertRowid, hash);
  }

  // ─── Default Treasury (zero opening balance for all 4 types) ────────────────
  const treasuryTypes = ['الخزينة', 'فودافون كاش', 'إنستا باي', 'فيزا'];
  for (const tType of treasuryTypes) {
    const exists = db.prepare('SELECT id FROM treasury WHERE treasury_type = ? LIMIT 1').get(tType);
    if (!exists) {
      db.prepare(`
        INSERT INTO treasury (type, description, amount, balance_after, treasury_type)
        VALUES ('إيراد', 'رصيد افتتاحي', 0, 0, ?)
      `).run(tType);
    }
  }


  // ─── Default Categories and Items for Cafe/Restaurant ───────────────────────
  try {
    const categories = [
      'مشروبات ساخنة وقهوة',
      'مشروبات باردة ومثلجات',
      'ساندوتشات ووجبات',
      'بيتزا وباستا',
      'حلويات ومخبوزات'
    ];

    const catMap = {};
    for (const catName of categories) {
      let row = db.prepare('SELECT id FROM service_categories WHERE name = ?').get(catName);
      if (!row) {
        const res = db.prepare('INSERT INTO service_categories (name) VALUES (?)').run(catName);
        catMap[catName] = res.lastInsertRowid;
      } else {
        catMap[catName] = row.id;
      }
    }

    const svcCount = db.prepare('SELECT COUNT(*) as cnt FROM services').get();
    if (svcCount && svcCount.cnt <= 5) {
      const menuItems = [
        { cat: 'مشروبات ساخنة وقهوة', name: 'إسبريسو سينجل / دبل', barcode: 'CF-101', sell_price: 35, cost_price: 12, image: '../assets/items/espresso.jpg', has_sizes: 1, sizes: [
          { size_name: 'سينجل (Single)', price: 35, cost_price: 12, recipe_ratio: 1.0, is_default: 1 },
          { size_name: 'دوبل (Double)', price: 50, cost_price: 18, recipe_ratio: 1.8, is_default: 0 }
        ]},
        { cat: 'مشروبات ساخنة وقهوة', name: 'كابتشينو إيطالي كلاسيك', barcode: 'CF-102', sell_price: 55, cost_price: 20, image: '../assets/items/cappuccino.jpg', has_sizes: 1, sizes: [
          { size_name: 'عادي (Regular)', price: 55, cost_price: 20, recipe_ratio: 1.0, is_default: 1 },
          { size_name: 'كبير (Large)', price: 70, cost_price: 26, recipe_ratio: 1.5, is_default: 0 }
        ]},
        { cat: 'مشروبات ساخنة وقهوة', name: 'فانيليا ولاتيه كاراميل', barcode: 'CF-103', sell_price: 65, cost_price: 24, image: '../assets/items/latte.jpg', has_sizes: 1, sizes: [
          { size_name: 'عادي (Regular)', price: 65, cost_price: 24, recipe_ratio: 1.0, is_default: 1 },
          { size_name: 'كبير (Large)', price: 80, cost_price: 30, recipe_ratio: 1.5, is_default: 0 }
        ]},
        { cat: 'مشروبات ساخنة وقهوة', name: 'فلات وايت أسترالي', barcode: 'CF-104', sell_price: 60, cost_price: 22, image: '../assets/items/flat-white.jpg', has_sizes: 1, sizes: [
          { size_name: 'سينجل شوت', price: 60, cost_price: 22, recipe_ratio: 1.0, is_default: 1 },
          { size_name: 'دبل شوت', price: 75, cost_price: 28, recipe_ratio: 1.5, is_default: 0 }
        ]},
        { cat: 'مشروبات ساخنة وقهوة', name: 'شاي كرك بالهيل والزعفران', barcode: 'CF-105', sell_price: 40, cost_price: 15, image: '../assets/items/karak-tea.jpg' },
        { cat: 'مشروبات ساخنة وقهوة', name: 'هوت شوكليت بالمارشميلو', barcode: 'CF-106', sell_price: 60, cost_price: 25, image: '../assets/items/hot-chocolate.jpg' },
        { cat: 'مشروبات ساخنة وقهوة', name: 'قهوة تركي مخصوص بالحبهان', barcode: 'CF-107', sell_price: 30, cost_price: 10, image: '../assets/items/turkish-coffee.jpg', has_sizes: 1, sizes: [
          { size_name: 'سينجل', price: 30, cost_price: 10, recipe_ratio: 1.0, is_default: 1 },
          { size_name: 'مزدوج (دبل)', price: 45, cost_price: 15, recipe_ratio: 1.6, is_default: 0 }
        ]},
        { cat: 'مشروبات باردة ومثلجات', name: 'آيس سبانش لاتيه', barcode: 'CF-201', sell_price: 70, cost_price: 28, image: '../assets/items/iced-latte.jpg' },
        { cat: 'مشروبات باردة ومثلجات', name: 'موهيتو فراولة وليمون نعناع', barcode: 'CF-202', sell_price: 55, cost_price: 18, image: '../assets/items/mojito.jpg' },
        { cat: 'مشروبات باردة ومثلجات', name: 'سموذي مانجو باشن فروت', barcode: 'CF-203', sell_price: 65, cost_price: 22, image: '../assets/items/mango-smoothie.jpg' },
        { cat: 'مشروبات باردة ومثلجات', name: 'أوريو فرابيه بالكريمة', barcode: 'CF-204', sell_price: 75, cost_price: 30, image: '../assets/items/oreo-frappe.jpg' },
        { cat: 'مشروبات باردة ومثلجات', name: 'عصير برتقال فريش طبيعي', barcode: 'CF-205', sell_price: 45, cost_price: 16, image: '../assets/items/orange-juice.jpg' },
        { cat: 'ساندوتشات ووجبات', name: 'كلاسيك بيف برجر تشيز', barcode: 'CF-301', sell_price: 145, cost_price: 75, image: '../assets/items/burger.jpg', has_sizes: 1, sizes: [
          { size_name: 'سينجل (Single)', price: 145, cost_price: 75, recipe_ratio: 1.0, is_default: 1 },
          { size_name: 'دوبل (Double)', price: 195, cost_price: 105, recipe_ratio: 1.6, is_default: 0 }
        ]},
        { cat: 'ساندوتشات ووجبات', name: 'ساندوتش كريسبي تشيكن مدخن', barcode: 'CF-302', sell_price: 130, cost_price: 65, image: '../assets/items/crispy-chicken.jpg' },
        { cat: 'ساندوتشات ووجبات', name: 'كلوب ساندوتش سوبريم', barcode: 'CF-303', sell_price: 110, cost_price: 50, image: '../assets/items/club-sandwich.jpg' },
        { cat: 'ساندوتشات ووجبات', name: 'ستيك ريب آي مشوي بصوص المشروم', barcode: 'CF-304', sell_price: 280, cost_price: 150, image: '../assets/items/ribeye-steak.jpg' },
        { cat: 'ساندوتشات ووجبات', name: 'طبق كوردون بلو محشي جبن', barcode: 'CF-305', sell_price: 185, cost_price: 95, image: '../assets/items/cordon-bleu.jpg' },
        { cat: 'بيتزا وباستا', name: 'بيتزا مارجريتا نابوليتان', barcode: 'CF-401', sell_price: 120, cost_price: 50, image: '../assets/items/pizza-margherita.jpg', has_sizes: 1, sizes: [
          { size_name: 'صغير (Small)', price: 95, cost_price: 40, recipe_ratio: 0.8, is_default: 0 },
          { size_name: 'وسط (Medium)', price: 120, cost_price: 50, recipe_ratio: 1.0, is_default: 1 },
          { size_name: 'كبير (Large)', price: 160, cost_price: 70, recipe_ratio: 1.5, is_default: 0 }
        ]},
        { cat: 'بيتزا وباستا', name: 'بيتزا بيبروني سوبريم', barcode: 'CF-402', sell_price: 155, cost_price: 70, image: '../assets/items/pizza-pepperoni.jpg', has_sizes: 1, sizes: [
          { size_name: 'صغير (Small)', price: 125, cost_price: 55, recipe_ratio: 0.8, is_default: 0 },
          { size_name: 'وسط (Medium)', price: 155, cost_price: 70, recipe_ratio: 1.0, is_default: 1 },
          { size_name: 'كبير (Large)', price: 205, cost_price: 95, recipe_ratio: 1.5, is_default: 0 }
        ]},
        { cat: 'بيتزا وباستا', name: 'باستا فوتشيني ألفريدو دجاج', barcode: 'CF-403', sell_price: 140, cost_price: 65, image: '../assets/items/pasta-alfredo.jpg' },
        { cat: 'بيتزا وباستا', name: 'باستا بيني أرابياتا حارة', barcode: 'CF-404', sell_price: 95, cost_price: 40, image: '../assets/items/penne-arrabbiata.jpg' },
        { cat: 'حلويات ومخبوزات', name: 'تشيز كيك بلوبيري نيويورك', barcode: 'CF-501', sell_price: 85, cost_price: 35, image: '../assets/items/cheesecake.jpg' },
        { cat: 'حلويات ومخبوزات', name: 'كيك لافا شوكولاتة فادج', barcode: 'CF-502', sell_price: 90, cost_price: 40, image: '../assets/items/chocolate-lava.jpg' },
        { cat: 'حلويات ومخبوزات', name: 'وافل بلجيكي بالنوتيلا والفواكه', barcode: 'CF-503', sell_price: 80, cost_price: 32, image: '../assets/items/waffle.jpg' },
        { cat: 'حلويات ومخبوزات', name: 'كرواسون زبدة فرنسي باللوز', barcode: 'CF-504', sell_price: 50, cost_price: 20, image: '../assets/items/croissant.jpg' }
      ];

      const insSvc = db.prepare(`
        INSERT INTO services (category_id, name, barcode, sell_price, cost_price, image, track_inventory, quantity, low_stock_threshold, has_sizes)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, 5, ?)
      `);
      const insSize = db.prepare(`
        INSERT INTO service_sizes (service_id, size_name, price, cost_price, recipe_ratio, is_default)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const item of menuItems) {
        const catId = catMap[item.cat];
        const res = insSvc.run(catId, item.name, item.barcode, item.sell_price, item.cost_price, item.image, item.has_sizes ? 1 : 0);
        if (item.sizes && item.sizes.length > 0) {
          const svcId = res.lastInsertRowid;
          for (const sz of item.sizes) {
            insSize.run(svcId, sz.size_name, sz.price, sz.cost_price, sz.recipe_ratio || 1.0, sz.is_default || 0);
          }
        }
      }
    }
  } catch (e) {
    console.error('Seed services error:', e.message);
  }

  // ─── Default Cafe & Restaurant Tables ───────────────────────────────────────
  try {
    const tblCount = db.prepare('SELECT COUNT(*) as cnt FROM tables').get();
    if (tblCount.cnt === 0) {
      const defaultTables = [
        { name: 'ترابيزة 1', section: 'الصالة الرئيسية', seats: 4 },
        { name: 'ترابيزة 2', section: 'الصالة الرئيسية', seats: 4 },
        { name: 'ترابيزة 3', section: 'الصالة الرئيسية', seats: 2 },
        { name: 'ترابيزة 4', section: 'الصالة الرئيسية', seats: 6 },
        { name: 'عائلية 1', section: 'ركن العائلات', seats: 8 },
        { name: 'عائلية 2', section: 'ركن العائلات', seats: 6 },
        { name: 'تراس 1', section: 'التراس الخارجي', seats: 4 },
        { name: 'تراس 2', section: 'التراس الخارجي', seats: 4 },
        { name: 'صالة VIP 1', section: 'قسم VIP', seats: 6 },
        { name: 'صالة VIP 2', section: 'قسم VIP', seats: 4 }
      ];

      const insTable = db.prepare(`
        INSERT INTO tables (name, section, seats, status, is_active)
        VALUES (?, ?, ?, 'فاضية', 1)
      `);

      defaultTables.forEach((t) => {
        insTable.run(t.name, t.section, t.seats);
      });
      console.log('[Seed] Added 10 default cafe tables.');
    }
  } catch (e) {
    console.error('Seed tables error:', e.message);
  }
}

module.exports = { seedData };
