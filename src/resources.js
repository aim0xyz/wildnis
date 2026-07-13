import * as THREE from 'three';
import { terrainHeight, terrainSlope, biomeAt, WORLD_RADIUS } from './world.js';
import { fbm, mulberry32 } from './noise.js';
import { toolDamage } from './items.js';

const TRUNK = new THREE.Color(0x8a5a2b);
const FOLIAGE = [0x3e8948, 0x59a84f, 0x2f7a3d, 0x6db354];

function std(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 });
}

export class Resources {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.list = [];
    this.obstacles = []; // {x, z, r, res}
    this.spawnAll();
  }

  spawnAll() {
    const rand = mulberry32(1337);
    const taken = [];
    const tryPlace = (minDist, minH, maxH, maxSlope, densityFn) => {
      for (let attempt = 0; attempt < 40; attempt++) {
        const x = (rand() - 0.5) * 2 * (WORLD_RADIUS - 8);
        const z = (rand() - 0.5) * 2 * (WORLD_RADIUS - 8);
        if (Math.hypot(x, z) < 7) continue; // Spawnwiese frei halten
        const h = terrainHeight(x, z);
        if (h < minH || h > maxH || terrainSlope(x, z) > maxSlope) continue;
        if (densityFn && !densityFn(x, z, rand)) continue;
        let ok = true;
        for (const t of taken) {
          if (Math.hypot(t.x - x, t.z - z) < minDist) { ok = false; break; }
        }
        if (!ok) continue;
        taken.push({ x, z });
        return { x, z, h };
      }
      return null;
    };

    const forest = (x, z) => fbm(x * 0.02 + 300, z * 0.02 + 300) > 0.42;

    for (let i = 0; i < 720; i++) {
      const p = tryPlace(2.7, 0.6, 8.5, 0.55, forest);
      if (p) this.addResource('tree', p, rand);
    }
    for (let i = 0; i < 290; i++) {
      const p = tryPlace(3.5, 0.5, 11, 0.9);
      if (p) this.addResource('rock', p, rand);
    }
    for (let i = 0; i < 175; i++) {
      const p = tryPlace(4, 0.6, 6.5, 0.45);
      if (p) this.addResource('bush', p, rand);
    }
  }

  addResource(kind, p, rand) {
    let group, hp, r;
    if (kind === 'tree') { group = this.buildTree(rand); hp = 5; r = 0.55; }
    else if (kind === 'rock') { group = this.buildRock(rand); hp = 5; r = 1.2; }
    else { group = this.buildBush(rand); hp = 1; r = 0; }

    group.position.set(p.x, p.h, p.z);
    const biome = biomeAt(p.x, p.z).id;
    if (kind === 'tree' && biome === 'forest') group.scale.multiplyScalar(1.15);
    if (kind === 'bush' && biome === 'marsh') group.scale.set(1.15, 0.72, 1.15);
    if (kind === 'rock' && biome === 'alpine') group.scale.multiplyScalar(1.12);
    group.rotation.y = rand() * Math.PI * 2;
    this.group.add(group);

    const res = {
      kind, group, hp, maxHp: hp,
      x: p.x, z: p.z, alive: true, respawnAt: 0, shakeT: 0,
      baseRotZ: 0,
      windPhase: rand() * Math.PI * 2,
      windFlex: kind === 'tree' ? 0.035 + rand() * 0.025 : kind === 'bush' ? 0.055 : 0,
    };
    group.traverse((m) => { m.userData.res = res; });
    this.list.push(res);
    if (r > 0) this.obstacles.push({ x: p.x, z: p.z, r, res });
  }

  buildTree(rand) {
    const g = new THREE.Group();
    const h = 1.5 + rand() * 1.1;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, h, 5), std(TRUNK));
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    g.add(trunk);
    const col = FOLIAGE[Math.floor(rand() * FOLIAGE.length)];
    if (rand() < 0.55) {
      // Nadelbaum: gestapelte Kegel
      const levels = 2 + Math.floor(rand() * 2);
      let y = h;
      let rad = 1.3 + rand() * 0.7;
      for (let i = 0; i < levels; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, 1.6 + rand() * 0.5, 6), std(col));
        cone.position.y = y + 0.7;
        cone.castShadow = true;
        g.add(cone);
        y += 1.0;
        rad *= 0.68;
      }
    } else {
      // Laubbaum: Icosaeder-Krone
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25 + rand() * 0.6, 0), std(col));
      blob.position.y = h + 0.9;
      blob.scale.y = 0.85 + rand() * 0.3;
      blob.castShadow = true;
      g.add(blob);
      if (rand() < 0.7) {
        const blob2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), std(col));
        blob2.position.set((rand() - 0.5) * 1.2, h + 1.4, (rand() - 0.5) * 1.2);
        blob2.castShadow = true;
        g.add(blob2);
      }
    }
    const s = 0.85 + rand() * 0.55;
    g.scale.setScalar(s);
    return g;
  }

  buildRock(rand) {
    const g = new THREE.Group();
    const grey = 0x8d8d93 + Math.floor(rand() * 3) * 0x050505;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95 + rand() * 0.5, 0), std(grey));
    rock.scale.set(1 + rand() * 0.4, 0.65 + rand() * 0.3, 1 + rand() * 0.4);
    rock.position.y = 0.35;
    rock.castShadow = true;
    g.add(rock);
    if (rand() < 0.6) {
      const small = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), std(grey));
      small.position.set(0.9 + rand() * 0.4, 0.18, (rand() - 0.5) * 0.8);
      small.castShadow = true;
      g.add(small);
    }
    return g;
  }

  buildBush(rand) {
    const g = new THREE.Group();
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), std(0x2e6b34));
    bush.position.y = 0.45;
    bush.scale.y = 0.75;
    bush.castShadow = true;
    g.add(bush);
    const berries = new THREE.Group();
    const bcol = rand() < 0.5 ? 0xd23b4e : 0x4757c8;
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), std(bcol));
      const a = rand() * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.55, 0.45 + (rand() - 0.3) * 0.4, Math.sin(a) * 0.55);
      berries.add(b);
    }
    g.add(berries);
    g.userData.berries = berries;
    return g;
  }

  // Rückgabe: { destroyed, drops, hint } oder null wenn nichts passiert
  hit(res, toolId) {
    if (!res.alive) return null;

    if (res.kind === 'bush') {
      res.alive = false;
      res.group.userData.berries.visible = false;
      res.respawnAt = performance.now() / 1000 + 55 + Math.random() * 30;
      res.shakeT = 0.3;
      return { destroyed: false, drops: { beeren: 2 }, kind: 'bush' };
    }

    const dmg = toolDamage(toolId, res.kind);
    res.hp -= dmg;
    res.shakeT = 0.3;

    let hint = null;
    if (res.kind === 'rock' && !['spitzhacke','metallhacke'].includes(toolId)) hint = 'Mit einer Spitzhacke geht das schneller!';
    if (res.kind === 'tree' && !['axt','metallaxt'].includes(toolId)) hint = 'Mit einer Axt geht das schneller!';

    if (res.hp <= 0) {
      res.alive = false;
      res.group.visible = false;
      res.respawnAt = performance.now() / 1000 + 80 + Math.random() * 50;
      const highOre = res.kind === 'rock' && terrainHeight(res.x, res.z) > 5.5;
      const drops = res.kind === 'tree' ? { holz: 4 } : { stein: 3, ...(highOre && Math.random() < 0.72 ? { eisenerz: 1 + (Math.random() < 0.25 ? 1 : 0) } : {}) };
      return { destroyed: true, drops, kind: res.kind, hint: null };
    }
    return { destroyed: false, drops: null, kind: res.kind, hint };
  }

  update(dt, wind = null) {
    const now = performance.now() / 1000;
    for (const res of this.list) {
      const force = wind ? Math.hypot(wind.x, wind.z) : 0;
      const pulse = 0.72 + Math.sin(now * (1.4 + force * 1.8) + res.windPhase) * 0.28;
      const bend = res.windFlex * force * pulse;
      if (res.shakeT > 0) {
        res.shakeT -= dt;
        const s = Math.max(res.shakeT, 0);
        res.group.rotation.z = Math.sin(s * 40) * s * 0.25 + (wind ? wind.x * bend : 0);
        if (s <= 0) res.group.rotation.z = wind ? wind.x * bend : 0;
      } else if (res.windFlex) {
        res.group.rotation.z += ((wind ? wind.x * bend : 0) - res.group.rotation.z) * Math.min(1, dt * 5);
        res.group.rotation.x += ((wind ? -wind.z * bend : 0) - res.group.rotation.x) * Math.min(1, dt * 5);
      }
      if (!res.alive && res.respawnAt > 0 && now >= res.respawnAt) {
        res.alive = true;
        res.hp = res.maxHp;
        res.respawnAt = 0;
        res.group.visible = true;
        if (res.kind === 'bush') res.group.userData.berries.visible = true;
      }
    }
  }
}
