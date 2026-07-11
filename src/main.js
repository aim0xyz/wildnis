import * as THREE from 'three';
import { World, terrainHeight } from './world.js';
import { Resources } from './resources.js';
import { Buildings } from './buildings.js';
import { Animals } from './animals.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { ITEMS, HOTBAR_ORDER } from './items.js';
import { sfx } from './sfx.js';
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
};

buildings.onTentPlaced = (x, z) => {
  game.spawn = { x, z: z + 2.2 };
  ui.toast('Spawnpunkt gesetzt!');
};

player.onDamage = (n, cause) => {
  ui.damageFlash();
  sfx.hurt();
  if (player.hp <= 0 && game.state === 'playing') die(cause || 'Ein Wolf hat dich erwischt.');
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
    addItem('fackel', 2, true);
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

function refreshInv() {
  const selId = game.hotbar[game.hotIdx];
  game.hotbar = HOTBAR_ORDER.filter((id) => id === 'hand' || (game.inv[id] || 0) > 0);
  const newIdx = game.hotbar.indexOf(selId);
  game.hotIdx = newIdx >= 0 ? newIdx : 0;
  ui.renderHotbar(game.hotbar, game.hotIdx, game.inv);
  ui.setMaterials(game.inv);
  if (game.state === 'craft') ui.renderCraft(game.inv);
  syncSelection();
}

function selected() {
  return game.hotbar[game.hotIdx] || 'hand';
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
  game.hotIdx = i;
  ui.renderHotbar(game.hotbar, game.hotIdx, game.inv);
  ui.showSelName(ITEMS[selected()].name);
  syncSelection();
}

ui.onSelectSlot = selectSlot;

// ---------- Aktionen ----------
const ray = new THREE.Raycaster();
const flyingSpears = [];
const spearDirection = new THREE.Vector3();

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

function primaryAction() {
  const id = selected();
  const def = ITEMS[id];
  if (def.type === 'food') return eatItem(id);
  if (def.type === 'placeable') return placeSelected(id);
  attack(id);
}

function eatItem(id) {
  if ((game.inv[id] || 0) <= 0) return;
  const def = ITEMS[id];
  removeItem(id, 1);
  player.hunger = Math.min(100, player.hunger + def.hunger);
  if (def.hp > 0) player.hp = Math.min(100, player.hp + def.hp);
  if (def.hp < 0) {
    player.damage(-def.hp);
    ui.toast(`${def.name} roh gegessen… (-${-def.hp} Gesundheit)`);
  } else {
    ui.toast(`${def.name} gegessen (+${def.hunger} Hunger)`);
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
    saveGame();
    return;
  }
  if (toolId === 'speer') {
    throwSpear();
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
  }
}

function throwSpear() {
  camera.getWorldDirection(spearDirection);
  const dir = spearDirection.clone().normalize();
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.03, 1.35, 6),
    new THREE.MeshStandardMaterial({ color: 0x80542f, roughness: 1 })
  );
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.065, 0.24, 6),
    new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.7 })
  );
  tip.position.y = 0.78;
  g.add(shaft, tip);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.position.copy(camera.position).addScaledVector(dir, 0.8).add(new THREE.Vector3(0, -0.12, 0));
  scene.add(g);
  flyingSpears.push({ group: g, dir, distance: 0, speed: 24 });
}

function updateFlyingSpears(dt) {
  for (let i = flyingSpears.length - 1; i >= 0; i--) {
    const spear = flyingSpears[i];
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
      ui.toast('Fisch mit dem Speer gefangen!');
      scene.remove(spear.group);
      flyingSpears.splice(i, 1);
      continue;
    }

    if (animal && animals.list.includes(animal)) {
      sfx.hit();
      const result = animals.hit(animal, toolIdDamage('speer'), spear.dir);
      if (result.killed) {
        ui.toast(`${result.name} erlegt!`);
        for (const [id, n] of Object.entries(result.drops)) addItem(id, n);
      }
      scene.remove(spear.group);
      flyingSpears.splice(i, 1);
      continue;
    }

    spear.group.position.addScaledVector(spear.dir, step);
    spear.distance += step;
    const ground = terrainHeight(spear.group.position.x, spear.group.position.z);
    if (spear.distance >= 30 || spear.group.position.y <= ground + 0.08) {
      scene.remove(spear.group);
      flyingSpears.splice(i, 1);
    }
  }
}

function toolIdDamage(toolId) {
  if (toolId === 'speer') return 5;
  if (toolId === 'axt' || toolId === 'spitzhacke') return 2;
  return 1;
}

// E — Interagieren (Kochen / Schlafen)
function interact() {
  const aimedBuilding = raycastBuilding();
  if (aimedBuilding?.type === 'gate') {
    buildings.toggleGate(aimedBuilding);
    ui.toast(aimedBuilding.open ? 'Tor geöffnet.' : 'Tor geschlossen.');
    sfx.place();
    saveGame();
    return;
  }
  const fire = buildings.nearest('campfire', player.pos, 3.5);
  if (fire && (game.inv.fleisch_roh || 0) > 0) {
    removeItem('fleisch_roh', 1);
    addItem('fleisch', 1, true);
    ui.toast('Fleisch gebraten!');
    sfx.cook();
    refreshInv();
    return;
  }
  const tent = buildings.nearest('tent', player.pos, 3.2);
  if (tent && world.night) {
    game.state = 'sleeping';
    stopDesktopAction();
    sfx.sleep();
    ui.sleepTransition(() => {
      world.sleep();
      player.hp = Math.min(100, player.hp + 25);
      player.hunger = Math.max(0, player.hunger - 8);
      saveGame();
    }, () => {
      game.state = 'playing';
      ui.toast('Gut geschlafen — ein neuer Morgen!');
    });
  }
}

// ---------- Crafting ----------
ui.onCraft = (recipe) => {
  for (const [id, n] of Object.entries(recipe.cost)) {
    if ((game.inv[id] || 0) < n) return;
  }
  const def = ITEMS[recipe.out];
  if (def.once && (game.inv[recipe.out] || 0) > 0) return;
  for (const [id, n] of Object.entries(recipe.cost)) removeItem(id, n);
  addItem(recipe.out, 1, true);
  ui.toast(`${def.name} hergestellt!`);
  sfx.craft();
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
  player.hp = 100;
  player.hunger = 60;
  player.oxygen = 100;
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

// ---------- Speichern / Laden ----------
function saveGame() {
  if (game.state === 'menu') return;
  const data = {
    inv: game.inv,
    hp: player.hp,
    hunger: player.hunger,
    oxygen: player.oxygen,
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
    player.hp = data.hp ?? 100;
    player.hunger = data.hunger ?? 100;
    player.oxygen = data.oxygen ?? 100;
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
  game.spawn = { x: 0, z: 6 };
  game.tutorialStage = 0;
  game.discoveries = [];
  world.day = 1;
  world.t = 0.3;
  player.hp = 100;
  player.hunger = 100;
  player.oxygen = 100;
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
  if (game.state === 'playing') {
    if (e.code === 'KeyC' || e.code === 'Tab') openCraft();
    else if (e.code === 'KeyE') interact();
    else if (e.code === 'KeyR') buildings.rotateGhost();
    else if (e.code === 'KeyM') {
      sfx.muted = !sfx.muted;
      ui.toast(sfx.muted ? 'Ton aus' : 'Ton an');
    } else if (/^Digit[1-9]$/.test(e.code)) selectSlot(+e.code.slice(5) - 1);
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
  selectSlot((game.hotIdx + d + game.hotbar.length) % game.hotbar.length);
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
function startGame() {
  sfx.unlock();
  if (game.state === 'menu') {
    if (!loadGame()) newGame();
  } else if (game.state === 'dead') {
    if (Date.now() < game.respawnAt) return;
    respawn();
  }
  resumePlaying();
  if (!touch?.enabled) lockPointer();
}

document.getElementById('btnPlay').addEventListener('click', startGame);

document.getElementById('craftClose').addEventListener('click', closeCraft);

document.getElementById('btnNew').addEventListener('click', () => {
  sfx.unlock();
  newGame();
  respawn();
  player.hunger = 100;
  resumePlaying();
  if (!touch?.enabled) lockPointer();
});

// ---------- HUD-Update ----------
function updateHUD() {
  const starving = player.hunger <= 0;
  ui.setBars(player.hp, player.hunger, starving, player.oxygen, player.swimming || player.oxygen < 100);
  ui.setClock(world.day, world.elevation);

  // Ziel unterm Fadenkreuz
  const t = raycastTargets(selected() === 'speer' ? 30 : 4.6);
  if (t) {
    if (t.obj.userData.res) {
      const names = { tree: 'Baum', rock: 'Stein', bush: 'Beerenstrauch' };
      ui.target(names[t.obj.userData.res.kind]);
    } else if (t.obj.userData.animal) {
      const a = t.obj.userData.animal;
      ui.target(`${a.def.name} · ${a.hp}/${a.def.hp} Gesundheit`);
    } else if (t.obj.userData.fish) {
      ui.target('Fisch · mit dem Speer jagen');
    }
  } else {
    ui.target(null);
  }

  // Kontext-Prompt
  let prompt = null;
  const fire = buildings.nearest('campfire', player.pos, 3.5);
  const tent = buildings.nearest('tent', player.pos, 3.2);
  const aimedBuilding = raycastBuilding();
  const aimedGate = aimedBuilding?.type === 'gate' ? aimedBuilding : null;
  if (player.swimming) prompt = player.underwater ? 'Q — tiefer tauchen · Leertaste — auftauchen' : 'Q — abtauchen · Leertaste — auftauchen';
  else if (aimedGate) prompt = `E — Tor ${aimedGate.open ? 'schließen' : 'öffnen'}`;
  else if (selected() === 'hammer' && aimedBuilding) prompt = 'Linksklick — Gebäude abbauen';
  else if (fire && (game.inv.fleisch_roh || 0) > 0) prompt = 'E — Fleisch braten';
  else if (tent && world.night) prompt = 'E — Schlafen bis zum Morgen';
  else if (ITEMS[selected()].type === 'placeable') prompt = 'Linksklick — Platzieren · R — Drehen';
  else if (starving) prompt = 'Du verhungerst! Iss etwas!';
  ui.prompt(prompt);
  touch?.setInteract(aimedGate ? 'gate' : (fire && (game.inv.fleisch_roh || 0) > 0) ? 'food' : (tent && world.night) ? 'tent' : null);
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

  if (game.state === 'menu') {
    // Kamerafahrt im Hauptmenü
    menuAngle += dt * 0.06;
    camera.position.set(Math.cos(menuAngle) * 40, 26, Math.sin(menuAngle) * 40);
    camera.lookAt(0, 2, 0);
    world.update(dt * 0.4, camera.position);
    buildings.update(dt);
    effects.update(dt);
  } else if (game.state === 'playing') {
    world.update(dt, player.pos);
    if (world.nightfall && !game.firstNightHintShown) {
      game.firstNightHintShown = true;
      ui.toast('Die Nacht bricht herein… Wölfe werden aggressiv!', 'hint');
    }
    player.update(dt);
    document.body.classList.toggle('underwater', player.underwater);
    touch?.setSwimming(player.swimming);
    updateFireDamage(dt);
    const starve = player.updateStats(dt);
    if (player.hp <= 0) die(starve === 'starving' ? 'Du bist verhungert.' : starve === 'drowning' ? 'Du bist ertrunken.' : 'Ein Wolf hat dich erwischt.');

    resources.update(dt);
    buildings.update(dt);
    buildings.updateGhost(camera, world.terrain);
    animals.update(dt, {
      playerPos: player.pos,
      night: world.night,
      fires: buildings.fires,
      animalObstacles: [...buildings.animalObstacles, ...landmarks.obstacles],
      time: now / 1000,
      hurtPlayer: (n) => player.damage(n),
    });
    aquatics.update(dt, now / 1000);
    effects.update(dt);
    updateFlyingSpears(dt);
    const discovery = landmarks.update(player.pos, game.discoveries);
    if (discovery) discoverLandmark(discovery);
    updateHUD();
  } else {
    // Pause/Craft/Tod: Welt einfrieren, aber weiter rendern
    buildings.update(dt);
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

// Debug-Zugriff in der Konsole
window.G = { game, world, player, animals, aquatics, landmarks, buildings, resources, scene, camera, addItem, tick };
