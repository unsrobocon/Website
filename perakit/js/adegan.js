// Adegan 3D Perakit: lantai, kotak batas Rule 11.5, robot, sorotan bagian, animasi pasang modul.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { pose, ukurAwal } from './bangun.js';

export class Adegan {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.02, 50);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 6;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.kameraAwal();

    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(1.5, 3, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2, near: 0.5, far: 8 });
    this.scene.add(sun, new THREE.HemisphereLight(0xdde6ff, 0x30302a, 0.5));

    // lantai: warna Ground Area Merah (Rulebook Bagian 14) dengan grid 100 mm
    const lantai = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color: 0x8f8585, roughness: 0.95 }));
    lantai.rotation.x = -Math.PI / 2;
    lantai.receiveShadow = true;
    this.scene.add(lantai);
    const grid = new THREE.GridHelper(2, 20, 0x6a6262, 0x7b7272);
    grid.position.y = 0.001;
    this.scene.add(grid);
    // penunjuk arah depan robot
    const panah = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 3), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
    panah.rotation.x = Math.PI / 2;
    panah.position.set(0, 0.002, 0.5);
    panah.scale.y = 1;
    this.scene.add(panah);

    // kotak batas awal 700 x 700 x 700 (Rule 11.5) dan terjulur (11.6/11.7)
    this.batas = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.7, 0.7, 0.7)), new THREE.LineBasicMaterial({ color: 0x4ade80 }));
    this.batas.position.y = 0.35;
    this.scene.add(this.batas);

    this.robot = null;
    this.u = 0;            // pose 0..1
    this.ujiGerak = false;
    this.anim = [];
    this.sorot = null;
    this.ray = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    new ResizeObserver(() => this.ukur()).observe(canvas.parentElement);
    this.ukur();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  kameraAwal() {
    const dx = this.cad?.visible ? 0.45 : 0;
    this.camera.position.set(1.25 + dx * 1.6, 1.0 + dx * 0.4, 1.45 + dx * 1.4);
    this.controls.target.set(dx, 0.32, 0);
    this.controls.update();
  }

  // Model CAD asli (GLB paket CAD: mm, +X ke depan) ditampilkan di samping rakitan.
  // url null = sembunyikan. Mengembalikan Promise yang selesai saat model tampil.
  async tampilCad(url) {
    this.cadUrl = url;
    if (!url) { if (this.cad) this.cad.visible = false; this.kameraAwal(); return; }
    this.cadCache = this.cadCache || new Map();
    if (!this.cadCache.has(url)) this.cadCache.set(url, new GLTFLoader().loadAsync(url).then((g) => g.scene));
    const scene = await this.cadCache.get(url);
    if (this.cadUrl !== url) return;               // sudah diganti saat memuat
    if (this.cad) this.scene.remove(this.cad);
    const g = new THREE.Group();
    g.name = 'cad';
    const m = scene;
    m.scale.setScalar(0.001);
    m.rotation.y = -Math.PI / 2;                    // +X CAD -> +Z robot (depan)
    m.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    g.add(m);
    g.position.x = 0.9;
    this.cad = g;
    this.scene.add(g);
    this.kameraAwal();
  }

  ukur() {
    const el = this.canvas.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ganti robot; slotBaru = slot yang baru dipasang (dianimasikan jatuh ke tempatnya)
  pasangRobot(robot, slotBaru = null) {
    if (this.robot) {
      this.scene.remove(this.robot);
      this.robot.traverse((n) => { if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });
    }
    this.robot = robot;
    robot.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    this.scene.add(robot);
    pose(robot, this.u);
    this.anim = [];
    if (slotBaru) {
      // animasikan objek teratas milik slot itu
      robot.traverse((n) => {
        if (n.userData.slot === slotBaru && n.parent?.userData.slot !== slotBaru) {
          this.anim.push({ n, y0: n.position.y, s0: n.scale.clone(), t: 0 });
        }
      });
    }
    this.sorot = null;
    this.setSorot(null);
  }

  // ukuran awal (mm) dari batas bagian yang terlihat pada pose awal
  ukuranAwal() {
    if (!this.robot) return null;
    const u = this.u;
    // ukur pada posisi akhir, bukan di tengah animasi pasang
    const simpan = this.anim.map((a) => [a, a.n.position.y, a.n.scale.clone()]);
    for (const a of this.anim) { a.n.position.y = a.y0; a.n.scale.copy(a.s0); }
    const hasil = ukurAwal(this.robot);
    pose(this.robot, u);
    for (const [a, y, sc] of simpan) { a.n.position.y = y; a.n.scale.copy(sc); }
    return hasil;
  }

  setBatas(tampil, ok) {
    this.batas.visible = tampil;
    this.batas.material.color.set(ok ? 0x4ade80 : 0xf87171);
  }

  setSorot(slot) {
    if (!this.robot || this.sorot === slot) return;
    this.sorot = slot;
    this.robot.traverse((n) => {
      if (!n.isMesh || !n.material.emissive) return;
      const d = n.userData;
      if (d.e0 === undefined) { d.e0 = n.material.emissiveIntensity; d.e0c = n.material.emissive.getHex(); }
      const on = slot && d.slot === slot;
      n.material.emissive.setHex(on ? 0x5d8cff : d.e0c);
      n.material.emissiveIntensity = on ? 0.45 : d.e0;
    });
  }

  // slot pada titik layar (x, y dalam piksel kanvas)
  slotDi(x, y) {
    if (!this.robot) return null;
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObject(this.robot, true).find((h) => {
      for (let p = h.object; p; p = p.parent) if (!p.visible) return false;
      return true;
    });
    if (!hit) return null;
    let n = hit.object;
    while (n && !n.userData.slot) n = n.parent;
    return n ? { slot: n.userData.slot, indeks: findIndeks(n) } : null;
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.controls.update();
    if (this.robot) {
      if (this.ujiGerak) {
        this.fase = (this.fase || 0) + dt;
        const u = 0.5 - 0.5 * Math.cos(this.fase * 1.2);
        pose(this.robot, u, Math.sin(this.fase * 2.4));
      }
      for (const a of this.anim) {
        a.t = Math.min(1, a.t + dt / 0.45);
        const e = 1 - Math.pow(1 - a.t, 3);
        a.n.position.y = a.y0 + (1 - e) * 0.35;
        const k = 1 + Math.sin(a.t * Math.PI) * 0.06;
        a.n.scale.set(a.s0.x * k, a.s0.y * k, a.s0.z * k);
      }
      this.anim = this.anim.filter((a) => a.t < 1);
    }
    this.renderer.render(this.scene, this.camera);
  }

  setPose(u) {
    this.u = u;
    if (this.robot && !this.ujiGerak) pose(this.robot, u);
  }

  setUjiGerak(on) {
    this.ujiGerak = on;
    this.fase = 0;
    if (!on && this.robot) pose(this.robot, this.u);
  }
}

function findIndeks(n) {
  for (let p = n; p; p = p.parent) if (p.userData.indeks !== undefined) return p.userData.indeks;
  return null;
}
