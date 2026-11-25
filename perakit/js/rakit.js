// Dari desain (modul terpasang) ke angka robot kustom simulator, berat dan cek Rulebook.
// Angka robot kustom memakai bentuk yang sama dengan menu Kustom SimulatorABU (localStorage
// 'simabu.kustom'), jadi simulator membangun robotnya dengan js/profiles.js -> buatKustom().

import { SLOT, modulById, nilaiParam, beratModul, LAIN_LAIN } from './katalog.js';
import { buatKustom, ukuran, KUSTOM_BAWAAN } from '../../simulator/js/profiles.js';

// Rule 11.8: berat TR + BR maks. 60 kg (dengan baterai dan kabel)
export const BATAS_BERAT = 60;
const ACUAN_MASSA = { BR: 25, TR: 15 };

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// modul yang terpasang di slot (objek { m, v } atau null), aksesori: daftar
export function terpasang(desain, kind) {
  const d = desain[kind] || {};
  const out = {};
  for (const s of SLOT[kind]) {
    if (s.multi) out[s.id] = (d[s.id] || []).map((x) => ({ m: modulById(x.id), v: x.v || {} })).filter((x) => x.m);
    else out[s.id] = d[s.id] && modulById(d[s.id].id) ? { m: modulById(d[s.id].id), v: d[s.id].v || {} } : null;
  }
  return out;
}

export function hitung(desain, kind) {
  const t = terpasang(desain, kind);
  const val = (slot) => (t[slot] ? nilaiParam(t[slot].m, kind, t[slot].v) : {});
  const ada = (id) => t.aksesori.some((x) => x.m.id === id);
  const bumper = t.aksesori.find((x) => x.m.id === 'bumper');
  const tebal = bumper ? bumper.m.tebal * 1000 : 0;

  // ---- berat
  const rincian = [];
  for (const s of SLOT[kind]) {
    const list = s.multi ? t[s.id] : t[s.id] ? [t[s.id]] : [];
    for (const x of list) rincian.push({ nama: x.m.nama, kg: beratModul(x.m, kind, x.v, t.penggerak?.m) });
  }
  rincian.push({ nama: 'Kabel, baut, pelat & elektronik lain', kg: LAIN_LAIN[kind] });
  const berat = r1(rincian.reduce((a, b) => a + b.kg, 0));

  // ---- angka kustom simulator
  const rk = val('rangka');
  const k = { ...KUSTOM_BAWAAN[kind], cangkang: '' };
  k.lebar = Math.round((rk.lebar ?? KUSTOM_BAWAAN[kind].lebar) + 2 * tebal);
  k.panjang = Math.round((rk.panjang ?? KUSTOM_BAWAAN[kind].panjang) + 2 * tebal);
  const mot = t.motor?.m, pg = t.penggerak?.m;
  const vmaks = (mot?.speed ?? 1) * (pg?.faktor ?? 1) * (kind === 'BR' ? 0.9 : 1);
  k.speed = r2(Math.min(3, Math.max(0.2, vmaks)));
  k.acc = r2(Math.min(10, Math.max(0.5, (mot?.acc ?? 3.5) * Math.min(1.4, Math.max(0.5, ACUAN_MASSA[kind] / Math.max(1, berat))))));
  k.rot = r2(Math.min(kind === 'BR' ? 5 : 6, Math.max(0.5, (k.speed / (Math.hypot(k.lebar, k.panjang) / 2000)) * 0.8)));
  k.baterai = t.baterai?.m.turun ?? 0;
  k.drive = pg?.drive || 'mecanum';
  if (kind === 'BR') {
    const lf = val('lift'), bm = val('boom');
    k.hMax = lf.hMax ?? KUSTOM_BAWAAN.BR.hMax;
    k.hSpeed = t.lift?.m.hSpeed ?? KUSTOM_BAWAAN.BR.hSpeed;
    k.eMax = t.boom ? bm.eMax : 0;
    k.eSpeed = t.boom?.m.eSpeed ?? KUSTOM_BAWAAN.BR.eSpeed;
  } else {
    const lr = val('liftRahang'), pj = val('penjepit');
    k.jawMax = lr.jawMax ?? KUSTOM_BAWAAN.TR.jawMax;
    k.jawSpeed = t.liftRahang?.m.jawSpeed ?? KUSTOM_BAWAAN.TR.jawSpeed;
    k.kantong = pj.kantong ?? KUSTOM_BAWAAN.TR.kantong;
    k.openMax = pj.openMax ?? KUSTOM_BAWAAN.TR.openMax;
    k.openSpeed = t.penjepit?.m.openSpeed ?? KUSTOM_BAWAAN.TR.openSpeed;
  }
  k.nama = (desain.nama ? `${kind} ${desain.nama}` : `${kind} Perakit`).slice(0, 40);
  const profil = buatKustom(kind, k);

  // ---- cek
  const cek = [];
  const kosong = SLOT[kind].filter((s) => s.wajib && !t[s.id]);
  if (kosong.length) cek.push({ ok: false, wajib: true, teks: `Slot wajib belum terisi: ${kosong.map((s) => s.nama).join(', ')}` });
  const uk = ukuran(kind, profil);
  cek.push({ ok: !uk.warn.some((w) => w.includes('11.6') || w.includes('11.7')), rule: kind === 'TR' ? '11.6' : '11.7',
    teks: `Terjulur penuh ${uk.julur.join(' × ')} mm (maks. 1400 × 1000 × 1200)` });
  if (kind === 'BR') {
    const otak = t.kontroler?.m;
    const sensor = t.aksesori.some((x) => x.m.sensor);
    cek.push({ ok: !!otak?.otonom && sensor, rule: '11.3',
      teks: !otak?.otonom ? 'BR wajib otonom penuh: pasang kontroler dengan komputer (Jetson)'
        : !sensor ? 'BR otonom butuh sensor: pasang kamera atau LiDAR' : 'BR siap otonom (komputer + sensor)' });
    if (k.hMax < 900) cek.push({ ok: false, saran: true, teks: `Cup maks ${k.hMax} mm. R1 memakai 960 mm; lebih rendah mungkin tidak sampai menaruh Sky di atas 2 Earth.` });
    if (!t.boom) cek.push({ ok: false, saran: true, teks: 'Tanpa boom: cup tidak bisa dijulurkan, BR harus sangat dekat ke menara.' });
  } else {
    const buka = profil.P.open.max;
    cek.push({ ok: buka > 360, teks: buka > 360 ? `Rahang terbuka ${buka} mm, muat Earth 350 mm`
      : `Rahang hanya terbuka ${buka} mm: Earth 350 mm tidak muat (perlebar kantong U atau bukaan)` });
    // hasil tools/jangkauan.cjs SimulatorABU: <= 480 mm menjangkau 12 Sky, 500-668 mm 5 Sky, lebih lebar hampir tidak ada.
    // Jumlah pasti ditulis log arena saat TR otonom dinyalakan.
    const L = k.lebar;
    const sky = L <= 480 ? '12 dari 12' : L <= 668 ? '±5 dari 12' : 'hampir 0 dari 12';
    cek.push({ ok: L <= 668, saran: L > 480 && L <= 668,
      teks: `Lebar ${L} mm${tebal ? ' (dengan bumper)' : ''}: TR menjangkau ${sky} Sky dari sisi sendiri${L > 480 ? '; ≤ 480 mm menjangkau semua' : ''}` });
  }
  if (k.drive === 'diferensial') cek.push({ ok: false, saran: true, teks: 'Penggerak diferensial tidak bisa geser menyamping; mode otonom simulator dirancang untuk mecanum/omni, jadi beberapa manuver bisa gagal.' });

  const spes = [
    ['Kecepatan', `${k.speed.toLocaleString('id-ID')} m/s`],
    ['Percepatan', `${k.acc.toLocaleString('id-ID')} m/s²`],
    ['Putar', `${k.rot.toLocaleString('id-ID')} rad/s`],
    ['Tenaga akhir 3 menit', `−${k.baterai}%`],
    ...(kind === 'BR'
      ? [['Cup maks', `${k.hMax} mm`], ['Lift', `${k.hSpeed} mm/s`], ['Boom', k.eMax ? `${k.eMax} mm` : 'tidak ada']]
      : [['Rahang maks', `${k.jawMax} mm`], ['Bukaan rahang', `${profil.P.open.max} mm`], ['Kantong U', `${k.kantong} mm`]]),
  ];

  return { kind, t, k, profil, berat, rincian, uk, cek, spes, siap: kosong.length === 0 };
}
