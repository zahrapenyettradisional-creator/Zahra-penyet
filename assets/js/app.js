/* Zahra Penyet — website pelanggan (v3) */
(function () {
"use strict";
const cfg = window.ZAHRA_CONFIG || {};
const $ = id => document.getElementById(id);
const LS = { cart: "zp_cart_v3", menu: "zp_menu_v3", cust: "zp_cust_v3" };
const ALL_TYPES = ["Makan di tempat", "Bawa pulang", "Antar"];
const FALLBACK_IMG = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e7f4dc"/><text x="200" y="165" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" fill="#1f7a4d" font-weight="bold">Zahra Penyet</text></svg>');
const DEMO_MENU = [
  { id: "m1", name: "Ayam Penyet", price: 18000, category: "Penyetan", description: "Ayam goreng, sambal pilihan, nasi dan lalapan.", image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=700&q=80", available: true, badge: "Best Seller" },
  { id: "m2", name: "Lele Penyet", price: 15000, category: "Penyetan", description: "Lele goreng renyah dengan sambal dan lalapan.", image: "https://images.unsplash.com/photo-1515003197210-e0cd7184f8b5?auto=format&fit=crop&w=700&q=80", available: true },
  { id: "m6", name: "Paket Komplit", price: 25000, category: "Penyetan", description: "Ayam, nasi, tahu, tempe, sambal dan lalapan.", image: "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=700&q=80", available: true, badge: "Favorit" },
  { id: "m3", name: "Tempe Tahu", price: 7000, category: "Tambahan", description: "Gorengan hangat pelengkap makanmu.", image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=80", available: true },
  { id: "m5", name: "Nasi Putih", price: 5000, category: "Tambahan", description: "Nasi putih hangat.", image: "https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=700&q=80", available: true },
  { id: "m4", name: "Es Teh", price: 5000, category: "Minuman", description: "Teh segar, teman makan paling pas.", image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=700&q=80", available: true }
];

const state = { menu: [], settings: {}, cart: {}, category: "Semua", q: "", sort: "default", orderType: "Bawa pulang", busy: false, offline: false, lastLoad: 0 };

/* ---------- util ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const money = n => "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => { u = String(u || "").trim(); return /^https?:\/\//i.test(u) ? u : ""; };
let toastTimer;
function toast(t, ms) { const x = $("toast"); x.textContent = t; x.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => x.classList.remove("show"), ms || 2600); }
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const FALLBACK = { phone: () => cfg.WHATSAPP, address: () => cfg.ADDRESS, hours: () => cfg.HOURS, maps_url: () => cfg.MAPS_URL, instagram: () => cfg.INSTAGRAM };
function S(k) {
  const v = state.settings[k];
  if (v !== undefined && v !== null && String(v) !== "") return String(v);
  return FALLBACK[k] ? String(FALLBACK[k]() || "") : "";
}
const listOf = k => S(k).split(",").map(x => x.trim()).filter(Boolean);
function waNumber() { let d = S("phone").replace(/\D/g, ""); if (d.charAt(0) === "0") d = "62" + d.slice(1); return d; }
function prettyPhone(d) { d = String(d || "").replace(/\D/g, ""); if (d.indexOf("62") === 0) { const r = d.slice(2); return "+62 " + r.slice(0, 3) + "-" + r.slice(3, 7) + (r.length > 7 ? "-" + r.slice(7) : ""); } return d; }

/* ---------- jam buka (WIB) ---------- */
function nowMinutesWIB() {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return +p.find(x => x.type === "hour").value * 60 + +p.find(x => x.type === "minute").value;
}
const toMin = t => { const m = /^(\d\d):(\d\d)$/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
function storeStatus() {
  const mode = S("open_mode") || "auto";
  if (mode === "open") return { open: true, label: "Buka sekarang" };
  if (mode === "closed") return { open: false, label: "Sedang tutup" };
  const o = toMin(S("open_time")), c = toMin(S("close_time"));
  if (o === null || c === null) return { open: null, label: "" };
  const n = nowMinutesWIB(), open = o <= c ? (n >= o && n < c) : (n >= o || n < c);
  const f = t => t.replace(":", ".");
  return open ? { open: true, label: "Buka · tutup " + f(S("close_time")) } : { open: false, label: "Tutup · buka " + f(S("open_time")) };
}

/* ---------- data ---------- */
async function fetchJson(url, opts, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 15000);
  try {
    const r = await fetch(url, Object.assign({ signal: ctl.signal }, opts || {}));
    return await r.json();
  } catch (e) { e.network = true; throw e; } finally { clearTimeout(t); }
}
const apiGet = action => fetchJson(cfg.API_URL + (cfg.API_URL.indexOf("?") > -1 ? "&" : "?") + "action=" + action);
const apiPost = (action, data) => fetchJson(cfg.API_URL, { method: "POST", body: JSON.stringify(Object.assign({ action }, data)) });

async function load(silent) {
  if (!cfg.API_URL) {
    if (!state.menu.length) { state.menu = DEMO_MENU; state.offline = true; }
    return renderAll();
  }
  try {
    const r = await apiGet("getData");
    if (!r || !r.success) throw new Error((r && r.message) || "gagal");
    state.menu = r.menu || []; state.settings = r.settings || {}; state.offline = false; state.lastLoad = Date.now();
    store.set(LS.menu, { menu: state.menu, settings: state.settings, t: Date.now() });
    pruneCart();
  } catch (e) {
    if (!state.menu.length) { state.menu = DEMO_MENU; state.offline = true; if (!silent) toast("Server belum terhubung — menampilkan menu contoh.", 4000); }
  }
  renderAll();
}
function pruneCart() {
  let removed = 0;
  Object.keys(state.cart).forEach(id => { const m = state.menu.find(x => String(x.id) === id); if (!m || m.available === false) { delete state.cart[id]; removed++; } });
  if (removed) { persistCart(); toast("Beberapa menu di keranjang sudah habis dan dihapus."); }
}

/* ---------- render: menu ---------- */
function categories() { const seen = []; state.menu.forEach(m => { if (m.category && seen.indexOf(m.category) < 0) seen.push(m.category); }); return seen; }
function renderFilters() {
  const cats = ["Semua"].concat(categories());
  if (cats.indexOf(state.category) < 0) state.category = "Semua";
  $("filters").innerHTML = cats.map(c => `<button class="filter${c === state.category ? " active" : ""}" role="tab" aria-selected="${c === state.category}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
}
function visibleMenu() {
  const q = state.q.trim().toLowerCase();
  const list = state.menu.filter(m => (state.category === "Semua" || m.category === state.category) &&
    (!q || (m.name + " " + (m.description || "") + " " + m.category).toLowerCase().indexOf(q) > -1));
  const cmp = { default: () => 0, low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, az: (a, b) => a.name.localeCompare(b.name, "id") }[state.sort];
  return list.sort((a, b) => ((a.available === false) - (b.available === false)) || cmp(a, b));
}
function cardAction(m) {
  if (m.available === false) return '<button class="add-btn" disabled>Habis</button>';
  const q = state.cart[m.id] || 0;
  return q > 0
    ? `<div class="card-qty"><button data-act="dec" data-id="${esc(m.id)}" aria-label="Kurangi ${esc(m.name)}">−</button><b>${q}</b><button data-act="inc" data-id="${esc(m.id)}" aria-label="Tambah ${esc(m.name)}">+</button></div>`
    : `<button class="add-btn" data-act="add" data-id="${esc(m.id)}">+ Tambah ke keranjang</button>`;
}
function renderMenu() {
  const list = visibleMenu();
  $("menuGrid").innerHTML = list.length ? list.map(m => {
    const out = m.available === false, img = safeUrl(m.image) || FALLBACK_IMG;
    const orig = Number(m.original_price) > Number(m.price) ? `<s>${money(m.original_price)}</s>` : "";
    return `<article class="menu-card${out ? " is-out" : ""}" data-id="${esc(m.id)}">
      <div class="card-img"><img loading="lazy" src="${esc(img)}" alt="${esc(m.name)}" width="700" height="410" data-fallback>${m.badge ? `<span class="badge">${esc(m.badge)}</span>` : ""}${out ? '<span class="sold">Habis</span>' : ""}</div>
      <div class="menu-info"><h3>${esc(m.name)}</h3><p>${esc(m.description || "Menu lezat dari Zahra Penyet.")}</p>
      <div class="price-row"><span><b class="price">${money(m.price)}</b>${orig}</span><span class="eyebrow">${esc(m.category)}</span></div>
      <div class="card-action">${cardAction(m)}</div></div></article>`;
  }).join("") : `<p class="empty wide">${state.q ? "Tidak ada menu yang cocok dengan “" + esc(state.q) + "”." : "Belum ada menu pada kategori ini."}</p>`;
}
function refreshActions() {
  document.querySelectorAll(".menu-card").forEach(c => {
    const m = state.menu.find(x => String(x.id) === c.dataset.id), a = c.querySelector(".card-action");
    if (m && a) a.innerHTML = cardAction(m);
  });
}
function renderSkeleton() { $("menuGrid").innerHTML = Array(6).fill('<div class="menu-card skeleton"><div class="card-img"></div><div class="menu-info"><i></i><i></i><i class="short"></i></div></div>').join(""); }

/* ---------- render: info toko ---------- */
function renderStatic() {
  const phone = waNumber(), addr = S("address"), hrs = S("hours") || (S("open_time") && S("close_time") ? S("open_time").replace(":", ".") + " – " + S("close_time").replace(":", ".") + " WIB" : "");
  $("contactPhone").textContent = phone ? prettyPhone(phone) : "Nomor WhatsApp belum diatur";
  $("contactAddress").textContent = addr || "Alamat belum diatur";
  $("contactHours").textContent = hrs || "Jam operasional belum dikonfirmasi";
  const wa = phone ? "https://wa.me/" + phone : "#";
  $("contactWa").href = wa; $("waFab").href = wa; $("waFab").hidden = !phone;
  const maps = S("maps_url") || (addr ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr) : "");
  $("contactMap").hidden = !maps; if (maps) $("contactMap").href = maps;
  const ig = S("instagram").replace(/^@/, "");
  $("contactIg").hidden = !ig; if (ig) $("contactIg").href = "https://instagram.com/" + encodeURIComponent(ig);
  const an = S("announcement"); $("announce").hidden = !an; $("announce").textContent = an;
  renderStatus(); renderJsonLd(phone, addr);
}
function renderStatus() {
  const st = storeStatus(), pill = $("statusPill"), dot = $("contactStatus");
  pill.hidden = dot.hidden = st.open === null;
  if (st.open === null) return;
  pill.textContent = dot.textContent = st.label;
  pill.className = "status-pill " + (st.open ? "on" : "off"); dot.className = "open-dot " + (st.open ? "on" : "off");
}
function renderJsonLd(phone, addr) {
  let tag = $("ldjson");
  if (!tag) { tag = document.createElement("script"); tag.type = "application/ld+json"; tag.id = "ldjson"; document.head.appendChild(tag); }
  const o = { "@context": "https://schema.org", "@type": "Restaurant", name: cfg.STORE_NAME || "Zahra Penyet", servesCuisine: "Indonesian", url: location.href.split("#")[0] };
  if (phone) o.telephone = "+" + phone;
  if (addr) o.address = { "@type": "PostalAddress", streetAddress: addr, addressLocality: "Semarang", addressCountry: "ID" };
  tag.textContent = JSON.stringify(o);
}

/* ---------- keranjang ---------- */
const persistCart = () => store.set(LS.cart, state.cart);
function setQty(id, q) {
  id = String(id);
  if (q <= 0) delete state.cart[id]; else state.cart[id] = Math.min(q, 50);
  persistCart(); renderCart(); refreshActions();
}
function totals() {
  const lines = [];
  Object.keys(state.cart).forEach(id => { const m = state.menu.find(x => String(x.id) === id); if (m && m.available !== false) lines.push({ id, name: m.name, price: Number(m.price) || 0, qty: state.cart[id] }); });
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const feeKnown = S("delivery_fee") !== "", fee = state.orderType === "Antar" ? (Number(S("delivery_fee")) || 0) : 0;
  return { lines, subtotal, fee, feeKnown, total: subtotal + fee, count: lines.reduce((a, l) => a + l.qty, 0) };
}
function renderCart() {
  const t = totals();
  $("cartCount").textContent = t.count;
  $("cartBar").hidden = !t.count; $("cartBarCount").textContent = t.count; $("cartBarTotal").textContent = money(t.subtotal);
  document.body.classList.toggle("has-cart", t.count > 0);
  $("cartItems").innerHTML = t.lines.length ? t.lines.map(l => `<div class="cart-row"><div><b>${esc(l.name)}</b><small>${money(l.price)} × ${l.qty} = ${money(l.price * l.qty)}</small></div><div class="qty"><button data-act="dec" data-id="${esc(l.id)}" aria-label="Kurangi ${esc(l.name)}">−</button><b>${l.qty}</b><button data-act="inc" data-id="${esc(l.id)}" aria-label="Tambah ${esc(l.name)}">+</button></div></div>`).join("") : '<p class="empty">Keranjangmu masih kosong.<br><a href="#menu" class="text-link" id="goMenu">Lihat menu →</a></p>';
  $("cartSubtotal").textContent = money(t.subtotal);
  const delivery = state.orderType === "Antar";
  $("feeRow").hidden = !delivery;
  $("cartFee").textContent = t.feeKnown ? (t.fee ? money(t.fee) : "Gratis") : "Dikonfirmasi via WA";
  $("cartTotal").textContent = money(t.total) + (delivery && !t.feeKnown ? " + ongkir" : "");
  const min = Number(S("min_order")) || 0, closed = S("open_mode") === "closed";
  let notice = "";
  if (closed) notice = "Warung sedang tutup. Pesanan belum bisa dikirim.";
  else if (min && t.subtotal < min) notice = "Minimal pemesanan " + money(min) + ". Tambah " + money(min - t.subtotal) + " lagi.";
  $("cartNotice").hidden = !notice; $("cartNotice").textContent = notice;
  $("checkout").disabled = !t.lines.length || !!notice || state.busy;
}
function renderOrderOptions() {
  let types = listOf("order_types").filter(x => ALL_TYPES.indexOf(x) > -1); if (!types.length) types = ALL_TYPES;
  if (types.indexOf(state.orderType) < 0) state.orderType = types[0];
  $("typeOptions").innerHTML = types.map(t => `<label class="chip${t === state.orderType ? " on" : ""}"><input type="radio" name="otype" value="${esc(t)}"${t === state.orderType ? " checked" : ""}><span>${esc(t)}</span></label>`).join("");
  const pays = listOf("payment_methods"); const sel = $("paymentSelect"), prev = sel.value;
  sel.innerHTML = (pays.length ? pays : ["Tunai"]).map(p => `<option>${esc(p)}</option>`).join("");
  if (pays.indexOf(prev) > -1) sel.value = prev;
  $("paymentWrap").hidden = pays.length <= 1;
  $("addressWrap").hidden = state.orderType !== "Antar";
}
function openCart() {
  $("overlay").classList.add("show"); $("cartDrawer").classList.add("show"); $("cartDrawer").setAttribute("aria-hidden", "false");
  document.body.classList.add("lock"); setTimeout(() => $("closeCart").focus(), 50);
}
function closeCart() {
  $("overlay").classList.remove("show"); $("cartDrawer").classList.remove("show"); $("cartDrawer").setAttribute("aria-hidden", "true");
  document.body.classList.remove("lock"); $("openCart").focus({ preventScroll: true });
}

/* ---------- checkout ---------- */
function buildMessage(o) {
  const L = ["Halo Zahra Penyet, saya ingin memesan:"];
  if (o.id) L.push("*No. Pesanan: " + o.id + "*");
  L.push("");
  o.lines.forEach(l => L.push("• " + l.name + " x" + l.qty + " — " + money(l.price * l.qty)));
  L.push("", "Subtotal: " + money(o.subtotal));
  if (o.type === "Antar") L.push("Ongkir: " + (o.feeKnown ? (o.fee ? money(o.fee) : "Gratis") : "mohon info sesuai jarak"));
  L.push("*Total: " + money(o.total) + (o.type === "Antar" && !o.feeKnown ? " + ongkir" : "") + "*", "");
  L.push("Jenis pesanan: " + o.type);
  if (o.type === "Antar") L.push("Alamat: " + o.address);
  L.push("Nama: " + o.name);
  if (o.payment) L.push("Pembayaran: " + o.payment);
  L.push("Catatan: " + (o.note || "-"), "", "Mohon konfirmasi pesanan saya. Terima kasih.");
  return L.join("\n");
}
async function checkout() {
  if (state.busy) return;
  const t = totals();
  if (!t.lines.length) return toast("Keranjang masih kosong.");
  const name = $("customerName").value.trim(), type = state.orderType, address = $("customerAddress").value.trim();
  if (name.length < 2) { $("customerName").focus(); return toast("Isi nama pemesan dulu ya."); }
  if (type === "Antar" && address.length < 8) { $("customerAddress").focus(); return toast("Alamat pengantaran belum lengkap."); }
  const phone = waNumber(); if (!phone) return toast("Nomor WhatsApp warung belum diatur.");
  const st = storeStatus();
  if (st.open === false && !confirm("Warung sedang tutup saat ini. Tetap kirim pesanan? Pesanan akan diproses saat warung buka.")) return;

  const payment = $("paymentWrap").hidden ? (listOf("payment_methods")[0] || "Tunai") : $("paymentSelect").value;
  const custPhone = $("customerPhone").value.trim(), note = $("orderNote").value.trim();
  store.set(LS.cust, { name, phone: custPhone, address });

  state.busy = true; $("checkout").disabled = true; $("checkout").textContent = "Mengirim pesanan…";
  let order = { id: "", lines: t.lines, subtotal: t.subtotal, fee: t.fee, feeKnown: t.feeKnown, total: t.total, type, address, name, payment, note };
  let logged = false;
  if (cfg.API_URL && !state.offline) {
    try {
      const r = await apiPost("createOrder", { order: { name, phone: custPhone, type, address, payment, note, website: $("hp").value, items: t.lines.map(l => ({ id: l.id, qty: l.qty })) } });
      if (!r || !r.success) {
        state.busy = false; $("checkout").textContent = "Pesan via WhatsApp ↗"; renderCart();
        toast((r && r.message) || "Pesanan gagal dikirim.", 4200);
        if (r && /tersedia|habis|dimuat/i.test(r.message || "")) load(true);
        return;
      }
      order = Object.assign(order, { id: r.orderId, lines: r.items, subtotal: r.subtotal, fee: r.deliveryFee, total: r.total });
      order.notification = r.notification || null;
      logged = true;
    } catch (e) { toast("Koneksi ke server bermasalah — pesanan tetap dikirim lewat WhatsApp.", 4200); }
  }
  const url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(buildMessage(order));
  $("modalWa").href = url;
  $("modalWa").textContent = logged ? "Chat warung (opsional) ↗" : "Kirim pesanan lewat WhatsApp ↗";
  $("modalId").textContent = order.id ? "No. Pesanan: " + order.id : "";
  $("modalId").hidden = !order.id;
  if (logged) {
    const ns = order.notification || {};
    const ownerSent = ns.admin === "Terkirim";
    const customerSent = ns.customer === "Terkirim";
    $("modalText").textContent = ownerSent
      ? (customerSent ? "Pesanan sudah tercatat. Notifikasi otomatis telah dikirim ke WhatsApp warung dan konfirmasi juga dikirim ke WhatsApp kamu." : "Pesanan sudah tercatat dan notifikasi otomatis telah dikirim ke WhatsApp Zahra Penyet. Kamu tidak perlu mengirim pesan secara manual.")
      : "Pesanan sudah tercatat, tetapi notifikasi otomatis ke WhatsApp warung belum berhasil. Silakan tekan tombol Chat warung sebagai alternatif atau hubungi warung.";
  } else {
    $("modalText").textContent = "Koneksi server belum tersedia. Untuk meneruskan pesanan, kirim pesan melalui WhatsApp.";
  }
  $("orderModal").hidden = false; closeCart();
  state.cart = {}; persistCart(); $("orderNote").value = ""; state.busy = false; $("checkout").textContent = "Pesan via WhatsApp ↗";
  renderCart(); refreshActions();
}

/* ---------- init & events ---------- */
function renderAll() { renderFilters(); renderMenu(); renderStatic(); renderOrderOptions(); renderCart(); }
function bind() {
  $("filters").addEventListener("click", e => { const b = e.target.closest(".filter"); if (!b) return; state.category = b.dataset.cat; renderFilters(); renderMenu(); });
  $("searchInput").addEventListener("input", debounce(e => { state.q = e.target.value; renderMenu(); }, 150));
  $("sortSelect").addEventListener("change", e => { state.sort = e.target.value; renderMenu(); });
  const act = e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.dataset.id, m = state.menu.find(x => String(x.id) === id), cur = state.cart[id] || 0;
    if (b.dataset.act === "add") { if (!m) return; setQty(id, cur + 1); toast(m.name + " ditambahkan", 1400); }
    else if (b.dataset.act === "inc") setQty(id, cur + 1);
    else if (b.dataset.act === "dec") setQty(id, cur - 1);
  };
  $("menuGrid").addEventListener("click", act); $("cartItems").addEventListener("click", act);
  $("cartItems").addEventListener("click", e => { if (e.target.id === "goMenu") closeCart(); });
  document.addEventListener("error", e => { const i = e.target; if (i.tagName === "IMG" && i.hasAttribute("data-fallback") && i.src !== FALLBACK_IMG) i.src = FALLBACK_IMG; }, true);
  $("typeOptions").addEventListener("change", e => { state.orderType = e.target.value; store.set(LS.cust, Object.assign(store.get(LS.cust, {}), { type: state.orderType })); renderOrderOptions(); renderCart(); });
  $("quickNotes").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; const n = $("orderNote"), v = n.value.trim(); if (v.toLowerCase().indexOf(b.textContent.toLowerCase()) < 0) n.value = v ? v + ", " + b.textContent : b.textContent; });
  $("openCart").onclick = openCart; $("cartBar").onclick = openCart; $("closeCart").onclick = closeCart; $("overlay").onclick = closeCart;
  $("checkout").onclick = checkout;
  $("modalClose").onclick = () => { $("orderModal").hidden = true; };
  $("orderModal").addEventListener("click", e => { if (e.target === $("orderModal")) $("orderModal").hidden = true; });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("orderModal").hidden) $("orderModal").hidden = true; else if ($("cartDrawer").classList.contains("show")) closeCart(); } });
  $("menuToggle").onclick = () => { const o = $("mainNav").classList.toggle("open"); $("menuToggle").setAttribute("aria-expanded", o); };
  $("mainNav").addEventListener("click", e => { if (e.target.tagName === "A") { $("mainNav").classList.remove("open"); $("menuToggle").setAttribute("aria-expanded", "false"); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && cfg.API_URL && Date.now() - state.lastLoad > 120000) load(true); });
  setInterval(() => { renderStatus(); renderCart(); }, 60000);
}
function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) return els.forEach(x => x.classList.add("in"));
  const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: .12 });
  els.forEach(x => io.observe(x));
}
function init() {
  $("year").textContent = new Date().getFullYear();
  state.cart = store.get(LS.cart, {});
  const c = store.get(LS.cust, {});
  $("customerName").value = c.name || ""; $("customerPhone").value = c.phone || ""; $("customerAddress").value = c.address || "";
  if (c.type) state.orderType = c.type;
  const cached = store.get(LS.menu, null);
  if (cached && cached.menu && cached.menu.length) { state.menu = cached.menu; state.settings = cached.settings || {}; renderAll(); } else { renderSkeleton(); renderStatic(); renderOrderOptions(); renderCart(); }
  bind(); initReveal(); load();
}
init();
})();
