import * as THREE from 'three';
import { terrainHeight } from './world.js';

function mat(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 0.55 : 0, flatShading: true, roughness: 1 });
}

function mesh(geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function sitsOnGround(object) {
  object.userData.sitsOnGround = true;
  return object;
}

function buildStoneCircle() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const height = 2.5 + (i % 2) * 0.55;
    const stone = sitsOnGround(mesh(new THREE.BoxGeometry(0.75, height, 0.7), mat(0x777d78), Math.cos(a) * 4, height / 2, Math.sin(a) * 4));
    stone.rotation.set((i % 3 - 1) * 0.08, -a, (i % 2 ? 1 : -1) * 0.08);
    g.add(stone);
  }
  const altar = sitsOnGround(mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.65, 7), mat(0x666b68), 0, 0.325, 0));
  g.add(altar);
  return g;
}

function buildAbandonedCamp() {
  const g = new THREE.Group();
  const wood = mat(0x69472d);
  for (let i = 0; i < 4; i++) {
    const post = sitsOnGround(mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.7, 5), wood, i < 2 ? -2 : 2, 1.35, i % 2 ? -1.4 : 1.4));
    post.rotation.z = (i % 2 ? -1 : 1) * 0.15;
    g.add(post);
  }
  const roof = mesh(new THREE.BoxGeometry(4.9, 0.16, 3.7), mat(0x78603b), 0, 2.35, 0);
  roof.rotation.z = -0.12;
  g.add(roof);
  g.add(sitsOnGround(mesh(new THREE.BoxGeometry(1.4, 0.8, 1), wood, 0.9, 0.4, 0.3)));
  g.add(sitsOnGround(mesh(new THREE.CylinderGeometry(0.65, 0.75, 0.25, 8), mat(0x545451), -0.7, 0.125, -0.2)));
  return g;
}

function buildAncientTree() {
  const g = new THREE.Group();
  const trunk = mat(0x5b3a25);
  for (let i = 0; i < 3; i++) {
    const t = mesh(new THREE.CylinderGeometry(0.65, 1.25, 7.5, 7), trunk, (i - 1) * 0.65, 3.5, 0);
    t.rotation.z = (i - 1) * 0.1;
    g.add(t);
  }
  const leaves = mat(0x2b6f43, 0x0d301b);
  for (const [x, y, z, s] of [[0, 8, 0, 2.8], [-2, 7, 0, 2.1], [2, 7.4, .4, 2.2], [0, 7, -2, 2]]) {
    g.add(mesh(new THREE.IcosahedronGeometry(s, 1), leaves, x, y, z));
  }
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), mat(0x9fffb8, 0x42ff72), Math.cos(a) * 2.3, 1.2 + (i % 3) * 0.5, Math.sin(a) * 2.3));
  }
  return g;
}

const DEFINITIONS = [
  {
    id: 'steinkreis', name: 'Der alte Steinkreis', story: 'Verwitterte Zeichen erzählen von Menschen, die hier vor langer Zeit Schutz suchten.',
    x: 75, z: 0, build: buildStoneCircle, reward: { stein: 8 },
    // Die einzelnen Menhire bleiben getrennt, damit man in den Kreis hineinlaufen kann.
    collision: [
      ...Array.from({ length: 8 }, (_, i) => {
        const a = i / 8 * Math.PI * 2;
        return { x: Math.cos(a) * 4, z: Math.sin(a) * 4, r: 0.48 };
      }),
      { x: 0, z: 0, r: 1.15, height: 0.65 },
    ],
    platforms: [{ x: 0, z: 0, r: 1.05, height: 0.65 }],
  },
  {
    id: 'jaegerlager', name: 'Das verlassene Jägerlager', story: 'Die Glut ist kalt, doch unter dem morschen Dach liegen noch brauchbare Vorräte.',
    x: -127, z: 105, build: buildAbandonedCamp, reward: { holz: 10, fell: 2 },
    // Nur tragende Pfosten, Kiste und Feuerstelle blockieren; unter dem Dach bleibt Platz.
    collision: [
      { x: -2, z: 1.4, r: 0.18 }, { x: -2, z: -1.4, r: 0.18 },
      { x: 2, z: 1.4, r: 0.18 }, { x: 2, z: -1.4, r: 0.18 },
      { x: 0.9, z: 0.3, r: 0.72 }, { x: -0.7, z: -0.2, r: 0.66 },
    ],
  },
  {
    id: 'uralter_baum', name: 'Der Hüter des Waldes', story: 'Dieser Baum ist älter als jeder Pfad. Zwischen seinen Wurzeln schimmert ein vergessener Vorrat.',
    x: 81, z: -66, build: buildAncientTree, reward: { holz: 8, beeren: 6 },
    collision: [{ x: 0, z: 0, r: 1.45 }],
  },
];

export class Landmarks {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Landmarks';
    scene.add(this.group);
    this.obstacles = [];
    this.platforms = [];
    this.list = DEFINITIONS.map((def) => {
      const group = def.build();
      const baseHeight = terrainHeight(def.x, def.z);
      // Jeder bodengebundene Bestandteil tastet das Terrain an seiner eigenen
      // Weltposition ab. So schweben Objekte auf Hängen nicht über dem Boden.
      for (const child of group.children) {
        if (!child.userData.sitsOnGround) continue;
        child.position.y += terrainHeight(def.x + child.position.x, def.z + child.position.z) - baseHeight;
      }
      group.position.set(def.x, baseHeight, def.z);
      this.group.add(group);
      for (const shape of def.collision || []) {
        const ground = terrainHeight(def.x + shape.x, def.z + shape.z);
        this.obstacles.push({
          x: def.x + shape.x, z: def.z + shape.z, r: shape.r, landmark: def.id,
          top: shape.height == null ? null : ground + shape.height,
        });
      }
      for (const platform of def.platforms || []) {
        const x = def.x + platform.x;
        const z = def.z + platform.z;
        this.platforms.push({ x, z, r: platform.r, y: terrainHeight(x, z) + platform.height });
      }
      return { ...def, group };
    });
  }

  update(playerPos, discovered) {
    for (const landmark of this.list) {
      if (discovered.includes(landmark.id)) continue;
      if (Math.hypot(playerPos.x - landmark.x, playerPos.z - landmark.z) <= 9) return landmark;
    }
    return null;
  }
}

export const LANDMARK_COUNT = DEFINITIONS.length;
