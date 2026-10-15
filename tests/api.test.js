// tests/api.test.js  —  run with: npm test
// Starts the real server on port 3999 with a throwaway database, then calls every API route.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 3999;
const BASE = `http://localhost:${PORT}/api`;
const DB_FILE = path.join(__dirname, 'test.db');
const email = `test${Date.now()}@example.com`;
const password = 'password123';
let server;
let token;

async function call(p, { method = 'GET', body, auth } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const cleanDb = () => {
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) {
    try { fs.rmSync(f, { force: true }); } catch { /* file still locked, ignore */ }
  }
};

before(async () => {
  cleanDb();
  server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DB_FILE, JWT_SECRET: 'test-secret' },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/products'); return; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  throw new Error('Server did not start');
});

after(() => { server.kill(); });

// ---------- Products ----------
test('GET /products returns the 6 seeded products', async () => {
  const r = await call('/products');
  assert.equal(r.status, 200);
  assert.equal(r.data.length, 6);
});

test('GET /products?q= filters by name or description', async () => {
  assert.equal((await call('/products?q=keyboard')).data.length, 1);
  assert.equal((await call('/products?q=zzzzzz')).data.length, 0);
});

test('GET /products/:id returns one product, 404 if missing', async () => {
  const ok = await call('/products/1');
  assert.equal(ok.status, 200);
  assert.equal(ok.data.id, 1);
  assert.equal((await call('/products/9999')).status, 404);
});

// ---------- Auth ----------
test('register rejects bad input', async () => {
  const short = await call('/auth/register', { method: 'POST', body: { name: 'A', email, password: '123' } });
  assert.equal(short.status, 400);
  const badEmail = await call('/auth/register', { method: 'POST', body: { name: 'A', email: 'nope', password } });
  assert.equal(badEmail.status, 400);
});

test('register creates a user and returns a token', async () => {
  const r = await call('/auth/register', { method: 'POST', body: { name: 'Test User', email, password } });
  assert.equal(r.status, 201);
  assert.ok(r.data.token);
  assert.equal(r.data.user.email, email);
  assert.equal(r.data.user.password_hash, undefined);
});

test('register rejects a duplicate email', async () => {
  const r = await call('/auth/register', { method: 'POST', body: { name: 'Again', email, password } });
  assert.equal(r.status, 409);
});

test('login fails with a wrong password', async () => {
  const r = await call('/auth/login', { method: 'POST', body: { email, password: 'wrong-password' } });
  assert.equal(r.status, 401);
});

test('login succeeds with correct credentials', async () => {
  const r = await call('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(r.status, 200);
  token = r.data.token;
  assert.ok(token);
});

test('GET /auth/me needs a valid token', async () => {
  assert.equal((await call('/auth/me')).status, 401);
  const r = await call('/auth/me', { auth: token });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.email, email);
});

// ---------- Orders ----------
test('orders routes require login', async () => {
  assert.equal((await call('/orders')).status, 401);
  assert.equal((await call('/orders', { method: 'POST', body: { items: [{ id: 1, qty: 1 }], address: 'x' } })).status, 401);
});

test('order validation errors', async () => {
  const post = body => call('/orders', { method: 'POST', body, auth: token });
  assert.equal((await post({ items: [], address: 'Meknes' })).status, 400);               // empty cart
  assert.equal((await post({ items: [{ id: 1, qty: 1 }], address: '  ' })).status, 400);  // no address
  assert.equal((await post({ items: [{ id: 1, qty: 0 }], address: 'Meknes' })).status, 400); // bad qty
  assert.equal((await post({ items: [{ id: 9999, qty: 1 }], address: 'Meknes' })).status, 400); // unknown product
  assert.equal((await post({ items: [{ id: 1, qty: 9999 }], address: 'Meknes' })).status, 409); // not enough stock
});

test('successful order: correct total and stock is reduced', async () => {
  const before = (await call('/products/1')).data.stock;
  const r = await call('/orders', { method: 'POST', auth: token, body: { items: [{ id: 1, qty: 2 }], address: '12 Rue Test, Meknes' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.total_cents, 2 * 7999);
  const after = (await call('/products/1')).data.stock;
  assert.equal(after, before - 2);
});

test('client-sent prices are ignored (total comes from the database)', async () => {
  const r = await call('/orders', {
    method: 'POST', auth: token,
    body: { items: [{ id: 2, qty: 1, price_cents: 1 }], address: '12 Rue Test, Meknes' }
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.total_cents, 8999);
});

test('GET /orders returns my orders, newest first, with items', async () => {
  const r = await call('/orders', { auth: token });
  assert.equal(r.status, 200);
  assert.equal(r.data.length, 2);
  assert.equal(r.data[0].total_cents, 8999);
  assert.equal(r.data[1].items[0].quantity, 2);
  assert.equal(r.data[1].items[0].name, 'Wireless Headphones');
});

test('another user cannot see my orders', async () => {
  const other = await call('/auth/register', { method: 'POST', body: { name: 'Other', email: `other${Date.now()}@example.com`, password } });
  const r = await call('/orders', { auth: other.data.token });
  assert.equal(r.data.length, 0);
});

test('unknown API route returns 404 JSON', async () => {
  assert.equal((await call('/nope')).status, 404);
});
