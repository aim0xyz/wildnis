import * as THREE from 'three';
import { terrainHeight, WATER_Y, WORLD_RADIUS } from './world.js';
import { sfx } from './sfx.js';

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
    name: 'Wolf', hp: 14, walk: 1.8, chase: 5.3, dmg: 12, hop: 0.06,
    drops: () => ({ fleisch_roh: 2, fell: 2 }),
  },
};

const COUNTS = { hase: 10, hirsch: 6, wolf: 5 };

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

const BUILDERS = { hase: buildHase, hirsch: buildHirsch, wolf: buildWolf };

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
    const a = Math.random() * Math.PI * 2;
    const d = 5 + Math.random() * 14;
    let tx = this.pos.x + Math.cos(a) * d;
    let tz = this.pos.z + Math.sin(a) * d;
    tx = THREE.MathUtils.clamp(tx, -WORLD_RADIUS + 10, WORLD_RADIUS - 10);
    tz = THREE.MathUtils.clamp(tz, -WORLD_RADIUS + 10, WORLD_RADIUS - 10);
    this.target.set(tx, tz);
    this.retargetAt = now + 3 + Math.random() * 5;
  }

  update(dt, ctx) {
    const now = ctx.time;
    const p = this.pos;
    const dp = Math.hypot(ctx.playerPos.x - p.x, ctx.playerPos.z - p.z);
    let speed = 0;
    let dirX = 0, dirZ = 0;

    if (this.kind === 'wolf') {
      const aggroR = ctx.night ? 26 : 11;
      if (!this.aggro && dp < aggroR) {
        this.aggro = true;
        if (dp < 30) sfx.growl();
      }
      if (this.aggro && dp > 42) this.aggro = false;

      if (this.aggro) {
        // Feuer meiden
        let nearFire = null;
        for (const f of ctx.fires) {
          const df = Math.hypot(f.x - p.x, f.z - p.z);
          if (df < 8) { nearFire = f; break; }
        }
        if (nearFire) {
          dirX = p.x - nearFire.x; dirZ = p.z - nearFire.z;
          speed = this.def.chase * 0.7;
        } else {
          dirX = ctx.playerPos.x - p.x;
          dirZ = ctx.playerPos.z - p.z;
          speed = this.def.chase;
          // Spieler am Feuer? Dann Abstand halten
          for (const f of ctx.fires) {
            if (Math.hypot(f.x - ctx.playerPos.x, f.z - ctx.playerPos.z) < 6 && dp < 9) {
              speed = 0;
              break;
            }
          }
          this.biteCd -= dt;
          if (dp < 2 && this.biteCd <= 0) {
            this.biteCd = 1.2;
            ctx.hurtPlayer(this.def.dmg);
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
      if (this.kind === 'wolf') {
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
      // Wasser meiden (Wölfe dürfen durch)
      const nh = terrainHeight(nx, nz);
      const blocked = ctx.animalObstacles?.some((o) => Math.hypot(nx - o.x, nz - o.z) < o.r + 0.42);
      if (blocked) {
        if (this.kind !== 'wolf' || !this.aggro) this.pickWander(now);
        speed = 0;
        this.moving = false;
      } else if (nh < WATER_Y + 0.1 && this.kind !== 'wolf') {
        this.pickWander(now);
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

  randomSpot(minDistFromOrigin = 20) {
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 2 * (WORLD_RADIUS - 20);
      const z = (Math.random() - 0.5) * 2 * (WORLD_RADIUS - 20);
      if (Math.hypot(x, z) < minDistFromOrigin) continue;
      if (terrainHeight(x, z) > 0.6) return { x, z };
    }
    return { x: 40, z: 40 };
  }

  spawn(kind) {
    const s = this.randomSpot(kind === 'wolf' ? 45 : 22);
    const a = new Animal(kind, s.x, s.z);
    this.group.add(a.group);
    this.list.push(a);
    return a;
  }

  // Rückgabe: { killed, drops, name, hp, maxHp }
  hit(animal, dmg, fromDir) {
    animal.hp -= dmg;
    animal.setFlash(true);
    animal.flashT = 0.15;
    this.effects.burst(animal.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xc0392b, 8, 3);

    if (animal.kind === 'wolf') animal.aggro = true;
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
