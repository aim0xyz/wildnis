import * as THREE from 'three';
import { fbm, mulberry32 } from './noise.js';

export const WATER_Y = 0;
export const WORLD_RADIUS = 230;
const SIZE = 480;
const SEGS = 110;
const DAY_LENGTH = 300; // Sekunden pro Tag

export function terrainHeight(x, z) {
  let h = (fbm(x * 0.0085 + 8.3, z * 0.0085 + 3.1) - 0.47) * 26;
  h += (fbm(x * 0.05 + 100, z * 0.05 + 50) - 0.5) * 2.2;
  // Startgebiet in der Mitte einebnen (Camp-Wiese)
  const d = Math.hypot(x, z);
  const flat = THREE.MathUtils.clamp(1 - d / 26, 0, 1);
  h = THREE.MathUtils.lerp(h, 1.6, flat * 0.9);
  return h;
}

export function terrainSlope(x, z) {
  const e = 1.2;
  const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

const C_SAND = new THREE.Color(0xdbc27f);
const C_GRASS_A = new THREE.Color(0x6ab944);
const C_GRASS_B = new THREE.Color(0x4d9636);
const C_GRASS_DRY = new THREE.Color(0x9fae4a);
const C_ROCK = new THREE.Color(0x8d8d93);
const C_SNOW = new THREE.Color(0xf2f4f8);

const SKY_DAY = new THREE.Color(0x7ec8e8);
const SKY_DUSK = new THREE.Color(0xf79862);
const SKY_NIGHT = new THREE.Color(0x0d1226);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.t = 0.3; // Tageszeit 0..1 (0 = Mitternacht)
    this.day = 1;
    this.night = false;
    this.elevation = 1;

    scene.background = new THREE.Color(SKY_DAY);
    scene.fog = new THREE.Fog(SKY_DAY.clone(), 60, 260);

    this.buildTerrain();
    this.buildWater();
    this.buildLights();
    this.buildSky();
    this.buildGrass();
    this.buildClouds();
  }

  buildTerrain() {
    let g = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    }
    g = g.toNonIndexed();
    g.computeVertexNormals();

    // Facetten-Farben pro Dreieck (echter Low-Poly-Look)
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const col = new THREE.Color();
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const ab = new THREE.Vector3(), acv = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      va.fromBufferAttribute(p, i);
      vb.fromBufferAttribute(p, i + 1);
      vc.fromBufferAttribute(p, i + 2);
      const cy = (va.y + vb.y + vc.y) / 3;
      const cx = (va.x + vb.x + vc.x) / 3;
      const cz = (va.z + vb.z + vc.z) / 3;
      n.copy(ab.subVectors(vb, va)).cross(acv.subVectors(vc, va)).normalize();

      if (cy < 0.5) col.copy(C_SAND);
      else if (cy > 10.5) col.copy(C_SNOW);
      else if (n.y < 0.72 || cy > 8) col.copy(C_ROCK);
      else {
        const m = fbm(cx * 0.03 + 40, cz * 0.03 + 40);
        col.lerpColors(C_GRASS_A, C_GRASS_B, THREE.MathUtils.clamp((m - 0.3) * 2.4, 0, 1));
        if (m > 0.62) col.lerp(C_GRASS_DRY, 0.55);
      }
      // leichtes Farbrauschen pro Facette
      const jitter = (fbm(cx * 0.9, cz * 0.9) - 0.5) * 0.08;
      col.offsetHSL(0, 0, jitter);
      for (let k = 0; k < 3; k++) {
        colors[(i + k) * 3] = col.r;
        colors[(i + k) * 3 + 1] = col.g;
        colors[(i + k) * 3 + 2] = col.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    this.terrain = new THREE.Mesh(g, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  buildWater() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3d85c6, transparent: true, opacity: 0.72,
      roughness: 0.25, metalness: 0.1, flatShading: true,
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 24, 24), mat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y;
    this.scene.add(this.water);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x486b3a, 0.7);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2cc, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 300;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.moon = new THREE.DirectionalLight(0x8899dd, 0);
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);
  }

  buildSky() {
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(10, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffdf7a, fog: false })
    );
    this.scene.add(this.sunMesh);

    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(7, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false })
    );
    this.scene.add(this.moonMesh);

    // Sterne
    const rand = mulberry32(99);
    const n = 450;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const az = rand() * Math.PI * 2;
      const el = Math.asin(rand() * 0.95 + 0.05);
      const r = 400;
      arr[i * 3] = Math.cos(az) * Math.cos(el) * r;
      arr[i * 3 + 1] = Math.sin(el) * r;
      arr[i * 3 + 2] = Math.sin(az) * Math.cos(el) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false,
    }));
    this.scene.add(this.stars);
  }

  buildGrass() {
    const rand = mulberry32(4242);
    const geo = new THREE.ConeGeometry(0.08, 0.55, 4);
    geo.translate(0, 0.24, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    const count = 2600;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    const cA = new THREE.Color(0x7ccf52), cB = new THREE.Color(0x559e3c);
    const col = new THREE.Color();
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 30) {
      tries++;
      const x = (rand() - 0.5) * 2 * (WORLD_RADIUS - 5);
      const z = (rand() - 0.5) * 2 * (WORLD_RADIUS - 5);
      const h = terrainHeight(x, z);
      if (h < 0.6 || h > 7.5 || terrainSlope(x, z) > 0.5) continue;
      v.set(x, h, z);
      eul.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3);
      q.setFromEuler(eul);
      const sc = 0.7 + rand() * 0.9;
      s.set(sc, sc, sc);
      m.compose(v, q, s);
      mesh.setMatrixAt(placed, m);
      col.lerpColors(cA, cB, rand());
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
  }

  buildClouds() {
    this.clouds = [];
    const rand = mulberry32(777);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const grp = new THREE.Group();
      const parts = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < parts; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(8 + rand() * 10, 2.2 + rand() * 1.5, 5 + rand() * 6), mat);
        b.position.set((rand() - 0.5) * 14, (rand() - 0.5) * 1.5, (rand() - 0.5) * 8);
        grp.add(b);
      }
      grp.position.set((rand() - 0.5) * 500, 55 + rand() * 25, (rand() - 0.5) * 500);
      grp.userData.speed = 1 + rand() * 1.5;
      this.scene.add(grp);
      this.clouds.push(grp);
    }
  }

  // Nachts schlafen -> Morgen
  sleep() {
    if (this.t >= 0.7) this.day++;
    this.t = 0.27;
  }

  update(dt, playerPos) {
    const prevT = this.t;
    const rate = (this.night ? 1.5 : 1) / DAY_LENGTH;
    this.t += dt * rate;
    if (this.t >= 1) { this.t -= 1; this.day++; }

    const ang = (this.t - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    this.elevation = elev;
    const wasNight = this.night;
    this.night = elev < -0.02;
    this.nightfall = !wasNight && this.night;

    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();

    // Sonne + Schattenkamera folgt dem Spieler
    this.sun.position.copy(playerPos).addScaledVector(sunDir, 100);
    this.sun.target.position.copy(playerPos);
    this.sun.intensity = THREE.MathUtils.clamp(elev * 3.2, 0, 2.6);
    this.sunMesh.position.copy(playerPos).addScaledVector(sunDir, 380);

    const moonDir = sunDir.clone().negate();
    moonDir.y = Math.abs(moonDir.y);
    this.moon.position.copy(playerPos).addScaledVector(moonDir, 100);
    this.moon.target.position.copy(playerPos);
    this.moon.intensity = THREE.MathUtils.clamp(-elev, 0, 1) * 0.4;
    this.moonMesh.position.copy(playerPos).addScaledVector(moonDir, 380);
    this.moonMesh.visible = elev < 0.1;

    this.hemi.intensity = 0.22 + THREE.MathUtils.clamp(elev, 0, 1) * 0.85;

    // Himmel/Nebel-Farbe
    const sky = this.scene.background;
    if (elev > 0.25) sky.copy(SKY_DAY);
    else if (elev > 0) sky.lerpColors(SKY_DUSK, SKY_DAY, elev / 0.25);
    else if (elev > -0.18) sky.lerpColors(SKY_NIGHT, SKY_DUSK, (elev + 0.18) / 0.18);
    else sky.copy(SKY_NIGHT);
    this.scene.fog.color.copy(sky);

    this.stars.material.opacity = THREE.MathUtils.clamp(-elev * 4, 0, 1);
    this.stars.position.set(playerPos.x, 0, playerPos.z);

    // Wolken driften
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 300) c.position.x = -300;
    }

    this.water.position.y = WATER_Y + Math.sin(performance.now() * 0.001) * 0.06;
  }
}
