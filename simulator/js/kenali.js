// Halaman "Kenali robot" (robot.html): model CAD BR R1 dan TR R3 dalam 3D, daftar bagian dengan
// fungsi, pasal Rulebook dan tombol di simulator. Klik bagian (di daftar atau di model) untuk menyorot;
// geser "Urai" untuk memisahkan modul-modul agar susunannya terlihat.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Bagian per robot: awalan nama node (GLTFLoader mengganti spasi dengan _), judul, penjelasan
export const BAGIAN = {
  BR: {
    url: 'assets/BR_R1.glb', nama: 'BR R1 — Builder',
    ringkas: 'Penyusun menara. Wajib berjalan otomatis penuh (Rule 11.3): naik ke Level 1, mengambil blok dari Transfer Area dengan vakum, menyusun menara, lalu membawa Mustika ke Central Pillar di Level 2.',
    daftar: [
      { re: /^A_/, judul: 'Rangka dan dek', teks: 'Rangka utama tempat semua modul dipasang. Saat start, robot dengan semua bagian terlipat harus muat dalam 700 × 700 × 700 mm.', rule: '11.5' },
      { re: /^B[1-4]_/, judul: 'Roda mecanum (4)', teks: 'Empat roda mecanum, masing-masing dengan gearmotor ber-encoder. Robot bisa maju, bergeser ke samping, dan berputar di tempat.', kunci: 'W A S D, Q E' },
      { re: /^C[12]_/, judul: 'Track tangga (2)', teks: 'Kaset track karet yang bisa diturunkan. Saat turun, rangka terangkat 64 mm sehingga robot bisa naik undakan tangga 150 mm ke Level 1 dan berdiri di atas barrier 50 mm.', kunci: 'T', rule: '3.4' },
      { re: /^D_/, judul: 'Tiang lift tetap', teks: 'Lift tingkat 1: tiang, rel vertikal, sekrup lift, gearmotor berrem dan sensor batas.', kunci: '↑ ↓, preset 1–6' },
      { re: /^E_/, judul: 'Tiang lift bergerak', teks: 'Lift tingkat 2 yang naik di sepanjang tiang tetap (teleskopik), agar cup mencapai puncak menara di Level 2 (tinggi h sampai 960 mm).', kunci: '↑ ↓' },
      { re: /^F_/, judul: 'Carriage dan boom', teks: 'Carriage naik-turun di tiang bergerak; boom teleskopik menjulur ke depan (maks. 240 mm) untuk menaruh blok di Building Spot tanpa robot masuk ke spot.', kunci: '← →' },
      { re: /^G_/, judul: 'Pergelangan vakum', teks: 'Wrist roll dan pelat tiga cup. Cup tengah menghisap Earth, Sky dan Mustika. Roll 90° memutar Sky agar warna tim menghadap ke atas.', kunci: 'Space (vakum), R F (roll)', rule: '3.5.6' },
      { re: /^J_/, judul: 'Kontrol otonom dan daya', teks: 'Baterai, pompa vakum, katup dan sensor vakum, MCU dan driver, komputer visi, kamera depan dan sensor jarak tepi. BR hanya boleh memakai sensornya sendiri, tanpa komunikasi dengan TR. Tombol STOP merah wajib ada.', rule: '11.3, 11.11' },
      { re: /^K[12]_/, judul: 'Flipper (2)', teks: 'Lengan flipper dengan aktuator sudut berrem. Dibuka ≥140° bersama track untuk naik undakan 300 mm ke Level 2.', kunci: 'G B' },
    ],
  },
  TR: {
    url: 'assets/TR_R3.glb', nama: 'TR R3 — Transporter',
    ringkas: 'Pengantar blok. Boleh dikemudikan operator (Rule 11.2): mengambil Earth dari Storage dan Sky dari Ground Shared Area, mengantarnya ke Transfer Area (+5 per blok), lalu membawa Mustika ke BR setelah Sanctuary Mandate.',
    daftar: [
      { re: /^A_/, judul: 'Rangka U', teks: 'Rangka berbentuk U: blok masuk ke kantong di depan (lebar 444 mm) lalu dijepit. Lengan U (112 mm) menentukan Sky mana yang bisa dijangkau di grid.', rule: '11.5' },
      { re: /^B[1-4]_/, judul: 'Penggerak mecanum (4)', teks: 'Empat roda mecanum dengan gearmotor ber-encoder: maju, geser, dan putar di tempat, cocok untuk merapat lurus ke kolom Earth.', kunci: 'W A S D, Q E' },
      { re: /^C_/, judul: 'Lift tetap', teks: 'Dua tiang dengan rel, sabuk timing, poros sinkron kiri-kanan dan gearmotor berrem yang menaikkan carriage. Limit switch di kedua ujung.', kunci: '↑ ↓' },
      { re: /^D_/, judul: 'Carriage lift', teks: 'Carriage yang membawa penjepit naik-turun. Tinggi rahang Z 172–646 mm: preset 2 Earth bawah, 3 Earth atas, 4 Mustika, 6 Sky.', kunci: '1–6' },
      { re: /^E_/, judul: 'Penjepit', teks: 'Rahang rack-and-pinion dengan gearmotor. Menutup otomatis dan memusatkan blok yang miring sampai ±25°. Bantalan khusus untuk blok dan bola Mustika. Bukaan maks. 390 mm; TR membawa paling banyak 3 blok.', kunci: 'Space (jepit), ← → (manual)', rule: '6.4' },
      { re: /^F_/, judul: 'Daya dan kendali', teks: 'Baki komponen listrik: baterai, kotak controller dan driver, panel tombol STOP merah.', rule: '11.9–11.18' },
      { re: /^G_/, judul: 'Rak empat botol', teks: 'Rak dengan tiang, kaki, pita penahan dan klem untuk empat botol (botol referensi pada model CAD).' },
    ],
  },
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const canvas = $('view3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2027);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
scene.add(new THREE.HemisphereLight(0xffffff, 0x404850, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(2, 4, 3);
scene.add(sun);
const grid = new THREE.GridHelper(2, 20, 0x3a4350, 0x2a313a);
scene.add(grid);
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
// ?putar=0: tanpa putar otomatis (presentasi statis, laptop tanpa GPU, uji otomatis)
controls.autoRotate = new URLSearchParams(location.search).get('putar') !== '0';
controls.autoRotateSpeed = 1.2;
$('putar').checked = controls.autoRotate;

// gambar ulang hanya bila ada yang berubah: model CAD ±285 ribu segitiga berat untuk laptop tanpa GPU
let perluGambar = true;
const gambar = () => { perluGambar = true; };

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
  gambar();
}
window.addEventListener('resize', resize);

const loader = new GLTFLoader();
const cache = {};
let cur = null;          // { kind, root, parts: [{ def, nodes, base: Vector3[], dir: Vector3[] }] }
let pilih = -1;

async function muat(kind) {
  const def = BAGIAN[kind];
  $('status').textContent = `Memuat ${def.nama} …`;
  if (!cache[kind]) {
    const g = await loader.loadAsync(def.url, (e) => { if (e.total) $('status').textContent = `Memuat ${def.nama} … ${Math.round((e.loaded / e.total) * 100)}%`; });
    cache[kind] = g.scene;
  }
  if (cur) scene.remove(cur.root);
  const root = cache[kind];
  scene.add(root);
  // material per mesh, agar penyorotan tidak mengubah mesh lain yang berbagi material
  root.traverse((m) => {
    if (m.isMesh && !m.userData.asli) {
      m.material = m.material.clone();
      m.userData.asli = { opacity: m.material.opacity, transparent: m.material.transparent, emissive: m.material.emissive ? m.material.emissive.getHex() : null };
    }
  });
  // modul tingkat atas (anak langsung node robot)
  const top = root.children.length === 1 ? root.children[0].children : root.children;
  const box = new THREE.Box3().setFromObject(root);
  const pusat = box.getCenter(new THREE.Vector3());
  const parts = def.daftar.map((d) => {
    const nodes = top.filter((n) => d.re.test(n.name));
    const base = nodes.map((n) => n.position.clone());
    const dir = nodes.map((n) => {
      const c = new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3()).sub(pusat);
      c.y = Math.max(c.y, 0) * 0.6 + 0.05;
      return c.lengthSq() > 1e-6 ? c.normalize() : new THREE.Vector3(0, 1, 0);
    });
    return { def: d, nodes, base, dir };
  });
  cur = { kind, root, parts };
  pilih = -1;
  // ukuran awal (bounding box) terhadap Rule 11.5
  const size = box.getSize(new THREE.Vector3());
  const mm = (v) => Math.round(v * 1000);
  const lolos = [size.x, size.z, size.y].every((v) => v <= 0.7005);
  $('ukuran').innerHTML = `Ukuran model: ${mm(size.x)} × ${mm(size.z)} × ${mm(size.y)} mm (lebar × panjang × tinggi) — ${lolos ? '<span class="ok">dalam batas awal 700 mm (Rule 11.5)</span>' : '<span class="warn">melebihi 700 mm pada posisi CAD ini (Rule 11.5 berlaku untuk posisi start)</span>'}`;
  const tinggi = Math.max(size.y, 0.5);
  controls.target.set(0, tinggi * 0.45, 0);
  camera.position.set(tinggi * 1.25, tinggi * 1.05, tinggi * 1.55);
  urai(Number($('urai').value));
  daftar();
  $('ringkas').textContent = def.ringkas;
  $('status').textContent = '';
  for (const b of document.querySelectorAll('[data-robot]')) b.classList.toggle('aktif', b.dataset.robot === kind);
  gambar();
}

function daftar() {
  const ul = $('bagian');
  ul.innerHTML = cur.parts.map((p, i) => `<li><button type="button" data-i="${i}" class="${i === pilih ? 'aktif' : ''}" ${p.nodes.length ? '' : 'disabled'}>
      <b>${esc(p.def.judul)}</b>${i === pilih ? `<span>${esc(p.def.teks)}</span>${p.def.kunci ? `<span class="kunci">Simulator: ${esc(p.def.kunci)}</span>` : ''}${p.def.rule ? `<span class="rule">Rule ${esc(p.def.rule)}</span>` : ''}` : ''}</button></li>`).join('');
  for (const b of ul.querySelectorAll('button')) b.addEventListener('click', () => sorot(Number(b.dataset.i) === pilih ? -1 : Number(b.dataset.i)));
}

function sorot(i) {
  pilih = i;
  const aktif = new Set();
  if (i >= 0) for (const n of cur.parts[i].nodes) n.traverse((m) => { if (m.isMesh) aktif.add(m); });
  cur.root.traverse((m) => {
    if (!m.isMesh) return;
    const a = m.userData.asli, mat = m.material;
    if (i < 0 || aktif.has(m)) {
      mat.transparent = a.transparent; mat.opacity = a.opacity; mat.depthWrite = true;
      if (mat.emissive && a.emissive !== null) mat.emissive.setHex(i >= 0 ? 0x5a3c00 : a.emissive);
    } else {
      mat.transparent = true; mat.opacity = 0.12; mat.depthWrite = false;
      if (mat.emissive && a.emissive !== null) mat.emissive.setHex(a.emissive);
    }
    mat.needsUpdate = true;
  });
  daftar();
  if (i >= 0) { controls.autoRotate = false; $('putar').checked = false; }
  gambar();
}

function urai(k) {
  if (!cur) return;
  for (const p of cur.parts) p.nodes.forEach((n, j) => n.position.copy(p.base[j]).addScaledVector(p.dir[j], k * 0.22));
  gambar();
}

// klik di model: pilih modul tingkat atas yang terkena
const ray = new THREE.Raycaster();
let tekan = null;
canvas.addEventListener('pointerdown', (e) => { tekan = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!cur || !tekan || Math.hypot(e.clientX - tekan[0], e.clientY - tekan[1]) > 5) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = ray.intersectObject(cur.root, true).find((h) => !h.object.material.transparent || h.object.material.opacity > 0.5);
  if (!hit) { sorot(-1); return; }
  const i = cur.parts.findIndex((p) => p.nodes.some((n) => { let o = hit.object; while (o) { if (o === n) return true; o = o.parent; } return false; }));
  sorot(i);
});

$('urai').addEventListener('input', (e) => urai(Number(e.target.value)));
$('putar').addEventListener('change', (e) => { controls.autoRotate = e.target.checked; });
for (const b of document.querySelectorAll('[data-robot]')) b.addEventListener('click', () => muat(b.dataset.robot).catch(gagal));

function gagal(err) {
  console.error(err);
  $('status').textContent = location.protocol === 'file:'
    ? 'Model tidak bisa dimuat dari file://. Jalankan lewat server lokal: klik dua kali jalankan.bat, lalu buka http://localhost:8027/robot.html'
    : `Model gagal dimuat (${err.message}). Periksa koneksi lalu muat ulang halaman.`;
}

function loop() {
  requestAnimationFrame(loop);
  // update() bernilai true selama kamera bergerak (putar otomatis, seret, redaman)
  if (controls.update() || perluGambar) {
    perluGambar = false;
    renderer.render(scene, camera);
  }
}
resize();
loop();
const awal = new URLSearchParams(location.search).get('robot') === 'tr' ? 'TR' : 'BR';
muat(awal).catch(gagal);
window.kenali = { muat, sorot, urai, get cur() { return cur; }, BAGIAN };   // uji otomatis
