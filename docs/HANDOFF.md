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

2. **Ganti password akun admin** `admin@bearions.com`.
   Password akun ini juga sempat ikut tersimpan di tempat yang sama. Pakai
   password baru yang panjang dan belum pernah dipakai di tempat lain.

3. **Pasang pengaman database** (dikerjakan developer, sekali saja).
   Tanpa langkah ini, tiga hal berikut masih bisa terjadi:
   - dua pembeli membeli barang terakhir bersamaan, sehingga stok jadi minus dan
     barang terjual padahal sudah habis;
   - pembeli yang paham teknis bisa mengubah catatan pembayarannya sendiri;
   - pesanan yang tidak pernah dibayar "mengunci" stok selamanya.

4. **Aktifkan pembatalan otomatis** (dikerjakan developer).
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

6. **Minta developer menyelesaikan pengaturan server** (bagian 5): kunci-kunci
   layanan dan tugas otomatis.

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

Jalankan `db/migrations/order-integrity-guards.sql` di Supabase SQL Editor
(aman dijalankan berulang). Lalu aktifkan ekstensi `pg_cron` (Database →
Extensions) dan jalankan ulang file yang sama supaya job pembatalan per jam
terjadwal. Batas 24 jam ada di `expire_stale_pending_orders()` (SQL) dan
`UNPAID_ORDER_EXPIRY_HOURS` di `lib/store-config.ts` (hanya untuk teks di
halaman pembayaran). Ubah keduanya bersamaan.

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
| `POST /api/paypal/reconcile` | header `x-sync-secret: $PAYPAL_SYNC_SECRET` | tiap 15–30 menit | pembayaran PayPal yang koneksinya putus tidak tertagih |
| `POST /api/shipping/sync-tracking` | header `x-sync-secret: $SHIPPING_SYNC_SECRET` | 1–2× sehari | timeline pengiriman tidak bergerak |
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
