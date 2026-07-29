import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { terrainHeight, WATER_Y, WORLD_RADIUS } from './world.js';

const AXE_MODEL_URL = new URL('../assets/Hatchet 3D Model by zeoxo.glb', import.meta.url).href;
const PICKAXE_MODEL_URL = new URL('../assets/Pickaxe 3D Model.glb', import.meta.url).href;
const TORCH_MODEL_URL = new URL('../assets/Wooden Torch 3D Model.glb', import.meta.url).href;
const MODEL_LOADER = new GLTFLoader();
const MODEL_CACHE = new Map();

function loadModel(url) {
  if (!MODEL_CACHE.has(url)) {
    MODEL_CACHE.set(url, MODEL_LOADER.loadAsync(url).then(({ scene }) => scene));
  }
  return MODEL_CACHE.get(url);
}

function addImportedModel(container, url, setup) {
  return loadModel(url).then((source) => {
    const model = source.clone(true);
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = false;
      if (Array.isArray(child.material)) child.material = child.material.map((material) => material.clone());
      else if (child.material) child.material = child.material.clone();
    });
    setup(model);
    // Setup darf das Modell in einen eigenen Größen-/Ausrichtungs-Pivot
    // hängen. In diesem Fall nicht anschließend wieder herauslösen.
    if (!model.parent) container.add(model);
  }).catch((error) => console.warn(`3D-Modell konnte nicht geladen werden: ${url}`, error));
}

const MATERIALS = new Map();
function std(color, roughness = .9, metalness = 0) {
  const key = `${color}-${roughness}-${metalness}`;
  if (!MATERIALS.has(key)) MATERIALS.set(key, new THREE.MeshStandardMaterial({ color, flatShading: false, roughness, metalness }));
  return MATERIALS.get(key);
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
    this.maxHp = 100;
    this.hp = 100;
    this.hunger = 100;
    this.thirst = 100;
    this.warmth = 100;
    this.oxygen = 100;
    this.maxStamina = 100;
    this.stamina = 100;
    this.moveSpeedMultiplier = 1;
    this.exhausted = false;
    this.keys = {};
    this.vel = new THREE.Vector3();
    this.bobT = 0;
    this.swingT = 1;
    this.attackCd = 0;
    this.bowDrawing = false;
    this.bowDraw = 0;
    // Spann-Dauer bis Vollauszug und Nachschuss-Pause in Sekunden; die
    // geflochtene Sehne (Upgrade) senkt beide Werte via main.js.
    this.bowDrawTime = 0.7;
    this.bowShotCooldown = 0.25;
    this.obstacleSets = []; // Arrays von {x,z,r, res?}
    this.platforms = []; // Begehbare Oberseiten: {x,z,r,y}
    this.platformSets = [this.platforms];
    this.sprinting = false;
    this.swimming = false;
    this.underwater = false;
    this.touchInput = null;
    this.onDamage = null;
    this.onExhausted = null;
    this.perspective = 'first';
    this.thirdPersonDistance = 4.2;
    this._cameraArm = 1;
    this._cameraTarget = new THREE.Vector3();
    this._cameraDesired = new THREE.Vector3();
    this._cameraOffset = new THREE.Vector3();
    this._cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    this.buildHeld();

    addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    this.canLook = null;
    this.allowUnlockedLook = false; // nur aktiv, wenn Pointer-Lock wirklich nicht verfügbar ist
    this.ignoreLookUntil = 0;
    addEventListener('mousemove', (e) => {
      // UI-Zustände (Auswahlrad, Karte, Crafting) sperren den Kamerablick auch
      // dann, wenn der Browser den Mauszeiger noch eingefangen hat.
      if (this.canLook && !this.canLook()) return;
      if (performance.now() < this.ignoreLookUntil) return;
      if (!document.pointerLockElement && !this.allowUnlockedLook) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
    });
  }

  buildHeld() {
    this.heldModelLoads = [];
    // Gemeinsamer Schulter-Pivot knapp außerhalb des rechten Bildrands. Alle
    // First-Person-Modelle liegen relativ zu diesem Punkt, sodass Schwünge wie
    // eine Armbewegung wirken und nicht mehr um die Werkzeugmitte rotieren.
    this.held = new THREE.Group();
    this.heldRest = new THREE.Vector3(.48, -.36, -.38);
    this.held.position.copy(this.heldRest);
    this.cam.add(this.held);

    const mk = (buildFn) => {
      const model = buildFn();
      const anchor = new THREE.Group();
      // Bewahrt die bisherige Bildposition, verschiebt aber den tatsächlichen
      // Rotationsursprung an die Schulter.
      anchor.position.set(-.06, -.02, -.37);
      anchor.add(model);
      Object.assign(anchor.userData, model.userData);
      anchor.visible = false;
      this.held.add(anchor);
      return anchor;
    };
    const addHeldImportedModel = (container, url, setup) => {
      const load = addImportedModel(container, url, setup);
      this.heldModelLoads.push(load);
      return load;
    };

    const skin = std(0xdca06b, .82);
    const skinLight = std(0xe7b27d, .78);
    const roundedSegment = (radius, length, material = skin, radialSegments = 10) => (
      new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, radialSegments), material)
    );
    const segmentDirection = new THREE.Vector3();
    const segmentUp = new THREE.Vector3(0, 1, 0);
    const setSegment = (mesh, start, end) => {
      const direction = segmentDirection.subVectors(end, start);
      const length = direction.length();
      mesh.position.copy(start).add(end).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(segmentUp, direction.multiplyScalar(1 / length));
      mesh.scale.y = length;
    };

    const curvedTube = (points, radius, material, tubularSegments = 12, radialSegments = 8) => {
      const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z = 0]) => new THREE.Vector3(x, y, z)));
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false), material);
      mesh.castShadow = true;
      return mesh;
    };

    const flameDrop = (height, radius, color, opacity = .9) => {
      const profile = [
        [0, 0], [.58, .025], [1, .17], [.9, .4],
        [.58, .66], [.22, .88], [0, 1],
      ].map(([x, y]) => new THREE.Vector2(x * radius, y * height));
      const mesh = new THREE.Mesh(
        new THREE.LatheGeometry(profile, 14),
        new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity, depthWrite: false })
      );
      mesh.userData.baseScale = mesh.scale.clone();
      return mesh;
    };

    const addLeatherWrap = (g, x, y, z, count = 5, radius = .048, spacing = .018, rotationZ = 0) => {
      for (let i = 0; i < count; i++) {
        const wrap = new THREE.Mesh(new THREE.TorusGeometry(radius, .004, 4, 10), std(0x5a3927, .98));
        wrap.position.set(x, y + (i - (count - 1) / 2) * spacing, z);
        wrap.rotation.set(Math.PI / 2, 0, rotationZ);
        g.add(wrap);
      }
    };

    const addGrip = (g) => {
      const gripHand = new THREE.Group();
      gripHand.position.set(-.08, -.14, .015);
      gripHand.rotation.z = -.42;
      const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 11, 8), skin);
      palm.scale.set(.075, .105, .066);
      gripHand.add(palm);
      for (let i = 0; i < 4; i++) {
        const finger = roundedSegment(.019, .055, i === 0 ? skinLight : skin, 8);
        finger.position.set(-.045 + i * .03, -.015, -.065);
        finger.rotation.x = .65;
        gripHand.add(finger);
      }
      const thumb = roundedSegment(.024, .065, skinLight, 8);
      thumb.position.set(.073, .018, -.015);
      thumb.rotation.z = -.82;
      gripHand.add(thumb);
      g.add(gripHand);
    };

    const buildLowPolyHand = () => {
      const g = new THREE.Group();
      // Warme, nicht orangestichige Hauttöne. Der dunklere Ton sitzt an
      // Unterarm und Handunterseite und gibt der Faust Tiefe, ohne dass dafür
      // Ambient Occlusion nötig wäre.
      const polySkin = new THREE.MeshStandardMaterial({ color: 0xc98f63, roughness: .88, metalness: 0, flatShading: true });
      const polySkinShadow = new THREE.MeshStandardMaterial({ color: 0xa9714b, roughness: .93, metalness: 0, flatShading: true });
      const handGeo = new THREE.DodecahedronGeometry(1, 0);
      const segmentGeo = new THREE.CylinderGeometry(.76, 1, 1, 6, 1);
      const up = new THREE.Vector3(0, 1, 0);
      const direction = new THREE.Vector3();

      const polyPart = (scale, position, material = polySkin) => {
        const part = new THREE.Mesh(handGeo, material);
        part.scale.copy(scale);
        part.position.copy(position);
        part.castShadow = true;
        g.add(part);
        return part;
      };
      const segment = (start, end, radius, material = polySkin) => {
        const part = new THREE.Mesh(segmentGeo, material);
        direction.subVectors(end, start);
        const length = direction.length();
        part.position.copy(start).add(end).multiplyScalar(.5);
        part.quaternion.setFromUnitVectors(up, direction.normalize());
        part.scale.set(radius, length, radius);
        part.castShadow = true;
        g.add(part);
        return part;
      };
      // Fingerglied als Kapsel. Eine eigene Geometrie pro Glied kostet beim
      // Aufbau nichts (es sind ein gutes Dutzend) und vermeidet die
      // verzerrten Kappen, die eine skalierte Einheitskapsel hätte.
      const bone = (start, end, radius, material = polySkin) => {
        direction.subVectors(end, start);
        const length = Math.max(.001, direction.length());
        const part = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 2, 7), material);
        part.position.copy(start).add(end).multiplyScalar(.5);
        part.quaternion.setFromUnitVectors(up, direction.normalize());
        part.castShadow = true;
        g.add(part);
        return part;
      };

      // Der Unterarm beginnt weit außerhalb der rechten unteren Bildecke. So
      // kann sein abgeschnittenes Ende auch bei hohen FOVs nie sichtbar werden.
      const armStart = new THREE.Vector3(.55, -.68, .3);
      const wrist = new THREE.Vector3(.035, -.075, -.075);
      segment(armStart, wrist, .145, polySkinShadow);

      // Rechte Faust. Vorher waren Handfläche und Finger je ein skalierter
      // Dodekaeder — aus der Nähe las sich das als Kartoffel. Jetzt trägt die
      // Handfläche eine echte Knöchelreihe mit vier einzeln gekrümmten
      // Fingern; die Silhouette ist dadurch als Faust lesbar.
      const palm = polyPart(new THREE.Vector3(.148, .132, .124), new THREE.Vector3(-.005, .022, -.155));
      palm.rotation.set(-.06, .06, -.025);

      // Zeigefinger (0) bis kleiner Finger (3). Reichweite und Dicke nehmen
      // zur Handaußenseite hin ab, sonst wirkt die Faust wie ein Block.
      const reach = [1.0, 1.06, .99, .88];
      const thickness = [.027, .028, .025, .021];
      for (let i = 0; i < 4; i++) {
        const x = -.072 + i * .048;
        const r = reach[i];
        const knuckle = new THREE.Vector3(x, .074, -.216);
        const mid = new THREE.Vector3(x, .034, -.216 - .058 * r);
        const tip = new THREE.Vector3(x, -.028, -.204 - .046 * r);
        bone(knuckle, mid, thickness[i]);
        bone(mid, tip, thickness[i] * .88, polySkinShadow);
        // Knöchel als eigener kleiner Körper: fängt das Sonnenlicht und macht
        // die Faust auch im Gegenlicht lesbar.
        const knob = polyPart(new THREE.Vector3(.030, .026, .028), knuckle);
        knob.rotation.set(.3, i * .7, .2);
      }

      // Daumen liegt quer über den Fingern — das macht die Handseite eindeutig.
      const thumbBase = new THREE.Vector3(-.098, -.002, -.142);
      const thumbKnuckle = new THREE.Vector3(-.122, .042, -.202);
      const thumbTip = new THREE.Vector3(-.07, .062, -.243);
      bone(thumbBase, thumbKnuckle, .036);
      bone(thumbKnuckle, thumbTip, .031, polySkinShadow);

      g.rotation.set(-.06, -.055, -.035);
      g.position.set(.005, -.005, .025);
      g.userData.fist = palm;
      return g;
    };

    const tuneImportedMaterial = (material, metal = false) => {
      if (!material) return;
      // Texturen der gelieferten Modelle bleiben vollständig erhalten. Die
      // PBR-Werte werden nur leicht auf die Spielbeleuchtung abgestimmt.
      material.roughness = metal ? .42 : Math.max(.62, material.roughness ?? .8);
      material.metalness = metal ? .38 : Math.min(.18, material.metalness ?? 0);
    };

    // Schmückt die Metall-Varianten: Lederwicklung am Griff, Stahlzwinge
    // unter dem Kopf und ein Knauf am Stielende. Die Positionen sind aus den
    // vermessenen GLB-Bounds im Halte-Koordinatensystem abgeleitet.
    // Ohne Environment-Map wirkt hohe Metalness schwarz — daher helle
    // Grundfarben mit moderater Metalness für den Stahl-Look.
    const metalLeather = std(0x3a2a1e, .95);
    const metalSteel = std(0xa8b4bd, .34, .45);
    const metalThread = std(0x8a6a3f, .85);
    const addMetalAccents = (g, { grip, collar, pommel }) => {
      for (let i = 0; i < grip.count; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(grip.r, grip.tube, 5, 12), metalLeather);
        ring.position.set(grip.x, grip.y0 + i * grip.step, grip.z);
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
      }
      // Je ein heller Zierfaden schließt die Wicklung oben und unten ab.
      for (const y of [grip.y0 - grip.step * .7, grip.y0 + grip.count * grip.step]) {
        const seam = new THREE.Mesh(new THREE.TorusGeometry(grip.r * .96, grip.tube * .55, 4, 12), metalThread);
        seam.position.set(grip.x, y, grip.z);
        seam.rotation.x = Math.PI / 2;
        g.add(seam);
      }
      const band = new THREE.Mesh(new THREE.CylinderGeometry(collar.r, collar.r * 1.08, collar.h, 10), metalSteel);
      band.position.set(collar.x, collar.y, collar.z);
      g.add(band);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(pommel.r * .82, pommel.r, pommel.h, 10), metalSteel);
      knob.position.set(pommel.x, pommel.y, pommel.z);
      g.add(knob);
    };

    const buildImportedAxe = (metal = false) => {
      const g = new THREE.Group();
      addHeldImportedModel(g, AXE_MODEL_URL, (model) => {
        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        model.position.set(-center.x, 0, -center.z);
        model.traverse((child) => {
          if (!child.isMesh) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            tuneImportedMaterial(material, metal && material?.name !== 'mat20');
            // mat17 ist der Axtkopf: Bei der Metallaxt hellt er zu poliertem
            // Stahl auf, damit das Upgrade auf einen Blick erkennbar ist.
            if (metal && material?.name === 'mat17') {
              material.color.lerp(new THREE.Color(0xd3dde5), .68);
              material.roughness = .3;
              material.metalness = .5;
            }
          });
        });

        const orientation = new THREE.Group();
        orientation.add(model);
        // Die Rohdatei zeigt mit der Schneide nach rechts. Um 90° um Y gedreht
        // blickt die Axt jetzt gerade nach vorn in die Spielwelt.
        orientation.scale.setScalar(.95);
        orientation.rotation.set(0, Math.PI / 2, -.035);
        orientation.position.set(.025, .14, -.035);
        g.add(orientation);
        if (metal) addMetalAccents(g, {
          grip: { x: .015, z: .034, y0: -.3, step: .026, count: 6, r: .046, tube: .009 },
          collar: { x: .027, z: .041, y: .175, r: .05, h: .06 },
          pommel: { x: .02, z: .038, y: -.345, r: .048, h: .05 },
        });
      });
      return g;
    };

    const buildImportedPickaxe = (metal = false) => {
      const g = new THREE.Group();
      addHeldImportedModel(g, PICKAXE_MODEL_URL, (model) => {
        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        model.position.x = -center.x;
        model.traverse((child) => {
          if (!child.isMesh) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => tuneImportedMaterial(material, metal));
        });

        // Zwei getrennte Pivots erzwingen die richtige Reihenfolge: Das GLB
        // liegt mit dem Stiel auf Z, daher zuerst Z nach unten auf Y klappen.
        // Erst danach wird der bereits aufrechte Pickel nach vorn gedreht.
        const axisFix = new THREE.Group();
        axisFix.rotation.x = Math.PI / 2;
        axisFix.add(model);
        const orientation = new THREE.Group();
        orientation.add(axisFix);
        // Das GLB besitzt intern bereits eine 100×-Skalierung. 0,43 ergibt die
        // korrekte First-Person-Größe. Etwa 76° nach rechts lassen die Spitze
        // nach vorn zeigen, ohne den kompletten Kopf optisch verschwinden zu lassen.
        orientation.scale.setScalar(.43);
        orientation.rotation.set(0, Math.PI * .42, -.025);
        orientation.position.set(.02, .32, -.025);
        g.add(orientation);
        if (metal) {
          addMetalAccents(g, {
            grip: { x: .017, z: -.012, y0: -.3, step: .024, count: 6, r: .032, tube: .008 },
            collar: { x: .02, z: -.028, y: .3, r: .037, h: .055 },
            pommel: { x: .016, z: -.008, y: -.36, r: .035, h: .045 },
          });
        }
      });
      return g;
    };

    const buildImportedTorch = () => {
      const g = new THREE.Group();
      addHeldImportedModel(g, TORCH_MODEL_URL, (model) => {
        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -bounds.min.y, -center.z);
        model.traverse((child) => {
          if (!child.isMesh) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            if (!material) continue;
            // Die gelbe GLB-Flamme ist unbeweglich. Sie wird ausgeblendet und
            // durch unsere animierte, vom Fackelzustand abhängige Flamme ersetzt.
            if (material.name === 'Yellow') {
              material.visible = false;
              continue;
            }
            material.roughness = material.name === 'DarkWood' ? .88 : .72;
            material.metalness = material.name === 'DarkWood' ? .04 : .1;
          }
        });

        const orientation = new THREE.Group();
        orientation.add(model);
        orientation.scale.setScalar(.34);
        orientation.rotation.z = -.36;
        orientation.position.set(-.15, -.39, 0);
        g.add(orientation);

        // Die Flamme wird an der echten Oberkante des importierten Kopfes
        // verankert. Dadurch bleibt sie auch bei späteren Modell-/Skalierungs-
        // Änderungen exakt auf der Fackel statt an einer geschätzten Position.
        g.updateWorldMatrix(true, true);
        const headBounds = new THREE.Box3();
        const visibleBounds = new THREE.Box3();
        model.traverse((child) => {
          if (!child.isMesh) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          if (materials.some((material) => material?.name !== 'Yellow')) visibleBounds.expandByObject(child, true);
          if (materials.some((material) => material?.name === 'LightGrey')) headBounds.expandByObject(child, true);
        });
        const anchorBounds = headBounds.isEmpty() ? visibleBounds : headBounds;
        const flameAnchor = anchorBounds.getCenter(new THREE.Vector3());
        flameAnchor.y = anchorBounds.max.y;
        g.worldToLocal(flameAnchor);
        flames.position.copy(flameAnchor);
        flames.position.y += .008;
        flames.visible = true;
      });

      const flames = new THREE.Group();
      flames.visible = false;
      flames.scale.setScalar(.66);
      const outer = flameDrop(.36, .115, 0xff5518, .84);
      const side = flameDrop(.23, .065, 0xff7a1f, .87);
      side.position.set(-.052, .018, .008);
      side.rotation.z = .25;
      const middle = flameDrop(.27, .078, 0xffa52b, .9);
      middle.position.set(.012, .018, -.012);
      middle.rotation.z = -.08;
      const core = flameDrop(.17, .045, 0xffd94b, .95);
      core.position.set(.008, .035, -.025);
      core.rotation.z = .08;
      flames.add(outer, side, middle, core);
      g.add(flames);
      g.userData.flames = flames;
      return g;
    };

    this.heldModels = {
      hand: mk(() => buildLowPolyHand()),
      axt: mk(() => buildImportedAxe(false)),
      spitzhacke: mk(() => buildImportedPickaxe(false)),
      bogen: mk(() => {
        const g = new THREE.Group();
        const bowWood = std(0x8a4d25, .72);
        const bowEdge = std(0x4f2c1d, .82);
        const leather = std(0x33231c, .96);

        // Echte Kurven statt zweier gerader Stäbe: leichte Recurve-Silhouette
        // mit dunkler Laminierung an der Innenseite.
        for (const s of [-1, 1]) {
          const points = [
            new THREE.Vector3(0, s * .075, 0),
            new THREE.Vector3(-.015, s * .25, -.025),
            new THREE.Vector3(.018, s * .45, .015),
            new THREE.Vector3(.065, s * .61, .115),
          ];
          const curve = new THREE.CatmullRomCurve3(points);
          const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, .026, 7, false), bowWood);
          limb.castShadow = true;
          g.add(limb);
          const insetPoints = points.map((p) => p.clone().add(new THREE.Vector3(-.013, 0, .008)));
          const inset = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(insetPoints), 12, .008, 5, false), bowEdge);
          g.add(inset);
        }

        const riser = new THREE.Mesh(new THREE.CylinderGeometry(.035, .043, .205, 10), bowEdge);
        riser.position.y = 0;
        g.add(riser);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(.047, .047, .145, 12), leather);
        g.add(grip);
        // Feine Griffwicklung.
        for (let i = -3; i <= 3; i++) {
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(.048, .004, 4, 12), std(0x6b4932, .95));
          wrap.position.y = i * .019;
          wrap.rotation.x = Math.PI / 2;
          g.add(wrap);
        }

        // Die Sehne besteht aus zwei Segmenten und kann beim Schuss sichtbar
        // zum Nockpunkt gezogen werden.
        const stringGeo = new THREE.CylinderGeometry(.0032, .0032, 1, 5);
        const stringMat = std(0xd8d0bd, .78);
        const stringUpper = new THREE.Mesh(stringGeo, stringMat);
        const stringLower = new THREE.Mesh(stringGeo, stringMat);
        g.add(stringUpper, stringLower);
        const topTip = new THREE.Vector3(.065, .61, .115);
        const bottomTip = new THREE.Vector3(.065, -.61, .115);
        const nock = new THREE.Vector3(0, 0, .135);
        setSegment(stringUpper, topTip, nock);
        setSegment(stringLower, nock, bottomTip);
        // Aufgelegter Pfeil
        const arrow = new THREE.Group();
        const ashaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.78, 8), std(0x9a7044, .78));
        ashaft.rotation.x = Math.PI / 2;
        ashaft.position.set(0, 0, -0.2);
        arrow.add(ashaft);
        const ahead = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.105, 6), std(0xb8bec6, .48, .3));
        ahead.rotation.x = -Math.PI / 2;
        ahead.position.set(0, 0, -0.64);
        arrow.add(ahead);
        for (const side of [-1, 1]) {
          const feather = new THREE.Mesh(new THREE.BoxGeometry(.055, .006, .115), std(side < 0 ? 0x7d3028 : 0xd8c6a4, .88));
          feather.position.set(side * .026, 0, .145);
          feather.rotation.y = side * .15;
          arrow.add(feather);
        }
        arrow.position.z = .135;
        g.add(arrow);

        // --- Sichtbare Bogen-Upgrades -------------------------------------
        // Wickelringe an beiden Wurfarm-Enden: gehören zur geflochtenen Sehne.
        const tipWraps = new THREE.Group();
        tipWraps.visible = false;
        for (const s of [-1, 1]) {
          const dir = new THREE.Vector3(.047, s * .16, .1).normalize();
          for (const t of [0, 1]) {
            const wrapRing = new THREE.Mesh(new THREE.TorusGeometry(.03, .007, 4, 10), std(0xe8dbb8, .8));
            wrapRing.position.set(.0415 + dir.x * t * .022, s * .53 + dir.y * t * .022, .065 + dir.z * t * .022);
            wrapRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            tipWraps.add(wrapRing);
          }
        }
        g.add(tipWraps);
        // Dritte, obenliegende Feder für die Präzisionsschäfte.
        const thirdFeather = new THREE.Mesh(new THREE.BoxGeometry(.006, .055, .115), std(0xe8dcc0, .88));
        thirdFeather.position.set(0, .026, .145);
        thirdFeather.visible = false;
        arrow.add(thirdFeather);
        // Messing-Nockring des Jagdköchers am Pfeilende.
        const nockRing = new THREE.Mesh(new THREE.TorusGeometry(.014, .005, 5, 10), std(0xb08d4a, .35, .7));
        nockRing.position.set(0, 0, .185);
        nockRing.visible = false;
        arrow.add(nockRing);

        g.userData.applyUpgrades = ({ sehne, spitzen, schaefte, koecher }) => {
          // Geflochtene Sehne: heller, dicker, mit Abschlusswicklungen.
          stringMat.color.set(sehne ? 0xf2ead2 : 0xd8d0bd);
          for (const string of [stringUpper, stringLower]) string.scale.x = string.scale.z = sehne ? 1.8 : 1;
          tipWraps.visible = !!sehne;
          // Eisenspitzen: polierter, größerer Pfeilkopf.
          ahead.material.color.set(spitzen ? 0xeaf0f5 : 0xb8bec6);
          ahead.material.roughness = spitzen ? .3 : .48;
          ahead.material.metalness = spitzen ? .35 : .3;
          ahead.scale.setScalar(spitzen ? 1.18 : 1);
          // Präzisionsschäfte: heller, glatter Schaft plus dritte Feder.
          ashaft.material.color.set(schaefte ? 0xd3ba85 : 0x9a7044);
          ashaft.material.roughness = schaefte ? .58 : .78;
          thirdFeather.visible = !!schaefte;
          nockRing.visible = !!koecher;
        };

        g.userData.arrow = arrow;
        g.userData.stringUpper = stringUpper;
        g.userData.stringLower = stringLower;
        g.userData.topTip = topTip;
        g.userData.bottomTip = bottomTip;
        g.userData.nock = nock;
        g.userData.setDraw = (z) => {
          if (Math.abs(nock.z - z) < .0001) return;
          nock.z = z;
          setSegment(stringUpper, topTip, nock);
          setSegment(stringLower, nock, bottomTip);
        };
        // Bogen aufrecht, leicht zur Seite gekippt in der linken Hand
        g.rotation.set(0, .18, .045);
        g.position.set(-.08, .02, 0);
        return g;
      }),
      fackel: mk(() => buildImportedTorch()),
      hammer: mk(() => {
        const g = new THREE.Group();
        const iron = std(0x92999b,.48,.28);
        g.add(curvedTube([[-.17,-.37,0],[-.08,-.14,0],[.02,.08,-.004],[.11,.3,0]],.039,std(0x7b4b2a,.9),14,10));
        addLeatherWrap(g,-.12,-.27,0,5,.044,.017,-.1);
        const eye = new THREE.Mesh(new THREE.CylinderGeometry(.072,.066,.19,10),std(0x62696b,.58,.25));
        eye.position.set(.12,.32,0); eye.rotation.z = Math.PI/2; g.add(eye);
        const head = new THREE.Mesh(new THREE.BoxGeometry(.31,.15,.17,3,2,2),iron);
        head.position.set(.22,.33,0); head.rotation.z = -.03; g.add(head);
        const face = new THREE.Mesh(new THREE.CylinderGeometry(.105,.092,.12,10),std(0xb8bec0,.36,.4));
        face.position.set(.43,.32,0);
        face.rotation.z = Math.PI / 2;
        g.add(face);
        // Gespaltener Zimmermannsklauen-Kopf auf der Rückseite.
        for (const z of [-.045,.045]) {
          const claw = curvedTube([[.06,.34,z],[-.07,.36,z],[-.17,.28,z]],.027,iron,8,7);
          g.add(claw);
        }
        addGrip(g);
        g.rotation.y = Math.PI / 2;
        return g;
      }),
      angel: mk(() => {
        const g = new THREE.Group();
        const rod = curvedTube([[-.16,-.38,0],[-.055,-.1,0],[.075,.23,-.015],[.14,.52,-.07],[.12,.77,-.17]],.018,std(0x4f3928,.72),18,8);
        g.add(rod);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(.035,.042,.27,10),std(0x30271f,.96));
        grip.position.set(-.11,-.26,0); grip.rotation.z = -.36; g.add(grip);
        addLeatherWrap(g,-.11,-.26,0,6,.04,.018,-.08);
        const reel = new THREE.Group(); reel.position.set(-.005,-.035,.075);
        const spool = new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.055,12),std(0x8b9294,.42,.5));
        spool.rotation.x = Math.PI/2; reel.add(spool);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(.078,.01,6,16),std(0xb5bbbd,.36,.5));
        reel.add(rim);
        const crank = curvedTube([[.065,0,.01],[.11,-.025,.02],[.125,-.07,.02]],.009,std(0x747b7d,.42,.4),6,6);
        reel.add(crank); g.add(reel);
        const lineMat = std(0xd5d2c4,.65);
        for (const [x,y,z] of [[.03,.12,-.01],[.09,.34,-.04],[.13,.57,-.09]]) {
          const guide = new THREE.Mesh(new THREE.TorusGeometry(.025,.004,5,10),std(0x969d9f,.4,.45));
          guide.position.set(x,y,z); guide.rotation.y = Math.PI/2; g.add(guide);
        }
        const line = curvedTube([[.005,-.01,.09],[.03,.12,.015],[.09,.34,-.015],[.13,.57,-.065],[.12,.77,-.16]],.0025,lineMat,16,4);
        g.add(line); addGrip(g); g.rotation.y = .2;
        return g;
      }),
      laterne: mk(() => {
        const g = new THREE.Group();
        const metal = std(0x555b58,.4,.62);
        const glass = new THREE.MeshStandardMaterial({color:0xffd88a,roughness:.18,metalness:0,transparent:true,opacity:.22,emissive:0xff8b35,emissiveIntensity:.18,depthWrite:false});
        const body = new THREE.Group(); body.position.set(.09,.13,0);
        const globe = new THREE.Mesh(new THREE.CylinderGeometry(.105,.115,.25,14),glass); body.add(globe);
        for (const y of [-.14,.14]) {
          const rim = new THREE.Mesh(new THREE.TorusGeometry(.115,.012,6,16),metal); rim.position.y=y; rim.rotation.x=Math.PI/2; body.add(rim);
        }
        for (const a of [0,Math.PI/2]) {
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.31,6),metal); bar.rotation.z=a; body.add(bar);
        }
        const cap = new THREE.Mesh(new THREE.ConeGeometry(.13,.09,12),metal); cap.position.y=.185; body.add(cap);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(.125,.105,.075,12),metal); base.position.y=-.175; body.add(base);
        const flame = new THREE.Group();
        const outer = new THREE.Mesh(new THREE.SphereGeometry(1,9,7),new THREE.MeshBasicMaterial({color:0xff8b2d,fog:false,transparent:true,opacity:.8}));
        outer.scale.set(.042,.095,.04); outer.userData.baseScale=outer.scale.clone(); outer.position.y=-.045; flame.add(outer);
        const inner = new THREE.Mesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial({color:0xffed9a,fog:false}));
        inner.scale.set(.021,.055,.02); inner.userData.baseScale=inner.scale.clone(); inner.position.y=-.035; flame.add(inner); body.add(flame); g.add(body);
        const handle = curvedTube([[-.13,-.36,0],[-.04,-.15,.005],[.015,-.02,0],[.09,.31,0]],.026,std(0x3d3026,.94),14,8);
        g.add(handle); addGrip(g); g.userData.flames = flame;
        return g;
      }),
      metallaxt: mk(() => buildImportedAxe(true)),
      metallhacke: mk(() => buildImportedPickaxe(true)),
    };
    this.heldModels.hand.visible = true;
    this.heldModelsReady = Promise.allSettled(this.heldModelLoads);
  }

  // Blendet die sichtbaren Bogen-Upgrades passend zum Inventar ein.
  updateBowUpgrades(inv = {}) {
    this.heldModels.bogen?.userData.applyUpgrades?.({
      sehne: (inv.bogensehne || 0) > 0,
      spitzen: (inv.eisenspitzen || 0) > 0,
      schaefte: (inv.praezisionsschaefte || 0) > 0,
      koecher: (inv.jagdkoecher || 0) > 0,
    });
  }

  setHeld(itemId) {
    if (itemId !== 'bogen') this.cancelBowDraw();
    this.heldId = itemId;
    const visibleId = itemId;
    for (const [k, m] of Object.entries(this.heldModels)) {
      m.visible = k === visibleId;
    }
    if (!this.heldModels[itemId]) this.heldModels.hand.visible = false;
  }

  swing() {
    if (this.attackCd > 0) return false;
    this.attackCd = 0.42;
    this.swingT = 0;
    return true;
  }

  beginBowDraw() {
    if (this.heldId !== 'bogen' || this.attackCd > 0 || this.bowDrawing) return false;
    this.bowDrawing = true;
    this.bowDraw = 0;
    this.swingT = 1;
    return true;
  }

  releaseBowDraw() {
    if (!this.bowDrawing) return null;
    const power = this.bowDraw;
    this.bowDrawing = false;
    this.bowDraw = 0;
    this.attackCd = this.bowShotCooldown;
    return power;
  }

  cancelBowDraw() {
    this.bowDrawing = false;
    this.bowDraw = 0;
  }

  damage(n, cause = null) {
    // Prozentual statt flach: Eine feste Absorption würde schwaches Wild
    // harmlos machen und wäre gegen Tier-12-Gegner trotzdem wirkungslos.
    // Der Mindestschaden von 1 verhindert vollständige Immunität.
    const taken = Math.max(1, Math.round(n * (1 - (this.armorReduction || 0))));
    this.hp = Math.max(0, this.hp - taken);
    if (this.onDamage) this.onDamage(taken, cause);
  }

  setPerspective(mode) {
    this.perspective = mode === 'third' ? 'third' : 'first';
    this.held.visible = this.perspective === 'first';
    this.updateCamera(0);
  }

  nearestCavePlatform(x, z, playerY = null) {
    let nearest = null;
    let nearestScore = Infinity;
    for (const platforms of this.platformSets) for (const platform of platforms) {
      if (!platform.overrideTerrain || (playerY != null && playerY < platform.y - .45)) continue;
      const distance = Math.hypot(x - platform.x, z - platform.z);
      if (distance > platform.r) continue;
      const score = distance / platform.r;
      if (score < nearestScore) { nearest = platform; nearestScore = score; }
    }
    return nearest;
  }

  cameraFloorAt(x, z) {
    const cavePlatform = this.nearestCavePlatform(x, z);
    let floor = cavePlatform?.y ?? terrainHeight(x, z);
    for (const platforms of this.platformSets) for (const platform of platforms) {
      if (!platform.overrideTerrain && this.pos.y >= platform.y - .45 && Math.hypot(x - platform.x, z - platform.z) <= platform.r) {
        floor = Math.max(floor, platform.y);
      }
    }
    return floor;
  }

  updateCamera(dt, bob = 0) {
    if (this.perspective === 'first') {
      this.cam.position.set(this.pos.x, this.pos.y + 1.65 + bob, this.pos.z);
      this.cam.rotation.set(this.pitch, this.yaw, 0);
      return;
    }

    // Schulterkamera: Der Versatz liegt in lokalen Kameraachsen und folgt
    // dadurch sowohl horizontalem als auch vertikalem Umsehen.
    this._cameraTarget.set(this.pos.x, this.pos.y + 1.35, this.pos.z);
    this._cameraEuler.set(this.pitch, this.yaw, 0);
    this._cameraOffset.set(.55, .48, this.thirdPersonDistance).applyEuler(this._cameraEuler);
    this._cameraDesired.copy(this._cameraTarget).add(this._cameraOffset);

    // Kamera bei Hügeln, Wänden und Bäumen näher an die Schulter ziehen. Das
    // verhindert den häufigsten Third-Person-Fehler: durch Geometrie schauen.
    let safeFraction = 1;
    for (let i = 2; i <= 12; i++) {
      const fraction = i / 12;
      const x = THREE.MathUtils.lerp(this._cameraTarget.x, this._cameraDesired.x, fraction);
      const y = THREE.MathUtils.lerp(this._cameraTarget.y, this._cameraDesired.y, fraction);
      const z = THREE.MathUtils.lerp(this._cameraTarget.z, this._cameraDesired.z, fraction);
      let blocked = y < this.cameraFloorAt(x, z) + .28;
      if (!blocked) {
        for (const set of this.obstacleSets) {
          if (set.some((o) => (!o.res || o.res.alive) && Math.hypot(x - o.x, z - o.z) < o.r + .18)) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) { safeFraction = Math.max(.18, (i - 2) / 12); break; }
    }
    // Die Kamera folgt dem Spieler starr — jede Glättung der Position selbst
    // ließ sie beim Laufen sichtbar hinterherziehen. Geglättet wird nur noch
    // die Armlänge: bei Hindernissen sofort einziehen (nie clippen), danach
    // weich wieder ausfahren, damit nichts ruckartig aufpoppt.
    if (safeFraction <= this._cameraArm || dt <= 0) this._cameraArm = safeFraction;
    else this._cameraArm += (safeFraction - this._cameraArm) * (1 - Math.exp(-dt * 7));
    this._cameraDesired.lerpVectors(this._cameraTarget, this._cameraDesired, this._cameraArm);
    this._cameraDesired.y = Math.max(this._cameraDesired.y, this.cameraFloorAt(this._cameraDesired.x, this._cameraDesired.z) + .28);
    this.cam.position.copy(this._cameraDesired);
    this.cam.rotation.set(this.pitch, this.yaw, 0);
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
      if (this.stamina <= 0 && !this.exhausted) {
        this.exhausted = true;
        this.onExhausted?.();
      }
    } else {
      const recovery = this.hunger > 20 ? 17 : 9;
      this.stamina = Math.min(this.maxStamina, this.stamina + recovery * dt);
    }

    // vorwärts = -Z in Kamerarichtung, rechts = +X
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let dx = (-sin) * f + cos * s;
    let dz = (-cos) * f + (-sin) * s;

    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }

    // In Hoehlen kann ein kuenstlicher Boden unter dem sichtbaren Terrain
    // liegen. Fuer Wasser/Schwimmen muss dieser Boden bereits hier gelten;
    // sonst behandelt die Physik einen gefluteten Tunnel weiterhin als Berg.
    const cavePlatform = this.nearestCavePlatform(this.pos.x, this.pos.z);
    const groundH = cavePlatform?.y ?? terrainHeight(this.pos.x, this.pos.z);
    const inDryCave = !!cavePlatform?.dry;
    const waterDepth = inDryCave ? -1 : WATER_Y - groundH;
    const swimming = waterDepth > 1.25;
    const wading = !swimming && groundH < WATER_Y + 0.15;
    this.swimming = swimming;
    let speed = this.sprinting ? 7.0 : 4.4;
    if (swimming) speed = 2.8;
    else speed *= this.moveSpeedMultiplier;
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

    // Erhöhte Plattformen mit Brüstung begrenzen den Spieler nur auf Höhe der
    // Plattform. Unten bleiben Leiter und Stützen frei zugänglich.
    for(const platforms of this.platformSets)for(const platform of platforms){
      if(!platform.railRadius||this.pos.y<platform.y-.45)continue;
      const px=this.pos.x-platform.x,pz=this.pos.z-platform.z,distance=Math.hypot(px,pz);
      // Nur die Plattform begrenzen, auf der der Spieler wirklich steht. Ohne
      // diese Distanzprüfung zog jeder Hochsitz mit niedrigerer Plattform den
      // Spieler an seinen Rand – auf einem zweiten Hochsitz ebenso wie auf
      // weiter entferntem, höher gelegenem Terrain.
      if(distance>platform.r+.45)continue;
      if(distance<=platform.railRadius||distance<.001)continue;
      const c=Math.cos(platform.rot||0),s=Math.sin(platform.rot||0);
      const localX=c*px-s*pz,localZ=s*px+c*pz;
      const throughLadder=platform.ladderGapHalfWidth&&localZ>0
        &&Math.abs(localX)<platform.ladderGapHalfWidth;
      if(throughLadder){
        // Hinter der sichtbaren Leiteröffnung endet die Plattform wirklich:
        // nicht nach unten teleportieren, sondern sauber in die Fallphysik wechseln.
        if(distance>platform.r&&this.grounded){this.grounded=false;this.vy=Math.min(this.vy,-.3);}
        continue;
      }
      const nx=px/distance,nz=pz/distance;
      this.pos.x=platform.x+nx*platform.railRadius;
      this.pos.z=platform.z+nz*platform.railRadius;
      const outward=this.vel.x*nx+this.vel.z*nz;
      if(outward>0){this.vel.x-=nx*outward;this.vel.z-=nz*outward;}
    }

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
    const landingPlatform = this.nearestCavePlatform(this.pos.x, this.pos.z, this.pos.y);
    let floor = landingPlatform?.y ?? terrainHeight(this.pos.x, this.pos.z);
    if (this.vy <= 0 || this.grounded) {
      for (const platforms of this.platformSets) for (const platform of platforms) {
        if (!platform.overrideTerrain && Math.hypot(this.pos.x - platform.x, this.pos.z - platform.z) <= platform.r && this.pos.y >= platform.y - 0.45) {
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
    this.updateCamera(dt, bob);
    // In Third Person kann die Kamera über Wasser liegen, während die Figur
    // abgetaucht ist. Maßgeblich bleibt deshalb die Kopfhöhe des Spielers.
    this.underwater = !inDryCave && this.pos.y + 1.55 < WATER_Y - 0.12;

    // Schwung-Animation für Werkzeug
    this.attackCd -= dt;
    const bow = this.heldModels.bogen;
    if (this.heldId === 'bogen' && this.bowDrawing) {
      this.bowDraw = Math.min(1, this.bowDraw + dt / this.bowDrawTime);
      const draw = this.bowDraw;
      this.held.rotation.set(0, -draw * .035, 0);
      this.held.position.copy(this.heldRest);
      this.held.position.z += draw * .1;
      if (bow?.userData.arrow) bow.userData.arrow.position.z = .135 + draw * .2;
      bow?.userData.setDraw?.(.135 + draw * .2);
    } else if (this.swingT < 1) {
      this.swingT = Math.min(1, this.swingT + dt / 0.32);
      const motion = Math.sin(this.swingT * Math.PI);
      const unarmed = this.heldId === 'hand';
      // Die gesamte Bewegung startet am Schulter-Pivot. Die Faust erhält
      // einen kurzen Vorstoß, Werkzeuge einen breiteren Schulterbogen.
      this.held.position.copy(this.heldRest);
      this.held.position.z -= motion * (unarmed ? .11 : .025);
      this.held.rotation.set(
        -motion * (unarmed ? .28 : 1.02),
        motion * (unarmed ? .3 : -.08),
        motion * (unarmed ? .08 : .2),
      );
    } else {
      const walk = Math.min(1, moveAmt / 4);
      this.held.rotation.set(0, 0, Math.cos(this.bobT * 4) * .006 * walk);
      this.held.position.copy(this.heldRest);
      if (bow?.userData.arrow) bow.userData.arrow.position.z = .135;
      bow?.userData.setDraw?.(.135);
      // Sehr kleiner Schulter-/Atem-Bob statt einer losgelösten Werkzeugbewegung.
      this.held.position.x += Math.cos(this.bobT * 4) * .004 * walk;
      this.held.position.y += Math.sin(this.bobT * 4) * .007 * walk;
    }

    // Flammen flackern in ihrer individuellen Grundform; dadurch bläht die
    // Animation weder Fackel noch Laterne auf.
    if (['fackel','laterne'].includes(this.heldId)) {
      const flames = this.heldModels[this.heldId].userData.flames;
      const t = performance.now() * 0.001;
      flames.children.forEach((f, i) => {
        const s = 0.8 + Math.sin(t * 13 + i * 2.1) * 0.22 + Math.random() * 0.06;
        const base = f.userData.baseScale || (f.userData.baseScale = f.scale.clone());
        f.scale.set(base.x * s, base.y * (.85 + Math.sin(t * 17 + i) * .25), base.z * s);
      });
    }

    return { wading, swimming, underwater: this.underwater, moving: moveAmt > 0.3 };
  }

  updateStats(dt, hungerFactor = 1) {
    const drain = 0.3 + (this.sprinting ? 0.35 : 0);
    this.hunger = Math.max(0, this.hunger - drain * hungerFactor * dt);
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
    if (this.hunger > 60 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + 0.7 * dt);
    }
    return null;
  }
}
