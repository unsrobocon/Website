// Perakit Robot Werkudara: antarmuka. Desain disimpan di browser dan bisa dibagikan lewat tautan.
import { GLTFExporter } from '../vendor/GLTFExporter.js';
import { SLOT, MODUL, TEMPLAT, VARIAN_CAD, modulById, modulUntuk, nilaiParam, beratModul, terapkanAngka } from './katalog.js';
import { hitung, BATAS_BERAT } from './rakit.js';
import { bangunRobot, buatCangkang, ukurAwal, buang } from './bangun.js';
import { MISI, bacaSelesai, periksa } from './misi.js';
import { Adegan } from './adegan.js';

const KEY = 'perakit.desain';

// angka asli tim (perakit/data/angka-modul.json) menggantikan perkiraan di katalog.js
let masalahAngka = null;
try {
  const r = await fetch('data/angka-modul.json', { cache: 'no-cache' });
  if (r.ok) {
    const salah = terapkanAngka(await r.json());
    if (salah.length) masalahAngka = `angka-modul.json: modul tidak dikenal ${salah.join(', ')}`;
  }
} catch (e) {
  masalahAngka = 'angka-modul.json tidak bisa dibaca (cek tanda koma/kutip); Perakit memakai angka perkiraan';
  console.warn(e);
}
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kg = (v) => `${(Math.round(v * 10) / 10).toLocaleString('id-ID')} kg`;
const salin = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------- desain
function bersihkan(d) {
  const out = { versi: 1, nama: typeof d?.nama === 'string' ? d.nama.slice(0, 24) : '', BR: {}, TR: {} };
  for (const kind of ['BR', 'TR']) {
    for (const s of SLOT[kind]) {
      const x = d?.[kind]?.[s.id];
      const ok = (y) => y && modulById(y.id) && modulById(y.id).slot === s.id && modulById(y.id).untuk.includes(kind);
      const isi = (y) => ({ id: y.id, v: nilaiParam(modulById(y.id), kind, y.v) });
      if (s.multi) out[kind][s.id] = (Array.isArray(x) ? x : []).filter(ok).map(isi).slice(0, 12);
      else if (ok(x)) out[kind][s.id] = isi(x);
    }
    if (VARIAN_CAD[d?.cad?.[kind]]?.kind === kind) (out.cad = out.cad || {})[kind] = d.cad[kind];
  }
  return out;
}

function dariHash() {
  const m = location.hash.match(/^#d=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const json = new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
    return bersihkan(JSON.parse(json));
  } catch { return null; }
}
function keHash(d) {
  const bytes = new TextEncoder().encode(JSON.stringify(d));
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// data paket CAD (ukuran & massa tiap varian, GLB per pose)
let CAD = {};
try { const r = await fetch('cad/cad.json'); if (r.ok) CAD = await r.json(); } catch { /* tanpa CAD */ }
let tampilCad = false;
try { tampilCad = localStorage.getItem(`perakit.desain.cad`) === '1'; } catch { /* diblokir */ }

let desain = dariHash();
if (desain) history.replaceState(null, '', location.pathname);
else {
  try { desain = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { desain = null; }
  desain = desain ? bersihkan(desain) : bersihkan({ ...salin(TEMPLAT['cad-a-a']), nama: 'Werkudara' });
}
let aktif = 'BR';
try { aktif = localStorage.getItem(`${KEY}.aktif`) === 'TR' ? 'TR' : 'BR'; } catch { /* diblokir */ }

const simpan = () => { try { localStorage.setItem(KEY, JSON.stringify(desain)); } catch { /* diblokir */ } };

// ---------------------------------------------------------------- 3D
const adegan = new Adegan($('#tiga'));
let hasil = { BR: null, TR: null };

function hitungSemua() {
  hasil = { BR: hitung(desain, 'BR'), TR: hitung(desain, 'TR') };
}

function render(slotBaru = null) {
  hitungSemua();
  document.body.dataset.kind = aktif;
  adegan.pasangRobot(bangunRobot(hasil[aktif]), slotBaru);
  perbaruiCad();
  renderPalet();
  renderRingkas();
  simpan();
}

// ---------------------------------------------------------------- pasang / lepas
function pasangModul(id) {
  const m = modulById(id);
  if (!m || !m.untuk.includes(aktif)) return;
  const d = desain[aktif];
  if (m.slot === 'aksesori') {
    if (d.aksesori.some((x) => x.id === id)) { kabar(`${m.nama} sudah terpasang`); return; }
    d.aksesori.push({ id, v: nilaiParam(m, aktif, {}) });
  } else {
    // nilai parameter yang sama namanya dibawa ke modul pengganti (mis. ukuran rangka)
    const lama = d[m.slot]?.v || {};
    d[m.slot] = { id, v: nilaiParam(m, aktif, lama) };
  }
  render(m.slot);
  kabar(`${m.nama} terpasang`);
}

function lepas(slot, indeks = null) {
  const d = desain[aktif];
  if (slot === 'aksesori') d.aksesori.splice(indeks, 1);
  else delete d[slot];
  render();
}

// ---------------------------------------------------------------- palet kiri
// grup palet yang ditutup pengguna; di layar sempit grup yang sudah terisi mulai tertutup
const sempit = matchMedia('(max-width: 1000px)').matches;
const tertutup = new Set();
if (sempit) for (const k of ['BR', 'TR']) for (const s of SLOT[k]) tertutup.add(`${k}.${s.id}`);
$('#daftar-modul').addEventListener('toggle', (e) => {
  const g = e.target.closest?.('details.grup');
  if (!g) return;
  const key = `${aktif}.${g.dataset.slot}`;
  if (g.open) tertutup.delete(key); else tertutup.add(key);
}, true);

function renderPalet() {
  document.querySelectorAll('.tab button').forEach((b) => b.classList.toggle('aktif', b.dataset.kind === aktif));
  const d = desain[aktif], h = hasil[aktif];
  const pasangan = h.t.penggerak?.m;
  $('#daftar-modul').innerHTML = SLOT[aktif].map((s) => {
    const isi = s.multi ? d[s.id].length > 0 : !!d[s.id];
    const lencana = s.multi ? '<span class="lencana opsi">boleh banyak</span>'
      : s.wajib ? `<span class="lencana${isi ? ' isi' : ''}">${isi ? 'terisi' : 'wajib'}</span>` : `<span class="lencana${isi ? ' isi' : ' opsi'}">${isi ? 'terisi' : 'opsional'}</span>`;
    const kartu = modulUntuk(aktif, s.id).map((m) => {
      const on = s.multi ? d[s.id].some((x) => x.id === m.id) : d[s.id]?.id === m.id;
      const berat = beratModul(m, aktif, on ? (s.multi ? d[s.id].find((x) => x.id === m.id).v : d[s.id].v) : {}, pasangan);
      return `<div class="kartu${on ? ' dipasang' : ''}" draggable="true" data-id="${m.id}">
        <span class="nm">${esc(m.nama)}</span>
        ${on ? '<button type="button" data-lepas="1">Lepas</button>' : `<button type="button" data-pasang="1">${!s.multi && isi ? 'Ganti' : 'Pasang'}</button>`}
        <span class="inf">${esc(m.info)}</span>
        ${m.catatan ? `<span class="inf">${esc(m.catatan)}</span>` : ''}
        <span class="baris-bawah"><span class="inf kg">${m.diukur ? '' : '± '}${kg(berat)}</span>${m.diukur ? '<span class="lencana isi" title="Angka hasil ukur tim (data/angka-modul.json)">angka asli</span>' : '<span class="lencana opsi" title="Perkiraan; isi angka asli di data/angka-modul.json">perkiraan</span>'}</span>
      </div>`;
    }).join('');
    const nama = s.multi ? `${d[s.id].length} terpasang` : d[s.id] ? esc(modulById(d[s.id].id).nama) : '';
    const buka = tertutup.has(`${aktif}.${s.id}`) ? '' : ' open';
    return `<details class="grup" data-slot="${s.id}"${buka}><summary><h4>${esc(s.nama)} ${lencana}</h4><span class="ringkas-isi">${nama}</span></summary>${kartu}</details>`;
  }).join('');
}

$('#daftar-modul').addEventListener('click', (e) => {
  const k = e.target.closest('.kartu');
  if (!k) return;
  const m = modulById(k.dataset.id);
  if (e.target.dataset.lepas) {
    if (m.slot === 'aksesori') lepas('aksesori', desain[aktif].aksesori.findIndex((x) => x.id === m.id));
    else lepas(m.slot);
  } else if (e.target.dataset.pasang) pasangModul(m.id);
});

// seret modul ke robot
const panggung = $('#panggung');
$('#daftar-modul').addEventListener('dragstart', (e) => {
  const k = e.target.closest('.kartu');
  if (!k) return;
  e.dataTransfer.setData('text/x-modul', k.dataset.id);
  e.dataTransfer.effectAllowed = 'copy';
  k.classList.add('seret');
});
$('#daftar-modul').addEventListener('dragend', (e) => { e.target.closest('.kartu')?.classList.remove('seret'); panggung.classList.remove('terima'); });
panggung.addEventListener('dragover', (e) => {
  if (![...e.dataTransfer.types].includes('text/x-modul')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  panggung.classList.add('terima');
});
panggung.addEventListener('dragleave', (e) => { if (!panggung.contains(e.relatedTarget)) panggung.classList.remove('terima'); });
panggung.addEventListener('drop', (e) => {
  e.preventDefault();
  panggung.classList.remove('terima');
  const id = e.dataTransfer.getData('text/x-modul');
  if (id) pasangModul(id);
});

// ---------------------------------------------------------------- ringkasan kanan
function inputParam(slot, indeks, m, v) {
  return `<div class="prm">${(m.param || []).map((p) => `
    <label for="p-${slot}-${indeks ?? 0}-${p.k}">${esc(p.label)} <span>${p.min}–${p.max} ${p.unit}</span></label>
    <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${v[p.k]}" data-slot="${slot}" data-i="${indeks ?? ''}" data-k="${p.k}" aria-label="${esc(p.label)}">
    <input type="number" id="p-${slot}-${indeks ?? 0}-${p.k}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v[p.k]}" data-slot="${slot}" data-i="${indeks ?? ''}" data-k="${p.k}">`).join('')}</div>`;
}

// ---------------------------------------------------------------- misi
const selesai = bacaSelesai();
const flag = new Set();
const awalCache = new Map();
function awalOf(kind) {
  if (kind === aktif) return adegan.ukuranAwal();
  const key = JSON.stringify(desain[kind]);
  if (!awalCache.has(key)) {
    const r = bangunRobot(hasil[kind]);
    awalCache.set(key, ukurAwal(r));
    buang(r);
  }
  return awalCache.get(key);
}
const lolos = (kind, awal) => hasil[kind].siap && hasil[kind].cek.every((c) => c.ok || c.saran) && !!awal && awal.every((v) => v <= 700);
let misiT = null;
function cekMisi(segera = false) {
  clearTimeout(misiT);
  misiT = setTimeout(() => {
    const awal = { BR: awalOf('BR'), TR: awalOf('TR') };
    const ctx = { hasil, awal, lolos: { BR: lolos('BR', awal.BR), TR: lolos('TR', awal.TR) }, berat: hasil.BR.berat + hasil.TR.berat, flag };
    const baru = periksa(ctx, selesai);
    if (baru.length) kabar(`Misi selesai: ${baru.map((m) => m.judul).join(', ')} ✓`);
    $('#misi-btn').textContent = `Misi ${selesai.size}/${MISI.length}`;
    if ($('#dlg-misi').open) renderMisi();
  }, segera ? 0 : 350);
}
function tandai(f) { flag.add(f); cekMisi(true); }
function renderMisi() {
  $('#misi-list').innerHTML = MISI.map((m) => `<li class="${selesai.has(m.id) ? 'beres' : ''}"><b>${esc(m.judul)}</b><span>${esc(m.tugas)}</span>${m.petunjuk && !selesai.has(m.id) ? `<small class="muted">Petunjuk: ${esc(m.petunjuk)}</small>` : ''}</li>`).join('');
  $('#misi-jumlah').textContent = `${selesai.size} dari ${MISI.length} selesai`;
}
$('#misi-btn').addEventListener('click', () => { renderMisi(); $('#dlg-misi').showModal(); });
$('#misi-reset').addEventListener('click', () => {
  selesai.clear();
  try { localStorage.removeItem('perakit.misi'); } catch { /* diblokir */ }
  flag.clear();
  renderMisi();
  cekMisi(true);
});

// ---------------------------------------------------------------- varian & model CAD
const fmtUk = (a) => a.map((v) => Math.round(v)).join(' × ');
function urlCad() {
  const kode = desain.cad?.[aktif];
  const c = CAD[kode];
  if (!tampilCad || !c) return null;
  const p = adegan.u > 0.5 && c.pose.terjulur ? c.pose.terjulur : c.pose.awal;
  return `cad/${p.glb}`;
}
let cadUrlTerakhir;
function perbaruiCad() {
  const u = urlCad();
  if (u === cadUrlTerakhir) return;
  cadUrlTerakhir = u;
  adegan.tampilCad(u).catch(() => kabar('Model CAD gagal dimuat'));
}
function renderCad() {
  const kode = desain.cad?.[aktif];
  const c = CAD[kode];
  const opsi = Object.entries(VARIAN_CAD).filter(([, v]) => v.kind === aktif)
    .map(([k]) => `<option value="${k}"${k === kode ? ' selected' : ''}>${esc(CAD[k]?.nama || k)}</option>`).join('');
  const h = hasil[aktif];
  const awalKu = adegan.ukuranAwal();
  $('#cad-panel').innerHTML = `
    <label class="cad-pilih">Varian CAD <select id="cad-varian"><option value="">${kode ? 'Lepas dari varian CAD' : 'Pakai varian CAD…'}</option>${opsi}</select></label>
    ${c ? `<table class="banding"><thead><tr><th></th><th>CAD ${esc(kode)}</th><th>Rakitan</th></tr></thead><tbody>
      <tr><td>Awal (mm)</td><td>${fmtUk(c.pose.awal.ukuran)}</td><td>${awalKu ? fmtUk(awalKu) : '–'}</td></tr>
      <tr><td>Terjulur (mm)</td><td>${c.pose.terjulur ? fmtUk(c.pose.terjulur.ukuran) : '–'}</td><td>${fmtUk(h.uk.julur)}</td></tr>
      <tr><td>Massa</td><td>${kg(c.massaSiap)} <small class="muted">siap tanding</small></td><td>${kg(h.berat)}</td></tr>
    </tbody></table>
    <label class="cad-tampil"><input type="checkbox" id="cad-tampil"${tampilCad ? ' checked' : ''}> Tampilkan model CAD di samping <small class="muted">(geser Pose untuk pose terjulur)</small></label>` : ''}`;
}
$('#cad-panel').addEventListener('change', (e) => {
  if (e.target.id === 'cad-tampil') {
    tampilCad = e.target.checked;
    try { localStorage.setItem('perakit.desain.cad', tampilCad ? '1' : '0'); } catch { /* diblokir */ }
    perbaruiCad();
    if (tampilCad) tandai('cad');
    return;
  }
  if (e.target.id !== 'cad-varian') return;
  const kode = e.target.value;
  if (!kode) { if (desain.cad) delete desain.cad[aktif]; render(); return; }
  desain[aktif] = bersihkan({ [aktif]: salin(VARIAN_CAD[kode].isi) })[aktif];
  desain.cad = { ...(desain.cad || {}), [aktif]: kode };
  render('rangka');
  kabar(`${aktif} memakai modul varian CAD ${kode}`);
});

function renderRingkas() {
  const h = hasil[aktif], d = desain[aktif];
  $('#judul-robot').textContent = `${aktif} ${aktif === 'BR' ? 'Builder' : 'Transporter'}${desain.nama ? ` · ${desain.nama}` : ''}`;
  $('#slot-list').innerHTML = SLOT[aktif].map((s) => {
    if (s.multi) {
      const items = d.aksesori.map((x, i) => {
        const m = modulById(x.id);
        return `<div class="aks-item"><span>${esc(m.nama)}</span><button class="lepas" type="button" data-lepas-slot="aksesori" data-i="${i}" aria-label="Lepas ${esc(m.nama)}">✕</button></div>${m.param ? inputParam('aksesori', i, m, x.v) : ''}`;
      }).join('');
      return `<div class="slot${items ? '' : ' kosong'}" data-slot="aksesori"><div class="label">${esc(s.nama)}</div>${items || '<div class="muted kecil">Belum ada. Kamera/LiDAR dibutuhkan BR otonom.</div>'}</div>`;
    }
    const x = d[s.id];
    if (!x) return `<div class="slot kosong${s.wajib ? ' wajib' : ''}" data-slot="${s.id}"><div class="label">${esc(s.nama)}${s.wajib ? ' · wajib' : ''}</div><div class="muted kecil">Kosong. Seret modul ke sini atau ke robot.</div></div>`;
    const m = modulById(x.id);
    return `<div class="slot" data-slot="${s.id}"><div class="kepala"><div><div class="label">${esc(s.nama)}</div><div class="isi">${esc(m.nama)}</div></div>
      <button class="lepas" type="button" data-lepas-slot="${s.id}" aria-label="Lepas ${esc(m.nama)}">✕</button></div>${m.param ? inputParam(s.id, null, m, x.v) : ''}</div>`;
  }).join('');
  renderCek();
}

// bagian yang berubah saat parameter digeser (tanpa membangun ulang daftar slot)
function renderCek() {
  const h = hasil[aktif];
  const awal = adegan.ukuranAwal();
  const awalOk = awal && awal.every((v) => v <= 700);
  adegan.setBatas($('#batas').checked, awalOk !== false);
  $('#ukuran-awal').innerHTML = awal
    ? `Ukuran awal <b class="${awalOk ? 'ok' : 'bad'}">${awal.join(' × ')} mm</b> <span class="muted">P × L × T</span>`
    : 'Pasang modul untuk mulai';
  const cek = [
    ...(awal ? [{ ok: awalOk, rule: '11.5', teks: `Ukuran awal ${awal.join(' × ')} mm (maks. 700 × 700 × 700)` }] : []),
    ...h.cek,
  ];
  $('#cek').innerHTML = cek.map((c) => `<li class="${c.ok ? '' : c.saran ? 'saran' : 'bad'}"><span>${esc(c.teks)}${c.rule ? ` <span class="rule">Rule ${c.rule}</span>` : ''}</span></li>`).join('');
  $('#spes').innerHTML = h.spes.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('');
  const bBR = hasil.BR.berat, bTR = hasil.TR.berat, tot = Math.round((bBR + bTR) * 10) / 10;
  const lebih = tot > BATAS_BERAT;
  $('#berat').innerHTML = `<div>BR ${kg(bBR)} + TR ${kg(bTR)} = <b class="${lebih ? 'bad' : ''}" style="color:${lebih ? 'var(--bad)' : 'inherit'}">${kg(tot)}</b> dari ${BATAS_BERAT} kg</div>
    <div class="bar${lebih ? ' lebih' : ''}" role="img" aria-label="Berat ${kg(tot)} dari ${BATAS_BERAT} kg"><span class="br" style="width:${Math.min(100, (bBR / BATAS_BERAT) * 100)}%"></span><span class="tr" style="width:${Math.max(0, Math.min(100 - (bBR / BATAS_BERAT) * 100, (bTR / BATAS_BERAT) * 100))}%"></span></div>
    <details><summary>Rincian ${aktif}</summary><ul>${h.rincian.map((r) => `<li><span>${esc(r.nama)}</span><span>${kg(r.kg)}</span></li>`).join('')}</ul></details>`;
  const siap = hasil.BR.siap || hasil.TR.siap;
  renderCad();
  cekMisi();
  $('#main').disabled = !siap;
  $('#main-atas').disabled = !siap;
  $('#main').title = siap ? '' : 'Lengkapi slot wajib BR atau TR dulu';
}

$('#slot-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lepas-slot]');
  if (b) lepas(b.dataset.lepasSlot, b.dataset.i === '' ? null : Number(b.dataset.i));
});
let tunda = null;
$('#slot-list').addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset.k) return;
  const v = Number(el.value);
  if (!Number.isFinite(v)) return;
  const d = desain[aktif];
  const x = el.dataset.slot === 'aksesori' ? d.aksesori[Number(el.dataset.i)] : d[el.dataset.slot];
  if (!x) return;
  x.v = nilaiParam(modulById(x.id), aktif, { ...x.v, [el.dataset.k]: v });
  // samakan pasangan slider / kotak angka
  el.parentElement.querySelectorAll(`[data-k="${el.dataset.k}"]`).forEach((o) => { if (o !== el) o.value = x.v[el.dataset.k]; });
  // bangun ulang robot (tanpa membangun ulang panel agar slider tetap digeser)
  cancelAnimationFrame(tunda);
  tunda = requestAnimationFrame(() => {
    hitungSemua();
    adegan.pasangRobot(bangunRobot(hasil[aktif]));
    renderCek();
    renderPalet();
    simpan();
  });
});
$('#slot-list').addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/x-modul')) e.preventDefault(); });
$('#slot-list').addEventListener('drop', (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/x-modul'); if (id) pasangModul(id); });

// ---------------------------------------------------------------- sorot & klik bagian robot
const tip = $('#tip');
function namaSlotDi(hit) {
  const s = SLOT[aktif].find((x) => x.id === hit.slot);
  const d = desain[aktif];
  const x = hit.slot === 'aksesori' ? d.aksesori[hit.indeks] : d[hit.slot];
  return x ? `${s.nama}: ${modulById(x.id).nama}` : s.nama;
}
let tekan = null;
$('#tiga').addEventListener('pointermove', (e) => {
  const hit = adegan.slotDi(e.clientX, e.clientY);
  adegan.setSorot(hit?.slot ?? null);
  if (hit) {
    const r = panggung.getBoundingClientRect();
    tip.style.display = 'block';
    tip.style.left = `${e.clientX - r.left + 14}px`;
    tip.style.top = `${e.clientY - r.top + 10}px`;
    tip.textContent = namaSlotDi(hit);
  } else tip.style.display = 'none';
});
$('#tiga').addEventListener('pointerleave', () => { adegan.setSorot(null); tip.style.display = 'none'; });
$('#tiga').addEventListener('pointerdown', (e) => { tekan = [e.clientX, e.clientY]; });
$('#tiga').addEventListener('pointerup', (e) => {
  if (!tekan || Math.hypot(e.clientX - tekan[0], e.clientY - tekan[1]) > 5) return;
  const hit = adegan.slotDi(e.clientX, e.clientY);
  if (!hit) return;
  const el = document.querySelector(`#slot-list .slot[data-slot="${hit.slot}"]`);
  if (el) {
    document.querySelectorAll('#slot-list .slot.sorot').forEach((s) => s.classList.remove('sorot'));
    el.classList.add('sorot');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => el.classList.remove('sorot'), 1600);
  }
  document.querySelector(`#daftar-modul .grup[data-slot="${hit.slot}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ---------------------------------------------------------------- alat panggung
$('#pose').addEventListener('input', (e) => { adegan.setPose(Number(e.target.value)); perbaruiCad(); });
$('#uji-gerak').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  adegan.setUjiGerak(on);
});
$('#batas').addEventListener('change', () => renderCek());
$('#kamera-reset').addEventListener('click', () => adegan.kameraAwal());
document.querySelectorAll('.tab button').forEach((b) => b.addEventListener('click', () => {
  aktif = b.dataset.kind;
  try { localStorage.setItem(`${KEY}.aktif`, aktif); } catch { /* diblokir */ }
  render();
}));

// ---------------------------------------------------------------- nama, templat, simpan/buka/bagikan
$('#nama').value = desain.nama;
$('#nama').addEventListener('input', (e) => { desain.nama = e.target.value.slice(0, 24); hitungSemua(); renderRingkas(); simpan(); });
$('#templat').innerHTML += Object.entries(TEMPLAT).map(([id, t]) => `<option value="${id}">${esc(t.nama)}</option>`).join('');
$('#templat').addEventListener('change', (e) => {
  const t = TEMPLAT[e.target.value];
  e.target.value = '';
  if (!t) return;
  desain = bersihkan({ ...salin(t), nama: desain.nama });
  render('rangka');
  kabar(`Templat "${t.nama}" dipakai untuk BR dan TR`);
});
$('#unduh').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(desain, null, 2)], { type: 'application/json' }));
  a.download = `robot-${(desain.nama || 'werkudara').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#buka').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    desain = bersihkan(JSON.parse(await f.text()));
    $('#nama').value = desain.nama;
    render('rangka');
    kabar(`Desain "${desain.nama || f.name}" dibuka`);
  } catch { kabar('Berkas bukan desain Perakit (JSON)'); }
});
$('#bagikan').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#d=${keHash(desain)}`;
  try { await navigator.clipboard.writeText(url); kabar('Tautan desain disalin. Kirim ke teman tim!'); } catch { prompt('Salin tautan ini:', url); }
  tandai('bagikan');
});
$('#panduan-btn').addEventListener('click', () => $('#dlg-panduan').showModal());

let kabarT = null;
function kabar(t) {
  const el = $('#pesan');
  el.textContent = t;
  el.classList.add('tampil');
  clearTimeout(kabarT);
  kabarT = setTimeout(() => el.classList.remove('tampil'), 2400);
}

// ---------------------------------------------------------------- main di arena
// Robot dikirim ke simulator lewat penyimpanan browser yang sama dengan menu Kustom simulator
// ('simabu.kustom'); bentuk rakitan dikirim sebagai GLB cangkang (data URL).
async function glbDataUrl(h) {
  const g = buatCangkang(h);
  const buf = await new GLTFExporter().parseAsync(g, { binary: true });
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return `data:model/gltf-binary;base64,${btoa(s)}`;
}

$('#main-atas').addEventListener('click', () => $('#main').click());
$('#main').addEventListener('click', () => {
  const kurang = ['BR', 'TR'].filter((k) => !hasil[k].siap);
  $('#main-info').textContent = kurang.length
    ? `${kurang.join(' dan ')} belum lengkap, jadi memakai robot bawaan ${kurang.map((k) => (k === 'BR' ? 'BR R1' : 'TR R3')).join(' dan ')}.`
    : `${hasil.BR.k.nama} dan ${hasil.TR.k.nama} masuk ke arena ABU Robocon 2027.`;
  $('#dlg-main').showModal();
});

$('#dlg-main').addEventListener('close', async () => {
  if ($('#dlg-main').returnValue !== 'ok') return;
  const f = new FormData($('#dlg-main form'));
  const cara = f.get('cara'), lawan = f.get('lawan'), tim = f.get('tim');
  kabar('Menyiapkan robot …');
  const kustom = {};
  for (const k of ['BR', 'TR']) {
    if (!hasil[k].siap) continue;
    kustom[k] = { ...hasil[k].k, cangkang: await glbDataUrl(hasil[k]) };
  }
  try {
    const lama = JSON.parse(localStorage.getItem('simabu.kustom') || '{}');
    localStorage.setItem('simabu.kustom', JSON.stringify({ ...lama, ...kustom }));
    localStorage.setItem('simabu.berat', JSON.stringify({ BR: hasil.BR.siap ? hasil.BR.berat : null, TR: hasil.TR.siap ? hasil.TR.berat : null }));
  } catch {
    kabar('Browser menolak menyimpan data robot (mode privat?). Robot bawaan yang dipakai.');
  }
  const br = hasil.BR.siap ? 'br-kustom' : 'br-r1', tr = hasil.TR.siap ? 'tr-kustom' : 'tr-r3';
  const q = new URLSearchParams({
    mulai: '1', tim, br, tr, mode: 'latihan', storage: 'akses', strategi: 'mandate', retry: '5', forced: 'otomatis',
    otoBR: cara === 'manual' ? '0' : '1', otoTR: cara === 'otonom' ? '1' : '0',
    tantangan: cara === 'earth' ? 'earth' : '0',
    lawan: lawan === '0' || cara === 'earth' ? '0' : 'penuh',
  });
  if (lawan === 'r1') { q.set('lawanBr', 'br-r1'); q.set('lawanTr', 'tr-r3'); }
  bukaArena(`../simulator/index.html?${q}`, `${hasil.BR.siap ? hasil.BR.k.nama : 'BR R1'} + ${hasil.TR.siap ? hasil.TR.k.nama : 'TR R3'}`);
});

function bukaArena(url, judul) {
  tandai('main');
  const fr = $('#arena-frame');
  $('#arena-judul').textContent = judul;
  $('#arena').hidden = false;
  fr.src = url;
  fr.onload = () => { try { fr.contentWindow.focus(); } catch { /* lintas asal */ } };
}
function tutupArena() {
  $('#arena').hidden = true;
  $('#arena-frame').src = 'about:blank';
}
$('#kembali').addEventListener('click', tutupArena);

// ---------------------------------------------------------------- mulai
if (matchMedia('(pointer: coarse)').matches) $('.petunjuk').innerHTML = 'Ketuk <b>Pasang</b> pada modul, lalu ketuk bagian robot untuk melihat modulnya.';
render();
if (masalahAngka) setTimeout(() => kabar(masalahAngka), 600);
let dilihat = false;
try { dilihat = !!localStorage.getItem(`${KEY}.dilihat`); } catch { dilihat = true; }
if (!dilihat) {
  try { localStorage.setItem(`${KEY}.dilihat`, '1'); } catch { /* diblokir */ }
  $('#dlg-panduan').showModal();
}
// untuk uji otomatis
window.perakit = { get desain() { return desain; }, hasil: () => hasil, pasangModul, lepas, adegan, MODUL };
