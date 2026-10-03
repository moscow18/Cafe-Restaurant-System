const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'cafepro-system', 'photostudio.db');
const db = new Database(dbPath);

const cats = db.prepare('SELECT * FROM service_categories').all();
const items = db.prepare('SELECT s.id, s.name, s.sell_price, s.image, sc.name as category FROM services s JOIN service_categories sc ON s.category_id=sc.id').all();

const out = [];
out.push(`Categories count: ${cats.length}`);
cats.forEach(c => out.push(` - ${c.id}: ${c.name}`));
out.push(`Services count: ${items.length}`);
items.forEach(i => out.push(` - [${i.category}] ${i.name} (${i.sell_price} EGP) -> ${i.image}`));

fs.writeFileSync(path.join(__dirname, 'db-output.txt'), out.join('\n'), 'utf8');
process.exit(0);
