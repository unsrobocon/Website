// Lapisan input: keyboard & gamepad (PS4/DualShock, mapping "standard" Gamepad API)
// diterjemahkan ke perintah yang sama, sehingga robot tidak peduli sumber inputnya.

const KEY_ACTIONS = {
  Space: 'grip',
  KeyT: 'track',
  Tab: 'switch',
  KeyC: 'camera',
  Enter: 'timer',
  Backspace: 'retry',
  KeyK: 'freeze',
  KeyH: 'help',
  F1: 'help',
  KeyP: 'reset',
  KeyM: 'minimap',
  KeyU: 'keys',
  KeyO: 'auto',
  KeyI: 'autoTR',
  KeyL: 'timeline',
  KeyV: 'sensorView',
  KeyZ: 'swapZones',
  KeyN: 'mute',
  KeyJ: 'pengarah',
  KeyX: 'rotate90',
  Escape: 'menu',
  Digit1: 'preset1', Digit2: 'preset2', Digit3: 'preset3', Digit4: 'preset4', Digit5: 'preset5', Digit6: 'preset6',
};

// Indeks tombol "standard mapping" (PS4 di Chrome/Edge/Firefox)
export const PAD = {
  CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3,
  L1: 4, R1: 5, L2: 6, R2: 7, SHARE: 8, OPTIONS: 9, L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, PS: 16, TOUCHPAD: 17,
};

export const PAD_ACTIONS = {
  [PAD.CROSS]: 'grip',
  [PAD.CIRCLE]: 'track',
  [PAD.TRIANGLE]: 'camera',
  [PAD.SHARE]: 'switch',
  [PAD.OPTIONS]: 'timer',
  [PAD.TOUCHPAD]: 'retry',
  [PAD.R3]: 'freeze',
  [PAD.PS]: 'auto',
  [PAD.LEFT]: 'presetPrev',
  [PAD.RIGHT]: 'presetNext',
};

// ---- tombol stik yang bisa diatur sendiri (menu: Atur stik), disimpan di browser ----
// Hanya tombol aksi (bukan stik analog, trigger boom/rahang, L1/R1 wrist dan D↑/D↓ flipper).
const KEY_STIK = 'simabu.stik';
export const NAMA_TOMBOL = ['✕ / A', '○ / B', '□ / X', '△ / Y', 'L1 / LB', 'R1 / RB', 'L2 / LT', 'R2 / RT', 'Share / Back', 'Options / Start', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'PS / Guide', 'Touchpad'];
export const AKSI_STIK = { grip: 'Jepit / vakum', track: 'Track turun / naik', camera: 'Ganti kamera', switch: 'Ganti robot', timer: 'Timer', retry: 'Retry', freeze: 'Freeze BR', auto: 'BR otonom', presetPrev: 'Preset sebelumnya', presetNext: 'Preset berikutnya' };

// peta aksi -> indeks tombol (bawaan + perubahan tersimpan)
export function petaStik() {
  const peta = {};
  for (const [i, a] of Object.entries(PAD_ACTIONS)) peta[a] = Number(i);
  try {
    const s = JSON.parse(localStorage.getItem(KEY_STIK) || '{}');
    for (const [a, i] of Object.entries(s)) if (a in AKSI_STIK && Number.isInteger(i) && i >= 0 && i < NAMA_TOMBOL.length) peta[a] = i;
  } catch { /* diblokir */ }
  return peta;
}

// simpan hanya yang berbeda dari bawaan; aksi lain yang memakai tombol yang sama dilepas
export function simpanStik(peta) {
  const beda = {};
  const bawaan = {};
  for (const [i, a] of Object.entries(PAD_ACTIONS)) bawaan[a] = Number(i);
  for (const [a, i] of Object.entries(peta)) if (bawaan[a] !== i) beda[a] = i;
  try { if (Object.keys(beda).length) localStorage.setItem(KEY_STIK, JSON.stringify(beda)); else localStorage.removeItem(KEY_STIK); } catch { /* diblokir */ }
}

// peta tombol -> aksi; bila dua aksi memakai tombol yang sama, yang diubah pengguna menang
function tombolKeAksi() {
  const peta = petaStik(), out = {};
  let ubah = {};
  try { ubah = JSON.parse(localStorage.getItem(KEY_STIK) || '{}'); } catch { /* diblokir */ }
  for (const [a, i] of Object.entries(peta)) if (!(a in ubah)) out[i] = a;
  for (const [a, i] of Object.entries(peta)) if (a in ubah) out[i] = a;
  return out;
}

const DEAD = 0.12;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

export class Input {
  constructor() {
    this.keys = new Set();
    this.edges = [];
    this.prevPad = new Map();   // index -> array tombol sebelumnya
    this.padSlow = new Map();
    this.shift = false;
    this.padActions = tombolKeAksi();
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'F1'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        const a = KEY_ACTIONS[e.code];
        if (a) this.edges.push({ action: a, shift: e.shiftKey, source: 'kb' });
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  key(c) {
    return this.keys.has(c) ? 1 : 0;
  }

  keyboardCmd() {
    const k = (c) => this.key(c);
    return {
      f: k('KeyW') - k('KeyS'),
      s: k('KeyD') - k('KeyA'),
      r: k('KeyQ') - k('KeyE'),
      lift: k('ArrowUp') - k('ArrowDown'),
      aux: k('ArrowRight') - k('ArrowLeft'),
      roll: k('KeyF') - k('KeyR'),
      flip: k('KeyG') - k('KeyB'),
      slow: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };
  }

  pads() {
    const list = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : [];
    return list;
  }

  padCmd(p) {
    // trigger analog sering tidak kembali tepat ke 0: tanpa deadzone boom/rahang merayap sendiri
    // dan preset batal seketika
    const b = (i) => (p.buttons[i] ? dz(p.buttons[i].value) : 0);
    const ax = (i) => dz(p.axes[i] || 0);
    // L3 = toggle presisi
    const prev = this.prevPad.get(p.index) || [];
    if (p.buttons[PAD.L3]?.pressed && !prev[PAD.L3]) this.padSlow.set(p.index, !this.padSlow.get(p.index));
    return {
      f: -ax(1),
      s: ax(0),
      r: -ax(2),
      lift: -ax(3),
      aux: b(PAD.R2) - b(PAD.L2),
      roll: b(PAD.R1) - b(PAD.L1),
      flip: b(PAD.UP) - b(PAD.DOWN),
      slow: !!this.padSlow.get(p.index) || b(PAD.SQUARE) > 0.5,
    };
  }

  padEdges(p) {
    const prev = this.prevPad.get(p.index) || [];
    const out = [];
    // Stik tanpa touchpad (Xbox): tahan □/X lalu tekan Options/Start = Retry,
    // □/X + Share/Back = Retry BR ke L1 Retry Zone.
    const mod = !!p.buttons[PAD.SQUARE]?.pressed;
    p.buttons.forEach((btn, i) => {
      if (!btn.pressed || prev[i] || !this.padActions[i]) return;
      if (mod && i === PAD.OPTIONS) out.push({ action: 'retry', shift: false, source: 'pad', pad: p.index });
      else if (mod && i === PAD.SHARE) out.push({ action: 'retry', shift: true, source: 'pad', pad: p.index });
      else out.push({ action: this.padActions[i], shift: false, source: 'pad', pad: p.index });
    });
    this.prevPad.set(p.index, p.buttons.map((x) => x.pressed));
    return out;
  }

  // Kembalikan { active: cmd, other: cmd|null, edges: [...] , pads: n }
  // Gamepad #1 -> robot aktif. Bila ada gamepad #2 -> robot lainnya (mode 2 operator).
  // dua = mode 2 pemain (lawan manusia): stik terakhir milik pemain kedua (TR lawan). Dengan satu stik,
  // pemain pertama memakai keyboard; dengan dua stik, stik #1 pemain pertama dan stik #2 pemain kedua.
  poll({ dua = false } = {}) {
    const kb = this.keyboardCmd();
    const pads = this.pads();
    // kontrol layar sentuh (js/sentuh.js) dijumlahkan dengan keyboard untuk robot aktif
    let active = this.sentuh ? merge(kb, this.sentuh.cmd()) : kb, other = null, foe = null;
    const edges = this.edges.splice(0);
    const p2 = dua && pads.length ? pads.length - 1 : -1;
    pads.forEach((p, i) => {
      const c = this.padCmd(p);
      const target = i === p2 ? 'foe' : i === 0 ? 'active' : 'other';
      edges.push(...this.padEdges(p).map((x) => ({ ...x, target })));
      if (target === 'foe') foe = c;
      else if (i === 0) active = merge(active, c);
      else if (i === 1) other = c;
    });
    return { active, other, foe, edges, pads: pads.map((p) => p.id) };
  }
}

function merge(a, b) {
  return {
    f: clamp1(a.f + b.f), s: clamp1(a.s + b.s), r: clamp1(a.r + b.r),
    lift: clamp1(a.lift + b.lift), aux: clamp1(a.aux + b.aux), roll: clamp1(a.roll + b.roll), flip: clamp1(a.flip + b.flip),
    slow: a.slow || b.slow,
  };
}
