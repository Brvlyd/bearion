Panduan ini untuk pemilik toko Bearion dan siapa pun yang nanti mengurus
websitenya. Bagian 1–4 bisa dibaca tanpa latar belakang teknis. Bagian 5 khusus
untuk developer.

---

## 1. Yang harus dikerjakan sebelum toko dibuka

Kerjakan sesuai urutan. **Nomor 1 dan 2 paling penting** karena menyangkut
keamanan uang dan akun toko.

1. **Ganti kunci rahasia PayPal.**
   Kunci ini sempat ikut tersimpan di tempat yang bisa dilihat publik. Selama
   belum diganti, anggap saja orang lain mungkin sudah tahu.
   Caranya: buka PayPal Developer Dashboard → *Apps & Credentials* → pilih
   aplikasi *Live* → buat kunci rahasia baru (*regenerate secret*). Berikan kunci
   baru itu ke developer untuk dipasang di server.

2. ~~Ganti password akun admin~~ **Sudah diganti** (1 Oktober 2026).
   Password baru diberikan langsung oleh developer dan sengaja tidak ditulis di
   dokumen ini. Setelah menerima website, sebaiknya ganti lagi dengan password
   pilihan sendiri: masuk ke admin → menu **Akun Admin** di bagian bawah menu
   kiri → isi password lama dan password baru → **Simpan Password Baru**.

3. ~~Pasang pengaman database~~ **Sudah dipasang** (1 Oktober 2026).
   Stok tidak bisa lagi jadi minus saat dua pembeli membeli barang terakhir
   bersamaan, dan pembeli tidak bisa mengubah catatan pembayarannya sendiri.

4. **Aktifkan pembatalan otomatis** (dikerjakan developer, langkahnya di
   bagian 5).
   Setelah aktif, pesanan yang **tidak dibayar dalam 24 jam** otomatis
   dibatalkan dan stoknya kembali tersedia. Pembeli sudah diberi tahu batas
   waktu ini di halaman pembayaran. Kalau mau batas waktu selain 24 jam,
   beri tahu developer.

5. **Bersihkan data percobaan.** Saat pemeriksaan, di database ada:
   - produk bernama **"tessss warna"**, yang sepertinya produk uji coba. Hapus
     lewat menu Produk di admin kalau memang tidak dijual;
   - **36 pesanan berstatus "Menunggu"**, kemungkinan besar pesanan lama yang
     ditinggalkan pembeli dan masih menahan stok. Setelah pembatalan otomatis
     (nomor 4) aktif, pesanan yang lebih dari 24 jam dan belum dibayar akan
     dibatalkan sendiri. Atau cek dan batalkan satu per satu di menu Pesanan.

6. **Minta developer menyelesaikan pengaturan server** (bagian 5): memasang
   kunci PayPal yang baru dan menyalakan pengecekan otomatis PayPal tiap
   15 menit. Tanpa pengecekan ini, pembeli yang sudah membayar lewat PayPal
   tetapi koneksinya terputus pesanannya tetap "Menunggu".

7. **Coba sendiri dua tombol admin** sebelum toko dibuka. Sisi pembeli sudah
   dites (lihat bagian 5), tetapi bagian admin harus dicoba dengan akun admin
   asli:
   - buat satu pesanan kecil, upload bukti transfer, lalu di admin tekan
     **Setujui Bukti**. Status pesanan harus berubah jadi **Dikonfirmasi**;
   - di pesanan itu tekan **Ubah Pesanan**, pilih **Dibatalkan**, lalu simpan.
     Stok produk harus kembali seperti sebelum pesanan dibuat.

   Setelah selesai, hapus pesanan percobaan itu.

---

## 2. Cara kerja pesanan

**Pembeli checkout.** Harga, ongkir, dan diskon dihitung ulang oleh sistem,
jadi pembeli tidak bisa mengakali harga. Begitu pesanan dibuat, stok langsung
dipotong supaya barangnya tidak dibeli orang lain.

**Pembeli membayar.**
- *Transfer bank / QRIS*: pembeli meng-upload bukti transfer. Admin membuka
  pesanan lalu menekan **Setujui Bukti**. Pesanan otomatis jadi
  **Dikonfirmasi** dan **Lunas**, dan pembeli menerima email.
- *PayPal*: pembayaran dicek langsung ke PayPal (nomor pesanan, jumlah, dan mata
  uang harus cocok) sebelum pesanan ditandai lunas.

**Pembatalan.**
- Pembeli bisa membatalkan pesanannya sendiri selama **belum membayar**. Kalau
  bukti transfer sudah di-upload dan sedang diperiksa, pembeli diminta
  menghubungi toko.
- Admin bisa membatalkan pesanan selama **belum dikirim**.
- **Setiap pembatalan mengembalikan stok secara otomatis.**
- Pesanan yang sudah dibatalkan tidak bisa dibuka lagi. Kalau pembeli masih
  mau, minta dia memesan ulang.
- Kalau pembeli **sudah membayar** lalu pesanannya dibatalkan, sistem akan
  mengingatkan admin. **Uangnya harus dikembalikan manual oleh toko.**

**Pengiriman.** Admin mengisi nama kurir dan nomor resi di halaman pesanan,
atau membuat pengiriman otomatis lewat Biteship (butuh saldo Biteship).

---

## 3. Hal yang perlu diketahui

- **Saldo Biteship saat ini Rp0.** Ongkir di checkout tetap muncul (memakai
  tabel tarif cadangan), tetapi fitur *buat pengiriman otomatis* dan *lacak
  paket otomatis* baru berfungsi setelah saldo Biteship diisi.
- **Nama domain.** Brand-nya "Bearion", tetapi domain yang dipakai sekarang
  `bearions.store` (dengan huruf s). Jangan ganti alamat website di pengaturan
  sebelum domain `bearion.store` benar-benar aktif.
- **Email pembeli** (konfirmasi pesanan, bukti diterima/ditolak) dikirim lewat
  Brevo. Kalau email tidak sampai, cek kuota dan status akun Brevo.

### Akun & akses

Semua layanan website terhubung ke **akun Google Bearion**. Akun Google itu
adalah kunci utama toko: siapa pun yang memegangnya bisa masuk ke semua layanan
di bawah.

| Layanan | Fungsinya untuk toko | Cara masuk |
| --- | --- | --- |
| Google Bearion | Kunci utama semua akun | Email & password Google |
| GitHub | Menyimpan kode website | Login dengan Google, atau password yang tersimpan di Google |
| Vercel | Menjalankan website (hosting) | Login dengan Google, atau password yang tersimpan di Google |
| Supabase | Database: produk, pesanan, akun pembeli, foto | Login dengan **GitHub** |
| Brevo | Mengirim email ke pembeli | Login dengan Google, atau password yang tersimpan di Google |
| PayPal | Menerima pembayaran luar negeri | Login dengan Google, atau password yang tersimpan di Google |
| Biteship | Ongkir otomatis & pengiriman | Login dengan Google, atau password yang tersimpan di Google |

Yang perlu dijaga:

- **Nyalakan verifikasi 2 langkah** di akun Google Bearion dan akun GitHub.
  Supabase masuk lewat GitHub, jadi kalau GitHub diambil alih, database toko
  ikut terbuka.
- Pastikan **nomor HP dan email pemulihan** akun Google adalah milik pemilik
  toko, bukan milik developer. Kalau suatu saat lupa password, hanya itu jalan
  untuk masuk lagi.
- Kalau nanti memakai developer lain, **undang dia** sebagai anggota di GitHub,
  Vercel, dan Supabase. Jangan berikan password akun Google. Saat kerja sama
  selesai, cukup keluarkan dia dari ketiga layanan itu.

### Untuk pengembangan berikutnya

- **Hosting (Vercel).** Website saat ini berjalan di paket gratis Vercel
  (Hobby). Aturan Vercel menyebut paket gratis hanya untuk pemakaian pribadi,
  bukan untuk toko yang berjualan. Saat toko mulai ramai, atau kalau Vercel
  menegur, pindah ke paket **Pro** (± US$20 per bulan). Tidak ada kode yang
  perlu diubah, cukup upgrade dari dashboard Vercel.
- **Ganti domain atau penyedia domain.** Kalau nanti pindah ke `bearion.store`,
  atau memindahkan domain ke penyedia lain, website tidak perlu dibangun ulang.
  Developer cukup mengubah beberapa pengaturan (daftarnya di bagian 5,
  "Pindah domain"). Selama masa pindah, biarkan domain lama tetap aktif dan
  diarahkan ke domain baru, supaya link lama dan hasil pencarian Google tidak
  mati.

---

## 4. Kalau ada masalah

| Yang terjadi | Kemungkinan penyebab |
| --- | --- |
| Stok produk terlihat berkurang padahal tidak ada penjualan | Ada pesanan "Menunggu" yang belum dibayar. Stok kembali saat pesanan itu dibatalkan. |
| Pembeli bilang sudah bayar PayPal tapi pesanan masih "Menunggu" | Koneksi pembeli terputus setelah membayar. Tugas otomatis PayPal (bagian 5) akan menyelesaikannya. Kalau belum dipasang, hubungi developer. |
| Tombol "Buat Pengiriman" gagal | Saldo Biteship habis. Isi saldo, atau isi resi manual. |
| Timeline pengiriman pembeli tidak bergerak | Tugas otomatis pelacakan belum dipasang, atau saldo Biteship habis. |

---

## 5. Untuk developer

### Pengaman database

`db/migrations/order-integrity-guards.sql` sudah dijalankan di production
(1 Oktober 2026). Yang tersisa: menjadwalkan pembatalan otomatis.

**Mengaktifkan `pg_cron` (pembatalan pesanan tak dibayar):**

1. Buka [supabase.com/dashboard](https://supabase.com/dashboard) → pilih
   project Bearion.
2. Menu kiri **Database** → **Extensions**. Ketik `pg_cron` di kolom cari →
   nyalakan tombolnya → biarkan schema bawaan → **Enable extension**.
3. Menu kiri **SQL Editor** → **New query** → tempel seluruh isi
   `db/migrations/order-integrity-guards.sql` → **Run**. Kali ini tidak boleh
   muncul pesan `pg_cron is not enabled`.
4. Cek dengan query `select jobname, schedule, active from cron.job;`. Harus ada
   baris `expire-stale-pending-orders` dengan jadwal `0 * * * *` (tiap jam).
5. Setelah jam berikutnya lewat, 36 pesanan "Menunggu" yang lebih dari 24 jam
   tanpa bukti bayar akan batal sendiri dan stoknya kembali. Hasilnya bisa
   dilihat di `select * from cron.job_run_details order by start_time desc limit 5;`.

Batas 24 jam ada di `expire_stale_pending_orders()` (SQL) dan
`UNPAID_ORDER_EXPIRY_HOURS` di `lib/store-config.ts` (hanya untuk teks di
halaman pembayaran). Ubah keduanya bersamaan.

**Menyalakan pengecekan PayPal tiap 15 menit:**

Paket gratis Vercel hanya bisa menjalankan cron sekali sehari, jadi jadwalnya
dipasang di Supabase (`pg_cron` + `pg_net`) lewat
`db/migrations/schedule-background-jobs.sql`. Secret-nya disimpan di Supabase
Vault, tidak ditulis di file atau tabel cron.

1. Ambil nilai `PAYPAL_SYNC_SECRET` dari `.env.local` (sudah dibuat, 64 karakter).
   Kalau belum ada, buat dengan
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Vercel → project Bearion → **Settings** → **Environment Variables** → tambah
   `PAYPAL_SYNC_SECRET` dengan nilai tadi, centang **Production** → **Save**.
3. Vercel → **Deployments** → titik tiga di deployment teratas → **Redeploy**.
   Env var baru hanya terbaca setelah redeploy.
4. Cek route-nya hidup:
   `curl -X POST https://www.bearions.store/api/paypal/reconcile -H "x-sync-secret: <secret>"`.
   Harus dijawab 200, bukan 503 (secret belum terpasang) atau 401 (secret beda).
5. Supabase → **Database** → **Extensions** → nyalakan `pg_net`.
6. Supabase → **SQL Editor** → jalankan
   `select vault.create_secret('<secret>', 'paypal_sync_secret');`
   (nilai yang sama persis dengan di Vercel).
7. Jalankan seluruh isi `db/migrations/schedule-background-jobs.sql`.
8. Cek `select jobname, schedule from cron.job;`, harus ada `paypal-reconcile`
   (`*/15 * * * *`). Setelah 15 menit, cek
   `select status_code, content from net._http_response order by created desc limit 5;`.
   Hasilnya harus 200.

Ganti secret di kemudian hari: ubah di Vercel (lalu redeploy) dan jalankan
`select vault.update_secret((select id from vault.secrets where name = 'paypal_sync_secret'), '<secret baru>');`.
File jadwal tidak perlu dijalankan ulang. Sync tracking Biteship bisa
dijadwalkan dengan cara yang sama (`SHIPPING_SYNC_SECRET` → vault
`shipping_sync_secret`), tetapi baru berguna setelah saldo Biteship diisi.

**Memasang kunci rahasia PayPal yang baru** (setelah pemilik toko membuatnya,
bagian 1 nomor 1):

1. Vercel → **Settings** → **Environment Variables** → edit
   `PAYPAL_CLIENT_SECRET` → tempel kunci baru → **Save** → **Redeploy**.
2. Ubah juga `PAYPAL_CLIENT_SECRET` di `.env.local` untuk development.
3. Uji dengan checkout PayPal sampai muncul jendela PayPal. Kalau kuncinya
   salah, tombol PayPal akan gagal membuat pesanan.
4. Kunci lama otomatis tidak berlaku begitu PayPal membuat yang baru.

### Pindah domain

Kalau domain berganti (misalnya ke `bearion.store`) atau dipindah ke penyedia
lain:

1. Hubungkan domain baru di Vercel → **Settings** → **Domains**, lalu ikuti
   petunjuk DNS dari Vercel di penyedia domain. Jadikan `www.` sebagai domain
   utama, sama seperti sekarang.
2. Ganti `NEXT_PUBLIC_SITE_URL` di Vercel dan `.env.local`, serta
   `DEFAULT_SITE_ORIGIN` di `lib/site-url.ts`. Nilai ini dipakai untuk link di
   email, sitemap, dan link preview.
3. Supabase → **Authentication** → **URL Configuration**: ganti **Site URL**
   dan tambahkan domain baru di **Redirect URLs**. Kalau tidak, link verifikasi
   email dan reset password mengarah ke domain lama.
4. Ganti `site_url` di `db/migrations/schedule-background-jobs.sql` lalu
   jalankan ulang.
5. Biteship dashboard: ubah URL webhook ke domain baru.
6. Brevo: kalau alamat pengirim email ikut pindah domain, verifikasi domain
   pengirim yang baru (DKIM/SPF) supaya email tidak masuk spam.
7. Biarkan domain lama aktif dan redirect 308 ke domain baru minimal beberapa
   bulan. Setelah itu daftarkan domain baru di Google Search Console.
8. Jangan ubah migration `rename-bearions-to-bearion.sql`, karena itu catatan
   sejarah rename brand.

Pastikan juga migration keamanan lain di `db/README.md` sudah dijalankan, lalu
verifikasi dengan `db/checks/test-security-policies.sql`.

### Environment variable

Daftar lengkapnya ada di `.env.local.example`. `SUPABASE_SERVICE_ROLE_KEY`,
`PAYPAL_CLIENT_SECRET`, `BREVO_API_KEY`, `BITESHIP_API_KEY`, dan semua
`*_SECRET` hanya boleh ada di server. Jangan pernah diberi awalan
`NEXT_PUBLIC_`.

### Tugas terjadwal

| Tugas | Cara memanggil | Frekuensi | Kalau tidak dipasang |
| --- | --- | --- | --- |
| Batalkan pesanan tak dibayar | `pg_cron`, otomatis setelah migration | tiap jam | stok tertahan pesanan yang ditinggalkan |
| `POST /api/paypal/reconcile` | header `x-sync-secret: $PAYPAL_SYNC_SECRET`, dipanggil `pg_net` dari `schedule-background-jobs.sql` | tiap 15 menit | pembayaran PayPal yang koneksinya putus tidak tertagih |
| `POST /api/shipping/sync-tracking` | header `x-sync-secret: $SHIPPING_SYNC_SECRET`, dipanggil `pg_net` dari `schedule-background-jobs.sql` | 08.00 & 20.00 WIB | timeline pengiriman tidak bergerak |
| Webhook Biteship → `POST /api/webhooks/biteship` | header `x-webhook-token: $BITESHIP_WEBHOOK_SECRET` | dikirim Biteship | sama, hanya lebih lambat |

Route dengan secret kosong menjawab 503 dan tidak melakukan apa pun.

### Testing

```bash
npm run typecheck   # cek tipe TypeScript
npm run lint        # 0 error; warning yang tersisa sengaja dibiarkan (lihat di bawah)
npm test            # 42 unit test tanpa network, jalankan sebelum deploy
npm run test:e2e    # 13 smoke test browser, read-only
```

`npm run test:e2e` menyalakan `npm run dev` sendiri. Untuk menguji situs live:
`BASE_URL=https://domain npm run test:e2e`. Tes ini hanya membuka halaman
publik, jadi aman untuk database produksi.

**Hasil tes checkout di database live (1 Oktober 2026)**, memakai akun dan
pesanan sementara yang sudah dihapus seluruhnya sesudahnya. Lolos 18 dari 19
pengecekan:

- checkout QRIS, transfer bank, dan PayPal: total dihitung server, stok
  dipotong, keranjang dikosongkan (PayPal: keranjang disimpan sampai lunas),
  kurs PayPal terkunci saat checkout;
- upload bukti transfer, dan pembeli tidak bisa membatalkan selama bukti
  diperiksa;
- pembatalan oleh pembeli mengembalikan stok, dan pesanan yang sudah batal tidak
  bisa dibayar;
- **gagal (sesuai dugaan):** pembeli masih bisa mengubah nominal pembayarannya
  sendiri lewat API Supabase. Tertutup setelah `order-integrity-guards.sql`
  dijalankan.

Belum dites otomatis: tombol admin (setujui bukti, batalkan pesanan) dan
pembayaran PayPal sampai lunas (butuh transaksi sungguhan). Lihat bagian 1
nomor 7.

Untuk menjalankan build produksi di komputer lokal: `npm run build` lalu
`npm start`. Perintah ini membaca `.env.local` otomatis lewat
`scripts/start-standalone.js`. Server standalone Next.js tidak membaca file
`.env` sendiri, dan di Docker variabelnya datang dari `env_file`.

### Warning ESLint yang sengaja dibiarkan

- `react-hooks/exhaustive-deps`: semuanya pola "muat data saat halaman dibuka",
  dan sudah memuat ulang saat ID di URL berubah. Menambah dependency tanpa
  refactor ke `useCallback` bisa memicu request tanpa henti.
- `@next/next/no-img-element`: preview admin dan gambar dari URL luar.
- `no-location-assign-relative-destination`: reload penuh setelah login/logout
  memang disengaja supaya status sesi di semua komponen ikut bersih.

### Lain-lain

- Rate limit (batas percobaan checkout, kirim email, dan sebagainya) disimpan
  di memori server dan reset saat redeploy. Untuk perlindungan serius, pasang
  WAF (Vercel Firewall atau Cloudflare).
- Secret lama masih ada di riwayat git. Setelah secret diganti (bagian 1),
  risikonya sudah tertutup. Menghapusnya dari riwayat (`git filter-repo` +
  force-push) opsional.
