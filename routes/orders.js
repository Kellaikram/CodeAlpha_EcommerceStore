const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// Totals are computed server-side from DB prices; stock is checked and decremented atomically.
const createOrder = db.transaction((userId, items, address) => {
  let total = 0;
  const lines = [];
  for (const { id, qty } of items) {
    if (!Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'Invalid quantity');
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!p) throw new HttpError(400, `Product ${id} not found`);
    if (p.stock < qty) throw new HttpError(409, `Not enough stock for "${p.name}"`);
    total += p.price_cents * qty;
    lines.push([p, qty]);
  }
  const orderId = db.prepare('INSERT INTO orders (user_id, total_cents, address) VALUES (?,?,?)').run(userId, total, address).lastInsertRowid;
  for (const [p, qty] of lines) {
    db.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES (?,?,?,?)').run(orderId, p.id, qty, p.price_cents);
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, p.id);
  }
  return { orderId, total };
});

router.post('/', requireAuth, (req, res, next) => {
  try {
    const { items, address } = req.body || {};
    if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Cart is empty');
    if (!address || !address.trim()) throw new HttpError(400, 'Shipping address required');
    const r = createOrder(req.user.id, items, address.trim());
    res.status(201).json({ id: r.orderId, total_cents: r.total });
  } catch (e) { next(e); }
});

router.get('/', requireAuth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  const itemsStmt = db.prepare(`SELECT oi.quantity, oi.unit_price_cents, p.name FROM order_items oi
    JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`);
  res.json(orders.map(o => ({ ...o, items: itemsStmt.all(o.id) })));
});
module.exports = router;
