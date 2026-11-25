// Profil robot: geometri (G, meter, kerangka lokal robot: x ke kiri, z ke depan), parameter gerak
// (P) dan model. Robot lain ditambahkan dengan menambah entri di sini; lihat README "Menambah robot".
//   model.type 'glb'   model CAD dengan nama node konvensi Werkudara (digerakkan lewat rig)
//   model.type 'kotak' robot digambar dari G (js/boxmodel.js)
//   model.type 'glb-cangkang' GLB apa pun sebagai rangka statis di atas mekanisme kotak

import { BR_PARAMS, TR_PARAMS } from './config.js';

const BR_G = {
  hw: 0.334, zr: -0.323, zf: 0.30,            // setengah lebar, tepi belakang, tepi depan rangka
  bodyH: BR_PARAMS.bodyH,                      // tinggi rangka + tiang saat lift di bawah
  trackIn: 0.049, trackOut: 0.197, trackZ0: -0.291,   // kedua track tangga (|x| dari..sampai, ujung belakang)
  cupReach: 0.322,                             // pusat robot -> muka cup, boom ditarik
  cupHx: 0.088, cupHz: 0.03, cupHy: 0.045,     // pelat 3 cup: setengah lebar, tebal, setengah tinggi
  stepXs: [-0.33, -0.11, 0.11, 0.33],          // titik tumpu roda (lateral)
  trackXs: [-0.19, -0.06, 0.06, 0.19],         // titik tumpu track
  stepZs: [-0.32, -0.16, 0, 0.16, 0.32],       // titik tumpu (memanjang)
  wheel: [0.31, 0.156, -0.184, 0.048],         // roda: |x|, z depan, z belakang, jari-jari
};
const BR_P = {
  ...BR_PARAMS,
  preset: [                                    // tombol 1..6
    { h: 335, e: 0, roll: 0 }, { h: 175, e: 0, roll: 0 }, { h: 525, e: 0, roll: 0 },
    { h: 460, e: 0, roll: 0, track: 1 }, { h: 100, e: 0, roll: 0 }, { h: 800, e: 120, roll: 0 },
  ],
};

const TR_G = {
  hw: 0.334, zr: -0.334, zf: 0.334,
  armIn: 0.222,                                // setengah lebar kantong di antara kedua lengan
  armH: 0.2, rearZ1: -0.06, bodyH: TR_PARAMS.bodyH,
  anchorAhead: 0.136,                          // pusat robot -> pusat bantalan rahang (hanya untuk model kotak)
  padAhead: -0.0695, padHz: 0.1485,            // pusat & setengah panjang jari rahang terhadap pusat bantalan
  padT: 0.016, padHy: 0.04,                    // setengah tebal jari, setengah tinggi bantalan
  padTolF: 0.042, padTolY: 0.014,              // toleransi posisi benda di bantalan: memanjang, vertikal
  stepXs: [-0.33, -0.11, 0.11, 0.33],
  stepZs: [-0.32, -0.16, 0, 0.16, 0.32],
  wheel: [0.31, 0.254, -0.254, 0.048],
};
const TR_P = { ...TR_PARAMS, preset: [250, 175, 525, 554, 646, 100] };

// Varian contoh (bukan CAD): menunjukkan cara mengubah ukuran. Titik tumpu ikut diskalakan.
const scaleXs = (xs, k) => xs.map((v) => +(v * k).toFixed(3));

const BR_RINGKAS_G = {
  ...BR_G,
  hw: 0.30, zr: -0.29, zf: 0.27,                // rangka 600 x 560 mm
  bodyH: 0.62,
  stepXs: scaleXs(BR_G.stepXs, 0.30 / 0.334),
  stepZs: scaleXs(BR_G.stepZs, 0.28 / 0.32),
  trackZ0: -0.26,
  wheel: [0.276, 0.13, -0.16, 0.048],
};
const BR_RINGKAS_P = { ...BR_P, bodyH: 0.62, speed: 1.0, rot: 2.0 };

const TR_RAMPING_G = {
  ...TR_G,
  hw: 0.30, zr: -0.30, zf: 0.30,                // rangka 600 x 600 mm, kantong tetap 444 mm
  armIn: 0.222,
  stepXs: scaleXs(TR_G.stepXs, 0.30 / 0.334),
  stepZs: scaleXs(TR_G.stepZs, 0.29 / 0.32),
  wheel: [0.276, 0.23, -0.23, 0.048],
};

const KOTAK = { type: 'kotak' };

export const PROFIL = {
  BR: {
    'br-r1': { label: 'BR R1', deskripsi: 'Builder (vakum + lift)', model: { type: 'glb', url: 'assets/BR_R1.glb' }, G: BR_G, P: BR_P },
    'br-kotak': { label: 'BR Kotak', deskripsi: 'Builder kotak, ukuran R1', model: KOTAK, G: BR_G, P: BR_P },
    'br-ringkas': { label: 'BR Ringkas', deskripsi: 'contoh, bukan CAD — rangka 600 mm', model: KOTAK, G: BR_RINGKAS_G, P: BR_RINGKAS_P },
  },
  TR: {
    'tr-r3': { label: 'TR R3', deskripsi: 'Transporter (mecanum + penjepit)', model: { type: 'glb', url: 'assets/TR_R3.glb' }, G: TR_G, P: TR_P },
    'tr-kotak': { label: 'TR Kotak', deskripsi: 'Transporter kotak, ukuran R3', model: KOTAK, G: TR_G, P: TR_P },
    'tr-ramping': { label: 'TR Ramping', deskripsi: 'contoh, bukan CAD — rangka 600 mm', model: KOTAK, G: TR_RAMPING_G, P: TR_P },
  },
};

export const BAWAAN = { BR: 'br-r1', TR: 'tr-r3' };

export function profilOf(kind, id) {
  const p = PROFIL[kind][id] || PROFIL[kind][BAWAAN[kind]];
  return { id: id in PROFIL[kind] ? id : BAWAAN[kind], ...p };
}

// ---------------------------------------------------------------- robot kustom
// Angka diisi di menu awal dan disimpan di browser (localStorage 'simabu.kustom').
// Satuan mm (kecepatan m/s, putaran rad/s). Robot digambar kotak; bila `cangkang` berisi alamat
// GLB (mis. assets/robotku.glb), GLB itu ditampilkan sebagai rangka statis di atas robot kotak.
const KEY_KUSTOM = 'simabu.kustom';

export const KUSTOM_FIELD = {
  BR: [
    ['lebar', 'Lebar rangka', 'mm', 400, 1000], ['panjang', 'Panjang rangka', 'mm', 400, 1000],
    ['hMax', 'Tinggi cup maks', 'mm', 500, 1300], ['eMax', 'Juluran boom maks', 'mm', 0, 600],
    ['speed', 'Kecepatan', 'm/s', 0.2, 3], ['rot', 'Putaran', 'rad/s', 0.5, 5],
    ['acc', 'Percepatan', 'm/s²', 0.5, 10], ['hSpeed', 'Kecepatan lift', 'mm/s', 50, 1500], ['eSpeed', 'Kecepatan boom', 'mm/s', 50, 1000],
    ['baterai', 'Penurunan baterai (akhir 3 menit)', '%', 0, 50],
  ],
  TR: [
    ['lebar', 'Lebar rangka', 'mm', 400, 1000], ['panjang', 'Panjang rangka', 'mm', 400, 1000],
    ['kantong', 'Lebar kantong U', 'mm', 300, 900], ['openMax', 'Bukaan rahang maks', 'mm', 200, 800],
    ['jawMax', 'Tinggi rahang maks', 'mm', 400, 1100], ['speed', 'Kecepatan', 'm/s', 0.2, 3],
    ['rot', 'Putaran', 'rad/s', 0.5, 6], ['acc', 'Percepatan', 'm/s²', 0.5, 10],
    ['jawSpeed', 'Kecepatan naik rahang', 'mm/s', 50, 1500], ['openSpeed', 'Kecepatan buka rahang', 'mm/s', 50, 1000],
    ['baterai', 'Penurunan baterai (akhir 3 menit)', '%', 0, 50],
  ],
};

export const KUSTOM_BAWAAN = {
  BR: { lebar: 668, panjang: 623, hMax: 960, eMax: 240, speed: 0.9, rot: 1.8, acc: 3.5, hSpeed: 380, eSpeed: 200, baterai: 0, cangkang: '', drive: 'mecanum', nama: '' },
  TR: { lebar: 668, panjang: 668, kantong: 444, openMax: 390, jawMax: 646, speed: 1.6, rot: 2.6, acc: 3.5, jawSpeed: 450, openSpeed: 260, baterai: 0, cangkang: '', drive: 'mecanum', nama: '' },
};

// [perakit] jenis penggerak robot kustom; 'diferensial' tidak bisa bergeser menyamping
export const PENGGERAK = ['mecanum', 'omni', 'diferensial'];

export function bacaKustom() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY_KUSTOM) || '{}'); } catch { /* diblokir */ }
  const out = {};
  for (const kind of ['BR', 'TR']) {
    out[kind] = { ...KUSTOM_BAWAAN[kind] };
    for (const [k, , , lo, hi] of KUSTOM_FIELD[kind]) {
      const v = Number(s[kind]?.[k]);
      if (Number.isFinite(v)) out[kind][k] = Math.min(hi, Math.max(lo, v));
    }
    if (typeof s[kind]?.cangkang === 'string') out[kind].cangkang = s[kind].cangkang.trim();
    if (PENGGERAK.includes(s[kind]?.drive)) out[kind].drive = s[kind].drive;   // [perakit]
    if (typeof s[kind]?.nama === 'string') out[kind].nama = s[kind].nama.slice(0, 40);
    if (Number.isFinite(Number(s[kind]?.bantalan)) && s[kind].bantalan !== null && s[kind].bantalan !== '') out[kind].bantalan = Math.min(40, Math.max(0, Number(s[kind].bantalan)));
  }
  return out;
}

export function simpanKustom(k) {
  try { localStorage.setItem(KEY_KUSTOM, JSON.stringify(k)); } catch { /* diblokir */ }
}

const r3 = (v) => +v.toFixed(3);

// Profil robot kustom dari angka menu; titik tumpu dan roda diskalakan dari R1 / R3
export function buatKustom(kind, k) {
  const model = k.cangkang ? { type: 'glb-cangkang', url: k.cangkang } : { type: 'kotak' };
  if (kind === 'BR') {
    const hw = k.lebar / 2000, L = k.panjang / 1000, zf = r3(L * 0.4815), zr = r3(zf - L);
    const sx = hw / BR_G.hw, sz = L / 0.623;
    const G = {
      ...BR_G, hw, zf, zr, cupReach: r3(zf + 0.022), trackZ0: r3(zr + 0.032),
      trackOut: Math.min(BR_G.trackOut, r3(hw - 0.03)), trackIn: Math.min(BR_G.trackIn, r3(hw - 0.12)),
      stepXs: BR_G.stepXs.map((v) => r3(v * sx)), trackXs: BR_G.trackXs.map((v) => r3(Math.min(1, sx) * v)),
      stepZs: BR_G.stepZs.map((v) => r3(v * sz)),
      wheel: [r3(hw - 0.024), r3(zf - 0.144 * sz), r3(zr + 0.139 * sz), 0.048],
    };
    const P = { ...BR_P, drive: k.drive || 'mecanum', speed: k.speed, rot: k.rot, acc: k.acc, baterai: k.baterai, h: { ...BR_P.h, max: k.hMax, speed: k.hSpeed }, e: { ...BR_P.e, max: k.eMax, speed: k.eSpeed } };
    return { label: k.nama || 'BR Kustom', deskripsi: k.nama ? 'dari Perakit' : 'ukuran dari menu', model, G, P, kustom: k };
  }
  const hw = k.lebar / 2000, zf = r3(k.panjang / 2000);
  const armIn = Math.min(r3(k.kantong / 2000), r3(hw - 0.04));
  const sx = hw / TR_G.hw, sz = zf / TR_G.zf;
  const G = {
    ...TR_G, hw, zf, zr: -zf, armIn,
    stepXs: TR_G.stepXs.map((v) => r3(v * sx)), stepZs: TR_G.stepZs.map((v) => r3(v * sz)),
    wheel: [r3(hw - 0.024), r3(zf - 0.08 * sz), r3(-(zf - 0.08 * sz)), 0.048],
  };
  // rahang terbuka penuh harus muat di dalam kantong U (bantalan setebal 2·padT di tiap sisi)
  const openMax = Math.min(k.openMax, Math.floor(armIn * 2000 - 2 * (k.bantalan ?? TR_G.padT * 1000)));   // [perakit]
  const P = {
    ...TR_P, drive: k.drive || 'mecanum', speed: k.speed, rot: k.rot, acc: k.acc, baterai: k.baterai,
    open: { ...TR_P.open, max: openMax, start: openMax, min: Math.min(TR_P.open.min, openMax - 20), speed: k.openSpeed },
    jaw: { ...TR_P.jaw, max: k.jawMax, speed: k.jawSpeed },
    preset: TR_P.preset.map((v) => Math.min(v, k.jawMax)),
  };
  return { label: k.nama || 'TR Kustom', deskripsi: k.nama ? 'dari Perakit' : 'ukuran dari menu', model, G, P, kustom: k };
}

// Ukuran awal dan terjulur penuh (mm) menurut Rule 11.5–11.7; daftar peringatan bila melewati batas
export function ukuran(kind, p) {
  const { G, P } = p, mm = (v) => Math.round(v * 1000);
  const W = mm(2 * G.hw);
  let awal, julur;
  if (kind === 'BR') {
    awal = [mm(G.zf - G.zr), W, mm(G.bodyH)];
    julur = [mm(Math.max(G.zf, G.cupReach + P.e.max / 1000) - G.zr), W, Math.max(mm(G.bodyH) + P.stage2, P.h.max + mm(G.cupHy))];
  } else {
    awal = [mm(G.zf - G.zr), W, mm(G.bodyH)];
    julur = [awal[0], W, Math.max(awal[2], P.jaw.max + mm(G.padHy))];
  }
  const warn = [];
  const fmt = (d) => d.join(' × ');
  if (awal.some((v) => v > 700)) warn.push(`${kind} awal ${fmt(awal)} mm melebihi 700 × 700 × 700 (Rule 11.5)`);
  if (julur[0] > 1400 || julur[1] > 1000 || julur[2] > 1200) warn.push(`${kind} terjulur ${fmt(julur)} mm melebihi 1400 × 1000 × 1200 (Rule ${kind === 'TR' ? '11.6' : '11.7'})`);
  return { awal, julur, warn };
}

// TR 480 mm: hasil tools/jangkauan.cjs — lebar rangka <= 480 mm menjangkau ke-12 Sky di grid dari sisi
// sendiri (R3 668 mm hanya 5). Ukuran lain sama dengan R3; kantong 400 mm (dinding 40 mm tiap sisi) agar rahang masih terbuka 368 mm > Earth 350 mm.
PROFIL.TR['tr-480'] = { ...buatKustom('TR', { ...KUSTOM_BAWAAN.TR, lebar: 480, kantong: 400 }), label: 'TR Ramping 480', deskripsi: 'contoh, bukan CAD — rangka 480 mm, menjangkau 12 Sky' };

const KUSTOM = bacaKustom();
PROFIL.BR['br-kustom'] = buatKustom('BR', KUSTOM.BR);
PROFIL.TR['tr-kustom'] = buatKustom('TR', KUSTOM.TR);
