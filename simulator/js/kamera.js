// Kamera RGB + depth tiruan di robot (untuk kode persepsi tim: deteksi Earth/Sky, ROS 2 sensor_msgs/Image).
// Render offscreen dari titik kamera robot (camNode bila ada, selain itu tiang depan setinggi 0,5 m),
// menghadap ke depan robot dan menunduk TUNDUK derajat. Depth = jarak sepanjang sumbu optik (m), dari pass
// kedua dengan material yang menulis -z ruang pandang ke target float. Hanya dirender bila diminta
// (?kamera=1 bersama ?jembatan=...), PERIODE detik simulasi sekali, karena membaca piksel GPU itu mahal.

import * as THREE from 'three';

export const KAMERA = { lebar: 320, tinggi: 240, fovV: 50, dekat: 0.05, jauh: 10, tunduk: 20, periode: 0.2 };

const MAT_DEPTH = new THREE.ShaderMaterial({
  vertexShader: 'varying float vZ; void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); vZ = -p.z; gl_Position = projectionMatrix * p; }',
  fragmentShader: 'varying float vZ; void main() { gl_FragColor = vec4(vZ, 0.0, 0.0, 1.0); }',
});

// ?sensorBuruk=1: derau piksel, silau (bercak terang) sesekali dan lubang depth (permukaan mengilap)
export const KAMERA_BURUK = { derau: 12, silau: 0.3, lubang: 0.03 };

function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Kamera {
  constructor(robot, { renderer, scene, seed = 51, ...opsi }) {
    this.rand = prng(seed);
    this.robot = robot;
    this.renderer = renderer;
    this.scene = scene;
    this.o = { ...KAMERA, ...opsi };
    const { lebar, tinggi, fovV, dekat, jauh } = this.o;
    this.cam = new THREE.PerspectiveCamera(fovV, lebar / tinggi, dekat, jauh);
    this.rtWarna = new THREE.WebGLRenderTarget(lebar, tinggi);
    this.rtDepth = new THREE.WebGLRenderTarget(lebar, tinggi, { type: THREE.FloatType, format: THREE.RGBAFormat });
    this.bufWarna = new Uint8Array(lebar * tinggi * 4);
    this.bufDepth = new Float32Array(lebar * tinggi * 4);
    this.t = -Infinity;
  }

  // Intrinsik pinhole (piksel): fy dari FOV vertikal, piksel persegi
  intrinsik() {
    const { lebar, tinggi, fovV } = this.o;
    const f = tinggi / 2 / Math.tan(THREE.MathUtils.degToRad(fovV) / 2);
    return { fx: f, fy: f, cx: lebar / 2, cy: tinggi / 2 };
  }

  pasang() {
    const r = this.robot, c = this.cam;
    if (r.camNode) r.camNode.getWorldPosition(c.position);
    else {
      const zf = r.G?.zf ?? 0.3;
      c.position.set(r.x + Math.sin(r.yaw) * zf, r.y + 0.5, r.z + Math.cos(r.yaw) * zf);
    }
    // arah pandang: depan robot, menunduk
    const tk = THREE.MathUtils.degToRad(this.o.tunduk);
    const d = new THREE.Vector3(Math.sin(r.yaw) * Math.cos(tk), -Math.sin(tk), Math.cos(r.yaw) * Math.cos(tk));
    c.up.set(0, 1, 0);
    c.lookAt(c.position.clone().add(d));
    c.updateMatrixWorld(true);
  }

  // Satu bingkai: { lebar, tinggi, rgb: Uint8Array (baris dari atas, rgb8), depth: Uint16Array (mm, 0 = tak terukur) }
  ambil() {
    const R = this.renderer, { lebar, tinggi, jauh } = this.o;
    this.pasang();
    const lamaTarget = R.getRenderTarget(), lamaOverride = this.scene.overrideMaterial, lamaBg = this.scene.background;
    const lamaClear = R.getClearColor(new THREE.Color()), lamaAlpha = R.getClearAlpha();
    try {
      R.setRenderTarget(this.rtWarna);
      R.render(this.scene, this.cam);
      R.readRenderTargetPixels(this.rtWarna, 0, 0, lebar, tinggi, this.bufWarna);
      this.scene.overrideMaterial = MAT_DEPTH;
      this.scene.background = null;
      R.setRenderTarget(this.rtDepth);
      R.setClearColor(0x000000, 0);
      R.clear();
      R.render(this.scene, this.cam);
      R.readRenderTargetPixels(this.rtDepth, 0, 0, lebar, tinggi, this.bufDepth);
    } finally {
      this.scene.overrideMaterial = lamaOverride;
      this.scene.background = lamaBg;
      R.setRenderTarget(lamaTarget);
      R.setClearColor(lamaClear, lamaAlpha);
    }
    const rgb = new Uint8Array(lebar * tinggi * 3), depth = new Uint16Array(lebar * tinggi);
    for (let y = 0; y < tinggi; y++) {
      const src = (tinggi - 1 - y) * lebar;        // GPU: baris dari bawah
      for (let x = 0; x < lebar; x++) {
        const i = src + x, o = y * lebar + x;
        rgb[o * 3] = this.bufWarna[i * 4]; rgb[o * 3 + 1] = this.bufWarna[i * 4 + 1]; rgb[o * 3 + 2] = this.bufWarna[i * 4 + 2];
        const z = this.bufDepth[i * 4];
        depth[o] = z > 0 && z < jauh ? Math.round(z * 1000) : 0;
      }
    }
    if (this.o.derau || this.o.silau || this.o.lubang) this.ganggu(rgb, depth);
    // letak kamera di kerangka robot (x maju, y kiri, z atas dari lantai robot) untuk TF base_link -> kamera
    const r = this.robot, c = this.cam.position, dx = c.x - r.x, dz = c.z - r.z;
    const pose = { maju: dx * Math.sin(r.yaw) + dz * Math.cos(r.yaw), kiri: dx * Math.cos(r.yaw) - dz * Math.sin(r.yaw), tinggi: c.y - r.y, tunduk: THREE.MathUtils.degToRad(this.o.tunduk) };
    return { lebar, tinggi, rgb, depth, pose, ...this.intrinsik() };
  }
}

Kamera.prototype.ganggu = function ganggu(rgb, depth) {
  const { lebar, tinggi, derau = 0, silau = 0, lubang = 0 } = this.o, R = this.rand;
  if (derau) for (let i = 0; i < rgb.length; i++) rgb[i] = Math.max(0, Math.min(255, rgb[i] + (R() + R() + R() - 1.5) * derau * 1.4));
  if (silau && R() < silau) {                       // bercak silau lampu arena
    const cx = R() * lebar, cy = R() * tinggi * 0.6, rad = 20 + R() * 40;
    for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(tinggi, cy + rad); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(lebar, cx + rad); x++) {
      const k = 1 - Math.hypot(x - cx, y - cy) / rad;
      if (k <= 0) continue;
      const o = (y * lebar + x) * 3;
      for (let c = 0; c < 3; c++) rgb[o + c] = Math.min(255, rgb[o + c] + 255 * k);
    }
  }
  if (lubang) for (let n = Math.floor(lubang * lebar * tinggi / 16); n > 0; n--) {   // lubang depth 4x4 piksel
    const x0 = Math.floor(R() * (lebar - 4)), y0 = Math.floor(R() * (tinggi - 4));
    for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 4; x++) depth[y * lebar + x] = 0;
  }
};

// Uint8Array -> base64 (potongan agar tidak melampaui batas argumen)
export function keBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
