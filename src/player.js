import * as THREE from 'three';
import { terrainHeight, WATER_Y, WORLD_RADIUS } from './world.js';

function std(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 });
}

export class Player {
  constructor(camera) {
    this.cam = camera;
    this.cam.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(0, terrainHeight(0, 6), 6); // Füße
    this.yaw = Math.PI;
    this.pitch = 0;
    this.vy = 0;
    this.grounded = true;
    this.hp = 100;
    this.hunger = 100;
    this.thirst = 100;
    this.warmth = 100;
    this.oxygen = 100;
    this.stamina = 100;
    this.exhausted = false;
    this.keys = {};
    this.vel = new THREE.Vector3();
    this.bobT = 0;
    this.swingT = 1;
    this.attackCd = 0;
    this.obstacleSets = []; // Arrays von {x,z,r, res?}
    this.platforms = []; // Begehbare Oberseiten: {x,z,r,y}
    this.sprinting = false;
    this.swimming = false;
    this.underwater = false;
    this.touchInput = null;
    this.onDamage = null;

    this.buildHeld();

    addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    this.canLook = null; // Fallback ohne Pointer-Lock
    addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement && !(this.canLook && this.canLook())) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
    });
  }

  buildHeld() {
    this.held = new THREE.Group();
    this.held.position.set(0.42, -0.38, -0.75);
    this.cam.add(this.held);

    const mk = (buildFn) => {
      const g = buildFn();
      g.visible = false;
      this.held.add(g);
      return g;
    };

    const toolHandle = (length = 0.72, radius = 0.035) => {
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.82, radius, length, 7),
        std(0x744824)
      );
      handle.rotation.z = -0.42;
      return handle;
    };

    const addGrip = (g) => {
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.12), std(0xd9a066));
      palm.position.set(-0.08, -0.14, 0.015);
      palm.rotation.z = -0.42;
      g.add(palm);
    };

    this.heldModels = {
      hand: mk(() => {
        const g = new THREE.Group();
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.42), std(0xe0aa72));
        arm.position.set(0.03, -0.06, 0.12);
        arm.rotation.set(0.12, -0.16, -0.05);
        g.add(arm);
        const palm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.2), std(0xd9a066));
        palm.position.set(0.01, -0.03, -0.16);
        palm.rotation.x = 0.18;
        g.add(palm);
        for (let i = 0; i < 4; i++) {
          const finger = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.055, 0.13), std(0xd4985f));
          finger.position.set(-0.063 + i * 0.042, -0.02, -0.28);
          finger.rotation.x = -0.28;
          g.add(finger);
        }
        const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.12), std(0xd4985f));
        thumb.position.set(0.11, -0.07, -0.17);
        thumb.rotation.set(0.2, -0.35, 0.25);
        g.add(thumb);
        return g;
      }),
      axt: mk(() => {
        const g = new THREE.Group();
        const handle = toolHandle();
        g.add(handle);
        const socket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.12), std(0x7f858c));
        socket.position.set(0.15, 0.33, 0);
        g.add(socket);
        const shape = new THREE.Shape();
        shape.moveTo(-0.04, -0.11); shape.lineTo(0.22, -0.17); shape.lineTo(0.3, 0);
        shape.lineTo(0.22, 0.17); shape.lineTo(-0.04, 0.11); shape.closePath();
        const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
        bladeGeo.translate(0, 0, -0.035);
        const blade = new THREE.Mesh(bladeGeo, std(0xaeb4bb));
        blade.position.set(0.23, 0.33, 0);
        g.add(blade);
        addGrip(g);
        g.rotation.y = Math.PI / 2;
        return g;
      }),
      spitzhacke: mk(() => {
        const g = new THREE.Group();
        const handle = toolHandle(0.76);
        g.add(handle);
        const collar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.1), std(0x858b92));
        collar.position.set(0.15, 0.35, 0);
        g.add(collar);
        for (const s of [-1, 1]) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.3, 6), std(0xaeb4bb));
          spike.position.set(0.15 + s * 0.38, 0.35, 0);
          spike.rotation.z = -s * Math.PI / 2;
          g.add(spike);
        }
        addGrip(g);
        g.rotation.y = Math.PI / 2;
        return g;
      }),
      bogen: mk(() => {
        const g = new THREE.Group();
        // Zwei Wurfarme, deren Enden leicht nach vorn gebogen sind
        for (const s of [-1, 1]) {
          const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.52, 6), std(0x744824));
          limb.position.set(0, s * 0.25, -0.02);
          limb.rotation.x = s * 0.4;
          g.add(limb);
        }
        // Griff in der Mitte
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.17, 8), std(0x503321));
        g.add(grip);
        // Sehne
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.94, 4), std(0xece3cf));
        string.position.z = 0.12;
        g.add(string);
        // Aufgelegter Pfeil
        const arrow = new THREE.Group();
        const ashaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.72, 5), std(0x9a7b4f));
        ashaft.rotation.x = Math.PI / 2;
        ashaft.position.set(0, 0, -0.14);
        arrow.add(ashaft);
        const ahead = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.1, 5), std(0xb8bec6));
        ahead.rotation.x = -Math.PI / 2;
        ahead.position.set(0, 0, -0.52);
        arrow.add(ahead);
        arrow.position.z = 0.12;
        g.add(arrow);
        g.userData.arrow = arrow;
        // Bogen aufrecht, leicht zur Seite gekippt in der linken Hand
        g.rotation.set(0, 0.18, 0.06);
        g.position.set(-0.08, 0.02, 0);
        return g;
      }),
      fackel: mk(() => {
        const g = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.85, 6), std(0x6e4a2c));
        stick.rotation.z = -0.35;
        g.add(stick);
        // getränkter Kopf
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.16, 6), std(0x2c2118));
        head.position.set(0.14, 0.38, 0);
        head.rotation.z = -0.35;
        g.add(head);
        // Flamme (mehrere Kegel, werden animiert)
        const flames = new THREE.Group();
        flames.position.set(0.16, 0.46, 0);
        const cols = [0xff6b1a, 0xffa63d, 0xffe08a];
        for (let i = 0; i < 3; i++) {
          const f = new THREE.Mesh(
            new THREE.ConeGeometry(0.11 - i * 0.028, 0.34 - i * 0.08, 6),
            new THREE.MeshBasicMaterial({ color: cols[i], fog: false })
          );
          f.position.y = 0.12 + i * 0.05;
          flames.add(f);
        }
        g.add(flames);
        g.userData.flames = flames;
        addGrip(g);
        return g;
      }),
      hammer: mk(() => {
        const g = new THREE.Group();
        const handle = toolHandle(0.7, 0.04);
        g.add(handle);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.17, 0.18), std(0x8d9299));
        head.position.set(0.15, 0.32, 0);
        g.add(head);
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 7), std(0xaeb4bb));
        face.position.set(0.42, 0.32, 0);
        face.rotation.z = Math.PI / 2;
        g.add(face);
        addGrip(g);
        g.rotation.y = Math.PI / 2;
        return g;
      }),
    };
    this.heldModels.hand.visible = true;
  }

  setHeld(itemId) {
    this.heldId = itemId;
    for (const [k, m] of Object.entries(this.heldModels)) {
      m.visible = k === itemId;
    }
    if (!this.heldModels[itemId]) this.heldModels.hand.visible = false;
  }

  swing() {
    if (this.attackCd > 0) return false;
    this.attackCd = 0.42;
    this.swingT = 0;
    return true;
  }

  damage(n, cause = null) {
    this.hp = Math.max(0, this.hp - n);
    if (this.onDamage) this.onDamage(n, cause);
  }

  update(dt) {
    const k = this.keys;
    const touch = this.touchInput;
    const f = touch?.enabled ? touch.vec.y : (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    const s = touch?.enabled ? touch.vec.x : (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const wantSprint = touch?.enabled ? touch.sprint : k.ShiftLeft || k.ShiftRight;
    if (this.exhausted && this.stamina >= 28) this.exhausted = false;
    this.sprinting = wantSprint && f > 0 && this.hunger > 5 && !this.exhausted && this.stamina > 0;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - 24 * dt);
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      const recovery = this.hunger > 20 ? 17 : 9;
      this.stamina = Math.min(100, this.stamina + recovery * dt);
    }

    // vorwärts = -Z in Kamerarichtung, rechts = +X
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let dx = (-sin) * f + cos * s;
    let dz = (-cos) * f + (-sin) * s;

    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }

    const groundH = terrainHeight(this.pos.x, this.pos.z);
    const waterDepth = WATER_Y - groundH;
    const swimming = waterDepth > 1.25;
    const wading = !swimming && groundH < WATER_Y + 0.15;
    this.swimming = swimming;
    let speed = this.sprinting ? 7.0 : 4.4;
    if (swimming) speed = 2.8;
    if (wading) speed *= 0.5;

    const targetVx = dx * speed * (len > 0 ? 1 : 0);
    const targetVz = dz * speed * (len > 0 ? 1 : 0);
    const lerp = Math.min(1, dt * 11);
    this.vel.x += (targetVx - this.vel.x) * lerp;
    this.vel.z += (targetVz - this.vel.z) * lerp;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -WORLD_RADIUS, WORLD_RADIUS);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -WORLD_RADIUS, WORLD_RADIUS);

    // Kollision: aus Hindernis-Kreisen herausschieben
    for (const set of this.obstacleSets) {
      for (const o of set) {
        if (o.res && !o.res.alive) continue;
        // Niedrige Hindernisse dürfen übersprungen und von oben betreten werden.
        if (o.top != null && this.pos.y >= o.top - 0.08) continue;
        const ox = this.pos.x - o.x;
        const oz = this.pos.z - o.z;
        const d = Math.hypot(ox, oz);
        const minD = o.r + 0.45;
        if (d < minD && d > 0.001) {
          this.pos.x = o.x + (ox / d) * minD;
          this.pos.z = o.z + (oz / d) * minD;
        }
      }
    }

    // Springen / Gravitation beziehungsweise Schwimmen
    let floor = terrainHeight(this.pos.x, this.pos.z);
    if (this.vy <= 0 || this.grounded) {
      for (const platform of this.platforms) {
        if (Math.hypot(this.pos.x - platform.x, this.pos.z - platform.z) <= platform.r && this.pos.y >= platform.y - 0.45) {
          floor = Math.max(floor, platform.y);
        }
      }
    }
    if (swimming) {
      this.grounded = false;
      this.vy = 0;
      const surfaceY = WATER_Y - 1.25;
      if (k.KeyQ) this.pos.y = Math.max(floor + 0.15, this.pos.y - 2.7 * dt);
      else if (k.Space) this.pos.y = Math.min(surfaceY, this.pos.y + 3.2 * dt);
      else this.pos.y += (surfaceY - this.pos.y) * Math.min(1, dt * 1.4);
    } else if (this.grounded && k.Space) {
      this.vy = 6.4;
      this.grounded = false;
    }
    if (!swimming && !this.grounded) {
      this.vy -= 19 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= floor) {
        this.pos.y = floor;
        this.vy = 0;
        this.grounded = true;
      }
    } else if (!swimming) {
      this.pos.y = floor;
    }

    // Kamera + Head-Bob
    const moveAmt = Math.hypot(this.vel.x, this.vel.z);
    this.bobT += moveAmt * dt * 0.75;
    const bob = this.grounded ? Math.sin(this.bobT * 4) * 0.022 * Math.min(moveAmt / 4, 1) : 0;
    this.cam.position.set(this.pos.x, this.pos.y + 1.65 + bob, this.pos.z);
    this.cam.rotation.set(this.pitch, this.yaw, 0);
    this.underwater = this.cam.position.y < WATER_Y - 0.12;

    // Schwung-Animation für Werkzeug
    this.attackCd -= dt;
    const bow = this.heldModels.bogen;
    if (this.swingT < 1) {
      this.swingT = Math.min(1, this.swingT + dt / 0.32);
      if (this.heldId === 'bogen') {
        // Bogen: Sehne spannen und Rückstoß statt Hieb
        const draw = Math.sin(this.swingT * Math.PI);
        this.held.rotation.x = 0;
        this.held.position.z = -0.75 + draw * 0.1;
        if (bow?.userData.arrow) bow.userData.arrow.position.z = 0.12 + draw * 0.16;
      } else {
        this.held.rotation.x = -Math.sin(this.swingT * Math.PI) * 1.15;
      }
    } else {
      this.held.rotation.x = 0;
      this.held.position.z = -0.75;
      if (bow?.userData.arrow) bow.userData.arrow.position.z = 0.12;
      // Idle-Bob des Werkzeugs
      this.held.position.y = -0.38 + Math.sin(this.bobT * 4) * 0.007;
    }

    // Fackel-Flamme flackern lassen, solange die Fackel in der Hand ist
    if (this.heldId === 'fackel') {
      const flames = this.heldModels.fackel.userData.flames;
      const t = performance.now() * 0.001;
      flames.children.forEach((f, i) => {
        const s = 0.8 + Math.sin(t * 13 + i * 2.1) * 0.22 + Math.random() * 0.06;
        f.scale.set(s, 0.85 + Math.sin(t * 17 + i) * 0.25, s);
      });
    }

    return { wading, swimming, underwater: this.underwater, moving: moveAmt > 0.3 };
  }

  updateStats(dt) {
    const drain = 0.3 + (this.sprinting ? 0.35 : 0);
    this.hunger = Math.max(0, this.hunger - drain * dt);
    if (this.underwater) this.oxygen = Math.max(0, this.oxygen - 18 * dt);
    else this.oxygen = Math.min(100, this.oxygen + 45 * dt);
    if (this.oxygen <= 0) {
      this.hp = Math.max(0, this.hp - 8 * dt);
      return 'drowning';
    }
    if (this.hunger <= 0) {
      this.hp = Math.max(0, this.hp - 2.5 * dt);
      return 'starving';
    }
    if (this.hunger > 60 && this.hp < 100) {
      this.hp = Math.min(100, this.hp + 0.7 * dt);
    }
    return null;
  }
}
