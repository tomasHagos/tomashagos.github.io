/*
 * Car model shared by the traffic and the parked cars.
 *
 * The body is a side profile extruded across the car's width with rounded
 * (bevelled) edges; the windows are a slightly wider "greenhouse" in dark,
 * reflective glass. Paint is glossy with a clear coat. Tyres and rims are
 * drawn by instanced meshes owned by whoever places the cars, using
 * `wheelMatrices` (one per wheel, in the car's own frame).
 *
 * Size: ~27 long, ~12 wide, wheels ~3.4 radius (same scale as the town).
 */
import * as THREE from 'three';

const S = .55;                                            // model units -> town units
const PROFILES = {
  sedan: { body: [[-24,6],[-24.4,11.5],[-23,13.6],[-15,14.6],[-9.5,20.6],[4.5,20.8],[11,15.4],[21.5,13.6],[24.4,11],[24.4,6]],
           glass: [[-14,14.9],[-9.1,20.2],[4.2,20.4],[10.2,15.5]], mirrorX: 11 },
  suv:   { body: [[-24,6],[-24,17],[-22.5,24],[11,24],[16,17.5],[23.5,15.8],[24.5,11],[24.5,6]],
           glass: [[-22,17.4],[-21.3,23.3],[10.6,23.3],[14.6,17.4]], mirrorX: 14 },
  hatch: { body: [[-21,6],[-21.4,16],[-19.5,21],[3,21.2],[10.5,15.4],[20.5,13.8],[22,10.5],[22,6]],
           glass: [[-19.4,15.6],[-18.4,20.4],[2.8,20.6],[9.4,15.6]], mirrorX: 10 },
};
const shape = pts => { const s = new THREE.Shape(); pts.forEach(([a, b], i) => i ? s.lineTo(a, b) : s.moveTo(a, b)); s.closePath(); return s; };

export function createCarKit(reflect = m => m){
  const GEO = {};
  for (const [k, p] of Object.entries(PROFILES)){
    const body = new THREE.ExtrudeGeometry(shape(p.body), { depth: 18, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.4, bevelSegments: 3, curveSegments: 6 });
    body.translate(0, 0, -9); body.scale(S, S, S);
    const g = p.glass.map(([a, b]) => [a * 1.03, (b - 19) * 1.04 + 19]);
    const glass = new THREE.ExtrudeGeometry(shape(g), { depth: 21.9, bevelEnabled: false }); glass.translate(0, 0, -10.95); glass.scale(S, S, S);
    const front = Math.max(...p.body.map(q => q[0]));
    GEO[k] = { body, glass, front: front * S, back: Math.min(...p.body.map(q => q[0])) * S, mirrorX: p.mirrorX * S };
  }
  const glassMat = reflect(new THREE.MeshStandardMaterial({ color: 0x0f161c, roughness: .04, metalness: .6 }));
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, metalness: .5, roughness: .45 });
  const lightGeo = new THREE.BoxGeometry(.7, 1.4, 2.8), mirrorGeo = new THREE.BoxGeometry(1.1, 1.2, 1.8), grilleGeo = new THREE.BoxGeometry(.6, 1.9, 6);
  const tyreGeo = new THREE.TorusGeometry(4.2 * S, 2 * S, 10, 20);
  const rimGeo = new THREE.CylinderGeometry(3.3 * S, 3.3 * S, 3 * S, 14); rimGeo.rotateX(Math.PI / 2);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .95 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xa3a9ae, metalness: 1, roughness: .3 });
  const wheelMatrices = [[-15, 10.4], [-15, -10.4], [15, 10.4], [15, -10.4]].map(([x, z]) => new THREE.Matrix4().makeTranslation(x * S, 6.2 * S, z * S));

  // Build one car (body, glass, lights, mirrors, grille). Wheels are added by the caller.
  function build(type, color, headMat, tailMat){
    const geo = GEO[type], g = new THREE.Group();
    const paint = reflect(new THREE.MeshStandardMaterial({ color, metalness: .45, roughness: .3 }));   // standard (not clear-coat) paint: much cheaper, still glossy
    g.add(new THREE.Mesh(geo.body, paint), new THREE.Mesh(geo.glass, glassMat));
    [-3.4, 3.4].forEach(z => {
      const h = new THREE.Mesh(lightGeo, headMat); h.position.set(geo.front + .5, 6.6, z); g.add(h);
      const t = new THREE.Mesh(lightGeo, tailMat); t.position.set(geo.back - .5, 6.4, z); g.add(t);
    });
    [-1, 1].forEach(s => { const m = new THREE.Mesh(mirrorGeo, paint); m.position.set(geo.mirrorX, 9.6, s * 6.2); g.add(m); });
    const gr = new THREE.Mesh(grilleGeo, trimMat); gr.position.set(geo.front + .6, 4.8, 0); g.add(gr);
    g.userData.paint = paint;
    return g;
  }
  return { build, GEO, tyreGeo, rimGeo, tyreMat, rimMat, wheelMatrices, TYPES: ['sedan', 'sedan', 'suv', 'hatch'] };
}

// Instanced tyres + rims for a list of car groups; call sync() after moving cars.
export function createWheels(scene, kit, cars){
  const tyres = new THREE.InstancedMesh(kit.tyreGeo, kit.tyreMat, cars.length * 4);
  const rims = new THREE.InstancedMesh(kit.rimGeo, kit.rimMat, cars.length * 4);
  scene.add(tyres, rims);
  const m = new THREE.Matrix4();
  function sync(){
    cars.forEach((g, i) => { g.updateMatrix(); kit.wheelMatrices.forEach((w, j) => { m.multiplyMatrices(g.matrix, w); tyres.setMatrixAt(i * 4 + j, m); rims.setMatrixAt(i * 4 + j, m); }); });
    tyres.instanceMatrix.needsUpdate = rims.instanceMatrix.needsUpdate = true;
  }
  sync();
  return { sync, tyres, rims };
}
