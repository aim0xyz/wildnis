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
    this.keys = {};
    this.vel = new THREE.Vector3();
    this.bobT = 0;
    this.swingT = 1;
    this.attackCd = 0;
    this.obstacleSets = []; // Arrays von {x,z,r, res?}
    this.sprinting = false;
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

    this.heldModels = {
      hand: mk(() => {
        const g = new THREE.Group();
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), std(0xe0aa72));
        arm.position.set(0.03, -0.05, 0.1);
        arm.rotation.set(0.35, -0.25, 0.15);
        g.add(arm);
        const fist = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.13), std(0xd9a066));
        fist.rotation.set(0.35, -0.25, 0.15);
        g.add(fist);
        g.scale.setScalar(0.85);
        return g;
      }),
      axt: mk(() => {
        const g = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.6, 5), std(0x8a5a2b));
        handle.rotation.z = 0.5;
        g.add(handle);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.05), std(0x9ea2a8));
        head.position.set(0.16, 0.26, 0);
        g.add(head);
        return g;
      }),
      spitzhacke: mk(() => {
        const g = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.6, 5), std(0x8a5a2b));
        handle.rotation.z = 0.5;
        g.add(handle);
        for (const s of [-1, 1]) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 5), std(0x9ea2a8));
          spike.position.set(0.14 + s * 0.1, 0.28, 0);
          spike.rotation.z = -s * Math.PI / 2;
          g.add(spike);
        }
        return g;
      }),
      speer: mk(() => {
        const g = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.3, 5), std(0x8a5a2b));
        shaft.rotation.x = -Math.PI / 2 + 0.25;
        g.add(shaft);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), std(0xb8bcc2));
        tip.position.set(0, 0.16, -0.62);
        tip.rotation.x = -Math.PI / 2 + 0.25;
        g.add(tip);
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

  damage(n) {
    this.hp = Math.max(0, this.hp - n);
    if (this.onDamage) this.onDamage(n);
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
    const wading = groundH < WATER_Y + 0.15;
    let speed = this.sprinting ? 7.0 : 4.4;
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

    // Springen / Gravitation
    const floor = terrainHeight(this.pos.x, this.pos.z);
    if (this.grounded && k.Space) {
      this.vy = 6.4;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= 19 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= floor) {
        this.pos.y = floor;
        this.vy = 0;
        this.grounded = true;
      }
    } else {
      this.pos.y = floor;
    }

    // Kamera + Head-Bob
    const moveAmt = Math.hypot(this.vel.x, this.vel.z);
    this.bobT += moveAmt * dt * 0.75;
    const bob = this.grounded ? Math.sin(this.bobT * 4) * 0.022 * Math.min(moveAmt / 4, 1) : 0;
    this.cam.position.set(this.pos.x, this.pos.y + 1.65 + bob, this.pos.z);
    this.cam.rotation.set(this.pitch, this.yaw, 0);

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

    return { wading, moving: moveAmt > 0.3 };
  }

  updateStats(dt) {
    const drain = 0.3 + (this.sprinting ? 0.35 : 0);
    this.hunger = Math.max(0, this.hunger - drain * dt);
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
