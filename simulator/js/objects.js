import * as THREE from 'three';
import { OBJ, COLORS, FIELD, SKY_LAYOUT, STORAGE_LAYOUTS } from './config.js';
import { readLayout } from './storage.js';
import { heightAt, staticSupportAt, PILLARS, sideSign } from './field.js';
import { pointInObb } from './geom.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
let nextId = 1;

function edgeBox(size, color) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(size, size, size);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x2a1a10, transparent: true, opacity: 0.55 }));
  g.add(e);
  // pita lakban di muka atas & bawah (ciri kardus)
  const tape = new THREE.Mesh(new THREE.BoxGeometry(size * 0.16, size * 1.004, size * 1.004), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.6, transparent: true, opacity: 0.35 }));
  g.add(tape);
  return g;
}

function skyMesh(size) {
  const g = new THREE.Group();
  const h = size / 2;
  const mk = (color, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    m.position.y = y;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  mk(COLORS.skyBlue, h / 2);   // +Y lokal = sisi BIRU
  mk(COLORS.skyRed, -h / 2);   // -Y lokal = sisi MERAH
  const geo = new THREE.BoxGeometry(size, size, size);
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1a1010, transparent: true, opacity: 0.6 })));
  return g;
}

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd400';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1f3fa8';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const y = 40 + i * 80 + Math.sin((x / 512) * Math.PI * 4 + i) * 18;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    for (let x = 512; x >= 0; x -= 8) {
      const y = 62 + i * 80 + Math.sin((x / 512) * Math.PI * 4 + i) * 18;
      g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _ballTex = null;

export class GameObj {
  constructor(kind, opts = {}) {
    this.id = nextId++;
    this.kind = kind;            // 'earth' | 'sky' | 'ball'
    this.team = opts.team || null;
    this.size = kind === 'earth' ? OBJ.earth : kind === 'sky' ? OBJ.sky : OBJ.ballR * 2;
    this.half = this.size / 2;
    if (kind === 'earth') this.mesh = edgeBox(this.size, this.team === 'red' ? COLORS.earthRed : COLORS.earthBlue);
    else if (kind === 'sky') this.mesh = skyMesh(this.size);
    else {
      _ballTex = _ballTex || ballTexture();
      this.mesh = new THREE.Mesh(new THREE.SphereGeometry(OBJ.ballR, 40, 24), new THREE.MeshStandardMaterial({ map: _ballTex, roughness: 0.55 }));
      this.mesh.castShadow = true;
    }
    this.mesh.userData.obj = this;
    this.state = 'rest';         // rest | held | ride | fall | gone
    this.holders = [];           // [{ robot, anchor }]
    this.carrier = null;         // GameObj tempat menumpang saat 'ride'
    this.restingOn = null;       // GameObj | 'terrain' | 'pillar:mustika' | 'pillar:central'
    this.vy = 0;
    this.transferAwarded = false;
    this.invalid = false;
    this.lastReleasedBy = null;  // robot terakhir yang melepas
    this.placedBy = null;        // tim yang meletakkan (untuk skor)
    this.enshrined = false;
  }

  get name() {
    if (this.kind === 'earth') return `Earth#${this.id}`;
    if (this.kind === 'sky') return `Sky#${this.id}`;
    return `Mustika#${this.id}`;
  }

  worldPos(out = new THREE.Vector3()) {
    return this.mesh.getWorldPosition(out);
  }

  // Warna sisi atas Sky Block: 'blue' | 'red' | null (bila belahan menghadap samping)
  topColor() {
    if (this.kind !== 'sky') return null;
    this.mesh.getWorldQuaternion(_q);
    _v.set(0, 1, 0).applyQuaternion(_q);
    if (_v.y > 0.9) return 'blue';
    if (_v.y < -0.9) return 'red';
    return null;
  }

  isFlat() {
    if (this.kind === 'ball') return true;
    this.mesh.getWorldQuaternion(_q);
    for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      _v.set(...ax).applyQuaternion(_q);
      if (Math.abs(_v.y) > 0.985) return true;
    }
    return false;
  }

  yaw() {
    this.mesh.getWorldQuaternion(_q);
    // ambil sumbu lokal yang paling horizontal
    let best = null, bestY = 2;
    for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const d = new THREE.Vector3(...ax).applyQuaternion(_q);
      if (Math.abs(d.y) < bestY) { bestY = Math.abs(d.y); best = d; }
    }
    return Math.atan2(-best.z, best.x);
  }

  // OBB tapak untuk benda diam (kubus berputar yaw saja)
  obb(margin = 0) {
    const p = this.worldPos(_v);
    if (this.kind === 'ball') {
      const r = this.half;
      return { cx: p.x, cz: p.z, hx: r + margin, hz: r + margin, a: 0, y0: p.y - r, y1: p.y + r };
    }
    return { cx: p.x, cz: p.z, hx: this.half + margin, hz: this.half + margin, a: this.yaw(), y0: p.y - this.half, y1: p.y + this.half };
  }

  // Kotak batas dunia (untuk benda yang dipegang dengan orientasi bebas)
  aabb() {
    const b = new THREE.Box3();
    this.mesh.updateWorldMatrix(true, false);
    if (this.kind === 'ball') {
      const p = this.worldPos(new THREE.Vector3());
      return b.setFromCenterAndSize(p, new THREE.Vector3(this.size, this.size, this.size));
    }
    const h = this.half;
    for (const sx of [-h, h]) for (const sy of [-h, h]) for (const sz of [-h, h]) {
      b.expandByPoint(new THREE.Vector3(sx, sy, sz).applyMatrix4(this.mesh.matrixWorld));
    }
    return b;
  }
}

export class ObjectWorld {
  constructor(scene, events) {
    this.scene = scene;
    this.events = events;
    this.list = [];
    this.pendingRefill = 0;
  }

  add(o, x, y, z) {
    o.mesh.position.set(x, y, z);
    this.scene.add(o.mesh);
    this.list.push(o);
    return o;
  }

  clear() {
    for (const o of this.list) o.mesh.removeFromParent();
    this.list = [];
    this.pendingRefill = 0;
    nextId = 1;
  }

  active() {
    return this.list.filter((o) => o.state !== 'gone');
  }

  setup(layout = 'akses') {
    this.clear();
    // Earth Block tiap tim di Storage, kolom 2 tingkat
    for (const team of ['red', 'blue']) {
      const s = sideSign(team);
      const cols = layout === 'kustom' ? readLayout() : (STORAGE_LAYOUTS[layout] || STORAGE_LAYOUTS.akses);
      for (const [ax, z] of cols) {
        let below = 'terrain';
        for (let k = 0; k < 2; k++) {
          const o = this.add(new GameObj('earth', { team }), ax * s, OBJ.earth / 2 + k * OBJ.earth, z);
          o.restingOn = below;
          below = o;
        }
      }
    }
    // 12 Sky Block
    const dirs = { '+x': [0, 0, -Math.PI / 2], '-x': [0, 0, Math.PI / 2], '+z': [Math.PI / 2, 0, 0], '-z': [-Math.PI / 2, 0, 0] };
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const d = SKY_LAYOUT[r][c];
      if (!d || d === 'X') continue;
      const o = this.add(new GameObj('sky'), FIELD.skyGrid.x0 + c * 0.2, OBJ.sky / 2, FIELD.skyGrid.z0 + r * 0.2);
      o.mesh.rotation.set(...dirs[d]);
      o.restingOn = 'terrain';
    }
    this.spawnBall();
  }

  spawnBall() {
    const p = FIELD.mustikaPillar;
    const o = this.add(new GameObj('ball'), p.x, p.h + seatOffset(), p.z);
    o.restingOn = 'pillar:mustika';
    return o;
  }

  ballOnMustikaPillar() {
    return this.active().some((o) => o.kind === 'ball' && o.restingOn === 'pillar:mustika' && o.state === 'rest');
  }

  // Benda yang menumpang di atas o (rekursif)
  ridersOf(o) {
    const out = [];
    const stack = [o];
    while (stack.length) {
      const cur = stack.pop();
      for (const r of this.list) if (r.state === 'rest' && r.restingOn === cur) { out.push(r); stack.push(r); }
    }
    return out;
  }

  // Sky yang tergeletak di lantai Ground Area tanpa beban di atasnya bisa terdorong robot
  // (Ground Shared Area; Rule 6.3 hanya melarang Sky keluar area tanpa diangkat)
  // Opsi fisika "licin" (?fisika=licin, this.licin): Earth tunggal (tanpa balok di atasnya) di lantai juga
  // bisa terdorong — menabrak kolom Storage atau Earth yang jatuh tidak lagi seperti menabrak tembok.
  pushable(o) {
    if (!(o.kind === 'sky' || (this.licin && o.kind === 'earth')) || o.state !== 'rest' || o.restingOn !== 'terrain') return false;
    if (o.worldPos(_v).y - o.half > 0.01) return false;
    return !this.list.some((r) => r.state === 'rest' && r.restingOn === o);
  }

  // Jumlah blok yang terbawa oleh objek o (termasuk penumpang)
  stackCount(o) {
    let n = o.kind === 'ball' ? 0 : 1;
    o.mesh.traverse((m) => { if (m !== o.mesh && m.userData.obj && m.userData.obj.kind !== 'ball') n++; });
    return n;
  }

  attach(o, robot, anchor) {
    if (o.state === 'gone') return;
    let from = null;
    if (o.state === 'ride') {
      // diambil dari atas tumpukan yang sedang dibawa robot lain = serah terima langsung
      let root = o;
      while (root.carrier) root = root.carrier;
      from = root.holders[0]?.robot || null;
      o.carrier = null;
    }
    if (o.state === 'rest' || o.state === 'fall') {
      // penumpang ikut terbawa (dijadikan anak mesh)
      const riders = this.ridersOf(o);
      for (const r of riders) {
        const parent = r.restingOn;
        parent.mesh.attach(r.mesh);
        r.state = 'ride';
        r.carrier = parent;
      }
    }
    // Pasal 3.6.6: Mustika yang diambil dari Mustika Pillar segera diganti oleh wasit
    if (o.kind === 'ball' && o.restingOn === 'pillar:mustika') this.pendingRefill = 3;
    o.holders = o.holders.filter((h) => h.robot !== robot);
    o.holders.push({ robot, anchor });
    if (o.holders.length === 1 || o.state !== 'held') {
      anchor.attach(o.mesh);
    }
    o.state = 'held';
    o.restingOn = null;
    o.vy = 0;
    this.events.emit('pick', { obj: o, robot });
    if (from && from !== robot) this.events.emit('handover', { obj: o, from, to: robot });
  }

  release(o, robot) {
    if (o.state !== 'held') return;
    const before = o.holders.length;
    o.holders = o.holders.filter((h) => h.robot !== robot);
    if (o.holders.length === before) return;
    if (o.holders.length > 0) {
      // serah terima: pindah ke pemegang lain
      const h = o.holders[0];
      h.anchor.attach(o.mesh);
      this.events.emit('handover', { obj: o, from: robot, to: h.robot });
      return;
    }
    this.scene.attach(o.mesh);
    snapUpright(o);
    o.state = 'fall';
    o.vy = 0;
    o.lastReleasedBy = robot;
    o.mesh.traverse((m) => { const r = m.userData.obj; if (r && r !== o) r.lastReleasedBy = robot; });
    this.events.emit('release', { obj: o, robot });
  }

  remove(o, reason) {
    if (o.state === 'gone') return;
    for (const h of [...o.holders]) h.robot.forgetObject?.(o);
    o.holders = [];
    // penumpang jatuh
    const kids = [];
    o.mesh.traverse((m) => { const r = m.userData.obj; if (r && r !== o) kids.push(r); });
    for (const k of kids) {
      this.scene.attach(k.mesh);
      k.state = 'fall';
      k.carrier = null;
    }
    for (const r of this.list) if (r.restingOn === o && r.state === 'rest') { r.state = 'fall'; r.restingOn = null; }
    o.state = 'gone';
    o.invalid = true;
    o.mesh.removeFromParent();
    this.events.emit('removed', { obj: o, reason });
    if (o.kind === 'ball') this.pendingRefill = 3;
  }

  // Tinggi tumpuan di bawah titik (x,z) dari benda lain yang diam
  objectSupportAt(x, z, exclude, maxY) {
    let h = -Infinity, who = null;
    for (const r of this.list) {
      if (r === exclude || r.state !== 'rest') continue;
      const ob = r.obb();
      if (ob.y1 > maxY + 0.01) continue;
      if (r.kind === 'ball') {
        const p = r.worldPos(_v);
        if ((x - p.x) ** 2 + (z - p.z) ** 2 < (r.half * 0.5) ** 2 && ob.y1 > h) { h = ob.y1; who = r; }
        continue;
      }
      if (pointInObb(x, z, ob) && ob.y1 > h) { h = ob.y1; who = r; }
    }
    return { h, who };
  }

  // Hitung tumpuan untuk benda o pada posisinya saat ini
  supportFor(o) {
    const p = o.worldPos(new THREE.Vector3());
    const bottom = p.y - o.half;
    if (o.kind === 'ball') {
      for (const pl of PILLARS) {
        const d = Math.hypot(p.x - pl.x, p.z - pl.z);
        if (d < 0.07 && bottom > pl.top - 0.06) {
          return { h: pl.top + seatOffset() - o.half, who: 'pillar:' + pl.name, seat: pl };
        }
      }
      const os = this.objectSupportAt(p.x, p.z, o, bottom);
      const t = staticSupportAt(p.x, p.z);
      return os.h > t ? { h: os.h, who: os.who } : { h: t, who: 'terrain' };
    }
    const yaw = o.yaw();
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const samples = [];
    const n = 4, ext = o.half * 0.92;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const lx = -ext + (2 * ext * i) / n, lz = -ext + (2 * ext * j) / n;
      const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
      const t = staticSupportAt(x, z);
      const os = this.objectSupportAt(x, z, o, bottom);
      samples.push(os.h > t + 1e-4 ? { h: os.h, who: os.who } : { h: t, who: 'terrain' });
    }
    // Bila bagian tertinggi hanya menopang sedikit, benda tergelincir ke level berikutnya
    let pool = samples;
    for (let k = 0; k < 4; k++) {
      const top = Math.max(...pool.map((s) => s.h));
      const at = pool.filter((s) => s.h > top - 0.004);
      if (at.length / samples.length >= 0.3 || at.length === pool.length) {
        const counts = new Map();
        for (const s of at) counts.set(s.who, (counts.get(s.who) || 0) + 1);
        const who = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        return { h: top, who, coverage: at.length / samples.length };
      }
      pool = pool.filter((s) => s.h <= top - 0.004);
    }
    return { h: Math.max(0, heightAt(p.x, p.z)), who: 'terrain' };
  }

  update(dt) {
    // Isi ulang Mustika Pillar (Pasal 3.6.6)
    if (this.pendingRefill > 0) {
      this.pendingRefill -= dt;
      if (this.pendingRefill <= 0) {
        const enshrined = this.active().some((o) => o.enshrined);
        const p = FIELD.mustikaPillar;
        // Mustika lama masih berada di atas pilar (baru dijepit, belum diangkat pergi): tunggu
        const busy = this.active().some((o) => o.kind === 'ball' && o.state !== 'rest' &&
          Math.hypot(o.worldPos(_v).x - p.x, _v.z - p.z) < 0.3 && _v.y < p.h + 0.45);
        if (busy && !enshrined) this.pendingRefill = 0.5;
        else if (!enshrined && !this.ballOnMustikaPillar()) {
          this.spawnBall();
          this.events.emit('refill', {});
        }
      }
    }
    const falling = this.list.filter((o) => o.state === 'fall').sort((a, b) => a.mesh.position.y - b.mesh.position.y);
    for (const o of falling) {
      o.vy -= 9.81 * dt;
      const sup = this.supportFor(o);
      const target = sup.h + o.half;
      let y = o.mesh.position.y + o.vy * dt;
      if (sup.seat) {
        // masuk ke receptacle: luruskan ke sumbu pilar
        o.mesh.position.x += (sup.seat.x - o.mesh.position.x) * Math.min(1, dt * 12);
        o.mesh.position.z += (sup.seat.z - o.mesh.position.z) * Math.min(1, dt * 12);
      }
      if (y <= target) {
        y = target;
        o.mesh.position.y = y;
        if (sup.seat) { o.mesh.position.x = sup.seat.x; o.mesh.position.z = sup.seat.z; }
        this.land(o, sup);
      } else {
        o.mesh.position.y = y;
        if (y < -2) this.remove(o, 'keluar lapangan');
      }
    }
  }

  land(o, sup) {
    o.state = 'rest';
    o.vy = 0;
    o.restingOn = sup.who;
    // penumpang kembali menjadi benda diam
    const kids = [];
    o.mesh.traverse((m) => { const r = m.userData.obj; if (r && r !== o) kids.push(r); });
    for (const k of kids) {
      this.scene.attach(k.mesh);
      k.state = 'rest';
      k.restingOn = k.carrier;
      k.carrier = null;
    }
    // Bola yang tidak di receptacle menggelinding -> dianggap jatuh
    this.events.emit('landed', { obj: o, support: sup, riders: kids });
  }
}

// Tinggi pusat bola di atas puncak pilar saat duduk di receptacle Ø180
export function seatOffset() {
  const R = OBJ.ballR, r = FIELD.receptacle.r;
  return Math.sqrt(R * R - r * r);
}

// Luruskan kubus ke orientasi rata (sumbu terdekat menghadap atas), yaw tetap
export function snapUpright(o) {
  if (o.kind === 'ball') { o.mesh.quaternion.identity(); return; }
  const q = o.mesh.quaternion;
  let best = null, bestDot = -2;
  for (const ax of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const d = new THREE.Vector3(...ax).applyQuaternion(q);
    if (d.y > bestDot) { bestDot = d.y; best = d; }
  }
  _q.setFromUnitVectors(best, UP);
  q.premultiply(_q);
}
