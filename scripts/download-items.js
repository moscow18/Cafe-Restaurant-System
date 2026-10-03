const fs = require('fs');
const path = require('path');
const https = require('https');

const itemsDir = path.join(__dirname, '..', 'assets', 'items');
if (!fs.existsSync(itemsDir)) {
  fs.mkdirSync(itemsDir, { recursive: true });
}

const images = [
  { name: 'espresso.jpg', url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80' },
  { name: 'cappuccino.jpg', url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&auto=format&fit=crop&q=80' },
  { name: 'latte.jpg', url: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=400&auto=format&fit=crop&q=80' },
  { name: 'flat-white.jpg', url: 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=400&auto=format&fit=crop&q=80' },
  { name: 'karak-tea.jpg', url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&auto=format&fit=crop&q=80' },
  { name: 'hot-chocolate.jpg', url: 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=400&auto=format&fit=crop&q=80' },
  { name: 'turkish-coffee.jpg', url: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400&auto=format&fit=crop&q=80' },
  { name: 'iced-latte.jpg', url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400&auto=format&fit=crop&q=80' },
  { name: 'mojito.jpg', url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&auto=format&fit=crop&q=80' },
  { name: 'mango-smoothie.jpg', url: 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=400&auto=format&fit=crop&q=80' },
  { name: 'oreo-frappe.jpg', url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&auto=format&fit=crop&q=80' },
  { name: 'orange-juice.jpg', url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400&auto=format&fit=crop&q=80' },
  { name: 'burger.jpg', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&auto=format&fit=crop&q=80' },
  { name: 'crispy-chicken.jpg', url: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=400&auto=format&fit=crop&q=80' },
  { name: 'club-sandwich.jpg', url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&auto=format&fit=crop&q=80' },
  { name: 'ribeye-steak.jpg', url: 'https://images.unsplash.com/photo-1558030006-450675393462?w=400&auto=format&fit=crop&q=80' },
  { name: 'cordon-bleu.jpg', url: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&auto=format&fit=crop&q=80' },
  { name: 'pizza-margherita.jpg', url: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=400&auto=format&fit=crop&q=80' },
  { name: 'pizza-pepperoni.jpg', url: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400&auto=format&fit=crop&q=80' },
  { name: 'pasta-alfredo.jpg', url: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=400&auto=format&fit=crop&q=80' },
  { name: 'penne-arrabbiata.jpg', url: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281691?w=400&auto=format&fit=crop&q=80' },
  { name: 'cheesecake.jpg', url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=400&auto=format&fit=crop&q=80' },
  { name: 'chocolate-lava.jpg', url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400&auto=format&fit=crop&q=80' },
  { name: 'waffle.jpg', url: 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?w=400&auto=format&fit=crop&q=80' },
  { name: 'croissant.jpg', url: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&auto=format&fit=crop&q=80' },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (targetUrl) => {
      https.get(targetUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          get(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: status ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(dest));
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };
    get(url);
  });
}

async function run() {
  console.log(`Starting download of ${images.length} images...`);
  for (const item of images) {
    const dest = path.join(itemsDir, item.name);
    try {
      await download(item.url, dest);
      console.log(`[OK] Saved: ${item.name}`);
    } catch (err) {
      console.error(`[ERR] Failed ${item.name}: ${err.message}`);
    }
  }
  console.log('All downloads finished!');
}

run();
