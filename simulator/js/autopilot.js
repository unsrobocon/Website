// Dasar mode otonom: satu autopilot mengendalikan satu robot.
// Tiap langkah adalah generator yang menghasilkan satu perintah gerak per frame simulasi.
// Autopilot hanya membaca keadaan lapangan; TR dan BR tidak saling berkirim pesan (Rule 11.11).

import { sideSign } from './field.js';
import { worldToLocal, clamp } from './geom.js';

export const IDLE = { f: 0, s: 0, r: 0, lift: 0, aux: 0, roll: 0, flip: 0, slow: false };
const IDLE_NP = { ...IDLE, noPush: true };
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Tugas dibatalkan dengan alasan yang ditulis ke log (bukan bug)
export class Abort extends Error {}

export class AutoPilot {
  constructor(robot, { objects, rules, robots, events }) {
    this.robot = robot;
    this.objects = objects;
    this.rules = rules;
    this.robots = robots;
    this.events = events;
    this.team = robot.team;
    this.sx = sideSign(robot.team);       // merah -1, biru +1
    this.enabled = false;
    this.status = '';
    this.logFn = () => {};
    this.maxErrors = 4;
    this.ai = false;        // robot lawan: hanya bekerja saat timer jalan, Retry sendiri bila macet
    this.pause = 0;         // jeda antar tugas (detik)
    this.reset();
  }

  reset() {
    this.gen = null;
    this.cool = 0;
    this.errors = 0;
    this.hinted = new Set();
    this.dt = 1 / 60;
    this.allowPush = false;
  }

  toggle() {
    this.enabled = !this.enabled;
    this.reset();
    this.status = this.enabled ? 'mulai' : '';
    return this.enabled;
  }

  log(msg, type = 'info') { this.logFn(`${this.rules.tag(this.team)}${this.robot.kind} otonom: ${msg}`, type); }

  hint(key, msg) {
    if (this.hinted.has(key)) return;
    this.hinted.add(key);
    this.log(msg, 'warn');
  }

  // Robot satu tim dengan jenis tertentu ('TR' | 'BR')
  mate(kind) { return this.robots.find((r) => r.kind === kind && r.team === this.team); }

  // Dipanggil sekali per frame simulasi; mengembalikan perintah gerak (atau null bila mati)
  update(dt) {
    if (!this.enabled) return null;
    const r = this.robot;
    if (r.frozen || r.stopped || r.retryHold > 0 || this.rules.phase === 'ended') return IDLE_NP;
    // mode pertandingan: BR/TR otonom baru mulai saat buzzer (11.19)
    if (this.rules.matchMode && this.rules.phase !== 'running') return IDLE_NP;
    if (this.ai && this.rules.phase !== 'running') return IDLE_NP;
    this.dt = dt;
    if (this.cool > 0) { this.cool -= dt; return IDLE_NP; }
    if (!this.gen) this.gen = this.main();
    try {
      const out = this.gen.next();
      if (out.done) this.gen = null;
      // autopilot berhenti saat menyentuh Sky, kecuali pada jalur yang memang direncanakan untuk mendorong
      return { ...(out.value || IDLE), noPush: !this.allowPush };
    } catch (e) {
      if (!(e instanceof Abort)) console.error(e);
      this.gen = null;
      this.errors++;
      const off = this.errors >= this.maxErrors;
      this.log(`${e.message}${off ? ' — mode otonom dimatikan' : ' — mencoba lagi'}`, 'bad');
      if (off) this.giveUp();
      this.cool = 1.5;
      return IDLE_NP;
    }
  }

  // Terlalu sering gagal: bawaan = matikan mode otonom dan serahkan ke operator
  giveUp() {
    if (!this.ai) { this.enabled = false; this.status = ''; return; }
    // robot lawan: Retry seperti tim sungguhan, lalu mulai lagi
    this.rules.onRetry(this.robot);
    this.robot.retry(false);
    this.events?.emit('tl', { type: 'retry', team: this.team, robot: this.robot.kind, text: 'Retry otomatis (macet)' });
    this.log('Retry ke Start Zone', 'warn');
    this.reset();
  }

  *main() {}

  // Jalankan satu tugas dan catat durasinya ke catatan waktu
  *task(label, gen) {
    const t0 = this.rules.simT;
    let ok = false;
    try { yield* gen; ok = true; } finally {
      this.events?.emit('tl', { type: 'tugas', team: this.team, robot: this.robot.kind, text: label, dur: this.rules.simT - t0, ok });
    }
    if (this.pause) yield* this.wait(this.pause);
  }

  // ---------- langkah dasar ----------
  *wait(sec) {
    for (let t = 0; t < sec; t += this.dt) yield IDLE;
  }

  // Menuju pose (x, z, yaw). Mode mecanum: gerak ke segala arah dengan arah hadap tetap.
  // Mode track: hanya maju/mundur + putar (dipakai pada lintasan lurus).
  //   pass     titik lewat: tidak berhenti, lanjut begitu sudah dekat
  //   spin     boleh berputar sambil bergeser (hanya saat tidak membawa benda di tempat sempit)
  //   joints   { sendi: target } digerakkan sambil jalan; diselesaikan di akhir bila belum sampai
  //   slowNear mode presisi hanya pada jarak ini dari tujuan (m)
  *goto(x, z, yaw, { tol = 0.012, atol = 0.012, timeout = 25, what = 'tujuan', slow = false, pass = false, spin = false, joints = null, slowNear = 0 } = {}) {
    const r = this.robot;
    let t = 0, blockedT = 0;
    for (;;) {
      const [lx, lz] = worldToLocal(r.x, r.z, r.yaw, x, z);
      const da = yaw === undefined ? 0 : wrap(yaw - r.yaw);
      const still = Math.hypot(r.vx, r.vz) < 0.03 && Math.abs(r.w) < 0.05;
      const tank = !r.canStrafe();
      const dist = tank ? Math.abs(lz) : Math.hypot(lx, lz);
      if (pass ? dist < Math.max(tol, 0.07) && Math.abs(da) < 0.15 : dist < tol && Math.abs(da) < atol && still) break;
      t += this.dt;
      blockedT = r.blocked ? blockedT + this.dt : 0;
      if (t > timeout || blockedT > 3) throw new Abort(`terhalang menuju ${what}`);
      const turning = !(spin && !tank) && Math.abs(da) > 0.35;
      yield {
        ...IDLE,
        ...(joints ? this.jointCmd(joints) : null),
        f: turning ? 0 : clamp(lz * 4, -1, 1),
        s: turning || tank ? 0 : -clamp(lx * 4, -1, 1),
        // mode track: koreksi arah agar tetap di garis lintasan
        r: clamp((tank && Math.abs(lz) > 0.15 ? da + clamp(Math.sign(lz) * lx * 1.5, -0.25, 0.25) : da) * 3, -1, 1),
        slow: slow || dist < slowNear,
      };
    }
    if (joints && !pass) yield* this.settle(joints);
  }

  // Peta sendi robot: { properti: [perintah, gain, toleransi] } — diisi kelas turunan
  get jmap() { return {}; }

  // Perintah sendi menuju target (dipakai sambil berjalan)
  jointCmd(joints) {
    const r = this.robot, cmd = {};
    for (const [key, target] of Object.entries(joints)) {
      const [cmdKey, gain, tol] = this.jmap[key];
      if (Math.abs(target - r[key]) > tol) cmd[cmdKey] = clamp((target - r[key]) * gain, -1, 1);
    }
    return cmd;
  }

  // Selesaikan sendi yang belum sampai (berhenti di tempat)
  *settle(joints) {
    for (const [key, target] of Object.entries(joints)) {
      const [cmdKey, gain, tol] = this.jmap[key];
      yield* this.joint(key, target, cmdKey, { tol, gain });
    }
  }

  // Gerakkan satu sendi robot (properti `key`) ke target lewat perintah `cmdKey`
  *joint(key, target, cmdKey, { tol = 2, gain = 0.04, timeout = 8 } = {}) {
    const r = this.robot;
    let t = 0, last = r[key], stall = 0;
    while (Math.abs(target - r[key]) > tol) {
      yield { ...IDLE, [cmdKey]: clamp((target - r[key]) * gain, -1, 1) };
      t += this.dt;
      stall = Math.abs(r[key] - last) < 1e-4 ? stall + this.dt : 0;
      last = r[key];
      if (t > timeout || stall > 1.2) throw new Abort(`aktuator ${key} tertahan`);
    }
  }
}
