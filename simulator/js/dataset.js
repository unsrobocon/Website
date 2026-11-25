// Label kotak 2D (format YOLO) untuk bingkai kamera robot (js/kamera.js): tiap Earth / Sky / Mustika
// diproyeksikan dari sudut kotaknya; benda dianggap terlihat bila cukup banyak piksel di dalam kotaknya
// punya depth yang cocok dengan jarak benda itu (tidak tertutup benda / robot lain).
import * as THREE from 'three';

export const KELAS = { earth: 0, sky: 1, ball: 2 };
export const NAMA_KELAS = ['earth', 'sky', 'mustika'];

export function labelBingkai(kamera, f, objects, { minPiksel = 60, minTerlihat = 0.25 } = {}) {
  const cam = kamera.cam, { lebar: W, tinggi: H } = f, out = [];
  const v = new THREE.Vector3(), lihat = new THREE.Vector3();
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse;
  for (const o of objects.list) {
    if (o.state === 'gone' || !(o.kind in KELAS)) continue;
    const box = new THREE.Box3().setFromObject(o.mesh);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, dmin = Infinity, dmax = -Infinity, depan = 0;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      lihat.copy(v).applyMatrix4(inv);
      const d = -lihat.z;                         // jarak sepanjang sumbu optik
      if (d <= cam.near) continue;
      depan++;
      dmin = Math.min(dmin, d); dmax = Math.max(dmax, d);
      v.project(cam);
      const px = (v.x + 1) / 2 * W, py = (1 - v.y) / 2 * H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    if (depan < 8) continue;                     // sebagian di belakang kamera
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
    if (x1 - x0 < 3 || y1 - y0 < 3) continue;
    // piksel di kotak yang depth-nya sesuai jarak benda (benda itu sendiri yang terlihat)
    let cocok = 0, semua = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      semua++;
      const z = f.depth[y * W + x] / 1000;
      if (z >= dmin - 0.03 && z <= dmax + 0.03) cocok++;
    }
    if (cocok < minPiksel || cocok / semua < minTerlihat) continue;
    out.push({ kelas: KELAS[o.kind], nama: NAMA_KELAS[KELAS[o.kind]], id: o.id, x0, y0, x1, y1,
      yolo: [KELAS[o.kind], (x0 + x1) / 2 / W, (y0 + y1) / 2 / H, (x1 - x0) / W, (y1 - y0) / H] });
  }
  return out;
}
