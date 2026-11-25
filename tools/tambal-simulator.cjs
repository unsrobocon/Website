#!/usr/bin/env node
// Tambalan kecil pada salinan simulator agar robot dari Perakit bisa dimainkan:
//  - robot kustom menyimpan jenis penggerak (mecanum / omni / diferensial) dan nama robot
//  - penggerak diferensial tidak bisa bergeser menyamping
//  - menu simulator tidak menghapus jenis penggerak & nama saat pengaturan disimpan
//  - tebal bantalan rahang TR di dalam kantong U bisa diatur (bawaan 16 mm, CAD TR-B 0 mm)
// Setiap tambalan mencari teks persis di kode SimulatorABU. Bila teksnya tidak ditemukan (kode asli
// sudah berubah), skrip berhenti dengan pesan supaya tambalannya diperbarui, bukan diam-diam terlewat.
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || path.join(__dirname, '..', 'simulator');

const TAMBALAN = [
  { file: 'js/profiles.js', all: true,
    from: "baterai: 0, cangkang: '' }",
    to: "baterai: 0, cangkang: '', drive: 'mecanum', nama: '' }" },
  { file: 'js/profiles.js',
    from: "    if (typeof s[kind]?.cangkang === 'string') out[kind].cangkang = s[kind].cangkang.trim();\n",
    to: "    if (typeof s[kind]?.cangkang === 'string') out[kind].cangkang = s[kind].cangkang.trim();\n"
      + "    if (PENGGERAK.includes(s[kind]?.drive)) out[kind].drive = s[kind].drive;   // [perakit]\n"
      + "    if (typeof s[kind]?.nama === 'string') out[kind].nama = s[kind].nama.slice(0, 40);\n" },
  { file: 'js/profiles.js',
    from: "export function bacaKustom() {",
    to: "// [perakit] jenis penggerak robot kustom; 'diferensial' tidak bisa bergeser menyamping\nexport const PENGGERAK = ['mecanum', 'omni', 'diferensial'];\n\nexport function bacaKustom() {" },
  { file: 'js/profiles.js',
    from: "const P = { ...BR_P, speed: k.speed,",
    to: "const P = { ...BR_P, drive: k.drive || 'mecanum', speed: k.speed," },
  { file: 'js/profiles.js',
    from: "    ...TR_P, speed: k.speed,",
    to: "    ...TR_P, drive: k.drive || 'mecanum', speed: k.speed," },
  { file: 'js/profiles.js',
    from: "return { label: 'BR Kustom', deskripsi: 'ukuran dari menu',",
    to: "return { label: k.nama || 'BR Kustom', deskripsi: k.nama ? 'dari Perakit' : 'ukuran dari menu'," },
  { file: 'js/profiles.js',
    from: "return { label: 'TR Kustom', deskripsi: 'ukuran dari menu',",
    to: "return { label: k.nama || 'TR Kustom', deskripsi: k.nama ? 'dari Perakit' : 'ukuran dari menu'," },
  { file: 'js/profiles.js',
    from: "    if (typeof s[kind]?.nama === 'string') out[kind].nama = s[kind].nama.slice(0, 40);\n",
    to: "    if (typeof s[kind]?.nama === 'string') out[kind].nama = s[kind].nama.slice(0, 40);\n"
      + "    if (Number.isFinite(Number(s[kind]?.bantalan)) && s[kind].bantalan !== null && s[kind].bantalan !== '') out[kind].bantalan = Math.min(40, Math.max(0, Number(s[kind].bantalan)));\n" },
  // tebal bantalan rahang di dalam kantong U (mm per sisi); 0 = bantalan di atas rel (CAD TR-B)
  { file: 'js/profiles.js',
    from: "const openMax = Math.min(k.openMax, Math.floor((armIn - TR_G.padT) * 2000));",
    to: "const openMax = Math.min(k.openMax, Math.floor(armIn * 2000 - 2 * (k.bantalan ?? TR_G.padT * 1000)));   // [perakit]" },
  { file: 'js/robots.js',
    from: "  canStrafe() { return true; }",
    to: "  canStrafe() { return this.P.drive !== 'diferensial'; }" },
  { file: 'js/robots.js',
    from: "  canStrafe() { return this.track < 0.05; }",
    to: "  canStrafe() { return this.track < 0.05 && this.P.drive !== 'diferensial'; }" },
  { file: 'js/menu.js',
    from: "out[kind] = { cangkang: form.elements[`${kind}.cangkang`].value.trim() };",
    to: "out[kind] = { drive: kustom[kind].drive, nama: kustom[kind].nama, bantalan: kustom[kind].bantalan, cangkang: form.elements[`${kind}.cangkang`].value.trim() };" },
];

let gagal = 0;
for (const t of TAMBALAN) {
  const f = path.join(dir, t.file);
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes(t.to)) continue;                      // sudah terpasang
  if (!s.includes(t.from)) { console.error(`Tambalan gagal: teks tidak ditemukan di ${t.file}:\n  ${t.from.split('\n')[0]}`); gagal++; continue; }
  s = t.all ? s.split(t.from).join(t.to) : s.replace(t.from, t.to);
  fs.writeFileSync(f, s);
}
if (gagal) { console.error(`${gagal} tambalan gagal. Perbarui tools/tambal-simulator.cjs.`); process.exit(1); }
console.log(`Tambalan Perakit terpasang di ${dir}`);
