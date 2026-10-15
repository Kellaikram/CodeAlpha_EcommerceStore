const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (!process.env.JWT_SECRET) console.warn('WARNING: set JWT_SECRET in production.');

const sign = u => jwt.sign({ id: u.id, name: u.name, email: u.email }, SECRET, { expiresIn: '7d' });

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.user = jwt.verify(h.replace(/^Bearer /, ''), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in first' });
  }
}
module.exports = { sign, requireAuth };
