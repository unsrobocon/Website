// Skenario darurat (?darurat=1): gangguan acak selama pertandingan berjalan, untuk melatih operator dan
// kode otonom menghadapi kejadian tak terduga. Tiap 20–40 detik (jam simulasi, biji ?seed=) satu kejadian:
//   macet   TR atau BR berhenti 3 s (driver motor reset)            — robot tetap di tempat
//   jatuh   benda yang dijepit TR / dihisap BR terlepas              — harus diambil lagi
//   retry   robot tersangkut, wasit memerintahkan Retry               — kembali ke zona awal
//   sky     satu Sky di grid tersenggol (bergeser dan berputar)       — rencana ambil harus disesuaikan

const JENIS = ['macet', 'jatuh', 'retry', 'sky'];

function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Darurat {
  constructor({ rules, robots, objects, retry, events, seed = 1 }) {
    Object.assign(this, { rules, robots, objects, retry, events });
    this.rand = prng(seed * 7919 + 17);
    this.next = 20 + this.rand() * 20;
    this.lepas = [];               // [{ robot, t }] macet yang harus dilepas
    this.kejadian = [];
  }

  // dipanggil tiap langkah simulasi
  update() {
    const R = this.rules, t = R.simT;
    for (const m of this.lepas.splice(0)) { if (t >= m.t) m.robot.frozen = false; else this.lepas.push(m); }
    if (R.phase !== 'running' || R.final) return;
    const jalan = 180 - R.time;
    if (jalan < this.next) return;
    this.next = jalan + 20 + this.rand() * 20;
    // jenis yang bisa terjadi sekarang; pilih acak
    const bisa = JENIS.filter((j) => j !== 'jatuh' || this.robots.some((r) => r.held.length));
    this.picu(bisa[Math.floor(this.rand() * bisa.length)]);
  }

  picu(jenis) {
    const R = this.rules, r = this.robots[Math.floor(this.rand() * this.robots.length)];
    let teks = null;
    if (jenis === 'macet') {
      r.frozen = true;
      this.lepas.push({ robot: r, t: R.simT + 3 });
      teks = `${r.kind} macet 3 detik (driver motor reset)`;
    } else if (jenis === 'jatuh') {
      const h = this.robots.find((x) => x.held.length);
      if (!h) return this.picu('macet');
      const nama = h.held[0].name;
      if (h.kind === 'BR') { h.vacuum = false; h.releaseAll(); } else { h.gripCmd = 'open'; h.releaseAll?.(); }
      teks = `${nama} terlepas dari ${h.kind}`;
    } else if (jenis === 'retry') {
      this.retry(r);
      teks = `${r.kind} tersangkut — wasit memerintahkan Retry`;
    } else {
      const sky = this.objects.list.filter((o) => o.kind === 'sky' && o.state === 'rest' && o.restingOn === 'terrain' && !o.invalid);
      if (!sky.length) return this.picu('macet');
      const o = sky[Math.floor(this.rand() * sky.length)];
      o.mesh.position.x += (this.rand() - 0.5) * 0.12;
      o.mesh.position.z += (this.rand() - 0.5) * 0.12;
      o.mesh.rotateY((this.rand() - 0.5) * 0.8);
      o.mesh.updateMatrixWorld(true);
      teks = `${o.name} tersenggol di grid`;
    }
    this.kejadian.push({ t: R.simT, jenis, teks });
    R.log(`Darurat: ${teks}`, 'warn');
    R.flashFn(`Darurat: ${teks}`);
    this.events.emit('tl', { type: 'darurat', team: this.robots[0].team, robot: r.kind, text: teks });
  }
}
