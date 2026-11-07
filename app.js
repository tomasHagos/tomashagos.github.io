(() => {
const NS = 'http://www.w3.org/2000/svg';
const W = 2400, H = 1700;
const XS = [200, 700, 1200, 1700, 2200];
const YS = [200, 650, 1100, 1500];
const ROAD = 28, CURB = 40;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, attrs = {}, parent){
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = rng(1907);
const pick = a => a[Math.floor(rand() * a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const { STOPS, PROJECTS, SKILLS, EMAIL } = window.PORTFOLIO;
const HOBBIES = window.PORTFOLIO.HOBBIES || [];

/* ---------------- graph ---------------- */
const nodes = [];
YS.forEach((y, j) => XS.forEach((x, i) => nodes.push({ id: j * XS.length + i, i, j, x, y })));
const nodeAt = (i, j) => nodes[j * XS.length + i];
const adj = nodes.map(n => {
  const out = [];
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(([di, dj]) => {
    const i = n.i + di, j = n.j + dj;
    if (i >= 0 && i < XS.length && j >= 0 && j < YS.length) out.push(nodeAt(i, j));
  });
  return out;
});
function shortest(from, to){
  const d = nodes.map(() => Infinity), prev = nodes.map(() => null), done = new Set();
  d[from.id] = 0;
  while (done.size < nodes.length){
    let u = null;
    nodes.forEach(n => { if (!done.has(n.id) && (u === null || d[n.id] < d[u.id])) u = n; });
    if (!u || d[u.id] === Infinity) break;
    done.add(u.id);
    if (u === to) break;
    adj[u.id].forEach(v => { const nd = d[u.id] + dist(u, v); if (nd < d[v.id]){ d[v.id] = nd; prev[v.id] = u; } });
  }
  const path = []; let c = to;
  while (c){ path.unshift(c); c = prev[c.id]; }
  return { path, len: d[to.id] };
}

/* ---------------- world drawing ---------------- */
const world = document.getElementById('world');
const L = name => el('g', { id: name }, world);
const gGround = L('ground'), gRiver = L('river'), gBlocks = L('blocks'), gRoads = L('roads'), gDeco = L('deco'),
      gLand = L('landmarks'), gRoute = L('routeLayer'), gTrail = L('trail'), gPins = L('pins'), gRider = L('rider'), gClouds = L('clouds');

el('rect', { x: -2000, y: -2000, width: W + 4000, height: H + 4000, fill: '#6f9f52', class: 'g-out' }, gGround);
el('rect', { x: -2000, y: -2000, width: W + 4000, height: H + 4000, fill: 'url(#grassTex)', opacity: .55, class: 'g-tex' }, gGround);
el('rect', { x: 40, y: 40, width: W - 80, height: H - 80, rx: 60, fill: 'url(#grassTex)', class: 'g-tex' }, gGround);

const riverX = y => 1450 + 70 * Math.sin(y / 260 + 0.6) + 25 * Math.sin(y / 97);
const riverW = y => 46 + 8 * Math.sin(y / 170);
function riverPoly(extra){
  const left = [], right = [];
  for (let y = -300; y <= H + 300; y += 16){ left.push(`${riverX(y) - riverW(y) - extra},${y}`); right.unshift(`${riverX(y) + riverW(y) + extra},${y}`); }
  return left.concat(right).join(' ');
}
el('polygon', { points: riverPoly(14), fill: '#d9c99a', class: 'river-bank' }, gRiver);
el('polygon', { points: riverPoly(0), fill: '#5b9cc2', class: 'river-water' }, gRiver);
el('polygon', { points: riverPoly(-18), fill: '#6aa9cd', class: 'river-water' }, gRiver);
for (let k = 0; k < 70; k++){
  const y = rand() * (H + 200) - 100, x = riverX(y) + (rand() - .5) * riverW(y) * 1.2;
  el('line', { x1: x, y1: y, x2: x + 14 + rand() * 16, y2: y + 3, stroke: '#cfe6f2', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .55, class: 'ripple' }, gRiver);
}

/* obstacles (landmarks etc.) for house/tree placement */
const obstacles = [];
const hits = (r, pad = 10) => obstacles.some(o => r.x < o.x + o.w + pad && r.x + r.w + pad > o.x && r.y < o.y + o.h + pad && r.y + r.h + pad > o.y);
function cornerRect(node, sx, sy, w, h, inset = 56){
  const ox = node.x + sx * inset, oy = node.y + sy * inset;
  return { x: sx > 0 ? ox : ox - w, y: sy > 0 ? oy : oy - h, w, h };
}

/* ---- trees & houses ---- */
const greens = ['#4f8a3c','#5c9a45','#3f7a35','#6aa64e','#2f6b33'];
const TREES = [], HOUSES = [], ROOFS = [];
function tree(x, y, r, parent = gDeco){
  const g = el('g', {}, parent);
  el('circle', { cx: x + r * .35, cy: y + r * .35, r, fill: 'rgba(20,40,20,.22)' }, g);
  el('circle', { cx: x, cy: y, r, fill: pick(greens) }, g);
  el('circle', { cx: x - r * .28, cy: y - r * .3, r: r * .55, fill: '#ffffff', opacity: .12 }, g);
  el('circle', { cx: x - r * .22, cy: y - r * .25, r: r * .62, fill: '#fbfdff', opacity: .88, class: 'snowcap' }, g);
  TREES.push({ x, y, r, g });
}
function snowRoof(g, x, y, w, h, rx = 2){ el('rect', { x: x + 3, y: y + 3, width: w - 6, height: h - 6, rx, fill: '#fbfdff', opacity: .62, class: 'snowcap' }, g); }
const roofs = ['#c8553d','#8d6e63','#577590','#9c6644','#6d597a','#b56576','#7a8b6f','#a3a380','#c08552'];
function house(x, y, w, h, parent = gDeco){
  const g = el('g', {}, parent);
  const c = pick(roofs);
  el('rect', { x: x + 6, y: y + 7, width: w, height: h, rx: 2, fill: 'rgba(0,0,0,.22)' }, g);
  if (w >= h){
    el('rect', { x, y, width: w, height: h / 2, fill: c }, g);
    el('rect', { x, y: y + h / 2, width: w, height: h / 2, fill: c, style: 'filter:brightness(.78)' }, g);
    el('line', { x1: x + 4, y1: y + h / 2, x2: x + w - 4, y2: y + h / 2, stroke: 'rgba(255,255,255,.35)', 'stroke-width': 2 }, g);
  } else {
    el('rect', { x, y, width: w / 2, height: h, fill: c }, g);
    el('rect', { x: x + w / 2, y, width: w / 2, height: h, fill: c, style: 'filter:brightness(.78)' }, g);
    el('line', { x1: x + w / 2, y1: y + 4, x2: x + w / 2, y2: y + h - 4, stroke: 'rgba(255,255,255,.35)', 'stroke-width': 2 }, g);
  }
  snowRoof(g, x, y, w, h);
  if (rand() < .4) el('rect', { x: x + w * .7, y: y + h * .15, width: 8, height: 8, fill: '#5a4a42' }, g);
  HOUSES.push({ x, y, w, h, g });
}

/* ---- landmarks ---- */
function shadowRect(g, r, rx = 4){ el('rect', { x: r.x + 10, y: r.y + 12, width: r.w, height: r.h, rx, fill: 'rgba(0,0,0,.25)' }, g); }
function flatRoof(g, r, fill, edge){
  shadowRect(g, r);
  el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 4, fill, class: 'lm-roof' }, g);
  snowRoof(g, r.x, r.y, r.w, r.h, 3);
  el('rect', { x: r.x + 6, y: r.y + 6, width: r.w - 12, height: r.h - 12, rx: 2, fill: 'none', stroke: edge, 'stroke-width': 2.5 }, g);
}
function acUnits(g, r, n){
  for (let k = 0; k < n; k++){
    const x = r.x + 16 + rand() * (r.w - 46), y = r.y + 16 + rand() * (r.h - 46);
    el('rect', { x, y, width: 16, height: 12, fill: '#c9ccc9', stroke: '#8f938f', 'stroke-width': 1.5 }, g);
  }
}
function plaque(g, text, cx, cy, color){
  const w = text.length * 11.2 + 28;
  el('rect', { x: cx - w / 2 + 3, y: cy - 16 + 4, width: w, height: 32, rx: 9, fill: 'rgba(0,0,0,.28)' }, g);
  el('rect', { x: cx - w / 2, y: cy - 16, width: w, height: 32, rx: 9, fill: '#fffdf7', stroke: color, 'stroke-width': 3.5 }, g);
  const t = el('text', { x: cx, y: cy + 1, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': "'Bricolage Grotesque', system-ui, sans-serif", 'font-weight': 800, 'font-size': 19, fill: '#1d2321' }, g);
  t.textContent = text;
}
function stopGroup(id){ const g = el('g', { class: 'stop-hit', 'data-stop': id }, gLand); return g; }
const S = Object.fromEntries(STOPS.map(s => [s.id, s]));
STOPS.forEach(s => { s.n = nodeAt(s.node[0], s.node[1]); });

const LM = {};
// Home
(() => {
  const s = S.about, r = cornerRect(s.n, -1, -1, 150, 116); LM.about = r; obstacles.push({ ...r, x: r.x - 30, w: r.w + 30, h: r.h + 30 });
  const g = stopGroup('about');
  // garden + driveway
  el('rect', { x: r.x - 26, y: r.y - 26, width: r.w + 52, height: r.h + 52, rx: 10, fill: '#a7d07f', class: 'g-block' }, g);
  el('rect', { x: r.x + r.w - 40, y: r.y + r.h, width: 34, height: 30, fill: '#cfc8b8' }, g);
  ['#ffb4a2','#ffd166','#e5989b','#ffffff'].forEach((c, k) => { for (let q = 0; q < 4; q++) el('circle', { cx: r.x - 14 + q * 9, cy: r.y + 12 + k * 20, r: 3.5, fill: c }, g); });
  shadowRect(g, r, 2);
  el('rect', { x: r.x, y: r.y, width: r.w, height: r.h / 2, fill: '#e76f51', class: 'lm-roof' }, g);
  el('rect', { x: r.x, y: r.y + r.h / 2, width: r.w, height: r.h / 2, fill: '#c4553b', class: 'lm-roof' }, g);
  for (let k = 1; k < 7; k++) el('line', { x1: r.x + k * r.w / 7, y1: r.y, x2: r.x + k * r.w / 7, y2: r.y + r.h, stroke: 'rgba(0,0,0,.08)', 'stroke-width': 2 }, g);
  snowRoof(g, r.x, r.y, r.w, r.h);
  el('line', { x1: r.x, y1: r.y + r.h / 2, x2: r.x + r.w, y2: r.y + r.h / 2, stroke: '#ffd6c9', 'stroke-width': 3 }, g);
  el('rect', { x: r.x + 26, y: r.y + 16, width: 16, height: 16, fill: '#6b4f43' }, g);
  plaque(g, 'Home', r.x + r.w / 2, r.y + r.h + 4, s.color);
  tree(r.x - 4, r.y + r.h + 10, 18, g);
})();
// Campus (education + GADA)
(() => {
  const bx = XS[0] + CURB, by = YS[2] + CURB, bw = XS[1] - XS[0] - CURB * 2, bh = YS[3] - YS[2] - CURB * 2;
  obstacles.push({ x: bx, y: by, w: bw, h: bh });
  const base = el('g', {}, gLand);
  el('rect', { x: bx, y: by, width: bw, height: bh, rx: 12, fill: '#a9d488', class: 'g-block' }, base);
  // quad paths
  const cx = bx + bw * .55, cy = by + bh * .62;
  [[bx + 10, by + bh - 10],[bx + bw - 10, by + 10],[bx + 10, by + 10],[bx + bw - 10, by + bh - 10]].forEach(([x, y]) =>
    el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: '#e9dfc6', 'stroke-width': 12, 'stroke-linecap': 'round' }, base));
  el('circle', { cx, cy, r: 30, fill: '#e9dfc6' }, base);
  el('circle', { cx, cy, r: 18, fill: '#6aa9cd', stroke: '#d6cbb0', 'stroke-width': 4 }, base);
  // education main building
  const e = S.education, r = cornerRect(e.n, 1, 1, 220, 120, 58); LM.education = r;
  const g = stopGroup('education');
  flatRoof(g, r, '#c9b8a6', '#a8957f');
  el('circle', { cx: r.x + r.w / 2, cy: r.y + r.h / 2, r: 30, fill: '#6fb59a', stroke: '#4f957b', 'stroke-width': 4 }, g);
  el('circle', { cx: r.x + r.w / 2, cy: r.y + r.h / 2, r: 8, fill: '#e9f5ef' }, g);
  acUnits(g, { ...r, w: 80 }, 2);
  plaque(g, 'U of Manitoba', r.x + r.w / 2, r.y + r.h + 4, e.color);
  // GADA lab
  const ga = S.gada, r2 = cornerRect(ga.n, -1, -1, 160, 110, 58); LM.gada = r2;
  const g2 = stopGroup('gada');
  flatRoof(g2, r2, '#9aa5b8', '#7a869a');
  for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++)
    el('rect', { x: r2.x + 18 + a * 42, y: r2.y + 18 + b * 34, width: 36, height: 26, fill: '#2c3e66', stroke: '#8fa6d6', 'stroke-width': 1.5 }, g2);
  plaque(g2, 'GADA Lab', r2.x + r2.w / 2, r2.y - 8, ga.color);
  // campus trees
  for (let k = 0; k < 40; k++){
    const x = bx + 20 + rand() * (bw - 40), y = by + 20 + rand() * (bh - 40);
    const tr = { x: x - 16, y: y - 16, w: 32, h: 32 };
    const onR = [r, r2].some(o => tr.x < o.x + o.w + 18 && tr.x + tr.w > o.x - 18 && tr.y < o.y + o.h + 40 && tr.y + tr.h > o.y - 40);
    if (!onR && Math.hypot(x - cx, y - cy) > 50) tree(x, y, 12 + rand() * 8, base);
  }
})();
// Priceline office tower (stepped roof seen from above)
(() => {
  const s = S.priceline, r = cornerRect(s.n, -1, 1, 170, 170); LM.priceline = r; obstacles.push(r);
  const g = stopGroup('priceline');
  shadowRect(g, { ...r, x: r.x + 16, y: r.y + 18 });
  flatRoof(g, r, '#b9b2c9', '#968daa');
  // window bands along the edge
  for (let k = 0; k < 6; k++){
    el('rect', { x: r.x + 14 + k * 25, y: r.y + 12, width: 18, height: 10, fill: '#9ecae1', stroke: '#6c9fbc', 'stroke-width': 1 }, g);
    el('rect', { x: r.x + 14 + k * 25, y: r.y + r.h - 22, width: 18, height: 10, fill: '#9ecae1', stroke: '#6c9fbc', 'stroke-width': 1 }, g);
  }
  // upper setback level
  const u = { x: r.x + 32, y: r.y + 34, w: r.w - 64, h: r.h - 68 };
  el('rect', { x: u.x + 8, y: u.y + 9, width: u.w, height: u.h, rx: 3, fill: 'rgba(0,0,0,.25)' }, g);
  el('rect', { x: u.x, y: u.y, width: u.w, height: u.h, rx: 3, fill: '#d6d0e2', stroke: '#968daa', 'stroke-width': 2.5, class: 'lm-roof' }, g);
  snowRoof(g, u.x, u.y, u.w, u.h);
  // elevator core + AC units on top
  el('rect', { x: u.x + u.w / 2 - 18, y: u.y + 14, width: 36, height: 28, fill: '#7d7591', stroke: '#5e5772', 'stroke-width': 2 }, g);
  [[16, 60], [u.w - 34, 60], [u.w / 2 - 9, 64]].forEach(([dx, dy]) =>
    el('rect', { x: u.x + dx, y: u.y + dy, width: 18, height: 14, fill: '#c9ccc9', stroke: '#8f938f', 'stroke-width': 1.5 }, g));
  plaque(g, 'Priceline', r.x + r.w / 2, r.y + r.h + 4, s.color);
})();
// Conquest Planning
(() => {
  const s = S.conquest, r = cornerRect(s.n, 1, -1, 210, 150); LM.conquest = r; obstacles.push(r);
  const g = stopGroup('conquest');
  flatRoof(g, r, '#e5e8e3', '#c3c8c1');
  for (let a = 0; a < 5; a++) for (let b = 0; b < 2; b++)
    el('rect', { x: r.x + 20 + a * 35, y: r.y + 20 + b * 40, width: 28, height: 32, fill: '#9ecae1', stroke: '#6c9fbc', 'stroke-width': 1.5, opacity: .95 }, g);
  acUnits(g, { ...r, y: r.y + 90, h: 60 }, 2);
  plaque(g, 'Conquest Planning', r.x + r.w / 2, r.y - 8, s.color);
})();
// Contact - post office
(() => {
  const s = S.contact, r = cornerRect(s.n, -1, 1, 160, 120); LM.contact = r; obstacles.push(r);
  const g = stopGroup('contact');
  flatRoof(g, r, '#4f6d94', '#3b577c');
  // envelope
  const ex = r.x + r.w / 2 - 32, ey = r.y + 26;
  el('rect', { x: ex, y: ey, width: 64, height: 42, rx: 4, fill: '#fffdf7' }, g);
  el('path', { d: `M${ex},${ey} L${ex + 32},${ey + 24} L${ex + 64},${ey}`, fill: 'none', stroke: '#3d5a80', 'stroke-width': 3 }, g);
  el('rect', { x: r.x - 26, y: r.y + r.h - 22, width: 16, height: 22, rx: 4, fill: '#d62828' }, g);
  plaque(g, 'Contact', r.x + r.w / 2, r.y + r.h + 4, s.color);
})();
// Birchwood + parking lot
(() => {
  const s = S.birchwood, r = cornerRect(s.n, -1, -1, 240, 130); LM.birchwood = r; obstacles.push(r);
  const lot = { x: r.x, y: r.y - 150, w: 240, h: 130 }; obstacles.push(lot);
  const g = stopGroup('birchwood');
  el('rect', { x: lot.x, y: lot.y, width: lot.w, height: lot.h, rx: 6, fill: '#6b7078' }, g);
  const carC = ['#e63946','#f1faee','#1d3557','#ffb703','#8ecae6','#adb5bd','#2a9d8f'];
  for (let row = 0; row < 2; row++) for (let k = 0; k < 7; k++){
    const x = lot.x + 12 + k * 32, y = lot.y + 10 + row * 64;
    el('line', { x1: x - 4, y1: y, x2: x - 4, y2: y + 46, stroke: '#e9ecef', 'stroke-width': 2 }, g);
    if (rand() < .72){
      const c = pick(carC);
      el('rect', { x: x + 1, y: y + 4, width: 22, height: 38, rx: 6, fill: c, stroke: 'rgba(0,0,0,.25)', 'stroke-width': 1.5 }, g);
      el('rect', { x: x + 4, y: y + (row ? 10 : 26), width: 16, height: 9, rx: 2, fill: '#26333b', opacity: .75 }, g);
    }
  }
  flatRoof(g, r, '#d8cdb5', '#b8ab90');
  for (let k = 0; k < 6; k++) el('rect', { x: r.x + 22 + k * 34, y: r.y + 24, width: 22, height: 22, fill: '#9ecae1', stroke: '#6c9fbc', 'stroke-width': 1.5 }, g);
  acUnits(g, { ...r, y: r.y + 54, h: 76 }, 3);
  plaque(g, 'Birchwood', r.x + r.w / 2, r.y + r.h + 4, s.color);
})();
// Projects workshop
(() => {
  const s = S.projects, r = cornerRect(s.n, -1, -1, 200, 140); LM.projects = r; obstacles.push(r);
  const g = stopGroup('projects');
  shadowRect(g, r);
  el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 4, fill: '#f4a261', class: 'lm-roof' }, g);
  for (let k = 0; k < 20; k++) el('line', { x1: r.x + 5 + k * 10, y1: r.y + 3, x2: r.x + 5 + k * 10, y2: r.y + r.h - 3, stroke: '#d9874a', 'stroke-width': 2.5 }, g);
  [0, 1, 2].forEach(k => el('rect', { x: r.x + 26 + k * 56, y: r.y + 30, width: 36, height: 50, fill: '#bfe3f2', stroke: '#8a5a33', 'stroke-width': 2.5 }, g));
  // crates
  [[-30, 20], [-30, 52], [-58, 36]].forEach(([dx, dy]) => {
    el('rect', { x: r.x + dx, y: r.y + dy, width: 24, height: 24, fill: '#c8a26b', stroke: '#8a6a3f', 'stroke-width': 2 }, g);
    el('path', { d: `M${r.x + dx},${r.y + dy} l24,24 M${r.x + dx + 24},${r.y + dy} l-24,24`, stroke: '#8a6a3f', 'stroke-width': 1.5 }, g);
  });
  plaque(g, 'Projects', r.x + r.w / 2, r.y - 8, s.color);
})();
// Skills market
(() => {
  const s = S.skills, r = cornerRect(s.n, 1, -1, 240, 160); LM.skills = r; obstacles.push(r);
  const g = stopGroup('skills');
  el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 10, fill: '#ead9b5', stroke: '#cdb88c', 'stroke-width': 3, class: 'lm-roof' }, g);
  const tc = ['#e76f51','#2a9d8f','#e9c46a','#457b9d','#9b5de5','#06d6a0'];
  tc.forEach((c, k) => {
    const x = r.x + 18 + (k % 3) * 74, y = r.y + 18 + Math.floor(k / 3) * 66, w = 58;
    el('rect', { x: x + 6, y: y + 7, width: w, height: w - 8, fill: 'rgba(0,0,0,.2)' }, g);
    el('rect', { x, y, width: w, height: w - 8, fill: c }, g);
    el('path', { d: `M${x},${y} L${x + w},${y + w - 8} M${x + w},${y} L${x},${y + w - 8}`, stroke: 'rgba(255,255,255,.45)', 'stroke-width': 2 }, g);
    el('path', { d: `M${x + w / 2},${y + (w - 8) / 2} L${x + w},${y} L${x + w},${y + w - 8} Z`, fill: 'rgba(0,0,0,.14)' }, g);
  });
  plaque(g, 'Skills', r.x + r.w / 2, r.y - 8, s.color);
})();

// Hobbies: five-a-side pitch + clubhouse in the riverside park
(() => {
  const s = S.hobbies; if (!s) return;
  const P = { x: 1254, y: 706, w: 128, h: 84 }, C = { x: 1258, y: 800, w: 112, h: 44 };
  LM.hobbies = C; obstacles.push(P, C);
  const g = stopGroup('hobbies');
  // pitch
  el('rect', { x: P.x + 6, y: P.y + 7, width: P.w, height: P.h, rx: 3, fill: 'rgba(0,0,0,.2)' }, g);
  for (let k = 0; k < 8; k++) el('rect', { x: P.x + k * P.w / 8, y: P.y, width: P.w / 8 + .5, height: P.h, fill: k % 2 ? '#3f9a46' : '#4caf50' }, g);
  snowRoof(g, P.x, P.y, P.w, P.h);
  const ln = { fill: 'none', stroke: '#fff', 'stroke-width': 2 };
  const ix = P.x + 6, iy = P.y + 6, iw = P.w - 12, ih = P.h - 12, cy = iy + ih / 2;
  el('rect', { x: ix, y: iy, width: iw, height: ih, ...ln }, g);
  el('line', { x1: ix + iw / 2, y1: iy, x2: ix + iw / 2, y2: iy + ih, ...ln }, g);
  el('circle', { cx: ix + iw / 2, cy, r: 11, ...ln }, g);
  el('rect', { x: ix, y: cy - 18, width: 16, height: 36, ...ln }, g);
  el('rect', { x: ix + iw - 16, y: cy - 18, width: 16, height: 36, ...ln }, g);
  [[ix - 5, cy - 9], [ix + iw, cy - 9]].forEach(([x, y]) => el('rect', { x, y, width: 5, height: 18, fill: '#e9ecef', stroke: '#9aa0a6', 'stroke-width': 1 }, g));
  [[ix, iy], [ix + iw, iy], [ix, iy + ih], [ix + iw, iy + ih]].forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 2.5, fill: '#d62839' }, g));
  // two little teams + the ball
  [[.2, .3], [.3, .7], [.38, .45], [.12, .5], [.45, .25]].forEach(([fx, fy]) => el('circle', { cx: ix + iw * fx, cy: iy + ih * fy, r: 4, fill: '#d62839', stroke: '#fff', 'stroke-width': 1.6 }, g));
  [[.8, .3], [.7, .7], [.62, .55], [.88, .5], [.56, .8]].forEach(([fx, fy]) => el('circle', { cx: ix + iw * fx, cy: iy + ih * fy, r: 4, fill: '#1d3557', stroke: '#a8dadc', 'stroke-width': 1.6 }, g));
  el('circle', { cx: ix + iw * .5 + 5, cy: cy - 3, r: 2.6, fill: '#fff', stroke: '#222', 'stroke-width': .8 }, g);
  // clubhouse (movies + gaming)
  flatRoof(g, C, '#3d405b', '#2b2d42');
  const gx = C.x + 34, gy = C.y + 22;   // gamepad
  el('path', { d: `M${gx - 16},${gy - 6} Q${gx - 20},${gy + 10} ${gx - 12},${gy + 9} L${gx - 6},${gy + 3} L${gx + 6},${gy + 3} L${gx + 12},${gy + 9} Q${gx + 20},${gy + 10} ${gx + 16},${gy - 6} Q${gx},${gy - 10} ${gx - 16},${gy - 6} Z`, fill: '#f1faee' }, g);
  el('path', { d: `M${gx - 11},${gy - 2} h6 M${gx - 8},${gy - 5} v6`, stroke: '#3d405b', 'stroke-width': 2 }, g);
  [[8, -3, '#d62839'], [12, 0, '#2a9d8f']].forEach(([dx, dy, c]) => el('circle', { cx: gx + dx, cy: gy + dy, r: 2, fill: c }, g));
  const fx = C.x + 66, fy = C.y + 12;   // film clapper
  el('rect', { x: fx, y: fy + 6, width: 26, height: 16, rx: 2, fill: '#f1faee' }, g);
  el('path', { d: `M${fx},${fy + 6} L${fx + 2},${fy} L${fx + 28},${fy - 2} L${fx + 26},${fy + 6} Z`, fill: '#f1faee' }, g);
  [6, 13, 20].forEach(d => el('line', { x1: fx + d, y1: fy + 5, x2: fx + d + 3, y2: fy - 1, stroke: '#3d405b', 'stroke-width': 2.5 }, g));
  plaque(g, 'Hobbies', C.x + C.w / 2, C.y + C.h + 4, s.color);
})();

/* ---- blocks: fill with houses / parks ---- */
const blockXs = [[XS[0], XS[1]], [XS[1], XS[2]], [XS[2], XS[3]], [XS[3], XS[4]]];
const blockYs = [[YS[0], YS[1]], [YS[1], YS[2]], [YS[2], YS[3]]];
blockYs.forEach(([y0, y1], bj) => blockXs.forEach(([x0, x1], bi) => {
  const bx = x0 + CURB, by = y0 + CURB, bw = x1 - x0 - CURB * 2, bh = y1 - y0 - CURB * 2;
  if (bi === 0 && bj === 2) return; // campus
  const park = bi === 2;
  el('rect', { x: bx, y: by, width: bw, height: bh, rx: 12, fill: park ? '#8fc46a' : '#a3cc80', class: park ? 'g-park' : 'g-block' }, gBlocks);
  if (park){
    // riverside footpath
    let d = '';
    for (let y = by + 8; y <= by + bh - 8; y += 12) d += (d ? 'L' : 'M') + (riverX(y) + riverW(y) + 34) + ',' + y;
    el('path', { d, fill: 'none', stroke: '#e3d7b8', 'stroke-width': 9, 'stroke-linecap': 'round' }, gBlocks);
    for (let k = 0; k < 34; k++){
      const x = bx + 16 + rand() * (bw - 32), y = by + 16 + rand() * (bh - 32);
      if (Math.abs(x - riverX(y)) > riverW(y) + 54){
        const rr = 13 + rand() * 10;
        if (!hits({ x: x - rr, y: y - rr, w: rr * 2, h: rr * 2 }, 6)) tree(x, y, rr);
      }
    }
    return;
  }
  // houses along edges
  const placed = [];
  const tryHouse = (x, y, w, h) => { const r = { x, y, w, h }; if (!hits(r, 14) && !placed.some(p => r.x < p.x + p.w + 10 && r.x + r.w + 10 > p.x && r.y < p.y + p.h + 10 && r.y + r.h + 10 > p.y)){ placed.push(r); house(x, y, w, h); } };
  const pad = 14;
  for (let x = bx + pad; x + 56 <= bx + bw - pad; x += 74){ tryHouse(x, by + pad, 54 + rand() * 6, 46 + rand() * 8); tryHouse(x, by + bh - pad - 50, 54 + rand() * 6, 46 + rand() * 4); }
  for (let y = by + pad + 74; y + 56 <= by + bh - pad - 60; y += 72){ tryHouse(bx + pad, y, 46 + rand() * 6, 54); tryHouse(bx + bw - pad - 50, y, 46 + rand() * 4, 54); }
  for (let k = 0; k < 18; k++){
    const x = bx + 30 + rand() * (bw - 60), y = by + 30 + rand() * (bh - 60), rr = 11 + rand() * 9;
    const r = { x: x - rr, y: y - rr, w: rr * 2, h: rr * 2 };
    if (!hits(r, 4) && !placed.some(p => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y)) tree(x, y, rr);
  }
}));
// outer forest ring
for (let k = 0; k < 900; k++){
  const x = -700 + rand() * (W + 1400), y = -600 + rand() * (H + 1200);
  const inside = x > XS[0] - 70 && x < XS[4] + 70 && y > YS[0] - 70 && y < YS[3] + 70;
  if (!inside && Math.abs(x - riverX(y)) > riverW(y) + 26) tree(x, y, 16 + rand() * 16);
}

/* ---- roads ---- */
const x0 = XS[0], x1 = XS[XS.length - 1], y0 = YS[0], y1 = YS[YS.length - 1];
YS.forEach(y => el('rect', { x: x0 - CURB, y: y - CURB, width: x1 - x0 + CURB * 2, height: CURB * 2, fill: '#d8d1c1', class: 'sidewalk' }, gRoads));
XS.forEach(x => el('rect', { x: x - CURB, y: y0 - CURB, width: CURB * 2, height: y1 - y0 + CURB * 2, fill: '#d8d1c1', class: 'sidewalk' }, gRoads));
// bridges
YS.forEach(y => {
  const xr = riverX(y), half = riverW(y) + 26;
  el('rect', { x: xr - half, y: y - CURB - 6, width: half * 2, height: CURB * 2 + 12, fill: 'rgba(0,0,0,.18)' }, gRoads);
  el('rect', { x: xr - half, y: y - CURB, width: half * 2, height: CURB * 2, fill: '#c9c1af' }, gRoads);
  [-CURB, CURB - 5].forEach(o => el('rect', { x: xr - half, y: y + o, width: half * 2, height: 5, fill: '#7d7262' }, gRoads));
});
YS.forEach(y => el('rect', { x: x0 - ROAD, y: y - ROAD, width: x1 - x0 + ROAD * 2, height: ROAD * 2, fill: '#555b63' }, gRoads));
XS.forEach(x => el('rect', { x: x - ROAD, y: y0 - ROAD, width: ROAD * 2, height: y1 - y0 + ROAD * 2, fill: '#555b63' }, gRoads));
YS.forEach(y => el('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: '#f2d16b', 'stroke-width': 3, 'stroke-dasharray': '26 22' }, gRoads));
XS.forEach(x => el('line', { x1: x, y1: y0, x2: x, y2: y1, stroke: '#f2d16b', 'stroke-width': 3, 'stroke-dasharray': '26 22' }, gRoads));
nodes.forEach(n => {
  el('rect', { x: n.x - ROAD, y: n.y - ROAD, width: ROAD * 2, height: ROAD * 2, fill: '#555b63' }, gRoads);
  // crosswalks
  for (let k = -3; k <= 3; k++){
    [-1, 1].forEach(s => { const yy = n.y + s * (ROAD + 6); if (adj[n.id].some(m => m.x === n.x && Math.sign(m.y - n.y) === s)) el('rect', { x: n.x + k * 8 - 2.5, y: yy - 5, width: 5, height: 10, fill: '#f1efe8', opacity: .85 }, gRoads); });
    [-1, 1].forEach(s => { const xx = n.x + s * (ROAD + 6); if (adj[n.id].some(m => m.y === n.y && Math.sign(m.x - n.x) === s)) el('rect', { x: xx - 5, y: n.y + k * 8 - 2.5, width: 10, height: 5, fill: '#f1efe8', opacity: .85 }, gRoads); });
  }
});

/* ---- pins ---- */
const pinEls = {};
STOPS.forEach((s, idx) => {
  const px = s.n.x + s.dir[0] * 46, py = s.n.y + s.dir[1] * 46;
  const g = el('g', { class: 'stop-hit', 'data-stop': s.id }, gPins);
  const inner = el('g', { class: 'pin' }, g);
  el('ellipse', { cx: px, cy: py + 2, rx: 10, ry: 4, fill: 'rgba(0,0,0,.25)' }, g);
  el('path', { d: `M${px},${py} C${px - 6},${py - 12} ${px - 18},${py - 20} ${px - 18},${py - 34} A18,18 0 1 1 ${px + 18},${py - 34} C${px + 18},${py - 20} ${px + 6},${py - 12} ${px},${py} Z`, fill: s.color, stroke: '#1d2321', 'stroke-width': 3 }, inner);
  el('circle', { cx: px, cy: py - 34, r: 9, fill: '#fffdf7' }, inner);
  const t = el('text', { x: px, y: py - 33, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': "'JetBrains Mono', monospace", 'font-size': 11, 'font-weight': 700, fill: '#1d2321' }, inner);
  t.textContent = idx === 0 ? '★' : String(idx);
  pinEls[s.id] = { g: inner, t };
});

[gClouds, gRoute, gTrail, gRider].forEach(g => g.setAttribute('pointer-events', 'none'));
/* ---- clouds ---- */
const clouds = [];
for (let k = 0; k < 5; k++){
  const c = { x: rand() * W, y: rand() * H, rx: 240 + rand() * 160, ry: 150 + rand() * 80, v: 10 + rand() * 10 };
  c.el = el('ellipse', { cx: c.x, cy: c.y, rx: c.rx, ry: c.ry, fill: 'url(#cloud)' }, gClouds);
  clouds.push(c);
}

/* ---------------- rider ---------------- */
const routeLine = el('path', { d: '', fill: 'none', stroke: '#fffdf7', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-dasharray': '2 16', class: 'route-line', opacity: 0 }, gRoute);
const trailLine = el('polyline', { points: '', fill: 'none', stroke: 'rgba(30,30,30,.18)', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, gTrail);
const rider = el('g', {}, gRider);
const body = el('g', { transform: 'scale(1.25)' }, rider);
el('ellipse', { cx: 4, cy: 7, rx: 36, ry: 10, fill: 'rgba(0,0,0,.24)' }, body);
el('rect', { x: -37, y: -2.6, width: 25, height: 5.2, rx: 2.6, fill: '#1f1f1f' }, body);
const front = el('g', {}, body);
el('rect', { x: 12, y: -2.6, width: 25, height: 5.2, rx: 2.6, fill: '#1f1f1f' }, front);
el('line', { x1: 20, y1: -11, x2: 20, y2: 11, stroke: '#2b2b2b', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, front);
el('line', { x1: -24, y1: 0, x2: 20, y2: 0, stroke: '#e76f51', 'stroke-width': 4.2, 'stroke-linecap': 'round' }, body);
const legs = [1, -1].map(() => ({
  leg: el('path', { d: '', fill: 'none', stroke: '#26324a', 'stroke-width': 5.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, body),
  shoe: el('circle', { r: 3, fill: '#111' }, body)
}));
el('ellipse', { cx: -2, cy: 0, rx: 12, ry: 10.5, fill: '#2f80ed' }, body);
el('rect', { x: -13, y: -7, width: 11, height: 14, rx: 4, fill: '#2a9d8f' }, body);
[-1, 1].forEach(s => {
  el('line', { x1: 3, y1: s * 8.5, x2: 19, y2: s * 9.5, stroke: '#2f80ed', 'stroke-width': 5, 'stroke-linecap': 'round' }, front.parentNode);
  el('circle', { cx: 20, cy: s * 9.5, r: 2.8, fill: '#8d5a3b' }, body);
});
el('ellipse', { cx: 5, cy: 0, rx: 8.5, ry: 7.5, fill: '#ffd23f', stroke: '#1d2321', 'stroke-width': 1.4 }, body);
[-3, 0, 3].forEach(o => el('line', { x1: 0, y1: o, x2: 9, y2: o, stroke: '#1d2321', 'stroke-width': 1.3, 'stroke-linecap': 'round', opacity: .6 }, body));
el('path', { d: 'M11,-5 Q15,0 11,5', fill: 'none', stroke: '#1d2321', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, body);

function setLegs(ph){
  [1, -1].forEach((side, k) => {
    const sv = Math.sin(ph + (k ? Math.PI : 0));
    const hip = { x: -10, y: side * 4.5 }, knee = { x: -1 + 8 * sv, y: side * 9.5 }, foot = { x: 5 + 7 * sv, y: side * 6 };
    legs[k].leg.setAttribute('d', `M${hip.x},${hip.y} L${knee.x},${knee.y} L${foot.x},${foot.y}`);
    legs[k].shoe.setAttribute('cx', foot.x + 1.5); legs[k].shoe.setAttribute('cy', foot.y);
  });
}
setLegs(0.6);

const R = { x: S.about.n.x, y: S.about.n.y, ang: -90, phase: .6, node: S.about.n, at: 'about' };
let ride = null;
const trail = [];

function placeRider(x, y, ang, steer){
  rider.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
  front.setAttribute('transform', `rotate(${(steer || 0).toFixed(1)},20,0)`);
}
placeRider(R.x, R.y, R.ang);

function pathD(pts){
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let k = 1; k < pts.length - 1; k++){
    const a = pts[k - 1], b = pts[k], c = pts[k + 1];
    const d1 = dist(a, b), d2 = dist(b, c);
    if (d1 < 1 || d2 < 1) continue;
    const r = Math.min(64, d1 / 2, d2 / 2);
    const p1 = { x: b.x + (a.x - b.x) * r / d1, y: b.y + (a.y - b.y) * r / d1 };
    const p2 = { x: b.x + (c.x - b.x) * r / d2, y: b.y + (c.y - b.y) * r / d2 };
    d += ` L${p1.x},${p1.y} Q${b.x},${b.y} ${p2.x},${p2.y}`;
  }
  const z = pts[pts.length - 1];
  return d + ` L${z.x},${z.y}`;
}

function goTo(id){
  const s = S[id]; if (!s) return;
  hideIntro();
  if (!ride && R.at === id){ cam.mode = 'follow'; cam.manual = { x: 0, y: 0 }; arrive(s); return; }
  closePanel(true);
  let pts;
  if (ride){
    // reroute from where we are: choose previous or next node, whichever is shorter overall
    const { prevN, nextN } = ride.segmentAt(ride.s);
    const here = { x: ride.cx, y: ride.cy };
    const viaNext = dist(here, nextN) + shortest(nextN, s.n).len;
    const viaPrev = dist(here, prevN) + shortest(prevN, s.n).len;
    const start = viaNext <= viaPrev ? nextN : prevN;
    pts = [here, ...shortest(start, s.n).path];
    if (dist(pts[0], pts[1]) < 4) pts.shift();
  } else {
    pts = shortest(R.node, s.n).path;
  }
  if (pts.length < 2){ R.node = s.n; arrive(s); return; }
  routeLine.setAttribute('d', pathD(pts));
  routeLine.setAttribute('opacity', .85);
  const len = routeLine.getTotalLength();
  // cumulative polyline lengths to map progress -> node
  const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + dist(pts[k - 1], pts[k]));
  const polyLen = cum[cum.length - 1];
  ride = {
    target: s, pts, len, t0: performance.now(), dur: reduceMotion ? 1 : Math.max(1100, len / 0.52), s: 0, cx: R.x, cy: R.y,
    segmentAt(sv){
      const p = sv / len * polyLen; let k = 1; while (k < cum.length - 1 && cum[k] < p) k++;
      const nodeOf = pt => nodes.reduce((b, n) => dist(n, pt) < dist(b, pt) ? n : b, nodes[0]);
      return { prevN: nodeOf(pts[k - 1]), nextN: nodeOf(pts[k]) };
    }
  };
  cam.mode = 'follow'; cam.manual = { x: 0, y: 0 };
  R.at = null;
  setActive(id);
  showToast(`Riding to ${s.nav}…`);
  updateTourBtn();
}

function arrive(s){
  ride = null; R.at = s.id; R.node = s.n;
  routeLine.setAttribute('opacity', 0);
  hideToast();
  visited.add(s.id);
  Object.entries(pinEls).forEach(([id, p]) => p.g.classList.toggle('here', id === s.id));
  if (visited.has(s.id)) pinEls[s.id].t.textContent = '✓';
  setActive(s.id);
  updateTourBtn();
  try { if (location.hash !== '#' + s.id) history.replaceState(null, '', '#' + s.id); } catch (e) {}
  openPanel(s);
}

/* ---------------- camera ---------------- */
const svg = document.getElementById('map');
const cam = { x: W / 2, y: H / 2, scale: 0.5, mode: 'overview', manual: { x: 0, y: 0 }, zoomMul: 1 };
const isMobile = () => innerWidth <= 820;
function overviewScale(){ if (isMobile()) return Math.min(innerWidth / 1250, (innerHeight - 200) / 1500); const sw = innerWidth - 270, sh = innerHeight; return Math.min(sw / (W - 300), sh / (H - 160)); }
function followScale(){ return Math.min(1.05, Math.max(innerWidth / 1150, 0.62)) * cam.zoomMul; }
function insets(){
  const p = document.getElementById('panel');
  if (!p.classList.contains('open')) return isMobile() ? { r: 0, b: 56, l: 0, t: 120 } : { r: 0, b: 0, l: 250, t: 0 };
  return isMobile() ? { r: 0, b: p.offsetHeight, l: 0, t: 120 } : { r: p.offsetWidth + 36, b: 0, l: 250, t: 0 };
}
function camTarget(){
  if (cam.mode === 'overview') return { x: W / 2 + cam.manual.x, y: H / 2 + cam.manual.y, scale: overviewScale() * cam.zoomMul };
  return { x: R.x + cam.manual.x, y: R.y + cam.manual.y, scale: followScale() };
}
function applyCam(){
  const sw = innerWidth, sh = innerHeight, ins = cam.mode === 'overview' ? (isMobile() ? { r: 0, b: 56, l: 0, t: 120 } : { r: 0, b: 0, l: 250, t: 0 }) : insets();
  const vw = sw / cam.scale, vh = sh / cam.scale;
  const cxPx = ins.l + (sw - ins.l - ins.r) / 2, cyPx = ins.t + (sh - ins.b - ins.t) / 2;
  svg.setAttribute('viewBox', `${(cam.x - cxPx / cam.scale).toFixed(2)} ${(cam.y - cyPx / cam.scale).toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`);
}

/* drag + wheel */
let drag = null, dragMoved = false;
svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, mx: cam.manual.x, my: cam.manual.y, id: e.pointerId }; dragMoved = false; });
svg.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!dragMoved && Math.hypot(dx, dy) > 6){ dragMoved = true; svg.classList.add('dragging'); try { svg.setPointerCapture(drag.id); } catch (er) {} }
  if (dragMoved){ cam.manual.x = drag.mx - dx / cam.scale; cam.manual.y = drag.my - dy / cam.scale; cam.x = camTarget().x; cam.y = camTarget().y; }
});
const endDrag = () => { drag = null; svg.classList.remove('dragging'); };
svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
svg.addEventListener('click', e => {
  if (dragMoved){ dragMoved = false; return; }
  const hit = e.target.closest('[data-stop]');
  if (hit) goTo(hit.getAttribute('data-stop'));
});
svg.addEventListener('wheel', e => { e.preventDefault(); cam.zoomMul = Math.min(2.2, Math.max(0.5, cam.zoomMul * Math.exp(-e.deltaY * 0.0015))); }, { passive: false });

/* ---------------- loop ---------------- */
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
let last = performance.now(), steer = 0;
function frame(now){
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (ride){
    const t = Math.min(1, (now - ride.t0) / ride.dur);
    const sv = ease(t) * ride.len, prevS = ride.s;
    ride.s = sv;
    const p = routeLine.getPointAtLength(sv);
    const a = routeLine.getPointAtLength(Math.max(0, sv - 3)), b = routeLine.getPointAtLength(Math.min(ride.len, sv + 3));
    let dx = b.x - a.x, dy = b.y - a.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const lane = 14 * smooth(Math.min(sv, ride.len - sv) / 60);
    ride.cx = p.x; ride.cy = p.y;
    R.x = p.x - dy * lane; R.y = p.y + dx * lane;
    const target = Math.atan2(dy, dx) * 180 / Math.PI;
    let diff = ((target - R.ang + 540) % 360) - 180;
    R.ang += diff * Math.min(1, dt * 14);
    steer += (Math.max(-28, Math.min(28, diff * 1.6)) - steer) * Math.min(1, dt * 10);
    R.phase += (sv - prevS) / 7;
    setLegs(R.phase);
    trail.push(`${R.x.toFixed(0)},${R.y.toFixed(0)}`); if (trail.length > 90) trail.shift();
    trailLine.setAttribute('points', trail.join(' '));
    if (t >= 1) arrive(ride.target);
  } else {
    steer *= 0.85;
    if (trail.length){ trail.shift(); trailLine.setAttribute('points', trail.join(' ')); }
  }
  placeRider(R.x, R.y, R.ang, steer);
  // camera
  const tg = camTarget(), k = reduceMotion ? 1 : 1 - Math.exp(-dt * (ride ? 5 : 3.2));
  if (!(drag && dragMoved)){ cam.x += (tg.x - cam.x) * k; cam.y += (tg.y - cam.y) * k; }
  cam.scale += (tg.scale - cam.scale) * k;
  applyCam();
  clouds.forEach(c => { c.x += c.v * dt; if (c.x - c.rx > W + 200) c.x = -c.rx - 200; c.el.setAttribute('cx', c.x.toFixed(1)); });
  frameHooks.forEach(fn => { try { fn(dt, now); } catch (e) { console.error(e); } });
  requestAnimationFrame(frame);
}

/* ---------------- UI ---------------- */
const route = document.getElementById('route');
const visited = new Set();
route.innerHTML = '<h2>Route</h2>';
let lastGrp = null;
STOPS.forEach(s => {
  if (s.group !== lastGrp && s.group !== 'Start'){ const g = document.createElement('div'); g.className = 'grp'; g.textContent = s.group; route.appendChild(g); }
  lastGrp = s.group;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.go = s.id;
  b.innerHTML = `<span class="dot" style="background:${s.color}"></span><span>${s.nav}<small>${s.sub}</small></span>`;
  route.appendChild(b);
});
function setActive(id){
  route.querySelectorAll('.chip').forEach(c => { c.classList.toggle('active', c.dataset.go === id); c.classList.toggle('visited', visited.has(c.dataset.go)); });
  const a = route.querySelector(`.chip[data-go="${id}"]`); if (a && isMobile()) a.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b && !b.closest('svg')) goTo(b.dataset.go); });

const intro = document.getElementById('intro');
function hideIntro(){ intro.classList.add('hide'); }
const toast = document.getElementById('toast'), toastText = document.getElementById('toastText');
function showToast(t){ toastText.textContent = t; toast.classList.add('show'); }
function hideToast(){ toast.classList.remove('show'); }

const panel = document.getElementById('panel'), body_ = document.getElementById('panelBody');
const esc = s => s.replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const tagsHTML = (arr, cls = '') => `<div class="tags">${arr.map(t => `<span class="tag ${cls}">${esc(t)}</span>`).join('')}</div>`;
function renderStop(s){
  let h = `<div class="kicker">${esc(s.kicker)}</div><h2>${esc(s.title)}</h2>`;
  if (s.kind === 'about'){
    h += `<p class="lead">I'm a Computer Science Honours Co-op student at the <b>University of Manitoba</b> (GPA 4.23/4.5), graduating in December 2027.</p>
      <p class="lead">I've spent three co-op terms shipping software in very different stacks (PHP/Laravel at <b>Birchwood</b>, Angular and C#/.NET at <b>Conquest Planning</b>, Ruby on Rails at <b>Priceline</b>) and a summer designing distributed algorithms at the <b>GADA Lab</b>.</p>
      <p class="lead">Use the button at the bottom of this panel and I'll ride you through each job, from most recent to first.</p>`;
  } else if (s.kind === 'projects'){
    h += `<p class="lead">Things I've built in school, from Android apps to a socket-based chat server.</p>`;
    PROJECTS.forEach(p => { h += `<div class="card"><h4>${esc(p.name)}</h4><div class="meta">${esc(p.meta)}</div><ul>${p.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>${tagsHTML(p.tags)}</div>`; });
    h += `<div class="contact"><a href="https://github.com/tomasHagos?tab=repositories" target="_blank" rel="noopener">More on GitHub <span>github.com/tomasHagos</span></a></div>`;
  } else if (s.kind === 'skills'){
    h += `<p class="lead">Darker tags are the ones I'm most fluent in.</p>`;
    SKILLS.forEach(g => { h += `<div class="skillgrp"><h5>${esc(g.h)}</h5><div class="tags">${g.strong.map(t => `<span class="tag strong">${esc(t)}</span>`).join('')}${g.rest.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>`; });
  } else if (s.kind === 'hobbies'){
    h += `<p class="lead">When I'm not writing code, this is where you'll find me.</p>`;
    HOBBIES.forEach(x => {
      h += `<div class="card hobby"><span class="hobby-ic" aria-hidden="true">${esc(x.icon || '')}</span><div><h4>${esc(x.title)}</h4><p>${esc(x.text)}</p>`;
      if (x.gamertag) h += `<div class="tags"><span class="tag strong">${esc(x.gamertag)}</span></div>`;
      h += `</div></div>`;
    });
  } else if (s.kind === 'contact'){
    h += `<p class="lead">I'm open to new-grad and co-op software roles. The fastest way to reach me is email.</p>
      <div class="contact">
        <a href="mailto:${EMAIL}">Email <span>${EMAIL}</span></a>
        <a href="https://www.linkedin.com/in/tomaskhagos" target="_blank" rel="noopener">LinkedIn <span>linkedin.com/in/tomaskhagos</span></a>
        <a href="https://github.com/tomasHagos" target="_blank" rel="noopener">GitHub <span>github.com/tomasHagos</span></a>
      </div>
      <button class="btn copy" type="button" id="copyEmail">Copy email address</button>`;
  } else {
    h += `<p class="org">${esc(s.org)}</p><div class="meta">${esc(s.meta)}</div>`;
    h += `<ul>${s.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`;
    if (s.tags) h += tagsHTML(s.tags);
  }
  return h;
}
function openPanel(s){
  panel.style.setProperty('--c', s.color);
  panel.querySelector('.band').style.background = s.color;
  body_.innerHTML = renderStop(s);
  body_.scrollTop = 0;
  const idx = STOPS.indexOf(s);
  const next = STOPS[(idx + 1) % STOPS.length], prev = STOPS[(idx - 1 + STOPS.length) % STOPS.length];
  const nb = document.getElementById('nextBtn'), pb = document.getElementById('prevBtn');
  nb.textContent = `${next.nav} →`; nb.onclick = () => goTo(next.id);
  pb.textContent = `← ${prev.nav}`; pb.onclick = () => goTo(prev.id);
  panel.classList.add('open');
  const ce = document.getElementById('copyEmail');
  if (ce) ce.onclick = async () => { try { await navigator.clipboard.writeText(EMAIL); ce.textContent = 'Copied!'; } catch (e) { ce.textContent = EMAIL; } };
}
function closePanel(){ panel.classList.remove('open'); }
document.getElementById('closeBtn').onclick = () => closePanel();
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePanel();
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !ride){
    const idx = Math.max(0, STOPS.findIndex(s => s.id === R.at));
    goTo(STOPS[(idx + (e.key === 'ArrowRight' ? 1 : STOPS.length - 1)) % STOPS.length].id);
  }
});
document.getElementById('overviewBtn').onclick = () => { closePanel(); cam.mode = 'overview'; cam.manual = { x: 0, y: 0 }; cam.zoomMul = 1; };
/* Top-right tour button: "Start the ride" before the first ride,
   then "Next: <stop>" pointing at the stop after the current/target one. */
const tourBtn = document.getElementById('tourBtn');
const rideStarted = () => !!ride || visited.size > 0;
function tourNextId(){
  if (!rideStarted()) return 'about';
  const cur = ride ? ride.target.id : R.at;
  const idx = STOPS.findIndex(s => s.id === cur);
  return STOPS[(idx + 1) % STOPS.length].id;
}
function updateTourBtn(){
  tourBtn.textContent = rideStarted() ? `Next: ${S[tourNextId()].nav} →` : 'Start the ride →';
}
tourBtn.onclick = () => goTo(tourNextId());

function fromHash(){ const id = location.hash.slice(1); if (S[id] && id !== R.at) goTo(id); }
addEventListener('hashchange', fromHash);
addEventListener('resize', applyCam);

/* Read-only handles for effects.js (weather + holiday decorations). */
const frameHooks = [];
window.PortfolioMap = {
  NS, el, svg, world, W, H, XS, YS, riverX, riverW, rand,
  layers: { ground: gGround, deco: gDeco, landmarks: gLand, route: gRoute, rider: gRider, clouds: gClouds },
  trees: TREES, houses: HOUSES, landmarks: LM, stops: S,
  riderBody: body,
  onFrame: fn => frameHooks.push(fn),
  reduceMotion,
};

cam.scale = overviewScale();
applyCam();
requestAnimationFrame(frame);
if (location.hash) setTimeout(fromHash, 400);
})();
