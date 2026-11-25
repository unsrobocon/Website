// Layar hasil akhir: muncul saat buzzer (timer 0:00). Skor kedua tim, pemenang (dengan tie-break 9.3),
// rincian poin, waktu Mandate dan Mustika, jumlah Failure / pelanggaran / Retry, dan tombol lanjut.
// Data diambil dari rules.final (dibekukan saat buzzer, 4.6.2) dan ringkasan catatan waktu.

const TIM = { red: 'Merah', blue: 'Biru' };
const fmt = (t) => (t === null || t === undefined ? '–' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);

export class HasilAkhir {
  constructor({ events, rules, timeline, team, adaLawan, aksi }) {
    this.rules = rules;
    this.timeline = timeline;
    this.team = team;
    this.adaLawan = adaLawan;
    this.aksi = aksi;          // { ulang, putar, catatan, menu }
    this.el = document.createElement('div');
    this.el.id = 'hasil';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Hasil pertandingan');
    document.body.appendChild(this.el);
    events.on('tl', (e) => { if (e.type === 'selesai') this.tampil(); });
  }

  get terbuka() { return this.el.classList.contains('show'); }

  tutup() { this.el.classList.remove('show'); }

  data() {
    const F = this.rules.final;
    if (!F) return null;
    const tim = (t) => {
      const bd = this.rules.breakdownOf(t), s = this.timeline.summary(t);
      return { skor: F.score[t], transfer: bd.transfer, menara: bd.towers, mustika: bd.mustika, mandate: s.mandate, keMustika: s.mustika, failure: s.failure, pelanggaran: s.pelanggaran, retry: s.retry };
    };
    return { red: tim('red'), blue: tim('blue'), winner: F.winner, tiebreak: F.tiebreak, seriSkor: F.score.red === F.score.blue };
  }

  tampil() {
    const d = this.data();
    if (!d) return;
    const me = this.team, opp = me === 'red' ? 'blue' : 'red';
    let judul, kelas;
    if (!this.adaLawan) { judul = `Skor akhir Tim ${TIM[me]}: ${d[me].skor}`; kelas = 'netral'; }
    else if (!d.winner) { judul = 'SERI'; kelas = 'netral'; }
    else if (d.winner === me) { judul = `MENANG — Tim ${TIM[me]}`; kelas = 'menang'; }
    else { judul = `KALAH — Tim ${TIM[opp]} unggul`; kelas = 'kalah'; }
    const tb = d.tiebreak;
    const catatanSeri = this.adaLawan && d.seriSkor
      ? `<p class="hs-tb">Skor sama, jadi dipakai urutan tie-break 9.3: Mustika (${tb.mustika ? TIM[tb.mustika] : 'tidak ada'}) → Sky warna tim (M ${tb.sky.red} : B ${tb.sky.blue}) → blok di L2 (M ${tb.L2.red} : B ${tb.L2.blue}) → blok di L1 (M ${tb.L1.red} : B ${tb.L1.blue})${d.winner ? '' : '. Masih sama: keputusan juri (9.3.5)'}.</p>` : '';
    const kolom = this.adaLawan ? [me, opp] : [me];
    const baris = [
      ['Transfer (+5/blok)', (t) => d[t].transfer],
      ['Menara (Earth + Sky)', (t) => d[t].menara],
      ['Mustika', (t) => d[t].mustika],
      ['<b>Total</b>', (t) => `<b>${d[t].skor}</b>`],
      ['Mandate (menit ke-)', (t) => fmt(d[t].mandate)],
      ['Mustika (menit ke-)', (t) => fmt(d[t].keMustika)],
      ['Failure', (t) => d[t].failure],
      ['Pelanggaran', (t) => d[t].pelanggaran],
      ['Retry', (t) => d[t].retry],
    ];
    const saran = this.saran(d[me]);
    this.el.innerHTML = `<div class="hs-box ${kelas}">
      <h2>${judul}</h2>
      ${this.adaLawan ? `<div class="hs-skor"><span class="red">${d.red.skor}</span><small>Merah : Biru</small><span class="blue">${d.blue.skor}</span></div>` : ''}
      ${catatanSeri}
      <table><thead><tr><th></th>${kolom.map((t) => `<th class="${t}">${TIM[t]}${t === me ? ' (kita)' : ''}</th>`).join('')}</tr></thead>
      <tbody>${baris.map(([k, f]) => `<tr><td>${k}</td>${kolom.map((t) => `<td>${f(t)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      ${saran ? `<p class="hs-saran"><b>Saran:</b> ${saran}</p>` : ''}
      <div class="hs-btn">
        <button type="button" data-a="ulang">Main lagi</button>
        <button type="button" data-a="putar">Putar ulang</button>
        <button type="button" data-a="catatan">Catatan waktu</button>
        <button type="button" data-a="menu">Menu</button>
        <button type="button" data-a="tutup">Tutup</button>
      </div></div>`;
    for (const b of this.el.querySelectorAll('button')) {
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        this.tutup();
        if (a !== 'tutup') this.aksi[a]?.();
      });
    }
    this.el.classList.add('show');
  }

  // Satu saran singkat dari hasil tim sendiri, untuk bahan diskusi setelah pertandingan
  saran(t) {
    if (t.skor === 0) return 'Belum ada poin. Mulai dari mengantar Earth ke Transfer Area (+5 per blok) dan nyalakan BR otonom (O).';
    if (t.pelanggaran >= 3) return `Ada ${t.pelanggaran} pelanggaran. Tiap Forced Retry membuang waktu; lihat Catatan waktu untuk mencari penyebabnya.`;
    if (t.mandate === null) return 'Sanctuary Mandate belum tercapai: butuh 2 menara lengkap warna tim, salah satunya di area Shared (3.6.1).';
    if (!t.mustika) return 'Mandate tercapai tetapi Mustika (+250) belum diabadikan. Antar Mustika lebih awal agar BR sempat naik ke L2.';
    return 'Mandate dan Mustika tercapai. Coba percepat: buka Putar ulang dan cari waktu robot diam.';
  }
}
