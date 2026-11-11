/*
 * The U of Manitoba stop, modelled on the university's Administration Building:
 * a symmetrical red-brick block on a limestone base, stone trim around every
 * window, a columned entrance with a triangular pediment, and an eight-sided
 * brick cupola with a green copper dome on the roof.
 *
 * Everything is merged into a handful of meshes (one per material), so the
 * whole building costs about as much to draw as one of the plain towers.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.min.js';
import { texturedMaterial, worldUV } from './textures3d.js';

export function createAdminBuilding(scene, r, { X, Z, TEX, reflect }){
  const cx = X(r.x + r.w / 2), cz = Z(r.y + r.h / 2);
  const buckets = {};
  const put = (key, g) => { g = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); (buckets[key] ||= []).push(g); };
  // a box sitting on height y, centred on (x, z) in the building's own frame
  const B = (key, w, h, d, x, y, z, textured = key === 'brick' || key === 'stone') => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (textured) worldUV(g, x * .7, z * .7);
    g.translate(x, y + h / 2, z); put(key, g);
  };
  const HW = 106, HD = 50;                    // half width / half depth of the main block
  const Y0 = 9, Y1 = 51;                      // top of the stone base, top of the brick

  /* ---- body ---- */
  B('stone', HW * 2 + 3, Y0, HD * 2 + 3, 0, 0, 0);                    // rusticated base
  B('brick', HW * 2, Y1 - Y0, HD * 2, 0, Y0, 0);
  B('stone', HW * 2 + 1.2, 1.3, HD * 2 + 1.2, 0, 23.2, 0);            // belt course above the ground floor
  B('stone', HW * 2 + 1, 2.2, HD * 2 + 1, 0, Y1 - 3.4, 0);            // frieze
  B('stone', HW * 2 + 5, 2.4, HD * 2 + 5, 0, Y1, 0);                  // cornice, overhanging
  B('stone', HW * 2 + 1, 3.4, HD * 2 + 1, 0, Y1 + 2.4, 0);            // parapet
  // stone corner blocks (quoins) and flat pilasters dividing the long walls
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => B('stone', 5, Y1 - Y0 - 3.4, 5, sx * (HW - 2.2), Y0, sz * (HD - 2.2)));
  [-72, 72].forEach(x => [-1, 1].forEach(s => B('stone', 3.2, Y1 - Y0 - 3.4, 1, x, Y0, s * (HD + .4))));

  /* ---- windows: stone surround, sill and lintel, two panes ---- */
  const lit = k => (Math.sin(k * 91.7) * 43758.5453 % 1 + 1) % 1 < .5;
  let wn = 0;
  function win(along, y, h, w, face){        // face: 0 south, 1 north, 2 east, 3 west
    const rot = [0, Math.PI, Math.PI / 2, -Math.PI / 2][face], off = face < 2 ? HD : HW;
    const m = new THREE.Matrix4().makeRotationY(rot).multiply(new THREE.Matrix4().makeTranslation(along, y, off));
    const piece = (key, gw, gh, gd, ly, lz) => { const g = new THREE.BoxGeometry(gw, gh, gd); g.translate(0, ly, lz); g.applyMatrix4(m); put(key, g); };
    piece('stone', w + 2.2, h + 2, .9, 0, .2);
    piece(lit(wn++) ? 'glassLit' : 'glassDark', w, h, 1, 0, .35);
    piece('stone', .7, h, 1.3, 0, .5); piece('stone', w, .6, 1.3, h * .18, .5);
    piece('stone', w + 3.4, 1, 2.2, -h / 2 - 1.2, .9);                  // sill
    piece('stone', w + 3.4, 1.5, 1.6, h / 2 + 1.5, .6);                 // lintel
    piece('stone', 2.2, 2.6, 1.9, h / 2 + 2, .7);                       // keystone
  }
  const FLOORS = [[16.5, 9], [31, 10.5], [43, 6.5]];
  for (let x = -93.75; x <= 94; x += 12.5){
    if (Math.abs(x) < 34) continue;                                   // the entrance is here
    FLOORS.forEach(([y, h]) => { win(x, y, h, 6.6, 0); win(x, y, h, 6.6, 1); });
  }
  [-25, -12.5, 0, 12.5, 25].forEach(x => FLOORS.forEach(([y, h]) => win(x, y, h, 6.6, 1)));   // back wall, behind the entrance
  for (let z = -37.5; z <= 38; z += 12.5) FLOORS.forEach(([y, h]) => { win(z, y, h, 6.6, 2); win(z, y, h, 6.6, 3); });

  /* ---- entrance: steps, four square columns, frieze and pediment ---- */
  const PW = 62, PZ = HD + 13;                                        // portico width, how far it comes forward
  B('brick', PW, Y1 - Y0, 6, 0, Y0, HD + 3);                          // the wall steps forward behind the columns
  B('stone', PW + 2, Y0, 16, 0, 0, HD + 8);                           // porch floor
  for (let k = 0; k < 4; k++) B('stone', PW - 8 + k * 3, Y0 - 2.2 * (k + 1), 3.4, 0, 0, HD + 16 + 1.7 + k * 3.4);   // steps down to the path
  [-27, -9.5, 9.5, 27].forEach(x => {
    B('stone', 6, 2, 6, x, Y0, PZ - 2.5);                             // column base
    B('stone', 4.4, 33, 4.4, x, Y0 + 2, PZ - 2.5);                    // shaft, two storeys tall
    B('stone', 6.2, 2.4, 6.2, x, Y0 + 35, PZ - 2.5);                  // capital
  });
  B('stone', PW + 2, 5.2, 16.5, 0, Y0 + 37.4, HD + 7.6);              // frieze across the columns
  B('stone', PW + 5, 1.6, 18.5, 0, Y0 + 42.6, HD + 7.8);              // its cornice
  { const s = new THREE.Shape(); s.moveTo(-PW / 2 - 2.5, 0); s.lineTo(0, 12); s.lineTo(PW / 2 + 2.5, 0); s.closePath();   // pediment
    const g = new THREE.ExtrudeGeometry(s, { depth: 18, bevelEnabled: false }); g.translate(0, Y0 + 44.2, HD - 1.4); worldUV(g); put('stone', g);
    const c = new THREE.CylinderGeometry(3.4, 3.4, .8, 20); c.rotateX(Math.PI / 2); c.translate(0, Y0 + 48.4, HD + 16.9); put('glassDark', c); }   // round window in the pediment
  // doors and the windows above them, under the portico
  const fz = HD + 6;
  B('stone', 13, 17.5, .8, 0, Y0, fz + .1, false); B('wood', 10.4, 14, 1, 0, Y0, fz + .3);
  B('glassLit', 10.4, 2.6, 1, 0, Y0 + 14.4, fz + .3); B('stone', .5, 14, 1.2, 0, Y0, fz + .4, false);
  [-19, 19].forEach(x => { B('stone', 8, 13, .8, x, Y0 + 3, fz + .1, false); B('glassLit', 6, 11, 1, x, Y0 + 4, fz + .3); });
  [-19, 0, 19].forEach(x => { B('stone', 8, 12, .8, x, 24.5, fz + .1, false); B(x ? 'glassDark' : 'glassLit', 6, 10, 1, x, 25.5, fz + .3); });
  // a shallower stone bay with its own small pediment on the back
  B('stone', 40, Y1 - Y0 - 3.4, 1.2, 0, Y0, -HD - .5, false);
  [-17, 17].forEach(x => B('stone', 3, Y1 - Y0 - 3.4, 2, x, Y0, -HD - 1.2, false));
  B('wood', 8, 13, 1, 0, Y0, -HD - 1.4); B('stone', 14, Y0 - 2, 8, 0, 0, -HD - 5);

  /* ---- low hipped roof behind the parapet ---- */
  { const bw = HW - 3, bd = HD - 3, rise = 8, rl = bw - bd, y = Y1 + 4.2, P = [], tri = (a, b, c) => P.push(...a, ...b, ...c);
    const A = [-bw, y, bd], Bq = [bw, y, bd], C = [bw, y, -bd], D = [-bw, y, -bd], R1 = [-rl, y + rise, 0], R2 = [rl, y + rise, 0];
    tri(A, Bq, R2); tri(A, R2, R1); tri(C, D, R1); tri(C, R1, R2); tri(Bq, C, R2); tri(D, A, R1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2)); g.computeVertexNormals(); put('roof', g); }

  /* ---- the cupola: eight-sided brick drum, stone trim, copper dome, lantern ---- */
  const oct = (key, rTop, rBot, h, y, seg = 8) => { const g = new THREE.CylinderGeometry(rTop, rBot, h, seg); g.rotateY(Math.PI / seg); g.translate(0, y + h / 2, 0); put(key, g); };
  const CY = Y1 + 9;                                                  // where the drum meets the roof
  oct('stone', 20, 21, 3, CY - 1);                                    // plinth
  oct('brick', 15, 15, 17, CY + 2);
  oct('stone', 15.6, 15.6, 1.4, CY + 6.5); oct('stone', 17.6, 16, 2.2, CY + 19); oct('stone', 16.4, 17.6, 1, CY + 21.2);
  for (let k = 0; k < 8; k++){
    const a = k * Math.PI / 4 + Math.PI / 8, face = k * Math.PI / 4;
    const p = new THREE.BoxGeometry(2.6, 17, 2.6); p.translate(Math.sin(a) * 15, CY + 10.5, Math.cos(a) * 15); put('stone', p);          // stone pier on each corner
    const m = new THREE.Matrix4().makeRotationY(face).multiply(new THREE.Matrix4().makeTranslation(0, CY + 12.5, 13.9));
    const fr = new THREE.BoxGeometry(6.2, 10.4, .8); fr.applyMatrix4(m); put('stone', fr);
    const lv = new THREE.BoxGeometry(4.4, 8.6, 1.1); lv.applyMatrix4(m); put('dark', lv);                                                 // louvred opening
    const b = new THREE.BoxGeometry(9, 2.4, .9); b.applyMatrix4(new THREE.Matrix4().makeRotationY(face).multiply(new THREE.Matrix4().makeTranslation(0, CY + 3.3, 18.6))); put('stone', b);   // balustrade
  }
  { const g = new THREE.SphereGeometry(16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 1.05, 1); g.translate(0, CY + 22.2, 0); put('copper', g); }
  oct('stone', 3.4, 3.8, 5.5, CY + 38, 8);
  { const g = new THREE.SphereGeometry(3.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.translate(0, CY + 43.5, 0); put('copper', g); }
  { const g = new THREE.CylinderGeometry(.35, .35, 9, 5); g.translate(0, CY + 51, 0); put('dark', g);
    const s = new THREE.SphereGeometry(1.1, 8, 6); s.translate(0, CY + 47.6, 0); put('copper', s); }

  /* ---- materials + merge ---- */
  const tinted = (t, color, opts) => { const m = texturedMaterial(t, { color, ...opts }); return m; };
  const glassLit = reflect(new THREE.MeshStandardMaterial({ color: 0x24303a, roughness: .08, metalness: .5, emissive: 0xffd9a0, emissiveIntensity: 0 }));
  const MATS = {
    brick: tinted(TEX.brick, 0xffe2d2, { roughness: .9 }),             // salmon-red pressed brick
    stone: tinted(TEX.concrete, new THREE.Color(1.3, 1.2, .98), { roughness: .8 }),   // Tyndall limestone: warm cream (brighter than the grey base texture)
    roof: new THREE.MeshStandardMaterial({ color: 0x55605d, roughness: .85 }),
    copper: new THREE.MeshStandardMaterial({ color: 0x6fae98, roughness: .55, metalness: .25 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4a2c1c, roughness: .5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: .7 }),
    glassLit,
    glassDark: reflect(new THREE.MeshStandardMaterial({ color: 0x24303a, roughness: .08, metalness: .5 })),
  };
  const group = new THREE.Group(); group.position.set(cx, 0, cz);
  for (const [key, list] of Object.entries(buckets)){
    const mesh = new THREE.Mesh(mergeGeometries(list, false), MATS[key]);
    mesh.castShadow = !key.startsWith('glass'); mesh.receiveShadow = true; group.add(mesh);
  }
  scene.add(group);
  return {
    top: CY + 56, eave: Y1 + 2.4,
    // footprint of the roof edge, for anything that hangs from it (Christmas lights)
    eaveRect: { x: r.x + r.w / 2 - HW - 2.5, y: r.y + r.h / 2 - HD - 2.5, w: HW * 2 + 5, h: HD * 2 + 5 },
    setNight(l){ glassLit.emissiveIntensity = 1.15 * l; },
    setSnow(on){ MATS.roof.color.setHex(on ? 0xeef2f6 : 0x55605d); MATS.copper.color.setHex(on ? 0x9cc5b8 : 0x6fae98); },
  };
}
