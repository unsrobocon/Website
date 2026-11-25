// Label nama area di lapangan 3D (tombol Y; menyala sendiri di Tutorial dan Demo berpemandu).
// Teks digambar ke kanvas lalu dipasang sebagai sprite yang selalu menghadap kamera dan tidak
// tertutup benda lain, jadi nama area tetap terbaca dari sudut mana pun.

import * as THREE from 'three';
import { FIELD, SPOTS } from './config.js';
import { transferRect, storageRect, startRects, l1RetryRect } from './field.js';

const tengah = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

// [teks, x, y, z, warna aksen]
function daftarLabel() {
  const L = [];
  for (const team of ['red', 'blue']) {
    const nama = team === 'red' ? 'Merah' : 'Biru', w = team === 'red' ? '#ff6b61' : '#7d8bff';
    const s = team === 'red' ? -1 : 1;
    L.push([`Storage ${nama}`, ...((c) => [c[0], 0.9, c[1]])(tengah(storageRect(team))), w]);
    L.push([`Transfer Area`, ...((c) => [c[0], 1.25, c[1]])(tengah(transferRect(team))), w]);
    L.push(['Ramp', s * 3.5, 0.75, -1.1, w]);
    L.push(['Tangga', s * 3.5, 0.75, 2.25, w]);
    L.push([`Start Zone ${nama}`, ...((c) => [c[0], 0.6, c[1]])(tengah({ x0: Math.min(...startRects(team).map((r) => r.x0)), x1: Math.max(...startRects(team).map((r) => r.x1)), z0: FIELD.startZ.z0, z1: FIELD.startZ.z1 })), w]);
    L.push(['L1 Retry Zone', ...((c) => [c[0], 1.0, c[1]])(tengah(l1RetryRect(team))), w]);
    L.push([`Level 1 ${nama}`, s * 2.25, 1.05, 0, w]);
  }
  L.push(['Level 2 (Shared)', 0, 1.35, 0.75, '#e6edf3']);
  L.push(['Central Pillar — Mustika +250', 0, 2.05, 0, '#ffd400']);
  L.push(['Mustika Pillar', FIELD.mustikaPillar.x, 1.0, FIELD.mustikaPillar.z, '#ffd400']);
  L.push(['Ground Shared Area — Sky Block', ...((c) => [c[0], 0.6, c[1]])(tengah(FIELD.skyArea)), '#e6edf3']);
  for (const s of SPOTS) {
    const nama = s.level === 2 ? 'Building Spot L2' : s.shared ? 'Building Spot L1 Shared' : 'Building Spot L1';
    L.push([nama, s.x, s.level === 2 ? 1.3 : 1.0, s.z, '#58c46b']);
  }
  return L;
}

function sprite(teks, aksen) {
  const px = 44, pad = 16;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = `600 ${px}px system-ui, "Segoe UI", sans-serif`;
  const w = Math.ceil(ctx.measureText(teks).width) + pad * 2 + 10, h = px + pad * 1.4;
  cv.width = w; cv.height = h;
  ctx.font = `600 ${px}px system-ui, "Segoe UI", sans-serif`;
  ctx.fillStyle = 'rgba(16, 20, 26, 0.86)';
  const r = 14;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r); ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r);
  ctx.fill();
  ctx.fillStyle = aksen;
  ctx.fillRect(0, 0, 10, h);
  ctx.fillStyle = '#f2f5f8';
  ctx.textBaseline = 'middle';
  ctx.fillText(teks, pad + 10, h / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // ukuran tetap di layar (tidak membesar saat kamera dekat): skala = ukuran pada jarak 1 m
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  const tinggi = 0.032;
  m.scale.set((tinggi * w) / h, tinggi, 1);
  m.renderOrder = 15;
  return m;
}

export class LabelArea {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'label-area';
    this.group.visible = false;
    this.dibuat = false;
    scene.add(this.group);
  }

  // sprite baru dibuat saat pertama kali ditampilkan (hemat memori bila tidak dipakai)
  buat() {
    for (const [teks, x, y, z, aksen] of daftarLabel()) {
      const s = sprite(teks, aksen);
      s.position.set(x, y, z);
      s.userData.teks = teks;
      this.group.add(s);
    }
    this.dibuat = true;
  }

  get tampil() { return this.group.visible; }

  set(v) {
    if (v && !this.dibuat) this.buat();
    this.group.visible = v;
    return v;
  }

  toggle() { return this.set(!this.group.visible); }
}
