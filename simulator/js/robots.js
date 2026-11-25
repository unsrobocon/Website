import * as THREE from 'three';
import { profilOf } from './profiles.js';
import { heightAt, staticSupportAt, WALLS, PILLARS, regionAt, startRects, l1RetryRect } from './field.js';
import { obbOverlap2D, yOverlap, circleObbOverlap, rectToObb, obbCorners, localToWorld, worldToLocal, clamp, approach, rad } from './geom.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const WALL_OBBS = WALLS.map((w) => rectToObb(w, w.y0, w.y1));
const PILLAR_CIRCLES = PILLARS.map((p) => ({ x: p.x, z: p.z, r: p.r, y0: p.y0, y1: p.top }));

// Titik sampel tapak (lokal) untuk tinggi lantai & cek undakan
const SMOOTH_TOL = 0.07;  // m, sebaran sisa maksimum agar permukaan dianggap landai (ramp 0,17)

function code(o) {
  return (o.name || '').split('_')[0];
}

// Pindahkan anak-anak `parent` yang lolos `pred` ke dalam grup baru (mempertahankan transform dunia)
function regroup(parent, pred, position = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set(...position);
  parent.add(g);
  parent.updateMatrixWorld(true);
  for (const c of [...parent.children]) if (c !== g && pred(c)) g.attach(c);
  return g;
}

function nearest(arr, v) {
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[best] - v)) best = i;
  return best;
}

function findNode(root, re) {
  let out = null;
  root.traverse((o) => { if (!out && re.test(o.name)) out = o; });
  return out;
}

export class Robot {
  constructor(kind, team, ctx, profil) {
    this.kind = kind;             // 'TR' | 'BR'
    this.team = team;
    this.profil = profil && profil.G ? profil : profilOf(kind, profil);
    this.G = this.geom = this.profil.G;     // geometri rangka & mekanisme (m, lokal robot)
    this.P = this.profil.P;                 // parameter gerak
    this.ctx = ctx;               // { scene, objects, events, robots }
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    ctx.scene.add(this.group);
    this.x = 0; this.z = 0; this.yaw = 0;
    this.y = 0; this.pitch = 0; this.rollAng = 0;
    this.zone = kind === 'TR' ? 0 : 1;   // Start/Retry Zone pilihan tim (4.1.2): 0 zona tepi, 1 zona dalam
    this.startYaw = Math.PI;             // arah hadap di zona (diatur saat setup)
    this.retryHold = 0;                  // detik tersisa robot "diangkat" ke zona saat Retry
    this.plane = { a0: 0, gx: 0, gz: 0 };
    this.vx = 0; this.vz = 0; this.w = 0;
    this.frozen = false;
    this.enteredL1 = false;
    this.blocked = false;
    this.stopped = false;
    this.held = [];               // GameObj yang dipegang langsung
  }

  // Roda mecanum: buat poros putar di pusat tiap roda (sumbu = X lokal robot)
  rigWheels() {
    this.wheels = [];
    this.group.updateMatrixWorld(true);
    const inv = this.group.matrixWorld.clone().invert();
    const nodes = [];
    const isWheel = (n) => /^B0[12]_Roda_mecanum/.test(n.name);
    // hanya grup roda teratas (anak-anaknya memakai awalan nama yang sama)
    this.model.traverse((n) => { if (isWheel(n) && !(n.parent && isWheel(n.parent))) nodes.push(n); });
    for (const n of nodes) {
      const box = new THREE.Box3().setFromObject(n);
      const cw = box.getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      n.parent.add(pivot);
      pivot.position.copy(n.parent.worldToLocal(cw.clone()));
      pivot.updateMatrixWorld(true);
      pivot.attach(n);
      // sumbu X robot dinyatakan dalam kerangka induk poros
      const q = n.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(q).normalize();
      const c = cw.applyMatrix4(inv);
      this.wheels.push({ pivot, axis, lx: c.x, lz: c.z, r: Math.max(0.02, (box.max.y - box.min.y) / 2), angle: 0, mecanum: Math.sign(c.x * c.z) || 1 });
    }
  }

  // Putar roda sesuai gerak nyata robot (lvx, lvz = kecepatan lokal m/s, w = rad/s)
  spinWheels(dt, lvx, lvz, w) {
    if (!this.wheels) return;
    for (const wh of this.wheels) {
      const vx = lvx + w * wh.lz, vz = lvz - w * wh.lx;      // kecepatan titik roda
      const roll = this.wheelRoll(wh, vx, vz);
      if (!roll) continue;
      wh.angle = (wh.angle + (roll / wh.r) * dt) % (Math.PI * 2);
      wh.pivot.quaternion.setFromAxisAngle(wh.axis, wh.angle);
    }
  }

  // Kecepatan keliling roda mecanum (rol 45°): maju + komponen geser berlawanan tanda per diagonal
  wheelRoll(wh, vx, vz) { return vz - wh.mecanum * vx; }

  setModel(scene) {
    this.model = scene;
    this.group.add(scene);
    scene.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mt of mats) {
          if (mt.metalness !== undefined) mt.metalness = Math.min(mt.metalness, 0.35);
          if (mt.roughness !== undefined) mt.roughness = Math.max(mt.roughness, 0.45);
        }
      }
    });
    scene.updateMatrixWorld(true);
    this.rig();
    this.rigWheels();
    this.applyJoints();
  }

  // Penanda warna tim di atas robot (kedua tim memakai model yang sama)
  addTeamMarker() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.045, 0.18), new THREE.MeshStandardMaterial({ color: this.team === 'red' ? 0xdf2222 : 0x2a3fd6, roughness: 0.6 }));
    m.position.set(0, this.kind === 'TR' ? 0.24 : 0.2, this.kind === 'TR' ? -0.2 : -0.22);
    m.castShadow = true;
    this.group.add(m);
  }

  // ---- untuk diturunkan ----
  rig() {}
  applyJoints() {}
  bodyRects() { return []; }
  maxStep() { return 0.03; }
  stepXs() { return this.G.stepXs; }   // posisi lateral titik tumpu (roda / track)
  maxSpeed() { return 1; }
  maxRot() { return 2; }
  canStrafe() { return this.P.drive !== 'diferensial'; }
  dynamicShapesWorld() { return []; }
  mechShapesWorld() { return []; }
  updateActuators() {}
  postUpdate() {}
  telemetry() { return {}; }

  // ---- pose & lantai ----
  placeAt(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.vx = this.vz = this.w = 0;
    this.computeFloor();
    this.y = this.plane.a0;
    this.pitch = Math.atan(this.plane.gz);
    this.rollAng = Math.atan(this.plane.gx);
    this.syncGroup();
  }

  floorAt(px, pz, yaw) {
    let front = -Infinity, rear = -Infinity, left = -Infinity, right = -Infinity;
    const xs = this.stepXs();
    const STEP_ZS = this.G.stepZs;
    for (const lx of xs) for (const lz of STEP_ZS) {
      const [wx, wz] = localToWorld(px, pz, yaw, lx, lz);
      const h = heightAt(wx, wz);
      if (lz > 0.01) front = Math.max(front, h);
      if (lz < -0.01) rear = Math.max(rear, h);
      if (lx > 0) left = Math.max(left, h);
      if (lx < 0) right = Math.max(right, h);
    }
    const gz = (front - rear) / (1.5 * STEP_ZS[STEP_ZS.length - 1]);
    const gx = (left - right) / (2 * xs[xs.length - 1]);
    const top = Math.max(front, rear, left, right);
    return { a0: (front + rear) / 2 + (left + right) / 2 - top, gx, gz };
  }

  computeFloor() {
    this.plane = this.floorAt(this.x, this.z, this.yaw);
  }

  planeAt(lx, lz) {
    return this.plane.a0 + this.plane.gz * lz + this.plane.gx * lx;
  }

  syncGroup() {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.set(-this.pitch, this.yaw, this.rollAng);
    this.group.updateMatrixWorld(true);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  // ---- tabrakan ----
  bodyObbs(px, pz, yaw, floorY) {
    return this.bodyRects().map((r) => {
      const [wx, wz] = localToWorld(px, pz, yaw, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      return { cx: wx, cz: wz, hx: (r.x1 - r.x0) / 2, hz: (r.z1 - r.z0) / 2, a: yaw, y0: floorY + r.y0, y1: floorY + r.y1 };
    });
  }

  // Bentuk dinamis (end effector + benda dipegang) dalam koordinat lokal robot
  dynamicLocal() {
    return this.dynamicShapesWorld().map((s) => {
      const [lx, lz] = worldToLocal(this.x, this.z, this.yaw, s.cx, s.cz);
      return { lx, lz, da: s.a - this.yaw, hx: s.hx, hz: s.hz, y0: s.y0, y1: s.y1, terrain: s.terrain !== false };
    });
  }

  heldSet() {
    const set = new Set();
    for (const o of this.held) {
      set.add(o);
      o.mesh.traverse((m) => { if (m.userData.obj) set.add(m.userData.obj); });
    }
    return set;
  }

  gatherObstacles() {
    const R = 2.2;
    const obbs = [], circles = [];
    for (const w of WALL_OBBS) {
      if (Math.abs(w.cx - this.x) < w.hx + R && Math.abs(w.cz - this.z) < w.hz + R) obbs.push(w);
    }
    for (const c of PILLAR_CIRCLES) if (Math.hypot(c.x - this.x, c.z - this.z) < R) circles.push(c);
    const mine = this.heldSet();
    for (const o of this.ctx.objects.list) {
      if (o.state !== 'rest' || mine.has(o)) continue;
      const p = o.mesh.position;
      if (Math.abs(p.x - this.x) > R || Math.abs(p.z - this.z) > R) continue;
      obbs.push(Object.assign(o.obb(-0.002), { obj: o }));
    }
    for (const r of this.ctx.robots) {
      if (r === this) continue;
      if (Math.hypot(r.x - this.x, r.z - this.z) > 1.6) continue;
      for (const ob of r.bodyObbs(r.x, r.z, r.yaw, r.y)) obbs.push(Object.assign(ob, { robot: r }));
    }
    return { obbs, circles };
  }

  shapesAt(px, pz, yaw, dyn, withBody = true) {
    const out = withBody ? this.bodyObbs(px, pz, yaw, this.plane.a0) : [];
    for (const d of dyn) {
      const [wx, wz] = localToWorld(px, pz, yaw, d.lx, d.lz);
      out.push({ cx: wx, cz: wz, hx: d.hx, hz: d.hz, a: yaw + d.da, y0: d.y0, y1: d.y1, dyn: true, terrain: d.terrain });
    }
    return out;
  }

  // Tanpa `hits`: true bila ada tabrakan. Dengan `hits` (Set): kumpulkan semua rintangan yang kena.
  // `allowed` (Set): rintangan yang boleh diabaikan (sudah bersinggungan sebelum bergerak).
  collides(shapes, obst, allowed = null) {
    for (const s of shapes) {
      for (const o of obst.obbs) if (!allowed?.has(o) && yOverlap(s, o, 0.004) && obbOverlap2D(s, o, 0.001)) return true;
      for (const c of obst.circles) if (!allowed?.has(c) && circleObbOverlap({ ...c, y1: c.y1 - 0.004 }, s)) return true;
      if (s.dyn && s.terrain && !allowed?.has('terrain')) {
        // benda dipegang / cup tidak boleh menembus lantai
        // sudut penuh (bukan 90%): ujung rahang tidak boleh menembus dinding L1 lalu terbaca
        // "melewati batas ke Level 1" (6.1.1)
        const pts = [[0, 0], [-s.hx, -s.hz], [s.hx, -s.hz], [-s.hx, s.hz], [s.hx, s.hz], [0, -s.hz], [0, s.hz], [-s.hx, 0], [s.hx, 0]];
        const c = Math.cos(s.a), sn = Math.sin(s.a);
        for (const [lx, lz] of pts) {
          const x = s.cx + lx * c + lz * sn, z = s.cz - lx * sn + lz * c;
          if (staticSupportAt(x, z) > s.y0 + 0.004) return true;
        }
      }
    }
    return false;
  }

  // ---- dorongan ----
  // Coba pose calon. Sky yang bisa didorong (ObjectWorld.pushable) digeser searah gerak titik robot
  // di pusatnya, berantai sampai 3 tingkat. Mengembalikan Map benda -> { x, z, ob } (kosong bila
  // tidak ada yang terdorong) atau null bila terhalang dinding, pilar, Earth, robot, atau undakan.
  // robots = true: satu robot lain yang tertabrak ikut terdorong (hasil di pushes.robot)
  tryMove(px, pz, yaw, dyn, obst, stuck, robots = false) {
    const shapes = this.shapesAt(px, pz, yaw, dyn);
    if (!this.collides(shapes, obst, stuck)) return new Map();
    // pilar dan lantai (benda dipegang / cup) tidak bisa didorong
    if (this.collides(shapes, { obbs: [], circles: obst.circles }, stuck)) return null;
    const hits = obst.obbs.filter((o) => !stuck?.has(o) && this.collides(shapes, { obbs: [o], circles: [] }));
    const objs = this.ctx.objects;
    const others = new Set(hits.filter((h) => h.robot).map((h) => h.robot));
    if (others.size > (robots ? 1 : 0)) return null;
    if (!hits.every((h) => h.robot || (h.obj && objs.pushable(h.obj)))) return null;
    const pushes = new Map();
    for (const h of hits) {
      if (h.obj && !pushes.has(h.obj) && !this.pushObj(h.obj, null, px, pz, yaw, shapes, obst, pushes, 0, null)) return null;
    }
    if (others.size) {
      pushes.robot = this.planShove([...others][0], px, pz, yaw, shapes);
      if (!pushes.robot) return null;
    }
    return pushes;
  }

  // Robot B didorong searah gerak titik robot ini di pusat B, sejauh perlu agar lepas dari bentuk
  // robot ini pada pose calon. B memeriksa lantai dan rintangannya sendiri (boleh mendorong Sky,
  // tidak boleh mendorong robot lain). Mengembalikan { r, x, z, pushes } atau null.
  planShove(B, px, pz, yaw, shapes) {
    const [lx, lz] = worldToLocal(this.x, this.z, this.yaw, B.x, B.z);
    const [nx, nz] = localToWorld(px, pz, yaw, lx, lz);
    let dx = nx - B.x, dz = nz - B.z, n = Math.hypot(dx, dz);
    if (n < 1e-6) { dx = px - this.x; dz = pz - this.z; n = Math.hypot(dx, dz); }
    if (n < 1e-6) return null;
    const dir = [dx / n, dz / n], dynB = B.dynamicLocal();
    const clear = (s) => !this.collides(shapes, { obbs: B.shapesAt(B.x + dir[0] * s, B.z + dir[1] * s, B.yaw, dynB), circles: [] });
    let hi = 0.01;
    while (!clear(hi)) { hi *= 2; if (hi > 0.1) return null; }
    let lo = 0;
    for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (clear(m)) hi = m; else lo = m; }
    const bx = B.x + dir[0] * (hi + 0.0005), bz = B.z + dir[1] * (hi + 0.0005);
    if (!B.terrainOk(bx, bz, B.yaw)) return null;
    const ob = B.gatherObstacles();
    const obstB = { obbs: ob.obbs.filter((w) => w.robot !== this), circles: ob.circles };
    const pushes = B.tryMove(bx, bz, B.yaw, dynB, obstB, null, false);
    return pushes ? { r: B, x: bx, z: bz, pushes } : null;
  }

  // Pindahkan robot yang terdorong; rintangan yang sudah dikumpulkan ikut diperbarui
  applyShove(sh, obst, done) {
    const B = sh.r;
    this.applyPushes(sh.pushes, { obbs: [] }, done);
    B.x = sh.x; B.z = sh.z;
    B.computeFloor();
    B.syncGroup();
    obst.obbs = obst.obbs.filter((w) => w.robot !== B);
    for (const ob of B.bodyObbs(B.x, B.z, B.yaw, B.y)) obst.obbs.push(Object.assign(ob, { robot: B }));
  }

  // Geser benda o sejauh perlu agar lepas dari robot pada pose calon (from = null) atau dari benda
  // pendorong `from` pada rantai, searah `dir`. Hasil dicatat di `pushes`.
  pushObj(o, dir, px, pz, yaw, shapes, obst, pushes, depth, from) {
    if (depth > 3) return false;
    const base = o.obb(-0.002);
    if (!dir) {
      const [lx, lz] = worldToLocal(this.x, this.z, this.yaw, base.cx, base.cz);
      const [nx, nz] = localToWorld(px, pz, yaw, lx, lz);
      let dx = nx - base.cx, dz = nz - base.cz, n = Math.hypot(dx, dz);
      if (n < 1e-6) { dx = px - this.x; dz = pz - this.z; n = Math.hypot(dx, dz); }
      if (n < 1e-6) return false;
      dir = [dx / n, dz / n];
    }
    const at = (s) => ({ ...base, cx: base.cx + dir[0] * s, cz: base.cz + dir[1] * s });
    const hit = (a, b) => yOverlap(a, b, 0.004) && obbOverlap2D(a, b, 0.001);
    const clear = (ob) => (from ? !hit(ob, from) : !this.collides(shapes, { obbs: [ob], circles: [] }));
    let hi = 0.01;
    while (!clear(at(hi))) { hi *= 2; if (hi > 0.16) return false; }
    let lo = 0;
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (clear(at(m))) hi = m; else lo = m; }
    const nob = at(hi + 0.0005);
    if (from && this.collides(shapes, { obbs: [nob], circles: [] })) return false;
    // tidak naik undakan / barrier dan tidak menembus pilar
    for (const [cx, cz] of [...obbCorners(nob), [nob.cx, nob.cz]]) if (staticSupportAt(cx, cz) > base.y0 + 0.005) return false;
    for (const c of obst.circles) if (circleObbOverlap({ ...c, y1: c.y1 - 0.004 }, nob)) return false;
    pushes.set(o, { x: o.mesh.position.x + nob.cx - base.cx, z: o.mesh.position.z + nob.cz - base.cz, ob: nob });
    for (const w of obst.obbs) {
      if (w.obj === o || !hit(nob, w)) continue;
      const other = w.obj;
      if (!other || !this.ctx.objects.pushable(other)) return false;
      if (pushes.has(other)) { if (hit(nob, pushes.get(other).ob)) return false; continue; }
      if (!this.pushObj(other, dir, px, pz, yaw, shapes, obst, pushes, depth + 1, nob)) return false;
    }
    return true;
  }

  // Terapkan dorongan hasil tryMove; rintangan yang sudah dikumpulkan ikut diperbarui
  applyPushes(pushes, obst, done) {
    for (const [o, p] of pushes) {
      o.mesh.position.x = p.x;
      o.mesh.position.z = p.z;
      o.mesh.updateMatrixWorld(true);
      const e = obst.obbs.find((w) => w.obj === o);
      if (e) { e.cx = p.ob.cx; e.cz = p.ob.cz; }
      done.add(o);
    }
  }

  // Rintangan yang sedang bersinggungan dengan `shapes`
  touching(shapes, obst) {
    const set = new Set();
    for (const o of obst.obbs) if (this.collides(shapes, { obbs: [o], circles: [] })) set.add(o);
    for (const c of obst.circles) if (this.collides(shapes, { obbs: [], circles: [c] })) set.add(c);
    if (this.collides(shapes.filter((s) => s.dyn && s.terrain), { obbs: [], circles: [] })) set.add('terrain');
    return set;
  }

  // Apakah lantai di bawah tapak pada pose calon bisa dilalui. Lolos bila salah satu terpenuhi:
  //  1. semua titik tumpu dalam batas undakan terhadap bidang tumpu saat ini (perilaku asli),
  //  2. sama, terhadap bidang tumpu pada pose calon — tanpa ini robot tertahan di puncak ramp
  //     bila langkah per frame besar (kecepatan penuh),
  //  3. permukaannya landai: sebaran sisa terhadap bidang kuadrat-terkecil <= SMOOTH_TOL —
  //     tanpa ini robot tersangkut saat menyamping / berputar di kaki dan puncak ramp,
  //  4. mode track: tiap undakan di antara titik tumpu bertetangga <= maxStep() — tanpa ini BR
  //     hanya bisa menaiki tangga / L2 bila arahnya lurus sempurna.
  // Tepi level yang lebih tinggi dari maxStep() (tangga 150, L2 300, tepi L1 600 mm) tetap menahan.
  terrainOk(px, pz, yaw) {
    const step = this.maxStep() + 1e-6;
    const next = this.floorAt(px, pz, yaw);
    const STEP_ZS = this.G.stepZs;
    const xs = this.stepXs(), nx = xs.length, nz = STEP_ZS.length;
    let okNow = true, okNext = true;
    const hs = [];
    let sum = 0, sx = 0, sz = 0;
    for (const lx of xs) for (const lz of STEP_ZS) {
      const [wx, wz] = localToWorld(px, pz, yaw, lx, lz);
      const h = heightAt(wx, wz);
      hs.push(h); sum += h; sx += lx * h; sz += lz * h;
      if (Math.abs(h - this.planeAt(lx, lz)) > step) okNow = false;
      if (Math.abs(h - (next.a0 + next.gz * lz + next.gx * lx)) > step) okNext = false;
    }
    // Sudut rangka berada di luar titik tumpu: lantai di bawahnya tidak boleh lebih tinggi dari
    // titik tumpu terdekat melebihi undakan. Tanpa ini rangka menembus dinding L1/L2 ±15 mm dan
    // tapaknya terbaca masuk area terlarang (6.1.1).
    // Titik uji ditarik 3 mm ke dalam: uji tabrakan mengizinkan singgungan 1 mm dengan dinding,
    // dan sudut yang tepat di garis tepi L1 tidak boleh mengunci robot.
    const IN = 0.003;
    for (const r of this.bodyRects()) for (const [lx, lz] of [[r.x0 + IN, r.z0 + IN], [r.x1 - IN, r.z0 + IN], [r.x0 + IN, r.z1 - IN], [r.x1 - IN, r.z1 - IN]]) {
      const [wx, wz] = localToWorld(px, pz, yaw, lx, lz);
      const i = nearest(xs, lx), j = nearest(STEP_ZS, lz);
      if (heightAt(wx, wz) - hs[i * nz + j] > step) return false;
    }
    if (okNow || okNext) return true;
    // bidang kuadrat-terkecil (kisi sampel simetris -> dapat dipisah per sumbu)
    const a0 = sum / hs.length, gx = sx / (nz * xs.reduce((a, v) => a + v * v, 0)), gz = sz / (nx * STEP_ZS.reduce((a, v) => a + v * v, 0));
    let lo = Infinity, hi = -Infinity, k = 0;
    for (const lx of xs) for (const lz of STEP_ZS) {
      const r = hs[k++] - (a0 + gx * lx + gz * lz);
      lo = Math.min(lo, r); hi = Math.max(hi, r);
    }
    if (hi - lo <= SMOOTH_TOL) return true;
    if (step < 0.1) return false;      // roda mecanum tidak menaiki undakan
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const h = hs[i * nz + j];
      if (i + 1 < nx && Math.abs(hs[(i + 1) * nz + j] - h) > step) return false;
      if (j + 1 < nz && Math.abs(hs[i * nz + j + 1] - h) > step) return false;
    }
    return true;
  }

  // Jumlah titik tumpu / sudut rangka yang tidak sebidang dengan lantai di bawah pusat robot
  terrainMisfit(px, pz, yaw) {
    const step = this.maxStep() + 1e-6, hc = heightAt(px, pz);
    let n = 0, cx = 0, cz = 0;
    const test = (lx, lz) => { const [wx, wz] = localToWorld(px, pz, yaw, lx, lz); if (Math.abs(heightAt(wx, wz) - hc) > step) { n++; cx += wx - px; cz += wz - pz; } };
    for (const lx of this.stepXs()) for (const lz of this.G.stepZs) test(lx, lz);
    for (const r of this.bodyRects()) for (const [lx, lz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) test(lx, lz);
    return { n, hc, cx, cz };   // cx, cz: arah ke bagian yang menggantung
  }

  // Uji gerak aktuator: kembalikan true bila gerak menimbulkan tabrakan baru
  actuatorBlockedAfter(before) {
    this.group.updateMatrixWorld(true);
    const obst = this.gatherObstacles();
    const dyn = this.dynamicLocal();
    const now = this.collides(this.shapesAt(this.x, this.z, this.yaw, dyn, false), obst);
    return !before && now;
  }

  actuatorState() {
    this.group.updateMatrixWorld(true);
    const obst = this.gatherObstacles();
    return this.collides(this.shapesAt(this.x, this.z, this.yaw, this.dynamicLocal(), false), obst);
  }

  // Baterai melemah (kalibrasi "Penurunan baterai", % pada akhir 3 menit): kecepatan gerak dan sendi turun
  // sebanding waktu pertandingan yang sudah berjalan
  baterai() {
    const turun = this.P.baterai || 0;
    if (!turun || !this.ctx.berjalan) return 1;
    return 1 - (turun / 100) * Math.min(1, Math.max(0, this.ctx.berjalan()) / 180);
  }

  drive(dt, cmd) {
    const slow = (cmd.slow ? 0.3 : 1) * this.baterai();
    const vmax = this.maxSpeed() * slow;
    const wmax = this.maxRot() * slow;
    const tvz = cmd.f * vmax;
    const tvx = this.canStrafe() ? -cmd.s * vmax : 0;
    const tw = cmd.r * wmax;
    // percepatan dari profil (kalibrasi robot asli), bawaan 3,5 m/s²; percepatan sudut ikut sebanding
    const a = this.P.acc ?? 3.5, acc = a * dt, wacc = 8 * (a / 3.5) * dt;
    this.vz = approach(this.vz, tvz, acc);
    this.vx = approach(this.vx, tvx, acc);
    this.w = approach(this.w, tw, wacc);
    if (Math.abs(this.vx) < 1e-4 && Math.abs(this.vz) < 1e-4 && Math.abs(this.w) < 1e-4) { this.blocked = false; return; }

    const obst = this.gatherObstacles();
    const dyn = this.dynamicLocal();
    // Bila robot sudah bersinggungan sebelum bergerak (mis. benda mendarat di dekatnya), ia boleh
    // melepaskan diri dari rintangan ITU saja — bukan menembus rintangan lain seperti dinding.
    const start = this.shapesAt(this.x, this.z, this.yaw, dyn);
    const stuck = this.collides(start, obst) ? this.touching(start, obst) : null;
    // Pose saat ini sendiri sudah tidak sah (track dinaikkan / flipper dilipat saat robot menggantung
    // di tepi level): izinkan gerak yang tidak menambah bagian yang menggantung, agar robot bisa
    // mundur ke lantai yang rata dan tidak terkunci.
    const misfit = this.terrainOk(this.x, this.z, this.yaw) ? null : this.terrainMisfit(this.x, this.z, this.yaw);
    const floorOk = (px, pz, yaw) => {
      if (this.terrainOk(px, pz, yaw)) return true;
      if (!misfit) return false;
      const m = this.terrainMisfit(px, pz, yaw);
      // hanya boleh menjauh dari sisi yang menggantung
      return m.n <= misfit.n && Math.abs(m.hc - misfit.hc) <= 0.03 &&
        (px - this.x) * misfit.cx + (pz - this.z) * misfit.cz <= 1e-9;
    };
    // Pose sah bila lantainya bisa dilalui dan tabrakannya hanya dengan Sky yang bisa didorong atau
    // satu robot lain. Bila sah, robot dipindah ke sana. Mendorong robot lain: gerak tinggal
    // setengah (hambatan roda robot itu). cmd.noPush: pengemudi berhati-hati (autopilot) berhenti
    // saat menyentuh Sky atau robot lain, tidak mendorongnya.
    const pushed = new Set();
    const shoved = new Set();
    const go = (px, pz, yaw) => {
      if (!floorOk(px, pz, yaw)) return false;
      if (cmd.noPush) {
        if (this.collides(this.shapesAt(px, pz, yaw, dyn), obst, stuck)) return false;
      } else {
        let res = this.tryMove(px, pz, yaw, dyn, obst, stuck, true);
        if (!res) return false;
        if (res.robot) {
          px = this.x + (px - this.x) / 2; pz = this.z + (pz - this.z) / 2; yaw = this.yaw + (yaw - this.yaw) / 2;
          if (!floorOk(px, pz, yaw)) return false;
          res = this.tryMove(px, pz, yaw, dyn, obst, stuck, true);
          if (!res) return false;
        }
        this.applyPushes(res, obst, pushed);
        if (res.robot) { this.applyShove(res.robot, obst, pushed); shoved.add(res.robot.r); }
      }
      this.x = px; this.z = pz; this.yaw = yaw;
      return true;
    };
    const speed = Math.hypot(this.vx, this.vz);
    const want = (() => {
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw), dxl = this.vx * dt, dzl = this.vz * dt;
      return [this.x + dxl * c + dzl * s, this.z - dxl * s + dzl * c, this.yaw + this.w * dt];
    })();
    try {
      this.moveWith(go, dt);
      // 6.6: menabrak blok yang diam cukup keras dicatat (Rules memeriksa apakah blok itu bagian menara)
      if (this.blocked && speed > 0.4) {
        const body = this.shapesAt(want[0], want[1], want[2], dyn);
        const hits = obst.obbs.filter((w) => w.obj && !stuck?.has(w) && this.collides(body, { obbs: [w], circles: [] }));
        if (hits.length) {
          const byHeld = hits.some((w) => this.collides(body.filter((sh) => sh.dyn), { obbs: [w], circles: [] }));
          this.ctx.events.emit('bump', { robot: this, objs: hits.map((w) => w.obj), byHeld, speed });
        }
      }
    } finally {
      for (const o of pushed) this.ctx.events.emit('pushed', { obj: o, robot: this });
      for (const r of shoved) this.ctx.events.emit('contact', { by: this, to: r });
    }
  }

  // Gerak satu langkah: utuh, lalu per komponen (meluncur di dinding), lalu arah dibelokkan.
  // ok(px, pz, yaw) memeriksa pose dan, bila sah, memindahkan robot ke sana.
  moveWith(ok, dt) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const dxl = this.vx * dt, dzl = this.vz * dt;
    const dx = dxl * c + dzl * s, dz = -dxl * s + dzl * c;
    const dyaw = this.w * dt;
    this.blocked = false;
    if (ok(this.x + dx, this.z + dz, this.yaw + dyaw)) return;
    this.blocked = true;
    // Coba komponen terpisah (meluncur di sepanjang dinding)
    if (!(dyaw !== 0 && ok(this.x, this.z, this.yaw + dyaw))) this.w = 0;
    let moved = false;
    if (dx !== 0 && ok(this.x + dx, this.z, this.yaw)) moved = true;
    if (dz !== 0 && ok(this.x, this.z + dz, this.yaw)) moved = true;
    if (!moved) {
      // Robot yang sedikit miring terjepit di ujung dinding: coba arah yang dibelokkan sedikit,
      // sehingga ia meluncur menjauh alih-alih terkunci sampai operator menggeser ke arah lain.
      outer: for (const [bx, bz] of [[dx, dz], [0, dz], [dx, 0]]) {
        if (!bx && !bz) continue;
        for (const a of [0.2, -0.2, 0.5, -0.5]) {
          const ca = Math.cos(a), sa = Math.sin(a);
          const mx = bx * ca - bz * sa, mz = bx * sa + bz * ca;
          if (ok(this.x + mx, this.z + mz, this.yaw)) { moved = true; break outer; }
        }
      }
    }
    if (!moved) { this.vx *= 0.3; this.vz *= 0.3; }
  }

  update(dt, cmd) {
    const x0 = this.x, z0 = this.z, yaw0 = this.yaw;
    if (this.retryHold > 0) this.retryHold = Math.max(0, this.retryHold - dt);
    if (this.frozen || this.stopped || this.retryHold > 0 || this.ctx.locked) {
      // Freeze (11.4) / akhir pertandingan (4.6.1): semua aktuator dan penggerak berhenti seketika.
      // Preset yang sedang berjalan disimpan dan dilanjutkan saat Resume.
      this.vx = this.vz = this.w = 0;
      this.blocked = false;
    } else {
      this.updateActuators(dt, cmd);
      this.drive(dt, cmd);
    }
    this.computeFloor();
    // penghalusan visual tinggi & kemiringan
    const target = this.plane.a0;
    this.y = approach(this.y, target, Math.max(1.2, Math.abs(target - this.y) * 6) * dt);
    this.pitch += (Math.atan(this.plane.gz) - this.pitch) * Math.min(1, dt * 10);
    this.rollAng += (Math.atan(this.plane.gx) - this.rollAng) * Math.min(1, dt * 10);
    this.syncGroup();
    if (dt > 0) {
      const dx = this.x - x0, dz = this.z - z0, c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
      this.spinWheels(dt, (dx * c - dz * sn) / dt, (dx * sn + dz * c) / dt, (this.yaw - yaw0) / dt);
    }
    // 5.3.1: L1 Retry Zone hanya boleh dipakai bila BR pernah SEPENUHNYA masuk L1
    if (!this.enteredL1 && this.bodyCorners().every(([x, z]) => ['L1', 'L2'].includes(regionAt(x, z).name))) this.enteredL1 = true;
    this.postUpdate(dt, cmd);
  }

  region() {
    return regionAt(this.x, this.z);
  }

  // Sudut-sudut rangka (tanpa mekanisme)
  bodyCorners() {
    const out = [];
    for (const r of this.bodyRects()) for (const [lx, lz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
      out.push(localToWorld(this.x, this.z, this.yaw, lx, lz));
    }
    return out;
  }

  // Tapak proyeksi vertikal seluruh robot termasuk mekanisme (4.3.3, 6.1.1).
  // Benda yang dipegang bukan bagian robot, jadi tidak dihitung.
  footprintCorners() {
    const out = this.bodyCorners();
    for (const s of this.mechShapesWorld()) out.push(...obbCorners(s));
    return out;
  }

  carriedBlocks() {
    let n = 0;
    for (const o of this.held) n += this.ctx.objects.stackCount(o);
    return n;
  }

  hasBall() {
    return this.held.some((o) => o.kind === 'ball');
  }

  // Benda yang boleh diambil: diam, dipegang robot lain (serah terima), atau menumpang di atas
  // tumpukan yang dibawa robot lain. Mustika yang sudah diabadikan tidak boleh diambil lagi (3.6.8).
  canTake(o) {
    if (o.enshrined) return false;
    // benda yang sedang dipegang / dibawa robot tim lain tidak boleh direbut
    const root = (x) => { while (x.carrier) x = x.carrier; return x; };
    if ((o.state === 'held' || o.state === 'ride') && root(o).holders.some((h) => h.robot.team !== this.team)) return false;
    if (o.state === 'rest' || o.state === 'ride') return true;
    return o.state === 'held' && !o.holders.some((h) => h.robot === this);
  }

  forgetObject(o) {
    this.held = this.held.filter((h) => h !== o);
  }

  releaseAll() {
    for (const o of [...this.held]) {
      this.ctx.objects.release(o, this);
    }
    this.held = [];
  }

  retry(toL1 = false) {
    // Pasal 5.3: blok yang dipegang boleh dipertahankan; Mustika dikeluarkan
    for (const o of [...this.held]) if (o.kind === 'ball') this.ctx.objects.remove(o, 'retry saat membawa Mustika');
    this.held = this.held.filter((o) => o.state === 'held');
    if (toL1 && this.kind === 'BR' && this.enteredL1) {
      const r = l1RetryRect(this.team);
      this.placeAt((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0);
    } else {
      this.placeAt(...this.startPose());
    }
    this.resetActuators?.();
    // Retry tidak instan: robot diangkat dan dibawa ke zona oleh anggota tim (waktu dari menu)
    this.retryHold = this.ctx.retryTime || 0;
    this.sejakRetry = true;     // 4.3.2: setelah Retry BR boleh melintasi Ground Area menuju L1
  }

  startPose() {
    const zones = startRects(this.team);
    // bawaan: TR di zona tepi, BR di zona dalam (lebih dekat tangga); bisa ditukar saat setup
    const r = zones[this.zone];
    return [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, this.startYaw];
  }
}

const ZERO_CMD = { f: 0, s: 0, r: 0, lift: 0, aux: 0, roll: 0, flip: 0, slow: false };

// =====================================================================
// Builder Robot R1: lift 2 tingkat, boom, wrist roll, vakum 3 cup, track, flipper
// =====================================================================
export class BuilderRobot extends Robot {
  constructor(team, ctx, profil) {
    super('BR', team, ctx, profil);
    const P = this.P;
    this.h = P.h.start; this.e = P.e.start; this.roll = P.roll.start; this.flip = P.flip.start;
    this.track = 0; this.trackTarget = 0;
    this.vacuum = false;
    this.preset = null;
  }

  resetActuators() {
    const P = this.P;
    this.preset = { h: P.h.start, e: P.e.start, roll: 0 };
  }

  rig() {
    const m = this.model;
    // robot kotak (js/boxmodel.js): sambungan sudah disiapkan oleh pembangun model
    if (m.userData.box) {
      this.J = m.userData.box;
      this.effector = this.J.effector;
      this.effectorNormal = this.J.effectorNormal;
      this.camNode = this.J.camNode;
      this.trackRollers = this.J.rollers;
      return;
    }
    this.nE = findNode(m, /^E_Tiang/);
    this.nF = findNode(m, /^F_Carriage/);
    this.nG = findNode(m, /^G_Pergelangan/);
    this.nC = [findNode(m, /^C1_Track/), findNode(m, /^C2_Track/)];
    this.nK = [findNode(m, /^K1_Flipper/), findNode(m, /^K2_Flipper/)];
    this.e0 = this.nE.position.z;
    this.f0 = this.nF.position.z;
    this.c0 = this.nC.map((n) => n.position.z);
    // boom: lengan teleskopik dalam, pelat ujung, mur boom + seluruh pergelangan
    this.boom = regroup(this.nF, (c) => ['F03', 'F07', 'F10'].includes(code(c)));
    this.boom.attach(this.nG);
    // wrist roll terhadap sumbu Y CAD melalui pusat cup (z 0.335)
    this.wrist = regroup(this.nG, (c) => ['G04', 'G05', 'G06', 'G07', 'H01'].includes(code(c)), [0, 0, 0.335]);
    this.effector = new THREE.Object3D();
    this.effector.position.set(0, -0.322, 0);
    this.wrist.add(this.effector);
    this.effectorNormal = new THREE.Vector3(0, -1, 0);      // arah hadap cup dalam kerangka effector (CAD)
    // flipper: pivot di (x, -0.285, 0.215), berputar terhadap sumbu X CAD
    this.flippers = this.nK.map((k) => regroup(k, (c) => ['K01', 'K02', 'K03', 'K04'].includes(code(c)), [0, -0.285, 0.215]));
    // rol & sproket track (berputar saat mode tangga)
    this.trackRollers = [];
    m.traverse((n) => { if (/^C0[34]_/.test(n.name) && n.isMesh) this.trackRollers.push(n); });
    // titik kamera depan (J07)
    const cam = findNode(m, /^J07/);
    this.camNode = cam;
  }

  liftStages() {
    const P = this.P;
    const c = clamp(this.h - P.h.min, 0, P.stage1);          // carriage pada tiang bergerak
    const mm = clamp(this.h - P.h.min - P.stage1, 0, P.stage2); // tiang bergerak pada tiang tetap
    return { c, m: mm };
  }

  chassisRise() {
    return Math.max(0, this.P.trackDrop * this.track - 0.018);
  }

  applyJoints() {
    if (this.J) { this.J.apply(this); this.model.position.y = this.chassisRise(); return; }
    if (!this.nE) return;
    const { c, m } = this.liftStages();
    this.nE.position.z = this.e0 + m / 1000;
    this.nF.position.z = this.f0 + (m + c - 240) / 1000;
    this.boom.position.y = -this.e / 1000;
    this.wrist.rotation.y = rad(this.roll);
    this.nC.forEach((n, i) => { n.position.z = this.c0[i] - this.P.trackDrop * this.track; });
    for (const f of this.flippers) f.rotation.x = rad(this.flip);
    this.model.position.y = this.chassisRise();
  }

  bodyRects() {
    const rise = this.chassisRise();
    const { m } = this.liftStages();
    // Mode track: rangka + roda terangkat `rise` (64 mm) dan hanya dua track yang menyentuh lantai,
    // sehingga rangka bisa berada di atas barrier 50 mm (L1 Perimeter Barrier, Center Divider).
    const G = this.G;
    const out = [{ x0: -G.hw, x1: G.hw, z0: G.zr, z1: G.zf, y0: 0.02 + rise, y1: G.bodyH + rise + m / 1000 }];
    if (rise > 0.004) {
      out.push({ x0: -G.trackOut, x1: -G.trackIn, z0: G.trackZ0, z1: G.zf, y0: 0.02, y1: 0.02 + rise });
      out.push({ x0: G.trackIn, x1: G.trackOut, z0: G.trackZ0, z1: G.zf, y0: 0.02, y1: 0.02 + rise });
    }
    return out;
  }

  stepXs() { return this.track > 0.5 ? this.G.trackXs : this.G.stepXs; }

  // Poros rol / sproket track, dibuat setelah rigWheels() agar kerangka robot sudah diketahui
  rigWheels() {
    super.rigWheels();
    this.rollers = [];
    const inv = this.group.matrixWorld.clone().invert();
    for (const n of this.trackRollers || []) {
      const box = new THREE.Box3().setFromObject(n);
      const cw = box.getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      n.parent.add(pivot);
      pivot.position.copy(n.parent.worldToLocal(cw.clone()));
      pivot.updateMatrixWorld(true);
      pivot.attach(n);
      const q = n.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(q).normalize();
      this.rollers.push({ pivot, axis, lx: cw.applyMatrix4(inv).x, r: Math.max(0.015, (box.max.y - box.min.y) / 2), angle: 0 });
    }
  }

  // Mode mecanum: roda berputar, track diam. Mode tangga: roda terangkat (diam), rol track berputar.
  spinWheels(dt, lvx, lvz, w) {
    if (this.track < 0.5) { super.spinWheels(dt, lvx, lvz, w); return; }
    for (const ro of this.rollers || []) {
      const v = lvz - w * ro.lx;
      if (!v) continue;
      ro.angle = (ro.angle + (v / ro.r) * dt) % (Math.PI * 2);
      ro.pivot.quaternion.setFromAxisAngle(ro.axis, ro.angle);
    }
  }

  maxStep() {
    if (this.track > 0.97) return this.flip >= 140 ? 0.32 : 0.16;
    return 0.03;
  }

  maxSpeed() {
    if (this.track > 0.5) return Math.abs(this.plane.gz) > 0.25 ? this.P.speedClimb : this.P.speedTrack;
    return this.P.speed;
  }

  maxRot() { return this.track > 0.5 ? 1.0 : this.P.rot; }
  canStrafe() { return this.track < 0.05 && this.P.drive !== 'diferensial'; }

  effectorWorld() {
    const p = this.effector.getWorldPosition(new THREE.Vector3());
    const n = this.effectorNormal.clone().transformDirection(this.effector.matrixWorld);
    return { p, n };
  }

  mechShapesWorld() {
    if (!this.effector) return [];
    const { p, n } = this.effectorWorld();
    // pelat 3 cup + hub: ~172 x 50 mm, di belakang muka cup
    const G = this.G;
    const c = p.clone().addScaledVector(n, -G.cupHz);
    return [{ cx: c.x, cz: c.z, hx: G.cupHx, hz: G.cupHz, a: this.yaw, y0: p.y - G.cupHy, y1: p.y + G.cupHy }];
  }

  dynamicShapesWorld() {
    const out = this.mechShapesWorld();
    for (const o of this.heldSet()) {
      const b = o.aabb();
      out.push({ cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2, hx: (b.max.x - b.min.x) / 2 - 0.004, hz: (b.max.z - b.min.z) / 2 - 0.004, a: 0, y0: b.min.y, y1: b.max.y });
    }
    return out;
  }

  updateActuators(dt, cmd) {
    const P = this.P;
    const slow = (cmd.slow ? 0.35 : 1) * this.baterai();
    // preset (tombol angka) menggerakkan aktuator ke target
    let dh = cmd.lift * P.h.speed * slow * dt;
    let de = cmd.aux * P.e.speed * slow * dt;
    let dr = cmd.roll * P.roll.speed * slow * dt;
    if (this.preset) {
      if (cmd.lift || cmd.aux || cmd.roll) this.preset = null;
      else {
        const pr = this.preset;
        if (pr.h !== undefined) dh = clamp(pr.h - this.h, -P.h.speed * dt, P.h.speed * dt);
        if (pr.e !== undefined) de = clamp(pr.e - this.e, -P.e.speed * dt, P.e.speed * dt);
        if (pr.roll !== undefined) dr = clamp(pr.roll - this.roll, -P.roll.speed * dt, P.roll.speed * dt);
        if (Math.abs(dh) < 1e-3 && Math.abs(de) < 1e-3 && Math.abs(dr) < 1e-3) this.preset = null;
      }
    }
    const before = (dh || de || dr) ? this.actuatorState() : false;
    const tryJoint = (key, delta, lo, hi) => {
      if (!delta) return;
      const old = this[key];
      this[key] = clamp(old + delta, lo, hi);
      if (this[key] === old) return;
      this.applyJoints();
      if (this.actuatorBlockedAfter(before)) {
        this[key] = old;
        this.applyJoints();
        if (this.preset) this.preset = null;
      }
    };
    tryJoint('h', dh, P.h.min, P.h.max);
    tryJoint('e', de, P.e.min, P.e.max);
    tryJoint('roll', dr, P.roll.min, P.roll.max);
    this.flip = clamp(this.flip + cmd.flip * P.flip.speed * slow * dt, P.flip.min, P.flip.max);
    this.track = approach(this.track, this.trackTarget, dt / 0.9);
    this.applyJoints();
  }

  toggleTrack() {
    if (this.frozen || this.stopped) return;
    this.trackTarget = this.trackTarget > 0.5 ? 0 : 1;
  }

  toggleGrip() {
    if (this.frozen || this.stopped) return;
    this.vacuum = !this.vacuum;
    if (!this.vacuum) this.releaseAll();
  }

  setPreset(i) {
    if (this.frozen || this.stopped) return;
    // 1 awal · 2 Earth di lantai · 3 Earth tingkat 2 · 4 mode tangga · 5 Sky di lantai · 6 Sky di menara
    const P = this.P.preset[i - 1];
    if (!P) return;
    const { track, ...joints } = P;
    this.preset = joints;
    if (track) this.trackTarget = 1;
  }

  // Cari benda yang bersentuhan dengan muka cup
  findContact() {
    const { p, n } = this.effectorWorld();
    let best = null, bestD = Infinity;
    const objs = this.ctx.objects;
    for (const o of objs.list) {
      if (!this.canTake(o)) continue;
      const c = o.worldPos(_v);
      if (c.distanceToSquared(p) > 0.5) continue;
      if (o.kind === 'ball') {
        const d = c.distanceTo(p) - o.half;
        const dir = _v2.copy(c).sub(p).normalize();
        if (d > -0.035 && d < 0.035 && dir.dot(n) > 0.8 && d < bestD) { best = o; bestD = d; }
        continue;
      }
      const lp = o.mesh.worldToLocal(p.clone());
      const arr = [lp.x, lp.y, lp.z];
      for (let i = 0; i < 3; i++) {
        const gap = Math.abs(arr[i]) - o.half;
        if (gap < -0.03 || gap > 0.035) continue;
        const j = (i + 1) % 3, k = (i + 2) % 3;
        if (Math.abs(arr[j]) > o.half - 0.03 || Math.abs(arr[k]) > o.half - 0.03) continue;
        const nrm = new THREE.Vector3();
        nrm.setComponent(i, Math.sign(arr[i]));
        nrm.transformDirection(o.mesh.matrixWorld);
        if (nrm.dot(n) > -0.8) continue;
        if (gap < bestD) { best = o; bestD = gap; }
      }
    }
    return best;
  }

  postUpdate() {
    if (this.vacuum && this.held.length === 0 && !this.frozen && !this.stopped) {
      const o = this.findContact();
      if (o) {
        this.held.push(o);
        this.ctx.objects.attach(o, this, this.effector);
      }
    }
    // benda yang sudah tidak dipegang (mis. dibatalkan wasit)
    this.held = this.held.filter((o) => o.state === 'held' && o.holders.some((h) => h.robot === this));
  }

  telemetry() {
    const { c, m } = this.liftStages();
    return {
      'Lift h (pusat cup)': `${this.h.toFixed(0)} mm`,
      'Tingkat carriage / tiang': `${c.toFixed(0)} / ${m.toFixed(0)} mm`,
      'Boom e': `${this.e.toFixed(0)} mm`,
      'Wrist roll': `${this.roll.toFixed(0)}°`,
      'Track': this.track > 0.97 ? 'TURUN (mode tangga)' : this.track < 0.03 ? 'naik (mecanum)' : 'bergerak…',
      'Flipper': `${this.flip.toFixed(0)}°${this.flip >= 140 ? ' (siap L2)' : this.flip < 5 ? ' (terlipat)' : ''}`,
      'Vakum': this.vacuum ? (this.held.length ? 'ON – menahan' : 'ON – mencari') : 'OFF',
      'Membawa': this.describeHeld(),
      'Undakan maks': `${(this.maxStep() * 1000).toFixed(0)} mm`,
    };
  }

  describeHeld() {
    if (!this.held.length) return '–';
    return this.held.map((o) => {
      const n = this.ctx.objects.stackCount(o);
      return o.kind === 'ball' ? 'Mustika' : `${n} blok`;
    }).join(', ');
  }
}

// =====================================================================
// Transporter Robot R3: mecanum, rangka U, lift belt, penjepit rack-pinion
// =====================================================================
export class TransporterRobot extends Robot {
  constructor(team, ctx, profil) {
    super('TR', team, ctx, profil);
    this.jaw = this.P.jaw.start;
    this.open = this.P.open.start;
    this.gripCmd = 'open';     // 'open' | 'close' | 'manual'
    this.gripWidth = null;     // lebar benda yang dijepit (mm)
    this.preset = null;
    this.releaseRegion = null;
  }

  resetActuators() {}

  rig() {
    const m = this.model;
    if (m.userData.box) { this.J = m.userData.box; this.anchor = this.J.anchor; return; }
    this.nD = findNode(m, /^D_Carriage/);
    this.nE = findNode(m, /^E_Penjepit/);
    this.d0 = this.nD.position.z;
    this.e0z = this.nE.position.z;
    const jawPart = (c) => ['E04', 'E05', 'E06', 'E07'].includes(code(c)) || (code(c).startsWith('H') && Math.abs(c.position.x) > 0.15);
    this.jawL = regroup(this.nE, (c) => jawPart(c) && c.position.x < 0);
    this.jawR = regroup(this.nE, (c) => jawPart(c) && c.position.x > 0);
    // titik tengah rahang (pusat bantalan E06): y -0.136, z 0.25 (CAD)
    this.anchor = new THREE.Object3D();
    this.anchor.position.set(0, -0.136, 0.25);
    this.nE.add(this.anchor);
  }

  applyJoints() {
    if (this.J) { this.J.apply(this); return; }
    if (!this.nD) return;
    const dz = (this.jaw - this.P.jaw.start) / 1000;
    this.nD.position.z = this.d0 + dz;
    this.nE.position.z = this.e0z + dz;
    const s = (this.P.open.max - this.open) / 2000;
    this.jawL.position.x = s;
    this.jawR.position.x = -s;
  }

  bodyRects() {
    const G = this.G;
    return [
      { x0: G.armIn, x1: G.hw, z0: G.zr, z1: G.zf, y0: 0.02, y1: G.armH },     // lengan kiri (rangka + roda, rendah)
      { x0: -G.hw, x1: -G.armIn, z0: G.zr, z1: G.zf, y0: 0.02, y1: G.armH },   // lengan kanan
      { x0: -G.hw, x1: G.hw, z0: G.zr, z1: G.rearZ1, y0: 0.02, y1: G.bodyH },  // bagian belakang + tiang lift
    ];
  }

  maxSpeed() { return this.P.speed; }
  maxRot() { return this.P.rot; }

  mechShapesWorld() { return this.jawShapesWorld(); }

  dynamicShapesWorld() {
    const out = this.jawShapesWorld();
    for (const o of this.heldSet()) {
      const b = o.aabb();
      out.push({ cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2, hx: (b.max.x - b.min.x) / 2 - 0.004, hz: (b.max.z - b.min.z) / 2 - 0.004, a: 0, y0: b.min.y, y1: b.max.y });
    }
    return out;
  }

  // Posisi benda terhadap pusat bantalan rahang, dalam kerangka robot: [lateral, memanjang, vertikal]
  relToAnchor(p) {
    const a = this.anchor.getWorldPosition(_v2);
    const [ax, az] = worldToLocal(this.x, this.z, this.yaw, a.x, a.z);
    const [px, pz] = worldToLocal(this.x, this.z, this.yaw, p.x, p.z);
    return [px - ax, pz - az, p.y - a.y];
  }

  // Jari + bantalan rahang kiri/kanan sebagai bentuk tabrakan (agar benda tidak menembus rahang).
  // Bidang dalam bantalan di x = ±bukaan/2 dari pusat bantalan.
  jawShapesWorld() {
    if (!this.anchor) return [];
    const G = this.G, half = this.open / 2000;
    const out = [];
    const a = this.anchor.getWorldPosition(new THREE.Vector3());
    const [ax, az] = worldToLocal(this.x, this.z, this.yaw, a.x, a.z);
    for (const sx of [-1, 1]) {
      const [cx, cz] = localToWorld(this.x, this.z, this.yaw, ax + sx * (half + G.padT), az + G.padAhead);
      out.push({ cx, cz, hx: G.padT, hz: G.padHz, a: this.yaw, y0: a.y - G.padHy, y1: a.y + G.padHy, jaw: true });
    }
    return out;
  }

  objWidth(o) {
    if (o.kind === 'ball') return o.size * 1000;
    // lebar proyeksi kubus pada sumbu rahang (X lokal robot)
    const da = o.yaw() - this.yaw;
    return o.size * 1000 * (Math.abs(Math.cos(da)) + Math.abs(Math.sin(da)));
  }

  // Benda di antara rahang: kedua bantalan (panjang 144, tinggi 78 mm) harus menyentuh muka benda
  // minimal 30 mm. Mengembalikan { obj, reason } — reason menjelaskan kenapa belum bisa dijepit.
  jawCandidate() {
    const objs = this.ctx.objects;
    let best = null, bestD = Infinity, hint = null;
    for (const o of objs.list) {
      if (!this.canTake(o)) continue;
      const c = o.worldPos(_v);
      if (c.distanceToSquared(this.group.position) > 1.0) continue;
      const [lx, lf, ly] = this.relToAnchor(c);                // lateral, memanjang, vertikal
      const h = o.kind === 'ball' ? o.half * 0.75 : o.half;    // bola: bagian yang lebar saja
      if (Math.abs(lx) > Math.max(0.12, this.open / 2000)) continue;
      const fOk = Math.abs(lf) <= h + this.G.padTolF;
      const yOk = Math.abs(ly) <= h + this.G.padTolY;
      if (!fOk || !yOk) {
        if (Math.abs(lf) < h + 0.25 && Math.abs(ly) < h + 0.3) hint = !yOk ? (ly > 0 ? 'rahang terlalu rendah' : 'rahang terlalu tinggi') : 'maju lagi, benda belum di antara bantalan';
        continue;
      }
      const d = Math.abs(lx) + Math.abs(lf) + Math.abs(ly);
      if (d < bestD) { best = o; bestD = d; }
    }
    return { obj: best, hint: best ? null : hint };
  }

  findBetweenJaws() {
    return this.jawCandidate().obj;
  }

  jawsHit(o) {
    this.group.updateMatrixWorld(true);
    return this.collides(this.jawShapesWorld(), { obbs: [o.obb(-0.002)], circles: [] });
  }

  // Miring benda terhadap rahang (rad, relatif kelipatan 90°) dan batas yang masih bisa diluruskan
  skew(o) {
    if (o.kind === 'ball') return 0;
    const da = o.yaw() - this.yaw;
    return da - Math.round(da / (Math.PI / 2)) * (Math.PI / 2);
  }

  alignable(o) {
    return Math.abs(this.skew(o)) <= 0.45 && o.size * 1000 <= this.P.open.max;
  }

  updateActuators(dt, cmd) {
    const P = this.P;
    const slow = (cmd.slow ? 0.35 : 1) * this.baterai();
    let dj = cmd.lift * P.jaw.speed * slow * dt;
    if (this.preset !== null) {
      if (cmd.lift) this.preset = null;
      else {
        dj = clamp(this.preset - this.jaw, -P.jaw.speed * dt, P.jaw.speed * dt);
        if (Math.abs(dj) < 1e-3) this.preset = null;
      }
    }
    if (dj) {
      const before = this.actuatorState();
      const old = this.jaw;
      this.jaw = clamp(old + dj, P.jaw.min, P.jaw.max);
      this.applyJoints();
      if (this.actuatorBlockedAfter(before)) { this.jaw = old; this.preset = null; this.applyJoints(); }
    }
    // rahang
    if (cmd.aux) this.gripCmd = 'manual';
    let target = this.open;
    if (this.gripCmd === 'open') target = P.open.max;
    else if (this.gripCmd === 'close') target = P.open.min;
    else target = this.open - cmd.aux * P.open.speed * slow * dt;   // aux + = tutup
    let next = approach(this.open, clamp(target, P.open.min, P.open.max), P.open.speed * dt);
    if (this.gripWidth !== null) next = Math.max(next, this.gripWidth);
    this.jawBlocked = false;
    this.jawTouch = null;
    if (next < this.open && this.gripWidth === null) {
      // menutup: berhenti saat jari menyentuh benda / rintangan
      const before = this.actuatorState();
      const old = this.open;
      this.open = next;
      this.applyJoints();
      // Bantalan menyentuh benda yang ada di antara rahang: rahang memusatkan & meluruskannya
      // lalu menjepit (postUpdate), selama miringnya masih bisa diluruskan.
      const c = this.findBetweenJaws();
      if (c && c.state === 'rest' && this.jawsHit(c)) {
        this.open = old;
        if (this.alignable(c)) this.jawTouch = c; else this.jawBlocked = true;
      } else if (this.actuatorBlockedAfter(before)) { this.open = old; this.jawBlocked = true; }
    } else {
      this.open = next;
    }
    this.applyJoints();
  }

  toggleGrip() {
    if (this.frozen || this.stopped) return;
    this.gripCmd = this.gripWidth !== null || this.gripCmd === 'close' ? 'open' : 'close';
  }

  setPreset(i) {
    if (this.stopped) return;
    const P = this.P.preset[i - 1];
    if (P !== undefined) this.preset = clamp(P, this.P.jaw.min, this.P.jaw.max);
  }

  postUpdate() {
    const objs = this.ctx.objects;
    if (this.held.length === 0) {
      this.gripWidth = null;
      // menutup: jepit benda bila rahang menyentuh
      const o = this.findBetweenJaws();
      if (o) {
        let w = this.objWidth(o);
        const touch = this.jawTouch === o;
        if (!this.stopped && (touch || (this.open <= w + 6 && w <= this.P.open.max)) && (this.gripCmd !== 'open')) {
          if (o.state === 'rest') { this.alignToJaws(o); w = this.objWidth(o); }
          this.gripWidth = w;
          this.open = w;
          this.held.push(o);
          objs.attach(o, this, this.anchor);
          this.applyJoints();
        }
      }
    } else {
      const o = this.held[0];
      if (o.state !== 'held' || !o.holders.some((h) => h.robot === this)) {
        this.held = [];
        this.gripWidth = null;
      } else if (this.open > this.gripWidth + 4) {
        // membuka: lepas
        this.releaseRegion = this.contactRegion();
        this.held = [];
        this.gripWidth = null;
        objs.release(o, this);
      }
    }
  }

  // Rahang meluruskan & memusatkan benda (yaw kelipatan 90° relatif robot, x lokal = 0)
  alignToJaws(o) {
    // geser benda secara lateral sampai tepat di tengah kedua bantalan
    const lx = this.relToAnchor(o.worldPos(new THREE.Vector3()))[0];
    const riders = this.ctx.objects.ridersOf(o);
    const dx = -lx * Math.cos(this.yaw), dz = lx * Math.sin(this.yaw);
    let dyaw = 0;
    if (o.kind !== 'ball') {
      const da = o.yaw() - this.yaw;
      const snap = Math.round(da / (Math.PI / 2)) * (Math.PI / 2);
      dyaw = snap - da;
    }
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dyaw);
    for (const r of [o, ...riders]) {
      const rel = r.mesh.position.clone().sub(o.mesh.position).applyQuaternion(q);
      r.mesh.position.set(o.mesh.position.x + dx + rel.x, r.mesh.position.y, o.mesh.position.z + dz + rel.z);
      r.mesh.quaternion.premultiply(q);
    }
  }

  // Apakah TR menyentuh Ground Area (Pasal 3.4.5)
  contactRegion() {
    let touchingGround = false;
    const [wx0, wzf, wzr] = this.G.wheel;
    for (const [lx, lz] of [[wx0, wzf], [-wx0, wzf], [wx0, wzr], [-wx0, wzr]]) {
      const [wx, wz] = localToWorld(this.x, this.z, this.yaw, lx, lz);
      if (regionAt(wx, wz).name === 'ground') touchingGround = true;
    }
    return { touchingGround };
  }

  telemetry() {
    return {
      'Pusat rahang Z': `${this.jaw.toFixed(0)} mm`,
      'Bukaan rahang': `${this.open.toFixed(0)} mm`,
      'Penjepit': this.held.length ? `MENJEPIT (${this.gripWidth.toFixed(0)} mm)` : this.jawBlocked ? '<span class="bad">tertahan benda</span>' : this.gripCmd === 'close' ? 'menutup…' : this.gripCmd === 'open' ? 'terbuka' : 'manual',
      'Posisi jepit': this.held.length ? '–' : (() => { const c = this.jawCandidate(); return c.obj ? (c.obj.state === 'rest' && !this.alignable(c.obj) ? '<span class="bad">benda terlalu miring — luruskan robot</span>' : '<span class="ok">siap — tekan Space</span>') : c.hint ? `<span class="bad">${c.hint}</span>` : 'tidak ada benda'; })(),
      'Membawa': this.held.length ? (this.held[0].kind === 'ball' ? 'Mustika' : `${this.carriedBlocks()} blok`) : '–',
    };
  }
}
