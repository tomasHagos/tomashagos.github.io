/*
 * Weather + holiday effects.
 *
 * Reads its settings from data.js (PORTFOLIO.EFFECTS) and draws on top of the
 * map that app.js builds (window.PortfolioMap). Nothing in app.js depends on
 * this file, so deleting the <script> tag turns all of it off.
 *
 *   Weather   live conditions from Open-Meteo for the configured city; if that
 *             fails, a seasonal "weather of the day" seeded by the date.
 *   Holidays  date ranges in data.js; each one has a decorate function below.
 *   Preview   ?weather=snow&holiday=christmas  (see data.js for the options)
 */
(() => {
const M = window.PortfolioMap;
const CFG = (window.PORTFOLIO && window.PORTFOLIO.EFFECTS) || {};
if (!M) return;
const { el, svg } = M;
const params = new URLSearchParams(location.search);
const today = new Date();

/* ---------------- holiday ---------------- */
const monthDay = d => (d.getMonth() + 1) * 100 + d.getDate();
const parseMD = s => { const [m, d] = s.split('-').map(Number); return m * 100 + d; };
function activeHoliday(){
  const list = CFG.holidays || [];
  const forced = params.get('holiday');
  if (forced) return forced === 'none' ? null : list.find(h => h.id === forced) || null;
  const t = monthDay(today);
  return list.find(h => {
    const f = parseMD(h.from), to = parseMD(h.to);
    return f <= to ? t >= f && t <= to : t >= f || t <= to;   // ranges may wrap past New Year
  }) || null;
}
const holiday = activeHoliday();

/* ---------------- weather ---------------- */
const KINDS = {
  clear:  { icon: '☀️', label: 'Clear' },
  cloudy: { icon: '☁️', label: 'Cloudy' },
  rain:   { icon: '🌧️', label: 'Rain' },
  storm:  { icon: '⛈️', label: 'Thunderstorm' },
  snow:   { icon: '❄️', label: 'Snow' },
  fog:    { icon: '🌫️', label: 'Fog' },
};
// WMO weather codes -> our kinds
function fromWMO(code){
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  return 'cloudy';
}
function seeded(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// Same pick for every visitor on a given day, weighted by a Winnipeg-ish season.
function weatherOfTheDay(){
  const m = today.getMonth() + 1;
  const table =
    m === 12 || m <= 2 ? [['snow', 45], ['clear', 30], ['cloudy', 20], ['fog', 5]] :
    m === 3 || m === 11 ? [['snow', 25], ['rain', 15], ['cloudy', 30], ['clear', 25], ['fog', 5]] :
    m >= 6 && m <= 8 ? [['clear', 50], ['rain', 20], ['storm', 15], ['cloudy', 15]] :
                        [['clear', 35], ['rain', 30], ['cloudy', 25], ['fog', 10]];
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = seeded(today.getFullYear() * 10000 + m * 100 + today.getDate())() * total;
  for (const [k, w] of table){ if ((r -= w) < 0) return k; }
  return 'clear';
}
async function liveWeather(){
  const w = CFG.weather; if (!w) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}&current=temperature_2m,weather_code,is_day`;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 3500);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return null;
    const c = (await res.json()).current;
    if (!c || typeof c.weather_code !== 'number') return null;
    return { kind: fromWMO(c.weather_code), temp: Math.round(c.temperature_2m), night: c.is_day === 0 };
  } catch (e) { return null; } finally { clearTimeout(timer); }
}

/* ---------------- status pill ---------------- */
const pill = document.createElement('div');
pill.className = 'wx-pill';
pill.setAttribute('role', 'status');
const controls = document.querySelector('.controls');
if (controls) controls.insertBefore(pill, controls.firstChild);
function renderPill(kind, live){
  const k = KINDS[kind];
  const icon = kind === 'clear' && live && live.night ? '🌙' : k.icon;
  const city = CFG.weather && CFG.weather.city;
  const wx = live ? `${icon} ${k.label}, ${live.temp}°C in ${city}` : `${icon} ${k.label} today`;
  pill.innerHTML = `${holidayHTML()}<span>${wx}</span>`;
  pill.title = live ? `Live weather in ${city} (Open-Meteo)` : 'Weather of the day';
}
const holidayHTML = () => holiday && holiday.label ? `<span class="wx-hol">${holidayIcon(holiday.id)}<b> ${holiday.label}</b></span>` : '';
const holidayIcon = id => ({ christmas: '🎄', halloween: '🎃', canada: '🍁' }[id] || '🎉');

/* ---------------- particles (screen-space canvas) ---------------- */
const canvas = document.createElement('canvas');
canvas.id = 'wx';
canvas.setAttribute('aria-hidden', 'true');
svg.after(canvas);
const ctx = canvas.getContext('2d');
let cw = 0, ch = 0, dpr = 1, kind = null, parts = [], blobs = [], flash = 0, t = 0;
function resize(){
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = innerWidth; ch = innerHeight;
  canvas.width = cw * dpr; canvas.height = ch * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seedParticles();
}
const R = (a, b) => a + Math.random() * (b - a);
function seedParticles(){
  parts = []; blobs = [];
  const area = cw * ch;
  if (kind === 'snow') for (let i = 0; i < area / 7000; i++) parts.push({ x: R(0, cw), y: R(0, ch), r: R(1, 3.2), vy: R(25, 60), sway: R(10, 30), p: R(0, 6.28), w: R(.6, 1.6) });
  if (kind === 'rain' || kind === 'storm') for (let i = 0; i < area / (kind === 'storm' ? 2600 : 4200); i++) parts.push({ x: R(-100, cw), y: R(0, ch), len: R(10, 22), vy: R(650, 950) });
  if (kind === 'fog') for (let i = 0; i < 7; i++) blobs.push({ x: R(0, cw), y: R(0, ch), r: R(.35, .6) * Math.max(cw, ch), v: R(6, 16) });
}
const TINT = { cloudy: 'rgba(40,52,64,.07)', rain: 'rgba(25,40,70,.13)', storm: 'rgba(20,28,55,.22)', snow: 'rgba(255,255,255,.05)', fog: 'rgba(236,240,244,.12)' };
function draw(dt){
  if (!kind) return;
  if (M.reduceMotion) dt = 0;
  t += dt;
  ctx.clearRect(0, 0, cw, ch);
  if (TINT[kind]){ ctx.fillStyle = TINT[kind]; ctx.fillRect(0, 0, cw, ch); }
  if (kind === 'snow'){
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    for (const f of parts){
      f.y += f.vy * dt; f.x += Math.sin(t * f.w + f.p) * f.sway * dt + 8 * dt;
      if (f.y > ch + 5){ f.y = -5; f.x = R(0, cw); }
      if (f.x > cw + 5) f.x = -5;
      ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  if (kind === 'rain' || kind === 'storm'){
    const slant = .18;
    ctx.strokeStyle = 'rgba(214,228,246,.5)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const d of parts){
      d.y += d.vy * dt; d.x += d.vy * slant * dt;
      if (d.y > ch + 20){ d.y = R(-40, 0); d.x = R(-100, cw); }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * slant, d.y - d.len);
    }
    ctx.stroke();
  }
  if (kind === 'storm'){
    if (dt && Math.random() < dt * .12) flash = 1;
    if (flash > .01){ ctx.fillStyle = `rgba(255,255,255,${(flash * .5).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); flash *= Math.exp(-dt * 7); }
  }
  if (kind === 'fog'){
    for (const b of blobs){
      b.x += b.v * dt; if (b.x - b.r > cw) b.x = -b.r;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, 'rgba(240,244,248,.3)'); g.addColorStop(1, 'rgba(240,244,248,0)');
      ctx.fillStyle = g; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
  }
}
M.onFrame(draw);
addEventListener('resize', resize);

function applyWeather(k, live){
  kind = KINDS[k] ? k : 'clear';
  // White ground for snow, and always for Christmas (white Christmas).
  svg.classList.toggle('snowy', kind === 'snow' || (holiday && holiday.id === 'christmas'));
  // Darker drifting cloud shadows when it's grey out.
  const stop = document.querySelector('#cloud stop');
  if (stop) stop.setAttribute('stop-opacity', { cloudy: .26, rain: .3, storm: .36, snow: .2, fog: .1 }[kind] || .16);
  resize();
  renderPill(kind, live);
}

/* ---------------- holiday decorations ---------------- */
const NSG = attrs => el('g', attrs || {});
function layerAfter(ref){ const g = NSG({ 'pointer-events': 'none', class: 'holiday' }); ref.after(g); return g; }
const decoLayer = () => layerAfter(M.layers.deco);
const landLayer = () => layerAfter(M.layers.landmarks);

// A string of bulbs around a rectangle. Every other bulb twinkles out of phase.
function lights(g, r, gap, colors, inset = 0){
  const x = r.x + inset, y = r.y + inset, w = r.w - inset * 2, h = r.h - inset * 2;
  const per = 2 * (w + h), n = Math.max(4, Math.round(per / gap));
  el('rect', { x, y, width: w, height: h, rx: 2, fill: 'none', stroke: 'rgba(25,25,25,.35)', 'stroke-width': .9 }, g);
  for (let k = 0; k < n; k++){
    let d = k * per / n, px, py;
    if (d < w){ px = x + d; py = y; }
    else if ((d -= w) < h){ px = x + w; py = y + d; }
    else if ((d -= h) < w){ px = x + w - d; py = y + h; }
    else { d -= w; px = x; py = y + h - d; }
    el('circle', { cx: px, cy: py, r: 2.7, fill: colors[k % colors.length], class: `lt ${k % 2 ? 'lt-b' : 'lt-a'}` }, g);
  }
}
const landmarkRects = () => Object.values(M.landmarks);

function wreath(g, x, y){
  el('circle', { cx: x, cy: y, r: 10, fill: 'none', stroke: '#1f6b3a', 'stroke-width': 6 }, g);
  el('circle', { cx: x, cy: y, r: 10, fill: 'none', stroke: '#3a9a5a', 'stroke-width': 2, 'stroke-dasharray': '3 4' }, g);
  el('path', { d: `M${x - 6},${y + 12} l6,-4 l6,4 l-6,-1 Z`, fill: '#d62828' }, g);
}

function bigTree(g, cx, cy){
  el('ellipse', { cx: cx + 14, cy: cy + 16, rx: 56, ry: 52, fill: 'rgba(0,0,0,.2)' }, g);
  const star = (r, rot, n = 8) => {
    let d = '';
    for (let k = 0; k < n * 2; k++){
      const a = rot + k * Math.PI / n, rr = k % 2 ? r * .72 : r;
      d += (k ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1);
    }
    return d + 'Z';
  };
  [[62, 0, '#1f6b3a'], [48, .2, '#2a7d45'], [34, 0, '#35914f'], [20, .2, '#43a35c']].forEach(([r, rot, c]) =>
    el('path', { d: star(r, rot), fill: c, stroke: 'rgba(0,0,0,.12)', 'stroke-width': 1.5 }, g));
  // snow dusting + ornaments
  for (let k = 0; k < 10; k++){ const a = k * .63, rr = 30 + (k % 3) * 9; el('circle', { cx: cx + Math.cos(a) * rr, cy: cy + Math.sin(a) * rr - 2, r: 3.5, fill: '#fbfdff', opacity: .8 }, g); }
  const orn = ['#d62828', '#f2c14e', '#3a86ff', '#ff70a6', '#ffffff'];
  for (let k = 0; k < 22; k++){
    const a = k * 2.4, rr = 12 + (k * 7) % 46;
    el('circle', { cx: cx + Math.cos(a) * rr, cy: cy + Math.sin(a) * rr, r: 3.6, fill: orn[k % orn.length], stroke: 'rgba(0,0,0,.25)', 'stroke-width': .8, class: `lt ${k % 2 ? 'lt-b' : 'lt-a'}` }, g);
  }
  // gold star on top
  let s = '';
  for (let k = 0; k < 10; k++){ const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 5.5 : 13; s += (k ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1); }
  el('path', { d: s + 'Z', fill: '#ffd23f', stroke: '#b8860b', 'stroke-width': 1.5 }, g);
  // presents
  [[-64, 44, '#d62828'], [-42, 62, '#3a86ff'], [52, 54, '#f2c14e'], [66, 30, '#2a9d8f']].forEach(([dx, dy, c]) => {
    const x = cx + dx, y = cy + dy;
    el('rect', { x: x - 9 + 3, y: y - 9 + 4, width: 18, height: 18, fill: 'rgba(0,0,0,.22)' }, g);
    el('rect', { x: x - 9, y: y - 9, width: 18, height: 18, rx: 2, fill: c }, g);
    el('path', { d: `M${x},${y - 9} V${y + 9} M${x - 9},${y} H${x + 9}`, stroke: '#fff', 'stroke-width': 3 }, g);
  });
}

function santaHat(){
  const b = M.riderBody;
  el('ellipse', { cx: 5, cy: 0, rx: 8.6, ry: 7.6, fill: '#d62828', stroke: '#fbfdff', 'stroke-width': 2.6, class: 'holiday-hat' }, b);
  el('path', { d: 'M2,1 Q-6,3 -11,8', fill: 'none', stroke: '#d62828', 'stroke-width': 5, 'stroke-linecap': 'round', class: 'holiday-hat' }, b);
  el('circle', { cx: -12, cy: 9, r: 3.4, fill: '#fbfdff', class: 'holiday-hat' }, b);
}

function pumpkin(g, x, y, r){
  el('ellipse', { cx: x + 2, cy: y + 3, rx: r, ry: r * .85, fill: 'rgba(0,0,0,.22)' }, g);
  el('ellipse', { cx: x, cy: y, rx: r, ry: r * .85, fill: '#f77f00', stroke: '#c75e00', 'stroke-width': 1.2 }, g);
  el('path', { d: `M${x - r * .45},${y - r * .7} Q${x - r * .6},${y} ${x - r * .45},${y + r * .7} M${x + r * .45},${y - r * .7} Q${x + r * .6},${y} ${x + r * .45},${y + r * .7}`, fill: 'none', stroke: '#c75e00', 'stroke-width': 1 }, g);
  el('rect', { x: x - 1.5, y: y - 2, width: 3, height: 4, fill: '#3a5a1a' }, g);
}

function flag(g, x, y){
  el('rect', { x: x + 3, y: y + 4, width: 34, height: 18, fill: 'rgba(0,0,0,.2)' }, g);
  el('rect', { x, y, width: 34, height: 18, fill: '#fff', stroke: 'rgba(0,0,0,.2)' }, g);
  el('rect', { x, y, width: 8.5, height: 18, fill: '#d52b1e' }, g);
  el('rect', { x: x + 25.5, y, width: 8.5, height: 18, fill: '#d52b1e' }, g);
  el('path', { d: `M${x + 17},${y + 3} l2,4 l3,-1 l-1,4 l2,1 l-4,3 v2 h-4 v-2 l-4,-3 l2,-1 l-1,-4 l3,1 Z`, fill: '#d52b1e' }, g);
  el('circle', { cx: x, cy: y, r: 2.5, fill: '#555' }, g);
}

const DECORATE = {
  christmas(){
    const d = decoLayer(), l = landLayer();
    const bulbs = ['#ff4d4d', '#ffd23f', '#3ddc84', '#4da3ff'];
    M.houses.forEach((h, i) => { if (i % 3 !== 2) lights(d, h, 13, bulbs, 1); });
    landmarkRects().forEach(r => { lights(l, r, 18, bulbs, 2); wreath(l, r.x + r.w - 20, r.y + r.h - 22); });
    // Town Christmas tree in the riverside park, clearing the trees around it.
    const cx = 1585, cy = 878;
    M.trees.forEach(tr => { if (Math.hypot(tr.x - cx, tr.y - cy) < 95) tr.g.remove(); });
    bigTree(d, cx, cy);
    santaHat();
  },
  halloween(){
    const d = decoLayer(), l = landLayer();
    M.houses.forEach((h, i) => { if (i % 2 === 0) pumpkin(d, h.x + h.w + 9, h.y + h.h - 6, 6.5); });
    landmarkRects().forEach(r => lights(l, r, 18, ['#ff8c1a', '#9b5de5'], 2));
  },
  canada(){
    const l = landLayer();
    landmarkRects().forEach(r => { lights(l, r, 18, ['#ff3b30', '#ffffff'], 2); flag(l, r.x + 12, r.y + 12); });
  },
};
if (holiday && DECORATE[holiday.id]) DECORATE[holiday.id]();

/* ---------------- go ---------------- */
const forced = params.get('weather');
if (forced && KINDS[forced]) applyWeather(forced, null);
else {
  applyWeather(null, null);             // no particles until we know
  pill.innerHTML = holidayHTML() || '…';
  liveWeather().then(live => live ? applyWeather(live.kind, live) : applyWeather(weatherOfTheDay(), null));
}
})();
