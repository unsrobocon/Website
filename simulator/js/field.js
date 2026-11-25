import * as THREE from 'three';
import { FIELD, SPOTS, COLORS } from './config.js';

const F = FIELD;

// ---------- Kueri geometri ----------

// Tinggi permukaan lantai/terrain (tanpa pilar dan pagar).
export function heightAt(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax <= F.L2.half && az <= F.L2.half) return F.L2.h;
  if (ax <= F.L1.half && az <= F.L1.half) return F.L1.h;
  if (ax > F.lane.xIn && ax <= F.lane.xOut) {
    if (z >= F.ramp.z0 && z < F.ramp.z1) return F.L1.h * (z - F.ramp.z0) / (F.ramp.z1 - F.ramp.z0);
    if (z >= F.transfer.z0 && z <= F.transfer.z1) return F.L1.h;
    for (const s of F.stairs) if (z > s.z0 && z <= s.z1) return s.h;
  }
  return 0;
}

export function regionAt(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  const side = x < 0 ? 'red' : 'blue';
  if (ax <= F.L2.half && az <= F.L2.half) return { name: 'L2', side };
  if (ax <= F.L1.half && az <= F.L1.half) return { name: 'L1', side };
  if (ax > F.lane.xIn && ax <= F.lane.xOut) {
    if (z >= F.ramp.z0 && z < F.ramp.z1) return { name: 'ramp', side };
    if (z >= F.transfer.z0 && z <= F.transfer.z1) return { name: 'transfer', side };
    if (z > F.stairs[0].z0 && z <= F.stairs[2].z1) return { name: 'stairs', side };
  }
  return { name: 'ground', side };
}

export const sideSign = (team) => (team === 'red' ? -1 : 1);

// Persegi panjang yang didefinisikan dengan |x| -> koordinat nyata untuk tim
export function teamRect(r, team) {
  const s = sideSign(team);
  const a = r.x0 * s, b = r.x1 * s;
  return { x0: Math.min(a, b), x1: Math.max(a, b), z0: r.z0, z1: r.z1 };
}

export const transferRect = (team) => teamRect({ x0: F.lane.xIn, x1: F.lane.xOut, z0: F.transfer.z0, z1: F.transfer.z1 }, team);
export const storageRect = (team) => teamRect(F.storage, team);
export const startRects = (team) => F.startZones.map((r) => teamRect({ ...r, z0: F.startZ.z0, z1: F.startZ.z1 }, team));
export const l1RetryRect = (team) => teamRect(F.l1Retry, team);

export const inRect = (x, z, r, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

export function spotRect(s) {
  const h = F.spotSize / 2;
  return { x0: s.x - h, x1: s.x + h, z0: s.z - h, z1: s.z + h };
}

// Pagar/barrier sebagai kotak [x0,x1,z0,z1,y0,y1]
export const WALLS = (() => {
  const w = [];
  const H = F.half, t = 0.05;
  const add = (x0, x1, z0, z1, y0, y1) => w.push({ x0, x1, z0, z1, y0, y1 });
  // Batas lapangan 100 mm
  add(-H - t, H + t, -H - t, -H, 0, 0.1);
  add(-H - t, H + t, H, H + t, 0, 0.1);
  add(-H - t, -H, -H, H, 0, 0.1);
  add(H, H + t, -H, H, 0, 0.1);
  // Center divider Ground Area 50 mm (terputus di area Shared)
  const d = 0.015;
  for (const [z0, z1] of [[-5.5, -4.75], [-3.75, -3.0], [3.0, 3.65], [4.85, 5.5]]) add(-d, d, z0, z1, 0, 0.05);
  // Center divider L1
  for (const [z0, z1] of [[-2.22, -1.5], [1.5, 2.22]]) add(-d, d, z0, z1, 0.6, 0.65);
  // L1 perimeter barrier 30 mm, terbuka di Transfer Area
  const L = F.L1.half, b = 0.03;
  add(-L, L, -L, -L + b, 0.6, 0.65);
  add(-L, L, L - b, L, 0.6, 0.65);
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -L : L - b, x1 = sx < 0 ? -L + b : L;
    add(x0, x1, -L, F.transfer.z0, 0.6, 0.65);
    add(x0, x1, F.transfer.z1, L, 0.6, 0.65);
  }
  return w;
})();

export const PILLARS = [
  { name: 'mustika', x: F.mustikaPillar.x, z: F.mustikaPillar.z, r: F.mustikaPillar.r, y0: 0, top: F.mustikaPillar.h },
  { name: 'central', x: F.centralPillar.x, z: F.centralPillar.z, r: F.centralPillar.r, y0: F.L2.h, top: F.L2.h + F.centralPillar.h },
];

// Tinggi tumpuan untuk benda jatuh (terrain + puncak pilar + pagar)
export function staticSupportAt(x, z) {
  let h = heightAt(x, z);
  for (const p of PILLARS) {
    if ((x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r) h = Math.max(h, p.top);
  }
  for (const w of WALLS) if (x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1) h = Math.max(h, w.y1);
  return h;
}

// ---------- Visual ----------

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...opts });
}

function box(scene, x0, x1, y0, y1, z0, z1, material, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.receiveShadow = shadow;
  m.castShadow = shadow;
  scene.add(m);
  return m;
}

let decalOrder = 0;
function decal(scene, r, y, color, layer = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 4 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set((r.x0 + r.x1) / 2, y + 0.0005 * layer, (r.z0 + r.z1) / 2);
  m.receiveShadow = true;
  m.renderOrder = decalOrder++;
  scene.add(m);
  return m;
}

function prismX(scene, pts, x0, x1, material) {
  // pts: [[z,y],...] poligon pada bidang ZY, diekstrusi sepanjang X
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  const m = new THREE.Mesh(g, material);
  m.rotation.y = Math.PI / 2;
  m.position.x = x0;
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  return m;
}

function pillarMesh(scene, p) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, p.top - p.y0, 48), mat(COLORS.pillar, { roughness: 0.6 }));
  body.position.y = (p.top + p.y0) / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(F.receptacle.r, F.receptacle.r, 0.004, 40), mat(0xf2deb8));
  cup.position.y = p.top + 0.002;
  g.add(cup);
  g.position.set(p.x, 0, p.z);
  scene.add(g);
}

export function buildField(scene) {
  const H = F.half;
  // Lantai venue
  const venue = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat(0x5a5f66, { roughness: 1 }));
  venue.rotation.x = -Math.PI / 2;
  venue.position.y = -0.002;
  venue.receiveShadow = true;
  scene.add(venue);

  // Ground Area
  decal(scene, { x0: -H, x1: 0, z0: -H, z1: H }, 0, COLORS.groundRed, 1);
  decal(scene, { x0: 0, x1: H, z0: -H, z1: H }, 0, COLORS.groundBlue, 1);
  decal(scene, F.skyArea, 0, COLORS.shared, 2);
  decal(scene, F.mustikaArea, 0, COLORS.shared, 2);
  // Sel grid Sky Block
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const x = F.skyGrid.x0 + c * 0.2, z = F.skyGrid.z0 + r * 0.2;
    const color = r === 2 && c === 2 ? 0x7a4a10 : (r + c) % 2 === 0 ? 0xfffbd6 : 0xc8c8c8;
    decal(scene, { x0: x - 0.098, x1: x + 0.098, z0: z - 0.098, z1: z + 0.098 }, 0, color, 3);
  }
  for (const team of ['red', 'blue']) {
    const c = team === 'red' ? COLORS.red : COLORS.blue;
    decal(scene, storageRect(team), 0, c, 2);
    for (const r of startRects(team)) decal(scene, r, 0, c, 2);
  }

  // Level 1
  const L = F.L1.half, Lh = F.L1.h;
  box(scene, -L, L, 0, Lh, -L, L, mat(COLORS.sideWall));
  decal(scene, { x0: -L, x1: 0, z0: -L, z1: L }, Lh, COLORS.L1Red, 1);
  decal(scene, { x0: 0, x1: L, z0: -L, z1: L }, Lh, COLORS.L1Blue, 1);
  for (const r of F.l1Shared) decal(scene, r, Lh, COLORS.L1Shared, 2);
  decal(scene, l1RetryRect('red'), Lh, COLORS.red, 2);
  decal(scene, l1RetryRect('blue'), Lh, COLORS.blue, 2);

  // Level 2
  const L2 = F.L2.half, L2h = F.L2.h;
  box(scene, -L2, L2, Lh, L2h, -L2, L2, mat(COLORS.L2));
  // Building spot
  for (const s of SPOTS) decal(scene, spotRect(s), s.level === 2 ? L2h : Lh, COLORS.spot, 4);

  // Ramp, transfer, tangga
  for (const team of ['red', 'blue']) {
    const red = team === 'red';
    const x0 = red ? -F.lane.xOut : F.lane.xIn, x1 = red ? -F.lane.xIn : F.lane.xOut;
    prismX(scene, [[F.ramp.z0, 0], [F.ramp.z1, 0], [F.ramp.z1, Lh]], x0, x1, mat(red ? COLORS.rampRed : COLORS.rampBlue));
    box(scene, x0, x1, 0, Lh, F.transfer.z0, F.transfer.z1, mat(red ? COLORS.rampRed : COLORS.rampBlue));
    decal(scene, transferRect(team), Lh, red ? COLORS.transferRed : COLORS.transferBlue, 2);
    for (const s of F.stairs) box(scene, x0, x1, 0, s.h, s.z0, s.z1, mat(red ? COLORS.stairsRed : COLORS.stairsBlue));
  }

  // Pagar
  const wallMat = mat(COLORS.wood, { roughness: 0.7 });
  const barMat = mat(COLORS.barrier, { roughness: 0.7 });
  for (const w of WALLS) box(scene, w.x0, w.x1, w.y0, w.y1, w.z0, w.z1, w.y0 > 0.1 ? barMat : wallMat);

  for (const p of PILLARS) pillarMesh(scene, p);

  // Garis pemisah merah/biru di L2 (indikatif)
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 3), new THREE.MeshBasicMaterial({ color: 0x8a6a3a }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, L2h + 0.003, 0);
  scene.add(line);
}
