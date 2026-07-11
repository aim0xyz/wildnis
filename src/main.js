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

const SAVE_KEY = 'wildnis_save_v1';

// ---------- Setup ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 900);
scene.add(camera); // nötig, damit das Werkzeug in der Hand gerendert wird

const ui = new UI();
const world = new World(scene);
const effects = new Effects(scene);
const resources = new Resources(scene);
const buildings = new Buildings(scene);
const animals = new Animals(scene, effects);
const player = new Player(camera);
let touch;

player.obstacleSets = [resources.obstacles, buildings.obstacles];

const game = {
  state: 'menu', // menu | playing | paused | craft | dead
  inv: {},
  hotbar: ['hand'],
  hotIdx: 0,
  spawn: { x: 0, z: 6 },
  firstNightHintShown: false,
  deathCause: '',
};

buildings.onTentPlaced = (x, z) => {
  game.spawn = { x, z: z + 2.2 };
  ui.toast('⛺ Spawnpunkt gesetzt!');
};

player.onDamage = (n) => {
  ui.damageFlash();
  sfx.hurt();
  if (player.hp <= 0 && game.state === 'playing') die('Ein Wolf hat dich erwischt. 🐺');
};

// ---------- Inventar ----------
function addItem(id, n = 1, silent = false) {
  game.inv[id] = (game.inv[id] || 0) + n;
  if (!silent) {
    ui.toast(`+${n} ${ITEMS[id].icon} ${ITEMS[id].name}`);
    sfx.pickup();
  }
  refreshInv();
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
    touch.setActionIcon(def.type === 'food' ? '🍽️' : def.type === 'placeable' ? '🔨' : '👊');
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

function raycastTargets(range) {
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.far = range;
  const hits = ray.intersectObjects([resources.group, animals.group], true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.res && !o.userData.animal) o = o.parent;
    if (!o) continue;
    if (o.userData.res && !o.userData.res.alive) continue;
    return { obj: o, point: h.point };
  }
  return null;
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
    ui.toast(`🤢 ${def.name} roh gegessen… (-${-def.hp} ❤️)`);
  } else {
    ui.toast(`${def.icon} ${def.name} gegessen (+${def.hunger} 🍖)`);
  }
  sfx.eat();
}

function placeSelected(id) {
  const def = ITEMS[id];
  if (buildings.tryPlace(def.build)) {
    removeItem(id, 1);
    sfx.place();
    saveGame();
  }
}

function attack(toolId) {
  if (!player.swing()) return;
  sfx.attack();
  const range = toolId === 'speer' ? 4.6 : 3.4;
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
      ui.toast(`☠️ ${result.name} erlegt!`);
      for (const [id, n] of Object.entries(result.drops)) addItem(id, n);
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
  const fire = buildings.nearest('campfire', player.pos, 3.5);
  if (fire && (game.inv.fleisch_roh || 0) > 0) {
    removeItem('fleisch_roh', 1);
    addItem('fleisch', 1, true);
    ui.toast('🍖 Fleisch gebraten!');
    sfx.cook();
    refreshInv();
    return;
  }
  const tent = buildings.nearest('tent', player.pos, 3.2);
  if (tent && world.night) {
    world.sleep();
    player.hp = Math.min(100, player.hp + 25);
    player.hunger = Math.max(0, player.hunger - 8);
    ui.toast('😴 Gut geschlafen — ein neuer Morgen!');
    sfx.sleep();
    saveGame();
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
  ui.toast(`🛠️ ${def.icon} ${def.name} hergestellt!`);
  sfx.craft();
  ui.renderCraft(game.inv);
};

function openCraft() {
  game.state = 'craft';
  ui.renderCraft(game.inv);
  ui.showCraft(true);
  document.exitPointerLock();
  touch?.show(false);
}

function closeCraft() {
  resumePlaying();
  if (!touch?.enabled) lockPointer();
}

// ---------- Zustand / Overlays ----------
// Pointer-Lock ist optional: wenn der Browser ihn verweigert,
// läuft das Spiel trotzdem (Maus-Look über movementX/Y ohne Lock).
function lockPointer() {
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* Lock nicht verfügbar */ }
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
  game.state = 'dead';
  game.deathCause = cause;
  sfx.die();
  document.exitPointerLock();
  touch?.show(false);
  // pointerlockchange feuert danach — Zustand hier erneut setzen
  setTimeout(() => {
    game.state = 'dead';
    ui.showOverlay('dead', { days: world.day, cause });
  }, 50);
}

function respawn() {
  player.hp = 100;
  player.hunger = 60;
  player.pos.set(game.spawn.x, terrainHeight(game.spawn.x, game.spawn.z), game.spawn.z);
  player.vel.set(0, 0, 0);
}

// ---------- Speichern / Laden ----------
function saveGame() {
  if (game.state === 'menu') return;
  const data = {
    inv: game.inv,
    hp: player.hp,
    hunger: player.hunger,
    day: world.day,
    t: world.t,
    pos: { x: player.pos.x, z: player.pos.z },
    spawn: game.spawn,
    buildings: buildings.serialize(),
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
    world.day = data.day ?? 1;
    world.t = data.t ?? 0.3;
    game.spawn = data.spawn || { x: 0, z: 6 };
    player.pos.set(data.pos?.x ?? 0, 0, data.pos?.z ?? 6);
    player.pos.y = terrainHeight(player.pos.x, player.pos.z);
    buildings.load(data.buildings);
    refreshInv();
    return true;
  } catch {
    return false;
  }
}

function newGame() {
  localStorage.removeItem(SAVE_KEY);
  game.inv = { beeren: 2 };
  game.spawn = { x: 0, z: 6 };
  world.day = 1;
  world.t = 0.3;
  player.hp = 100;
  player.hunger = 100;
  player.pos.set(0, terrainHeight(0, 6), 6);
  refreshInv();
  setTimeout(() => { if (game.state === 'playing') ui.toast('🌳 Schlage Bäume für Holz (Linksklick)'); }, 1500);
  setTimeout(() => { if (game.state === 'playing') ui.toast('🛠️ Öffne Crafting mit TAB oder C'); }, 5000);
  setTimeout(() => { if (game.state === 'playing') ui.toast('🫐 Beerensträucher stillen den Hunger'); }, 9000);
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
      ui.toast(sfx.muted ? '🔇 Ton aus' : '🔊 Ton an');
    } else if (/^Digit[1-9]$/.test(e.code)) selectSlot(+e.code.slice(5) - 1);
    else if (e.code === 'Escape' && !document.pointerLockElement) {
      game.state = 'paused';
      ui.showOverlay('pause');
    }
  } else if (game.state === 'craft' && (e.code === 'KeyC' || e.code === 'Tab' || e.code === 'Escape')) {
    closeCraft();
  }
});

addEventListener('mousedown', (e) => {
  if (e.button !== 0 || game.state !== 'playing') return;
  if (e.target !== renderer.domElement) return; // UI-Klicks nicht abfangen
  primaryAction();
});

addEventListener('wheel', (e) => {
  if (game.state !== 'playing' || game.hotbar.length < 2) return;
  const d = e.deltaY > 0 ? 1 : -1;
  selectSlot((game.hotIdx + d + game.hotbar.length) % game.hotbar.length);
});

addEventListener('contextmenu', (e) => e.preventDefault());

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
  ui.setBars(player.hp, player.hunger, starving);
  ui.setClock(world.day, world.elevation);

  // Ziel unterm Fadenkreuz
  const t = raycastTargets(4.6);
  if (t) {
    if (t.obj.userData.res) {
      const names = { tree: '🌳 Baum', rock: '🪨 Stein', bush: '🫐 Beerenstrauch' };
      ui.target(names[t.obj.userData.res.kind]);
    } else if (t.obj.userData.animal) {
      const a = t.obj.userData.animal;
      ui.target(`${a.def.name} ❤️${a.hp}/${a.def.hp}`);
    }
  } else {
    ui.target(null);
  }

  // Kontext-Prompt
  let prompt = null;
  const fire = buildings.nearest('campfire', player.pos, 3.5);
  const tent = buildings.nearest('tent', player.pos, 3.2);
  if (fire && (game.inv.fleisch_roh || 0) > 0) prompt = 'E — Fleisch braten 🍖';
  else if (tent && world.night) prompt = 'E — Schlafen bis zum Morgen 😴';
  else if (ITEMS[selected()].type === 'placeable') prompt = 'Linksklick — Platzieren · R — Drehen';
  else if (starving) prompt = '⚠️ Du verhungerst! Iss etwas!';
  ui.prompt(prompt);
  touch?.setInteract((fire && (game.inv.fleisch_roh || 0) > 0) ? '🍖' : (tent && world.night) ? '😴' : null);
}

// ---------- Game-Loop ----------
let last = performance.now();
let menuAngle = 0;

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
      ui.toast('🌙 Die Nacht bricht herein… Wölfe werden aggressiv! 🐺', 'hint');
    }
    player.update(dt);
    const starve = player.updateStats(dt);
    if (player.hp <= 0) die(starve === 'starving' ? 'Du bist verhungert. 🍖' : 'Ein Wolf hat dich erwischt. 🐺');

    resources.update(dt);
    buildings.update(dt);
    buildings.updateGhost(camera, world.terrain);
    animals.update(dt, {
      playerPos: player.pos,
      night: world.night,
      fires: buildings.fires,
      time: now / 1000,
      hurtPlayer: (n) => player.damage(n),
    });
    effects.update(dt);
    updateHUD();
  } else {
    // Pause/Craft/Tod: Welt einfrieren, aber weiter rendern
    buildings.update(dt);
    effects.update(dt);
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  tick(dt);
});

// ---------- Start ----------
touch = new TouchControls(renderer.domElement, player, {
  primary: () => { if (game.state === 'playing') primaryAction(); },
  interact: () => { if (game.state === 'playing') interact(); },
  rotate: () => { if (game.state === 'playing') buildings.rotateGhost(); },
  toggleCraft: () => game.state === 'craft' ? closeCraft() : game.state === 'playing' && openCraft(),
  pause: () => {
    if (game.state !== 'playing') return;
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

// Debug-Zugriff in der Konsole
window.G = { game, world, player, animals, buildings, resources, scene, camera, addItem, tick };
