import { FIELD, SPOTS } from './config.js';
import { storageRect, startRects, transferRect, l1RetryRect, spotRect } from './field.js';
import { localToWorld } from './geom.js';

const $ = (id) => document.getElementById(id);
const REGION = { ground: 'Ground Area', ramp: 'Ramp', transfer: 'Transfer Area', stairs: 'Tangga', L1: 'Level 1', L2: 'Level 2' };

export class Hud {
  constructor({ team, rules, robots, objects }) {
    this.team = team;
    this.rules = rules;
    this.robots = robots;
    this.mine = robots.filter((r) => r.team === team);
    this.objects = objects;
    this.acc = 0;
    $('team').textContent = team === 'red' ? 'TIM MERAH' : 'TIM BIRU';
    $('team').className = team;
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.bg = this.drawMiniBg();
    this.flashT = null;
  }

  loading(msg, error = false) {
    const el = $('loading');
    if (!msg) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    $('loading-msg').textContent = msg;
    el.classList.toggle('error', error);
  }

  // Panel kontrol per robot (pojok kiri bawah). mode: 'kb' | 'pad'
  renderKeys(kind, mode) {
    const key = `${kind}-${mode}-${this.activeLabel}`;
    if (this.keysKey === key) return;
    this.keysKey = key;
    const k = (...x) => x.map((v) => `<kbd>${v}</kbd>`).join(' ');
    const pad = mode === 'pad';
    const common = pad
      ? [['Stik kiri', 'maju / geser'], ['Stik kanan ↔', 'putar'], ['Stik kanan ↕', 'lift naik / turun']]
      : [[k('W', 'A', 'S', 'D'), 'maju / geser'], [k('Q', 'E'), 'putar kiri / kanan'], [k('↑', '↓'), 'lift naik / turun'], [k('Shift'), 'tahan: presisi']];
    const br = pad
      ? [[k('✕'), 'vakum ON / OFF'], [k('L2', 'R2'), 'boom tarik / julur'], [k('L1', 'R1'), 'wrist roll'], [k('○'), 'track turun / naik'], [k('D↑', 'D↓'), 'flipper buka / lipat'], [k('D←', 'D→'), 'preset tinggi'], [k('R3'), 'freeze BR']]
      : [[k('Space'), 'vakum ON / OFF'], [k('←', '→'), 'boom tarik / julur'], [k('R', 'F'), 'wrist roll'], [k('T'), 'track turun / naik'], [k('G', 'B'), 'flipper buka / lipat'], [k('1') + '–' + k('6'), 'preset (2 Earth, 5 Sky, 4 tangga)'], [k('K'), 'freeze BR']];
    const tr = pad
      ? [[k('✕'), 'jepit / lepas'], [k('L2', 'R2'), 'rahang buka / tutup'], [k('D←', 'D→'), 'preset tinggi rahang']]
      : [[k('Space'), 'jepit / lepas'], [k('←', '→'), 'rahang buka / tutup'], [k('1') + '–' + k('6'), 'preset (2 Earth, 3 atas, 4 Mustika)']];
    const sys = pad
      ? [[k('Share'), 'ganti robot'], [k('△'), 'kamera'], [k('Options'), 'timer'], [k('Touchpad'), 'retry'], [k('□') + '+' + k('Options'), 'retry (stik Xbox: X + Start)']]
      : [[k('Tab'), 'ganti robot'], [k('C'), 'kamera'], [k('Enter'), 'timer'], [k('⌫'), 'retry'], [k('O', 'I'), 'BR / TR otonom ON / OFF'], [k('L'), 'catatan waktu'], [k('V'), 'tampilan sensor BR'], [k('N'), 'suara / bisu'], [k('H'), 'bantuan lengkap']];
    const rows = (list, cls = '') => list.map(([a, b]) => `<span class="k ${cls}">${a}</span><span class="${cls}">${b}</span>`).join('');
    $('keys').innerHTML = `<h4>KONTROL <b>${this.activeLabel || (kind === 'BR' ? 'BR R1' : 'TR R3')}</b> · ${pad ? '🎮 stik PS4' : '⌨ keyboard'}</h4>
      <div class="grid">${rows(kind === 'BR' ? br : tr)}<div class="sep"></div>${rows(common)}<div class="sep opt"></div>${rows(sys, 'opt')}</div>`;
  }

  setActive(r) {
    this.activeLabel = r.profil.label;
    this.renderKeys(r.kind, this.keysMode || 'kb');
    $('robot-name').textContent = `${r.profil.label} — ${r.profil.deskripsi}`;
    $('robot-name').className = r.kind;
    this.activeKind = r.kind;
  }

  setCamera(name) {
    $('cam').textContent = name;
  }

  toggleHelp() {
    $('help').classList.toggle('show');
  }

  toggleMinimap() {
    this.mini.classList.toggle('hide');
  }

  toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('show'), 1100);
  }

  flash(msg) {
    const f = $('flash');
    f.textContent = msg;
    f.classList.add('show');
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => f.classList.remove('show'), 2600);
  }

  log(msg, type, clock) {
    const li = document.createElement('li');
    li.className = type;
    li.innerHTML = `<span class="t">${clock || ''}</span>${msg}`;
    const ul = $('log');
    ul.prepend(li);
    while (ul.children.length > 60) ul.lastChild.remove();
  }

  clearLog() {
    $('log').innerHTML = '';
  }

  update(dt, { active, pads, camMode, auto, autoTR }) {
    this.keysMode = pads.length ? 'pad' : 'kb';
    this.renderKeys(active.kind, this.keysMode);
    this.acc += dt;
    this.drawMini(active);
    if (this.acc < 0.1) return;
    this.acc = 0;
    const R = this.rules;
    const setup = R.matchMode && R.phase === 'setup';
    $('timer').textContent = setup ? `0:${String(Math.ceil(R.setupLeft)).padStart(2, '0')}` : R.clock();
    $('timer').className = R.phase;
    $('phase').textContent = setup
      ? 'SETUP — Z tukar zona TR/BR · X putar robot 90° · Enter mulai'
      : { setup: 'Siap — Enter untuk mulai', running: 'Berjalan', paused: 'Dijeda', ended: 'Selesai' }[R.phase];
    const hold = active.retryHold > 0 ? ` · Retry: siap lagi ${Math.ceil(active.retryHold)} s` : '';
    if (hold) $('phase').textContent += hold;
    const my = this.team, opp = my === 'red' ? 'blue' : 'red';
    $('score-me').textContent = R.score[my];
    $('score-opp').textContent = R.score[opp];
    $('bd').textContent = `Transfer ${R.breakdown.transfer} · Menara ${R.breakdown.towers} · Mustika ${R.breakdown.mustika}`;
    const mine = R.towers.filter((t) => t.complete && t.color === my);
    $('mandate').innerHTML = R.mandate
      ? `<b class="ok">Sanctuary Mandate ✓</b>${R.mandateTime ? ` (${R.mandateTime})` : ''}`
      : `Mandate: ${mine.length}/2 menara lengkap${mine.some((t) => t.spot.shared) ? ' (shared ✓)' : ''}`;

    // telemetri robot aktif
    const rows = [
      ['Posisi', `${REGION[active.region().name]} (x ${active.x.toFixed(2)}, z ${active.z.toFixed(2)})`],
      ['Kecepatan', `${Math.hypot(active.vx, active.vz).toFixed(2)} m/s${active.blocked ? ' · <span class="bad">terhalang</span>' : ''}`],
      ...Object.entries(active.telemetry()),
    ];
    if (active.kind === 'BR' && active.frozen) rows.unshift(['STATUS', '<span class="bad">FREEZE</span>']);
    $('auto').innerHTML = (auto && auto.enabled ? `<b class="ok">BR OTONOM</b> · ${auto.status}` : 'BR manual · <kbd>O</kbd> otonom') +
      '<br>' + (autoTR && autoTR.enabled ? `<b class="ok">TR OTONOM</b> · ${autoTR.status}` : 'TR manual · <kbd>I</kbd> otonom');
    if (active.stopped) rows.unshift(['STATUS', '<span class="bad">BERHENTI (waktu habis)</span>']);
    $('telemetry').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    const other = this.mine.find((r) => r !== active);
    $('other').textContent = `${other.kind}: ${REGION[other.region().name]}${other.held.length ? ' · membawa ' + (other.held[0].kind === 'ball' ? 'Mustika' : other.carriedBlocks() + ' blok') : ''}${other.frozen ? ' · FREEZE' : ''}`;
    $('pad').textContent = pads.length ? `🎮 ${pads.length} gamepad: ${pads.map((p) => p.split('(')[0].trim().slice(0, 28)).join(' | ')}` : '⌨ Keyboard (sambungkan stik PS4 lalu tekan tombol apa saja)';
  }

  // ---------- minimap ----------
  drawMiniBg() {
    const c = document.createElement('canvas');
    c.width = c.height = 240;
    const g = c.getContext('2d');
    const S = 240 / 11.4, o = 120;
    const rect = (r, color) => { g.fillStyle = color; g.fillRect(o + r.x0 * S, o + r.z0 * S, (r.x1 - r.x0) * S, (r.z1 - r.z0) * S); };
    g.fillStyle = '#333a42'; g.fillRect(0, 0, 240, 240);
    rect({ x0: -5.5, x1: 0, z0: -5.5, z1: 5.5 }, '#e8c9c9');
    rect({ x0: 0, x1: 5.5, z0: -5.5, z1: 5.5 }, '#a9cfe2');
    rect({ x0: -3, x1: 0, z0: -3, z1: 3 }, '#ebb4a0');
    rect({ x0: 0, x1: 3, z0: -3, z1: 3 }, '#96d7dc');
    rect({ x0: -1.5, x1: 1.5, z0: -1.5, z1: 1.5 }, '#bdbdb8');
    for (const t of ['red', 'blue']) {
      const c1 = t === 'red' ? '#df2222' : '#3200ff';
      rect(storageRect(t), c1);
      for (const r of startRects(t)) rect(r, c1);
      rect(l1RetryRect(t), c1);
      rect(transferRect(t), t === 'red' ? '#f5aa3c' : '#3caaf5');
      const s = t === 'red' ? -1 : 1;
      rect({ x0: Math.min(3 * s, 4 * s), x1: Math.max(3 * s, 4 * s), z0: -2.7, z1: 0.8 }, t === 'red' ? '#c8968c' : '#82b4c8');
      rect({ x0: Math.min(3 * s, 4 * s), x1: Math.max(3 * s, 4 * s), z0: 1.8, z1: 2.7 }, t === 'red' ? '#dba48f' : '#86c5ca');
    }
    rect(FIELD.skyArea, '#f5f0c8');
    for (const s of SPOTS) rect(spotRect(s), '#286432');
    g.fillStyle = '#8a5a20';
    for (const p of [FIELD.mustikaPillar, FIELD.centralPillar]) { g.beginPath(); g.arc(o + p.x * S, o + p.z * S, p.r * S + 1, 0, 7); g.fill(); }
    return c;
  }

  drawMini(active) {
    if (this.mini.classList.contains('hide')) return;
    const g = this.mctx;
    const S = 240 / 11.4, o = 120;
    g.drawImage(this.bg, 0, 0);
    for (const ob of this.objects.list) {
      if (ob.state === 'gone') continue;
      const p = ob.worldPos();
      const s = ob.size * S;
      g.fillStyle = ob.kind === 'earth' ? (ob.team === 'red' ? '#9b2a20' : '#2b3c96') : ob.kind === 'sky' ? (ob.topColor() === 'red' ? '#ff3b30' : ob.topColor() === 'blue' ? '#3a5bff' : '#a070c0') : '#ffd400';
      if (ob.kind === 'ball') { g.beginPath(); g.arc(o + p.x * S, o + p.z * S, Math.max(2, s / 2), 0, 7); g.fill(); }
      else g.fillRect(o + p.x * S - s / 2, o + p.z * S - s / 2, s, s);
    }
    for (const r of this.robots) {
      g.strokeStyle = r === active ? '#ffffff' : r.team === 'red' ? '#b00000' : '#0000b0';
      g.lineWidth = r === active ? 2 : 1;
      g.fillStyle = r.kind === 'BR' ? 'rgba(40,200,120,0.75)' : 'rgba(255,170,30,0.75)';
      g.beginPath();
      const G = r.G;
      const pts = [[-G.hw, G.zr], [G.hw, G.zr], [G.hw, G.zf], [-G.hw, G.zf]].map(([lx, lz]) => localToWorld(r.x, r.z, r.yaw, lx, lz));
      pts.forEach(([x, z], i) => (i ? g.lineTo(o + x * S, o + z * S) : g.moveTo(o + x * S, o + z * S)));
      g.closePath(); g.fill(); g.stroke();
      const [fx, fz] = localToWorld(r.x, r.z, r.yaw, 0, 0.45);
      g.beginPath(); g.moveTo(o + r.x * S, o + r.z * S); g.lineTo(o + fx * S, o + fz * S); g.stroke();
      g.fillStyle = '#000'; g.font = 'bold 9px sans-serif'; g.fillText(r.kind, o + r.x * S - 6, o + r.z * S + 3);
    }
  }
}
