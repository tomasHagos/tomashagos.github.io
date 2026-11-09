/*
 * 3D view of the portfolio town (Three.js r187, vendored in /vendor/three).
 *
 * app.js still runs everything: routes, rides, panels, the tour button. This
 * file only *draws* that state in 3D and turns taps on buildings into rides.
 * The 2D SVG map stays in the page, hidden, and the 2D/3D button swaps them.
 *
 *   ?view=2d  starts in 2D (the choice is also remembered per browser)
 *   Phones/browsers without WebGL fall back to 2D automatically.
 */
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { createTraffic } from './traffic3d.js';

const M = window.PortfolioMap;
if (!M) throw new Error('three3d.js needs app.js');
const FX = window.PortfolioEffects || { holiday: null };
const { W, H, XS, YS, ROAD } = M;
const X = x => x - W / 2, Z = y => y - H / 2;            // map (x, y) -> world (x, z)
const mobile = M.isMobile();
const svg = document.getElementById('map');

/* ---------------- 2D / 3D mode ---------------- */
function webglOK(){ try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
const params = new URLSearchParams(location.search);
let mode = '3d';
try { const saved = localStorage.getItem('portfolio-view'); if (saved === '2d' || saved === '3d') mode = saved; } catch (e) {}
if (params.get('view') === '2d' || params.get('view') === '3d') mode = params.get('view');
if (!webglOK()) mode = '2d';

const viewBtn = document.createElement('button');
viewBtn.className = 'btn'; viewBtn.type = 'button'; viewBtn.id = 'viewBtn';
const controlsBar = document.querySelector('.controls');
const ctlRow = document.createElement('div'); ctlRow.className = 'ctl-row';
const overviewBtn = document.getElementById('overviewBtn');
controlsBar.insertBefore(ctlRow, overviewBtn);
ctlRow.append(viewBtn, overviewBtn);

/* ---------------- renderer, scene, camera ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;                 // static town: redraw shadows only when needed
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.id = 'scene3d';
renderer.domElement.setAttribute('aria-label', svg.getAttribute('aria-label') || 'Map');
svg.after(renderer.domElement);

const scene = new THREE.Scene();
// Portrait phones see a narrow slice horizontally, so they get a wider lens.
const fovFor = () => innerWidth < innerHeight ? 58 : 40;
const camera = new THREE.PerspectiveCamera(fovFor(), innerWidth / innerHeight, 5, 9000);
const hemi = new THREE.HemisphereLight(0xdff2ff, 0x6f8f4f, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(-900, 1400, -500);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -1500, right: 1500, top: 1100, bottom: -1100, near: 100, far: 4000 });
sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
sun.shadow.bias = -0.0005;
scene.add(sun);

/* ---------------- palettes (summer / snowy) ---------------- */
const PAL = {
  summer: { sky: 0xa9d4f0, ground: 0x86b862, block: 0x9fcb7a, park: 0x8cc266, side: 0xd8d1c1, bank: 0xd9c99a, water: 0x4f93bd, hemiSky: 0xdff2ff, hemiGround: 0x6f8f4f },
  snowy:  { sky: 0xcfdbe6, ground: 0xe9eef3, block: 0xf4f7fa, park: 0xedf2f6, side: 0xdde2e6, bank: 0xdfe6ec, water: 0x9cc4dc, hemiSky: 0xe8f0f8, hemiGround: 0x9aa6b2 },
};
const SNOW = new THREE.Color(0xf4f8fb);
const mats = {};
const mat = (key, c, o = {}) => mats[key] ||= new THREE.MeshStandardMaterial({ color: c, roughness: .85, ...o });
const solid = (c, o) => mat('c' + c.toString(16) + JSON.stringify(o || {}), c, o);
const pickables = [];

function box(w, h, d, material, x, y, z, shadow = true){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m;
}
const flat = (w, d, material, x, z, y) => box(w, .6, d, material, x, y, z, false);

/* ---------------- ground, blocks, river, roads ---------------- */
const CURB = 40;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), mat('ground', 0));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
for (let j = 0; j < YS.length - 1; j++) for (let i = 0; i < XS.length - 1; i++){
  const x0 = XS[i] + CURB, x1 = XS[i + 1] - CURB, y0 = YS[j] + CURB, y1 = YS[j + 1] - CURB;
  flat(x1 - x0, y1 - y0, mat(i === 2 ? 'park' : 'block', 0), X((x0 + x1) / 2), Z((y0 + y1) / 2), .4);
}
function ribbon(off, material, y){
  const L = [], R = [];
  for (let yy = -500; yy <= H + 500; yy += 20){ L.push([M.riverX(yy) - M.riverW(yy) - off, yy]); R.push([M.riverX(yy) + M.riverW(yy) + off, yy]); }
  const shape = new THREE.Shape();
  L.forEach(([x, yy], k) => k ? shape.lineTo(X(x), Z(yy)) : shape.moveTo(X(x), Z(yy)));
  R.reverse().forEach(([x, yy]) => shape.lineTo(X(x), Z(yy)));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  m.rotation.x = Math.PI / 2; m.position.y = y; m.receiveShadow = true; scene.add(m);
}
ribbon(14, mat('bank', 0), 1.2);
ribbon(0, mat('water', 0, { roughness: .2, metalness: .1 }), 1.6);

const asphalt = solid(0x4c5259), stripe = solid(0xf2d16b), side = mat('side', 0);
const x0 = XS[0], x1 = XS[XS.length - 1], y0 = YS[0], y1 = YS[YS.length - 1];
YS.forEach(y => { flat(x1 - x0 + CURB * 2, CURB * 2, side, X((x0 + x1) / 2), Z(y), 2); flat(x1 - x0 + ROAD * 2, ROAD * 2, asphalt, X((x0 + x1) / 2), Z(y), 3); });
XS.forEach(x => { flat(CURB * 2, y1 - y0 + CURB * 2, side, X(x), Z((y0 + y1) / 2), 2); flat(ROAD * 2, y1 - y0 + ROAD * 2, asphalt, X(x), Z((y0 + y1) / 2), 3); });
// lane dashes, instanced
{
  const dashes = [];
  YS.forEach(y => { for (let x = x0 + 40; x < x1 - 20; x += 48) if (!XS.some(v => Math.abs(v - x) < 40)) dashes.push([X(x), Z(y), 26, 3]); });
  XS.forEach(x => { for (let y = y0 + 40; y < y1 - 20; y += 48) if (!YS.some(v => Math.abs(v - y) < 40)) dashes.push([X(x), Z(y), 3, 26]); });
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .6, 1), stripe, dashes.length);
  const o = new THREE.Object3D();
  dashes.forEach(([x, z, w, d], i) => { o.position.set(x, 3.6, z); o.scale.set(w, 1, d); o.updateMatrix(); inst.setMatrixAt(i, o.matrix); });
  scene.add(inst);
}
YS.forEach(y => { const xr = M.riverX(y), half = M.riverW(y) + 26; [-1, 1].forEach(s => box(half * 2, 10, 4, solid(0x8a7f6e), X(xr), 8, Z(y) + s * (CURB - 2))); });

/* ---------------- trees (instanced) ---------------- */
const trees = M.trees.filter(t => t.g.isConnected);   // effects.js clears some for the Christmas tree
const GREENS = [0x3f7a35, 0x4f8a3c, 0x5c9a45, 0x2f6b33, 0x6aa64e].map(c => new THREE.Color(c));
const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.2, 3, 1, 6), solid(0x6b4f3a), trees.length);
const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: .85, flatShading: true }), trees.length);
{
  const o = new THREE.Object3D();
  trees.forEach((t, i) => {
    const h = t.r * 1.2;
    o.position.set(X(t.x), h / 2, Z(t.y)); o.scale.set(1, h, 1); o.rotation.set(0, 0, 0); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
    o.position.set(X(t.x), h + t.r * .7, Z(t.y)); o.scale.set(t.r, t.r * 1.1, t.r); o.rotation.y = i; o.updateMatrix(); leaves.setMatrixAt(i, o.matrix);
  });
  [trunks, leaves].forEach(m => { m.castShadow = m.receiveShadow = true; scene.add(m); });
}

/* ---------------- houses (instanced walls + gable roofs) ---------------- */
const ROOFS = [0xc8553d, 0x8d6e63, 0x577590, 0x9c6644, 0x6d597a, 0xb56576, 0x7a8b6f, 0xc08552].map(c => new THREE.Color(c));
const WALLS = [0xf3ede2, 0xe9e1d3, 0xdfe6ea].map(c => new THREE.Color(c));
const prism = new THREE.CylinderGeometry(1, 1, 1, 3); prism.rotateZ(Math.PI / 2);
const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: .9 }), M.houses.length);
const roofs = new THREE.InstancedMesh(prism, new THREE.MeshStandardMaterial({ roughness: .8, flatShading: true }), M.houses.length);
{
  const o = new THREE.Object3D();
  M.houses.forEach((hs, i) => {
    const h = 26 + (i * 7) % 18, cx = X(hs.x + hs.w / 2), cz = Z(hs.y + hs.h / 2);
    o.position.set(cx, h / 2, cz); o.rotation.set(0, 0, 0); o.scale.set(hs.w - 4, h, hs.h - 4); o.updateMatrix(); walls.setMatrixAt(i, o.matrix);
    walls.setColorAt(i, WALLS[i % 3]);
    const horiz = hs.w >= hs.h, len = horiz ? hs.w : hs.h, span = horiz ? hs.h : hs.w;
    o.position.set(cx, h + span * .28, cz); o.rotation.set(0, horiz ? 0 : Math.PI / 2, 0); o.scale.set(len, span * .62, span * .62); o.updateMatrix(); roofs.setMatrixAt(i, o.matrix);
  });
  [walls, roofs].forEach(m => { m.castShadow = m.receiveShadow = true; scene.add(m); });
}

/* ---------------- landmarks ---------------- */
const LM = M.landmarks;
const centre = r => ({ cx: X(r.x + r.w / 2), cz: Z(r.y + r.h / 2) });
const glass = solid(0x9ecae1, { roughness: .15, metalness: .3 });
const roofCaps = [];                                     // turn white in snow
function cap(r, y, color){ const m = box(r.w + 4, 4, r.h + 4, solid(color), centre(r).cx, y + 2, centre(r).cz); m.material = m.material.clone(); m.userData.base = color; roofCaps.push(m); return m; }
function tower(r, h, wall, roof, windows = true){
  const { cx, cz } = centre(r);
  box(r.w, h, r.h, solid(wall), cx, h / 2, cz);
  cap(r, h, roof);
  if (windows) for (let y = 14; y < h - 8; y += 18){
    box(r.w + .8, 7, r.h * .86, glass, cx, y, cz, false);
    box(r.w * .86, 7, r.h + .8, glass, cx, y, cz, false);
  }
}
const TOP = {};                                          // roof height per stop (labels, lights)
tower(LM.priceline, 230, 0xb9b2c9, 0x968daa);
{ const { cx, cz } = centre(LM.priceline); box(LM.priceline.w - 64, 40, LM.priceline.h - 68, solid(0xd6d0e2), cx, 250, cz); TOP.priceline = 270; }
tower(LM.conquest, 110, 0xe5e8e3, 0xc3c8c1); TOP.conquest = 114;
tower(LM.birchwood, 70, 0xd8cdb5, 0xb8ab90); TOP.birchwood = 74;
const lot = { x: LM.birchwood.x, y: LM.birchwood.y - 150, w: 240, h: 130 };
{
  const { cx, cz } = centre(lot);
  flat(lot.w, lot.h, solid(0x5d6268), cx, cz, 2.5);
  const cc = [0xe63946, 0xf1faee, 0x1d3557, 0xffb703, 0x8ecae6, 0xadb5bd];
  for (let row = 0; row < 2; row++) for (let k = 0; k < 7; k++) if ((k * 3 + row) % 4){
    const x = X(lot.x + 24 + k * 32), z = Z(lot.y + 33 + row * 64);
    box(20, 10, 36, solid(cc[(k + row) % cc.length], { roughness: .35, metalness: .2 }), x, 7, z);
    box(17, 7, 16, solid(0x2b3740, { roughness: .2 }), x, 14, z + (row ? 2 : -2));
  }
}
tower(LM.education, 60, 0xc9b8a6, 0xa8957f); TOP.education = 94;
{ const { cx, cz } = centre(LM.education); const d = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), solid(0x6fb59a, { roughness: .4, metalness: .3 })); d.position.set(cx, 64, cz); d.castShadow = true; scene.add(d); }
tower(LM.gada, 45, 0x9aa5b8, 0x7a869a); TOP.gada = 49;
const homeRoof = new THREE.Mesh(prism, new THREE.MeshStandardMaterial({ color: 0xe76f51, roughness: .8, flatShading: true }));
{ const r = LM.about, { cx, cz } = centre(r);
  box(r.w, 50, r.h, solid(0xfbf3e6), cx, 25, cz);
  homeRoof.scale.set(r.w + 10, r.h * .62, r.h * .62); homeRoof.position.set(cx, 50 + r.h * .29, cz); homeRoof.castShadow = true; scene.add(homeRoof);
  box(14, 30, 14, solid(0x6b4f43), cx - 40, 85, cz - 20); TOP.about = 50 + r.h * .6; }
{ const r = LM.projects, { cx, cz } = centre(r);
  box(r.w, 46, r.h, solid(0xf4a261), cx, 23, cz); cap(r, 46, 0xd9874a);
  for (let k = 0; k < 3; k++) box(36, 30, 2, glass, X(r.x + 44 + k * 56), 20, Z(r.y + r.h) + 1, false);
  TOP.projects = 50; }
const tents = [];
{ const r = LM.skills; flat(r.w, r.h, solid(0xead9b5), centre(r).cx, centre(r).cz, 2.5);
  [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x457b9d, 0x9b5de5, 0x06d6a0].forEach((c, k) => {
    const x = X(r.x + 47 + (k % 3) * 74), z = Z(r.y + 43 + Math.floor(k / 3) * 66);
    const t = new THREE.Mesh(new THREE.ConeGeometry(38, 36, 4), new THREE.MeshStandardMaterial({ color: c, roughness: .8, flatShading: true }));
    t.userData.base = c; tents.push(t);
    t.rotation.y = Math.PI / 4; t.position.set(x, 34, z); t.castShadow = true; scene.add(t);
    box(46, 16, 46, solid(0xfbf6ea), x, 8, z);
  });
  TOP.skills = 52; }
tower(LM.contact, 55, 0x4f6d94, 0x3b577c, false); TOP.contact = 59;
box(16, 26, 16, solid(0xd62828), X(LM.contact.x - 18), 13, Z(LM.contact.y + LM.contact.h - 11));
{ const P = M.pitch, { cx, cz } = centre(P);
  for (let k = 0; k < 8; k++) flat(P.w / 8, P.h, solid(k % 2 ? 0x3f9a46 : 0x4caf50), X(P.x + (k + .5) * P.w / 8), cz, 2.4);
  [P.x + 6, P.x + P.w - 6].forEach(x => box(3, 14, 22, solid(0xffffff), X(x), 7, cz));
  flat(2, P.h - 12, solid(0xffffff), cx, cz, 3);
  tower(LM.hobbies, 34, 0x3d405b, 0x2b2d42, false); TOP.hobbies = 38; }

// Invisible tap targets: one box per stop, covering its whole site.
const SITE = { birchwood: { x: lot.x, y: lot.y, w: lot.w, h: LM.birchwood.y + LM.birchwood.h - lot.y }, hobbies: { x: M.pitch.x, y: M.pitch.y, w: M.pitch.w, h: LM.hobbies.y + LM.hobbies.h - M.pitch.y } };
const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
Object.keys(M.stops).forEach(id => {
  const r = SITE[id] || LM[id]; if (!r) return;
  const h = TOP[id] || 60, { cx, cz } = centre(r);
  const m = new THREE.Mesh(new THREE.BoxGeometry(r.w + 20, h + 20, r.h + 20), pickMat);
  m.position.set(cx, h / 2, cz); m.userData.stop = id; scene.add(m); pickables.push(m);
});

/* ---------------- labels ---------------- */
const NAMES = { about: 'Home', birchwood: 'Birchwood', conquest: 'Conquest Planning', priceline: 'Priceline', gada: 'GADA Lab', education: 'U of Manitoba', projects: 'Projects', skills: 'Skills', hobbies: 'Hobbies', contact: 'Contact' };
const LABEL_PX = mobile ? 24 : 28;                      // label height on screen, in CSS pixels
const labels = [];
function label(id, text, color, x, y, z){
  const c = document.createElement('canvas'), g = c.getContext('2d'), f = 46;
  const font = `800 ${f}px 'Bricolage Grotesque', system-ui, sans-serif`;
  g.font = font; const w = Math.ceil(g.measureText(text).width) + 50; c.width = w; c.height = 84;
  g.font = font; g.fillStyle = '#fffdf7'; g.strokeStyle = color; g.lineWidth = 8;
  g.beginPath(); g.roundRect(4, 4, w - 8, 76, 22); g.fill(); g.stroke();
  g.fillStyle = '#1d2321'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 45);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false }));
  s.center.set(.5, 0); s.position.set(x, y, z); s.renderOrder = 10; s.userData = { stop: id, aspect: w / 84 };
  scene.add(s); labels.push(s); pickables.push(s);
}
// Non-attenuated sprites are sized in view space at distance 1, so convert pixels -> units.
function sizeLabels(){
  const h = LABEL_PX / ((innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  labels.forEach(s => s.scale.set(h * s.userData.aspect, h, 1));
}
function makeLabels(){
  labels.splice(0).forEach(s => { scene.remove(s); const i = pickables.indexOf(s); if (i >= 0) pickables.splice(i, 1); });
  Object.entries(M.stops).forEach(([id, s]) => { const r = LM[id]; if (!r) return; const { cx, cz } = centre(r); label(id, NAMES[id] || s.nav, s.color, cx, (TOP[id] || 60) + 14, cz); });
  sizeLabels(); dirty = true;
}
let dirty = true;
makeLabels();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(makeLabels);   // redraw once the web font is in

/* ---------------- cyclist (small: about a quarter of a house) ---------------- */
const bike = new THREE.Group();
const wheels = [];
{
  const dark = solid(0x1f1f1f), red = solid(0xe76f51, { metalness: .4, roughness: .4 });
  [-13, 13].forEach(x => { const w = new THREE.Mesh(new THREE.TorusGeometry(9, 1.8, 8, 20), dark); w.position.set(x, 10, 0); bike.add(w); wheels.push(w); });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(28, 2.6, 2.6), red); frame.position.set(0, 15, 0); bike.add(frame);
  const post = new THREE.Mesh(new THREE.BoxGeometry(2.6, 10, 2.6), red); post.position.set(-6, 20, 0); bike.add(post);
  const bars = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 16), solid(0x2b2b2b)); bars.position.set(12, 26, 0); bike.add(bars);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(5.5, 12, 4, 10), solid(0x2f80ed)); torso.position.set(1, 34, 0); torso.rotation.z = -.75; bike.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(5.5, 16, 12), solid(0x8d5a3b)); head.position.set(9, 45, 0); bike.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(6.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), solid(0xffd23f)); helmet.position.set(9, 46, 0); bike.add(helmet);
  bike.userData.helmet = helmet;
}
const legs = [-1, 1].map(s => {
  const hip = new THREE.Group(); hip.position.set(-5, 27, s * 4.5);
  const leg = new THREE.Mesh(new THREE.CapsuleGeometry(2.7, 13, 4, 8), solid(0x26324a)); leg.position.y = -8; hip.add(leg);
  bike.add(hip); return hip;
});
// no cast shadow: shadows are drawn once for the static town; the rider gets a blob instead
const riderBlob = new THREE.Mesh(new THREE.CircleGeometry(7, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .25, depthWrite: false }));
riderBlob.rotation.x = -Math.PI / 2; riderBlob.position.y = .4;
const RIDER_SCALE = .34;                                  // ~16 units tall vs houses at 26–44
bike.scale.setScalar(RIDER_SCALE);
const rig = new THREE.Group();             // position + heading; the bike inside leans into swerves
rig.add(bike, riderBlob); riderBlob.position.y = .3; scene.add(rig);
// a soft ring under the rider so you can spot him from far away
const ring = new THREE.Mesh(new THREE.RingGeometry(9, 13, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: .85, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; scene.add(ring);

/* ---------------- route dots ---------------- */
const MAX_DOTS = 400;
const dots = new THREE.InstancedMesh(new THREE.CylinderGeometry(3.2, 3.2, .8, 10), new THREE.MeshBasicMaterial({ color: 0xfffdf7 }), MAX_DOTS);
dots.count = 0; scene.add(dots);
let shownRide = 0;
function updateRoute(r){
  if (r.rideId === shownRide) return;
  shownRide = r.rideId;
  const pts = r.riding ? M.routePoints(22) : null;
  dots.count = 0;
  if (pts){
    const o = new THREE.Object3D();
    pts.slice(0, MAX_DOTS).forEach((p, i) => { o.position.set(X(p.x), 4.2, Z(p.y)); o.updateMatrix(); dots.setMatrixAt(i, o.matrix); });
    dots.count = Math.min(pts.length, MAX_DOTS); dots.instanceMatrix.needsUpdate = true;
  }
}

/* ---------------- Christmas extras ---------------- */
const xmas = new THREE.Group(); scene.add(xmas);
const bulbsA = [], bulbsB = [];
if (FX.holiday === 'christmas'){
  const cx = X(1585), cz = Z(878);
  [[60, 50, 30], [48, 46, 70], [34, 42, 106], [20, 36, 138]].forEach(([r, h, y]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), solid(0x1f6b3a, { flatShading: true })); c.position.set(cx, y, cz); c.castShadow = true; xmas.add(c); });
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(9), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: .8 })); star.position.set(cx, 165, cz); xmas.add(star);
  [[-64, 44, 0xd62828], [-42, 62, 0x3a86ff], [52, 54, 0xf2c14e], [66, 30, 0x2a9d8f]].forEach(([dx, dz, c]) => { const g = box(18, 16, 18, solid(c), cx + dx, 8, cz + dz); scene.remove(g); xmas.add(g); });
  // twinkling bulbs: on the tree and along the landmark rooftops
  const cols = [0xff4d4d, 0xffd23f, 0x3ddc84, 0x4da3ff];
  const spots = [];
  for (let k = 0; k < 40; k++){ const a = k * 2.4, y = 20 + (k * 11) % 120, r = 52 * (1 - y / 160) + 4; spots.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]); }
  Object.keys(TOP).forEach(id => { if (id === 'skills') return; const r = LM[id], y = TOP[id] - (id === 'about' ? 18 : 0) + 3;
    const per = 2 * (r.w + r.h), n = Math.round(per / 16);
    for (let k = 0; k < n; k++){ let d = k * per / n, px, py;
      if (d < r.w){ px = r.x + d; py = r.y; } else if ((d -= r.w) < r.h){ px = r.x + r.w; py = r.y + d; } else if ((d -= r.h) < r.w){ px = r.x + r.w - d; py = r.y + r.h; } else { d -= r.w; px = r.x; py = r.y + r.h - d; }
      spots.push([X(px), id === 'priceline' ? 232 : y, Z(py)]); } });
  const geo = new THREE.SphereGeometry(2.6, 8, 6);
  [bulbsA, bulbsB].forEach((arr, half) => {
    const pts = spots.filter((_, i) => i % 2 === half);
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), pts.length);
    const o = new THREE.Object3D();
    pts.forEach((p, i) => { o.position.set(...p); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, new THREE.Color(cols[(i + half) % 4])); });
    xmas.add(m); arr.push(m);
  });
  // Santa hat on the rider
  const hat = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(5.6, 13, 12), solid(0xd62828)); cone.position.set(5, 55, 0); cone.rotation.z = .9; hat.add(cone);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), solid(0xffffff)); pom.position.set(-1, 58, 0); hat.add(pom);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(6, 1.6, 8, 20), solid(0xffffff)); brim.rotation.x = Math.PI / 2; brim.position.set(9, 50, 0); hat.add(brim);
  bike.add(hat); bike.userData.helmet.material = solid(0xd62828);
}

/* ---------------- palette switching (snow) ---------------- */
let snowy = null;
function applyPalette(){
  const s = svg.classList.contains('snowy');
  if (s === snowy) return;
  snowy = s;
  const P = s ? PAL.snowy : PAL.summer;
  ['ground', 'block', 'park', 'side', 'bank', 'water'].forEach(k => mats[k] && mats[k].color.setHex(P[k]));
  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.Fog(P.sky, 1600, 4200);
  hemi.color.setHex(P.hemiSky); hemi.groundColor.setHex(P.hemiGround);
  trees.forEach((t, i) => { const c = GREENS[i % GREENS.length].clone(); if (s) c.lerp(SNOW, .55); leaves.setColorAt(i, c); });
  M.houses.forEach((h, i) => { const c = ROOFS[i % ROOFS.length].clone(); if (s) c.lerp(SNOW, .8); roofs.setColorAt(i, c); });
  leaves.instanceColor.needsUpdate = roofs.instanceColor.needsUpdate = true;
  roofCaps.forEach(m => m.material.color.set(s ? new THREE.Color(m.userData.base).lerp(SNOW, .85) : m.userData.base));
  tents.forEach(t => t.material.color.set(s ? new THREE.Color(t.userData.base).lerp(SNOW, .45) : t.userData.base));
  homeRoof.material.color.set(s ? new THREE.Color(0xe76f51).lerp(SNOW, .85) : 0xe76f51);
  renderer.shadowMap.needsUpdate = true; dirty = true;
}
applyPalette();
new MutationObserver(applyPalette).observe(svg, { attributes: true, attributeFilter: ['class'] });

/* ---------------- camera: overview, follow, gestures ---------------- */
const controls = new MapControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: .09, screenSpacePanning: false, minDistance: 70, maxDistance: 3400, maxPolarAngle: 1.3, minPolarAngle: .2, zoomSpeed: 1.1 });
controls.addEventListener('change', () => { dirty = true; });
const OVERVIEW = { target: new THREE.Vector3(X(1200), 0, Z(850) + 40), offset: new THREE.Vector3(-250, 1250, 1500) };
if (mobile) OVERVIEW.offset.set(-120, 1650, 1650);
camera.position.copy(OVERVIEW.target).add(OVERVIEW.offset);
controls.target.copy(OVERVIEW.target);
controls.update();

let follow = false, tween = null, userMoving = false;
controls.addEventListener('start', () => { userMoving = true; tween = null; follow = false; });
controls.addEventListener('end', () => { userMoving = false; });
function flyTo(target, offset, ms = 1300){
  tween = { t0: performance.now(), ms, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: target.clone(), toP: target.clone().add(offset) };
  dirty = true;
}
document.getElementById('overviewBtn').addEventListener('click', () => { if (mode === '3d'){ follow = false; flyTo(OVERVIEW.target, OVERVIEW.offset); } });

// Where the camera wants to be while following:
//  riding  -> behind and above the rider, looking the way he's going
//  arrived -> on the rider's side of the building, so the building is behind him
const BACK = mobile ? 300 : 250, UP = mobile ? 250 : 175;
const want = { target: new THREE.Vector3(), pos: new THREE.Vector3() };
function followPose(r){
  const rider = new THREE.Vector3(X(r.x), 0, Z(r.y));
  const dir = new THREE.Vector3();
  const site = !r.riding && r.stop && (SITE[r.stop] || LM[r.stop]);
  if (site){
    const c = centre(site);
    dir.set(rider.x - c.cx, 0, rider.z - c.cz).normalize();
    // turn a little so the rider doesn't block the middle of the building
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), .45);
    want.target.copy(rider).lerp(new THREE.Vector3(c.cx, 0, c.cz), mobile ? .55 : .4);
    want.target.y = Math.min(60, (TOP[r.stop] || 40) * .35);
    const back = (BACK * 1.25 + Math.min(260, (TOP[r.stop] || 60) * .6)) * (mobile ? 2 : 1);
    want.pos.copy(want.target).addScaledVector(dir, back).add(new THREE.Vector3(0, UP * 1.2 + (TOP[r.stop] || 0) * .35, 0));
  } else {
    const a = r.ang * Math.PI / 180;
    dir.set(-Math.cos(a), 0, -Math.sin(a));
    want.target.copy(rider).addScaledVector(dir, -60);   // look a bit ahead of him
    want.pos.copy(rider).addScaledVector(dir, BACK).add(new THREE.Vector3(0, UP, 0));
  }
  return want;
}

// Shift the picture so the rider sits above the bottom sheet / left of the side panel.
let viewOff = { x: 0, y: 0 };
function updateViewOffset(){
  const ins = M.panelInset(), navLeft = !mobile ? 125 : 0;
  const want = { x: ins.r / 2 - navLeft, y: ins.b / 2 };
  const nx = viewOff.x + (want.x - viewOff.x) * .15, ny = viewOff.y + (want.y - viewOff.y) * .15;
  if (Math.abs(nx - viewOff.x) > .05 || Math.abs(ny - viewOff.y) > .05){ viewOff = { x: nx, y: ny }; dirty = true; }
  camera.setViewOffset(innerWidth, innerHeight, viewOff.x, viewOff.y, innerWidth, innerHeight);
}

/* taps on buildings / labels start a ride */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), n: (down && down.n || 0) + 1 }; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), quick = performance.now() - down.t < 450;
  down = null;
  if (moved > 8 || !quick || !e.isPrimary) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  if (hit) M.goTo(hit.object.userData.stop);
});

/* ---------------- per-frame sync ---------------- */
const tmp = new THREE.Vector3();
let lastRide = '', lastTwinkle = 0, lastPose = '', weave = 0, lean = 0;
const traffic = M.reduceMotion ? null : createTraffic(scene, M, { X, Z, mobile });
function frame(dt, now){
  if (mode !== '3d') return;
  applyPalette();
  const r = M.rider();
  // rider pose
  // swerve left around cars ahead, then tuck back into the lane
  const a = r.ang * Math.PI / 180;
  const wantWeave = traffic ? traffic.weaveFor(r) : 0;
  const prevWeave = weave;
  weave += (wantWeave - weave) * (1 - Math.exp(-dt * 11));
  const lx = Math.sin(a), ly = -Math.cos(a);                  // left of travel, in map units
  const wx = r.x + lx * weave, wy = r.y + ly * weave;
  rig.position.set(X(wx), 3.2, Z(wy));
  const swerve = dt ? (weave - prevWeave) / dt : 0;           // sideways speed
  rig.rotation.y = -a + Math.max(-.35, Math.min(.35, swerve * .004));
  lean += (Math.max(-.45, Math.min(.45, -swerve * .006)) - lean) * (1 - Math.exp(-dt * 10));
  bike.rotation.x = lean;
  ring.position.set(X(wx), 3.8, Z(wy));
  wheels.forEach(w => { w.rotation.z = -r.phase * .9; });
  legs.forEach((hip, i) => { hip.rotation.z = Math.sin(r.phase + i * Math.PI) * .7; });
  const pose = `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.ang.toFixed(1)}`;
  if (pose !== lastPose){ lastPose = pose; dirty = true; }
  updateRoute(r);
  // a new ride, or arriving somewhere, puts the camera back in follow mode
  const key = r.rideId + '|' + r.stop;
  if (key !== lastRide && (r.riding || r.stop)){ if (lastRide !== '') follow = true; lastRide = key; }
  if (tween){
    const k = Math.min(1, (now - tween.t0) / tween.ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    controls.target.lerpVectors(tween.fromT, tween.toT, e);
    camera.position.lerpVectors(tween.fromP, tween.toP, e);
    if (k >= 1) tween = null;
    dirty = true;
  } else if (follow && !userMoving){
    const p = followPose(r);
    const kt = 1 - Math.exp(-dt * 4), kp = 1 - Math.exp(-dt * (r.riding ? 2.4 : 1.6));
    const before = camera.position.clone();
    controls.target.lerp(p.target, kt);
    camera.position.lerp(p.pos, kp);
    if (before.distanceToSquared(camera.position) > 1e-4) dirty = true;
  }
  controls.update();
  updateViewOffset();
  // Christmas bulbs blink in two groups, ~8 times a second at most
  if (bulbsA.length && now - lastTwinkle > 120){
    lastTwinkle = now; const s = .5 + .5 * Math.sin(now / 450);
    bulbsA[0].material.opacity = .35 + .65 * s; bulbsB[0].material.opacity = .35 + .65 * (1 - s); dirty = true;
  }
  if (traffic){ traffic.update(dt, r.riding ? r : { x: r.x, y: r.y }); dirty = true; }   // the town is always moving now
  if (dirty){ dirty = false; renderer.render(scene, camera); }
}
M.onFrame(frame);
renderer.shadowMap.needsUpdate = true;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.fov = fovFor(); camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); sizeLabels(); dirty = true;
});

/* ---------------- switching views ---------------- */
function setMode(m){
  mode = m;
  document.body.classList.toggle('view-3d', m === '3d');
  renderer.domElement.style.display = m === '3d' ? 'block' : 'none';   // Three.js sets display inline, so override it here
  viewBtn.textContent = mobile ? (m === '3d' ? '2D' : '3D') : (m === '3d' ? '2D map' : '3D view');
  viewBtn.setAttribute('aria-label', m === '3d' ? 'Switch to the 2D map' : 'Switch to the 3D view');
  try { localStorage.setItem('portfolio-view', m); } catch (e) {}
  dirty = true;
}
viewBtn.addEventListener('click', () => setMode(mode === '3d' ? '2d' : '3d'));
setMode(mode);
window.Portfolio3D = { renderer, scene, camera, controls, setMode, traffic, get mode(){ return mode; }, get weave(){ return weave; } };
