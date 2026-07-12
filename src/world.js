import * as THREE from 'three';
import { fbm, mulberry32 } from './noise.js';

export const WATER_Y = 0;
export const WORLD_RADIUS = 320;
const SIZE = 660;
const SEGS = 132;
const DAY_SECONDS = 8 * 60;
const NIGHT_SECONDS = 3 * 60;

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
const SKY_STORM = new THREE.Color(0x59626b);
const SUN_DAY = new THREE.Color(0xfff2cc);
const SUN_DUSK = new THREE.Color(0xff9d5c);

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
    this.buildFlowers();
    this.buildReeds();
    this.buildFireflies();
    this.buildClouds();
    this.buildBirds();
    this.buildRain();
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
      color: 0x2f86bd, transparent: true, opacity: 0.76,
      roughness: 0.18, metalness: 0.08, flatShading: true,
      emissive: 0x06263b, emissiveIntensity: 0.16,
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
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -48;
    this.sun.shadow.camera.right = 48;
    this.sun.shadow.camera.top = 48;
    this.sun.shadow.camera.bottom = -48;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
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

  buildFlowers() {
    const rand = mulberry32(5050);
    const geo = new THREE.ConeGeometry(0.1, 0.38, 5);
    geo.translate(0, 0.18, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }), 420);
    const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
    const quat = new THREE.Quaternion(), col = new THREE.Color();
    const palette = [0xffd166, 0xf78fb3, 0xb8e986, 0xd8c7ff, 0xff8a65];
    let placed = 0;
    for (let tries = 0; placed < 420 && tries < 10000; tries++) {
      const x = (rand() - 0.5) * 390, z = (rand() - 0.5) * 390;
      const h = terrainHeight(x, z);
      if (h < 0.8 || h > 6.5 || terrainSlope(x, z) > 0.38) continue;
      pos.set(x, h, z);
      const s = 0.65 + rand() * 0.9;
      scale.set(s, s, s);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(placed, matrix);
      col.setHex(palette[Math.floor(rand() * palette.length)]);
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
  }

  buildReeds() {
    const rand = mulberry32(6060);
    const geo = new THREE.CylinderGeometry(0.025, 0.035, 0.9, 5);
    geo.translate(0, 0.42, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x668f45, flatShading: true, roughness: 1 }), 520);
    const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    let placed = 0;
    for (let tries = 0; placed < 520 && tries < 18000; tries++) {
      const x = (rand() - 0.5) * 430, z = (rand() - 0.5) * 430;
      const h = terrainHeight(x, z);
      if (h < -0.18 || h > 0.48 || terrainSlope(x, z) > 0.5) continue;
      pos.set(x, h, z);
      const s = 0.65 + rand() * 0.8;
      scale.set(s, s, s);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(placed++, matrix);
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
  }

  buildFireflies() {
    const rand = mulberry32(8080);
    const count = 130;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      let x, z, h;
      do {
        x = (rand() - 0.5) * 180;
        z = (rand() - 0.5) * 180;
        h = terrainHeight(x, z);
      } while (h < 0.7);
      arr[i * 3] = x;
      arr[i * 3 + 1] = h + 0.45 + rand() * 1.8;
      arr[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffee78, size: 3.2, sizeAttenuation: false,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.fireflies);
  }

  buildClouds() {
    this.clouds = [];
    const rand = mulberry32(777);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf5f7f4, transparent: true, opacity: 0.82, flatShading: true, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const grp = new THREE.Group();
      const parts = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < parts; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
        b.scale.set(5 + rand() * 7, 1.7 + rand() * 1.3, 3.5 + rand() * 4.5);
        b.position.set((rand() - 0.5) * 14, (rand() - 0.5) * 1.5, (rand() - 0.5) * 8);
        grp.add(b);
      }
      grp.position.set((rand() - 0.5) * 500, 55 + rand() * 25, (rand() - 0.5) * 500);
      grp.userData.speed = 1 + rand() * 1.5;
      this.scene.add(grp);
      this.clouds.push(grp);
    }
  }

  buildBirds() {
    this.birds = [];
    const rand = mulberry32(313);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b2b34, flatShading: true, roughness: 1 });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.5), mat);
        wing.position.x = s * 0.8;
        g.add(wing);
      }
      g.userData = {
        radius: 20 + rand() * 45,
        height: 32 + rand() * 24,
        speed: (0.08 + rand() * 0.12) * (rand() < 0.5 ? -1 : 1),
        phase: rand() * Math.PI * 2,
        flap: rand() * Math.PI * 2,
      };
      g.scale.setScalar(0.55 + rand() * 0.35);
      this.scene.add(g);
      this.birds.push(g);
    }
  }

  buildRain() {
    this.weather = 'clear';        // clear | rain | storm
    this.rainIntensity = 0;        // 0..1 gleitend
    this.weatherTimer = 45 + Math.random() * 45;
    this.flash = 0;                // Blitz-Helligkeit (klingt ab)
    this.onThunder = null;         // Callback (dist 0..1) für Donner-Sound
    this._flashColor = new THREE.Color(0xdfe8ff);
    // Träger Wind statt Zufallswackeln: Richtung und Stärke ändern sich langsam.
    this.wind = { x: 0.35, z: 0.1, speed: 0.18, gust: 0, angle: 0.28 };
    this.windTarget = { angle: 0.28, speed: 0.2 };
    this.windTimer = 18 + Math.random() * 25;
    this.gustTimer = 5 + Math.random() * 9;

    const count = 1300;
    this.rainCount = count;
    this.rainRadius = 26;
    this.rainDrops = [];
    for (let i = 0; i < count; i++) {
      this.rainDrops.push({
        x: (Math.random() - 0.5) * 2 * this.rainRadius,
        z: (Math.random() - 0.5) * 2 * this.rainRadius,
        y: Math.random() * 24,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xaccbe6, transparent: true, opacity: 0 });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  updateWeather(dt) {
    // Wetterzustand periodisch wechseln
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      const r = Math.random();
      if (this.weather === 'clear') {
        this.weather = r < 0.32 ? 'rain' : r < 0.46 ? 'storm' : 'clear';
        this.weatherTimer = this.weather === 'clear' ? 40 + Math.random() * 45 : 40 + Math.random() * 40;
      } else {
        this.weather = r < 0.68 ? 'clear' : this.weather === 'rain' ? 'storm' : 'rain';
        this.weatherTimer = this.weather === 'clear' ? 60 + Math.random() * 60 : 25 + Math.random() * 35;
      }
    }
    const target = this.weather === 'clear' ? 0 : this.weather === 'storm' ? 1 : 0.65;
    this.rainIntensity += (target - this.rainIntensity) * Math.min(1, dt * 0.4);
    if (this.rainIntensity < 0.001) this.rainIntensity = 0;

    // Blitz & Donner im Sturm
    this.flash *= Math.max(0, 1 - dt * 3.2);
    if (this.weather === 'storm' && this.rainIntensity > 0.55 && Math.random() < dt * 0.09) {
      this.flash = 1;
      const dist = 0.25 + Math.random() * 0.75; // 1 = nah
      const delay = (1 - dist) * 3200 + 250;
      if (this.onThunder) setTimeout(() => this.onThunder(dist), delay);
    }
  }

  updateWind(dt) {
    this.windTimer -= dt;
    if (this.windTimer <= 0) {
      this.windTarget.angle += (Math.random() - 0.5) * 1.35;
      const base = this.weather === 'storm' ? 0.82 : this.weather === 'rain' ? 0.5 : 0.2;
      this.windTarget.speed = THREE.MathUtils.clamp(base + (Math.random() - 0.5) * 0.25, 0.06, 1);
      this.windTimer = 22 + Math.random() * 38;
    }
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.wind.gust = (0.12 + Math.random() * 0.3) * (this.weather === 'storm' ? 1.6 : 1);
      this.gustTimer = 4 + Math.random() * 10;
    }
    this.wind.gust = Math.max(0, this.wind.gust - dt * 0.16);
    let delta = this.windTarget.angle - this.wind.angle;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.wind.angle += delta * Math.min(1, dt * 0.08);
    this.wind.speed += (this.windTarget.speed - this.wind.speed) * Math.min(1, dt * 0.12);
    const force = THREE.MathUtils.clamp(this.wind.speed + this.wind.gust, 0, 1.25);
    this.wind.x = Math.cos(this.wind.angle) * force;
    this.wind.z = Math.sin(this.wind.angle) * force;
  }

  updateRain(dt, playerPos) {
    const mat = this.rain.material;
    mat.opacity = this.rainIntensity * 0.5;
    if (this.rainIntensity <= 0.01) { this.rain.visible = false; return; }
    this.rain.visible = true;
    const pos = this.rain.geometry.attributes.position.array;
    const R = this.rainRadius;
    const speed = 52 + this.rainIntensity * 18;
    const streak = 0.7 + this.rainIntensity * 0.5;
    for (let i = 0; i < this.rainCount; i++) {
      const d = this.rainDrops[i];
      d.y -= speed * dt;
      if (d.y < 0) {
        d.y += 22 + Math.random() * 4;
        d.x = (Math.random() - 0.5) * 2 * R;
        d.z = (Math.random() - 0.5) * 2 * R;
      }
      const bx = playerPos.x + d.x, bz = playerPos.z + d.z, by = playerPos.y + d.y;
      const j = i * 6;
      pos[j] = bx; pos[j + 1] = by; pos[j + 2] = bz;
      const drift = 0.42 + this.rainIntensity * 0.3;
      pos[j + 3] = bx - this.wind.x * drift; pos[j + 4] = by - streak; pos[j + 5] = bz - this.wind.z * drift;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  // Nachts schlafen -> Morgen
  sleep() {
    if (this.t >= 0.7) this.day++;
    this.t = 0.27;
  }

  update(dt, playerPos) {
    const prevT = this.t;
    // Je ungefähr eine Hälfte des normierten Zyklus ist hell bzw. dunkel.
    const rate = this.night ? 0.5 / NIGHT_SECONDS : 0.5 / DAY_SECONDS;
    this.t += dt * rate;
    if (this.t >= 1) { this.t -= 1; this.day++; }

    const ang = (this.t - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    this.elevation = elev;
    const wasNight = this.night;
    this.night = elev < -0.02;
    this.nightfall = !wasNight && this.night;

    this.updateWeather(dt);
    this.updateWind(dt);
    const rain = this.rainIntensity;

    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();

    // Sonne + Schattenkamera folgt dem Spieler
    this.sun.position.copy(playerPos).addScaledVector(sunDir, 100);
    this.sun.target.position.copy(playerPos);
    this.sun.intensity = THREE.MathUtils.clamp(elev * 3.2, 0, 2.6) * (1 - rain * 0.7);
    this.sun.color.lerpColors(SUN_DUSK, SUN_DAY, THREE.MathUtils.clamp(elev * 3, 0, 1));
    this.sunMesh.position.copy(playerPos).addScaledVector(sunDir, 380);

    const moonDir = sunDir.clone().negate();
    moonDir.y = Math.abs(moonDir.y);
    this.moon.position.copy(playerPos).addScaledVector(moonDir, 100);
    this.moon.target.position.copy(playerPos);
    this.moon.intensity = THREE.MathUtils.clamp(-elev, 0, 1) * 0.4;
    this.moonMesh.position.copy(playerPos).addScaledVector(moonDir, 380);
    this.moonMesh.visible = elev < 0.1;

    this.hemi.intensity = (0.22 + THREE.MathUtils.clamp(elev, 0, 1) * 0.85) * (1 - rain * 0.35) + this.flash * 1.4;

    // Himmel/Nebel-Farbe
    const sky = this.scene.background;
    if (elev > 0.25) sky.copy(SKY_DAY);
    else if (elev > 0) sky.lerpColors(SKY_DUSK, SKY_DAY, elev / 0.25);
    else if (elev > -0.18) sky.lerpColors(SKY_NIGHT, SKY_DUSK, (elev + 0.18) / 0.18);
    else sky.copy(SKY_NIGHT);
    // Regen zieht den Himmel ins Graue, ein Blitz lässt ihn kurz aufhellen
    if (rain > 0) sky.lerp(SKY_STORM, rain * 0.6 * THREE.MathUtils.clamp(elev + 0.3, 0.15, 1));
    if (this.flash > 0.01) sky.lerp(this._flashColor, this.flash * 0.55);
    this.scene.fog.color.copy(sky);
    this.scene.fog.far = 260 - rain * 120;

    this.stars.material.opacity = THREE.MathUtils.clamp(-elev * 4, 0, 1);
    this.stars.position.set(playerPos.x, 0, playerPos.z);
    this.fireflies.material.opacity = THREE.MathUtils.clamp((-elev - 0.02) * 5, 0, 0.9);
    this.fireflies.rotation.y += dt * 0.008;
    this.fireflies.position.y = Math.sin(performance.now() * 0.0007) * 0.12;

    // Wolken driften
    for (const c of this.clouds) {
      c.position.x += (c.userData.speed + this.wind.x * 2.2) * dt;
      c.position.z += this.wind.z * 2.2 * dt;
      if (c.position.x > 300) c.position.x = -300;
      if (c.position.x < -300) c.position.x = 300;
      if (c.position.z > 300) c.position.z = -300;
      if (c.position.z < -300) c.position.z = 300;
    }

    this.water.position.y = WATER_Y + Math.sin(performance.now() * 0.001) * 0.06;
    this.water.material.color.setHex(elev < -0.05 ? 0x153f67 : elev < 0.2 ? 0x397da2 : 0x2f86bd);

    // Vögel kreisen tagsüber über dem Spieler und schlagen mit den Flügeln
    const dayAmt = THREE.MathUtils.clamp(elev * 5, 0, 1);
    for (const b of this.birds) {
      const u = b.userData;
      u.phase += dt * u.speed;
      u.flap += dt * 7;
      b.position.set(
        playerPos.x + Math.cos(u.phase) * u.radius,
        u.height + Math.sin(u.phase * 2) * 1.6,
        playerPos.z + Math.sin(u.phase) * u.radius,
      );
      b.rotation.y = -u.phase + (u.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
      const flap = Math.sin(u.flap) * 0.5;
      b.children[0].rotation.z = 0.35 + flap;
      b.children[1].rotation.z = -0.35 - flap;
      b.visible = dayAmt > 0.05 && this.rainIntensity < 0.35;
    }

    this.updateRain(dt, playerPos);
  }
}
