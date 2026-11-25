// Robot "kotak": digambar dari kotak dan silinder three.js menurut geometri profil (js/profiles.js),
// untuk desain yang belum punya model CAD. Semua ukuran dalam meter, kerangka lokal robot
// (x ke kiri, y ke atas, z ke depan, titik asal di lantai pada pusat robot).
// Fungsi build* mengembalikan THREE.Group; sambungan geraknya ada di group.userData.box
// dan dipakai BuilderRobot / TransporterRobot sebagai pengganti rig CAD.
//
// Nama mesh roda (B01_Roda_mecanum…) dan rol track (C03_…) sengaja sama dengan model CAD, supaya
// Robot.rigWheels() / BuilderRobot.rigWheels() memutar roda kotak dengan kode yang sama.

import * as THREE from 'three';

const M = {
  frame: new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.3, roughness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x30343a, metalness: 0.2, roughness: 0.6 }),
  wheel: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.8 }),
  hub: new THREE.MeshStandardMaterial({ color: 0xd9a400, metalness: 0.3, roughness: 0.5 }),
  accentBR: new THREE.MeshStandardMaterial({ color: 0x2fa36b, metalness: 0.2, roughness: 0.55 }),
  accentTR: new THREE.MeshStandardMaterial({ color: 0xe08a1e, metalness: 0.2, roughness: 0.55 }),
  pad: new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.9 }),
  cup: new THREE.MeshStandardMaterial({ color: 0x3b6fd1, roughness: 0.6 }),
};

// Kotak dari batas [x0,x1] [y0,y1] [z0,z1]
function box(parent, x0, x1, y0, y1, z0, z1, mat = M.frame, name = '') {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.name = name;
  parent.add(m);
  return m;
}

// Silinder dengan sumbu X robot (roda, rol)
function axle(parent, x, y, z, r, w, mat, name) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20), mat);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  m.name = name;
  parent.add(m);
  return m;
}

// Empat roda mecanum di G.wheel = [|x|, z depan, z belakang, jari-jari]
function wheels(g, G) {
  const [wx, zf, zr, r] = G.wheel;
  let i = 0;
  for (const z of [zf, zr]) for (const x of [wx, -wx]) {
    const w = new THREE.Group();
    w.name = `B0${1 + (i++ % 2)}_Roda_mecanum_kotak`;
    w.position.set(x, r, z);
    axle(w, 0, 0, 0, r, 0.04, M.wheel, 'ban');
    axle(w, 0, 0, 0, r * 0.45, 0.042, M.hub, 'hub');
    // garis rol agar putaran roda terlihat
    box(w, -0.021, 0.021, r * 0.55, r * 1.01, -0.006, 0.006, M.hub, 'rol');
    g.add(w);
  }
}

// ---------------------------------------------------------------- BR
export function buildBoxBR(G, P) {
  const g = new THREE.Group();
  g.name = 'BR_kotak';
  const hw = G.hw, zr = G.zr, zf = G.zf, rw = G.wheel[3];
  // rangka bawah + pelat
  box(g, -hw, hw, rw + 0.01, rw + 0.05, zr, zf, M.frame, 'rangka');
  box(g, -hw + 0.01, hw - 0.01, rw + 0.05, rw + 0.06, zr + 0.01, zf - 0.01, M.accentBR, 'pelat');
  wheels(g, G);

  // tiang lift: tiang tetap di belakang carriage, tiang bergerak naik sebesar tahap 2
  const mastZ = Math.min(zf - 0.06, 0.12), mastTop = G.bodyH;
  box(g, -0.05, -0.03, rw + 0.06, mastTop, mastZ - 0.02, mastZ + 0.02, M.frame, 'tiang tetap kiri');
  box(g, 0.03, 0.05, rw + 0.06, mastTop, mastZ - 0.02, mastZ + 0.02, M.frame, 'tiang tetap kanan');
  const mast = new THREE.Group();
  mast.name = 'tiang bergerak';
  box(mast, -0.025, 0.025, rw + 0.1, mastTop - 0.01, mastZ - 0.015, mastZ + 0.015, M.dark, 'tiang');
  g.add(mast);

  // carriage (tinggi pusat cup) -> boom (juluran) -> wrist (roll pada sumbu boom) -> effector
  const carriage = new THREE.Group();
  carriage.name = 'carriage';
  box(carriage, -0.07, 0.07, -0.04, 0.04, mastZ + 0.02, mastZ + 0.06, M.accentBR, 'carriage');
  g.add(carriage);
  const boom = new THREE.Group();
  boom.name = 'boom';
  const reach = G.cupReach;
  box(boom, -0.02, 0.02, -0.02, 0.02, mastZ - 0.1, reach - 0.06, M.frame, 'lengan boom');
  carriage.add(boom);
  const wrist = new THREE.Group();
  wrist.name = 'wrist';
  wrist.position.z = reach;
  boom.add(wrist);
  box(wrist, -0.03, 0.03, -0.03, 0.03, -0.075, -G.cupHz * 2, M.dark, 'motor wrist');
  box(wrist, -G.cupHx, G.cupHx, -G.cupHy, G.cupHy, -G.cupHz * 2, -0.012, M.accentBR, 'pelat cup');
  for (const x of [-G.cupHx * 0.66, 0, G.cupHx * 0.66]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.012, 16), M.cup);
    c.rotation.x = Math.PI / 2;
    c.position.set(x, 0, -0.006);
    c.name = 'cup';
    wrist.add(c);
  }
  // kerangka effector meniru model CAD: sumbu -Y effector = arah hadap cup
  const effector = new THREE.Object3D();
  effector.rotation.x = -Math.PI / 2;
  wrist.add(effector);

  // dua track tangga + flipper di ujung depan
  const tracks = [];
  const rollers = [];
  const flippers = [];
  const tx = (G.trackIn + G.trackOut) / 2, tw = G.trackOut - G.trackIn, th = 0.07;
  for (const sx of [-1, 1]) {
    const t = new THREE.Group();
    t.name = 'track';
    t.position.y = 0.018;
    box(t, sx * tx - tw / 2, sx * tx + tw / 2, 0.006, th - 0.006, G.trackZ0 + 0.03, zf - 0.03, M.wheel, 'sabuk');
    for (const z of [G.trackZ0 + 0.035, zf - 0.035]) rollers.push(axle(t, sx * tx, th / 2, z, th / 2, tw + 0.004, M.dark, 'C03_rol_kotak'));
    const f = new THREE.Group();
    f.name = 'flipper';
    f.position.set(sx * tx, th / 2, zf - 0.035);
    box(f, -tw / 2, tw / 2, -0.012, 0.012, -0.17, 0, M.accentBR, 'lengan flipper');
    t.add(f);
    flippers.push(f);
    g.add(t);
    tracks.push(t);
  }

  const camNode = new THREE.Object3D();
  camNode.position.set(hw * 0.74, Math.min(mastTop, 0.66), mastZ - 0.18);
  g.add(camNode);

  g.userData.box = {
    effector,
    effectorNormal: new THREE.Vector3(0, -1, 0),
    camNode,
    rollers,
    // r: BuilderRobot (h, e, roll, track, flip, liftStages)
    apply(r) {
      const { m } = r.liftStages();
      mast.position.y = m / 1000;
      carriage.position.y = r.h / 1000;
      boom.position.z = r.e / 1000;
      wrist.rotation.z = -THREE.MathUtils.degToRad(r.roll);
      for (const t of tracks) t.position.y = 0.018 - P.trackDrop * r.track;
      for (const f of flippers) f.rotation.x = THREE.MathUtils.degToRad(r.flip);
    },
  };
  return g;
}

// ---------------------------------------------------------------- TR
export function buildBoxTR(G, P) {
  const g = new THREE.Group();
  g.name = 'TR_kotak';
  const hw = G.hw, zr = G.zr, zf = G.zf, ai = G.armIn, rw = G.wheel[3];
  // rangka U: dua lengan + bagian belakang
  for (const sx of [-1, 1]) {
    box(g, sx * ai, sx * hw, rw + 0.01, rw + 0.06, zr, zf, M.frame, 'lengan');
    box(g, sx * ai, sx * (ai + 0.012), rw + 0.06, Math.min(G.armH, rw + 0.12), zr, zf, M.accentTR, 'pelat lengan');
  }
  box(g, -hw, hw, rw + 0.01, rw + 0.06, zr, G.rearZ1, M.frame, 'rangka belakang');
  wheels(g, G);
  // tiang lift rahang di bagian belakang
  const mastZ = (zr + G.rearZ1) / 2;
  box(g, -0.06, 0.06, rw + 0.06, G.bodyH, mastZ - 0.025, mastZ + 0.025, M.frame, 'tiang');

  // carriage rahang: naik-turun menurut jaw (mm = tinggi pusat bantalan), maju ke anchorAhead
  const carriage = new THREE.Group();
  carriage.name = 'carriage rahang';
  carriage.position.z = G.anchorAhead;
  g.add(carriage);
  box(carriage, -0.08, 0.08, -0.03, 0.03, mastZ - G.anchorAhead + 0.025, mastZ - G.anchorAhead + 0.06, M.accentTR, 'slider');
  const fz = G.padAhead;
  const jaws = [];
  for (const sx of [-1, 1]) {
    const j = new THREE.Group();
    j.name = sx < 0 ? 'rahang kanan' : 'rahang kiri';
    // jari (bantalan) + batang ke belakang menuju slider
    box(j, -G.padT, G.padT, -G.padHy, G.padHy, fz - G.padHz, fz + G.padHz, M.pad, 'bantalan');
    box(j, -0.01, 0.01, -0.012, 0.012, mastZ - G.anchorAhead + 0.06, fz - G.padHz + 0.01, M.frame, 'batang rahang');
    carriage.add(j);
    jaws.push([sx, j]);
  }
  const anchor = new THREE.Object3D();
  anchor.rotation.x = -Math.PI / 2;            // sama dengan kerangka CAD
  carriage.add(anchor);

  g.userData.box = {
    anchor,
    // r: TransporterRobot (jaw, open)
    apply(r) {
      carriage.position.y = r.jaw / 1000;
      for (const [sx, j] of jaws) j.position.x = sx * (r.open / 2000 + G.padT);
    },
  };
  return g;
}
