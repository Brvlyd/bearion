# Documentation

**Mulai dari [`HANDOFF.md`](HANDOFF.md)** — checklist wajib sebelum go-live, job
terjadwal, cara testing, dan batasan yang sudah diketahui.

Dokumen di `features/` dan `troubleshooting/` sebagian besar adalah catatan
historis saat fitur dibangun atau diperbaiki. Kode dan `db/` adalah sumber
kebenaran; pakai dokumen ini sebagai latar belakang, bukan instruksi.

## `setup/` — panduan instalasi & konfigurasi

| File                                   | Isi                                            |
| -------------------------------------- | ---------------------------------------------- |
| `SETUP.md`                             | Setup awal project                             |
| `SETUP_COMPLETE.md`                    | Checklist setup lengkap                        |
| `ECOMMERCE_SETUP.md`                   | Setup fitur e-commerce (cart, order, checkout) |
| `AUTH_SETUP.md`                        | Setup autentikasi                              |
| `EMAIL_AUTH_SETUP.md`                  | Autentikasi berbasis email                     |
| `EMAIL_SETUP_GUIDE.md`                 | Konfigurasi Brevo untuk email transaksional    |
| `disable-email-confirmation.md`        | Mematikan konfirmasi email di Supabase         |
| `PAYMENT_PROOF_VERIFICATION_SETUP.md`  | Setup verifikasi bukti pembayaran              |
| `PAYMENT_PROOF_SETUP_CHECKLIST.md`     | Checklist bukti pembayaran                     |
| `MULTI_IMAGE_SETUP.md`                 | Multi-image per produk                         |
| `LANDING_PAGE_IMAGES_SETUP.md`         | Gambar landing page                            |
| `DEPLOYMENT.md`                        | Deployment ke produksi                         |

## `features/` — dokumentasi fitur

| File                                | Isi                                     |
| ----------------------------------- | --------------------------------------- |
| `FEATURES.md`                       | Daftar fitur lengkap                    |
| `BILINGUAL_FEATURE.md`              | Sistem dwibahasa (EN/ID)                |
| `BILINGUAL_COMPLETE.md`             | Status cakupan terjemahan               |
| `ENHANCED_BILINGUAL_ANIMATIONS.md`  | Animasi pergantian bahasa               |
| `RESPONSIVE_DESIGN.md`              | Pendekatan desain responsif             |
| `RESPONSIVE_DESIGN_COMPLETE.md`     | Status cakupan responsif                |
| `ADMIN_PANEL_IMPROVEMENTS.md`       | Perbaikan admin panel                   |
| `ADMIN_HEADER_ENHANCEMENT.md`       | Header admin                            |
| `MODERN_HEADER_UPDATE.md`           | Header situs utama                      |
| `IMAGE_MANAGEMENT_GUIDE.md`         | Pengelolaan gambar                      |

## `troubleshooting/` — catatan perbaikan masalah

| File                                 | Masalah                                 |
| ------------------------------------ | --------------------------------------- |
| `QUICK_FIX.md`                       | Masalah umum & solusi cepat             |
| `QUICK_FIX_REGISTRATION.md`          | Registrasi gagal (ringkas)              |
| `FIX_USER_REGISTRATION.md`           | Registrasi gagal (detail)               |
| `FIX_REGISTRATION_COMPLETE.md`       | Registrasi — perbaikan final            |
| `REGISTER_TRANSLATION_FIX.md`        | Terjemahan halaman register             |
| `FIX_EMAIL_500_ERROR.md`             | Error 500 saat kirim email              |
| `FIX_PAYMENT_PROOF_VERIFICATION.md`  | Verifikasi bukti pembayaran             |
| `IMAGE_FIX_GUIDE.md`                 | Gambar tidak muncul (detail)            |
| `IMAGE_FIX_README.md`                | Gambar tidak muncul (ringkas)           |

Script SQL yang disebut di dokumen-dokumen ini ada di [`../db/`](../db/README.md).
