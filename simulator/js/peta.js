// Peta okupansi lapangan untuk navigasi (ROS 2 nav_msgs/OccupancyGrid, Nav2): 0 bebas, 100 terisi.
// Dua tingkat: 'lantai' (Ground Area; level L1 dan pagar/divider/pilar Mustika terisi, ramp bebas karena bisa
// dilalui) dan 'l1' (permukaan L1 + ramp + Transfer Area bebas; lantai, L2, tangga dan barrier terisi).
// Sel berbaris menurut sumbu Y ROS (= x simulator), kolom menurut X ROS (= z simulator), asal di pojok
// (-HALF, -HALF) dalam kerangka map.

import { FIELD as F } from './config.js';
import { WALLS, PILLARS, heightAt } from './field.js';

export const PETA = { res: 0.05, half: 5.6 };

export function buatPeta(tingkat = 'lantai') {
  const { res, half } = PETA, n = Math.round((2 * half) / res);
  const data = new Array(n * n).fill(0);
  const ramp = (x, z) => Math.abs(x) > F.lane.xIn && Math.abs(x) <= F.lane.xOut && z >= F.ramp.z0 && z < F.ramp.z1;
  const transfer = (x, z) => Math.abs(x) > F.lane.xIn && Math.abs(x) <= F.lane.xOut && z >= F.transfer.z0 && z <= F.transfer.z1;
  const tinggiTingkat = tingkat === 'l1' ? F.L1.h : 0;
  for (let i = 0; i < n; i++) {                 // baris: x simulator (Y ROS)
    const x = -half + (i + 0.5) * res;
    for (let j = 0; j < n; j++) {               // kolom: z simulator (X ROS)
      const z = -half + (j + 0.5) * res;
      let isi;
      if (Math.abs(x) > F.half || Math.abs(z) > F.half) isi = true;                 // di luar lapangan
      else if (ramp(x, z) || (tingkat === 'l1' && transfer(x, z))) isi = false;     // jalan antartingkat
      else isi = Math.abs(heightAt(x, z) - tinggiTingkat) > 0.02;
      data[i * n + j] = isi ? 100 : 0;
    }
  }
  // pagar, divider dan barrier yang berdiri di tingkat ini; pilar di tingkat ini
  const tandai = (x0, x1, z0, z1) => {
    const i0 = Math.max(0, Math.floor((x0 + half) / res)), i1 = Math.min(n - 1, Math.floor((x1 + half) / res));
    const j0 = Math.max(0, Math.floor((z0 + half) / res)), j1 = Math.min(n - 1, Math.floor((z1 + half) / res));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) data[i * n + j] = 100;
  };
  for (const w of WALLS) if (Math.abs(w.y0 - tinggiTingkat) < 0.05) tandai(w.x0, w.x1, w.z0, w.z1);
  for (const p of PILLARS) if (Math.abs(p.y0 - tinggiTingkat) < 0.05) tandai(p.x - p.r, p.x + p.r, p.z - p.r, p.z + p.r);
  return { tingkat, res, lebar: n, tinggi: n, asal: { x: -half, y: -half }, data };
}
