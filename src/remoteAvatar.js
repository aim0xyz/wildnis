import * as THREE from 'three';

// Prozeduraler Low-Poly-Charakter für den Koop-Mitspieler. Die Figur ist im
// Code gebaut und geriggt (Schulter-/Ellbogen-/Hüft-/Knie-Gelenke), damit sie
// echt animiert werden kann: Arme und Beine schwingen beim Laufen, und das
// gehaltene Werkzeug hängt an einem echten Hand-Knoten – es bewegt sich also
// mit der Hand mit. Kein externer Download, passt zum Low-Poly-Stil.
//
// Konvention: Die Figur blickt bei rotation.y = 0 nach −z, exakt wie die
// Spieler-Blickrichtung (yaw). Dadurch braucht es keine Dreh-Korrektur.

const SKIN = 0xd69a68;
const SHIRT = 0x7c8a63;
const SHIRT_DARK = 0x6a7855;
const PANTS = 0x5f5140;
const HAIR = 0x3a2a1c;
const PACK = 0x7a6440;
const PACK_DARK = 0x58462f;
const PACK_EXPEDITION = 0x58664b;

function std(color, roughness = 0.9, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

// Gliedmaß mit Pivot am oberen Ende (Gelenk). Das Mesh hängt um len/2 nach
// unten, sodass eine Rotation um X das Glied um das Gelenk schwenkt.
function segment(len, w, d, mat) {
  const joint = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat);
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  joint.add(mesh);
  joint.userData.mesh = mesh;
  return joint;
}

export class RemoteAvatar {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group();       // trägt das Lauf-Wippen
    this.group.add(this.body);
    this.anim = Math.random() * 10;
    this.heldId = null;
    this.bowDraw = 0;
    // Schlag-Animation (Axt/Hacke/Faust): 0 → 1 ist ein Hieb, 1 = Ruhe.
    this.swingT = 1;
    this.swingSelfAdvance = false;
    this.heldModel = null;
    this.heldCache = new Map();
    this.flames = null;
    this.dead = false;
    this.ready = Promise.resolve();

    const skin = std(SKIN, 0.88);
    const shirt = std(SHIRT, 0.92);
    const shirtDark = std(SHIRT_DARK, 0.94);
    const pants = std(PANTS, 0.95);
    const hair = std(HAIR, 1);
    const pack = std(PACK, 0.95);
    const packDark = std(PACK_DARK, 0.97);
    const packExpedition = std(PACK_EXPEDITION, 0.94);
    this.outfitMaterials = {
      shirt, shirtDark, pants, skin,
      reinforcedShirt: std(0x526956, 0.9),
      reinforcedSleeve: std(0x405444, 0.93),
      reinforcedPants: std(0x3f4939, 0.96),
      boots: std(0x3b2d20, 0.98),
      armor: std(0x596458, 0.78, 0.08),
    };

    // Rumpf ---------------------------------------------------------------
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.26, 1, 3, 1), shirt);
    torso.position.y = 1.2;
    torso.castShadow = true; torso.receiveShadow = true;
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.25), pants);
    hips.position.y = 0.86;
    hips.castShadow = true;
    this.torso = torso;
    this.hips = hips;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 8), skin);
    neck.position.y = 1.56;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26, 2, 2, 2), skin);
    head.position.y = 1.72;
    head.castShadow = true;
    // Haar als flache Kappe, leicht nach hinten (+z) – definiert die Front.
    const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.28), hair);
    hairCap.position.set(0, 1.83, 0.02);
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.13), hair);
    beard.position.set(0, 1.63, -0.12);
    // Der Rucksack liegt auf der Rückseite (+z). Seine Einzelteile werden je
    // nach Inventar-Ausbau skaliert bzw. eingeblendet.
    this.backpack = new THREE.Group();
    this.backpack.position.set(0, 1.23, .2);
    this.backpackBase = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), pack);
    this.backpackFlap = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), packDark);
    this.backpackFlap.position.z = .51;
    this.backpackPocketL = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), packDark);
    this.backpackPocketR = this.backpackPocketL.clone();
    this.backpackRoll = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 1, 8), packExpedition);
    this.backpackRoll.rotation.z = Math.PI / 2;
    this.backpack.add(this.backpackBase, this.backpackFlap, this.backpackPocketL, this.backpackPocketR, this.backpackRoll);
    this.backpack.traverse((part) => { if (part.isMesh) part.castShadow = true; });
    this.body.add(torso, hips, neck, head, hairCap, beard, this.backpack);
    this.setBackpack('standard');

    // Beine ---------------------------------------------------------------
    const legLen = 0.44, shinLen = 0.42, legW = 0.15, legD = 0.17;
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.11, 0.9, 0);
      const thigh = segment(legLen, legW, legD, pants);
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -legLen;
      thigh.add(knee);
      const shin = segment(shinLen, legW * 0.9, legD * 0.9, pants);
      knee.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(legW, 0.09, 0.26), skin);
      foot.position.set(0, -shinLen + 0.02, -0.05);
      foot.castShadow = true;
      shin.add(foot);
      this.body.add(hip);
      return { hip, knee, thigh, shin, foot };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    // Sichtbare Verstärkungen der craftbaren Kleidung. Die Grundfigur bleibt
    // schlank; erst mit den jeweiligen Items werden Brust- und Knieplatten
    // eingeblendet und die Schuhe als robuste Stiefel dargestellt.
    this.shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(.34, .28, .035), this.outfitMaterials.armor);
    this.shirtPanel.position.set(0, 1.2, -.148);
    this.shirtPanel.castShadow = true;
    this.body.add(this.shirtPanel);
    const addKneePad = (leg) => {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(.13, .14, .035), this.outfitMaterials.armor);
      pad.position.set(0, -.1, -.095);
      pad.castShadow = true;
      leg.shin.add(pad);
      return pad;
    };
    this.kneePadL = addKneePad(this.legL);
    this.kneePadR = addKneePad(this.legR);

    // Arme ----------------------------------------------------------------
    const armLen = 0.3, foreLen = 0.3, armW = 0.12, armD = 0.13;
    const mkArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.27, 1.46, 0);
      const upper = segment(armLen, armW, armD, shirtDark);
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -armLen;
      upper.add(elbow);
      const fore = segment(foreLen, armW * 0.92, armD * 0.92, skin);
      elbow.add(fore);
      const hand = new THREE.Group();
      hand.position.y = -foreLen;
      fore.add(hand);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(armW, 0.11, armD), skin);
      palm.position.y = -0.05;
      palm.castShadow = true;
      hand.add(palm);
      this.body.add(shoulder);
      return { shoulder, elbow, hand, upper };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);
    this.hand = this.armR.hand;   // Werkzeug in der rechten Hand

    this.character = this.body;
    this.setOutfit();
    this.setHeld('hand');
    this.buildNameTag();
  }

  // Schwebendes Namensschild mit Lebensbalken. Ein Canvas-Sprite ist billig,
  // skaliert mit der Distanz und braucht kein DOM-Overlay. Standardmäßig
  // unsichtbar — der lokale Third-Person-Avatar zeigt nie ein Schild.
  buildNameTag() {
    this.nameCanvas = document.createElement('canvas');
    this.nameCanvas.width = 256;
    this.nameCanvas.height = 84;
    this.nameTexture = new THREE.CanvasTexture(this.nameCanvas);
    this.nameTexture.colorSpace = THREE.SRGBColorSpace;
    this.nameTag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.nameTexture, transparent: true, depthWrite: false,
    }));
    this.nameTag.position.y = 2.18;
    this.nameTag.scale.set(1.55, .51, 1);
    this.nameTag.renderOrder = 4;
    this.nameTag.visible = false;
    this.group.add(this.nameTag);
    this._nameTagState = { name: null, hp: -1 };
  }

  setNameTag(name = 'Mitspieler', hp = 100) {
    const shownHp = Math.round(Math.max(0, Math.min(100, hp)));
    if (this._nameTagState.name === name && this._nameTagState.hp === shownHp) return;
    this._nameTagState = { name, hp: shownHp };
    const ctx = this.nameCanvas.getContext('2d');
    const w = this.nameCanvas.width, h = this.nameCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(12,16,13,.62)';
    ctx.beginPath();
    ctx.roundRect(8, 4, w - 16, h - 8, 14);
    ctx.fill();
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2ead8';
    const label = name.length > 16 ? `${name.slice(0, 15)}…` : name;
    ctx.fillText(label, w / 2, 28);
    // Lebensbalken: von grün über gelb nach rot.
    const barX = 34, barW = w - 68, barY = 52, barH = 12;
    ctx.fillStyle = 'rgba(238,230,210,.18)';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 6); ctx.fill();
    if (shownHp > 0) {
      ctx.fillStyle = `hsl(${shownHp * 1.15}, 62%, 46%)`;
      ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(barH, barW * shownHp / 100), barH, 6); ctx.fill();
    }
    this.nameTexture.needsUpdate = true;
  }

  setNameTagVisible(visible) {
    this.nameTag.visible = !!visible;
  }

  buildHeld(id) {
    if (id === 'hand' || !id) return null;
    if (this.heldCache.has(id)) return this.heldCache.get(id);
    const g = new THREE.Group();
    const metal = id === 'metallaxt' || id === 'metallhacke';
    if (id === 'axt' || id === 'metallaxt') {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.66, 8), std(0x6b4a2c, 0.9)));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.04), std(metal ? 0xc0c6cc : 0x9aa0a4, 0.4, metal ? 0.6 : 0.3));
      head.position.set(0.08, 0.27, 0);
      g.add(head);
    } else if (id === 'spitzhacke' || id === 'metallhacke') {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.72, 8), std(0x6b4a2c, 0.9)));
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 6), std(metal ? 0xc0c6cc : 0x9aa0a4, 0.4, metal ? 0.6 : 0.3));
      head.position.set(0, 0.3, 0);
      head.rotation.z = Math.PI / 2;
      g.add(head);
    } else if (id === 'bogen') {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0.16, -0.25, 0),
        new THREE.Vector3(0.2, 0, 0), new THREE.Vector3(0.16, 0.25, 0), new THREE.Vector3(0, 0.5, 0),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.02, 6, false), std(0x8a4d25, 0.75)));
      const stringGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -.5, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, .5, 0),
      ]);
      const bowString = new THREE.Line(stringGeometry, new THREE.LineBasicMaterial({ color: 0xd8d0bd }));
      g.add(bowString);
      g.userData.setDraw = (draw) => {
        const positions = stringGeometry.attributes.position;
        positions.setXYZ(1, 0, 0, draw * .22);
        positions.needsUpdate = true;
      };
    } else if (id === 'fackel') {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.46, 8), std(0x5a3d24, 0.9)));
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a1f, fog: false }));
      flame.scale.set(0.8, 1.5, 0.8);
      flame.position.y = 0.3;
      g.add(flame);
      g.userData.flame = flame;
    } else if (id === 'hammer') {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.6, 8), std(0x6b4a2c, 0.9)));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.11), std(0x9aa0a4, 0.4, 0.3));
      head.position.y = 0.27;
      g.add(head);
    } else if (id === 'angel') {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.018, 0.85, 6), std(0x4f3928, 0.75)));
    } else if (id === 'laterne') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.2, 10), std(0x555b58, 0.4, 0.5));
      g.add(body);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd88a, fog: false }));
      g.add(glow);
    } else {
      // Nicht-Werkzeuge zeigt auch der lokale Spieler nicht in der Hand.
      this.heldCache.set(id, null);
      return null;
    }
    // Griff in die Hand legen und leicht nach vorn kippen, sodass das Werkzeug
    // natürlich aus der Faust ragt statt exakt im Handgelenk zu sitzen.
    const grip = new THREE.Group();
    grip.add(g);
    grip.position.set(0, -0.08, -0.02);
    grip.rotation.set(-0.35, 0, 0);
    grip.userData.setDraw = g.userData.setDraw;
    g.traverse((child) => { if (child.isMesh) child.castShadow = true; });
    this.heldCache.set(id, grip);
    return grip;
  }

  setHeld(id) {
    if (id === this.heldId) return;
    this.heldModel?.userData.setDraw?.(0);
    this.heldId = id;
    if (id !== 'bogen') this.bowDraw = 0;
    if (this.heldModel) this.hand.remove(this.heldModel);
    this.heldModel = this.buildHeld(id);
    this.flames = null;
    if (this.heldModel) {
      this.heldModel.traverse((o) => { if (o.userData && o.userData.flame) this.flames = o.userData.flame; });
      this.hand.add(this.heldModel);
    }
  }

  setBackpack(tier = 'standard') {
    const next = tier === 'expedition' ? 'expedition' : tier === 'large' ? 'large' : 'standard';
    if (this.backpackTier === next) return;
    this.backpackTier = next;
    const large = next !== 'standard';
    const expedition = next === 'expedition';
    const width = expedition ? .5 : large ? .42 : .32;
    const height = expedition ? .72 : large ? .56 : .38;
    const depth = expedition ? .3 : large ? .24 : .16;
    this.backpack.position.set(0, expedition ? 1.19 : large ? 1.21 : 1.25, .14 + depth / 2);
    this.backpackBase.scale.set(width, height, depth);
    this.backpackBase.material = expedition ? this.backpackRoll.material : std(PACK, .95);
    this.backpackFlap.scale.set(width * .88, height * .2, depth * .16);
    this.backpackFlap.position.set(0, height * .28, depth * .51);
    this.backpackPocketL.visible = this.backpackPocketR.visible = large;
    this.backpackPocketL.scale.set(width * .25, height * .31, depth * .72);
    this.backpackPocketR.scale.copy(this.backpackPocketL.scale);
    this.backpackPocketL.position.set(-width * .57, -height * .12, 0);
    this.backpackPocketR.position.set(width * .57, -height * .12, 0);
    this.backpackRoll.visible = expedition;
    this.backpackRoll.scale.set(.13, width * 1.08, .13);
    this.backpackRoll.position.set(0, height * .58, .02);
  }

  setOutfit(outfit = {}) {
    const boots = !!outfit.boots;
    const pants = !!outfit.pants;
    const shirt = !!outfit.shirt;
    const key = `${+boots}${+pants}${+shirt}`;
    if (this.outfitKey === key) return;
    this.outfitKey = key;
    const mats = this.outfitMaterials;
    this.torso.material = shirt ? mats.reinforcedShirt : mats.shirt;
    this.armL.upper.userData.mesh.material = this.armR.upper.userData.mesh.material = shirt ? mats.reinforcedSleeve : mats.shirtDark;
    this.shirtPanel.visible = shirt;
    this.hips.material = pants ? mats.reinforcedPants : mats.pants;
    for (const leg of [this.legL, this.legR]) {
      leg.thigh.userData.mesh.material = leg.shin.userData.mesh.material = pants ? mats.reinforcedPants : mats.pants;
      leg.foot.material = boots ? mats.boots : mats.skin;
      leg.foot.scale.set(boots ? 1.12 : 1, boots ? 1.18 : 1, boots ? 1.08 : 1);
    }
    this.kneePadL.visible = this.kneePadR.visible = pants;
  }

  // Lokaler Third-Person-Avatar: übernimmt swingT des Spielers 1:1 pro Frame.
  setSwing(t) {
    this.swingT = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 1));
    this.swingSelfAdvance = false;
  }

  // Koop-Mitspieler: ein Netzwerk-Paket startet den Hieb, die Animation läuft
  // danach lokal in Echtzeit ab (Pakete kommen zu selten für Frame-Sync).
  startSwing() {
    if (this.swingT >= 1) {
      this.swingT = 0;
      this.swingSelfAdvance = true;
    }
  }

  setBowDraw(value = 0) {
    this.bowDraw = this.heldId === 'bogen' ? Math.max(0, Math.min(1, Number(value) || 0)) : 0;
    this.heldModel?.userData.setDraw?.(this.bowDraw);
  }

  setDead(dead) {
    this.dead = !!dead;
  }

  update(dt, moving, riding = false) {
    const poseBlend = Math.min(1, dt * 9);
    const targetRoll = this.dead ? -Math.PI / 2 : 0;
    this.body.rotation.z += (targetRoll - this.body.rotation.z) * poseBlend;
    this.anim += dt * (moving ? 8.5 : 1.6);
    const t = this.anim;
    if (this.dead) {
      // Körper seitlich am Boden, Gliedmaßen entspannt und keine Idle-/Laufpose.
      this.body.position.y += (.28 - this.body.position.y) * poseBlend;
      this.legL.hip.rotation.x += (.2 - this.legL.hip.rotation.x) * poseBlend;
      this.legR.hip.rotation.x += (-.18 - this.legR.hip.rotation.x) * poseBlend;
      this.legL.knee.rotation.x += (.3 - this.legL.knee.rotation.x) * poseBlend;
      this.legR.knee.rotation.x += (.18 - this.legR.knee.rotation.x) * poseBlend;
      this.armL.shoulder.rotation.x += (.35 - this.armL.shoulder.rotation.x) * poseBlend;
      this.armR.shoulder.rotation.x += (-.25 - this.armR.shoulder.rotation.x) * poseBlend;
      this.armL.elbow.rotation.x += (.25 - this.armL.elbow.rotation.x) * poseBlend;
      this.armR.elbow.rotation.x += (.32 - this.armR.elbow.rotation.x) * poseBlend;
      return;
    }
    if (riding) {
      // Sitzende Fahrradpose: Hüfte auf dem Sattel, Beine an den Pedalen und
      // beide Hände am Lenker statt der normalen Laufanimation.
      this.body.position.y += (.24-this.body.position.y)*poseBlend;
      this.legL.hip.rotation.x += (1.02-this.legL.hip.rotation.x)*poseBlend;
      this.legR.hip.rotation.x += (.82-this.legR.hip.rotation.x)*poseBlend;
      this.legL.knee.rotation.x += (1.42-this.legL.knee.rotation.x)*poseBlend;
      this.legR.knee.rotation.x += (1.62-this.legR.knee.rotation.x)*poseBlend;
      this.armL.shoulder.rotation.x += (1.12-this.armL.shoulder.rotation.x)*poseBlend;
      this.armR.shoulder.rotation.x += (1.12-this.armR.shoulder.rotation.x)*poseBlend;
      this.armL.elbow.rotation.x += (.42-this.armL.elbow.rotation.x)*poseBlend;
      this.armR.elbow.rotation.x += (.42-this.armR.elbow.rotation.x)*poseBlend;
      this.body.rotation.y += (0-this.body.rotation.y)*poseBlend;
      return;
    }
    if (moving) {
      const swing = Math.sin(t) * 0.85;
      // Beine gegengleich, Knie beugen in der Rückschwung-Phase.
      this.legL.hip.rotation.x = swing;
      this.legR.hip.rotation.x = -swing;
      this.legL.knee.rotation.x = Math.max(0, -Math.sin(t)) * 0.9;
      this.legR.knee.rotation.x = Math.max(0, Math.sin(t)) * 0.9;
      // Arme gegengleich zu den Beinen, leicht gebeugt.
      this.armL.shoulder.rotation.x = -swing * 0.7;
      this.armR.shoulder.rotation.x = swing * 0.7;
      this.armL.elbow.rotation.x = 0.3 + Math.max(0, swing) * 0.3;
      this.armR.elbow.rotation.x = 0.3 + Math.max(0, -swing) * 0.3;
      // Leichtes Auf-/Ab-Wippen im Takt der Schritte (doppelte Frequenz).
      this.body.position.y = Math.abs(Math.sin(t)) * 0.05;
    } else {
      // Ruhige Idle-Pose: Arme hängen, dezentes Atmen.
      const breathe = Math.sin(t) * 0.03;
      this.legL.hip.rotation.x = this.legR.hip.rotation.x = 0;
      this.legL.knee.rotation.x = this.legR.knee.rotation.x = 0;
      this.armL.shoulder.rotation.x = this.armR.shoulder.rotation.x = breathe;
      this.armL.elbow.rotation.x = this.armR.elbow.rotation.x = 0.12;
      this.body.position.y = Math.sin(t * 0.8) * 0.008;
    }
    if (this.heldId === 'bogen' && this.bowDraw > 0) {
      // Schusshaltung (positive X-Rotation = Arm nach VORN, Figur blickt −z):
      // Der Bogen sitzt in der rechten Hand — rechter Arm gestreckt nach vorn,
      // der linke zieht die Sehne mit dem Ladefortschritt zum Gesicht zurück.
      this.armR.shoulder.rotation.set(1.5, 0, .08);
      this.armR.elbow.rotation.x = .06;
      this.armL.shoulder.rotation.set(1.15, 0, -.18);
      this.armL.elbow.rotation.x = 1.0 + this.bowDraw * .55;
    }
    // Hieb mit Werkzeug oder Faust: rechter Arm holt nach vorn-oben aus und
    // schlägt nach vorn-unten, der Oberkörper dreht leicht mit.
    if (this.swingSelfAdvance && this.swingT < 1) this.swingT = Math.min(1, this.swingT + dt / 0.32);
    if (this.swingT < 1 && !(this.heldId === 'bogen' && this.bowDraw > 0)) {
      const chop = Math.sin(this.swingT * Math.PI);
      this.armR.shoulder.rotation.x = .35 + chop * 1.5;
      this.armR.shoulder.rotation.z = chop * .12;
      this.armR.elbow.rotation.x = .3 + chop * .6;
      this.body.rotation.y = -chop * .18;
    } else if (!this.dead) {
      this.body.rotation.y += (0 - this.body.rotation.y) * poseBlend;
      this.armR.shoulder.rotation.z = 0;
    }
    // Der linke Arm hält bei gezogenem Werkzeug etwas ruhiger – kosmetisch ok.
    if (this.flames) {
      const s = 0.85 + Math.sin(t * 3) * 0.15;
      this.flames.scale.set(0.8 * s, 1.5 * s, 0.8 * s);
    }
  }

  dispose() {
    this.group.parent?.remove(this.group);
  }
}
