#!/usr/bin/env node
// Uji otomatis Perakit + simulator (Playwright + Chromium).
//   npm install --no-save playwright && npx playwright install chromium
//   node tests/uji-perakit.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' };

function server() {
  return new Promise((res) => {
    const s = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, () => res({ s, url: `http://localhost:${s.address().port}` }));
  });
}

const gagal = [];
const cek = (ok, pesan) => { console.log(`${ok ? 'lulus' : 'GAGAL'}  ${pesan}`); if (!ok) gagal.push(pesan); };

(async () => {
  const { s, url } = await server();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  try {
    // beranda
    await page.goto(`${url}/`);
    cek(await page.locator('a[href="perakit/"]').count() > 0, 'beranda menautkan Perakit');

    // perakit, templat bawaan
    await page.goto(`${url}/perakit/`);
    await page.waitForFunction(() => window.perakit);
    await page.keyboard.press('Escape');
    let h = await page.evaluate(() => { const h = perakit.hasil(); return { br: h.BR.siap, tr: h.TR.siap, berat: h.BR.berat + h.TR.berat, awal: perakit.adegan.ukuranAwal() }; });
    cek(h.br && h.tr, 'templat Werkudara: BR dan TR lengkap');
    cek(h.berat > 20 && h.berat <= 60, `berat tim ${h.berat.toFixed(1)} kg di bawah 60 kg`);
    cek(h.awal.every((v) => v <= 700), `ukuran awal BR ${h.awal.join('×')} mm dalam 700 mm`);

    // mulai kosong lalu pasang lewat tombol palet
    await page.selectOption('#templat', 'kosong');
    cek(await page.locator('#main').isDisabled(), 'robot kosong: tombol Mainkan nonaktif');
    for (const id of ['rangka-hollow', 'mecanum', 'pg45', 'lipo-6s', 'stm32-jetson', 'lift-belt', 'vakum3', 'track-flipper', 'kamera']) {
      await page.click(`.kartu[data-id="${id}"] button[data-pasang]`);
    }
    h = await page.evaluate(() => ({ siap: perakit.hasil().BR.siap, cek: perakit.hasil().BR.cek.filter((c) => !c.ok && !c.saran).map((c) => c.teks) }));
    cek(h.siap && h.cek.length === 0, `BR dirakit dari kosong tanpa pelanggaran (${h.cek.join('; ')})`);
    cek(!(await page.locator('#main').isDisabled()), 'tombol Mainkan aktif setelah BR lengkap');

    // seret modul ke panggung 3D
    await page.dragAndDrop('.kartu[data-id="lampu"]', '#tiga');
    cek(await page.evaluate(() => perakit.desain.BR.aksesori.some((x) => x.id === 'lampu')), 'seret-lepas memasang modul');

    // TR: rangka 690 + bumper melewati 700 mm
    await page.click('.tab button.TR');
    await page.selectOption('#templat', 'werkudara');
    await page.click('.tab button.TR');
    await page.fill('#p-rangka-0-lebar', '690');
    await page.dispatchEvent('#p-rangka-0-lebar', 'input');
    await page.click('.kartu[data-id="bumper"] button[data-pasang]');
    await page.waitForTimeout(200);
    h = await page.evaluate(() => ({ awal: perakit.adegan.ukuranAwal(), merah: document.querySelector('#cek li.bad')?.textContent || '' }));
    cek(h.awal[1] > 700 && h.merah.includes('11.5'), `TR 690 + bumper = lebar ${h.awal[1]} mm ditandai Rule 11.5`);

    // tautan berbagi
    await page.evaluate(() => { perakit.lepas('aksesori', perakit.desain.TR.aksesori.findIndex((x) => x.id === 'bumper')); perakit.pasangModul('diferensial'); });
    const hash = await page.evaluate(() => { document.querySelector('#nama').value = 'Uji'; document.querySelector('#nama').dispatchEvent(new Event('input')); return JSON.stringify(perakit.desain); });
    const enc = Buffer.from(hash).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const p2 = await browser.newPage();
    await p2.goto(`${url}/perakit/#d=${enc}`);
    await p2.waitForFunction(() => window.perakit);
    cek(await p2.evaluate((h) => JSON.stringify(perakit.desain) === h, hash), 'tautan Bagikan memuat desain yang sama');
    await p2.close();

    // varian CAD: templat, model CAD berdampingan, misi
    const p4 = await browser.newPage({ viewport: { width: 1366, height: 860 } });
    p4.on('pageerror', (e) => errs.push(e.message));
    await p4.goto(`${url}/perakit/`);
    await p4.waitForFunction(() => window.perakit);
    await p4.keyboard.press('Escape');
    await p4.selectOption('#templat', 'cad-a-a');
    const ca = await p4.evaluate(() => ({ cad: perakit.desain.cad, br: perakit.hasil().BR.cek.filter((c) => !c.ok && !c.saran).length, tr: perakit.hasil().TR.cek.filter((c) => !c.ok && !c.saran).length }));
    cek(ca.cad.BR === 'BR-A' && ca.cad.TR === 'TR-A' && ca.br === 0 && ca.tr === 0, 'templat CAD BR-A + TR-A lolos cek');
    await p4.check('#cad-tampil');
    await p4.waitForFunction(() => perakit.adegan.cad?.visible, null, { timeout: 30000 });
    const ukCad = await p4.evaluate(async () => { const THREE = await import('three'); const s = new THREE.Box3().setFromObject(perakit.adegan.cad).getSize(new THREE.Vector3()); return [s.z, s.x, s.y].map((v) => Math.round(v * 1000)); });
    cek(Math.abs(ukCad[0] - 671) < 3 && Math.abs(ukCad[1] - 668) < 3, `model CAD BR-A tampil menghadap depan (${ukCad.join('×')} mm)`);
    await p4.click('.tab button.TR');
    await p4.selectOption('#cad-varian', 'TR-B');
    const trb = await p4.evaluate(() => ({ cad: perakit.desain.cad.TR, lebar: perakit.hasil().TR.k.lebar }));
    cek(trb.cad === 'TR-B' && trb.lebar === 480, 'varian TR-B mengganti modul TR saja');
    await p4.click('#misi-btn');
    await p4.waitForTimeout(500);
    const ms = await p4.evaluate(() => ({ beres: document.querySelectorAll('#misi-list li.beres').length, teks: document.querySelector('#misi-jumlah').textContent }));
    cek(ms.beres >= 2, `misi tercentang otomatis (${ms.teks})`);
    await p4.close();

    // angka asli dari data/angka-modul.json menggantikan perkiraan
    const asli = JSON.parse(fs.readFileSync(path.join(ROOT, 'perakit/data/angka-modul.json'), 'utf8'));
    cek(Object.keys(asli.modul).length >= 25, 'angka-modul.json berisi semua modul');
    asli.modul.pg36 = { ...asli.modul.pg36, speed: 1.23, diukur: true, catatan: 'diukur 2026' };
    const p3 = await browser.newPage();
    await p3.route('**/perakit/data/angka-modul.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(asli) }));
    await p3.goto(`${url}/perakit/`);
    await p3.waitForFunction(() => window.perakit);
    await p3.evaluate(() => { localStorage.clear(); });
    await p3.reload();
    await p3.waitForFunction(() => window.perakit);
    await p3.keyboard.press('Escape');
    await p3.click('.tab button.TR');
    const sp = await p3.evaluate(() => ({ v: perakit.hasil().TR.k.speed, badge: document.querySelector('.kartu[data-id="pg36"]').textContent }));
    cek(sp.v === 1.23 && sp.badge.includes('angka asli'), `angka asli dipakai (TR ${sp.v} m/s, lencana angka asli)`);
    await p3.close();

    // main di arena: TR diferensial dikemudikan, BR otonom
    await page.click('#main');
    await page.click('#main-ok');
    await page.waitForSelector('#arena:not([hidden])');
    const fr = await (await page.waitForSelector('#arena-frame')).contentFrame();
    await fr.waitForFunction(() => [...document.querySelectorAll('#log li')].some((l) => l.textContent.includes('siap')), null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const a = await fr.evaluate(() => ({
      url: location.search,
      nama: document.querySelector('#robot-name')?.textContent || '',
      log: [...document.querySelectorAll('#log li')].map((l) => l.textContent).join(' | '),
      k: JSON.parse(localStorage.getItem('simabu.kustom')),
    }));
    cek(a.url.includes('br=br-kustom') && a.url.includes('tr=tr-kustom'), 'arena memakai robot kustom');
    cek(a.k.TR.drive === 'diferensial' && a.k.TR.nama === 'TR Uji', 'penggerak & nama robot terkirim ke simulator');
    cek(a.k.BR.cangkang.startsWith('data:model/gltf-binary;base64,'), 'bentuk rakitan dikirim sebagai GLB cangkang');
    cek(!a.log.includes('gagal dimuat'), 'GLB cangkang dimuat simulator');
    cek(a.nama.includes('Uji'), `panel arena menampilkan robot rakitan (${a.nama})`);
    // TR diferensial tidak bisa geser: tahan D, posisi lateral tidak berubah banyak
    const xTR = () => fr.evaluate(() => Number((document.querySelector('#telemetry')?.textContent.match(/\(x (-?[\d.]+)/) || [])[1]));
    await fr.click('#view');
    const x0 = await xTR();
    await page.keyboard.down('d'); await page.waitForTimeout(1500); await page.keyboard.up('d');
    const x1 = await xTR();
    cek(Number.isFinite(x0) && Math.abs(x1 - x0) < 0.01, `TR diferensial tidak bergeser menyamping (x ${x0} -> ${x1})`);
    const zTR = () => fr.evaluate(() => Number(document.querySelector('#telemetry')?.textContent.match(/z (-?[\d.]+)/)?.[1]));
    const z0 = await zTR();
    // simulasi maju per bingkai; di CI tanpa GPU bingkainya lambat, jadi tahan W sampai TR bergerak (maks. 10 s)
    await page.keyboard.down('w');
    let z1 = z0;
    for (let i = 0; i < 40 && Math.abs(z1 - z0) <= 0.05; i++) { await page.waitForTimeout(250); z1 = await zTR(); }
    await page.keyboard.up('w');
    cek(Math.abs(z1 - z0) > 0.05, `TR diferensial tetap bisa maju (z ${z0} -> ${z1})`);
    await page.click('#kembali');
    cek(await page.locator('#arena').isHidden(), 'kembali ke perakit');
  } catch (e) {
    cek(false, `uji berhenti: ${e.message.split('\n')[0]}`);
  }
  cek(errs.length === 0, `tanpa error di halaman${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  await browser.close();
  s.close();
  console.log(gagal.length ? `\n${gagal.length} uji GAGAL` : '\nSemua uji lulus');
  process.exit(gagal.length ? 1 : 0);
})();
