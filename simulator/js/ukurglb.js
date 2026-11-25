// Cek ukuran robot dari berkas GLB (ekspor CAD) terhadap Rule 11.5 (ukuran awal maks. 700 × 700 × 700 mm).
// Konvensi glTF: Y ke atas, satuan meter. Ekspor CAD dalam milimeter (ukuran > 20 "meter") dikenali dan
// dibagi 1000. Lebar = sumbu X, panjang = sumbu Z, tinggi = sumbu Y.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function ukurGlb(buffer) {
  const gltf = await new Promise((ok, gagal) => new GLTFLoader().parse(buffer, '', ok, gagal));
  const box = new THREE.Box3().setFromObject(gltf.scene);
  if (box.isEmpty()) throw new Error('GLB tidak berisi geometri');
  const s = box.getSize(new THREE.Vector3());
  const mm = Math.max(s.x, s.y, s.z) > 20 ? 1 : 1000;          // sudah dalam mm atau masih meter
  const ukuran = { lebar: Math.round(s.x * mm), panjang: Math.round(s.z * mm), tinggi: Math.round(s.y * mm) };
  const lebih = Object.entries(ukuran).filter(([, v]) => v > 700).map(([k]) => k);
  return { ...ukuran, satuan: mm === 1 ? 'mm' : 'm', lolos: !lebih.length, lebih };
}
