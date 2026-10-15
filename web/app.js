//config 
const PROFILES = {
  video: { n: 'Video Streaming', m: { tp: [3.5, 2.45, 'hi', .5], loss: [1, 3, 'lo', .25], rtt: [150, 250, 'lo', .25] } },
  call: { n: 'Voice / Video Call', m: { rtt: [150, 250, 'lo', .4], jit: [30, 50, 'lo', .3], loss: [1, 3, 'lo', .3] } },
  game: { n: 'Online Gaming', m: { rtt: [80, 150, 'lo', .4], jit: [20, 50, 'lo', .3], loss: [1, 3, 'lo', .3] } },
  file: { n: 'File Transfer', m: { tp: [8, 4, 'hi', .6], loss: [1, 3, 'lo', .2], rtt: [150, 250, 'lo', .2] } }
};
const TYPES = { local: 'Local Test', net: 'Internet Test', mob: 'Mobility Test (A→B)' };
const LBL = { rtt: 'RTT', jit: 'Jitter', loss: 'Packet Loss', tp: 'Throughput' }, UNIT = { rtt: 'ms', jit: 'ms', loss: '%', tp: 'Mbps' };
const REC = {
  rtt: 'ค่าหน่วงสูง ลองใช้เครือข่ายที่ใกล้ AP/เสามากขึ้น หรือเปลี่ยนไปใช้ 5G/Wi-Fi 5 GHz',
  jit: 'Jitter สูง ทำให้เสียง/ภาพกระตุก ลดจำนวนอุปกรณ์ที่ใช้เครือข่ายร่วมกันหรือเปลี่ยนช่องสัญญาณ',
  loss: 'มี packet loss ตรวจสอบสัญญาณ (RSSI) และสัญญาณรบกวน หรือสลับไปเครือข่ายอื่น',
  tp: 'แบนด์วิดท์ไม่พอ ปิดแอปที่ใช้เน็ตพื้นหลัง หรือย้ายไปจุดที่สัญญาณดีกว่า'
};
let prof = 'video', type = 'net', S = null, timer = null;
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// UI
function chips(el, obj, get, set) {
  el.innerHTML = ''; Object.keys(obj).forEach(k => {
    const b = document.createElement('button'); b.className = 'opt' + (get() === k ? ' on' : '');
    b.textContent = typeof obj[k] === 'string' ? obj[k] : obj[k].n; b.onclick = () => { if (S) return; set(k); render() }; el.appendChild(b)
  })
}
function render() { chips($('apps'), PROFILES, () => prof, k => prof = k); chips($('types'), TYPES, () => type, k => type = k) }
render();
$('btn').onclick = () => S ? stop() : start();

//  scoring
function metricScore(v, [g, f, d]) { 
  if (d === 'lo') { if (v <= g) return 100 - 30 * v / g; if (v <= f) return 70 - 20 * (v - g) / (f - g); return Math.max(5, 50 - 50 * (v - f) / f) }
  if (v >= g) return Math.min(100, 70 + 30 * (v - g) / g); if (v >= f) return 50 + 20 * (v - f) / (g - f); return Math.max(5, 50 * v / f)
}
function rate(s) { return s >= 70 ? 'good' : s >= 50 ? 'fair' : 'poor' }
function qoe(m, p) {
  let sum = 0, w = 0, worst = null;
  for (const k in PROFILES[p].m) {
    const v = m[k]; if (v == null) continue; const c = PROFILES[p].m[k], s = metricScore(v, c); sum += s * c[3]; w += c[3];
    if (!worst || s < worst.s) worst = { k, s, v }
  }
  return { score: w ? Math.round(sum / w) : null, worst }
}

// measurement 
async function probe() {
  const t = performance.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), 2000);
  try {
    await (await fetch('/ping?_p=' + Date.now(), { cache: 'no-store', signal: ac.signal })).text();
    clearTimeout(to); return performance.now() - t
  } catch (e) { clearTimeout(to); return null }
}
function simSample() {
  const z = S.zone();
  S.simRtt = Math.max(15, (S.simRtt || 50) * .6 + z.rtt * .4 + (Math.random() - .5) * 14);
  return { rtt: S.simRtt, lost: Math.random() * 100 < z.loss, tp: Math.max(.3, z.tp + (Math.random() - .5) * 1.2) }
}
function zoneFn() {
  const t0 = Date.now(); return () => {
    const s = (Date.now() - t0) / 1000 % 40;
    return s < 12 ? { rtt: 45, loss: .3, tp: 5 } : s < 22 ? { rtt: 95, loss: 1.5, tp: 3.2 } : s < 30 ? { rtt: 190, loss: 6, tp: 1.4 } : { rtt: 60, loss: .6, tp: 4.6 }
  }
}

async function bgTp() {
  const s = S; if (!s || s.tpBusy) return; s.tpBusy = true; 
  try {
    const t = performance.now(), r = await fetch('/download?size=600000&_p=' + Date.now(), { cache: 'no-store' });
    const b = await r.arrayBuffer(), sec = (performance.now() - t) / 1000; s.tp = b.byteLength * 8 / 1e6 / sec
  } catch (e) { }
  s.tpBusy = false
}
async function tick() {
  if (!S) return;
  let r = null, lost = false, tp = null;
  if (!S.sim) {
    const v = await probe(); if (!S) return;
    if (v == null) { S.fails++; lost = true; if (!S.ok && S.fails >= 3) { S.sim = true; S.win = []; $('simBanner').style.display = 'block' } }
    else { S.ok = true; r = v }
    if (S.n % 4 === 0) bgTp(); S.n++; tp = S.tp ?? null
  } 
  if (S.sim) { const x = simSample(); r = x.rtt; lost = x.lost; tp = x.tp }
  if (!S) return;
  S.win.push({ r, lost }); if (S.win.length > 20) S.win.shift();
  const rs = S.win.filter(x => x.r != null).map(x => x.r);
  let jit = 0; if (rs.length > 1) { let d = 0; for (let i = 1; i < rs.length; i++)d += Math.abs(rs[i] - rs[i - 1]); jit = d / (rs.length - 1) }
  const m = { rtt: rs.length ? rs[rs.length - 1] : null, jit, loss: S.win.filter(x => x.lost).length / S.win.length * 100, tp };
  const q = qoe(m, prof);
  const smp = { t: (Date.now() - S.t0) / 1000, m, score: q.score, pos: S.pos.length ? S.pos[S.pos.length - 1] : null };
  S.samples.push(smp); detect(smp); paint(smp); if (!S.sim) sendLive(smp)
}

function ev(text, cls) {
  S.events.push({ t: (Date.now() - S.t0) / 1000, text });
  const li = document.createElement('li'); li.textContent = `${fmt((Date.now() - S.t0) / 1000)} — ${text}`; $('ev').prepend(li)
}
const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function detect(x) {
  if (!S.ok && !S.sim) return; 
  const c = PROFILES[prof].m, m = x.m, now = x.t;
  for (const k of ['rtt', 'jit', 'loss']) {
    if (!c[k] || m[k] == null) continue;
    const bad = m[k] > c[k][1];
    if (bad && !S.flag[k] && now - (S.last[k] || -99) > 6) { ev(`${LBL[k]} เกินเกณฑ์: ${m[k].toFixed(1)} ${UNIT[k]}`); S.last[k] = now }
    S.flag[k] = bad
  }
  if (x.score != null && S.prev != null && S.prev >= 50 && x.score < 50) ev(`QoE ตกเป็น Poor (${x.score})`);
  S.prev = x.score
}

//painting
function paint(x) {
  const m = x.m, c = PROFILES[prof].m;
  const set = (id, k, val, d) => {
    const e = $(id); if (val == null) { e.textContent = '—'; e.className = ''; return }
    e.textContent = val.toFixed(d); e.className = c[k] ? rate(metricScore(val, c[k])) : ''
  };
  set('mRtt', 'rtt', m.rtt, 0); set('mJit', 'jit', m.jit, 1); set('mLoss', 'loss', m.loss, 1); set('mTp', 'tp', m.tp, 1);
  if (x.score != null) {
    const r = rate(x.score); $('sc').textContent = x.score; $('rt').textContent = { good: 'GOOD', fair: 'FAIR', poor: 'POOR' }[r];
    $('arc').setAttribute('stroke', 'var(--' + r + ')'); $('arc').setAttribute('stroke-dashoffset', 157.1 * (1 - x.score / 100))
  }
  const cn = navigator.connection; $('net').textContent = cn ? `ประเภทเครือข่าย: ${cn.effectiveType || '-'} · downlink ${cn.downlink ?? '-'} Mbps` : '';
  drawChart(); if (type === 'mob') drawMap(); insights(m)
}

function setup(cv) { const d = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; cv.width = w * d; cv.height = h * d; const g = cv.getContext('2d'); g.scale(d, d); g.clearRect(0, 0, w, h); return [g, w, h] }
function drawChart() {
  const [g, w, h] = setup($('chart')), d = S.samples.filter(s => s.m.rtt != null).slice(-60); if (d.length < 2) return;
  const mx = Math.max(100, ...d.map(s => s.m.rtt)) * 1.1, c = PROFILES[prof].m.rtt || [150, 250];
  g.strokeStyle = css('--bd'); g.fillStyle = css('--mut'); g.font = '10px sans-serif';
  [c[0], c[1]].forEach((v, i) => { const y = h - 14 - (v / mx) * (h - 20); g.strokeStyle = i ? css('--poor') : css('--fair'); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() });
  g.setLineDash([]); g.strokeStyle = css('--pri'); g.lineWidth = 2; g.beginPath();
  d.forEach((s, i) => { const x = i / (d.length - 1) * w, y = h - 14 - (s.m.rtt / mx) * (h - 20); i ? g.lineTo(x, y) : g.moveTo(x, y) }); g.stroke();
  g.fillText('0', 2, h - 2); g.fillText(mx.toFixed(0) + ' ms', 2, 10)
}
function drawMap() {
  const [g, w, h] = setup($('map')), p = S.samples.filter(s => s.pos); if (p.length < 1) return;
  const la = p.map(s => s.pos.la), lo = p.map(s => s.pos.lo), a = Math.min(...la), b = Math.max(...la), c = Math.min(...lo), d = Math.max(...lo);
  const sp = Math.max(b - a, d - c, 1e-5), X = v => 12 + (v - c) / sp * (w - 24), Y = v => h - 12 - (v - a) / sp * (h - 24);
  g.lineWidth = 4; g.lineCap = 'round';
  for (let i = 1; i < p.length; i++) { g.strokeStyle = css('--' + (p[i].score == null ? 'mut' : rate(p[i].score))); g.beginPath(); g.moveTo(X(p[i - 1].pos.lo), Y(p[i - 1].pos.la)); g.lineTo(X(p[i].pos.lo), Y(p[i].pos.la)); g.stroke() }
  const pt = (s, t) => { g.fillStyle = css('--pri'); g.beginPath(); g.arc(X(s.pos.lo), Y(s.pos.la), 7, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText(t, X(s.pos.lo), Y(s.pos.la) + 3) };
  pt(p[0], 'A'); if (p.length > 1) pt(p[p.length - 1], 'B')
}

//mobility 
function startGeo() {
  const note = $('gpsNote');
  const simPath = () => {
    S.simGeo = true; note.textContent = 'ใช้เส้นทางจำลอง (ไม่ได้รับสิทธิ์ GPS)'; let la = 13.7, lo = 100.5, ang = 0;
    S.geoTimer = setInterval(() => { ang += (Math.random() - .4) * .5; la += Math.sin(ang) * .00006; lo += Math.cos(ang) * .00006; S.pos.push({ la, lo }) }, 1000)
  };
  if (!navigator.geolocation) return simPath();
  note.textContent = 'กำลังขอตำแหน่ง GPS…';
  try {
    S.geo = navigator.geolocation.watchPosition(p => { note.textContent = 'กำลังติดตามตำแหน่งจริงด้วย GPS'; S.pos.push({ la: p.coords.latitude, lo: p.coords.longitude }) },
      () => { if (S && !S.pos.length && !S.simGeo) simPath() }, { enableHighAccuracy: true, timeout: 8000 })
  } catch (e) { simPath() }
}

//lifecycle 
function start() {
  S = { t0: Date.now(), samples: [], events: [], pos: [], win: [], flag: {}, last: {}, fails: 0, ok: false, sim: false, zone: zoneFn(), prev: null, n: 0, tp: null, v: { buf: 0, play: false, stalls: 0, stallT: 0, startup: null, last: Date.now() } };
  $('simBanner').style.display = 'none'; $('ev').innerHTML = ''; $('result').classList.add('hide'); $('live').classList.remove('hide');
  $('mapCard').classList.toggle('hide', type !== 'mob');
  $('prof').textContent = `${PROFILES[prof].n} · ${TYPES[type]}`;
  $('btn').textContent = 'หยุดทดสอบและดูผล'; $('btn').classList.add('stop'); render();
  ['online', 'offline'].forEach(n => addEventListener(n, S.onNet = () => { if (S) ev(navigator.onLine ? 'กลับมาออนไลน์' : 'ขาดการเชื่อมต่อ') }));
  if (navigator.connection) { S.lastType = navigator.connection.effectiveType; S.cnf = () => { if (S && navigator.connection.effectiveType !== S.lastType) { ev(`เครือข่ายเปลี่ยน ${S.lastType} → ${navigator.connection.effectiveType}`); S.lastType = navigator.connection.effectiveType } }; navigator.connection.addEventListener('change', S.cnf) }
  if (type === 'mob') startGeo();
  ev('เริ่มการทดสอบ'); tick(); timer = setInterval(tick, 1000)
}

function stop() {
  clearInterval(timer); const s = S;
  if (s.geo != null) navigator.geolocation.clearWatch(s.geo); clearInterval(s.geoTimer);
  removeEventListener('online', s.onNet); removeEventListener('offline', s.onNet);
  if (s.cnf && navigator.connection) navigator.connection.removeEventListener('change', s.cnf);
  const d = s.samples; if (d.length < 3) { S = null; $('btn').textContent = 'เริ่มทดสอบ'; $('btn').classList.remove('stop'); render(); return }
  const avg = k => { const v = d.map(x => x.m[k]).filter(v => v != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
  const am = { rtt: avg('rtt'), jit: avg('jit'), loss: avg('loss'), tp: avg('tp') }, q = qoe(am, prof), r = rate(q.score);
  $('rTag').textContent = { good: 'GOOD', fair: 'FAIR', poor: 'POOR' }[r]; $('rTag').className = 'tag ' + r; $('rScore').textContent = `(${q.score}/100)`;
  const w = q.worst;
  $('rMain').textContent = r === 'good' ? `คุณภาพโดยรวมดี เหมาะกับ ${PROFILES[prof].n}` : `${LBL[w.k]} ไม่ผ่านเกณฑ์สำหรับ ${PROFILES[prof].n} (เฉลี่ย ${w.v.toFixed(1)} ${UNIT[w.k]})`;
  const evi = $('rEvi'); evi.innerHTML = '';
  const mx = (k) => Math.max(...d.map(x => x.m[k] || 0));
  [`RTT เฉลี่ย ${am.rtt?.toFixed(0) ?? '-'} ms (สูงสุด ${mx('rtt').toFixed(0)} ms)`, `Jitter เฉลี่ย ${am.jit.toFixed(1)} ms`, `Packet Loss เฉลี่ย ${am.loss.toFixed(1)}% (สูงสุด ${mx('loss').toFixed(1)}%)`,
  am.tp != null ? `Throughput เฉลี่ย ${am.tp.toFixed(1)} Mbps` : null, `เหตุการณ์ผิดปกติ ${s.events.length - 1} ครั้ง`].filter(Boolean).forEach(t => { const li = document.createElement('li'); li.textContent = t; evi.appendChild(li) });
  $('rRec').textContent = r === 'good' ? 'ใช้งานต่อได้ตามปกติ' : REC[w.k];
  const z = $('zones'); z.innerHTML = '';
  if (type === 'mob' && d.length >= 8) {
    const n = 4, sz = Math.floor(d.length / n); let h = '<p><b>สรุปตามช่วงเส้นทาง</b></p><table><tr><th>ช่วง</th><th>RTT</th><th>Loss %</th><th>QoE</th></tr>';
    for (let i = 0; i < n; i++) {
      const seg = d.slice(i * sz, i === n - 1 ? undefined : (i + 1) * sz), a = k => { const v = seg.map(x => x.m[k]).filter(v => v != null); return v.reduce((p, c) => p + c, 0) / v.length }, sc = Math.round(seg.map(x => x.score).filter(v => v != null).reduce((p, c) => p + c, 0) / seg.length);
      h += `<tr><td>Zone ${i + 1}</td><td>${a('rtt').toFixed(0)}</td><td>${a('loss').toFixed(1)}</td><td class="${rate(sc)}">${sc}</td></tr>`
    }
    z.innerHTML = h + '</table>'
  }
  s.report = { name: cname(), profile: prof, test: type, simulated: s.sim, durationSec: Math.round(d[d.length - 1].t), avg: am, qoe: q.score, rating: r, events: s.events };
  window._rep = s.report; fetch('/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s.report) }).catch(() => { }); $('result').classList.remove('hide'); $('result').scrollIntoView({ behavior: 'smooth' });
  S = null; $('btn').textContent = 'เริ่มทดสอบอีกครั้ง'; $('btn').classList.remove('stop'); render()
}

$('copy').onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(window._rep, null, 2)); $('copied').textContent = 'คัดลอกแล้ว' } catch (e) { $('copied').textContent = 'คัดลอกไม่ได้ในหน้านี้' } };

//Insights: MOS + จำลองบัฟเฟอร์วิดีโอ 
function mos(m) {
  if (m.rtt == null) return null;
  const el = m.rtt / 2 + m.jit * 2 + 10;
  let R = el < 160 ? 93.2 - el / 40 : 93.2 - (el - 120) / 10;
  R = Math.max(0, Math.min(100, R - m.loss * 2.5));
  return { R, M: R <= 0 ? 1 : 1 + 0.035 * R + 7e-6 * R * (R - 60) * (100 - R) }
}
function insights(m) {
  const q = mos(m);
  if (q) { $('mMos').textContent = q.M.toFixed(2) + ' / 4.5'; $('mMos').className = q.M >= 4 ? 'good' : q.M >= 3.1 ? 'fair' : 'poor'; $('mR').textContent = 'R-factor ' + q.R.toFixed(0) }
  const v = S.v, now = Date.now(), dt = Math.min(2, (now - v.last) / 1000); v.last = now;
  if (m.tp != null) {
    v.buf = Math.min(30, v.buf + dt * m.tp / 3.5);
    if (v.play) { v.buf -= dt; if (v.buf <= 0) { v.buf = 0; v.play = false; v.stalls++ } }
    else if (v.buf >= 2) { v.play = true; if (v.startup == null) v.startup = (now - S.t0) / 1000 }
    if (!v.play && v.startup != null) v.stallT += dt
  }
  $('vState').textContent = m.tp == null ? 'รอข้อมูลความเร็ว' : v.play ? 'กำลังเล่น' : 'กำลังบัฟเฟอร์…';
  $('vBar').style.width = (v.buf / 30 * 100) + '%';
  $('vStartup').textContent = v.startup == null ? '…' : v.startup.toFixed(1); $('vStall').textContent = v.stalls; $('vStallT').textContent = v.stallT.toFixed(1)
}

//Bufferbloat Test: เทียบ RTT ตอนว่าง กับตอนโหลดเต็ม 
async function bloat() {
  const out = $('bloatOut'), btn = $('bloatBtn');
  if (S) { out.textContent = 'กดหยุดการทดสอบหลักก่อน'; return }
  btn.disabled = true;
  const med = a => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null };
  const run = async (sec, load) => {
    const r = []; let go = true;
    if (load) for (let i = 0; i < 3; i++)(async () => { while (go) { try { await (await fetch('/download?size=2000000&_p=' + Math.random(), { cache: 'no-store' })).arrayBuffer() } catch (e) { await new Promise(z => setTimeout(z, 300)) } } })();
    const end = Date.now() + sec * 1000;
    while (Date.now() < end) { const v = await probe(); if (v != null) r.push(v); await new Promise(z => setTimeout(z, 250)) }
    go = false; return r
  };
  out.textContent = 'ขั้น 1/2: วัด RTT ตอนเครือข่ายว่าง (5 วินาที)…'; const a = med(await run(5, false));
  out.textContent = 'ขั้น 2/2: วัด RTT ขณะดาวน์โหลดเต็มที่ (8 วินาที)…'; const b = med(await run(8, true));
  btn.disabled = false;
  if (a == null || b == null) { out.textContent = 'วัดไม่ได้ ต้องเปิดผ่านเซิร์ฟเวอร์ (http://localhost:8000)'; return }
  const d = Math.max(0, b - a), g = d < 5 ? 'A+' : d < 30 ? 'A' : d < 60 ? 'B' : d < 200 ? 'C' : d < 400 ? 'D' : 'F';
  out.textContent = `RTT ว่าง ${a.toFixed(0)} ms → ขณะโหลด ${b.toFixed(0)} ms (เพิ่ม ${d.toFixed(0)} ms) เกรด ${g} — ` +
    (d < 30 ? 'ดีมาก ภาระของเครือข่ายแทบไม่ทำให้หน่วงเพิ่ม' : d < 60 ? 'พอรับได้' : 'มี Bufferbloat: ตอนมีคนโหลดไฟล์ ความหน่วงพุ่ง เกมและวิดีโอคอลจะกระตุก แนะนำเปิด QoS/SQM ที่เราเตอร์')
}

//ประวัติ + เปรียบเทียบตามประเภทการทดสอบ
async function hist() {
  const o = $('histOut'); o.innerHTML = '';
  const tb = (rows, head) => {
    const t = document.createElement('table');
    [head].concat(rows).forEach((c, i) => { const r = document.createElement('tr'); c.forEach(x => { const e = document.createElement(i ? 'td' : 'th'); e.textContent = x; r.appendChild(e) }); t.appendChild(r) }); o.appendChild(t)
  };
  try {
    const rows = await (await fetch('/api/results?limit=30')).json();
    if (!rows.length) { o.textContent = 'ยังไม่มีผลทดสอบ'; return }
    const f = x => x == null ? '-' : x.toFixed(1), g = {};
    rows.filter(r => !r.simulated).forEach(r => (g[r.test] = g[r.test] || []).push(r));
    const avg = (a, fn) => { const v = a.map(fn).filter(x => x != null); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null };
    tb(Object.keys(g).map(k => [TYPES[k] || k, g[k].length, f(avg(g[k], r => r.qoe)), f(avg(g[k], r => r.avg.rtt)), f(avg(g[k], r => r.avg.loss))]), ['เปรียบเทียบ (วัดจริง)', 'จำนวนรอบ', 'QoE เฉลี่ย', 'RTT เฉลี่ย (ms)', 'Loss เฉลี่ย (%)']);
    tb(rows.slice(0, 10).map(r => [new Date(r.ts * 1000).toLocaleTimeString(), r.name || r.ip || '-', (PROFILES[r.profile] || {}).n || r.profile, TYPES[r.test] || r.test, r.qoe, f(r.avg.rtt), f(r.avg.loss), r.rating + (r.simulated ? ' (จำลอง)' : '')]), ['เวลา', 'เครื่อง', 'แอป', 'แบบ', 'QoE', 'RTT', 'Loss%', 'ผล'])
  } catch (e) { o.textContent = 'โหลดประวัติไม่ได้ (ต้องเปิดผ่านเซิร์ฟเวอร์)' }
}
$('bloatBtn').onclick = bloat; $('histBtn').onclick = hist;

//Wi-Fi Heatmap
let HEAT_SEC = 10, heatSel = null; const HEAT = {}, cells = {};
(function () {
  const g = $('heatGrid'); for (let r = 0; r < 3; r++)for (let c = 1; c <= 4; c++) {
    const id = 'ABC'[r] + c, b = document.createElement('button');
    b.className = 'cell'; b.textContent = id; b.onclick = () => { heatSel = id; for (const k in cells) cells[k].style.borderColor = k === id ? 'var(--pri)' : '' }; cells[id] = b; g.appendChild(b)
  }
})();
async function heatMeasure() {
  const o = $('heatOut');
  if (S) { o.textContent = 'กดหยุดการทดสอบหลักก่อน'; return }
  if (!heatSel) { o.textContent = 'คลิกเลือกช่องก่อน'; return }
  const id = heatSel, r = []; let lost = 0, n = 0; $('heatBtn').disabled = true;
  const end = Date.now() + HEAT_SEC * 1000;
  while (Date.now() < end) { const v = await probe(); n++; if (v == null) lost++; else r.push(v); o.textContent = `กำลังวัดช่อง ${id}… ${n} ครั้ง`; await new Promise(z => setTimeout(z, 500)) }
  $('heatBtn').disabled = false;
  if (!r.length) { o.textContent = 'วัดไม่ได้ ต้องเปิดผ่านเซิร์ฟเวอร์'; return }
  let j = 0; for (let i = 1; i < r.length; i++)j += Math.abs(r[i] - r[i - 1]);
  const m = { rtt: r.reduce((a, b) => a + b) / r.length, jit: j / Math.max(1, r.length - 1), loss: lost / n * 100, tp: null }, q = qoe(m, prof);
  HEAT[id] = q.score; const b = cells[id]; b.style.background = 'var(--' + rate(q.score) + ')'; b.style.color = '#fff'; b.textContent = `${id}\n${q.score}\n${m.rtt.toFixed(0)} ms`;
  o.textContent = `ช่อง ${id}: QoE ${q.score} (${PROFILES[prof].n}) RTT ${m.rtt.toFixed(0)} ms, Jitter ${m.jit.toFixed(1)} ms, Loss ${m.loss.toFixed(1)}%`
}

//เครื่องมือเครือข่าย
async function upTest() {
  const o = $('toolOut'); o.textContent = 'กำลังอัปโหลด 2 MB…';
  const body = new Uint8Array(2e6), t = performance.now();
  try {
    await fetch('/upload', { method: 'POST', body, cache: 'no-store' }); const s = (performance.now() - t) / 1000;
    o.textContent = `อัปโหลด ${(2e6 * 8 / 1e6 / s).toFixed(1)} Mbps (ส่ง 2 MB ใน ${s.toFixed(2)} วินาที)\n(ถ้าต่ำกว่าดาวน์โหลดมาก แสดงว่าขาอัปโหลดคือคอขวด)`
  } catch (e) { o.textContent = 'อัปโหลดไม่ได้ ต้องเปิดผ่านเซิร์ฟเวอร์' }
}
async function breakdown() {
  const o = $('toolOut'), acc = [0, 0, 0, 0]; let n = 0; o.textContent = 'กำลังวัด 8 ครั้ง…';
  try {
    for (let i = 0; i < 8; i++) {
      performance.clearResourceTimings(); await (await fetch('/ping?_p=' + Math.random(), { cache: 'no-store' })).text();
      const e = performance.getEntriesByType('resource').pop(); if (!e) continue;
      [e.domainLookupEnd - e.domainLookupStart, e.connectEnd - e.connectStart, e.responseStart - e.requestStart, e.responseEnd - e.responseStart].forEach((v, k) => acc[k] += v); n++
    }
  } catch (err) { o.textContent = 'วัดไม่ได้ ต้องเปิดผ่านเซิร์ฟเวอร์'; return }
  if (!n) { o.textContent = 'เบราว์เซอร์นี้ไม่รองรับ Resource Timing'; return }
  const a = acc.map(v => v / n), tot = a.reduce((p, c) => p + c, 0) || 1, N = ['DNS             ', 'เชื่อมต่อ TCP/TLS', 'รอเซิร์ฟเวอร์ตอบ ', 'ดาวน์โหลดคำตอบ  '];
  o.textContent = N.map((t, i) => `${t} ${a[i].toFixed(1).padStart(6)} ms ${'█'.repeat(Math.round(a[i] / tot * 24))}`).join('\n') + '\n(เฉลี่ย 8 ครั้ง; DNS/TCP เป็น 0 เมื่อใช้การเชื่อมต่อเดิมซ้ำ)'
}
async function trace(t) {
  const o = $('toolOut'); o.textContent = 'กำลังทำ traceroute (10-40 วินาที)…';
  try { const r = await (await fetch('/api/traceroute?target=' + t)).json(); o.textContent = r.error ? r.error : `ไปยัง ${r.target}: ${r.hops.length} hop\n` + r.hops.join('\n') } catch (e) { o.textContent = 'ทำไม่ได้ ต้องเปิดผ่านเซิร์ฟเวอร์' }
}
$('heatBtn').onclick = heatMeasure;
$('heatClr').onclick = () => { for (const k in cells) { cells[k].style.background = ''; cells[k].style.color = ''; cells[k].textContent = k; delete HEAT[k] } $('heatOut').textContent = '' };
$('upBtn').onclick = upTest; $('bdBtn').onclick = breakdown; $('trClient').onclick = () => trace('client'); $('trNet').onclick = () => trace('internet'); $('prBtn').onclick = () => window.print();

//หลาย client: ส่งผลสดไปให้ Live Dashboard
const CID = (() => { const rnd = () => Math.random().toString(36).slice(2, 10); try { let v = localStorage.getItem('qoeId'); if (!v) { v = rnd(); localStorage.setItem('qoeId', v) } return v } catch (e) { return rnd() } })();
function cname() { return (($('cname').value || '').trim()) || 'เครื่อง-' + CID.slice(0, 4) }
function sendLive(x) {
  fetch('/api/live', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(
      { id: CID, name: cname(), profile: prof, test: type, rtt: x.m.rtt, jit: x.m.jit, loss: x.m.loss, tp: x.m.tp, qoe: x.score, rating: x.score == null ? null : rate(x.score) })
  }).catch(() => { })
}
