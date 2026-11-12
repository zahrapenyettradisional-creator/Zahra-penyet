# Zahra Penyet Website — v4 (tampilan Segar)

## Struktur folder
```
index.html        halaman pelanggan
admin.html        dashboard admin
favicon.svg
assets/css/style.css
assets/js/        app.js (pelanggan), admin.js, config.js (isi API_URL di sini)
backend/Code.gs   kode Google Apps Script
```

## Lupa PIN admin?
Di editor Apps Script pilih fungsi **`resetPin`** → **Run**. PIN langsung menjadi `246810` (ubah nilai `NEW_PIN` di kode jika mau angka lain). Masuk ke admin, lalu ganti PIN di **Pengaturan > Keamanan**. Setelah mengedit kode: **Deploy > Manage deployments > Edit > New version**.


Website statis untuk GitHub Pages + Google Sheets sebagai database. Pelanggan memesan lewat keranjang, pesanan **tercatat otomatis** lalu dikirim ke WhatsApp warung. Pemilik mengelola semuanya dari `/admin.html`.

## Yang baru di v3
**Untuk pelanggan**
- Pencarian menu, urutan harga/nama, kategori otomatis dari data menu
- Label menu (Best Seller, Baru, dll.), harga coret untuk promo, status **Habis** yang jelas
- Keranjang tersimpan (tidak hilang saat refresh), tombol +/− langsung di kartu menu
- Jenis pesanan (makan di tempat / bawa pulang / antar), alamat, metode bayar, ongkir, minimal pesan
- Label **Buka/Tutup otomatis** sesuai jam (WIB), banner pengumuman, tombol Google Maps & Instagram
- Pesan WhatsApp lebih rapi dengan **nomor pesanan**; tetap jalan lewat WhatsApp walau server sedang bermasalah
- Tampilan mobile: bar keranjang di bawah, menu hamburger, tombol WhatsApp melayang
- SEO dasar (meta, Open Graph, data bisnis), favicon, aksesibilitas keyboard

**Untuk admin**
- Tab **Pesanan**: daftar pesanan, ubah status (Baru → Diproses → Siap → Selesai / Batal), tombol chat pelanggan, omzet harian, menu terlaris, unduh CSV, cek pesanan baru tiap 30 detik + bunyi notifikasi
- Tab **Menu**: pencarian, saklar Tersedia/Habis satu klik, salin menu, label, harga coret, urutan tampil, **unggah foto langsung dari HP** (disimpan di Google Drive milikmu)
- Tab **Pengaturan**: kontak, jam, mode Buka/Tutup paksa, jenis pesanan, ongkir, minimal pesan, metode bayar, pengumuman, **ganti PIN**

**Keamanan & ketahanan**
- Harga **dihitung ulang di server** — pelanggan tidak bisa mengubah harga lewat browser
- Pembatasan login (5 salah → kunci 10 menit), PIN awal acak, pembatasan kirim ganda/spam, honeypot bot
- Input dibersihkan dari rumus Excel/Sheets berbahaya; seluruh tulis data memakai kunci antrean (tidak bentrok saat ramai)

## A. Setup baru (pertama kali)
1. Buat Google Sheets baru bernama **Database Zahra Penyet**.
2. **Extensions > Apps Script**, hapus kode awal, tempel seluruh isi `backend/Code.gs`, simpan.
3. Pilih fungsi **`setup`** → **Run** → izinkan akses (termasuk Google Drive, untuk unggah foto).
4. Buka **Execution log** di bawah editor: di sana tertulis **PIN ADMIN AWAL** (6 angka acak). Catat, lalu ganti lewat dashboard admin.
5. **Deploy > New deployment > Web app** → Execute as: **Me**, Who has access: **Anyone** → Deploy → salin URL berakhiran `/exec`.
6. Buka `assets/js/config.js`, tempel URL itu ke `API_URL`.
7. Upload semua file ke GitHub Pages (Settings > Pages > branch `main`, folder `/root`).

## B. Upgrade dari v2 (data menu lama aman)
1. Ganti isi Apps Script dengan `backend/Code.gs` → simpan.
2. Jalankan **`setup`** sekali (menambah kolom/sheet baru, **tidak** menghapus data lama) dan setujui izin baru.
3. **Deploy > Manage deployments > Edit > New version > Deploy** (URL tetap sama).
4. Ganti semua file website di GitHub dengan versi v3 (jaga `assets/js/config.js` kalau `API_URL` sudah terisi).
5. PIN lama **tidak diubah**. Jika masih `123456`, segera ganti di **Admin > Pengaturan > Keamanan**.

## C. Isi data asli warung
- Ganti menu, harga, dan foto contoh (semuanya placeholder) di **Admin > Menu**.
- Isi **jam buka & tutup** di **Admin > Pengaturan** (jam operasional belum diberikan, jadi label Buka/Tutup belum muncul sebelum diisi).
- Atur jenis pesanan yang benar-benar dilayani. Jika tidak antar, matikan "Antar / delivery".
- Foto hero & "Tentang" di `index.html` masih foto contoh Unsplash — ganti dengan foto warung.

## Catatan penting
- Perubahan di Sheet/Admin muncul di website dalam ±1 menit (cache singkat agar cepat).
- Jika kamu mengedit kode Apps Script lagi, selalu **New version** pada deployment.
- Pesanan dianggap sah setelah pelanggan menekan kirim di WhatsApp; data di sheet **Orders** adalah catatan + dasar statistik.
- Jangan bagikan PIN dan URL admin. Google Sheets milikmu berisi nama/telepon/alamat pelanggan — jaga aksesnya.
- Unggah foto memakai Google Drive. Foto menjadi “siapa saja dengan link dapat melihat” (diperlukan agar tampil di website).


## Integrasi notifikasi WhatsApp otomatis dengan Fonnte

Alur setelah integrasi:
1. Pelanggan checkout di website.
2. Google Apps Script memvalidasi ulang harga/menu dan menyimpan pesanan ke sheet `Orders`.
3. Apps Script memanggil `https://api.fonnte.com/send` dari server (bukan browser).
4. WhatsApp warung menerima detail pesanan baru.
5. Jika pelanggan mengisi nomor WhatsApp, sistem juga mencoba mengirim konfirmasi penerimaan pesanan ke pelanggan.
6. Jika Fonnte sedang gagal/tidak tersambung, pesanan tetap tercatat di Google Sheets dan status notifikasi ditandai gagal. Pelanggan mendapat opsi chat manual.

### Menyiapkan token Fonnte (wajib sebelum notifikasi aktif)
1. Masuk ke akun Fonnte dan hubungkan perangkat WhatsApp warung.
2. Ambil token API perangkat dari dashboard Fonnte.
3. Buka project Google Apps Script yang dipakai website.
4. Buka **Project Settings** (ikon roda gigi) > **Script Properties** > **Add script property**.
5. Isi:
   - Property: `FONNTE_TOKEN`
   - Value: token API Fonnte milikmu
6. Klik Save. Jangan tempel token ke `config.js`, `app.js`, HTML, GitHub, atau chat.
7. Pastikan nomor WhatsApp warung di dashboard admin adalah `08980222087` (backend menyimpannya dalam format `628980222087`).
8. Di editor Apps Script, pilih fungsi `testFonnte` lalu klik **Run**. Berikan izin UrlFetchApp bila diminta. Pesan tes akan dikirim ke WhatsApp warung.
9. Setelah tes berhasil, buat satu pesanan percobaan dari website. Cek WhatsApp warung dan sheet `Orders`.

### Deploy ulang Apps Script
Setelah mengganti `Code.gs`:
1. Klik **Deploy > Manage deployments**.
2. Klik ikon pensil pada deployment Web App.
3. Pilih **New version**, lalu Deploy.
4. Gunakan URL `/exec` deployment yang sama pada `assets/js/config.js` bila URL tidak berubah.

### Catatan penting
- Token Fonnte hanya disimpan di Script Properties Google Apps Script.
- Notifikasi ke pemilik dikirim ke nomor WhatsApp warung pada pengaturan website.
- Konfirmasi ke pelanggan hanya dikirim jika pelanggan mengisi nomor WhatsApp yang valid.
- Pengiriman WhatsApp bergantung pada koneksi perangkat Fonnte dan kebijakan/ketentuan WhatsApp. Fonnte menyebut layanannya menggunakan otomasi WhatsApp Web dan bukan WhatsApp Official API; pertimbangkan risiko pembatasan akun serta uji dengan jumlah pesan kecil.
- Status notifikasi tercatat pada kolom `fonnte_admin_status`, `fonnte_customer_status`, dan `fonnte_response` di sheet `Orders`.


## Logo resmi
Logo dari pemilik sudah dipasang pada header website pelanggan, header admin, footer, dan favicon. File logo berada di `assets/images/logo-zahra-penyet.png`. Jangan menghapus file ini saat upload ke GitHub Pages.
