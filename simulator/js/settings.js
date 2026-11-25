// Pengaturan pertandingan: dibaca dari parameter URL, dengan pilihan terakhir disimpan di browser.
// Menu awal (js/menu.js) hanya menyusun URL lalu memuat ulang halaman, jadi simulator selalu
// dibangun dari parameter URL dan tautan lama (?tim=biru, ?storage=rapat) tetap berlaku.

import { PROFIL, BAWAAN } from './profiles.js';

const KEY = 'simabu.pengaturan';
// pilihan desain robot (js/profiles.js): ?br=, ?tr= untuk tim sendiri, ?lawanBr=, ?lawanTr= untuk lawan
export const ROBOT = { br: 'BR', tr: 'TR', lawanBr: 'BR', lawanTr: 'TR' };

export const PILIHAN = {
  mode: { label: 'Mode', opsi: { latihan: 'Latihan bebas', pertandingan: 'Pertandingan (setup 1 menit, mulai saat buzzer)' } },
  tim: { label: 'Tim', opsi: { merah: 'Merah', biru: 'Biru' } },
  storage: { label: 'Storage', opsi: { akses: '18 Earth — semua terjangkau TR', rapat: '20 Earth — jumlah resmi (Rule 4.1.3)', kustom: 'Susun sendiri' } },
  otoBR: { label: 'BR (Builder)', opsi: { 1: 'Otonom (Rule 11.3)', 0: 'Manual' } },
  otoTR: { label: 'TR (Transporter)', opsi: { 0: 'Manual', 1: 'Otonom' } },
  strategi: { label: 'Strategi otonom', opsi: { mandate: 'Mandate dulu, lalu Mustika, lalu L2', l2: 'Earth ke L2 dulu (poin 2×)', l1: 'Hanya spot L1', maling: 'Maling (balik menara Shared lawan, TR siaga Mustika)', kustom: 'Susun sendiri' } },
  lawan: { label: 'Tim lawan', opsi: { 0: 'Tidak ada', santai: 'Otonom — santai', penuh: 'Otonom — penuh', agresif: 'Otonom — agresif (balik Sky kita lebih dulu)', manusia: '2 pemain — stik mengemudikan TR lawan' } },
  sensor: { label: 'Sensor BR otonom', opsi: { sempurna: 'Sempurna (posisi pasti)', realistis: 'Realistis (kamera: galat & jangkauan)' } },
  fisika: { label: 'Fisika benda', opsi: { normal: 'Normal (Earth tetap di tempat)', licin: 'Licin (Earth tunggal di lantai bisa terdorong)' } },
  tantangan: { label: 'Latihan TR', opsi: { 0: 'Tidak', earth: 'Antar 2 tumpukan Earth', sky: 'Antar 2 Sky', mustika: 'Mustika ke BR (Mandate dianggap sudah)' } },
  forced: { label: 'Forced Retry', opsi: { otomatis: 'Otomatis (wasit memindahkan robot)', peringatan: 'Peringatan saja' } },
  retry: { label: 'Waktu Retry', opsi: { 0: 'Instan', 5: '5 detik', 10: '10 detik' } },
  grafis: { label: 'Grafis', opsi: { normal: 'Normal (bayangan halus)', ringan: 'Ringan (laptop lemah)' } },
  suara: { label: 'Suara', opsi: { aktif: 'Aktif (buzzer, hitung mundur)', bisu: 'Bisu' } },
};

const BAWAAN_MENU = { mode: 'latihan', tim: 'merah', storage: 'akses', otoBR: '1', otoTR: '0', strategi: 'mandate', lawan: '0', sensor: 'sempurna', fisika: 'normal', tantangan: '0', retry: '5', forced: 'otomatis', grafis: 'normal', suara: 'aktif' };
// tautan langsung tanpa menu: perilaku lama (kedua robot manual sampai O / I ditekan)
const BAWAAN_URL = { ...BAWAAN_MENU, otoBR: '0', retry: '0', forced: 'peringatan' };

function saved() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function readSettings() {
  const q = new URLSearchParams(location.search);
  const known = [...Object.keys(PILIHAN), ...Object.keys(ROBOT)].some((k) => q.has(k));
  const started = q.get('menu') === '0' || q.has('mulai') || known;
  const s = started ? { ...BAWAAN_URL } : { ...BAWAAN_MENU, ...saved() };
  for (const k of Object.keys(PILIHAN)) {
    let v = q.get(k);
    if (k === 'tim' && v === 'blue') v = 'biru';
    if (k === 'lawan' && v === '1') v = 'penuh';
    if (v !== null && v in PILIHAN[k].opsi) s[k] = v;
    if (!(s[k] in PILIHAN[k].opsi)) s[k] = BAWAAN_MENU[k];
  }
  const prev = started ? {} : saved();
  for (const [k, kind] of Object.entries(ROBOT)) {
    const v = q.get(k) ?? prev[k] ?? (k.startsWith('lawan') ? s[k === 'lawanBr' ? 'br' : 'tr'] : null);
    s[k] = v && v in PROFIL[kind] ? v : BAWAAN[kind];
  }
  s.started = started;
  return s;
}

export function saveSettings(s) {
  const out = {};
  for (const k of [...Object.keys(PILIHAN), ...Object.keys(ROBOT)]) if (s[k] !== undefined) out[k] = s[k];
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* penyimpanan diblokir */ }
}

// Alamat untuk memulai simulator dengan pengaturan s
export function startUrl(s) {
  const q = new URLSearchParams({ mulai: '1' });
  for (const k of Object.keys(PILIHAN)) q.set(k, s[k]);
  for (const [k, kind] of Object.entries(ROBOT)) if (s[k] && s[k] !== BAWAAN[kind]) q.set(k, s[k]);
  return `${location.pathname}?${q}`;
}

export const menuUrl = () => location.pathname;
