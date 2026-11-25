// Tata letak Earth Block buatan tim sendiri (Rule 4.1.3): kolom setinggi 2 balok, seluruhnya di dalam
// Storage 2000 × 1000 mm, paling banyak 20 balok (10 kolom). Koordinat [|x|, z] dalam meter, sama
// seperti STORAGE_LAYOUTS di js/config.js (sisi tim ditentukan saat lapangan disiapkan).
import { FIELD, OBJ, STORAGE_LAYOUTS } from './config.js';

const KEY = 'simabu.storage';
export const MAKS_KOLOM = 10;
const H = OBJ.earth / 2;

// Apakah kolom di (x, z) muat di Storage dan tidak bertumpuk dengan kolom lain (kecuali indeks skip)
export function fits(cols, [x, z], skip = -1) {
  const s = FIELD.storage;
  if (x - H < s.x0 - 1e-6 || x + H > s.x1 + 1e-6 || z - H < s.z0 - 1e-6 || z + H > s.z1 + 1e-6) return false;
  return cols.every(([cx, cz], i) => i === skip || Math.abs(cx - x) >= OBJ.earth - 1e-6 || Math.abs(cz - z) >= OBJ.earth - 1e-6);
}

export function valid(cols) {
  if (!Array.isArray(cols) || cols.length < 1 || cols.length > MAKS_KOLOM) return false;
  return cols.every((c, i) => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite) && fits(cols, c, i));
}

export function readLayout() {
  try {
    const cols = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (valid(cols)) return cols;
  } catch { /* penyimpanan diblokir */ }
  return STORAGE_LAYOUTS.akses.map((c) => [...c]);
}

export function saveLayout(cols) {
  try { localStorage.setItem(KEY, JSON.stringify(cols.map(([x, z]) => [+x.toFixed(3), +z.toFixed(3)]))); } catch { /* diblokir */ }
}
