// Analisis waktu terbuang dari rekaman pertandingan (js/rekam.js): selang ketika robot tim sendiri diam
// (pose dan sendi tidak berubah) minimal MIN detik saat pertandingan berjalan, dikelompokkan per wilayah
// lapangan. Membantu menemukan di mana waktu habis: TR menunggu Transfer Area kosong, BR menunggu kiriman, dst.

import { regionAt } from './field.js';

const MIN = 2, POS = 0.01, SUDUT = 0.02, SENDI = 2;
const NAMA = { ground: 'Ground Area', ramp: 'ramp', transfer: 'Transfer Area', L1: 'Level 1', L2: 'Level 2', stairs: 'tangga', storage: 'Storage', start: 'Start Zone' };

// frames: bingkai rekaman; robots: daftar robot rekaman (urutan sama dengan bingkai); team: tim yang dianalisis
export function waktuTerbuang(frames, robots, team, { min = MIN } = {}) {
  const hasil = {};
  robots.forEach((r, n) => {
    if (r.team !== team) return;
    const selang = [];
    let mulai = null, prev = null;
    const tutup = (t) => {
      if (mulai && t - mulai.t >= min) selang.push({ t0: mulai.t, t1: t, dur: t - mulai.t, wilayah: NAMA[mulai.w] || mulai.w });
      mulai = null;
    };
    for (const f of frames) {
      const st = f.r[n];
      if (!st || f.phase !== 'running') { tutup(f.t); prev = null; continue; }
      const diam = prev && Math.hypot(st[0] - prev[0], st[2] - prev[2]) < POS && Math.abs(st[3] - prev[3]) < SUDUT &&
        st.slice(6).every((v, j) => Math.abs(v - prev[6 + j]) < SENDI);
      if (diam) { if (!mulai) mulai = { t: f.t, w: regionAt(st[0], st[2]).name }; } else tutup(f.t);
      prev = st;
    }
    if (frames.length) tutup(frames[frames.length - 1].t);
    const total = selang.reduce((a, s) => a + s.dur, 0);
    const perWilayah = {};
    for (const s of selang) perWilayah[s.wilayah] = (perWilayah[s.wilayah] || 0) + s.dur;
    hasil[r.kind] = { total, selang, perWilayah };
  });
  return hasil;
}
