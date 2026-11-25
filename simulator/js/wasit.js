// Mode wasit (?wasit=1): satu orang bertindak sebagai wasit saat latihan — memberi pelanggaran, Forced Retry,
// atau mencatat keputusan secara manual, seperti di lomba. Keputusan masuk log dan catatan waktu (L).

const ALASAN = ['Kontak dengan robot lawan (6.5)', 'Melewati batas area (6.1)', 'Merusak lapangan / benda (6.6)', 'Operator menyentuh robot (4.6)', 'Lainnya'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Wasit {
  constructor({ rules, robots, retry }) {
    this.rules = rules;
    this.robots = robots;            // robot yang bisa dikenai keputusan (tim sendiri + lawan bila ada)
    this.retry = retry;              // (robot) => Forced Retry
    this.jumlah = 0;
    const el = document.createElement('div');
    el.id = 'wasit';
    const tim = [...new Set(robots.map((r) => r.team))];
    el.innerHTML = `<div class="ws-head"><b>Wasit</b> <span id="ws-n" class="muted">0 keputusan</span></div>
      <label class="ws-row">Alasan <select id="ws-alasan">${ALASAN.map((a) => `<option>${esc(a)}</option>`).join('')}</select></label>
      <input id="ws-catatan" maxlength="80" placeholder="catatan (opsional)">
      ${tim.map((t) => `<div class="ws-tim ${t}"><b>${t === 'red' ? 'Merah' : 'Biru'}</b>
        ${robots.filter((r) => r.team === t).map((r) => `<button type="button" data-aksi="langgar" data-r="${t}:${r.kind}">Pelanggaran ${r.kind}</button><button type="button" data-aksi="retry" data-r="${t}:${r.kind}">Retry paksa ${r.kind}</button>`).join('')}
        <button type="button" data-aksi="catat" data-r="${t}">Catat saja</button></div>`).join('')}`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.putus(b.dataset.aksi, b.dataset.r);
    });
  }

  robot(kode) {
    const [team, kind] = kode.split(':');
    return this.robots.find((r) => r.team === team && r.kind === kind);
  }

  // aksi: 'langgar' (pelanggaran + Forced Retry bila diaktifkan), 'retry' (Retry paksa saja), 'catat'
  putus(aksi, kode) {
    const R = this.rules, alasan = this.el.querySelector('#ws-alasan').value, cat = this.el.querySelector('#ws-catatan').value.trim();
    const teks = `Keputusan wasit: ${alasan}${cat ? ` — ${cat}` : ''}`;
    if (aksi === 'langgar') {
      const r = this.robot(kode);
      // kunci unik per keputusan agar jeda 4 s pelanggaran otomatis tidak menelan keputusan wasit
      R.violation(`wasit-${this.jumlah}`, teks, r);
      if (!R.forcedRetryFn && R.phase === 'running') this.retry(r);
    } else if (aksi === 'retry') {
      const r = this.robot(kode);
      R.log(`${R.tag(r.team)}${teks} — Retry paksa ${r.kind}`, 'warn');
      R.tl('wasit', r.team, `${teks} (Retry paksa ${r.kind})`, 0, r);
      this.retry(r);
    } else {
      R.log(`${R.tag(kode)}${teks}`, 'info');
      R.tl('wasit', kode, teks);
    }
    this.jumlah++;
    this.el.querySelector('#ws-n').textContent = `${this.jumlah} keputusan`;
    this.el.querySelector('#ws-catatan').value = '';
  }
}
