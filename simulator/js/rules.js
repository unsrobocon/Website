import { FIELD, SPOTS, POINTS, MATCH_SECONDS } from './config.js';
import { inRect, spotRect, storageRect, transferRect, regionAt, heightAt } from './field.js';
import { obbOverlap2D } from './geom.js';

const SHARED_RECTS = [FIELD.skyArea, FIELD.mustikaArea, ...FIELD.l1Shared, { x0: -1.5, x1: 1.5, z0: -1.5, z1: 1.5 }];
const TEAM_NAME = { red: 'Merah', blue: 'Biru' };

export class Rules {
  constructor(objects, events, team) {
    this.objects = objects;
    this.events = events;
    this.team = team;
    this.robots = [];
    this.logFn = () => {};
    this.flashFn = () => {};
    this.reset();
    events.on('release', (e) => this.onRelease(e));
    events.on('landed', (e) => this.onLanded(e));
    events.on('pick', (e) => this.onPick(e));
    events.on('handover', (e) => this.onHandover(e));
    events.on('pushed', (e) => this.onPushed(e));
    events.on('contact', (e) => this.onContact(e));
    events.on('bump', (e) => this.onBump(e));
    events.on('removed', (e) => { if (!['Failure', 'Sky invalid'].includes(e.reason)) this.log(`${e.obj.name} dikeluarkan (${e.reason})`, 'warn'); });
    events.on('refill', () => this.log('Mustika Pillar diisi ulang oleh wasit (3.6.6)', 'info'));
  }

  reset() {
    this.phase = 'setup';          // setup | running | paused | ended
    this.time = MATCH_SECONDS;
    this.simT = 0;                 // jam simulasi (detik) untuk cooldown & antrean
    this.pending = [];             // [{ t, fn }] aksi tertunda berbasis jam simulasi
    this.seq = 0;                  // urutan pengambilan benda (6.4)
    // keadaan per tim; getter di bawah (mandate, transferPts, breakdown) menunjuk tim pemain
    const blank = () => ({ transfer: 0, mandate: false, mandateTime: null });
    this.st = { red: blank(), blue: blank() };
    this.bd = { red: { transfer: 0, towers: 0, mustika: 0 }, blue: { transfer: 0, towers: 0, mustika: 0 } };
    this.enshrined = null;
    this.score = { red: 0, blue: 0 };
    this.towers = [];
    this.claims = new Map();       // spot.id -> autopilot BR yang sedang mengerjakan spot Shared itu
    this.topColor = new Map();     // spot.id -> warna Sky terakhir (untuk mencatat pasang / flip)
    this.cool = new Map();
    this.pushInc = null;           // insiden dorong terakhir (6.3: satu Sky invalid per insiden)
    this.setupLeft = 60;           // mode pertandingan: waktu setup (4.1.1)
    this.insiden = new Set();      // spot menara yang sedang roboh, menunggu dipulihkan (6.6.2)
    this.final = null;             // skor akhir, dibekukan saat buzzer (4.6.2)
  }

  get mandate() { return this.st[this.team].mandate; }
  set mandate(v) { this.st[this.team].mandate = v; }
  get mandateTime() { return this.st[this.team].mandateTime; }
  get transferPts() { return this.st[this.team].transfer; }
  get breakdown() { return this.bd[this.team]; }
  mandateOf(team) { return this.st[team].mandate; }
  breakdownOf(team) { return this.bd[team]; }
  // awalan nama tim untuk kejadian tim lawan
  tag(team) { return team && team !== this.team ? `[${TEAM_NAME[team]}] ` : ''; }

  // Kejadian untuk catatan waktu (js/timeline.js)
  tl(type, team, text, pts = 0, robot = null) {
    this.events.emit('tl', { type, team, text, pts, robot: robot ? robot.kind : null });
  }

  log(msg, type = 'info') {
    this.logFn(msg, type, this.clock());
  }

  clock() {
    const t = Math.max(0, this.time);
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  later(sec, fn) {
    this.pending.push({ t: this.simT + sec, fn });
  }

  // Pelanggaran -> Forced Retry (Bagian 6). Dengan forcedRetryFn terpasang (menu: Forced Retry
  // otomatis), wasit memindahkan robot ke Retry Zone saat pertandingan berjalan; tanpa itu
  // hanya peringatan dan operator menekan Retry sendiri. Mengembalikan true bila dicatat.
  violation(key, msg, robot) {
    const team = robot ? robot.team : this.team;
    const k = `${key}:${team}`;
    if ((this.cool.get(k) || -1) > this.simT) return false;
    this.cool.set(k, this.simT + 4);
    this.log(`⚠ ${this.tag(team)}${msg}${robot ? ` — Forced Retry ${robot.kind}` : ''}`, 'bad');
    if (team === this.team) this.flashFn(msg);
    this.tl('pelanggaran', team, msg, 0, robot);
    // ditunda ke awal langkah berikutnya: pemeriksaan aturan yang sedang berjalan tidak terganggu
    if (robot && this.forcedRetryFn && this.phase === 'running' && !this.final) {
      this.later(0, () => { if (this.phase === 'running' && !this.final) this.forcedRetryFn(robot, msg); });
    }
    return true;
  }

  // Peringatan tanpa Forced Retry (pasal tanpa sanksi tertulis, atau tafsiran simulator)
  warnOnce(key, msg, team) {
    const k = `${key}:${team}`;
    if ((this.cool.get(k) || -1) > this.simT) return false;
    this.cool.set(k, this.simT + 4);
    this.log(`⚠ ${this.tag(team)}${msg}`, 'warn');
    if (team === this.team) this.flashFn(msg);
    return true;
  }

  toggleTimer() {
    if (this.phase === 'setup' || this.phase === 'paused') {
      if (this.phase === 'setup') { this.log('Pertandingan dimulai (3:00)', 'ok'); this.tl('mulai', null, 'Pertandingan dimulai'); }
      else this.log('Dilanjutkan', 'info');
      this.phase = 'running';
      for (const r of this.robots) r.stopped = false;
    } else if (this.phase === 'running') {
      this.phase = 'paused';
      this.log('Dijeda', 'info');
    } else if (this.phase === 'ended') {
      this.log('Waktu habis — tekan P untuk reset lapangan', 'info');
    }
  }

  // ---------- event ----------
  onPick({ obj, robot }) {
    if (this.final) return;
    obj.pickSeq = ++this.seq;
    obj.mesh.traverse((m) => { const r = m.userData.obj; if (r && r !== obj) r.pickSeq = ++this.seq; });
    { const q = obj.worldPos(); obj.pickPos = { x: q.x, z: q.z }; }     // tempat diambil (cekLantaiDipegang)
    const p = obj.worldPos();

    if (obj.kind === 'ball') {
      if (!this.mandateOf(robot.team)) {
        obj.illegal = true;
        this.violation('ball-early', 'Mustika diambil sebelum Sanctuary Mandate (3.6.7) — Mustika ini tidak sah', robot);
      }
      // 3.6.7: satu tim hanya boleh memegang satu Mustika (tim lawan boleh memegang miliknya sendiri)
      if (this.objects.list.some((o) => o !== obj && o.kind === 'ball' && o.state === 'held' && o.holders.some((h) => h.robot.team === robot.team))) {
        obj.illegal = true;
        this.violation('ball-two', 'Tim memegang lebih dari satu Mustika (3.6.7) — Mustika kedua tidak sah', robot);
      }
    }

    // 3.2.2 / 4.4.3: BR hanya boleh menyentuh benda di Transfer Area, L1 atau L2
    if (robot.kind === 'BR' && !['transfer', 'L1', 'L2'].includes(regionAt(p.x, p.z).name)) {
      this.violation('br-touch', `BR menyentuh ${obj.name} di luar Transfer Area / L1 / L2 (4.4.3)`, robot);
    }

    // 3.5.5 / 6.6.1: Earth yang sudah benar di Building Spot tidak boleh dipindah tim lawan, dan tim
    // sendiri tidak boleh memindahnya bila ada blok lawan di atasnya. Pelanggaran: Forced Retry, menara
    // dipulihkan wasit (6.6.2). Tim sendiri tanpa blok lawan di atas boleh memindahnya (poinnya lepas).
    if (obj.kind === 'earth' && obj.placedBy) {
      const t = this.towers.find((tw) => tw.bottom === obj || tw.middle === obj);
      const above = t ? (t.bottom === obj ? [t.middle] : []).filter(Boolean) : [];
      const why = obj.placedBy !== robot.team ? `Earth milik tim ${TEAM_NAME[obj.placedBy]}`
        : above.some((o) => o.placedBy && o.placedBy !== robot.team) ? 'Earth dengan blok lawan di atasnya' : null;
      if (why && t) {
        this.pulihkanMenara(t);
        this.violation(`pindah-earth-${robot.kind}`, `${robot.kind} memindah ${why} dari Building Spot ${t.spot.id} (3.5.5, 6.6.1) — menara dipulihkan wasit`, robot);
        return;
      }
      this.log(`${obj.name} diangkat dari Building Spot — poinnya lepas sampai ditaruh lagi (3.5.5)`, 'warn');
    }
    obj.placedBy = null;
    obj.mesh.traverse((m) => { const r = m.userData.obj; if (r && r !== obj && r.kind === 'earth') r.placedBy = null; });
  }

  onRelease({ obj, robot }) {
    if (robot.kind === 'TR') obj.trContact = robot.releaseRegion || robot.contactRegion?.();
    // tinggi dasar benda di atas lantai saat dilepas (tafsiran 6.3 "menjatuhkan Sky")
    { const p = obj.worldPos(); obj.dropH = p.y - obj.half - heightAt(p.x, p.z); }
    obj.mesh.traverse((m) => {
      const r = m.userData.obj;
      if (r && r !== obj) r.trContact = obj.trContact;
    });
  }

  // Serah terima langsung antar robot (3.4.5, 4.4.3)
  onHandover({ obj, from, to }) {
    if (this.final) return;
    this.log(`Serah terima ${obj.name}: ${from.kind} → ${to.kind}`, 'ok');
    const p = obj.worldPos();
    if (!inRect(p.x, p.z, transferRect(from.team))) {
      this.violation('handover-out', `Serah terima ${obj.name} di luar Transfer Area (4.4.3)`, to);
      return;
    }
    if (from.kind !== 'TR' || obj.kind === 'ball') return;
    // 8.1: blok dihitung "delivered" saat dilepas TR di dalam batas vertikal Transfer Area
    const contact = from.contactRegion?.();
    const all = [obj];
    obj.mesh.traverse((m) => { const r = m.userData.obj; if (r && r !== obj) all.push(r); });
    for (const o of all) this.tryTransfer(o, from, contact);
  }

  onLanded({ obj, support, riders }) {
    if (this.final) return;   // benda yang masih melayang saat buzzer tidak dihitung
    const all = [obj, ...riders];
    for (const o of all) {
      const by = o.lastReleasedBy;
      if (by && by.kind === 'TR') this.tryTransfer(o, by, o.trContact);
    }
    this.validatePlacement(obj, support);
    for (const r of riders) this.validatePlacement(r, { who: r.restingOn });
  }

  tryTransfer(o, tr, contact) {
    if (o.kind === 'ball' || o.transferAwarded || o.invalid) return;
    if (!this.fullyIn(o, transferRect(tr.team))) return;
    if (contact && contact.touchingGround) {
      this.log(`${o.name} di Transfer Area tetapi TR masih menyentuh Ground Area (3.4.5) — tanpa poin`, 'warn');
      return;
    }
    o.transferAwarded = true;
    this.st[tr.team].transfer += POINTS.transfer;
    this.log(`${this.tag(tr.team)}+${POINTS.transfer} Transfer: ${o.name}`, 'ok');
    this.tl('transfer', tr.team, `Transfer ${o.name}`, POINTS.transfer, tr);
  }

  validatePlacement(o, support) {
    if (o.state !== 'rest' || o.invalid || o.roboh) return;    // blok menara roboh: dipulihkan wasit (6.6.2)
    const p = o.worldPos();
    const who = support.who;
    const releaser = o.lastReleasedBy;
    if (o.kind === 'ball') {
      if (who === 'pillar:central') {
        if (o.illegal) {
          this.log('Mustika di Central Pillar tidak sah (diambil melanggar 3.6.7) — tanpa poin', 'bad');
          this.later(0.9, () => this.objects.remove(o, 'Mustika tidak sah'));
          return;
        }
        if (!this.enshrined) {
          this.enshrined = o;
          o.enshrined = true;
          o.placedBy = releaser ? releaser.team : this.team;
          this.log(`${this.tag(o.placedBy)}MUSTIKA DIABADIKAN di Central Pillar! +${POINTS.mustika}`, 'ok');
          this.tl('mustika', o.placedBy, 'Mustika diabadikan', this.mandateOf(o.placedBy) ? POINTS.mustika : 0, releaser);
          // 3.6.8: hanya Mustika pertama yang sah; yang lain dikeluarkan dari lapangan
          for (const b of this.objects.active()) {
            if (b.kind === 'ball' && b !== o) this.objects.remove(b, 'Mustika lain tidak sah (3.6.8)');
          }
        }
        return;
      }
      if (who === 'pillar:mustika') return;
      this.objects.remove(o, 'Mustika jatuh (6.2)');
      return;
    }
    const spot = this.spotUnder(o);
    if (o.kind === 'earth') {
      if (who === 'terrain') {
        if (spot) {
          if (this.baseOnSpot(o, spot)) this.placed(o, spot, 0, releaser);
          else this.failure(o, 'sebagian tapak di luar Building Spot');
          return;
        }
        const ok = inRect(p.x, p.z, storageRect('red')) || inRect(p.x, p.z, storageRect('blue')) ||
          this.fullyIn(o, transferRect('red')) || this.fullyIn(o, transferRect('blue'));
        if (!ok) this.failure(o, 'menyentuh lantai di luar Storage/Transfer/Building Spot');
        return;
      }
      if (who && who.kind === 'earth' && spot) {
        const lower = who;
        if (lower.restingOn === 'terrain' && this.spotUnder(lower) === spot) { this.placed(o, spot, 1, releaser); return; }
        this.failure(o, 'urutan menara salah (lebih dari 2 Earth)');
        return;
      }
      if (who && who.kind === 'sky' && spot) this.failure(o, 'Earth di atas Sky Block');
      return;
    }
    if (o.kind === 'sky') {
      const onMiddle = !!(who && who.kind === 'earth' && spot &&
        who.restingOn && who.restingOn.kind === 'earth' && who.restingOn.restingOn === 'terrain');

      // 3.5.8 / 6.3: Sky yang diangkat dari menara hanya boleh dibalik dan kembali ke menara yang sama
      if (o.towerSpot) {
        if (onMiddle && spot === o.towerSpot) {
          if (!o.topColor()) this.log(`${o.name} kembali ke menara tetapi belahan warna menghadap samping — poin tetap milik ${TEAM_NAME[o.lastColor]} (3.5.6)`, 'warn');
          return;
        }
        const why = spot && spot !== o.towerSpot ? 'dipindah ke menara lain' : 'jatuh / diletakkan di luar menaranya';
        this.violation(`sky-move-${o.id}`, `Sky Block ${why} (3.5.8)`, releaser);
        this.restoreSky(o);
        return;
      }

      if (who === 'terrain') {
        if (inRect(p.x, p.z, FIELD.skyArea)) {
          // TAFSIRAN simulator (belum pasti): Sky yang dilepas dari atas di Ground Shared Area mungkin
          // termasuk "menjatuhkan Sky" (6.3). Hanya peringatan, tanpa Forced Retry; tunggu FAQ resmi.
          if (releaser && o.dropH > 0.05) this.warnOnce(`sky-jatuh-${releaser.kind}`, `${releaser.kind} melepas ${o.name} dari ketinggian ${Math.round(o.dropH * 1000)} mm di Ground Shared Area — mungkin dihitung "menjatuhkan Sky" (6.3, tafsiran)`, releaser.team);
          o.dropH = 0;
          return;
        }
        if (this.fullyIn(o, transferRect('red')) || this.fullyIn(o, transferRect('blue'))) return;
        this.invalidSky(o, spot ? 'Sky langsung di Building Spot (di luar urutan)' : 'menyentuh lantai di luar area yang diizinkan', releaser);
        return;
      }
      if (who && who.kind === 'earth' && spot) {
        if (!onMiddle) { this.invalidSky(o, 'Sky di atas satu Earth saja (di luar urutan)', releaser); return; }
        // menara ini masih punya Sky sendiri yang sedang diangkat untuk dibalik (3.5.8)
        if (this.objects.list.some((k) => k !== o && k.kind === 'sky' && k.towerSpot === spot && !k.invalid && k.state !== 'gone')) {
          this.invalidSky(o, 'menara sudah punya Sky Block yang sedang dibalik', releaser); return;
        }
        // 3.5.4: untuk menara di L2, BR harus berada di Level 2
        if (spot.level === 2 && releaser && releaser.kind === 'BR' && releaser.region().name !== 'L2') {
          this.violation('sky-l2', 'Sky ditaruh di menara L2 saat BR tidak berada di Level 2 (3.5.4)', releaser);
        }
        if (!o.isFlat()) this.log(`${o.name} tidak rata — tidak berpoin`, 'warn');
        else if (!o.topColor()) this.log(`${o.name} di menara, tetapi belahan warna menghadap samping (tanpa poin) — putar wrist 90°`, 'warn');
        return;
      }
      if (who && who.kind === 'sky' && spot) this.invalidSky(o, 'Sky di atas Sky', releaser);
    }
  }

  // Earth sah di Building Spot: catat tim yang menaruh (8.3.1) dan kejadiannya
  placed(o, spot, layer, releaser) {
    o.placedBy = releaser ? releaser.team : o.team;
    const pts = (spot.level === 2 ? POINTS.L2 : POINTS.L1)[layer];
    this.tl('earth', o.placedBy, `Earth ke-${layer + 1} di ${spot.id}`, pts, releaser);
  }

  // Kembalikan Sky ke puncak menara asalnya dengan warna terakhir di atas (3.5.8, 6.6.2)
  restoreSky(o) {
    o.state = 'fall';          // jangan dihitung sebagai puncak menara tempat ia mendarat
    o.restingOn = null;
    const t = this.computeTowers().find((x) => x.spot === o.towerSpot);
    if (!t || !t.middle) {
      o.towerSpot = null;
      this.invalidSky(o, 'menara asal sudah tidak ada', null);
      return;
    }
    const m = t.middle.worldPos();
    if (o.lastColor === 'red') o.mesh.quaternion.set(1, 0, 0, 0);   // 180° thd X: sisi MERAH di atas
    else o.mesh.quaternion.identity();
    o.mesh.position.set(m.x, m.y + t.middle.half + o.half, m.z);
    o.state = 'rest';
    o.vy = 0;
    o.restingOn = t.middle;
    this.log(`${o.name} dikembalikan wasit ke menara ${o.towerSpot.id}`, 'info');
  }

  // 6.3: Sky yang didorong keluar Ground Shared Area tanpa diangkat. Dalam satu insiden hanya satu
  // Sky yang invalid (robot pendorong kena Forced Retry); sisanya dikembalikan wasit ke dalam area.
  onPushed({ obj, robot }) {
    if (this.final || obj.kind !== 'sky' || obj.invalid || obj.state !== 'rest') return;
    // 6.5: menyibak Sky yang sedang diapit rahang TR lawan
    const foe = this.robots.find((r) => r.team !== robot.team && r.kind === 'TR' && !r.held.length && r.jawCandidate().obj === obj);
    if (foe) this.violation(`interferensi-${robot.kind}`, `${robot.kind} mendorong ${obj.name} yang sedang diambil TR lawan (6.5)`, robot);
    const p = obj.worldPos();
    if (inRect(p.x, p.z, FIELD.skyArea)) return;
    const inc = this.pushInc;
    if (inc && inc.robot === robot && this.simT - inc.t < 0.6) {
      inc.t = this.simT;
      this.returnSky(obj);
      return;
    }
    this.pushInc = { robot, t: this.simT };
    this.invalidSky(obj, 'didorong keluar Ground Shared Area tanpa diangkat', robot);
  }

  // 6.5 (heuristik wasit): robot yang mendorong robot lawan di area Shared saat robot lawan itu
  // sedang memanipulasi benda (memegang, mengapit di antara rahang, atau menghisap dengan cup).
  onContact({ by, to }) {
    if (this.final || by.team === to.team) return;
    if (![by, to].some((r) => SHARED_RECTS.some((s) => inRect(r.x, r.z, s)))) return;
    const what = this.manipulating(to);
    if (what) this.violation(`interferensi-${by.kind}`, `${by.kind} mendorong ${to.kind} lawan yang sedang ${what} di area Shared (6.5)`, by);
  }

  // 6.6: robot menabrak blok menara cukup keras. Wasit memulihkan menara (di simulator menara tidak
  // bergeser), robot itu Forced Retry, dan robot tim lain yang menyentuh menara yang sama juga.
  // Blok yang sedang ditaruh (menyentuh menara saat itu) menjadi invalid.
  onBump({ robot, objs, byHeld }) {
    if (this.final) return;
    // 6.6.3: menabrak Mustika yang sudah diabadikan = Forced Retry; Mustika tetap di Central Pillar
    // (wasit mengembalikannya; di simulator Mustika itu memang tidak ikut bergeser)
    if (this.enshrined && objs.includes(this.enshrined)) {
      this.violation(`mustika-${robot.kind}`, `${robot.kind} menabrak Mustika yang sudah diabadikan (6.6.3) — Mustika dikembalikan wasit`, robot);
      return;
    }
    const t = this.towers.find((tw) => objs.some((o) => o === tw.bottom || o === tw.middle || o === tw.top));
    if (!t) return;
    const msg = `${robot.kind} menabrak menara ${t.spot.id} (6.6) — menara dipulihkan wasit`;
    if (!this.violation(`menara-${robot.kind}`, msg, robot)) return;
    if (byHeld) {
      for (const o of [...robot.heldSet()]) if (o.kind !== 'ball' && !o.invalid) this.objects.remove(o, 'sedang ditaruh saat menara tertabrak (6.6.2)');
    }
    const blocks = [t.bottom, t.middle, t.top].filter(Boolean).map((o) => Object.assign(o.obb(0.01), {}));
    for (const r of this.robots) {
      if (r === robot || r.team === robot.team) continue;
      if (r.collides(r.shapesAt(r.x, r.z, r.yaw, r.dynamicLocal()), { obbs: blocks, circles: [] })) {
        this.violation(`menara-${r.kind}`, `${r.kind} juga menyentuh menara ${t.spot.id} saat tertabrak (6.6.1)`, r);
      }
    }
    this.robohkan(t, robot);
  }

  // 6.6.2: wasit mengembalikan menara t persis seperti keadaan terakhir (posisi, urutan, warna Sky),
  // termasuk blok yang sedang diangkat robot. Dijalankan pada awal langkah berikutnya.
  pulihkanMenara(t) {
    const blocks = [t.bottom, t.middle, t.top].filter(Boolean);
    const simpan = blocks.map((o, i) => ({ o, pos: o.worldPos().clone(), q: o.mesh.getWorldQuaternion(o.mesh.quaternion.clone()), on: i === 0 ? 'terrain' : blocks[i - 1], by: o.placedBy }));
    this.later(0, () => {
      for (const sv of simpan) {
        const o = sv.o;
        if (o.state === 'gone') continue;
        for (const h of [...o.holders]) h.robot.forgetObject?.(o);
        o.holders = []; o.carrier = null;
        this.objects.scene.attach(o.mesh);
        o.mesh.position.copy(sv.pos); o.mesh.quaternion.copy(sv.q);
        o.state = 'rest'; o.vy = 0; o.restingOn = sv.on;
        if (o.kind === 'earth') o.placedBy = sv.by;
      }
    });
  }

  // 6.6.2: blok atas menara terlempar searah tabrakan, lalu ±2 detik kemudian wasit memulihkan menara
  // persis seperti sebelum insiden (blok sama, urutan sama, warna Sky sama). Blok yang jatuh bukan
  // Failure dan bukan Sky invalid.
  robohkan(t, robot) {
    const atas = [t.middle, t.top].filter((o) => o && o.state === 'rest');
    if (!atas.length || this.insiden.has(t.spot.id)) return;
    const simpan = [t.bottom, t.middle, t.top].filter(Boolean).map((o) => ({ o, pos: o.mesh.position.clone(), q: o.mesh.quaternion.clone(), on: o.restingOn }));
    this.insiden.add(t.spot.id);
    for (const sv of simpan) sv.o.roboh = true;
    const b = t.bottom.worldPos(), dx = b.x - robot.x, dz = b.z - robot.z, n = Math.hypot(dx, dz) || 1;
    atas.forEach((o, i) => {
      this.objects.scene.attach(o.mesh);
      o.mesh.position.x += (dx / n) * (0.42 + 0.2 * i);
      o.mesh.position.z += (dz / n) * (0.42 + 0.2 * i);
      o.mesh.position.y += 0.02;
      o.state = 'fall'; o.vy = 0; o.restingOn = null;
    });
    this.log(`Menara ${t.spot.id} roboh — dipulihkan wasit dalam 2 detik (6.6.2)`, 'warn');
    this.later(2, () => {
      for (const sv of simpan) {
        const o = sv.o;
        if (o.state === 'gone') continue;
        for (const h of [...o.holders]) h.robot.forgetObject?.(o);
        o.holders = []; o.carrier = null;
        this.objects.scene.attach(o.mesh);
        o.mesh.position.copy(sv.pos); o.mesh.quaternion.copy(sv.q);
        o.state = 'rest'; o.vy = 0; o.restingOn = sv.on; o.roboh = false;
      }
      this.insiden.delete(t.spot.id);
      this.log(`Menara ${t.spot.id} dipulihkan wasit (6.6.2)`, 'info');
    });
  }

  manipulating(r) {
    if (r.held.length) return 'memegang benda';
    if (r.kind === 'TR' && r.jawCandidate().obj) return 'mengambil benda';
    if (r.kind === 'BR' && r.vacuum && r.findContact()) return 'menghisap benda';
    return null;
  }

  // Taruh Sky di tempat kosong di Ground Shared Area (sel grid awal lebih dulu)
  returnSky(o) {
    const g = FIELD.skyGrid, a = FIELD.skyArea, cells = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cells.push([g.x0 + c * g.pitch, g.z0 + r * g.pitch]);
    for (let x = a.x0 + o.half + 0.01; x <= a.x1 - o.half - 0.01; x += 0.1) for (let z = a.z0 + o.half + 0.01; z <= a.z1 - o.half - 0.01; z += 0.1) cells.push([x, z]);
    const box = (x, z) => ({ cx: x, cz: z, hx: o.half + 0.01, hz: o.half + 0.01, a: 0 });
    const free = ([x, z]) => this.objects.list.every((r) => r === o || r.state === 'gone' || r.state === 'held' ||
      Math.max(Math.abs(r.worldPos().x - x), Math.abs(r.worldPos().z - z)) > o.half + r.half + 0.01) &&
      this.robots.every((r) => r.bodyObbs(r.x, r.z, r.yaw, r.y).every((b) => !obbOverlap2D(b, box(x, z))));
    const spot = cells.find(free);
    if (!spot) { this.invalidSky(o, 'didorong keluar area dan tidak ada tempat kosong', null); return; }
    o.mesh.position.set(spot[0], o.half, spot[1]);
    o.mesh.updateMatrixWorld(true);
    o.state = 'rest';
    o.restingOn = 'terrain';
    this.log(`${o.name} ikut terdorong keluar — dikembalikan wasit ke Ground Shared Area (6.3)`, 'info');
  }

  // Retry (5.3): Sky yang sedang diangkat dari menara dikembalikan wasit ke menaranya
  onRetry(robot) {
    for (const o of [...robot.heldSet()]) {
      if (o.kind !== 'sky' || !o.towerSpot) continue;
      for (const h of [...o.holders]) h.robot.forgetObject?.(o);
      o.holders = [];
      o.carrier = null;
      this.objects.scene.attach(o.mesh);
      this.restoreSky(o);
    }
  }

  fullyIn(o, r) {
    const b = o.aabb();
    return b.min.x >= r.x0 - 0.002 && b.max.x <= r.x1 + 0.002 && b.min.z >= r.z0 - 0.002 && b.max.z <= r.z1 + 0.002;
  }

  spotUnder(o) {
    const p = o.worldPos();
    for (const s of SPOTS) {
      const r = spotRect(s);
      const lv = s.level === 2 ? FIELD.L2.h : FIELD.L1.h;
      if (p.y < lv) continue;
      if (inRect(p.x, p.z, r)) return s;
    }
    return null;
  }

  // Tapak balok paling bawah harus di dalam Building Spot (toleransi bawaan 500 x 500)
  baseOnSpot(o, s) {
    return this.fullyIn(o, { ...spotRect(s) });
  }

  failure(o, why) {
    this.log(`FAILURE ${o.name}: ${why} (5.1.4)`, 'bad');
    this.tl('failure', o.lastReleasedBy ? o.lastReleasedBy.team : o.team, `Failure ${o.name}: ${why}`, 0, o.lastReleasedBy);
    o.invalid = true;
    this.later(0.9, () => this.objects.remove(o, 'Failure'));
  }

  invalidSky(o, why, robot) {
    o.invalid = true;
    this.violation(`sky-${o.id}`, `Sky Block invalid: ${why} (6.3)`, robot);
    this.later(0.9, () => this.objects.remove(o, 'Sky invalid'));
  }

  // ---------- skor ----------
  // atEnd = true: keadaan saat buzzer; benda yang masih dipegang robot tidak dihitung (4.6.3, 8.6.1)
  computeTowers(atEnd = false) {
    const objs = this.objects.list.filter((o) => o.state === 'rest' && !o.invalid);
    const lifted = atEnd ? [] : this.objects.list.filter((o) => o.kind === 'sky' && o.towerSpot && !o.invalid && ['held', 'ride', 'fall'].includes(o.state));
    const towers = [];
    for (const s of SPOTS) {
      const lv = s.level === 2 ? FIELD.L2.h : FIELD.L1.h;
      const bottom = objs.find((o) => o.kind === 'earth' && o.restingOn === 'terrain' && Math.abs(o.worldPos().y - (lv + o.half)) < 0.02 && this.baseOnSpot(o, s));
      const t = { spot: s, bottom: bottom || null, middle: null, top: null, color: null, complete: false, lifted: false };
      if (bottom) {
        t.middle = objs.find((o) => o.kind === 'earth' && o.restingOn === bottom) || null;
        if (t.middle) {
          t.top = objs.find((o) => o.kind === 'sky' && o.restingOn === t.middle) || null;
          if (t.top) {
            const c = t.top.isFlat() ? t.top.topColor() : null;
            if (c) {
              t.color = c;
            } else if (t.top.towerSpot === s && t.top.lastColor) {
              // 3.5.6: bila kemudian tidak ada warna tim di atas, poin tetap pada warna terakhir
              t.color = t.top.lastColor;
            }
            t.complete = !!c;
          } else {
            // 3.5.8: skor berubah saat flip selesai, bukan saat Sky diangkat
            const up = lifted.find((o) => o.towerSpot === s);
            if (up) { t.top = up; t.color = up.lastColor; t.lifted = true; }
          }
        }
      }
      towers.push(t);
    }
    return towers;
  }

  scoreTowers(towers) {
    const score = { red: 0, blue: 0 };
    for (const t of towers) {
      const L = t.spot.level === 2 ? POINTS.L2 : POINTS.L1;
      if (t.bottom && t.bottom.placedBy) score[t.bottom.placedBy] += L[0];
      if (t.middle && t.middle.placedBy) score[t.middle.placedBy] += L[1];
      if (t.color) score[t.color] += L[2];
    }
    return score;
  }

  update(dt) {
    this.simT += dt;
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.t <= this.simT);
      this.pending = this.pending.filter((p) => p.t > this.simT);
      for (const p of due) p.fn();
    }
    if (this.final) return;   // 4.6.2: skor akhir = keadaan tepat saat buzzer

    let ended = false;
    // mode pertandingan: setup 1 menit (4.1.1), lalu pertandingan dimulai
    if (this.matchMode && this.phase === 'setup') {
      this.setupLeft -= dt;
      if (this.setupLeft <= 0) {
        this.setupLeft = 0;
        this.log('Waktu setup habis', 'info');
        this.toggleTimer();
      }
    }
    if (this.phase === 'running') {
      this.time -= dt;
      if (this.time <= 0) {
        this.time = 0;
        this.phase = 'ended';
        ended = true;
        for (const r of this.robots) { r.stopped = true; r.vx = r.vz = r.w = 0; }
        this.log('WAKTU HABIS — semua robot berhenti (4.6.1)', 'bad');
      }
    }
    this.towers = this.computeTowers(ended);
    // 4.6.3, 8.6.1: benda yang masih disentuh / ditopang robot saat buzzer tidak dihitung
    if (ended) {
      for (const t of this.towers) {
        const kena = [t.bottom, t.middle, t.top].findIndex((o) => o && !t.lifted && this.disentuhRobot(o));
        if (kena < 0) continue;
        const o = [t.bottom, t.middle, t.top][kena];
        this.log(`${o.name} di ${t.spot.id} masih disentuh robot saat buzzer — tidak dihitung (4.6.3)`, 'warn');
        if (kena === 0) t.bottom = null;
        if (kena <= 1) t.middle = null;
        t.top = null; t.color = null; t.complete = false;
      }
    }
    // Catat menara dan warna terakhir tiap Sky yang sah di puncak menara (dipakai 3.5.6 / 3.5.8)
    for (const t of this.towers) {
      if (t.complete) { t.top.towerSpot = t.spot; t.top.lastColor = t.color; }
    }
    const score = this.scoreTowers(this.towers);
    // Sky terpasang / dibalik: dicatat saat warna puncak menara berubah (3.5.8)
    for (const t of this.towers) {
      const prev = this.topColor.get(t.spot.id) || null;
      if (this.insiden.has(t.spot.id)) continue;      // menara roboh sementara: warna tetap yang lama
      if (t.color && t.color !== prev && !t.lifted) {
        const pts = (t.spot.level === 2 ? POINTS.L2 : POINTS.L1)[2];
        this.tl(prev ? 'flip' : 'sky', t.color, `${prev ? 'Sky dibalik' : 'Sky'} di ${t.spot.id}`, pts, t.top && t.top.lastReleasedBy);
      }
      if (!t.lifted) this.topColor.set(t.spot.id, t.color);
    }
    const e = this.enshrined;
    let enshrinedOk = e && e.state === 'rest' && e.restingOn === 'pillar:central';
    if (enshrinedOk && ended && this.disentuhRobot(e)) {
      enshrinedOk = false;
      this.log('Mustika masih disentuh robot saat buzzer — tidak dihitung (4.6.3, 8.5.2)', 'warn');
    }
    for (const team of ['red', 'blue']) {
      const st = this.st[team];
      const towersPts = score[team];
      // Sanctuary Mandate (3.6.1) — sekali tercapai, permanen (3.6.2)
      if (!st.mandate) {
        const mine = this.towers.filter((t) => t.complete && t.color === team);
        if (mine.length >= 2 && mine.some((t) => t.spot.shared)) {
          st.mandate = true;
          st.mandateTime = this.clock();
          this.log(`${this.tag(team)}SANCTUARY MANDATE TERPENUHI — TR boleh mengambil Mustika`, 'ok');
          this.tl('mandate', team, 'Sanctuary Mandate');
        }
      }
      const mustika = enshrinedOk && e.placedBy === team && st.mandate ? POINTS.mustika : 0;   // 8.5.3
      score[team] += st.transfer + mustika;
      this.bd[team] = { transfer: st.transfer, towers: towersPts, mustika };
    }
    this.score = score;
    if (ended) this.finish();
    else this.checkViolations();
  }

  // Bekukan skor akhir dan catat data tie-break (9.3)
  finish() {
    const tb = { mustika: null, sky: { red: 0, blue: 0 }, L2: { red: 0, blue: 0 }, L1: { red: 0, blue: 0 } };
    for (const t of this.towers) {
      const lv = t.spot.level === 2 ? 'L2' : 'L1';
      if (t.bottom && t.bottom.placedBy) tb[lv][t.bottom.placedBy]++;
      if (t.middle && t.middle.placedBy) tb[lv][t.middle.placedBy]++;
      if (t.color) { tb[lv][t.color]++; tb.sky[t.color]++; }
    }
    for (const team of ['red', 'blue']) if (this.bd[team].mustika) tb.mustika = team;
    const { red, blue } = this.score;
    // 9.3: skor sama -> Mustika, lalu jumlah Sky warna tim, blok L2, blok L1
    const better = (a, b) => (a > b ? 'red' : b > a ? 'blue' : null);
    const winner = better(red, blue) || tb.mustika || better(tb.sky.red, tb.sky.blue) || better(tb.L2.red, tb.L2.blue) || better(tb.L1.red, tb.L1.blue);
    this.final = { score: { ...this.score }, breakdown: { ...this.breakdown }, mustika: tb.mustika, tiebreak: tb, winner };
    this.log(`SKOR AKHIR — Merah ${red} : Biru ${blue}${winner ? ` · unggul: ${TEAM_NAME[winner]}` : ' · seri'}`, 'ok');
    this.log(`Tie-break (9.3): Mustika ${tb.mustika ? TEAM_NAME[tb.mustika] : '–'} · Sky warna tim M ${tb.sky.red}/B ${tb.sky.blue} · blok L2 M ${tb.L2.red}/B ${tb.L2.blue} · blok L1 M ${tb.L1.red}/B ${tb.L1.blue}`, 'info');
    this.tl('selesai', null, `Skor akhir Merah ${red} : Biru ${blue}`);
  }

  // Apakah benda o bersinggungan dengan rangka atau mekanisme salah satu robot (celah 5 mm)
  disentuhRobot(o) {
    const ob = o.obb(0.005);
    ob.y0 -= 0.005; ob.y1 += 0.005;
    return this.robots.some((r) => r.collides(r.shapesAt(r.x, r.z, r.yaw, r.dynamicLocal()), { obbs: [ob], circles: [] }));
  }

  // 5.1.4, 6.3: blok yang masih dipegang lalu menyentuh lantai di luar Storage / Transfer Area /
  // Building Spot (Earth) atau di luar Ground Shared Area / Transfer Area / Building Spot (Sky)
  cekLantaiDipegang(r) {
    for (const o of r.heldSet()) {
      if (o.kind === 'ball' || o.invalid || o.state === 'gone' || o.towerSpot) continue;
      // sudut-sudut balok (bisa miring mengikuti robot) dibandingkan dengan lantai tepat di bawahnya
      const p = o.worldPos().clone(), h = o.half;
      let lantai = null;
      o.mesh.updateMatrixWorld(true);
      for (const sx of [-h, h]) for (const sy of [-h, h]) for (const sz of [-h, h]) {
        const c = o.mesh.localToWorld(p.clone().set(sx, sy, sz)), f = heightAt(c.x, c.z);
        if (c.y <= f + 0.002) lantai = f;
      }
      if (lantai === null) continue;
      // masih di tempat ia diambil (belum diseret): lantai di situ sudah dinilai saat benda mendarat
      if (o.pickPos && Math.hypot(p.x - o.pickPos.x, p.z - o.pickPos.z) < 0.02) continue;
      const spot = SPOTS.find((s) => Math.abs(lantai - (s.level === 2 ? FIELD.L2.h : FIELD.L1.h)) < 0.01 && this.fullyIn(o, spotRect(s)));
      const transfer = this.fullyIn(o, transferRect('red')) || this.fullyIn(o, transferRect('blue'));
      if (o.kind === 'earth') {
        if (spot || transfer || inRect(p.x, p.z, storageRect('red')) || inRect(p.x, p.z, storageRect('blue'))) continue;
        this.failure(o, 'menyentuh lantai saat masih dipegang robot');
      } else if (o.kind === 'sky') {
        if (spot || transfer || inRect(p.x, p.z, FIELD.skyArea)) continue;
        this.invalidSky(o, 'menyentuh lantai saat masih dipegang robot', r);
      }
    }
  }

  checkViolations() {
    for (const r of this.robots) {
      this.cekLantaiDipegang(r);
      // 4.3.2: BR hanya boleh menyentuh Ground Area saat Retry atau saat naik ke L1. Tanpa sanksi
      // tertulis di Bagian 6, jadi hanya peringatan: BR yang sudah di L1 lalu kembali ke Ground Area.
      if (r.kind === 'BR') {
        const reg = r.region().name;
        if (reg === 'L1' || reg === 'L2') r.sejakRetry = false;
        else if (reg === 'ground' && r.enteredL1 && !r.sejakRetry) this.warnOnce('br-ground', 'BR kembali ke Ground Area tanpa Retry (4.3.2)', r.team);
      }
      const corners = r.footprintCorners();
      if (r.kind === 'TR') {
        const tr = transferRect(r.team);
        const intoL1 = corners.some(([x, z]) => Math.abs(x) < FIELD.L1.half - 0.005 && Math.abs(z) < FIELD.L1.half - 0.005 && !inRect(x, z, tr));
        if (intoL1) this.violation('tr-area', 'TR melewati batas Transfer Area ke Level 1 (6.1.1)', r);
      }
      const opp = corners.some(([x, z]) => (r.team === 'red' ? x > 0.02 : x < -0.02) && !SHARED_RECTS.some((s) => inRect(x, z, s)));
      if (opp) this.violation(`opp-${r.kind}`, `${r.kind} masuk Team Area lawan (6.1.2)`, r);

      // 6.4 Carry Limit: blok yang diambil terakhir di atas batas menjadi invalid
      const lim = r.kind === 'TR' ? 3 : 2;
      const blocks = [...r.heldSet()].filter((o) => o.kind !== 'ball' && o.state !== 'gone')
        .sort((a, b) => (b.pickSeq || 0) - (a.pickSeq || 0));
      if (r.hasBall() && blocks.length > 0) {
        this.violation(`ballblock-${r.kind}`, `${r.kind} membawa Mustika bersama blok — blok menjadi invalid (6.4)`, r);
        for (const o of blocks) this.objects.remove(o, 'dibawa bersama Mustika (6.4)');
      } else if (blocks.length > lim) {
        this.violation(`carry-${r.kind}`, `${r.kind} membawa ${blocks.length} blok (maks ${lim}) — blok terakhir invalid (6.4)`, r);
        for (const o of blocks.slice(0, blocks.length - lim)) this.objects.remove(o, 'melebihi batas bawa (6.4)');
      }
    }
  }
}
