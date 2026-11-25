// Rekam & putar ulang pertandingan.
// Rekaman: 10 bingkai per detik. Tiap bingkai menyimpan pose dan sendi semua robot, skor dan jam;
// pose benda disimpan penuh tiap 2 detik (bingkai kunci) dan di antaranya hanya benda yang berubah.
// Putar ulang menghentikan simulasi dan menggerakkan model robot dan benda menurut rekaman. Setelah
// pemutar ditutup, lapangan direset (keadaan benda tidak bisa dikembalikan dari rekaman).

const RATE = 0.1, KEY_EVERY = 20, MAX_FRAMES = 3600;     // 6 menit
const r3 = (v) => Math.round(v * 1000) / 1000;
const JOINTS = { BR: ['h', 'e', 'roll', 'track', 'flip'], TR: ['jaw', 'open'] };

export class Rekaman {
  constructor({ rules, objects, robots, scene }) {
    this.rules = rules;
    this.objects = objects;
    this.robots = robots;
    this.scene = scene;
    this.reset();
  }

  reset() {
    this.frames = [];
    this.next = 0;
    this.last = new Map();      // id benda -> string pose terakhir yang disimpan
    this.playing = null;        // keadaan pemutar
    this.suara = [];            // komentar pengarah: [{ t0, t1, data (data URL) }] (js/pengarah.js)
  }

  robotState(r) {
    return [r3(r.x), r3(r.y), r3(r.z), r3(r.yaw), r3(r.pitch), r3(r.rollAng), ...JOINTS[r.kind].map((k) => r3(r[k]))];
  }

  objState(o) {
    if (o.state === 'gone') return [o.id, 0];
    const p = o.worldPos(), q = o.mesh.getWorldQuaternion(o.mesh.quaternion.clone());
    return [o.id, 1, r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w)];
  }

  // Dipanggil sesudah tiap langkah simulasi
  capture() {
    if (this.playing) return;
    const R = this.rules;
    if (R.simT < this.next) return;
    this.next = Math.max(this.next + RATE, R.simT - RATE);   // kisi tetap 10 bingkai/s
    const key = this.frames.length % KEY_EVERY === 0;
    const objs = [];
    for (const o of this.objects.list) {
      const s = this.objState(o), sig = s.join(',');
      if (key || this.last.get(o.id) !== sig) { objs.push(s); this.last.set(o.id, sig); }
    }
    this.frames.push({
      t: r3(R.simT), clock: R.clock(), phase: R.phase, score: { ...R.score },
      r: this.robots.map((r) => this.robotState(r)), o: objs, key,
    });
    if (this.frames.length > MAX_FRAMES) {
      // buang bagian awal sampai bingkai kunci berikutnya
      const cut = this.frames.findIndex((f, i) => i > 0 && f.key);
      this.frames.splice(0, cut > 0 ? cut : 1);
    }
  }

  get duration() {
    return this.frames.length ? this.frames[this.frames.length - 1].t - this.frames[0].t : 0;
  }

  // ---- putar ulang ----
  start() {
    if (this.frames.length < 2) return false;
    // semua benda dipindah ke scene agar pose dunia bisa diatur langsung
    for (const o of this.objects.list) {
      if (o.mesh.parent !== this.scene) this.scene.attach(o.mesh);
    }
    this.playing = { t: this.frames[0].t, speed: 1, paused: false };
    this.show(this.playing.t);
    return true;
  }

  stop() { this.playing = null; }

  update(dt) {
    const P = this.playing;
    if (!P || P.paused) return;
    const end = this.frames[this.frames.length - 1].t;
    P.t = Math.min(end, P.t + dt * P.speed);
    if (P.t >= end) P.paused = true;
    this.show(P.t);
  }

  seek(t) {
    if (!this.playing) return;
    this.playing.t = Math.max(this.frames[0].t, Math.min(this.frames[this.frames.length - 1].t, t));
    this.show(this.playing.t);
  }

  index(t) {
    let lo = 0, hi = this.frames.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.frames[m].t <= t) lo = m; else hi = m - 1; }
    return lo;
  }

  frameAt(t) { return this.frames[this.index(t)]; }

  show(t) {
    const i = this.index(t);
    let k = i;
    while (k > 0 && !this.frames[k].key) k--;
    // keadaan benda: bingkai kunci lalu perubahan sampai bingkai i
    const pose = new Map();
    for (let j = k; j <= i; j++) for (const s of this.frames[j].o) pose.set(s[0], s);
    const byId = new Map(this.objects.list.map((o) => [o.id, o]));
    for (const [id, s] of pose) {
      const o = byId.get(id);
      if (!o) continue;
      if (!o.mesh.parent) this.scene.add(o.mesh);
      o.mesh.visible = s[1] === 1;
      if (s[1] === 1) { o.mesh.position.set(s[2], s[3], s[4]); o.mesh.quaternion.set(s[5], s[6], s[7], s[8]); }
    }
    // robot diinterpolasi di antara dua bingkai agar gerak halus (juga saat diperlambat)
    const f = this.frames[i], g = this.frames[Math.min(i + 1, this.frames.length - 1)];
    const a = g.t > f.t ? Math.max(0, Math.min(1, (t - f.t) / (g.t - f.t))) : 0;
    const mix = (u, v) => u + (v - u) * a;
    const mixAng = (u, v) => u + Math.atan2(Math.sin(v - u), Math.cos(v - u)) * a;
    f.r.forEach((st, n) => {
      const r = this.robots[n], nx = g.r[n] || st;
      if (!r) return;
      r.x = mix(st[0], nx[0]); r.y = mix(st[1], nx[1]); r.z = mix(st[2], nx[2]);
      r.yaw = mixAng(st[3], nx[3]); r.pitch = mix(st[4], nx[4]); r.rollAng = mix(st[5], nx[5]);
      JOINTS[r.kind].forEach((key, j) => { r[key] = mix(st[6 + j], nx[6 + j]); });
      r.applyJoints();
      r.syncGroup();
    });
    return f;
  }

  toJSON(info = {}) {
    return { versi: 1, info, robots: this.robots.map((r) => `${r.team}:${r.kind}`), frames: this.frames, suara: this.suara };
  }

  load(data) {
    if (!data || data.versi !== 1 || !Array.isArray(data.frames) || data.frames.length < 2) throw new Error('berkas rekaman tidak dikenal');
    const want = this.robots.map((r) => `${r.team}:${r.kind}`).join(',');
    if (data.robots.join(',') !== want) throw new Error(`rekaman untuk robot ${data.robots.join(', ')} — buka simulator dengan pengaturan yang sama (tim, lawan)`);
    this.frames = data.frames;
    this.suara = Array.isArray(data.suara) ? data.suara.filter((x) => x && typeof x.data === 'string' && x.data.startsWith('data:audio/')) : [];
  }
}
