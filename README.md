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

Angka berat dan performa di `perakit/js/katalog.js` adalah **perkiraan untuk belajar**. Untuk robot asli, ukur lalu
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

## Terbit ke GitHub Pages

`.github/workflows/pages.yml` menerbitkan situs setiap ada push ke `main`. Sekali saja: **Settings → Pages → Source:
GitHub Actions**. Catatan: GitHub Pages untuk repo **private** butuh paket berbayar (GitHub Pro/Team/Enterprise). Pada
akun gratis, repo harus dibuat public dulu (isi `simulator/` ikut menjadi publik), atau unggah folder ini ke hosting
statis lain (Netlify, Cloudflare Pages).
