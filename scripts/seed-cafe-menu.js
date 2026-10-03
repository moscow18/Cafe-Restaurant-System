const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'cafepro-system', 'photostudio.db');
console.log('[Seed] Target database:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.error('[Seed] Database file not found at:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

const categories = [
  'مشروبات ساخنة وقهوة',
  'مشروبات باردة ومثلجات',
  'ساندوتشات ووجبات',
  'بيتزا وباستا',
  'حلويات ومخبوزات'
];

const menuItems = [
  // 1. مشروبات ساخنة وقهوة
  { cat: 'مشروبات ساخنة وقهوة', name: 'إسبريسو سينجل / دبل', barcode: 'CF-101', sell_price: 35, cost_price: 12, image: '../assets/items/espresso.jpg' },
  { cat: 'مشروبات ساخنة وقهوة', name: 'كابتشينو إيطالي كلاسيك', barcode: 'CF-102', sell_price: 55, cost_price: 20, image: '../assets/items/cappuccino.jpg' },
  { cat: 'مشروبات ساخنة وقهوة', name: 'فانيليا ولاتيه كاراميل', barcode: 'CF-103', sell_price: 65, cost_price: 24, image: '../assets/items/latte.jpg' },
  { cat: 'مشروبات ساخنة وقهوة', name: 'فلات وايت أسترالي', barcode: 'CF-104', sell_price: 60, cost_price: 22, image: '../assets/items/flat-white.jpg' },
  { cat: 'مشروبات ساخنة وقهوة', name: 'شاي كرك بالهيل والزعفران', barcode: 'CF-105', sell_price: 40, cost_price: 15, image: '../assets/items/karak-tea.jpg' },
  { cat: 'مشروبات ساخنة وقهوة', name: 'هوت شوكليت بالمارشميلو', barcode: 'CF-106', sell_price: 60, cost_price: 25, image: '../assets/items/hot-chocolate.jpg' },
  { cat: 'مشروبات ساخنة وقهوة', name: 'قهوة تركي مخصوص بالحبهان', barcode: 'CF-107', sell_price: 30, cost_price: 10, image: '../assets/items/turkish-coffee.jpg' },

  // 2. مشروبات باردة ومثلجات
  { cat: 'مشروبات باردة ومثلجات', name: 'آيس سبانش لاتيه', barcode: 'CF-201', sell_price: 70, cost_price: 28, image: '../assets/items/iced-latte.jpg' },
  { cat: 'مشروبات باردة ومثلجات', name: 'موهيتو فراولة وليمون نعناع', barcode: 'CF-202', sell_price: 55, cost_price: 18, image: '../assets/items/mojito.jpg' },
  { cat: 'مشروبات باردة ومثلجات', name: 'سموذي مانجو باشن فروت', barcode: 'CF-203', sell_price: 65, cost_price: 22, image: '../assets/items/mango-smoothie.jpg' },
  { cat: 'مشروبات باردة ومثلجات', name: 'أوريو فرابيه بالكريمة', barcode: 'CF-204', sell_price: 75, cost_price: 30, image: '../assets/items/oreo-frappe.jpg' },
  { cat: 'مشروبات باردة ومثلجات', name: 'عصير برتقال فريش طبيعي', barcode: 'CF-205', sell_price: 45, cost_price: 16, image: '../assets/items/orange-juice.jpg' },

  // 3. ساندوتشات ووجبات
  { cat: 'ساندوتشات ووجبات', name: 'كلاسيك بيف برجر تشيز', barcode: 'CF-301', sell_price: 145, cost_price: 75, image: '../assets/items/burger.jpg' },
  { cat: 'ساندوتشات ووجبات', name: 'ساندوتش كريسبي تشيكن مدخن', barcode: 'CF-302', sell_price: 130, cost_price: 65, image: '../assets/items/crispy-chicken.jpg' },
  { cat: 'ساندوتشات ووجبات', name: 'كلوب ساندوتش سوبريم', barcode: 'CF-303', sell_price: 110, cost_price: 50, image: '../assets/items/club-sandwich.jpg' },
  { cat: 'ساندوتشات ووجبات', name: 'ستيك ريب آي مشوي بصوص المشروم', barcode: 'CF-304', sell_price: 280, cost_price: 150, image: '../assets/items/ribeye-steak.jpg' },
  { cat: 'ساندوتشات ووجبات', name: 'طبق كوردون بلو محشي جبن', barcode: 'CF-305', sell_price: 185, cost_price: 95, image: '../assets/items/cordon-bleu.jpg' },

  // 4. بيتزا وباستا
  { cat: 'بيتزا وباستا', name: 'بيتزا مارجريتا نابوليتان', barcode: 'CF-401', sell_price: 120, cost_price: 50, image: '../assets/items/pizza-margherita.jpg' },
  { cat: 'بيتزا وباستا', name: 'بيتزا بيبروني سوبريم', barcode: 'CF-402', sell_price: 155, cost_price: 70, image: '../assets/items/pizza-pepperoni.jpg' },
  { cat: 'بيتزا وباستا', name: 'باستا فوتشيني ألفريدو دجاج', barcode: 'CF-403', sell_price: 140, cost_price: 65, image: '../assets/items/pasta-alfredo.jpg' },
  { cat: 'بيتزا وباستا', name: 'باستا بيني أرابياتا حارة', barcode: 'CF-404', sell_price: 95, cost_price: 40, image: '../assets/items/penne-arrabbiata.jpg' },

  // 5. حلويات ومخبوزات
  { cat: 'حلويات ومخبوزات', name: 'تشيز كيك بلوبيري نيويورك', barcode: 'CF-501', sell_price: 85, cost_price: 35, image: '../assets/items/cheesecake.jpg' },
  { cat: 'حلويات ومخبوزات', name: 'كيك لافا شوكولاتة فادج', barcode: 'CF-502', sell_price: 90, cost_price: 40, image: '../assets/items/chocolate-lava.jpg' },
  { cat: 'حلويات ومخبوزات', name: 'وافل بلجيكي بالنوتيلا والفواكه', barcode: 'CF-503', sell_price: 80, cost_price: 32, image: '../assets/items/waffle.jpg' },
  { cat: 'حلويات ومخبوزات', name: 'كرواسون زبدة فرنسي باللوز', barcode: 'CF-504', sell_price: 50, cost_price: 20, image: '../assets/items/croissant.jpg' }
];

db.transaction(() => {
  // 1. Ensure categories exist
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

  // 2. Insert or update menu items
  const checkSvc = db.prepare('SELECT id FROM services WHERE barcode = ? OR name = ?');
  const insertSvc = db.prepare(`
    INSERT INTO services (category_id, name, barcode, sell_price, cost_price, image, track_inventory, quantity, low_stock_threshold)
    VALUES (?, ?, ?, ?, ?, ?, 0, 100, 5)
  `);
  const updateSvc = db.prepare(`
    UPDATE services 
    SET category_id = ?, sell_price = ?, cost_price = ?, image = ?
    WHERE id = ?
  `);

  let added = 0;
  let updated = 0;

  for (const item of menuItems) {
    const catId = catMap[item.cat];
    const existing = checkSvc.get(item.barcode, item.name);
    if (existing) {
      updateSvc.run(catId, item.sell_price, item.cost_price, item.image, existing.id);
      updated++;
    } else {
      insertSvc.run(catId, item.name, item.barcode, item.sell_price, item.cost_price, item.image);
      added++;
    }
  }

  console.log(`[Seed Result] Categories ready. Items added: ${added}, Items updated: ${updated}`);
})();

process.exit(0);
