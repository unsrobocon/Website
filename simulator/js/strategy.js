// Strategi mode otonom: urutan Building Spot yang dikerjakan satu tim.
// Kode spot: L1S± = L1 Shared (selatan + / utara -), L1M± = L1 pojok sisi sendiri, L2± = L2 sisi sendiri.
// Semua posisi dicerminkan menurut tim (merah di x negatif).
// plan = urutan antaran TR: E:<spot> satu kolom Earth, S:<spot> satu Sky, M = Mustika (setelah Mandate),
// m = seperti M tetapi hanya bila satu menara L1 Shared sudah lengkap (warna siapa pun: bisa dibalik, 3.5.7).

import { SPOTS } from './config.js';
import { sideSign } from './field.js';

export const STRATEGI = {
  // dua menara L1 selatan (salah satunya Shared) -> Mandate -> Mustika, lalu L2, lalu L1 utara
  mandate: { label: 'Mandate dulu', plan: ['E:L1S+', 'E:L1M+', 'S:L1S+', 'S:L1M+', 'M', 'E:L2+', 'S:L2+', 'E:L2-', 'S:L2-', 'E:L1S-', 'S:L1S-', 'E:L1M-', 'S:L1M-'], earth: ['L1S+', 'L1M+', 'L2+', 'L2-', 'L1S-', 'L1M-'], sky: ['L1S+', 'L1M+', 'L2+', 'L2-', 'L1S-', 'L1M-'] },
  // Earth ke L2 dulu (poin dua kali lipat dan dekat), Sky tetap mengejar Mandate lewat L1
  l2: { label: 'Earth L2 dulu', plan: ['E:L2+', 'E:L2-', 'E:L1S+', 'E:L1M+', 'S:L1S+', 'S:L1M+', 'M', 'S:L2+', 'S:L2-', 'E:L1S-', 'S:L1S-', 'E:L1M-', 'S:L1M-'], earth: ['L2+', 'L2-', 'L1S+', 'L1M+', 'L1S-', 'L1M-'], sky: ['L1S+', 'L1M+', 'L2+', 'L2-', 'L1S-', 'L1M-'] },
  // satu menara sendiri dulu; begitu ada menara Shared lengkap BR membaliknya dan TR siaga di Mustika Pillar.
  // Tanpa menara yang bisa dimaling: bangun Shared sendiri seperti Mandate dulu
  maling: { label: 'Maling', maling: true, plan: ['E:L1M+', 'S:L1M+', 'm', 'E:L1S+', 'S:L1S+', 'M', 'E:L2+', 'E:L2-', 'S:L2+', 'S:L2-', 'E:L1S-', 'S:L1S-', 'E:L1M-', 'S:L1M-'], earth: ['L1M+', 'L1S+', 'L2+', 'L2-', 'L1S-', 'L1M-'], sky: ['L1M+', 'L1S+', 'L2+', 'L2-', 'L1S-', 'L1M-'] },
  // hanya empat spot L1 sisi sendiri
  l1: { label: 'Hanya L1', plan: ['E:L1S+', 'E:L1M+', 'S:L1S+', 'S:L1M+', 'M', 'E:L1S-', 'S:L1S-', 'E:L1M-', 'S:L1M-'], earth: ['L1S+', 'L1M+', 'L1S-', 'L1M-'], sky: ['L1S+', 'L1M+', 'L1S-', 'L1M-'] },
};

// ---- strategi susunan sendiri (menu: Strategi otonom → Susun sendiri), disimpan di browser ----
const KEY = 'simabu.strategi';
export const NAMA_SPOT = { 'L1S+': 'L1 Shared selatan', 'L1M+': 'L1 pojok selatan', 'L2+': 'L2 selatan', 'L2-': 'L2 utara', 'L1S-': 'L1 Shared utara', 'L1M-': 'L1 pojok utara' };
export const LANGKAH = [...Object.keys(NAMA_SPOT).flatMap((s) => [`E:${s}`, `S:${s}`]), 'M'];

export function namaLangkah(c) {
  if (c === 'M') return 'Mustika (setelah Mandate)';
  const [k, s] = c.split(':');
  return `${k === 'E' ? 'Earth (2 balok)' : 'Sky'} → ${NAMA_SPOT[s]}`;
}

export function validRencana(p) {
  return Array.isArray(p) && p.length >= 1 && p.every((c) => LANGKAH.includes(c)) && new Set(p).size === p.length;
}

export function bacaRencana() {
  try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); if (validRencana(p)) return p; } catch { /* diblokir */ }
  return [...STRATEGI.mandate.plan];
}

export function simpanRencana(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* diblokir */ }
}

// Peringatan untuk rencana yang kemungkinan tidak berjalan baik (tidak melarang)
export function cekRencana(p) {
  const warn = [];
  for (const c of p) {
    if (!c.startsWith('S:')) continue;
    const e = p.indexOf(`E:${c.slice(2)}`);
    if (e < 0) warn.push(`${namaLangkah(c)}: tidak ada Earth untuk spot itu`);
    else if (e > p.indexOf(c)) warn.push(`${namaLangkah(c)} sebelum Earth-nya`);
  }
  const m = p.indexOf('M');
  if (m < 0) warn.push('tanpa Mustika (250 poin)');
  else {
    const before = p.slice(0, m).filter((c) => c.startsWith('S:')).map((c) => c.slice(2));
    if (before.length < 2 || !before.some((s) => s.startsWith('L1S'))) warn.push('Mustika diminta sebelum 2 menara lengkap (salah satunya Shared): TR akan menunggu Mandate');
  }
  return warn;
}

const dariRencana = (plan) => ({
  label: 'Susun sendiri', plan,
  earth: plan.filter((c) => c.startsWith('E:')).map((c) => c.slice(2)),
  sky: plan.filter((c) => c.startsWith('S:')).map((c) => c.slice(2)),
});

// key: nama strategi, 'kustom' (susunan menu), atau 'rencana:<langkah,langkah,...>' (alamat ?rencana=, untuk
// tools/turnamen.cjs dan tools/optimasi.cjs); rencana yang tidak sah kembali ke Mandate
export const strategiOf = (key) => {
  if (key === 'kustom') return dariRencana(bacaRencana());
  if (typeof key === 'string' && key.startsWith('rencana:')) {
    const p = key.slice(8).split(',').filter(Boolean);
    return validRencana(p) ? dariRencana(p) : STRATEGI.mandate;
  }
  return STRATEGI[key] || STRATEGI.mandate;
};

// Deskripsi target untuk BR:
//   yaw, u  arah hadap saat menaruh Earth (u = vektor satuan)
//   b       arah lateral; untuk spot L1 = arah ke barrier terdekat (roda tertahan di sana)
//   via     z lorong yang dilewati sebelum masuk ke spot (null = langsung dari posisi tunggu)
//   kind    'barrier' = spot L1 menempel barrier, 'l2' = spot L2 yang Earth-nya ditaruh dari L1
//   climbZ, skyYaw, skyDir  (L2) tempat naik dan arah hadap saat menaruh Sky dari atas L2
export function targetsFor(team) {
  const sx = sideSign(team), H = Math.PI / 2;
  const spot = (x, z) => SPOTS.find((s) => Math.abs(s.x - x) < 0.01 && Math.abs(s.z - z) < 0.01);
  const inward = -sx * H;
  return {
    'L1S+': { code: 'L1S+', kind: 'barrier', spot: spot(0, 2.72), yaw: inward, u: [-sx, 0], b: [0, 1], via: 1.9 },
    'L1M+': { code: 'L1M+', kind: 'barrier', spot: spot(sx * 2.72, 2.72), yaw: 0, u: [0, 1], b: [sx, 0], via: null },
    'L1S-': { code: 'L1S-', kind: 'barrier', spot: spot(0, -2.72), yaw: inward, u: [-sx, 0], b: [0, -1], via: -1.9 },
    'L1M-': { code: 'L1M-', kind: 'barrier', spot: spot(sx * 2.72, -2.72), yaw: Math.PI, u: [0, -1], b: [sx, 0], via: null },
    'L2+': { code: 'L2+', kind: 'l2', spot: spot(sx * 1.25, 1.25), yaw: inward, u: [-sx, 0], b: [0, 1], via: null, climbZ: 0.45, skyYaw: 0, skyDir: [0, 1] },
    'L2-': { code: 'L2-', kind: 'l2', spot: spot(sx * 1.25, -1.25), yaw: inward, u: [-sx, 0], b: [0, -1], via: -1.25, climbZ: -0.45, skyYaw: Math.PI, skyDir: [0, -1] },
  };
}
