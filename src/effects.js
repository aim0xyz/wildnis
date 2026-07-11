import * as THREE from 'three';

// Einfache Partikel-Bursts (Holzspäne, Steinsplitter, Treffer usw.)
const GEO = new THREE.BoxGeometry(0.09, 0.09, 0.09);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.mats = new Map();
  }

  matFor(color) {
    if (!this.mats.has(color)) {
      this.mats.set(color, new THREE.MeshBasicMaterial({ color }));
    }
    return this.mats.get(color);
  }

  burst(pos, color = 0x8a5a2b, n = 10, speed = 3.5) {
    const mat = this.matFor(color);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(GEO, mat);
      m.position.copy(pos);
      m.position.x += (Math.random() - 0.5) * 0.4;
      m.position.y += (Math.random() - 0.5) * 0.4;
      m.position.z += (Math.random() - 0.5) * 0.4;
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.2 + 0.3,
        (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      const s = 0.6 + Math.random() * 1.2;
      m.scale.setScalar(s);
      this.scene.add(m);
      this.parts.push({ m, v, life: 0.55 + Math.random() * 0.3 });
    }
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.m);
        this.parts.splice(i, 1);
        continue;
      }
      p.v.y -= 9 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += dt * 6;
      p.m.rotation.z += dt * 5;
      p.m.scale.multiplyScalar(Math.max(0, 1 - dt * 1.6));
    }
  }
}
