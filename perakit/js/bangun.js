// Membangun robot 3D dari hasil rakit.js.
//   - Mekanisme yang bergerak (lift, boom, wrist, track, rahang) memakai robot kotak simulator
//     (simulator/js/boxmodel.js), jadi gerakannya sama persis dengan di arena.
//   - Bagian statis (rangka, tiang, roda bila bukan mecanum, motor, baterai, aksesori) dibuat di sini
//     sebagai "cangkang". Cangkang ini diekspor ke GLB dan dipakai simulator lewat fitur GLB cangkang,
//     sehingga robot di arena terlihat sama dengan rakitan.
// Kerangka lokal robot: x ke kiri, y ke atas, z ke depan, titik asal di lantai pada pusat robot.

import * as THREE from 'three';
import { buildBoxBR, buildBoxTR } from '../../simulator/js/boxmodel.js';

// nama bagian robot kotak yang diganti cangkang (sama dengan RANGKA di simulator/js/main.js)
const RANGKA = new Set(['rangka', 'pelat', 'lengan', 'pelat lengan', 'rangka belakang', 'tiang', 'tiang tetap kiri', 'tiang tetap kanan']);
const RODA = /^B0[12]_Roda_mecanum/;

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2, ...o });
const AKSEN = { BR: 0x2fa36b, TR: 0xe08a1e };

function box(parent, x0, x1, y0, y1, z0, z1, m, name = '') {
  const b = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), m);
  b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.name = name;
  parent.add(b);
  return b;
}
function cyl(parent, r, h, m, name = '', seg = 20) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  c.name = name;
  parent.add(c);
  return c;
}

// slot yang "memiliki" setiap bagian robot kotak (untuk animasi pasang, sorotan dan klik)
function slotBagian(kind, name) {
  if (RODA.test(name)) return 'penggerak';
  if (kind === 'BR') {
    if (['tiang bergerak', 'carriage'].includes(name)) return 'lift';
    if (name === 'track') return 'tangga';
  } else {
    if (name === 'carriage rahang') return 'liftRahang';
  }
  return null;
}

// Cangkang: bagian statis + aksesori. G memakai ukuran rangka + bumper; rangka digambar tanpa bumper.
export function buatCangkang(hasil) {
  const { kind, t, profil } = hasil;
  const { G } = profil;
  const g = new THREE.Group();
  g.name = `cangkang_${kind}`;
  const tag = (o, slot) => { o.traverse((n) => { n.userData.slot = slot; }); return o; };
  const b = t.aksesori.some((x) => x.m.id === 'bumper') ? 0.015 : 0;
  const hw = G.hw - b, zf = G.zf - b, zr = G.zr + b, rw = G.wheel[3];
  const mRangka = mat(t.rangka?.m.warna ?? 0xb9bec6, { metalness: 0.35, roughness: 0.45 });
  const mAksen = mat(AKSEN[kind]);
  const mGelap = mat(0x30343a);

  // ---- rangka (hanya bila slot rangka terisi)
  if (t.rangka) {
    const r = new THREE.Group();
    r.name = 'perakit_rangka';
    if (kind === 'BR') {
      box(r, -hw, hw, rw + 0.01, rw + 0.05, zr, zf, mRangka, 'rangka_bawah');
      box(r, -hw + 0.01, hw - 0.01, rw + 0.05, rw + 0.06, zr + 0.01, zf - 0.01, mAksen, 'pelat_atas');
    } else {
      const ai = G.armIn;
      for (const sx of [-1, 1]) {
        box(r, sx * ai, sx * hw, rw + 0.01, rw + 0.06, zr, zf, mRangka, 'lengan_U');
        box(r, sx * ai, sx * (ai + 0.012), rw + 0.06, Math.min(G.armH, rw + 0.12), zr, zf, mAksen, 'pelat_lengan');
      }
      box(r, -hw, hw, rw + 0.01, rw + 0.06, zr, G.rearZ1, mRangka, 'rangka_belakang');
    }
    g.add(tag(r, 'rangka'));
  }

  // ---- tiang lift (bagian tetap) ikut modul lift
  if (kind === 'BR' && t.lift) {
    const mastZ = Math.min(G.zf - 0.06, 0.12);
    const m = new THREE.Group();
    m.name = 'perakit_tiang';
    for (const sx of [-1, 1]) box(m, sx * 0.03, sx * 0.05, rw + 0.06, G.bodyH, mastZ - 0.02, mastZ + 0.02, mRangka, 'tiang_tetap');
    g.add(tag(m, 'lift'));
  }
  if (kind === 'TR' && t.liftRahang) {
    const mastZ = (G.zr + G.rearZ1) / 2;
    const m = new THREE.Group();
    m.name = 'perakit_tiang';
    box(m, -0.06, 0.06, rw + 0.06, G.bodyH, mastZ - 0.025, mastZ + 0.025, mRangka, 'tiang_rahang');
    g.add(tag(m, 'liftRahang'));
  }

  // ---- roda (bukan mecanum: roda kotak simulator diganti; nama B0x_Roda_mecanum agar ikut berputar)
  const pg = t.penggerak?.m;
  const [wx, wzf, wzr] = G.wheel;
  const mBan = mat(0x1d1f22, { roughness: 0.85 });
  if (pg && pg.drive !== 'mecanum') {
    const roda = new THREE.Group();
    roda.name = 'perakit_roda';
    const titik = pg.drive === 'omni' ? [[wx, wzf], [-wx, wzf], [wx, wzr], [-wx, wzr]] : [[wx, 0], [-wx, 0]];
    titik.forEach(([x, z], i) => {
      const w = new THREE.Group();
      w.name = `B0${1 + (i % 2)}_Roda_mecanum_${pg.drive}${i}`;
      w.position.set(x, rw, z);
      const ban = cyl(w, rw, pg.drive === 'omni' ? 0.03 : 0.045, mBan, 'ban');
      ban.rotation.z = Math.PI / 2;
      const hub = cyl(w, rw * 0.5, 0.05, mat(0xd9a400), 'hub');
      hub.rotation.z = Math.PI / 2;
      if (pg.drive === 'omni') {
        // rol kecil di keliling roda omni
        for (let a = 0; a < 10; a++) {
          const ang = (a / 10) * Math.PI * 2;
          const rol = cyl(w, 0.008, 0.018, mat(0x6b7078), 'rol', 8);
          rol.position.set(0, Math.sin(ang) * rw * 0.92, Math.cos(ang) * rw * 0.92);
          rol.rotation.x = ang;
        }
      } else {
        box(w, -0.024, 0.024, rw * 0.55, rw * 1.01, -0.006, 0.006, mat(0xd9a400), 'garis');
      }
      roda.add(w);
    });
    if (pg.drive === 'diferensial') {
      // caster depan & belakang
      // BR: caster depan & belakang di tengah; TR: depan di ujung kedua lengan U, belakang di tengah
      const casters = kind === 'BR' ? [[0, zf - 0.07], [0, zr + 0.07]]
        : [[(G.armIn + hw) / 2, zf - 0.06], [-(G.armIn + hw) / 2, zf - 0.06], [0, zr + 0.07]];
      for (const [x, z] of casters) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), mat(0x9aa0a8, { metalness: 0.6 }));
        c.position.set(x, 0.022, z);
        c.name = 'caster';
        roda.add(c);
        box(roda, x - 0.015, x + 0.015, 0.04, rw + 0.01, z - 0.015, z + 0.015, mGelap, 'dudukan_caster');
      }
    }
    g.add(tag(roda, 'penggerak'));
  }

  // ---- motor (tabung di dalam tiap roda)
  if (t.motor && pg) {
    const mm = new THREE.Group();
    mm.name = 'perakit_motor';
    const warnaMotor = { pg45: 0x5b6470, pg36: 0x8a93a0, bldc: 0x2b6fd6 }[t.motor.m.id] ?? 0x777777;
    const pos = pg.drive === 'diferensial' ? [[wx, 0], [-wx, 0]] : [[wx, wzf], [-wx, wzf], [wx, wzr], [-wx, wzr]];
    const len = t.motor.m.id === 'pg45' ? 0.09 : 0.075;
    for (const [x, z] of pos) {
      const c = cyl(mm, t.motor.m.id === 'pg45' ? 0.024 : 0.019, len, mat(warnaMotor, { metalness: 0.55 }), 'motor');
      c.rotation.z = Math.PI / 2;
      c.position.set(x - Math.sign(x) * (0.03 + len / 2), rw, z);
    }
    g.add(tag(mm, 'motor'));
  }

  // ---- modul dari paket CAD (bagian statisnya)
  if (kind === 'BR' && t.tangga?.m.id === 'tumpuan-ulir') {
    const tp = new THREE.Group();
    tp.name = 'perakit_tumpuan';
    const mRel = mat(0x9aa3ad, { metalness: 0.6 }), mKaki = mat(0x2fa36b);
    for (const z of [zf - 0.03, zr + 0.03]) {
      for (const sx of [-1, 1]) box(tp, sx * 0.09 - 0.012, sx * 0.09 + 0.012, rw + 0.06, 0.52, z - 0.012, z + 0.012, mRel, 'rel_ulir');
      box(tp, -0.12, 0.12, 0.012, 0.03, z - 0.04, z + 0.04, mKaki, 'kaki_tumpuan');
      box(tp, -0.01, 0.01, 0.03, rw + 0.06, z - 0.01, z + 0.01, mGelap, 'batang_tumpuan');
    }
    g.add(tag(tp, 'tangga'));
  }
  if (kind === 'TR' && t.penjepit?.m.id === 'jepit-pneumatik') {
    const pn = new THREE.Group();
    pn.name = 'perakit_pneumatik';
    const tb = cyl(pn, 0.03, 0.16, mat(0x3a7bd5, { metalness: 0.5 }), 'tabung_udara', 20);
    tb.rotation.x = Math.PI / 2;
    tb.position.set(-(G.armIn + hw) / 2, rw + 0.095, zf - 0.14);
    box(pn, -(G.armIn + hw) / 2 - 0.02, -(G.armIn + hw) / 2 + 0.02, rw + 0.06, rw + 0.075, zf - 0.06, zf - 0.03, mGelap, 'katup');
    g.add(tag(pn, 'penjepit'));
  }

  // ---- baterai & kontroler di atas pelat, di belakang
  const atas = rw + 0.06;
  if (t.baterai) {
    const s = { 'lipo-4s': [0.07, 0.035, 0.14], 'lipo-6s': [0.075, 0.045, 0.15], 'lipo-6s-besar': [0.09, 0.06, 0.17] }[t.baterai.m.id];
    const bt = new THREE.Group();
    bt.name = 'perakit_baterai';
    const x0 = kind === 'TR' ? -(G.hw + G.armIn) / 2 : -hw * 0.55;
    const z0 = kind === 'TR' ? zr + 0.12 : zr + 0.12;
    box(bt, x0 - s[0] / 2, x0 + s[0] / 2, atas, atas + s[1], z0 - s[2] / 2, z0 + s[2] / 2, mat(0xf2c230), 'baterai');
    box(bt, x0 - s[0] / 2 - 0.001, x0 + s[0] / 2 + 0.001, atas + s[1] * 0.4, atas + s[1] * 0.6, z0 - s[2] / 2 - 0.001, z0 + s[2] / 2 + 0.001, mat(0x222222), 'label');
    g.add(tag(bt, 'baterai'));
  }
  if (t.kontroler) {
    const kt = new THREE.Group();
    kt.name = 'perakit_kontroler';
    const x0 = kind === 'TR' ? (G.hw + G.armIn) / 2 : hw * 0.55;
    const big = t.kontroler.m.otonom;
    box(kt, x0 - 0.05, x0 + 0.05, atas, atas + (big ? 0.05 : 0.03), zr + 0.05, zr + (big ? 0.19 : 0.14), mat(0x1b5e3a), 'kotak_kontroler');
    if (big) box(kt, x0 - 0.035, x0 + 0.035, atas + 0.05, atas + 0.065, zr + 0.07, zr + 0.17, mat(0x76b900), 'jetson');
    g.add(tag(kt, 'kontroler'));
  }

  // ---- aksesori
  t.aksesori.forEach((x, i) => {
    const a = new THREE.Group();
    a.name = `perakit_${x.m.id}`;
    const v = x.v || {};
    if (x.m.id === 'kamera') {
      const y = kind === 'BR' ? Math.min(G.bodyH, 0.62) : rw + 0.12;
      const z = kind === 'BR' ? Math.min(G.zf - 0.06, 0.12) + 0.03 : zf - 0.03;
      const xx = kind === 'BR' ? 0.11 : hw - 0.04;
      box(a, xx - 0.045, xx + 0.045, y - 0.02, y + 0.02, z - 0.02, z + 0.02, mGelap, 'kamera');
      const lensa = cyl(a, 0.012, 0.012, mat(0x0d3c8c, { metalness: 0.8, roughness: 0.2 }), 'lensa', 16);
      lensa.rotation.x = Math.PI / 2;
      lensa.position.set(xx, y, z + 0.024);
      if (kind === 'TR') box(a, xx - 0.01, xx + 0.01, rw + 0.06, y - 0.02, z - 0.01, z + 0.01, mGelap, 'tiang_kamera');
    } else if (x.m.id === 'lidar') {
      const h = (v.tinggi ?? 120) / 1000;
      const z = kind === 'BR' ? zr + 0.06 : (zr + G.rearZ1) / 2;
      const xx = kind === 'BR' ? 0 : -0.12;
      box(a, xx - 0.01, xx + 0.01, atas, atas + h, z - 0.01, z + 0.01, mGelap, 'tiang_lidar');
      const l = cyl(a, 0.038, 0.04, mat(0x1d1f22), 'lidar', 24);
      l.position.set(xx, atas + h + 0.02, z);
      const kp = cyl(a, 0.03, 0.012, mat(0xd04545), 'kepala_lidar', 24);
      kp.position.set(xx, atas + h + 0.046, z);
    } else if (x.m.id === 'keranjang') {
      const z0 = zr + 0.015, z1 = zr + 0.2, y0 = atas + 0.07, y1 = y0 + 0.12, xx = 0.12;
      const mk = mat(0xc9a227, { metalness: 0.4 });
      box(a, -xx, xx, y0, y0 + 0.008, z0, z1, mk, 'alas_keranjang');
      for (const sx of [-1, 1]) box(a, sx * xx - 0.004, sx * xx + 0.004, y0, y1, z0, z1, mk, 'sisi_keranjang');
      box(a, -xx, xx, y0, y1, z0, z0 + 0.008, mk, 'belakang_keranjang');
      box(a, -0.012, 0.012, atas, y0, z0 + 0.06, z0 + 0.09, mGelap, 'kaki_keranjang');
    } else if (x.m.id === 'bumper') {
      const mb = mat(0x111111, { roughness: 0.95 });
      const y0 = rw + 0.005, y1 = rw + 0.055;
      box(a, -G.hw, G.hw, y0, y1, G.zr, zr, mb, 'bumper_belakang');
      for (const sx of [-1, 1]) box(a, sx * hw, sx * G.hw, y0, y1, zr, zf, mb, 'bumper_sisi');
      if (kind === 'BR') box(a, -G.hw, G.hw, y0, y1, zf, G.zf, mb, 'bumper_depan');
      else for (const sx of [-1, 1]) box(a, sx * G.armIn, sx * G.hw, y0, y1, zf, G.zf, mb, 'bumper_depan');
    } else if (x.m.id === 'menara-sky') {
      // menara terlipat di sisi kanan belakang + rak 2 Sky (200 mm) di atas lengan kanan
      const xx = (G.armIn + hw) / 2, mRel = mat(0x9aa3ad, { metalness: 0.6 });
      for (const dx of [-0.02, 0.02]) box(a, xx + dx - 0.008, xx + dx + 0.008, atas, 0.66, zr + 0.03, zr + 0.05, mRel, 'rel_teleskop');
      box(a, xx - 0.03, xx + 0.03, 0.6, 0.63, zr + 0.03, zr + 0.3, mAksen, 'lengan_ayun');
      // rak 2 Sky di atas rangka belakang, kiri tiang rahang (tetap di dalam tapak robot)
      const r0 = -hw + 0.03, r1 = Math.min(-0.08, r0 + 0.21), z0 = zr + 0.02, z1 = Math.min(G.rearZ1, z0 + 0.21);
      box(a, r0, r1, atas + 0.25, atas + 0.258, z0, z1, mGelap, 'rak_sky');
      for (const x of [r0, r1 - 0.008]) for (const z of [z0, z1 - 0.008]) box(a, x, x + 0.008, atas, atas + 0.25, z, z + 0.008, mGelap, 'tiang_rak');
    } else if (x.m.id === 'lampu') {
      const xx = kind === 'BR' ? -hw + 0.04 : -hw + 0.04, z = zr + 0.04;
      box(a, xx - 0.008, xx + 0.008, atas, atas + 0.12, z - 0.008, z + 0.008, mGelap, 'tiang_lampu');
      [[0xd23a3a, 0], [0xf0b429, 1], [0x2fa36b, 2]].forEach(([c, j]) => {
        const l = cyl(a, 0.018, 0.024, mat(c, { emissive: c, emissiveIntensity: 0.35 }), 'lampu', 16);
        l.position.set(xx, atas + 0.13 + j * 0.026, z);
      });
    } else if (x.m.id === 'estop') {
      const xx = kind === 'BR' ? hw - 0.05 : hw - 0.04, z = zr + 0.04;
      box(a, xx - 0.03, xx + 0.03, atas, atas + 0.04, z - 0.03, z + 0.03, mat(0xf0c419), 'kotak_estop');
      const tb = cyl(a, 0.022, 0.02, mat(0xd01f1f), 'tombol', 20);
      tb.position.set(xx, atas + 0.05, z);
    }
    a.userData.indeks = i;
    g.add(tag(a, 'aksesori'));
  });
  return g;
}

// Robot lengkap untuk pratinjau: robot kotak simulator (bagian statis disembunyikan) + cangkang
export function bangunRobot(hasil) {
  const { kind, t, profil } = hasil;
  const { G, P } = profil;
  const robot = new THREE.Group();
  robot.name = `robot_${kind}`;
  const kotak = (kind === 'BR' ? buildBoxBR : buildBoxTR)(G, P);
  // bahan dipakai bersama di boxmodel.js; salin agar sorotan tidak mengubah robot lain
  kotak.traverse((n) => { if (n.isMesh) n.material = n.material.clone(); });
  const ganti = t.penggerak && t.penggerak.m.drive !== 'mecanum';
  for (const c of [...kotak.children]) {
    if (RANGKA.has(c.name) || (RODA.test(c.name) && (ganti || !t.penggerak))) { kotak.remove(c); continue; }
    const s = slotBagian(kind, c.name);
    if (s) c.traverse((n) => { n.userData.slot = s; });
  }
  // bagian mekanisme yang slotnya kosong disembunyikan
  const sembunyi = (pred) => kotak.traverse((n) => { if (pred(n)) n.visible = false; });
  if (kind === 'BR') {
    kotak.traverse((n) => {
      if (n.name === 'boom' || n.name === 'lengan boom') n.userData.slot = 'boom';
      if (n.name === 'wrist') n.traverse((m) => { m.userData.slot = 'ujung'; });
    });
    if (!t.lift) sembunyi((n) => n.name === 'tiang bergerak' || n.name === 'carriage');
    if (!t.boom) sembunyi((n) => n.name === 'lengan boom');
    if (!t.ujung) sembunyi((n) => n.name === 'wrist');
    if (!t.tangga) sembunyi((n) => n.name === 'track');
  } else {
    kotak.traverse((n) => { if (/^rahang/.test(n.name)) n.traverse((m) => { m.userData.slot = 'penjepit'; }); });
    if (!t.liftRahang) sembunyi((n) => n.name === 'slider');
    if (!t.penjepit) sembunyi((n) => /^rahang/.test(n.name));
  }
  robot.add(kotak);
  const cangkang = buatCangkang(hasil);
  cangkang.traverse((n) => { if (n.isMesh) n.material = n.material.clone(); });
  robot.add(cangkang);
  robot.userData = { kotak, cangkang, G, P, kind };
  return robot;
}

// Pose robot: 0 = pose awal pertandingan, 1 = semua mekanisme terjulur penuh
export function pose(robot, u = 0, osc = 0) {
  const { kotak, P, kind } = robot.userData;
  const api = kotak.userData.box;
  if (kind === 'BR') {
    const h = P.h.start + (P.h.max - P.h.start) * u;
    const r = {
      h, e: P.e.max * u, roll: 0, track: 0, flip: 0,
      liftStages() {
        const c = Math.min(P.stage1, Math.max(0, h - P.h.min));
        const m = Math.min(P.stage2, Math.max(0, h - P.h.min - P.stage1));
        return { c, m };
      },
    };
    r.roll = osc * 90;
    api.apply(r);
  } else {
    api.apply({ jaw: P.jaw.start + (P.jaw.max - P.jaw.start) * u, open: P.open.start - (P.open.start - P.open.min) * Math.max(0, osc) });
  }
}

// Ukuran awal [panjang (z), lebar (x), tinggi (y)] mm dari bagian yang terlihat pada pose awal
// (bentuk sama dengan ukuran() simulator). Robot dibiarkan pada pose awal.
export function ukurAwal(robot) {
  pose(robot, 0);
  robot.updateMatrixWorld(true);
  const b = new THREE.Box3();
  const tampak = (n) => { for (let p = n; p; p = p.parent) if (!p.visible) return false; return true; };
  robot.traverse((n) => {
    if (!n.isMesh || !tampak(n)) return;
    n.geometry.computeBoundingBox();
    b.union(n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld));
  });
  if (b.isEmpty()) return null;
  const s = b.getSize(new THREE.Vector3());
  return [Math.round(s.z * 1000), Math.round(s.x * 1000), Math.round(b.max.y * 1000)];
}

export function buang(obj) {
  obj.traverse((n) => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
}
