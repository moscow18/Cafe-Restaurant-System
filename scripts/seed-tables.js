const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'cafepro-system', 'photostudio.db');
console.log('[Seed Tables] Target database:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.error('[Seed Tables] Database file not found at:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

// Check if tables table exists
const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tables'").get();
if (!tableInfo) {
  console.log('[Seed Tables] Creating tables table...');
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      section TEXT,
      seats INTEGER DEFAULT 4,
      status TEXT DEFAULT 'فاضية',
      is_active INTEGER DEFAULT 1,
      reservation_name TEXT,
      reservation_time TEXT,
      reservation_phone TEXT,
      reservation_party_size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

// Clear any fake status, reset all tables to clean state
const existing = db.prepare('SELECT COUNT(*) as cnt FROM tables').get();
console.log('[Seed Tables] Existing tables count:', existing.cnt);

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

// Clear and insert standard clean tables
db.prepare('DELETE FROM tables').run();
const insert = db.prepare('INSERT INTO tables (name, section, seats, status, is_active) VALUES (?, ?, ?, ?, 1)');
const insertMany = db.transaction((items) => {
  for (const t of items) {
    insert.run(t.name, t.section, t.seats, 'فاضية');
  }
});
insertMany(defaultTables);
console.log('[Seed Tables] Reset and inserted 10 clean tables.');

const all = db.prepare('SELECT id, name, section, seats, status FROM tables WHERE is_active = 1').all();
console.log('[Seed Tables] Active tables in DB:', all);
