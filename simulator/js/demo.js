// Demo berpemandu (?demo=1, menu awal → Mulai cepat → Demo berpemandu): pertandingan otonom penuh
// (4 robot) untuk presentasi atau layar pameran. Kejadian penting diberi keterangan besar di layar
// beserta pasal Rulebook-nya, kamera mengikuti robot yang sedang beraksi (sesekali tampilan denah),
// dan setelah layar hasil, pertandingan diulang sendiri.

const TIM = { red: 'Merah', blue: 'Biru' };

// 'L1-M-selatan' -> 'spot L1 Merah selatan', 'L1-S-utara' -> 'spot L1 Shared utara', 'L2-BL' -> 'spot L2'
export function namaSpot(id = '') {
  const m = /^L1-([MBS])-(utara|selatan)$/.exec(id);
  if (m) return `spot L1 ${{ M: 'Merah', B: 'Biru', S: 'Shared' }[m[1]]} ${m[2]}`;
  if (/^L2-/.test(id)) return 'spot L2 (Shared)';
  return id;
}

// Teks keterangan untuk kejadian catatan waktu; null = tidak ditampilkan
function keterangan(e, n) {
  const t = TIM[e.team] || '';
  const spot = (/di (\S+)$/.exec(e.text || '') || [])[1];
  switch (e.type) {
    case 'mulai': return { teks: 'Pertandingan dimulai: 3 menit. TR mengambil Earth dari Storage, BR naik tangga ke Level 1.', pasal: '4.6' };
    case 'transfer':
      if (n.transfer[e.team] > 1 && n.transfer[e.team] % 4 !== 1) return null;
      return { teks: `TR ${t} mengantar ${/Sky/.test(e.text) ? 'Sky' : 'Earth'} ke Transfer Area: +5 per blok`, pasal: '8.1' };
    case 'earth': return { teks: `BR ${t} menaruh Earth di ${namaSpot(spot)}: +${e.pts}`, pasal: '8.2' };
    case 'sky': return { teks: `Menara lengkap di ${namaSpot(spot)}! Sky warna ${t} di puncak: +${e.pts}`, pasal: '3.5.6, 8.2' };
    case 'flip': return { teks: `Sky dibalik di ${namaSpot(spot)}: poin Sky pindah ke Tim ${t}`, pasal: '3.5.8' };
    case 'mandate': return { teks: `SANCTUARY MANDATE Tim ${t}! Dua menara lengkap, satu di Shared. Sekarang TR boleh mengambil Mustika.`, pasal: '3.6.1', besar: true };
    case 'mustika': return { teks: `Tim ${t} mengabadikan MUSTIKA di Central Pillar: +${e.pts || 250}!`, pasal: '8.5', besar: true };
    case 'pelanggaran': return { teks: `Pelanggaran Tim ${t}: ${e.text}`, pasal: 'Bagian 6', buruk: true };
    case 'failure': return { teks: `Failure Tim ${t}: ${(e.text || '').replace(/^Failure \S+: /, '')}`, pasal: '5.1.4', buruk: true };
    default: return null;
  }
}

export class Demo {
  // robots: semua robot; kamera: { fokus(robot|null), mode(nama) }; ulang(): reset lapangan
  constructor({ events, rules, robots, kamera, ulang, label }) {
    this.rules = rules;
    this.robots = robots;
    this.kamera = kamera;
    this.ulang = ulang;
    this.label = label;
    this.n = { transfer: { red: 0, blue: 0 } };
    this.fokusSejak = -1e9;
    this.kejadianTerakhir = 0;
    this.selesaiPada = null;
    this.mulaiPada = null;
    this.hitung10 = false;
    document.body.classList.add('demo');
    this.el = document.createElement('div');
    this.el.id = 'demo-cap';
    this.el.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.el);
    this.badge = document.createElement('div');
    this.badge.id = 'demo-badge';
    this.badge.innerHTML = '<b>DEMO</b> 4 robot otonom · <kbd>Y</kbd> nama area · <kbd>Esc</kbd> menu';
    document.body.appendChild(this.badge);
    events.on('tl', (e) => this.onTl(e));
  }

  // dipanggil sekali setelah model dimuat: keterangan pembuka, lalu timer berjalan
  mulai() {
    this.label?.set(true);
    this.tampil({ teks: 'Demo berpemandu: Tim Merah dan Tim Biru, masing-masing TR (pengantar) dan BR (penyusun menara), semuanya otonom.', pasal: '11.2–11.3' }, 5);
    this.mulaiPada = this.rules.simT + 4;
    this.selesaiPada = null;
    this.hitung10 = false;
    this.n.transfer = { red: 0, blue: 0 };
    this.kamera.mode('atas');
    this.fokusSejak = this.rules.simT;
  }

  onTl(e) {
    if (e.type === 'transfer' && e.team) this.n.transfer[e.team]++;
    if (e.type === 'selesai') { this.selesaiPada = this.rules.simT; return; }
    const k = keterangan(e, this.n);
    if (!k) return;
    this.tampil(k, k.besar ? 7 : 5, e.team);
    this.kejadianTerakhir = this.rules.simT;
    // kamera: kejadian penting langsung disorot; kejadian biasa hanya bila sorotan lama sudah cukup lama
    const r = e.robot && this.robots.find((x) => x.team === e.team && x.kind === e.robot);
    const penting = k.besar || k.buruk || e.type === 'flip' || e.type === 'sky';
    if (r && (penting || this.rules.simT - this.fokusSejak > 7)) this.sorot(r);
  }

  sorot(r) {
    this.kamera.fokus(r);
    this.kamera.mode('ikuti');
    this.fokusSejak = this.rules.simT;
  }

  tampil({ teks, pasal, buruk, besar }, detik, team) {
    this.el.className = `show${buruk ? ' buruk' : ''}${besar ? ' besar' : ''}${team ? ' ' + team : ''}`;
    this.el.innerHTML = `<span class="dc-teks"></span>${pasal ? `<small>Rule ${pasal}</small>` : ''}`;
    this.el.querySelector('.dc-teks').textContent = teks;
    this.hilangPada = this.rules.simT + detik;
  }

  // dipanggil tiap langkah simulasi
  update() {
    const R = this.rules, t = R.simT;
    if (this.hilangPada !== undefined && t > this.hilangPada) { this.el.classList.remove('show'); this.hilangPada = undefined; }
    if (this.mulaiPada !== null && t >= this.mulaiPada && R.phase === 'setup') {
      this.mulaiPada = null;
      R.toggleTimer();
    }
    if (R.phase === 'running' && !this.hitung10 && R.time <= 10) {
      this.hitung10 = true;
      this.tampil({ teks: '10 detik terakhir! Benda yang masih dipegang atau disentuh robot saat buzzer tidak dihitung.', pasal: '4.6.3' }, 6);
      this.kamera.fokus(null);
      this.kamera.mode('atas');
      this.fokusSejak = t;
    }
    // tanpa kejadian lama: tampilan denah sebentar, lalu ikuti robot lain secara bergiliran
    if (R.phase === 'running' && !this.hitung10 && t - this.fokusSejak > 14) {
      if (this.kamera.namaMode() === 'atas') {
        const giliran = this.robots[Math.floor(t / 14) % this.robots.length];
        this.sorot(giliran);
      } else if (t - this.kejadianTerakhir > 10) {
        this.kamera.fokus(null);
        this.kamera.mode('atas');
        this.fokusSejak = t - 8;      // denah ±6 s
      }
    }
    // setelah layar hasil: ulangi sendiri
    if (this.selesaiPada !== null && t - this.selesaiPada > 15) {
      this.selesaiPada = null;
      this.ulang();
      this.mulai();
    }
  }
}
