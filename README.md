Teknologi : spreadsheet + Google script

Cara Pasang di GAS
1. Buat GAS project baru (standalone, bukan dari Spreadsheet) → Extensions → Apps Script
2. Isi SS_ID di Code_KRS.gs baris 1:
const SS_ID = 'ID_SPREADSHEET_DB_MASTER_KAMU';
3. Buat 2 file:

Code.gs → paste isi Code_KRS.gs
HTML file → nama Index_KRS → paste isi KRS_Index.html
4. Buat sheet krs_config di Spreadsheet DB Master — lihat panduan di halaman Konfigurasi KRS dalam aplikasi.
5. Deploy sebagai Web App.

Fitur Lengkap Modul KRS

DashboardStatistik : diajukan/disetujui/ditolak/belum input, tabel semua KRS dengan quick-approve
Input KRS : Cari mahasiswa (live search), tampilkan info akademik (IPK, SKS, semester), pilih kelas via card grid, SKS meter animasi ring, validasi real-time (prasyarat, max SKS, duplikat), riwayat KRS per mahasiswa
Approval KRS : Filter per prodi/status, lihat detail MK per KRS, setujui atau tolak dengan alasan
Rekap KRS : Filter TA + semester + prodi, export placeholder
Konfigurasi : Set tahun ajaran, semester aktif, max SKS, buka/tutup penerimaan KRS — langsung tersimpan ke sheet krs_config


Logika semester sekarang punya hierarki prioritas yang jelas:
semester mahasiswa
    ↓ ada di sheet akademik_mahasiswa?  → pakai itu
    ↓ belum ada (belum migrasi)?        → pakai config.semester_aktif
    ↓ config juga kosong?               → default ke 1

Kalau data akademik belum ada, sistem tetap jalan dan muncul notifikasi kuning: "Data akademik belum ada — semester diisi dari konfigurasi (Smt 5)" — jadi admin tahu mahasiswa mana yang datanya belum dimigrasi.
Tahun ajaran juga ikut hierarki: ambil dari config.tahun_ajaran dulu, baru auto-hitung dari tanggal sistem kalau kosong.