# Website Werkudara — ABU Robocon 2027

Website tim robot Werkudara untuk anak magang:

| Halaman | Isi |
|---|---|
| `index.html` | Beranda: kenalan dengan BR/TR dan tugas pertama anak magang. |
| `perakit/` | **Perakit Robot 3D**: rakit BR dan TR dari modul plug-and-play, cek Rulebook, lalu mainkan di arena. |
| `simulator/` | Salinan SimulatorABU (arena 2027, aturan & skor Rulebook V1.1, robot R1/R3, mode otonom). |

## Perakit Robot

1. Pilih **BR** (Builder) atau **TR** (Transporter).
2. Seret modul dari palet ke robot 3D, atau klik **Pasang**: rangka (hollow 20×20, V-slot, komposit), penggerak
   (mecanum, omni, diferensial), motor (PG45, PG36, BLDC), baterai, kontroler (STM32 / STM32 + Jetson), lift, boom,
   vakum, track + flipper, lift rahang, penjepit U, dan sensor/aksesori (kamera, LiDAR, keranjang Mustika, bumper,
   lampu status, tombol darurat).
3. Atur ukuran dengan slider. Perakit memeriksa:
   - **Rule 11.5** ukuran awal ≤ 700 × 700 × 700 mm (diukur dari model 3D, termasuk aksesori dan bumper; kotak garis
     berubah merah bila keluar),
   - **Rule 11.6/11.7** ukuran terjulur ≤ 1400 × 1000 × 1200 mm,
   - **Rule 11.8** berat BR + TR ≤ 60 kg (perkiraan dari modul),
   - **Rule 11.3** BR otonom: butuh komputer (Jetson) + sensor,
   - rahang TR muat Earth 350 mm, jangkauan Sky TR menurut lebar rangka (hasil `tools/jangkauan.cjs` SimulatorABU).
4. **Mainkan**: robot rakitan masuk arena di halaman yang sama (kemudikan TR dengan BR otonom, kemudikan keduanya,
   tonton otonom penuh, atau latihan TR berwaktu; bisa melawan komputer).
5. **Bagikan** menyalin tautan berisi desain; **Simpan/Buka** memakai berkas JSON.

Cara kerjanya: Perakit menghitung angka robot kustom (ukuran, kecepatan, lift, rahang, penggerak) dalam bentuk yang
sama dengan menu *Kustom* simulator dan menyimpannya di `localStorage` (`simabu.kustom`). Bentuk rakitan (rangka,
roda, motor, baterai, aksesori) diekspor ke GLB dan dipakai simulator sebagai *GLB cangkang*. Mekanisme yang bergerak
(lift, boom, wrist, track, rahang) memakai robot kotak simulator, jadi pratinjau di Perakit sama dengan robot di arena.

### Varian CAD dan Misi

- **Varian CAD**: templat *CAD BR-A + TR-A* (bawaan), *BR-A + TR-B*, *BR-B + TR-A*, *BR-C + TR-A*, atau pilih varian per
  robot di panel kanan. Modulnya diatur agar ukuran awal mendekati CAD, lalu tabel membandingkan ukuran awal,
  terjulur dan massa CAD dengan rakitan. Centang *Tampilkan model CAD* untuk melihat GLB asli di samping rakitan
  (pose awal, atau pose terjulur bila slider Pose digeser lewat setengah). Berkasnya di `perakit/cad/` (disalin dari
  `desain-robot/cad/keluaran`, pose awal + terjulur, beserta `cad.json`). Di arena, robot tetap memakai rakitan:
  mekanisme CAD belum punya rig gerak.
- **Misi** (tombol di atas): 10 tantangan merakit yang tercentang otomatis (robot lolos Rulebook, TR ramping 12 Sky,
  diet 40 kg, TR cepat, BR dengan kamera + LiDAR, pas di kotak 700 mm, bandingkan CAD, main di arena, satu babak penuh, bagikan).
  Daftar ada di `perakit/js/misi.js`.
- **Hasil di arena**: setelah satu pertandingan selesai (timer 0:00) dan menekan *Kembali ke perakit*, skor,
  waktu sampai Mandate/Mustika dan failure/pelanggaran/retry tampil di panel kanan (5 terakhir, disimpan di browser).
  Sumbernya catatan pertandingan simulator (`simabu.riwayat`).
- **Urungkan** (tombol atau Ctrl+Z): membatalkan perubahan terakhir, sampai 50 langkah.
- **Unduh daftar modul (CSV)**: semua modul BR dan TR dengan ukuran, berat perkiraan dan apakah angkanya sudah diukur.
  Pemisah titik koma agar langsung terbuka rapi di Excel berbahasa Indonesia.

### Mengisi angka asli robot

Semua angka modul (berat, kecepatan, percepatan, kecepatan lift/boom/rahang, penurunan baterai) ada di
**`perakit/data/angka-modul.json`**. Ganti angkanya dengan hasil ukur, set `"diukur": true`, dan isi `catatan`
(mis. "ditimbang 2026-12-01"). Kartu modul lalu bertanda **angka asli** dan Perakit memakai angka itu. Satuan tiap
angka tertulis di bagian `_satuan` berkas itu. Hanya angka yang dibaca; nama modul dan nama angka jangan diubah.
Bila berkasnya rusak (koma/kutip salah), Perakit memberi tahu dan kembali ke perkiraan. Periksa dengan
`node tests/uji-perakit.cjs` sebelum push.

Tanpa angka asli, angka di Perakit adalah **perkiraan untuk belajar**. Untuk robot asli, ukur lalu
isi menu Kustom simulator (lihat `KALIBRASI.md` di SimulatorABU). Modul baru ditambahkan di `katalog.js`
(data) dan `bangun.js` (bentuk 3D).

## Menjalankan di laptop

```
python -m http.server 8000
```
lalu buka http://localhost:8000. Halaman tidak bisa dibuka langsung lewat `file://`.

## Memperbarui simulator

Folder `simulator/` adalah salinan SimulatorABU ditambah tambalan kecil untuk Perakit (jenis penggerak
mecanum/omni/diferensial dan nama robot kustom). Versi asalnya ada di `simulator/VERSI-SIMULATOR.txt`.

```
git clone https://github.com/unsrobocon/SimulatorABU ../SimulatorABU
bash tools/sinkron-simulator.sh ../SimulatorABU
node tests/uji-perakit.cjs
```

Jangan mengubah `simulator/` langsung: ubah SimulatorABU, lalu sinkronkan. Bila `tools/tambal-simulator.cjs` gagal
karena kode SimulatorABU berubah, perbarui teks tambalannya.

## Uji

```
npm install --no-save playwright && npx playwright install chromium
node tests/uji-perakit.cjs
```
Juga dijalankan GitHub Actions (`.github/workflows/uji.yml`) di setiap push dan pull request.

## Terbit online (Netlify, repo tetap private)

`netlify.toml` sudah disiapkan (situs statis, tanpa build). Sekali saja, oleh pemilik akun:

1. Masuk ke https://app.netlify.com (daftar gratis dengan akun GitHub).
2. **Add new site → Import an existing project → GitHub**, izinkan Netlify membaca repo `unsrobocon/Website`.
3. Pilih branch `main`. Build command dan publish directory terisi otomatis dari `netlify.toml`. Tekan **Deploy**.
4. Opsional: **Site configuration → Change site name** (mis. `werkudara`), alamatnya menjadi
   `https://werkudara.netlify.app`.

Setelah itu setiap push ke `main` terbit otomatis, dan tiap pull request mendapat pratinjau sendiri. Repo tetap private;
situsnya sendiri bisa dibuka siapa pun yang tahu alamatnya.

Alternatif: `.github/workflows/pages.yml` menerbitkan ke GitHub Pages, tetapi Pages untuk repo private butuh paket
berbayar (GitHub Pro/Team), jadi workflow itu hanya berjalan bila dipicu manual.
