# Bearion 👕👔

Bearion adalah platform e-commerce untuk clothing brand, dibangun dengan Next.js, TypeScript, dan Supabase. Aplikasi ini mencakup katalog produk, keranjang dan checkout, pembayaran, pengiriman, hingga dashboard admin untuk mengelola produk dan pesanan.

![Next.js](https://img.shields.io/badge/Next.js-16.1.1-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Supabase](https://img.shields.io/badge/Supabase-Backend-green)

## Fitur

### Untuk Pengguna
- Katalog produk dengan kategori, pencarian, dan filter
- Galeri gambar produk dengan carousel otomatis
- Keranjang belanja dan proses checkout
- Pembayaran via PayPal dan verifikasi bukti transfer manual
- Estimasi ongkir dan pelacakan pengiriman (Biteship)
- Registrasi dan login pengguna
- Riwayat dan detail pesanan
- Galeri community dan halaman kontak
- Tampilan bilingual (ID/EN) dan responsif di perangkat mobile

### Untuk Admin
- Dashboard admin untuk kelola produk dan inventory
- Upload multi-gambar dengan drag & drop, serta pengaturan urutan tampilan
- CRUD produk dan manajemen stok real-time
- Role-based access (admin terpisah dari user biasa)
- Pengaturan konten halaman (site settings, About Us)

## Prasyarat

- Node.js versi 18 atau lebih baru
- npm / yarn / pnpm
- Git
- Akun Supabase — [supabase.com](https://supabase.com)

## Setup di Device Baru

### 1. Clone Repository

```bash
git clone https://github.com/Brvlyd/bearion.git
cd bearion
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Supabase

1. Login ke [supabase.com](https://supabase.com) dan buat project baru.
2. Buka **Settings → API**, lalu salin **Project URL** dan **anon/public key**.
3. Buka **Storage**, buat bucket baru bernama `product-images` dan set sebagai public bucket.
4. Buka **SQL Editor**, lalu jalankan file dari `db/schema/` secara berurutan:
   - `db/schema/database-schema.sql`
   - `db/schema/users-schema.sql`
   - `db/schema/product-images-schema.sql`

   Urutan lengkap (termasuk cart, orders, dan payment) ada di [db/README.md](db/README.md).

### 4. Environment Variables

```bash
cp .env.local.example .env.local
```

Isi minimal untuk menjalankan aplikasi secara lokal:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Variabel lain (email, PayPal, Biteship) bersifat opsional tergantung fitur yang ingin diaktifkan — lihat `.env.local.example` untuk daftar lengkapnya dan dokumentasi terkait di `docs/setup/`.

### 5. Update Next.js Config

Edit `next.config.ts` dan ganti hostname Supabase dengan project kamu:

```typescript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'your-project.supabase.co',
      pathname: '/storage/v1/object/public/**',
    },
  ],
},
```

### 6. Run Development Server

```bash
npm run dev
```

Buka http://localhost:3000 di browser. ✅

## Setup Admin Account

1. Register akun baru di `/register`, lalu verifikasi email jika diminta.
2. Buka **Supabase Dashboard → Authentication → Users**, salin User ID akun tersebut.
3. Buka **SQL Editor**, lalu jalankan:

```sql
INSERT INTO admins (id, email, role, full_name)
VALUES (
  'paste-user-id-disini',
  'admin@bearion.com',
  'admin',
  'Admin Name'
);
```

Login sebagai admin melalui `/login`.

## Struktur Project

```
bearion/
├── app/                 # Next.js App Router
│   ├── admin/           # Dashboard & login admin
│   ├── api/             # Route handlers (orders, paypal, email, shipping, dll.)
│   ├── auth/            # Konfirmasi, OTP, reset password
│   ├── cart/            # Keranjang
│   ├── catalog/         # Katalog produk
│   ├── checkout/        # Proses checkout
│   ├── community/       # Galeri community
│   ├── contact/         # Halaman kontak
│   ├── login/           # Login user & admin
│   ├── orders/          # Riwayat & detail pesanan
│   ├── payment/         # Halaman pembayaran
│   ├── products/[id]/   # Detail produk
│   ├── profile/         # Profil user
│   └── register/        # Registrasi user
├── components/          # React components
├── lib/                 # Utilities & services (auth, produk, supabase, dll.)
├── db/                  # SQL untuk Supabase — lihat db/README.md
│   ├── schema/          # Definisi tabel (setup database baru)
│   ├── migrations/      # Perubahan schema setelah setup
│   ├── fixes/           # Script perbaikan sekali pakai
│   └── checks/          # Query verifikasi
├── docs/                # Dokumentasi — lihat docs/README.md
├── scripts/             # Script maintenance
├── public/              # Static assets
└── package.json
```

## Autentikasi

- Admin login di `/login` (role terdeteksi otomatis)
- User register di `/register`, login di `/login`
- Session dikelola oleh Supabase Auth
- Row Level Security (RLS) diterapkan pada database

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database & Storage**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Email**: Brevo
- **Pembayaran**: PayPal
- **Pengiriman**: Biteship
- **Icons**: Lucide React

## Script

```bash
npm run dev            # Development server (localhost:3000)
npm run build          # Build untuk production
npm run start          # Start production server
npm run lint            # Menjalankan ESLint
npm run upload-images  # Upload gambar produk secara batch
npm run i18n:check      # Cek kelengkapan terjemahan
```

## Deployment

Deploy ke [Vercel](https://vercel.com):

1. Push kode ke GitHub.
2. Import repository di Vercel.
3. Tambahkan environment variables yang diperlukan (lihat `.env.local.example`).
4. Deploy.

Detail lebih lanjut ada di [docs/setup/DEPLOYMENT.md](docs/setup/DEPLOYMENT.md).

## Troubleshooting

**Gambar tidak muncul**
- Cek hostname di `next.config.ts`
- Pastikan bucket `product-images` sudah public
- Restart dev server setelah update config

**Login gagal**
- Pastikan SQL schema sudah dijalankan
- Cek status verifikasi email (jika enabled)
- Pastikan user/admin sudah ada di database

**Build error**
- Cek versi Node.js (minimal 18)
- Hapus folder `.next` dan `node_modules`, lalu `npm install` ulang

**Database error**
- Pastikan Supabase project masih aktif
- Cek credentials di `.env.local`
- Pastikan RLS policies sudah di-setup

## Dokumentasi

- [docs/README.md](docs/README.md) — indeks seluruh dokumentasi
- [docs/setup/SETUP.md](docs/setup/SETUP.md) — panduan setup awal
- [docs/setup/AUTH_SETUP.md](docs/setup/AUTH_SETUP.md) — panduan autentikasi
- [docs/setup/DEPLOYMENT.md](docs/setup/DEPLOYMENT.md) — panduan deployment
- [docs/features/FEATURES.md](docs/features/FEATURES.md) — daftar fitur lengkap
- [db/README.md](db/README.md) — urutan menjalankan script SQL

## Skema Database (ringkas)

**products** — id, name, description, price, stock, category, image_url, created_at, updated_at

**admins** — id (foreign key ke auth.users), email, role, full_name, created_at

Skema lengkap ada di `db/schema/`.

## Kontak

- Developer: Brvlyd
- Repository: [github.com/Brvlyd/bearion](https://github.com/Brvlyd/bearion)
