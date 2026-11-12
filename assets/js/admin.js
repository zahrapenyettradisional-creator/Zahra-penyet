/* Zahra Penyet — dashboard admin (v3) */
(function () {
"use strict";
const cfg = window.ZAHRA_CONFIG || {};
const $ = id => document.getElementById(id);
const money = n => "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => { u = String(u || "").trim(); return /^https?:\/\//i.test(u) ? u : ""; };
const NEXT = { Baru: ["Diproses", "Proses pesanan"], Diproses: ["Siap", "Tandai siap"], Siap: ["Selesai", "Selesai"] };

let token = "", menu = [], orders = [], settings = {}, known = null, timer = null;
let soundOn = localStorage.getItem("zp_sound") !== "off";
const ST = { busyOrders: false };

/* ---------- util ---------- */
let tt; function toast(t, ms) { const x = $("toast"); x.textContent = t; x.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => x.classList.remove("show"), ms || 2600); }
function msg(id, t, cls) { $(id).textContent = t; $(id).className = cls || "success"; }
const todayKey = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());
function shiftKey(key, days) { const d = new Date(key + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
const dayOf = o => String(o.created_at || "").slice(0, 10);
function whenLabel(o) {
  const d = dayOf(o), t = String(o.created_at || "").slice(11, 16);
  if (d === todayKey()) return "Hari ini, " + t;
  if (d === shiftKey(todayKey(), -1)) return "Kemarin, " + t;
  return d.slice(8, 10) + "/" + d.slice(5, 7) + " " + t;
}
function waLink(phone, text) { let d = String(phone || "").replace(/\D/g, ""); if (d.charAt(0) === "0") d = "62" + d.slice(1); return d ? "https://wa.me/" + d + "?text=" + encodeURIComponent(text) : ""; }

async function api(action, data) {
  if (!cfg.API_URL) throw Error("URL Apps Script belum diatur di config.js");
  let r, j;
  try { r = await fetch(cfg.API_URL, { method: "POST", body: JSON.stringify(Object.assign({ action, token }, data || {})) }); j = await r.json(); }
  catch (e) { throw Error("Tidak dapat terhubung ke server. Periksa koneksi internet."); }
  if (!j.success) { if (/Sesi admin/i.test(j.message || "")) { doLogout("Sesi berakhir. Silakan masuk lagi."); } throw Error(j.message || "Permintaan gagal"); }
  return j;
}

/* ---------- login ---------- */
function showDash() { $("loginPanel").hidden = true; $("dashboard").hidden = false; }
$("loginForm").onsubmit = async e => {
  e.preventDefault(); const btn = e.target.querySelector("button"); btn.disabled = true;
  try { const r = await api("login", { pin: $("adminPin").value }); token = r.token; sessionStorage.setItem("zahraAdminToken", token); $("adminPin").value = ""; msg("loginError", "", "error"); showDash(); await loadAll(); startPolling(); }
  catch (err) { msg("loginError", err.message, "error"); } finally { btn.disabled = false; }
};
function doLogout(message) {
  sessionStorage.removeItem("zahraAdminToken"); token = ""; known = null; clearInterval(timer);
  $("dashboard").hidden = true; $("loginPanel").hidden = false; $("adminPin").value = ""; document.title = "Admin | Zahra Penyet";
  if (message) msg("loginError", message, "error");
}
$("logout").onclick = async () => { try { await api("logout"); } catch (e) {} doLogout(); };

/* ---------- tabs ---------- */
document.querySelector(".tabs").addEventListener("click", e => {
  const b = e.target.closest(".tab"); if (!b) return;
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b));
  document.querySelectorAll(".tab-pane").forEach(p => p.hidden = p.id !== "tab-" + b.dataset.tab);
});

/* ---------- load ---------- */
async function loadAll() { await Promise.all([loadMenu(), loadOrders(true)]); }
function startPolling() { clearInterval(timer); timer = setInterval(() => { if (!document.hidden && token) loadOrders(true); }, 30000); }

/* ---------- PESANAN ---------- */
async function loadOrders(quiet) {
  try {
    const r = await api("getOrders", { limit: 500 }); orders = r.orders || [];
    const fresh = orders.filter(o => o.status === "Baru").map(o => o.id);
    if (known !== null) {
      const added = fresh.filter(id => !known.has(id));
      if (added.length) { toast("🔔 " + added.length + " pesanan baru masuk!", 4500); beep(); }
    }
    known = new Set(orders.map(o => o.id));
    renderOrders();
  } catch (e) { if (!quiet) toast(e.message); }
}
function filteredOrders() {
  const fs = $("fStatus").value, fr = $("fRange").value, today = todayKey();
  const start = fr === "today" ? today : fr === "all" ? "" : shiftKey(today, -(Number(fr) - 1));
  return orders.filter(o => (!start || dayOf(o) >= start) && (fs === "all" || (fs === "aktif" ? ["Baru", "Diproses", "Siap"].indexOf(o.status) > -1 : o.status === fs)));
}
function rangeOrders() { // untuk statistik: hanya filter periode
  const fr = $("fRange").value, today = todayKey(), start = fr === "today" ? today : fr === "all" ? "" : shiftKey(today, -(Number(fr) - 1));
  return orders.filter(o => !start || dayOf(o) >= start);
}
function renderOrders() {
  const today = todayKey(), todays = orders.filter(o => dayOf(o) === today && o.status !== "Batal");
  $("statToday").textContent = todays.length; $("statRevenue").textContent = money(todays.reduce((a, o) => a + o.total, 0));
  const nNew = orders.filter(o => o.status === "Baru").length; $("statNew").textContent = nNew;
  $("tabBadge").hidden = !nNew; $("tabBadge").textContent = nNew;
  document.title = (nNew ? "(" + nNew + ") " : "") + "Admin | Zahra Penyet";
  const list = filteredOrders();
  $("ordersList").innerHTML = list.length ? list.map(orderCard).join("") : '<p class="empty">Belum ada pesanan pada filter ini.</p>';
  // sidebar
  const rg = rangeOrders().filter(o => o.status !== "Batal"), agg = {};
  rg.forEach(o => (o.items || []).forEach(i => { agg[i.name] = (agg[i.name] || 0) + i.qty; }));
  const top = Object.keys(agg).map(n => [n, agg[n]]).sort((a, b) => b[1] - a[1]).slice(0, 6), max = top.length ? top[0][1] : 1;
  $("topItems").innerHTML = top.length ? top.map(t => `<div class="bar-row"><span>${esc(t[0])}</span><div class="bar"><i style="width:${Math.max(6, t[1] / max * 100)}%"></i></div><b>${t[1]}</b></div>`).join("") : '<p class="empty small">Belum ada data.</p>';
  $("sumCount").textContent = rg.length; $("sumRevenue").textContent = money(rg.reduce((a, o) => a + o.total, 0));
}
function orderCard(o) {
  const next = NEXT[o.status], done = o.status === "Selesai" || o.status === "Batal";
  const where = o.type === "Antar" ? `<div class="o-addr">📍 ${esc(o.address)}</div>` : "";
  const note = o.note ? `<div class="o-note">📝 ${esc(o.note)}</div>` : "";
  const hello = o.status === "Siap" ? (o.type === "Antar" ? "sedang kami antar" : "sudah siap, silakan diambil") : o.status === "Diproses" ? "sedang kami siapkan" : "sudah kami terima";
  const wa = waLink(o.phone, `Halo kak ${o.name}, pesanan ${o.id} ${hello}. Terima kasih sudah memesan di Zahra Penyet 🙏`);
  return `<article class="order-card st-${esc(o.status)}" data-id="${esc(o.id)}">
    <div class="o-head"><div><b class="o-id">${esc(o.id)}</b><small>${esc(whenLabel(o))}</small></div><span class="status-tag ${esc(o.status)}">${esc(o.status)}</span></div>
    <div class="o-cust"><b>${esc(o.name)}</b><span class="o-type">${esc(o.type)}</span>${o.payment ? `<span class="o-type">${esc(o.payment)}</span>` : ""}</div>
    <div class="o-note">📲 Notifikasi WA warung: ${esc(o.fonnte_admin_status || "Belum tercatat")}</div>${where}
    <ul class="o-items">${(o.items || []).map(i => `<li><span>${esc(i.name)} <b>×${i.qty}</b></span><span>${money(i.price * i.qty)}</span></li>`).join("")}</ul>${note}
    <div class="o-total"><span>${o.delivery_fee ? "Ongkir " + money(o.delivery_fee) + " · " : ""}Total</span><b>${money(o.total)}</b></div>
    <div class="o-actions">
      ${next ? `<button class="primary-btn sm" data-act="status" data-to="${next[0]}">${next[1]}</button>` : ""}
      ${wa ? `<a class="outline-btn sm" href="${esc(wa)}" target="_blank" rel="noopener">Chat pelanggan</a>` : ""}
      ${done ? `<button class="outline-btn sm" data-act="status" data-to="Diproses">Buka kembali</button>` : `<button class="outline-btn sm danger" data-act="status" data-to="Batal">Batalkan</button>`}
    </div></article>`;
}
$("ordersList").addEventListener("click", async e => {
  const b = e.target.closest('[data-act="status"]'); if (!b || ST.busyOrders) return;
  const id = b.closest(".order-card").dataset.id, to = b.dataset.to;
  if (to === "Batal" && !confirm("Batalkan pesanan " + id + "?")) return;
  ST.busyOrders = true; b.disabled = true;
  try { await api("updateOrderStatus", { id, status: to }); const o = orders.find(x => x.id === id); if (o) o.status = to; renderOrders(); toast("Status " + id + " → " + to); }
  catch (err) { toast(err.message); } finally { ST.busyOrders = false; }
});
["fStatus", "fRange"].forEach(id => $(id).addEventListener("change", renderOrders));
$("refreshOrders").onclick = () => loadOrders();
$("exportCsv").onclick = () => {
  const rows = filteredOrders(); if (!rows.length) return toast("Tidak ada pesanan untuk diunduh.");
  const cell = v => { v = String(v == null ? "" : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  const head = ["No. Pesanan", "Waktu", "Nama", "Telepon", "Jenis", "Alamat", "Pembayaran", "Item", "Subtotal", "Ongkir", "Total", "Catatan", "Status"];
  const lines = rows.map(o => [o.id, o.created_at.replace("T", " ").slice(0, 16), o.name, o.phone, o.type, o.address, o.payment, (o.items || []).map(i => i.name + " x" + i.qty).join("; "), o.subtotal, o.delivery_fee, o.total, o.note, o.status].map(cell).join(","));
  const blob = new Blob(["\ufeff" + [head.map(cell).join(",")].concat(lines).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "pesanan-zahra-penyet-" + todayKey() + ".csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
function beep() {
  if (!soundOn) return;
  try { const C = window.AudioContext || window.webkitAudioContext, c = new C(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = "sine"; o.frequency.value = 880; g.gain.setValueAtTime(.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(.25, c.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .6); o.start(); o.stop(c.currentTime + .65); } catch (e) {}
}
function paintSound() { $("soundToggle").textContent = "🔔 Suara pesanan: " + (soundOn ? "aktif" : "mati"); }
$("soundToggle").onclick = () => { soundOn = !soundOn; localStorage.setItem("zp_sound", soundOn ? "on" : "off"); paintSound(); if (soundOn) beep(); };
paintSound();

/* ---------- MENU ---------- */
async function loadMenu() {
  try { const r = await api("getData"); menu = r.menu || []; settings = r.settings || {}; renderMenu(); fillSettings(); }
  catch (e) { toast(e.message); }
}
function renderMenu() {
  $("statActive").textContent = menu.filter(m => m.available !== false).length;
  const cats = []; menu.forEach(m => { if (cats.indexOf(m.category) < 0) cats.push(m.category); });
  ["Penyetan", "Tambahan", "Minuman"].forEach(c => { if (cats.indexOf(c) < 0) cats.push(c); });
  $("catList").innerHTML = cats.map(c => `<option value="${esc(c)}">`).join("");
  const q = $("menuSearch").value.trim().toLowerCase();
  const list = menu.filter(m => !q || (m.name + " " + m.category).toLowerCase().indexOf(q) > -1);
  $("adminMenuList").innerHTML = list.length ? list.map(m => `<div class="admin-item${m.available === false ? " off" : ""}" data-id="${esc(m.id)}">
    <img src="${esc(safeUrl(m.image))}" alt="" onerror="this.style.opacity=.2">
    <div><b>${esc(m.name)}${m.badge ? ` <i class="mini-badge">${esc(m.badge)}</i>` : ""}</b><small>${money(m.price)}${m.original_price > m.price ? ` <s>${money(m.original_price)}</s>` : ""} · ${esc(m.category)}</small></div>
    <div class="item-actions"><label class="switch" title="Tersedia / Habis"><input type="checkbox" data-act="toggle" ${m.available === false ? "" : "checked"}><span></span></label><button data-act="edit">Edit</button><button data-act="dup">Salin</button><button data-act="del">Hapus</button></div></div>`).join("") : '<p class="empty">Belum ada menu.</p>';
}
$("menuSearch").addEventListener("input", renderMenu);
$("adminMenuList").addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.closest(".admin-item").dataset.id, m = menu.find(x => String(x.id) === id); if (!m) return;
  if (b.dataset.act === "edit") fillForm(m, false);
  else if (b.dataset.act === "dup") fillForm(m, true);
  else if (b.dataset.act === "del") {
    if (!confirm("Hapus menu “" + m.name + "”?")) return;
    try { await api("deleteMenu", { id }); await loadMenu(); toast("Menu dihapus"); } catch (err) { toast(err.message); }
  }
});
$("adminMenuList").addEventListener("change", async e => {
  if (e.target.dataset.act !== "toggle") return;
  const id = e.target.closest(".admin-item").dataset.id, m = menu.find(x => String(x.id) === id), val = e.target.checked;
  try { await api("toggleAvailable", { id, available: val }); m.available = val; renderMenu(); toast(m.name + (val ? " tersedia" : " ditandai habis")); }
  catch (err) { e.target.checked = !val; toast(err.message); }
});
function fillForm(m, copy) {
  $("menuId").value = copy ? "" : m.id; $("menuName").value = copy ? m.name + " (salinan)" : m.name; $("menuPrice").value = m.price; $("menuOrig").value = m.original_price || "";
  $("menuCategory").value = m.category; $("menuBadge").value = m.badge || ""; $("menuImage").value = m.image || ""; $("menuDescription").value = m.description || "";
  $("menuSort").value = m.sort && m.sort !== 9999 ? m.sort : ""; $("menuAvailable").checked = m.available !== false;
  $("formTitle").textContent = copy ? "Salin menu" : "Edit menu"; previewImg(); msg("formMessage", ""); window.scrollTo({ top: 0, behavior: "smooth" });
}
function resetForm() {
  $("menuForm").reset(); $("menuId").value = ""; $("menuAvailable").checked = true; $("formTitle").textContent = "Tambah menu"; previewImg(); $("uploadMsg").textContent = "";
}
$("resetForm").onclick = resetForm;
$("refreshMenu").onclick = loadMenu;
$("menuForm").onsubmit = async e => {
  e.preventDefault(); const btn = $("saveMenuBtn"); btn.disabled = true;
  const item = { id: $("menuId").value, name: $("menuName").value.trim(), price: Number($("menuPrice").value), original_price: Number($("menuOrig").value) || 0, category: $("menuCategory").value.trim(), badge: $("menuBadge").value, image: $("menuImage").value.trim(), description: $("menuDescription").value.trim(), sort: $("menuSort").value, available: $("menuAvailable").checked };
  try { await api("saveMenu", { item }); resetForm(); await loadMenu(); msg("formMessage", "Menu berhasil disimpan. ✓"); }
  catch (err) { msg("formMessage", err.message, "error"); } finally { btn.disabled = false; }
};
function previewImg() { const u = safeUrl($("menuImage").value), p = $("imgPreview"); p.hidden = !u; if (u) p.src = u; }
$("menuImage").addEventListener("input", previewImg);
$("menuFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  if (!/^image\//.test(f.type)) return msg("uploadMsg", "File harus berupa gambar.", "error");
  msg("uploadMsg", "Memperkecil & mengunggah foto…", "hint");
  try {
    const dataUrl = await shrink(f, 1000, .82), r = await api("uploadImage", { filename: f.name.replace(/\.\w+$/, "") + ".jpg", dataUrl });
    $("menuImage").value = r.url; previewImg(); msg("uploadMsg", "Foto terunggah ✓ (tersimpan di Google Drive milikmu)", "success");
  } catch (err) { msg("uploadMsg", "Gagal unggah: " + err.message, "error"); }
});
function shrink(file, max, q) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", q)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(Error("Gambar tidak dapat dibaca.")); };
    img.src = url;
  });
}

/* ---------- PENGATURAN ---------- */
function fillSettings() {
  const s = settings;
  $("sPhone").value = s.phone || ""; $("sInstagram").value = s.instagram || ""; $("sAddress").value = s.address || ""; $("sMaps").value = s.maps_url || "";
  $("sHours").value = s.hours || ""; $("sOpen").value = s.open_time || ""; $("sClose").value = s.close_time || ""; $("sMode").value = s.open_mode || "auto";
  const types = String(s.order_types || "").split(",").map(x => x.trim());
  document.querySelectorAll('input[name="otype"]').forEach(c => c.checked = types.indexOf(c.value) > -1);
  $("sFee").value = s.delivery_fee || ""; $("sMin").value = s.min_order || ""; $("sPay").value = s.payment_methods || "Tunai"; $("sAnnounce").value = s.announcement || "";
}
$("settingsForm").onsubmit = async e => {
  e.preventDefault();
  const types = Array.from(document.querySelectorAll('input[name="otype"]:checked')).map(c => c.value);
  if (!types.length) return msg("settingsMessage", "Pilih minimal satu jenis pesanan.", "error");
  const s = { phone: $("sPhone").value, instagram: $("sInstagram").value, address: $("sAddress").value, maps_url: $("sMaps").value, hours: $("sHours").value, open_time: $("sOpen").value, close_time: $("sClose").value, open_mode: $("sMode").value, order_types: types.join(","), delivery_fee: $("sFee").value, min_order: $("sMin").value, payment_methods: $("sPay").value, announcement: $("sAnnounce").value };
  try { const r = await api("saveSettings", { settings: s }); settings = r.settings || s; fillSettings(); msg("settingsMessage", "Informasi warung berhasil disimpan. ✓ (website ter-update dalam ±1 menit)"); }
  catch (err) { msg("settingsMessage", err.message, "error"); }
};
$("pinForm").onsubmit = async e => {
  e.preventDefault();
  if ($("pinNew").value !== $("pinNew2").value) return msg("pinMessage", "PIN baru dan ulangannya tidak sama.", "error");
  try { await api("changePin", { currentPin: $("pinCur").value, newPin: $("pinNew").value }); e.target.reset(); msg("pinMessage", "PIN berhasil diganti. ✓ Gunakan PIN baru saat login berikutnya."); }
  catch (err) { msg("pinMessage", err.message, "error"); }
};

/* ---------- start ---------- */
token = sessionStorage.getItem("zahraAdminToken") || "";
if (token) { showDash(); loadAll().then(startPolling); }
})();
