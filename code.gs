/**
 * =====================================================================
 *  SURVEY MUSIK FAVORIT — Google Apps Script (Web App)
 * =====================================================================
 *  CARA PASANG
 *  1. Buka Google Spreadsheet kamu  →  menu Extensions > Apps Script.
 *  2. Hapus isi file Code.gs bawaan, lalu tempel seluruh kode ini.
 *  3. Pilih fungsi "setup" di dropdown atas, klik Run, lalu izinkan akses
 *     (hanya perlu sekali). Sheet "Responses" akan dibuat otomatis.
 *  4. Klik Deploy > New deployment > ikon roda gigi > pilih "Web app".
 *        Execute as      : Me
 *        Who has access  : Anyone
 *  5. Klik Deploy, salin "Web app URL" (berakhiran /exec).
 *  6. Tempel URL itu ke WEB_APP_URL di file app.js.
 *
 *  CATATAN: setiap kali kamu mengubah kode ini, buat deployment baru
 *  (Deploy > Manage deployments > Edit > Version: New version > Deploy)
 *  supaya perubahan aktif. URL /exec tetap sama.
 * =====================================================================
 */

const SHEET_NAME = 'Responses';
const HEADERS = [
  'Timestamp', 'Nama', 'Usia', 'Genre', 'Artis',
  'Lagu', 'Platform', 'Momen', 'Jam per Hari', 'Pesan'
];
const LIMIT = { nama: 40, usia: 30, genre: 30, artis: 60, lagu: 80, platform: 30, momen: 40, pesan: 160 };
const MAX_GENRE = 3;
const CACHE_KEY = 'survey_results_v1';
const CACHE_SECONDS = 20;

/* ------------------------------------------------------------------ */
/*  Jalankan sekali secara manual untuk membuat sheet & memberi izin   */
/* ------------------------------------------------------------------ */
function setup() {
  const sh = getSheet_();
  SpreadsheetApp.getActiveSpreadsheet().toast('Sheet "' + sh.getName() + '" siap dipakai.', 'Survey Musik', 5);
}

/* ------------------------------------------------------------------ */
/*  GET  → ?action=results  mengembalikan ringkasan hasil survey       */
/* ------------------------------------------------------------------ */
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : '';
    if (action === 'results') return json_(getResults_());
    return json_({ ok: true, message: 'API Survey Musik Favorit aktif.' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ------------------------------------------------------------------ */
/*  POST → menyimpan satu jawaban ke spreadsheet                       */
/* ------------------------------------------------------------------ */
function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(20000);
    locked = true;

    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
    let d;
    try {
      d = JSON.parse(raw);
    } catch (parseErr) {
      return json_({ ok: false, error: 'Format data tidak valid.' });
    }

    // Honeypot: bot biasanya mengisi kolom tersembunyi ini
    if (d && d.website) return json_({ ok: true });

    const genres = normalizeGenres_(d.genre);
    const row = {
      nama: clean_(d.nama, LIMIT.nama),
      usia: clean_(d.usia, LIMIT.usia),
      artis: clean_(d.artis, LIMIT.artis),
      lagu: clean_(d.lagu, LIMIT.lagu),
      platform: clean_(d.platform, LIMIT.platform),
      momen: clean_(d.momen, LIMIT.momen),
      pesan: clean_(d.pesan, LIMIT.pesan),
      jam: Number(d.jam)
    };

    const missing = [];
    if (!row.usia) missing.push('usia');
    if (!genres.length) missing.push('genre');
    if (!row.artis) missing.push('artis');
    if (!row.lagu) missing.push('lagu');
    if (!row.platform) missing.push('platform');
    if (!row.momen) missing.push('momen');
    if (missing.length) return json_({ ok: false, error: 'Data belum lengkap: ' + missing.join(', ') + '.' });
    if (!isFinite(row.jam)) return json_({ ok: false, error: 'Jam mendengarkan tidak valid.' });
    row.jam = Math.round(Math.min(24, Math.max(0, row.jam)) * 10) / 10;

    getSheet_().appendRow([
      new Date(), row.nama, row.usia, genres.join(', '), row.artis,
      row.lagu, row.platform, row.momen, row.jam, row.pesan
    ]);

    CacheService.getScriptCache().remove(CACHE_KEY);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (locked) {
      try { lock.releaseLock(); } catch (ignore) { /* noop */ }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Agregasi hasil                                                     */
/* ------------------------------------------------------------------ */
function getResults_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);

  const out = {
    ok: true, total: 0, avgHours: 0,
    genres: [], artists: [], songs: [], platforms: [], moments: [], ages: [], recent: [],
    updatedAt: new Date().toISOString()
  };

  const sh = getSheet_();
  const last = sh.getLastRow();

  if (last >= 2) {
    const rows = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
    const genres = {}, artists = {}, songs = {}, platforms = {}, moments = {}, ages = {};
    let hoursSum = 0, hoursN = 0;
    const recent = [];

    rows.forEach(function (r) {
      const nama = String(r[1] || '').trim();
      const usia = String(r[2] || '').trim();
      const genre = String(r[3] || '').trim();
      const artis = String(r[4] || '').trim();
      const lagu = String(r[5] || '').trim();
      const platform = String(r[6] || '').trim();
      const momen = String(r[7] || '').trim();
      const jam = Number(r[8]);
      const pesan = String(r[9] || '').trim();

      if (!usia && !genre && !artis && !lagu) return; // baris kosong

      out.total++;
      if (isFinite(jam) && r[8] !== '') { hoursSum += jam; hoursN++; }

      tally_(ages, usia);
      tally_(platforms, platform);
      tally_(moments, momen);
      tally_(artists, artis);
      tally_(songs, lagu);
      genre.split(',').forEach(function (g) { tally_(genres, g); });

      if (pesan) {
        recent.push({
          nama: nama || 'Anonim',
          pesan: pesan,
          genre: genre.split(',')[0].trim()
        });
      }
    });

    out.avgHours = hoursN ? Math.round((hoursSum / hoursN) * 10) / 10 : 0;
    out.genres = top_(genres, 8);
    out.artists = top_(artists, 5);
    out.songs = top_(songs, 5);
    out.platforms = top_(platforms, 6);
    out.moments = top_(moments, 6);
    out.ages = top_(ages, 6);
    out.recent = recent.slice(-6).reverse();
  }

  cache.put(CACHE_KEY, JSON.stringify(out), CACHE_SECONDS);
  return out;
}

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold')
      .setBackground('#f3ff2a')
      .setFontColor('#17112e');
    sh.setFrozenRows(1);

    // Kolom teks dibuat "plain text" supaya isi tidak pernah dianggap rumus
    const maxRows = sh.getMaxRows();
    sh.getRange(1, 2, maxRows, 7).setNumberFormat('@');   // B–H
    sh.getRange(1, 10, maxRows, 1).setNumberFormat('@');  // J
    sh.getRange(1, 1, maxRows, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sh.setColumnWidths(1, 1, 150);
    sh.setColumnWidths(2, 8, 140);
    sh.setColumnWidth(10, 280);
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Membersihkan teks: buang karakter kontrol, rapikan spasi, batasi panjang,
// dan hapus karakter pembuka rumus (= + - @) supaya aman saat diekspor.
function clean_(value, max) {
  let s = String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^[=+\-@]+/, '').trim();
  return s.slice(0, max);
}

function normalizeGenres_(value) {
  let list = [];
  if (Array.isArray(value)) list = value;
  else if (typeof value === 'string') list = value.split(',');
  const seen = {};
  const out = [];
  list.forEach(function (g) {
    const c = clean_(g, LIMIT.genre);
    const k = c.toLowerCase();
    if (c && !seen[k] && out.length < MAX_GENRE) { seen[k] = true; out.push(c); }
  });
  return out;
}

function norm_(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Jika seluruh teks huruf kecil, ubah jadi Title Case supaya rapi di tampilan
function pretty_(s) {
  if (s !== s.toLowerCase()) return s;
  return s.replace(/(^|[\s\-\/(&])([a-z\u00e0-\u024f])/g, function (m, a, b) {
    return a + b.toUpperCase();
  });
}

function tally_(map, label) {
  const text = String(label || '').trim();
  const key = norm_(text);
  if (!key) return;
  if (!map[key]) map[key] = { name: pretty_(text), count: 0 };
  map[key].count++;
}

function top_(map, n) {
  return Object.keys(map)
    .map(function (k) { return map[k]; })
    .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); })
    .slice(0, n);
}
