import * as THREE from 'three';
import { terrainHeight, WATER_Y, WORLD_RADIUS } from './world.js';

function mat(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });
}

function buildFish(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 7, 5), mat(color));
  body.scale.set(1, 0.65, 1.8);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.42, 3), mat(color));
  tail.position.z = -0.68;
  tail.rotation.x = -Math.PI / 2;
  g.add(tail);
  for (const x of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), new THREE.MeshBasicMaterial({ color: 0x101820 }));
    eye.position.set(x, 0.08, 0.52);
    g.add(eye);
  }
  return g;
}

export class Aquatics {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.list = [];
    this.respawns = [];
    for (let i = 0; i < 14; i++) this.spawn();
  }

  waterSpot() {
    for (let i = 0; i < 100; i++) {
      const x = (Math.random() - 0.5) * 2 * (WORLD_RADIUS - 12);
      const z = (Math.random() - 0.5) * 2 * (WORLD_RADIUS - 12);
      const floor = terrainHeight(x, z);
      if (floor < WATER_Y - 2) return { x, z, floor };
    }
    return { x: 80, z: 80, floor: terrainHeight(80, 80) };
  }

  spawn() {
    const p = this.waterSpot();
    const colors = [0x4fb3bf, 0xd49a45, 0x7aa7d8, 0x9abb5b];
    const fish = {
      group: buildFish(colors[Math.floor(Math.random() * colors.length)]),
      dir: Math.random() * Math.PI * 2,
      turnAt: 0,
      speed: 0.8 + Math.random() * 0.8,
    };
    fish.group.position.set(p.x, Math.min(WATER_Y - 0.55, p.floor + 0.8 + Math.random() * 1.2), p.z);
    fish.group.traverse((m) => { m.userData.fish = fish; });
    this.group.add(fish.group);
    this.list.push(fish);
  }

  hit(fish) {
    if (!this.list.includes(fish)) return false;
    this.group.remove(fish.group);
    this.list.splice(this.list.indexOf(fish), 1);
    this.respawns.push(performance.now() / 1000 + 45 + Math.random() * 30);
    return true;
  }

  update(dt, now) {
    for (const fish of this.list) {
      if (now > fish.turnAt) {
        fish.dir += (Math.random() - 0.5) * 1.5;
        fish.turnAt = now + 2 + Math.random() * 4;
      }
      const p = fish.group.position;
      const nx = p.x + Math.sin(fish.dir) * fish.speed * dt;
      const nz = p.z + Math.cos(fish.dir) * fish.speed * dt;
      const floor = terrainHeight(nx, nz);
      if (floor > WATER_Y - 1.2 || Math.abs(nx) > WORLD_RADIUS || Math.abs(nz) > WORLD_RADIUS) {
        fish.dir += Math.PI * (0.7 + Math.random() * 0.6);
      } else {
        p.x = nx; p.z = nz;
        p.y += (Math.min(WATER_Y - 0.5, floor + 1.1) - p.y) * Math.min(1, dt * 0.7);
      }
      fish.group.rotation.y = fish.dir;
      fish.group.rotation.z = Math.sin(now * 5 + fish.dir) * 0.05;
    }
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      if (now >= this.respawns[i]) { this.spawn(); this.respawns.splice(i, 1); }
    }
  }
}
