// Tutorial interaktif untuk anggota baru (?tutorial=1, atau menu awal → Mulai cepat → Tutorial).
// Langkah demi langkah: tiap langkah punya tujuan yang dicek otomatis dari keadaan simulator, penanda
// kuning di lapangan untuk tujuan tempat, dan penjelasan singkat pasal Rulebook yang terkait.
// Bisa dilewati (Lewati) atau diulang dari awal (Ulangi: lapangan direset).

import * as THREE from 'three';
import { FIELD } from './config.js';
import { regionAt, transferRect, storageRect, sideSign } from './field.js';

const KEY = 'simabu.tutorial';

// Daftar langkah. cek(k) dipanggil tiap frame dengan konteks k; benar = langkah selesai.
// tempat(k) -> [x, y, z] penanda di lapangan (opsional).
function langkah(team) {
  const s = sideSign(team);
  const tr = transferRect(team), st = storageRect(team);
  const tengahTransfer = [(tr.x0 + tr.x1) / 2, FIELD.L1.h, (tr.z0 + tr.z1) / 2];
  const depanStorage = [(st.x0 + st.x1) / 2, 0, st.z1 + 0.55];
  return [
    {
      judul: 'Selamat datang di Werkudara!',
      teks: `Ini lapangan ABU Robocon 2027 <i>The Pursuit of Mustika Nusantara</i>. Tim kita <b>${team === 'red' ? 'Merah (kiri)' : 'Biru (kanan)'}</b> punya dua robot:
        <b>TR</b> (Transporter, dikemudikan operator) yang mengantar blok, dan <b>BR</b> (Builder, wajib otonom) yang menyusun menara.
        Tutorial ini mengajak Anda mengantar blok pertama sampai BR menyusunnya.`,
      kenapa: 'Rule 11.2–11.3: TR boleh manual, BR harus otomatis penuh. Lama pertandingan 3 menit (4.6).',
      manual: 'Mulai',
    },
    {
      judul: 'Atur kamera',
      teks: 'Tekan <kbd>C</kbd> untuk berganti mode kamera (ikuti robot, denah atas, bebas, kamera robot). Seret mouse untuk memutar, roda mouse untuk zoom.',
      kenapa: 'Mode <b>Atas (denah)</b> paling mudah untuk melihat posisi robot di lapangan.',
      cek: (k) => k.aksi.has('camera'),
    },
    {
      judul: 'Pilih robot TR',
      teks: 'Tekan <kbd>Tab</kbd> sampai panel kiri menulis <b>TR</b>. Tab berpindah antara TR dan BR.',
      kenapa: 'Saat lomba operator hanya mengemudikan TR; BR berjalan sendiri.',
      cek: (k) => k.active.kind === 'TR',
    },
    {
      judul: 'Kemudikan TR ke Storage',
      teks: 'Pakai <kbd>W</kbd><kbd>S</kbd> maju/mundur, <kbd>A</kbd><kbd>D</kbd> geser (roda mecanum), <kbd>Q</kbd><kbd>E</kbd> putar. Tahan <kbd>Shift</kbd> untuk pelan. Bawa TR ke <b>penanda kuning</b> di depan Storage (tumpukan Earth).',
      kenapa: 'Storage berisi 20 Earth Block milik tim (4.1.3). Hanya TR yang boleh mengambil dari sana.',
      tempat: () => depanStorage,
      cek: (k) => Math.hypot(k.tr.x - depanStorage[0], k.tr.z - depanStorage[2]) < 0.7,
    },
    {
      judul: 'Jepit satu kolom Earth',
      teks: 'Hadapkan rahang TR (kantong U) ke satu kolom Earth, maju pelan sampai Earth masuk kantong, lalu tekan <kbd>Space</kbd>. Rahang menutup dan memusatkan Earth sendiri. Tekan <kbd>2</kbd> dulu agar rahang di tinggi Earth bawah.',
      kenapa: 'TR boleh membawa paling banyak 3 blok sekaligus (6.4). Satu kolom = 2 Earth.',
      cek: (k) => k.tr.held.some((o) => o.kind === 'earth'),
    },
    {
      judul: 'Antar ke Transfer Area',
      teks: 'Bawa Earth naik <b>ramp</b> ke <b>Transfer Area</b> (kotak oranye di ujung atas ramp, penanda kuning). Taruh di tengah lalu tekan <kbd>Space</kbd> untuk melepas. Tiap blok yang ditaruh di sana +5 poin.',
      kenapa: 'Transfer +5 sekali per blok (8.1). TR tidak boleh masih menyentuh Ground Area saat menaruh (3.4.5), dan TR tidak boleh masuk Level 1.',
      tempat: () => tengahTransfer,
      cek: (k) => k.n.transfer >= 1,
    },
    {
      judul: 'Mundurkan TR',
      teks: 'Mundur (<kbd>S</kbd>) turun ramp sampai TR keluar dari Transfer Area, kira-kira satu meter.',
      kenapa: 'BR tidak mengambil blok yang masih diapit lengan TR. Memberi ruang = BR lebih cepat bekerja.',
      cek: (k) => regionAt(k.tr.x, k.tr.z).name !== 'transfer' && Math.hypot(k.tr.x - tengahTransfer[0], k.tr.z - tengahTransfer[2]) > 0.85,
    },
    {
      judul: 'Nyalakan BR otonom',
      teks: 'Tekan <kbd>O</kbd>. BR akan naik tangga ke Level 1 sendiri, mengambil Earth dari Transfer Area dengan vakum, lalu menaruhnya di Building Spot.',
      kenapa: 'Rule 11.3: BR wajib otomatis penuh. Simulator ini juga dipakai untuk menguji program BR.',
      cek: (k) => k.auto.enabled,
    },
    {
      judul: 'Tonton BR menyusun Earth',
      teks: 'Tunggu sampai BR menaruh Earth di Building Spot (log hijau di kanan). Sambil menunggu, Anda bisa kembali ke Storage dan mengambil kolom Earth berikutnya.',
      kenapa: 'Menara: Earth bawah, Earth tengah, Sky di atas. Di L1 bernilai 10 / 20 / 40, di L2 dua kali lipat (8.2–8.4).',
      cek: (k) => k.n.earth >= 1,
    },
    {
      judul: 'Antar satu Sky Block',
      teks: 'Sky Block ada di grid tengah lapangan dekat Start Zone (Ground Shared Area). Tekan <kbd>6</kbd> (tinggi rahang Sky), jepit satu Sky di sisi tim kita, lalu antar ke Transfer Area seperti Earth tadi.',
      kenapa: 'Sky menjadi puncak menara; warna yang menghadap ke atas menentukan pemilik poin. BR memutar wrist agar warna tim di atas (3.5.6).',
      tempat: () => [s * 0.3, 0, 4.25],
      cek: (k) => k.n.transferSky >= 1,
    },
    {
      judul: 'Selesai — langkah berikutnya',
      teks: `Bagus! Yang belum dicoba:
        <ul><li><b>Sanctuary Mandate</b>: dua menara lengkap warna tim, salah satunya di area Shared. Setelah itu TR boleh mengambil <b>Mustika</b> dan BR menaruhnya di Central Pillar (+250).</li>
        <li><kbd>Enter</kbd> menjalankan timer 3:00, <kbd>Backspace</kbd> Retry, <kbd>L</kbd> catatan waktu dan putar ulang, <kbd>H</kbd> semua tombol.</li>
        <li>Menu awal: <b>Latihan TR</b> / <b>Latihan BR</b> untuk mengukur waktu, <b>Pertandingan</b> melawan robot komputer, dan <a href="kuis.html" target="_blank">Kuis aturan</a>.</li></ul>`,
      kenapa: 'Mustika hanya sah bila diambil setelah Mandate (3.6.7), dan hanya Mustika pertama yang dihitung (3.6.8).',
      manual: 'Selesai',
    },
  ];
}

export class Tutorial {
  constructor({ team, events, scene, get, onUlang }) {
    this.team = team;
    this.get = get;              // () => { active, tr, br, auto }
    this.onUlang = onUlang;
    this.steps = langkah(team);
    this.marker = this.buatPenanda(scene);
    events.on('aksi', (a) => this.aksi.add(a));
    events.on('tl', (e) => {
      if (e.team !== team) return;
      if (e.type === 'transfer') { this.n.transfer++; if (/Sky/.test(e.text)) this.n.transferSky++; }
      if (e.type === 'earth') this.n.earth++;
    });
    this.buatPanel();
    this.reset();
  }

  reset() {
    this.i = 0;
    this.aksi = new Set();
    this.n = { transfer: 0, transferSky: 0, earth: 0 };
    this.selesai = false;
    this.render();
  }

  buatPenanda(scene) {
    const g = new THREE.Group();
    const cincin = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.9, depthTest: false }));
    cincin.rotation.x = Math.PI / 2;
    cincin.renderOrder = 20;
    const panah = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 16), new THREE.MeshBasicMaterial({ color: 0xffd400, depthTest: false }));
    panah.rotation.x = Math.PI;
    panah.position.y = 0.9;
    panah.renderOrder = 20;
    g.add(cincin, panah);
    g.visible = false;
    g.name = 'penanda-tutorial';
    scene.add(g);
    this.panah = panah;
    return g;
  }

  buatPanel() {
    const el = document.createElement('div');
    el.id = 'tutor';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Tutorial');
    el.innerHTML = `<div class="tu-head"><b>Tutorial</b> <span id="tu-no"></span><button type="button" id="tu-kecil" title="Perkecil / perbesar">–</button></div>
      <div class="tu-body"><h3 id="tu-judul"></h3><div id="tu-teks"></div><p class="tu-why" id="tu-why"></p>
      <div class="tu-btn"><button type="button" id="tu-lanjut"></button><button type="button" id="tu-lewati">Lewati</button><button type="button" id="tu-ulang">Ulangi dari awal</button></div></div>`;
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('#tu-lanjut').addEventListener('click', () => this.maju());
    el.querySelector('#tu-lewati').addEventListener('click', () => this.maju());
    el.querySelector('#tu-ulang').addEventListener('click', () => { this.onUlang(); this.reset(); });
    el.querySelector('#tu-kecil').addEventListener('click', () => el.classList.toggle('kecil'));
  }

  maju() {
    if (this.i < this.steps.length - 1) { this.i++; this.aksi.clear(); }
    else { this.selesai = true; try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* diblokir */ } }
    this.render();
  }

  // dipanggil tiap frame
  update(t = performance.now() / 1000) {
    const st = this.steps[this.i];
    const k = { ...this.get(), aksi: this.aksi, n: this.n };
    if (!this.selesai && st.cek && st.cek(k)) { this.maju(); return; }
    const p = !this.selesai && st.tempat ? st.tempat(k) : null;
    this.marker.visible = !!p;
    if (p) {
      this.marker.position.set(p[0], p[1] + 0.02, p[2]);
      this.panah.position.y = 0.9 + Math.sin(t * 4) * 0.08;
    }
  }

  render() {
    const st = this.steps[this.i], el = this.el;
    el.querySelector('#tu-no').textContent = this.selesai ? 'selesai ✓' : `langkah ${this.i + 1} dari ${this.steps.length}`;
    el.querySelector('#tu-judul').textContent = st.judul;
    el.querySelector('#tu-teks').innerHTML = st.teks;
    el.querySelector('#tu-why').innerHTML = `<b>Kenapa?</b> ${st.kenapa}`;
    const lanjut = el.querySelector('#tu-lanjut');
    lanjut.style.display = st.manual && !this.selesai ? '' : 'none';
    lanjut.textContent = st.manual || '';
    el.querySelector('#tu-lewati').style.display = st.manual || this.selesai ? 'none' : '';
    el.classList.toggle('beres', this.selesai);
  }
}
