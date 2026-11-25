// Suara pertandingan dari Web Audio API (tanpa berkas): nada mulai, hitung mundur 10 detik terakhir,
// buzzer akhir (4.6.1) dan bunyi pendek saat pelanggaran. Browser baru mengizinkan suara setelah
// pemain menekan tombol atau mengeklik, jadi audio disiapkan pada interaksi pertama. Tombol N = bisu.

export class Suara {
  constructor(events, rules, { aktif = true } = {}) {
    this.rules = rules;
    this.on = aktif;
    this.ctx = null;
    this.lastSec = null;
    this.dimainkan = [];          // jejak nada (untuk uji dan debug)
    events.on('tl', (e) => {
      if (e.type === 'mulai') this.mulai();
      else if (e.type === 'selesai') this.buzzer();
      else if (e.type === 'pelanggaran') this.peringatan();
    });
    const buka = () => this.siapkan();
    window.addEventListener('keydown', buka);
    window.addEventListener('pointerdown', buka);
  }

  siapkan() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  nada(nama, freq, dur, { type = 'square', vol = 0.12, delay = 0 } = {}) {
    if (!this.on) return;
    this.dimainkan.push(nama);
    if (this.dimainkan.length > 50) this.dimainkan.shift();
    this.siapkan();
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay, osc = c.createOscillator(), g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.05));
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  mulai() { this.nada('mulai', 880, 0.7, { type: 'sawtooth', vol: 0.18 }); }
  hitung() { this.nada('hitung', 1000, 0.08); }
  buzzer() { this.nada('buzzer', 220, 1.3, { type: 'sawtooth', vol: 0.25 }); }
  peringatan() { this.nada('peringatan', 520, 0.12); this.nada('peringatan2', 400, 0.12, { delay: 0.15 }); }

  toggle() { this.on = !this.on; return this.on; }

  // dipanggil tiap frame: bip tiap detik pada 10 detik terakhir
  update() {
    const R = this.rules;
    if (R.phase !== 'running' || R.time > 10) { this.lastSec = null; return; }
    const sec = Math.ceil(R.time);
    if (sec !== this.lastSec && sec > 0 && sec <= 10) this.hitung();
    this.lastSec = sec;
  }
}
