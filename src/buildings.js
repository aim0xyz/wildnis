import * as THREE from 'three';
import { terrainHeight, terrainSlope, WATER_Y } from './world.js';

function std(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 });
}

const DEFS = {
  campfire: { name: 'Lagerfeuer', r: 0.9, fire: true, blocksPlayer: false, lightColor: 0xffa040, lightI: 2.4, lightD: 16 },
  torch: { name: 'Fackel', r: 0.2, fire: true, lightColor: 0xffb050, lightI: 1.3, lightD: 9 },
  wall: { name: 'Holzwand', r: 0.45, connectable: true, blocksAnimals: true, blocksPlayer: true },
  gate: { name: 'Wildtor', r: 0.45, connectable: true, blocksAnimals: true, blocksPlayer: false },
  tent: { name: 'Zelt', r: 1.5, spawn: true },
  raincatcher: { name: 'Regenfänger', r: 1.15 },
  raft: { name: 'Floß', r: 1.45, blocksPlayer: false, waterOnly: true },
  chest: { name: 'Holztruhe', r: 0.75 },
  workbench: { name: 'Werkbank', r: 1.15 },
  roof: { name: 'Holzdach', r: 2.2, blocksPlayer: false, shelter: true },
};

function buildCampfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), std(0x8d8d93));
    stone.position.set(Math.cos(a) * 0.65, 0.1, Math.sin(a) * 0.65);
    stone.castShadow = true;
    g.add(stone);
  }
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 5), std(0x6e4a2c));
    log.rotation.z = Math.PI / 2.4;
    log.rotation.y = (i / 3) * Math.PI * 2;
    log.position.y = 0.18;
    log.castShadow = true;
    g.add(log);
  }
  const flames = new THREE.Group();
  const cols = [0xff6b1a, 0xffa63d, 0xffd23d];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.22 - i * 0.05, 0.7 - i * 0.12, 5),
      new THREE.MeshBasicMaterial({ color: cols[i] })
    );
    f.position.y = 0.45 + i * 0.12;
    f.rotation.y = i * 0.7;
    flames.add(f);
  }
  g.add(flames);
  g.userData.flames = flames;
  return g;
}

function buildTorch() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.15, 5), std(0x6e4a2c));
  stick.position.y = 0.55;
  stick.castShadow = true;
  g.add(stick);
  const flames = new THREE.Group();
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.38, 5), new THREE.MeshBasicMaterial({ color: 0xffa63d }));
  f.position.y = 1.3;
  flames.add(f);
  g.add(flames);
  g.userData.flames = flames;
  return g;
}

function buildWall() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 0.2), std(0x9b6d3f));
  body.position.y = 0.85;
  body.castShadow = true;
  g.add(body);
  for (const y of [0.45, 1.25]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.18, 0.26), std(0x7a5330));
    plank.position.y = y;
    g.add(plank);
  }
  for (const x of [-0.95, 0.95]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.0, 5), std(0x6e4a2c));
    post.position.set(x, 1.0, 0);
    post.castShadow = true;
    g.add(post);
  }
  return g;
}

function buildGate() {
  const g = new THREE.Group();
  for (const x of [-1.05, 1.05]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.15, 5), std(0x5f4026));
    post.position.set(x, 1.05, 0);
    post.castShadow = true;
    g.add(post);
  }
  const hinge = new THREE.Group();
  hinge.position.x = -0.95;
  for (const y of [0.38, 1.05, 1.72]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.18), std(0x8a5a32));
    beam.position.set(0.95, y, 0);
    beam.castShadow = true;
    hinge.add(beam);
  }
  const brace = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.13, 0.16), std(0x704a2b));
  brace.position.set(0.95, 1.05, 0);
  brace.rotation.z = -0.58;
  hinge.add(brace);
  g.add(hinge);
  g.userData.gateDoor = hinge;
  return g;
}

function buildTent() {
  const g = new THREE.Group();
  // Tipi
  const tipi = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.3, 6), std(0xc9a066));
  tipi.position.y = 1.15;
  tipi.castShadow = true;
  g.add(tipi);
  // Eingang (dunkles Dreieck vorn)
  const door = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 3), std(0x3a2c1e));
  door.position.set(0, 0.55, 1.18);
  door.scale.z = 0.25;
  g.add(door);
  // Stangen oben
  for (const rz of [-0.3, 0.3]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 4), std(0x6e4a2c));
    pole.position.y = 2.5;
    pole.rotation.z = rz;
    g.add(pole);
  }
  // Abspannseile und Heringe geben dem Zelt eine glaubwürdige Silhouette.
  for (const x of [-1, 1]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.7, 4), std(0x9f8a62));
    rope.position.set(x * 1.25, 0.72, 0); rope.rotation.z = x * -0.78; g.add(rope);
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.32, 5), std(0x54402b));
    peg.position.set(x * 1.84, 0.12, 0); peg.rotation.z = x * .22; g.add(peg);
  }
  return g;
}

function buildRaincatcher() {
  const g = new THREE.Group();
  const wood = std(0x68472d);
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.65, 0.65]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.25, 5), wood);
    leg.position.set(sx, 0.62, sz); leg.castShadow = true; g.add(leg);
  }
  // Querstreben geben dem Gestell Gewicht und erklären, wie die Schale gehalten wird.
  for (const z of [-0.65, 0.65]) {
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.75, 5), wood);
    brace.rotation.z = Math.PI / 2; brace.position.set(0, 0.7, z); g.add(brace);
  }

  const basinMat = std(0x617565);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.62, 0.42, 12, 1, true), basinMat);
  basin.position.y = 1.18; basin.rotation.y = Math.PI / 12; basin.castShadow = true; g.add(basin);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.62, 0.1, 12), std(0x526356));
  bottom.position.y = 1.0; bottom.rotation.y = Math.PI / 12; bottom.castShadow = true; g.add(bottom);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.065, 5, 12), std(0x829382));
  rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI / 12; rim.position.y = 1.4; g.add(rim);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.94, 0.94, 0.045, 24),
    new THREE.MeshStandardMaterial({ color: 0x328fbd, roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.82 })
  );
  water.position.y = 1.08; water.visible = false; g.add(water);
  g.userData.waterSurface = water;
  g.userData.waterMinY = 1.08;
  g.userData.waterMaxY = 1.34;
  return g;
}

function buildRaft() {
  const g = new THREE.Group();
  for (let i = -3; i <= 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.2, 7), std(i % 2 ? 0x76502e : 0x845b34));
    log.rotation.x = Math.PI / 2;
    log.position.set(i * 0.32, 0.12, 0);
    log.castShadow = true; g.add(log);
  }
  for (const z of [-1.05, 1.05]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.13, 0.2), std(0x553820));
    beam.position.set(0, 0.28, z); g.add(beam);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.8, 6), std(0x5d4027));
  pole.position.set(0, 1.55, 0.25); g.add(pole);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.7), new THREE.MeshStandardMaterial({ color: 0xd8c59d, side: THREE.DoubleSide, roughness: 1 }));
  sail.position.set(0, 1.65, 0.3); sail.rotation.y = Math.PI / 2; g.add(sail);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.18, 0.38), std(0x664427));
  seat.position.set(0, 0.5, -0.45); g.add(seat);
  return g;
}

function buildChest() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.72, 0.8), std(0x76502e)); body.position.y = 0.36; g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.18, 0.88), std(0x8c6238)); lid.position.y = 0.81; g.add(lid);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.08), std(0xb08b45)); lock.position.set(0, 0.61, 0.45); g.add(lock);
  const metal = std(0x504f4b);
  for (const x of [-.46,.46]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(.09,.82,.86), metal); band.position.set(x,.44,0); g.add(band);
  }
  for (const x of [-.67,.67]) for (const z of [-.43,.43]) {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(.08,.18,.08), metal); corner.position.set(x,.14,z); g.add(corner);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.18,.025,5,9,Math.PI),metal);
  handle.rotation.x=Math.PI/2;handle.position.set(0,.52,-.45);g.add(handle);
  return g;
}
function buildWorkbench() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 1), std(0x80572f)); top.position.y = 1.05; g.add(top);
  for (const x of [-0.85, 0.85]) for (const z of [-0.32, 0.32]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1, 0.16), std(0x5c3d24)); leg.position.set(x, 0.5, z); g.add(leg); }
  const vice = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.35), std(0x777d84)); vice.position.set(0.65, 1.28, 0); g.add(vice);
  const lowerShelf = new THREE.Mesh(new THREE.BoxGeometry(1.85,.12,.72),std(0x684526));lowerShelf.position.y=.38;g.add(lowerShelf);
  const tool = new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.75,5),std(0x59402a));tool.rotation.z=Math.PI/2;tool.position.set(-.35,1.22,.12);g.add(tool);
  const toolHead = new THREE.Mesh(new THREE.BoxGeometry(.28,.14,.16),std(0x6f7478));toolHead.position.set(.02,1.22,.12);g.add(toolHead);
  for(let i=0;i<3;i++){const plank=new THREE.Mesh(new THREE.BoxGeometry(.95,.1,.18),std(0x916238));plank.position.set(-.2+i*.08,.5+i*.1,0);plank.rotation.y=.18;g.add(plank);}
  return g;
}
function buildRoof() {
  const g = new THREE.Group();
  for (const x of [-2, 2]) for (const z of [-1.5, 1.5]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 2.5, 5), std(0x624227)); post.position.set(x, 1.25, z); g.add(post); }
  for (const s of [-1, 1]) { const panel = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.14, 2), std(0x85643a)); panel.position.set(0, 2.62, s * 0.75); panel.rotation.x = s * 0.28; g.add(panel); }
  return g;
}

const BUILDERS = { campfire: buildCampfire, torch: buildTorch, wall: buildWall, gate: buildGate, tent: buildTent, raincatcher: buildRaincatcher, raft: buildRaft, chest: buildChest, workbench: buildWorkbench, roof: buildRoof };

// Lagerfeuer-Brennstoff (in Sekunden Brenndauer)
const CAMPFIRE_MAX_FUEL = 180;   // maximaler Vorrat
const CAMPFIRE_INIT_FUEL = 90;   // frisch gebaut
export const CAMPFIRE_WOOD_FUEL = 45; // ein Holz füllt so viel nach

export class Buildings {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.placed = []; // {type, x, z, rot, group}
    this.obstacles = []; // {x, z, r}
    this.animalObstacles = []; // Wände und Tore; Tore bleiben für Spieler passierbar
    this.fires = []; // {x, z, building}
    this.lights = []; // {light, base}
    this.onTentPlaced = null;
    this.onFireOut = null; // Callback wenn ein Lagerfeuer ausgeht

    this.ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x4dff7c, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghost = null;
    this.ghostType = null;
    this.ghostRot = 0;
    this.ghostValid = false;
    this.ghostReplaceWall = null;
    this.ray = new THREE.Raycaster();
  }

  setGhostType(type) {
    if (this.ghostType === type) return;
    if (this.ghost) {
      this.group.remove(this.ghost);
      this.ghost = null;
    }
    this.ghostType = type;
    if (type) {
      this.ghost = BUILDERS[type]();
      this.ghost.traverse((m) => {
        if (m.isMesh) {
          m.material = this.ghostMatOk;
          m.castShadow = false;
        }
      });
      this.ghost.visible = false;
      this.group.add(this.ghost);
    }
  }

  updateGhost(camera, terrain) {
    if (!this.ghost) return;
    this.ray.setFromCamera({ x: 0, y: 0 }, camera);
    this.ray.far = 9;
    this.ghostReplaceWall = null;
    if (this.ghostType === 'gate') {
      const wallHit = this.ray.intersectObjects(
        this.placed.filter((b) => b.type === 'wall').map((b) => b.group),
        true
      )[0];
      if (wallHit) {
        let node = wallHit.object;
        while (node && !node.userData.building) node = node.parent;
        this.ghostReplaceWall = node?.userData.building || null;
      }
    }
    const hits = this.ray.intersectObject(terrain);
    if (!hits.length && !this.ghostReplaceWall) {
      this.ghost.visible = false;
      this.ghostValid = false;
      return;
    }
    const p = this.ghostReplaceWall
      ? new THREE.Vector3(this.ghostReplaceWall.x, 0, this.ghostReplaceWall.z)
      : hits[0].point.clone();
    if (this.ghostType === 'gate') {
      if (this.ghostReplaceWall) {
        this.ghostRot = this.ghostReplaceWall.rot;
      } else {
        this.snapToWallEnd(p);
      }
    } else if (DEFS[this.ghostType].connectable) this.snapToWallEnd(p);
    const h = terrainHeight(p.x, p.z);
    const waterOnly = DEFS[this.ghostType].waterOnly;
    this.ghost.visible = true;
    this.ghost.position.set(p.x, waterOnly ? WATER_Y + 0.05 : h, p.z);
    this.ghost.rotation.y = this.ghostRot;

    let valid = !!this.ghostReplaceWall || (waterOnly ? h < WATER_Y - 0.55 : (h > WATER_Y + 0.25 && terrainSlope(p.x, p.z) < 0.45));
    if (valid) {
      const def = DEFS[this.ghostType];
      for (const b of this.placed) {
        if (b === this.ghostReplaceWall) continue;
        if (Math.hypot(b.x - p.x, b.z - p.z) < def.r + DEFS[b.type].r + 0.3) { valid = false; break; }
      }
    }
    if (this.ghostType === 'gate' && !this.ghostReplaceWall) valid = false;
    this.ghostValid = valid;
    const mat = valid ? this.ghostMatOk : this.ghostMatBad;
    this.ghost.traverse((m) => { if (m.isMesh) m.material = mat; });
  }

  snapToWallEnd(p) {
    const half = 1.1;
    const ax = Math.cos(this.ghostRot), az = -Math.sin(this.ghostRot);
    let best = null;
    let bestD = 0.9;
    for (const b of this.placed) {
      if (!DEFS[b.type].connectable) continue;
      const bx = Math.cos(b.rot), bz = -Math.sin(b.rot);
      for (const side of [-1, 1]) {
        const ex = b.x + bx * half * side;
        const ez = b.z + bz * half * side;
        for (const ownSide of [-1, 1]) {
          const cx = ex - ax * half * ownSide;
          const cz = ez - az * half * ownSide;
          const d = Math.hypot(cx - p.x, cz - p.z);
          if (d < bestD) { bestD = d; best = { x: cx, z: cz }; }
        }
      }
    }
    if (best) { p.x = best.x; p.z = best.z; }
  }

  rotateGhost() {
    this.ghostRot += Math.PI / 4;
  }

  tryPlace(type) {
    if (!this.ghost || !this.ghost.visible || !this.ghostValid || this.ghostType !== type) return false;
    if (type === 'gate' && this.ghostReplaceWall) this.removeBuilding(this.ghostReplaceWall);
    this.place(type, this.ghost.position.x, this.ghost.position.z, this.ghostRot);
    if (type === 'gate') this.clearPlayerPassage(this.placed[this.placed.length - 1]);
    this.ghostReplaceWall = null;
    return true;
  }

  clearPlayerPassage(gate) {
    const ax = Math.cos(gate.rot), az = -Math.sin(gate.rot);
    const remaining = this.obstacles.filter((o) => {
      if (o.building === gate) return false;
      const dx = o.x - gate.x, dz = o.z - gate.z;
      const along = Math.abs(dx * ax + dz * az);
      const across = Math.abs(-dx * az + dz * ax);
      return !(along < 1.25 && across < 0.75);
    });
    this.obstacles.splice(0, this.obstacles.length, ...remaining);
  }

  removeBuilding(building) {
    this.group.remove(building.group);
    this.placed = this.placed.filter((b) => b !== building);
    const playerRemaining = this.obstacles.filter((o) => o.building !== building && !this.isInsideBuilding(o, building));
    const animalRemaining = this.animalObstacles.filter((o) => o.building !== building && !this.isInsideBuilding(o, building));
    this.obstacles.splice(0, this.obstacles.length, ...playerRemaining);
    this.animalObstacles.splice(0, this.animalObstacles.length, ...animalRemaining);
    this.fires = this.fires.filter((f) => f.building !== building);
    for (const entry of this.lights.filter((l) => l.building === building)) this.scene.remove(entry.light);
    this.lights = this.lights.filter((l) => l.building !== building);
  }

  clear() {
    for (const building of [...this.placed]) this.removeBuilding(building);
    this.setGhostType(null);
  }

  isInsideBuilding(point, building) {
    const def = DEFS[building.type];
    const dx = point.x - building.x, dz = point.z - building.z;
    if (!def?.connectable) return Math.hypot(dx, dz) < (def?.r || 1) + 0.2;
    const ax = Math.cos(building.rot), az = -Math.sin(building.rot);
    const along = Math.abs(dx * ax + dz * az);
    const across = Math.abs(-dx * az + dz * ax);
    return along < 1.2 && across < 0.75;
  }

  dismantle(building) {
    if (!building || !this.placed.includes(building)) return null;
    const refunds = {
      wall: { holz: 2 }, gate: { holz: 2, stein: 1 },
      torch: { holz: 1 }, campfire: { holz: 2, stein: 1 },
      tent: { holz: 5, fell: 1 },
      raincatcher: { holz: 3, stein: 1 },
      raft: { holz: 8 },
      chest: { holz: 4 }, workbench: { holz: 6, stein: 3 }, roof: { holz: 3 },
    };
    this.removeBuilding(building);
    return refunds[building.type] || {};
  }

  toggleGate(building) {
    if (!building || building.type !== 'gate') return false;
    building.open = !building.open;
    if (building.open) {
      const remaining = this.animalObstacles.filter((o) => o.building !== building);
      this.animalObstacles.splice(0, this.animalObstacles.length, ...remaining);
    } else {
      this.addAnimalBarrier(building);
    }
    return true;
  }

  addAnimalBarrier(building) {
    const remaining = this.animalObstacles.filter((o) => o.building !== building);
    this.animalObstacles.splice(0, this.animalObstacles.length, ...remaining);
    const ax = Math.cos(building.rot), az = -Math.sin(building.rot);
    for (const offset of [-0.78, 0, 0.78]) {
      this.animalObstacles.push({ x: building.x + ax * offset, z: building.z + az * offset, r: 0.5, building });
    }
  }

  place(type, x, z, rot) {
    const def = DEFS[type];
    const g = BUILDERS[type]();
    g.position.set(x, def.waterOnly ? WATER_Y + 0.05 : terrainHeight(x, z), z);
    g.rotation.y = rot;
    this.group.add(g);
    const building = { type, x, z, rot, group: g, open: false };
    if (type === 'raft') { building.speed = 0; building.turnSpeed = 0; }
    if (type === 'chest' || type === 'raft') building.storage = {};
    if (type === 'raincatcher') { building.water = 0; building.maxWater = 100; }
    g.userData.building = building;
    this.placed.push(building);
    if (def.connectable) {
      const ax = Math.cos(rot), az = -Math.sin(rot);
      for (const offset of [-0.78, 0, 0.78]) {
        const obstacle = { x: x + ax * offset, z: z + az * offset, r: 0.38, building };
        if (def.blocksPlayer) this.obstacles.push(obstacle);
        if (def.blocksAnimals) this.animalObstacles.push({ ...obstacle, r: 0.5 });
      }
    } else {
      if (def.blocksPlayer !== false) this.obstacles.push({ x, z, r: def.r, building });
    }
    if (type === 'gate') this.clearPlayerPassage(building);
    if (def.fire) {
      const isCamp = type === 'campfire';
      building.maxFuel = isCamp ? CAMPFIRE_MAX_FUEL : Infinity;
      building.fuel = isCamp ? CAMPFIRE_INIT_FUEL : Infinity;
      building.lit = true;
      this.fires.push({ x, z, building });
      const light = new THREE.PointLight(def.lightColor, def.lightI, def.lightD, 1.6);
      light.position.set(x, terrainHeight(x, z) + (type === 'torch' ? 1.4 : 1.0), z);
      this.scene.add(light);
      this.lights.push({ light, base: def.lightI, building });
    }
    if (def.spawn && this.onTentPlaced) this.onTentPlaced(x, z);
    return g;
  }

  nearest(type, pos, maxDist) {
    let best = null, bestD = maxDist;
    for (const b of this.placed) {
      if (b.type !== type) continue;
      const d = Math.hypot(b.x - pos.x, b.z - pos.z);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  // Verbrennt den Brennstoff der Lagerfeuer. Nur im Spielzustand aufrufen,
  // damit Feuer nicht während Pause/Menü ausgehen.
  tickFuel(dt, rainIntensity = 0) {
    for (const b of this.placed) {
      if (b.type === 'raincatcher') {
        b.water = Math.min(b.maxWater, b.water + rainIntensity * 2.2 * dt);
        continue;
      }
      if (b.type !== 'campfire' || !b.lit) continue;
      b.fuel -= dt;
      if (b.fuel <= 0) {
        b.fuel = 0;
        b.lit = false;
        if (this.onFireOut) this.onFireOut(b);
      }
    }
  }

  // Feuer mit Holz nachlegen / wieder anzünden. Gibt true zurück bei Erfolg.
  refuel(building, seconds) {
    if (!building || building.type !== 'campfire') return false;
    if (building.fuel >= building.maxFuel) return false;
    building.fuel = Math.min(building.maxFuel, building.fuel + seconds);
    building.lit = building.fuel > 0;
    return true;
  }

  // Positionen aktuell brennender Feuer (für die Wolfsabwehr).
  activeFires() {
    return this.fires.filter((f) => f.building.lit !== false).map((f) => ({ x: f.x, z: f.z }));
  }

  drinkFrom(building, amount = 30) {
    if (!building || building.type !== 'raincatcher' || building.water < 1) return 0;
    const taken = Math.min(amount, building.water);
    building.water -= taken;
    return taken;
  }

  isSheltered(pos) {
    return this.placed.some((b) => (b.type === 'roof' && Math.hypot(b.x - pos.x, b.z - pos.z) < 2.25)
      || (b.type === 'tent' && Math.hypot(b.x - pos.x, b.z - pos.z) < 1.45));
  }

  update(dt, wind = null) {
    const t = performance.now() * 0.001;
    for (const b of this.placed) {
      if (b.type === 'gate') {
        const door = b.group.userData.gateDoor;
        const target = b.open ? -Math.PI / 2 : 0;
        door.rotation.y += (target - door.rotation.y) * Math.min(1, dt * 10);
      }
      const flames = b.group.userData.flames;
      if (b.type === 'raincatcher' && b.group.userData.waterSurface) {
        const surface = b.group.userData.waterSurface;
        const fill = Math.min(1, b.water / b.maxWater);
        surface.visible = b.water > 1;
        // Der Pegel steigt innerhalb der konischen Schale; nur die Breite wächst mit.
        surface.position.y = THREE.MathUtils.lerp(b.group.userData.waterMinY, b.group.userData.waterMaxY, fill);
        const width = THREE.MathUtils.lerp(0.72, 1, fill);
        surface.scale.set(width * (1 + Math.sin(t * 1.8 + b.x) * 0.006), 1, width);
      }
      if (flames) {
        const lit = b.lit !== false;
        flames.visible = lit;
        // Flammen schrumpfen, wenn der Brennstoff zur Neige geht
        const fuelFrac = b.maxFuel && isFinite(b.maxFuel) ? Math.min(1, b.fuel / (b.maxFuel * 0.4)) : 1;
        if (lit) {
          const windForce = wind ? Math.hypot(wind.x, wind.z) : 0;
          flames.rotation.z = wind ? -wind.x * 0.18 : 0;
          flames.rotation.x = wind ? wind.z * 0.18 : 0;
          flames.children.forEach((f, i) => {
            const s = (0.85 + Math.sin(t * (9 + windForce * 5) + i * 2.1 + b.x) * (0.18 + windForce * 0.05)) * (0.5 + fuelFrac * 0.5);
            f.scale.set(s, (0.8 + Math.sin(t * 11 + i * 1.3) * 0.25) * (0.5 + fuelFrac * 0.5), s);
            f.rotation.y += dt * 2;
          });
        }
      }
    }
    for (const l of this.lights) {
      const lit = l.building.lit !== false;
      if (!lit) { l.light.intensity = 0; continue; }
      const fuelFrac = l.building.maxFuel && isFinite(l.building.maxFuel)
        ? Math.min(1, l.building.fuel / (l.building.maxFuel * 0.4)) : 1;
      l.light.intensity = l.base * (0.5 + fuelFrac * 0.5) * (0.85 + Math.sin(t * 12 + l.light.position.x) * 0.12 + Math.random() * 0.06);
    }
  }

  serialize() {
    // Zeitlich begrenzte Expeditionskisten gehören nicht dauerhaft zum Spielstand.
    return this.placed.filter((b) => !b.expeditionEvent).map((b) => ({ type: b.type, x: b.x, z: b.z, rot: b.rot, open: !!b.open, fuel: b.fuel, water: b.water, storage: b.storage }));
  }

  load(list) {
    this.clear();
    for (const b of list || []) {
      this.place(b.type, b.x, b.z, b.rot);
      const placed = this.placed[this.placed.length - 1];
      if (b.type === 'gate' && b.open) this.toggleGate(placed);
      if (b.type === 'campfire' && typeof b.fuel === 'number') {
        placed.fuel = Math.max(0, Math.min(placed.maxFuel, b.fuel));
        placed.lit = placed.fuel > 0;
      }
      if (b.type === 'raincatcher' && typeof b.water === 'number') placed.water = Math.max(0, Math.min(placed.maxWater, b.water));
      if ((b.type === 'chest' || b.type === 'raft') && b.storage) placed.storage = { ...b.storage };
    }
  }
}
