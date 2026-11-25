// LiDAR 2D dan IMU tiruan untuk jembatan kode tim (ROS 2: sensor_msgs/LaserScan dan sensor_msgs/Imu).
// LiDAR dipasang TINGGI m di atas lantai robot, memindai 360° dengan N berkas. Yang memantulkan berkas:
// tepi level/ramp/tangga (bila lantai di depan lebih tinggi dari berkas), pagar/barrier, pilar, benda
// (Earth/Sky/Mustika) dan badan robot lain — dihitung secara analitik, tanpa render. Galat jarak acak
// σ = 1 cm. Sudut berkas mengikuti ROS: 0 = depan robot, + = ke kiri, dari -π.

import { WALLS, PILLARS, heightAt } from './field.js';
import { rectToObb, obbAxes } from './geom.js';

export const LIDAR = { n: 360, min: 0.12, max: 8, tinggi: 0.15, sigma: 0.01 };
// ?sensorBuruk=1: derau besar, berkas hilang (permukaan gelap / mengilap) dan pantulan palsu dekat (debu)
export const LIDAR_BURUK = { sigma: 0.03, hilang: 0.05, palsu: 0.005 };
const WALL_OBBS = WALLS.map((w) => rectToObb(w, w.y0, w.y1));
const LANGKAH = 0.02;

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

// Jarak sepanjang sinar (ox, oz) + t (dx, dz) ke kotak berorientasi, atau Infinity
function sinarObb(ox, oz, dx, dz, o) {
  const [ux, uz] = obbAxes(o);
  const px = (ox - o.cx) * ux[0] + (oz - o.cz) * ux[1], pz = (ox - o.cx) * uz[0] + (oz - o.cz) * uz[1];
  const vx = dx * ux[0] + dz * ux[1], vz = dx * uz[0] + dz * uz[1];
  let t0 = 0, t1 = Infinity;
  for (const [p, v, h] of [[px, vx, o.hx], [pz, vz, o.hz]]) {
    if (Math.abs(v) < 1e-12) { if (Math.abs(p) > h) return Infinity; continue; }
    let a = (-h - p) / v, b = (h - p) / v;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  return t0 > 0 ? t0 : Infinity;      // titik awal di dalam kotak tidak dihitung
}

function sinarLingkaran(ox, oz, dx, dz, c) {
  const fx = ox - c.x, fz = oz - c.z;
  const b = fx * dx + fz * dz, cc = fx * fx + fz * fz - c.r * c.r;
  const d = b * b - cc;
  if (d < 0) return Infinity;
  const t = -b - Math.sqrt(d);
  return t > 0 ? t : Infinity;
}

export class Lidar {
  constructor(robot, { seed = 21, ...opsi } = {}) {
    this.robot = robot;
    this.o = { ...LIDAR, ...opsi };
    this.rand = prng(seed);
  }

  gauss() {
    const u = Math.max(1e-9, this.rand()), v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Satu pindaian: daftar jarak (m) atau null bila tidak ada pantulan dalam jangkauan
  scan() {
    const r = this.robot, o = this.o, ctx = r.ctx;
    const hy = r.y + o.tinggi;
    const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw), lx = Math.cos(r.yaw), lz = -Math.sin(r.yaw);
    const ox = r.x, oz = r.z;
    // rintangan yang memotong bidang pindai
    const obbs = WALL_OBBS.filter((w) => hy >= w.y0 && hy <= w.y1);
    const mine = r.heldSet();
    for (const b of ctx.objects.list) {
      if (b.state === 'gone' || mine.has(b)) continue;
      const ob = b.obb(0);
      if (hy >= ob.y0 && hy <= ob.y1) obbs.push(ob);
    }
    for (const rb of ctx.robots) {
      if (rb === r) continue;
      for (const ob of rb.bodyObbs(rb.x, rb.z, rb.yaw, rb.y)) if (hy >= ob.y0 && hy <= ob.y1) obbs.push(ob);
    }
    const lingkaran = PILLARS.filter((p) => hy >= p.y0 && hy <= p.top);
    const out = new Array(o.n);
    for (let i = 0; i < o.n; i++) {
      const a = -Math.PI + (i * 2 * Math.PI) / o.n;
      const dx = Math.cos(a) * fx + Math.sin(a) * lx, dz = Math.cos(a) * fz + Math.sin(a) * lz;
      let t = o.max;
      for (const ob of obbs) t = Math.min(t, sinarObb(ox, oz, dx, dz, ob));
      for (const c of lingkaran) t = Math.min(t, sinarLingkaran(ox, oz, dx, dz, c));
      // lantai yang naik di atas berkas (tepi level, ramp, tangga)
      for (let s = o.min; s < t; s += LANGKAH) {
        if (heightAt(ox + dx * s, oz + dz * s) > hy) {
          let lo = s - LANGKAH, hi = s;
          for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (heightAt(ox + dx * m, oz + dz * m) > hy) hi = m; else lo = m; }
          t = hi;
          break;
        }
      }
      if (o.palsu && this.rand() < o.palsu) t = o.min + this.rand() * 0.5;           // pantulan palsu dekat
      else if (o.hilang && t < o.max && this.rand() < o.hilang) t = o.max;            // berkas hilang
      out[i] = t >= o.max || t < o.min ? null : Math.round((t + o.sigma * this.gauss()) * 1000) / 1000;
    }
    return out;
  }
}

// IMU: kecepatan sudut dan percepatan linear di kerangka robot (x maju, y kiri, z atas), dengan galat kecil.
export class Imu {
  constructor(robot, { seed = 31, buruk = false } = {}) {
    this.robot = robot;
    this.rand = prng(seed);
    this.prev = null;
    // buruk: derau 5x dan bias gyro yang bergeser pelan (drift yaw)
    this.k = buruk ? 5 : 1;
    this.bias = 0;
    this.buruk = buruk;
  }

  gauss() {
    const u = Math.max(1e-9, this.rand()), v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  baca(t) {
    const r = this.robot, maju = r.vz, kiri = r.vx;
    let ax = 0, ay = 0;
    if (this.prev && t > this.prev.t) {
      const dt = t - this.prev.t;
      // turunan kecepatan di kerangka berputar + percepatan sentripetal
      ax = (maju - this.prev.maju) / dt - r.w * kiri;
      ay = (kiri - this.prev.kiri) / dt + r.w * maju;
    }
    this.prev = { t, maju, kiri };
    const n = (s) => s * this.k * this.gauss();
    const r4 = (v) => Math.round(v * 10000) / 10000;
    if (this.buruk && this.prev) this.bias += 0.0004 * this.gauss();        // jalan acak bias gyro
    this.yawBias = (this.yawBias || 0) + (this.buruk ? this.bias * 0.05 : 0);
    return { yaw: r4(r.yaw + this.yawBias + n(0.002)), w: r4(r.w + this.bias + n(0.002)), ax: r4(ax + n(0.02)), ay: r4(ay + n(0.02)), az: r4(9.81 + n(0.02)) };
  }
}

// Odometri roda: kecepatan roda (perintah yang benar-benar diputar motor) diintegrasikan dengan galat skala
// tetap per robot (±2 % maju/geser, ±3 % putar) dan derau kecil, sehingga perkiraan pose menyimpang pelan
// (drift). Roda yang berputar saat robot tertahan (selip) tetap dihitung, sedangkan robot yang terdorong
// robot lain tidak terasa di roda. Kerangka odom = pose awal robot (jadi map -> odom mula-mula identitas).
export class Odom {
  constructor(robot, { seed = 41 } = {}) {
    this.robot = robot;
    this.rand = prng(seed);
    const g = () => { const u = Math.max(1e-9, this.rand()), v = this.rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    this.gauss = g;
    this.skala = { maju: 1 + 0.02 * g(), kiri: 1 + 0.02 * g(), w: 1 + 0.03 * g() };
    this.p = null;
    this.t = null;
  }

  // Dipanggil dengan jam simulasi; mengembalikan perkiraan { x, z, yaw } (kerangka simulator)
  baca(t) {
    const r = this.robot;
    if (!this.p) { this.p = { x: r.x, z: r.z, yaw: r.yaw }; this.t = t; return { ...this.p }; }
    const dt = t - this.t;
    this.t = t;
    if (dt > 0 && dt < 1) {
      const k = this.skala;
      const maju = r.vz * k.maju + 0.005 * this.gauss(), kiri = r.vx * k.kiri + 0.005 * this.gauss();
      const w = r.w * k.w + 0.004 * this.gauss();
      const ym = this.p.yaw + (w * dt) / 2;          // titik tengah
      // maju = (sin yaw, cos yaw), kiri = (cos yaw, -sin yaw) di bidang x-z simulator
      this.p.x += (maju * Math.sin(ym) + kiri * Math.cos(ym)) * dt;
      this.p.z += (maju * Math.cos(ym) - kiri * Math.sin(ym)) * dt;
      this.p.yaw += w * dt;
    }
    return { ...this.p };
  }

  reset() { this.p = null; }
}
