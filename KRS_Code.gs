// ═══════════════════════════════════════════════════════
// SIAKAD — Modul KRS (Kartu Rencana Studi)
// Google Apps Script — Code_KRS.gs  (Standalone)
// Baca data dari Spreadsheet DB Master yang sama
// ═══════════════════════════════════════════════════════

const SS_ID  = '1DkwEHwkRPgr_NHvdN11GkNr5b-EHKCGEMo-YMfGE-JU'; // ← ISI Spreadsheet ID (sama dgn modul Kurikulum)
const SS     = () => SpreadsheetApp.openById(SS_ID) || SpreadsheetApp.getActiveSpreadsheet();
const DATA_START = 3;

// ── Tambah sheet krs_config di DB Master (1 baris saja) ──
// Kolom: tahun_ajaran | semester_aktif | max_sks | status_penerimaan
// Contoh: 2025/2026   | 5              | 24      | Buka

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index_KRS')
    .setTitle('SIAKAD — Kartu Rencana Studi')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ─────────────────────────────────────────
// AUTENTIKASI & ROLE
// ─────────────────────────────────────────
// Role ditentukan dari sheet user_akun (kolom: id, nim, username, password_hash, role, status_akun, last_login)
// role: 'admin' | 'staf' | 'mahasiswa'
// Untuk mahasiswa: email Google harus cocok dengan email di sheet kontak_mahasiswa
// ATAU: bisa pakai login manual dengan verifikasi NIM + tanggal lahir

function getCurrentUser() {
  const email = Session.getActiveUser().getEmail();
  if (!email) return { role: 'guest', nim: null, email: null };

  // Cek apakah email ini admin/staf
  const users = sheetToObjects('user_akun',
    ['id','nim','username','password_hash','role','status_akun','last_login']);
  // Cek di kontak_mahasiswa (email mahasiswa)
  const kontak = sheetToObjects('kontak_mahasiswa', ['id','nim','no_hp','email','alamat_domisili']);
  const mhsKontak = kontak.find(k => (k.email||'').toLowerCase() === email.toLowerCase());
  if (mhsKontak) {
    return { role: 'mahasiswa', nim: String(mhsKontak.nim).trim(), email };
  }
  // Cek di user_akun untuk admin/staf (username = email prefix)
  const emailPrefix = email.split('@')[0];
  const adminUser = users.find(u => u.username === emailPrefix || u.username === email);
  if (adminUser) return { role: adminUser.role || 'staf', nim: null, email };
  return { role: 'guest', nim: null, email };
}

// Verifikasi login manual mahasiswa (NIM + tanggal lahir sebagai PIN)
// Cocok untuk kampus yang belum pakai Google Workspace
function loginMahasiswaManual(nim, tglLahir) {
  const nimStr = String(nim).trim();
  const list   = getAllMahasiswa();
  const mhs    = list.find(m => String(m.nim).trim() === nimStr);
  if (!mhs) return { success: false, message: 'NIM tidak ditemukan.' };
  if (mhs.status_mahasiswa !== 'Aktif')
    return { success: false, message: 'Akun mahasiswa tidak aktif.' };
  // Bandingkan tanggal lahir (format YYYY-MM-DD)
  const tglSheet = String(mhs.tanggal_lahir || '').substring(0, 10);
  const tglInput = String(tglLahir || '').substring(0, 10);
  if (tglSheet !== tglInput)
    return { success: false, message: 'Tanggal lahir tidak sesuai.' };
  const prodi = getProdi().find(p => Number(p.id) === Number(mhs.prodi_id));
  const akd   = getAkademikMahasiswa().find(a => String(a.nim).trim() === nimStr);
  return { success: true, mhs: { ...mhs, prodi, akademik: akd } };
}

// ─────────────────────────────────────────
// HELPERS (sama dengan modul Kurikulum)
// ─────────────────────────────────────────
function getSheet(name) { return SS().getSheetByName(name); }

function sheetToObjects(sheetName, colMap) {
  const sh = getSheet(sheetName);
  if (!sh) return [];
  const lastRow = sh.getLastRow();

  // Cari baris data pertama: cek row 2 dulu, kalau kosong cek row 3
  let startRow = 2;
  if (lastRow >= 3) {
    const r2 = sh.getRange(2, 1).getValue();
    // Kalau row 2 adalah label type (PK/FK/teks non-data), mulai dari row 3
    const r2str = String(r2).trim().toUpperCase();
    if (r2str === 'PK' || r2str === 'FK' || r2str === '★ REVISI' || r2str === '✚ BARU' || r2str === '') {
      startRow = 3;
    }
  }

  if (lastRow < startRow) return [];
  const numRows = lastRow - startRow + 1;
  const numCols = Math.max(sh.getLastColumn(), colMap.length);
  const data = sh.getRange(startRow, 1, numRows, numCols).getValues();

  return data.filter(r => r[0] !== '' && r[0] !== null).map(r => {
    const obj = {};
    colMap.forEach((k, i) => {
      const val = r[i] ?? null;
      // FIX: Date object dari spreadsheet WAJIB dikonversi ke string.
      // Jika Date tidak valid (sel kosong / format salah), GAS gagal
      // menserialisasi sehingga google.script.run crash dengan
      // "Cannot read properties of null (reading 'length')"
      // sebelum withSuccessHandler sempat dipanggil.
      if (val instanceof Date) {
        obj[k] = isNaN(val.getTime()) ? null : val.toISOString();
      } else {
        obj[k] = val;
      }
    });
    return obj;
  });
}

function getNextId(sheetName) {
  const sh = getSheet(sheetName);
  if (!sh) return 1;
  const lastRow = sh.getLastRow();
  if (lastRow < DATA_START) return 1;
  const ids = sh.getRange(DATA_START, 1, lastRow - DATA_START + 1, 1).getValues()
    .filter(r => r[0] !== '').map(r => Number(r[0]));
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function findRowById(sheetName, id) {
  const sh = getSheet(sheetName);
  if (!sh) return -1;
  const lastRow = sh.getLastRow();
  if (lastRow < DATA_START) return -1;
  const ids = sh.getRange(DATA_START, 1, lastRow - DATA_START + 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === Number(id)) return i + DATA_START;
  }
  return -1;
}

function appendRow(name, row) { getSheet(name).appendRow(row); }
function updateRow(name, rowNum, row) { getSheet(name).getRange(rowNum, 1, 1, row.length).setValues([row]); }
function deleteRowGas(name, rowNum) { getSheet(name).deleteRow(rowNum); }

// ─────────────────────────────────────────
// REFERENSI MASTER
// ─────────────────────────────────────────
function getProdi() {
  return sheetToObjects('prodi', ['id','kode_prodi','nama_prodi','singkatan','fakultas_id','jenjang','ketua_prodi']);
}
function getFakultas() {
  return sheetToObjects('fakultas', ['id','kode_fak','nama_fakultas','dekan']);
}
function getDosen() {
  return sheetToObjects('dosen', ['id','nidn','nama_dosen','prodi_id','jabatan_fungsional','status']);
}
function getMataKuliah() {
  return sheetToObjects('mata_kuliah', ['id','kode_mk','nama_mk','sks','scope','pengelola_prodi_id','pengelola_fak_id','jenis_nilai','rps_url']);
}
function getAllKelas() {
  return sheetToObjects('kelas', ['id','kode_kelas','mata_kuliah_id','dosen_id','semester','tahun_ajaran','jalur','kapasitas','ruangan']);
}
function getAllKelasProdi() {
  return sheetToObjects('kelas_prodi', ['id','kelas_id','prodi_id','is_host']);
}
function getKurikulum() {
  return sheetToObjects('kurikulum', ['id','kode_kurikulum','prodi_id','nama_kurikulum','tahun_berlaku','status']);
}
function getDetailKurikulum() {
  return sheetToObjects('detail_kurikulum', ['id','kurikulum_id','mata_kuliah_id','semester','sks_teori','sks_praktik','prasyarat_mk_id']);
}
function getAllMahasiswa() {
  const list = sheetToObjects('mahasiswa', ['nim','nik','id_pendaftaran','nama_lengkap','jenis_kelamin','tempat_lahir','tanggal_lahir','prodi_id','fakultas_id','jenjang','tahun_masuk','angkatan','status_mahasiswa','foto_url','created_at','updated_at']);
  // Paksa NIM selalu string (Sheets sering konversi ke number)
  return list.map(m => ({ ...m, nim: String(m.nim || '').trim() }));
}
function getAkademikMahasiswa() {
  return sheetToObjects('akademik_mahasiswa', ['id','nim','ipk','total_sks','semester_aktif','status_akademik']);
}

// ─────────────────────────────────────────
// KRS CONFIG (tahun ajaran aktif, dll)
// ─────────────────────────────────────────
function getKRSConfig() {
  const sh = getSheet('krs_config');
  if (!sh || sh.getLastRow() < 2) {
    return { tahun_ajaran: '', semester_aktif: 1, max_sks: 24, status_penerimaan: 'Tutup' };
  }
  const r = sh.getRange(2, 1, 1, 4).getValues()[0];
  return { tahun_ajaran: r[0], semester_aktif: Number(r[1]), max_sks: Number(r[2]) || 24, status_penerimaan: r[3] };
}

function saveKRSConfig(data) {
  const sh = getSheet('krs_config');
  if (!sh) return { success: false, message: 'Sheet krs_config tidak ditemukan. Buat dulu di Spreadsheet.' };
  const row = [data.tahun_ajaran, Number(data.semester_aktif), Number(data.max_sks) || 24, data.status_penerimaan];
  if (sh.getLastRow() < 2) sh.appendRow(row);
  else sh.getRange(2, 1, 1, 4).setValues([row]);
  return { success: true, message: 'Konfigurasi KRS berhasil disimpan' };
}

// ─────────────────────────────────────────
// INIT DATA
// ─────────────────────────────────────────
function getInitData() {
  const cfg = getKRSConfig();
  return {
    prodi:     getProdi(),
    fakultas:  getFakultas(),
    dosen:     getDosen(),
    mk:        getMataKuliah(),
    kelas:     getAllKelas(),
    kelasProdi:getAllKelasProdi(),
    kurikulum: getKurikulum(),
    detailKur: getDetailKurikulum(),
    config:    cfg
  };
}

// ─────────────────────────────────────────
// MAHASISWA
// ─────────────────────────────────────────
function searchMahasiswa(query) {
  const list = getAllMahasiswa();
  const q = (query || '').toLowerCase().trim();
  if (!q) return list.slice(0, 30);
  return list.filter(m => {
    // NIM bisa tersimpan sebagai number di Sheets — paksa string
    const nim  = String(m.nim  || '').toLowerCase();
    const nama = String(m.nama_lengkap || '').toLowerCase();
    return nim.includes(q) || nama.includes(q);
  }).slice(0, 30);
}

// function getMahasiswaDetail(nim) {
//   const list = getAllMahasiswa();
//   // NIM dari sheet bisa number — paksa string untuk perbandingan
//   const nimStr = String(nim).trim();
//   const mhs = list.find(m => String(m.nim).trim() === nimStr);
//   if (!mhs) return null;
//   const akademik = getAkademikMahasiswa().find(a => a.nim === nim);
//   const prodi    = getProdi().find(p => Number(p.id) === Number(mhs.prodi_id));
//   const fak      = getFakultas().find(f => Number(f.id) === Number(mhs.fakultas_id));
//   return { ...mhs, akademik, prodi, fakultas: fak };
// }

function getMahasiswaDetail(nim) {
  const list = getAllMahasiswa();
  const mhs = list.find(m => String(m.nim) === String(nim));
  if (!mhs) return null;
  const akademik = getAkademikMahasiswa().find(a => String(a.nim) === String(nim));
  const prodi    = getProdi().find(p => Number(p.id) === Number(mhs.prodi_id));
  const fak      = getFakultas().find(f => Number(f.id) === Number(mhs.fakultas_id));
  return { ...mhs, akademik, prodi, fakultas: fak };
}



function getDebugMahasiswaDetail(nim) {
  console.log(`[getMahasiswaDetail] Start with NIM:`, nim, `(type: ${typeof nim})`);

  const list = getAllMahasiswa();
  console.log(`[getMahasiswaDetail] Total mahasiswa from sheet: ${list.length}`);

  // NIM dari sheet bisa number — paksa string untuk perbandingan
  const nimStr = String(nim).trim();
  console.log(`[getMahasiswaDetail] NIM as string: "${nimStr}"`);

  const mhs = list.find(m => String(m.nim).trim() === nimStr);
  if (!mhs) {
    console.warn(`[getMahasiswaDetail] Mahasiswa with NIM "${nimStr}" not found`);
    return null;
  }
  console.log(`[getMahasiswaDetail] Mahasiswa found:`, { nim: mhs.nim, nama: mhs.nama, prodi_id: mhs.prodi_id, fakultas_id: mhs.fakultas_id });

  const akademikList = getAkademikMahasiswa();
  const akademik = akademikList.find(a => a.nim === nim);
  if (!akademik) {
    console.warn(`[getMahasiswaDetail] Akademik data not found for NIM:`, nim);
  } else {
    console.log(`[getMahasiswaDetail] Akademik found:`, akademik);
  }

  const prodiList = getProdi();
  const prodi = prodiList.find(p => Number(p.id) === Number(mhs.prodi_id));
  if (!prodi) {
    console.warn(`[getMahasiswaDetail] Prodi not found for prodi_id: ${mhs.prodi_id}`);
  } else {
    console.log(`[getMahasiswaDetail] Prodi found:`, prodi);
  }

  const fakList = getFakultas();
  const fak = fakList.find(f => Number(f.id) === Number(mhs.fakultas_id));
  if (!fak) {
    console.warn(`[getMahasiswaDetail] Fakultas not found for fakultas_id: ${mhs.fakultas_id}`);
  } else {
    console.log(`[getMahasiswaDetail] Fakultas found:`, fak);
  }

  const result = { ...mhs, akademik, prodi, fakultas: fak };
  console.log(`[getMahasiswaDetail] Returning result for NIM ${nimStr}:`, {
    nim: result.nim,
    nama: result.nama,
    hasAkademik: !!result.akademik,
    hasProdi: !!result.prodi,
    hasFakultas: !!result.fakultas
  });
  return result;
}








// ─────────────────────────────────────────
// KELAS TERSEDIA UNTUK PRODI & SEMESTER
// ─────────────────────────────────────────
function getKelasAvailable(prodiId, semester, tahunAjaran) {
  const allKelas   = getAllKelas();
  const kelasProdi = getAllKelasProdi();
  const mk         = getMataKuliah();
  const dosen      = getDosen();

  // Filter kelas yang sesuai semester + tahun ajaran + prodi
  return allKelas
    .filter(k => {
      const smtMatch = !semester || Number(k.semester) === Number(semester);
      const taMatch  = !tahunAjaran || k.tahun_ajaran === tahunAjaran;
      if (!smtMatch || !taMatch) return false;
      // Cek apakah prodi ini terdaftar di kelas
      return kelasProdi.some(kp =>
        Number(kp.kelas_id) === Number(k.id) && Number(kp.prodi_id) === Number(prodiId)
      );
    })
    .map(k => {
      const mkData    = mk.find(m => Number(m.id) === Number(k.mata_kuliah_id));
      const dosenData = dosen.find(d => Number(d.id) === Number(k.dosen_id));
      const prodiKp   = kelasProdi.filter(kp => Number(kp.kelas_id) === Number(k.id));
      return {
        ...k,
        mk:       mkData   || null,
        dosen:    dosenData || null,
        prodiKp
      };
    });
}

function getKelasUntukMahasiswa(nim, semester, tahunAjaran) {
  const mhs = getAllMahasiswa().find(m => String(m.nim) === String(nim));
  if (!mhs) return [];
  const kelasList = getKelasAvailable(mhs.prodi_id, semester, tahunAjaran);
  // Flatten: frontend mengakses k.kode_mk, k.nama_mk, k.sks, k.nama_dosen langsung
  return kelasList.map(k => ({
    id:             k.id,
    kode_kelas:     k.kode_kelas,
    mata_kuliah_id: k.mata_kuliah_id,
    dosen_id:       k.dosen_id,
    semester:       k.semester,
    tahun_ajaran:   k.tahun_ajaran,
    jalur:          k.jalur,
    kapasitas:      k.kapasitas,
    ruangan:        k.ruangan || '',
    // Data MK (diratakan dari objek mk)
    kode_mk:   k.mk ? k.mk.kode_mk  : '',
    nama_mk:   k.mk ? k.mk.nama_mk  : '',
    sks:       k.mk ? Number(k.mk.sks) : 0,
    scope:     k.mk ? k.mk.scope    : '',
    rps_url:   k.mk ? k.mk.rps_url  : '',
    // Data Dosen (diratakan dari objek dosen)
    nama_dosen: k.dosen ? k.dosen.nama_dosen : 'TBA',
  }));
}

// ─────────────────────────────────────────
// KRS CRUD
// ─────────────────────────────────────────
const KRS_COLS = ['id','nim','kurikulum_id','semester','tahun_ajaran','status_krs'];
const KRS_DET_COLS = ['id','krs_id','kelas_id','sks'];

function getKRSByNIM(nim) {
  const all = sheetToObjects('krs', KRS_COLS);
  const nimStr = String(nim).trim();
  return all.filter(k => String(k.nim).trim() === nimStr);
}

function getAllKRS() {
  return sheetToObjects('krs', KRS_COLS);
}

function getKRSDetail(krsId) {
  const all = sheetToObjects('krs_detail', KRS_DET_COLS);
  return all.filter(d => Number(d.krs_id) === Number(krsId));
}

function saveKRS(data) {
  // data: { nim, kurikulum_id, semester, tahun_ajaran, kelas_ids[] }
  const cfg = getKRSConfig();
  if (cfg.status_penerimaan !== 'Buka') {
    return { success: false, message: 'Penerimaan KRS sedang ditutup oleh admin.' };
  }

  // Cek apakah sudah ada KRS aktif untuk semester + TA ini
  const existing = sheetToObjects('krs', KRS_COLS).find(k =>
    String(k.nim).trim() === String(data.nim).trim() &&
    Number(k.semester) === Number(data.semester) &&
    k.tahun_ajaran === data.tahun_ajaran &&
    k.status_krs !== 'Ditolak'
  );
  if (existing && !data.id) {
    return { success: false, message: `KRS semester ${data.semester} TA ${data.tahun_ajaran} sudah ada (${existing.status_krs}).` };
  }
  // Validasi semester: S1 max 14 semester (7 tahun), S2 max 8 semester
  const mhsData  = getAllMahasiswa().find(m => String(m.nim).trim() === String(data.nim).trim());
  const jenjang  = mhsData?.jenjang || 'S1';
  const semMax   = jenjang === 'S2' ? 8 : 14;
  if (Number(data.semester) > semMax) {
    return { success: false, message: `Semester ${data.semester} melebihi batas maksimum (${semMax} semester) untuk jenjang ${jenjang}.` };
  }

  const krsId = data.id ? Number(data.id) : getNextId('krs');
  const krsRow = [krsId, data.nim, Number(data.kurikulum_id), Number(data.semester), data.tahun_ajaran, 'Diajukan'];

  if (data.id) {
    // Update — hapus detail lama
    const rowNum = findRowById('krs', data.id);
    if (rowNum === -1) return { success: false, message: 'KRS tidak ditemukan' };
    updateRow('krs', rowNum, krsRow);
    _deleteKRSDetail(data.id);
  } else {
    appendRow('krs', krsRow);
  }

  // Simpan detail (kelas yang dipilih)
  const mk = getMataKuliah();
  const kelas = getAllKelas();
  let detId = getNextId('krs_detail');
  (data.kelas_ids || []).forEach(kelasId => {
    const k = kelas.find(kl => Number(kl.id) === Number(kelasId));
    const m = k ? mk.find(m => Number(m.id) === Number(k.mata_kuliah_id)) : null;
    const sks = m ? Number(m.sks) : 0;
    appendRow('krs_detail', [detId++, krsId, Number(kelasId), sks]);
  });

  // Update akademik mahasiswa
  _updateAkademikMhs(data.nim);

  return { success: true, message: 'KRS berhasil diajukan', id: krsId, krsId: krsId };
}

function _deleteKRSDetail(krsId) {
  const sh = getSheet('krs_detail');
  if (!sh || sh.getLastRow() < DATA_START) return;
  const data = sh.getRange(DATA_START, 1, sh.getLastRow() - DATA_START + 1, 2).getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    if (Number(data[i][1]) === Number(krsId)) sh.deleteRow(i + DATA_START);
  }
}

function approveKRS(krsId) {
  const rowNum = findRowById('krs', krsId);
  if (rowNum === -1) return { success: false, message: 'KRS tidak ditemukan' };
  getSheet('krs').getRange(rowNum, 6).setValue('Disetujui');
  return { success: true, message: 'KRS berhasil disetujui' };
}

// FIX #5: Frontend memanggil tolakKRS() tapi backend mendefinisikan rejectKRS().
// Fungsi diganti namanya menjadi tolakKRS agar cocok dengan pemanggilan frontend.
function tolakKRS(krsId, alasan) {
  const rowNum = findRowById('krs', krsId);
  if (rowNum === -1) return { success: false, message: 'KRS tidak ditemukan' };
  getSheet('krs').getRange(rowNum, 6).setValue('Ditolak');
  // Simpan alasan di kolom 7 jika ada
  const sh = getSheet('krs');
  const lastCol = sh.getLastColumn();
  if (lastCol >= 7) sh.getRange(rowNum, 7).setValue(alasan || '');
  return { success: true, message: 'KRS ditolak' };
}


// FIX #6: Frontend memanggil ajukanKRS(krsId) setelah saveKRS,
// tapi fungsi ini tidak ada di backend. Ditambahkan di sini.
function ajukanKRS(krsId) {
  const rowNum = findRowById('krs', krsId);
  if (rowNum === -1) return { success: false, message: 'KRS tidak ditemukan' };
  const sh = getSheet('krs');
  const currentStatus = sh.getRange(rowNum, 6).getValue();
  if (currentStatus === 'Disetujui') {
    return { success: false, message: 'KRS yang sudah disetujui tidak dapat diajukan ulang.' };
  }
  sh.getRange(rowNum, 6).setValue('Diajukan');
  return { success: true, message: 'KRS berhasil diajukan ke admin' };
}


function deleteKRS(krsId) {
  const allKrs = sheetToObjects('krs', KRS_COLS);
  const krs = allKrs.find(k => Number(k.id) === Number(krsId));
  if (!krs) return { success: false, message: 'KRS tidak ditemukan' };
  if (krs.status_krs === 'Disetujui') return { success: false, message: 'KRS yang sudah disetujui tidak bisa dihapus.' };
  _deleteKRSDetail(krsId);
  const rowNum = findRowById('krs', krsId);
  deleteRowGas('krs', rowNum);
  return { success: true, message: 'KRS berhasil dihapus' };
}

// ─────────────────────────────────────────
// VALIDASI KRS
// ─────────────────────────────────────────
function validateKRS(nim, kelasIds, semester, kurikulumId) {
  const errors = [];
  const warnings = [];
  const cfg = getKRSConfig();

  const mk       = getMataKuliah();
  const kelas    = getAllKelas();
  const detKur   = getDetailKurikulum().filter(d => Number(d.kurikulum_id) === Number(kurikulumId));
  const nilaiSh  = sheetToObjects('nilai', ['id','krs_detail_id','nilai_angka','nilai_huruf','bobot','updated_at']);
  const krsList  = sheetToObjects('krs', KRS_COLS).filter(k => k.nim === nim);
  const krsDetAll = sheetToObjects('krs_detail', KRS_DET_COLS);

  // Hitung SKS yang akan diambil
  let totalSKS = 0;
  const mkDipilih = [];

  kelasIds.forEach(kid => {
    const k = kelas.find(kl => Number(kl.id) === Number(kid));
    if (!k) { errors.push(`Kelas id ${kid} tidak ditemukan`); return; }
    const m = mk.find(m => Number(m.id) === Number(k.mata_kuliah_id));
    if (!m) { warnings.push(`MK untuk kelas ${k.kode_kelas} tidak ditemukan`); return; }
    totalSKS += Number(m.sks);
    mkDipilih.push({ mk: m, kelas: k });
  });

  // Catatan: semester > 8 tetap diperbolehkan (mahasiswa perpanjangan studi)
  // Max SKS untuk semester lanjutan lebih rendah (cukup MK yang perlu diulang)
  const effectiveMaxSKS = Number(semester) > 8 ? Math.min(cfg.max_sks, 18) : cfg.max_sks;

  // Max SKS
  if (totalSKS > effectiveMaxSKS) {
    errors.push(`Total SKS (${totalSKS}) melebihi batas maksimum ${effectiveMaxSKS} SKS${Number(semester) > 8 ? ' (semester perpanjangan)' : ''}`);
  }
  if (totalSKS === 0) {
    errors.push('Belum ada mata kuliah yang dipilih');
  }

  // Duplikat MK
  const mkIds = mkDipilih.map(x => x.mk.id);
  const dupIds = mkIds.filter((id, i) => mkIds.indexOf(id) !== i);
  if (dupIds.length) errors.push('Terdapat mata kuliah duplikat dalam pilihan');

  // Cek prasyarat
  mkDipilih.forEach(({ mk: m, kelas: k }) => {
    const dkEntry = detKur.find(d => Number(d.mata_kuliah_id) === Number(m.id));
    if (!dkEntry || !dkEntry.prasyarat_mk_id) return;
    const prasyaratMkId = Number(dkEntry.prasyarat_mk_id);

    // Cari apakah prasyarat sudah pernah lulus (ada di nilai dengan nilai >= C)
    let lulus = false;
    krsList.forEach(krs => {
      if (Number(krs.semester) >= Number(semester)) return; // hanya semester sebelumnya
      const dets = krsDetAll.filter(d => Number(d.krs_id) === Number(krs.id));
      dets.forEach(det => {
        const detKelas = kelas.find(kl => Number(kl.id) === Number(det.kelas_id));
        if (!detKelas) return;
        const detMk = mk.find(mm => Number(mm.id) === Number(detKelas.mata_kuliah_id));
        if (detMk && Number(detMk.id) === prasyaratMkId) {
          const nilai = nilaiSh.find(n => Number(n.krs_detail_id) === Number(det.id));
          if (nilai && Number(nilai.bobot) >= 2.0) lulus = true; // minimal C
        }
      });
    });

    if (!lulus) {
      const prasyaratMk = mk.find(mm => Number(mm.id) === prasyaratMkId);
      warnings.push(`${m.nama_mk}: prasyarat "${prasyaratMk?.nama_mk || `MK#${prasyaratMkId}`}" belum lulus (min. C)`);
    }
  });

  return {
    valid: errors.length === 0,
    totalSKS,
    maxSKS: cfg.max_sks,
    errors,
    warnings,
    mkDipilih: mkDipilih.map(x => ({ id: x.mk.id, nama: x.mk.nama_mk, kode: x.mk.kode_mk, sks: x.mk.sks, jalur: x.kelas.jalur }))
  };
}

// ─────────────────────────────────────────
// UPDATE AKADEMIK MAHASISWA (otomatis)
// ─────────────────────────────────────────
function _updateAkademikMhs(nim) {
  const sh = getSheet('akademik_mahasiswa');
  if (!sh) return;
  const lastRow = sh.getLastRow();
  if (lastRow < DATA_START) return;
  const rows = sh.getRange(DATA_START, 1, lastRow - DATA_START + 1, 6).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][1]).trim() === String(nim).trim()) {
      // Hitung total SKS dari semua KRS disetujui
      const krsList  = sheetToObjects('krs', KRS_COLS).filter(k => k.nim === nim && k.status_krs === 'Disetujui');
      const krsDetAll = sheetToObjects('krs_detail', KRS_DET_COLS);
      const mkList   = getMataKuliah();
      const kelasList = getAllKelas();
      let totalSKS = 0;
      krsList.forEach(krs => {
        krsDetAll.filter(d => Number(d.krs_id) === Number(krs.id)).forEach(det => {
          const k = kelasList.find(kl => Number(kl.id) === Number(det.kelas_id));
          const m = k ? mkList.find(mm => Number(mm.id) === Number(k.mata_kuliah_id)) : null;
          if (m) totalSKS += Number(m.sks);
        });
      });
      const semesterAktif = krsList.length > 0 ? Math.max(...krsList.map(k => Number(k.semester))) : rows[i][4];
      sh.getRange(i + DATA_START, 4).setValue(totalSKS);
      sh.getRange(i + DATA_START, 5).setValue(semesterAktif);
      break;
    }
  }
}

// ─────────────────────────────────────────
// DASHBOARD SUMMARY
// ─────────────────────────────════════════
function getKRSSummary() {
  const cfg      = getKRSConfig();
  const allKRS   = getAllKRS();
  const mhsList  = getAllMahasiswa().filter(m => m.status_mahasiswa === 'Aktif');

  const byStatus = { Diajukan: 0, Disetujui: 0, Ditolak: 0 };
  allKRS.forEach(k => { if (byStatus[k.status_krs] !== undefined) byStatus[k.status_krs]++; });

  // Mahasiswa aktif yang belum input KRS semester ini
  // "Belum input KRS" = mahasiswa aktif yang belum punya KRS di TA ini
  // (berapapun semesternya — tiap mahasiswa punya semester berbeda)
  const nimDenganKRSTA = new Set(
    allKRS
      .filter(k => k.tahun_ajaran === cfg.tahun_ajaran)
      .map(k => String(k.nim).trim())
  );
  const belumInput = mhsList.filter(m => !nimDenganKRSTA.has(String(m.nim).trim())).length;

  // Hitung mahasiswa perpanjangan (semester > 8 untuk S1, > 4 untuk S2)
  const perpanjangan = mhsList.filter(m => {
    const akd = getAkademikMahasiswa().find(a => String(a.nim).trim() === String(m.nim).trim());
    if (!akd) return false;
    const maxNormal = (m.jenjang || 'S1') === 'S2' ? 4 : 8;
    return Number(akd.semester_aktif) > maxNormal;
  }).length;

  return { ...byStatus, belumInput, totalAktif: mhsList.length, perpanjangan, config: cfg };
}

// ─────────────────────────────────────────
// NILAI (untuk cek lulus prasyarat & transkrip)
// ─────────────────────────────────────────
function getNilaiByNIM(nim) {
  const krsList  = sheetToObjects('krs', KRS_COLS).filter(k => k.nim === nim);
  const krsDetAll = sheetToObjects('krs_detail', KRS_DET_COLS);
  const nilaiAll  = sheetToObjects('nilai', ['id','krs_detail_id','nilai_angka','nilai_huruf','bobot','updated_at']);
  const kelasList = getAllKelas();
  const mkList    = getMataKuliah();

  const result = [];
  krsList.forEach(krs => {
    const dets = krsDetAll.filter(d => Number(d.krs_id) === Number(krs.id));
    dets.forEach(det => {
      const k = kelasList.find(kl => Number(kl.id) === Number(det.kelas_id));
      const m = k ? mkList.find(mm => Number(mm.id) === Number(k.mata_kuliah_id)) : null;
      const n = nilaiAll.find(nl => Number(nl.krs_detail_id) === Number(det.id));
      result.push({
        semester: krs.semester, tahun_ajaran: krs.tahun_ajaran, jalur: k?.jalur,
        mk: m, nilai: n || null
      });
    });
  });
  return result;
}

// getDebugMahasiswaDetail(252110001);
