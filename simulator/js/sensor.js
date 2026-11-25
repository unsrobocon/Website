// Sensor tiruan untuk BR otonom (Rule 11.3: BR bekerja sendiri dengan sensornya).
//   'sempurna'  posisi dan arah benda dibaca pasti dari simulator (perilaku lama, bawaan)
//   'realistis' kamera di robot memperbarui perkiraan 10 kali per detik, hanya untuk benda dalam
//               jangkauan 5 m dan sudut pandang 140°, dengan galat acak yang membesar dengan jarak
//               ditambah bias tetap per benda (kesalahan kalibrasi). Benda yang dipegang dilihat
//               kamera gripper: galatnya kecil dan tetap selama digenggam. Benda yang belum pernah
//               terlihat diberi perkiraan kasar (seperti dilihat dari 4 m), jadi robot harus
//               mendekat dan mengukur ulang.
// Orientasi warna Sky dan sentuhan (cup / lift tertahan) tetap dibaca dari keadaan fisik.

import * as THREE from 'three';
import { obbAxes } from './geom.js';

const RANGE = 5, HALF_FOV = THREE.MathUtils.degToRad(70), PERIOD = 0.1;

// Ruas garis p0-p1 memotong kotak [min, max] (metode slab); koordinat {x, y, z}
function segKotak(p0, p1, min, max) {
  let t0 = 0, t1 = 1;
  for (const k of ['x', 'y', 'z']) {
    const d = p1[k] - p0[k];
    if (Math.abs(d) < 1e-9) { if (p0[k] < min[k] || p0[k] > max[k]) return false; continue; }
    let ta = (min[k] - p0[k]) / d, tb = (max[k] - p0[k]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

// PRNG berbiji (mulberry32) agar uji bisa diulang
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Sensor {
  constructor(robot, rules, { mode = 'sempurna', seed = 7 } = {}) {
    this.robot = robot;
    this.rules = rules;
    this.mode = mode;
    this.realistic = mode === 'realistis';
    this.rand = prng(seed);
    this.est = new Map();       // id benda -> { p, yaw, t, d }
    this.bias = new Map();      // id benda -> { x, z, y, yaw } bias kalibrasi
    this.grip = new Map();      // id benda -> galat tetap selama dipegang
  }

  reset() { this.est.clear(); this.grip.clear(); }

  gauss() {
    const u = Math.max(1e-9, this.rand()), v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  sigma(d) { return { p: 0.004 + 0.012 * d, yaw: THREE.MathUtils.degToRad(1.5 + 1 * d) }; }

  // Posisi kamera robot dan apakah benda o terlihat
  camera() {
    const r = this.robot;
    const c = r.camNode ? r.camNode.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(r.x, r.y + 0.6, r.z);
    return c;
  }

  visible(o, c) {
    const p = o.worldPos();
    const d = c.distanceTo(p);
    if (d > RANGE) return null;
    const r = this.robot, a = Math.atan2(p.x - c.x, p.z - c.z);
    const da = Math.atan2(Math.sin(a - r.yaw), Math.cos(a - r.yaw));
    if (!(Math.abs(da) <= HALF_FOV || d < 0.35)) return null;
    // terlihat bila pusat atau bagian atas benda tidak terhalang benda lain / robot lain
    const atas = p.clone(); atas.y += o.half * 0.8;
    return this.terhalang(c, p, o) && this.terhalang(c, atas, o) ? null : d;
  }

  // Garis pandang kamera c ke titik q terhalang benda lain (kotak batas) atau badan robot lain
  terhalang(c, q, target) {
    const r = this.robot, objs = r.ctx.objects.list, mine = r.heldSet();
    // berhenti 2 cm sebelum titik agar benda target sendiri tidak dihitung
    const dir = q.clone().sub(c), len = dir.length();
    if (len < 0.05) return false;
    const ujung = c.clone().addScaledVector(dir, (len - 0.02) / len);
    for (const b of objs) {
      if (b === target || b.state === 'gone' || mine.has(b)) continue;
      const bp = b.mesh.position;
      if (Math.abs(bp.x - c.x) > RANGE + 0.5 || Math.abs(bp.z - c.z) > RANGE + 0.5) continue;
      const box = b.aabb();
      if (segKotak(c, ujung, box.min, box.max)) return true;
    }
    for (const rb of r.ctx.robots) {
      if (rb === r) continue;
      for (const ob of rb.bodyObbs(rb.x, rb.z, rb.yaw, rb.y)) {
        // ke kerangka kotak (sumbu ux, uz), lalu uji slab
        const [ux, uz] = obbAxes(ob);
        const L = (v) => { const dx = v.x - ob.cx, dz = v.z - ob.cz; return { x: dx * ux[0] + dz * ux[1], y: v.y, z: dx * uz[0] + dz * uz[1] }; };
        if (segKotak(L(c), L(ujung), { x: -ob.hx, y: ob.y0, z: -ob.hz }, { x: ob.hx, y: ob.y1, z: ob.hz })) return true;
      }
    }
    return false;
  }

  // Titik p berada dalam jangkauan dan sudut pandang kamera
  looksAt(p) {
    const c = this.camera(), r = this.robot;
    if (c.distanceTo(p) > RANGE) return false;
    const a = Math.atan2(p.x - c.x, p.z - c.z);
    return Math.abs(Math.atan2(Math.sin(a - r.yaw), Math.cos(a - r.yaw))) <= HALF_FOV;
  }

  biasOf(o) {
    let b = this.bias.get(o.id);
    if (!b) {
      b = { x: 0.003 * this.gauss(), z: 0.003 * this.gauss(), y: 0.002 * this.gauss(), yaw: THREE.MathUtils.degToRad(0.5) * this.gauss() };
      this.bias.set(o.id, b);
    }
    return b;
  }

  measure(o, d) {
    const s = this.sigma(d), b = this.biasOf(o), p = o.worldPos();
    return {
      p: new THREE.Vector3(p.x + b.x + s.p * this.gauss(), p.y + b.y + 0.5 * s.p * this.gauss(), p.z + b.z + s.p * this.gauss()),
      yaw: (o.kind === 'ball' ? 0 : o.yaw()) + b.yaw + s.yaw * this.gauss(),
      t: this.rules.simT,
      d,
    };
  }

  // Perkiraan pose benda o: { p: Vector3, yaw }
  sense(o) {
    if (!this.realistic) return { p: o.worldPos().clone(), yaw: o.kind === 'ball' ? 0 : o.yaw(), d: 0 };
    // dipegang robot ini: kamera gripper, galat kecil yang tetap selama digenggam
    if (this.robot.heldSet().has(o)) {
      let g = this.grip.get(o.id);
      if (!g) {
        g = { x: 0.002 * this.gauss(), y: 0.001 * this.gauss(), z: 0.002 * this.gauss(), yaw: THREE.MathUtils.degToRad(0.6) * this.gauss() };
        this.grip.set(o.id, g);
      }
      const p = o.worldPos();
      const e = { p: new THREE.Vector3(p.x + g.x, p.y + g.y, p.z + g.z), yaw: (o.kind === 'ball' ? 0 : o.yaw()) + g.yaw, t: this.rules.simT, d: 0 };
      this.est.set(o.id, e);          // ingatan ikut benda yang dibawa, sampai ke tempat ia ditaruh
      return e;
    }
    this.grip.delete(o.id);
    const now = this.rules.simT;
    let e = this.est.get(o.id);
    // pengamatan baru paling sering 10 kali per detik per benda (juga uji garis pandangnya)
    if (e && now - (e.cek ?? -Infinity) < PERIOD) return e;
    const c = this.camera();
    const d = this.visible(o, c);
    if (d !== null) {
      e = this.measure(o, d);
    } else if (!e) {
      e = { ...this.measure(o, 4), t: -Infinity };          // belum pernah terlihat: perkiraan kasar
    } else if (e.t > -Infinity && this.looksAt(e.p) && !this.terhalang(c, e.p, o)) {
      // kamera melihat (tanpa halangan) tempat yang diingat tetapi bendanya tidak ada di sana: lupakan
      e = { ...this.measure(o, 4), t: -Infinity };
    }
    e.cek = now;
    this.est.set(o.id, e);
    return e;
  }

  // Perkiraan posisi dan gerak robot lain (Rule 11.11: BR hanya boleh mengamati TR dengan sensornya
  // sendiri). Kecepatan diukur dari perpindahan perkiraan dalam ±0,5 s terakhir agar tidak terlalu
  // berisik. Mengembalikan { x, z, moving } (moving = sedang bergerak/berputar) atau null bila TR
  // belum pernah terlihat.
  senseRobot(r) {
    if (!this.realistic) return { x: r.x, z: r.z, moving: Math.hypot(r.vx, r.vz) > 0.02 || Math.abs(r.w) > 0.02 };
    const key = `robot:${r.team}:${r.kind}`, now = this.rules.simT;
    let h = this.est.get(key);
    if (!h) { h = { list: [], t: -Infinity }; this.est.set(key, h); }
    const c = this.camera(), p = new THREE.Vector3(r.x, r.y + 0.3, r.z);
    if (this.looksAt(p)) {
      if (now - h.t >= PERIOD) {
        const s = this.sigma(c.distanceTo(p));
        h.list.push({ t: now, x: r.x + s.p * this.gauss(), z: r.z + s.p * this.gauss(), yaw: r.yaw + s.yaw * this.gauss() });
        h.t = now;
      }
    } else if (h.list.length) {
      // TR tidak terlihat: bila tempat terakhirnya ada dalam pandangan, TR sudah pergi dari sana
      const last = h.list[h.list.length - 1];
      if (this.looksAt(new THREE.Vector3(last.x, r.y + 0.3, last.z))) h.list = [];
    }
    while (h.list.length && now - h.list[0].t > 0.6) h.list.shift();
    if (!h.list.length) return null;
    const a = h.list[0], b = h.list[h.list.length - 1], span = b.t - a.t;
    const n = h.list.length, x = h.list.reduce((v, m) => v + m.x, 0) / n, z = h.list.reduce((v, m) => v + m.z, 0) / n;
    // bergerak bila berpindah > 12 cm/s atau berputar > 0,15 rad/s dalam jendela pengamatan
    const moving = span < 0.35 ? true : Math.hypot(b.x - a.x, b.z - a.z) / span > 0.12 || Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw))) / span > 0.15;
    return { x, z, moving };
  }

  // Galat perkiraan saat ini terhadap posisi sebenarnya (untuk uji dan tampilan)
  error(o) {
    const e = this.sense(o);
    return e.p.distanceTo(o.worldPos());
  }
}
