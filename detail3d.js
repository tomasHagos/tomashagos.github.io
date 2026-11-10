/*
 * Second pass for the 3D town: the extra realism.
 *
 * three3d.js builds a quick version of the town so something is on screen fast.
 * Once that is showing, it fetches this file, which adds the rest one piece at a
 * time, each in a gap between frames so the page never freezes:
 *
 *   sharper surface textures      window grids on the office towers (random lit rooms at night)
 *   crosswalks                    bushes and driveways around the houses
 *   soft shading at wall bases    roof parapets and a mast with a beacon
 *   rippling, reflective river    clouds on the horizon
 *   fuller trees (computers)      glow around lights at night (dropped if the device is slow)
 *   plus everything in places3d.js: yards, car parks, parks, street furniture, more trees
 *
 * Nothing in here is needed for the site to work: if it fails, the quick town stays.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.min.js';
import { makeTextures, texturedMaterial, worldUV } from './textures3d.js';
import { placeStages } from './places3d.js';

const idle = () => new Promise(r => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 50)));
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export async function enhance(c){
  const { scene, camera, renderer } = c;
  // compile an object's shaders off the main thread where possible, then show it
  const add = async obj => { try { if (renderer.compileAsync) await renderer.compileAsync(obj, camera, scene); } catch (e) {} scene.add(obj); c.touch(); };
  c.bushGeo = c.leaves.geometry;                 // the light canopy shape, kept for bushes
  const stages = [
    () => { c.houses.finish(); c.touch(true); }, () => facades(c, add), () => markings(c, add), () => yards(c, add),
    ...placeStages(c, add), () => contactShade(c, add), ...textureStages(c),
    () => rooftops(c, add), () => water(c), () => clouds(c, add), () => trees(c), () => glow(c),
  ];
  for (const stage of stages){
    await idle();
    try { await stage(); } catch (e) { console.warn('detail stage skipped', e); }
  }
  c.touch(true);                                  // one shadow redraw for everything that was added
}

/* ---------- sharper textures: repaint each surface at double size, swap it in ---------- */
function textureStages(c){
  const { scene, TEX, mobile } = c;
  const defs = makeTextures(mobile, { size: mobile ? 512 : 1024, normals: !mobile, lazy: true });
  const aniso = Math.min(8, c.renderer.capabilities.getMaxAnisotropy());
  return Object.keys(defs).map(name => () => {
    const old = TEX[name], neu = defs[name]();
    [neu.map, neu.normalMap].filter(Boolean).forEach(t => { t.anisotropy = aniso; });
    const seen = new Set();
    const swap = m => {
      if (!m || seen.has(m)) return; seen.add(m);
      const cur = m.map;
      if (!cur || cur.source !== old.map.source) return;
      const like = n => { if (cur === old.map && !m.normalMap) return n; const t = n.clone(); t.repeat.copy(cur.repeat); t.offset.copy(cur.offset); t.needsUpdate = true; return t; };
      if (neu.normalMap){ const had = !!m.normalMap; if (had && m.normalMap !== old.normalMap) m.normalMap.dispose(); m.normalMap = cur === old.map ? neu.normalMap : like(neu.normalMap); if (!had) m.needsUpdate = true; }   // first bumps: shader rebuilds once
      if (cur === old.map) m.map = neu.map; else { m.map = like(neu.map); cur.dispose(); }
    };
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(swap); });
    Object.values(c.mats).forEach(swap);          // includes materials that are swapped in and out (grass / snow)
    if (old.map) old.map.dispose(); if (old.normalMap) old.normalMap.dispose();
    Object.assign(old, neu);
    c.touch();
  });
}

/* ---------- office towers: a real grid of windows, each one a bit different ---------- */
function facades(c, add){
  const { TOWERS, X, Z, mobile } = c;
  const CELLS = mobile ? 8 : 16, PX = 64, S = CELLS * PX, CW = 13, CH = 18, Y0 = 13;   // one cell = one window bay (13 wide, 18 tall)
  const mk = () => { const cv = document.createElement('canvas'); cv.width = cv.height = S; return cv; };
  const col = mk(), emi = mk(), orm = mk(), g = col.getContext('2d'), e = emi.getContext('2d'), o = orm.getContext('2d');
  g.fillStyle = '#ece9e2'; g.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  o.fillStyle = 'rgb(0,215,0)'; o.fillRect(0, 0, S, S);                 // green = roughness, blue = metalness
  const R = rng(77), LIGHTS = ['#ffcf8a', '#ffdca6', '#ffe9c4', '#fff3de', '#dfe9ff'];
  // faint panel joints on the wall between windows
  g.fillStyle = 'rgba(60,60,60,.16)'; for (let k = 0; k <= CELLS; k++){ g.fillRect(0, k * PX - 1, S, 2); }
  for (let row = 0; row < CELLS; row++) for (let cl = 0; cl < CELLS; cl++){
    const x = cl * PX + 5, y = row * PX + 8, w = PX - 10, h = Math.round(PX * .64);
    const gr = g.createLinearGradient(0, y, 0, y + h), t = R() * 14;
    gr.addColorStop(0, `rgb(${70 + t},${98 + t},${122 + t})`); gr.addColorStop(1, `rgb(${22 + t},${34 + t},${48 + t})`);
    g.fillStyle = '#2b3036'; g.fillRect(x - 2, y - 2, w + 4, h + 4);     // frame
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    o.fillStyle = 'rgb(0,18,215)'; o.fillRect(x, y, w, h);              // glass: smooth and mirror-like
    const blind = R() < .55 ? Math.round(h * (.15 + R() * .6)) : 0;
    if (blind){ g.fillStyle = `rgba(${205 + R() * 25},${200 + R() * 25},${188 + R() * 25},.92)`; g.fillRect(x, y, w, blind); o.fillStyle = 'rgb(0,170,0)'; o.fillRect(x, y, w, blind); }
    g.fillStyle = '#2b3036'; g.fillRect(x + w / 2 - 1, y, 2, h);         // centre mullion
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x - 3, y + h + 2, w + 6, 3);   // sill
    if (R() < .34){                                                      // someone is in: this room is lit at night
      const cK = LIGHTS[Math.floor(R() * LIGHTS.length)], a = .55 + R() * .45;
      const lg = e.createLinearGradient(0, y, 0, y + h); lg.addColorStop(0, cK); lg.addColorStop(1, '#8a6a3c');
      e.globalAlpha = a; e.fillStyle = lg; e.fillRect(x, y, w, h);
      if (blind){ e.globalAlpha = a * .75; e.fillStyle = cK; e.fillRect(x, y, w, blind); }
      e.globalAlpha = 1; e.fillStyle = '#000'; e.fillRect(x + w / 2 - 1, y, 2, h);
      if (R() < .4){ e.fillStyle = 'rgba(0,0,0,.55)'; const fx = x + 4 + R() * (w - 16); e.fillRect(fx, y + h - 14, 10, 14); }   // desk / furniture shape
    }
  }
  const tex = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const ormT = tex(orm, false);
  const mat = c.reflect(new THREE.MeshStandardMaterial({ map: tex(col, true), emissiveMap: tex(emi, true), emissive: 0xffffff, emissiveIntensity: 0,
    roughnessMap: ormT, metalnessMap: ormT, roughness: 1, metalness: 1, vertexColors: true }));
  const pos = [], uv = [], colr = [];
  const quad = (a, b, cc, d, u0, u1, v0, v1, k) => {
    [[a, u0, v0], [b, u1, v0], [cc, u1, v1], [a, u0, v0], [cc, u1, v1], [d, u0, v1]].forEach(([p, u, v]) => { pos.push(...p); uv.push(u, v); colr.push(k.r, k.g, k.b); });
  };
  TOWERS.forEach((t, ti) => {                      // the low, plain buildings get a floor or two of windows as well
    const base = t.windows ? Y0 : 4, r = t.r, rows = Math.floor((t.h - base - 3) / CH), y0 = base, y1 = base + rows * CH, O = t.windows ? .95 : .35;
    if (rows < 1) return;
    const xa = X(r.x), xb = X(r.x + r.w), za = Z(r.y), zb = Z(r.y + r.h);
    const k = new THREE.Color(t.wall).lerp(new THREE.Color(0xffffff), .25);
    const v0 = (ti * 3 % CELLS) / CELLS, v1 = v0 + rows / CELLS;
    const U = (len, f) => { const u0 = ((ti * 5 + f * 3) % CELLS) / CELLS; return [u0, u0 + len / CW / CELLS]; };
    let u;
    if (t.wall !== 0xf4a261) u = U(r.w, 0), quad([xa, y0, zb + O], [xb, y0, zb + O], [xb, y1, zb + O], [xa, y1, zb + O], u[0], u[1], v0, v1, k);   // south
    u = U(r.w, 1); quad([xb, y0, za - O], [xa, y0, za - O], [xa, y1, za - O], [xb, y1, za - O], u[0], u[1], v0, v1, k);   // north
    u = U(r.h, 2); quad([xb + O, y0, zb], [xb + O, y0, za], [xb + O, y1, za], [xb + O, y1, zb], u[0], u[1], v0, v1, k);   // east
    u = U(r.h, 3); quad([xa - O, y0, za], [xa - O, y0, zb], [xa - O, y1, zb], [xa - O, y1, za], u[0], u[1], v0, v1, k);   // west
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true;
  const night = lit => { mat.emissiveIntensity = 1.2 * lit; };
  night(c.lit()); c.HOOKS.night.push(night);
  return add(mesh).then(() => { TOWERS.forEach(t => t.bands.forEach(b => { b.visible = false; })); });   // the plain glass bands are replaced
}

/* ---------- crosswalks at every intersection ---------- */
function markings(c, add){
  const { XS, YS, X, Z, ROAD } = c, spots = [];
  XS.forEach((x, i) => YS.forEach((y, j) => {
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      if ((dx < 0 && i === 0) || (dx > 0 && i === XS.length - 1) || (dy < 0 && j === 0) || (dy > 0 && j === YS.length - 1)) return;   // no road that way
      for (let s = -ROAD + 4.5; s <= ROAD - 4.4; s += 7){
        if (dx) spots.push([X(x + dx * (ROAD + 9)), Z(y + s), 11, 3.4]); else spots.push([X(x + s), Z(y + dy * (ROAD + 9)), 3.4, 11]);
      }
    });
  }));
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .5, 1), new THREE.MeshStandardMaterial({ color: 0xf0efe9, roughness: .75 }), spots.length);
  const o = new THREE.Object3D(), R = rng(5), k = new THREE.Color();
  spots.forEach(([x, z, w, d], i) => { o.position.set(x, 3.42, z); o.scale.set(w, 1, d); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, k.setScalar(.78 + R() * .22)); });   // a little worn
  m.receiveShadow = true;
  return add(m);
}

/* ---------- yards: bushes by the houses, driveways to the garages ---------- */
function yards(c, add){
  const { houses, TEX, leaves, SNOW } = c, lots = houses.lots, v = new THREE.Vector3(), R = rng(9);
  const spots = [], drives = [];
  lots.forEach(l => {
    const f = l.front + 3.2, b = -l.Dp / 2 - 3;
    const want = [[-l.Wd * .42, f], [-l.Wd * .18 + (l.garage ? -3 : 9), f], [-l.Wd * .4, b], [l.Wd * .4, b]];
    if (!l.garage) want.push([l.Wd * .42, f]);
    want.forEach(([x, z]) => { if (Math.abs(x - l.doorX) < 6.5 && z > 0) return; v.set(x, 2.3, z).applyMatrix4(l.m); spots.push([v.x, v.y, v.z, 3.1 + R() * 1.5]); });
    if (l.garage){
      const len = Math.max(4, l.toEdge + 6.4), g = new THREE.BoxGeometry(l.Wd * .38, .5, len); worldUV(g, l.i * 2.3, l.i * 1.7);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(l.m, new THREE.Matrix4().makeTranslation(l.Wd * .22, .75, l.front + len / 2)));
      drives.push(g);
    }
  });
  const group = new THREE.Group();
  const GREENS = [0x35602a, 0x2f5a2c, 0x416b2e, 0x4b7434, 0x2c5230].map(h => new THREE.Color(h));
  const bushMat = leaves.material.clone();
  const bushes = new THREE.InstancedMesh(leaves.geometry, bushMat, spots.length), o = new THREE.Object3D(), base = [];
  spots.forEach(([x, y, z, s], i) => { o.position.set(x, y, z); o.scale.set(s * 1.15, s * .85, s * 1.15); o.rotation.y = i * 1.7; o.updateMatrix(); bushes.setMatrixAt(i, o.matrix); base.push(GREENS[i % GREENS.length].clone().offsetHSL(0, 0, (R() - .5) * .06)); });
  const tint = s => { base.forEach((k, i) => bushes.setColorAt(i, s ? k.clone().lerp(SNOW, .55) : k)); bushes.instanceColor.needsUpdate = true; };
  tint(c.isSnowy()); c.HOOKS.snow.push(tint);
  bushes.castShadow = bushes.receiveShadow = true; group.add(bushes);
  if (drives.length){
    const dm = new THREE.Mesh(mergeGeometries(drives, false), texturedMaterial(TEX.concrete, { color: 0xb9b6ae }));
    dm.receiveShadow = true; group.add(dm);
  }
  return add(group);
}

/* ---------- soft dark shading where walls meet the ground ---------- */
function contactShade(c, add){
  const { houses, TOWERS, LM, X, Z } = c;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.35, 'rgba(0,0,0,.5)'); gr.addColorStop(.7, 'rgba(0,0,0,.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const pos = [], uv = [], v = new THREE.Vector3();
  const frame = (w, d, mg, m) => {                 // a ring of quads around a w x d footprint, fading outwards
    const xs = [-w / 2 - mg, -w / 2, w / 2, w / 2 + mg], zs = [-d / 2 - mg, -d / 2, d / 2, d / 2 + mg], us = [0, .5, .5, 1];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++){
      if (i === 1 && j === 1) continue;
      [[i, j], [i, j + 1], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i + 1, j]].forEach(([a, b]) => { v.set(xs[a], 1.3, zs[b]).applyMatrix4(m); pos.push(v.x, v.y, v.z); uv.push(us[a], us[b]); });
    }
  };
  houses.lots.forEach(l => frame(l.Wd + 1.6, l.Dp + 1.6, 7, l.m));
  const rects = [...TOWERS.map(t => t.r), LM.about, LM.education];
  rects.forEach(r => frame(r.w, r.h, 14, new THREE.Matrix4().makeTranslation(X(r.x + r.w / 2), 0, Z(r.y + r.h / 2))));
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x060b14, map: tex, transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.renderOrder = 1;
  return add(m);
}

/* ---------- rooftops: a low wall around each flat roof, and a mast with a beacon ---------- */
function rooftops(c, add){
  const { TOWERS, X, Z, solid, M } = c, group = new THREE.Group();
  TOWERS.forEach(t => {
    const r = t.r, w = r.w + 4, d = r.h + 4, y = t.h + 4 + 1.5, cx = X(r.x + r.w / 2), cz = Z(r.y + r.h / 2), T = 1.8, parts = [];
    [[w, T, 0, -d / 2 + T / 2], [w, T, 0, d / 2 - T / 2], [T, d - T * 2, -w / 2 + T / 2, 0], [T, d - T * 2, w / 2 - T / 2, 0]].forEach(([bw, bd, ox, oz]) => { const g = new THREE.BoxGeometry(bw, 3, bd); g.translate(cx + ox, y, cz + oz); parts.push(g); });
    const m = new THREE.Mesh(mergeGeometries(parts, false), t.cap.material); m.castShadow = m.receiveShadow = true; group.add(m);
  });
  const tall = TOWERS.reduce((a, b) => b.h > a.h ? b : a);
  const cx = X(tall.r.x + tall.r.w / 2), cz = Z(tall.r.y + tall.r.h / 2), top = tall.h + 40;
  const steel = solid(0x8d939a, { metalness: .6, roughness: .4 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.5, 1.1, 52, 6), steel); mast.position.set(cx, top + 26, cz); mast.castShadow = true; group.add(mast);
  [16, 30].forEach(h => { const a = new THREE.Mesh(new THREE.BoxGeometry(9, .7, .7), steel); a.position.set(cx, top + h, cz); group.add(a); });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5a1010 })); beacon.position.set(cx, top + 53, cz); group.add(beacon);
  let on = false;
  c.HOOKS.update.push((dt, now) => {             // slow red blink once it gets dark
    const want = c.lit() > .3 && !M.reduceMotion ? (now % 1800) < 500 : c.lit() > .3;
    if (want !== on){ on = want; beacon.material.color.setRGB(on ? 4 : .35, on ? .25 : .06, on ? .2 : .06); c.touch(); }
  });
  return add(group);
}

/* ---------- river: ripples that move, and reflections of the sky ---------- */
function water(c){
  const m = c.mats.water; if (!m) return;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'), img = g.createImageData(S, S), R = rng(31);
  const waves = Array.from({ length: 9 }, () => ({ kx: Math.round((R() - .5) * 14), ky: Math.round(2 + R() * 9), a: .3 + R() * .7, p: R() * 6.28 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    let dx = 0, dy = 0;
    for (const w of waves){ const cs = Math.cos((w.kx * x + w.ky * y) / S * 6.2832 + w.p) * w.a; dx += cs * w.kx; dy += cs * w.ky; }
    dx *= .022; dy *= .022; const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    img.data[i] = (-dx / l * .5 + .5) * 255; img.data[i + 1] = (-dy / l * .5 + .5) * 255; img.data[i + 2] = (1 / l * .5 + .5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 190, 1 / 190);
  m.normalMap = t; m.normalScale = new THREE.Vector2(.5, .5); m.roughness = .22; m.metalness = .3; c.reflect(m); m.needsUpdate = true;
  if (!c.M.reduceMotion) c.HOOKS.update.push(dt => { t.offset.y -= dt * .02; t.offset.x += dt * .004; c.touch(); });
  c.touch();
}

/* ---------- clouds drifting along the horizon ---------- */
function clouds(c, add){
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const g = cv.getContext('2d'), R = rng(61);
  for (let k = 0; k < 26; k++){
    const x = 50 + R() * 156, y = 62 + (R() - .5) * 34, r = 16 + R() * 30, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = 'source-atop'; const sh = g.createLinearGradient(0, 40, 0, 110); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(120,135,160,.5)'); g.fillStyle = sh; g.fillRect(0, 0, 256, 128);   // grey bellies
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0 });
  const group = new THREE.Group(), N = c.mobile ? 9 : 14;
  for (let k = 0; k < N; k++){
    const s = new THREE.Sprite(mat), a = k / N * 6.2832 + R() * .3, rad = 2300 + R() * 500, w = 900 + R() * 800;
    s.position.set(Math.cos(a) * rad, 330 + R() * 520, Math.sin(a) * rad); s.scale.set(w, w * .42, 1); group.add(s);
  }
  const DAY = new THREE.Color(0xffffff), NIGHT = new THREE.Color(0x27324d), DUSK = new THREE.Color(0xffb38a);
  const light = (lit, day) => { const dusk = 4 * day * (1 - day); mat.opacity = .25 + .65 * day; mat.color.copy(NIGHT).lerp(DAY, day).lerp(DUSK, dusk * .45); };
  light(c.lit(), Math.max(0, c.day())); c.HOOKS.night.push(light);
  if (!c.M.reduceMotion) c.HOOKS.update.push(dt => { group.rotation.y += dt * .0035; });
  return add(group);
}

/* ---------- trees: rounder, fuller canopies (computers only; phones keep the light ones) ---------- */
function trees(c){
  if (c.mobile && !c.force) return;
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, col = [], v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++){
    v.fromBufferAttribute(p, i);
    const n = 1 + Math.sin(v.x * 4.1) * Math.cos(v.y * 3.7) * Math.sin(v.z * 3.3) * .14 + Math.sin(v.x * 9.3 + v.z * 7.1) * Math.cos(v.y * 8.2) * .05;
    p.setXYZ(i, v.x * n, v.y * n * .9, v.z * n);
    const shade = .66 + .42 * (v.y * .5 + .5) + Math.sin(v.x * 11 + v.y * 13 + v.z * 7) * .04; col.push(shade, shade, shade);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  c.leaves.geometry = g;                          // (the bushes keep sharing the old, lighter shape)
  if (c.extraLeaves) c.extraLeaves.geometry = g;
  c.touch(true);
}

/* ---------- night glow around lamps, windows and Christmas lights ----------
   Costs a few extra full-screen passes, so it only runs after dark, and it
   switches itself off if the device can't keep a smooth frame rate with it. */
async function glow(c){
  const { renderer, scene, camera, HOOKS } = c;
  const { EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = await import('three/addons/postprocessing/bloom.min.js');
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), .4, .45, 1.02);
  composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(new OutputPass());
  let enabled = true, frames = 0, total = 0;
  const bright = on => {                          // lights go brighter than white so the glow has something to pick up
    c.xmasBulbs.forEach(m => m.material.color.setScalar(on ? 2.6 : 1));
    c.lampHeads.material.color.setHex(0xffe6a8).multiplyScalar(on ? 1.8 : 1);
  };
  HOOKS.resize = () => { if (!enabled) return; renderer.getDrawingBufferSize(size); composer.setSize(size.x, size.y); };
  let wasOn = false;
  HOOKS.render = dt => {
    const lit = c.lit(), on = enabled && lit > .05;
    if (on !== wasOn){ wasOn = on; bright(on); }
    if (!on) return renderer.render(scene, camera);
    bloom.strength = .42 * lit;
    composer.render(dt);
    if (!c.force && frames < 50 && dt > 0 && dt < .5){
      total += dt; frames++;
      if (frames === 50 && total / 50 > .034){ enabled = false; bright(false); wasOn = false; composer.dispose(); rt.dispose(); HOOKS.render = null; c.touch(); }   // under ~30 fps: not worth it
    }
  };
  c.touch();
}
