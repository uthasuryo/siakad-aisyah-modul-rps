Teknologi : spreadsheet + Google script

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