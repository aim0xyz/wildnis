import * as THREE from 'three';
import { terrainHeight, WATER_Y, WORLD_RADIUS } from './world.js';
import { sfx } from './sfx.js';

function std(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 });
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 })
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const KINDS = {
  hase: {
    name: 'Hase', hp: 2, walk: 1.6, flee: 5.6, fleeR: 9, hop: 0.28,
    drops: () => ({ fleisch_roh: 1, ...(Math.random() < 0.3 ? { fell: 1 } : {}) }),
  },
  hirsch: {
    name: 'Hirsch', hp: 8, walk: 1.3, flee: 6.1, fleeR: 13, hop: 0.08,
    drops: () => ({ fleisch_roh: 3, fell: 1 }),
  },
  wolf: {
    name: 'Wolf', hp: 14, walk: 1.8, chase: 5.3, dmg: 12, hop: 0.06, hostile: true, aggroDay: 11, aggroNight: 26, disengage: 42, fireFear: true,
    drops: () => ({ fleisch_roh: 2, fell: 2 }),
  },
  wildschwein: {
    name: 'Wildschwein', hp: 18, walk: 1.35, chase: 5.8, dmg: 15, hop: 0.035, hostile: true, aggroDay: 7, aggroNight: 9, disengage: 30,
    drops: () => ({ fleisch_roh: 4, fell: 1 }),
  },
  baer: {
    name: 'Bär', hp: 38, walk: 1.15, chase: 4.7, dmg: 24, hop: 0.025, hostile: true, aggroDay: 13, aggroNight: 16, disengage: 48, fireFear: true,
    drops: () => ({ fleisch_roh: 6, fell: 4 }),
  },
};

const COUNTS = { hase: 14, hirsch: 8, wolf: 6, wildschwein: 7, baer: 3 };

function buildHase() {
  const g = new THREE.Group();
  const c = 0xb99a6b;
  g.add(box(0.45, 0.4, 0.65, c, 0, 0.42, 0));
  g.add(box(0.32, 0.3, 0.3, c, 0, 0.66, 0.4));
  g.add(box(0.08, 0.32, 0.05, c, -0.09, 0.95, 0.36));
  g.add(box(0.08, 0.32, 0.05, c, 0.09, 0.95, 0.36));
  g.add(box(0.14, 0.14, 0.14, 0xf5f0e6, 0, 0.5, -0.38));
  return g;
}

function buildHirsch() {
  const g = new THREE.Group();
  const c = 0x8a5f3b;
  g.add(box(0.8, 0.9, 1.5, c, 0, 1.15, 0));
  for (const sx of [-0.28, 0.28]) {
    for (const sz of [-0.55, 0.55]) {
      g.add(box(0.15, 0.75, 0.15, 0x6e4a2c, sx, 0.37, sz));
    }
  }
  g.add(box(0.26, 0.65, 0.28, c, 0, 1.8, 0.6));
  g.add(box(0.32, 0.32, 0.55, c, 0, 2.12, 0.85));
  g.add(box(0.06, 0.45, 0.06, 0xd8c9a3, -0.13, 2.5, 0.72));
  g.add(box(0.06, 0.45, 0.06, 0xd8c9a3, 0.13, 2.5, 0.72));
  g.add(box(0.3, 0.05, 0.05, 0xd8c9a3, -0.13, 2.6, 0.72));
  g.add(box(0.3, 0.05, 0.05, 0xd8c9a3, 0.13, 2.6, 0.72));
  g.add(box(0.12, 0.12, 0.22, 0xf5f0e6, 0, 1.35, -0.82));
  return g;
}

function buildWolf() {
  const g = new THREE.Group();
  const c = 0x5a5f66;
  g.add(box(0.6, 0.6, 1.4, c, 0, 0.85, 0));
  for (const sx of [-0.2, 0.2]) {
    for (const sz of [-0.5, 0.5]) {
      g.add(box(0.14, 0.58, 0.14, 0x4a4e54, sx, 0.29, sz));
    }
  }
  g.add(box(0.42, 0.4, 0.42, c, 0, 1.12, 0.82));
  g.add(box(0.2, 0.18, 0.32, 0x4a4e54, 0, 1.02, 1.15));
  g.add(box(0.1, 0.16, 0.06, c, -0.13, 1.4, 0.75));
  g.add(box(0.1, 0.16, 0.06, c, 0.13, 1.4, 0.75));
  const tail = box(0.13, 0.13, 0.55, c, 0, 1.05, -0.9);
  tail.rotation.x = -0.5;
  g.add(tail);
  // Leuchtende Augen
  for (const sx of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xff3b2f })
    );
    eye.position.set(sx, 1.18, 1.04);
    g.add(eye);
  }
  return g;
}

function buildWildschwein() {
  const g = new THREE.Group();
  const c = 0x514238;
  g.add(box(0.85, 0.72, 1.55, c, 0, 0.78, 0));
  g.add(box(0.7, 0.62, 0.72, 0x5d4a3d, 0, 0.78, 0.88));
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.5, 0.5]) g.add(box(0.15, 0.52, 0.15, 0x332c28, sx, 0.27, sz));
  g.add(box(0.48, 0.3, 0.38, 0x806557, 0, 0.66, 1.3));
  for (const sx of [-0.24, 0.24]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.3, 5), std(0xeee1bf));
    tusk.position.set(sx, 0.63, 1.48); tusk.rotation.x = -0.75; g.add(tusk);
  }
  return g;
}

function buildBaer() {
  const g = new THREE.Group();
  const c = 0x4b3426;
  g.add(box(1.25, 1.15, 1.9, c, 0, 1.05, 0));
  g.add(box(0.92, 0.85, 0.82, 0x59402f, 0, 1.35, 1.12));
  g.add(box(0.48, 0.34, 0.45, 0x34271f, 0, 1.2, 1.68));
  for (const sx of [-0.43, 0.43]) {
    g.add(box(0.34, 0.78, 0.38, 0x3d2d23, sx, 0.42, 0.55));
    g.add(box(0.34, 0.78, 0.38, 0x3d2d23, sx, 0.42, -0.58));
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), std(c));
    ear.position.set(sx * 0.75, 1.78, 1.08); g.add(ear);
  }
  return g;
}

const BUILDERS = { hase: buildHase, hirsch: buildHirsch, wolf: buildWolf, wildschwein: buildWildschwein, baer: buildBaer };

class Animal {
  constructor(kind, x, z) {
    this.kind = kind;
    this.def = KINDS[kind];
    this.hp = this.def.hp;
    this.group = BUILDERS[kind]();
    this.group.position.set(x, terrainHeight(x, z), z);
    this.group.traverse((m) => { m.userData.animal = this; });
    this.state = 'wander';
    this.target = new THREE.Vector2(x, z);
    this.retargetAt = 0;
    this.aggro = false;
    this.biteCd = 0;
    this.flashT = 0;
    this.phase = Math.random() * 10;
    this.moving = false;
  }

  get pos() { return this.group.position; }

  pickWander(now) {
    // Nur Ziele auf trockenem Land wählen, damit Tiere nicht ständig am Ufer
    // auf ein unerreichbares Ziel zulaufen.
    for (let attempt = 0; attempt < 20; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = 5 + Math.random() * 14;
      const tx = THREE.MathUtils.clamp(this.pos.x + Math.cos(a) * d, -WORLD_RADIUS + 10, WORLD_RADIUS - 10);
      const tz = THREE.MathUtils.clamp(this.pos.z + Math.sin(a) * d, -WORLD_RADIUS + 10, WORLD_RADIUS - 10);
      if (terrainHeight(tx, tz) >= WATER_Y + 0.15) {
        this.target.set(tx, tz);
        break;
      }
    }
    this.retargetAt = now + 3 + Math.random() * 5;
  }

  update(dt, ctx) {
    const now = ctx.time;
    const p = this.pos;
    const dp = Math.hypot(ctx.playerPos.x - p.x, ctx.playerPos.z - p.z);
    let speed = 0;
    let dirX = 0, dirZ = 0;

    if (this.def.hostile) {
      const threat = ctx.threat || 1;
      const aggroR = (ctx.night ? this.def.aggroNight : this.def.aggroDay) + (this.kind === 'wolf' ? Math.min(12, threat * 2) : 0);
      if (!this.aggro && dp < aggroR) {
        this.aggro = true;
        if (dp < 30) sfx.growl();
      }
      if (this.aggro && dp > this.def.disengage) this.aggro = false;

      if (this.aggro) {
        // Feuer meiden
        let nearFire = null;
        for (const f of this.def.fireFear ? ctx.fires : []) {
          const df = Math.hypot(f.x - p.x, f.z - p.z);
          if (df < 8) { nearFire = f; break; }
        }
        if (nearFire) {
          dirX = p.x - nearFire.x; dirZ = p.z - nearFire.z;
          speed = this.def.chase * 0.7;
        } else {
          dirX = ctx.playerPos.x - p.x;
          dirZ = ctx.playerPos.z - p.z;
          speed = this.def.chase * Math.min(1.35, 0.94 + threat * 0.06);
          // Spieler am Feuer? Dann Abstand halten
          for (const f of this.def.fireFear ? ctx.fires : []) {
            if (Math.hypot(f.x - ctx.playerPos.x, f.z - ctx.playerPos.z) < 6 && dp < 9) {
              speed = 0;
              break;
            }
          }
          this.biteCd -= dt;
          if (dp < 2 && this.biteCd <= 0) {
            this.biteCd = 1.2;
            ctx.hurtPlayer(Math.round(this.def.dmg * Math.min(1.65, 0.9 + threat * 0.1)), `Ein ${this.def.name} hat dich erwischt.`);
          }
        }
      } else {
        if (now > this.retargetAt) this.pickWander(now);
        dirX = this.target.x - p.x; dirZ = this.target.y - p.z;
        speed = Math.hypot(dirX, dirZ) > 1 ? this.def.walk : 0;
      }
    } else {
      // Beutetiere: fliehen wenn Spieler nah
      if (dp < this.def.fleeR || this.state === 'flee') {
        this.state = dp > this.def.fleeR + 7 ? 'wander' : 'flee';
      }
      if (this.state === 'flee') {
        dirX = p.x - ctx.playerPos.x;
        dirZ = p.z - ctx.playerPos.z;
        speed = this.def.flee;
      } else {
        if (now > this.retargetAt) this.pickWander(now);
        dirX = this.target.x - p.x; dirZ = this.target.y - p.z;
        speed = Math.hypot(dirX, dirZ) > 1 ? this.def.walk : 0;
      }
    }

    this.moving = speed > 0.1;
    if (this.moving) {
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len; dirZ /= len;
      let nx = p.x + dirX * speed * dt;
      let nz = p.z + dirZ * speed * dt;

      // Wölfe dürfen angreifen, aber nicht in den Körper des Spielers laufen.
      if (this.def.hostile) {
        let px = nx - ctx.playerPos.x;
        let pz = nz - ctx.playerPos.z;
        let playerDist = Math.hypot(px, pz);
        const minPlayerDist = 1.55;
        if (playerDist < minPlayerDist) {
          if (playerDist < 0.001) {
            px = -dirX || 1;
            pz = -dirZ || 0;
            playerDist = Math.hypot(px, pz);
          }
          nx = ctx.playerPos.x + (px / playerDist) * minPlayerDist;
          nz = ctx.playerPos.z + (pz / playerDist) * minPlayerDist;
        }
      }
      nx = THREE.MathUtils.clamp(nx, -WORLD_RADIUS + 6, WORLD_RADIUS - 6);
      nz = THREE.MathUtils.clamp(nz, -WORLD_RADIUS + 6, WORLD_RADIUS - 6);
      // Alle Landtiere bleiben an der Uferlinie stehen.
      const nh = terrainHeight(nx, nz);
      const blocked = ctx.animalObstacles?.some((o) => Math.hypot(nx - o.x, nz - o.z) < o.r + 0.42);
      if (blocked) {
        if (!this.def.hostile || !this.aggro) this.pickWander(now);
        speed = 0;
        this.moving = false;
      } else if (nh < WATER_Y + 0.15) {
        this.pickWander(now);
        speed = 0;
        this.moving = false;
      } else {
        p.x = nx; p.z = nz;
        this.group.rotation.y = Math.atan2(dirX, dirZ);
      }
    }

    this.phase += dt * (this.moving ? 10 : 2);
    const ground = Math.max(terrainHeight(p.x, p.z), WATER_Y - 0.4);
    const hop = this.moving ? Math.abs(Math.sin(this.phase)) * this.def.hop : 0;
    p.y = ground + hop;

    // Roter Blitz bei Treffer
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.setFlash(false);
    }
  }

  setFlash(on) {
    this.group.traverse((m) => {
      if (m.material && m.material.emissive) {
        m.material.emissive.setHex(on ? 0xaa2020 : 0x000000);
      }
    });
  }
}

export class Animals {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.list = [];
    this.respawnQueue = [];
    for (const [kind, count] of Object.entries(COUNTS)) {
      for (let i = 0; i < count; i++) this.spawn(kind);
    }
  }

  randomSpot(minDistFromOrigin = 20, kind = null) {
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 2 * (WORLD_RADIUS - 20);
      const z = (Math.random() - 0.5) * 2 * (WORLD_RADIUS - 20);
      if (Math.hypot(x, z) < minDistFromOrigin) continue;
      const h = terrainHeight(x, z);
      if (h <= 0.6) continue;
      if (kind === 'baer' && h < 5.2) continue;
      if (kind === 'wildschwein' && (h < 0.9 || h > 7.5)) continue;
      return { x, z };
    }
    return { x: 40, z: 40 };
  }

  spawn(kind) {
    const s = this.randomSpot(['wolf', 'baer'].includes(kind) ? 45 : 22, kind);
    const a = new Animal(kind, s.x, s.z);
    this.group.add(a.group);
    this.list.push(a);
    return a;
  }

  spawnNear(kind, center, minRadius = 24, maxRadius = 36) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = minRadius + Math.random() * (maxRadius - minRadius);
      const x = THREE.MathUtils.clamp(center.x + Math.cos(a) * d, -WORLD_RADIUS + 8, WORLD_RADIUS - 8);
      const z = THREE.MathUtils.clamp(center.z + Math.sin(a) * d, -WORLD_RADIUS + 8, WORLD_RADIUS - 8);
      if (terrainHeight(x, z) > WATER_Y + 0.2) {
        const animal = new Animal(kind, x, z);
        this.group.add(animal.group);
        this.list.push(animal);
        return animal;
      }
    }
    return null;
  }

  // Rückgabe: { killed, drops, name, hp, maxHp }
  hit(animal, dmg, fromDir) {
    animal.hp -= dmg;
    animal.setFlash(true);
    animal.flashT = 0.15;
    this.effects.burst(animal.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xc0392b, 8, 3);

    if (animal.def.hostile) animal.aggro = true;
    else animal.state = 'flee';

    // Rückstoß
    animal.pos.x += fromDir.x * 0.9;
    animal.pos.z += fromDir.z * 0.9;

    if (animal.hp <= 0) {
      const drops = animal.def.drops();
      this.group.remove(animal.group);
      this.list.splice(this.list.indexOf(animal), 1);
      this.respawnQueue.push({ kind: animal.kind, at: performance.now() / 1000 + 70 + Math.random() * 40 });
      return { killed: true, drops, name: animal.def.name };
    }
    return { killed: false, drops: null, name: animal.def.name, hp: animal.hp, maxHp: animal.def.hp };
  }

  update(dt, ctx) {
    for (const a of this.list) a.update(dt, ctx);
    const now = performance.now() / 1000;
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      if (now >= this.respawnQueue[i].at) {
        this.spawn(this.respawnQueue[i].kind);
        this.respawnQueue.splice(i, 1);
      }
    }
  }
}
