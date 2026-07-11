import * as THREE from 'three';
import { terrainHeight, terrainSlope, WATER_Y } from './world.js';

function std(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 });
}

const DEFS = {
  campfire: { name: 'Lagerfeuer', r: 0.9, fire: true, lightColor: 0xffa040, lightI: 2.4, lightD: 16 },
  torch: { name: 'Fackel', r: 0.2, fire: true, lightColor: 0xffb050, lightI: 1.3, lightD: 9 },
  wall: { name: 'Holzwand', r: 1.0 },
  tent: { name: 'Zelt', r: 1.5, spawn: true },
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
  return g;
}

const BUILDERS = { campfire: buildCampfire, torch: buildTorch, wall: buildWall, tent: buildTent };

export class Buildings {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.placed = []; // {type, x, z, rot, group}
    this.obstacles = []; // {x, z, r}
    this.fires = []; // {x, z}
    this.lights = []; // {light, base}
    this.onTentPlaced = null;

    this.ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x4dff7c, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghost = null;
    this.ghostType = null;
    this.ghostRot = 0;
    this.ghostValid = false;
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
    const hits = this.ray.intersectObject(terrain);
    if (!hits.length) {
      this.ghost.visible = false;
      this.ghostValid = false;
      return;
    }
    const p = hits[0].point;
    const h = terrainHeight(p.x, p.z);
    this.ghost.visible = true;
    this.ghost.position.set(p.x, h, p.z);
    this.ghost.rotation.y = this.ghostRot;

    let valid = h > WATER_Y + 0.25 && terrainSlope(p.x, p.z) < 0.45;
    if (valid) {
      const def = DEFS[this.ghostType];
      for (const b of this.placed) {
        if (Math.hypot(b.x - p.x, b.z - p.z) < def.r + DEFS[b.type].r + 0.3) { valid = false; break; }
      }
    }
    this.ghostValid = valid;
    const mat = valid ? this.ghostMatOk : this.ghostMatBad;
    this.ghost.traverse((m) => { if (m.isMesh) m.material = mat; });
  }

  rotateGhost() {
    this.ghostRot += Math.PI / 4;
  }

  tryPlace(type) {
    if (!this.ghost || !this.ghost.visible || !this.ghostValid || this.ghostType !== type) return false;
    this.place(type, this.ghost.position.x, this.ghost.position.z, this.ghostRot);
    return true;
  }

  place(type, x, z, rot) {
    const def = DEFS[type];
    const g = BUILDERS[type]();
    g.position.set(x, terrainHeight(x, z), z);
    g.rotation.y = rot;
    this.group.add(g);
    this.placed.push({ type, x, z, rot, group: g });
    this.obstacles.push({ x, z, r: def.r });
    if (def.fire) {
      this.fires.push({ x, z });
      const light = new THREE.PointLight(def.lightColor, def.lightI, def.lightD, 1.6);
      light.position.set(x, terrainHeight(x, z) + (type === 'torch' ? 1.4 : 1.0), z);
      this.scene.add(light);
      this.lights.push({ light, base: def.lightI });
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

  update(dt) {
    const t = performance.now() * 0.001;
    for (const b of this.placed) {
      const flames = b.group.userData.flames;
      if (flames) {
        flames.children.forEach((f, i) => {
          const s = 0.85 + Math.sin(t * 9 + i * 2.1 + b.x) * 0.18;
          f.scale.set(s, 0.8 + Math.sin(t * 11 + i * 1.3) * 0.25, s);
          f.rotation.y += dt * 2;
        });
      }
    }
    for (const l of this.lights) {
      l.light.intensity = l.base * (0.85 + Math.sin(t * 12 + l.light.position.x) * 0.12 + Math.random() * 0.06);
    }
  }

  serialize() {
    return this.placed.map((b) => ({ type: b.type, x: b.x, z: b.z, rot: b.rot }));
  }

  load(list) {
    for (const b of list || []) this.place(b.type, b.x, b.z, b.rot);
  }
}
