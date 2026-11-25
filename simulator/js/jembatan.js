// Jembatan kode robot tim (?jembatan=br | tr | br,tr; ?jembatan=1 = br): BR dan/atau TR di simulator
// dikendalikan program Python tim lewat tools/jembatan.py. Halaman mengirim pengamatan robot 20 kali per
// detik ke POST /api/br atau /api/tr dan memakai perintah yang dikembalikan. Pengamatan hanya berisi apa
// yang boleh diketahui robot itu (Rule 11.11): keadaan robot sendiri, perkiraan sensornya atas benda dan
// robot pasangannya (js/sensor.js), skor dan jam pertandingan. Perintah yang lebih tua dari 0,5 detik
// diabaikan (robot berhenti) agar kode yang macet tidak berbahaya.

import { Lidar, Imu, Odom, LIDAR_BURUK } from './lidar.js';

// ?sensorBuruk=1: LiDAR, IMU dan kamera dengan gangguan (lihat js/lidar.js, js/kamera.js)
const BURUK = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('sensorBuruk') === '1';
import { buatPeta } from './peta.js';
import { keBase64 } from './kamera.js';

let petaTerkirim = false;      // peta okupansi dikirim sekali per halaman (dipakai jembatan ROS 2 untuk /map)

const PERIODE = 0.05, BASI = 0.5, PERIODE_LIDAR = 0.1;
const r3 = (v) => Math.round(v * 1000) / 1000;
const satu = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

export class Jembatan {
  constructor({ robot, mate, rules, objects, sensor, logFn, kamera = null }) {
    Object.assign(this, { robot, mate, rules, objects, sensor, logFn, kamera });
    this.tKamera = -Infinity;
    this.kirimKamera = false;
    this.jumlahKamera = 0;      // bingkai kamera yang diterima server
    this.kind = robot.kind;
    this.url = `/api/${robot.kind.toLowerCase()}`;
    this.aktif = false;
    this.cmd = null;
    this.tCmd = -Infinity;
    this.next = 0;
    this.sibuk = false;
    this.gagal = 0;
    this.terhubung = false;
    this.jumlah = 0;            // jumlah perintah yang diterima
    this.lidar = new Lidar(robot, { seed: robot.kind === 'BR' ? 21 : 22, ...(BURUK ? LIDAR_BURUK : {}) });
    this.imu = new Imu(robot, { seed: robot.kind === 'BR' ? 31 : 32, buruk: BURUK });
    this.tScan = -Infinity;
    this.odom = new Odom(robot, { seed: robot.kind === 'BR' ? 41 : 42 });
  }

  diri() {
    const r = this.robot;
    // kecepatan robot dalam kerangka robot (maju, kiri: m/s; w: rad/s, + = putar kiri) dan batas gerak,
    // agar program tim (mis. jembatan ROS 2) bisa memakai satuan SI dan bukan perintah -1..1 saja
    const S = (n) => ({ min: r.P[n].min, max: r.P[n].max, speed: r.P[n].speed });
    const batas = { vmaks: r3(r.maxSpeed()), wmaks: r3(r.maxRot()), ...(r.kind === 'BR' ? { h: S('h'), e: S('e'), roll: S('roll'), flip: S('flip') } : { jaw: S('jaw'), open: S('open') }) };
    const umum = { x: r3(r.x), y: r3(r.y), z: r3(r.z), yaw: r3(r.yaw), maju: r3(r.vz), kiri: r3(r.vx), w: r3(r.w), batas, memegang: r.held.map((o) => o.kind), tertahan: !!r.blocked, wilayah: r.region().name };
    if (r.kind === 'BR') return { ...umum, h: r3(r.h), e: r3(r.e), roll: r3(r.roll), track: r3(r.track), flip: r3(r.flip), vakum: r.vacuum, beku: !!r.frozen };
    const k = r.jawCandidate();
    return { ...umum, jaw: r3(r.jaw), open: r3(r.open), jepit: r.gripCmd === 'close' || r.held.length > 0, kandidat: k.obj ? { id: k.obj.id, jenis: k.obj.kind } : null, petunjuk: k.hint || null };
  }

  pengamatan() {
    const br = this.robot, R = this.rules;
    const benda = [];
    for (const o of this.objects.list) {
      if (o.state === 'gone' || o.invalid) continue;
      const e = this.sensor.sense(o);
      if (!e || !(e.t > -Infinity) && this.sensor.realistic) continue;      // belum pernah terlihat
      benda.push({
        id: o.id, jenis: o.kind, tim: o.team, ukuran: r3(o.size), x: r3(e.p.x), y: r3(e.p.y), z: r3(e.p.z), yaw: r3(e.yaw ?? 0),
        warnaAtas: o.kind === 'sky' ? o.topColor() : null, dipegang: br.heldSet().has(o),
        umur: e.t > -Infinity ? r3(R.simT - e.t) : 0,
      });
    }
    const t = this.mate && this.sensor.senseRobot(this.mate);
    const lain = this.kind === 'BR' ? 'tr' : 'br';
    return {
      t: r3(R.simT), jam: R.clock(), fase: R.phase, tim: br.team, robot: this.kind,
      [this.kind.toLowerCase()]: this.diri(),
      [lain]: t ? { x: r3(t.x), z: r3(t.z), bergerak: t.moving } : null,
      benda,
      skor: { ...R.score }, mandate: R.mandateOf(br.team),
      imu: this.imu.baca(R.simT),
      // odometri roda (perkiraan, menyimpang pelan); pose x/z/yaw di atas tetap pose sebenarnya
      odom: ((o) => ({ x: r3(o.x), z: r3(o.z), yaw: r3(o.yaw) }))(this.odom.baca(R.simT)),
      // LiDAR 2D 10 kali per detik (pengamatan lain tanpa "scan")
      ...(R.simT - this.tScan >= PERIODE_LIDAR - 1e-6 ? this.pindai() : {}),
    };
  }

  pindai() {
    this.tScan = this.rules.simT;
    const o = this.lidar.o;
    return { scan: { n: o.n, min: o.min, max: o.max, tinggi: o.tinggi, jarak: this.lidar.scan() } };
  }

  // dipanggil tiap frame; mengirim pengamatan bila waktunya dan tidak ada permintaan yang tertunda
  update() {
    if (this.aktif && !petaTerkirim) {
      petaTerkirim = true;
      const body = JSON.stringify({ lantai: buatPeta('lantai'), l1: buatPeta('l1') });
      fetch('/api/peta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
    }
    // kamera (bila ada): bingkai tiap periode detik simulasi, dikirim terpisah dari pengamatan
    if (this.aktif && this.kamera && !this.kirimKamera && this.rules.simT - this.tKamera >= this.kamera.o.periode - 1e-6) {
      this.tKamera = this.rules.simT;
      const f = this.kamera.ambil();
      const body = JSON.stringify({ t: r3(this.rules.simT), pose: f.pose, lebar: f.lebar, tinggi: f.tinggi, fx: f.fx, fy: f.fy, cx: f.cx, cy: f.cy,
        rgb: keBase64(f.rgb), depth: keBase64(new Uint8Array(f.depth.buffer)) });
      this.kirimKamera = true;
      fetch(`${this.url}/kamera`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        .then((r) => { if (r.ok) this.jumlahKamera++; }).catch(() => {}).finally(() => { this.kirimKamera = false; });
    }
    // toleransi 1 µs: langkah simulasi 1/20 s yang dijumlahkan berulang bisa sedikit di bawah `next`
    if (!this.aktif || this.sibuk || this.rules.simT < this.next - 1e-6) return;
    this.next = this.rules.simT + PERIODE;
    this.sibuk = true;
    const body = JSON.stringify(this.pengamatan());
    fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((c) => {
        this.cmd = c || {};
        this.tCmd = this.rules.simT;
        this.jumlah++;
        if (!this.terhubung) { this.terhubung = true; this.logFn(`Jembatan: kode ${this.kind} tim terhubung`, 'ok'); }
        this.gagal = 0;
      })
      .catch((err) => {
        if (++this.gagal === 3) this.logFn(`Jembatan: tidak ada jawaban dari tools/jembatan.py (${err.message}) — jalankan: python tools/jembatan.py --kode tools/contoh_br.py`, 'bad');
        if (this.terhubung && this.gagal >= 3) this.terhubung = false;
      })
      .finally(() => { this.sibuk = false; });
  }

  // Perintah untuk robot (format robot) atau perintah diam bila tidak ada / sudah basi
  command() {
    const c = this.cmd, r = this.robot;
    const diam = { f: 0, s: 0, r: 0, lift: 0, aux: 0, roll: 0, flip: 0, slow: false };
    if (!c || this.rules.simT - this.tCmd > BASI) return diam;
    const gerak = { f: satu(c.maju), s: satu(c.geser), r: satu(c.putar), lift: satu(c.lift), slow: !!c.presisi };
    if (r.kind === 'BR') {
      // vakum dan track berupa keadaan yang diminta; diubah lewat tombol yang sama seperti operator
      if (typeof c.vakum === 'boolean' && c.vakum !== r.vacuum) r.toggleGrip();
      if (typeof c.track === 'boolean' && c.track !== (r.trackTarget > 0.5)) r.toggleTrack();
      return { ...diam, ...gerak, aux: satu(c.boom), roll: satu(c.roll), flip: satu(c.flipper) };
    }
    // TR: jepit = keadaan yang diminta (tutup / buka); rahang = + menutup, - membuka (manual)
    if (typeof c.jepit === 'boolean' && !r.frozen && !r.stopped) r.gripCmd = c.jepit ? 'close' : 'open';
    return { ...diam, ...gerak, aux: satu(c.rahang) };
  }
}
