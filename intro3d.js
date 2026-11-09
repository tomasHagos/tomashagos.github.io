/*
 * First-visit intro for the 3D view (about 8 seconds):
 *   a small plane flies over town -> the cyclist jumps out -> parachute drifts
 *   down to the street by Home -> he lands, walks a few steps to his bike and
 *   hops on -> the camera pulls back to the town overview.
 *
 * Plays once per browser. Skip it with the Skip button, by tapping anywhere,
 * or by picking a stop. ?intro=1 always plays it, ?intro=0 never does.
 * It never plays for visitors who ask for reduced motion.
 */
export function createIntro({ THREE, scene, camera, controls, rig, M, X, Z, mobile, holiday, enabled, onEnd }){
  const KEY = 'portfolio-intro-seen';
  const params = new URLSearchParams(location.search);
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch (e) {}
  const force = params.get('intro');
  const play = enabled && !M.reduceMotion && force !== '0' && (force === '1' || !seen);
  const api = { active: false, update(){}, skip(){} };
  if (!play) return api;

  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: .7 });
  const S = .34;                                   // same scale as the riding cyclist
  const start = M.rider();                         // the bike waits where the cyclist starts
  const bikeX = X(start.x), bikeZ = Z(start.y);
  const land = { x: bikeX + 6, z: bikeZ + 46 };    // touch down a few steps behind the bike
  const ALT = mobile ? 500 : 540;                 // jump height

  /* ---------- plane ---------- */
  const plane = new THREE.Group();
  {
    const white = mat(0xf7f7f2), red = mat(0xd62839), dark = mat(0x26333b);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(5, 46, 4, 12), white); body.rotation.z = Math.PI / 2; plane.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(5, 10, 12), red); nose.rotation.z = -Math.PI / 2; nose.position.x = 33; plane.add(nose);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 78), white); wing.position.set(4, 1, 0); plane.add(wing);
    [-1, 1].forEach(s => { const tip = new THREE.Mesh(new THREE.BoxGeometry(14, 1.8, 4), red); tip.position.set(4, 1, s * 38); plane.add(tip); });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 26), white); tail.position.set(-24, 2, 0); plane.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 1.4), red); fin.position.set(-25, 9, 0); plane.add(fin);
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 8), dark); cockpit.position.set(20, 5, 0); plane.add(cockpit);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(1, 16, 2.4), dark); prop.position.x = 38.5; plane.add(prop);
    plane.userData.prop = prop;
  }
  scene.add(plane);

  /* ---------- the jumper (same look as the cyclist) ---------- */
  const person = new THREE.Group();
  const legs = [-1, 1].map(s => {
    const hip = new THREE.Group(); hip.position.set(0, 26, s * 4.5);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(2.8, 16, 4, 8), mat(0x26324a)); leg.position.y = -10; hip.add(leg);
    person.add(hip); return hip;
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(6, 14, 4, 10), mat(0x2f80ed)); torso.position.y = 38; person.add(torso);
  const arms = [-1, 1].map(s => { const a = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 14, 4, 8), mat(0x2f80ed)); a.position.set(0, 40, s * 8.5); person.add(a); return a; });
  const head = new THREE.Mesh(new THREE.SphereGeometry(5.6, 16, 12), mat(0x8d5a3b)); head.position.y = 55; person.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(6.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(holiday === 'christmas' ? 0xd62828 : 0xffd23f)); helmet.position.y = 56; person.add(helmet);
  person.scale.setScalar(S);
  scene.add(person);

  /* ---------- parachute ---------- */
  const chute = new THREE.Group();
  for (let k = 0; k < 8; k++){
    const seg = new THREE.Mesh(new THREE.SphereGeometry(70, 6, 6, k * Math.PI / 4, Math.PI / 4, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xffffff : 0xd62839, roughness: .8, side: THREE.DoubleSide, flatShading: true }));
    chute.add(seg);
  }
  const cords = [];
  for (let k = 0; k < 6; k++){ const a = k * Math.PI / 3; cords.push(Math.cos(a) * 52, 20, Math.sin(a) * 52, 0, -78, 0); }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(cords, 3)), new THREE.LineBasicMaterial({ color: 0x333333 }));
  chute.add(lines);
  chute.scale.setScalar(0);
  scene.add(chute);

  /* ---------- the parked bike ---------- */
  const parked = new THREE.Group();
  {
    const dark = mat(0x1f1f1f), red = mat(0xe76f51);
    [-13, 13].forEach(x => { const w = new THREE.Mesh(new THREE.TorusGeometry(9, 1.8, 8, 20), dark); w.position.set(x, 10, 0); parked.add(w); });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(28, 2.6, 2.6), red); frame.position.y = 15; parked.add(frame);
    const bars = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 16), dark); bars.position.set(12, 26, 0); parked.add(bars);
  }
  parked.scale.setScalar(S);
  parked.position.set(bikeX, 3.2, bikeZ);
  parked.rotation.y = -start.ang * Math.PI / 180;
  scene.add(parked);

  /* ---------- UI: skip ---------- */
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button'; skipBtn.className = 'btn intro-skip'; skipBtn.textContent = 'Skip intro';
  document.body.appendChild(skipBtn);
  const card = document.getElementById('intro');
  card.classList.add('hide');

  /* ---------- timeline ---------- */
  const T = { jump: 1.8, open: 2.55, land: 6.0, walkEnd: 7.4, mount: 7.8 };   // seconds
  const homeZ = bikeZ + 20;
  const PLANE_SPEED = 360;                          // reaches the jump point (over Home) at T.jump
  const planeAt = t => new THREE.Vector3(bikeX + PLANE_SPEED * (t - T.jump), ALT + Math.sin(t * 2) * 4, homeZ - 30);
  const ease = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const jumpFrom = planeAt(T.jump).add(new THREE.Vector3(0, -8, 0));
  const FALL = 220;                                // free-fall 'gravity'
  let t = 0, done = false;
  const camWant = new THREE.Vector3(), lookWant = new THREE.Vector3(), look = new THREE.Vector3();
  rig.visible = false;
  controls.enabled = false;
  api.active = true;

  function finish(){
    if (done) return;
    done = true; api.active = false;
    [plane, person, chute, parked].forEach(o => scene.remove(o));
    rig.visible = true; controls.enabled = true;
    skipBtn.remove();
    document.removeEventListener('pointerdown', onAnyTap, true);
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    const r = M.rider();
    if (!r.riding && r.stop === 'about' && !document.getElementById('panel').classList.contains('open')) card.classList.remove('hide');
    onEnd && onEnd();
  }
  api.skip = finish;
  // Any tap skips. Taps on a stop still go through, so the ride starts right away.
  function onAnyTap(e){ if (api.active && !e.target.closest('.brand a')) finish(); }
  document.addEventListener('pointerdown', onAnyTap, true);
  skipBtn.addEventListener('click', finish);

  api.update = (dt) => {
    if (done) return;
    t += Math.min(dt, .05);
    // plane: crosses the whole time, propeller spinning
    plane.position.copy(planeAt(t));
    plane.userData.prop.rotation.x += dt * 40;
    // jumper
    let p = new THREE.Vector3();
    if (t < T.jump){
      person.visible = false;
      camWant.copy(plane.position).add(new THREE.Vector3(-170 - 60 * Math.max(0, 1 - t / T.jump), 60, 150));
      lookWant.copy(plane.position);
    } else if (t < T.open){
      const u = t - T.jump;                                   // short free fall, carried forward by the plane
      p.set(jumpFrom.x + 120 * (1 - Math.exp(-u * 3)), jumpFrom.y - FALL * u * u, jumpFrom.z);
      person.visible = true;
      person.rotation.set(0, 0, -1.2 + u * .7);                // tumbling out, belly down
      legs.forEach((h, i) => { h.rotation.z = Math.sin(t * 14 + i * Math.PI) * .5; });
    } else if (t < T.land){
      const u = (t - T.open) / (T.land - T.open), e = 1 - Math.pow(1 - u, 1.6);
      const top = new THREE.Vector3(jumpFrom.x + 120 * (1 - Math.exp(-(T.open - T.jump) * 3)), jumpFrom.y - FALL * (T.open - T.jump) ** 2, jumpFrom.z);
      const sway = Math.sin(t * 2.4) * 14 * (1 - u);
      p.set(top.x + (land.x - top.x) * e + sway, top.y * (1 - e) + 3.2, top.z + (land.z - top.z) * e);
      person.visible = true;
      person.rotation.set(0, Math.PI / 2, Math.sin(t * 2.4) * .12 * (1 - u));
      legs.forEach((h, i) => { h.rotation.z = (i ? .15 : -.15) * (1 - u); });
      // chute pops open fast, then rides above him
      const o = Math.min(1, (t - T.open) / .3);
      chute.scale.setScalar(S * (o < 1 ? 1.15 * Math.sin(o * Math.PI / 2) : 1));
      chute.position.copy(p).add(new THREE.Vector3(0, 78 * S + 20 * S, 0));
      chute.rotation.z = Math.sin(t * 2.4) * .1;
    } else {
      // landed: chute collapses behind him, he walks to the bike
      const u = Math.min(1, (t - T.land) / .45);
      chute.scale.set(S * (1 + u * .3), S * Math.max(.02, 1 - u), S * (1 + u * .3));
      chute.position.set(land.x - 30 * u, 3.2 + 40 * S * (1 - u), land.z + 18 * u);
      if (u >= 1) chute.visible = false;
      const w = Math.min(1, Math.max(0, (t - T.land - .15) / (T.walkEnd - T.land - .15)));
      p.set(land.x + (bikeX - 8 - land.x) * ease(w), 3.2, land.z + (bikeZ + 8 - land.z) * ease(w));
      person.visible = true;
      person.rotation.set(0, Math.atan2(-(bikeX - land.x), -(bikeZ - land.z)) + Math.PI / 2, 0);
      const step = w > 0 && w < 1 ? Math.sin(t * 13) * .6 : 0;
      legs.forEach((h, i) => { h.rotation.z = i ? step : -step; });
      arms.forEach((a, i) => { a.rotation.z = (i ? -step : step) * .6; });
      if (t >= T.mount){ finish(); return; }
    }
    if (t >= T.jump) person.position.copy(p);
    // camera: chase the plane, then the jumper, then settle beside the bike
    if (t >= T.jump && t < T.land){
      const orbit = new THREE.Vector3(-110, 70, 170).applyAxisAngle(new THREE.Vector3(0, 1, 0), -(t - T.jump) * .26);   // swing out over the open street, away from Home
      camWant.copy(person.position).add(orbit);
      camWant.y = Math.max(camWant.y, 150);            // stay above the rooftops near the ground
      lookWant.copy(person.position).add(new THREE.Vector3(0, -40, 0));
    } else if (t >= T.land){
      camWant.set(bikeX - 70, 120, bikeZ + 200);
      lookWant.set(bikeX, 10, bikeZ + 20);
    }
    if (t < .05){ camera.position.copy(camWant); look.copy(lookWant); }
    const k = 1 - Math.exp(-dt * (t < T.jump ? 8 : 3.2));
    camera.position.lerp(camWant, k);
    look.lerp(lookWant, 1 - Math.exp(-dt * 6));
    camera.lookAt(look);
    controls.target.copy(look);
  };
  return api;
}
