import * as THREE from 'three';
import { MATCH_SECONDS } from './config.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildField } from './field.js';
import { ObjectWorld } from './objects.js';
import { BuilderRobot, TransporterRobot } from './robots.js';
import { Input } from './input.js';
import { Rules } from './rules.js';
import { Hud } from './hud.js';
import { AutoBuilder } from './auto.js';
import { Timeline } from './timeline.js';
import { AutoTransporter } from './autotr.js';
import { readSettings, menuUrl } from './settings.js';
import { Rekaman } from './rekam.js';
import { Latihan, TANTANGAN, siapkanLatihanBR } from './latihan.js';
import { Tutorial } from './tutorial.js';
import { HasilAkhir } from './hasil.js';
import { LabelArea } from './label.js';
import { Demo } from './demo.js';
import { Jembatan } from './jembatan.js';
import { Lidar, Imu, Odom, LIDAR_BURUK } from './lidar.js';
import { buatPeta } from './peta.js';
import { Kamera, KAMERA_BURUK } from './kamera.js';
import { Sentuh, perluSentuh } from './sentuh.js';
import { modeArena, ArenaTuan, ArenaTamu } from './arena.js';
import { Wasit } from './wasit.js';
import { Darurat } from './darurat.js';
import { waktuTerbuang } from './analisis.js';
import { Pengarah } from './pengarah.js';
import { bacaLog, bandingkan, gambarLintasan } from './banding.js';
import { labelBingkai, NAMA_KELAS } from './dataset.js';
import { Sensor } from './sensor.js';
import { Suara } from './suara.js';
import { profilOf } from './profiles.js';
import { buildBoxBR, buildBoxTR } from './boxmodel.js';

class Events {
  constructor() { this.map = new Map(); }
  on(n, f) { (this.map.get(n) || this.map.set(n, []).get(n)).push(f); }
  emit(n, d) { for (const f of this.map.get(n) || []) f(d); }
}

// Pengaturan dari URL (js/settings.js); menu awal menyusun URL ini
const S = readSettings();
const TEAM = S.tim === 'biru' ? 'blue' : 'red';
const LAYOUT = S.storage;
const OPP = TEAM === 'red' ? 'blue' : 'red';
// lawan=santai|penuh: dua robot tim seberang dijalankan komputer
const LAWAN = S.lawan === '0' ? null : S.lawan;
// ?rencana=E:L1S+,E:L1M+,... (urutan langkah, lihat js/strategy.js LANGKAH) menggantikan strategi menu untuk tim
// sendiri; ?strategiLawan= / ?rencanaLawan= untuk tim lawan (tools/turnamen.cjs, tools/optimasi.cjs)
const QS = new URLSearchParams(location.search);
const STRATEGI_KEY = QS.get('rencana') ? `rencana:${QS.get('rencana')}` : S.strategi;

// ---------- renderer & scene ----------
const canvas = document.getElementById('view');
// grafis 'ringan' untuk laptop lemah: tanpa antialias, resolusi 1×, bayangan kecil dan tajam
const RINGAN = S.grafis === 'ringan';
// browser / laptop tanpa WebGL: beri tahu dengan jelas, jangan tertahan di "Memuat…"
{
  const uji = document.createElement('canvas');
  if (!(uji.getContext('webgl2') || uji.getContext('webgl'))) {
    document.getElementById('loading-msg').textContent = 'Browser ini tidak mendukung WebGL, jadi tampilan 3D tidak bisa dibuat. Pakai Chrome, Edge atau Firefox versi baru, dan nyalakan akselerasi perangkat keras (hardware acceleration) di pengaturan browser.';
    document.getElementById('loading').classList.add('error');
    throw new Error('WebGL tidak tersedia');
  }
}
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !RINGAN });
renderer.setPixelRatio(RINGAN ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = RINGAN ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20252c);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

scene.add(new THREE.HemisphereLight(0xffffff, 0x404850, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.25);
sun.position.set(-6, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(RINGAN ? 1024 : 4096, RINGAN ? 1024 : 4096);
const sc = sun.shadow.camera;
sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 40;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(55, 1, 0.02, 120);
camera.position.set(-7, 6, 9);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(-3, 0.5, 3);
controls.maxPolarAngle = Math.PI * 0.495;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

buildField(scene);

// ---------- dunia ----------
const events = new Events();
const objects = new ObjectWorld(scene, events);
objects.licin = S.fisika === 'licin';
objects.setup(LAYOUT);
// retryTime: detik robot tertahan saat Retry; locked: robot terkunci selama setup (mode pertandingan)
const ctx = { scene, objects, events, robots: [], retryTime: Number(S.retry) || 0, locked: false };
const tr = new TransporterRobot(TEAM, ctx, profilOf('TR', S.tr));
const br = new BuilderRobot(TEAM, ctx, profilOf('BR', S.br));
ctx.robots.push(tr, br);
// tim lawan (opsional): TR + BR yang sepenuhnya otonom
const foes = LAWAN ? { tr: new TransporterRobot(OPP, ctx, profilOf('TR', S.lawanTr)), br: new BuilderRobot(OPP, ctx, profilOf('BR', S.lawanBr)) } : null;
if (foes) ctx.robots.push(foes.tr, foes.br);
const mine = [tr, br];
const rules = new Rules(objects, events, TEAM);
// waktu pertandingan yang sudah berjalan (detik), untuk baterai yang melemah (js/robots.js baterai())
ctx.berjalan = () => MATCH_SECONDS - rules.time;
rules.robots = ctx.robots;
rules.matchMode = S.mode === 'pertandingan';
const hud = new Hud({ team: TEAM, rules, robots: ctx.robots, objects });
rules.logFn = (m, t, c) => hud.log(m, t, c);
rules.flashFn = (m) => hud.flash(m);
const input = new Input();
// kontrol layar sentuh di tablet / HP (atau ?sentuh=1)
if (perluSentuh()) input.sentuh = new Sentuh(input);
// ?seed=N: biji acak sensor realistis (statistik banyak pertandingan, tools/statistik.cjs)
const SEED = Number(new URLSearchParams(location.search).get('seed')) || 0;
const auto = new AutoBuilder(br, { objects, rules, robots: ctx.robots, events, strategi: STRATEGI_KEY, sensor: S.sensor, seed: SEED ? SEED * 2 + 1 : undefined });
auto.logFn = (m, t) => rules.log(m, t);
const autoTR = new AutoTransporter(tr, { objects, rules, robots: ctx.robots, events, strategi: STRATEGI_KEY });
autoTR.logFn = (m, t) => rules.log(m, t);
// lawan 'manusia' (2 pemain): TR lawan dikemudikan stik pemain kedua, BR lawan tetap otonom (11.3)
const DUA = LAWAN === 'manusia';
const STRATEGI_LAWAN = QS.get('rencanaLawan') ? `rencana:${QS.get('rencanaLawan')}` : QS.get('strategiLawan') || STRATEGI_KEY;
// main dua laptop (tools/arena.py): 'tuan' menyimulasi, 'tamu' menampilkan dan mengemudikan TR lawan
const ARENA = modeArena();
let arena = null;
let wasit = null;
// skenario darurat (?darurat=1): gangguan acak pada robot tim sendiri selama pertandingan
const darurat = new URLSearchParams(location.search).get('darurat') === '1'
  ? new Darurat({ rules, robots: [tr, br], objects, events, seed: SEED || 1, retry: (r) => doRetry(r, r.kind === 'BR', true) }) : null;
// autopilot lawan: mulai saat timer mulai, Retry sendiri bila macet; 'santai' = jeda antar tugas
const foeAutos = foes ? [new AutoBuilder(foes.br, { objects, rules, robots: ctx.robots, events, strategi: STRATEGI_LAWAN, sensor: S.sensor, seed: SEED ? SEED * 2 + 2 : undefined }), ...(DUA ? [] : [new AutoTransporter(foes.tr, { objects, rules, robots: ctx.robots, events, strategi: STRATEGI_LAWAN })])] : [];
const NO_AUTO = { enabled: false, reset() {} };
const autoOf = (robot) => (robot === br ? auto : robot === tr ? autoTR : foeAutos.find((a) => a.robot === robot) || NO_AUTO);
for (const a of foeAutos) { a.logFn = (m, t) => rules.log(m, t); a.ai = true; a.enabled = true; a.pause = LAWAN === 'santai' ? 4 : 0; a.agresif = LAWAN === 'agresif'; }
// Retry: oleh operator (Backspace, Shift = BR ke L1 Retry Zone) atau oleh wasit (Forced Retry)
function doRetry(robot, toL1, forced = false) {
  const keL1 = toL1 && robot.enteredL1;
  rules.onRetry(robot);
  robot.retry(toL1);
  autoOf(robot).reset();
  const ke = keL1 ? 'L1 Retry Zone' : 'Start/Retry Zone';
  events.emit('tl', { type: 'retry', team: robot.team, robot: robot.kind, text: `${forced ? 'Forced Retry ' : ''}ke ${ke}` });
  rules.log(`${rules.tag(robot.team)}${forced ? 'Forced Retry' : 'Retry'} ${robot.kind} → ${ke}`, forced ? 'warn' : 'info');
  if (camMode === 'ikuti' && robot === active) snapCamera();
}
// Forced Retry otomatis (menu): wasit memindahkan robot; BR yang sudah di L1 ke L1 Retry Zone
if (S.forced === 'otomatis') rules.forcedRetryFn = (robot) => doRetry(robot, robot.kind === 'BR', true);
// suara pertandingan (js/suara.js); N = bisu
const suara = new Suara(events, rules, { aktif: S.suara !== 'bisu' });
// rekaman pertandingan (js/rekam.js): 10 bingkai/s, diputar ulang dari panel catatan waktu
const rekam = new Rekaman({ rules, objects, robots: ctx.robots, scene });
// komentar suara pengarah (J), ikut rekaman
const pengarah = new Pengarah({ rekam, rules, logFn: (m, t) => rules.log(m, t) });
// jembatan kode robot tim (?jembatan=br|tr|br,tr; 1 = br; tools/jembatan.py): robot dikendalikan program Python
const JB = (new URLSearchParams(location.search).get('jembatan') || '').toLowerCase().replace('1', 'br').split(',').filter((k) => k === 'br' || k === 'tr');
// ?kamera=1: robot jembatan juga mengirim gambar kamera RGB + depth (js/kamera.js)
const KAM = new URLSearchParams(location.search).get('kamera') === '1';
const BURUK = new URLSearchParams(location.search).get('sensorBuruk') === '1';
const kameraOf = (r) => (KAM ? new Kamera(r, { renderer, scene, ...(BURUK ? KAMERA_BURUK : {}) }) : null);
const jembatanOf = {
  br: JB.includes('br') ? new Jembatan({ robot: br, mate: tr, rules, objects, sensor: auto.sensor, logFn: (m, t) => rules.log(m, t), kamera: kameraOf(br) }) : null,
  tr: JB.includes('tr') ? new Jembatan({ robot: tr, mate: br, rules, objects, sensor: new Sensor(tr, rules, { mode: S.sensor, seed: 13 }), logFn: (m, t) => rules.log(m, t), kamera: kameraOf(tr) }) : null,
};
const jembatan = jembatanOf.br || jembatanOf.tr;
// latihan operator TR (js/latihan.js): tantangan berwaktu, BR otonom ikut bekerja
const latihan = S.tantangan !== '0' ? new Latihan(S.tantangan, { rules, events, tr, br, onUlang: () => { resetField(); mulaiLatihan(); } }) : null;
function mulaiLatihan() {
  if (!latihan) return;
  latihan.reset();
  if (TANTANGAN[S.tantangan]?.robot === 'BR') {
    // latihan BR manual: autopilot BR mati, operator mengemudikan BR
    if (auto.enabled) handleEdge({ action: 'auto' });
    if (autoTR.enabled) handleEdge({ action: 'autoTR' });
    siapkanLatihanBR(S.tantangan, { br, objects });
    if (active !== br) handleEdge({ action: 'switch' });
    if (camMode === 'ikuti') snapCamera();
    return;
  }
  if (!auto.enabled) handleEdge({ action: 'auto' });
  if (active !== tr) handleEdge({ action: 'switch' });
  if (S.tantangan === 'mustika') { rules.st[TEAM].mandate = true; rules.st[TEAM].mandateTime = 'latihan'; }
}
// tutorial anggota baru (?tutorial=1, js/tutorial.js)
const tutorial = QS.get('tutorial') === '1'
  ? new Tutorial({ team: TEAM, events, scene, get: () => ({ active, tr, br, auto }), onUlang: () => resetField() }) : null;
// nama area di lapangan 3D (tombol Y, js/label.js); menyala sendiri di tutorial dan demo
const label = new LabelArea(scene);
// kamera boleh menyorot robot lain selain robot aktif (demo berpemandu)
let fokus = null;
const sorotan = () => fokus || active;
// demo berpemandu (?demo=1, js/demo.js): 4 robot otonom, keterangan kejadian, kamera otomatis, berulang
const demo = QS.get('demo') === '1' ? new Demo({
  events, rules, robots: ctx.robots, label,
  kamera: { fokus: (r) => { fokus = r; if (camMode === 'ikuti') snapCamera(); }, mode: (m) => setCamMode(m), namaMode: () => camMode },
  ulang: () => resetField(),
}) : null;
const timeline = new Timeline(events, rules, { team: TEAM, pengaturan: `${TEAM === 'red' ? 'Merah' : 'Biru'} · ${LAYOUT} · ${STRATEGI_KEY}${LAWAN ? ' · lawan ' + LAWAN : ''}` });
timeline.analisisFn = () => waktuTerbuang(rekam.frames, ctx.robots, TEAM);
// layar hasil akhir saat buzzer (js/hasil.js); tamu arena melihat hasil di laptop tuan rumah
const hasil = ARENA === 'tamu' ? null : new HasilAkhir({
  events, rules, timeline, team: TEAM, adaLawan: !!foes,
  aksi: { ulang: () => { resetField(); mulaiLatihan(); }, putar: () => openReplay(), catatan: () => timeline.toggle(true), menu: () => { location.href = menuUrl(); } },
});

let active = br;
let camMode = 'ikuti';
const CAM_MODES = ['ikuti', 'atas', 'bebas', 'robot'];
const CAM_NAMES = { ikuti: 'Ikuti robot', atas: 'Atas (denah)', bebas: 'Bebas', robot: 'Kamera robot' };

// ---------- muat model ----------
const loader = new GLTFLoader();
async function loadModel(url, label) {
  const g = await loader.loadAsync(url, (e) => {
    if (e.total) hud.loading(`Memuat ${label} … ${Math.round((e.loaded / e.total) * 100)}%`);
  });
  return g.scene;
}

// GLB cangkang menggantikan rangka statis robot kotak (rangka, pelat, tiang tetap; roda bila
// GLB punya roda bernama B01_/B02_Roda_mecanum). Mekanisme (lift, boom, rahang) tetap kotak.
const RANGKA = new Set(['rangka', 'pelat', 'lengan', 'pelat lengan', 'rangka belakang', 'tiang', 'tiang tetap kiri', 'tiang tetap kanan']);
const cangkangGagal = [];
function pasangCangkang(g, shell) {
  let roda = false;
  shell.traverse((n) => { if (/^B0[12]_Roda_mecanum/.test(n.name)) roda = true; });
  for (const c of g.children) if (RANGKA.has(c.name) || (roda && /^B0[12]_Roda_mecanum/.test(c.name))) c.visible = false;
  shell.name = 'cangkang';
  g.add(shell);
}

async function init() {
  try {
    // tiap GLB dimuat sekali; rig mengubah susunan node, jadi tiap robot mendapat salinannya sendiri
    // (geometri dan material dipakai bersama)
    const cache = new Map();
    const type = (r) => r.profil.model.type;
    for (const r of ctx.robots.filter((r) => type(r) !== 'kotak')) {
      const { url } = r.profil.model;
      if (cache.has(url)) continue;
      hud.loading(`Memuat model ${r.profil.label} …`);
      if (type(r) === 'glb') { cache.set(url, await loadModel(url, r.profil.label)); continue; }
      // cangkang: GLB milik pengguna; bila gagal dimuat, robot tetap jalan sebagai robot kotak
      try { cache.set(url, await loadModel(url, r.profil.label)); } catch (e) {
        console.warn(e);
        cache.set(url, null);
        cangkangGagal.push(url);
      }
    }
    for (const r of ctx.robots) {
      if (type(r) === 'glb') { r.setModel(cache.get(r.profil.model.url).clone(true)); continue; }
      // robot kotak digambar langsung dari geometri profil
      const g = (r.kind === 'BR' ? buildBoxBR : buildBoxTR)(r.G, r.P);
      const shell = type(r) === 'glb-cangkang' && cache.get(r.profil.model.url);
      if (shell) pasangCangkang(g, shell.clone(true));
      r.setModel(g);
    }
    for (const r of ctx.robots) r.addTeamMarker();
  } catch (err) {
    console.error(err);
    hud.loading(location.protocol === 'file:'
      ? `Gagal memuat model GLB (${err.message}). Jalankan lewat server lokal: klik dua kali "jalankan.bat".`
      : `Gagal memuat model GLB (${err.message}). Periksa koneksi lalu muat ulang halaman; bila tetap gagal, jalankan lewat "jalankan.bat".`, true);
    return;
  }
  for (const r of ctx.robots) r.placeAt(...r.startPose());
  hud.loading(null);
  // mode wasit (?wasit=1): panel keputusan manual untuk kedua tim
  if (new URLSearchParams(location.search).get('wasit') === '1') wasit = new Wasit({ rules, robots: ctx.robots, retry: (r) => doRetry(r, r.kind === 'BR', true) });
  if (ARENA === 'tuan') {
    arena = new ArenaTuan({ rekam, rules, logFn: (m, t) => rules.log(m, t) });
    if (!DUA) rules.log('Arena: buka dengan lawan=manusia agar tamu bisa mengemudikan TR lawan', 'warn');
  } else if (ARENA === 'tamu') {
    arena = new ArenaTamu({ rekam, rules, input, logFn: (m, t) => hud.log(m, t, rules.clock()) });
    if (foes) { active = foes.tr; hud.setActive(active); }
  }
  for (const url of cangkangGagal) hud.log(`GLB cangkang "${url.replace(/[<>&"]/g, '')}" gagal dimuat — robot ditampilkan sebagai kotak.`, 'warn');
  hud.log(`Tim ${TEAM === 'red' ? 'MERAH' : 'BIRU'} siap. Tekan Enter untuk mulai timer, H untuk bantuan.`, 'info', '3:00');
  // Mode Pertandingan: ingatkan bila pengaturan menyimpang dari Rulebook (peringatan saja)
  if (rules.matchMode) {
    const nEarth = objects.list.filter((o) => o.kind === 'earth' && o.team === TEAM).length;
    if (nEarth !== 20) rules.log(`Storage berisi ${nEarth} Earth; pertandingan resmi memakai 20 (Rule 4.1.3)`, 'warn');
    if (S.otoBR !== '1' && !jembatanOf.br) rules.log('BR dikemudikan manual; saat lomba BR wajib otonom penuh (Rule 11.3, 11.19)', 'warn');
  }
  // mode otonom yang dipilih di menu langsung menyala
  if (S.otoBR === '1' && !jembatanOf.br) handleEdge({ action: 'auto' });
  mulaiLatihan();
  for (const [k, j] of Object.entries(jembatanOf)) {
    if (!j) continue;
    j.aktif = true;
    const ap = k === 'br' ? auto : autoTR;
    if (ap.enabled) handleEdge({ action: k === 'br' ? 'auto' : 'autoTR' });
    rules.log(`Jembatan aktif: ${k.toUpperCase()} dikendalikan kode tim lewat tools/jembatan.py (${k === 'br' ? 'O' : 'I'} menyalakan autopilot bawaan dan menghentikan jembatan)`, 'info');
  }

  if (S.otoTR === '1') handleEdge({ action: 'autoTR' });
  if (tutorial) label.set(true);
  if (demo) {
    // demo: kedua robot tim sendiri otonom, apa pun pengaturan menu
    if (!auto.enabled) handleEdge({ action: 'auto' });
    if (!autoTR.enabled) handleEdge({ action: 'autoTR' });
    demo.mulai();
  }
  snapCamera();
  requestAnimationFrame(loop);
}

function resetField() {
  hasil?.tutup();
  if (rekam.playing) { rekam.stop(); document.getElementById('replay').classList.remove('show'); }
  rekam.reset();
  objects.setup(LAYOUT);
  rules.reset();
  for (const r of ctx.robots) {
    r.held = [];
    r.frozen = false;
    r.stopped = false;
    r.enteredL1 = false;
    r.retryHold = 0;          // robot yang sedang "diangkat" saat Retry ikut bebas setelah reset
    r.sejakRetry = false;
    if (r.kind === 'BR') { r.vacuum = false; r.h = 335; r.e = 0; r.roll = 0; r.flip = 0; r.track = 0; r.trackTarget = 0; r.preset = null; }
    else { r.jaw = 250; r.open = 390; r.gripCmd = 'open'; r.gripWidth = null; r.preset = null; }
    r.applyJoints();
    r.placeAt(...r.startPose());
  }
  presetIdx = { TR: 0, BR: 0 };
  tr.releaseRegion = null;
  auto.reset();
  autoTR.reset();
  for (const a of foeAutos) { a.reset(); a.enabled = true; }
  timeline.reset();
  hud.clearLog();
  hud.log('Lapangan di-reset', 'info', '3:00');
}

// ---------- kamera ----------
const lastTarget = new THREE.Vector3();
function snapCamera() {
  const r = sorotan();
  const p = new THREE.Vector3(r.x, r.y + 0.4, r.z);
  const back = r.forward().multiplyScalar(-3.2);
  camera.position.set(p.x + back.x, p.y + 2.4, p.z + back.z);
  controls.target.copy(p);
  lastTarget.copy(p);
}

// Tampilan sensor BR (tombol V): kotak garis di pose yang diperkirakan sensor BR pemain
const sensorView = new THREE.Group();
sensorView.visible = false;
scene.add(sensorView);
const sensorBoxes = new Map();
function updateSensorView() {
  if (!sensorView.visible) return;
  const seen = new Set();
  for (const o of objects.list) {
    if (o.state === 'gone') continue;
    const e = auto.sensor.realistic ? auto.sensor.est.get(o.id) : { p: o.worldPos(), yaw: o.kind === 'ball' ? 0 : o.yaw(), t: 0 };
    if (!e || !(e.t > -Infinity)) continue;
    let m = sensorBoxes.get(o.id);
    if (!m) {
      m = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(o.size * 1.02, o.size * 1.02, o.size * 1.02)), new THREE.LineBasicMaterial({ color: 0x5fd8ff, depthTest: false, transparent: true, opacity: 0.85 }));
      m.renderOrder = 10;
      sensorBoxes.set(o.id, m);
      sensorView.add(m);
    }
    m.position.copy(e.p);
    m.rotation.set(0, e.yaw, 0);
    seen.add(o.id);
  }
  for (const [id, m] of sensorBoxes) m.visible = seen.has(id);
}

function updateCamera() {
  controls.enabled = camMode !== 'robot';
  const active = sorotan();      // robot yang diikuti kamera (robot aktif, atau sorotan demo)
  if (camMode === 'ikuti') {
    const p = new THREE.Vector3(active.x, active.y + 0.4, active.z);
    const d = p.clone().sub(lastTarget);
    camera.position.add(d);
    controls.target.add(d);
    lastTarget.copy(p);
  } else if (camMode === 'robot') {
    const fwd = active.forward();
    let eye;
    if (active.kind === 'BR' && active.camNode) {
      eye = active.camNode.getWorldPosition(new THREE.Vector3());
      eye.addScaledVector(fwd, 0.06);
    } else {
      eye = new THREE.Vector3(active.x, active.y + 0.75, active.z).addScaledVector(fwd, -0.25);
    }
    camera.position.copy(eye);
    camera.lookAt(eye.clone().addScaledVector(fwd, 2).add(new THREE.Vector3(0, -0.45, 0)));
  }
  controls.update();
}

function setCamMode(m) {
  camMode = m;
  if (m === 'atas') {
    camera.position.set(0, 16, 0.01);
    controls.target.set(0, 0, 0);
  } else if (m === 'ikuti') {
    snapCamera();
  } else if (m === 'bebas') {
    const r = sorotan();
    controls.target.set(r.x, r.y + 0.4, r.z);
  }
  hud.setCamera(CAM_NAMES[m]);
}

// ---------- aksi tombol ----------
let presetIdx = { TR: 0, BR: 0 };
function handleEdge(e) {
  events.emit('aksi', e.action);
  // saat putar ulang hanya kamera, bantuan, catatan waktu dan menu yang berlaku
  if (rekam.playing && !['camera', 'help', 'timeline', 'menu', 'minimap', 'keys', 'pengarah', 'label'].includes(e.action)) return;
  // pemain kedua (lawan manusia) hanya mengendalikan TR lawan: jepit, preset, Retry
  if (e.target === 'foe') {
    if (!foes || !/^(grip|retry|preset)/.test(e.action) || rules.phase === 'ended') return;
    const r = foes.tr;
    if (e.action === 'grip') r.toggleGrip();
    else if (/^preset\d$/.test(e.action)) r.setPreset(Number(e.action.slice(6)));
    else if (e.action === 'retry') { rules.onRetry(r); r.retry(false); events.emit('tl', { type: 'retry', team: r.team, robot: 'TR', text: 'ke Start/Retry Zone (pemain 2)' }); rules.log(`${rules.tag(r.team)}Retry TR (pemain 2)`, 'info'); }
    else if (e.action === 'presetPrev' || e.action === 'presetNext') {
      const ps = r.P.preset, cur = ps.findIndex((v) => v >= r.jaw - 1);
      const i = e.action === 'presetNext' ? Math.min(ps.length - 1, (cur < 0 ? ps.length - 1 : cur) + 1) : Math.max(0, (cur < 0 ? 0 : cur) - 1);
      r.setPreset(i + 1);
    }
    return;
  }
  const robot = e.target === 'other' ? (active === br ? tr : br) : active;
  // 4.6.1 / 9.4.1: setelah buzzer robot tidak boleh digerakkan atau disentuh
  if (rules.phase === 'ended' && /^(grip|track|retry|freeze|preset)/.test(e.action)) {
    hud.toast('Waktu habis — tekan P untuk reset');
    return;
  }
  // BR otonom: aktuator BR dipegang autopilot, operator hanya mengendalikan TR
  if (autoOf(robot).enabled && /^(grip|track|preset)/.test(e.action)) {
    hud.toast(`${robot.kind} sedang otonom — tekan ${robot === br ? 'O' : 'I'} untuk mengambil alih`);
    return;
  }
  switch (e.action) {
    case 'auto': {
      const on = auto.toggle();
      rules.log(on ? 'BR OTONOM aktif (Rule 11.3) — kemudikan TR, tekan O untuk mematikan' : 'BR otonom dimatikan — kendali manual', on ? 'ok' : 'info');
      if (on && active === br && !autoTR.enabled) { active = tr; hud.setActive(active); if (camMode === 'ikuti') snapCamera(); }
      break;
    }
    case 'autoTR': {
      const on = autoTR.toggle();
      rules.log(on ? 'TR OTONOM aktif — tekan I untuk mematikan' : 'TR otonom dimatikan — kendali manual', on ? 'ok' : 'info');
      if (on && active === tr && !auto.enabled) { active = br; hud.setActive(active); if (camMode === 'ikuti') snapCamera(); }
      break;
    }
    case 'grip': robot.toggleGrip(); break;
    case 'track': if (robot.kind === 'BR') robot.toggleTrack(); break;
    case 'switch':
      fokus = null;
      active = active === br ? tr : br;
      hud.setActive(active);
      if (camMode === 'ikuti') snapCamera();
      break;
    case 'camera': setCamMode(CAM_MODES[(CAM_MODES.indexOf(camMode) + 1) % CAM_MODES.length]); break;
    case 'timer': rules.toggleTimer(); break;
    case 'retry': doRetry(robot, e.shift && robot.kind === 'BR'); break;
    case 'swapZones':
    case 'rotate90': {
      if (!(rules.matchMode && rules.phase === 'setup')) { rules.log('Tukar zona (Z) dan putar robot (X) hanya saat setup di mode Pertandingan', 'info'); break; }
      if (e.action === 'swapZones') { [tr.zone, br.zone] = [br.zone, tr.zone]; for (const r of [tr, br]) r.placeAt(...r.startPose()); }
      else { robot.startYaw = (robot.startYaw + Math.PI / 2) % (2 * Math.PI); robot.placeAt(...robot.startPose()); }
      rules.log(e.action === 'swapZones' ? `Zona ditukar: TR di zona ${tr.zone === 0 ? 'tepi' : 'dalam'}, BR di zona ${br.zone === 0 ? 'tepi' : 'dalam'} (4.1.2)` : `${robot.kind} diputar 90°`, 'info');
      if (camMode === 'ikuti') snapCamera();
      break;
    }
    case 'freeze':
      br.frozen = !br.frozen;
      rules.log(br.frozen ? 'BR FREEZE (11.4) — semua aktuator dijeda' : 'BR RESUME', br.frozen ? 'warn' : 'info');
      events.emit('tl', { type: 'freeze', team: br.team, robot: 'BR', text: br.frozen ? 'Freeze' : 'Resume' });
      break;
    case 'help': hud.toggleHelp(); break;
    case 'menu':
      if (confirm('Kembali ke menu awal? Pertandingan ini akan hilang.')) location.href = menuUrl();
      break;
    case 'timeline': timeline.toggle(); break;
    case 'mute': rules.log(suara.toggle() ? 'Suara aktif' : 'Suara bisu', 'info'); break;
    case 'pengarah': pengarah.toggle(); break;
    case 'sensorView':
      sensorView.visible = !sensorView.visible;
      rules.log(sensorView.visible ? `Tampilan sensor BR: kotak biru muda = perkiraan sensor (${auto.sensor.mode})` : 'Tampilan sensor BR mati', 'info');
      break;
    case 'minimap': hud.toggleMinimap(); break;
    case 'label': rules.log(label.toggle() ? 'Nama area ditampilkan (Y untuk menyembunyikan)' : 'Nama area disembunyikan', 'info'); break;
    case 'keys': document.getElementById('keys').classList.toggle('hide'); break;
    case 'reset':
      if (confirm('Reset lapangan, objek, skor dan timer?')) { resetField(); mulaiLatihan(); }
      break;
    case 'presetPrev': case 'presetNext': {
      const k = robot.kind;
      presetIdx[k] = ((presetIdx[k] + (e.action === 'presetNext' ? 1 : -1)) % 6 + 6) % 6;
      robot.setPreset(presetIdx[k] + 1);
      hud.toast(`Preset ${presetIdx[k] + 1}`);
      break;
    }
    default:
      if (e.action.startsWith('preset')) {
        const i = Number(e.action.slice(6));
        robot.setPreset(i);
        presetIdx[robot.kind] = i - 1;
        hud.toast(`${robot.kind} preset ${i}`);
      }
  }
}

// ---------- loop ----------
const clock = new THREE.Clock();
const IDLE = { f: 0, s: 0, r: 0, lift: 0, aux: 0, roll: 0, flip: 0, slow: false };
function simulate(dt, inp) {
  const other = active === br ? tr : br;
  const steps = 2, h = dt / steps;
  // perintah autopilot (null bila mode otonom robot itu mati)
  // mode pertandingan: semua robot terkunci selama setup, sampai buzzer (4.1.1, 11.19)
  ctx.locked = rules.matchMode && rules.phase === 'setup';
  const cmdOf = new Map([[br, auto.update(dt)], [tr, autoTR.update(dt)]]);
  for (const [r, j, ap] of [[br, jembatanOf.br, auto], [tr, jembatanOf.tr, autoTR]]) {
    if (j?.aktif && !ap.enabled) { j.update(); if (!ctx.locked) cmdOf.set(r, j.command()); }
  }
  for (const a of foeAutos) cmdOf.set(a.robot, a.update(dt));
  for (let i = 0; i < steps; i++) {
    active.update(h, cmdOf.get(active) || inp.active);
    other.update(h, cmdOf.get(other) || inp.other || IDLE);
    if (foes) { foes.tr.update(h, cmdOf.get(foes.tr) || inp.foe || IDLE); foes.br.update(h, cmdOf.get(foes.br) || IDLE); }
    objects.update(h);
  }
  rules.update(dt);
  demo?.update();
  darurat?.update();
  suara.update();
  rekam.capture();
}

// ---------- putar ulang ----------
const RP = (id) => document.getElementById(id);
function replayUi() {
  const P = rekam.playing;
  if (!P) return;
  const f = rekam.frameAt(P.t), t0 = rekam.frames[0].t, span = Math.max(rekam.duration, 1e-6);
  const m = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  RP('rp-time').textContent = `${m(P.t - t0)} / ${m(span)} · jam ${f.clock} · M ${f.score.red} : B ${f.score.blue}`;
  RP('rp-play').textContent = P.paused ? '▶' : '⏸';
  pengarah.putar(P);
  if (document.activeElement !== RP('rp-pos')) RP('rp-pos').value = String(Math.round(((P.t - t0) / span) * 1000));
}
function openReplay() {
  if (!rekam.start()) { rules.log('Belum ada rekaman — jalankan pertandingan dulu', 'warn'); return; }
  RP('replay').classList.add('show');
  timeline.toggle(false);
  rules.log('Putar ulang: simulasi dijeda. Tutup pemutar untuk mereset lapangan.', 'info');
  replayUi();
}
function closeReplay() {
  RP('replay').classList.remove('show');
  pengarah.stopPutar();
  rekam.stop();
  resetField();
  rules.log('Putar ulang ditutup — lapangan direset', 'info');
}
RP('tl-replay').addEventListener('click', openReplay);
RP('rp-close').addEventListener('click', closeReplay);
RP('rp-play').addEventListener('click', () => {
  const P = rekam.playing; if (!P) return;
  if (P.paused && P.t >= rekam.frames[rekam.frames.length - 1].t) rekam.seek(rekam.frames[0].t);
  P.paused = !P.paused; replayUi();
});
RP('rp-speed').addEventListener('change', (e) => { if (rekam.playing) rekam.playing.speed = Number(e.target.value); });
RP('rp-pos').addEventListener('input', (e) => { if (rekam.playing) { rekam.seek(rekam.frames[0].t + (Number(e.target.value) / 1000) * rekam.duration); replayUi(); } });
RP('rp-save').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(rekam.toJSON({ pengaturan: location.search, waktu: new Date().toISOString() }))], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rekaman-werkudara-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
RP('rp-file').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    rekam.stop();
    rekam.load(JSON.parse(await file.text()));
    rekam.start(); replayUi();
    rules.log(`Rekaman dimuat: ${file.name}`, 'ok');
  } catch (err) { rules.log(`Rekaman tidak bisa dimuat: ${err.message}`, 'bad'); }
});

// Bandingkan log robot asli (panel L): perintah log dijalankan ulang oleh robot aktif di lantai kosong
function bandingLog(teks, robot = active) {
  const h = bandingkan(robot, bacaLog(teks));
  gambarLintasan(scene, h);
  rules.log(`Banding log ${robot.kind}: galat rata-rata ${(h.rms * 100).toFixed(1)} cm, akhir ${(h.akhir * 100).toFixed(1)} cm (oranye = robot asli, biru = simulator)`, 'info');
  for (const s of h.saran) rules.log(`Saran kalibrasi: ${s}`, 'info');
  if (camMode === 'ikuti') snapCamera();
  return h;
}
RP('tl-banding').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try { bandingLog(await file.text()); timeline.toggle(false); } catch (err) { rules.log(`Log tidak bisa dibandingkan: ${err.message}`, 'bad'); }
});

// tuan rumah arena: kirim keadaan, pakai perintah dan tombol pemain tamu untuk TR lawan
function arenaTuan(inp) {
  if (ARENA !== 'tuan' || !arena) return;
  arena.update();
  inp.edges.push(...arena.ambilEdges());
  const c = arena.foeCmd();
  if (c) inp.foe = c;
}

function loop() {
  requestAnimationFrame(loop);
  // debug/uji: sim.tanpaRender = true menghentikan loop tampilan (simulasi dimajukan lewat sim.step)
  if (window.sim?.tanpaRender) return;
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const inp = input.poll({ dua: DUA });
  if (ARENA === 'tamu' && arena) {
    for (const e of inp.edges) if (!arena.teruskan(e)) handleEdge(e);
    arena.update(dt, inp.active);
  } else {
    arenaTuan(inp);
    for (const e of inp.edges) handleEdge(e);
    if (rekam.playing) { rekam.update(dt); replayUi(); } else simulate(dt, inp);
  }
  updateCamera();
  updateSensorView();
  latihan?.update();
  tutorial?.update();
  hud.update(dt, { active, pads: inp.pads, camMode, auto, autoTR });
  timeline.update();
  renderer.render(scene, camera);
}

hud.setActive(active);
hud.setCamera(CAM_NAMES[camMode]);
// akses dari console DevTools untuk debug / skrip otonom nanti
// sim.step(detik, ['KeyW', ...]) memajukan simulasi tanpa render (uji / skrip)
window.sim = {
  Lidar, Imu, Odom, buatPeta, Kamera, LIDAR_BURUK, KAMERA_BURUK, get arena() { return arena; }, get wasit() { return wasit; }, darurat, pengarah, bandingLog, labelBingkai, NAMA_KELAS,
  tr, br, objects, rules, scene, camera, controls, renderer, input, setCamMode, resetField, auto, autoTR, timeline, foes, foeAutos, rekam, openReplay, closeReplay, latihan, tutorial, label, demo, get fokus() { return fokus; }, get camMode() { return camMode; }, get hasil() { return hasil; }, jembatan, jembatanOf, suara, robots: ctx.robots,
  get active() { return active; },
  press(code) { input.edges.push(...[].concat(code).map((c) => ({ action: { Space: 'grip', KeyT: 'track', Tab: 'switch', Enter: 'timer', KeyO: 'auto', KeyI: 'autoTR', KeyL: 'timeline', KeyV: 'sensorView', KeyZ: 'swapZones', KeyX: 'rotate90', KeyN: 'mute', KeyJ: 'pengarah', Backspace: 'retry' }[c] || ('preset' + c.replace('Digit', '')), shift: false }))); for (const e of input.edges.splice(0)) handleEdge(e); },
  step(sec, keys = []) {
    for (const k of keys) input.keys.add(k);
    for (let t = 0; t < sec - 1e-9; t += 1 / 60) {
      const inp = input.poll({ dua: DUA });
      arenaTuan(inp);
      for (const e of inp.edges) handleEdge(e);
      if (rekam.playing) rekam.update(1 / 60); else simulate(1 / 60, inp);
      latihan?.update();
      tutorial?.update(rules.simT);
    }
    for (const k of keys) input.keys.delete(k);
  },
};
init();
