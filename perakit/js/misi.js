// Misi Perakit: tantangan merakit untuk anak magang. Tiap misi dicek otomatis dari rakitan;
// misi yang pernah selesai disimpan di browser (localStorage 'perakit.misi').
//   ctx = { hasil: { BR, TR }, awal: { BR, TR } (mm), lolos: { BR, TR }, berat, flag: Set }

const KEY = 'perakit.misi';

export const MISI = [
  { id: 'pertama', judul: 'Robot pertama',
    tugas: 'Lengkapi BR dan TR sampai semua cek Rulebook hijau.',
    cek: (c) => c.lolos.BR && c.lolos.TR },
  { id: 'arena', judul: 'Turun ke arena',
    tugas: 'Tekan Mainkan dan masukkan robotmu ke arena 2027.',
    cek: (c) => c.flag.has('main') },
  { id: 'tanding', judul: 'Satu babak penuh',
    tugas: 'Mainkan satu pertandingan sampai timer 0:00, lalu kembali ke perakit untuk melihat hasilnya.',
    petunjuk: 'Pilih TR dikemudikan atau otonom. Hasil muncul di panel kanan setelah menekan Kembali ke perakit.',
    cek: (c) => c.flag.has('tanding') },
  { id: 'ramping', judul: 'TR ramping',
    tugas: 'Buat TR yang menjangkau 12 Sky (lebar ≤ 480 mm) tetapi rahangnya masih muat Earth 350 mm.',
    petunjuk: 'Bantalan rahang di dalam kantong memakan lebar. Lihat varian CAD TR-B: bantalannya di atas rel.',
    cek: (c) => c.lolos.TR && c.hasil.TR.k.lebar <= 480 },
  { id: 'diet', judul: 'Diet 40 kg',
    tugas: 'Turunkan berat BR + TR sampai ≤ 40 kg dengan semua cek tetap hijau.',
    petunjuk: 'Lihat rincian berat. Rangka, motor dan baterai paling berpengaruh.',
    cek: (c) => c.lolos.BR && c.lolos.TR && c.berat <= 40 },
  { id: 'cepat', judul: 'Si cepat',
    tugas: 'Buat TR dengan kecepatan ≥ 2 m/s dan percepatan ≥ 4 m/s² yang tetap lolos Rulebook.',
    cek: (c) => c.lolos.TR && c.hasil.TR.k.speed >= 2 && c.hasil.TR.k.acc >= 4 },
  { id: 'mata', judul: 'Mata dan telinga',
    tugas: 'Pasang kamera dan LiDAR pada BR otonom.',
    cek: (c) => ['kamera', 'lidar'].every((id) => c.hasil.BR.t.aksesori.some((x) => x.m.id === id)) && c.lolos.BR },
  { id: 'pas', judul: 'Pas di kotak',
    tugas: 'Buat BR yang ukuran awalnya tersisa ≤ 10 mm dari 700 mm di panjang atau lebar, tanpa melewatinya.',
    petunjuk: 'Geser panjang/lebar rangka sambil melihat angka Ukuran awal di kiri atas.',
    cek: (c) => c.lolos.BR && c.awal.BR && Math.max(c.awal.BR[0], c.awal.BR[1]) >= 690 },
  { id: 'cad', judul: 'Bandingkan dengan CAD',
    tugas: 'Pilih varian CAD dan tampilkan model CAD di samping rakitan.',
    cek: (c) => c.flag.has('cad') },
  { id: 'bagikan', judul: 'Kerja tim',
    tugas: 'Bagikan desainmu lewat tombol Bagikan.',
    cek: (c) => c.flag.has('bagikan') },
];

export function bacaSelesai() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
}

// misi yang baru selesai pada ctx ini (dan simpan)
export function periksa(ctx, selesai) {
  const baru = [];
  for (const m of MISI) {
    if (selesai.has(m.id)) continue;
    let ok = false;
    try { ok = !!m.cek(ctx); } catch { ok = false; }
    if (ok) { selesai.add(m.id); baru.push(m); }
  }
  if (baru.length) { try { localStorage.setItem(KEY, JSON.stringify([...selesai])); } catch { /* diblokir */ } }
  return baru;
}
