// Menu awal: memilih tim, Storage, mode otonom, strategi dan lawan, lalu memulai simulator.

import { PILIHAN, saveSettings, startUrl } from './settings.js';
import { PROFIL, KUSTOM_FIELD, bacaKustom, simpanKustom, buatKustom, ukuran } from './profiles.js';
import { STORAGE_LAYOUTS, OBJ } from './config.js';
import { readLayout, saveLayout, fits, valid, MAKS_KOLOM } from './storage.js';
import { NAMA_TOMBOL, AKSI_STIK, petaStik, simpanStik } from './input.js';
import { STRATEGI, LANGKAH, namaLangkah, bacaRencana, simpanRencana, cekRencana } from './strategy.js';

export function showMenu(s) {
  document.getElementById('loading').style.display = 'none';
  const el = document.getElementById('menu');
  const row = (k) => {
    const p = PILIHAN[k];
    const opts = Object.entries(p.opsi).map(([v, label]) => `<label class="opt"><input type="radio" name="${k}" value="${v}"${String(s[k]) === v ? ' checked' : ''}><span>${label}</span></label>`).join('');
    const ed = k !== 'storage' ? '' : `<div class="row kustom" id="storage-ed"><div class="lab">Susun Storage</div><div class="opts sto">
      <canvas id="sto-cv" width="420" height="232" aria-label="Denah Storage dari atas"></canvas>
      <div class="sto-side"><p id="sto-info"></p>
        <div class="sto-btn"><button type="button" data-sto="akses">Pola akses</button><button type="button" data-sto="rapat">Pola rapat</button><button type="button" data-sto="kosong">Kosongkan</button></div>
        <p class="muted">Klik tempat kosong: tambah kolom 2 Earth. Seret: pindah. Klik dua kali: hapus. Kolom harus seluruhnya di dalam Storage (Rule 4.1.3).</p></div>
    </div></div>`;
    const st = k !== 'strategi' ? '' : `<div class="row kustom" id="strategi-ed"><div class="lab">Susun strategi</div><div class="opts stg">
      <ol id="stg-list"></ol>
      <div class="sto-btn"><select id="stg-add" aria-label="Langkah yang ditambahkan"></select><button type="button" id="stg-tambah">Tambah</button><button type="button" id="stg-reset">Pola Mandate dulu</button></div>
      <p class="warn" id="stg-warn"></p>
      <p class="muted">Urutan antaran TR; BR menyusun menara mengikuti urutan Earth dan Sky di daftar ini.</p></div></div>`;
    return `<div class="row"><div class="lab">${p.label}</div><div class="opts">${opts}</div></div>${ed}${st}`;
  };
  // pilihan desain robot (js/profiles.js); robot kustom memakai angka di bawahnya
  const kustom = bacaKustom();
  let berat = {};
  try { berat = JSON.parse(localStorage.getItem('simabu.berat') || '{}'); } catch { /* diblokir */ }
  const robotRow = (k, kind) => {
    const opts = Object.entries(PROFIL[kind]).map(([id, p]) => `<label class="opt"><input type="radio" name="${k}" value="${id}"${s[k] === id ? ' checked' : ''}><span>${p.label}<small> — ${p.deskripsi}</small></span></label>`).join('');
    const fields = KUSTOM_FIELD[kind].map(([f, label, unit, lo, hi]) => `<label class="num">${label} <input type="number" name="${kind}.${f}" value="${kustom[kind][f]}" min="${lo}" max="${hi}" step="${unit === 'mm' ? 1 : 0.1}"> ${unit}</label>`).join('')
      + `<label class="num wide">GLB cangkang (opsional) <input type="text" name="${kind}.cangkang" value="${kustom[kind].cangkang}" placeholder="assets/robotku.glb"></label>`;
    return `<div class="row"><div class="lab">Desain ${kind}</div><div class="opts">${opts}</div></div>
      <div class="row kustom" id="kustom-${kind}"><div class="lab">${kind} kustom</div><div class="opts">${fields}</div></div>`;
  };
  el.innerHTML = `<form class="menu-inner">
    <h1>Simulator Werkudara <small>ABU Robocon 2027 — The Pursuit of Mustika Nusantara</small></h1>
    <div class="cepat" aria-label="Mulai cepat">
      <a href="?tutorial=1&tim=merah&mode=latihan&otoBR=0&otoTR=0&lawan=0&retry=0&forced=peringatan"><b>Tutorial</b><small>Anggota baru: langkah demi langkah</small></a>
      <a href="?demo=1&otoBR=1&otoTR=1&lawan=penuh&retry=5&forced=otomatis"><b>Demo berpemandu</b><small>4 robot otonom + keterangan, untuk presentasi</small></a>
      <a href="?mulai=1&mode=pertandingan&otoBR=1&otoTR=0&lawan=penuh&storage=rapat&retry=5&forced=otomatis"><b>Pertandingan</b><small>Anda TR vs robot komputer</small></a>
      <a href="?mulai=1&tantangan=earth&otoBR=1&retry=5&forced=otomatis"><b>Latihan TR</b><small>Antar 2 tumpukan Earth berwaktu</small></a>
      <a href="?mulai=1&tantangan=brmenara&otoBR=0&retry=5&forced=otomatis"><b>Latihan BR</b><small>Susun menara dengan BR manual</small></a>
      <a href="robot.html" target="_blank"><b>Kenali robot</b><small>Bagian-bagian BR dan TR dalam 3D</small></a>
      <a href="kuis.html" target="_blank"><b>Kuis aturan</b><small>Uji pemahaman Rulebook</small></a>
      <a href="panduan.html" target="_blank"><b>Panduan cepat</b><small>Satu halaman: tombol, alur latihan, istilah</small></a>
    </div>
    <h2 class="atur">Atur sendiri</h2>
    ${Object.keys(PILIHAN).map(row).join('')}
    ${robotRow('br', 'BR')}${robotRow('tr', 'TR')}
    <div class="row"><div class="lab">Kalibrasi</div><div class="opts">
      <div class="sto-btn"><button type="button" id="kal-unduh">Unduh kalibrasi (JSON)</button>
      <label class="tombol-file">Muat kalibrasi <input type="file" id="kal-muat" accept=".json,application/json" hidden></label></div>
      <span id="kal-info" class="muted">Angka robot Kustom + berat dalam satu berkas; cara mengukur: KALIBRASI.md</span>
      <div class="sto-btn"><label class="tombol-file">Cek ukuran GLB BR<input type="file" id="glb-BR" accept=".glb" hidden></label>
      <label class="tombol-file">Cek ukuran GLB TR<input type="file" id="glb-TR" accept=".glb" hidden></label></div>
      <span id="glb-info" class="muted">Ekspor CAD robot (GLB, posisi awal) — diperiksa terhadap Rule 11.5 (maks. 700 × 700 × 700 mm)</span></div></div>
    <div class="row"><div class="lab">Berat robot</div><div class="opts kg">
      <label class="num">BR <input type="number" id="berat-BR" min="0" max="100" step="0.1" value="${berat.BR ?? ''}" placeholder="kg"> kg</label>
      <label class="num">TR <input type="number" id="berat-TR" min="0" max="100" step="0.1" value="${berat.TR ?? ''}" placeholder="kg"> kg</label>
      <span id="berat-info" class="muted"></span></div></div>
    <div class="row"><div class="lab">Tombol stik</div><div class="opts stik">
      <ul id="stik-list"></ul>
      <p id="stik-status" class="muted">Pilih Ubah, lalu tekan tombol di stik. Stik analog, L2/R2, L1/R1 dan D↑/D↓ tetap seperti bawaan.</p>
      <div class="sto-btn"><button type="button" id="stik-reset">Kembalikan bawaan</button></div></div></div>
    <p class="warn" id="menu-ukuran"></p>
    <p class="muted" id="menu-note"></p>
    <div class="actions"><button type="submit">Mulai</button></div>
    <p class="muted" id="versi"></p>
    <p class="muted">Di dalam simulator: <kbd>Enter</kbd> timer · <kbd>H</kbd> bantuan · <kbd>O</kbd>/<kbd>I</kbd> BR/TR otonom · <kbd>L</kbd> catatan waktu · <kbd>Esc</kbd> kembali ke menu ini. Anggota baru: baca <a href="panduan.html" target="_blank">Panduan cepat</a>, coba <b>Tutorial</b>, lalu <a href="kuis.html" target="_blank">Kuis aturan</a>.</p>
  </form>`;
  el.classList.add('show');
  const form = el.querySelector('form');
  // Kalibrasi: angka robot kustom dan berat diekspor / diimpor sebagai satu berkas JSON, dan robot
  // Kustom dipilih otomatis setelah dimuat
  const kalInfo = () => document.getElementById('kal-info');
  el.querySelector('#kal-unduh').addEventListener('click', () => {
    const data = { versi: 1, ...readKustom(), berat: { BR: parseFloat(document.getElementById('berat-BR').value) || null, TR: parseFloat(document.getElementById('berat-TR').value) || null } };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'kalibrasi-werkudara.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  el.querySelector('#kal-muat').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try { muatKalibrasi(JSON.parse(await f.text())); } catch (err) { kalInfo().textContent = `Gagal memuat: ${err.message}`; }
    ev.target.value = '';
  });
  const muatKalibrasi = (data) => {
    let n = 0;
    for (const kind of ['BR', 'TR']) {
      const d = data?.[kind];
      if (!d || typeof d !== 'object') continue;
      for (const [f, , , lo, hi] of KUSTOM_FIELD[kind]) {
        const v = Number(d[f]);
        if (d[f] !== undefined && d[f] !== null && Number.isFinite(v)) { form.elements[`${kind}.${f}`].value = Math.min(hi, Math.max(lo, v)); n++; }
      }
      if (typeof d.cangkang === 'string') form.elements[`${kind}.cangkang`].value = d.cangkang;
      form.elements[kind.toLowerCase()].value = `${kind.toLowerCase()}-kustom`;
    }
    for (const kind of ['BR', 'TR']) if (Number.isFinite(Number(data?.berat?.[kind])) && data.berat[kind] !== null) document.getElementById(`berat-${kind}`).value = data.berat[kind];
    if (!n) throw new Error('tidak ada angka BR/TR yang dikenali');
    form.dispatchEvent(new Event('change', { bubbles: true }));
    for (const kind of ['BR', 'TR']) document.getElementById(`berat-${kind}`).dispatchEvent(new Event('input', { bubbles: true }));
    kalInfo().textContent = `Dimuat ${n} angka; robot Kustom dipilih. Tekan Mulai.`;
  };
  window.__muatKalibrasi = muatKalibrasi;      // uji
  // Cek ukuran GLB (js/ukurglb.js): ukuran awal dari model CAD; lebar/panjang bisa langsung dipakai robot Kustom
  for (const kind of ['BR', 'TR']) {
    el.querySelector(`#glb-${kind}`).addEventListener('change', async (ev) => {
      const f = ev.target.files[0], info = document.getElementById('glb-info');
      ev.target.value = '';
      if (!f) return;
      info.textContent = `Memeriksa ${f.name} …`;
      try {
        const { ukurGlb } = await import('./ukurglb.js');
        const u = await ukurGlb(await f.arrayBuffer());
        info.innerHTML = `${kind} ${f.name.replace(/[<>&"]/g, '')}: ${u.lebar} × ${u.panjang} × ${u.tinggi} mm (lebar × panjang × tinggi) — `
          + (u.lolos ? '<span class="ok">memenuhi Rule 11.5</span>' : `<span class="warn">melebihi 700 mm: ${u.lebih.join(', ')} (Rule 11.5)</span>`)
          + ` <button type="button" id="glb-pakai">Pakai untuk ${kind} Kustom</button>`;
        document.getElementById('glb-pakai').addEventListener('click', () => {
          form.elements[`${kind}.lebar`].value = u.lebar;
          form.elements[`${kind}.panjang`].value = u.panjang;
          form.elements[kind.toLowerCase()].value = `${kind.toLowerCase()}-kustom`;
          form.dispatchEvent(new Event('change', { bubbles: true }));
          info.append(' — dipakai');
        });
      } catch (err) { info.textContent = `GLB tidak bisa dibaca: ${err.message}`; }
    });
  }
  const read = () => ({ ...Object.fromEntries(Object.keys(PILIHAN).map((k) => [k, form.elements[k].value])), br: form.elements.br.value, tr: form.elements.tr.value });
  const readKustom = () => {
    const out = {};
    for (const kind of ['BR', 'TR']) {
      out[kind] = { drive: kustom[kind].drive, nama: kustom[kind].nama, bantalan: kustom[kind].bantalan, cangkang: form.elements[`${kind}.cangkang`].value.trim() };
      for (const [f, , , lo, hi] of KUSTOM_FIELD[kind]) {
        const v = Number(form.elements[`${kind}.${f}`].value);
        out[kind][f] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : kustom[kind][f];
      }
    }
    return out;
  };
  // ukuran robot yang dipilih terhadap Rule 11.5–11.7 (peringatan saja, tidak memblokir)
  // Rule 11.8: berat TR + BR (dengan baterai, kendali manual dan kabel) maks. 60 kg; isian perkiraan tim
  const cekBerat = () => {
    const b = { BR: parseFloat(document.getElementById('berat-BR').value), TR: parseFloat(document.getElementById('berat-TR').value) };
    const info = document.getElementById('berat-info');
    if (!Number.isFinite(b.BR) || !Number.isFinite(b.TR)) { info.textContent = 'isi perkiraan berat untuk memeriksa Rule 11.8 (maks. 60 kg berdua)'; return { b, warn: null }; }
    const total = Math.round((b.BR + b.TR) * 10) / 10;
    info.textContent = `total ${total.toLocaleString('id-ID')} kg dari maks. 60 kg`;
    return { b, warn: total > 60 ? `berat TR + BR ${total.toLocaleString('id-ID')} kg melebihi 60 kg (Rule 11.8)` : null };
  };
  const cekUkuran = () => {
    const v = read(), k = readKustom(), warn = [];
    const w = cekBerat().warn;
    if (w) warn.push(w);
    for (const [key, kind] of [['br', 'BR'], ['tr', 'TR']]) {
      const custom = v[key] === `${key}-kustom`;
      document.getElementById(`kustom-${kind}`).style.display = custom ? '' : 'none';
      const p = custom ? buatKustom(kind, k[kind]) : PROFIL[kind][v[key]];
      warn.push(...ukuran(kind, p).warn);
    }
    // Mode Pertandingan: Storage resmi 20 Earth (4.1.3) dan BR otonom penuh (11.3)
    if (v.mode === 'pertandingan') {
      if (v.storage === 'akses') warn.push('Storage "akses" hanya 18 Earth; pertandingan resmi memakai 20 (Rule 4.1.3)');
      if (v.otoBR !== '1') warn.push('BR manual; saat lomba BR wajib otonom penuh (Rule 11.3)');
    }
    const out = document.getElementById('menu-ukuran');
    out.textContent = warn.length ? `⚠ ${warn.join(' · ')}` : '';
    out.style.display = warn.length ? '' : 'none';
  };
  const note = () => {
    cekUkuran();
    const v = read();
    const who = [v.otoBR === '1' ? null : 'BR', v.otoTR === '1' ? null : 'TR'].filter(Boolean);
    document.getElementById('menu-note').textContent = who.length
      ? `Anda mengemudikan ${who.join(' dan ')}${who.length === 2 ? ' (Tab untuk berganti)' : ''}.${v.lawan !== '0' ? ' Robot lawan mulai bergerak saat timer dimulai.' : ''}`
      : `Kedua robot otonom: pertandingan berjalan sendiri.${v.lawan !== '0' ? ' Robot lawan mulai saat timer dimulai (Enter).' : ''}`;
  };
  // ---- atur tombol stik ----
  let tunggu = null;
  const drawStik = () => {
    const peta = petaStik(), dipakai = {};
    for (const [a, i] of Object.entries(peta)) (dipakai[i] = dipakai[i] || []).push(a);
    document.getElementById('stik-list').innerHTML = Object.entries(AKSI_STIK).map(([a, nama]) => {
      const i = peta[a], dua = dipakai[i].length > 1;
      return `<li><span>${nama}</span><b>${NAMA_TOMBOL[i]}</b>${dua ? ' <small class="warn">dipakai bersama</small>' : ''}<button type="button" data-aksi="${a}">${tunggu === a ? 'Tekan tombol…' : 'Ubah'}</button></li>`;
    }).join('');
  };
  const pads = () => (navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : []);
  const awasi = (aksi) => {
    const lepas = new Set();
    for (const p of pads()) p.buttons.forEach((b, i) => { if (b.pressed) lepas.add(`${p.index}:${i}`); });
    const cek = () => {
      if (tunggu !== aksi) return;
      for (const p of pads()) {
        for (let i = 0; i < Math.min(p.buttons.length, NAMA_TOMBOL.length); i++) {
          const k = `${p.index}:${i}`;
          if (p.buttons[i].pressed && !lepas.has(k)) {
            const peta = petaStik(); peta[aksi] = i; simpanStik(peta);
            tunggu = null;
            document.getElementById('stik-status').textContent = `${AKSI_STIK[aksi]} → ${NAMA_TOMBOL[i]} (tersimpan)`;
            drawStik();
            return;
          }
          if (!p.buttons[i].pressed) lepas.delete(k);
        }
      }
      requestAnimationFrame(cek);
    };
    requestAnimationFrame(cek);
  };
  document.getElementById('stik-list').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-aksi]'); if (!b) return;
    tunggu = b.dataset.aksi;
    document.getElementById('stik-status').textContent = pads().length ? `Tekan tombol stik untuk: ${AKSI_STIK[tunggu]}` : 'Stik belum terdeteksi — sambungkan stik lalu tekan tombol apa saja';
    drawStik();
    awasi(tunggu);
  });
  document.getElementById('stik-reset').addEventListener('click', () => {
    try { localStorage.removeItem('simabu.stik'); } catch { /* diblokir */ }
    tunggu = null; drawStik();
    document.getElementById('stik-status').textContent = 'Tombol stik kembali ke bawaan';
  });
  drawStik();

  // ---- editor strategi ----
  let rencana = bacaRencana();
  const drawPlan = () => {
    const ol = document.getElementById('stg-list');
    ol.innerHTML = rencana.map((c, i) => `<li><span>${i + 1}. ${namaLangkah(c)}</span><button type="button" data-i="${i}" data-d="-1" aria-label="Naik">↑</button><button type="button" data-i="${i}" data-d="1" aria-label="Turun">↓</button><button type="button" data-i="${i}" data-d="0" aria-label="Hapus">✕</button></li>`).join('');
    const sisa = LANGKAH.filter((c) => !rencana.includes(c));
    document.getElementById('stg-add').innerHTML = sisa.map((c) => `<option value="${c}">${namaLangkah(c)}</option>`).join('');
    document.getElementById('stg-tambah').disabled = !sisa.length;
    const w = cekRencana(rencana);
    document.getElementById('stg-warn').textContent = w.length ? `⚠ ${w.join(' · ')}` : '';
  };
  document.getElementById('stg-list').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const i = Number(b.dataset.i), d = Number(b.dataset.d);
    if (d === 0) { if (rencana.length > 1) rencana.splice(i, 1); }
    else { const j = i + d; if (j >= 0 && j < rencana.length) [rencana[i], rencana[j]] = [rencana[j], rencana[i]]; }
    drawPlan();
  });
  document.getElementById('stg-tambah').addEventListener('click', () => { const v = document.getElementById('stg-add').value; if (v) { rencana.push(v); drawPlan(); } });
  document.getElementById('stg-reset').addEventListener('click', () => { rencana = [...STRATEGI.mandate.plan]; drawPlan(); });
  const showStg = () => { document.getElementById('strategi-ed').style.display = form.elements.strategi.value === 'kustom' ? '' : 'none'; };
  drawPlan();
  form.addEventListener('change', showStg);
  showStg();

  // ---- editor tata letak Storage (Rule 4.1.3) ----
  const cv = document.getElementById('sto-cv'), g = cv.getContext('2d');
  const SC = 200, M = 16, H = OBJ.earth / 2, snap = (v) => Math.round(v / 0.025) * 0.025;
  let cols = readLayout(), drag = -1;
  const px = ([x, z]) => [M + (x - 3.5) * SC, M + (z + 5.5) * SC];
  const draw = () => {
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#2a3038'; g.fillRect(M, M, 2 * SC, SC);
    g.strokeStyle = '#8a95a3'; g.lineWidth = 1; g.strokeRect(M + 0.5, M + 0.5, 2 * SC, SC);
    g.fillStyle = '#8a95a3'; g.font = '11px system-ui, sans-serif';
    g.fillText('tepi lapangan', M + 2, 11); g.fillText('arah tengah lapangan', M + 2, M + SC + 13);
    g.fillText('|x| 3,5 m', M, M + SC + 27); g.fillText('|x| 5,5 m', M + 2 * SC - 48, M + SC + 27);
    cols.forEach((c, i) => {
      const [cx, cy] = px(c), s = 2 * H * SC;
      g.fillStyle = i === drag ? '#e0574b' : '#c23a2e'; g.fillRect(cx - s / 2, cy - s / 2, s, s);
      g.strokeStyle = '#f2c4bf'; g.strokeRect(cx - s / 2 + 0.5, cy - s / 2 + 0.5, s - 1, s - 1);
      g.fillStyle = '#fff'; g.font = 'bold 13px system-ui, sans-serif'; g.fillText('2', cx - 4, cy + 5);
    });
    document.getElementById('sto-info').textContent = `${cols.length} kolom = ${cols.length * 2} Earth (maks. ${MAKS_KOLOM * 2})`;
  };
  const at = (ev) => {
    const r = cv.getBoundingClientRect();
    const x = (ev.clientX - r.left) * cv.width / r.width, y = (ev.clientY - r.top) * cv.height / r.height;
    return [snap(3.5 + (x - M) / SC), snap(-5.5 + (y - M) / SC)];
  };
  const hit = ([x, z]) => cols.findIndex(([cx, cz]) => Math.abs(cx - x) <= H && Math.abs(cz - z) <= H);
  cv.addEventListener('pointerdown', (ev) => {
    const p = at(ev), i = hit(p);
    if (i >= 0) { drag = i; cv.setPointerCapture(ev.pointerId); draw(); return; }
    if (cols.length < MAKS_KOLOM && fits(cols, p)) { cols.push(p); draw(); }
  });
  cv.addEventListener('pointermove', (ev) => { if (drag < 0) return; const p = at(ev); if (fits(cols, p, drag)) { cols[drag] = p; draw(); } });
  cv.addEventListener('pointerup', () => { drag = -1; draw(); });
  cv.addEventListener('dblclick', (ev) => { const i = hit(at(ev)); if (i >= 0) { cols.splice(i, 1); draw(); } });
  el.querySelectorAll('[data-sto]').forEach((b) => b.addEventListener('click', () => {
    cols = b.dataset.sto === 'kosong' ? [] : STORAGE_LAYOUTS[b.dataset.sto].map((c) => [...c]);
    draw();
  }));
  const showEd = () => { document.getElementById('storage-ed').style.display = form.elements.storage.value === 'kustom' ? '' : 'none'; };
  draw();
  form.addEventListener('change', showEd);
  showEd();

  form.addEventListener('change', note);
  form.addEventListener('input', cekUkuran);
  note();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = read();
    if (v.storage === 'kustom') {
      if (!valid(cols)) { document.getElementById('sto-info').textContent = 'Tata letak belum sah: minimal 1 kolom, semua di dalam Storage, tidak bertumpuk.'; return; }
      saveLayout(cols);
    }
    if (v.strategi === 'kustom') simpanRencana(rencana);
    simpanKustom(readKustom());
    try { const { b } = cekBerat(); localStorage.setItem('simabu.berat', JSON.stringify({ BR: Number.isFinite(b.BR) ? b.BR : null, TR: Number.isFinite(b.TR) ? b.TR : null })); } catch { /* diblokir */ }
    saveSettings(v);
    location.href = startUrl(v);
  });
  form.querySelector('button[type=submit]').focus({ preventScroll: true });   // Enter langsung Mulai, tetapi menu tetap dibuka dari atas (Mulai cepat)
  tampilVersi();
}

// Versi rilis (versi.json ditulis tools/rilis.cjs saat deploy) dan keterangan bila dibuka dari internet
export function lokal(host = location.hostname) {
  return location.protocol === 'file:' || ['localhost', '127.0.0.1', '::1', '[::1]', ''].includes(host) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host) || /\.local$/.test(host);
}

function tampilVersi() {
  const el = document.getElementById('versi');
  if (!el) return;
  const online = lokal() ? '' : ' Dibuka dari internet: main di dua laptop (arena), jembatan Python / ROS 2 dan papan skor tim butuh server lokal (lihat README); fitur lain berjalan penuh di browser.';
  el.textContent = `Versi lokal (dari folder).${online}`;
  fetch('versi.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => { if (v && v.versi) el.textContent = `Versi ${v.versi}${v.tanggal ? ` · ${v.tanggal}` : ''}.${online}`; })
    .catch(() => {});
}
