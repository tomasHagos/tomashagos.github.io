/*
 * Fills in the land between the buildings, so the town reads as a lived-in place
 * instead of houses on bare lawn. Loaded with the detail pass (after the town is
 * on screen), and built in a few steps:
 *
 *   office sites   paved aprons, front walks, planters, car parks with parked cars
 *   house lots     fenced back yards, sheds, cars on driveways
 *   parks          riverside path with benches, playground, gazebo, picnic tables,
 *                  a basketball court, the campus quad with its paths and fountain
 *   greenery       extra trees wherever there is still open ground
 *   streets        stop signs, fire hydrants, lantern tops on the lamp posts
 *
 * Each step merges everything it makes into one mesh per material, so the whole
 * lot adds only a couple of dozen draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.min.js';
import { texturedMaterial, worldUV } from './textures3d.js';
import { createCarKit } from './cars3d.js';

function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function placeStages(c, add){
  const { M, X, Z, XS, YS, CURB, LM, SITE, TEX } = c;
  const W = M.W, H = M.H;
  const TEXTURED = new Set(['paver', 'asphalt', 'roofS', 'stone']);
  const MATS = {
    paver: texturedMaterial(TEX.concrete, { color: 0xd9d3c6 }),
    stone: texturedMaterial(TEX.concrete, { color: 0xb9b4a8 }),
    asphalt: c.asphalt,
    roofS: texturedMaterial(TEX.shingles, { color: 0xa9a6a2, roughness: .95 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xf1f0ea, roughness: .7 }),
    gravel: new THREE.MeshStandardMaterial({ color: 0xcbbd98, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }),
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .65 }),      // anything plain-coloured
    metal: new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: .5, metalness: .6 }),
    pool: c.reflect(new THREE.MeshStandardMaterial({ color: 0x4f86a8, roughness: .08, metalness: .4 })),
    carPaint: c.reflect(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .45, roughness: .3 })),
  };
  const kit = createCarKit(c.reflect); MATS.carGlass = kit.glassMat || c.reflect(new THREE.MeshStandardMaterial({ color: 0x0f161c, roughness: .04, metalness: .6 }));

  /* ---- a bucket of geometry per material; flush() turns each into one mesh ---- */
  let buckets = {};
  const put = (key, g, color) => {
    g = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (MATS[key].vertexColors){ const k = color || WHITE, a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3){ a[i] = k.r; a[i + 1] = k.g; a[i + 2] = k.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    (buckets[key] ||= []).push(g);
  };
  const WHITE = new THREE.Color(1, 1, 1), K = h => new THREE.Color(h);
  // box on height y at map point (mx, my); rot turns it about the vertical
  const box = (key, w, h, d, mx, y, my, rot = 0, color) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (TEXTURED.has(key)) worldUV(g, mx, my);
    if (rot) g.rotateY(rot);
    g.translate(X(mx), y + h / 2, Z(my)); put(key, g, color);
  };
  // any geometry, built around the origin, placed at a map point
  const at = (key, g, mx, y, my, rot = 0, color) => { if (rot) g.rotateY(rot); g.translate(X(mx), y, Z(my)); put(key, g, color); };
  const flush = (shadows = true) => {
    const group = new THREE.Group();
    for (const [key, list] of Object.entries(buckets)){
      const mesh = new THREE.Mesh(mergeGeometries(list, false), MATS[key]);
      mesh.castShadow = shadows && !['paver', 'asphalt', 'paint', 'gravel', 'pool', 'carGlass'].includes(key); mesh.receiveShadow = true; group.add(mesh);
    }
    buckets = {};
    return add(group);
  };

  /* ---- what is already standing where (map units) ---- */
  const obs = [];
  Object.values(LM).forEach(r => obs.push(r));
  Object.values(SITE).forEach(r => obs.push(r));
  M.houses.forEach(h => obs.push(h));
  { const e = LM.education; if (e) obs.push({ x: e.x + e.w / 2 - 44, y: e.y + e.h, w: 88, h: 44 }); }   // the front steps and the lawn before them stay clear
  if (c.holiday === 'christmas') obs.push({ x: 1585 - 80, y: 878 - 80, w: 160, h: 160 });
  const hit = (r, pad = 0, list = obs) => list.some(o => o !== r && r.x < o.x + o.w + pad && r.x + r.w + pad > o.x && r.y < o.y + o.h + pad && r.y + r.h + pad > o.y);
  const nearRiver = (x, y, pad) => Math.abs(x - M.riverX(y)) < M.riverW(y) + pad;
  const riverIn = (r, pad) => [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h], [r.x + r.w / 2, r.y + r.h / 2]].some(([x, y]) => nearRiver(x, y, pad));
  const blocks = [];
  for (let bj = 0; bj < YS.length - 1; bj++) for (let bi = 0; bi < XS.length - 1; bi++)
    blocks.push({ bi, bj, x: XS[bi] + CURB, y: YS[bj] + CURB, w: XS[bi + 1] - XS[bi] - CURB * 2, h: YS[bj + 1] - YS[bj] - CURB * 2, park: bi === 2, campus: bi === 0 && bj === 2 });
  { const cb = blocks.find(b => b.campus); if (cb) obs.push({ x: cb.x + cb.w * .55 - 38, y: cb.y + cb.h * .62 - 38, w: 76, h: 76 }); }   // the campus fountain plaza
  const blockOf = r => blocks.find(b => r.x + r.w / 2 > b.x && r.x + r.w / 2 < b.x + b.w && r.y + r.h / 2 > b.y && r.y + r.h / 2 < b.y + b.h);
  const inside = (r, b, m = 4) => r.x >= b.x + m && r.y >= b.y + m && r.x + r.w <= b.x + b.w - m && r.y + r.h <= b.y + b.h - m;

  // trees that end up under something new are tucked away (scaled to nothing)
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const clearTrees = (r, pad = 6) => {
    let n = 0;
    c.trees.forEach((t, i) => {
      if (t.gone || t.x < r.x - pad - t.r || t.x > r.x + r.w + pad + t.r || t.y < r.y - pad - t.r || t.y > r.y + r.h + pad + t.r) return;
      t.gone = true; n++; c.trunks.setMatrixAt(i, zero); for (let k = 0; k < c.BLOBS; k++) c.leaves.setMatrixAt(i * c.BLOBS + k, zero);
    });
    if (n){ c.trunks.instanceMatrix.needsUpdate = true; c.leaves.instanceMatrix.needsUpdate = true; }
  };

  /* ---- parked cars: bodies merged into one mesh, wheels instanced ---- */
  const CAR_COLOURS = [0xe9e9e6, 0xcfd2d4, 0x9aa0a6, 0x2b2e33, 0x15171a, 0x1f3550, 0x7a1620, 0x35556b, 0xb8b2a4, 0x3d5a45].map(h => K(h));
  const parked = [];
  let carN = 0;
  const car = (mx, my, heading) => {                 // heading: radians, 0 = facing +x
    const type = kit.TYPES[carN % kit.TYPES.length], geo = kit.GEO[type], col = CAR_COLOURS[(carN * 7 + 3) % CAR_COLOURS.length]; carN++;
    const m = new THREE.Matrix4().makeRotationY(heading).setPosition(X(mx), 1.25, Z(my));
    put('carPaint', geo.body.clone().applyMatrix4(m), col); put('carGlass', geo.glass.clone().applyMatrix4(m));
    parked.push(m);
  };
  const flushWheels = () => {
    if (!parked.length) return;
    const tyres = new THREE.InstancedMesh(kit.tyreGeo, kit.tyreMat, parked.length * 4), rims = new THREE.InstancedMesh(kit.rimGeo, kit.rimMat, parked.length * 4), m = new THREE.Matrix4();
    parked.forEach((cm, i) => kit.wheelMatrices.forEach((w, j) => { m.multiplyMatrices(cm, w); tyres.setMatrixAt(i * 4 + j, m); rims.setMatrixAt(i * 4 + j, m); }));
    parked.length = 0;
    const g = new THREE.Group(); g.add(tyres, rims); return add(g);
  };

  /* ---- small props ---- */
  const WOODS = [0x8a6b4a, 0x7a5d40, 0x96765a, 0x6f5338].map(h => K(h));
  function bench(mx, my, rot){
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(X(mx), 1, Z(my));
    const p = (key, w, h, d, x, y, z, col) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); g.applyMatrix4(m); put(key, g, col); };
    p('wood', 12, .7, 3.6, 0, 3.4, 0, WOODS[0]); p('wood', 12, 3.4, .6, 0, 5.4, -1.7, WOODS[0]);
    [-5, 5].forEach(x => { p('metal', .7, 3.4, 3.4, x, 1.7, 0); p('metal', .7, 4, .7, x, 5, -1.7); });
  }
  function picnic(mx, my, rot){
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(X(mx), 1, Z(my));
    const p = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); g.applyMatrix4(m); put('wood', g, WOODS[2]); };
    p(13, .7, 6, 0, 5.2, 0); [-4.6, 4.6].forEach(z => p(13, .6, 2.2, 0, 3, z)); [-5, 5].forEach(x => p(.8, 5, 10, x, 2.5, 0));
  }
  function planter(mx, my, bushes){
    box('stone', 9, 3.2, 9, mx, .7, my);
    bushes.push([X(mx), 5.6, Z(my), 3.6]);
  }

  /* ================= 1. office sites ================= */
  function offices(){
    const bushes = [];
    ['priceline', 'conquest', 'birchwood', 'gada', 'projects', 'contact'].forEach(id => {
      const r = LM[id], b = blockOf(r); if (!b) return;
      // paved apron around the building, clipped to the block
      const ax0 = Math.max(b.x, r.x - 14), ay0 = Math.max(b.y, r.y - 14), ax1 = Math.min(b.x + b.w, r.x + r.w + 14), ay1 = Math.min(b.y + b.h, r.y + r.h + 22);
      box('paver', ax1 - ax0, .45, ay1 - ay0, (ax0 + ax1) / 2, .7, (ay0 + ay1) / 2);
      clearTrees({ x: ax0, y: ay0, w: ax1 - ax0, h: ay1 - ay0 }, 0);
      // front walk from the entrance (south side) to the sidewalk, if nothing is in the way
      const walk = { x: r.x + r.w / 2 - 7, y: ay1, w: 14, h: b.y + b.h - ay1 };
      if (walk.h > 6 && !hit(walk, 2)){ box('paver', walk.w, .45, walk.h + 4, r.x + r.w / 2, .7, walk.y + walk.h / 2 + 2); clearTrees(walk, 0); obs.push(walk); }
      [[ax0 + 7, ay1 - 7], [ax1 - 7, ay1 - 7]].forEach(([x, y]) => planter(x, y, bushes));
      obs.push({ x: ax0, y: ay0, w: ax1 - ax0, h: ay1 - ay0 });
    });
    // car parks beside the two big office towers
    ['priceline', 'conquest', 'gada'].forEach((id, n) => {
      const r = LM[id], b = blockOf(r); if (!b) return;
      const LW = id === 'gada' ? 100 : 136, LD = 64, gap = 26;
      const tries = [
        { x: r.x + r.w + gap, y: r.y + (r.h - LW) / 2, w: LD, h: LW }, { x: r.x - gap - LD, y: r.y + (r.h - LW) / 2, w: LD, h: LW },
        { x: r.x + (r.w - LW) / 2, y: r.y + r.h + gap + 8, w: LW, h: LD }, { x: r.x + (r.w - LW) / 2, y: r.y - gap - LD, w: LW, h: LD },
        { x: r.x + r.w + gap, y: r.y + r.h - LD, w: LW, h: LD }, { x: r.x - gap - LW, y: r.y + r.h - LD, w: LW, h: LD }, { x: r.x - gap - LW, y: r.y, w: LW, h: LD },
        { x: r.x + r.w - LD, y: r.y + r.h + gap + 8, w: LD, h: LW }, { x: r.x, y: r.y + r.h + gap + 8, w: LD, h: LW },
      ];
      const lot = tries.find(t => inside(t, b, 6) && !hit(t, 9) && !riverIn(t, 30)); if (!lot) return;
      obs.push(lot); clearTrees(lot, 4);
      const wide = lot.w >= lot.h, cxm = lot.x + lot.w / 2, cym = lot.y + lot.h / 2, len = wide ? lot.w : lot.h;
      box('asphalt', lot.w, .5, lot.h, cxm, .75, cym);
      const stalls = Math.floor((len - 6) / 11.5), R = rng(40 + n);
      for (let row = -1; row <= 1; row += 2) for (let k = 0; k <= stalls; k++){
        const a = -len / 2 + 3 + k * 11.5, off = row * 21;       // stall lines, then maybe a car
        if (wide) box('paint', .9, .12, 20, cxm + a, 1.25, cym + off); else box('paint', 20, .12, .9, cxm + off, 1.25, cym + a);
        if (k < stalls && R() < .62){
          const p = a + 5.75, nose = row > 0 ? 1 : -1, flip = R() < .2 ? Math.PI : 0;
          if (wide) car(cxm + p, cym + off, (nose > 0 ? -Math.PI / 2 : Math.PI / 2) + flip); else car(cxm + off, cym + p, (nose > 0 ? 0 : Math.PI) + flip);
        }
      }
      // a short drive from the car park to the nearest street
      const d = [[lot.y - b.y, 0, -1], [b.y + b.h - lot.y - lot.h, 0, 1], [lot.x - b.x, -1, 0], [b.x + b.w - lot.x - lot.w, 1, 0]].sort((p, q) => p[0] - q[0]);
      for (const [dist, dx, dy] of d){
        const dr = dx ? { x: dx < 0 ? b.x - CURB : lot.x + lot.w, y: cym - 8, w: dist + CURB, h: 16 } : { x: cxm - 8, y: dy < 0 ? b.y - CURB : lot.y + lot.h, w: 16, h: dist + CURB };
        if (hit(dr, 2, obs.filter(o => o !== lot))) continue;
        box('asphalt', dr.w, .5, dr.h, dr.x + dr.w / 2, .74, dr.y + dr.h / 2); clearTrees(dr, 2); obs.push(dr); break;
      }
    });
    return flush().then(flushWheels).then(() => bushMesh(bushes));
  }

  // bushes share the tree-canopy shape (one instanced mesh per batch)
  function bushMesh(spots){
    if (!spots.length) return;
    const GREENS = [0x35602a, 0x2f5a2c, 0x416b2e, 0x4b7434].map(h => K(h)), R = rng(spots.length);
    const m = new THREE.InstancedMesh(c.bushGeo, c.leaves.material.clone(), spots.length), o = new THREE.Object3D(), base = [];
    spots.forEach(([x, y, z, s], i) => { o.position.set(x, y, z); o.scale.set(s * 1.15, s * .85, s * 1.15); o.rotation.y = i * 1.3; o.updateMatrix(); m.setMatrixAt(i, o.matrix); base.push(GREENS[i % 4].clone().offsetHSL(0, 0, (R() - .5) * .06)); });
    const tint = s => { base.forEach((k, i) => m.setColorAt(i, s ? k.clone().lerp(c.SNOW, .55) : k)); m.instanceColor.needsUpdate = true; };
    tint(c.isSnowy()); c.HOOKS.snow.push(tint);
    m.castShadow = m.receiveShadow = true;
    return add(m);
  }

  /* ================= 2. house lots: back yards, sheds, cars on driveways ================= */
  function yards(){
    const R = rng(12), v = new THREE.Vector3(), yardsPlaced = [];
    const FENCE = [0x8a6b4a, 0x9a7a58, 0xe8e4da, 0x7a5d40, 0xb09a7c].map(h => K(h)), SHED = [0x8c3b2e, 0x6d7f6a, 0x7b7f86, 0xb8a58a, 0x4f6272].map(h => K(h));
    c.houses.lots.forEach(l => {
      for (const depth of [34, 22]){
        const hw = l.Wd / 2 + 5, z0 = -l.Dp / 2 - depth, z1 = -l.Dp / 2 + 2;
        // the yard's footprint on the map
        let ax0 = 1e9, ay0 = 1e9, ax1 = -1e9, ay1 = -1e9;
        [[-hw, z0], [hw, z0], [-hw, z1 - 6], [hw, z1 - 6]].forEach(([x, z]) => { v.set(x, 0, z).applyMatrix4(l.m); const mx = v.x + W / 2, my = v.z + H / 2; ax0 = Math.min(ax0, mx); ay0 = Math.min(ay0, my); ax1 = Math.max(ax1, mx); ay1 = Math.max(ay1, my); });
        const yr = { x: ax0, y: ay0, w: ax1 - ax0, h: ay1 - ay0 };
        if (hit(yr, 1) || hit(yr, 0, yardsPlaced)) continue;
        yardsPlaced.push(yr);
        const col = FENCE[l.i % FENCE.length], piece = (key, w, h, d, x, y, z, k) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); g.applyMatrix4(l.m); put(key, g, k); };
        piece('wood', hw * 2, 5.6, .7, 0, .6, z0, col);                         // back
        [-hw, hw].forEach(x => piece('wood', .7, 5.6, z1 - z0, x, .6, (z0 + z1) / 2, col));
        for (let x = -hw; x <= hw + .1; x += hw / 2) piece('wood', 1.1, 6.6, 1.1, x, .6, z0, col);   // posts
        if (depth > 30 && l.i % 3 !== 1){                                       // garden shed in a back corner
          const sx = (l.i % 2 ? 1 : -1) * (hw - 7.5), sz = z0 + 6.5, k = SHED[l.i % SHED.length];
          piece('solid', 10, 7, 8, sx, .6, sz, k);
          const s = new THREE.Shape(); s.moveTo(-4.8, 0); s.lineTo(0, 3.2); s.lineTo(4.8, 0); s.closePath();
          const g = new THREE.ExtrudeGeometry(s, { depth: 11.4, bevelEnabled: false }); g.translate(0, 7.6, -5.7); g.rotateY(Math.PI / 2); g.translate(sx, 0, sz); worldUV(g); g.applyMatrix4(l.m); put('roofS', g);
          piece('solid', 3, 5.4, .3, sx, .6, sz + 4.1, K(0xe9e6de));
        }
        break;
      }
      if (l.garage && R() < .6){                                                // a car on the driveway
        v.set(l.Wd * .22, 0, l.front + 13).applyMatrix4(l.m);
        car(v.x + W / 2, v.z + H / 2, l.rot - Math.PI / 2 + (R() < .3 ? Math.PI : 0));
      }
    });
    yardsPlaced.forEach(y => obs.push(y));
    return flush().then(flushWheels);
  }

  /* ================= 3. parks: river path, playground, gazebo, court, campus quad ================= */
  function parks(){
    const bushes = [], R = rng(88);
    blocks.filter(b => b.park).forEach(b => {
      // gravel path along the east bank, with benches looking at the water
      const pts = []; for (let y = b.y + 8; y <= b.y + b.h - 8; y += 12) pts.push([M.riverX(y) + M.riverW(y) + 34, y]);
      const P = [], Wd = 4.5;
      for (let k = 0; k < pts.length - 1; k++){
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * Wd, ny = dx / l * Wd;
        const a = [X(x0 + nx), 1.02, Z(y0 + ny)], bb = [X(x0 - nx), 1.02, Z(y0 - ny)], cc = [X(x1 - nx), 1.02, Z(y1 - ny)], d = [X(x1 + nx), 1.02, Z(y1 + ny)];
        P.push(...a, ...cc, ...bb, ...a, ...d, ...cc);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
      if (g.attributes.normal.getY(0) < 0){ const p = g.attributes.position; for (let i = 0; i < p.count; i += 3){ const t = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)]; p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, ...t); } g.computeVertexNormals(); }
      put('gravel', g);
      pts.forEach(([x, y], k) => { if (k % 8 === 4){ const r = { x: x + 6, y: y - 7, w: 8, h: 14 }; if (!hit(r, 4)){ bench(x + 9, y, -Math.PI / 2); clearTrees(r, 2); } } });
    });
    const P0 = blocks.find(b => b.park && b.bj === 0), P1 = blocks.find(b => b.park && b.bj === 1), P2 = blocks.find(b => b.park && b.bj === 2);
    // place something on free ground west of the river in a park block
    const spot = (b, w, h, fy) => { for (const f of [fy, .5, .3, .7, .15, .85]){ const y = b.y + b.h * f - h / 2; for (let x = M.riverX(y) - M.riverW(y) - 40 - w; x > b.x + 10; x -= 16){ const r = { x, y, w, h }; if (inside(r, b, 8) && !hit(r, 10) && !riverIn(r, 26)) return r; } } return null; };

    // playground: swings, a slide and a sandbox on a rubber-mulch pad
    const pg = P0 && spot(P0, 84, 60, .55);
    if (pg){
      obs.push(pg); clearTrees(pg, 4);
      const cxm = pg.x + pg.w / 2, cym = pg.y + pg.h / 2, RED = K(0xc8402f), BLUE = K(0x2f6fb5), YEL = K(0xe8b93a), GREY = K(0x8a9096);
      box('solid', pg.w, .4, pg.h, cxm, .7, cym, 0, K(0xa07a52));
      const sx = cxm - 22;                                                   // swing set
      [-13, 13].forEach(dx => [-5, 5].forEach(dy => { const g = new THREE.CylinderGeometry(.6, .6, 19, 6); g.rotateX(dy > 0 ? -.27 : .27); at('solid', g, sx + dx, 10.2, cym + dy * .5, 0, BLUE); }));
      { const g = new THREE.CylinderGeometry(.6, .6, 27, 6); g.rotateZ(Math.PI / 2); at('solid', g, sx, 19.2, cym, 0, BLUE); }
      [-6, 6].forEach(dx => { [-1.6, 1.6].forEach(o => box('metal', .25, 13.5, .25, sx + dx + o, 5.6, cym)); box('solid', 4.6, .5, 2, sx + dx, 5.2, cym, 0, K(0x22262b)); });
      const lx = cxm + 20;                                                   // slide tower
      [-4, 4].forEach(dx => [-4, 4].forEach(dy => box('solid', .9, 13, .9, lx + dx, 1, cym + dy, 0, GREY)));
      box('solid', 9.5, .8, 9.5, lx, 11, cym, 0, YEL); box('solid', 9.5, 3.4, .5, lx, 11.8, cym - 4.6, 0, RED); box('solid', .5, 3.4, 9.5, lx + 4.6, 11.8, cym, 0, RED);
      { const g = new THREE.BoxGeometry(22, .7, 6); g.rotateZ(.5); at('solid', g, lx - 14.2, 6.3, cym, 0, RED); }
      for (let k = 0; k < 5; k++) box('solid', 5, .5, .8, lx, 2.4 + k * 2, cym + 5.2, 0, GREY);
      { const g = new THREE.ConeGeometry(8.4, 5, 4); g.rotateY(Math.PI / 4); at('solid', g, lx, 20.5, cym, 0, BLUE); [-4, 4].forEach(dx => [-4, 4].forEach(dy => box('solid', .9, 7, .9, lx + dx, 11.5, cym + dy, 0, GREY))); }
      const bx0 = cxm - 2, by0 = cym + 17;                                    // sandbox
      box('solid', 18, .6, 14, bx0, 1.1, by0, 0, K(0xe2cf9c)); [[18, 1, 0, -7], [18, 1, 0, 7], [1, 14, -9, 0], [1, 14, 9, 0]].forEach(([w, d, ox, oy]) => box('wood', w, 1.6, d, bx0 + ox, 1, by0 + oy, 0, WOODS[1]));
      bench(pg.x + pg.w / 2, pg.y - 5, 0); bench(pg.x + pg.w / 2 - 24, pg.y - 5, 0);
    }
    // gazebo with picnic tables around it
    const gz = P2 && spot(P2, 46, 46, .5);
    if (gz){
      obs.push(gz); clearTrees(gz, 6);
      const gx = gz.x + 23, gy = gz.y + 23, oc = (key, rT, rB, h, y, col) => { const g = new THREE.CylinderGeometry(rT, rB, h, 8); g.rotateY(Math.PI / 8); at(key, g, gx, y + h / 2, gy, 0, col); };
      oc('stone', 15, 15.6, 1.6, .7);
      for (let k = 0; k < 8; k++){ const a = k * Math.PI / 4 + Math.PI / 8; box('solid', 1, 12.5, 1, gx + Math.sin(a) * 13.4, 2.3, gy + Math.cos(a) * 13.4, 0, K(0xf0ede4)); if (k !== 0 && k !== 7){ const f = k * Math.PI / 4 + Math.PI / 4; const g = new THREE.BoxGeometry(10.4, 3.4, .5); g.translate(0, 0, 12.5); g.rotateY(f); at('solid', g, gx, 4.2, gy, 0, K(0xf0ede4)); } }
      { const g = new THREE.ConeGeometry(17.6, 8.5, 8); g.rotateY(Math.PI / 8); at('roofS', g, gx, 19, gy); const f = new THREE.SphereGeometry(1.1, 8, 6); at('solid', f, gx, 23.8, gy, 0, K(0xf0ede4)); }
      [[-30, 8], [-30, -14], [4, 32]].forEach(([dx, dy], k) => { const r = { x: gx + dx - 8, y: gy + dy - 8, w: 16, h: 16 }; if (inside(r, P2, 6) && !hit(r, 4) && !riverIn(r, 20)){ picnic(gx + dx, gy + dy, k * .6); clearTrees(r, 2); obs.push(r); } });
    }
    // basketball court
    const ct = P1 && spot(P1, 64, 38, .8);
    if (ct){
      obs.push(ct); clearTrees(ct, 4);
      const cxm = ct.x + 32, cym = ct.y + 19, GREEN = K(0x3f7f6a), LINE = (w, d, ox, oy) => box('paint', w, .1, d, cxm + ox, 1.26, cym + oy);
      box('solid', 64, .5, 38, cxm, .75, cym, 0, GREEN);
      LINE(60, .7, 0, -17); LINE(60, .7, 0, 17); LINE(.7, 34.7, -30, 0); LINE(.7, 34.7, 30, 0); LINE(.7, 34.7, 0, 0);
      [-1, 1].forEach(s => { LINE(12, .7, s * 24, -6); LINE(12, .7, s * 24, 6); LINE(.7, 12.7, s * 18, 0);
        box('metal', 1, 16, 1, cxm + s * 32.5, .7, cym); box('metal', 4, .8, .8, cxm + s * 30.5, 16, cym); box('solid', .5, 6, 9, cxm + s * 28.6, 13.5, cym, 0, K(0xf4f4f0));
        const g = new THREE.TorusGeometry(1.5, .22, 6, 14); g.rotateX(Math.PI / 2); at('solid', g, cxm + s * 26.6, 14.6, cym, 0, K(0xd9531e)); });
    }
    // campus quad: paths from the middle to each corner, round plaza, fountain, benches
    const cb = blocks.find(b => b.campus);
    if (cb){
      const qx = cb.x + cb.w * .55, qy = cb.y + cb.h * .62;
      [[cb.x + 10, cb.y + cb.h - 10], [cb.x + cb.w - 10, cb.y + 10], [cb.x + 10, cb.y + 10], [cb.x + cb.w - 10, cb.y + cb.h - 10]].forEach(([x, y]) => {
        const len = Math.hypot(x - qx, y - qy), g = new THREE.BoxGeometry(len, .4, 12); worldUV(g, x, y); at('paver', g, (x + qx) / 2, .9, (y + qy) / 2, -Math.atan2(y - qy, x - qx));
      });
      { const g = new THREE.CylinderGeometry(31, 31, .5, 36); worldUV(g, 3, 7); at('paver', g, qx, 1, qy); }
      { const g = new THREE.CylinderGeometry(18.5, 19.5, 3.4, 30); worldUV(g); at('stone', g, qx, 2.9, qy); const w = new THREE.CylinderGeometry(16.6, 16.6, .4, 30); at('pool', w, qx, 4.2, qy); }
      { const g = new THREE.CylinderGeometry(1.6, 2.4, 7, 12); worldUV(g); at('stone', g, qx, 7.4, qy); const bw = new THREE.CylinderGeometry(6, 2, 1.8, 16); worldUV(bw); at('stone', bw, qx, 11.6, qy); const w = new THREE.CylinderGeometry(5.2, 5.2, .3, 16); at('pool', w, qx, 12.5, qy); }
      for (let k = 0; k < 4; k++){ const a = k * Math.PI / 2; bench(qx + Math.sin(a) * 26, qy + Math.cos(a) * 26, a + Math.PI); }
      for (let k = 0; k < 8; k++){ const a = k * Math.PI / 4 + Math.PI / 8; bushes.push([X(qx + Math.sin(a) * 36), 3.2, Z(qy + Math.cos(a) * 36), 3.4]); }
      clearTrees({ x: qx - 34, y: qy - 34, w: 68, h: 68 }, 0); obs.push({ x: qx - 34, y: qy - 34, w: 68, h: 68 });
    }
    return flush().then(() => bushMesh(bushes));
  }

  /* ================= 4. more trees wherever there is still open ground ================= */
  function greenery(){
    const R = rng(404), spots = [], near = (x, y, d) => c.trees.some(t => !t.gone && Math.hypot(t.x - x, t.y - y) < d + t.r) || spots.some(s => Math.hypot(s.x - x, s.y - y) < d + s.r);
    blocks.forEach(b => {
      const want = b.park ? 20 : b.campus ? 6 : 12; let got = 0;
      for (let k = 0; k < 140 && got < want; k++){
        const x = b.x + 14 + R() * (b.w - 28), y = b.y + 14 + R() * (b.h - 28), r = 10 + R() * 9, box = { x: x - r * .8, y: y - r * .8, w: r * 1.6, h: r * 1.6 };
        if (hit(box, 5) || nearRiver(x, y, 22) || near(x, y, 16)) continue;
        spots.push({ x, y, r }); got++;
      }
    });
    if (!spots.length) return;
    const B = c.BLOBS, trunks = new THREE.InstancedMesh(c.trunks.geometry, c.trunks.material, spots.length), leaves = new THREE.InstancedMesh(c.leaves.geometry, c.leaves.material, spots.length * B);
    const o = new THREE.Object3D(), base = [], GREENS = [0x355f26, 0x3f6d2c, 0x4a7a33, 0x2f5622, 0x557f37].map(h => K(h));
    spots.forEach((t, i) => {
      const h = t.r * 1.15;
      o.position.set(X(t.x), h / 2, Z(t.y)); o.scale.set(t.r / 9, h, t.r / 9); o.rotation.set(0, 0, 0); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
      for (let k = 0; k < B; k++){
        const a = R() * 6.283, d = t.r * (k ? .38 + R() * .2 : 0), s = t.r * (k ? .62 + R() * .2 : .78);
        o.position.set(X(t.x) + Math.cos(a) * d, h + t.r * (.55 + R() * .35), Z(t.y) + Math.sin(a) * d); o.scale.set(s, s, s); o.rotation.set(0, a, 0); o.updateMatrix(); leaves.setMatrixAt(i * B + k, o.matrix);
        base.push(GREENS[(i + k) % 5].clone().offsetHSL(0, 0, (R() - .5) * .05));
      }
    });
    const tint = s => { base.forEach((k, i) => leaves.setColorAt(i, s ? k.clone().lerp(c.SNOW, .5) : k)); leaves.instanceColor.needsUpdate = true; };
    tint(c.isSnowy()); c.HOOKS.snow.push(tint);
    [trunks, leaves].forEach(m => { m.castShadow = m.receiveShadow = true; });
    c.extraLeaves = leaves;
    const g = new THREE.Group(); g.add(trunks, leaves); return add(g);
  }

  /* ================= 5. street furniture ================= */
  function streets(){
    const g = new THREE.Group(), o = new THREE.Object3D();
    // stop signs on the two corners that don't have a lamp
    const signs = []; XS.forEach(x => YS.forEach(y => { signs.push([x + 37, y - 37, 0], [x - 37, y + 37, Math.PI / 2]); }));
    const inst = (geo, mat, list, fn) => { const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((s, i) => { fn(s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.castShadow = true; g.add(m); return m; };
    const faceGeo = (r, t) => { const q = new THREE.CylinderGeometry(r, r, t, 8); q.rotateY(Math.PI / 8); q.rotateX(Math.PI / 2); return q; };
    o.scale.set(1, 1, 1);
    inst(new THREE.CylinderGeometry(.45, .45, 17, 6), MATS.metal, signs, ([x, y]) => { o.position.set(X(x), 2.3 + 8.5, Z(y)); o.rotation.set(0, 0, 0); });
    inst(faceGeo(3.5, .3), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: .6 }), signs, ([x, y, r]) => { o.position.set(X(x), 17.5, Z(y)); o.rotation.set(0, r, 0); });
    inst(faceGeo(3.05, .5), new THREE.MeshStandardMaterial({ color: 0xc2271d, roughness: .5 }), signs, ([x, y, r]) => { o.position.set(X(x), 17.5, Z(y)); o.rotation.set(0, r, 0); });
    // fire hydrants, one per intersection
    const hy = new THREE.CylinderGeometry(1.05, 1.3, 4.2, 8), cap = new THREE.SphereGeometry(1.15, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(0, 2.1, 0);
    const arm = new THREE.CylinderGeometry(.5, .5, 3.6, 6); arm.rotateZ(Math.PI / 2); arm.translate(0, .9, 0);
    const hyd = mergeGeometries([hy, cap, arm].map(q => q.toNonIndexed()), false);
    inst(hyd, new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: .6 }), XS.flatMap(x => YS.map(y => [x + 33.5, y + 52])), ([x, y]) => { o.position.set(X(x), 2.3 + 2.1, Z(y)); o.rotation.set(0, 0, 0); });
    // lamp posts: swap the plain ball for a lantern with a dark cap
    c.lampHeads.geometry = new THREE.CylinderGeometry(2.5, 1.7, 3.8, 8);
    const hood = new THREE.ConeGeometry(3.7, 2.4, 8), collar = new THREE.CylinderGeometry(1.9, 1.3, 1.2, 8); collar.translate(0, -4.7, 0);
    inst(mergeGeometries([hood, collar].map(q => q.toNonIndexed()), false), MATS.metal, c.LAMP_SPOTS, ([x, z]) => { o.position.set(x, 34.1, z); o.rotation.set(0, 0, 0); });
    return add(g);
  }

  return [offices, yards, parks, greenery, streets];
}
