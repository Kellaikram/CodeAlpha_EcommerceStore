const router = require('express').Router();
const db = require('../db');

router.get('/', (req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(db.prepare('SELECT * FROM products WHERE name LIKE ? OR description LIKE ? ORDER BY id').all(q, q));
});

router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  p ? res.json(p) : res.status(404).json({ error: 'Product not found' });
});
module.exports = router;
