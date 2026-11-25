// Geometri 2D (bidang XZ) + rentang vertikal untuk deteksi tabrakan sederhana.
// OBB: { cx, cz, hx, hz, a, y0, y1 } ; a = yaw (rotasi terhadap +Y, konvensi three.js)
// sumbu lokal x -> (cos a, -sin a), sumbu lokal z -> (sin a, cos a)

export function obbAxes(o) {
  const c = Math.cos(o.a), s = Math.sin(o.a);
  return [[c, -s], [s, c]];
}

function project(o, ax) {
  const [ux, uz] = obbAxes(o);
  const c = o.cx * ax[0] + o.cz * ax[1];
  const r = o.hx * Math.abs(ux[0] * ax[0] + ux[1] * ax[1]) + o.hz * Math.abs(uz[0] * ax[0] + uz[1] * ax[1]);
  return [c - r, c + r];
}

export function yOverlap(a, b, m = 0) {
  return a.y0 < b.y1 - m && b.y0 < a.y1 - m;
}

export function obbOverlap2D(a, b, m = 0) {
  const axes = [...obbAxes(a), ...obbAxes(b)];
  for (const ax of axes) {
    const [a0, a1] = project(a, ax);
    const [b0, b1] = project(b, ax);
    if (a1 - m <= b0 || b1 - m <= a0) return false;
  }
  return true;
}

export function obbOverlap(a, b, m = 0) {
  return yOverlap(a, b) && obbOverlap2D(a, b, m);
}

export function circleObbOverlap(c, o) {
  // c: { x, z, r, y0, y1 }
  if (!yOverlap(c, o)) return false;
  const dx = c.x - o.cx, dz = c.z - o.cz;
  const [ux, uz] = obbAxes(o);
  const lx = dx * ux[0] + dz * ux[1];
  const lz = dx * uz[0] + dz * uz[1];
  const qx = Math.max(-o.hx, Math.min(o.hx, lx));
  const qz = Math.max(-o.hz, Math.min(o.hz, lz));
  return (lx - qx) ** 2 + (lz - qz) ** 2 < c.r * c.r;
}

export function rectToObb(r, y0, y1) {
  return { cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, hx: (r.x1 - r.x0) / 2, hz: (r.z1 - r.z0) / 2, a: 0, y0, y1 };
}

export function pointInObb(x, z, o, m = 0) {
  const dx = x - o.cx, dz = z - o.cz;
  const [ux, uz] = obbAxes(o);
  return Math.abs(dx * ux[0] + dz * ux[1]) <= o.hx + m && Math.abs(dx * uz[0] + dz * uz[1]) <= o.hz + m;
}

export function obbCorners(o) {
  const [ux, uz] = obbAxes(o);
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    out.push([o.cx + ux[0] * o.hx * sx + uz[0] * o.hz * sz, o.cz + ux[1] * o.hx * sx + uz[1] * o.hz * sz]);
  }
  return out;
}

// Lokal robot (lx, lz) -> dunia untuk pose (x, z, yaw)
export function localToWorld(px, pz, yaw, lx, lz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [px + lx * c + lz * s, pz - lx * s + lz * c];
}

export function worldToLocal(px, pz, yaw, wx, wz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const dx = wx - px, dz = wz - pz;
  return [dx * c - dz * s, dx * s + dz * c];
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
export function approach(v, target, maxStep) {
  if (v < target) return Math.min(target, v + maxStep);
  return Math.max(target, v - maxStep);
}
