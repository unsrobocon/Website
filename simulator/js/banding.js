// Bandingkan log robot asli dengan simulator: perintah kecepatan dari log dijalankan ulang pada robot simulator
// dari pose yang sama, lalu lintasannya dibandingkan dengan pose yang tercatat robot asli. Hasilnya menunjukkan
// angka kalibrasi mana yang meleset (mis. robot asli hanya menempuh 90 % jarak simulator: kecepatan / selip).
//
// Format CSV (baris judul wajib, kolom lain diabaikan), satuan SI, kerangka robot seperti ROS (x maju, y kiri):
//   t        detik
//   vx,vy,wz perintah kecepatan yang dikirim ke robot (m/s, m/s, rad/s) — seperti /tr/cmd_vel
//   x,y,yaw  pose robot asli relatif terhadap pose awalnya (m, m, rad) — dari odometri/kamera atas/motion capture

import * as THREE from 'three';

export function bacaLog(teks) {
  const baris = teks.trim().split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const kepala = baris.shift().split(/[,;\t]/).map((k) => k.trim().toLowerCase());
  const kol = (n) => kepala.indexOf(n);
  for (const n of ['t', 'vx', 'x', 'y']) if (kol(n) < 0) throw new Error(`kolom "${n}" tidak ada (butuh t,vx,vy,wz,x,y,yaw)`);
  const ambil = (v, n) => (kol(n) < 0 ? 0 : Number(v[kol(n)]) || 0);
  const data = baris.map((l) => { const v = l.split(/[,;\t]/); return { t: ambil(v, 't'), vx: ambil(v, 'vx'), vy: ambil(v, 'vy'), wz: ambil(v, 'wz'), x: ambil(v, 'x'), y: ambil(v, 'y'), yaw: ambil(v, 'yaw') }; });
  if (data.length < 2) throw new Error('log terlalu pendek');
  return data;
}

// robot: robot simulator; x0, z0, yaw0: pose awal di lapangan — bawaan Ground Area sisi Start, menghadap tepi
// lapangan dengan ±3 m lantai kosong (log yang lebih jauh akan tertahan pagar / zona Start)
export function bandingkan(robot, log, { x0 = -1.0, z0 = 4.3, yaw0 = -Math.PI / 2 } = {}) {
  robot.placeAt(x0, z0, yaw0);
  const IDLE = { f: 0, s: 0, r: 0, lift: 0, aux: 0, roll: 0, flip: 0, slow: false };
  const vmax = robot.maxSpeed(), wmax = robot.maxRot();
  const sim = [{ t: log[0].t, x: 0, y: 0, yaw: 0 }];
  const relatif = () => {
    const dx = robot.x - x0, dz = robot.z - z0, f = [Math.sin(yaw0), Math.cos(yaw0)], l = [Math.cos(yaw0), -Math.sin(yaw0)];
    return { x: dx * f[0] + dz * f[1], y: dx * l[0] + dz * l[1], yaw: Math.atan2(Math.sin(robot.yaw - yaw0), Math.cos(robot.yaw - yaw0)) };
  };
  for (let i = 1; i < log.length; i++) {
    const a = log[i - 1], dt = log[i].t - a.t;
    const cmd = { ...IDLE, f: Math.max(-1, Math.min(1, a.vx / vmax)), s: Math.max(-1, Math.min(1, -a.vy / vmax)), r: Math.max(-1, Math.min(1, a.wz / wmax)) };
    for (let t = 0; t < dt - 1e-9; t += 1 / 120) robot.update(Math.min(1 / 120, dt - t), cmd);
    sim.push({ t: log[i].t, ...relatif() });
  }
  // galat posisi tiap sampel, galat akhir, rasio panjang lintasan (asli / simulator) dan rasio putaran
  const panjang = (p) => p.reduce((acc, q, i) => (i ? acc + Math.hypot(q.x - p[i - 1].x, q.y - p[i - 1].y) : 0), 0);
  const putar = (p) => p.reduce((acc, q, i) => (i ? acc + Math.abs(Math.atan2(Math.sin(q.yaw - p[i - 1].yaw), Math.cos(q.yaw - p[i - 1].yaw))) : 0), 0);
  const galat = log.map((q, i) => Math.hypot(q.x - sim[i].x, q.y - sim[i].y));
  const rms = Math.sqrt(galat.reduce((a, g) => a + g * g, 0) / galat.length);
  const n = log.length - 1;
  const hasil = {
    rms, akhir: galat[n], maks: Math.max(...galat),
    rasioJarak: panjang(sim) > 0.05 ? panjang(log) / panjang(sim) : null,
    rasioPutar: putar(sim) > 0.1 ? putar(log) / putar(sim) : null,
    sim, log,
  };
  hasil.saran = [];
  if (hasil.rasioJarak && Math.abs(hasil.rasioJarak - 1) > 0.05) hasil.saran.push(`robot asli menempuh ${Math.round(hasil.rasioJarak * 100)} % jarak simulator: ubah Kecepatan kalibrasi menjadi ±${(vmax * hasil.rasioJarak).toFixed(2)} m/s (atau periksa selip roda)`);
  if (hasil.rasioPutar && Math.abs(hasil.rasioPutar - 1) > 0.05) hasil.saran.push(`robot asli berputar ${Math.round(hasil.rasioPutar * 100)} % dari simulator: ubah Putaran menjadi ±${(wmax * hasil.rasioPutar).toFixed(2)} rad/s`);
  if (!hasil.saran.length) hasil.saran.push('simulator cocok dengan robot asli (selisih jarak dan putaran < 5 %)');
  return hasil;
}

// Garis lintasan di lapangan: robot asli (oranye) dan simulator (biru)
export function gambarLintasan(scene, h, { x0 = -1.0, z0 = 4.3, yaw0 = -Math.PI / 2 } = {}) {
  const f = [Math.sin(yaw0), Math.cos(yaw0)], l = [Math.cos(yaw0), -Math.sin(yaw0)];
  const titik = (p) => p.map((q) => new THREE.Vector3(x0 + q.x * f[0] + q.y * l[0], 0.03, z0 + q.x * f[1] + q.y * l[1]));
  const g = new THREE.Group();
  g.name = 'banding';
  for (const [p, warna] of [[h.log, 0xff8a00], [h.sim, 0x3d8bff]]) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(titik(p)), new THREE.LineBasicMaterial({ color: warna })));
  scene.getObjectByName('banding')?.removeFromParent();
  scene.add(g);
  return g;
}
