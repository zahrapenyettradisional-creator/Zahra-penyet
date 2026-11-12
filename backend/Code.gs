/**
 * Zahra Penyet — Backend Google Apps Script (v3)
 * Database: Google Sheets (sheet Menu, Settings, Orders)
 * Fitur: katalog, pesanan tercatat, status pesanan, pengaturan toko,
 *        upload foto ke Google Drive, login PIN dengan pembatasan percobaan.
 */
const SHEET_MENU = "Menu";
const SHEET_SETTINGS = "Settings";
const SHEET_ORDERS = "Orders";
const TZ = "Asia/Jakarta";
const CACHE_KEY = "zp_public_data";

const MENU_HEADERS = ["id","name","price","category","image","description","available","badge","original_price","sort"];
const ORDER_HEADERS = ["id","created_at","name","phone","type","address","payment","items_json","items_text","subtotal","delivery_fee","total","note","status","fonnte_admin_status","fonnte_customer_status","fonnte_response"];
const ORDER_STATUS = ["Baru","Diproses","Siap","Selesai","Batal"];
const ORDER_TYPES = ["Makan di tempat","Bawa pulang","Antar"];
const DEFAULT_SETTINGS = {
  phone:"628980222087", address:"Jl. Patiunus VII No.17, Pandean Lamper, Kec. Gayamsari, Kota Semarang, Jawa Tengah 50167", hours:"", open_time:"", close_time:"", open_mode:"auto",
  announcement:"", maps_url:"", instagram:"", delivery_fee:"", min_order:"",
  payment_methods:"Tunai", order_types:"Makan di tempat,Bawa pulang,Antar"
};
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

/* ===================== ENTRY POINTS ===================== */
function doGet(e){
  try{
    const action = e && e.parameter && e.parameter.action;
    if(action === "getData") return json_(getData_());
    return json_({success:true, app:"Zahra Penyet API", version:3, message:"API aktif."});
  }catch(err){ return json_({success:false, message:msg_(err)}); }
}

function doPost(e){
  try{
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const a = body.action;
    // --- publik ---
    if(a === "getData") return json_(getData_());
    if(a === "createOrder") return json_(withLock_(() => createOrder_(body.order)));
    if(a === "login") return json_(login_(body.pin));
    // --- admin (perlu token) ---
    if(!validToken_(body.token)) throw new Error("Sesi admin tidak valid. Silakan login kembali.");
    switch(a){
      case "logout": CacheService.getScriptCache().remove("zahra_" + body.token); return json_({success:true});
      case "saveMenu": return json_(withLock_(() => saveMenu_(body.item)));
      case "deleteMenu": return json_(withLock_(() => deleteMenu_(body.id)));
      case "toggleAvailable": return json_(withLock_(() => toggleAvailable_(body.id, body.available)));
      case "saveSettings": return json_(withLock_(() => saveSettings_(body.settings)));
      case "getOrders": return json_(getOrders_(body.limit));
      case "updateOrderStatus": return json_(withLock_(() => updateOrderStatus_(body.id, body.status)));
      case "changePin": return json_(changePin_(body.currentPin, body.newPin));
      case "uploadImage": return json_(uploadImage_(body.filename, body.dataUrl));
    }
    throw new Error("Aksi tidak dikenal.");
  }catch(err){ return json_({success:false, message:msg_(err)}); }
}

/* ===================== SETUP ===================== */
/** Jalankan SEKALI dari editor Apps Script. Aman dijalankan ulang (tidak menimpa data). */
function setup(){
  const props = PropertiesService.getScriptProperties();
  let pinInfo = "PIN admin sudah ada (tidak diubah).";
  if(!props.getProperty("ADMIN_PIN")){
    const pin = String(Math.floor(100000 + Math.random()*900000));
    props.setProperty("ADMIN_PIN", pin);
    pinInfo = "PIN ADMIN AWAL KAMU: " + pin + "  (simpan, lalu ganti lewat dashboard admin)";
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const menu = getOrCreateSheet_(ss, SHEET_MENU);
  const mh = ensureHeaders_(menu, MENU_HEADERS);
  if(menu.getLastRow() <= 1){
    const demo = [
      ["m1","Ayam Penyet",18000,"Penyetan","https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=700&q=80","Ayam goreng, sambal pilihan, nasi dan lalapan.",true,"Best Seller",0,1],
      ["m2","Lele Penyet",15000,"Penyetan","https://images.unsplash.com/photo-1515003197210-e0cd7184f8b5?auto=format&fit=crop&w=700&q=80","Lele goreng renyah dengan sambal dan lalapan.",true,"",0,2],
      ["m6","Paket Komplit",25000,"Penyetan","https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=700&q=80","Ayam, nasi, tahu, tempe, sambal dan lalapan.",true,"Favorit",0,3],
      ["m3","Tempe Tahu",7000,"Tambahan","https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=80","Gorengan hangat pelengkap makanmu.",true,"",0,4],
      ["m5","Nasi Putih",5000,"Tambahan","https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=700&q=80","Nasi putih hangat.",true,"",0,5],
      ["m4","Es Teh",5000,"Minuman","https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=700&q=80","Teh segar, teman makan paling pas.",true,"",0,6]
    ];
    demo.forEach(r => menu.appendRow(r));
  }

  const st = getOrCreateSheet_(ss, SHEET_SETTINGS);
  if(st.getLastRow() === 0) st.appendRow(["key","value"]);
  const have = {};
  st.getDataRange().getValues().slice(1).forEach(r => have[String(r[0])] = true);
  SETTING_KEYS.forEach(k => { if(!have[k]) st.appendRow([k, DEFAULT_SETTINGS[k]]); });

  const ord = getOrCreateSheet_(ss, SHEET_ORDERS);
  const oh = ensureHeaders_(ord, ORDER_HEADERS);
  ["id","created_at","phone"].forEach(n => ord.getRange(1, oh.indexOf(n)+1, ord.getMaxRows(), 1).setNumberFormat("@"));
  ord.setFrozenRows(1);
  menu.setFrozenRows(1);

  bust_();
  Logger.log("Setup selesai. " + pinInfo);
  return "Setup selesai. " + pinInfo;
}

/* ===================== PUBLIC DATA ===================== */
function getData_(){
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if(hit){ try{ return JSON.parse(hit); }catch(e){} }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_MENU);
  if(!sh) throw new Error("Sheet belum disiapkan. Jalankan fungsi setup().");
  const headers = ensureHeaders_(sh, MENU_HEADERS);
  const rows = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,headers.length).getValues() : [];
  const menu = [];
  rows.forEach((r, i) => {
    const o = rowToObj_(headers, r);
    if(!o.id) return;
    menu.push({
      id:String(o.id), name:unesc_(o.name), price:Number(o.price)||0, category:unesc_(o.category)||"Lainnya",
      image:String(o.image||""), description:unesc_(o.description), available:toBool_(o.available),
      badge:unesc_(o.badge), original_price:Number(o.original_price)||0,
      sort: o.sort === "" || o.sort == null ? 9999 : Number(o.sort), _i:i
    });
  });
  menu.sort((a,b) => (a.sort - b.sort) || (a._i - b._i));
  menu.forEach(m => delete m._i);
  const out = {success:true, menu:menu, settings:readSettings_()};
  try{ cache.put(CACHE_KEY, JSON.stringify(out), 45); }catch(e){}
  return out;
}
function bust_(){ try{ CacheService.getScriptCache().remove(CACHE_KEY); }catch(e){} }

function readSettings_(){
  const out = Object.assign({}, DEFAULT_SETTINGS);
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  if(s){
    s.getDataRange().getValues().slice(1).forEach(r => {
      const k = String(r[0]);
      if(SETTING_KEYS.indexOf(k) < 0) return;
      const v = String(r[1] == null ? "" : r[1]);
      if(v !== "" || ["payment_methods","order_types","open_mode","phone","address"].indexOf(k) < 0) out[k] = unesc_(v);
    });
  }
  return out;
}

/* ===================== PESANAN ===================== */
function createOrder_(o){
  if(!o || typeof o !== "object") throw new Error("Data pesanan kosong.");
  if(o.website) return {success:true, orderId:"ZP-OK"};            // honeypot (bot)
  const set = readSettings_();
  if(set.open_mode === "closed") throw new Error("Maaf, warung sedang tutup. Silakan pesan kembali nanti.");

  const name = clean_(o.name, 60);
  if(name.length < 2) throw new Error("Nama pemesan wajib diisi.");
  const phone = String(o.phone || "").replace(/\D/g,"").slice(0,15);
  const types = listOf_(set.order_types).filter(t => ORDER_TYPES.indexOf(t) >= 0);
  const type = String(o.type || "");
  if(types.indexOf(type) < 0) throw new Error("Jenis pesanan tidak tersedia.");
  const address = clean_(o.address, 250);
  if(type === "Antar" && address.length < 8) throw new Error("Alamat pengantaran wajib diisi lengkap.");
  const pays = listOf_(set.payment_methods);
  const payment = String(o.payment || pays[0] || "Tunai");
  if(pays.length && pays.indexOf(payment) < 0) throw new Error("Metode pembayaran tidak tersedia.");
  const note = clean_(o.note, 300);

  // throttle sederhana: 1 pesanan/15 dtk per nama+telepon, 40 pesanan/menit global
  const cache = CacheService.getScriptCache();
  const tk = "zp_thr_" + Utilities.base64EncodeWebSafe(name.toLowerCase() + "|" + phone).slice(0,80);
  if(cache.get(tk)) throw new Error("Pesanan baru saja dikirim. Tunggu sebentar sebelum mengirim lagi.");
  const gk = "zp_glob_" + Utilities.formatDate(new Date(), TZ, "yyyyMMddHHmm");
  const gc = Number(cache.get(gk) || 0);
  if(gc >= 40) throw new Error("Server sedang sibuk, coba lagi sebentar lagi.");

  // harga SELALU dihitung ulang dari database, bukan dari browser
  const items = Array.isArray(o.items) ? o.items : [];
  if(!items.length) throw new Error("Keranjang kosong.");
  if(items.length > 30) throw new Error("Terlalu banyak jenis menu dalam satu pesanan.");
  const menu = getData_().menu, byId = {};
  menu.forEach(m => byId[m.id] = m);
  const merged = {};
  items.forEach(it => {
    const id = String(it && it.id), qty = Math.floor(Number(it && it.qty));
    if(!byId[id]) throw new Error("Ada menu yang sudah tidak tersedia. Muat ulang halaman.");
    if(!(qty >= 1 && qty <= 50)) throw new Error("Jumlah pesanan tidak valid.");
    merged[id] = (merged[id] || 0) + qty;
  });
  let subtotal = 0; const lines = [];
  Object.keys(merged).forEach(id => {
    const m = byId[id], q = merged[id];
    if(!m.available) throw new Error(m.name + " sedang habis.");
    subtotal += m.price * q;
    lines.push({id:id, name:m.name, price:m.price, qty:q});
  });
  const minOrder = Number(set.min_order) || 0;
  if(subtotal < minOrder) throw new Error("Minimal pemesanan Rp" + minOrder.toLocaleString("id-ID") + ".");
  const fee = type === "Antar" ? (Number(set.delivery_fee) || 0) : 0;
  const total = subtotal + fee;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_ORDERS);
  if(!sh) throw new Error("Sheet Orders belum ada. Jalankan setup().");
  const headers = ensureHeaders_(sh, ORDER_HEADERS);
  const now = new Date();
  const prefix = "ZP" + Utilities.formatDate(now, TZ, "yyMMdd") + "-";
  let seq = 1;
  if(sh.getLastRow() > 1){
    sh.getRange(2,1,sh.getLastRow()-1,1).getValues().forEach(r => { if(String(r[0]).indexOf(prefix) === 0) seq++; });
  }
  const id = prefix + ("000" + seq).slice(-3);
  const itemsText = lines.map(l => l.name + " x" + l.qty).join(", ");
  const rec = {
    id:id, created_at:Utilities.formatDate(now, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"), name:name, phone:phone, type:type,
    address:address, payment:payment, items_json:JSON.stringify(lines), items_text:itemsText,
    subtotal:subtotal, delivery_fee:fee, total:total, note:note, status:"Baru"
  };
  sh.appendRow(headers.map(h => rec[h] === undefined ? "" : rec[h]));

  // Pesanan tetap tersimpan meskipun gateway WhatsApp sedang gagal.
  const notification = notifyNewOrder_(rec, headers, sh.getLastRow());

  cache.put(tk, "1", 15);
  cache.put(gk, String(gc+1), 90);
  return {
    success:true, orderId:id, subtotal:subtotal, deliveryFee:fee, total:total, items:lines,
    notification: notification
  };
}


/* ===================== NOTIFIKASI WHATSAPP FONNTE =====================
 * Simpan token di Apps Script > Project Settings > Script Properties:
 * Key: FONNTE_TOKEN | Value: token perangkat dari dashboard Fonnte.
 * Token TIDAK boleh dimasukkan ke file HTML/JavaScript website.
 */
function notifyNewOrder_(order, headers, rowNumber){
  const props = PropertiesService.getScriptProperties();
  const token = String(props.getProperty("FONNTE_TOKEN") || "").trim();
  const settings = readSettings_();
  const adminTarget = normalizeWa_(settings.phone);
  let adminStatus = "Belum dikonfigurasi";
  let customerStatus = order.phone ? "Belum dikonfigurasi" : "Nomor pelanggan tidak diisi";
  let details = [];

  if(token && adminTarget){
    const adminMessage = buildAdminOrderMessage_(order);
    const result = sendFonnte_(token, adminTarget, adminMessage);
    adminStatus = result.ok ? "Terkirim" : "Gagal: " + result.message;
    details.push("Admin: " + result.message);
  } else if(!adminTarget){
    adminStatus = "Gagal: nomor WhatsApp warung belum diatur";
  }

  const customerTarget = normalizeWa_(order.phone);
  if(token && customerTarget){
    const customerMessage = buildCustomerOrderMessage_(order);
    const result = sendFonnte_(token, customerTarget, customerMessage);
    customerStatus = result.ok ? "Terkirim" : "Gagal: " + result.message;
    details.push("Pelanggan: " + result.message);
  } else if(order.phone && !customerTarget){
    customerStatus = "Nomor pelanggan tidak valid";
  }

  const adminCol = headers.indexOf("fonnte_admin_status") + 1;
  const customerCol = headers.indexOf("fonnte_customer_status") + 1;
  const responseCol = headers.indexOf("fonnte_response") + 1;
  if(adminCol > 0) shCell_(rowNumber, adminCol, adminStatus);
  if(customerCol > 0) shCell_(rowNumber, customerCol, customerStatus);
  if(responseCol > 0) shCell_(rowNumber, responseCol, details.join(" | ").slice(0, 450));

  return {admin:adminStatus, customer:customerStatus};
}

function shCell_(row, col, value){
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS).getRange(row, col).setValue(value);
}

function normalizeWa_(number){
  let n = String(number || "").replace(/\D/g, "");
  if(n.indexOf("0") === 0) n = "62" + n.slice(1);
  if(n.indexOf("8") === 0) n = "62" + n;
  return /^62\d{8,13}$/.test(n) ? n : "";
}

function buildAdminOrderMessage_(o){
  const lines = [];
  lines.push("🍗 *PESANAN BARU — ZAHRA PENYET*", "");
  lines.push("*No:* " + o.id);
  lines.push("*Waktu:* " + o.created_at);
  lines.push("*Nama:* " + o.name);
  lines.push("*WhatsApp pelanggan:* " + (o.phone || "-"));
  lines.push("*Jenis:* " + o.type);
  if(o.type === "Antar") lines.push("*Alamat:* " + (o.address || "-"));
  lines.push("*Pembayaran:* " + (o.payment || "-"), "", "*DAFTAR MENU*");
  JSON.parse(o.items_json || "[]").forEach(item => {
    lines.push("• " + item.name + " x" + item.qty + " — " + rupiah_(item.price * item.qty));
  });
  lines.push("", "Subtotal: " + rupiah_(o.subtotal));
  if(Number(o.delivery_fee)) lines.push("Ongkir: " + rupiah_(o.delivery_fee));
  lines.push("*TOTAL: " + rupiah_(o.total) + "*");
  lines.push("Catatan: " + (o.note || "-"), "", "Buka dashboard admin untuk mengelola status pesanan.");
  return lines.join("\n");
}

function buildCustomerOrderMessage_(o){
  return [
    "Halo " + o.name + " 👋",
    "Pesanan kamu di *Zahra Penyet* sudah kami terima.",
    "",
    "*No. Pesanan:* " + o.id,
    "*Pesanan:*",
    JSON.parse(o.items_json || "[]").map(item => "• " + item.name + " x" + item.qty).join("\n"),
    "",
    "*Total: " + rupiah_(o.total) + "*",
    "Jenis: " + o.type,
    "Pembayaran: " + (o.payment || "-"),
    "",
    "Terima kasih sudah memesan. Admin kami akan segera mengonfirmasi pesananmu 🙏"
  ].join("\n");
}

function rupiah_(n){
  return "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
}

function sendFonnte_(token, target, message){
  try{
    const response = UrlFetchApp.fetch("https://api.fonnte.com/send", {
      method: "post",
      headers: {Authorization: token},
      payload: {target: String(target), message: String(message)},
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    const raw = response.getContentText();
    let data = {};
    try{ data = JSON.parse(raw); }catch(e){}
    const ok = code >= 200 && code < 300 && data.status === true;
    const detail = data.reason || data.detail || data.message || ("HTTP " + code);
    return {ok:ok, message:String(detail).slice(0,160)};
  }catch(err){
    return {ok:false, message:String(err.message || err).slice(0,160)};
  }
}

/** Jalankan manual dari editor Apps Script untuk mengetes token dan nomor warung. */
function testFonnte(){
  const token = String(PropertiesService.getScriptProperties().getProperty("FONNTE_TOKEN") || "").trim();
  const target = normalizeWa_(readSettings_().phone);
  if(!token) throw new Error("FONNTE_TOKEN belum diisi di Script Properties.");
  if(!target) throw new Error("Nomor WhatsApp warung belum diatur di dashboard admin.");
  const result = sendFonnte_(token, target, "Tes notifikasi Zahra Penyet berhasil. Fonnte siap menerima pesanan baru. ✅");
  Logger.log(JSON.stringify(result));
  if(!result.ok) throw new Error("Tes Fonnte gagal: " + result.message);
  return "Pesan tes berhasil dikirim ke " + target;
}

function getOrders_(limit){
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if(!sh) throw new Error("Sheet Orders belum ada. Jalankan setup().");
  const headers = ensureHeaders_(sh, ORDER_HEADERS);
  const last = sh.getLastRow();
  if(last < 2) return {success:true, orders:[]};
  const n = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const start = Math.max(2, last - n + 1);
  const rows = sh.getRange(start, 1, last - start + 1, headers.length).getValues();
  const orders = rows.map(r => {
    const o = rowToObj_(headers, r);
    let items = []; try{ items = JSON.parse(o.items_json || "[]"); }catch(e){}
    return {
      id:String(o.id), created_at:dateStr_(o.created_at), name:unesc_(o.name), phone:String(o.phone||""), type:String(o.type),
      address:unesc_(o.address), payment:String(o.payment), items:items, subtotal:Number(o.subtotal)||0,
      delivery_fee:Number(o.delivery_fee)||0, total:Number(o.total)||0, note:unesc_(o.note), status:String(o.status||"Baru"),
      fonnte_admin_status:String(o.fonnte_admin_status||"Belum tercatat")
    };
  }).filter(o => o.id).reverse();
  return {success:true, orders:orders};
}

function updateOrderStatus_(id, status){
  if(ORDER_STATUS.indexOf(status) < 0) throw new Error("Status tidak valid.");
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  const headers = ensureHeaders_(sh, ORDER_HEADERS);
  const ids = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,1).getValues() : [];
  for(let i = ids.length - 1; i >= 0; i--){
    if(String(ids[i][0]) === String(id)){
      sh.getRange(i+2, headers.indexOf("status")+1).setValue(status);
      return {success:true};
    }
  }
  throw new Error("Pesanan tidak ditemukan.");
}

/* ===================== MENU ===================== */
function saveMenu_(m){
  if(!m || typeof m !== "object") throw new Error("Data menu kosong.");
  const name = clean_(m.name, 80), category = clean_(m.category, 30);
  const price = Math.round(Number(m.price));
  if(!name || !category || !isFinite(price) || price < 0 || price > 10000000) throw new Error("Nama, kategori, dan harga wajib diisi dengan benar.");
  let orig = Math.round(Number(m.original_price) || 0);
  if(orig <= price) orig = 0;
  const image = String(m.image || "").trim();
  if(image && !/^https?:\/\//i.test(image)) throw new Error("URL foto harus diawali http:// atau https://");
  if(image.length > 600) throw new Error("URL foto terlalu panjang.");
  const sort = m.sort === "" || m.sort == null ? "" : Math.round(Number(m.sort)) || 0;

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MENU);
  const headers = ensureHeaders_(sh, MENU_HEADERS);
  const id = String(m.id || ("m" + Utilities.getUuid().slice(0,8)));
  const rec = {id:id, name:name, price:price, category:category, image:image, description:clean_(m.description,300),
               available:!!m.available, badge:clean_(m.badge,20), original_price:orig, sort:sort};
  const ids = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,1).getValues() : [];
  let row = -1;
  for(let i = 0; i < ids.length; i++) if(String(ids[i][0]) === id){ row = i + 2; break; }
  const values = headers.map(h => rec[h] === undefined ? "" : rec[h]);
  if(row < 0) sh.appendRow(values);
  else {
    // pertahankan kolom lain milik pengguna yang tidak kita kenal
    const cur = sh.getRange(row,1,1,headers.length).getValues()[0];
    sh.getRange(row,1,1,headers.length).setValues([headers.map((h,i) => rec[h] === undefined ? cur[i] : rec[h])]);
  }
  bust_();
  return {success:true, id:id};
}

function deleteMenu_(id){
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MENU);
  const ids = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,1).getValues() : [];
  for(let i = 0; i < ids.length; i++){
    if(String(ids[i][0]) === String(id)){ sh.deleteRow(i+2); bust_(); return {success:true}; }
  }
  throw new Error("Menu tidak ditemukan.");
}

function toggleAvailable_(id, available){
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MENU);
  const headers = ensureHeaders_(sh, MENU_HEADERS);
  const ids = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,1).getValues() : [];
  for(let i = 0; i < ids.length; i++){
    if(String(ids[i][0]) === String(id)){
      sh.getRange(i+2, headers.indexOf("available")+1).setValue(!!available);
      bust_();
      return {success:true};
    }
  }
  throw new Error("Menu tidak ditemukan.");
}

/* ===================== PENGATURAN ===================== */
function saveSettings_(s){
  s = s || {};
  const clean = {};
  Object.keys(s).forEach(k => {
    if(SETTING_KEYS.indexOf(k) < 0) return;
    let v = String(s[k] == null ? "" : s[k]).trim();
    switch(k){
      case "phone": v = v.replace(/\D/g,""); if(v.charAt(0) === "0") v = "62" + v.slice(1); if(v && !/^62\d{8,13}$/.test(v)) throw new Error("Nomor WhatsApp tidak valid. Contoh: 628123456789"); break;
      case "open_time": case "close_time": if(v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error("Format jam harus HH:MM."); break;
      case "open_mode": if(["auto","open","closed"].indexOf(v) < 0) v = "auto"; break;
      case "delivery_fee": case "min_order": v = v === "" ? "" : String(Math.max(0, Math.round(Number(v) || 0))); break;
      case "order_types": v = listOf_(v).filter(t => ORDER_TYPES.indexOf(t) >= 0).join(",") || DEFAULT_SETTINGS.order_types; break;
      case "payment_methods": v = listOf_(v).map(x => clean_(x,24)).slice(0,6).join(",") || "Tunai"; break;
      case "maps_url": if(v && !/^https?:\/\//i.test(v)) throw new Error("Link Google Maps harus diawali https://"); v = v.slice(0,500); break;
      case "instagram": v = v.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i,"").replace(/\/.*$/,"").replace(/[^A-Za-z0-9._]/g,"").slice(0,40); break;
      default: v = clean_(v, k === "announcement" ? 200 : 300);
    }
    clean[k] = v;
  });
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  const data = sh.getDataRange().getValues();
  const rowOf = {};
  for(let i = 1; i < data.length; i++) rowOf[String(data[i][0])] = i + 1;
  Object.keys(clean).forEach(k => {
    if(rowOf[k]) sh.getRange(rowOf[k], 2).setValue(clean[k]);
    else { sh.appendRow([k, clean[k]]); rowOf[k] = sh.getLastRow(); }
  });
  bust_();
  return {success:true, settings:readSettings_()};
}

/* ===================== AUTH ===================== */
function login_(pin){
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get("zp_fail") || 0);
  if(fails >= 5) throw new Error("Terlalu banyak percobaan salah. Coba lagi dalam 10 menit.");
  const expected = PropertiesService.getScriptProperties().getProperty("ADMIN_PIN");
  if(!expected || !safeEq_(String(pin || ""), expected)){
    cache.put("zp_fail", String(fails + 1), 600);
    throw new Error("PIN admin salah.");
  }
  cache.remove("zp_fail");
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put("zahra_" + token, "1", 21600);
  return {success:true, token:token};
}
function validToken_(t){ return !!t && CacheService.getScriptCache().get("zahra_" + t) === "1"; }
function changePin_(cur, next){
  const props = PropertiesService.getScriptProperties();
  if(!safeEq_(String(cur || ""), props.getProperty("ADMIN_PIN") || "")) throw new Error("PIN saat ini salah.");
  next = String(next || "");
  if(!/^\d{6,12}$/.test(next)) throw new Error("PIN baru harus 6–12 angka.");
  if(/^(\d)\1+$/.test(next) || next === "123456" || next === "123456789") throw new Error("PIN terlalu mudah ditebak.");
  props.setProperty("ADMIN_PIN", next);
  return {success:true};
}
/* ===================== RESET PIN (lupa PIN) =====================
 * Cara pakai: di editor Apps Script pilih fungsi `resetPin` lalu klik Run.
 * PIN admin langsung berganti ke nilai NEW_PIN di bawah dan kunci login dibuka.
 * Setelah masuk dashboard, ganti PIN di Pengaturan > Keamanan. */
const NEW_PIN = "246810";
function resetPin(){
  PropertiesService.getScriptProperties().setProperty("ADMIN_PIN", NEW_PIN);
  CacheService.getScriptCache().remove("zp_fail");
  Logger.log("PIN admin sekarang: " + NEW_PIN);
  return "PIN admin sekarang: " + NEW_PIN;
}
function safeEq_(a, b){
  if(a.length !== b.length) return false;
  let d = 0; for(let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ===================== UPLOAD FOTO ===================== */
function uploadImage_(filename, dataUrl){
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUrl || ""));
  if(!m) throw new Error("Format gambar harus JPG, PNG, atau WEBP.");
  const bytes = Utilities.base64Decode(m[2]);
  if(bytes.length > 2.5 * 1024 * 1024) throw new Error("Ukuran gambar terlalu besar (maks 2,5 MB).");
  const props = PropertiesService.getScriptProperties();
  let folder = null, fid = props.getProperty("IMG_FOLDER_ID");
  if(fid){ try{ folder = DriveApp.getFolderById(fid); }catch(e){ folder = null; } }
  if(!folder){ folder = DriveApp.createFolder("Zahra Penyet - Foto Menu"); props.setProperty("IMG_FOLDER_ID", folder.getId()); }
  const safeName = String(filename || "menu").replace(/[^\w.\-]+/g,"_").slice(0,60);
  const file = folder.createFile(Utilities.newBlob(bytes, m[1], Utilities.formatDate(new Date(), TZ, "yyMMdd-HHmmss") + "-" + safeName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {success:true, url:"https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1000"};
}

/* ===================== UTIL ===================== */
function getOrCreateSheet_(ss, name){ return ss.getSheetByName(name) || ss.insertSheet(name); }
/** Pastikan semua header yang dibutuhkan ada; tambah di kanan jika belum. Return array header. */
function ensureHeaders_(sh, wanted){
  let headers = [];
  if(sh.getLastRow() > 0 && sh.getLastColumn() > 0) headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  while(headers.length && headers[headers.length-1] === "") headers.pop();
  let changed = false;
  wanted.forEach(h => { if(headers.indexOf(h) < 0){ headers.push(h); changed = true; } });
  if(changed || sh.getLastRow() === 0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  return headers;
}
function rowToObj_(headers, row){ const o = {}; headers.forEach((h,i) => o[h] = row[i]); return o; }
function toBool_(v){ return v === true || String(v).toLowerCase() === "true" || v === 1; }
function listOf_(s){ return String(s || "").split(",").map(x => x.trim()).filter(Boolean); }
function dateStr_(v){ return v instanceof Date ? Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX") : String(v || ""); }
/** Bersihkan teks input. Teks berawalan = + - @ diberi tanda ' agar tidak dibaca sebagai rumus. */
function clean_(v, max){
  let s = String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if(max && s.length > max) s = s.slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function unesc_(v){ const s = String(v == null ? "" : v); return /^'[=+\-@]/.test(s) ? s.slice(1) : s; }
function withLock_(fn){
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try{ return fn(); } finally { lock.releaseLock(); }
}
function msg_(err){ return String((err && err.message) || err); }
function json_(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
