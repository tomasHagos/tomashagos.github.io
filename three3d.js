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
import { MapControls } from 'three/addons/controls/MapControls.min.js';
import { createTraffic } from './traffic3d.js';
import { createIntro } from './intro3d.js';
import { createAirport, AIRPORT } from './airport3d.js';
import { Sky } from 'three/addons/objects/Sky.min.js';
import { makeTextures, texturedMaterial, worldUV } from './textures3d.js';
import { createHouses, gableRoof } from './houses3d.js';
import { createCarKit, createWheels } from './cars3d.js';

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
renderer.shadowMap.type = THREE.PCFShadowMap;           // with shadow.radius for soft edges
renderer.shadowMap.autoUpdate = false;                 // static town: redraw shadows only when needed
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .36;                     // set by applyDaylight
renderer.domElement.id = 'scene3d';
renderer.domElement.setAttribute('aria-label', svg.getAttribute('aria-label') || 'Map');
svg.after(renderer.domElement);

const scene = new THREE.Scene();
// Portrait phones see a narrow slice horizontally, so they get a wider lens.
const fovFor = () => innerWidth < innerHeight ? 58 : 40;
const camera = new THREE.PerspectiveCamera(fovFor(), innerWidth / innerHeight, 5, 9000);
const hemi = new THREE.HemisphereLight(0xdff2ff, 0x6f8f4f, .3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 5);
sun.position.set(-900, 1400, -500);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -1500, right: 1500, top: 1100, bottom: -1100, near: 100, far: 4000 });
sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = .8; sun.shadow.radius = mobile ? 2 : 3.5;
scene.add(sun);

/* ---------------- sky (physically based) + reflections from it ---------------- */
const sky = new Sky(); sky.scale.setScalar(5200); scene.add(sky);
const SU = sky.material.uniforms;
SU.turbidity.value = 2.2; SU.rayleigh.value = 2.2; SU.mieCoefficient.value = .004; SU.mieDirectionalG.value = .8;
const SUN_DIR = sun.position.clone().normalize();
function skySun(elevDeg){                               // same compass direction as the light, any height
  const az = Math.atan2(SUN_DIR.x, SUN_DIR.z), el = THREE.MathUtils.degToRad(elevDeg);
  SU.sunPosition.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}
skySun(32);
// Reflections of the sky, used only on shiny things (glass, car paint): lighting every
// surface with it roughly doubled the drawing cost for little visible gain.
let ENV = null;
{ const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); envScene.add(sky.clone());
  ENV = pmrem.fromScene(envScene, .02).texture; pmrem.dispose(); }
const shiny = [];
const reflect = m => { m.envMap = ENV; m.envMapIntensity = .9; shiny.push(m); return m; };

/* ---------------- surface textures ---------------- */
const TEX = makeTextures(mobile);

/* ---------------- palettes (summer / snowy) ---------------- */
const PAL = {
  summer: { sky: 0xa9c3d8, ground: 0xe8f0dc, block: 0xffffff, park: 0xf2fae8, side: 0xffffff, bank: 0xd9c99a, water: 0x4f86a8, hemiSky: 0xdff2ff, hemiGround: 0x6f8f4f },
  snowy:  { sky: 0xc6d4e2, ground: 0xffffff, block: 0xffffff, park: 0xffffff, side: 0xe9eef3, bank: 0xdfe6ec, water: 0x9cc4dc, hemiSky: 0xe8f0f8, hemiGround: 0x9aa6b2 },
};
const SNOW = new THREE.Color(0xf4f8fb);
const mats = {};
const mat = (key, c, o = {}) => mats[key] ||= new THREE.MeshStandardMaterial({ color: c, roughness: .85, ...o });
const solid = (c, o) => mat('c' + c.toString(16) + JSON.stringify(o || {}), c, o);
const pickables = [];

function box(w, h, d, material, x, y, z, shadow = true){
  const geo = new THREE.BoxGeometry(w, h, d);
  if (material.map) worldUV(geo, x, z);                 // textured: 1 UV unit = 1 map unit
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m;
}
const flat = (w, d, material, x, z, y) => box(w, .6, d, material, x, y, z, false);

/* ---------------- ground, blocks, river, roads ---------------- */
const CURB = 40;
// grass (swapped for snow in winter), concrete sidewalks, asphalt roads
['ground', 'block', 'park'].forEach(k => { mats[k] = texturedMaterial(TEX.grass); });
mats.side = texturedMaterial(TEX.concrete, { roughness: .85 });
const ground = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2)).rotateX(Math.PI / 2), mats.ground);
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

const asphalt = texturedMaterial(TEX.asphalt, { roughness: .95 }), stripe = solid(0xe9c84e, { roughness: .7 }), side = mats.side;
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
const inAirport = t => t.x > AIRPORT.x0 - 10 && t.x < AIRPORT.x1 + 10 && t.y > AIRPORT.y0 - 10 && t.y < AIRPORT.y1 + 10;
const trees = M.trees.filter(t => t.g.isConnected && !inAirport(t));   // effects.js clears some for the Christmas tree; the airport needs open land
// Each tree: a tapered trunk and a canopy of several soft, slightly lumpy blobs,
// darker underneath. All canopies share one instanced mesh (per-blob colour).
const BLOBS = 3;
const GREENS = [0x355f26, 0x3f6d2c, 0x4a7a33, 0x2f5622, 0x557f37].map(c => new THREE.Color(c));
const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.5, 2.6, 1, 7), new THREE.MeshStandardMaterial({ color: 0x5a4433, roughness: 1 }), trees.length);
const blobGeo = (() => {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, col = [];   // 80 triangles per blob: cheap, still reads as a soft canopy
  for (let i = 0; i < p.count; i++){
    const v = new THREE.Vector3().fromBufferAttribute(p, i), n = 1 + Math.sin(v.x * 4.1) * Math.cos(v.y * 3.7) * Math.sin(v.z * 3.3) * .12;
    p.setXYZ(i, v.x * n, v.y * n * .9, v.z * n);
    const shade = .72 + .36 * (v.y * .5 + .5);            // darker underneath, lighter on top
    col.push(shade, shade, shade);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
})();
const leaves = new THREE.InstancedMesh(blobGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, envMapIntensity: .35 }), trees.length * BLOBS);
const leafBase = [];
{
  const o = new THREE.Object3D(), R = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  trees.forEach((t, i) => {
    const h = t.r * 1.15;
    o.position.set(X(t.x), h / 2, Z(t.y)); o.scale.set(t.r / 9, h, t.r / 9); o.rotation.set(0, 0, 0); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
    for (let k = 0; k < BLOBS; k++){
      const a = R(i, k) * Math.PI * 2, d = t.r * (k ? .38 + R(i, k + 9) * .2 : 0), s = t.r * (k ? .62 + R(i, k + 5) * .2 : .78);
      o.position.set(X(t.x) + Math.cos(a) * d, h + t.r * (.55 + R(i, k + 3) * .35), Z(t.y) + Math.sin(a) * d);
      o.scale.set(s, s, s); o.rotation.set(0, a, 0); o.updateMatrix(); leaves.setMatrixAt(i * BLOBS + k, o.matrix);
      leafBase.push(GREENS[(i + k) % GREENS.length].clone().offsetHSL(0, 0, (R(i, k + 7) - .5) * .05));
    }
  });
  [trunks, leaves].forEach(m => { m.castShadow = m.receiveShadow = true; scene.add(m); });
}

/* ---------------- houses (detailed, merged: see houses3d.js) ---------------- */
const houses = createHouses(scene, M, { X, Z, TEX, CURB });
reflect(houses.glass);

/* ---------------- landmarks ---------------- */
const LM = M.landmarks;
const centre = r => ({ cx: X(r.x + r.w / 2), cz: Z(r.y + r.h / 2) });
const glass = reflect(new THREE.MeshStandardMaterial({ color: 0x5f8299, roughness: .05, metalness: .65, emissive: 0xffc56e, emissiveIntensity: 0 }));
const roofCaps = [];                                     // turn white in snow
function cap(r, y, color){ const m = box(r.w + 4, 4, r.h + 4, solid(color), centre(r).cx, y + 2, centre(r).cz); m.material = m.material.clone(); m.userData.base = color; roofCaps.push(m); return m; }
const lobbyGlass = reflect(new THREE.MeshStandardMaterial({ color: 0x2c3e48, roughness: .04, metalness: .7 }));
const facadeMats = {};
const facade = c => facadeMats[c] ||= texturedMaterial(TEX.concrete, { color: c, roughness: .75 });
function tower(r, h, wall, roof, windows = true){
  const { cx, cz } = centre(r);
  box(r.w, h, r.h, facade(wall), cx, h / 2, cz);
  cap(r, h, roof);
  if (!windows) return;
  // glass lobby at street level, with an entrance canopy on the south side
  box(r.w + .6, 10, r.h * .9, lobbyGlass, cx, 5.5, cz, false);
  box(r.w * .9, 10, r.h + .6, lobbyGlass, cx, 5.5, cz, false);
  box(Math.min(40, r.w * .4), 2, 12, solid(0x2f3338), cx, 12, cz + r.h / 2 + 6);
  // window bands
  for (let y = 22; y < h - 8; y += 18){
    box(r.w + .8, 8, r.h * .9, glass, cx, y, cz, false);
    box(r.w * .9, 8, r.h + .8, glass, cx, y, cz, false);
  }
  // vertical frames (mullions) across every face
  const fins = [], STEP = 13;
  for (let x = -r.w / 2 + STEP; x < r.w / 2 - 4; x += STEP) [-1, 1].forEach(s => fins.push([cx + x, cz + s * (r.h / 2 + .7), 1.6, 1.4]));
  for (let z = -r.h / 2 + STEP; z < r.h / 2 - 4; z += STEP) [-1, 1].forEach(s => fins.push([cx + s * (r.w / 2 + .7), cz + z, 1.4, 1.6]));
  const finMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), solid(new THREE.Color(wall).multiplyScalar(.82).getHex()), fins.length);
  const o = new THREE.Object3D();
  fins.forEach(([x, z, w, d], i) => { o.position.set(x, 12 + (h - 12) / 2, z); o.scale.set(w, h - 14, d); o.updateMatrix(); finMesh.setMatrixAt(i, o.matrix); });
  scene.add(finMesh);
  // rooftop machinery
  box(Math.min(26, r.w * .3), 9, Math.min(22, r.h * .3), solid(0x9aa0a6), cx - r.w * .2, h + 8.5, cz - r.h * .15);
  [[.22, .2], [.3, -.22], [-.05, .28]].forEach(([fx, fz]) => box(9, 5, 9, solid(0xc5c9cc), cx + r.w * fx, h + 6.5, cz + r.h * fz));
}
const TOP = {};                                          // roof height per stop (labels, lights)
tower(LM.priceline, 230, 0xb9b2c9, 0x968daa);
{ const { cx, cz } = centre(LM.priceline); box(LM.priceline.w - 64, 40, LM.priceline.h - 68, solid(0xd6d0e2), cx, 250, cz); TOP.priceline = 270; }
tower(LM.conquest, 110, 0xe5e8e3, 0xc3c8c1); TOP.conquest = 114;
tower(LM.birchwood, 70, 0xd8cdb5, 0xb8ab90); TOP.birchwood = 74;
const lot = { x: LM.birchwood.x, y: LM.birchwood.y - 150, w: 240, h: 130 };
{
  const { cx, cz } = centre(lot);
  flat(lot.w, lot.h, asphalt, cx, cz, 2.5);
  const cc = [0x9c1a24, 0xe7e5df, 0x1f3550, 0x3b3f44, 0x8ecae6, 0xadb5bd, 0x2a9d8f];
  const kit = createCarKit(reflect), parked = [];
  const pHead = new THREE.MeshStandardMaterial({ color: 0xf6f3e8, roughness: .1 }), pTail = new THREE.MeshStandardMaterial({ color: 0xb3161b, roughness: .2 });
  for (let row = 0; row < 2; row++) for (let k = 0; k < 7; k++) if ((k * 3 + row) % 4){
    const car = kit.build(kit.TYPES[(k + row) % kit.TYPES.length], cc[(k + row) % cc.length], pHead, pTail);
    car.position.set(X(lot.x + 24 + k * 32), 2.8, Z(lot.y + 33 + row * 64));
    car.rotation.y = row ? -Math.PI / 2 : Math.PI / 2;     // nosed in to the parking lines
    car.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
    scene.add(car); parked.push(car);
  }
  createWheels(scene, kit, parked);
  // painted parking lines
  for (let row = 0; row < 2; row++) for (let k = 0; k <= 7; k++) flat(1.2, 48, solid(0xf2f2ee), X(lot.x + 8 + k * 32), Z(lot.y + 33 + row * 64), 3);
}
tower(LM.education, 60, 0xc9b8a6, 0xa8957f); TOP.education = 94;
{ const { cx, cz } = centre(LM.education); const d = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), solid(0x6fb59a, { roughness: .4, metalness: .3 })); d.position.set(cx, 64, cz); d.castShadow = true; scene.add(d); }
tower(LM.gada, 45, 0x9aa5b8, 0x7a869a); TOP.gada = 49;
const prism = new THREE.CylinderGeometry(1, 1, 1, 3); prism.rotateZ(Math.PI / 2);
const homeRoofMat = texturedMaterial(TEX.shingles, { color: 0xe08a6a, roughness: .95 });
homeRoofMat.map = homeRoofMat.map.clone(); homeRoofMat.normalMap = homeRoofMat.normalMap && homeRoofMat.normalMap.clone(); [homeRoofMat.map, homeRoofMat.normalMap].filter(Boolean).forEach(t => { t.repeat.set(1 / 30, 1 / 30); t.needsUpdate = true; });
const homeRoof = new THREE.Mesh(gableRoof(LM.about.w, LM.about.h, LM.about.h * .45, 5), homeRoofMat);
let homeGlass = null;
{ const r = LM.about, { cx, cz } = centre(r);
  // Home: a bigger two-storey version of the town's houses
  const homeWall = texturedMaterial(TEX.siding, { color: 0xfbf1dc });
  homeWall.map = homeWall.map.clone(); homeWall.normalMap = homeWall.normalMap && homeWall.normalMap.clone(); [homeWall.map, homeWall.normalMap].filter(Boolean).forEach(t => { t.repeat.set(1 / 26, 1 / 26); t.needsUpdate = true; });
  box(r.w + 3, 3, r.h + 3, facade(0x9c988f), cx, 1.5, cz);
  box(r.w, 50, r.h, homeWall, cx, 25, cz);
  const trimM = solid(0xf3f1ec, { roughness: .6 }), hGlass = reflect(new THREE.MeshStandardMaterial({ color: 0x1a242c, roughness: .06, metalness: .55, emissive: 0xffcf80, emissiveIntensity: 0 }));
  homeGlass = hGlass;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => box(2, 50, 2, trimM, cx + sx * r.w / 2, 25, cz + sz * r.h / 2));
  [14, 36].forEach(y => [-.36, -.12, .12, .36].forEach(f => [1, -1].forEach(side => {
    if (y === 14 && side === 1 && Math.abs(f) < .2) return;                                   // door goes here
    box(13, 12, 1, trimM, cx + f * r.w, y + 6, cz + side * (r.h / 2 + .3), false);
    box(11, 10, 1.2, hGlass, cx + f * r.w, y + 6, cz + side * (r.h / 2 + .4), false);
    box(13, 1, 2.4, trimM, cx + f * r.w, y - .3, cz + side * (r.h / 2 + 1), false);
  })));
  box(10, 20, 1.2, solid(0x5b2f22, { roughness: .45 }), cx, 12.5, cz + r.h / 2 + .4);   // front door
  box(24, 1.4, 12, trimM, cx, 25, cz + r.h / 2 + 6);                                        // porch roof
  [-10, 10].forEach(o => box(1.6, 22, 1.6, trimM, cx + o, 13, cz + r.h / 2 + 11));
  box(26, 2.4, 13, facade(0xa9a59c), cx, 1.2, cz + r.h / 2 + 6.5);
  homeRoof.position.set(cx, 50, cz); homeRoof.castShadow = homeRoof.receiveShadow = true; scene.add(homeRoof);
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
  // Light strings hang from each roof's real edge, like real ones: a dark wire
  // clipped under the roof lip that sags between clips, with small bulbs along it.
  // Flat roofs: under the cap's 2-unit lip. Home: along both eaves, then up and
  // over the two gable ends (ridge runs east-west).
  const ROOFH = { priceline: 230, conquest: 110, birchwood: 70, education: 60, gada: 45, projects: 46, contact: 55, hobbies: 34 };
  const wire = [], BULB = 6.5, CLIP = 26;
  const string = (a, b, sag) => {                 // one edge, a/b = [x, y, z] world points
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), spans = Math.max(1, Math.round(len / CLIP));
    const at = t => { const u = (t * spans) % 1; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * t]; };
    const steps = spans * 8;
    for (let k = 0; k < steps; k++) wire.push(...at(k / steps), ...at((k + 1) / steps));
    const n = Math.max(1, Math.round(len / BULB));
    for (let k = 0; k < n; k++){ const q = at((k + .5) / n); spots.push([q[0], q[1] - 1.3, q[2]]); }
  };
  const loop = (pts, sag) => pts.forEach((p, i) => string(p, pts[(i + 1) % pts.length], sag));
  Object.keys(ROOFH).forEach(id => {
    const r = LM[id], y = ROOFH[id] - .4, o = 1.6;
    const x0 = X(r.x - o), x1 = X(r.x + r.w + o), z0 = Z(r.y - o), z1 = Z(r.y + r.h + o);
    loop([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], 3);
  });
  { const r = LM.about, ov = 4.6, y = 48.4, rise = r.h * .45;
    const x0 = X(r.x - ov), x1 = X(r.x + r.w + ov), z0 = Z(r.y - ov), z1 = Z(r.y + r.h + ov), zc = (z0 + z1) / 2;
    string([x0, y, z1], [x1, y, z1], 2.5);        // front eave
    string([x0, y, z0], [x1, y, z0], 2.5);        // back eave
    [x0, x1].forEach(x => { string([x, y, z1], [x, y + rise, zc], 0); string([x, y + rise, zc], [x, y, z0], 0); });
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  xmas.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x15301c })));
  const geo = new THREE.SphereGeometry(1.25, 8, 6); geo.scale(1, 1.35, 1);   // small, slightly egg-shaped bulbs
  [bulbsA, bulbsB].forEach((arr, half) => {
    const pts = spots.filter((_, i) => i % 2 === half);
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), pts.length);
    const o = new THREE.Object3D();
    pts.forEach((p, i) => { o.position.set(...p); o.scale.setScalar(i * 2 + half < 40 ? 1.8 : 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, new THREE.Color(cols[(i + half) % 4])); });
    xmas.add(m); arr.push(m);
  });
  // Santa hat on the rider
  const hat = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(5.6, 13, 12), solid(0xd62828)); cone.position.set(5, 55, 0); cone.rotation.z = .9; hat.add(cone);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), solid(0xffffff)); pom.position.set(-1, 58, 0); hat.add(pom);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(6, 1.6, 8, 20), solid(0xffffff)); brim.rotation.x = Math.PI / 2; brim.position.set(9, 50, 0); hat.add(brim);
  bike.add(hat); bike.userData.helmet.material = solid(0xd62828);
}

/* ---------------- day / night (Winnipeg's real sun, from sun.js) ---------------- */
const daySky = new THREE.Color(0xa9d4f0), dayHemi = new THREE.Color(0xdff2ff), dayHemiGround = new THREE.Color(0x6f8f4f);
const NIGHT_SKY = new THREE.Color(0x0b1426), DUSK = new THREE.Color(0xf0926a), MOON = new THREE.Color(0x9db4ff), SUNC = new THREE.Color(0xfff1dc);
scene.background = new THREE.Color(); 
let lastDay = -1;
// street lamps on every corner of every intersection
const LAMP_SPOTS = [];
XS.forEach(x => YS.forEach(y => [[-1, -1], [1, 1]].forEach(([sx, sy]) => LAMP_SPOTS.push([X(x + sx * 38), Z(y + sy * 38)]))));
const lampPoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.3, 30, 6), solid(0x3a3f45), LAMP_SPOTS.length);
const lampHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(3.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe6a8 }), LAMP_SPOTS.length);
{ const o = new THREE.Object3D();
  LAMP_SPOTS.forEach(([x, z], i) => { o.position.set(x, 15, z); o.updateMatrix(); lampPoles.setMatrixAt(i, o.matrix); o.position.set(x, 31, z); o.updateMatrix(); lampHeads.setMatrixAt(i, o.matrix); });
  scene.add(lampPoles, lampHeads); }
// soft pools of light under each lamp (additive), only visible at night
function glowTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,220,150,1)'); r.addColorStop(.4, 'rgba(255,200,120,.45)'); r.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTexture();
const poolMat = new THREE.MeshBasicMaterial({ map: GLOW, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(90, 90), poolMat, LAMP_SPOTS.length);
{ const o = new THREE.Object3D(); o.rotation.x = -Math.PI / 2;
  LAMP_SPOTS.forEach(([x, z], i) => { o.position.set(x, 4.5, z); o.updateMatrix(); pools.setMatrixAt(i, o.matrix); }); pools.renderOrder = 2; scene.add(pools); }
const haloMat = new THREE.SpriteMaterial({ map: GLOW, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
const halos = LAMP_SPOTS.map(([x, z]) => { const s = new THREE.Sprite(haloMat); s.position.set(x, 31, z); s.scale.set(26, 26, 1); scene.add(s); return s; });
// (house windows are built with the houses; applyDaylight makes them glow at night)
// stars
const starGeo = new THREE.BufferGeometry(), sp = [];
for (let i = 0; i < 700; i++){ const a = Math.random() * Math.PI * 2, e = .08 + Math.random() * 1.2, r = 4200; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat); scene.add(stars);

// Day and night values are tuned for this exposure range; everything in between is a blend.
const FOG_DAY = new THREE.Color(0xa9c3d8);
function applyDaylight(day){
  if (Math.abs(day - lastDay) < .004) return;
  lastDay = day;
  const night = 1 - day, dusk = 4 * day * (1 - day), mix = (a, b) => a + (b - a) * day;
  skySun(day * 38 - 7);                                      // the sky itself goes to twilight and night
  sky.visible = day > .02;
  scene.background.copy(NIGHT_SKY);
  if (scene.fog) scene.fog.color.copy(NIGHT_SKY).lerp(FOG_DAY.clone().lerp(daySky, .5), day).lerp(DUSK, dusk * .3);
  renderer.toneMappingExposure = mix(.5, .5);
  sun.intensity = mix(1.1, 5);                               // moonlight at night
  sun.color.copy(MOON).lerp(SUNC, day).lerp(DUSK, dusk * .4);
  hemi.intensity = mix(.9, 1.25);                           // sky fill light (replaces sky reflections on plain surfaces)
  hemi.color.copy(new THREE.Color(0x4a5a8a)).lerp(dayHemi, day);
  hemi.groundColor.copy(new THREE.Color(0x1c2233)).lerp(dayHemiGround, day);
  shiny.forEach(m => { m.envMapIntensity = mix(.08, .9); });
  const lit = Math.max(0, Math.min(1, (night - .25) / .5));   // lights switch on around dusk
  glass.emissiveIntensity = .85 * lit;
  houses.setNight(lit);
  if (homeGlass) homeGlass.emissiveIntensity = 1.1 * lit;
  poolMat.opacity = .55 * lit; haloMat.opacity = .9 * lit; pools.visible = lit > .01; halos.forEach(h => { h.visible = lit > .01; });
  lampHeads.material.color.setHex(lit > .01 ? 0xffe6a8 : 0xd9dde2);
  starMat.opacity = Math.max(0, night - .35) / .65;
  if (traffic) traffic.setNight(lit);
  airport.setNight(lit);
  dirty = true;
}

/* ---------------- palette switching (snow) ---------------- */
let snowy = null;
function applyPalette(){
  const s = svg.classList.contains('snowy');
  if (s === snowy) return;
  snowy = s;
  const P = s ? PAL.snowy : PAL.summer;
  ['ground', 'block', 'park', 'side', 'bank', 'water'].forEach(k => mats[k] && mats[k].color.setHex(P[k]));
  ['ground', 'block', 'park'].forEach(k => { mats[k].map = (s ? TEX.snow : TEX.grass).map; mats[k].normalMap = (s ? TEX.snow : TEX.grass).normalMap; mats[k].needsUpdate = true; });
  daySky.setHex(P.sky); dayHemi.setHex(P.hemiSky); dayHemiGround.setHex(P.hemiGround);
  scene.fog = new THREE.Fog(P.sky, 1500, 4200);
  lastDay = -1;                          // re-apply lighting with the new palette
  for (let i = 0; i < leafBase.length; i++){ const c = leafBase[i].clone(); if (s) c.lerp(SNOW, .5); leaves.setColorAt(i, c); }
  leaves.instanceColor.needsUpdate = true;
  houses.setSnow(s);
  roofCaps.forEach(m => m.material.color.set(s ? new THREE.Color(m.userData.base).lerp(SNOW, .85) : m.userData.base));
  tents.forEach(t => t.material.color.set(s ? new THREE.Color(t.userData.base).lerp(SNOW, .45) : t.userData.base));
  homeRoof.material.color.set(s ? new THREE.Color(0xf4f7fa) : 0xe08a6a);
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
const traffic = M.reduceMotion ? null : createTraffic(scene, M, { X, Z, mobile, reflect });
const airport = createAirport(scene, { X, Z, mat, solid, moving: !M.reduceMotion, worldUV });
// first-visit parachute intro; when it ends the camera pulls back to the overview
const intro = createIntro({ THREE, scene, camera, controls, rig, M, X, Z, mobile, holiday: FX.holiday, enabled: mode === '3d',
  onEnd(){ if (!M.rider().riding){ follow = false; flyTo(OVERVIEW.target, OVERVIEW.offset, 1500); } } });
let dayCheck = 0;
// Shader programs are compiled in the background (parallel where the browser supports it)
// before the first 3D frame, so the page keeps responding and the 2D map stays up meanwhile.
let shadersReady = false;
function frame(dt, now){
  if (mode !== '3d' || !shadersReady) return;
  applyPalette();
  if (now - dayCheck > 1000 || lastDay < 0){ dayCheck = now; applyDaylight(window.PortfolioSun ? PortfolioSun.daylight() : 1); }
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
  if (reveal){
    // tilt from the 2D-matching top-down view into the 3D overview
    const k = Math.min(1, (now - reveal.t0) / reveal.ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    if (now >= reveal.t0){
      controls.target.lerpVectors(reveal.fromT, reveal.toT, e);
      camera.position.lerpVectors(reveal.fromP, reveal.toP, e);
    }
    camera.lookAt(controls.target);
    if (k >= 1){ reveal = null; controls.update(); }
    dirty = true;
  } else if (intro.active){
    intro.update(dt, now);                 // the intro drives the camera until it ends
    dirty = true;
  } else if (tween){
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
  if (!intro.active && !reveal) controls.update();
  updateViewOffset();
  // Christmas bulbs blink in two groups, ~8 times a second at most
  if (bulbsA.length && now - lastTwinkle > 120){
    lastTwinkle = now; const s = .5 + .5 * Math.sin(now / 450);
    bulbsA[0].material.opacity = .35 + .65 * s; bulbsB[0].material.opacity = .35 + .65 * (1 - s); dirty = true;
  }
  if (traffic){ traffic.update(dt, r.riding ? r : { x: r.x, y: r.y }); dirty = true; }
  airport.update(dt);   // the town is always moving now
  if (booting) startReveal(now);
  if (dirty){ dirty = false; renderer.render(scene, camera); if (booting){ booting = false; fadeIn(); } }
}
let booting = document.documentElement.classList.contains('boot-3d');

/* ---------------- 2D -> 3D hand-off ----------------
   The 2D map is on screen while this module loads. For the first 3D frame,
   put the camera straight above the same spot at the height that shows the
   same area, so the 3D town lines up with the 2D map. Fade it in over the
   2D map, then tilt down into the usual 3D overview. */
let reveal = null;
function startReveal(now){
  if (intro.active) return;                                  // the intro has its own opening shot
  const r = M.rider(), panelOpen = document.getElementById('panel').classList.contains('open');
  if (r.riding || panelOpen) return;                         // they've already started: just follow
  // match the 3D picture offset to the side panel / route bar right away
  const ins = M.panelInset(), navLeft = !mobile ? 125 : 0;
  viewOff = { x: ins.r / 2 - navLeft, y: ins.b / 2 };
  camera.setViewOffset(innerWidth, innerHeight, viewOff.x, viewOff.y, innerWidth, innerHeight);
  // what the 2D map shows: its viewBox is in the same map units
  const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  if (vb.length !== 4 || !vb[2]) return;
  const [vx, vy, vw, vh] = vb;
  const px = innerWidth / 2 - viewOff.x, py = innerHeight / 2 - viewOff.y;   // screen point on the 3D camera's axis
  const P = new THREE.Vector3(X(vx + px * vw / innerWidth), 0, Z(vy + py * vh / innerHeight));
  const h = (vh / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(P.x, h, P.z + .01);                    // north up, like the 2D map
  controls.target.copy(P);
  camera.lookAt(P);
  reveal = { t0: now + 650, ms: 1700, fromT: P.clone(), fromP: camera.position.clone(),
             toT: OVERVIEW.target.clone(), toP: OVERVIEW.target.clone().add(OVERVIEW.offset) };
}
function fadeIn(){
  const html = document.documentElement;
  html.classList.remove('boot-3d');                          // canvas fades to full opacity (CSS transition)
  html.classList.add('fading-3d');
  setTimeout(() => html.classList.remove('fading-3d'), 600); // 2D map hides once 3D fully covers it
}
M.onFrame(frame);
{
  applyPalette(); applyDaylight(window.PortfolioSun ? PortfolioSun.daylight() : 1);   // compile with the materials as they'll first be drawn
  const done = () => { shadersReady = true; dirty = true; };
  (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera))).then(done, done);
  setTimeout(done, 15000);                                   // never wait forever
}
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
  if (m === '2d') document.documentElement.classList.remove('boot-3d');
}
viewBtn.addEventListener('click', () => { if (intro.active) intro.skip(); setMode(mode === '3d' ? '2d' : '3d'); });
setMode(mode);
window.Portfolio3D = { renderer, scene, camera, controls, setMode, traffic, airport, get mode(){ return mode; }, get weave(){ return weave; } };
