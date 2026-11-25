// Katalog modul Perakit: setiap modul dipasang di satu slot robot (BR = Builder, TR = Transporter).
// Angka berat dan performa adalah PERKIRAAN untuk belajar, bukan hasil ukur. Angka robot asli
// diisi lewat menu Kustom simulator / KALIBRASI.md di SimulatorABU.
//
// Bentuk modul:
//   id, slot, untuk: ['BR','TR'], nama, info,
//   berat: kg; rangka: berat668 (kg untuk rangka 668 x 668, diskalakan dengan keliling);
//   lift BR: beratDasar + beratPerMm x tinggi cup maks; motor: beratPer x jumlah motor penggerak
//   Semua angka bisa ditimpa angka asli tim lewat perakit/data/angka-modul.json (lihat terapkanAngka).
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

export const MODUL = [
  // ------------------------------------------------------------ rangka
  { id: 'rangka-hollow', slot: 'rangka', untuk: ['BR', 'TR'], nama: 'Hollow aluminium 20×20',
    info: 'Ringan dan murah. Dipakai R1/R3 dan disarankan di desain 2027.', warna: 0xb9bec6,
    berat668: 2.4, param: UKURAN },
  { id: 'rangka-vslot', slot: 'rangka', untuk: ['BR', 'TR'], nama: 'Profil V-slot 2020',
    info: 'Mudah dibongkar-pasang dan diatur, tetapi lebih berat.', warna: 0x868c95,
    berat668: 3.6, param: UKURAN },
  { id: 'rangka-komposit', slot: 'rangka', untuk: ['BR', 'TR'], nama: 'Pelat komposit karbon',
    info: 'Paling ringan dan kaku; mahal dan butuh CNC.', warna: 0x2e3238,
    berat668: 1.7, param: UKURAN },

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
    beratDasar: 3.2, beratPerMm: 0.0015,
    param: [{ k: 'hMax', label: 'Tinggi cup maks', unit: 'mm', min: 600, max: 1250, step: 10, def: 960 }] },
  { id: 'lift-cepat', slot: 'lift', untuk: ['BR'], nama: 'Lift 2 tingkat (BLDC cepat)',
    info: 'Hampir 2× lebih cepat naik-turun, lebih berat.', hSpeed: 700,
    beratDasar: 4.2, beratPerMm: 0.0015,
    param: [{ k: 'hMax', label: 'Tinggi cup maks', unit: 'mm', min: 600, max: 1250, step: 10, def: 960 }] },
  { id: 'boom-pendek', slot: 'boom', untuk: ['BR'], nama: 'Boom pendek',
    info: 'Juluran ke depan untuk menaruh balok tanpa menabrak menara.', eSpeed: 200, berat: 0.9,
    param: [{ k: 'eMax', label: 'Juluran maks', unit: 'mm', min: 50, max: 300, step: 10, def: 240 }] },
  { id: 'boom-panjang', slot: 'boom', untuk: ['BR'], nama: 'Boom panjang',
    info: 'Menjangkau lebih jauh (mis. spot L2 dari L1); lebih berat.', eSpeed: 260, berat: 1.7,
    param: [{ k: 'eMax', label: 'Juluran maks', unit: 'mm', min: 200, max: 600, step: 10, def: 400 }] },
  { id: 'vakum3', slot: 'ujung', untuk: ['BR'], nama: 'Vakum 3 cup + pompa',
    info: 'Menghisap Earth, Sky dan Mustika; wrist bisa memutar Sky.', berat: 1.4 },
  { id: 'vakum4', slot: 'ujung', untuk: ['BR'], nama: 'Kepala vakum 4 cup (CAD BR-A)',
    info: 'Kepala 4 cup dengan roll ±180°, dari paket CAD. Massa dari BOM CAD.', berat: 1.57 },
  { id: 'jepit-sejajar', slot: 'ujung', untuk: ['BR'], nama: 'Penjepit sejajar ulir (CAD BR-C)',
    info: 'Tanpa pompa vakum, bukaan 190–400 mm, bola Mustika dijepit langsung. Di simulator bekerja seperti vakum.', berat: 1.56 },
  { id: 'track-flipper', slot: 'tangga', untuk: ['BR'], nama: 'Track + flipper',
    info: 'Track turun untuk naik tangga ke Transfer Area dan ke L2.', berat: 3.6 },
  { id: 'tumpuan-ulir', slot: 'tangga', untuk: ['BR'], nama: 'Pemanjat 3 tumpuan (CAD BR-B)',
    info: 'Tumpuan depan & belakang pada slide ulir bola untuk melangkah ke L2. Di simulator bergerak seperti track + flipper.', berat: 8.24 },

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

  { id: 'jepit-pneumatik', slot: 'penjepit', untuk: ['TR'], nama: 'Penjepit Earth pneumatik (CAD TR-A/B)',
    info: 'Silinder pneumatik: membuka-menutup sangat cepat. Massa termasuk tabung & katup (BOM CAD).', openSpeed: 600, berat: 4.56,
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
  { id: 'menara-sky', slot: 'aksesori', untuk: ['TR'], nama: 'Menara Sky + rak 2 Sky (CAD TR-A)',
    info: 'Rel teleskop + lengan ayun 270 mm + rak, agar TR membawa 3 Sky sekali jalan. Terlipat saat start.', berat: 4.27 },
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
  if (m.berat668 !== undefined) return +(m.berat668 * (v.lebar + v.panjang) / 1336).toFixed(2);
  if (m.beratDasar !== undefined) return +(m.beratDasar + m.beratPerMm * v.hMax).toFixed(2);
  return m.berat;
}

// Desain awal ---------------------------------------------------------------------------------
const pasang = (id, v = {}) => ({ id, v });

// Varian dari paket CAD (desain-robot/cad). Ukuran rangka dipilih agar ukuran awal mendekati CAD;
// angka gerak tetap perkiraan Perakit. Model CAD asli ditampilkan berdampingan (perakit/cad/).
export const VARIAN_CAD = {
  'BR-A': { kind: 'BR', isi: { rangka: pasang('rangka-hollow', { lebar: 668, panjang: 650 }), penggerak: pasang('mecanum'), motor: pasang('pg45'),
    baterai: pasang('lipo-6s'), kontroler: pasang('stm32-jetson'), lift: pasang('lift-belt', { hMax: 960 }),
    boom: pasang('boom-pendek', { eMax: 300 }), ujung: pasang('vakum4'), tangga: pasang('track-flipper'),
    aksesori: [pasang('kamera'), pasang('lidar', { tinggi: 80 }), pasang('keranjang'), pasang('estop')] } },
  'BR-B': { kind: 'BR', isi: { rangka: pasang('rangka-hollow', { lebar: 668, panjang: 670 }), penggerak: pasang('mecanum'), motor: pasang('pg45'),
    baterai: pasang('lipo-6s'), kontroler: pasang('stm32-jetson'), lift: pasang('lift-belt', { hMax: 960 }),
    boom: pasang('boom-pendek', { eMax: 300 }), ujung: pasang('vakum4'), tangga: pasang('tumpuan-ulir'),
    aksesori: [pasang('kamera'), pasang('lidar', { tinggi: 80 }), pasang('keranjang'), pasang('estop')] } },
  'BR-C': { kind: 'BR', isi: { rangka: pasang('rangka-hollow', { lebar: 668, panjang: 662 }), penggerak: pasang('mecanum'), motor: pasang('pg45'),
    baterai: pasang('lipo-6s'), kontroler: pasang('stm32-jetson'), lift: pasang('lift-belt', { hMax: 980 }),
    boom: pasang('boom-pendek', { eMax: 300 }), ujung: pasang('jepit-sejajar'), tangga: pasang('track-flipper'),
    aksesori: [pasang('kamera'), pasang('lidar', { tinggi: 80 }), pasang('estop')] } },
  'TR-A': { kind: 'TR', isi: { rangka: pasang('rangka-hollow', { lebar: 668, panjang: 668 }), penggerak: pasang('mecanum'), motor: pasang('pg36'),
    baterai: pasang('lipo-6s'), kontroler: pasang('stm32'), liftRahang: pasang('lift-rahang-belt', { jawMax: 646 }),
    penjepit: pasang('jepit-pneumatik', { kantong: 444, openMax: 390 }), aksesori: [pasang('menara-sky'), pasang('estop')] } },
  'TR-B': { kind: 'TR', isi: { rangka: pasang('rangka-hollow', { lebar: 480, panjang: 668 }), penggerak: pasang('mecanum'), motor: pasang('pg36'),
    baterai: pasang('lipo-6s'), kontroler: pasang('stm32'), liftRahang: pasang('lift-rahang-belt', { jawMax: 646 }),
    penjepit: pasang('jepit-pneumatik', { kantong: 380, openMax: 360 }), aksesori: [pasang('estop')] } },
};
const dariCad = (br, tr, nama) => ({ nama, cad: { BR: br, TR: tr }, BR: VARIAN_CAD[br].isi, TR: VARIAN_CAD[tr].isi });

export const TEMPLAT = {
  'cad-a-a': dariCad('BR-A', 'TR-A', 'CAD BR-A + TR-A (rekomendasi)'),
  'cad-a-b': dariCad('BR-A', 'TR-B', 'CAD BR-A + TR-B (TR ramping 480)'),
  'cad-b-a': dariCad('BR-B', 'TR-A', 'CAD BR-B + TR-A (pemanjat 3 tumpuan)'),
  'cad-c-a': dariCad('BR-C', 'TR-A', 'CAD BR-C + TR-A (penjepit tanpa vakum)'),
  werkudara: {
    nama: 'Werkudara R1 & R3 (robot 2026)',
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

// ---------------------------------------------------------------- angka asli tim
// perakit/data/angka-modul.json: { modul: { <id>: { <angka>: nilai, diukur: true, catatan: '' } }, lainLain: { BR, TR } }
// Hanya kunci angka yang sudah ada di modul yang ditimpa, jadi salah ketik tidak merusak Perakit.
export const ANGKA = ['berat', 'berat668', 'beratDasar', 'beratPerMm', 'beratPer', 'speed', 'acc', 'faktor', 'turun',
  'hSpeed', 'eSpeed', 'jawSpeed', 'openSpeed'];
export const LAIN_LAIN = { BR: 2.2, TR: 1.5 };
export function terapkanAngka(data) {
  const salah = [];
  for (const [id, isi] of Object.entries(data?.modul || {})) {
    const m = modulById(id);
    if (!m) { if (!id.startsWith('_')) salah.push(id); continue; }
    for (const k of ANGKA) {
      const v = Number(isi?.[k]);
      if (k in m && isi?.[k] !== undefined && isi[k] !== null && Number.isFinite(v) && v >= 0) m[k] = v;
    }
    if (isi?.diukur === true) m.diukur = true;
    if (typeof isi?.catatan === 'string' && isi.catatan.trim()) m.catatan = isi.catatan.trim().slice(0, 140);
  }
  for (const k of ['BR', 'TR']) {
    const v = Number(data?.lainLain?.[k]);
    if (Number.isFinite(v) && v >= 0) LAIN_LAIN[k] = v;
  }
  return salah;
}
