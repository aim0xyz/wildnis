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
    this.oxygen = 100;
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
      speer: mk(() => {
        const g = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 1.45, 7), std(0x744824));
        shaft.position.z = -0.18;
        shaft.rotation.x = -Math.PI / 2;
        g.add(shaft);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 6), std(0xb8bec6));
        tip.position.set(0, 0, -1.04);
        tip.rotation.x = -Math.PI / 2;
        g.add(tip);
        const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 7), std(0x503321));
        wrap.position.z = -0.86;
        wrap.rotation.x = -Math.PI / 2;
        g.add(wrap);
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
    this.sprinting = wantSprint && f > 0 && this.hunger > 5;

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
    if (this.swingT < 1) {
      this.swingT = Math.min(1, this.swingT + dt / 0.32);
      this.held.rotation.x = -Math.sin(this.swingT * Math.PI) * 1.15;
    } else {
      this.held.rotation.x = 0;
      // Idle-Bob des Werkzeugs
      this.held.position.y = -0.38 + Math.sin(this.bobT * 4) * 0.007;
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
