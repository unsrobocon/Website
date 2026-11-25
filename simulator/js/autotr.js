// Mode otonom Transporter Robot (Rule 11.2: TR boleh otomatis).
// TR mengambil kolom Earth dari Storage, Sky dari grid dan Mustika dari pilarnya, lalu mengantar
// ke Transfer Area mengikuti rencana strategi (js/strategy.js).
// Pose jepit dicari dengan uji tabrakan milik simulator, jadi berlaku untuk tata letak Storage
// mana pun, grid Sky, dan ukuran TR yang berbeda.

import { FIELD } from './config.js';
import { transferRect, storageRect, inRect, regionAt } from './field.js';
import { worldToLocal, obbCorners, clamp } from './geom.js';
import { AutoPilot, Abort, IDLE } from './autopilot.js';
import { strategiOf, targetsFor } from './strategy.js';

const H = Math.PI / 2;
// Titik lewat di Ground Area (|x|, z) dan sambungannya
const NODES = { C1: [4.75, 4.2], C2: [4.75, 0], C3: [4.75, -3.7], R0: [3.5, -3.7], E0: [2.7, -3.8], M0: [1.3, -4.25], K0: [1.7, 4.25] };
const LINKS = { C1: ['C2', 'K0'], C2: ['C1', 'C3'], C3: ['C2', 'R0'], R0: ['C3', 'E0'], E0: ['R0', 'M0'], M0: ['E0'], K0: ['C1'] };
const DROP_Z = 1.3;           // z pusat benda saat ditaruh di Transfer Area

const job = (label, fn) => Object.assign(fn, { label });

export class AutoTransporter extends AutoPilot {
  constructor(tr, ctx) {
    super(tr, ctx);
    this.tr = tr;
    this.strategi = strategiOf(ctx.strategi);
    this.T = targetsFor(this.team);
    this.skip = { E: 0, S: 0 };            // jam simulasi sampai kapan langkah Earth / Sky dilewati
  }

  reset() { super.reset(); this.skip = { E: 0, S: 0 }; }

  toggle() {
    const on = super.toggle();
    if (on && !this.ai && !this.reachLogged) {
      this.reachLogged = true;
      const n = this.skyReach(), total = this.skies().length;
      this.log(`${n} dari ${total} Sky di grid bisa dijangkau dari sisi sendiri dengan rangka ini (sisanya tertutup Sky lain atau di luar batas area, 6.1.2)`, n >= 2 ? 'info' : 'warn');
      if (n < 2) this.log('Sky kurang dari 2: Sanctuary Mandate tidak bisa dicapai TR ini sendiri — TR hanya mengantar Earth', 'warn');
    }
    return on;
  }

  // Sky yang masih di grid (Ground Shared Area)
  skies() {
    return this.objects.list.filter((o) => o.kind === 'sky' && o.state === 'rest' && !o.invalid && o.restingOn === 'terrain' && inRect(o.worldPos().x, o.worldPos().z, FIELD.skyArea));
  }

  // Berapa Sky yang bisa diambil berurutan: ambil yang terjangkau, hitung ulang, dan seterusnya.
  // Sky dipindah sementara ke luar lapangan lalu dikembalikan persis ke posisinya.
  skyReach() {
    const sx = this.sx, [kx] = this.node('K0');
    const list = this.skies(), keep = list.map((o) => [o.mesh.position.clone(), o.mesh.quaternion.clone()]);
    let n = 0;
    try {
      for (let left = list.slice(); left.length;) {
        const o = left.find((s) => { const g = this.findGrab(s, [-sx * Math.PI / 2, 0, Math.PI], 172); return g && this.clear(kx, g.bz, g.bx, g.bz, g.yaw, 172); });
        if (!o) break;
        o.mesh.position.set(20 + n, -5, 20);
        o.mesh.updateMatrixWorld(true);
        left = left.filter((s) => s !== o);
        n++;
      }
    } finally {
      list.forEach((o, i) => { o.mesh.position.copy(keep[i][0]); o.mesh.quaternion.copy(keep[i][1]); o.mesh.updateMatrixWorld(true); });
    }
    return n;
  }

  get jmap() { return { jaw: ['lift', 0.04, 2] }; }

  node(name) { const [ax, z] = NODES[name]; return [this.sx * ax, z]; }

  // ---------- geometri & uji pose ----------
  // Jarak pusat robot -> pusat bantalan rahang, diukur dari model
  anchorAhead() {
    const tr = this.tr, a = tr.anchor.getWorldPosition(tr.group.position.clone());
    return worldToLocal(tr.x, tr.z, tr.yaw, a.x, a.z)[1];
  }

  // Jalankan fn seolah robot berada di pose lain (rahang terbuka pada tinggi jawH)
  probe(x, z, yaw, jawH, fn) {
    const r = this.tr;
    const keep = [r.x, r.z, r.yaw, r.y, r.pitch, r.rollAng, r.plane, r.jaw, r.open];
    r.x = x; r.z = z; r.yaw = yaw; r.jaw = jawH ?? r.jaw; if (!r.held.length) r.open = r.P.open.max;
    r.computeFloor(); r.y = r.plane.a0; r.pitch = Math.atan(r.plane.gz); r.rollAng = Math.atan(r.plane.gx);
    r.applyJoints(); r.syncGroup();
    try { return fn(); } finally {
      [r.x, r.z, r.yaw, r.y, r.pitch, r.rollAng, r.plane, r.jaw, r.open] = keep;
      r.applyJoints(); r.syncGroup();
    }
  }

  // Pose bebas tabrakan, lantainya bisa dilalui, dan seluruh tapak di area yang boleh (6.1)
  free(x, z, yaw, jawH) {
    return this.probe(x, z, yaw, jawH, () => {
      const r = this.tr;
      if (!r.terrainOk(x, z, yaw)) return false;
      if (r.collides(r.shapesAt(x, z, yaw, r.dynamicLocal()), r.gatherObstacles())) return false;
      const shared = [FIELD.skyArea, FIELD.mustikaArea];
      return r.footprintCorners().every(([cx, cz]) => this.sx * cx > 0.03 || shared.some((s) => inRect(cx, cz, s)));
    });
  }

  clear(x0, z0, x1, z1, yaw, jawH) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.05));
    for (let i = 0; i <= n; i++) if (!this.free(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, yaw, jawH)) return false;
    return true;
  }

  // Cari pose jepit untuk benda o: beberapa arah datang, kedalaman, dan geseran samping
  findGrab(o, yaws, jawH) {
    const p = o.worldPos(), A = this.anchorAhead();
    for (const yaw of yaws) {
      const u = [Math.sin(yaw), Math.cos(yaw)], n = [Math.cos(yaw), -Math.sin(yaw)];
      for (const depth of [A + 0.04, A + 0.09, A - 0.01, A + 0.13]) for (const shift of [0, 0.015, -0.015, 0.03, -0.03, 0.045, -0.045]) {
        const x = p.x - u[0] * depth + n[0] * shift, z = p.z - u[1] * depth + n[1] * shift;
        if (!this.free(x, z, yaw, jawH)) continue;
        // titik awal pendekatan: mundur lurus dari pose jepit sejauh yang masih bebas
        for (const back of [0.5, 0.35, 0.22]) {
          const bx = x - u[0] * back, bz = z - u[1] * back;
          if (this.clear(bx, bz, x, z, yaw, jawH)) return { x, z, yaw, bx, bz };
        }
      }
    }
    return null;
  }

  // ---------- langkah dasar ----------
  *jawTo(h) { yield* this.joint('jaw', clamp(h, 172, 646), 'lift'); }

  // Lewat titik-titik graf dari node terdekat ke `to`; berputar ke `yaw` sambil jalan
  *route(to, yaw) {
    const tr = this.tr;
    const reg = regionAt(tr.x, tr.z).name;
    let from;
    if (reg === 'ramp' || reg === 'transfer') {
      this.status = 'turun ramp';
      yield* this.goto(this.sx * 3.5, -3.7, undefined, { what: 'kaki ramp', timeout: 40, pass: true });
      from = 'R0';
    } else {
      if (tr.z > 4.5 && Math.abs(tr.x) > 3.9) yield* this.goto(tr.x, 4.3, undefined, { what: 'keluar Start Zone', pass: true });
      from = Object.keys(NODES).sort((a, b) => Math.hypot(this.node(a)[0] - tr.x, this.node(a)[1] - tr.z) - Math.hypot(this.node(b)[0] - tr.x, this.node(b)[1] - tr.z))[0];
    }
    // BFS
    const prev = { [from]: null }, q = [from];
    while (q.length) { const c = q.shift(); if (c === to) break; for (const nb of LINKS[c]) if (!(nb in prev)) { prev[nb] = c; q.push(nb); } }
    const path = []; for (let c = to; c; c = prev[c]) path.unshift(c);
    for (const name of path) {
      const [x, z] = this.node(name);
      yield* this.goto(x, z, yaw, { what: `titik ${name}`, pass: true, spin: true, timeout: 30 });
    }
  }

  // Jepit benda o pada pose g (hasil findGrab), angkat, lalu mundur ke titik awal pendekatan
  *grab(o, g, jawH, liftBy) {
    const tr = this.tr;
    yield* this.goto(g.bx, g.bz, g.yaw, { what: `depan ${o.name}`, tol: 0.02, atol: 0.015, spin: true, joints: { jaw: clamp(jawH, 172, 646) } });
    tr.gripCmd = 'open';
    yield* this.goto(g.x, g.z, g.yaw, { what: o.name, tol: 0.01, slowNear: 0.2 });
    // maju sedikit lagi bila benda belum di antara bantalan
    for (let t = 0; tr.jawCandidate().obj !== o; t += this.dt) {
      if (t > 1.5) throw new Abort(`${o.name} tidak masuk di antara rahang`);
      yield { ...IDLE, f: 0.5, slow: true };
    }
    tr.gripCmd = 'close';
    for (let t = 0; !tr.held.length; t += this.dt) {
      if (t > 3) { tr.gripCmd = 'open'; throw new Abort(`gagal menjepit ${o.name}`); }
      yield IDLE;
    }
    if (tr.held[0] !== o) { tr.gripCmd = 'open'; throw new Abort(`menjepit benda yang salah (${tr.held[0].name})`); }
    yield* this.jawTo(tr.jaw + liftBy);
    yield* this.goto(g.bx, g.bz, g.yaw, { what: 'mundur', pass: true });
  }

  // ---------- pengamatan ----------
  inTransfer(o) { return this.rules.fullyIn(o, transferRect(this.team)); }

  // Benda yang masih menunggu diambil BR di Transfer Area
  waiting() { return this.objects.list.filter((o) => o.state === 'rest' && !o.invalid && this.inTransfer(o)); }

  // Langkah rencana pertama yang belum terpenuhi dan belum ada bendanya di jalur (Transfer Area / dipegang)
  nextStep() {
    const R = this.rules, O = this.objects;
    const towers = R.computeTowers();
    const mine = this.robots.filter((r) => r.team === this.team);
    // di jalur = menunggu di Transfer Area, dipegang robot sendiri, atau baru dilepas dan masih jatuh
    const pipe = [...this.waiting(), ...mine.flatMap((r) => [...r.heldSet()]), ...O.list.filter((o) => o.state === 'fall' && o.lastReleasedBy && o.lastReleasedBy.team === this.team)];
    let earth = pipe.filter((o) => o.kind === 'earth').length, sky = pipe.filter((o) => o.kind === 'sky').length;
    let skyBuntu = false;      // ada menara sebelum langkah M yang butuh Sky, padahal Sky tidak terjangkau
    for (const step of this.strategi.plan) {
      if (step === 'M' || step === 'm') {
        if (R.enshrined) continue;
        if (step === 'm' && !R.mandateOf(this.team) && !towers.some((t) => t.spot.shared && t.spot.level === 1 && t.color)) continue;
        // Mandate mustahil tanpa Sky: kerjakan langkah berikutnya (mis. Earth ke L2) daripada menunggu
        if (skyBuntu && !R.mandateOf(this.team)) continue;
        if (O.list.some((o) => o.kind === 'ball' && o.state === 'held' && o.holders.some((h) => h.robot.team === this.team && h.robot.kind === 'BR'))) continue;
        return { type: 'M' };
      }
      const [kind, code] = step.split(':');
      const t = towers.find((x) => x.spot === this.T[code].spot);
      if (this.skip[kind] > R.simT) {                  // jenis benda ini sedang tidak terjangkau
        if (kind === 'S' && !t.top) { if (sky >= 1) sky -= 1; else skyBuntu = true; }
        continue;
      }
      if (kind === 'E') {
        const need = 2 - (t.bottom ? 1 : 0) - (t.middle ? 1 : 0);
        if (earth >= need) { earth -= need; continue; }
        return { type: 'E', code };
      }
      if (t.top) continue;
      // maling: menara yang Earth-nya milik lawan dibiarkan dimahkotai lawan lalu dibalik; Sky kiriman kita bisa keduluan dan
      // mengganjal serah terima Mustika di Transfer Area
      if (this.strategi.maling && t.middle && t.middle.placedBy !== this.team) { skyBuntu = true; continue; }
      if (sky >= 1) { sky -= 1; continue; }
      return { type: 'S', code };
    }
    return null;
  }

  nextJob() {
    const tr = this.tr;
    const held = tr.held[0];
    if (held) return held.kind === 'ball' ? job('Mustika → serah terima', () => this.handBall(held)) : job(`${held.kind === 'sky' ? 'Sky' : 'Earth'} yang dijepit → Transfer Area`, () => this.deliver(held));
    const step = this.nextStep();
    if (!step) return null;
    if (step.type === 'E') return job(`Earth untuk ${this.T[step.code].spot.id}`, () => this.fetchEarth());
    if (step.type === 'S') return job(`Sky untuk ${this.T[step.code].spot.id}`, () => this.fetchSky());
    return job('Mustika', () => this.fetchBall());
  }

  *main() {
    for (;;) {
      const j = this.nextJob();
      if (!j) { this.status = 'rencana selesai — menunggu'; yield* this.wait(0.5); continue; }
      yield* this.task(j.label, j());
      this.errors = 0;
    }
  }

  // ---------- pekerjaan ----------
  *fetchEarth() {
    const tr = this.tr, sx = this.sx, O = this.objects;
    this.status = 'menuju Storage';
    yield* this.route('E0', sx * H);
    // kolom di Storage sendiri: balok paling bawah dengan paling banyak satu balok di atasnya
    const st = storageRect(this.team);
    const [ex, ez] = this.node('E0');
    const cols = O.list.filter((o) => o.kind === 'earth' && o.team === this.team && o.state === 'rest' && !o.invalid && o.restingOn === 'terrain' &&
      inRect(o.worldPos().x, o.worldPos().z, st) && O.ridersOf(o).length <= 1)
      .sort((a, b) => Math.hypot(a.worldPos().x - ex, a.worldPos().z - ez) - Math.hypot(b.worldPos().x - ex, b.worldPos().z - ez));
    if (!cols.length) { this.skip.E = Infinity; this.hint('earth-habis', 'Earth di Storage habis'); return; }
    const jawH = (cols[0].worldPos().y - 0) * 1000;
    let pick = null;
    for (const o of cols) {
      const g = this.findGrab(o, [sx * H, Math.PI], jawH);
      // jalur dari depan Storage ke titik pendekatan harus bebas juga
      if (g && this.clear(g.bx, -3.85, g.bx, g.bz, g.yaw, jawH)) { pick = { o, g }; break; }
    }
    if (!pick) { this.skip.E = this.rules.simT + 25; this.hint('earth-jangkau', 'tidak ada lagi kolom Earth yang terjangkau TR — langkah Earth dilewati'); return; }
    this.status = `menjepit kolom ${pick.o.name}`;
    yield* this.goto(pick.g.bx, -3.85, pick.g.yaw, { what: 'depan Storage', pass: true, spin: true });
    yield* this.grab(pick.o, pick.g, jawH, 130);
    yield* this.goto(pick.g.bx, -3.85, 0, { what: 'keluar Storage', pass: true, spin: true });
    yield* this.deliver(pick.o);
  }

  // Sumbu belahan warna Sky di bidang datar (vektor satuan [x, z]); null bila warnanya atas-bawah
  skyAxis(sky) {
    const e = sky.mesh.matrixWorld.elements;
    if (Math.abs(e[5]) > 0.7) return null;
    const n = Math.hypot(e[4], e[6]) || 1;
    return [e[4] / n, e[6] / n];
  }

  *fetchSky() {
    const sx = this.sx, O = this.objects;
    this.status = 'menuju grid Sky';
    yield* this.route('K0', -sx * H);
    const [kx, kz] = this.node('K0');
    // 6.5: jangan masuk grid selagi robot lawan bekerja di Ground Shared Area (paling lama 20 s)
    const a = FIELD.skyArea, near = (r) => r.x > a.x0 - 0.4 && r.x < a.x1 + 0.4 && r.z > a.z0 - 0.4 && r.z < a.z1 + 0.4;
    for (let t = 0; t < 20 && this.robots.some((r) => r.team !== this.team && near(r)); t += this.dt) {
      this.status = 'menunggu robot lawan keluar dari Ground Shared Area';
      yield IDLE;
    }
    const skies = this.skies()
      .sort((a, b) => Math.hypot(a.worldPos().x - kx, a.worldPos().z - kz) - Math.hypot(b.worldPos().x - kx, b.worldPos().z - kz));
    if (!skies.length) { this.skip.S = Infinity; this.hint('sky-habis', 'Sky di grid habis'); return; }
    // Utamakan arah datang yang sejajar sumbu warna: Sky lalu bisa diantar lurus (menghadap ramp)
    // dan warnanya menyamping dari arah datang BR. Bila tidak ada, ambil dari sisi sendiri dan antar menyamping.
    const yawsAll = [-sx * H, 0, Math.PI];
    let pick = null;
    for (const pass of ['sejajar', 'lain']) {
      for (const o of skies) {
        const a = this.skyAxis(o);
        const yaws = yawsAll.filter((y) => { const par = !a || Math.abs(a[0] * Math.sin(y) + a[1] * Math.cos(y)) > 0.7; return pass === 'sejajar' ? par : !par && y === -sx * H; });
        const g = yaws.length && this.findGrab(o, yaws, 172);
        // jalur masuk: dari barat/timur grid sejajar garis pendekatan
        if (g && this.clear(kx, g.bz, g.bx, g.bz, g.yaw, 172)) { pick = { o, g }; break; }
      }
      if (pick) break;
    }
    if (!pick) { this.skip.S = this.rules.simT + 25; this.hint('sky-jangkau', 'tidak ada lagi Sky yang terjangkau dari sisi sendiri — langkah Sky dilewati'); return; }
    this.status = `menjepit ${pick.o.name}`;
    yield* this.goto(kx, pick.g.bz, pick.g.yaw, { what: 'samping grid Sky', tol: 0.02, atol: 0.02, spin: true, joints: { jaw: 172 } });
    yield* this.grab(pick.o, pick.g, 172, 120);
    yield* this.goto(kx, pick.g.bz, undefined, { what: 'keluar grid Sky', tol: 0.03 });
    yield* this.goto(kx, kz, undefined, { what: 'keluar grid Sky', pass: true });
    yield* this.deliver(pick.o);
  }

  // Arah hadap saat menaruh Sky agar belahan warna menyamping dari arah datang BR (sumbu X):
  // lurus menghadap ramp bila bisa, kalau tidak menghadap L1 (naik ramp menyamping)
  skyYaw(sky) {
    const a = this.skyAxis(sky);
    if (!a) return 0;
    for (const yaw of [0, -this.sx * H]) {
      const d = yaw - this.tr.yaw;
      if (Math.abs(a[0] * Math.cos(d) + a[1] * Math.sin(d)) < 0.5) return yaw;
    }
    return 0;
  }

  // Bawa benda yang dijepit ke Transfer Area, taruh, lalu mundur
  *deliver(o) {
    const tr = this.tr, sx = this.sx, hw = tr.geom.hw;
    const yaw = o.kind === 'sky' ? this.skyYaw(o) : 0;
    const side = Math.abs(Math.sin(yaw)) > 0.5;           // menghadap L1: naik ramp menyamping
    this.status = `membawa ${o.name} ke Transfer Area`;
    yield* this.route('R0', yaw);
    yield* this.goto(sx * 3.5, -3.7, yaw, { what: 'kaki ramp', tol: 0.04, atol: 0.03, spin: true });
    // satu tempat taruh: tunggu sampai benda sebelumnya diambil BR
    for (let t = 0; this.waiting().length; t += this.dt) {
      this.status = `menunggu Transfer Area kosong (${o.name})`;
      if (t > 60) throw new Abort('Transfer Area tidak kunjung kosong');
      yield IDLE;
    }
    this.status = `naik ramp membawa ${o.name}`;
    const p = o.worldPos();
    const off = [p.x - tr.x, p.z - tr.z];
    if (!side) {
      // lurus: pusat benda jatuh di tengah Transfer Area, lalu mundur turun ramp
      yield* this.goto(sx * 3.5 - off[0], DROP_Z - off[1], yaw, { what: 'Transfer Area', timeout: 45, tol: 0.02, slowNear: 0.2 });
    } else {
      // menyamping: ujung lengan sedekat mungkin ke garis L1 tanpa melewatinya (6.1.1), supaya
      // masih ada ruang mundur ke sisi luar lajur untuk mengeluarkan benda dari kantong rahang
      yield* this.goto(sx * 3.5, DROP_Z - off[1], yaw, { what: 'Transfer Area', timeout: 45, tol: 0.03 });
      const ahead = Math.abs(off[0]);
      this.sideX = Math.max(FIELD.lane.xIn + hw + 0.012, FIELD.lane.xIn + o.half + 0.015 + ahead);   // benda harus sepenuhnya di Transfer Area
      yield* this.goto(sx * this.sideX, DROP_Z - off[1], yaw, { what: 'Transfer Area', tol: 0.006, atol: 0.008, slow: true });
    }
    if (!this.inTransfer(o)) throw new Abort(`${o.name} tidak sepenuhnya di Transfer Area`);
    yield* this.jawTo(o.kind === 'sky' ? 172 : (FIELD.L1.h + o.half - tr.y) * 1000 + 8);
    tr.gripCmd = 'open';
    for (let t = 0; tr.held.length || o.state === 'fall'; t += this.dt) { if (t > 3) throw new Abort('rahang tidak melepas'); yield IDLE; }
    this.status = 'mundur dari Transfer Area';
    if (side) {
      const out = Math.min(FIELD.lane.xOut - hw - 0.008, this.sideX + 0.33);
      yield* this.goto(sx * out, tr.z, yaw, { what: 'keluar dari benda', tol: 0.006, atol: 0.008, slowNear: 0.1 });
      yield* this.goto(tr.x, 0.75, yaw, { what: 'turun ramp', tol: 0.03 });
    }
    yield* this.goto(sx * 3.5, -0.2, yaw, { what: 'turun ramp', timeout: 30, pass: true });
  }

  *fetchBall() {
    const tr = this.tr, sx = this.sx, O = this.objects, R = this.rules;
    this.status = 'menuju Mustika Pillar';
    yield* this.route('M0', -sx * H);
    for (let t = 0; !R.mandateOf(this.team); t += this.dt) {
      this.status = 'menunggu Sanctuary Mandate di dekat Mustika Pillar';
      if (this.nextStep()?.type !== 'M') return;        // rencana berubah (mis. menara dirobohkan / dibalik)
      yield IDLE;
    }
    if (R.enshrined) return;
    let ball = null;
    for (let t = 0; !(ball = O.list.find((o) => o.kind === 'ball' && o.state === 'rest' && o.restingOn === 'pillar:mustika')); t += this.dt) {
      this.status = 'menunggu Mustika Pillar diisi ulang';
      if (R.enshrined) return;              // lawan sudah mengabadikan Mustika
      if (t > 60) throw new Abort('tidak ada Mustika di pilar');
      yield IDLE;
    }
    const jawH = ball.worldPos().y * 1000;
    const g = this.findGrab(ball, [-sx * H], jawH);
    if (!g) throw new Abort('Mustika tidak terjangkau');
    this.status = 'menjepit Mustika';
    yield* this.grab(ball, g, jawH, 90);
    yield* this.handBall(ball);
  }

  // Bawa Mustika ke Transfer Area dan tahan sampai BR menghisapnya (3.6.3: serah terima langsung)
  *handBall(ball) {
    const tr = this.tr, sx = this.sx;
    const gone = () => { if (ball.state !== 'held') throw new Abort('Mustika terlepas / dikeluarkan'); };
    this.status = 'membawa Mustika ke Transfer Area';
    yield* this.route('R0', 0);
    yield* this.goto(sx * 3.5, -3.7, 0, { what: 'kaki ramp', tol: 0.04, atol: 0.03, spin: true });
    for (let t = 0; this.waiting().length; t += this.dt) { gone(); this.status = 'menunggu Transfer Area kosong (Mustika)'; if (t > 90) throw new Abort('Transfer Area tidak kunjung kosong'); yield IDLE; }
    gone();
    const off = ball.worldPos().z - tr.z;
    yield* this.goto(sx * 3.5, DROP_Z - off, 0, { what: 'Transfer Area', timeout: 45, tol: 0.015, slowNear: 0.2 });
    this.status = 'menahan Mustika untuk BR';
    for (let t = 0; !ball.holders.some((h) => h.robot.kind === 'BR'); t += this.dt) { gone(); if (t > 120) throw new Abort('BR tidak mengambil Mustika'); yield IDLE; }
    tr.gripCmd = 'open';
    for (let t = 0; tr.held.length; t += this.dt) { if (t > 3) throw new Abort('rahang tidak melepas'); yield IDLE; }
    yield* this.wait(1.0);         // biarkan BR menarik Mustika dulu
    this.status = 'mundur dari Transfer Area';
    yield* this.goto(sx * 3.5, -0.2, 0, { what: 'turun ramp', timeout: 30, pass: true });
  }
}
