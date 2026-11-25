// Mode otonom Builder Robot (Rule 11.3: BR harus otomatis penuh).
// BR bekerja sendiri; operator hanya mengemudikan TR dan mengantar benda ke Transfer Area.
//
// Urutan kerja:
//   1. Dari Start Zone naik tangga (track) ke Transfer Area lalu menunggu di L1 depan Transfer Area.
//   2. Earth Block di Transfer Area  -> disusun di Building Spot (2 per menara).
//      Sky Block di Transfer Area    -> diputar agar warna tim di atas, ditaruh di menara yang siap.
//   3. Setelah Sanctuary Mandate: Mustika yang dijepit TR di Transfer Area diambil langsung,
//      dibawa naik ke L2 dan ditaruh di Central Pillar.
// Tiap langkah adalah generator yang menghasilkan satu perintah gerak per frame.

import { FIELD, SPOTS, OBJ } from './config.js';
import { transferRect, inRect, regionAt } from './field.js';
import { worldToLocal, clamp } from './geom.js';
import { AutoPilot, Abort, IDLE } from './autopilot.js';
import { strategiOf, targetsFor } from './strategy.js';
import { Sensor } from './sensor.js';

const HOME_ABS = 2.235;       // tengah lorong L1 (antara barrier 2.97 dan L2 1.5)

// tugas = fungsi pembuat generator + label untuk catatan waktu
const job = (label, fn) => Object.assign(fn, { label });

export class AutoBuilder extends AutoPilot {
  constructor(br, ctx) {
    super(br, ctx);
    this.br = br;
    const sx = this.sx, hw = br.geom.hw;
    this.CUP = br.geom.cupReach;                                   // pusat robot -> muka cup (boom ditarik)
    this.EDGE = FIELD.L1.inner - hw - 0.016;                       // pusat robot terjauh ke arah barrier
    // mode track: rangka terangkat di atas barrier 50 mm, hanya track yang harus tetap di dalam L1
    this.EDGE_T = FIELD.L1.inner - br.geom.trackOut - 0.012;
    this.RISE = Math.max(0, br.P.trackDrop - 0.018);              // naiknya rangka saat track turun penuh
    this.OPEN = [FIELD.transfer.z0 + hw + 0.006, FIELD.transfer.z1 - hw - 0.006];   // z pusat robot di bukaan
    this.setStrategi(ctx.strategi || 'mandate');
    // posisi benda dibaca lewat sensor tiruan (js/sensor.js); 'sempurna' = posisi pasti
    this.sensor = new Sensor(br, this.rules, { mode: ctx.sensor || 'sempurna', seed: ctx.seed || (br.team === 'red' ? 7 : 11) });
    this.flipAt = {};                     // spot.id -> jam simulasi paling cepat boleh mencoba flip lagi
    this.home = [sx * HOME_ABS, 1.3];
    this.pickYaw = sx * Math.PI / 2;      // menghadap Transfer Area
  }

  // Urutan target mengikuti strategi (js/strategy.js)
  setStrategi(key) {
    this.strategiKey = key;
    this.strategi = strategiOf(key);
    this.T = targetsFor(this.team);
  }

  get jmap() { return { h: ['lift', 0.04, 2], e: ['aux', 0.04, 2], roll: ['roll', 0.12, 0.6], flip: ['flip', 0.1, 1.5] }; }

  *lift(h) { yield* this.joint('h', clamp(h, 96, 958), 'lift'); }

  // Turunkan benda yang dipegang sampai alasnya `gap` di atas permukaan y. Diukur dari kotak batas
  // benda, karena benda yang miring terhadap cup menjadi condong setelah wrist diputar.
  *lowerOnto(o, y, gap = 0.008) {
    const br = this.br;
    let last = br.h, stall = 0;
    for (let t = 0; t < 6; t += this.dt) {
      const d = o.aabb().min.y - (y + gap);
      if (d < 0.002) return;
      yield { ...IDLE, lift: -clamp(d * 25, 0.08, 1) };
      stall = Math.abs(br.h - last) < 1e-4 ? stall + this.dt : 0;
      last = br.h;
      if (stall > 0.6) return;          // sudah menyentuh
    }
  }
  *boom(e) { yield* this.joint('e', clamp(e, 0, 240), 'aux'); }
  *roll(deg) { yield* this.joint('roll', deg, 'roll', { tol: 0.6, gain: 0.12 }); }
  *flipper(deg) { yield* this.joint('flip', deg, 'flip', { tol: 1.5, gain: 0.1 }); }

  *track(on) {
    const br = this.br;
    if ((br.trackTarget > 0.5) !== on) br.toggleTrack();
    for (let t = 0; on ? br.track < 0.98 : br.track > 0.02; t += this.dt) {
      if (t > 4) throw new Abort('track tidak bergerak');
      yield IDLE;
    }
  }

  vacuum(on) {
    if (this.br.vacuum !== on) this.br.toggleGrip();
  }

  // ---------- pengamatan lapangan ----------
  // Perkiraan pose benda menurut sensor BR ({ p, yaw })
  see(o) { return this.sensor.sense(o); }
  pos(o) { return this.sensor.sense(o).p; }

  inTransfer(o) {
    if (!this.sensor.realistic) return this.rules.fullyIn(o, transferRect(this.br.team));
    // sensor realistis: hanya benda yang sudah benar-benar terlihat, diukur dari pusat perkiraannya
    const e = this.see(o), r = transferRect(this.br.team), h = o.half - 0.01;
    return e.t > -Infinity && e.p.x - h >= r.x0 && e.p.x + h <= r.x1 && e.p.z - h >= r.z0 && e.p.z + h <= r.z1;
  }

  tr() { return this.mate('TR'); }

  // TR sudah menjauh dari benda (lengannya tidak lagi mengapit) sehingga cup bisa mencapainya
  trClear(o) {
    const tr = this.tr();
    // satu tumpukan dinilai sekali (dari balok paling bawah), agar galat sensor tidak memecahnya
    let base = o;
    while (base.restingOn && typeof base.restingOn === 'object') base = base.restingOn;
    const p = this.pos(base);
    // posisi TR menurut sensor BR (11.11: tidak ada komunikasi TR → BR)
    const s = tr && this.sensor.senseRobot(tr);
    return !s || Math.hypot(s.x - p.x, s.z - p.z) > 0.85;
  }

  // Keadaan tiap target menara pada urutan `order` ('earth' | 'sky')
  towers(order = 'earth') {
    const all = this.rules.computeTowers();
    return this.strategi[order].map((code) => ({ ...this.T[code], state: all.find((x) => x.spot === this.T[code].spot) }));
  }

  // Pekerjaan berikutnya (generator) atau null bila belum ada yang bisa dikerjakan
  nextJob() {
    const br = this.br, O = this.objects;
    const held = br.held[0];
    // memegang Sky milik sebuah menara (flip yang terputus): lepas saja, wasit mengembalikannya (3.5.8)
    if (held && held.kind === 'sky' && held.towerSpot) return job('lepas Sky menara', () => this.dropTowerSky());
    if (held) return held.kind === 'ball' ? job('Mustika → Central Pillar', () => this.enshrine(held)) : job(`${held.kind === 'sky' ? 'Sky' : 'Earth'} yang dipegang → menara`, () => this.placeHeld(held));

    // 1. Mustika: hanya setelah Mandate, diserahkan langsung oleh TR di Transfer Area
    if (this.rules.mandateOf(this.team) && !this.rules.enshrined) {
      const ball = O.list.find((o) => o.kind === 'ball' && o.state === 'held' && !o.illegal && o.holders.some((h) => h.robot.kind === 'TR' && h.robot.team === this.team));
      if (ball && inRect(this.pos(ball).x, this.pos(ball).z, transferRect(br.team))) return job('Mustika: serah terima → Central Pillar', () => this.takeBall(ball));
    }
    const waiting = O.list.filter((o) => o.state === 'rest' && !o.invalid && this.inTransfer(o));
    // lawan agresif / strategi maling: membalik Sky tim lain di menara Shared didahulukan dari membangun
    const flip = this.flipJob();
    if (this.rebut && flip) return flip;
    // 2. Sky Block untuk menara yang sudah punya 2 Earth
    const needSky = this.towers('sky').find((t) => t.state.middle && !t.state.top);
    if (needSky) {
      for (const sky of waiting.filter((o) => o.kind === 'sky' && o.restingOn === 'terrain')) {
        if (!this.trClear(sky)) continue;
        if (this.colourAxis(sky) === 'cup') {
          this.hint(`sky-${sky.id}`, `${sky.name} belahan warnanya menghadap BR — antar ulang dengan sisi warna menyamping`);
          continue;
        }
        return job(`Sky → ${needSky.spot.id}`, () => this.buildSky(sky, needSky));
      }
    }
    // 3. Earth Block untuk menara pertama yang belum lengkap
    const needEarth = this.towers('earth').find((t) => !t.state.middle);
    if (needEarth) {
      const need = needEarth.state.bottom ? 1 : 2;
      const cands = waiting.filter((o) => o.kind === 'earth' && this.trClear(o) && O.ridersOf(o).length < need &&
        O.ridersOf(o).every((r) => r.kind === 'earth'));
      for (const o of cands.filter((c) => Math.abs(this.skew(c, this.pickYaw)) > 0.2)) {
        this.hint(`skew-${o.id}`, `${o.name} terlalu miring di Transfer Area — luruskan TR saat melepas`);
      }
      for (let i = cands.length - 1; i >= 0; i--) if (Math.abs(this.skew(cands[i], this.pickYaw)) > 0.2) cands.splice(i, 1);
      // yang paling bawah dulu (membawa tumpukan sekaligus), lalu yang paling dekat ke L1
      cands.sort((a, c) => this.pos(a).y - this.pos(c).y || this.sx * (this.pos(a).x - this.pos(c).x));
      if (cands[0]) return job(`${1 + O.ridersOf(cands[0]).length} Earth → ${needEarth.spot.id}`, () => this.buildEarth(cands[0], needEarth));
    }
    // 4. Tidak ada kiriman: balik Sky lawan di menara Shared yang terjangkau dari sisi sendiri
    return flip;
  }

  // strategi maling berhenti merebut setelah Mandate (permanen, 3.6.2): BR harus siap menerima Mustika
  get rebut() { return this.agresif || (this.strategi.maling && !this.rules.mandateOf(this.team)); }

  // Pekerjaan membalik Sky tim lain di menara Shared yang terjangkau dari sisi sendiri, atau null
  flipJob() {
    if (!this.foe()) return null;
    const flip = this.towers('sky').find((t) => t.kind === 'barrier' && t.spot.shared && t.state.top && !t.state.lifted && t.state.color && t.state.color !== this.team &&
      t.state.top.state === 'rest' && !((this.flipAt[t.spot.id] || 0) > this.rules.simT));
    return flip ? job(`balik Sky → ${flip.spot.id}`, () => this.flipSky(flip)) : null;
  }

  // Arah belahan warna Sky terhadap cup saat diambil dari Transfer Area:
  // 'up' (sudah tegak), 'side' (bisa diputar wrist), 'cup' (sejajar sumbu wrist: tidak bisa)
  colourAxis(sky) {
    const e = sky.mesh.matrixWorld.elements;      // kolom ke-2 = sumbu Y lokal (arah sisi biru)
    const ax = Math.abs(e[4]), ay = Math.abs(e[5]), az = Math.abs(e[6]);
    if (ay >= ax && ay >= az) return 'up';
    return az >= ax ? 'side' : 'cup';
  }

  // ---------- pekerjaan ----------
  *main() {
    yield* this.task('masuk ke Level 1', this.enter());
    for (;;) {
      const job = this.nextJob();
      if (!job) {
        this.pesanShared();
        this.status = this.idleText();
        yield* this.wait(0.25);
        continue;
      }
      yield* this.task(job.label, job());
      this.release();
      this.errors = 0;
    }
  }

  // Lawan agresif: pesan spot Shared pertama yang belum lengkap di urutan Earth sejak awal (bahkan sebelum
  // ada kiriman), supaya BR tim lain harus menunggu (claim, maks 25 s) sebelum boleh membangun di sana.
  pesanShared() {
    if (!this.agresif) return;
    const claims = this.rules.claims;
    for (const [id, who] of claims) if (who === this) return;          // sudah memegang pesanan
    const t = this.towers('earth').find((x) => x.kind === 'barrier' && x.spot.shared && !x.state.middle && !claims.get(x.spot.id));
    if (t) claims.set(t.spot.id, this);
  }

  idleText() {
    const R = this.rules;
    if (R.enshrined) return 'Mustika sudah diabadikan — menunggu blok berikutnya';
    if (R.mandateOf(this.team)) return 'menunggu TR membawa Mustika ke Transfer Area (jangan dilepas)';
    return 'menunggu kiriman TR di Transfer Area';
  }

  // Dari mana pun yang didukung menuju posisi tunggu di L1
  *enter() {
    const br = this.br, sx = this.sx, [hx, hz] = this.home;
    const reg = regionAt(br.x, br.z).name;
    if (reg === 'L2') throw new Abort('BR berada di Level 2 — tekan Retry');
    if (reg === 'L1') {
      this.status = 'menuju posisi tunggu';
      if (br.track > 0.5) yield* this.track(false);
      if (br.flip > 2) yield* this.flipper(0);
      // lewat tengah lorong sisi sendiri
      if (Math.abs(br.z) < 1.6 || Math.abs(br.x - hx) > 0.3) yield* this.goto(hx, clamp(br.z, -2.4, 2.4), undefined, { what: 'lorong L1', tol: 0.03 });
      yield* this.goto(hx, hz, undefined, { what: 'posisi tunggu', tol: 0.03 });
      yield* this.goto(hx, hz, this.pickYaw, { what: 'posisi tunggu' });
      return;
    }
    this.status = 'menuju tangga';
    // membawa benda (mis. setelah Retry): angkat ke tinggi mode tangga agar tidak menyangkut anak tangga
    yield* this.boom(0); yield* this.lift(br.held.length ? 470 : 335); if (!br.held.length) yield* this.roll(0);
    if (reg !== 'transfer') {
      if (br.track > 0.5 && reg === 'ground') yield* this.track(false);
      if (reg === 'ground') {
        yield* this.goto(sx * 3.5, Math.max(br.z, 3.4), undefined, { what: 'kaki tangga', tol: 0.03 });
        yield* this.goto(sx * 3.5, 3.4, Math.PI, { what: 'kaki tangga', tol: 0.02 });
      }
      this.status = 'naik tangga';
      yield* this.track(true);
      yield* this.goto(sx * 3.5, 1.3, Math.PI, { what: 'Transfer Area (tangga)', timeout: 45, tol: 0.03 });
    }
    yield* this.track(false);
    this.status = 'masuk Level 1';
    yield* this.goto(hx, hz, undefined, { what: 'Level 1', tol: 0.03 });
    yield* this.goto(hx, hz, this.pickYaw, { what: 'posisi tunggu' });
    this.log('siap di Level 1, menunggu kiriman TR');
  }

  // Ambil benda diam di Transfer Area. lat = geser lateral benda terhadap robot yang diinginkan (m, lokal X)
  *pick(o, lat) {
    const br = this.br, sx = this.sx, [hx] = this.home;
    const p = this.pos(o).clone();
    let zr = clamp(p.z + lat * Math.sin(this.pickYaw), this.OPEN[0], this.OPEN[1]);
    if (Math.abs(p.z - zr) > (o.kind === 'ball' ? 0.03 : o.half - 0.035)) {
      this.hint(`reach-${o.id}`, `${o.name} terlalu ke tepi Transfer Area — taruh lebih ke tengah`);
      throw new Abort(`${o.name} tidak terjangkau`);
    }
    this.vacuum(false);
    const pickH = clamp((p.y - FIELD.L1.h) * 1000, 96, 958);
    // lift, boom dan wrist disiapkan sambil menuju depan Transfer Area
    yield* this.goto(hx, zr, this.pickYaw, { what: 'depan Transfer Area', spin: true, joints: { h: pickH, e: 0, roll: 0 } });
    this.vacuum(true);
    // muka benda yang menghadap L1
    let face = p.x - sx * o.half;
    if (this.sensor.realistic) {
      // ukur ulang dari dekat sebelum menyentuh: galat sensor mengecil dengan jarak
      yield* this.goto(face - sx * (this.CUP + 0.15), zr, this.pickYaw, { what: o.name, slowNear: 0.15 });
      yield* this.wait(0.25);
      p.copy(this.pos(o));
      face = p.x - sx * o.half;
      zr = clamp(p.z + lat * Math.sin(this.pickYaw), this.OPEN[0], this.OPEN[1]);
    }
    // sensor realistis: berhenti 4 cm sebelum muka perkiraan, sisanya dijangkau boom sampai menyentuh
    const gap = this.sensor.realistic ? 0.04 : 0.012;
    yield* this.goto(face - sx * (this.CUP + gap), zr, this.pickYaw, { what: o.name, slowNear: 0.15 });
    for (let t = 0; !br.held.length; t += this.dt) {
      // boom dijulurkan pelan (28 mm/s); sensor realistis berhenti 4 cm lebih jauh, jadi diberi waktu lebih
      if (t > (this.sensor.realistic ? 4 : 1.5)) { this.vacuum(false); throw new Abort(`gagal menghisap ${o.name}`); }
      yield { ...IDLE, aux: 0.4, slow: true };
    }
    yield* this.lift(br.h + 110);          // angkat melewati barrier 50 mm sebelum bergerak
    yield* this.goto(hx, zr, this.pickYaw, { what: 'lorong L1', pass: true, joints: { e: 0 } });
  }

  // Miring benda terhadap arah hadap robot (rad, relatif kelipatan 90°)
  skew(o, yaw = this.br.yaw) {
    if (o.kind === 'ball') return 0;
    const d = this.see(o).yaw - yaw;
    return d - Math.round(d / (Math.PI / 2)) * (Math.PI / 2);
  }

  // Pose robot agar benda yang dipegang berada di atas spot. along = jarak pusat robot -> pusat benda
  placePose(target, o, tolerance) {
    const { spot, yaw, u, b } = target;
    const br = this.br, p = this.pos(o);
    // posisi benda terhadap robot diukur langsung (benda miring / digenggam ke samping)
    const [lat, along] = worldToLocal(br.x, br.z, br.yaw, p.x, p.z);
    const latB = lat * (Math.cos(yaw) * b[0] - Math.sin(yaw) * b[1]);   // geser benda ke arah barrier
    const sb = spot.x * b[0] + spot.z * b[1];
    const rb = target.kind === 'barrier' ? Math.min(sb - latB, this.EDGE) : sb - latB;   // roda tertahan barrier
    const err = rb + latB - sb;
    // tapak benda yang miring lebih lebar: sisa toleransi spot 500 mm mengecil
    const sk = Math.abs(this.skew(o));
    const half = o.half * (Math.cos(sk) + Math.sin(sk));
    if (Math.abs(err) > (o.kind === 'earth' ? Math.min(tolerance, FIELD.spotSize / 2 - half - 0.006) : tolerance)) return null;
    // komponen sepanjang u dan sepanjang b -> koordinat dunia
    const su = spot.x * u[0] + spot.z * u[1] - along;
    return [su * u[0] + rb * b[0], su * u[1] + rb * b[1]];
  }

  // Dari posisi tunggu ke pose menaruh (atau sebaliknya). joints = sendi yang digerakkan sambil jalan.
  *travel(target, pose, back = false, joints = null) {
    const [hx, hz] = this.home, [x, z] = pose;
    const pts = target.via === null
      ? [[x, hz], [x, z]]
      : [[hx, target.via], [x, target.via], [x, z]];
    if (!back) {
      // berputar di tengah lorong (benda diangkat di atas tinggi L2), lalu bergeser dengan arah hadap tetap
      yield* this.goto(hx, hz, target.yaw, { what: 'posisi putar', tol: 0.03, atol: 0.03, joints });
      const last = pts.length - 1;
      for (const [i, [px, pz]] of pts.entries()) {
        if (i < last) yield* this.goto(px, pz, target.yaw, { what: target.spot.id, pass: true, joints });
        else yield* this.goto(px, pz, target.yaw, { what: target.spot.id, tol: 0.008, slowNear: 0.15, joints });
      }
    } else {
      for (const [px, pz] of pts.slice(0, -1).reverse()) yield* this.goto(px, pz, target.yaw, { what: 'lorong L1', pass: true, joints });
      // tidak membawa apa-apa: berputar ke arah Transfer Area sambil kembali
      yield* this.goto(hx, hz, this.pickYaw, { what: 'posisi tunggu', pass: true, spin: true, joints });
    }
  }

  // Tunggu sampai benda yang baru dilepas diam di tempatnya
  *released(o) {
    for (let t = 0; t < 0.9 && o.state === 'fall'; t += this.dt) yield IDLE;
    yield* this.wait(0.15);
  }

  *buildEarth(o, target) {
    const n = 1 + this.objects.ridersOf(o).length;
    this.status = `mengambil ${n} Earth untuk ${target.spot.id}`;
    // genggam sedikit ke samping agar balok bisa masuk spot yang menempel barrier
    const want = target.kind === 'barrier' ? 0.10 * (Math.cos(target.yaw) * target.b[0] - Math.sin(target.yaw) * target.b[1]) : 0;
    yield* this.pick(o, want);
    yield* this.placeHeld(o, target);
  }

  // Taruh benda yang sedang dipegang ke menara yang sesuai
  *placeHeld(o, target = null) {
    const br = this.br;
    if (o.kind === 'sky') {
      target = target || this.towers('sky').find((t) => t.state.middle && !t.state.top);
      if (!target) { yield* this.putBack(o, 'belum ada menara yang siap menerima Sky'); return; }
      if (yield* this.claim(target)) { yield* this.placeHeld(o); return; }
      if (target.kind === 'l2') yield* this.placeSkyL2(o, target); else yield* this.placeSky(o, target);
      return;
    }
    const carried = br.carriedBlocks();
    const roomOf = (t) => (t.state.middle ? 0 : t.state.bottom ? 1 : 2);
    const fresh = this.towers();
    target = target && fresh.find((t) => t.spot === target.spot);
    // target semula sudah diisi (mis. oleh lawan di spot Shared): pindah ke spot lain yang masih muat
    if (!target || roomOf(target) < carried) target = fresh.find((t) => roomOf(t) >= carried);
    if (!target) { yield* this.putBack(o, 'tidak ada Building Spot yang cocok'); return; }
    if (yield* this.claim(target)) { yield* this.placeHeld(o); return; }     // sempat menunggu lawan: nilai ulang
    if (target.kind === 'l2') {
      // Earth ke spot L2 ditaruh dari L1: julurkan boom agar rangka tidak menyentuh dinding L2
      const along = worldToLocal(br.x, br.z, br.yaw, this.pos(o).x, this.pos(o).z)[1];
      const need = FIELD.spotSize / 2 + br.geom.zf + 0.015;       // pusat spot 250 mm di dalam tepi L2
      if (along < need) yield* this.boom(br.e + (need - along) * 1000 + 4);
    }
    const pose = this.placePose(target, o, 0.07);
    if (!pose) { yield* this.putBack(o, 'genggaman terlalu jauh dari tengah untuk masuk Building Spot'); return; }
    this.status = `membawa ${carried} Earth ke ${target.spot.id}`;
    const base = target.spot.level === 2 ? FIELD.L2.h : FIELD.L1.h;
    const level = target.state.bottom ? 1 : 0;                  // ditaruh di lantai atau di atas Earth pertama
    const restH = (base + level * OBJ.earth + o.half - br.y) * 1000;
    // bawa di atas tinggi L2 agar balok bebas berputar di lorong tanpa menyenggol tepi L2
    const carryH = clamp(Math.max(restH + 110, (FIELD.L2.h + 0.03 + o.half - br.y) * 1000), 96, 958);
    yield* this.lift(Math.min(carryH, br.h + 250));     // cukup tinggi dulu, sisanya sambil jalan
    yield* this.travel(target, pose, false, { h: carryH });
    // lawan bisa saja mengisi spot Shared ini saat kita dalam perjalanan: periksa lagi sebelum menurunkan
    const now = this.towers().find((t) => t.spot === target.spot);
    if (roomOf(now) < carried || (now.state.bottom ? 1 : 0) !== level) {
      this.log(`${target.spot.id} sudah berubah — mencari spot lain`, 'warn');
      yield* this.travel(target, pose, true, { h: carryH });
      if ((this.retarget = (this.retarget || 0) + 1) > 3) { this.retarget = 0; yield* this.putBack(o, 'spot terus berubah'); return; }
      yield* this.placeHeld(o);
      return;
    }
    this.retarget = 0;
    this.status = `menaruh Earth di ${target.spot.id}`;
    yield* this.lowerOnto(o, base + level * OBJ.earth);
    this.vacuum(false);
    yield* this.released(o);
    yield* this.travel(target, pose, true, { h: 335, e: 0 });
  }

  // BR tim lawan (bila ada)
  foe() { return this.robots.find((r) => r.kind === 'BR' && r.team !== this.team); }

  // Spot Shared diperebutkan dua tim. Sebelum menuju ke sana BR "memesan" spot itu; bila BR lawan
  // sudah lebih dulu, tunggu sampai ia selesai (tidak menaruh bersamaan, tidak mengganggu: Rule 6.5).
  // Mengembalikan true bila sempat menunggu, supaya pemanggil menilai ulang keadaan menara.
  *claim(target) {
    if (!target.spot.shared || target.kind !== 'barrier') return false;
    const claims = this.rules.claims, id = target.spot.id;
    let waited = false;
    for (let t = 0; claims.get(id) && claims.get(id) !== this && t < 25; t += this.dt) {
      waited = true;
      this.status = `menunggu BR lawan selesai di ${id}`;
      yield IDLE;
    }
    this.release();
    claims.set(id, this);
    return waited;
  }

  // Lepaskan pesanan spot (selesai, gagal, atau di-reset)
  release() {
    for (const [id, who] of this.rules.claims) if (who === this) this.rules.claims.delete(id);
  }

  reset() { super.reset(); this.release(); }

  *dropTowerSky() {
    this.vacuum(false);
    yield* this.wait(1.2);
    yield* this.settle({ roll: 0, e: 0 });
  }

  // Mode track: maju/mundur sepanjang u sampai komponen u = su, sambil menggeser posisi lateral
  // (komponen b) ke rb dengan memiringkan arah hadap. Track tidak bisa bergeser menyamping.
  *trackLine(target, su, rb, { what = 'jalur track', timeout = 20 } = {}) {
    const br = this.br, { u, b } = target;
    let blockedT = 0;
    for (let t = 0; ; t += this.dt) {
      const du = su - (br.x * u[0] + br.z * u[1]), db = rb - (br.x * b[0] + br.z * b[1]);
      if (Math.abs(du) < 0.006) break;
      blockedT = br.blocked ? blockedT + this.dt : 0;
      if (t > timeout || blockedT > 3) throw new Abort(`terhalang menuju ${what}`);
      const dir = Math.sign(du);
      // kemiringan dibatasi agar ujung track tidak menyentuh barrier saat dekat tepi
      const room = FIELD.L1.inner - 0.006 - (br.x * b[0] + br.z * b[1]) - br.geom.trackOut;
      const tmax = clamp(room / br.geom.zf, 0.02, 0.3);
      const th = clamp(6 * db, -tmax, tmax) * dir;
      const want = Math.atan2(u[0] + th * b[0], u[1] + th * b[1]);
      const da = Math.atan2(Math.sin(want - br.yaw), Math.cos(want - br.yaw));
      yield { ...IDLE, f: dir * clamp(Math.abs(du) * 4, 0.12, 1), r: clamp(da * 3, -1, 1), slow: Math.abs(du) < 0.12 };
    }
    // luruskan arah hadap di tempat
    yield* this.goto(br.x, br.z, target.yaw, { what, tol: 0.05, atol: 0.01 });
  }

  // Gagal di tengah jalur track: mundur ke titik siap di lateral mecanum lalu naikkan track,
  // supaya BR tidak tertinggal dalam mode track di samping barrier
  *trackRecover(target, suFar) {
    const br = this.br;
    if (br.track < 0.05) return;
    try { yield* this.trackLine(target, suFar, this.EDGE, { what: 'titik siap' }); } catch (e) { /* tetap coba naikkan track */ }
    yield* this.track(false);
  }

  // Balik Sky lawan di menara Shared supaya warna tim di atas (3.5.8)
  *flipSky(target) {
    const br = this.br, team = br.team;
    if (yield* this.claim(target)) return;
    const now = this.towers('sky').find((t) => t.spot === target.spot);
    const sky = now && now.state.top;
    if (!sky || now.state.lifted || now.state.color === team || sky.state !== 'rest') return;
    this.flipAt[target.spot.id] = this.rules.simT + (this.rebut ? 5 : 45);   // jeda sebelum mencoba menara ini lagi (agresif / maling: segera rebut lagi)
    this.status = `membalik Sky di ${target.spot.id}`;
    const [hx, hz] = this.home, { u, b } = target;
    const along = this.CUP + 0.13 + sky.half + (this.sensor.realistic ? 0.04 : 0.008);
    const at = (s, r) => [s * u[0] + r * b[0], s * u[1] + r * b[1]];
    let p, su, viaTrack, rb, suFar, far, pose, h;
    const plan = () => {
      p = this.pos(sky).clone();
      su = p.x * u[0] + p.z * u[1] - along;
      const lat = p.x * b[0] + p.z * b[1];
      // Sky di luar jangkauan cup dari pose mecanum (pusat robot tertahan barrier): dekati dalam
      // mode track, rangka menggantung di atas barrier dan cup sejajar Sky
      viaTrack = lat > this.EDGE + 0.05;
      rb = viaTrack ? Math.min(lat, this.EDGE_T) : Math.min(lat, this.EDGE);
      suFar = su - 0.6; far = at(suFar, this.EDGE); pose = at(su, rb);
      h = clamp((p.y - br.y - (viaTrack ? this.RISE : 0)) * 1000, 96, 958);
    };
    plan();
    this.vacuum(false);
    yield* this.goto(hx, hz, target.yaw, { what: 'posisi putar', tol: 0.03, atol: 0.03, spin: true, joints: { e: 130, h, roll: 0 } });
    const leave = function* (joints) {
      if (!viaTrack) { yield* this.travel(target, pose, true, joints); return; }
      yield* this.trackLine(target, suFar, this.EDGE, { what: 'keluar dari menara' });
      yield* this.track(false);
      yield* this.travel(target, far, true, joints);
    }.bind(this);
    if (this.sensor.realistic) {
      // sensor realistis: dari titik siap, ukur ulang Sky dari dekat lalu rencanakan ulang
      yield* this.travel(target, far, false, { e: 130, h });
      yield* this.wait(0.25);
      plan();
      yield* this.settle({ h });
    }
    if (viaTrack) {
      if (!this.sensor.realistic) yield* this.travel(target, far, false, { e: 130, h });
      try {
        yield* this.track(true);
        yield* this.trackLine(target, su, rb, { what: target.spot.id });
      } catch (e) { yield* this.trackRecover(target, suFar); throw e; }
      const off = br.x * b[0] + br.z * b[1] - rb;
      if (Math.abs(off) > 0.04) { yield* leave({ e: 0, h: 335 }); throw new Abort(`posisi lateral meleset ${Math.round(off * 1000)} mm di ${target.spot.id}`); }
    } else if (this.sensor.realistic) {
      yield* this.goto(pose[0], pose[1], target.yaw, { what: target.spot.id, tol: 0.008, slowNear: 0.15, joints: { e: 130, h } });
    } else {
      yield* this.travel(target, pose, false, { e: 130, h });
    }
    this.vacuum(true);               // baru dinyalakan setelah diam, supaya Sky tidak terseret saat mendekat
    for (let t = 0; !br.held.length; t += this.dt) {
      if (t > (this.sensor.realistic ? 4 : 1.5)) { this.vacuum(false); yield* leave({ e: 0, h: 335 }); throw new Abort(`Sky di ${target.spot.id} tidak terjangkau cup`); }
      yield { ...IDLE, aux: 0.4, slow: true };
    }
    // angkat cukup tinggi: saat diputar, sudut Sky turun ±41 mm di bawah pusatnya
    yield* this.lift(br.h + 120);
    try {
      yield* this.roll(br.roll > 0 ? br.roll - 180 : br.roll + 180);
    } finally {
      // apa pun yang terjadi, Sky harus kembali ke menaranya (3.5.8), bukan terbawa pergi
      if (br.held.includes(sky)) {
        yield* this.lowerOnto(sky, p.y - sky.half);
        this.vacuum(false);
        yield* this.released(sky);
      }
    }
    yield* this.lift(br.h + 50);
    yield* this.settle({ e: 0, roll: 0 });
    yield* leave({ e: 0, roll: 0, h: 335 });
  }

  *buildSky(sky, target) {
    this.status = `mengambil ${sky.name} untuk ${target.spot.id}`;
    yield* this.pick(sky, 0);
    yield* this.placeHeld(sky, target);
  }

  // Sudut wrist (derajat) agar warna tim menghadap atas; null bila sumbu warna sejajar sumbu wrist
  rollFor(sky) {
    const br = this.br, team = br.team;
    if (sky.topColor() === team) return br.roll;
    const e = sky.mesh.matrixWorld.elements;          // sumbu Y lokal Sky = arah sisi biru
    const a = [e[4], e[5], e[6]];
    const f = [Math.sin(br.yaw), 0, Math.cos(br.yaw)];
    if (Math.abs(a[0] * f[0] + a[2] * f[2]) > 0.5) return null;
    const want = team === 'blue' ? 1 : -1;            // komponen Y yang diinginkan untuk sisi biru
    // sudut dari a ke (0, want, 0) terhadap sumbu maju f
    const cross = [a[1] * 0 - a[2] * want, a[2] * 0 - a[0] * 0, a[0] * want - a[1] * 0];
    const deg = Math.atan2(cross[0] * f[0] + cross[1] * f[1] + cross[2] * f[2], a[1] * want) * 180 / Math.PI;
    return Math.round(deg / 90) * 90;
  }

  // Putar wrist sampai warna tim di atas sambil menuju (x, z, yaw). Mengembalikan false bila tidak bisa.
  *orientSky(sky, x, z, yaw, joints) {
    const br = this.br, team = br.team;
    yield* this.lift(Math.max(br.h, 330));
    const d = this.rollFor(sky);
    const sign = this.rollSign || 1;
    const roll = d === null || sky.topColor() === team ? br.roll : clamp(br.roll + sign * d, -180, 180);
    yield* this.goto(x, z, yaw, { what: 'posisi putar', tol: 0.03, atol: 0.03, joints: { ...joints, roll } });
    // arah putar wrist terhadap sudut hitung ditentukan sekali, lalu diingat
    if (sky.topColor() !== team && d !== null && Math.abs(d) === 90) { this.rollSign = -sign; yield* this.roll(clamp(br.roll - 2 * sign * d, -180, 180)); }
    if (sky.topColor() === team) return true;
    yield* this.roll(0);
    yield* this.putBack(sky, 'warna tim tidak bisa diputar ke atas');
    return false;
  }

  *placeSky(sky, target) {
    const br = this.br;
    const top = (target.spot.level === 2 ? FIELD.L2.h : FIELD.L1.h) + 2 * OBJ.earth;
    const restH = clamp((top + sky.half - br.y) * 1000, 96, 958);
    const [hx, hz] = this.home;
    // wrist diputar, boom dijulurkan (tanpa itu rangka menabrak menara sebelum Sky sampai) dan lift
    // naik, semuanya sambil berputar di tengah lorong
    this.status = `membawa ${sky.name} ke ${target.spot.id}`;
    if (!(yield* this.orientSky(sky, hx, hz, target.yaw, { e: 130, h: restH + 80 }))) return;
    yield* this.settle({ e: 130 });
    const pose = this.placePose(target, sky, 0.2);
    if (!pose) { yield* this.roll(0); yield* this.putBack(sky, 'genggaman terlalu jauh dari tengah'); return; }
    yield* this.travel(target, pose, false, { h: restH + 80 });
    // menara bisa saja sudah diberi Sky oleh lawan saat kita dalam perjalanan
    const now = this.towers('sky').find((t) => t.spot === target.spot);
    if (!now || !now.state.middle || now.state.top) {
      yield* this.travel(target, pose, true, { e: 0, h: 335 });
      yield* this.roll(0);
      const other = this.towers('sky').find((t) => t.state.middle && !t.state.top);
      if (other) { yield* this.placeHeld(sky, other); return; }
      yield* this.putBack(sky, `${target.spot.id} sudah diberi Sky`);
      return;
    }
    this.status = `menaruh ${sky.name} di ${target.spot.id}`;
    yield* this.lowerOnto(sky, top);
    this.vacuum(false);
    yield* this.released(sky);
    yield* this.lift(br.h + 50);
    yield* this.travel(target, pose, true, { e: 0, roll: 0, h: 335 });
  }

  // Naik ke L2 dengan track + flipper pada garis z, sampai pusat robot di |x| = xOn
  *climbL2(z, xOn, joints = {}) {
    const sx = this.sx, [hx] = this.home, inward = -sx * Math.PI / 2;
    yield* this.goto(hx, z, inward, { what: 'depan Level 2', tol: 0.02, joints: { e: 0, h: 460, ...joints } });
    yield* this.track(true);
    this.status = 'naik ke Level 2';
    yield* this.flipper(150);
    yield* this.goto(sx * xOn, z, inward, { what: 'Level 2', timeout: 40, tol: 0.03, joints: { flip: 180 } });
  }

  // Turun mundur dari L2 pada garis z, lipat flipper, naikkan track, kembali ke posisi tunggu
  *descendL2(z) {
    const [hx, hz] = this.home, inward = -this.sx * Math.PI / 2;
    this.status = 'turun dari Level 2';
    yield* this.goto(hx, z, inward, { what: 'Level 1', timeout: 40, tol: 0.04, joints: { e: 0, h: 460, roll: 0 } });
    yield* this.flipper(0);
    yield* this.track(false);
    yield* this.goto(hx, hz, this.pickYaw, { what: 'posisi tunggu', pass: true, spin: true, joints: { h: 335 } });
  }

  // Sky untuk menara L2: BR harus berada di L2 (Rule 3.5.4). Naik di samping menara, berputar
  // menghadap menara, menaruh, lalu turun.
  *placeSkyL2(sky, target) {
    const br = this.br, sx = this.sx, [hx] = this.home;
    const inward = -sx * Math.PI / 2, cz = target.climbZ, xs = target.spot.x;
    const top = FIELD.L2.h + 2 * OBJ.earth;
    this.status = `membawa ${sky.name} ke ${target.spot.id} (naik L2)`;
    if (!(yield* this.orientSky(sky, hx, cz, inward, { e: 0, h: 460 }))) return;
    yield* this.climbL2(cz, Math.abs(xs));
    yield* this.goto(xs, cz, target.skyYaw, { what: target.spot.id, tol: 0.06, atol: 0.02 });      // putar di tempat
    // tinggi lift diukur dari alas Sky: 80 mm di atas puncak menara
    for (let t = 0; sky.aabb().min.y < top + 0.08; t += this.dt) {
      if (t > 8 || br.h >= 957) throw new Abort('lift tidak cukup tinggi untuk menara L2');
      yield { ...IDLE, lift: 1 };
    }
    yield* this.boom(130);
    this.status = `menaruh ${sky.name} di ${target.spot.id}`;
    const [dx, dz] = target.skyDir;
    for (let t = 0; ; t += this.dt) {
      const p = this.pos(sky);
      const ahead = (target.spot.x - p.x) * dx + (target.spot.z - p.z) * dz;
      const side = worldToLocal(br.x, br.z, br.yaw, target.spot.x, target.spot.z)[0] - worldToLocal(br.x, br.z, br.yaw, p.x, p.z)[0];
      const still = Math.hypot(br.vx, br.vz) < 0.02 && Math.abs(br.w) < 0.03;
      if (Math.abs(ahead) < 0.015 && still) break;
      if (t > 20) throw new Abort(`tidak bisa menepatkan Sky di ${target.spot.id}`);
      yield { ...IDLE, f: clamp(ahead * 4, -1, 1), r: clamp(side * 3, -0.5, 0.5), slow: Math.abs(ahead) < 0.12 };
    }
    yield* this.lowerOnto(sky, top);
    this.vacuum(false);
    yield* this.released(sky);
    yield* this.lift(br.h + 50);
    yield* this.goto(xs, cz, target.skyYaw, { what: 'tepi Level 2', tol: 0.06, joints: { e: 0 } });
    yield* this.goto(xs, cz, inward, { what: 'tepi Level 2', tol: 0.08, atol: 0.03, joints: { roll: 0 } });
    yield* this.descendL2(cz);
  }

  // Kembalikan benda ke lantai Transfer Area (lantai yang sah) dan beri tahu operator
  *putBack(o, why) {
    const br = this.br, sx = this.sx, [hx, hz] = this.home;
    this.status = `mengembalikan ${o.name} ke Transfer Area`;
    this.log(`${o.name}: ${why} — dikembalikan ke Transfer Area`, 'warn');
    yield* this.goto(hx, hz, undefined, { what: 'posisi tunggu', tol: 0.03 });
    yield* this.goto(hx, hz, this.pickYaw, { what: 'posisi tunggu' });
    yield* this.roll(0);
    const along = this.CUP + o.half;
    const rest = (FIELD.L1.h + o.half - br.y) * 1000;
    yield* this.lift(rest + 110);
    yield* this.goto(sx * (FIELD.lane.xIn + 0.5 - along) , clamp(br.z, this.OPEN[0], this.OPEN[1]), this.pickYaw, { what: 'Transfer Area', slow: true });
    yield* this.lowerOnto(o, FIELD.L1.h);
    this.vacuum(false);
    yield* this.released(o);
    yield* this.goto(hx, hz, this.pickYaw, { what: 'posisi tunggu' });
    yield* this.wait(4);           // beri waktu operator mengambilnya lagi
  }

  // Serah terima Mustika langsung dari rahang TR (3.4.5, 4.4.3)
  *takeBall(ball) {
    const br = this.br, sx = this.sx, [hx] = this.home;
    const tr = this.tr();
    this.status = 'mengambil Mustika dari TR';
    // tunggu TR diam
    for (let t = 0; this.sensor.senseRobot(tr)?.moving !== false; t += this.dt) { if (t > 6) throw new Abort('TR tidak berhenti'); yield IDLE; }
    let p = this.pos(ball).clone();
    if (this.sensor.realistic) {
      // ukur dari depan Transfer Area (lebih dekat) sebelum merencanakan jangkauan
      yield* this.goto(hx, clamp(p.z, this.OPEN[0], this.OPEN[1]), this.pickYaw, { what: 'depan Transfer Area', spin: true, joints: { roll: 0, e: 0 } });
      yield* this.wait(0.25);
      p = this.pos(ball).clone();
    }
    const zr = clamp(p.z, this.OPEN[0], this.OPEN[1]);
    // rangka BR tidak boleh menabrak lengan TR; sisanya dijangkau boom
    const xr = sx * Math.min(Math.abs(p.x) - ball.half - this.CUP - 0.01, 3.194 - br.G.hw);
    const reach = Math.abs(xr - p.x) - ball.half - this.CUP;
    if (Math.abs(p.z - zr) > (this.sensor.realistic ? 0.05 : 0.03) || reach > 0.235) {
      this.hint('ball-pos', 'Mustika di luar jangkauan — TR di tengah Transfer Area, sedekat mungkin ke L1');
      throw new Abort('Mustika tidak terjangkau');
    }
    this.vacuum(false);
    yield* this.goto(hx, zr, this.pickYaw, { what: 'depan Transfer Area', spin: true, joints: { roll: 0, e: 0, h: clamp((p.y - FIELD.L1.h) * 1000, 96, 958) } });
    yield* this.goto(xr, zr, this.pickYaw, { what: 'Mustika', slowNear: 0.15 });
    this.vacuum(true);
    for (let t = 0; !br.held.length; t += this.dt) {
      if (t > 6 || br.e >= 239.5) { this.vacuum(false); throw new Abort('gagal menghisap Mustika'); }
      yield { ...IDLE, aux: 0.5 };
    }
    this.status = 'Mustika dipegang BR — lepas jepit TR (Space bila TR manual)';
    this.log('Mustika sudah dihisap — lepaskan jepit TR', 'ok');
    for (let t = 0; ball.holders.length > 1; t += this.dt) {
      if (t > 30) { this.vacuum(false); throw new Abort('TR tidak melepas Mustika'); }
      yield IDLE;
    }
    if (ball.state !== 'held') throw new Abort('Mustika terlepas');
    yield* this.lift(br.h + 40);
    yield* this.goto(hx, zr, this.pickYaw, { what: 'lorong L1', pass: true, joints: { e: 0 } });
    yield* this.enshrine(ball);
  }

  // Bawa Mustika naik ke L2 dan taruh di Central Pillar
  *enshrine(ball) {
    const br = this.br, sx = this.sx, [hx] = this.home;
    const inward = -sx * Math.PI / 2;
    const pillar = FIELD.centralPillar;
    const top = FIELD.L2.h + pillar.h;
    const gone = () => { if (ball.state !== 'held') throw new Abort('Mustika terlepas / dikeluarkan'); };
    if (regionAt(br.x, br.z).name !== 'L2') {
      this.status = 'membawa Mustika ke Level 2';
      yield* this.climbL2(0, 1.0);
    }
    this.status = 'menaruh Mustika di Central Pillar';
    // angkat sampai bola di atas dudukan
    for (let t = 0; this.pos(ball).y < top + 0.054 + 0.05; t += this.dt) {
      gone();
      if (t > 8 || br.h >= 957) throw new Abort('lift tidak cukup tinggi untuk Central Pillar');
      yield { ...IDLE, lift: 1 };
    }
    // maju sampai bola di atas sumbu pilar; arah dikoreksi agar bola tepat di tengah
    for (let t = 0; ; t += this.dt) {
      gone();
      const p = this.pos(ball);
      const [lx, lz] = worldToLocal(br.x, br.z, br.yaw, pillar.x, pillar.z);
      const [bx, bz] = worldToLocal(br.x, br.z, br.yaw, p.x, p.z);
      const ahead = lz - bz, side = lx - bx;
      const still = Math.hypot(br.vx, br.vz) < 0.02 && Math.abs(br.w) < 0.03;
      if (Math.abs(ahead) < 0.012 && Math.abs(side) < 0.02 && still) break;
      if (t > 25) throw new Abort('tidak bisa menepatkan Mustika di atas Central Pillar');
      const far = Math.abs(br.x) > 0.62;          // rangka harus tetap di luar pilar
      yield {
        ...IDLE,
        f: far ? clamp(ahead * 4, -1, 1) : 0,
        aux: far ? 0 : clamp(ahead * 14, -1, 1),
        r: clamp(Math.atan2(side, Math.max(0.2, lz)) * 4, -0.6, 0.6),
        slow: Math.abs(ahead) < 0.12,
      };
    }
    this.vacuum(false);
    yield* this.released(ball);
    yield* this.wait(0.3);
    if (this.rules.enshrined) this.log('Mustika diabadikan di Central Pillar', 'ok');
    yield* this.goto(sx * 1.0, 0, inward, { what: 'tepi Level 2', tol: 0.04, pass: true, joints: { e: 0, h: 460 } });
    yield* this.descendL2(0);
  }
}
