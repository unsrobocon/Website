// Rekam suara pengarah (tombol J): komentar pelatih dari mikrofon direkam bersama rekaman pertandingan
// (js/rekam.js) dan diputar pada saat yang sama ketika pertandingan diputar ulang. Ikut tersimpan di berkas
// rekaman (Simpan / Muat). Browser meminta izin mikrofon saat pertama kali dipakai.

export class Pengarah {
  constructor({ rekam, rules, logFn }) {
    Object.assign(this, { rekam, rules, logFn });
    this.rec = null;
    this.audio = null;          // pemutar saat putar ulang: { seg, el }
    if (!rekam.suara) rekam.suara = [];
  }

  get aktif() { return !!this.rec; }

  async toggle() {
    if (this.rec) { this.berhenti(); return false; }
    await this.mulai();
    return true;
  }

  async mulai() {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) { this.logFn('Rekam suara tidak didukung browser ini', 'bad'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { this.logFn(`Mikrofon tidak bisa dipakai (${e.message})`, 'bad'); return; }
    const rec = new MediaRecorder(stream), potong = [], t0 = this.rules.simT;
    rec.ondataavailable = (e) => { if (e.data.size) potong.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(potong, { type: rec.mimeType || 'audio/webm' });
      const data = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
      this.rekam.suara.push({ t0, t1: this.rules.simT, data });
      this.logFn(`Komentar pengarah tersimpan (${(this.rules.simT - t0).toFixed(0)} s, ikut rekaman)`, 'ok');
    };
    rec.start(250);
    this.rec = rec;
    this.logFn('🎙 Merekam komentar pengarah — tekan J lagi untuk berhenti', 'info');
  }

  berhenti() {
    if (!this.rec) return;
    const r = this.rec;
    this.rec = null;
    if (r.state !== 'inactive') r.stop();
  }

  // dipanggil saat putar ulang: putar segmen yang mencakup waktu rekaman P.t, hentikan bila dijeda / di luar segmen
  putar(P) {
    const seg = P && !P.paused ? this.rekam.suara.find((s) => P.t >= s.t0 && P.t < s.t1) : null;
    if (this.audio && this.audio.seg !== seg) { this.audio.el.pause(); this.audio = null; }
    if (!seg || this.audio) {
      if (this.audio) this.audio.el.playbackRate = P.speed || 1;
      return;
    }
    const el = new Audio(seg.data);
    el.currentTime = Math.max(0, P.t - seg.t0);
    el.playbackRate = P.speed || 1;
    el.play().catch(() => {});
    this.audio = { seg, el };
  }

  stopPutar() { if (this.audio) { this.audio.el.pause(); this.audio = null; } }
}
