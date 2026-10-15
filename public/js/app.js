const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = c => '$' + (c / 100).toFixed(2);
const getUser = () => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } };

async function api(path, opts = {}) {
  const t = localStorage.getItem('token');
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && t) { localStorage.removeItem('token'); localStorage.removeItem('user'); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ----- Cart (stored in the browser: [{id, qty}]) -----
const cart = {
  get() { try { return JSON.parse(localStorage.getItem('cart')) || []; } catch { return []; } },
  save(c) { localStorage.setItem('cart', JSON.stringify(c)); renderNav(); },
  add(id, qty = 1) {
    const c = this.get(), i = c.find(x => x.id === id);
    i ? i.qty += qty : c.push({ id, qty });
    this.save(c);
  },
  set(id, qty) { this.save(this.get().map(x => x.id === id ? { ...x, qty } : x)); },
  remove(id) { this.save(this.get().filter(x => x.id !== id)); },
  clear() { this.save([]); },
  count() { return this.get().reduce((n, x) => n + x.qty, 0); }
};

function renderNav() {
  const u = getUser();
  $('header').innerHTML = `<nav>
    <a class="brand" href="/"><img src="/images/logo.jpeg" alt="NeonShop logo" class="logo">NEON<span>SHOP</span></a>
    <a href="/">Products</a>
    <a href="/cart.html">Cart <span class="badge">${cart.count()}</span></a>
    ${u ? `<a href="/orders.html">Orders</a><span class="muted">Hi, ${esc(u.name)}</span><a href="#" id="logout">Logout</a>`
        : `<a href="/login.html">Login / Register</a>`}
  </nav>`;
  const lo = $('#logout');
  if (lo) lo.onclick = e => { e.preventDefault(); localStorage.removeItem('token'); localStorage.removeItem('user'); location.href = '/'; };
}
function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
const showMsg = (el, text, ok) => { el.innerHTML = `<div class="msg ${ok ? 'ok' : ''}">${esc(text)}</div>`; };

const pages = {
  async home() {
    const grid = $('#grid');
    const load = async q => {
      const list = await api('/products?q=' + encodeURIComponent(q || ''));
      grid.innerHTML = list.length ? list.map(p => `<div class="card">
        <a href="/product.html?id=${p.id}"><img src="${esc(p.image_url)}" alt="${esc(p.name)}"></a>
        <div class="body"><a href="/product.html?id=${p.id}"><strong>${esc(p.name)}</strong></a>
        <p class="price">${money(p.price_cents)}</p>
        <button class="btn" data-id="${p.id}" ${p.stock ? '' : 'disabled'}>${p.stock ? 'Add to cart' : 'Sold out'}</button></div></div>`).join('')
        : '<p>No products found.</p>';
    };
    grid.onclick = e => { const b = e.target.closest('button[data-id]'); if (b) { cart.add(+b.dataset.id); b.textContent = 'Added ✓'; toast('Added to cart ⚡'); } };
    grid.onmousemove = e => {            // 3D tilt effect on cards
      const c = e.target.closest('.card'); if (!c) return;
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      c.style.transform = `perspective(700px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateY(-6px)`;
    };
    grid.onmouseout = e => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) c.style.transform = ''; };
    $('#search').oninput = e => load(e.target.value);
    load();
  },

  async product() {
    const id = new URLSearchParams(location.search).get('id');
    try {
      const p = await api('/products/' + encodeURIComponent(id));
      $('#detail').innerHTML = `<img src="${esc(p.image_url)}" alt="${esc(p.name)}"><div>
        <h1>${esc(p.name)}</h1><p class="price" style="font-size:1.5rem">${money(p.price_cents)}</p>
        <p>${esc(p.description)}</p><p class="muted">${p.stock ? p.stock + ' in stock' : 'Out of stock'}</p>
        <input class="qty" id="qty" type="number" min="1" max="${p.stock}" value="1">
        <button class="btn" id="add" ${p.stock ? '' : 'disabled'}>Add to cart</button><p id="note"></p></div>`;
      $('#add').onclick = () => {
        const q = Math.max(1, Math.min(p.stock, parseInt($('#qty').value) || 1));
        cart.add(p.id, q); $('#note').textContent = 'Added to cart ✓'; toast('Added to cart ⚡');
      };
    } catch (e) { $('#detail').innerHTML = `<p>${esc(e.message)}</p>`; }
  },

  async cart() {
    const box = $('#cart');
    const all = await api('/products');
    const draw = () => {
      const lines = cart.get().map(i => ({ ...i, p: all.find(p => p.id === i.id) })).filter(l => l.p);
      if (!lines.length) { box.innerHTML = '<p>Your cart is empty. <a href="/">Keep shopping</a></p>'; return; }
      const total = lines.reduce((s, l) => s + l.p.price_cents * l.qty, 0);
      box.innerHTML = lines.map(l => `<div class="row"><img src="${esc(l.p.image_url)}" alt="">
        <div class="grow"><strong>${esc(l.p.name)}</strong><div class="muted">${money(l.p.price_cents)} each</div></div>
        <input class="qty" type="number" min="1" max="${l.p.stock}" value="${l.qty}" data-id="${l.id}">
        <strong>${money(l.p.price_cents * l.qty)}</strong>
        <button class="btn danger" data-rm="${l.id}">Remove</button></div>`).join('') +
        `<h2>Total: ${money(total)}</h2>
        <label>Shipping address<textarea id="addr" rows="3"></textarea></label>
        <button class="btn" id="checkout">Place order</button><div id="msg"></div>`;
    };
    box.onchange = e => { if (e.target.dataset.id) { cart.set(+e.target.dataset.id, Math.max(1, parseInt(e.target.value) || 1)); draw(); } };
    box.onclick = async e => {
      if (e.target.dataset.rm) { cart.remove(+e.target.dataset.rm); draw(); }
      if (e.target.id === 'checkout') {
        if (!localStorage.getItem('token')) { location.href = '/login.html?next=/cart.html'; return; }
        try {
          const r = await api('/orders', { method: 'POST', body: { items: cart.get(), address: $('#addr').value } });
          cart.clear();
          box.innerHTML = `<div class="msg ok">Order #${r.id} placed! Total ${money(r.total_cents)}. <a href="/orders.html">View orders</a></div>`;
        } catch (err) { showMsg($('#msg'), err.message); }
      }
    };
    draw();
  },

  login() {
    const msg = $('#msg');
    const next = new URLSearchParams(location.search).get('next');
    const go = async (path, body) => {
      try {
        const r = await api(path, { method: 'POST', body });
        localStorage.setItem('token', r.token); localStorage.setItem('user', JSON.stringify(r.user));
        location.href = next && next.startsWith('/') ? next : '/';
      } catch (e) { showMsg(msg, e.message); }
    };
    $('#loginForm').onsubmit = e => { e.preventDefault(); go('/auth/login', { email: $('#lemail').value, password: $('#lpass').value }); };
    $('#regForm').onsubmit = e => { e.preventDefault(); go('/auth/register', { name: $('#rname').value, email: $('#remail').value, password: $('#rpass').value }); };
  },

  async orders() {
    const box = $('#orders');
    if (!localStorage.getItem('token')) { location.href = '/login.html?next=/orders.html'; return; }
    try {
      const list = await api('/orders');
      box.innerHTML = list.length ? list.map(o => `<div class="order"><strong>Order #${o.id}</strong>
        <span class="muted"> · ${esc(o.created_at)} · ${esc(o.status)}</span>
        <ul>${o.items.map(i => `<li>${i.quantity} × ${esc(i.name)} — ${money(i.unit_price_cents)}</li>`).join('')}</ul>
        <strong>Total: ${money(o.total_cents)}</strong><div class="muted">Ship to: ${esc(o.address)}</div></div>`).join('')
        : '<p>No orders yet.</p>';
    } catch (e) { location.href = '/login.html?next=/orders.html'; }
  }
};

renderNav();
pages[document.body.dataset.page]?.();
