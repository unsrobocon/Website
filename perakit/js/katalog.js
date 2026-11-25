// Katalog modul Perakit: setiap modul dipasang di satu slot robot (BR = Builder, TR = Transporter).
// Angka berat dan performa adalah PERKIRAAN untuk belajar, bukan hasil ukur. Angka robot asli
// diisi lewat menu Kustom simulator / KALIBRASI.md di SimulatorABU.
//
// Bentuk modul:
//   id, slot, untuk: ['BR','TR'], nama, info,
//   berat: kg (angka) atau fungsi (nilai parameter, kind) -> kg
//   param: [{ k, label, unit, min, max, step, def: angka | { BR, TR } }]
//   + data khusus slot (kecepatan motor, warna rangka, dst.)

export const SLOT = {
  BR: [
    { id: 'rangka', nama: 'Rangka', wajib: true },
    { id: 'penggerak', nama: 'Penggerak', wajib: true },
    { id: 'motor', nama: 'Motor roda', wajib: true },
    { id: 'baterai', nama: 'Baterai', wajib: true },
    { id: 'kontroler', nama: 'Otak (kontroler)', wajib: true },
    { id: 'lift', nama: 'Lift', wajib: true },
    { id: 'boom', nama: 'Boom', wajib: false },
    { id: 'ujung', nama: 'Pengambil', wajib: true },
    { id: 'tangga', nama: 'Pemanjat tangga', wajib: true },
    { id: 'aksesori', nama: 'Sensor & aksesori', multi: true },
  ],
  TR: [
    { id: 'rangka', nama: 'Rangka', wajib: true },
    { id: 'penggerak', nama: 'Penggerak', wajib: true },
    { id: 'motor', nama: 'Motor roda', wajib: true },
    { id: 'baterai', nama: 'Baterai', wajib: true },
    { id: 'kontroler', nama: 'Otak (kontroler)', wajib: true },
    { id: 'liftRahang', nama: 'Lift rahang', wajib: true },
    { id: 'penjepit', nama: 'Penjepit', wajib: true },
    { id: 'aksesori', nama: 'Sensor & aksesori', multi: true },
  ],
};

const UKURAN = [
  { k: 'lebar', label: 'Lebar', unit: 'mm', min: 400, max: 800, step: 2, def: 668 },
  { k: 'panjang', label: 'Panjang', unit: 'mm', min: 400, max: 800, step: 2, def: { BR: 623, TR: 668 } },
];
// berat rangka diskalakan dengan keliling rangka terhadap rangka 668 x 668
const beratRangka = (kgAcuan) => (v) => +(kgAcuan * (v.lebar + v.panjang) / 1336).toFixed(2);

export const MODUL = [
  // ------------------------------------------------------------ rangka
  { id: 'rangka-hollow', slot: 'rangka', untuk: ['BR', 'TR'], nama: 'Hollow aluminium 20×20',
    info: 'Ringan dan murah. Dipakai R1/R3 dan disarankan di desain 2027.', warna: 0xb9bec6,
    berat: beratRangka(2.4), param: UKURAN },
  { id: 'rangka-vslot', slot: 'rangka', untuk: ['BR', 'TR'], nama: 'Profil V-slot 2020',
    info: 'Mudah dibongkar-pasang dan diatur, tetapi lebih berat.', warna: 0x868c95,
    berat: beratRangka(3.6), param: UKURAN },
  { id: 'rangka-komposit', slot: 'rangka', untuk: ['BR', 'TR'], nama: 'Pelat komposit karbon',
    info: 'Paling ringan dan kaku; mahal dan butuh CNC.', warna: 0x2e3238,
    berat: beratRangka(1.7), param: UKURAN },

  // ------------------------------------------------------------ penggerak
  { id: 'mecanum', slot: 'penggerak', untuk: ['BR', 'TR'], nama: 'Mecanum 4 roda',
    info: 'Bisa maju, geser menyamping dan berputar di tempat. Pilihan R1/R3.', drive: 'mecanum', faktor: 1, nMotor: 4, berat: 1.9 },
  { id: 'omni', slot: 'penggerak', untuk: ['BR', 'TR'], nama: 'Omni 4 roda',
    info: 'Juga bisa geser menyamping; roda lebih ringan, cengkeraman di ramp lebih kecil.', drive: 'omni', faktor: 1.05, nMotor: 4, berat: 1.5 },
  { id: 'diferensial', slot: 'penggerak', untuk: ['BR', 'TR'], nama: 'Diferensial 2 roda + caster',
    info: 'Paling sederhana dan cepat lurus, tetapi TIDAK bisa geser menyamping.', drive: 'diferensial', faktor: 1.12, nMotor: 2, berat: 1.1 },

  // ------------------------------------------------------------ motor
  { id: 'pg45', slot: 'motor', untuk: ['BR', 'TR'], nama: 'Motor PG45 (torsi besar)',
    info: 'Kuat menanjak ramp dengan beban berat; lebih lambat.', speed: 1.0, acc: 4.5, beratPer: 0.9 },
  { id: 'pg36', slot: 'motor', untuk: ['BR', 'TR'], nama: 'Motor PG36 (cepat)',
    info: 'Seimbang cepat dan ringan. Dipakai TR R3.', speed: 1.6, acc: 3.5, beratPer: 0.6 },
  { id: 'bldc', slot: 'motor', untuk: ['BR', 'TR'], nama: 'BLDC + ESC',
    info: 'Paling cepat dan responsif; perlu ESC dan penyetelan.', speed: 2.3, acc: 5.0, beratPer: 0.75 },

  // ------------------------------------------------------------ baterai
  { id: 'lipo-4s', slot: 'baterai', untuk: ['BR', 'TR'], nama: 'LiPo 4S 5200 mAh',
    info: 'Ringan, tetapi tenaga turun ±18% di akhir 3 menit.', turun: 18, berat: 0.56 },
  { id: 'lipo-6s', slot: 'baterai', untuk: ['BR', 'TR'], nama: 'LiPo 6S 5200 mAh',
    info: 'Tegangan lebih tinggi, tenaga turun ±8%.', turun: 8, berat: 0.82 },
  { id: 'lipo-6s-besar', slot: 'baterai', untuk: ['BR', 'TR'], nama: 'LiPo 6S 10000 mAh',
    info: 'Tenaga stabil (turun ±3%), tetapi berat.', turun: 3, berat: 1.45 },

  // ------------------------------------------------------------ kontroler
  { id: 'stm32', slot: 'kontroler', untuk: ['BR', 'TR'], nama: 'STM32F407 + stik PS4',
    info: 'Cukup untuk robot yang dikemudikan operator.', otonom: false, berat: 0.6 },
  { id: 'stm32-jetson', slot: 'kontroler', untuk: ['BR', 'TR'], nama: 'STM32F407 + Jetson',
    info: 'Komputer di robot untuk mode otonom (wajib untuk BR, Rule 11.3).', otonom: true, berat: 1.3 },

  // ------------------------------------------------------------ BR: lift, boom, pengambil, tangga
  { id: 'lift-belt', slot: 'lift', untuk: ['BR'], nama: 'Lift 2 tingkat (belt)',
    info: 'Seperti R1: tiang teleskopik 2 tingkat.', hSpeed: 380,
    berat: (v) => +(3.2 + v.hMax * 0.0015).toFixed(2),
    param: [{ k: 'hMax', label: 'Tinggi cup maks', unit: 'mm', min: 600, max: 1250, step: 10, def: 960 }] },
  { id: 'lift-cepat', slot: 'lift', untuk: ['BR'], nama: 'Lift 2 tingkat (BLDC cepat)',
    info: 'Hampir 2× lebih cepat naik-turun, lebih berat.', hSpeed: 700,
    berat: (v) => +(4.2 + v.hMax * 0.0015).toFixed(2),
    param: [{ k: 'hMax', label: 'Tinggi cup maks', unit: 'mm', min: 600, max: 1250, step: 10, def: 960 }] },
  { id: 'boom-pendek', slot: 'boom', untuk: ['BR'], nama: 'Boom pendek',
    info: 'Juluran ke depan untuk menaruh balok tanpa menabrak menara.', eSpeed: 200, berat: 0.9,
    param: [{ k: 'eMax', label: 'Juluran maks', unit: 'mm', min: 50, max: 300, step: 10, def: 240 }] },
  { id: 'boom-panjang', slot: 'boom', untuk: ['BR'], nama: 'Boom panjang',
    info: 'Menjangkau lebih jauh (mis. spot L2 dari L1); lebih berat.', eSpeed: 260, berat: 1.7,
    param: [{ k: 'eMax', label: 'Juluran maks', unit: 'mm', min: 200, max: 600, step: 10, def: 400 }] },
  { id: 'vakum3', slot: 'ujung', untuk: ['BR'], nama: 'Vakum 3 cup + pompa',
    info: 'Menghisap Earth, Sky dan Mustika; wrist bisa memutar Sky.', berat: 1.4 },
  { id: 'track-flipper', slot: 'tangga', untuk: ['BR'], nama: 'Track + flipper',
    info: 'Track turun untuk naik tangga ke Transfer Area dan ke L2.', berat: 3.6 },

  // ------------------------------------------------------------ TR: lift rahang, penjepit
  { id: 'lift-rahang-belt', slot: 'liftRahang', untuk: ['TR'], nama: 'Lift rahang (belt)',
    info: 'Seperti R3: rahang naik-turun di tiang belakang.', jawSpeed: 450, berat: 2.4,
    param: [{ k: 'jawMax', label: 'Tinggi rahang maks', unit: 'mm', min: 400, max: 1000, step: 2, def: 646 }] },
  { id: 'lift-rahang-cepat', slot: 'liftRahang', untuk: ['TR'], nama: 'Lift rahang (BLDC cepat)',
    info: 'Naik-turun lebih cepat, sedikit lebih berat.', jawSpeed: 800, berat: 3.0,
    param: [{ k: 'jawMax', label: 'Tinggi rahang maks', unit: 'mm', min: 400, max: 1000, step: 2, def: 646 }] },
  { id: 'jepit-u', slot: 'penjepit', untuk: ['TR'], nama: 'Penjepit U (rack-pinion)',
    info: 'Rahang di dalam kantong U, memusatkan benda sendiri.', openSpeed: 260, berat: 2.2,
    param: [
      { k: 'kantong', label: 'Lebar kantong U', unit: 'mm', min: 300, max: 700, step: 2, def: 444 },
      { k: 'openMax', label: 'Bukaan rahang maks', unit: 'mm', min: 200, max: 680, step: 2, def: 390 },
    ] },
  { id: 'jepit-u-cepat', slot: 'penjepit', untuk: ['TR'], nama: 'Penjepit U (servo cepat)',
    info: 'Membuka-menutup ±1,7× lebih cepat.', openSpeed: 450, berat: 2.6,
    param: [
      { k: 'kantong', label: 'Lebar kantong U', unit: 'mm', min: 300, max: 700, step: 2, def: 444 },
      { k: 'openMax', label: 'Bukaan rahang maks', unit: 'mm', min: 200, max: 680, step: 2, def: 390 },
    ] },

  // ------------------------------------------------------------ aksesori (boleh banyak)
  { id: 'kamera', slot: 'aksesori', untuk: ['BR', 'TR'], nama: 'Kamera depan', sensor: true,
    info: 'Melihat benda dan robot lain untuk mode otonom.', berat: 0.15 },
  { id: 'lidar', slot: 'aksesori', untuk: ['BR', 'TR'], nama: 'LiDAR 2D', sensor: true,
    info: 'Mengukur jarak ke dinding untuk mengetahui posisi robot.', berat: 0.35,
    param: [{ k: 'tinggi', label: 'Tinggi tiang', unit: 'mm', min: 40, max: 400, step: 10, def: 120 }] },
  { id: 'keranjang', slot: 'aksesori', untuk: ['BR'], nama: 'Keranjang Mustika',
    info: 'Tempat Mustika di belakang BR (usulan desain 2027).', berat: 0.6 },
  { id: 'bumper', slot: 'aksesori', untuk: ['BR', 'TR'], nama: 'Bumper karet',
    info: 'Melindungi rangka saat bersentuhan; menambah 15 mm di tiap sisi.', berat: 0.5, tebal: 0.015 },
  { id: 'lampu', slot: 'aksesori', untuk: ['BR', 'TR'], nama: 'Lampu status',
    info: 'Menara lampu untuk tahu mode robot dari jauh.', berat: 0.12 },
  { id: 'estop', slot: 'aksesori', untuk: ['BR', 'TR'], nama: 'Tombol darurat',
    info: 'Tombol merah pemutus daya; mudah dijangkau dari luar.', berat: 0.12 },
];

export const modulById = (id) => MODUL.find((m) => m.id === id) || null;
export const modulUntuk = (kind, slot) => MODUL.filter((m) => m.slot === slot && m.untuk.includes(kind));
export const slotOf = (kind, id) => SLOT[kind].find((s) => s.id === id);

// nilai parameter modul (isian pengguna, dibatasi rentang; bawaan bila kosong)
export function nilaiParam(m, kind, isian = {}) {
  const out = {};
  for (const p of m.param || []) {
    const def = typeof p.def === 'object' ? p.def[kind] : p.def;
    const v = Number(isian[p.k]);
    out[p.k] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : def;
  }
  return out;
}

export function beratModul(m, kind, isian, pasangan) {
  const v = nilaiParam(m, kind, isian);
  if (m.slot === 'motor') return +(m.beratPer * (pasangan?.nMotor ?? 4)).toFixed(2);
  return typeof m.berat === 'function' ? m.berat(v, kind) : m.berat;
}

// Desain awal ---------------------------------------------------------------------------------
const pasang = (id, v = {}) => ({ id, v });

export const TEMPLAT = {
  werkudara: {
    nama: 'Werkudara (seperti R1 & R3)',
    BR: { rangka: pasang('rangka-hollow', { lebar: 668, panjang: 623 }), penggerak: pasang('mecanum'), motor: pasang('pg45'),
      baterai: pasang('lipo-6s'), kontroler: pasang('stm32-jetson'), lift: pasang('lift-belt', { hMax: 960 }),
      boom: pasang('boom-pendek', { eMax: 240 }), ujung: pasang('vakum3'), tangga: pasang('track-flipper'),
      aksesori: [pasang('kamera'), pasang('estop')] },
    TR: { rangka: pasang('rangka-hollow', { lebar: 668, panjang: 668 }), penggerak: pasang('mecanum'), motor: pasang('pg36'),
      baterai: pasang('lipo-6s'), kontroler: pasang('stm32'), liftRahang: pasang('lift-rahang-belt', { jawMax: 646 }),
      penjepit: pasang('jepit-u', { kantong: 444, openMax: 390 }), aksesori: [pasang('estop')] },
  },
  ramping: {
    nama: 'Usulan 2027: TR ramping 480 mm',
    BR: { rangka: pasang('rangka-hollow', { lebar: 640, panjang: 620 }), penggerak: pasang('mecanum'), motor: pasang('pg45'),
      baterai: pasang('lipo-6s'), kontroler: pasang('stm32-jetson'), lift: pasang('lift-belt', { hMax: 1050 }),
      boom: pasang('boom-pendek', { eMax: 240 }), ujung: pasang('vakum3'), tangga: pasang('track-flipper'),
      aksesori: [pasang('kamera'), pasang('lidar', { tinggi: 80 }), pasang('keranjang'), pasang('estop')] },
    TR: { rangka: pasang('rangka-hollow', { lebar: 480, panjang: 668 }), penggerak: pasang('mecanum'), motor: pasang('pg36'),
      baterai: pasang('lipo-6s'), kontroler: pasang('stm32'), liftRahang: pasang('lift-rahang-belt', { jawMax: 646 }),
      penjepit: pasang('jepit-u', { kantong: 400, openMax: 368 }), aksesori: [pasang('estop'), pasang('lampu')] },
  },
  kosong: {
    nama: 'Mulai dari kosong',
    BR: { aksesori: [] },
    TR: { aksesori: [] },
  },
};
