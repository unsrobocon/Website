// Kontrol layar sentuh (tablet / HP): dua joystick virtual dan tombol aksi, diterjemahkan ke perintah yang
// sama dengan keyboard / stik (js/input.js). Muncul otomatis di perangkat berlayar sentuh
// (pointer: coarse) atau dengan ?sentuh=1; ?sentuh=0 mematikannya.
//   joystick kiri  : maju/mundur + geser      joystick kanan : putar (kiri-kanan) + lift/rahang naik-turun
//   tombol         : Jepit, Rahang −/+ (tahan), Preset ◀ ▶, Ganti robot, Timer, Retry

const TOMBOL = [
  ['grip', 'Jepit'], ['auxMin', 'Rahang −'], ['auxPlus', 'Rahang +'], ['presetPrev', '◀ Preset'], ['presetNext', 'Preset ▶'],
  ['switch', 'Ganti'], ['timer', 'Timer'], ['retry', 'Retry'],
];

export function perluSentuh() {
  const q = new URLSearchParams(location.search).get('sentuh');
  if (q === '1') return true;
  if (q === '0') return false;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export class Sentuh {
  constructor(input) {
    this.input = input;
    this.stik = { kiri: { x: 0, y: 0 }, kanan: { x: 0, y: 0 } };
    this.tahan = new Set();
    const el = document.createElement('div');
    el.id = 'sentuh';
    el.innerHTML = `<div class="js kiri" data-stik="kiri"><span class="kenop"></span></div>
      <div class="js kanan" data-stik="kanan"><span class="kenop"></span></div>
      <div class="tb">${TOMBOL.map(([a, t]) => `<button type="button" data-aksi="${a}">${t}</button>`).join('')}</div>`;
    document.body.appendChild(el);
    this.el = el;
    for (const j of el.querySelectorAll('.js')) this.pasangStik(j);
    for (const b of el.querySelectorAll('button')) this.pasangTombol(b);
  }

  pasangStik(j) {
    const nama = j.dataset.stik, kenop = j.querySelector('.kenop');
    let id = null;
    const gerak = (e) => {
      const r = j.getBoundingClientRect(), R = r.width / 2;
      let dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      this.stik[nama] = { x: dx, y: dy };
      kenop.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    };
    const lepas = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.stik[nama] = { x: 0, y: 0 };
      kenop.style.transform = '';
    };
    j.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      try { j.setPointerCapture(e.pointerId); } catch { /* penunjuk tiruan (uji) */ }
      gerak(e);
      e.preventDefault();
    });
    j.addEventListener('pointermove', (e) => { if (e.pointerId === id) gerak(e); });
    j.addEventListener('pointerup', lepas);
    j.addEventListener('pointercancel', lepas);
  }

  pasangTombol(b) {
    const a = b.dataset.aksi;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('on');
      if (a === 'auxMin' || a === 'auxPlus') this.tahan.add(a);
      else this.input.edges.push({ action: a, shift: false, source: 'sentuh' });
    });
    const lepas = () => { b.classList.remove('on'); this.tahan.delete(a); };
    b.addEventListener('pointerup', lepas);
    b.addEventListener('pointercancel', lepas);
    b.addEventListener('pointerleave', lepas);
  }

  // Perintah robot dari sentuhan (format sama dengan Input.keyboardCmd)
  cmd() {
    const L = this.stik.kiri, K = this.stik.kanan, dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    return {
      f: dz(-L.y), s: dz(L.x), r: dz(-K.x), lift: dz(-K.y),
      aux: (this.tahan.has('auxPlus') ? 1 : 0) - (this.tahan.has('auxMin') ? 1 : 0),
      roll: 0, flip: 0, slow: false,
    };
  }
}
