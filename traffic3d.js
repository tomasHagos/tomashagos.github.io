/*
 * Cars and pedestrians for the 3D town (used by three3d.js).
 *
 * Cars drive in the right-hand lane, pick a random way at each intersection
 * (never a U-turn), brake for the car ahead and for the cyclist, and take
 * turns at intersections: one car owns a crossing at a time, and a car that
 * has waited too long goes anyway so nothing can lock up.
 * People walk loops on the sidewalk around each block.
 *
 * All positions here are in map units (the same x/y as app.js); X() and Z()
 * convert to 3D world coordinates.
 */
import * as THREE from 'three';

export function createTraffic(scene, M, { X, Z, mobile }){
  const { XS, YS } = M;
  const LANE = 14;          // lane centre, right of the road's centre line
  const WALK = 34;          // sidewalk centre, from the road's centre line
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- road graph ---------- */
  const nodes = [];
  YS.forEach((y, j) => XS.forEach((x, i) => nodes.push({ i, j, x, y, owner: null })));
  const at = (i, j) => nodes[j * XS.length + i];
  const neighbours = n => [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([a, b]) => [n.i + a, n.j + b])
    .filter(([i, j]) => i >= 0 && i < XS.length && j >= 0 && j < YS.length)
    .map(([i, j]) => at(i, j));
  const edges = [];
  nodes.forEach(a => neighbours(a).forEach(b => edges.push([a, b])));

  /* ---------- cars ---------- */
  const CAR_COLOURS = [0xe63946, 0xf1faee, 0x1d3557, 0xffb703, 0x8ecae6, 0x2a9d8f, 0x6c757d, 0xf4a261, 0x3a86ff, 0x8338ec];
  const bodyGeo = new THREE.BoxGeometry(26, 8, 13);
  const cabinGeo = new THREE.BoxGeometry(13, 7, 11);
  const glass = new THREE.MeshStandardMaterial({ color: 0x26333b, roughness: .2, metalness: .3 });
  const lightGeo = new THREE.BoxGeometry(1, 2.4, 3);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6d5 }), tailMat = new THREE.MeshBasicMaterial({ color: 0xd62828 });
  const blobGeo = new THREE.PlaneGeometry(30, 17), blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .22, depthWrite: false });
  const beamTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(8, 32, 0, 8, 32, 60); r.addColorStop(0, 'rgba(255,245,210,.95)'); r.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = r; g.beginPath(); g.moveTo(0, 26); g.lineTo(64, 4); g.lineTo(64, 60); g.lineTo(0, 38); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const beamGeo = new THREE.PlaneGeometry(56, 34); beamGeo.rotateX(-Math.PI / 2); beamGeo.translate(13 + 28, .9, 0);
  const cars = [];
  const N_CARS = mobile ? 10 : 16;
  const used = new Set();
  for (let k = 0; k < N_CARS; k++){
    let e, tries = 0;
    do { e = pick(edges); tries++; } while (used.has(e) && tries < 50);
    used.add(e);
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: CAR_COLOURS[k % CAR_COLOURS.length], roughness: .35, metalness: .25 }));
    body.position.y = 4.6; g.add(body);
    const cabin = new THREE.Mesh(cabinGeo, glass); cabin.position.set(-1, 11.8, 0); g.add(cabin);
    [-4, 4].forEach(z => {
      const h = new THREE.Mesh(lightGeo, headMat); h.position.set(13.2, 4.6, z); g.add(h);
      const t = new THREE.Mesh(lightGeo, tailMat); t.position.set(-13.2, 4.6, z); g.add(t);
    });
    // Shadows are rendered once for the static town, so moving things carry a soft blob instead.
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.visible = false; g.add(beam); g.userData.beam = beam;
    const blob = new THREE.Mesh(blobGeo, blobMat); blob.rotation.x = -Math.PI / 2; blob.position.set(2, .5, 2); g.add(blob);
    scene.add(g);
    const [a, b] = e;
    const car = { from: a, to: b, len: Math.hypot(b.x - a.x, b.y - a.y), t: rand(60, 380), speed: 0, max: rand(70, 100), wait: 0, g, x: 0, y: 0, dx: 0, dy: 0, yaw: null };
    place(car); car.g.position.set(X(car.x), 3.2, Z(car.y));
    cars.push(car);
  }
  function place(c){
    c.dx = (c.to.x - c.from.x) / c.len; c.dy = (c.to.y - c.from.y) / c.len;
    // right of travel on screen (y points down): (-dy, dx)
    c.x = c.from.x + c.dx * c.t - c.dy * LANE;
    c.y = c.from.y + c.dy * c.t + c.dx * LANE;
  }
  function nextEdge(c){
    const options = neighbours(c.to).filter(n => n !== c.from);
    // go straight a bit more often than turning
    const straight = options.find(n => (n.x - c.to.x) * c.dx + (n.y - c.to.y) * c.dy > 0);
    const next = straight && Math.random() < .45 ? straight : pick(options);
    c.from = c.to; c.to = next;
    c.len = Math.hypot(next.x - c.from.x, next.y - c.from.y);
  }

  function updateCars(dt, rider){
    for (const c of cars){
      let v = c.max;
      // keep a gap to anything ahead in the same lane: other cars and the cyclist
      for (const o of cars){
        if (o === c) continue;
        const rx = o.x - c.x, ry = o.y - c.y, along = rx * c.dx + ry * c.dy, lat = -rx * c.dy + ry * c.dx;
        if (along > 0 && along < 60 && Math.abs(lat) < 9 && o.dx * c.dx + o.dy * c.dy > .5) v = Math.min(v, Math.max(0, (along - 32) / 28) * c.max);
      }
      if (rider){
        const rx = rider.x - c.x, ry = rider.y - c.y, along = rx * c.dx + ry * c.dy, lat = -rx * c.dy + ry * c.dx;
        if (along > 0 && along < 50 && Math.abs(lat) < 10) v = Math.min(v, Math.max(0, (along - 24) / 26) * c.max);
      }
      // intersections: one car at a time; give up waiting after 2.5 s
      const toGo = c.len - c.t;
      if (toGo < 52){
        if (c.to.owner && c.to.owner !== c && c.wait < 2.5){ v = Math.min(v, Math.max(0, (toGo - 38) / 14) * c.max); if (toGo < 42) c.wait += dt; }
        else if (!c.to.owner) c.to.owner = c;
      }
      if (c.from.owner === c && c.t > 42) c.from.owner = null;
      // accelerate gently, brake hard
      c.speed += Math.max(-260 * dt, Math.min(110 * dt, v - c.speed));
      c.t += c.speed * dt;
      if (c.t >= c.len){
        c.t -= c.len; c.wait = 0;
        nextEdge(c);
      }
      place(c);
      // smooth the mesh toward the lane position so turns become curves
      const k = 1 - Math.exp(-dt * 9);
      c.g.position.x += (X(c.x) - c.g.position.x) * k;
      c.g.position.z += (Z(c.y) - c.g.position.z) * k;
      const yaw = -Math.atan2(c.dy, c.dx);
      if (c.yaw === null) c.yaw = yaw;
      let d = yaw - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      c.yaw += d * (1 - Math.exp(-dt * 7));
      c.g.rotation.y = c.yaw;
    }
    // release crossings whose owner has wandered off (e.g. after a long wait)
    for (const n of nodes) if (n.owner && Math.hypot(n.owner.x - n.x, n.owner.y - n.y) > 70) n.owner = null;
  }

  /* ---------- pedestrians ---------- */
  const N_PEOPLE = mobile ? 26 : 44;
  const SHIRTS = [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x457b9d, 0x9b5de5, 0x06d6a0, 0xf1faee, 0x264653, 0xb5179e, 0xff8fab].map(c => new THREE.Color(c));
  const SKIN = [0x8d5a3b, 0xc68642, 0xf1c27d, 0xe0ac69, 0x5c3a21, 0xffdbac].map(c => new THREE.Color(c));
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(2.5, 5.5, 3, 8), new THREE.MeshStandardMaterial({ roughness: .9 }), N_PEOPLE);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 10, 8), new THREE.MeshStandardMaterial({ roughness: .8 }), N_PEOPLE);
  scene.add(bodies, heads);
  const people = [];
  for (let k = 0; k < N_PEOPLE; k++){
    const i = Math.floor(Math.random() * (XS.length - 1)), j = Math.floor(Math.random() * (YS.length - 1));
    const r = { x0: XS[i] + WALK, x1: XS[i + 1] - WALK, y0: YS[j] + WALK, y1: YS[j + 1] - WALK };
    const per = 2 * ((r.x1 - r.x0) + (r.y1 - r.y0));
    people.push({ r, per, s: Math.random() * per, v: rand(11, 19) * (Math.random() < .5 ? 1 : -1), ph: Math.random() * 6.28, side: rand(-3, 3) });
    bodies.setColorAt(k, SHIRTS[k % SHIRTS.length]); heads.setColorAt(k, SKIN[(k * 7) % SKIN.length]);
  }
  const o = new THREE.Object3D();
  function walkPoint(p){
    const { r } = p, w = r.x1 - r.x0, h = r.y1 - r.y0;
    let d = ((p.s % p.per) + p.per) % p.per, x, y, hx, hy;
    if (d < w){ x = r.x0 + d; y = r.y0; hx = 1; hy = 0; }
    else if ((d -= w) < h){ x = r.x1; y = r.y0 + d; hx = 0; hy = 1; }
    else if ((d -= h) < w){ x = r.x1 - d; y = r.y1; hx = -1; hy = 0; }
    else { d -= w; x = r.x0; y = r.y1 - d; hx = 0; hy = -1; }
    if (p.v < 0){ hx = -hx; hy = -hy; }
    return { x: x - hy * p.side, y: y + hx * p.side, hx, hy };
  }
  function updatePeople(dt){
    people.forEach((p, k) => {
      p.s += p.v * dt; p.ph += Math.abs(p.v) * dt * .55;
      const q = walkPoint(p), bob = Math.abs(Math.sin(p.ph)) * 1.1;
      o.rotation.set(0, -Math.atan2(q.hy, q.hx), Math.sin(p.ph) * .08);
      o.position.set(X(q.x), 9 + bob, Z(q.y)); o.updateMatrix(); bodies.setMatrixAt(k, o.matrix);
      o.position.set(X(q.x), 16.4 + bob, Z(q.y)); o.updateMatrix(); heads.setMatrixAt(k, o.matrix);
    });
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  }

  /* ---------- the cyclist weaving around cars ---------- */
  // Returns how far (map units) the rider should swing left of his lane right
  // now: out around any car ahead of him in his lane, back in once it's clear.
  function weaveFor(r){
    if (!r.riding) return 0;
    const a = r.ang * Math.PI / 180, hx = Math.cos(a), hy = Math.sin(a);
    let need = 0;
    for (const c of cars){
      const rx = c.x - r.x, ry = c.y - r.y, along = rx * hx + ry * hy, lat = -rx * hy + ry * hx;
      if (along > -22 && along < 110 && Math.abs(lat) < 12) need = Math.max(need, 19);
    }
    return need;
  }

  return {
    setNight(lit){ beamMat.opacity = .7 * lit; cars.forEach(c => { c.g.userData.beam.visible = lit > .01; }); },
    update(dt, rider){ if (!dt) return; updateCars(Math.min(dt, .05), rider); updatePeople(Math.min(dt, .05)); },
    weaveFor,
    cars, people,
  };
}
