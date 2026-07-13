import * as THREE from 'three';
import { World, terrainHeight, terrainSlope, biomeAt, WATER_Y, WORLD_RADIUS } from './world.js';
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
const RESPAWN_WAIT = 20 * 1000;
const XP_LEVELS = [0, 100, 250, 450, 700, 1000, 1400];
const REGION_LEVELS = { meadow: 1, forest: 2, coast: 3, marsh: 4, alpine: 5 };
const TUTORIAL = [
  { text: 'Sammle mindestens 3 Holz.', icon: 'wood', done: () => (game.inv.holz || 0) >= 3 || (game.inv.axt || 0) > 0 || buildings.placed.length > 0 },
  { text: 'Stelle im Crafting-Menü eine Axt her.', icon: 'axe', done: () => (game.inv.axt || 0) > 0 || buildings.placed.length > 0 },
  { text: 'Baue ein Lagerfeuer.', icon: 'fire', done: () => buildings.placed.some((b) => b.type === 'campfire') },
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
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
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
  hungerWarning: false,
  boat: null,
  storage: null,
  fishing: false,
  eventTimer: 70,
  bottleWater: 0,
  expeditionEvent: null,
  hintsShown: {},
  xp: 0,
  level: 1,
  craftedOnce: [],
  visitedBiomes: ['meadow'],
  lastRewardDay: 1,
};

function levelForXP(xp) {
  let level = 1;
  while (level < XP_LEVELS.length && xp >= XP_LEVELS[level]) level++;
  return level;
}

function addXP(amount, reason = '') {
  if (!amount) return;
  const oldLevel = game.level;
  game.xp += amount;
  game.level = levelForXP(game.xp);
  const current = XP_LEVELS[game.level - 1] ?? XP_LEVELS.at(-1);
  const next = XP_LEVELS[game.level] ?? current;
  ui.setLevel(game.level, game.xp, current, next);
  if (game.level > oldLevel) {
    ui.toast(`LEVEL ${game.level} — neue Möglichkeiten freigeschaltet!`);
    sfx.craft();
    if (game.state === 'craft') ui.renderCraft(game.inv);
  } else if (reason) ui.toast(`+${amount} XP · ${reason}`);
}

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
function stackSize(id) {
  const type = ITEMS[id]?.type;
  return ['tool', 'gear', 'armor'].includes(type) ? 1 : type === 'placeable' ? 10 : 20;
}
function inventoryCapacity(inv = game.inv) { return (inv.grosser_rucksack || 0) > 0 ? 28 : 16; }
function inventoryUsed(inv = game.inv) {
  return Object.entries(inv).reduce((sum, [id, n]) => {
    // Werkzeuge liegen in den festen Slots des Werkzeuggürtels und blockieren
    // deshalb keinen zusätzlichen Platz im eigentlichen Rucksack.
    if (ITEMS[id]?.type === 'tool') return sum;
    return sum + (n > 0 ? Math.ceil(n / stackSize(id)) : 0);
  }, 0);
}
function capacityInfo() { return { used: inventoryUsed(), max: inventoryCapacity() }; }
ui.capacityProvider = capacityInfo;

function addItem(id, n = 1, silent = false) {
  let accepted = 0;
  while (accepted < n) {
    const next = (game.inv[id] || 0) + 1;
    const before = game.inv[id] || 0;
    game.inv[id] = next;
    if (inventoryUsed() > inventoryCapacity()) { game.inv[id] = before; break; }
    accepted++;
  }
  if (!accepted) { if (!silent) ui.toast('Rucksack voll!', 'hint'); return 0; }
  if (!silent) {
    ui.toast(`+${accepted} ${ITEMS[id].name}`);
    sfx.pickup();
  }
  refreshInv();
  updateTutorial();
  showUnlockHint(id);
  return accepted;
}

function showUnlockHint(id) {
  if (game.hintsShown[id]) return;
  const hints = {
    lagerfeuer: 'Neu: Wähle das Lagerfeuer unten aus und platziere es mit Linksklick.',
    holzwand: 'Bauteile kannst du vor dem Platzieren mit R drehen.',
    werkbank: 'Werkbank freigeschaltet: Stelle sie auf und benutze sie mit E.',
    floss: 'Floß freigeschaltet: Auf Wasser platzieren, mit E einsteigen.',
    feldflasche: 'Feldflasche: Mit E am Regenfänger füllen, mit V trinken.',
    truhe: 'Holztruhe: Mit E öffnen und Vorräte durch Antippen verschieben.',
  };
  if (!hints[id] || game.state !== 'playing') return;
  game.hintsShown[id] = true;
  setTimeout(() => game.state === 'playing' && ui.toast(hints[id], 'hint'), 500);
}

function updateTutorial(silent = false) {
  const before = game.tutorialStage;
  while (game.tutorialStage < TUTORIAL.length && TUTORIAL[game.tutorialStage].done()) game.tutorialStage++;
  if (!silent && game.tutorialStage > before) addXP((game.tutorialStage - before) * 25, 'Aufgabe abgeschlossen');
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
  addXP(90, 'Ort entdeckt');
  if (game.discoveries.length === 1) setTimeout(() => ui.toast('Neu: Mit K öffnest du deine Erkundungskarte.', 'hint'), 1800);
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
  const current = XP_LEVELS[game.level - 1] ?? XP_LEVELS.at(-1);
  const next = XP_LEVELS[game.level] ?? current;
  ui.setLevel(game.level, game.xp, current, next);
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
  return ['fackel','laterne'].includes(selected()) && (game.inv[selected()] || 0) > 0;
}

// Atmosphäre: Regenpegel setzen, gelegentlich Vögel zwitschern lassen
let birdTimer = 5;
function updateAmbient(dt) {
  const rain = world.rainIntensity;
  sfx.setRain(rain * 0.09);
  sfx.setWind(Math.hypot(world.wind.x, world.wind.z));

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
  const lightId = selected();
  // Fackel brennt zeitbasiert herunter
  game.dura[lightId] = (game.dura[lightId] ?? ITEMS[lightId].dura) - dt;
  if (game.dura[lightId] <= 0) {
    delete game.dura[lightId];
    removeItem(lightId, 1);
    ui.toast(`${ITEMS[lightId].name} ist erloschen!`, 'hint');
    sfx.hurt();
    return;
  }
  torchLight.visible = true;
  torchLight.position.set(camera.position.x, camera.position.y + 0.1, camera.position.z);
  torchLight.intensity = (lightId === 'laterne' ? 3 : 2) * (0.85 + Math.sin(performance.now() * 0.012) * 0.12 + Math.random() * 0.06);
  ui.updateDuraBar(lightId, game.dura[lightId] / ITEMS[lightId].dura);
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
  if (id === 'angel') return startFishing();
  attack(id);
}

function startFishing() {
  if (game.fishing) return;
  camera.getWorldDirection(spearDirection);
  const target = player.pos.clone().addScaledVector(spearDirection.setY(0).normalize(), 8);
  if (terrainHeight(target.x, target.z) > WATER_Y - 1.1) return ui.toast('Wirf die Angel in tiefes Wasser.', 'hint');
  game.fishing = true;
  ui.toast('Angel ausgeworfen…');
  setTimeout(() => {
    if (!game.fishing || game.state !== 'playing' || selected() !== 'angel') { game.fishing = false; return; }
    game.fishing = false;
    if (Math.random() < 0.72) { addItem('fleisch_roh', 1); ui.toast('Ein Fisch hat angebissen!'); sfx.pickup(); useDurability('angel'); }
    else ui.toast('Der Fisch ist entkommen.', 'hint');
  }, 2600 + Math.random() * 2200);
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
      addXP(result.xp || 15, `${result.name} erlegt`);
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
        addXP(result.xp || 15, `${result.name} erlegt`);
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
  if (toolId === 'metallaxt' || toolId === 'metallhacke') return 3;
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
  const chest = aimedBuildingOfType('chest', 3.5, aimedBuilding);
  if (chest) {
    if (chest.expeditionEvent) completeExpeditionEvent(chest);
    return openStorage(chest, chest.eventTitle || 'Holztruhe');
  }
  const bench = aimedBuildingOfType('workbench', 3.8, aimedBuilding);
  if (bench) return openCraft('workbench');
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
      const rawLeft = game.inv.fleisch_roh || 0;
      ui.toast(rawLeft > 0 ? `Fleisch gebraten · noch ${rawLeft} roh` : 'Letztes Fleisch gebraten · kein Holz nachgelegt.');
      if (rawLeft === 0) fire.cookingFinishedAt = performance.now();
      sfx.cook();
      refreshInv();
      return;
    }
    // … sonst mit Holz nachlegen
    if ((game.inv.holz || 0) > 0 && fire.fuel < fire.maxFuel) {
      // Schnelles Weiterdrücken nach dem letzten Fleisch darf nicht ungewollt
      // direkt ein Holzstück verbrauchen.
      if (fire.cookingFinishedAt && performance.now() - fire.cookingFinishedAt < 1600) {
        ui.toast('Kein rohes Fleisch mehr — Holz wurde nicht nachgelegt.', 'hint');
        return;
      }
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
    // Mitgeführte Feldflasche hat Vorrang: E füllt sie zuverlässig auf.
    if ((game.inv.feldflasche || 0) > 0 && game.bottleWater < 40 && catcher.water > 0) {
      const filled = buildings.drinkFrom(catcher, 40 - game.bottleWater);
      game.bottleWater += filled;
      ui.toast(`Feldflasche gefüllt · ${Math.round(game.bottleWater)}/40`);
      sfx.pickup();
      saveGame();
      return;
    }
    const water = buildings.drinkFrom(catcher, Math.min(30, Math.max(0, (100 - player.thirst) / 1.5)));
    if (water > 0) {
      player.thirst = Math.min(100, player.thirst + water * 1.5);
      ui.toast('Frisches Regenwasser getrunken.');
      sfx.eat();
      saveGame();
    } else ui.toast(catcher.water > 0 ? 'Du hast keinen Durst.' : 'Der Regenfänger ist noch leer.', 'hint');
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

function openStorage(container, title) {
  stopDesktopAction(); game.storage = container; game.state = 'storage';
  ui.renderStorage(title, game.inv, container.storage || (container.storage = {}), capacityInfo()); ui.showStorage(true);
  exitPointerLock(); touch?.show(false);
}
function closeStorage() { game.storage = null; ui.showStorage(false); resumePlaying(); if (!touch?.enabled) lockPointer(); }
function toggleMap(show = game.state !== 'map') {
  if (show) { stopDesktopAction(); game.state = 'map'; ui.showMap(true, player.pos, landmarks.list, game.discoveries, WORLD_RADIUS, player.yaw, game.expeditionEvent, game.level); exitPointerLock(); touch?.show(false); }
  else { ui.showMap(false); resumePlaying(); if (!touch?.enabled) lockPointer(); }
}
let radialX = 0, radialY = 0, radialChoice = 'hand';
function openRadial() {
  if (game.state !== 'playing') return;
  stopDesktopAction(); game.state = 'radial'; radialX = 0; radialY = 0; radialChoice = selected();
  const ids = game.hotbar.filter((id) => slotUsable(id, game.inv));
  ui.showRadial(true, ids, radialChoice);
}
function closeRadial() {
  if (game.state !== 'radial') return;
  ui.showRadial(false);
  const idx = game.hotbar.indexOf(radialChoice);
  if (idx >= 0) selectSlot(idx);
  game.state = 'playing';
}
addEventListener('mousemove', (e) => {
  if (game.state !== 'radial') return;
  if (document.pointerLockElement) { radialX += e.movementX; radialY += e.movementY; }
  else { radialX = e.clientX - innerWidth / 2; radialY = e.clientY - innerHeight / 2; }
  const max = 180, len = Math.hypot(radialX, radialY);
  if (len > max) { radialX *= max / len; radialY *= max / len; }
  radialChoice = ui.selectRadialByVector(radialX, radialY) || radialChoice;
});
ui.onStorageMove = (from, id, amount) => {
  const box = game.storage; if (!box) return;
  if (from === 'player') {
    const n = Math.min(amount || 0, game.inv[id] || 0); if (!n) return;
    if (['gear','armor'].includes(ITEMS[id]?.type)) { ui.toast('Ausgerüstete Gegenstände bleiben im Rucksack.', 'hint'); return; }
    box.storage[id] = (box.storage[id] || 0) + n; game.inv[id] -= n;
  } else {
    const n = Math.min(amount || 0, box.storage[id] || 0); const moved = addItem(id, n, true); box.storage[id] -= moved;
    if (moved < n) ui.toast('Rucksack voll!', 'hint');
  }
  refreshInv(); ui.renderStorage(box.type === 'raft' ? 'Floß-Laderaum' : 'Holztruhe', game.inv, box.storage, capacityInfo()); saveGame();
};

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
  if (game.level < (recipe.level || 1)) return ui.toast(`Dafür brauchst du Level ${recipe.level}.`, 'hint');
  if (recipe.station && ui.craftStation !== recipe.station) return ui.toast('Dieses Rezept benötigt eine Werkbank.', 'hint');
  for (const [id, n] of Object.entries(recipe.cost)) {
    if ((game.inv[id] || 0) < n) return;
  }
  const def = ITEMS[recipe.out];
  if (def.once && (game.inv[recipe.out] || 0) > 0) return;
  const amount = recipe.yield || 1;

  // Crafting ist atomar: erst den Zustand nach Verbrauch und Ausgabe prüfen.
  // Ist dafür kein Platz, bleiben sämtliche Zutaten unangetastet.
  const projected = { ...game.inv };
  for (const [id, n] of Object.entries(recipe.cost)) projected[id] = Math.max(0, (projected[id] || 0) - n);
  projected[recipe.out] = (projected[recipe.out] || 0) + amount;
  if (inventoryUsed(projected) > inventoryCapacity(projected)) {
    ui.toast(`Kein Platz für ${amount > 1 ? `${amount}× ` : ''}${def.name} — räume zuerst den Rucksack auf.`, 'hint');
    return;
  }

  for (const [id, n] of Object.entries(recipe.cost)) game.inv[id] = Math.max(0, (game.inv[id] || 0) - n);
  game.inv[recipe.out] = (game.inv[recipe.out] || 0) + amount;
  if (def.dura) game.dura[recipe.out] = def.dura; // neues Werkzeug: volle Haltbarkeit
  ui.toast(amount > 1 ? `${amount}× ${def.name} hergestellt!` : `${def.name} hergestellt!`);
  if (!game.craftedOnce.includes(recipe.out)) {
    game.craftedOnce.push(recipe.out);
    addXP(20, 'neue Herstellung');
  }
  sfx.craft();
  refreshInv();
  updateTutorial();
  ui.renderCraft(game.inv);
};

function openCraft(station = 'hand') {
  stopDesktopAction();
  game.state = 'craft';
  ui.craftStation = station;
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
  if (touch?.enabled) return;
  // Den Cursor sofort ausblenden. requestPointerLock() wird vom Browser
  // asynchron bestaetigt und kann deshalb nach einem Menue-Klick fuer einen
  // kurzen Moment noch den normalen Mauszeiger zeigen.
  renderer.domElement.classList.add('cursor-captured');
  // Re-Lock kann ein künstlich großes movementX/Y liefern; kurz ausblenden.
  player.ignoreLookUntil = performance.now() + 220;
  if (typeof renderer.domElement.requestPointerLock !== 'function') { player.allowUnlockedLook = true; return; }
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => { player.allowUnlockedLook = true; });
  } catch { player.allowUnlockedLook = true; }
}

function exitPointerLock() {
  renderer.domElement.classList.remove('cursor-captured');
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
    renderer.domElement.classList.add('cursor-captured');
    player.allowUnlockedLook = false;
    hadLock = true;
    resumePlaying();
  } else {
    renderer.domElement.classList.remove('cursor-captured');
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

function respawn(withPenalty = false) {
  if (withPenalty) {
    let lost = 0;
    for (const id of ['holz', 'stein', 'fell', 'beeren', 'fleisch_roh', 'fleisch', 'eisenerz', 'eisen']) {
      const amount = game.inv[id] || 0;
      const drop = Math.floor(amount * 0.25);
      if (drop > 0) { game.inv[id] -= drop; lost += drop; }
    }
    if (lost) setTimeout(() => ui.toast(`Bergung geglückt — ${lost} Vorräte gingen verloren.`, 'hint'), 500);
  }
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
  refreshInv();
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
  const bottleFactor = (game.inv.feldflasche || 0) > 0 ? 0.65 : 1;
  player.thirst = Math.max(0, player.thirst - (0.42 + movingDrain) * bottleFactor * dt);

  const altitude = terrainHeight(player.pos.x, player.pos.z);
  const nearWarmFire = !!buildings.nearest('campfire', player.pos, 6)?.lit;
  const hasCoat = (game.inv.pelzmantel || 0) > 0;
  let cold = Math.max(0, (altitude - 6) / 8);
  if (world.night) cold += 0.28;
  const sheltered = buildings.isSheltered(player.pos);
  if (world.rainIntensity > 0.2 && !sheltered) cold += world.rainIntensity * 0.45;
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
  if (player.hunger < 20 && !game.hungerWarning) {
    game.hungerWarning = true;
    ui.toast('Du hast großen Hunger — Beeren, Fisch oder gebratenes Fleisch helfen.', 'hint');
  } else if (player.hunger > 45) game.hungerWarning = false;

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

function updateWorldEvents(dt) {
  game.eventTimer -= dt;
  updateExpeditionEvent(dt);
  if (game.eventTimer > 0 || game.expeditionEvent) return;
  game.eventTimer = 130 + Math.random() * 150;
  const roll = Math.random();
  if (roll < 0.62) {
    spawnExpeditionEvent(world.night ? 'flare' : 'smoke');
  } else if (roll < 0.82) {
    for(let i=0;i<4;i++) animals.spawnNear('hirsch',player.pos,28,48);
    ui.toast('Eine Hirschwanderung zieht durch die Region.', 'hint');
  } else {
    world.weather='storm'; world.weatherTimer=35+Math.random()*25;
    ui.toast('Eine schwere Sturmfront zieht auf!', 'hint');
  }
}

function updateProgression() {
  const biome = biomeAt(player.pos.x, player.pos.z);
  const required = REGION_LEVELS[biome.id] || 1;
  if (!game.visitedBiomes.includes(biome.id)) {
    game.visitedBiomes.push(biome.id);
    addXP(35 + required * 10, `${biome.name} entdeckt`);
  }
  if (game.lastBiome !== biome.id) {
    game.lastBiome = biome.id;
    if (required > game.level) ui.toast(`${biome.name}: empfohlenes Level ${required} — erhöhte Gefahr!`, 'hint');
    else if (required > 1) ui.toast(`${biome.name} · Gefahrenstufe ${required}`, 'hint');
  }
  if (world.day > game.lastRewardDay) {
    game.lastRewardDay = world.day;
    addXP(60, 'Nacht überlebt');
  }
}

function compassDirection(x, z) {
  const a = Math.atan2(x - player.pos.x, -(z - player.pos.z));
  return ['N','NO','O','SO','S','SW','W','NW'][(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

function spawnExpeditionEvent(type) {
  let spot = null;
  for (let i = 0; i < 50; i++) {
    const a = Math.random() * Math.PI * 2, d = 65 + Math.random() * 70;
    const x = THREE.MathUtils.clamp(player.pos.x + Math.cos(a) * d, -WORLD_RADIUS + 15, WORLD_RADIUS - 15);
    const z = THREE.MathUtils.clamp(player.pos.z + Math.sin(a) * d, -WORLD_RADIUS + 15, WORLD_RADIUS - 15);
    const h = terrainHeight(x, z);
    if (h > 0.65 && h < 8 && terrainSlope(x, z) < 0.48) { spot = { x, z, h }; break; }
  }
  if (!spot) return;

  const group = new THREE.Group();
  group.position.set(spot.x, spot.h, spot.z);
  const smokeMat = new THREE.MeshStandardMaterial({ color: type === 'flare' ? 0xd94b35 : 0x454b48, transparent:true, opacity:.62, roughness:1 });
  for (let i = 0; i < 9; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(.7 + i * .11, 1), smokeMat.clone());
    puff.userData.baseY = 2 + i * 2.1; puff.userData.phase = i * .73;
    puff.position.set(Math.sin(i * 2.3) * .55, puff.userData.baseY, Math.cos(i * 1.7) * .55);
    group.add(puff);
  }
  if (type === 'flare') {
    const light = new THREE.PointLight(0xff3f28, 5, 38, 1.5); light.position.y = 10; group.add(light); group.userData.signalLight = light;
  }
  scene.add(group);

  const chest = buildings.place('chest', spot.x, spot.z, Math.random() * Math.PI * 2).userData.building;
  chest.storage = type === 'flare'
    ? { eisenerz: 4 + Math.floor(Math.random()*3), pfeil: 6, fleisch: 3, fell: 2 }
    : { eisenerz: 2 + Math.floor(Math.random()*3), holz: 6, fleisch: 2, beeren: 4 };
  chest.expeditionEvent = true;
  chest.eventTitle = type === 'flare' ? 'Notfall-Vorratskiste' : 'Verlassene Expeditionskiste';
  const guard = Math.random() < .45 ? 'baer' : Math.random() < .65 ? 'wildschwein' : 'wolf';
  const guardCount = guard === 'wolf' ? 3 : guard === 'wildschwein' ? 2 : 1;
  for (let i = 0; i < guardCount; i++) animals.spawnNear(guard, spot, 5, 10);

  game.expeditionEvent = { type, x:spot.x, z:spot.z, group, chest, remaining:180 };
  const dir = compassDirection(spot.x, spot.z);
  ui.toast(type === 'flare' ? `Ein rotes Notsignal leuchtet im ${dir}! Es wird nicht lange bleiben.` : `Eine Rauchsäule steigt im ${dir} auf. Dort stimmt etwas nicht.`, 'hint');
}

function updateExpeditionEvent(dt) {
  const e = game.expeditionEvent; if (!e) return;
  if (!buildings.placed.includes(e.chest)) {
    scene.remove(e.group);
    game.expeditionEvent = null;
    game.eventTimer = 100 + Math.random() * 80;
    ui.toast('Das Expeditionssignal ist erloschen.', 'hint');
    return;
  }
  e.remaining -= dt;
  const t = performance.now() * .001;
  e.group.children.forEach((p, i) => {
    if (p.userData.baseY == null) return;
    p.position.y = p.userData.baseY + Math.sin(t * .7 + p.userData.phase) * .45;
    p.position.x += Math.sin(t * .5 + i) * dt * .05;
    p.rotation.y += dt * .18;
  });
  if (e.group.userData.signalLight) e.group.userData.signalLight.intensity = 4 + Math.sin(t * 8) * 1.5;
  if (e.remaining <= 0) {
    scene.remove(e.group);
    if (buildings.placed.includes(e.chest) && Object.values(e.chest.storage || {}).some((n) => n > 0)) buildings.removeBuilding(e.chest);
    game.expeditionEvent = null;
    game.eventTimer = 100 + Math.random() * 80;
    ui.toast('Das Expeditionssignal ist verschwunden.', 'hint');
  }
}

function completeExpeditionEvent(chest) {
  const e = game.expeditionEvent;
  if (!e || e.chest !== chest) return;
  scene.remove(e.group);
  game.expeditionEvent = null;
  game.eventTimer = 110 + Math.random() * 90;
  chest.expeditionEvent = false;
  ui.toast('Expeditionssignal erreicht — sichere die Vorräte!');
}

// ---------- Speichern / Laden ----------
function saveGame(showFeedback = false) {
  // Im Menü gibt es nichts zu sichern. Im Tod-Zustand NICHT speichern: sonst
  // persistiert der Autosave hp=0, und beim nächsten Laden würde der Spieler mit
  // 0 Leben ins Spiel starten und sofort wieder sterben (Endlos-Todesschleife).
  if (game.state === 'menu' || game.state === 'dead') return;
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
    bottleWater: game.bottleWater,
    hintsShown: game.hintsShown,
    xp: game.xp,
    craftedOnce: game.craftedOnce,
    visitedBiomes: game.visitedBiomes,
    lastRewardDay: game.lastRewardDay,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (showFeedback) ui.saved();
  } catch {
    ui.saved(true);
  }
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
    game.bottleWater = data.bottleWater || 0;
    game.hintsShown = data.hintsShown || {};
    // Bestehende Spielstände erhalten rückwirkend XP für bereits erreichten Fortschritt.
    const migratedXP = (data.tutorialStage || 0) * 25 + (data.discoveries?.length || 0) * 90
      + Math.min(8, Object.keys(data.inv || {}).length) * 12;
    game.xp = Math.max(0, data.xp ?? migratedXP);
    game.level = levelForXP(game.xp);
    game.craftedOnce = Array.isArray(data.craftedOnce) ? data.craftedOnce : [];
    game.visitedBiomes = Array.isArray(data.visitedBiomes) ? data.visitedBiomes : ['meadow'];
    game.lastRewardDay = data.lastRewardDay || world.day;
    refreshInv();
    updateTutorial(true);
    return true;
  } catch {
    return false;
  }
}

function newGame() {
  localStorage.removeItem(SAVE_KEY);
  if (game.expeditionEvent?.group) scene.remove(game.expeditionEvent.group);
  buildings.clear();
  game.inv = { beeren: 2 };
  game.dura = {};
  game.spawn = { x: 0, z: 6 };
  game.tutorialStage = 0;
  game.discoveries = [];
  game.bottleWater = 0;
  game.hintsShown = {};
  game.xp = 0;
  game.level = 1;
  game.craftedOnce = [];
  game.visitedBiomes = ['meadow'];
  game.lastRewardDay = 1;
  game.expeditionEvent = null;
  game.eventTimer = 70;
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
  setTimeout(() => { if (game.state === 'playing') ui.toast('Öffne Crafting und Inventar mit C'); }, 5000);
  setTimeout(() => { if (game.state === 'playing') ui.toast('Beerensträucher stillen den Hunger'); }, 9000);
}

setInterval(() => saveGame(true), 30000);
addEventListener('pagehide', () => saveGame(false));

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
  // Escape verhält sich in allen Spielfenstern gleich: Das oberste Fenster
  // schließen und zurück ins Spiel. Titel- und Todesbildschirm bleiben davon
  // ausgenommen, damit sie nicht versehentlich übersprungen werden können.
  if (e.code === 'Escape' && !e.repeat) {
    if (game.state === 'craft') { closeCraft(); return; }
    if (game.state === 'storage') { closeStorage(); return; }
    if (game.state === 'map') { toggleMap(false); return; }
    if (game.state === 'radial') {
      radialChoice = selected(); // Escape verwirft eine noch nicht bestätigte Auswahl.
      closeRadial();
      if (!touch?.enabled) lockPointer();
      return;
    }
    if (game.state === 'paused') {
      resumePlaying();
      if (!touch?.enabled) lockPointer();
      return;
    }
  }
  if (e.code === 'KeyK' && !e.repeat && ['playing', 'map'].includes(game.state)) { toggleMap(); return; }
  if (game.state === 'playing') {
    if (e.code === 'Tab' && !e.repeat) { openRadial(); return; }
    if (e.code === 'KeyX' && game.boat) { openStorage(game.boat, 'Floß-Laderaum'); return; }
    if (e.code === 'KeyV' && (game.inv.feldflasche || 0) > 0) {
      if (game.bottleWater <= 0) ui.toast('Die Feldflasche ist leer.', 'hint');
      else { const sip=Math.min(22,game.bottleWater);game.bottleWater-=sip;player.thirst=Math.min(100,player.thirst+sip*1.7);ui.toast(`Feldflasche getrunken · ${Math.round(game.bottleWater)}/40`);sfx.eat(); }
      return;
    }
    if (e.code === 'KeyC') openCraft('hand');
    else if (e.code === 'KeyE') interact();
    else if (e.code === 'KeyR') buildings.rotateGhost();
    else if (e.code === 'Escape' && !document.pointerLockElement) {
      game.state = 'paused';
      ui.showOverlay('pause');
    }
  } else if (game.state === 'craft' && (e.code === 'KeyC' || e.code === 'Escape')) {
    closeCraft();
  } else if (game.state === 'storage' && (e.code === 'KeyE' || e.code === 'Escape')) {
    closeStorage();
  } else if (game.state === 'map' && e.code === 'Escape') toggleMap(false);
});
addEventListener('keyup', (e) => { if (e.code === 'Tab') { e.preventDefault(); closeRadial(); } });

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
  // Derselbe Klick entsperrt das Browser-Audio und startet das Spiel. Ein
  // zusätzlicher Bestätigungsklick im Titelmenü ist nicht erforderlich.
  startAudioForPlay();
  if (game.state === 'menu') {
    if (!loadGame()) newGame();
  } else if (game.state === 'dead') {
    if (Date.now() < game.respawnAt) return;
    respawn(true);
  }
  prerenderFirstFrame();
  resumePlaying();
  if (!touch?.enabled) lockPointer();
}

document.getElementById('btnPlay').addEventListener('click', startGame);

document.getElementById('craftClose').addEventListener('click', closeCraft);
document.getElementById('storageClose').addEventListener('click', closeStorage);
document.getElementById('mapClose').addEventListener('click', () => toggleMap(false));

document.getElementById('btnNew').addEventListener('click', () => {
  if (localStorage.getItem(SAVE_KEY) && !confirm('Neues Spiel starten? Dein bisheriger Spielstand wird unwiderruflich gelöscht.')) return;
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
  const nextLandmark = landmarks.list.filter((l) => !game.discoveries.includes(l.id)).sort((a,b) => Math.hypot(a.x-player.pos.x,a.z-player.pos.z)-Math.hypot(b.x-player.pos.x,b.z-player.pos.z))[0];
  let compass = '';
  const starterKind = game.tutorialStage === 0 ? 'tree' : game.tutorialStage === 1 && (game.inv.stein || 0) < 2 ? 'rock' : null;
  const starterResource = starterKind && resources.list.filter((r) => r.alive && r.kind === starterKind)
    .sort((a,b) => Math.hypot(a.x-player.pos.x,a.z-player.pos.z)-Math.hypot(b.x-player.pos.x,b.z-player.pos.z))[0];
  if (game.expeditionEvent) compass = `Signal ${compassDirection(game.expeditionEvent.x, game.expeditionEvent.z)} · ${Math.ceil(game.expeditionEvent.remaining)}s`;
  else if (starterResource) compass = `${starterKind === 'tree' ? 'Holz' : 'Stein'} ${compassDirection(starterResource.x, starterResource.z)}`;
  else if (nextLandmark) { const a = Math.atan2(nextLandmark.x-player.pos.x, -(nextLandmark.z-player.pos.z)); const dirs=['N','NO','O','SO','S','SW','W','NW']; compass = `Kompass ${dirs[(Math.round(a/(Math.PI/4))+8)%8]}`; }
  ui.setBiome(`${biomeAt(player.pos.x, player.pos.z).name}${buildings.isSheltered(player.pos) ? ' · geschützt' : ''}`, compass);
  ui.setThreat(world.night, Math.min(10, world.day), world.day % 3 === 0);

  // Ziel unterm Fadenkreuz
  const t = raycastTargets(selected() === 'bogen' ? 40 : 4.6);
  if (t) {
    if (t.obj.userData.res) {
      const names = { tree: 'Baum', rock: 'Stein', bush: 'Beerenstrauch' };
      ui.target(names[t.obj.userData.res.kind]);
    } else if (t.obj.userData.animal) {
      const a = t.obj.userData.animal;
      ui.target(`${a.def.name} · Stufe ${a.tier} · ${a.hp}/${a.maxHp} Gesundheit`);
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
  const chest = aimedBuildingOfType('chest', 3.5, aimedBuilding);
  const bench = aimedBuildingOfType('workbench', 3.8, aimedBuilding);
  const cave = landmarks.list.find((l) => l.id === 'schattenhoehle');
  const caveInside = cave && Math.abs(player.pos.x - cave.x) < 2.4 && player.pos.z - cave.z > -29 && player.pos.z - cave.z < 4;
  document.body.classList.toggle('insideCave', !!caveInside);
  document.body.classList.toggle('caveLit', !!caveInside && torchHeld());
  const aimedGate = aimedBuilding?.type === 'gate' ? aimedBuilding : null;
  const fireOut = fire && !fire.lit;
  const canRefuel = fire && fire.lit && fire.fuel < fire.maxFuel && (game.inv.holz || 0) > 0;
  if (game.boat) prompt = 'W/S — fahren · A/D — lenken · X — Laderaum · E — aussteigen';
  else if (player.swimming) prompt = player.underwater ? 'Q — tiefer tauchen · Leertaste — auftauchen' : 'Q — abtauchen · Leertaste — auftauchen';
  else if (aimedGate) prompt = `E — Tor ${aimedGate.open ? 'schließen' : 'öffnen'}`;
  else if (selected() === 'hammer' && aimedBuilding) prompt = 'Linksklick — Gebäude abbauen';
  else if (fireOut) prompt = (game.inv.holz || 0) > 0 ? 'E — Feuer mit Holz anfeuern' : 'Feuer erloschen — Holz zum Anfeuern nötig';
  else if (fire && (game.inv.fleisch_roh || 0) > 0) prompt = `E — Fleisch braten · ${game.inv.fleisch_roh}× rohes Fleisch`;
  else if (canRefuel) prompt = 'E — Holz nachlegen';
  else if (catcher) prompt = catcher.water > 1
    ? ((game.inv.feldflasche || 0) > 0 && game.bottleWater < 40
      ? `E — Feldflasche füllen (${Math.round(game.bottleWater)}/40) · Behälter ${Math.round(catcher.water)}%`
      : `E — Regenwasser trinken · ${Math.round(catcher.water)}%`)
    : 'Regenfänger leer — warte auf Regen';
  else if (raft) prompt = 'E — Floß besteigen';
  else if (chest) prompt = 'E — Holztruhe öffnen';
  else if (bench) prompt = 'E — Werkbank benutzen';
  else if (caveInside && !torchHeld()) prompt = 'In der Höhle ist es stockdunkel — wähle eine Fackel oder Laterne';
  else if (selected() === 'angel') prompt = 'Linksklick — Angel auswerfen';
  else if (tent && world.night) prompt = 'E — Schlafen bis zum Morgen';
  else if (ITEMS[selected()].type === 'placeable') prompt = 'Linksklick — Platzieren · R — Drehen';
  else if (player.thirst <= 8) prompt = 'KRITISCH: Du verdurstest — finde Wasser!';
  else if (player.warmth <= 10) prompt = 'KRITISCH: Du erfrierst — suche Schutz oder Feuer!';
  else if (starving) prompt = 'Du verhungerst! Iss etwas!';
  ui.prompt(prompt);
  const interactHint = aimedGate ? 'gate'
    : fireOut ? 'food'
    : (fire && fire.lit && (game.inv.fleisch_roh || 0) > 0) ? 'food'
    : canRefuel ? 'food'
    : catcher ? 'food'
    : raft ? 'gate'
    : chest || bench ? 'craft'
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
    updateProgression();
    document.body.classList.toggle('underwater', player.underwater);
    touch?.setSwimming(player.swimming);
    updateFireDamage(dt);
    const starve = player.updateStats(dt);
    const survival = updateSurvival(dt);
    updateWorldEvents(dt);
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
      playerYaw: player.yaw,
      night: world.night,
      threat,
      playerLevel: game.level,
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

// Die Intro-Musik wird unmittelbar mit dem Titelmenü angefordert. Manche Browser
// erzwingen trotzdem eine erste Nutzerinteraktion; die Listener darunter sind
// nur der automatische Fallback für diesen nicht vom Spiel umgehbaren Schutz.
music.play();
function primeMusicOnGesture() {
  // Solange wir im Menü sind, versucht JEDE Geste die Musik anzustoßen. Lehnt der
  // Autoplay-Schutz den ersten play()-Versuch ab, greift so einfach der nächste
  // Klick/Tastendruck. (Früher wurden die Listener schon nach dem ersten Versuch
  // entfernt – schlug der fehl, blieb die Musik dauerhaft stumm.)
  if (game.state !== 'menu' || sfx.muted) return;
  music.play();
}
addEventListener('pointerdown', primeMusicOnGesture);
addEventListener('keydown', primeMusicOnGesture);

// Debug-Zugriff in der Konsole
window.G = { game, world, player, animals, aquatics, landmarks, buildings, resources, scene, camera, addItem, tick, music };
