const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB_FILE || 'store.db');
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// node:sqlite has no transaction() helper, so this adds one
db.transaction = fn => (...args) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(...args);
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  total_cents INTEGER NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL
);
`);

if (db.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
  const ins = db.prepare('INSERT INTO products (name, description, price_cents, stock, image_url) VALUES (?,?,?,?,?)');
  const img = s => `https://picsum.photos/seed/${s}/600/400`;
  [
    ['Wireless Headphones', 'Over-ear Bluetooth headphones with 30-hour battery life and noise isolation.', 7999, 25, img('headphones')],
    ['Mechanical Keyboard', 'Compact 75% keyboard with hot-swappable switches and RGB backlight.', 8999, 15, img('keyboard')],
    ['Smart Watch', 'Fitness tracking, heart-rate monitor and 7-day battery.', 12999, 10, img('watch')],
    ['Backpack', 'Water-resistant 25L backpack with padded laptop sleeve.', 4999, 40, img('backpack')],
    ['Desk Lamp', 'Adjustable LED lamp with three color temperatures and USB charging.', 2999, 30, img('lamp')],
    ['Ceramic Mug Set', 'Set of four 350ml stoneware mugs, dishwasher safe.', 2499, 50, img('mugs')]
  ].forEach(p => ins.run(...p));
}
module.exports = db;
