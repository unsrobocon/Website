// Mode latihan operator TR: tantangan berwaktu dengan papan skor per operator (disimpan di browser).
// Saat lomba, operator TR adalah satu-satunya orang yang mengemudikan robot (BR wajib otomatis, 11.3),
// jadi latihan ini mengukur kecepatan dan kerapian operator TR. BR otonom ikut bekerja seperti di
// pertandingan (mengosongkan Transfer Area). Waktu mulai saat TR pertama kali bergerak dan berhenti saat
// target tercapai; tiap pelanggaran menambah 5 detik.

const KEY = 'simabu.latihan', KEY_NAMA = 'simabu.operator', PENALTI = 5;

export const TANTANGAN = {
  earth: { nama: 'Antar 2 tumpukan Earth', target: 4, satuan: 'Earth diantar' },
  sky: { nama: 'Antar 2 Sky', target: 2, satuan: 'Sky diantar' },
  mustika: { nama: 'Mustika ke BR', target: 1, satuan: 'Mustika diserahkan' },
};

const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function baca() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export class Latihan {
  constructor(jenis, { rules, events, tr, onUlang }) {
    this.jenis = jenis;
    this.def = TANTANGAN[jenis];
    this.rules = rules;
    this.tr = tr;
    this.onUlang = onUlang;
    events.on('tl', (e) => this.onTl(e));
    events.on('handover', (e) => { if (this.jenis === 'mustika' && e.obj.kind === 'ball' && e.from === this.tr && e.to.kind === 'BR') this.tambah(); });
    this.buatPanel();
    this.reset();
  }

  reset() {
    this.n = 0;
    this.langgar = 0;
    this.t0 = null;        // jam simulasi saat TR mulai bergerak
    this.hasil = null;
    this.render();
  }

  onTl(e) {
    if (e.team !== this.tr.team || this.hasil) return;
    if (e.type === 'pelanggaran' && this.t0 !== null) { this.langgar++; this.render(); }
    if (e.type === 'transfer') {
      if ((this.jenis === 'earth' && /Earth/.test(e.text)) || (this.jenis === 'sky' && /Sky/.test(e.text))) this.tambah();
    }
  }

  tambah() {
    if (this.hasil || this.t0 === null) return;
    this.n++;
    if (this.n >= this.def.target) this.selesai();
    this.render();
  }

  waktu() {
    if (this.hasil) return this.hasil.waktu;
    return this.t0 === null ? 0 : this.rules.simT - this.t0 + this.langgar * PENALTI;
  }

  selesai() {
    const nama = (this.namaEl.value || 'Operator').trim().slice(0, 24);
    const waktu = +this.waktu().toFixed(1);
    const all = baca(), list = all[this.jenis] || [];
    const entri = { nama, waktu, langgar: this.langgar, tanggal: new Date().toISOString().slice(0, 10) };
    list.push(entri);
    list.sort((a, b) => a.waktu - b.waktu);
    all[this.jenis] = list.slice(0, 10);
    try { localStorage.setItem(KEY, JSON.stringify(all)); localStorage.setItem(KEY_NAMA, nama); } catch { /* diblokir */ }
    this.hasil = { waktu, peringkat: all[this.jenis].indexOf(entri) + 1 };
    this.kirimPapan(entri);
    this.rules.log(`Latihan selesai: ${this.def.nama} dalam ${fmt(waktu)}${this.langgar ? ` (termasuk ${this.langgar} × ${PENALTI} s pelanggaran)` : ''}`, 'ok');
  }

  // Papan skor tim (tools/arena.py): bila simulator dibuka lewat server tim, hasil juga dikirim ke sana.
  // Dengan server statis biasa (jalankan.bat) permintaan ini gagal diam-diam dan papan lokal tetap dipakai.
  kirimPapan(entri) {
    if (typeof fetch !== 'function') return;
    fetch('/api/papan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jenis: this.jenis, ...entri }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        this.papanTim = d.peringkat;
        this.rules.log(`Papan skor tim: peringkat ${d.peringkat ?? '–'} untuk ${this.def.nama} (lihat papan.html)`, 'ok');
        this.render();
      })
      .catch(() => {});
  }

  // dipanggil tiap frame
  update() {
    if (this.t0 === null && !this.hasil && (Math.hypot(this.tr.vx, this.tr.vz) > 0.05 || Math.abs(this.tr.w) > 0.05)) this.t0 = this.rules.simT;
    const now = performance.now();
    if (!this.lastRender || now - this.lastRender > 200) this.render();
  }

  buatPanel() {
    const el = document.createElement('div');
    el.id = 'drill';
    el.innerHTML = `<div class="dr-head"><b>Latihan TR</b> <span id="dr-nama"></span></div>
      <div id="dr-stat"></div>
      <label class="dr-op">Operator <input id="dr-op" maxlength="24" placeholder="nama"></label>
      <ol id="dr-papan"></ol>
      <button type="button" id="dr-ulang">Ulangi (lapangan direset)</button>`;
    document.body.appendChild(el);
    this.el = el;
    this.namaEl = el.querySelector('#dr-op');
    try { this.namaEl.value = localStorage.getItem(KEY_NAMA) || ''; } catch { /* diblokir */ }
    el.querySelector('#dr-ulang').addEventListener('click', () => this.onUlang());
  }

  render() {
    this.lastRender = performance.now();
    const d = this.def, el = this.el;
    el.querySelector('#dr-nama').textContent = d.nama;
    const st = this.hasil
      ? `<span class="ok">Selesai: ${fmt(this.hasil.waktu)} — peringkat ${this.hasil.peringkat}${this.papanTim ? ` · tim #${this.papanTim} (<a href="papan.html" target="_blank">papan</a>)` : ''}</span>`
      : this.t0 === null ? 'Waktu mulai saat TR bergerak' : `${fmt(this.waktu())}`;
    el.querySelector('#dr-stat').innerHTML = `${d.satuan}: <b>${this.n}/${d.target}</b> · ${st}${this.langgar ? ` · pelanggaran ${this.langgar} (+${this.langgar * PENALTI} s)` : ''}`;
    const list = baca()[this.jenis] || [];
    el.querySelector('#dr-papan').innerHTML = list.length
      ? list.slice(0, 5).map((e) => `<li>${esc(e.nama)} — ${fmt(e.waktu)}${e.langgar ? ` (${e.langgar} plg)` : ''} <small>${esc(e.tanggal)}</small></li>`).join('')
      : '<li class="muted">Belum ada catatan</li>';
  }
}
