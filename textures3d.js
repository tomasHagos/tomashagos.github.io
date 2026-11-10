/*
 * Surface textures for the 3D town, painted in the browser (no image downloads).
 * Each one comes with a matching normal map, worked out from a height image,
 * so mortar lines, board edges and shingles catch the light.
 *
 * Textures are meant to be used with "world" UVs (1 UV unit = 1 map unit);
 * `tile` says how many map units one copy of the texture covers.
 */
import * as THREE from 'three';

function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let DENS = 1;                               // fewer specks on small textures (they would only blur together)
const speckle = (g, s, n, r, alpha, colors, seed) => { const R = rng(seed); n = Math.round(n * DENS); if (DENS < 1) r *= 1.6; for (let i = 0; i < n; i++){ g.fillStyle = colors[Math.floor(R() * colors.length)]; g.globalAlpha = alpha * (.4 + R() * .6); g.fillRect(R() * s, R() * s, r * (.5 + R()), r * (.5 + R())); } g.globalAlpha = 1; };

let NO_NORMALS = false;                     // phones: skip bump detail (cheaper to draw)
function make(size, tile, paint, normalStrength){
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  DENS = Math.min(1, size * size / (512 * 512) * 2);
  // the height picture is only needed for bumps; without them, drawing into it is skipped
  const h = NO_NORMALS ? null : document.createElement('canvas'); if (h) h.width = h.height = size;
  const hg = h ? h.getContext('2d') : new Proxy({}, { get: () => () => ({ addColorStop(){} }), set: () => true });
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, size, size);
  const k = size / 512;                      // paint in 512-space, scaled to the real size
  g.scale(k, k); hg.scale(k, k);
  paint(g, hg, 512);
  if (NO_NORMALS){
    const map = new THREE.CanvasTexture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4; map.repeat.set(1 / tile, 1 / tile); map.colorSpace = THREE.SRGBColorSpace;
    return { map, normalMap: null, tile };
  }
  const hd = hg.getImageData(0, 0, size, size).data, n = document.createElement('canvas'); n.width = n.height = size;
  const ng = n.getContext('2d'), out = ng.createImageData(size, size);
  const at = (x, y) => hd[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  const s = normalStrength * k;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++){
    const dx = (at(x + 1, y) - at(x - 1, y)) * s / k, dy = (at(x, y + 1) - at(x, y - 1)) * s / k;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out.data[i] = (-dx / l * .5 + .5) * 255; out.data[i + 1] = (dy / l * .5 + .5) * 255; out.data[i + 2] = (1 / l * .5 + .5) * 255; out.data[i + 3] = 255;
  }
  ng.putImageData(out, 0, 0);
  const map = new THREE.CanvasTexture(c), normalMap = new THREE.CanvasTexture(n);
  [map, normalMap].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.repeat.set(1 / tile, 1 / tile); });
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap, tile };
}

// opts.size / opts.normals override the defaults; opts.lazy returns { name: () => texture }
// so the caller can paint them one at a time (the detail pass does, between frames).
export function makeTextures(mobile, opts = {}){
  const S = opts.size || (mobile ? 256 : 512);
  const noNormals = opts.normals === undefined ? mobile : !opts.normals;
  NO_NORMALS = noNormals;
  const defs = {
    brick: () => make(S, 34, (g, h, s) => {
      g.fillStyle = '#b9b2a7'; g.fillRect(0, 0, s, s); h.fillStyle = '#404040'; h.fillRect(0, 0, s, s);
      const R = rng(3), bw = 64, bh = 24, m = 4;
      for (let row = 0; row < s / bh; row++) for (let col = -1; col < s / bw + 1; col++){
        const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh, v = R();
        g.fillStyle = `hsl(${10 + v * 12}, ${38 + v * 15}%, ${30 + v * 14}%)`; g.fillRect(x + m / 2, y + m / 2, bw - m, bh - m);
        h.fillStyle = `rgb(${200 + v * 40},${200 + v * 40},${200 + v * 40})`; h.fillRect(x + m / 2, y + m / 2, bw - m, bh - m);
      }
      speckle(g, s, 9000, 2, .18, ['#000', '#fff', '#5a2a1a'], 4); speckle(h, s, 6000, 2, .25, ['#000', '#fff'], 5);
    }, 3),
    siding: () => make(S, 26, (g, h, s) => {
      for (let y = 0; y < s; y += 32){
        const gr = g.createLinearGradient(0, y, 0, y + 32); gr.addColorStop(0, '#f4f1ea'); gr.addColorStop(.85, '#e6e2d8'); gr.addColorStop(1, '#b4afa4');
        g.fillStyle = gr; g.fillRect(0, y, s, 32);
        const hg = h.createLinearGradient(0, y, 0, y + 32); hg.addColorStop(0, '#606060'); hg.addColorStop(.9, '#e0e0e0'); hg.addColorStop(1, '#202020');
        h.fillStyle = hg; h.fillRect(0, y, s, 32);
      }
      speckle(g, s, 4000, 3, .05, ['#000', '#fff'], 7);
    }, 2.5),
    shingles: () => make(S, 30, (g, h, s) => {
      g.fillStyle = '#5a5654'; g.fillRect(0, 0, s, s); h.fillStyle = '#202020'; h.fillRect(0, 0, s, s);
      const R = rng(11), bw = 42, bh = 26;
      for (let row = 0; row < s / bh + 1; row++) for (let col = -1; col < s / bw + 1; col++){
        const x = col * bw + (row % 2 ? bw / 2 : 0) + (R() - .5) * 4, y = row * bh, v = R();
        g.fillStyle = `hsl(${20 + v * 14}, ${6 + v * 8}%, ${46 + v * 18}%)`; g.fillRect(x + 1.5, y, bw - 3, bh - 3);
        const hg = h.createLinearGradient(0, y, 0, y + bh); hg.addColorStop(0, '#707070'); hg.addColorStop(1, '#f0f0f0');
        h.fillStyle = hg; h.fillRect(x + 1.5, y, bw - 3, bh - 3);
      }
      speckle(g, s, 14000, 1.6, .3, ['#000', '#888', '#5a4a40'], 12);
    }, 3),
    asphalt: () => make(S, 70, (g, h, s) => {
      g.fillStyle = '#4a4c50'; g.fillRect(0, 0, s, s);
      speckle(g, s, 30000, 1.6, .5, ['#36383b', '#64676b', '#55585c', '#3d3f42'], 21);
      speckle(h, s, 26000, 1.6, .6, ['#000', '#fff'], 22);
      g.strokeStyle = 'rgba(25,25,25,.5)'; g.lineWidth = 1.3; const R = rng(23);
      for (let k = 0; k < 5; k++){ g.beginPath(); let x = R() * s, y = R() * s; g.moveTo(x, y); for (let j = 0; j < 9; j++){ x += (R() - .5) * 50; y += (R() - .5) * 50; g.lineTo(x, y); } g.stroke(); }
    }, 1.4),
    concrete: () => make(S, 20, (g, h, s) => {
      g.fillStyle = '#c4c1ba'; g.fillRect(0, 0, s, s);
      speckle(g, s, 16000, 2, .14, ['#98968f', '#dedbd4', '#aeaba4'], 31);
      g.fillStyle = 'rgba(70,70,70,.5)'; g.fillRect(0, 0, s, 3); g.fillRect(0, 0, 3, s);
      h.fillStyle = '#202020'; h.fillRect(0, 0, s, 3); h.fillRect(0, 0, 3, s);
    }, 2),
    grass: () => make(S, 90, (g, h, s) => {
      g.fillStyle = '#5a8a3a'; g.fillRect(0, 0, s, s);
      { const R = rng(40); for (let k = 0; k < 40; k++){ const x = R() * s, y = R() * s, r = 30 + R() * 80, gr = g.createRadialGradient(x, y, 0, x, y, r); const c = R() < .5 ? '78,120,44' : '108,145,62'; gr.addColorStop(0, `rgba(${c},.45)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } }
      speckle(g, s, 50000, 2, .45, ['#477330', '#7aa553', '#638f42', '#87ac57', '#3b6328'], 41);
      speckle(h, s, 30000, 2, .5, ['#000', '#fff'], 42);
    }, 1.6),
    snow: () => make(S, 90, (g, h, s) => {
      g.fillStyle = '#f2f5f8'; g.fillRect(0, 0, s, s);
      { const R = rng(50); for (let k = 0; k < 30; k++){ const x = R() * s, y = R() * s, r = 40 + R() * 90, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(205,218,232,.35)'); gr.addColorStop(1, 'rgba(205,218,232,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } }
      speckle(g, s, 8000, 2, .25, ['#ffffff', '#dfe7ef'], 51);
      speckle(h, s, 12000, 3, .35, ['#000', '#fff'], 52);
    }, 1.2),
    garage: () => make(Math.min(S, 256), 22, (g, h, s) => {
      g.fillStyle = '#efeee9'; g.fillRect(0, 0, s, s); h.fillStyle = '#a0a0a0'; h.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += s / 4){ g.fillStyle = '#c9c7c0'; g.fillRect(0, y, s, 6); h.fillStyle = '#202020'; h.fillRect(0, y, s, 6);
        for (let x = 16; x < s; x += s / 4){ h.fillStyle = '#d8d8d8'; h.fillRect(x, y + 20, s / 4 - 32, s / 4 - 40); } }
    }, 2.5),
  };
  if (opts.lazy) return Object.fromEntries(Object.entries(defs).map(([k, f]) => [k, () => { NO_NORMALS = noNormals; return f(); }]));
  return Object.fromEntries(Object.entries(defs).map(([k, f]) => [k, f()]));
}

// Material using one of the textures above (expects world UVs on the geometry).
export function texturedMaterial(t, opts = {}){
  return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: .9, ...opts });
}

// Replace a geometry's UVs with world-unit ones from its own coordinates, picking
// the plane by each vertex's normal (top/bottom -> x,z; sides -> along,y).
// `ox`/`oz` shift the pattern so neighbouring pieces don't all start at 0.
export function worldUV(geo, ox = 0, oz = 0){
  const p = geo.attributes.position, n = geo.attributes.normal; let uv = geo.attributes.uv;
  if (!uv){ uv = new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2); geo.setAttribute('uv', uv); }
  for (let i = 0; i < p.count; i++){
    const x = p.getX(i) + ox, y = p.getY(i), z = p.getZ(i) + oz, nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    if (ny > .5) uv.setXY(i, x, z); else if (nx > .5) uv.setXY(i, z, y); else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
  return geo;
}
