// Mode latihan operator: tantangan berwaktu dengan papan skor per operator (disimpan di browser).
// Latihan TR: saat lomba operator TR adalah satu-satunya orang yang mengemudikan robot (BR wajib
// otomatis, 11.3), jadi latihan ini mengukur kecepatan dan kerapian operator TR. BR otonom ikut bekerja
// seperti di pertandingan (mengosongkan Transfer Area).
// Latihan BR (manual): untuk mengenal mekanisme BR (lift, boom, wrist, vakum, track, flipper) sebelum
// menulis program otonomnya. Lapangan disiapkan sesuai tantangan (siapkanLatihanBR di bawah).
// Waktu mulai saat robot latihan pertama kali bergerak dan berhenti saat target tercapai; tiap
// pelanggaran atau Failure menambah 5 detik.

import { FIELD } from './config.js';
import { transferRect, regionAt, sideSign } from './field.js';

const KEY = 'simabu.latihan', KEY_NAMA = 'simabu.operator', PENALTI = 5;

export const TANTANGAN = {
  earth: { nama: 'Antar 2 tumpukan Earth', target: 4, satuan: 'Earth diantar' },
  sky: { nama: 'Antar 2 Sky', target: 2, satuan: 'Sky diantar' },
  mustika: { nama: 'Mustika ke BR', target: 1, satuan: 'Mustika diserahkan' },
  brmenara: { nama: 'BR: susun 1 menara lengkap', target: 1, satuan: 'menara warna tim', robot: 'BR',
    tip: 'Turunkan track (T) agar rangka boleh di atas barrier. Earth: preset 2, julurkan boom (→), vakum (Space), taruh di spot pojok. Sky: ambil dengan preset 5, putar wrist (R/F) sampai warna tim di atas, taruh dengan preset 6.' },
  brnaik: { nama: 'BR: naik dari Start Zone ke L2', target: 1, satuan: 'sampai di L2', robot: 'BR',
    tip: 'Tangga L1: preset 4 (mode tangga, track turun). Undakan L2 300 mm: track turun + flipper dibuka ≥140° (G).' },
};

// Siapkan lapangan untuk latihan BR. brmenara: BR sudah di L1 menghadap Transfer Area, satu kolom
// 2 Earth dan satu Sky (belahan warna menyamping, jadi bisa diputar wrist) menunggu di Transfer Area.
export function siapkanLatihanBR(jenis, { br, objects }) {
  if (jenis !== 'brmenara') return;
  const s = sideSign(br.team), tr = transferRect(br.team);
  const cx = (tr.x0 + tr.x1) / 2, h = FIELD.L1.h;
  // satu kolom Earth dari Storage tim (bawah + penumpangnya)
  const bawah = objects.list.find((o) => o.kind === 'earth' && o.team === br.team && o.restingOn === 'terrain' && objects.list.some((r) => r.restingOn === o));
  const atas = bawah && objects.list.find((r) => r.restingOn === bawah);
  // Sky yang belahan warnanya menghadap ±z (menyamping dari arah datang BR, yang menghadap ±x)
  const sky = objects.list.find((o) => o.kind === 'sky' && Math.abs(o.mesh.rotation.x) > 1);
  const taruh = (o, y, z, on) => {
    if (!o) return;
    objects.scene.attach(o.mesh);
    o.mesh.position.set(cx, y, z);
    o.state = 'rest'; o.restingOn = on; o.holders = []; o.carrier = null;
  };
  taruh(bawah, h + 0.175, tr.z0 + 0.25, 'terrain');
  taruh(atas, h + 0.525, tr.z0 + 0.25, bawah);
  taruh(sky, h + 0.1, tr.z1 - 0.25, 'terrain');
  br.enteredL1 = true;
  br.placeAt(s * 2.45, (tr.z0 + tr.z1) / 2, s * Math.PI / 2);   // menghadap Transfer Area (luar L1)
}

const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function baca() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export class Latihan {
  constructor(jenis, { rules, events, tr, br, onUlang }) {
    this.jenis = jenis;
    this.def = TANTANGAN[jenis];
    this.rules = rules;
    this.tr = tr;
    this.br = br;
    this.robot = this.def.robot === 'BR' ? br : tr;   // robot yang dikemudikan operator
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
    if ((e.type === 'pelanggaran' || (this.def.robot === 'BR' && e.type === 'failure')) && this.t0 !== null) { this.langgar++; this.render(); }
    if (this.jenis === 'brmenara' && e.type === 'sky') this.tambah();
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
    const r = this.robot;
    if (this.t0 === null && !this.hasil && (Math.hypot(r.vx, r.vz) > 0.05 || Math.abs(r.w) > 0.05)) this.t0 = this.rules.simT;
    // brnaik: seluruh robot di permukaan L2
    if (this.jenis === 'brnaik' && this.n === 0 && regionAt(r.x, r.z).name === 'L2' && Math.abs(r.y - FIELD.L2.h) < 0.03) this.tambah();
    const now = performance.now();
    if (!this.lastRender || now - this.lastRender > 200) this.render();
  }

  buatPanel() {
    const el = document.createElement('div');
    el.id = 'drill';
    el.innerHTML = `<div class="dr-head"><b>Latihan ${this.def.robot === 'BR' ? 'BR' : 'TR'}</b> <span id="dr-nama"></span></div>
      <div id="dr-stat"></div>${this.def.tip ? `<div class="dr-tip">${this.def.tip}</div>` : ''}
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
      : this.t0 === null ? `Waktu mulai saat ${this.robot.kind} bergerak` : `${fmt(this.waktu())}`;
    el.querySelector('#dr-stat').innerHTML = `${d.satuan}: <b>${this.n}/${d.target}</b> · ${st}${this.langgar ? ` · pelanggaran ${this.langgar} (+${this.langgar * PENALTI} s)` : ''}`;
    const list = baca()[this.jenis] || [];
    el.querySelector('#dr-papan').innerHTML = list.length
      ? list.slice(0, 5).map((e) => `<li>${esc(e.nama)} — ${fmt(e.waktu)}${e.langgar ? ` (${e.langgar} plg)` : ''} <small>${esc(e.tanggal)}</small></li>`).join('')
      : '<li class="muted">Belum ada catatan</li>';
  }
}
