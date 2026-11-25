// Main di dua laptop dalam satu jaringan (LAN), lewat tools/arena.py:
//   tuan rumah  ?arena=tuan&lawan=manusia  menjalankan simulasi penuh (satu-satunya sumber kebenaran),
//               mengirim keadaan 20 kali per detik dan memakai perintah tamu untuk TR tim lawan;
//   tamu        http://<ip-tuan>:8027/tamu  (diarahkan ke pengaturan tuan rumah + arena=tamu): tidak
//               mensimulasi, hanya menampilkan keadaan tuan rumah (diinterpolasi seperti putar ulang,
//               js/rekam.js) dan mengirim keyboard/stik/sentuhan pemain ke tuan rumah 30 kali per detik.
// Perintah tamu yang lebih tua dari 0,5 s diabaikan (TR lawan berhenti) bila jaringan putus.

const KIRIM = 50, INPUT = 33, BASI = 500, TUNDA = 0.12;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function modeArena() {
  const m = new URLSearchParams(location.search).get('arena');
  return m === 'tuan' || m === 'tamu' ? m : null;
}

const kirim = (url, isi) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isi) });

export class ArenaTuan {
  constructor({ rekam, rules, logFn }) {
    Object.assign(this, { rekam, rules, logFn });
    this.sibukKirim = false;
    this.sibukAmbil = false;
    this.tKirim = 0;
    this.cmd = null;
    this.tCmd = -Infinity;
    this.edges = [];
    this.tamuAda = false;
    kirim('/api/arena/info', { query: location.search }).catch(() => logFn('Arena: tools/arena.py tidak menjawab — jalankan: python tools/arena.py', 'bad'));
  }

  // keadaan lengkap satu bingkai (semua benda), format bingkai js/rekam.js
  bingkai() {
    const R = this.rules, K = this.rekam;
    return { t: r3(R.simT), clock: R.clock(), phase: R.phase, score: { ...R.score }, r: K.robots.map((r) => K.robotState(r)), o: K.objects.list.map((o) => K.objState(o)), key: true };
  }

  // jaringan berjalan dengan timer sendiri (tidak bergantung pada kecepatan gambar layar)
  mulai() {
    if (this.timer) return;
    this.timer = setInterval(() => this.kirimKeadaan(), KIRIM);
    this.timerInput = setInterval(() => this.ambilInput(), INPUT);
  }

  kirimKeadaan() {
    if (this.sibukKirim) return;
    this.sibukKirim = true;
    kirim('/api/arena/keadaan', this.bingkai()).catch(() => {}).finally(() => { this.sibukKirim = false; });
  }

  ambilInput() {
    if (this.sibukAmbil) return;
    this.sibukAmbil = true;
    fetch('/api/arena/input').then((r) => r.json()).then((d) => {
      if (d && d.cmd) {
        if (d.baru) { this.cmd = d.cmd; this.tCmd = performance.now(); }
        this.edges.push(...(d.edges || []));
        if (!this.tamuAda) { this.tamuAda = true; this.logFn('Arena: tamu terhubung — TR tim lawan dikemudikan pemain kedua', 'ok'); }
      }
    }).catch(() => {}).finally(() => { this.sibukAmbil = false; });
  }

  update() { this.mulai(); }

  // perintah TR lawan dari tamu (null bila belum ada / basi)
  foeCmd() { return this.cmd && performance.now() - this.tCmd < BASI ? this.cmd : null; }

  // tombol tamu (jepit, Retry, preset) sebagai aksi untuk TR lawan
  ambilEdges() { return this.edges.splice(0).map((a) => ({ action: a, shift: false, source: 'arena', target: 'foe' })); }
}

export class ArenaTamu {
  constructor({ rekam, rules, input, logFn }) {
    Object.assign(this, { rekam, rules, input, logFn });
    rekam.reset();
    rekam.playing = { t: 0, speed: 0, paused: true };    // simulasi lokal berhenti, model mengikuti bingkai
    this.akhir = null;
    this.sibuk = false;
    this.sibukInput = false;
    this.tInput = 0;
    this.edges = [];
    this.terhubung = false;
    // jam dan fase dari tuan rumah
    rules.clock = () => (this.akhir ? this.akhir.clock : '3:00');
  }

  // aksi yang diteruskan ke tuan rumah (sisanya — kamera, bantuan — tetap lokal)
  teruskan(e) {
    if (/^(grip|retry|preset)/.test(e.action)) { this.edges.push(e.action); return true; }
    return false;
  }

  mulai() {
    if (this.timer) return;
    this.timer = setInterval(() => this.ambilKeadaan(), KIRIM);
    this.timerInput = setInterval(() => this.kirimInput(), INPUT);
  }

  ambilKeadaan() {
    if (this.sibuk) return;
    this.sibuk = true;
    fetch('/api/arena/keadaan').then((r) => r.json()).then((f) => {
      if (!f || !f.r || (this.akhir && f.t <= this.akhir.t)) return;
      if (!this.terhubung) { this.terhubung = true; this.logFn('Arena: terhubung ke tuan rumah — Anda mengemudikan TR tim lawan', 'ok'); }
      this.akhir = f;
      this.tAkhir = performance.now();
      const K = this.rekam;
      K.frames.push(f);
      if (K.frames.length > 40) K.frames.splice(0, K.frames.length - 40);
      this.rules.score = { ...f.score };
      this.rules.phase = f.phase;
    }).catch(() => {}).finally(() => { this.sibuk = false; });
  }

  kirimInput() {
    if (this.sibukInput || !this.cmd) return;
    this.sibukInput = true;
    kirim('/api/arena/input', { cmd: this.cmd, edges: this.edges.splice(0) }).catch(() => {}).finally(() => { this.sibukInput = false; });
  }

  // dipanggil tiap bingkai tampilan: simpan perintah pemain, tampilkan keadaan terbaru (diinterpolasi)
  update(dt, cmd) {
    this.mulai();
    this.cmd = cmd;
    const K = this.rekam, P = K.playing;
    if (!K.frames.length) return;
    // waktu tampil = jam bingkai terbaru + waktu sejak diterima - tunda kecil, agar gerak halus
    const target = Math.min(this.akhir.t, this.akhir.t + (performance.now() - this.tAkhir) / 1000 - TUNDA);
    P.t = Math.max(K.frames[0].t, target);
    K.show(P.t);
  }
}
