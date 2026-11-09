/*
 * Airport north of town (3D view only).
 *
 * A runway with a parallel taxiway, an apron with a terminal, a control tower
 * and a parked jet. Two airliners fly a continuous loop: line up, take off
 * heading east, climb, fly a wide circuit around the town, turn onto final,
 * land, roll out and taxi back to the runway start.
 *
 * The loop is one smooth closed curve through hand-placed waypoints, each with
 * a target speed. Planes move along it by distance, pitch with the climb and
 * bank into turns. Landing gear is down near the ground. At night the runway
 * edge lights, the terminal windows and the planes' navigation lights glow.
 *
 * Positions are in map units (same x/y as app.js); X()/Z() convert to 3D.
 */
import * as THREE from 'three';

// The airport's patch of land (map units). three3d.js clears trees from it.
export const AIRPORT = { x0: 330, x1: 2070, y0: -440, y1: -60 };
const RWY = { x0: 520, x1: 1900, y: -330, w: 60 };     // runway, heading east
const TWY = { y: -250, w: 26 };                         // parallel taxiway
const APRON = { x0: 1040, x1: 1360, y0: -232, y1: -128 };

export function createAirport(scene, { X, Z, mat, solid, moving }){
  const g = new THREE.Group(); scene.add(g);
  const box = (w, h, d, m, x, y, z, cast = true) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = cast; b.receiveShadow = true; g.add(b); return b; };
  const flat = (x0, x1, y0, y1, m, h) => box(Math.abs(x1 - x0), .6, Math.abs(y1 - y0), m, X((x0 + x1) / 2), h, Z((y0 + y1) / 2), false);

  /* ---------- ground ---------- */
  flat(AIRPORT.x0, AIRPORT.x1, AIRPORT.y0, AIRPORT.y1, mat('block', 0), .4);          // grass (turns white in snow)
  const asphalt = solid(0x3f444b), apronMat = solid(0x6b7078), white = solid(0xf4f4f0), yellow = solid(0xf2d16b);
  flat(RWY.x0, RWY.x1, RWY.y - RWY.w / 2, RWY.y + RWY.w / 2, asphalt, 2.6);
  flat(RWY.x0 + 20, RWY.x1 - 40, TWY.y - TWY.w / 2, TWY.y + TWY.w / 2, asphalt, 2.5);
  flat(APRON.x0, APRON.x1, APRON.y0, APRON.y1, apronMat, 2.55);
  // taxiway links between runway and taxiway at both ends and to the apron
  [RWY.x0 + 40, RWY.x1 - 70, 1200].forEach(x => flat(x - 13, x + 13, TWY.y, RWY.y - RWY.w / 2 + 4, asphalt, 2.52));
  // runway markings
  for (let x = RWY.x0 + 140; x < RWY.x1 - 140; x += 60) flat(x, x + 30, RWY.y - 1.5, RWY.y + 1.5, white, 3.0);   // centre line
  [RWY.x0 + 12, RWY.x1 - 48].forEach(x0 => { for (let k = -3; k <= 3; k++) if (k) flat(x0, x0 + 36, RWY.y + k * 7 - 2, RWY.y + k * 7 + 2, white, 3.0); });   // thresholds
  [RWY.x0 + 300, RWY.x1 - 340].forEach(x0 => [-1, 1].forEach(s => flat(x0, x0 + 40, RWY.y + s * 14 - 4, RWY.y + s * 14 + 4, white, 3.0)));        // touchdown zones
  for (let x = RWY.x0 + 40; x < RWY.x1 - 70; x += 40) flat(x, x + 20, TWY.y - 1, TWY.y + 1, yellow, 2.9);                                       // taxiway centre line
  // apron stand lines
  [1110, 1290].forEach(x => flat(x - 1, x + 1, APRON.y0 + 6, APRON.y1 - 30, yellow, 2.9));

  /* ---------- terminal, tower, hangar ---------- */
  const term = { x0: 1060, x1: 1340, y0: -118, y1: -82 };
  box(term.x1 - term.x0, 26, term.y1 - term.y0, solid(0xe7e3da), X((term.x0 + term.x1) / 2), 13, Z((term.y0 + term.y1) / 2));
  const termGlass = new THREE.MeshStandardMaterial({ color: 0x8fb8d4, roughness: .15, metalness: .3, emissive: 0xffc56e, emissiveIntensity: 0 });
  box(term.x1 - term.x0 - 10, 10, 1, termGlass, X((term.x0 + term.x1) / 2), 13, Z(term.y0) - .4, false);
  box(term.x1 - term.x0 + 6, 3, term.y1 - term.y0 + 6, solid(0xb9b4aa), X((term.x0 + term.x1) / 2), 27.5, Z((term.y0 + term.y1) / 2));
  // jet bridges
  [1110, 1290].forEach(x => box(8, 7, 40, solid(0xcfcac0), X(x), 14, Z(term.y0) - 20));
  // control tower
  { const tx = X(1420), tz = Z(-150);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 80, 12), solid(0xdedbd3)); shaft.position.set(tx, 40, tz); shaft.castShadow = true; g.add(shaft);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(15, 12, 14, 12), termGlass); cab.position.set(tx, 87, tz); cab.castShadow = true; g.add(cab);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 3, 12), solid(0x5a5f66)); cap.position.set(tx, 95.5, tz); g.add(cap);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); beacon.position.set(tx, 100, tz); g.add(beacon);
    g.userData.beacon = beacon; }
  // hangar (curved roof)
  { const hx = X(800), hz = Z(-150);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 90, 16, 1, false, 0, Math.PI), solid(0x9aa3ad, { metalness: .3, roughness: .5 }));
    roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.position.set(hx, 0, hz); roof.castShadow = true; g.add(roof); }
  // windsock
  { const wx = X(RWY.x0 + 90), wz = Z(RWY.y + 52);
    box(1.4, 22, 1.4, solid(0xcfcfcf), wx, 11, wz);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(3, 14, 10, 1, true), solid(0xff7a1a)); sock.rotation.z = Math.PI / 2; sock.position.set(wx + 7, 21, wz); g.add(sock); }

  /* ---------- runway edge lights (glow at night) ---------- */
  const edge = [];
  for (let x = RWY.x0; x <= RWY.x1; x += 40) [-1, 1].forEach(s => edge.push([X(x), Z(RWY.y + s * (RWY.w / 2 + 3))]));
  const approach = [];
  for (let k = 1; k <= 6; k++) approach.push([X(RWY.x0 - k * 24), Z(RWY.y)]);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xdfe6ee });
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(2, 6, 4), edgeMat, edge.length + approach.length);
  { const o = new THREE.Object3D(); [...edge, ...approach].forEach(([x, z], i) => { o.position.set(x, 3.6, z); o.updateMatrix(); lights.setMatrixAt(i, o.matrix); }); g.add(lights); }

  /* ---------- airliners ---------- */
  function airliner(tail){
    const p = new THREE.Group();
    const body = solid(0xf5f5f2), dark = solid(0x2a3340), accent = solid(tail);
    const fus = new THREE.Mesh(new THREE.CapsuleGeometry(7, 74, 4, 14), body); fus.rotation.z = Math.PI / 2; fus.position.y = 12; p.add(fus);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 60, 14, 1, true, Math.PI * .35, Math.PI * .3), accent); stripe.rotation.z = Math.PI / 2; stripe.position.y = 12; p.add(stripe);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 10), dark); nose.position.set(40, 15.5, 0); p.add(nose);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(22, 2, 110), body); wing.position.set(2, 9.5, 0); wing.rotation.y = 0; p.add(wing);
    [-1, 1].forEach(s => {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 14, 10), solid(0xd6d6d2)); eng.rotation.z = Math.PI / 2; eng.position.set(6, 5, s * 22); p.add(eng);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(1.8, 6, 4), new THREE.MeshBasicMaterial({ color: s > 0 ? 0x2bd66b : 0xff3030 })); tip.position.set(2, 10, s * 55); p.add(tip);
    });
    const stab = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 40), body); stab.position.set(-38, 14, 0); p.add(stab);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(16, 22, 1.8), accent); fin.position.set(-38, 26, 0); p.add(fin);
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); strobe.position.set(-45, 37, 0); p.add(strobe);
    const gear = new THREE.Group();
    [[30, 0], [0, -8], [0, 8]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3, 8), solid(0x1f1f1f)); w.rotation.x = Math.PI / 2; w.position.set(x, 2.6, z); gear.add(w); const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4, 1.2), solid(0x8a8f96)); leg.position.set(x, 5.5, z); gear.add(leg); });
    p.add(gear);
    p.traverse(m => { if (m.isMesh && m.material !== strobe.material) m.castShadow = false; });
    p.userData = { gear, strobe };
    return p;
  }

  // parked jet at the gate
  { const parked = airliner(0x457b9d); parked.position.set(X(1200), 0, Z(-176)); parked.rotation.y = -Math.PI / 2; parked.scale.setScalar(.95); g.add(parked); }

  // the flight loop: [x, y, altitude, speed]
  const R = RWY.y;
  const WP = [
    [RWY.x0 + 40, R, 0, 60],        // lined up at the start of the runway
    [RWY.x0 + 220, R, 0, 110],
    [1000, R, 0, 190],              // take-off roll
    [1330, R, 6, 220],              // rotate
    [1800, R, 90, 240],
    [2350, R - 40, 250, 260],       // climbing out east
    [2850, 60, 420, 280],
    [2800, 700, 450, 280],          // turn south, then back west right over the town
    [2100, 1150, 450, 280],
    [1200, 1250, 450, 280],
    [300, 1050, 450, 280],
    [-350, 650, 420, 270],
    [-650, 100, 350, 250],
    [-560, R + 40, 270, 230],       // turning onto final
    [-180, R, 170, 210],
    [350, R, 90, 190],
    [RWY.x0 + 280, R, 6, 175],      // touchdown, well past the waiting plane
    [1050, R, 0, 150],
    [1400, R, 0, 110],               // roll-out
    [RWY.x1 - 70, R + 14, 0, 80],   // exit onto the taxiway
    [RWY.x1 - 120, TWY.y, 0, 95],
    [1300, TWY.y, 0, 135],           // taxi back west
    [700, TWY.y, 0, 135],
    [RWY.x0 + 40, TWY.y + 10, 0, 85],
    [RWY.x0 - 10, R + 30, 0, 60],   // turn onto the runway
  ];
  const curve = new THREE.CatmullRomCurve3(WP.map(([x, y, a]) => new THREE.Vector3(X(x), a, Z(y))), true, 'centripetal');
  // sample the curve by distance, with a target speed at each sample
  const N = 1200, total = curve.getLength();
  // where each waypoint sits along the loop (0..1 by distance): a closed Catmull-Rom curve
  // passes through point i at t = i / n, so read the arc length there
  const SUB = 60, lens = curve.getLengths(WP.length * SUB);
  const wpU = WP.map((_, i) => lens[i * SUB] / total);
  function speedAt(u){
    for (let i = 0; i < WP.length; i++){
      const a = wpU[i], b = i + 1 < WP.length ? wpU[i + 1] : 1 + wpU[0], uu = u < a && i === WP.length - 1 ? u + 1 : u;
      if (uu >= a && uu <= b){ const t = (uu - a) / (b - a || 1); return WP[i][3] + (WP[(i + 1) % WP.length][3] - WP[i][3]) * t; }
    }
    return 100;
  }
  // air legs fly faster than the ground legs (it's a big circuit around the town)
  const AIR_X = 1.7;
  WP.forEach(w => { if (w[2] > 20) w[3] *= AIR_X; });
  const loopTime = (() => { let t = 0; for (let i = 0; i < N; i++) t += (total / N) / speedAt(i / N); return t; })();

  const shadowTex = (() => {               // top-down plane silhouette, blurred
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
    x.filter = 'blur(3px)'; x.fillStyle = '#000';
    x.fillRect(14, 58, 100, 12);            // fuselage (nose to the right)
    x.beginPath(); x.moveTo(52, 8); x.lineTo(74, 8); x.lineTo(80, 64); x.lineTo(74, 120); x.lineTo(52, 120); x.lineTo(60, 64); x.fill();   // wings
    x.fillRect(14, 44, 12, 40);             // tailplane
    const t = new THREE.CanvasTexture(c); return t; })();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x000000, transparent: true, opacity: .3, depthWrite: false });
  const planes = [0xd62839, 0x2a9d8f].map((c, i) => {
    const p = airliner(c); g.add(p);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(100, 110), shadowMat.clone()); sh.rotation.x = -Math.PI / 2; g.add(sh);
    return { p, sh, d: 0, yaw: 0, bank: 0 };
  });
  let minGap = 0;
  // Space the two planes so they never get close: sample where a plane is over
  // one loop, then pick the time offset that keeps the closest approach largest.
  { const STEP = .25, track = []; let d = 0;
    for (let t = 0; t < loopTime; t += STEP){ track.push({ d, p: curve.getPointAt((d / total) % 1) }); d = (d + speedAt((d / total) % 1) * STEP) % total; }
    const n = track.length; let best = Math.round(n / 2), bestGap = -1;
    for (let k = Math.round(n * .3); k <= Math.round(n * .7); k++){
      let gap = Infinity;
      for (let i = 0; i < n; i++){ const a = track[i].p, b = track[(i + k) % n].p; gap = Math.min(gap, Math.hypot(a.x - b.x, (a.y - b.y) * 2, a.z - b.z)); if (gap < bestGap) break; }
      if (gap > bestGap){ bestGap = gap; best = k; }
    }
    planes[1].d = track[best].d; minGap = bestGap; }

  const tmpT = new THREE.Vector3(), tmpP = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let lit = 0, clock = 0;
  function place(pl, dt){
    const u = (pl.d / total) % 1;
    curve.getPointAt(u, tmpP); curve.getTangentAt(u, tmpT);
    const alt = Math.max(0, tmpP.y);
    pl.p.position.set(tmpP.x, alt, tmpP.z);
    const yaw = Math.atan2(-tmpT.z, tmpT.x);
    let dYaw = yaw - pl.yaw; dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    const turnRate = dt ? dYaw / dt : 0;
    pl.yaw = yaw;
    const wantBank = alt > 20 ? Math.max(-.5, Math.min(.5, turnRate * .9)) : 0;
    pl.bank += (wantBank - pl.bank) * (1 - Math.exp(-dt * 2.5));
    const pitch = alt > 1 || tmpT.y > 0 ? Math.atan2(tmpT.y, Math.hypot(tmpT.x, tmpT.z)) : 0;
    pl.p.rotation.set(0, 0, 0);
    pl.p.rotateY(yaw); pl.p.rotateZ(pitch); pl.p.rotateX(-pl.bank);
    pl.p.userData.gear.visible = alt < 70;
    // ground shadow, fading with height
    pl.sh.position.set(tmpP.x + alt * .25, 3.2, tmpP.z + alt * .12);
    pl.sh.rotation.z = yaw;
    pl.sh.material.opacity = .3 * Math.max(0, 1 - alt / 520);
    pl.sh.scale.setScalar(1 + alt / 600);
  }
  planes.forEach(pl => place(pl, 0));

  return {
    update(dt){
      if (!moving || !dt) return;
      dt = Math.min(dt, .05); clock += dt;
      planes.forEach(pl => { pl.d = (pl.d + speedAt((pl.d / total) % 1) * dt) % total; place(pl, dt); });
      const blink = (clock % 1.2) < .08;
      planes.forEach(pl => { pl.p.userData.strobe.visible = blink; });
      g.userData.beacon.visible = (clock % 1.6) < .8;
    },
    setNight(l){
      lit = l;
      termGlass.emissiveIntensity = .9 * l;
      edgeMat.color.setHex(l > .05 ? 0xfff2c8 : 0xc8ced6);
    },
    planes, loopTime, total, get minGap(){ return minGap; },
  };
}
