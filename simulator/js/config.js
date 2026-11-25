// Semua dimensi dalam meter, sumbu dunia: X ke kanan (Merah di kiri / X negatif),
// Y ke atas, Z ke arah sisi Start/Retry (bawah pada denah Appendix Gambar 3.1).
// Sumber: ABU Robocon 2027 Rulebook V1.1 + Appendix V1.1, paket CAD Werkudara BR R1 & TR R3.

export const FIELD = {
  half: 5.5,               // lapangan 11000 x 11000
  L1: { half: 3.0, h: 0.6, inner: 2.97 },   // 6000 x 6000, barrier 30 mm
  L2: { half: 1.5, h: 0.9 },                 // 3000 x 3000, 300 di atas L1
  // Lajur ramp/transfer/tangga di luar L1 (sisi Merah: x -4..-3)
  lane: { xIn: 3.0, xOut: 4.0 },
  ramp: { z0: -2.7, z1: 0.8 },               // 3500, naik ke arah +Z
  transfer: { z0: 0.8, z1: 1.8 },            // 1000 x 1000, tinggi 600
  stairs: [ { z0: 1.8, z1: 2.1, h: 0.45 }, { z0: 2.1, z1: 2.4, h: 0.30 }, { z0: 2.4, z1: 2.7, h: 0.15 } ],
  storage: { x0: 3.5, x1: 5.5, z0: -5.5, z1: -4.5 },          // |x|, 2000 x 1000
  startZones: [ { x0: 4.8, x1: 5.5 }, { x0: 4.0, x1: 4.7 } ],  // |x|, z 4.8..5.5
  startZ: { z0: 4.8, z1: 5.5 },
  skyArea: { x0: -0.6, x1: 0.6, z0: 3.65, z1: 4.85 },          // Ground Shared 1200 x 1200
  skyGrid: { x0: -0.4, z0: 3.85, pitch: 0.2 },
  mustikaArea: { x0: -0.5, x1: 0.5, z0: -4.75, z1: -3.75 },
  mustikaPillar: { x: 0, z: -4.25, r: 0.135, h: 0.5 },
  centralPillar: { x: 0, z: 0, r: 0.135, h: 0.8 },           // di atas L2 -> puncak 1.7
  receptacle: { r: 0.09, depth: 0.1 },
  l1Shared: [ { x0: -0.5, x1: 0.5, z0: -2.97, z1: -2.22 }, { x0: -0.5, x1: 0.5, z0: 2.22, z1: 2.97 } ],
  l1Retry: { x0: 1.5, x1: 2.2, z0: -2.97, z1: -2.27 },       // |x|
  spotSize: 0.5,
};

// Building Spot: [x, z, level, shared]
export const SPOTS = [
  { id: 'L1-M-utara',  x: -2.72, z: -2.72, level: 1, shared: false, team: 'red' },
  { id: 'L1-M-selatan', x: -2.72, z: 2.72, level: 1, shared: false, team: 'red' },
  { id: 'L1-B-utara',  x: 2.72, z: -2.72, level: 1, shared: false, team: 'blue' },
  { id: 'L1-B-selatan', x: 2.72, z: 2.72, level: 1, shared: false, team: 'blue' },
  { id: 'L1-S-utara',  x: 0, z: -2.72, level: 1, shared: true },
  { id: 'L1-S-selatan', x: 0, z: 2.72, level: 1, shared: true },
  { id: 'L2-BL', x: -1.25, z: -1.25, level: 2, shared: true },
  { id: 'L2-BD', x: -1.25, z: 1.25, level: 2, shared: true },
  { id: 'L2-TL', x: 1.25, z: -1.25, level: 2, shared: true },
  { id: 'L2-TD', x: 1.25, z: 1.25, level: 2, shared: true },
];

export const POINTS = {
  transfer: 5,
  L1: [10, 20, 40],
  L2: [20, 40, 80],
  mustika: 250,
};

export const OBJ = {
  earth: 0.35,
  sky: 0.2,
  ballR: 0.105,
};

// Pola Sky Block (Rulebook Gambar 4): arah sisi BIRU tiap sel [baris][kolom]
// baris 0 = paling dekat L1 (z kecil). null = sel kosong.
export const SKY_LAYOUT = [
  ['+z', null, '+x', null, '-z'],
  [null, '-x', null, '-x', null],
  ['-z', null, 'X', null, '+z'],
  [null, '+x', null, '+x', null],
  ['+z', null, '-x', null, '-z'],
];

// Tata letak kolom Earth Block di Storage (|x|, z). Tiap kolom = 2 balok bertumpuk.
// "akses": dapat dijangkau TR R3 berbadan U (lengan 112 mm di kiri-kanan kantong)
//   baris depan 5 kolom rapat (diambil dari sisi timur/tengah lapangan, menghadap -X)
//   baris belakang 4 kolom renggang (diambil dari arah +Z setelah baris depan kosong)
// "rapat": 5 x 2 kolom = 20 balok sesuai jumlah resmi (sebagian tidak terjangkau TR R3)
export const STORAGE_LAYOUTS = {
  akses: [
    ...[3.7, 4.1, 4.5, 4.9, 5.3].map((x) => [x, -4.7]),
    ...[3.675, 4.225, 4.775, 5.325].map((x) => [x, -5.3]),
  ],
  rapat: [
    ...[3.7, 4.1, 4.5, 4.9, 5.3].map((x) => [x, -4.75]),
    ...[3.7, 4.1, 4.5, 4.9, 5.3].map((x) => [x, -5.25]),
  ],
};

export const MATCH_SECONDS = 180;

export const BR_PARAMS = {
  h: { min: 95, max: 960, start: 335, speed: 380 },     // mm, pusat cup thd lantai (mode mecanum)
  stage1: 425, stage2: 440,
  e: { min: 0, max: 240, start: 0, speed: 200 },        // mm, juluran boom
  roll: { min: -190, max: 190, start: 0, speed: 120 },  // derajat
  flip: { min: 0, max: 205, start: 0, speed: 90 },      // 0 terlipat, 180 horizontal ke depan
  trackDrop: 0.082, trackChassisRise: 0.064,
  speed: 0.9, speedTrack: 0.35, speedClimb: 0.18, rot: 1.8,
  bodyH: 0.69,
  maxCarry: 2,
};

export const TR_PARAMS = {
  jaw: { min: 172, max: 646, start: 250, speed: 450 },  // mm, pusat rahang
  open: { min: 180, max: 390, start: 390, speed: 260 }, // mm, bukaan antar bidang datar
  speed: 1.6, rot: 2.6,
  bodyH: 0.69,
  maxCarry: 3,
};

// Warna lapangan: Rulebook V1.1 Bagian 14 (R-G-B)
export const COLORS = {
  groundRed: 0xf0d2d2, groundBlue: 0xaad2e6, shared: 0xf5f0c8,
  red: 0xdf2222, blue: 0x3200ff,
  L1Red: 0xebb4a0, L1Blue: 0x96d7dc, L1Shared: 0xf5f0c8, sideWall: 0xbebeb9,
  L2: 0xbebeb9, spot: 0x286432,
  rampRed: 0xc8968c, rampBlue: 0x82b4c8, stairsRed: 0xebb4a0, stairsBlue: 0x96d7dc,
  transferRed: 0xf5aa3c, transferBlue: 0x3caaf5,
  barrier: 0xbebeb9, wood: 0x643e00, pillar: 0x643e00,
  earthRed: 0xc23a2e, earthBlue: 0x3d55c8, skyRed: 0xd8342c, skyBlue: 0x2a3fd6,
};
