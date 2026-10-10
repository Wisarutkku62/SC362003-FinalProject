const $ = id => document.getElementById(id);
const APP = { video: 'Video', call: 'Voice/Video Call', game: 'Online Gaming', file: 'File Transfer' }, TYP = { local: 'Local', net: 'Internet', mob: 'Mobility' };
const rate = s => s >= 70 ? 'good' : s >= 50 ? 'fair' : 'poor', H = {};   // H = ประวัติ RTT ของแต่ละเครื่อง
const f = (v, d = 0) => v == null ? '-' : v.toFixed(d);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function txt(tag, t, cls, st) { const e = document.createElement(tag); e.textContent = t; if (cls) e.className = cls; if (st) Object.assign(e.style, st); return e }
function box(t, v, cls) { const d = document.createElement('div'); d.className = 'm'; d.append(txt('small', t), txt('b', v, cls)); return d }
function spark(a) {
  const cv = document.createElement('canvas'); cv.style.height = '46px'; const d = devicePixelRatio || 1, w = cv.clientWidth || 260, h = 46;
  cv.width = w * d; cv.height = h * d; const g = cv.getContext('2d'); g.scale(d, d); if (a.length < 2) return cv;
  const mx = Math.max(50, ...a) * 1.1; g.strokeStyle = css('--pri'); g.lineWidth = 2; g.beginPath();
  a.forEach((v, i) => { const x = i / (a.length - 1) * w, y = h - 2 - v / mx * (h - 4); i ? g.lineTo(x, y) : g.moveTo(x, y) }); g.stroke(); return cv
}
async function poll() {
  let rows; try { rows = await (await fetch('/api/live', { cache: 'no-store' })).json() } catch (e) { $('sum').textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'; return }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  const on = rows.filter(r => r.age < 5), q = on.filter(r => r.qoe != null), rt = on.filter(r => r.rtt != null);
  const avg = (a, k) => a.length ? a.reduce((p, c) => p + c[k], 0) / a.length : null, worst = q.slice().sort((a, b) => a.qoe - b.qoe)[0];
  const s = $('sum'); s.innerHTML = '';
  s.append(box('เครื่องที่ออนไลน์', on.length + ' / ' + rows.length), box('QoE เฉลี่ย', f(avg(q, 'qoe')), q.length ? rate(avg(q, 'qoe')) : ''),
    box('RTT เฉลี่ย (ms)', f(avg(rt, 'rtt'))), box('เครื่องที่แย่สุด', worst ? `${worst.name} (${f(worst.qoe)})` : '-', worst ? rate(worst.qoe) : ''));
  const c = $('cards'); c.innerHTML = '';
  rows.forEach(r => {
    if (r.age < 5 && r.rtt != null) { (H[r.id] = H[r.id] || []).push(r.rtt); if (H[r.id].length > 40) H[r.id].shift() }
    const d = document.createElement('div'); d.className = 'card'; d.style.opacity = r.age < 5 ? 1 : .45;
    d.append(txt('h2', r.name + (r.age < 5 ? ' 🟢' : ' ⚪ ออฟไลน์')), txt('small', `${r.ip} · ${APP[r.profile] || r.profile} · ${TYP[r.test] || r.test}`, 'sub'),
      txt('div', r.qoe == null ? '-' : Math.round(r.qoe) + ' ' + (r.rating || '').toUpperCase(), r.qoe == null ? '' : rate(r.qoe), { fontSize: '2rem', fontWeight: 700 }));
    const m = document.createElement('div'); m.className = 'metrics';
    m.append(box('RTT (ms)', f(r.rtt)), box('Jitter (ms)', f(r.jit, 1)), box('Loss (%)', f(r.loss, 1)), box('Throughput (Mbps)', f(r.tp, 1)));
    d.append(m, spark(H[r.id] || [])); c.appendChild(d)
  })
}
setInterval(poll, 1000); poll();
