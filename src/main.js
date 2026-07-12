import * as THREE from 'three';
import { World, terrainHeight, terrainSlope, WATER_Y, WORLD_RADIUS } from './world.js';
import { Resources } from './resources.js';
import { Buildings } from './buildings.js';
import { Animals } from './animals.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { ITEMS, buildHotbar, slotUsable } from './items.js';
import { CAMPFIRE_WOOD_FUEL } from './buildings.js';
import { sfx } from './sfx.js';
import { Music } from './music.js';
import { TouchControls } from './touch.js';
import { Aquatics } from './aquatics.js';
import { Landmarks, LANDMARK_COUNT } from './landmarks.js';

const SAVE_KEY = 'wildnis_save_v1';
const RESPAWN_WAIT = 5 * 60 * 1000;
const TUTORIAL = [
  { text: 'Sammle mindestens 3 Holz.', icon: 'wood', done: () => (game.inv.holz || 0) >= 3 || (game.inv.axt || 0) > 0 || buildings.placed.length > 0 },
  { text: 'Stelle im Crafting-Menü eine Axt her.', icon: 'axe', done: () => (game.inv.axt || 0) > 0 || buildings.placed.length > 0 },
  { text: 'Baue ein Lagerfeuer.', icon: 'fire', done: () => buildings.placed.some((b) => ['campfire', 'wall', 'gate'].includes(b.type)) },
  { text: 'Stelle eine Holzwand her und platziere sie.', icon: 'wall', done: () => buildings.placed.some((b) => ['wall', 'gate'].includes(b.type)) },
  { text: 'Crafte ein Wildtor und ersetze damit eine Wand.', icon: 'gate', done: () => buildings.placed.some((b) => b.type === 'gate') },
  { text: 'Stelle einen Bauhammer zum Abbauen her.', icon: 'hammer', done: () => (game.inv.hammer || 0) > 0 },
];

// ---------- Setup ----------
const lowPowerDevice = matchMedia('(pointer: coarse), (hover: none)').matches || navigator.hardwareConcurrency <= 4;
const basePixelRatio = Math.min(devicePixelRatio, lowPowerDevice ? 1.15 : 1.5);
const renderer = new THREE.WebGLRenderer({ antialias: !lowPowerDevice });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(basePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = lowPowerDevice ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 900);
scene.add(camera); // nötig, damit das Werkzeug in der Hand gerendert wird

const ui = new UI();
const world = new World(scene);
world.sun.shadow.mapSize.set(lowPowerDevice ? 768 : 1024, lowPowerDevice ? 768 : 1024);
const effects = new Effects(scene);
const resources = new Resources(scene);
const buildings = new Buildings(scene);
const animals = new Animals(scene, effects);
const aquatics = new Aquatics(scene);
const landmarks = new Landmarks(scene);
// Die Landmarken sollen wie bewusst komponierte Lichtungen wirken und nicht von
// zufällig gesetzten Bäumen oder Felsen verdeckt werden.
for (const res of resources.list) {
  if (landmarks.list.some((l) => Math.hypot(res.x - l.x, res.z - l.z) < 7)) {
    res.alive = false;
    res.group.visible = false;
  }
}
const player = new Player(camera);
let touch;

player.obstacleSets = [resources.obstacles, buildings.obstacles, landmarks.obstacles];
player.platforms = landmarks.platforms;

const game = {
  state: 'menu', // menu | playing | sleeping | paused | craft | dead
  inv: {},
  dura: {}, // aktuelle Haltbarkeit pro Werkzeug-Id
  hotbar: ['hand'],
  hotIdx: 0,
  spawn: { x: 0, z: 6 },
  firstNightHintShown: false,
  deathCause: '',
  respawnAt: 0,
  fireDamageTimer: 0,
  fireWarningShown: false,
  tutorialStage: 0,
  discoveries: [],
  raidTimer: 18,
  nightAnnouncedDay: 0,
  thirstWarning: false,
  coldWarning: false,
  boat: null,
};

buildings.onTentPlaced = (x, z) => {
  game.spawn = { x, z: z + 2.2 };
  ui.toast('Spawnpunkt gesetzt!');
};

buildings.onFireOut = () => {
  if (game.state === 'playing') ui.toast('Ein Lagerfeuer ist erloschen — mit Holz (E) neu anfeuern.', 'hint');
};

// Donner-Sound, wenn im Sturm ein Blitz einschlägt
world.onThunder = (dist) => sfx.thunder(dist);

// Intro-/Titelmusik
const music = new Music();
let ambientStarted = false;
function startAudioForPlay() {
  music.stop();
  if (!ambientStarted) { sfx.startAmbient(); ambientStarted = true; }
}

player.onDamage = (n, cause) => {
  ui.damageFlash();
  sfx.hurt();
  if (player.hp <= 0 && game.state === 'playing') die(cause || 'Ein wildes Tier hat dich erwischt.');
};

// ---------- Inventar ----------
function addItem(id, n = 1, silent = false) {
  game.inv[id] = (game.inv[id] || 0) + n;
  if (!silent) {
    ui.toast(`+${n} ${ITEMS[id].name}`);
    sfx.pickup();
  }
  refreshInv();
  updateTutorial();
}

function updateTutorial(silent = false) {
  const before = game.tutorialStage;
  while (game.tutorialStage < TUTORIAL.length && TUTORIAL[game.tutorialStage].done()) game.tutorialStage++;
  if (!silent && game.tutorialStage > before && game.state === 'playing') ui.toast('Aufgabe abgeschlossen!');
  if (game.tutorialStage >= TUTORIAL.length) {
    const found = game.discoveries.length;
    ui.setObjective(found >= LANDMARK_COUNT
      ? 'Chronik vollständig — die Geheimnisse der Wildnis sind geborgen.'
      : `Chronik der Wildnis · Besondere Orte entdeckt: ${found}/${LANDMARK_COUNT}`,
    found >= LANDMARK_COUNT ? 'sprout' : 'compass', found >= LANDMARK_COUNT);
    return;
  }
  const step = TUTORIAL[game.tutorialStage];
  ui.setObjective(`${game.tutorialStage + 1}/${TUTORIAL.length} · ${step.text}`, step.icon);
}

function discoverLandmark(landmark) {
  game.discoveries.push(landmark.id);
  for (const [id, n] of Object.entries(landmark.reward)) addItem(id, n, true);
  ui.discovery(landmark.name, landmark.story, game.discoveries.length, LANDMARK_COUNT);
  if (game.discoveries.length === LANDMARK_COUNT) {
    addItem('holzwand', 4, true);
    addItem('wildtor', 1, true);
    if ((game.inv.fackel || 0) === 0) { addItem('fackel', 1, true); game.dura.fackel = ITEMS.fackel.dura; }
    addItem('holz', 6, true);
    setTimeout(() => ui.toast('Chronik vollständig: Festungs-Paket erhalten!'), 3200);
  }
  refreshInv();
  updateTutorial(true);
  saveGame();
}

function removeItem(id, n = 1) {
  game.inv[id] = Math.max(0, (game.inv[id] || 0) - n);
  refreshInv();
}

// Verschleiß eines Werkzeugs. Gibt false zurück, wenn es dabei zerbricht.
function useDurability(toolId) {
  const def = ITEMS[toolId];
  if (!def?.dura || def.burns) return true; // kein Pro-Nutzung-Verschleiß (Hand, Fackel brennt zeitbasiert)
  game.dura[toolId] = (game.dura[toolId] ?? def.dura) - 1;
  if (game.dura[toolId] <= 0) {
    delete game.dura[toolId];
    removeItem(toolId, 1); // zerbricht -> aus dem Inventar, kann neu gecraftet werden
    ui.toast(`${def.name} ist zerbrochen!`, 'hint');
    sfx.hurt();
    return false;
  }
  refreshInv(); // Haltbarkeitsbalken aktualisieren
  return true;
}

function refreshInv() {
  const selId = game.hotbar[game.hotIdx];
  game.hotbar = buildHotbar(game.inv);
  const newIdx = game.hotbar.indexOf(selId);
  // Auswahl beibehalten, sofern der Slot noch benutzbar ist – sonst zurück auf die Hand.
  game.hotIdx = newIdx >= 0 && slotUsable(selId, game.inv) ? newIdx : 0;
  ui.renderHotbar(game.hotbar, game.hotIdx, game.inv, game.dura);
  ui.setMaterials(game.inv);
  if (game.state === 'craft') ui.renderCraft(game.inv);
  syncSelection();
}

function selected() {
  const id = game.hotbar[game.hotIdx];
  return id && slotUsable(id, game.inv) ? id : 'hand';
}

function syncSelection() {
  const id = selected();
  player.setHeld(id);
  const def = ITEMS[id];
  buildings.setGhostType(def.type === 'placeable' ? def.build : null);
  if (touch) {
    touch.setActionIcon(def.type === 'food' ? 'food' : def.type === 'placeable' ? 'craft' : 'fist');
    touch.setRotateVisible(def.type === 'placeable');
  }
}

function selectSlot(i) {
  if (i < 0 || i >= game.hotbar.length) return;
  if (!slotUsable(game.hotbar[i], game.inv)) return; // leerer Werkzeug-Slot: ignorieren
  game.hotIdx = i;
  ui.renderHotbar(game.hotbar, game.hotIdx, game.inv, game.dura);
  ui.showSelName(ITEMS[selected()].name);
  syncSelection();
}

ui.onSelectSlot = selectSlot;

// ---------- Aktionen ----------
const ray = new THREE.Raycaster();
const flyingArrows = [];
const spearDirection = new THREE.Vector3();

// Fackel-Licht: folgt dem Spieler, solange die Fackel in der Hand ist
const torchLight = new THREE.PointLight(0xffb050, 0, 12, 1.6);
torchLight.visible = false;
scene.add(torchLight);

// true, solange eine brennende Fackel getragen wird (für Licht & Wolfsabwehr)
function torchHeld() {
  return selected() === 'fackel' && (game.inv.fackel || 0) > 0;
}

// Atmosphäre: Regenpegel setzen, gelegentlich Vögel zwitschern lassen
let birdTimer = 5;
function updateAmbient(dt) {
  const rain = world.rainIntensity;
  sfx.setRain(rain * 0.09);

  birdTimer -= dt;
  if (birdTimer <= 0) {
    birdTimer = 3.5 + Math.random() * 7;
    // Vögel singen tagsüber bei trockenem Wetter
    if (world.elevation > 0.12 && rain < 0.25) sfx.birdChirp();
  }
}

let stepTimer = 0;
function updateFootsteps(dt, movement) {
  if (!movement.moving) {
    stepTimer = Math.min(stepTimer, 0.08);
    return;
  }
  stepTimer -= dt;
  if (stepTimer > 0) return;
  if (movement.swimming) {
    sfx.swimStroke(movement.underwater);
    stepTimer = movement.underwater ? 0.72 : 0.58;
    return;
  }
  if (!player.grounded) return;
  let surface = 'grass';
  const h = terrainHeight(player.pos.x, player.pos.z);
  if (movement.wading) surface = 'water';
  else if (h < 0.55) surface = 'sand';
  else if (h > 8 || terrainSlope(player.pos.x, player.pos.z) > 0.72) surface = 'stone';
  sfx.footstep(surface);
  // Sprinten klingt schneller; Waten bleibt bewusst etwas schwerfälliger.
  stepTimer = movement.wading ? 0.5 : player.sprinting ? 0.29 : 0.42;
}

function updateTorch(dt) {
  if (!torchHeld()) return;
  // Fackel brennt zeitbasiert herunter
  game.dura.fackel = (game.dura.fackel ?? ITEMS.fackel.dura) - dt;
  if (game.dura.fackel <= 0) {
    delete game.dura.fackel;
    removeItem('fackel', 1);
    ui.toast('Deine Fackel ist heruntergebrannt!', 'hint');
    sfx.hurt();
    return;
  }
  torchLight.visible = true;
  torchLight.position.set(camera.position.x, camera.position.y + 0.1, camera.position.z);
  torchLight.intensity = 2.0 * (0.85 + Math.sin(performance.now() * 0.012) * 0.12 + Math.random() * 0.06);
  ui.updateDuraBar('fackel', game.dura.fackel / ITEMS.fackel.dura);
}

function raycastTargets(range) {
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.far = range;
  const hits = ray.intersectObjects([resources.group, animals.group, aquatics.group], true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.res && !o.userData.animal && !o.userData.fish) o = o.parent;
    if (!o) continue;
    if (o.userData.res && !o.userData.res.alive) continue;
    return { obj: o, point: h.point };
  }
  return null;
}

function raycastBuilding(range = 4.5) {
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.far = range;
  const groups = buildings.placed.map((b) => b.group);
  const hit = ray.intersectObjects(groups, true)[0];
  if (!hit) return null;
  let obj = hit.object;
  while (obj && !obj.userData.building) obj = obj.parent;
  return obj?.userData.building || null;
}

// Interaktionen gelten nur für das Gebäude im Fadenkreuz und in sinnvoller Nähe.
// Dadurch kann E nichts mehr hinter oder seitlich vom Spieler auslösen.
function aimedBuildingOfType(type, maxDist, aimed = raycastBuilding()) {
  if (!aimed || aimed.type !== type) return null;
  return Math.hypot(aimed.x - player.pos.x, aimed.z - player.pos.z) <= maxDist ? aimed : null;
}

function primaryAction() {
  const id = selected();
  const def = ITEMS[id];
  if (def.type === 'food') return eatItem(id);
  if (def.type === 'placeable') return placeSelected(id);
  if (id === 'bogen') return shootBow();
  attack(id);
}

function eatItem(id) {
  if ((game.inv[id] || 0) <= 0) return;
  const def = ITEMS[id];
  removeItem(id, 1);
  player.hunger = Math.min(100, player.hunger + def.hunger);
  if (def.thirst) player.thirst = THREE.MathUtils.clamp(player.thirst + def.thirst, 0, 100);
  if (def.hp > 0) player.hp = Math.min(100, player.hp + def.hp);
  if (def.hp < 0) {
    player.damage(-def.hp);
    ui.toast(`${def.name} roh gegessen… (-${-def.hp} Gesundheit)`);
  } else {
    const hydration = def.thirst > 0 ? ` · +${def.thirst} Wasser` : def.thirst < 0 ? ` · ${def.thirst} Wasser` : '';
    ui.toast(`${def.name} gegessen (+${def.hunger} Hunger${hydration})`);
  }
  sfx.eat();
}

function placeSelected(id) {
  const def = ITEMS[id];
  if (buildings.tryPlace(def.build)) {
    removeItem(id, 1);
    sfx.place();
    saveGame();
    updateTutorial();
  }
}

function attack(toolId) {
  if (!player.swing()) return;
  sfx.attack();
  if (toolId === 'hammer') {
    const building = raycastBuilding();
    if (!building) return;
    const refunds = buildings.dismantle(building);
    for (const [id, n] of Object.entries(refunds || {})) addItem(id, n, true);
    ui.toast('Gebäude abgebaut — Materialien teilweise gerettet.');
    sfx.place();
    useDurability('hammer');
    saveGame();
    return;
  }
  const range = 3.4;
  const hit = raycastTargets(range);
  if (!hit) return;

  if (hit.obj.userData.res) {
    const res = hit.obj.userData.res;
    const result = resources.hit(res, toolId);
    if (!result) return;
    if (result.kind === 'tree') { sfx.chop(); effects.burst(hit.point, 0x8a5a2b, 8); }
    else if (result.kind === 'rock') { sfx.stone(); effects.burst(hit.point, 0x8d8d93, 8); }
    else { effects.burst(hit.point, 0x4757c8, 6, 2); }
    if (result.hint && Math.random() < 0.4) ui.toast(result.hint, 'hint');
    if (result.drops) {
      for (const [id, n] of Object.entries(result.drops)) addItem(id, n);
    }
    useDurability(toolId);
  } else if (hit.obj.userData.animal) {
    const animal = hit.obj.userData.animal;
    const dmg = toolIdDamage(toolId);
    const dir = new THREE.Vector3().subVectors(animal.pos, player.pos).setY(0).normalize();
    sfx.hit();
    const result = animals.hit(animal, dmg, dir);
    if (result.killed) {
      ui.toast(`${result.name} erlegt!`);
      for (const [id, n] of Object.entries(result.drops)) addItem(id, n);
    }
    useDurability(toolId);
  }
}

// Bogen abfeuern: verbraucht einen Pfeil und etwas Haltbarkeit
function shootBow() {
  if (!player.swing()) return;
  if ((game.inv.pfeil || 0) <= 0) {
    ui.toast('Keine Pfeile — crafte welche (Holz + Stein)!', 'hint');
    return;
  }
  removeItem('pfeil', 1);
  sfx.attack();
  shootArrow();
  useDurability('bogen');
}

function shootArrow() {
  camera.getWorldDirection(spearDirection);
  const dir = spearDirection.clone().normalize();
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.015, 0.9, 5),
    new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 1 })
  );
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.035, 0.12, 5),
    new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.6 })
  );
  tip.position.y = 0.5;
  const fletch = new THREE.Mesh(
    new THREE.BoxGeometry(0.002, 0.1, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xd0524a, roughness: 1 })
  );
  fletch.position.y = -0.4;
  g.add(shaft, tip, fletch);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.position.copy(camera.position).addScaledVector(dir, 0.8).add(new THREE.Vector3(0, -0.1, 0));
  scene.add(g);
  flyingArrows.push({ group: g, dir, distance: 0, speed: 36 });
}

function updateFlyingArrows(dt) {
  for (let i = flyingArrows.length - 1; i >= 0; i--) {
    const spear = flyingArrows[i];
    const step = spear.speed * dt;
    ray.set(spear.group.position, spear.dir);
    ray.far = step + 0.35;
    const hits = ray.intersectObjects([animals.group, aquatics.group], true);
    let animal = null, fish = null;
    if (hits.length) {
      let obj = hits[0].object;
      while (obj && !obj.userData.animal && !obj.userData.fish) obj = obj.parent;
      animal = obj?.userData.animal || null;
      fish = obj?.userData.fish || null;
    }

    if (fish && aquatics.hit(fish)) {
      sfx.hit();
      addItem('fleisch_roh', 1);
      ui.toast('Fisch mit dem Bogen erlegt!');
      scene.remove(spear.group);
      flyingArrows.splice(i, 1);
      continue;
    }

    if (animal && animals.list.includes(animal)) {
      sfx.hit();
      const result = animals.hit(animal, toolIdDamage('bogen'), spear.dir);
      if (result.killed) {
        ui.toast(`${result.name} erlegt!`);
        for (const [id, n] of Object.entries(result.drops)) addItem(id, n);
      }
      scene.remove(spear.group);
      flyingArrows.splice(i, 1);
      continue;
    }

    spear.group.position.addScaledVector(spear.dir, step);
    spear.distance += step;
    const ground = terrainHeight(spear.group.position.x, spear.group.position.z);
    if (spear.distance >= 40 || spear.group.position.y <= ground + 0.08) {
      scene.remove(spear.group);
      flyingArrows.splice(i, 1);
    }
  }
}

function toolIdDamage(toolId) {
  if (toolId === 'bogen') return 5;
  if (toolId === 'axt' || toolId === 'spitzhacke') return 2;
  return 1;
}

// E — Interagieren (Kochen / Schlafen)
function interact() {
  if (game.boat) {
    exitRaft();
    return;
  }
  const aimedBuilding = raycastBuilding();
  if (aimedBuilding?.type === 'gate') {
    buildings.toggleGate(aimedBuilding);
    ui.toast(aimedBuilding.open ? 'Tor geöffnet.' : 'Tor geschlossen.');
    sfx.place();
    saveGame();
    return;
  }
  const raft = aimedBuildingOfType('raft', 3.8, aimedBuilding);
  if (raft) {
    enterRaft(raft);
    return;
  }
  const fire = aimedBuildingOfType('campfire', 3.5, aimedBuilding);
  if (fire) {
    // Erloschenes Feuer: mit Holz wieder anzünden
    if (!fire.lit) {
      if ((game.inv.holz || 0) > 0) {
        removeItem('holz', 1);
        buildings.refuel(fire, CAMPFIRE_WOOD_FUEL);
        ui.toast('Feuer wieder angefacht!');
        sfx.cook();
        saveGame();
      } else {
        ui.toast('Du brauchst Holz zum Anfeuern.', 'hint');
      }
      return;
    }
    // Brennendes Feuer: erst braten …
    if ((game.inv.fleisch_roh || 0) > 0) {
      removeItem('fleisch_roh', 1);
      addItem('fleisch', 1, true);
      ui.toast('Fleisch gebraten!');
      sfx.cook();
      refreshInv();
      return;
    }
    // … sonst mit Holz nachlegen
    if ((game.inv.holz || 0) > 0 && fire.fuel < fire.maxFuel) {
      removeItem('holz', 1);
      buildings.refuel(fire, CAMPFIRE_WOOD_FUEL);
      ui.toast('Holz nachgelegt.');
      sfx.cook();
      saveGame();
      return;
    }
  }
  const catcher = aimedBuildingOfType('raincatcher', 3.5, aimedBuilding);
  if (catcher) {
    const water = buildings.drinkFrom(catcher, 30);
    if (water > 0) {
      player.thirst = Math.min(100, player.thirst + water * 1.5);
      ui.toast('Frisches Regenwasser getrunken.');
      sfx.eat();
      saveGame();
    } else ui.toast('Der Regenfänger ist noch leer.', 'hint');
    return;
  }
  const tent = aimedBuildingOfType('tent', 3.2, aimedBuilding);
  if (tent && world.night) {
    game.state = 'sleeping';
    stopDesktopAction();
    sfx.sleep();
    ui.sleepTransition(() => {
      world.sleep();
      player.hp = Math.min(100, player.hp + 25);
      player.hunger = Math.max(0, player.hunger - 8);
      player.thirst = Math.max(0, player.thirst - 10);
      saveGame();
    }, () => {
      game.state = 'playing';
      ui.toast('Gut geschlafen — ein neuer Morgen!');
    });
  }
}

function enterRaft(raft) {
  game.boat = raft;
  raft.speed ||= 0;
  raft.turnSpeed ||= 0;
  player.vel.set(0, 0, 0);
  player.vy = 0;
  ui.toast('Floß bestiegen · W/S fahren · A/D lenken · E aussteigen');
}

function exitRaft() {
  const raft = game.boat;
  if (!raft) return;
  const sideX = Math.cos(raft.rot) * 1.8;
  const sideZ = -Math.sin(raft.rot) * 1.8;
  player.pos.set(raft.x + sideX, WATER_Y - 0.15, raft.z + sideZ);
  player.vel.set(0, 0, 0);
  game.boat = null;
  ui.toast('Floß verlassen.');
}

function updateRaft(dt) {
  const raft = game.boat;
  if (!raft || !buildings.placed.includes(raft)) { game.boat = null; return player.update(dt); }
  const k = player.keys;
  const touchInput = player.touchInput;
  const throttle = touchInput?.enabled ? touchInput.vec.y : (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
  const steer = touchInput?.enabled ? touchInput.vec.x : (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  const targetSpeed = throttle * (throttle > 0 ? 5.4 : 2.4);
  raft.speed += (targetSpeed - raft.speed) * Math.min(1, dt * (throttle ? 1.8 : 0.75));
  const steerGrip = THREE.MathUtils.clamp(Math.abs(raft.speed) / 2.2, 0.18, 1);
  raft.turnSpeed += (steer * 0.85 * steerGrip - raft.turnSpeed) * Math.min(1, dt * 2.4);
  raft.rot += raft.turnSpeed * dt * (raft.speed < 0 ? -1 : 1);
  const fx = Math.sin(raft.rot), fz = Math.cos(raft.rot);
  const nx = THREE.MathUtils.clamp(raft.x + (fx * raft.speed + world.wind.x * 0.18) * dt, -WORLD_RADIUS + 5, WORLD_RADIUS - 5);
  const nz = THREE.MathUtils.clamp(raft.z + (fz * raft.speed + world.wind.z * 0.18) * dt, -WORLD_RADIUS + 5, WORLD_RADIUS - 5);
  if (terrainHeight(nx, nz) < WATER_Y - 0.18) { raft.x = nx; raft.z = nz; }
  else raft.speed *= Math.max(0, 1 - dt * 5);
  raft.group.position.set(raft.x, WATER_Y + 0.05 + Math.sin(performance.now() * 0.0018) * 0.045, raft.z);
  raft.group.rotation.set(Math.sin(performance.now() * 0.0013) * 0.012, raft.rot, Math.sin(performance.now() * 0.0017 + 1) * 0.018);
  player.pos.set(raft.x, WATER_Y + 0.34, raft.z);
  player.grounded = true; player.swimming = false; player.underwater = false; player.sprinting = false;
  camera.position.set(raft.x, WATER_Y + 2.05, raft.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  return { wading: false, swimming: false, underwater: false, moving: false };
}

// ---------- Crafting ----------
ui.onCraft = (recipe) => {
  for (const [id, n] of Object.entries(recipe.cost)) {
    if ((game.inv[id] || 0) < n) return;
  }
  const def = ITEMS[recipe.out];
  if (def.once && (game.inv[recipe.out] || 0) > 0) return;
  for (const [id, n] of Object.entries(recipe.cost)) removeItem(id, n);
  const amount = recipe.yield || 1;
  addItem(recipe.out, amount, true);
  if (def.dura) game.dura[recipe.out] = def.dura; // neues Werkzeug: volle Haltbarkeit
  ui.toast(amount > 1 ? `${amount}× ${def.name} hergestellt!` : `${def.name} hergestellt!`);
  sfx.craft();
  refreshInv();
  ui.renderCraft(game.inv);
};

function openCraft() {
  stopDesktopAction();
  game.state = 'craft';
  ui.renderCraft(game.inv);
  ui.showCraft(true);
  exitPointerLock();
  touch?.show(false);
  touch?.setSwimming(false);
  document.body.classList.remove('underwater');
}

function closeCraft() {
  resumePlaying();
  if (!touch?.enabled) lockPointer();
}

// ---------- Zustand / Overlays ----------
// Pointer-Lock ist optional: wenn der Browser ihn verweigert,
// läuft das Spiel trotzdem (Maus-Look über movementX/Y ohne Lock).
function lockPointer() {
  if (touch?.enabled || typeof renderer.domElement.requestPointerLock !== 'function') return;
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* Lock nicht verfügbar */ }
}

function exitPointerLock() {
  if (typeof document.exitPointerLock !== 'function') return;
  try {
    document.exitPointerLock();
  } catch { /* Auf Mobile-Browsern nicht immer verfügbar */ }
}

function resumePlaying() {
  game.state = 'playing';
  ui.showOverlay(null);
  ui.showCraft(false);
  ui.showHud(true);
  touch?.show(true);
}

let hadLock = false;
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) {
    hadLock = true;
    resumePlaying();
  } else {
    if (game.state === 'playing' && hadLock) {
      game.state = 'paused';
      ui.showOverlay('pause');
    }
    hadLock = false;
  }
});

player.canLook = () => game.state === 'playing';

function die(cause) {
  if (game.state === 'dead') return;
  stopDesktopAction();
  game.state = 'dead';
  game.deathCause = cause;
  game.respawnAt = Date.now() + RESPAWN_WAIT;
  sfx.die();
  exitPointerLock();
  touch?.show(false);
  touch?.setSwimming(false);
  document.body.classList.remove('underwater');
  ui.showHud(false);
  ui.showOverlay('dead', { days: world.day, cause });
  ui.setRespawnCountdown(RESPAWN_WAIT);
}

function respawn() {
  game.boat = null;
  player.hp = 100;
  player.hunger = 60;
  player.oxygen = 100;
  player.thirst = 65;
  player.warmth = 100;
  player.stamina = 100;
  player.exhausted = false;
  player.pos.set(game.spawn.x, terrainHeight(game.spawn.x, game.spawn.z), game.spawn.z);
  player.vel.set(0, 0, 0);
  game.fireDamageTimer = 0;
  game.fireWarningShown = false;
}

function updateFireDamage(dt) {
  const fire = buildings.nearest('campfire', player.pos, 1.2);
  if (!fire) {
    game.fireDamageTimer = 0;
    game.fireWarningShown = false;
    return;
  }
  if (!game.fireWarningShown) {
    game.fireWarningShown = true;
    ui.toast('Das Feuer verbrennt dich!', 'hint');
  }
  game.fireDamageTimer -= dt;
  if (game.fireDamageTimer <= 0) {
    game.fireDamageTimer = 0.4;
    player.damage(4, 'Du bist im Feuer verbrannt.');
  }
}

function updateSurvival(dt) {
  const movingDrain = player.sprinting ? 0.13 : 0;
  player.thirst = Math.max(0, player.thirst - (0.42 + movingDrain) * dt);

  const altitude = terrainHeight(player.pos.x, player.pos.z);
  const nearWarmFire = !!buildings.nearest('campfire', player.pos, 6)?.lit;
  const hasCoat = (game.inv.pelzmantel || 0) > 0;
  let cold = Math.max(0, (altitude - 6) / 8);
  if (world.night) cold += 0.28;
  if (world.rainIntensity > 0.2) cold += world.rainIntensity * 0.45;
  if (player.swimming) cold += 0.75;
  if (hasCoat) cold *= 0.35;
  if (nearWarmFire) cold = -1.2;
  const warmthTarget = THREE.MathUtils.clamp(100 - cold * 85, 0, 100);
  const rate = warmthTarget < player.warmth ? 0.065 : 0.18;
  player.warmth += (warmthTarget - player.warmth) * Math.min(1, dt * rate);

  if (player.thirst < 22 && !game.thirstWarning) {
    game.thirstWarning = true;
    ui.toast('Du hast starken Durst — sammle Regenwasser!', 'hint');
  } else if (player.thirst > 45) game.thirstWarning = false;
  if (player.warmth < 24 && !game.coldWarning) {
    game.coldWarning = true;
    ui.toast(hasCoat ? 'Dir wird kalt — suche ein Feuer.' : 'Dir wird kalt — Feuer oder Pelzmantel helfen.', 'hint');
  } else if (player.warmth > 55) game.coldWarning = false;

  if (player.thirst <= 0) {
    player.hp = Math.max(0, player.hp - 4 * dt);
    return 'thirst';
  }
  if (player.warmth <= 5) {
    player.hp = Math.max(0, player.hp - 3 * dt);
    return 'cold';
  }
  return null;
}

// ---------- Speichern / Laden ----------
function saveGame() {
  if (game.state === 'menu') return;
  const data = {
    inv: game.inv,
    dura: game.dura,
    hp: player.hp,
    hunger: player.hunger,
    oxygen: player.oxygen,
    thirst: player.thirst,
    warmth: player.warmth,
    stamina: player.stamina,
    day: world.day,
    t: world.t,
    pos: { x: player.pos.x, z: player.pos.z },
    spawn: game.spawn,
    buildings: buildings.serialize(),
    tutorialStage: game.tutorialStage,
    discoveries: game.discoveries,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data) return false;
    game.inv = data.inv || {};
    game.dura = data.dura || {};
    // Alte Spielstände: Speer -> Bogen + ein paar Pfeile
    if (game.inv.speer) {
      delete game.inv.speer;
      game.inv.bogen = 1;
      game.dura.bogen = ITEMS.bogen.dura;
      game.inv.pfeil = (game.inv.pfeil || 0) + 6;
    }
    // Fackel war früher platzierbar (Stapel) -> jetzt Werkzeug mit Haltbarkeit
    if ((game.inv.fackel || 0) > 1) game.inv.fackel = 1;
    if (game.inv.fackel && game.dura.fackel == null) game.dura.fackel = ITEMS.fackel.dura;
    player.hp = data.hp ?? 100;
    player.hunger = data.hunger ?? 100;
    player.oxygen = data.oxygen ?? 100;
    player.thirst = data.thirst ?? 100;
    player.warmth = data.warmth ?? 100;
    player.stamina = data.stamina ?? 100;
    player.exhausted = false;
    world.day = data.day ?? 1;
    world.t = data.t ?? 0.3;
    game.spawn = data.spawn || { x: 0, z: 6 };
    player.pos.set(data.pos?.x ?? 0, 0, data.pos?.z ?? 6);
    player.pos.y = terrainHeight(player.pos.x, player.pos.z);
    buildings.load(data.buildings);
    game.tutorialStage = data.tutorialStage ?? 0;
    game.discoveries = Array.isArray(data.discoveries) ? data.discoveries : [];
    refreshInv();
    updateTutorial(true);
    return true;
  } catch {
    return false;
  }
}

function newGame() {
  localStorage.removeItem(SAVE_KEY);
  game.inv = { beeren: 2 };
  game.dura = {};
  game.spawn = { x: 0, z: 6 };
  game.tutorialStage = 0;
  game.discoveries = [];
  world.day = 1;
  world.t = 0.3;
  player.hp = 100;
  player.hunger = 100;
  player.oxygen = 100;
  player.thirst = 100;
  player.warmth = 100;
  player.stamina = 100;
  player.exhausted = false;
  player.pos.set(0, terrainHeight(0, 6), 6);
  refreshInv();
  updateTutorial(true);
  setTimeout(() => { if (game.state === 'playing') ui.toast('Schlage Bäume für Holz (Linksklick)'); }, 1500);
  setTimeout(() => { if (game.state === 'playing') ui.toast('Öffne Crafting mit TAB oder C'); }, 5000);
  setTimeout(() => { if (game.state === 'playing') ui.toast('Beerensträucher stillen den Hunger'); }, 9000);
}

setInterval(saveGame, 10000);
addEventListener('pagehide', saveGame);

// ---------- Input ----------
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  if (e.code === 'KeyM' && !e.repeat) {
    const m = !sfx.muted;
    sfx.setMuted(m);
    music.setMuted(m);
    ui.toast(m ? 'Ton aus' : 'Ton an');
    return;
  }
  if (game.state === 'playing') {
    if (e.code === 'KeyC' || e.code === 'Tab') openCraft();
    else if (e.code === 'KeyE') interact();
    else if (e.code === 'KeyR') buildings.rotateGhost();
    else if (/^Digit[1-9]$/.test(e.code)) selectSlot(+e.code.slice(5) - 1);
    else if (e.code === 'Escape' && !document.pointerLockElement) {
      game.state = 'paused';
      ui.showOverlay('pause');
    }
  } else if (game.state === 'craft' && (e.code === 'KeyC' || e.code === 'Tab' || e.code === 'Escape')) {
    closeCraft();
  }
});

let desktopActionTimer = null;

function stopDesktopAction() {
  clearInterval(desktopActionTimer);
  desktopActionTimer = null;
}

addEventListener('mousedown', (e) => {
  if (e.button !== 0 || game.state !== 'playing') return;
  if (e.target !== renderer.domElement) return; // UI-Klicks nicht abfangen
  primaryAction();
  stopDesktopAction();
  desktopActionTimer = setInterval(() => {
    if (game.state !== 'playing' || !document.hasFocus()) return stopDesktopAction();
    primaryAction();
  }, 480);
});

addEventListener('mouseup', (e) => {
  if (e.button === 0) stopDesktopAction();
});
addEventListener('blur', stopDesktopAction);

addEventListener('wheel', (e) => {
  if (game.state !== 'playing' || game.hotbar.length < 2) return;
  const d = e.deltaY > 0 ? 1 : -1;
  // Zum nächsten benutzbaren Slot springen (leere Werkzeug-Slots überspringen)
  let i = game.hotIdx;
  for (let step = 0; step < game.hotbar.length; step++) {
    i = (i + d + game.hotbar.length) % game.hotbar.length;
    if (slotUsable(game.hotbar[i], game.inv)) { selectSlot(i); break; }
  }
});

addEventListener('contextmenu', (e) => e.preventDefault());

// Safari/iOS kann trotz Pointer-Events eigene Pinch- und Doppeltipp-Gesten starten.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
renderer.domElement.addEventListener('dblclick', (e) => e.preventDefault());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Menü-Buttons
// Rendert ein korrektes Ego-Frame mit der geladenen Tageszeit, BEVOR das Menü
// ausgeblendet wird. Sonst bleibt beim Ausblenden kurz das letzte Menü-Frame
// stehen – und weil die Menü-Zeit weiterläuft, kann das ein dunkles/schwarzes
// Nachtbild sein, das kurz aufblitzt.
function prerenderFirstFrame() {
  world.update(0, player.pos);
  player.update(0);
  buildings.updateGhost(camera, world.terrain);
  renderer.render(scene, camera);
}

function startGame() {
  sfx.unlock();
  startAudioForPlay();
  if (game.state === 'menu') {
    if (!loadGame()) newGame();
  } else if (game.state === 'dead') {
    if (Date.now() < game.respawnAt) return;
    respawn();
  }
  prerenderFirstFrame();
  resumePlaying();
  if (!touch?.enabled) lockPointer();
}

document.getElementById('btnPlay').addEventListener('click', startGame);

document.getElementById('craftClose').addEventListener('click', closeCraft);

document.getElementById('btnNew').addEventListener('click', () => {
  sfx.unlock();
  startAudioForPlay();
  newGame();
  respawn();
  player.hunger = 100;
  player.thirst = 100;
  prerenderFirstFrame();
  resumePlaying();
  if (!touch?.enabled) lockPointer();
});

// ---------- HUD-Update ----------
function updateHUD() {
  const starving = player.hunger <= 0;
  ui.setBars(player.hp, player.hunger, starving, player.oxygen, player.swimming || player.oxygen < 100, player.stamina, player.thirst, player.warmth);
  ui.setClock(world.day, world.elevation);
  ui.setThreat(world.night, Math.min(10, world.day), world.day % 3 === 0);

  // Ziel unterm Fadenkreuz
  const t = raycastTargets(selected() === 'bogen' ? 40 : 4.6);
  if (t) {
    if (t.obj.userData.res) {
      const names = { tree: 'Baum', rock: 'Stein', bush: 'Beerenstrauch' };
      ui.target(names[t.obj.userData.res.kind]);
    } else if (t.obj.userData.animal) {
      const a = t.obj.userData.animal;
      ui.target(`${a.def.name} · ${a.hp}/${a.def.hp} Gesundheit`);
    } else if (t.obj.userData.fish) {
      ui.target('Fisch · mit dem Bogen jagen');
    }
  } else {
    ui.target(null);
  }

  // Kontext-Prompt
  let prompt = null;
  const aimedBuilding = raycastBuilding();
  const fire = aimedBuildingOfType('campfire', 3.5, aimedBuilding);
  const tent = aimedBuildingOfType('tent', 3.2, aimedBuilding);
  const catcher = aimedBuildingOfType('raincatcher', 3.5, aimedBuilding);
  const raft = aimedBuildingOfType('raft', 3.8, aimedBuilding);
  const aimedGate = aimedBuilding?.type === 'gate' ? aimedBuilding : null;
  const fireOut = fire && !fire.lit;
  const canRefuel = fire && fire.lit && fire.fuel < fire.maxFuel && (game.inv.holz || 0) > 0;
  if (game.boat) prompt = 'W/S — fahren · A/D — lenken · E — aussteigen';
  else if (player.swimming) prompt = player.underwater ? 'Q — tiefer tauchen · Leertaste — auftauchen' : 'Q — abtauchen · Leertaste — auftauchen';
  else if (aimedGate) prompt = `E — Tor ${aimedGate.open ? 'schließen' : 'öffnen'}`;
  else if (selected() === 'hammer' && aimedBuilding) prompt = 'Linksklick — Gebäude abbauen';
  else if (fireOut) prompt = (game.inv.holz || 0) > 0 ? 'E — Feuer mit Holz anfeuern' : 'Feuer erloschen — Holz zum Anfeuern nötig';
  else if (fire && (game.inv.fleisch_roh || 0) > 0) prompt = 'E — Fleisch braten';
  else if (canRefuel) prompt = 'E — Holz nachlegen';
  else if (catcher) prompt = catcher.water > 1 ? `E — Regenwasser trinken · ${Math.round(catcher.water)}%` : 'Regenfänger leer — warte auf Regen';
  else if (raft) prompt = 'E — Floß besteigen';
  else if (tent && world.night) prompt = 'E — Schlafen bis zum Morgen';
  else if (ITEMS[selected()].type === 'placeable') prompt = 'Linksklick — Platzieren · R — Drehen';
  else if (starving) prompt = 'Du verhungerst! Iss etwas!';
  ui.prompt(prompt);
  const interactHint = aimedGate ? 'gate'
    : fireOut ? 'food'
    : (fire && fire.lit && (game.inv.fleisch_roh || 0) > 0) ? 'food'
    : canRefuel ? 'food'
    : catcher ? 'food'
    : raft ? 'gate'
    : (tent && world.night) ? 'tent' : null;
  touch?.setInteract(interactHint);
}

// ---------- Game-Loop ----------
let last = performance.now();
let menuAngle = 0;
let renderedFrames = 0;
let performanceWindowStart = last;
let adaptivePixelRatio = basePixelRatio;

function tick(dt) {
  const now = performance.now();

  player.held.visible = game.state !== 'menu';
  torchLight.visible = false; // wird nur im Spielzustand wieder eingeschaltet

  if (game.state === 'menu') {
    // Kamerafahrt im Hauptmenü
    menuAngle += dt * 0.06;
    camera.position.set(Math.cos(menuAngle) * 40, 26, Math.sin(menuAngle) * 40);
    camera.lookAt(0, 2, 0);
    world.update(dt * 0.4, camera.position);
    buildings.update(dt, world.wind);
    effects.update(dt);
  } else if (game.state === 'playing') {
    world.update(dt, player.pos);
    if (world.nightfall && !game.firstNightHintShown) {
      game.firstNightHintShown = true;
      ui.toast('Die Nacht bricht herein… Wölfe werden aggressiv!', 'hint');
    }
    if (world.nightfall) {
      const bloodMoon = world.day % 3 === 0;
      game.raidTimer = bloodMoon ? 7 : 15;
      if (game.nightAnnouncedDay !== world.day) {
        game.nightAnnouncedDay = world.day;
        ui.toast(bloodMoon ? 'BLUTNACHT — das Rudel jagt dich!' : `Nacht ${world.day} — die Wildnis wird gefährlicher.`, 'hint');
        sfx.growl();
      }
    }
    const movement = game.boat ? updateRaft(dt) : player.update(dt);
    document.body.classList.toggle('underwater', player.underwater);
    touch?.setSwimming(player.swimming);
    updateFireDamage(dt);
    const starve = player.updateStats(dt);
    const survival = updateSurvival(dt);
    if (player.hp <= 0) die(
      survival === 'thirst' ? 'Du bist verdurstet.'
        : survival === 'cold' ? 'Du bist erfroren.'
          : starve === 'starving' ? 'Du bist verhungert.'
            : starve === 'drowning' ? 'Du bist ertrunken.' : 'Ein Tier hat dich erwischt.'
    );

    updateTorch(dt);
    updateFootsteps(dt, movement);
    updateAmbient(dt);
    resources.update(dt, world.wind);
    buildings.tickFuel(dt, world.rainIntensity);
    buildings.update(dt, world.wind);
    buildings.updateGhost(camera, world.terrain);
    // Aktive Feuer + getragene Fackel halten Wölfe fern
    const fires = buildings.activeFires();
    if (torchHeld()) fires.push({ x: player.pos.x, z: player.pos.z });
    const threat = Math.min(10, world.day + (world.day % 3 === 0 ? 2 : 0));
    if (world.night) {
      game.raidTimer -= dt;
      const wolfCount = animals.list.filter((a) => a.kind === 'wolf').length;
      const maxWolves = 5 + Math.min(7, Math.ceil(world.day / 2)) + (world.day % 3 === 0 ? 2 : 0);
      if (game.raidTimer <= 0 && wolfCount < maxWolves) {
        animals.spawnNear('wolf', player.pos);
        game.raidTimer = Math.max(12, 34 - world.day * 2) * (world.day % 3 === 0 ? 0.65 : 1);
        ui.toast('Du hörst ein Rudel in der Dunkelheit…', 'hint');
        sfx.growl();
      }
    }
    animals.update(dt, {
      playerPos: player.pos,
      night: world.night,
      threat,
      fires,
      animalObstacles: [...buildings.animalObstacles, ...landmarks.obstacles],
      time: now / 1000,
      hurtPlayer: (n, cause) => player.damage(n, cause),
    });
    aquatics.update(dt, now / 1000);
    effects.update(dt);
    updateFlyingArrows(dt);
    const discovery = landmarks.update(player.pos, game.discoveries);
    if (discovery) discoverLandmark(discovery);
    updateHUD();
  } else {
    // Pause/Craft/Tod: Welt einfrieren, aber weiter rendern
    buildings.update(dt, world.wind);
    effects.update(dt);
    if (game.state === 'dead') ui.setRespawnCountdown(game.respawnAt - Date.now());
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const targetFps = game.state === 'playing' ? (lowPowerDevice ? 45 : 60) : game.state === 'menu' ? 30 : 15;
  if (now - last < 1000 / targetFps - 1) return;
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  tick(dt);

  // Auf langsameren Geräten Renderauflösung einmalig schrittweise reduzieren.
  renderedFrames++;
  if (game.state === 'playing' && now - performanceWindowStart > 2500) {
    const measuredFps = renderedFrames * 1000 / (now - performanceWindowStart);
    if (measuredFps < targetFps * 0.78 && adaptivePixelRatio > 0.8) {
      adaptivePixelRatio = Math.max(0.8, adaptivePixelRatio - 0.15);
      renderer.setPixelRatio(adaptivePixelRatio);
      renderer.setSize(innerWidth, innerHeight, false);
    }
    renderedFrames = 0;
    performanceWindowStart = now;
  }
});

document.addEventListener('visibilitychange', () => {
  last = performance.now();
  renderedFrames = 0;
  performanceWindowStart = last;
});

// ---------- Start ----------
touch = new TouchControls(renderer.domElement, player, {
  primary: () => { if (game.state === 'playing') primaryAction(); },
  interact: () => { if (game.state === 'playing') interact(); },
  rotate: () => { if (game.state === 'playing') buildings.rotateGhost(); },
  toggleCraft: () => game.state === 'craft' ? closeCraft() : game.state === 'playing' && openCraft(),
  pause: () => {
    if (game.state !== 'playing') return;
    stopDesktopAction();
    game.state = 'paused';
    ui.showOverlay('pause');
    touch.show(false);
  },
});
player.touchInput = touch;
const hasSave = !!localStorage.getItem(SAVE_KEY);
ui.showOverlay('menu', { hasSave });
ui.showHud(false);
refreshInv();
updateTutorial(true);

// Intro-Musik im Titelmenü starten. Browser blockieren Autoplay ohne Geste –
// deshalb zusätzlich beim ersten Klick/Tastendruck erneut versuchen.
music.play();
function primeMusicOnGesture() {
  if (game.state === 'menu' && !sfx.muted) music.play();
  removeEventListener('pointerdown', primeMusicOnGesture);
  removeEventListener('keydown', primeMusicOnGesture);
}
addEventListener('pointerdown', primeMusicOnGesture);
addEventListener('keydown', primeMusicOnGesture);

// Debug-Zugriff in der Konsole
window.G = { game, world, player, animals, aquatics, landmarks, buildings, resources, scene, camera, addItem, tick, music };
