const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, requireAuth } = require('../middleware/auth');

const publicUser = u => ({ id: u.id, name: u.name, email: u.email });

router.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid name and email required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase()))
    return res.status(409).json({ error: 'Email already registered' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?,?,?)').run(name.trim(), email.toLowerCase(), hash);
  const user = { id: r.lastInsertRowid, name: name.trim(), email: email.toLowerCase() };
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(u), user: publicUser(u) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
module.exports = router;
