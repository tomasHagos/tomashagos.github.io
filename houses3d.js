/*
 * Detailed houses for the 3D town, merged for speed.
 *
 * Every house faces the nearest street and gets: a foundation, sided or brick
 * walls, a shingled gable roof with eaves, corner trim, framed windows with
 * crossbars and sills (front, back and sides), a front door with a step, a
 * porch canopy on some, an integrated garage on some, a chimney on most, and a
 * concrete path out to the sidewalk.
 *
 * All the pieces of all the houses are merged into one mesh per material
 * (about ten in total), so ~150 detailed houses cost about ten draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.min.js';
import { texturedMaterial, worldUV } from './textures3d.js';

// Gable roof: ridge along x, eaves overhang by `over`; UVs in world units (shingles run along the eaves).
export function gableRoof(w, d, rise, over){
  const s = new THREE.Shape(); s.moveTo(-d / 2 - over, 0); s.lineTo(0, rise); s.lineTo(d / 2 + over, 0); s.lineTo(d / 2 + over, -1.4); s.lineTo(0, rise - 2); s.lineTo(-d / 2 - over, -1.4); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w + over * 2, bevelEnabled: false }); g.translate(0, 0, -(w + over * 2) / 2); g.rotateY(Math.PI / 2);
  // shingle rows run along the eaves: u along the ridge, v up the slope
  const p = g.attributes.position, uv = g.attributes.uv, slope = Math.hypot(d / 2 + over, rise) / (d / 2 + over);
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), Math.abs(p.getZ(i)) * slope + p.getY(i) * .2);
  return g;
}

const SIDING = [0xf1e9d6, 0xd3dccd, 0xcfd9e1, 0xf5f4ef, 0xf0e2b8, 0xdedad2, 0xe6d3cc].map(c => new THREE.Color(c));
const BRICK = [0xffffff, 0xf0e4dc, 0xe2d6cc].map(c => new THREE.Color(c));
const ROOF = [0xa8a6a3, 0x8e8c89, 0xa2876f, 0x7f858d, 0xb09a86, 0x9a9792].map(c => new THREE.Color(c));
const DOOR = [0x5b2f22, 0x24384f, 0x2e4a33, 0x6e1f24, 0x3b3b3b].map(c => new THREE.Color(c));

export function createHouses(scene, M, { X, Z, TEX, CURB }){
  const { XS, YS } = M;
  const buckets = {};                       // material key -> [geometries]
  const put = (key, geo, matrix, color) => {
    geo = geo.index ? geo.toNonIndexed() : geo;
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (color){ const c = new Float32Array(geo.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3){ c[i] = color.r; c[i + 1] = color.g; c[i + 2] = color.b; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    geo.applyMatrix4(matrix);
    (buckets[key] ||= []).push(geo);
  };
  const L = new THREE.Matrix4(), T = new THREE.Matrix4();
  // a box in the house's own frame; textured boxes get world-unit UVs first
  const boxAt = (key, w, h, d, x, y, z, houseM, { uv = false, color = null, rotY = 0 } = {}) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
    if (uv) worldUV(g, x * .37, z * .41);
    L.makeRotationY(rotY).setPosition(x, y, z);
    put(key, g, T.multiplyMatrices(houseM, L), color);
  };

  // one window on a wall: local frame has the wall facing +z at z = 0
  function windowAt(houseM, x, y, faceRot, faceOff, w, h){
    // build in face space: (along, up, out)
    const pieces = [
      ['trim', w + 2, h + 2, .8, 0, y, .3],
      ['glass', w, h, 1, 0, y, .4],
      ['trim', .6, h, 1.2, 0, y, .6],
      ['trim', w, .6, 1.2, 0, y, .6],
      ['trim', w + 3, .8, 2, 0, y - h / 2 - 1.1, 1],
    ];
    pieces.forEach(([k, gw, gh, gd, , ly, lz]) => {
      const g = new THREE.BoxGeometry(gw, gh, gd);
      const m = new THREE.Matrix4().makeRotationY(faceRot).multiply(new THREE.Matrix4().makeTranslation(x, ly, faceOff + lz));
      put(k, g, T.multiplyMatrices(houseM, m));
    });
  }

  const blockOf = (v, arr) => { for (let i = 0; i < arr.length - 1; i++) if (v >= arr[i] && v <= arr[i + 1]) return i; return -1; };
  const houseM = new THREE.Matrix4();
  const lots = [];                          // per-house frame + sizes, for the detail pass
  // Built in two goes so the town shows sooner: phase 0 is the shell (walls, roof, doors),
  // phase 1 the fiddly bits (windows, trim, porches, chimneys, paths), added by finish().
  const build = phase => M.houses.forEach((hs, i) => {
    const base = phase === 0, late = !base;
    const cx = hs.x + hs.w / 2, cy = hs.y + hs.h / 2;
    const bi = blockOf(cx, XS), bj = blockOf(cy, YS);
    if (bi < 0 || bj < 0) return;
    // face the nearest street
    const d = { n: cy - YS[bj], s: YS[bj + 1] - cy, w: cx - XS[bi], e: XS[bi + 1] - cx };
    const side = Object.keys(d).reduce((a, b) => d[a] <= d[b] ? a : b);
    const rot = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[side];
    const along = side === 'n' || side === 's' ? hs.w : hs.h, deep = side === 'n' || side === 's' ? hs.h : hs.w;
    const Wd = along - 4, Dp = deep - 4;
    const twoStorey = i % 4 === 1, wallH = twoStorey ? 34 : 22 + (i * 5) % 6;
    const brick = i % 3 === 0, garage = i % 3 === 2 && Wd > 44, porch = i % 2 === 1;
    houseM.makeRotationY(rot).setPosition(X(cx), 0, Z(cy));
    const wallKey = brick ? 'brick' : 'siding', wallCol = brick ? BRICK[i % BRICK.length] : SIDING[(i * 3) % SIDING.length];
    const F = 2.4;                                         // foundation height

    if (base){
    boxAt('found', Wd + 1.6, F, Dp + 1.6, 0, 0, 0, houseM, { uv: true });
    boxAt(wallKey, Wd, wallH, Dp, 0, F, 0, houseM, { uv: true, color: wallCol });
    }
    if (late) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => boxAt('trim', 1.6, wallH, 1.6, sx * Wd / 2, F, sz * Dp / 2, houseM));
    if (late) boxAt('trim', Wd + 1.2, 1.2, Dp + 1.2, 0, F + wallH - 1.2, 0, houseM);       // frieze board under the eaves
    if (base){ const roofG = gableRoof(Wd, Dp, Dp * .42, 4); roofG.translate(0, F + wallH, 0);
    put('roof', roofG, houseM, ROOF[(i * 5) % ROOF.length]); }
    // gable-end triangles (fill the wall up to the roof on both sides)
    if (base){ const s = new THREE.Shape(); s.moveTo(-Dp / 2, 0); s.lineTo(0, Dp * .42 - 1.5); s.lineTo(Dp / 2, 0); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: Wd - .2, bevelEnabled: false }); g.translate(0, 0, -(Wd - .2) / 2); g.rotateY(Math.PI / 2); g.translate(0, F + wallH, 0);
      worldUV(g); put(wallKey, g, houseM, wallCol); }

    // front: door (+ porch), windows, garage door
    const front = Dp / 2;
    const doorX = garage ? -Wd * .26 : (twoStorey ? 0 : -Wd * .08);
    if (base) boxAt('door', 6.5, 13, .8, doorX, F, front, houseM, { color: DOOR[i % DOOR.length] });
    if (late) boxAt('trim', 8.6, 1.2, 1.2, doorX, F + 13.4, front + .2, houseM);
    if (late) boxAt('concrete', 11, F, 6, doorX, 0, front + 3.4, houseM, { uv: true });    // step
    if (late && porch){
      boxAt('trim', 14, 1.1, 7.5, doorX, F + 16.2, front + 3.6, houseM);
      [-6, 6].forEach(o => boxAt('trim', 1.1, 15.8, 1.1, doorX + o, F + .4, front + 6.6, houseM));
    }
    const winY = F + wallH * (twoStorey ? .28 : .52);
    const toEdge = d[side] - CURB - deep / 2 - 6.4;
    if (base) lots.push({ m: houseM.clone(), Wd, Dp, F, wallH, garage, porch, doorX, front, toEdge, i, side, rot, cx, cy });
    if (base && garage) boxAt('garage', Wd * .38, 13.5, .7, Wd * .22, F, front + .1, houseM, { uv: true });
    if (late){
    if (garage){
      boxAt('trim', Wd * .38 + 2, 1.2, 1.2, Wd * .22, F + 13.8, front + .3, houseM);
      windowAt(houseM, -Wd * .05, winY, 0, front, 8, 7);
    } else {
      [-Wd * .3, Wd * .3].forEach(wx => { if (Math.abs(wx - doorX) > 9) windowAt(houseM, wx, winY, 0, front, 9, 8); });
    }
    if (twoStorey) [-Wd * .3, 0, Wd * .3].forEach(wx => windowAt(houseM, wx, F + wallH * .72, 0, front, 8, 7));
    // back and sides
    [-Wd * .25, Wd * .25].forEach(wx => windowAt(houseM, wx, winY, Math.PI, Dp / 2, 8, 7));
    windowAt(houseM, 0, winY, Math.PI / 2, Wd / 2, 8, 7);
    windowAt(houseM, -Dp * .1, winY, -Math.PI / 2, Wd / 2, 8, 7);
    // chimney (most houses), poking through the back slope
    if (i % 4 !== 3){
      const ch = Dp * .42 + 9, chx = Wd * (i % 2 ? .3 : -.3);
      boxAt('chimney', 5.5, ch, 5.5, chx, F + wallH - 2, -Dp * .16, houseM, { uv: true, color: BRICK[0] });
      boxAt('cap', 6.6, 1, 6.6, chx, F + wallH - 2 + ch, -Dp * .16, houseM);
    }
    // path from the step to the sidewalk (block edge)
    if (toEdge > 2){ const g = new THREE.BoxGeometry(5, .5, toEdge); g.translate(0, .25, 0); worldUV(g, i * 3.1, 0); L.makeTranslation(doorX, .5, front + 6.4 + toEdge / 2); put('concrete', g, T.multiplyMatrices(houseM, L)); }
    }
  });

  /* ---------- materials + merge ---------- */
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a242c, roughness: .06, metalness: .55, emissive: 0xffcf80, emissiveIntensity: 0 });
  const MATS = {
    siding: texturedMaterial(TEX.siding, { vertexColors: true }),
    brick: texturedMaterial(TEX.brick, { vertexColors: true }),
    roof: texturedMaterial(TEX.shingles, { vertexColors: true, roughness: .95 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: .6 }),
    glass,
    door: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45 }),
    found: texturedMaterial(TEX.concrete, { color: 0x9c988f }),
    concrete: texturedMaterial(TEX.concrete),
    garage: texturedMaterial(TEX.garage, { roughness: .6 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x77736e, roughness: .8 }),
  };
  MATS.chimney = MATS.brick;
  [MATS.siding, MATS.brick, MATS.roof, MATS.found, MATS.concrete, MATS.garage].forEach(m => {
    // textures are shared; world UVs are in map units, so scale by the texture's tile size
    m.map = m.map.clone(); if (m.normalMap) m.normalMap = m.normalMap.clone();
    const t = m === MATS.siding ? TEX.siding : m === MATS.brick ? TEX.brick : m === MATS.roof ? TEX.shingles : m === MATS.garage ? TEX.garage : TEX.concrete;
    [m.map, m.normalMap].filter(Boolean).forEach(x => { x.repeat.set(1 / t.tile, 1 / t.tile); x.needsUpdate = true; });
  });
  const meshes = {};
  const flush = () => { for (const [key, list] of Object.entries(buckets)){
    // every piece in a bucket must have the same attributes before merging
    const needColor = list.some(g => g.attributes.color);
    if (needColor) list.forEach(g => { if (!g.attributes.color){ const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); } });
    list.forEach(g => { for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a); g.clearGroups(); });
    const merged = mergeGeometries(list, false);
    const mesh = new THREE.Mesh(merged, MATS[key]);
    mesh.castShadow = key !== 'concrete' && key !== 'glass'; mesh.receiveShadow = true;
    scene.add(mesh); meshes[key] = mesh; delete buckets[key];
  } };
  build(0); flush();

  const roofMap = MATS.roof.map, snowMap = TEX.snow.map.clone(); snowMap.repeat.set(1 / 30, 1 / 30); snowMap.needsUpdate = true;
  return {
    meshes, glass, lots, mats: MATS,
    finish(){ build(1); flush(); },      // the detail pass calls this once the town is on screen
    setSnow(on){
      MATS.roof.map = on ? snowMap : roofMap;
      MATS.roof.vertexColors = !on;
      MATS.roof.color.setHex(on ? 0xf4f7fa : 0xffffff);
      MATS.roof.needsUpdate = true;
    },
    setNight(lit){ glass.emissiveIntensity = 1.1 * lit; glass.color.setHex(lit > .5 ? 0x3a2e1e : 0x1a242c); },
  };
}
