// Catatan waktu: kejadian berpoin, pelanggaran, dan durasi tiap tugas otonom.
// Sumbernya bus `events` (kejadian 'tl' dari rules.js, autopilot.js dan main.js).

import { MATCH_SECONDS } from './config.js';

const KEY = 'simabu.riwayat';
const TEAM = { red: 'Merah', blue: 'Biru' };
const JENIS = {
  mulai: 'Mulai', transfer: 'Transfer', earth: 'Earth', sky: 'Sky', flip: 'Flip Sky', mandate: 'Mandate', mustika: 'Mustika',
  failure: 'Failure', pelanggaran: 'Pelanggaran', retry: 'Retry', freeze: 'Freeze', tugas: 'Tugas otonom', selesai: 'Selesai',
};
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export class Timeline {
  constructor(events, rules, info = {}) {
    this.rules = rules;
    this.info = info;                // { team, pengaturan } untuk riwayat
    this.el = document.getElementById('tl');
    this.reset();
    events.on('tl', (e) => this.add(e));
    if (this.el) {
      this.el.querySelector('#tl-csv').addEventListener('click', () => this.download());
      this.el.querySelector('#tl-close').addEventListener('click', () => this.toggle(false));
      this.el.querySelector('#tl-clear').addEventListener('click', () => { localStorage.removeItem(KEY); this.render(); });
    }
  }

  reset() {
    this.rows = [];
    this.sum = { red: 0, blue: 0 };
    this.t0 = this.rules.simT;
    this.started = false;
    this.dirty = true;
  }

  // Detik sejak pertandingan dimulai (jam pertandingan), atau sejak reset bila timer belum jalan
  now() {
    return this.started ? MATCH_SECONDS - this.rules.time : this.rules.simT - this.t0;
  }

  add(e) {
    if (e.type === 'mulai') { this.reset(); this.started = true; }
    if (e.pts && e.team) {
      this.sum[e.team] += e.pts;
      if (e.type === 'flip') this.sum[e.team === 'red' ? 'blue' : 'red'] -= e.pts;   // poin Sky pindah tim
    }
    const t = e.type === 'tugas' ? this.now() - e.dur : this.now();
    this.rows.push({ t: Math.max(0, t), type: e.type, team: e.team || null, robot: e.robot || '', text: e.text || '', pts: e.pts || 0, dur: e.dur ?? null, ok: e.ok ?? null, red: this.sum.red, blue: this.sum.blue });
    this.dirty = true;
    if (e.type === 'selesai') this.saveRun();
  }

  // Ringkasan untuk satu tim
  summary(team = this.info.team || 'red') {
    const mine = this.rows.filter((r) => r.team === team);
    const first = (type) => mine.find((r) => r.type === type)?.t ?? null;
    const count = (type) => mine.filter((r) => r.type === type).length;
    const elapsed = Math.max(this.now(), 1e-6);
    const tasks = mine.filter((r) => r.type === 'tugas');
    const busy = (kind) => tasks.filter((r) => r.robot === kind).reduce((a, r) => a + r.dur, 0);
    const score = this.rules.score[team];
    return {
      team, skor: score, waktu: elapsed, mandate: first('mandate'), mustika: first('mustika'),
      poinPerMenit: score / (elapsed / 60),
      failure: count('failure'), pelanggaran: count('pelanggaran'), retry: count('retry'),
      sibukBR: busy('BR'), sibukTR: busy('TR'), tugas: tasks.length, tugasGagal: tasks.filter((r) => !r.ok).length,
    };
  }

  csv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['waktu_s', 'waktu', 'jenis', 'tim', 'robot', 'keterangan', 'poin', 'durasi_s', 'berhasil', 'skor_merah', 'skor_biru'];
    const lines = [...this.rows].sort((a, b) => a.t - b.t).map((r) => [r.t.toFixed(2), fmt(r.t), JENIS[r.type] || r.type, r.team ? TEAM[r.team] : '', r.robot, r.text, r.pts, r.dur === null ? '' : r.dur.toFixed(2), r.ok === null ? '' : r.ok ? 'ya' : 'tidak', r.red, r.blue].map(esc).join(','));
    const out = [head.join(','), ...lines];
    if (this.analisisFn) {
      for (const [kind, x] of Object.entries(this.analisisFn())) for (const v of x.selang) {
        out.push([v.t0.toFixed(2), fmt(v.t0), 'Diam', TEAM[this.info.team] || '', kind, `diam di ${v.wilayah}`, 0, v.dur.toFixed(2), '', '', ''].map(esc).join(','));
      }
    }
    return out.join('\n');
  }

  download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([this.csv()], { type: 'text/csv' }));
    a.download = `catatan-waktu-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  history() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  }

  // Simpan ringkasan pertandingan yang baru selesai (10 terakhir) untuk membandingkan strategi
  saveRun() {
    const s = this.summary();
    const run = { kapan: new Date().toISOString().slice(0, 16).replace('T', ' '), pengaturan: this.info.pengaturan || '', ...s, lawan: this.rules.score[s.team === 'red' ? 'blue' : 'red'] };
    try { localStorage.setItem(KEY, JSON.stringify([run, ...this.history()].slice(0, 10))); } catch { /* penyimpanan penuh / diblokir */ }
  }

  toggle(show = !this.el.classList.contains('show')) {
    this.el.classList.toggle('show', show);
    if (show) { this.dirty = true; this.render(); }
  }

  // Dipanggil dari loop; menggambar ulang hanya bila panel terbuka dan ada perubahan
  update() {
    if (this.el && this.el.classList.contains('show') && this.dirty) this.render();
  }

  render() {
    this.dirty = false;
    const s = this.summary();
    const t = (v) => (v === null ? '–' : fmt(v));
    this.el.querySelector('#tl-sum').innerHTML = [
      ['Skor', s.skor], ['Waktu', fmt(s.waktu)], ['ke Mandate', t(s.mandate)], ['ke Mustika', t(s.mustika)],
      ['Poin / menit', s.poinPerMenit.toFixed(0)], ['Failure', s.failure], ['Pelanggaran', s.pelanggaran], ['Retry', s.retry],
      ['BR bekerja', `${s.sibukBR.toFixed(0)} s`], ['TR bekerja', `${s.sibukTR.toFixed(0)} s`],
    ].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
    const rows = [...this.rows].sort((a, b) => b.t - a.t).slice(0, 250);
    this.el.querySelector('#tl-rows').innerHTML = rows.map((r) => `<tr class="${r.type}${r.ok === false ? ' gagal' : ''}"><td>${fmt(r.t)}</td><td>${r.team ? TEAM[r.team][0] : ''} ${r.robot}</td><td>${JENIS[r.type] || r.type}</td><td>${r.text}${r.dur !== null ? ` <i>${r.dur.toFixed(1)} s${r.ok ? '' : ' · gagal'}</i>` : ''}</td><td>${r.pts ? '+' + r.pts : ''}</td><td>${r.red} : ${r.blue}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada kejadian.</td></tr>';
    // waktu terbuang (js/analisis.js) bila sumber rekaman dipasang (main.js: timeline.analisisFn)
    const idle = this.el.querySelector('#tl-idle');
    if (idle && this.analisisFn) {
      const a = this.analisisFn(), el = Math.max(1, s.waktu);
      idle.innerHTML = Object.entries(a).map(([kind, x]) => `<p><b>${kind}</b> diam ${x.total.toFixed(0)} s (${Math.round((x.total / el) * 100)} %)${Object.entries(x.perWilayah).sort((p, q) => q[1] - p[1]).map(([w, d]) => ` · ${w} ${d.toFixed(0)} s`).join('')}</p>`
        + (x.selang.length ? `<table><tbody>${[...x.selang].sort((p, q) => q.dur - p.dur).slice(0, 5).map((v) => `<tr><td>${fmt(v.t0)}</td><td>${v.dur.toFixed(1)} s</td><td>${v.wilayah}</td></tr>`).join('')}</tbody></table>` : '')).join('') || '<p class="muted">Belum ada rekaman pertandingan.</p>';
    }
    const h = this.history();
    this.el.querySelector('#tl-hist').innerHTML = h.length
      ? h.map((r) => `<tr><td>${r.kapan}</td><td>${r.pengaturan}</td><td>${r.skor} : ${r.lawan}</td><td>${t(r.mandate)}</td><td>${t(r.mustika)}</td><td>${r.failure}/${r.pelanggaran}/${r.retry}</td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">Belum ada pertandingan yang selesai (timer sampai 0:00).</td></tr>';
  }
}
