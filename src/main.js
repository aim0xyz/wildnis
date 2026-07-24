import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World, terrainHeight, terrainSlope, biomeAt, WATER_Y, WORLD_RADIUS } from './world.js';
import { Resources } from './resources.js';
import { Buildings } from './buildings.js';
import { Animals } from './animals.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { ITEMS, HOTBAR_FIXED_COUNT, TOOL_UPGRADES, buildHotbar, slotUsable, isBodyCarried, occupiesInventorySlot } from './items.js';
import { CAMPFIRE_WOOD_FUEL } from './buildings.js';
import { sfx } from './sfx.js';
import { Music } from './music.js';
import { TouchControls } from './touch.js';
import { Aquatics } from './aquatics.js';
import { Landmarks, LANDMARK_COUNT, BEACON_COUNT, DEFINITIONS as LANDMARK_DEFINITIONS } from './landmarks.js';
import { cloud } from './cloud.js';
import { multiplayer } from './multiplayer.js';
import {
  IS_CRAZYGAMES, initPlatform, loadingStart, loadingStop,
  gameplayStart, gameplayStop, happytime, cloudGet, cloudSet, cloudRemove,
  getCrazyUser, onCrazyAuthChange, showCrazyAuthPrompt, isCrazyAuthAvailable,
  getInviteParam, showInviteButton, hideInviteButton, isInstantMultiplayer,
  createInviteLink, updateRoom, leftRoom, onJoinRoom,
  platformMuteAudio, onPlatformMuteChange,
} from './platform.js';
import { createBroadcastClient, localGuestId, isBroadcastConfigured } from './coopCrazy.js';
import { RemoteAvatar } from './remoteAvatar.js';
// `t` heißt hier `tr`: main.js benutzt `t` an mehreren Stellen als lokale
// Variable (Raycast-Treffer, Zeitwerte) — der Alias verhindert Shadowing.
import { t as tr, onLangChange, initI18nDom } from './i18n.js';

const SAVE_KEY = 'wildnis_save_v1';
const CAMERA_MODE_KEY = 'wildnis_camera_mode_v1';
const RESPAWN_WAIT = 20 * 1000;
// 20 langfristige Level. Die Abstände wachsen stetig, damit hohe Level ein
// Langzeitziel bleiben und nicht durch wenige wiederholte Aktionen entstehen.
const XP_LEVELS = [
  0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3250,
  4150, 5200, 6400, 7750, 9250, 10900, 12700, 14650, 16750, 19000,
];
const LEVEL_STAT_BONUS = .05;
const LEVEL_UNLOCKS = {
  2: 'unlock.2', 3: 'unlock.3', 4: 'unlock.4', 5: 'unlock.5', 6: 'unlock.6',
  7: 'unlock.7', 8: 'unlock.8', 9: 'unlock.9', 10: 'unlock.10', 11: 'unlock.11',
  12: 'unlock.12', 13: 'unlock.13', 14: 'unlock.14', 15: 'unlock.15',
  16: 'unlock.16', 17: 'unlock.17', 19: 'unlock.19',
};
const REGION_LEVELS = { meadow: 1, forest: 2, coast: 3, marsh: 4, alpine: 5 };
const TUTORIAL = [
  { text: 'tut.wood', icon: 'wood', done: () => (game.inv.holz || 0) >= 3 || (game.inv.axt || 0) > 0 || buildings.placed.length > 0 },
  { text: 'tut.axe', icon: 'axe', done: () => (game.inv.axt || 0) > 0 || buildings.placed.length > 0 },
  { text: 'tut.fire', icon: 'fire', done: () => buildings.placed.some((b) => b.type === 'campfire') },
  { text: 'tut.wall', icon: 'wall', done: () => buildings.placed.some((b) => ['wall', 'gate'].includes(b.type)) },
  { text: 'tut.gate', icon: 'gate', done: () => buildings.placed.some((b) => b.type === 'gate') },
  { text: 'tut.hammer', icon: 'hammer', done: () => (game.inv.hammer || 0) > 0 },
];

// ---------- Setup ----------
const lowPowerDevice = matchMedia('(pointer: coarse), (hover: none)').matches || navigator.hardwareConcurrency <= 4;
const basePixelRatio = Math.min(devicePixelRatio, lowPowerDevice ? 1.15 : 1.5);
const renderer = new THREE.WebGLRenderer({ antialias: !lowPowerDevice });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(basePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = lowPowerDevice ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
// Statische und langsam bewegte Schatten müssen nicht 50–60 Mal pro Sekunde
// neu gerendert werden. Eine eigene Taktung unten senkt die GPU-Last deutlich.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 900);
scene.add(camera); // nötig, damit das Werkzeug in der Hand gerendert wird

function buildBikeCockpit() {
  const group=new THREE.Group();
  const metal=new THREE.MeshStandardMaterial({color:0x59656b,roughness:.58,metalness:.38});
  const darkMetal=new THREE.MeshStandardMaterial({color:0x30383b,roughness:.7,metalness:.24});
  const rubber=new THREE.MeshStandardMaterial({color:0x171b1b,roughness:.98});
  const skin=new THREE.MeshStandardMaterial({color:0xd39a6a,roughness:.9});
  const sleeve=new THREE.MeshStandardMaterial({color:0x667457,roughness:.96});
  const rod=(length,radius,material,x,y,z,rx=0,rz=0)=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,10),material);
    mesh.position.set(x,y,z);mesh.rotation.set(rx,0,rz);group.add(mesh);return mesh;
  };
  // Vorbau und Querlenker liegen bewusst im unteren Drittel des Sichtfelds.
  rod(.62,.035,metal,0,-.04,.13,Math.PI/2);
  rod(.88,.032,metal,0,0,-.1,0,Math.PI/2);
  for(const side of[-1,1]){
    rod(.22,.055,rubber,side*.5,0,-.1,0,Math.PI/2);
    const brake=new THREE.Mesh(new THREE.BoxGeometry(.18,.025,.055),darkMetal);
    brake.position.set(side*.34,-.075,-.18);brake.rotation.z=side*.16;group.add(brake);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.085,10,7),skin);
    hand.scale.set(1.2,.68,.88);hand.position.set(side*.49,.015,-.07);group.add(hand);
    const arm=rod(.52,.082,sleeve,side*.55,-.28,.12,.28,side*.12);
    arm.scale.z=.9;
  }
  const clamp=new THREE.Mesh(new THREE.BoxGeometry(.16,.09,.2),darkMetal);
  clamp.position.set(0,-.025,-.015);clamp.rotation.x=-.1;group.add(clamp);
  // Zwei dünne Bremszüge laufen vom Lenker nach vorn zum Rahmen.
  for(const side of[-1,1]){
    const curve=new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(side*.34,-.02,-.12),new THREE.Vector3(side*.2,-.22,-.35),new THREE.Vector3(side*.08,-.48,-.62),
    );
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,12,.008,5,false),darkMetal));
  }
  group.position.set(0,-.42,-.98);
  group.visible=false;
  camera.add(group);
  return group;
}

const bikeCockpit=buildBikeCockpit();

// ---------- Post-Processing ----------
// Nur auf leistungsfähigen Geräten: HDR-Bloom lässt Sonne, Lagerfeuer und
// Glühwürmchen tatsächlich leuchten; das Grading-Pass ergänzt Vignette,
// Sättigung und eine tageszeitabhängige Farbtemperatur. Das 4x-MSAA-Target
// erhält die Kantenglättung, die der Canvas-Framebuffer im Composer verliert.
const GRADE_DUSK = new THREE.Color(1.1, 0.96, 0.87);
const GRADE_NIGHT = new THREE.Color(0.9, 0.97, 1.1);
let composer = null, bloomPass = null, gradePass = null;
if (!lowPowerDevice) {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
    Math.round(innerWidth * basePixelRatio), Math.round(innerHeight * basePixelRatio),
    // 2x MSAA statt 4x: halbiert die Bandbreite des HDR-Targets, der optische
    // Unterschied ist bei dieser Low-Poly-Optik mit Grading kaum sichtbar.
    { type: THREE.HalfFloatType, samples: 2 },
  ));
  composer.setPixelRatio(basePixelRatio);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.26, 0.45, 0.72);
  composer.addPass(bloomPass);
  gradePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uSaturation: { value: 1.08 },
      uVignette: { value: 0.26 },
      uTint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv;
      uniform sampler2D tDiffuse;uniform float uSaturation;uniform float uVignette;uniform vec3 uTint;
      void main(){
        vec4 c=texture2D(tDiffuse,vUv);
        float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722));
        c.rgb=mix(vec3(l),c.rgb,uSaturation)*uTint;
        c.rgb*=1.0-uVignette*smoothstep(0.42,0.92,length(vUv-0.5));
        gl_FragColor=c;
      }`,
  });
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());
}

// Zeichnet ein Frame — mit Composer inkl. tageszeitabhängigem Grading,
// ohne Composer (Mobil/Low-Power) direkt wie bisher.
function renderFrame() {
  if (!composer || quality.bypassComposer) { renderer.render(scene, camera); return; }
  const elev = world.elevation;
  const rain = world.rainIntensity || 0;
  const nightAmt = THREE.MathUtils.clamp(-elev * 4, 0, 1);
  // Nur um Sonnenauf-/untergang: warmer Schleier, solange die Sonne tief steht.
  const duskAmt = (1 - Math.min(1, Math.abs(elev) / 0.32)) * THREE.MathUtils.clamp(elev * 7 + 0.65, 0, 1);
  gradePass.uniforms.uTint.value
    .setRGB(1, 1, 1)
    .lerp(GRADE_DUSK, duskAmt * 0.55 * (1 - rain))
    .lerp(GRADE_NIGHT, nightAmt * 0.4);
  gradePass.uniforms.uSaturation.value = 1.02 + THREE.MathUtils.clamp(elev * 3 + 0.3, 0, 1) * 0.08 - rain * 0.16;
  gradePass.uniforms.uVignette.value = 0.24 + nightAmt * 0.1 + rain * 0.08;
  bloomPass.strength = 0.26 + nightAmt * 0.22 + (world.flash || 0) * 0.6;
  composer.render();
}

// ---------- Adaptive Qualität ----------
// Hält die Bildrate stabil: Bei anhaltender Überlast werden stufenweise
// Renderauflösung, Sichtweite und zuletzt das Post-Processing reduziert.
// Läuft die Framerate wieder dauerhaft am Limit, geht es schrittweise zurück
// (mit Backoff, damit es nicht zwischen zwei Stufen hin- und herspringt).
const QUALITY_LEVELS = composer ? [
  { scale: 1 },
  { scale: .85 },
  { scale: .72, viewDistance: 240 },
  { scale: .85, viewDistance: 240, bypassComposer: true },
  { scale: .7, viewDistance: 215, bypassComposer: true },
] : [
  { scale: 1 },
  { scale: .85, viewDistance: 240 },
  { scale: .7, viewDistance: 215 },
];
const quality = {
  level: 0, bypassComposer: false,
  frames: 0, elapsed: 0, cooldown: 0,
  goodWindows: 0, stableNeeded: 3, justUpgraded: false,
};

function applyQuality(level) {
  quality.level = level;
  const opts = QUALITY_LEVELS[level];
  quality.bypassComposer = !!opts.bypassComposer;
  const ratio = basePixelRatio * opts.scale;
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
  if (composer) {
    composer.setPixelRatio(ratio);
    composer.setSize(innerWidth, innerHeight);
  }
  resources.viewDistance = opts.viewDistance || 285;
  animals.viewDistance = opts.viewDistance || 285;
  // Nebel leicht vor die Sichtweite ziehen: Objekte verschwinden im Nebel,
  // bevor das Distanz-Culling sie hart ausblendet.
  world.fogFarCap = opts.viewDistance ? opts.viewDistance + 12 : Infinity;
  renderer.shadowMap.needsUpdate = true;
  // setSize/setPixelRatio leeren den Zeichenpuffer. Bis zum nächsten Tick
  // würde sonst kurz ein dunkler Frame durchblitzen — daher wie im
  // Resize-Handler noch im selben Task ein frisches Frame zeichnen.
  renderFrame();
}

// Wird nach jedem gerenderten Frame mit dem echten Frame-Abstand gefüttert und
// bewertet die Framerate in ~2-Sekunden-Fenstern.
function updateQuality(frameGap, targetFps) {
  if (game.state !== 'playing' || document.hidden || frameGap > .5) {
    quality.frames = 0;
    quality.elapsed = 0;
    return;
  }
  quality.frames++;
  quality.elapsed += frameGap;
  if (quality.elapsed < 2) return;
  const fps = quality.frames / quality.elapsed;
  quality.frames = 0;
  quality.elapsed = 0;
  if (quality.cooldown > 0) { quality.cooldown--; return; }
  if (fps < targetFps - 7 && quality.level < QUALITY_LEVELS.length - 1) {
    // Direkt nach einem Upgrade wieder eingebrochen? Dann künftig deutlich
    // länger stabil bleiben, bevor erneut hochgeschaltet wird.
    if (quality.justUpgraded) quality.stableNeeded = Math.min(12, quality.stableNeeded * 2);
    quality.justUpgraded = false;
    quality.goodWindows = 0;
    quality.cooldown = 1;
    applyQuality(quality.level + 1);
  } else if (fps > targetFps - 2.5 && quality.level > 0) {
    quality.goodWindows++;
    if (quality.goodWindows >= quality.stableNeeded) {
      quality.goodWindows = 0;
      quality.justUpgraded = true;
      quality.cooldown = 1;
      applyQuality(quality.level - 1);
    }
  } else {
    quality.goodWindows = 0;
    quality.justUpgraded = false;
  }
}

const ui = new UI();
ui.onRadialChange = () => sfx.uiMove();
// Einheitliches, dezentes Feedback für alle klickbaren Menüelemente. Hover
// startet Audio nie selbst; der erste Klick entsperrt es browserkonform.
document.addEventListener('pointerover', (e) => {
  const control = e.target.closest?.('button:not(:disabled)');
  if (control && !control.contains(e.relatedTarget)) sfx.uiHover();
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest?.('button:not(:disabled)')) return;
  sfx.unlock();
  sfx.uiConfirm();
});
const world = new World(scene, { lowPowerDevice });
world.sun.shadow.mapSize.set(lowPowerDevice ? 1024 : 2048, lowPowerDevice ? 1024 : 2048);
const effects = new Effects(scene);
const resources = new Resources(scene, { lowPowerDevice });
const buildings = new Buildings(scene);
const animals = new Animals(scene, effects);
const aquatics = new Aquatics(scene);
const landmarks = new Landmarks(scene);
// Die Landmarken sollen wie bewusst komponierte Lichtungen wirken und nicht von
// zufällig gesetzten Bäumen oder Felsen verdeckt werden.
for (const res of resources.list) {
  if (landmarks.list.some((l) => {
    if (l.id === 'schattenhoehle' && res.kind === 'mushroom') return false;
    if (l.clearance) {
      const dx=res.x-l.x,dz=res.z-l.z,rotation=l.rotation||0;
      const localX=Math.cos(rotation)*dx-Math.sin(rotation)*dz;
      const localZ=Math.sin(rotation)*dx+Math.cos(rotation)*dz;
      return Math.abs(localX) < l.clearance.width
        && localZ > l.clearance.minZ && localZ < l.clearance.maxZ;
    }
    return Math.hypot(res.x - l.x, res.z - l.z) < 7;
  })) {
    res.permanentHidden = true;
    res.alive = false;
    res.group.visible = false;
  }
}
function spawnCaveAnimals() {
  // Ein kleines Rudel nutzt die innere Kammer als Bau. Die seitlichen
  // Höhlenkollisionen halten die Tiere im Tunnel, der offene Eingang bleibt
  // aber ein echter Zu- und Fluchtweg.
  const caveLandmark = landmarks.list.find((l) => l.id === 'schattenhoehle');
  if (caveLandmark) {
    const caveBounds = {
      minX:caveLandmark.x - 1.25, maxX:caveLandmark.x + 1.25,
      minZ:caveLandmark.z - 26, maxZ:caveLandmark.z + 1.5,
    };
    for (const [x, z] of [[caveLandmark.x - .7, caveLandmark.z - 13], [caveLandmark.x + .8, caveLandmark.z - 20]]) {
      animals.spawnAt('wolf', x, z, { caveBounds, homeX:x, homeZ:z });
    }
  }
  for (const caveGuard of [
    { id:'wurzelhoehle', kind:'wildschwein', localZ:-12, halfWidth:1.25, minZ:-17, maxZ:1 },
    { id:'eiskluft', kind:'baer', localZ:-5, halfWidth:1.1, minZ:-8, maxZ:1 },
  ]) {
    const landmark = landmarks.list.find((entry) => entry.id === caveGuard.id);
    if (!landmark) continue;
    const x = landmark.x, z = landmark.z + caveGuard.localZ;
    animals.spawnAt(caveGuard.kind, x, z, {
      caveBounds: {
        minX:x-caveGuard.halfWidth, maxX:x+caveGuard.halfWidth,
        minZ:landmark.z+caveGuard.minZ, maxZ:landmark.z+caveGuard.maxZ,
        // Der Wächter steht auf dem gebauten Höhlenboden (Plattform-Höhe),
        // nicht auf terrainHeight — das wäre der Berg ÜBER der Höhle.
        floorBaseY:terrainHeight(landmark.x, landmark.z), floorOriginZ:landmark.z,
      },
      homeX:x, homeZ:z,
    });
  }
}
spawnCaveAnimals();
const player = new Player(camera);
const localAvatar = new RemoteAvatar();
scene.add(localAvatar.group);
localAvatar.group.visible = false;
const savedCameraMode = localStorage.getItem(CAMERA_MODE_KEY) === 'third' ? 'third' : 'first';
player.setPerspective(savedCameraMode);
ui.setCameraMode(savedCameraMode);
let touch;

// Importierte First-Person-Modelle würden ihren Material-Shader sonst erst
// beim ersten Auswählen kompilieren. Das erzeugt besonders auf Safari/Macs
// einen kurzen sichtbaren Hänger. Nach dem Laden einmal unsichtbar vorwärmen.
player.heldModelsReady.then(() => {
  const heldWasVisible = player.held.visible;
  const visibility = Object.values(player.heldModels).map((model) => model.visible);
  player.held.visible = true;
  Object.values(player.heldModels).forEach((model) => { model.visible = true; });
  let warmup;
  try {
    warmup = renderer.compileAsync
      ? renderer.compileAsync(scene, camera)
      : Promise.resolve(renderer.compile(scene, camera));
  } finally {
    player.held.visible = heldWasVisible;
    Object.values(player.heldModels).forEach((model, i) => { model.visible = visibility[i]; });
  }
  return warmup;
}).catch((error) => console.warn('First-person models could not be prewarmed', error));

player.obstacleSets = [resources.obstacles, buildings.obstacles, landmarks.obstacles];
player.platformSets = [landmarks.platforms, buildings.platforms];

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
  raidNightActive: false,
  nightAnnouncedDay: 0,
  thirstWarning: false,
  coldWarning: false,
  hungerWarning: false,
  boat: null,
  boatRole: null,
  boatSeat: 0,
  boatDriverId: null,
  boatClaimedAt: 0,
  boatDriverMissingSince: 0,
  bike: null,
  storage: null,
  fishing: null,
  eventTimer: 70,
  bottleWater: 0,
  expeditionEvent: null,
  trackingEvent: null,
  trackingCompleted: 0,
  caveCacheDays: {},
  caveCacheClaims: 0,
  cacheSeed: 1,
  pendingWatchtowerId: null,
  pendingWatchtowerLegacy: false,
  hintsShown: {},
  xp: 0,
  level: 1,
  craftedOnce: [],
  visitedBiomes: ['meadow'],
  lastRewardDay: 1,
  gatherBonusProgress: 0,
  warmMealUntil: 0,
};
setCameraMode(savedCameraMode);

function randomCacheSeed() {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else values[0] = Math.floor(Math.random() * 0x100000000);
  return values[0] || 1;
}

// Singleplayer und jede Koop-Welt besitzen getrennte persönliche Saves.
// Der Kontext bleibt auch bei einem kurzen Realtime-Ausfall erhalten, damit
// ein Koop-Inventar niemals versehentlich den normalen Spielstand überschreibt.
let saveContext = 'single';

const remotePlayers = new Map();
const raftRuntimeStates = new Map();
const bikeRuntimeStates = new Map();
const RAFT_SEATS = [
  { x: 0, z: -.48 },       // Fahrer
  { x: -.68, z: .25 },     // Mitfahrer links
  { x: .68, z: .25 },      // Mitfahrer rechts
  { x: 0, z: .82 },        // Mitfahrer hinten
];

function remotePlayerHp(value, fallback = 100) {
  const hp = Number(value);
  return Number.isFinite(hp) ? Math.max(0, hp) : fallback;
}

function backpackTier(inv = game.inv) {
  if ((inv.expeditionsrucksack || 0) > 0) return 'expedition';
  if ((inv.grosser_rucksack || 0) > 0) return 'large';
  return 'standard';
}

function outfitState(inv = game.inv) {
  return {
    boots: (inv.pfadfinderstiefel || 0) > 0,
    pants: (inv.verstaerkte_hose || 0) > 0,
    shirt: (inv.schutzhemd || 0) > 0,
  };
}

function createRemotePlayer(state) {
  const avatar = new RemoteAvatar();
  const group = avatar.group;
  group.userData.remotePlayer = state.userId;
  group.position.set(state.x || 0, state.y || 0, state.z || 0);
  scene.add(group);
  const remote = {
    id: state.userId, name: state.name || 'Mitspieler', group, avatar,
    target: new THREE.Vector3(state.x || 0, state.y || 0, state.z || 0),
    rideTarget: new THREE.Vector3(state.x || 0, state.y || 0, state.z || 0),
    yaw: state.yaw || 0, moving: false, held: null, backpack: state.backpack || 'standard', outfit: state.outfit || {}, bowDraw: 0,
    lastNetworkAt: 0,
    level: Math.max(1, Number(state.level) || 1), vulnerable: state.vulnerable !== false,
    hp: remotePlayerHp(state.hp), maxHp: Math.max(100, Number(state.maxHp) || 100), dead: false, vehicle: state.vehicle || null,
  };
  remote.dead = state.dead === true || remote.hp <= 0;
  avatar.setHeld(state.held || 'hand');
  avatar.setBackpack(remote.backpack);
  avatar.setOutfit(remote.outfit);
  avatar.setBowDraw(state.bowDraw || 0);
  avatar.setDead(remote.dead);
  remotePlayers.set(state.userId, remote);
  return remote;
}

function receiveRemotePlayer(state) {
  if (!state?.userId) return;
  const remote = remotePlayers.get(state.userId) || createRemotePlayer(state);
  const sentAt = Number(state.sentAt) || 0;
  if (sentAt && sentAt <= remote.lastNetworkAt) return;
  if (![state.x,state.y,state.z].every((value)=>Number.isFinite(Number(value)))) return;
  remote.lastNetworkAt = sentAt;
  remote.name = state.name || remote.name;
  remote.target.set(Number(state.x), Number(state.y), Number(state.z));
  remote.yaw = state.yaw || 0;
  remote.moving = !!state.moving;
  remote.level = Math.max(1, Number(state.level) || remote.level || 1);
  remote.vulnerable = state.vulnerable !== false;
  remote.hp = remotePlayerHp(state.hp, remote.hp ?? 100);
  remote.maxHp = Math.max(100, Number(state.maxHp) || remote.maxHp || 100);
  remote.dead = state.dead === true || remote.hp <= 0;
  remote.avatar.setDead(remote.dead);
  if (state.held !== undefined && state.held !== remote.held) {
    remote.held = state.held;
    remote.avatar.setHeld(state.held || 'hand');
  }
  if (state.backpack !== undefined && state.backpack !== remote.backpack) {
    remote.backpack = state.backpack;
    remote.avatar.setBackpack(state.backpack);
  }
  if (state.outfit !== undefined) {
    remote.outfit = state.outfit || {};
    remote.avatar.setOutfit(remote.outfit);
  }
  remote.bowDraw = Math.max(0, Math.min(1, Number(state.bowDraw) || 0));
  remote.avatar.setBowDraw(remote.bowDraw);
  // Ein sinkender swing-Wert bedeutet: neuer Hieb gestartet. Die Animation
  // läuft beim Empfänger lokal ab, weil Netzwerk-Pakete zu selten kommen.
  const swingNet = Number(state.swing);
  if (Number.isFinite(swingNet)) {
    if (swingNet < (remote.swingNet ?? 1)) remote.avatar.startSwing();
    remote.swingNet = swingNet;
  }
  remote.vehicle = (state.vehicle?.type === 'raft' || state.vehicle?.type === 'bike') ? state.vehicle : null;
  if (remote.vehicle?.type === 'raft' && remote.vehicle.role === 'driver') receiveRaftDriverState(remote, remote.vehicle);
  else if (remote.vehicle?.type === 'bike') receiveBikeDriverState(remote, remote.vehicle);
}

function updateRemotePlayers(dt) {
  for (const remote of remotePlayers.values()) {
    const riddenRaft = remote.vehicle?.type === 'raft' ? raftById(remote.vehicle.raftId) : null;
    const riddenBike = remote.vehicle?.type === 'bike' ? bikeById(remote.vehicle.bikeId) : null;
    if (riddenRaft) {
      raftSeatWorldPosition(riddenRaft, remote.vehicle.seat, remote.rideTarget);
      // Avatare werden direkt an den Sitz gebunden. Netzwerkinterpolation auf
      // der Spielerposition würde sie bei schneller Fahrt sichtbar abrutschen lassen.
      remote.group.position.copy(remote.rideTarget);
    } else if (riddenBike) {
      // Avatar direkt aufs Fahrrad setzen, damit er nicht in der Luft schwebt
      // (die Netzwerk-Spielerposition hinkt der Fahrt hinterher).
      remote.rideTarget.set(riddenBike.x, riddenBike.group.position.y, riddenBike.z);
      remote.group.position.copy(remote.rideTarget);
    } else remote.group.position.lerp(remote.target, Math.min(1, dt * 12));
    remote.group.rotation.y += Math.atan2(Math.sin(remote.yaw - remote.group.rotation.y), Math.cos(remote.yaw - remote.group.rotation.y)) * Math.min(1, dt * 12);
    remote.avatar.update(dt, remote.moving && !remote.dead);
    // Name + Lebensbalken erscheinen nur in der Nähe und nicht über Toten.
    remote.avatar.setNameTag(remote.name, remote.maxHp > 0 ? remote.hp / remote.maxHp * 100 : 0);
    const nameTagDistance = remote.group.position.distanceTo(player.pos);
    remote.avatar.setNameTagVisible(!remote.dead && nameTagDistance < 28);
  }
}

function raftById(id) {
  return id ? buildings.placed.find((building) => building.type === 'raft' && building.id === id) || null : null;
}

function bikeById(id) {
  return id ? buildings.placed.find((building) => building.type === 'bike' && building.id === id) || null : null;
}

function activeRemoteRaftDriver(raftId) {
  const now = Date.now();
  return [...remotePlayers.values()].find((remote) => remote.vehicle?.type === 'raft'
    && remote.vehicle.raftId === raftId && remote.vehicle.role === 'driver'
    && now - (remote.vehicleReceivedAt || 0) < 1600) || null;
}

function occupiedRaftSeats(raftId) {
  return new Set([...remotePlayers.values()]
    .filter((remote) => remote.vehicle?.type === 'raft' && remote.vehicle.raftId === raftId)
    .map((remote) => Math.max(0, Math.min(RAFT_SEATS.length - 1, Number(remote.vehicle.seat) || 0))));
}

function availablePassengerSeat(raftId) {
  const occupied = occupiedRaftSeats(raftId);
  for (let seat = 1; seat < RAFT_SEATS.length; seat++) if (!occupied.has(seat)) return seat;
  return -1;
}

function receiveRaftDriverState(remote, vehicle) {
  const raft = vehicle?.raft;
  if (!vehicle?.raftId || !raft || ![raft.x, raft.z, raft.rot].every((value) => Number.isFinite(Number(value)))) return;
  remote.vehicleReceivedAt = Date.now();
  // Falls zwei Spieler nahezu gleichzeitig einsteigen, behält der frühere
  // Anspruch die Fahrerrolle; der andere wird automatisch Mitfahrer.
  if (game.boat?.id === vehicle.raftId && game.boatRole === 'driver') {
    const remoteClaim = Number(vehicle.claimedAt) || Number.MAX_SAFE_INTEGER;
    const localClaim = game.boatClaimedAt || Number.MAX_SAFE_INTEGER;
    const localId = cloud.session?.user?.id || '';
    if (remoteClaim < localClaim || remoteClaim === localClaim && remote.id < localId) {
      const seat = availablePassengerSeat(vehicle.raftId);
      if (seat > 0) {
        game.boatRole = 'passenger';
        game.boatSeat = seat;
        game.boatDriverId = remote.id;
        ui.toast(tr('m.raftPassenger', { name: remote.name, seat }), 'hint');
      } else {
        exitRaft();
        ui.toast(tr('m.raftFull'), 'hint');
      }
    } else return;
  }
  raftRuntimeStates.set(vehicle.raftId, {
    x: Number(raft.x), z: Number(raft.z), rot: Number(raft.rot),
    speed: Number(raft.speed) || 0, turnSpeed: Number(raft.turnSpeed) || 0,
    receivedAt: Date.now(), driverId: remote.id,
  });
}

function applyRaftTransform(raft, state, blend = 1) {
  if (!raft || !state) return;
  const alpha = THREE.MathUtils.clamp(blend, 0, 1);
  raft.x = THREE.MathUtils.lerp(raft.x, state.x, alpha);
  raft.z = THREE.MathUtils.lerp(raft.z, state.z, alpha);
  raft.rot += Math.atan2(Math.sin(state.rot - raft.rot), Math.cos(state.rot - raft.rot)) * alpha;
  raft.speed = state.speed || 0;
  raft.turnSpeed = state.turnSpeed || 0;
  const bob = Math.sin(performance.now() * .0018) * .045;
  raft.group.position.set(raft.x, WATER_Y + .05 + bob, raft.z);
  raft.group.rotation.set(Math.sin(performance.now() * .0013) * .012, raft.rot, Math.sin(performance.now() * .0017 + 1) * .018);
}

function updateNetworkRafts(dt) {
  for (const [id, state] of raftRuntimeStates) {
    if (Date.now() - state.receivedAt > 5000) { raftRuntimeStates.delete(id); continue; }
    if (game.boat?.id === id && game.boatRole === 'driver') continue;
    const raft = raftById(id);
    if (raft) applyRaftTransform(raft, state, 1 - Math.exp(-dt * 15));
  }
}

function receiveBikeDriverState(remote, vehicle) {
  const bike = vehicle?.bike;
  if (!vehicle?.bikeId || !bike || ![bike.x, bike.z, bike.rot].every((value) => Number.isFinite(Number(value)))) return;
  remote.vehicleReceivedAt = Date.now();
  bikeRuntimeStates.set(vehicle.bikeId, {
    x: Number(bike.x), z: Number(bike.z), rot: Number(bike.rot),
    speed: Number(bike.speed) || 0, turnSpeed: Number(bike.turnSpeed) || 0,
    receivedAt: Date.now(), driverId: remote.id,
  });
}

function applyBikeTransform(bike, state, blend = 1, dt = 0) {
  if (!bike || !state) return;
  const alpha = THREE.MathUtils.clamp(blend, 0, 1);
  bike.x = THREE.MathUtils.lerp(bike.x, state.x, alpha);
  bike.z = THREE.MathUtils.lerp(bike.z, state.z, alpha);
  bike.rot += Math.atan2(Math.sin(state.rot - bike.rot), Math.cos(state.rot - bike.rot)) * alpha;
  bike.speed = state.speed || 0;
  bike.turnSpeed = state.turnSpeed || 0;
  const fx = Math.sin(bike.rot), fz = Math.cos(bike.rot);
  bike.group.position.set(bike.x, terrainHeight(bike.x, bike.z), bike.z);
  bike.group.rotation.y = bike.rot;
  const front = terrainHeight(bike.x + fx * .65, bike.z + fz * .65), back = terrainHeight(bike.x - fx * .65, bike.z - fz * .65);
  bike.group.rotation.x = THREE.MathUtils.clamp(Math.atan2(front - back, 1.3), -.38, .38);
  const wheelSpin = bike.speed * dt / .48;
  for (const wheel of bike.group.userData.wheels || []) wheel.rotation.x += wheelSpin;
}

function updateNetworkBikes(dt) {
  for (const [id, state] of bikeRuntimeStates) {
    if (Date.now() - state.receivedAt > 5000) { bikeRuntimeStates.delete(id); continue; }
    if (game.bike?.id === id) continue;
    const bike = bikeById(id);
    if (bike) applyBikeTransform(bike, state, 1 - Math.exp(-dt * 15), dt);
  }
}

function currentVehicleNetworkState() {
  const raft = game.boat;
  if (raft) {
    const vehicle = {
      type: 'raft', raftId: raft.id, role: game.boatRole || 'driver',
      seat: game.boatSeat || 0, driverId: game.boatDriverId || null,
      claimedAt: game.boatClaimedAt || 0,
    };
    if (vehicle.role === 'driver') {
      vehicle.raft = { x: raft.x, z: raft.z, rot: raft.rot, speed: raft.speed || 0, turnSpeed: raft.turnSpeed || 0 };
    }
    return vehicle;
  }
  const bike = game.bike;
  if (bike) {
    return {
      type: 'bike', bikeId: bike.id, role: 'driver',
      bike: { x: bike.x, z: bike.z, rot: bike.rot, speed: bike.speed || 0, turnSpeed: bike.turnSpeed || 0 },
    };
  }
  return null;
}

function removeRemotePlayersExcept(ids = []) {
  const keep = new Set(ids);
  for (const [id, remote] of remotePlayers) {
    if (keep.has(id)) continue;
    scene.remove(remote.group);
    remotePlayers.delete(id);
  }
}

function nearestDownedPartner(maxDistance = 3.2) {
  let nearest = null;
  let nearestDistance = maxDistance;
  for (const remote of remotePlayers.values()) {
    if (!remote.dead) continue;
    const distance = Math.hypot(remote.target.x - player.pos.x, remote.target.z - player.pos.z);
    if (distance < nearestDistance) { nearest = remote; nearestDistance = distance; }
  }
  return nearest;
}

function nearestLivingPartner() {
  return [...remotePlayers.values()]
    .filter((remote) => !remote.dead)
    .sort((a, b) => a.target.distanceToSquared(player.pos) - b.target.distanceToSquared(player.pos))[0] || null;
}

function currentPlayerNetworkState(overrides = {}) {
  return {
    x: player.pos.x, y: player.pos.y, z: player.pos.z,
    yaw: player.yaw, pitch: player.pitch,
    moving: false, sprinting: false,
    held: selected(), backpack: backpackTier(), outfit: outfitState(), bowDraw: player.bowDrawing ? player.bowDraw : 0,
    swing: player.swingT,
    hp: player.hp, maxHp: player.maxHp, level: game.level,
    vehicle: currentVehicleNetworkState(),
    dead: game.state === 'dead', vulnerable: game.state === 'playing',
    ...overrides,
  };
}

function levelForXP(xp) {
  let level = 1;
  while (level < XP_LEVELS.length && xp >= XP_LEVELS[level]) level++;
  return level;
}

function levelStatMultiplier(level = 1) {
  // Linear statt exponentiell: Level 20 ergibt +95 %, nicht 1.05^19.
  return 1 + Math.max(0, level - 1) * LEVEL_STAT_BONUS;
}

function addXP(amount, reason = '') {
  if (!amount) return;
  const oldLevel = game.level;
  const oldMaxHp = player.maxHp;
  game.xp += amount;
  game.level = levelForXP(game.xp);
  const current = XP_LEVELS[game.level - 1] ?? XP_LEVELS.at(-1);
  const next = XP_LEVELS[game.level] ?? current;
  ui.setLevel(game.level, game.xp, current, next);
  if (game.level > oldLevel) {
    syncEquipmentBonuses();
    // Der neue Maximalwert wird beim Aufstieg direkt als echte Gesundheit
    // gutgeschrieben, statt den Lebensbalken prozentual scheinbar zu leeren.
    player.hp = Math.min(player.maxHp, player.hp + Math.max(0, player.maxHp - oldMaxHp));
    const unlock = LEVEL_UNLOCKS[game.level] ? tr(LEVEL_UNLOCKS[game.level]) : null;
    ui.toast(unlock ? tr('m.levelUpUnlock', { n: game.level, unlock }) : tr('m.levelUp', { n: game.level }));
    happytime(); // CrazyGames: markiert einen positiven Spielmoment (No-Op im Web-Build)
    sfx.craft();
    if (game.state === 'craft') ui.renderCraft(game.inv);
  } else if (reason) ui.toast(`+${amount} XP · ${reason}`);
}

buildings.onTentPlaced = (x, z) => {
  game.spawn = { x, z: z + 2.2 };
  ui.toast(tr('m.spawnSet'));
};

buildings.onFireOut = () => {
  if (game.state === 'playing') ui.toast(tr('m.campfireOut'), 'hint');
};

// Donner-Sound, wenn im Sturm ein Blitz einschlägt
world.onThunder = (dist) => sfx.thunder(dist);

// Intro-/Titelmusik
const music = new Music();
let ambientStarted = false;
function startAudioForPlay() {
  music.stop(true);
  if (!ambientStarted) { sfx.startAmbient(); ambientStarted = true; }
}

player.onDamage = (n, cause) => {
  ui.damageFlash();
  sfx.hurt();
  if (player.hp <= 0 && game.state === 'playing') die(cause || tr('death.animal'));
};
player.onExhausted = () => {
  ui.staminaExhausted();
  sfx.exhausted();
};

// ---------- Inventar ----------
function stackSize(id) {
  const type = ITEMS[id]?.type;
  return ['tool', 'gear', 'armor'].includes(type) ? 1 : type === 'placeable' ? 10 : 20;
}
function inventoryCapacity(inv = game.inv) {
  if ((inv.expeditionsrucksack || 0) > 0) return 40;
  return (inv.grosser_rucksack || 0) > 0 ? 28 : 16;
}
function inventoryUsed(inv = game.inv) {
  return Object.entries(inv).reduce((sum, [id, n]) => {
    if (!occupiesInventorySlot(id)) return sum;
    return sum + (n > 0 ? Math.ceil(n / stackSize(id)) : 0);
  }, 0);
}
function capacityInfo() { return { used: inventoryUsed(), max: inventoryCapacity() }; }
ui.capacityProvider = capacityInfo;
ui.craftRequirementProvider = (recipe) => {
  if (!recipe.requiresBike) return { ok: true, message: '' };
  const hasBike = (game.inv.fahrrad || 0) > 0 || buildings.placed.some((building) => building.type === 'bike');
  return { ok: hasBike, message: hasBike ? '' : tr('req.bike') };
};

function syncEquipmentBonuses() {
  const levelHp = Math.round(100 * levelStatMultiplier(game.level));
  player.maxHp = levelHp + ((game.inv.schutzhemd || 0) > 0 ? 20 : 0);
  player.maxStamina = (game.inv.verstaerkte_hose || 0) > 0 ? 125 : 100;
  player.moveSpeedMultiplier = (game.inv.pfadfinderstiefel || 0) > 0 ? 1.12 : 1;
  // Rüstungsteile summieren sich additiv (max. 35 %). Multiplikative
  // Verrechnung wäre bei künftigen Teilen schwerer zu deckeln.
  let armor = 0;
  for (const [id, item] of Object.entries(ITEMS)) {
    if (item.armor && (game.inv[id] || 0) > 0) armor += item.armor;
  }
  player.armorReduction = Math.min(.6, armor);
  player.hp = Math.min(player.hp, player.maxHp);
  player.stamina = Math.min(player.stamina, player.maxStamina);
  localAvatar.setOutfit(outfitState());
}

function addItem(id, n = 1, silent = false) {
  let accepted = 0;
  while (accepted < n) {
    const next = (game.inv[id] || 0) + 1;
    const before = game.inv[id] || 0;
    game.inv[id] = next;
    if (inventoryUsed() > inventoryCapacity()) { game.inv[id] = before; break; }
    accepted++;
  }
  if (!accepted) { if (!silent) ui.toast(tr('m.packFull'), 'hint'); return 0; }
  if (!silent) {
    ui.toast(`+${accepted} ${ITEMS[id].name}`);
    sfx.pickup();
  }
  refreshInv();
  updateTutorial();
  showUnlockHint(id);
  return accepted;
}

function grantAnimalDrops(drops = {}) {
  const received = [];
  const missed = [];
  // Fell zuerst einlagern: Falls nur noch ein neuer Stapel in den Rucksack
  // passt, soll das seltenere Baumaterial nicht hinter Rohfleisch verloren gehen.
  const entries = Object.entries(drops).sort(([a], [b]) => (a === 'fell' ? -1 : b === 'fell' ? 1 : 0));
  for (const [id, amount] of entries) {
    const accepted = addItem(id, amount, true);
    if (accepted) received.push(`+${accepted} ${ITEMS[id]?.name || id}`);
    if (accepted < amount) missed.push(`${amount - accepted} ${ITEMS[id]?.name || id}`);
  }
  if (received.length) {
    ui.toast(tr('m.huntLoot', { list: received.join(' · ') }));
    sfx.pickup();
  }
  if (missed.length) ui.toast(tr('m.packFullMissed', { list: missed.join(', ') }), 'hint');
  return missed.length === 0;
}

// ---------- Bodenbeute ----------
// Erlegte Tiere hinterlassen einen Beutebeutel am Boden, der mit E aufgehoben
// wird, statt die Beute sofort ins Inventar zu buchen.
const groundLoot = [];
const lootSackMaterial = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: .92 });
const lootTieMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 1 });
const lootSackGeometry = new THREE.SphereGeometry(.3, 7, 6);
const lootTieGeometry = new THREE.CylinderGeometry(.08, .13, .13, 6);

function spawnGroundLoot(x, z, drops) {
  if (!drops || !Object.keys(drops).length) return;
  const group = new THREE.Group();
  const sack = new THREE.Mesh(lootSackGeometry, lootSackMaterial);
  sack.scale.set(1, .82, 1); sack.castShadow = true; group.add(sack);
  const tie = new THREE.Mesh(lootTieGeometry, lootTieMaterial); tie.position.y = .27; group.add(tie);
  const baseY = terrainHeight(x, z) + .3;
  group.position.set(x, baseY, z);
  scene.add(group);
  groundLoot.push({ x, z, baseY, drops: { ...drops }, group, spin: Math.random() * Math.PI * 2 });
}

function removeGroundLoot(loot) {
  scene.remove(loot.group);
  const i = groundLoot.indexOf(loot);
  if (i >= 0) groundLoot.splice(i, 1);
}

function clearGroundLoot() {
  for (const loot of [...groundLoot]) removeGroundLoot(loot);
}

function nearestGroundLoot(range = 2.6) {
  let best = null, bestDist = range * range;
  for (const loot of groundLoot) {
    const dx = loot.x - player.pos.x, dz = loot.z - player.pos.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) { bestDist = dist; best = loot; }
  }
  return best;
}

function updateGroundLoot(dt) {
  const now = performance.now();
  for (const loot of groundLoot) {
    loot.group.position.y = loot.baseY + Math.sin(now * .003 + loot.spin) * .07;
    loot.group.rotation.y += dt * .8;
  }
}

// Beutebeutel einsammeln. Passt nicht alles in den Rucksack, bleibt der Rest liegen.
function collectGroundLoot(loot) {
  const received = [];
  const remaining = {};
  const entries = Object.entries(loot.drops).sort(([a], [b]) => (a === 'fell' ? -1 : b === 'fell' ? 1 : 0));
  for (const [id, amount] of entries) {
    const accepted = addItem(id, amount, true);
    if (accepted) received.push(`+${accepted} ${ITEMS[id]?.name || id}`);
    if (accepted < amount) remaining[id] = amount - accepted;
  }
  if (received.length) { ui.toast(tr('m.lootPicked', { list: received.join(' · ') })); sfx.pickup(); }
  if (Object.keys(remaining).length) {
    loot.drops = remaining;
    ui.toast(tr('m.packFullRest'), 'hint');
    return false;
  }
  removeGroundLoot(loot);
  saveGame(false);
  return true;
}

function restoreGroundLoot(list) {
  clearGroundLoot();
  if (!Array.isArray(list)) return;
  for (const entry of list) {
    if (entry && Number.isFinite(entry.x) && Number.isFinite(entry.z) && entry.drops && Object.keys(entry.drops).length) {
      spawnGroundLoot(entry.x, entry.z, entry.drops);
    }
  }
}

function showUnlockHint(id) {
  if (game.hintsShown[id]) return;
  const hints = {
    lagerfeuer: 'hint.campfire',
    holzwand: 'hint.wall',
    werkbank: 'hint.workbench',
    floss: 'hint.raft',
    feldflasche: 'hint.canteen',
    truhe: 'hint.chest',
    pilz: 'hint.mushroom',
    leuchtpilz: 'hint.glowMushroom',
  };
  if (!hints[id] || game.state !== 'playing') return;
  game.hintsShown[id] = true;
  setTimeout(() => game.state === 'playing' && ui.toast(tr(hints[id]), 'hint'), 500);
}

function updateTutorial(silent = false) {
  if (game.trackingEvent) { setTrackingObjective(); return; }
  const before = game.tutorialStage;
  while (game.tutorialStage < TUTORIAL.length && TUTORIAL[game.tutorialStage].done()) game.tutorialStage++;
  if (!silent && game.tutorialStage > before) addXP((game.tutorialStage - before) * 25, tr('xp.taskDone'));
  if (!silent && game.tutorialStage > before && game.state === 'playing') ui.toast(tr('m.taskDone'));
  if (game.tutorialStage >= TUTORIAL.length) {
    const found = game.discoveries.length;
    ui.setObjective(found >= LANDMARK_COUNT
      ? tr('obj.chronicleFull')
      : tr('obj.chronicleProgress', { a: found, b: LANDMARK_COUNT }),
    found >= LANDMARK_COUNT ? 'sprout' : 'compass', found >= LANDMARK_COUNT);
    return;
  }
  const step = TUTORIAL[game.tutorialStage];
  ui.setObjective(`${game.tutorialStage + 1}/${TUTORIAL.length} · ${tr(step.text)}`, step.icon);
}

function discoverLandmark(landmark) {
  game.discoveries.push(landmark.id);
  for (const [id, n] of Object.entries(landmark.reward)) addItem(id, n, true);
  ui.discovery(landmark.name, landmark.story, game.discoveries.length, LANDMARK_COUNT);
  happytime(); // CrazyGames: Entdeckung ist ein Höhepunkt (No-Op im Web-Build)
  addXP(90, tr('xp.siteFound'));
  if (game.discoveries.length === 1) setTimeout(() => ui.toast(tr('m.hintMap'), 'hint'), 1800);
  if (game.discoveries.length === LANDMARK_COUNT) {
    addItem('holzwand', 4, true);
    addItem('wildtor', 1, true);
    if ((game.inv.fackel || 0) === 0) { addItem('fackel', 1, true); game.dura.fackel = ITEMS.fackel.dura; }
    addItem('holz', 6, true);
    setTimeout(() => ui.toast(tr('m.chronicleDone')), 3200);
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
  if ((game.inv.werkzeugpflege || 0) > 0 && Math.random() < .35) return true;
  game.dura[toolId] = (game.dura[toolId] ?? def.dura) - 1;
  if (game.dura[toolId] <= 0) {
    delete game.dura[toolId];
    removeItem(toolId, 1); // zerbricht -> aus dem Inventar, kann neu gecraftet werden
    ui.toast(tr('m.broke', { name: def.name }), 'hint');
    sfx.hurt();
    return false;
  }
  refreshInv(); // Haltbarkeitsbalken aktualisieren
  return true;
}

function refreshInv() {
  syncEquipmentBonuses();
  player.updateBowUpgrades(game.inv);
  const selId = game.hotbar[game.hotIdx];
  game.hotbar = buildHotbar(game.inv);
  let newIdx = game.hotbar.indexOf(selId);
  // Wechselt der feste Slot zwischen Metall- und Normalvariante (gecraftet
  // bzw. zerbrochen), bleibt die Auswahl auf demselben Slot statt auf die
  // Hand zu springen.
  if (newIdx < 0 || !slotUsable(selId, game.inv)) {
    const swap = Object.entries(TOOL_UPGRADES).find(([base, upgrade]) => base === selId || upgrade === selId);
    if (swap) {
      const replacement = selId === swap[0] ? swap[1] : swap[0];
      if (slotUsable(replacement, game.inv)) newIdx = game.hotbar.indexOf(replacement);
    }
  }
  // Auswahl beibehalten, sofern der Slot noch benutzbar ist – sonst zurück auf die Hand.
  game.hotIdx = newIdx >= 0 && slotUsable(game.hotbar[newIdx], game.inv) ? newIdx : 0;
  ui.renderHotbar(game.hotbar, game.hotIdx, game.inv, game.dura);
  ui.setMaterials(game.inv);
  const current = XP_LEVELS[game.level - 1] ?? XP_LEVELS.at(-1);
  const next = XP_LEVELS[game.level] ?? current;
  ui.setLevel(game.level, game.xp, current, next);
  for(const bike of buildings.placed.filter((building)=>building.type==='bike')) {
    if(bike.group.userData.bikeRack)bike.group.userData.bikeRack.visible=(game.inv.gepaecktraeger||0)>0;
  }
  if (game.state === 'craft') ui.renderCraft(game.inv);
  syncSelection();
}

function selected() {
  const id = game.hotbar[game.hotIdx];
  return id && slotUsable(id, game.inv) ? id : 'hand';
}

function syncSelection() {
  const id = selected();
  if (id !== 'bogen') cancelBowDraw();
  if (id !== 'angel') cancelFishing(true);
  player.setHeld(id);
  localAvatar.setHeld(id);
  const def = ITEMS[id];
  buildings.setGhostType(def.type === 'placeable' ? def.build : null);
  if (touch) {
    touch.setActionIcon(id === 'angel' ? 'fishing' : def.type === 'medicine' ? 'heart' : def.type === 'food' ? 'food' : def.type === 'placeable' ? 'craft' : 'fist');
    touch.setRotateVisible(def.type === 'placeable');
  }
}

function setCameraMode(mode, notify = false) {
  player.setPerspective(mode);
  localAvatar.group.visible = game.state !== 'menu' && player.perspective === 'third';
  document.body.classList.toggle('thirdPerson', player.perspective === 'third');
  ui.setCameraMode(player.perspective);
  localStorage.setItem(CAMERA_MODE_KEY, player.perspective);
  if (notify && game.state === 'playing') {
    ui.toast(player.perspective === 'third' ? tr('camera.third') : tr('camera.first'));
  }
}

function toggleCameraMode(notify = true) {
  setCameraMode(player.perspective === 'first' ? 'third' : 'first', notify);
}

function updateLocalAvatar(dt, movement = { moving: false }) {
  localAvatar.group.visible = game.state !== 'menu' && player.perspective === 'third';
  if (!localAvatar.group.visible) return;
  if(game.bike)localAvatar.group.position.set(game.bike.x,game.bike.group.position.y,game.bike.z);
  else localAvatar.group.position.copy(player.pos);
  localAvatar.group.rotation.y = player.yaw;
  localAvatar.setBackpack(backpackTier());
  localAvatar.setOutfit(outfitState());
  localAvatar.setBowDraw(player.bowDrawing ? player.bowDraw : 0);
  localAvatar.setSwing(player.swingT);
  localAvatar.setDead(game.state === 'dead');
  localAvatar.update(dt, !!movement.moving, !!game.bike);
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
// Die tatsächliche Reichweite wird überall horizontal über `range + .8` ab der
// Spielerposition begrenzt. Die Strahllänge muss diesen Guard nur erreichen
// können – in der Schulterkamera zusätzlich um den Kameraabstand nach hinten,
// plus etwas Luft für nach unten geneigte Blicke. So ist die Reichweite in
// First- und Third-Person identisch (vorher reichte man in Third-Person weiter).
function aimFar(range) {
  return range + 1 + (player.perspective === 'third' ? player.thirdPersonDistance : 0);
}
const targetCandidates = [];
const projectileTargets = [];
const flyingArrows = [];
// Solange die Schusstaste gehalten wird, startet der nächste Bogenzug
// automatisch, sobald der kurze Nachschuss-Cooldown abgelaufen ist. So wird
// ein Klick direkt nach einem Schuss nicht mehr verschluckt.
let bowHoldIntent = false;
const spearDirection = new THREE.Vector3();
const trackPrintGeometry = new THREE.SphereGeometry(.13, 7, 4);
const trackGlowGeometry = new THREE.TorusGeometry(.82, .018, 4, 36);
const trackPrintMaterial = new THREE.MeshStandardMaterial({
  color: 0x35271d, emissive: 0x8a5d22, emissiveIntensity: .13, roughness: 1,
});
const trackGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0xe8bb62, transparent: true, opacity: .28, depthWrite: false,
});

// Fackel-Licht: folgt dem Spieler, solange die Fackel in der Hand ist
const torchLight = new THREE.PointLight(0xffb050, 0, 12, 1.6);
torchLight.visible = false;
scene.add(torchLight);

// true, solange eine brennende Fackel getragen wird (für Licht & Wolfsabwehr)
function torchHeld() {
  return ['fackel','laterne'].includes(selected()) && (game.inv[selected()] || 0) > 0;
}

function updateCaveDarkness() {
  const cave=game.state==='playing'&&landmarks.list.find((landmark)=>landmarks.isInsideCave(landmark,player.pos));
  document.body.classList.toggle('insideCave',!!cave);
  document.body.classList.toggle('caveLit',!!cave&&torchHeld());
  return cave||null;
}

// Atmosphäre: Regenpegel setzen, gelegentlich Vögel zwitschern lassen
let birdTimer = 5;
let howlTimer = 12 + Math.random() * 12;
let nightCallTimer = 8 + Math.random() * 10;
let ambientWasNight = false;
function updateAmbient(dt) {
  const rain = world.rainIntensity;
  sfx.setRain(rain * 0.09);
  sfx.setWind(Math.hypot(world.wind.x, world.wind.z));

  if (!world.night) {
    ambientWasNight = false;
    birdTimer -= dt;
    if (birdTimer <= 0) {
      birdTimer = 3.5 + Math.random() * 7;
      // Vögel singen tagsüber bei trockenem Wetter.
      if (world.elevation > 0.12 && rain < 0.25) sfx.birdChirp();
    }
    return;
  }

  if (!ambientWasNight) {
    ambientWasNight = true;
    howlTimer = 10 + Math.random() * 14;
    nightCallTimer = 6 + Math.random() * 9;
  }
  // Starker Regen und Sturm überdecken weit entfernte Tiere glaubwürdig.
  if (rain < .5) {
    howlTimer -= dt;
    nightCallTimer -= dt;
  }
  if (howlTimer <= 0) {
    sfx.wolfHowl();
    howlTimer = (world.day % 3 === 0 ? 28 : 42) + Math.random() * 38;
  }
  if (nightCallTimer <= 0) {
    const biome = biomeAt(player.pos.x, player.pos.z).id;
    if (biome === 'marsh') sfx.frogCroak();
    else if (biome === 'forest' && Math.random() < .48) sfx.owlHoot();
    else sfx.insectChirp();
    nightCallTimer = 10 + Math.random() * 18;
  }
}

let movementSoundTimer = 0;
function updateMovementSounds(dt, movement) {
  // Das Floß bleibt bewusst lautlos. Wichtig ist die frühe Rückgabe, damit
  // während der Fahrt weder Schritte noch Schwimmgeräusche abgespielt werden.
  if (game.boat) {
    movementSoundTimer = 0.08;
    return;
  }
  if (!movement.moving) {
    movementSoundTimer = Math.min(movementSoundTimer, 0.08);
    return;
  }
  movementSoundTimer -= dt;
  if (movementSoundTimer > 0) return;
  if (game.bike) {
    const intensity = THREE.MathUtils.clamp(Math.abs(game.bike.speed || 0) / 8.6, .1, 1);
    const rough = terrainSlope(game.bike.x, game.bike.z) > .38 || terrainHeight(game.bike.x, game.bike.z) > 8;
    sfx.bikeRoll(intensity, rough);
    movementSoundTimer = THREE.MathUtils.lerp(.42, .16, intensity);
    return;
  }
  if (movement.swimming) {
    sfx.swimStroke(movement.underwater);
    movementSoundTimer = movement.underwater ? 0.72 : 0.58;
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
  movementSoundTimer = movement.wading ? 0.5 : player.sprinting ? 0.29 : 0.42;
}

function updateTorch(dt) {
  if (!torchHeld()) return;
  const lightId = selected();
  // Fackel brennt zeitbasiert herunter. Im Regen brennt die offene Flamme
  // deutlich schneller ab (bei Starkregen ~3,5×), solange man ungeschützt
  // ist — die verglaste Laterne bleibt davon unberührt.
  const rain = world.rainIntensity || 0;
  const rainSoaked = lightId === 'fackel' && rain > 0.2 && !buildings.isSheltered(player.pos) ? 1 + rain * 2.5 : 1;
  game.dura[lightId] = (game.dura[lightId] ?? ITEMS[lightId].dura) - dt * rainSoaked;
  if (game.dura[lightId] <= 0) {
    delete game.dura[lightId];
    removeItem(lightId, 1);
    ui.toast(tr('m.lightOut', { name: ITEMS[lightId].name }), 'hint');
    sfx.hurt();
    return;
  }
  torchLight.visible = true;
  if (player.perspective === 'third') torchLight.position.set(player.pos.x, player.pos.y + 1.35, player.pos.z);
  else torchLight.position.set(camera.position.x, camera.position.y + 0.1, camera.position.z);
  torchLight.intensity = (lightId === 'laterne' ? 3 : 2) * (0.85 + Math.sin(performance.now() * 0.012) * 0.12 + Math.random() * 0.06);
  ui.updateDuraBar(lightId, game.dura[lightId] / ITEMS[lightId].dura);
}

function raycastTargets(range) {
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.far = aimFar(range);
  const radiusSq = (range + 3) * (range + 3);
  const nearPlayer = (p) => {
    const dx = p.x - player.pos.x, dz = p.z - player.pos.z;
    return dx * dx + dz * dz <= radiusSq;
  };
  // Nur Objekte, die überhaupt innerhalb der Ray-Länge liegen können. Zuvor
  // wurde bei jedem HUD-Update die gesamte Ressourcen-Hierarchie durchlaufen.
  targetCandidates.length = 0;
  for (const r of resources.list) if (r.alive && nearPlayer(r)) targetCandidates.push(r.group);
  for (const a of animals.list) if (nearPlayer(a.pos)) targetCandidates.push(a.group);
  for (const f of aquatics.list) if (nearPlayer(f.group.position)) targetCandidates.push(f.group);
  const hits = ray.intersectObjects(targetCandidates, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.res && !o.userData.animal && !o.userData.fish) o = o.parent;
    if (!o) continue;
    if (o.userData.res && !o.userData.res.alive) continue;
    if (Math.hypot(h.point.x - player.pos.x, h.point.z - player.pos.z) > range + .8) continue;
    return { obj: o, point: h.point };
  }
  return null;
}

function raycastRemotePlayer(range) {
  if (!multiplayer.active || !remotePlayers.size) return null;
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.far = aimFar(range);
  const hit = ray.intersectObjects([...remotePlayers.values()].map((remote) => remote.group), true)[0];
  if (!hit) return null;
  let object = hit.object;
  while (object && !object.userData.remotePlayer) object = object.parent;
  const remote = object && remotePlayers.get(object.userData.remotePlayer);
  if (!remote || Math.hypot(hit.point.x - player.pos.x, hit.point.z - player.pos.z) > range + .8) return null;
  return { remote, point: hit.point, distance: hit.distance };
}

function buildingHitFromCrosshair(range = 4.5) {
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.far = aimFar(range);
  const groups = buildings.placed.map((b) => b.group);
  const hit = ray.intersectObjects(groups, true)[0];
  if (!hit || Math.hypot(hit.point.x - player.pos.x, hit.point.z - player.pos.z) > range + .8) return null;
  let obj = hit.object;
  while (obj && !obj.userData.building) obj = obj.parent;
  const building=obj?.userData.building||null;
  return building?{building,point:hit.point,distance:hit.distance}:null;
}

function raycastBuilding(range = 4.5) {
  return buildingHitFromCrosshair(range)?.building||null;
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
  if (def.type === 'medicine') return useMedicine(id);
  if (def.type === 'placeable') return placeSelected(id);
  // Der Bogen reagiert auf Drücken/Loslassen und wird deshalb nicht wie ein
  // normales Werkzeug sofort bzw. wiederholt ausgelöst.
  if (id === 'bogen') return;
  if (id === 'angel') return beginFishingAction();
  attack(id);
}

const fishingOrigin = new THREE.Vector3();
const fishingTarget = new THREE.Vector3();
const fishingMid = new THREE.Vector3();

function rodLineOrigin(out = fishingOrigin) {
  const forwardX = Math.sin(player.yaw);
  const forwardZ = Math.cos(player.yaw);
  return out.set(
    player.pos.x + forwardX * .38 + Math.cos(player.yaw) * .28,
    player.pos.y + 1.28,
    player.pos.z + forwardZ * .38 - Math.sin(player.yaw) * .28,
  );
}

function makeFishingRig(origin, target) {
  const bobber = new THREE.Group();
  const lower = new THREE.Mesh(new THREE.SphereGeometry(.095, 10, 7), new THREE.MeshStandardMaterial({ color: 0xf2eee0, roughness: .7 }));
  lower.scale.y = 1.25;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.07, 9, 6), new THREE.MeshStandardMaterial({ color: 0xd84436, roughness: .65 }));
  cap.position.y = .105;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .28, 6), new THREE.MeshStandardMaterial({ color: 0x432d20, roughness: .9 }));
  stem.position.y = .18;
  bobber.add(lower, cap, stem);
  bobber.position.copy(origin);
  scene.add(bobber);

  const geometry = new THREE.BufferGeometry().setFromPoints([origin, origin, target]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xe3e4d8, transparent: true, opacity: .82 }));
  line.frustumCulled = false;
  scene.add(line);
  return { bobber, line };
}

function updateFishingLine(fishing) {
  const origin = rodLineOrigin();
  const bobber = fishing.bobber.position;
  const distance = origin.distanceTo(bobber);
  fishingMid.copy(origin).lerp(bobber, .52);
  fishingMid.y -= Math.min(.75, distance * .055) * (fishing.phase === 'hooked' ? .2 + fishing.tension * .8 : 1);
  const pos = fishing.line.geometry.attributes.position;
  pos.setXYZ(0, origin.x, origin.y, origin.z);
  pos.setXYZ(1, fishingMid.x, fishingMid.y, fishingMid.z);
  pos.setXYZ(2, bobber.x, bobber.y + .08, bobber.z);
  pos.needsUpdate = true;
}

function fishingHud(fishing) {
  if (!fishing) return ui.setFishing(null);
  const phase = fishing.phase;
  const data = phase === 'casting'
    ? { phase: tr('f.casting'), status: tr('f.castingStatus'), hint: tr('f.castingHint'), progress: 0, tension: 0 }
    : phase === 'waiting'
      ? { phase: tr('f.waiting'), status: tr('f.waitingStatus'), hint: tr('f.waitingHint'), progress: 0, tension: 0 }
      : phase === 'bite'
        ? { phase: tr('f.bite'), status: tr('f.biteStatus'), hint: tr('f.biteHint'), progress: 0, tension: 22, bite: true }
        : { phase: tr('f.reeling'), status: tr(fishing.reeling ? 'f.reelingIn' : 'f.fishPulls'), hint: tr('f.reelingHint'), progress: fishing.progress * 100, tension: fishing.tension * 100, danger: fishing.tension > .82 };
  ui.setFishing(data);
}

function startFishing() {
  if (game.fishing) return;
  camera.getWorldDirection(spearDirection);
  spearDirection.y = 0;
  if (spearDirection.lengthSq() < .01) spearDirection.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  spearDirection.normalize();
  const target = player.pos.clone().addScaledVector(spearDirection, 8);
  if (terrainHeight(target.x, target.z) > WATER_Y - 1.1) return ui.toast(tr('m.castDeep'), 'hint');
  const origin = rodLineOrigin(new THREE.Vector3());
  const rig = makeFishingRig(origin, target);
  game.fishing = {
    ...rig, phase: 'casting', target: target.clone(), castOrigin: origin.clone(), castTime: 0,
    waitTime: 3.2 + Math.random() * 4.8, biteTime: 0, reeling: false,
    progress: 0, tension: .28, slackTime: 0, fightTime: 0, struggle: Math.random() * Math.PI * 2,
  };
  player.swing();
  fishingHud(game.fishing);
  ui.toast(tr('m.rodCast'));
}

function beginFishingAction() {
  const fishing = game.fishing;
  if (!fishing) { startFishing(); return false; }
  if (fishing.phase === 'bite') {
    fishing.phase = 'hooked';
    fishing.reeling = true;
    fishing.tension = .32;
    fishing.slackTime = 0;
    ui.toast(tr('m.hooked'));
    fishingHud(fishing);
    return false;
  }
  if (fishing.phase === 'hooked') {
    fishing.reeling = true;
    return false;
  }
  if (fishing.phase === 'waiting') ui.toast(tr('m.noBite'), 'hint');
  return false;
}

function endFishingAction() {
  if (game.fishing) game.fishing.reeling = false;
}

function cancelFishing(silent = false, message = tr('f.cancelled')) {
  const fishing = game.fishing;
  if (!fishing) return;
  scene.remove(fishing.bobber, fishing.line);
  fishing.line.geometry.dispose();
  fishing.line.material.dispose();
  fishing.bobber.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    object.material.dispose();
  });
  game.fishing = null;
  ui.setFishing(null);
  if (!silent && message) ui.toast(message, 'hint');
}

function finishFishing() {
  addItem('fleisch_roh', 1);
  addXP(18, tr('xp.fishLanded'));
  useDurability('angel');
  sfx.pickup();
  cancelFishing(true);
  ui.toast(tr('m.fishLanded'));
  saveGame();
}

function loseFishing(reason) {
  cancelFishing(true);
  ui.toast(reason, 'hint');
}

function updateFishing(dt) {
  const fishing = game.fishing;
  if (!fishing) return;
  if (selected() !== 'angel' || game.state !== 'playing') return;
  const origin = rodLineOrigin();
  if (Math.hypot(fishing.bobber.position.x - origin.x, fishing.bobber.position.z - origin.z) > 14) {
    loseFishing(tr('f.tooFar'));
    return;
  }

  if (fishing.phase === 'casting') {
    fishing.castTime += dt;
    const t = Math.min(1, fishing.castTime / .62);
    fishing.bobber.position.lerpVectors(fishing.castOrigin, fishing.target, t);
    fishing.bobber.position.y = THREE.MathUtils.lerp(fishing.castOrigin.y, WATER_Y + .08, t) + Math.sin(t * Math.PI) * 2.1;
    if (t >= 1) {
      fishing.phase = 'waiting';
      fishing.bobber.position.y = WATER_Y + .08;
      fishingHud(fishing);
    }
  } else if (fishing.phase === 'waiting') {
    fishing.waitTime -= dt;
    fishing.bobber.position.y = WATER_Y + .08 + Math.sin(performance.now() * .0024) * .025;
    fishing.bobber.rotation.z = Math.sin(performance.now() * .0018) * .08;
    if (fishing.waitTime <= 0) {
      fishing.phase = 'bite';
      fishing.biteTime = 1.35;
      fishingHud(fishing);
      ui.toast(tr('m.bite'));
    }
  } else if (fishing.phase === 'bite') {
    fishing.biteTime -= dt;
    fishing.bobber.position.y = WATER_Y - .14 + Math.sin(performance.now() * .018) * .08;
    fishing.bobber.rotation.z = Math.sin(performance.now() * .025) * .32;
    if (fishing.biteTime <= 0) {
      loseFishing(tr('f.tooLate'));
      return;
    }
  } else if (fishing.phase === 'hooked') {
    fishing.fightTime += dt;
    const burst = Math.max(0, Math.sin(fishing.fightTime * 2.15 + fishing.struggle));
    const struggle = .11 + burst * .27;
    if (fishing.reeling) {
      fishing.progress = Math.min(1, fishing.progress + dt * (.145 - burst * .035));
      fishing.tension += dt * (.31 + struggle);
      fishing.slackTime = Math.max(0, fishing.slackTime - dt * 2);
    } else {
      fishing.tension -= dt * (.24 - burst * .05);
      fishing.progress = Math.max(0, fishing.progress - dt * (.012 + burst * .012));
      fishing.slackTime = fishing.tension < .08 ? fishing.slackTime + dt : 0;
    }
    fishing.tension = THREE.MathUtils.clamp(fishing.tension, 0, 1.05);
    const remaining = 1 - fishing.progress;
    fishingTarget.copy(origin).lerp(fishing.target, remaining);
    const sideX = Math.cos(player.yaw), sideZ = -Math.sin(player.yaw);
    const dart = Math.sin(fishing.fightTime * 3.7 + fishing.struggle) * (1.1 * remaining);
    fishing.bobber.position.set(fishingTarget.x + sideX * dart, WATER_Y - .02 - burst * .08, fishingTarget.z + sideZ * dart);
    fishing.bobber.rotation.z = Math.sin(fishing.fightTime * 8) * .25;
    if (fishing.tension >= 1) {
      loseFishing(tr('f.lineSnapped'));
      return;
    }
    if (fishing.slackTime > 1.15) {
      loseFishing(tr('f.lineSlack'));
      return;
    }
    if (fishing.progress >= 1) {
      finishFishing();
      return;
    }
    fishingHud(fishing);
  }
  updateFishingLine(fishing);
}

function eatItem(id) {
  if ((game.inv[id] || 0) <= 0) return;
  const def = ITEMS[id];
  removeItem(id, 1);
  player.hunger = Math.min(100, player.hunger + def.hunger);
  if (def.thirst) player.thirst = THREE.MathUtils.clamp(player.thirst + def.thirst, 0, 100);
  if (def.hp > 0) player.hp = Math.min(player.maxHp, player.hp + def.hp);
  if (def.warmthSeconds) {
    game.warmMealUntil = Math.max(game.warmMealUntil, Date.now() + def.warmthSeconds * 1000);
    player.warmth = Math.min(100, player.warmth + 22);
  }
  if (def.hp < 0) {
    player.damage(-def.hp);
    ui.toast(tr('m.ateRaw', { name: def.name, n: -def.hp }));
  } else {
    const hydration = def.thirst === 0 ? '' : tr('m.ateWater', { n: def.thirst > 0 ? `+${def.thirst}` : def.thirst });
    const warmth = def.warmthSeconds ? tr('m.ateWarmth', { n: Math.round(def.warmthSeconds/60) }) : '';
    ui.toast(tr('m.ate', { name: def.name, n: def.hunger, extra: `${hydration}${warmth}` }));
  }
  sfx.eat();
}

function useMedicine(id) {
  if ((game.inv[id] || 0) <= 0) return;
  if (player.hp >= player.maxHp) {
    ui.toast(tr('m.healthFull'), 'hint');
    return;
  }
  const def=ITEMS[id];
  const before=player.hp;
  removeItem(id,1);
  player.hp=Math.min(player.maxHp,player.hp+(def.hp||0));
  ui.toast(tr('m.bandaged', { name: def.name, n: Math.round(player.hp-before) }));
  sfx.pickup();
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

// Eine gemeinsame Auswertung für Linksklick und E hält Drops, Effekte und
// Sammel-Fortschritt identisch. E reicht bei Beeren und Pilzen immer die Hand
// durch, unabhängig davon, welcher Gegenstand gerade ausgewählt ist.
function harvestResource(hit, toolId = 'hand') {
  const res = hit?.obj?.userData?.res;
  if (!res) return false;
  const result = resources.hit(res, toolId);
  if (!result) return false;
  multiplayer.resourceHit(resources.list.indexOf(res), toolId);
  multiplayer.queueWorldState(sharedWorldState());
  if (!['bush','mushroom','herb','cache'].includes(result.kind)) sfx.attack();
  if (result.kind === 'tree') { sfx.chop(); effects.burst(hit.point, 0x8a5a2b, 8); }
  else if (result.kind === 'rock') { sfx.stone(); effects.burst(hit.point, 0x8d8d93, 8); }
  else if (result.kind === 'mushroom') { effects.burst(hit.point, result.variant === 'cave' ? 0x55e6c1 : 0xc97945, 7, 2); sfx.pickup(); }
  else if (result.kind === 'herb') { effects.burst(hit.point, 0x69bd62, 8, 2); sfx.pickup(); }
  else if (result.kind === 'cache') { effects.burst(hit.point, 0xd1aa68, 12, 2.6); sfx.pickup(); }
  else { effects.burst(hit.point, 0x4757c8, 6, 2); }
  if (['tree', 'rock'].includes(result.kind)) {
    ui.hitFeedback('resource', result.destroyed);
    if (result.destroyed) {
      effects.burst(hit.point, result.kind === 'tree' ? 0x6c4328 : 0x777b80, 16, 4.3);
      sfx.resourceBreak(result.kind);
    }
  } else {
    ui.hitFeedback('pickup');
  }
  if (result.hint && Math.random() < 0.4) ui.toast(result.hint, 'hint');
  if (result.drops) {
    for (const [id, n] of Object.entries(result.drops)) {
      let amount = n;
      if ((game.inv.sammlergurt || 0) > 0 && ['holz', 'stein', 'eisenerz'].includes(id)) {
        game.gatherBonusProgress += n * .25;
        const bonus = Math.floor(game.gatherBonusProgress);
        game.gatherBonusProgress -= bonus;
        amount += bonus;
      }
      addItem(id, amount);
    }
  }
  if (result.kind === 'mushroom') {
    const milestone = result.variant === 'cave' ? 'forage-cave' : 'forage-forest';
    if (!game.hintsShown[milestone]) {
      game.hintsShown[milestone] = true;
      addXP(result.variant === 'cave' ? 35 : 15, result.variant === 'cave' ? tr('xp.glowFound') : tr('xp.mushrooms'));
    }
  }
  if (result.kind === 'herb' && !game.hintsShown['healing-herb']) {
    game.hintsShown['healing-herb']=true;
    addXP(18,tr('xp.herbFound'));
    ui.toast(tr('m.herbFound'),'hint');
  }
  if (result.kind === 'cache') addXP(28,tr('xp.packRecovered'));
  if (['tree','rock'].includes(result.kind)) useDurability(toolId);
  return true;
}

function attack(toolId) {
  if (!player.swing()) return;
  if (toolId === 'hammer') {
    const building = raycastBuilding();
    if (!building) return;
    if ((building.type === 'raft' && (game.boat?.id === building.id
      || [...remotePlayers.values()].some((remote) => remote.vehicle?.raftId === building.id)))) {
      ui.toast(tr('m.raftOccupied'), 'hint');
      return;
    }
    if (building.type === 'bike' && game.bike?.id === building.id) {
      ui.toast(tr('m.getOffBike'), 'hint');
      return;
    }
    if(building.type==='watchtower'&&watchtowerAtPlayer(building)){
      ui.toast(tr('m.getOffStand'),'hint');
      return;
    }
    const result = buildings.dismantle(building);
    if (!result.ok) {
      if (result.reason === 'storage-not-empty') {
        ui.toast(building.type === 'raft'
          ? tr('m.raftHoldFull')
          : building.type === 'bike' ? tr('m.rackFull')
            : tr('m.chestFull'), 'hint');
      }
      return;
    }
    for (const [id, n] of Object.entries(result.refunds)) addItem(id, n, true);
    ui.toast(tr('m.dismantled'));
    sfx.place();
    useDurability('hammer');
    saveGame();
    return;
  }
  const range = 3.4;
  const hit = raycastTargets(range);
  const remoteHit = raycastRemotePlayer(range);
  if (remoteHit && (!hit || remoteHit.distance < camera.position.distanceTo(hit.point))) {
    const damage = Math.max(8, toolIdDamage(toolId) * 6);
    multiplayer.hit(remoteHit.remote.id, damage, toolId);
    effects.burst(remoteHit.point, 0xb94435, 6, 2);
    sfx.hit();
    ui.hitFeedback('combat');
    useDurability(toolId);
    return;
  }
  if (!hit) { sfx.attack(); return; }

  if (hit.obj.userData.res) {
    harvestResource(hit, toolId);
  } else if (hit.obj.userData.animal) {
    sfx.attack();
    const animal = hit.obj.userData.animal;
    const trackedPosition = animal.trackingTarget ? animal.pos.clone() : null;
    const dmg = toolIdDamage(toolId);
    const dir = new THREE.Vector3().subVectors(animal.pos, player.pos).setY(0).normalize();
    sfx.hit();
    // Koop-Gast: Tiere gehören dem Host – Treffer dorthin melden, Beute/XP
    // kommen per animal_result zurück. Lokal nur Trefferfeedback zeigen.
    if (animals.remote) {
      multiplayer.animalHit(animal.id, dmg, dir);
      effects.burst(hit.point, 0xb94435, 7, 2.3);
      ui.hitFeedback('combat', false);
      useDurability(toolId);
      return;
    }
    const result = animals.hit(animal, dmg, dir);
    effects.burst(hit.point, 0xb94435, result.killed ? 12 : 7, result.killed ? 3.7 : 2.3);
    ui.hitFeedback(result.killed ? 'kill' : 'combat', result.killed);
    if (result.killed) {
      sfx.killConfirm();
      ui.toast(result.bossId ? tr('m.bossDown', { name: result.name }) : tr('m.animalDown', { name: result.name }));
      addXP(result.xp || 15, `${result.name} erlegt`);
      spawnGroundLoot(animal.pos.x, animal.pos.z, result.drops);
      if (trackedPosition) completeTrackingTarget(animal, trackedPosition);
      saveGame(false);
    }
    useDurability(toolId);
  }
}

// Präzisionsschäfte (Upgrade): Pfeile fliegen 40% schneller und weiter.
function bowRangeBoost() {
  return (game.inv.praezisionsschaefte || 0) > 0 ? 1.4 : 1;
}

// Bogen abfeuern: Die Spannstärke bestimmt Schaden, Geschwindigkeit und Reichweite.
function shootBow(power = 0) {
  if ((game.inv.pfeil || 0) <= 0) {
    ui.toast(tr('m.noArrows'), 'hint');
    return;
  }
  const charge = THREE.MathUtils.clamp(power, 0, 1);
  const damage = Math.max(1, Math.round(toolIdDamage('bogen') * (.55 + charge * 1.45)));
  removeItem('pfeil', 1);
  sfx.attack();
  const shotRange=40*bowRangeBoost();
  const remoteHit = raycastRemotePlayer(shotRange);
  const blockingBuildingHit=buildingHitFromCrosshair(shotRange);
  if (remoteHit&&(!blockingBuildingHit||remoteHit.distance<blockingBuildingHit.distance)) {
    multiplayer.hit(remoteHit.remote.id, Math.max(10, damage * 4), 'bogen');
    ui.hitFeedback('combat');
  }
  shootArrow(charge, damage);
  useDurability('bogen');
}

// In Third Person hängt die Kamera seitlich versetzt hinter dem Spieler. Der
// Pfeil startet aber am Spieler — flöge er einfach parallel zur Blickrichtung,
// ginge er dauerhaft links am Fadenkreuz vorbei. Deshalb: den Punkt suchen,
// auf den das Fadenkreuz tatsächlich zeigt (Tiere, Fische, Ressourcen,
// Terrain — sonst ein ferner Punkt auf dem Kamerastrahl), und den Pfeil von
// seiner Startposition aus genau dorthin ausrichten.
function arrowAimPoint(maxDist) {
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  const camToPlayer = camera.position.distanceTo(player.pos);
  ray.far = maxDist + camToPlayer;
  const radiusSq = ray.far * ray.far;
  const nearPlayer = (p) => {
    const dx = p.x - player.pos.x, dz = p.z - player.pos.z;
    return dx * dx + dz * dz <= radiusSq;
  };
  targetCandidates.length = 0;
  for (const r of resources.list) if (r.alive && nearPlayer(r)) targetCandidates.push(r.group);
  for (const a of animals.list) if (nearPlayer(a.pos)) targetCandidates.push(a.group);
  for (const f of aquatics.list) if (nearPlayer(f.group.position)) targetCandidates.push(f.group);
  for (const building of buildings.placed) if (nearPlayer(building)) targetCandidates.push(building.group);
  let bestDist = ray.far;
  for (const h of ray.intersectObjects(targetCandidates, true)) {
    // Treffer zwischen Kamera und Spieler ignorieren — die liegen hinter dem
    // Pfeil-Spawn und würden das Ziel nach hinten ziehen.
    if (h.distance <= camToPlayer + .4) continue;
    bestDist = h.distance;
    break;
  }
  // Terrain entlang des Strahls abtasten, damit auch Schüsse auf den Boden
  // (z.B. vor einem Tier) im Fadenkreuz landen.
  const probe = new THREE.Vector3();
  for (let t = camToPlayer + 1; t < bestDist; t += .75) {
    probe.copy(ray.ray.origin).addScaledVector(ray.ray.direction, t);
    if (probe.y < terrainHeight(probe.x, probe.z)) { bestDist = t; break; }
  }
  return probe.copy(ray.ray.origin).addScaledVector(ray.ray.direction, bestDist);
}

function shootArrow(charge, damage) {
  camera.getWorldDirection(spearDirection);
  const dir = spearDirection.clone().normalize();
  const rangeBoost = bowRangeBoost();
  const maxDistance = (24 + charge * 24) * rangeBoost;
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
  if (player.perspective === 'third') {
    g.position.set(player.pos.x, player.pos.y + 1.35, player.pos.z).addScaledVector(dir, .75);
    // Flugrichtung auf den Fadenkreuz-Zielpunkt konvergieren lassen statt
    // parallel zur (seitlich versetzten) Kamera zu fliegen.
    dir.subVectors(arrowAimPoint(maxDistance), g.position).normalize();
  } else {
    g.position.copy(camera.position).addScaledVector(dir, 0.8).add(new THREE.Vector3(0, -0.1, 0));
  }
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  scene.add(g);
  flyingArrows.push({
    group: g, dir, damage, distance: 0,
    speed: (18 + charge * 24) * rangeBoost,
    maxDistance,
  });
}

function updateFlyingArrows(dt) {
  for (let i = flyingArrows.length - 1; i >= 0; i--) {
    const spear = flyingArrows[i];
    const step = spear.speed * dt;
    ray.set(spear.group.position, spear.dir);
    ray.far = step + 0.35;
    projectileTargets.length=0;
    projectileTargets.push(animals.group,aquatics.group);
    for(const building of buildings.placed)projectileTargets.push(building.group);
    const hits = ray.intersectObjects(projectileTargets, true);
    let animal = null, fish = null, hitBuilding = null;
    if (hits.length) {
      let obj = hits[0].object;
      while (obj && !obj.userData.animal && !obj.userData.fish && !obj.userData.building) obj = obj.parent;
      animal = obj?.userData.animal || null;
      fish = obj?.userData.fish || null;
      hitBuilding = obj?.userData.building || null;
    }

    if(hitBuilding){
      const stone=['stonewall'].includes(hitBuilding.type);
      effects.burst(hits[0].point,stone?0x7b817e:0x81532f,stone?6:8,1.8);
      sfx.hit();
      scene.remove(spear.group);
      flyingArrows.splice(i,1);
      continue;
    }

    if (fish && aquatics.hit(fish)) {
      sfx.hit();
      sfx.killConfirm();
      ui.hitFeedback('kill', true);
      addItem('fleisch_roh', 1);
      ui.toast(tr('m.fishShot'));
      scene.remove(spear.group);
      flyingArrows.splice(i, 1);
      continue;
    }

    if (animal && animals.list.includes(animal)) {
      sfx.hit();
      // Koop-Gast: Bogentreffer an den Host melden (Beute/XP kommen zurück).
      if (animals.remote) {
        multiplayer.animalHit(animal.id, spear.damage, spear.dir);
        effects.burst(hits[0].point, 0xb94435, 7, 2.3);
        ui.hitFeedback('combat', false);
        scene.remove(spear.group);
        flyingArrows.splice(i, 1);
        continue;
      }
      const trackedPosition = animal.trackingTarget ? animal.pos.clone() : null;
      const result = animals.hit(animal, spear.damage, spear.dir);
      effects.burst(hits[0].point, 0xb94435, result.killed ? 12 : 7, result.killed ? 3.7 : 2.3);
      ui.hitFeedback(result.killed ? 'kill' : 'combat', result.killed);
      if (result.killed) {
        sfx.killConfirm();
        ui.toast(result.bossId ? tr('m.bossDown', { name: result.name }) : tr('m.animalDown', { name: result.name }));
        addXP(result.xp || 15, `${result.name} erlegt`);
        spawnGroundLoot(animal.pos.x, animal.pos.z, result.drops);
        if (trackedPosition) completeTrackingTarget(animal, trackedPosition);
        saveGame(false);
      }
      scene.remove(spear.group);
      flyingArrows.splice(i, 1);
      continue;
    }

    spear.group.position.addScaledVector(spear.dir, step);
    spear.distance += step;
    const ground = terrainHeight(spear.group.position.x, spear.group.position.z);
    if (spear.distance >= spear.maxDistance || spear.group.position.y <= ground + 0.08) {
      scene.remove(spear.group);
      flyingArrows.splice(i, 1);
    }
  }
}

function toolIdDamage(toolId) {
  let damage = 1;
  if (toolId === 'bogen') {
    damage = 5
      + ((game.inv.jagdkoecher || 0) > 0 ? 1 : 0)
      + ((game.inv.eisenspitzen || 0) > 0 ? 2 : 0)
      // Bewusst nur +2 je Stufe: Mit +3 tötete ein Level-20-Spieler den
      // stärksten Gegner in weniger Pfeilen als vor der Erweiterung — das
      // Endgame wäre trotz höherer Tiers leichter geworden.
      + ((game.inv.hornbogen || 0) > 0 ? 2 : 0)
      + ((game.inv.wildmeisterbogen || 0) > 0 ? 2 : 0);
  }
  else if (toolId === 'jagdspeer') damage = 7;
  else if (toolId === 'metallaxt' || toolId === 'metallhacke') damage = 3;
  else if (toolId === 'axt' || toolId === 'spitzhacke') damage = 2;
  const equippedDamage = damage + ((game.inv.veteranenabzeichen || 0) > 0 ? 1 : 0);
  return equippedDamage * levelStatMultiplier(game.level);
}

function activateSignalBeacon(beacon) {
  if (!beacon || beacon.lit) {
    if (beacon?.lit) ui.toast(tr('m.beaconLit'));
    return;
  }
  const cost = { holz:5, stein:2 };
  const missing = Object.entries(cost).filter(([id, amount]) => (game.inv[id] || 0) < amount);
  if (missing.length) {
    ui.toast(tr('m.beaconMissing', { list: missing.map(([id, amount]) => `${amount - (game.inv[id] || 0)}× ${ITEMS[id].name}`).join(tr('m.and')) }), 'hint');
    return;
  }
  for (const [id, amount] of Object.entries(cost)) removeItem(id, amount);
  landmarks.setBeaconLit(beacon.id, true);
  const active = landmarks.litBeaconIds().length;
  addXP(65 + active * 15, tr('xp.beaconLit', { a: active, b: BEACON_COUNT }));
  sfx.beaconLit();
  effects.burst(new THREE.Vector3(beacon.x, terrainHeight(beacon.x, beacon.z) + .8, beacon.z), 0xffb13c, 18, 2.6);
  renderer.shadowMap.needsUpdate = true;
  if (active === BEACON_COUNT) {
    addXP(240, tr('xp.beaconNetwork'));
    ui.toast(tr('m.beaconNetwork'));
  } else {
    ui.toast(tr('m.beaconLitNow', { a: active, b: BEACON_COUNT }));
  }
  saveGame(false, true);
}

function caveCacheReward(cache) {
  if (cache.type === 'root') return {
    pilz:3+Math.floor(Math.random()*3), beeren:2+Math.floor(Math.random()*3), holz:2,
  };
  if (cache.type === 'ice') return {
    eisenerz:2+Math.floor(Math.random()*3), stein:3+Math.floor(Math.random()*3), pfeil:2,
  };
  if (cache.type === 'shadow') return {
    eisenerz:3+Math.floor(Math.random()*3), stein:3+Math.floor(Math.random()*3), pfeil:3, fell:1,
  };
  return {
    eisen:1+(Math.random()<.28?1:0), pfeil:5+Math.floor(Math.random()*4), fleisch:2,
  };
}

function rewardFitsInventory(reward) {
  const preview = { ...game.inv };
  for (const [id, amount] of Object.entries(reward)) preview[id] = (preview[id] || 0) + amount;
  return inventoryUsed(preview) <= inventoryCapacity(preview);
}

function claimCaveCache(cache) {
  if (!cache) return;
  if (cache.type === 'tide' && !player.underwater) {
    ui.toast(tr('m.crateUnderwater'), 'hint');
    return;
  }
  const nextDay = Number(game.caveCacheDays[cache.id]) || 0;
  if (world.day < nextDay) {
    ui.toast(tr('m.cacheEmpty', { name: cache.name, n: nextDay }), 'hint');
    return;
  }
  const reward = caveCacheReward(cache);
  if (!rewardFitsInventory(reward)) {
    ui.toast(tr('m.cacheNoRoom'), 'hint');
    return;
  }
  const gained=[];
  for(const [id,amount] of Object.entries(reward)){
    const accepted=addItem(id,amount,true);
    if(accepted) gained.push(`${accepted}× ${ITEMS[id].name}`);
  }
  game.caveCacheDays[cache.id] = world.day + cache.cooldownDays;
  game.caveCacheClaims = (game.caveCacheClaims || 0) + 1;
  landmarks.updateCaveCaches(world.day, game.caveCacheDays);
  addXP(75 + Math.min(65, game.caveCacheClaims * 3), `${cache.name} geborgen`);
  effects.burst(new THREE.Vector3(cache.x, cache.y+.55, cache.z), cache.type === 'ice' ? 0x75dff2 : cache.type === 'tide' ? 0x5fd0aa : 0xd1a557, 14, 2.1);
  sfx.caveCache();
  ui.toast(tr('m.cacheLooted', { name: cache.name, list: gained.join(' · '), n: game.caveCacheDays[cache.id] }));
  saveGame(false, true);
}

function watchtowerAtPlayer(specific = null) {
  const towers=specific?[specific]:buildings.placed.filter((building)=>building.type==='watchtower');
  return towers.find((tower)=>tower.type==='watchtower'&&tower.platform
    &&Math.abs(player.pos.y-tower.platform.y)<.7
    &&Math.hypot(player.pos.x-tower.x,player.pos.z-tower.z)<=tower.platform.r+.3)||null;
}

function restorePlayerToSavedWatchtower() {
  const requestedId=game.pendingWatchtowerId;
  let tower=requestedId
    ? buildings.placed.find((building)=>building.type==='watchtower'&&building.id===requestedId)||null
    : null;
  // Migration alter Spielstände: Sie speicherten keine Höhe. Befindet sich
  // deren Bodenposition direkt im Unterbau, war der Spieler sehr wahrscheinlich
  // auf der Plattform und wird aus der neuen Kollision nach oben gerettet.
  if(!tower&&game.pendingWatchtowerLegacy){
    tower=buildings.placed.find((building)=>building.type==='watchtower'
      &&Math.hypot(player.pos.x-building.x,player.pos.z-building.z)<=1.4)||null;
  }
  game.pendingWatchtowerId=null;
  game.pendingWatchtowerLegacy=false;
  if(!tower?.platform)return false;
  player.pos.set(tower.x,tower.platform.y,tower.z);
  player.vel.set(0,0,0);player.vy=0;player.grounded=true;
  player.swimming=false;player.underwater=false;
  player.updateCamera(0);
  return true;
}

function useWatchtower(tower) {
  if(!tower?.platform)return;
  cancelFishing(false, tr('f.endLadder'));
  player.vel.set(0,0,0);player.vy=0;player.swimming=false;player.underwater=false;player.grounded=true;
  if(watchtowerAtPlayer(tower)){
    // Die Leiter liegt lokal an +Z. Etwas Abstand zur Tierbarriere sorgt dafür,
    // dass der Spieler sicher neben den Füßen des Hochsitzes ankommt.
    const frontX=Math.sin(tower.rot),frontZ=Math.cos(tower.rot);
    const x=tower.x+frontX*2.25,z=tower.z+frontZ*2.25;
    player.pos.set(x,terrainHeight(x,z),z);
    ui.toast(tr('m.standLeft'));
  }else{
    player.pos.set(tower.x,tower.platform.y,tower.z);
    ui.toast(tr('m.standClimbed'),'hint');
  }
  player.updateCamera(0);
}

function wallSoundIntensity(x,z,range=42) {
  return THREE.MathUtils.clamp(1-Math.hypot(player.pos.x-x,player.pos.z-z)/range,.15,1);
}

function damageWoodWallFromWolf(wall,damage) {
  if(!wall||wall.type!=='wall')return;
  const {x,z}=wall;
  const result=buildings.damageWoodWall(wall,damage);
  if(!result)return;
  const distance=Math.hypot(player.pos.x-x,player.pos.z-z);
  if(!result.destroyed&&distance<42)sfx.wallScratch(wallSoundIntensity(x,z));
  if(result.destroyed){
    effects.burst(new THREE.Vector3(x,terrainHeight(x,z)+.9,z),0x8a5a32,24,4.2);
    if(distance<60){
      sfx.wallBreak(wallSoundIntensity(x,z,60));
      ui.toast(tr('m.wallBroken'),'hint');
    }
    renderer.shadowMap.needsUpdate=true;
  }
  if(multiplayer.active&&multiplayer.isHost()){
    multiplayer.sendWorldEvent({kind:result.destroyed?'wall_break':'wall_scratch',x,z});
    multiplayer.queueWorldState(sharedWorldState(),result.destroyed?0:700);
  }else if(result.destroyed)saveGame(false);
}

function repairWoodWall(wall) {
  if(!wall||wall.type!=='wall'||wall.hp>=wall.maxHp)return false;
  if(selected()!=='hammer'){ui.toast(tr('m.needHammer'),'hint');return true;}
  if((game.inv.holz||0)<1){ui.toast(tr('m.repairNeedWood'),'hint');return true;}
  removeItem('holz',1);
  const restored=buildings.repairWoodWall(wall,35);
  if(!restored)return true;
  useDurability('hammer');
  sfx.place();
  effects.burst(new THREE.Vector3(wall.x,wall.group.position.y+1,wall.z),0x9a6b3b,7,1.5);
  ui.toast(tr('m.wallRepaired', { n: Math.round(restored) }));
  renderer.shadowMap.needsUpdate=true;
  saveGame(false,true);
  return true;
}

// E — Interagieren (Sammeln / Kochen / Schlafen)
function interact() {
  if (game.bike) {
    exitBike();
    return;
  }
  if (game.boat) {
    exitRaft();
    return;
  }
  const interactionBuilding=raycastBuilding();
  const tower=watchtowerAtPlayer()||aimedBuildingOfType('watchtower',4.2,interactionBuilding);
  if(tower){useWatchtower(tower);return;}
  const downedPartner = nearestDownedPartner();
  if (downedPartner) {
    const now = performance.now();
    if (!downedPartner.reviveRequestedAt || now - downedPartner.reviveRequestedAt > 1200) {
      downedPartner.reviveRequestedAt = now;
      multiplayer.revive(downedPartner.id);
      ui.toast(tr('m.reviving', { name: downedPartner.name }), 'hint');
      sfx.revive();
    }
    return;
  }
  const loot = nearestGroundLoot(2.6);
  if (loot) {
    collectGroundLoot(loot);
    return;
  }
  const aimedResource = raycastTargets(3.4);
  if (['bush','mushroom','herb','cache'].includes(aimedResource?.obj?.userData?.res?.kind)) {
    harvestResource(aimedResource);
    return;
  }
  const nearbyBeacon = landmarks.nearestBeacon(player.pos, 3.7, game.discoveries);
  if (nearbyBeacon && !nearbyBeacon.lit) {
    activateSignalBeacon(nearbyBeacon);
    return;
  }
  const caveCache = landmarks.nearestCaveCache(player.pos, 3.25, game.discoveries);
  if (caveCache) {
    claimCaveCache(caveCache);
    return;
  }
  const aimedBuilding = raycastBuilding();
  if(aimedBuilding?.type==='wall'&&aimedBuilding.hp<aimedBuilding.maxHp&&repairWoodWall(aimedBuilding))return;
  if (aimedBuilding?.type === 'gate') {
    const gateOccupants = [
      { x: player.pos.x, z: player.pos.z, r: .45 },
      ...animals.list.map((animal) => ({
        x: animal.pos.x,
        z: animal.pos.z,
        r: Math.max(.34, (animal.def.contactR || 1.4) * .42),
      })),
    ];
    if (!buildings.toggleGate(aimedBuilding, gateOccupants)) {
      ui.toast(tr('m.gateBlocked'));
      return;
    }
    ui.toast(aimedBuilding.open ? tr('m.gateOpened') : tr('m.gateClosed'));
    sfx.place();
    saveGame();
    return;
  }
  const raft = aimedBuildingOfType('raft', 3.8, aimedBuilding);
  if (raft) {
    enterRaft(raft);
    return;
  }
  const bike = aimedBuildingOfType('bike', 3.4, aimedBuilding);
  if (bike) {
    enterBike(bike);
    return;
  }
  const chest = aimedBuildingOfType('chest', 3.5, aimedBuilding);
  if (chest) {
    if (chest.expeditionEvent) completeExpeditionEvent(chest);
    if (chest.trackingReward) completeTrackingReward(chest);
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
        ui.toast(tr('m.fireRelit'));
        sfx.cook();
        saveGame();
      } else {
        ui.toast(tr('m.needWood'), 'hint');
      }
      return;
    }
    // Brennendes Feuer: erst braten …
    if ((game.inv.fleisch_roh || 0) > 0) {
      removeItem('fleisch_roh', 1);
      addItem('fleisch', 1, true);
      const rawLeft = game.inv.fleisch_roh || 0;
      ui.toast(rawLeft > 0 ? tr('m.meatCooked', { n: rawLeft }) : tr('m.lastMeatCooked'));
      if (rawLeft === 0) fire.cookingFinishedAt = performance.now();
      sfx.cook();
      refreshInv();
      return;
    }
    // Seltene Höhlenpilze werden zuerst zum stärkeren Expeditionsgericht.
    if ((game.inv.leuchtpilz || 0) > 0 && (game.inv.pilz || 0) >= 2) {
      removeItem('leuchtpilz',1);removeItem('pilz',2);addItem('hoehlenragout',1,true);
      fire.cookingFinishedAt=performance.now();
      ui.toast(tr('m.stewCooked'));
      if(!game.craftedOnce.includes('hoehlenragout')){game.craftedOnce.push('hoehlenragout');addXP(35,tr('xp.newDish'));}
      sfx.cook();refreshInv();saveGame();return;
    }
    if ((game.inv.pilz || 0) >= 3) {
      removeItem('pilz',3);addItem('pilzpfanne',1,true);
      fire.cookingFinishedAt=performance.now();
      ui.toast(tr('m.skilletCooked'));
      if(!game.craftedOnce.includes('pilzpfanne')){game.craftedOnce.push('pilzpfanne');addXP(25,tr('xp.newDish'));}
      sfx.cook();refreshInv();saveGame();return;
    }
    // … sonst mit Holz nachlegen
    if ((game.inv.holz || 0) > 0 && fire.fuel < fire.maxFuel) {
      // Schnelles Weiterdrücken nach dem letzten Fleisch darf nicht ungewollt
      // direkt ein Holzstück verbrauchen.
      if (fire.cookingFinishedAt && performance.now() - fire.cookingFinishedAt < 1600) {
        ui.toast(tr('m.noRawMeat'), 'hint');
        return;
      }
      removeItem('holz', 1);
      buildings.refuel(fire, CAMPFIRE_WOOD_FUEL);
      ui.toast(tr('m.woodAdded'));
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
      ui.toast(tr('m.canteenFilled', { n: Math.round(game.bottleWater) }));
      sfx.pickup();
      saveGame();
      return;
    }
    const water = buildings.drinkFrom(catcher, Math.min(30, Math.max(0, (100 - player.thirst) / 1.5)));
    if (water > 0) {
      player.thirst = Math.min(100, player.thirst + water * 1.5);
      ui.toast(tr('m.drankRain'));
      sfx.eat();
      saveGame();
    } else ui.toast(catcher.water > 0 ? tr('m.notThirsty') : tr('m.catcherEmpty'), 'hint');
    return;
  }
  const tent = aimedBuildingOfType('tent', 3.2, aimedBuilding);
  if (tent && world.night) {
    game.state = 'sleeping';
    stopDesktopAction();
    sfx.sleep();
    ui.sleepTransition(() => {
      world.sleep();
      player.hp = Math.min(player.maxHp, player.hp + 25);
      player.hunger = Math.max(0, player.hunger - 8);
      player.thirst = Math.max(0, player.thirst - 10);
      saveGame();
    }, () => {
      game.state = 'playing';
      ui.toast(tr('m.sleptWell'));
    });
  }
}

// Stabiler Schlüssel einer Truhe/eines Laderaums über beide Clients hinweg.
// Neue Bauten besitzen eine persistente ID; der Positions-Fallback hält alte
// Spielstände kompatibel. Besonders beim fahrenden Floß darf die Position
// selbst nicht länger seine Identität bestimmen.
function storageKey(box) {
  return box ? box.id || `${box.type}:${Math.round(box.x * 10)}:${Math.round(box.z * 10)}` : null;
}
function storageTitleFor(box) {
  return box.type === 'raft' ? tr('s.raftHold') : box.type === 'bike' ? tr('s.bikeRack') : (box.eventTitle || 'Holztruhe');
}

function storageByKey(key) {
  if (!key) return null;
  return buildings.placed.find((building) => storageKey(building) === key) || null;
}

function cleanStorage(storage) {
  const clean = {};
  if (!storage || typeof storage !== 'object') return clean;
  for (const [id, amount] of Object.entries(storage)) {
    if (!ITEMS[id]) continue;
    const count = Math.max(0, Math.floor(Number(amount) || 0));
    if (count > 0) clean[id] = count;
  }
  return clean;
}

function openStorage(container, title) {
  stopDesktopAction(); game.storage = container; game.state = 'storage';
  ui.renderStorage(title, game.inv, container.storage || (container.storage = {}), capacityInfo()); ui.showStorage(true);
  exitPointerLock(); touch?.show(false);
}
function closeStorage(deferPointerLock = false) {
  game.storage = null;
  ui.showStorage(false);
  resumePlaying();
  if (!touch?.enabled && !deferPointerLock) lockPointer();
}
let mapViewSnapshot = null;
let mapViewRestoreToken = 0;

function restoreMapView(view) {
  if (!view) return;
  const token = ++mapViewRestoreToken;
  const guardUntil = performance.now() + 560;
  player.ignoreLookUntil = Math.max(player.ignoreLookUntil, guardUntil);
  const apply = () => {
    if (token !== mapViewRestoreToken) return;
    player.yaw = view.yaw;
    player.pitch = view.pitch;
    camera.rotation.set(view.pitch, view.yaw, 0);
  };
  // Pointer-Lock wechselt asynchron. Ein Browser kann sein synthetisches
  // movementX/Y sowohl direkt als auch erst einige Frames später senden.
  apply();
  requestAnimationFrame(apply);
  setTimeout(apply, 120);
  setTimeout(() => {
    apply();
    if (token === mapViewRestoreToken) mapViewRestoreToken = 0;
  }, 420);
}

function refreshMap() {
  ui.showMap(true, player.pos, landmarks.list, game.discoveries, WORLD_RADIUS, player.yaw, game.expeditionEvent || trackingMapSignal(), game.level,
    multiplayer.active ? [...remotePlayers.values()].map((r) => ({ x: r.target.x, z: r.target.z, name: r.name })) : [],
    buildings.placed.filter((building) => building.type === 'tent').map((tent) => ({ x: tent.x, z: tent.z })));
}

function toggleMap(show = game.state !== 'map', deferPointerLock = false) {
  if (show) {
    mapViewRestoreToken++;
    mapViewSnapshot = { yaw:player.yaw, pitch:player.pitch };
    stopDesktopAction(); game.state = 'map';
    syncWaypoints();
    refreshMap();
    exitPointerLock(); touch?.show(false);
  } else {
    const view = mapViewSnapshot;
    mapViewSnapshot = null;
    ui.showMap(false);
    resumePlaying();
    if (!touch?.enabled && !deferPointerLock) lockPointer();
    restoreMapView(view);
  }
}
// Wegpunkte reicht die Karte an die UI weiter und, im Koop, an die Mitspieler.
function syncWaypoints() {
  ui.waypoints = game.waypoints || [];
  ui.setWaypointTarget((game.waypoints || []).find((w) => !w.remote) || (game.waypoints || [])[0] || null);
}

ui.onWaypointSet = (x, z) => {
  const eigene = (game.waypoints || []).filter((w) => !w.remote);
  game.waypoints = (game.waypoints || []).filter((w) => w.remote);
  // Klick außerhalb der Karte oder Rechtsklick löscht den eigenen Wegpunkt.
  const entfernen = x == null || z == null;
  if (!entfernen && Math.hypot(x, z) <= WORLD_RADIUS) {
    game.waypoints.push({ author: 'local', authorName: 'Du', x, z, remote: false });
    sfx.uiOpen?.();
  } else if (!eigene.length && entfernen) {
    return;
  }
  syncWaypoints();
  multiplayer.waypoint(entfernen ? null : { x, z });
  ui.toast(entfernen ? tr('m.waypointRemoved') : tr('m.waypointSet', { x: Math.round(x), z: Math.round(z) }), 'hint');
  if (game.state === 'map') refreshMap();
};

let radialX = 0, radialY = 0, radialChoice = 'hand';
function openRadial() {
  if (game.state !== 'playing') return;
  stopDesktopAction(); game.state = 'radial'; radialX = 0; radialY = 0; radialChoice = selected();
  const ids = game.hotbar.filter((id) => slotUsable(id, game.inv));
  ui.showRadial(true, ids, radialChoice);
  sfx.uiOpen();
}
function closeRadial() {
  if (game.state !== 'radial') return;
  ui.showRadial(false);
  const idx = game.hotbar.indexOf(radialChoice);
  if (idx >= 0) selectSlot(idx);
  game.state = 'playing';
  sfx.uiConfirm();
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
    if (isBodyCarried(id)) { ui.toast(tr('m.equippedNoStore', { name: ITEMS[id].name }), 'hint'); return; }
    box.storage[id] = (box.storage[id] || 0) + n; game.inv[id] -= n;
  } else {
    const n = Math.min(amount || 0, box.storage[id] || 0); const moved = addItem(id, n, true); box.storage[id] -= moved;
    if (moved < n) ui.toast(tr('m.packFull'), 'hint');
  }
  refreshInv();
  const supplyEmpty = box.temporarySupply && !Object.values(box.storage || {}).some((n) => n > 0);
  if (supplyEmpty) {
    if (multiplayer.active) multiplayer.sendStorage(storageKey(box), null, true);
    buildings.removeBuilding(box);
    saveGame();
    ui.toast(tr('m.crateEmptied', { name: box.eventTitle || tr('m.supplyCrate') }));
    closeStorage();
    return;
  }
  if (multiplayer.active) multiplayer.sendStorage(storageKey(box), { ...box.storage });
  ui.renderStorage(storageTitleFor(box), game.inv, box.storage, capacityInfo()); saveGame();
};

function clearRaftRideState() {
  game.boat = null;
  game.boatRole = null;
  game.boatSeat = 0;
  game.boatDriverId = null;
  game.boatClaimedAt = 0;
  game.boatDriverMissingSince = 0;
}

function enterRaft(raft) {
  cancelFishing(false, tr('f.endRaft'));
  game.boat = raft;
  raft.speed ||= 0;
  raft.turnSpeed ||= 0;
  const remoteDriver = multiplayer.active ? activeRemoteRaftDriver(raft.id) : null;
  if (remoteDriver) {
    const seat = availablePassengerSeat(raft.id);
    if (seat < 0) {
      clearRaftRideState();
      ui.toast(tr('m.raftMax'), 'hint');
      return;
    }
    game.boatRole = 'passenger';
    game.boatSeat = seat;
    game.boatDriverId = remoteDriver.id;
    game.boatClaimedAt = Number(remoteDriver.vehicle?.claimedAt) || 0;
  } else {
    game.boatRole = 'driver';
    game.boatSeat = 0;
    game.boatDriverId = null;
    game.boatClaimedAt = Date.now();
  }
  game.boatDriverMissingSince = 0;
  player.vel.set(0, 0, 0);
  player.vy = 0;
  bindPlayerToRaftSeat(raft, game.boatSeat);
  ui.toast(game.boatRole === 'driver'
    ? tr('m.raftBoarded')
    : tr('m.raftPassengerSeat', { name: remoteDriver.name, seat: game.boatSeat }));
}

function exitRaft() {
  const raft = game.boat;
  if (!raft) return;
  const wasDriver = game.boatRole === 'driver';
  const sideX = Math.cos(raft.rot) * 1.8;
  const sideZ = -Math.sin(raft.rot) * 1.8;
  player.pos.set(raft.x + sideX, WATER_Y - 0.15, raft.z + sideZ);
  player.vel.set(0, 0, 0);
  clearRaftRideState();
  if (multiplayer.active) multiplayer.sendPlayerState(currentPlayerNetworkState());
  if (wasDriver) saveGame(false, true);
  ui.toast(tr('m.raftLeft'));
}

function bindPlayerToRaftSeat(raft, seatIndex = 0) {
  raftSeatWorldPosition(raft, seatIndex, player.pos);
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.grounded = true;
  player.swimming = false;
  player.underwater = false;
  player.sprinting = false;
}

function raftSeatWorldPosition(raft, seatIndex = 0, target = new THREE.Vector3()) {
  const seat = RAFT_SEATS[Math.max(0, Math.min(RAFT_SEATS.length - 1, seatIndex))] || RAFT_SEATS[0];
  const cos = Math.cos(raft.rot), sin = Math.sin(raft.rot);
  return target.set(
    raft.x + cos * seat.x + sin * seat.z,
    raft.group.position.y + .29,
    raft.z - sin * seat.x + cos * seat.z,
  );
}

function updateRaft(dt) {
  let raft = game.boat;
  if (!raft) return player.update(dt);
  if (!buildings.placed.includes(raft)) {
    raft = raftById(raft.id);
    if (raft) game.boat = raft;
    else {
      clearRaftRideState();
      ui.toast(tr('m.raftGone'), 'hint');
      return player.update(dt);
    }
  }

  if (game.boatRole === 'passenger') {
    const driver = activeRemoteRaftDriver(raft.id);
    if (driver) {
      game.boatDriverId = driver.id;
      game.boatDriverMissingSince = 0;
    } else {
      game.boatDriverMissingSince ||= performance.now();
      if (performance.now() - game.boatDriverMissingSince > 1200) {
        game.boatRole = 'driver';
        game.boatSeat = 0;
        game.boatDriverId = null;
        game.boatClaimedAt = Date.now();
        game.boatDriverMissingSince = 0;
        ui.toast(tr('m.driverGone'), 'hint');
      }
    }
    bindPlayerToRaftSeat(raft, game.boatSeat);
    player.updateCamera(dt);
    return { wading: false, swimming: false, underwater: false, moving: Math.abs(raft.speed || 0) > .25 };
  }

  const k = player.keys;
  const touchInput = player.touchInput;
  const throttle = touchInput?.enabled ? touchInput.vec.y : (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
  const steer = touchInput?.enabled ? touchInput.vec.x : (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  const targetSpeed = throttle * (throttle > 0 ? 5.4 : 2.4);
  raft.speed += (targetSpeed - raft.speed) * Math.min(1, dt * (throttle ? 1.8 : 0.75));
  const steerGrip = THREE.MathUtils.clamp(Math.abs(raft.speed) / 2.2, 0.18, 1);
  // D/rechts soll nach rechts lenken: rot wächst Richtung +x, das entspricht
  // dem negativen Lenkeingang relativ zur Blickrichtung.
  raft.turnSpeed += (-steer * 0.85 * steerGrip - raft.turnSpeed) * Math.min(1, dt * 2.4);
  raft.rot += raft.turnSpeed * dt * (raft.speed < 0 ? -1 : 1);
  const fx = Math.sin(raft.rot), fz = Math.cos(raft.rot);
  const nx = THREE.MathUtils.clamp(raft.x + (fx * raft.speed + world.wind.x * 0.18) * dt, -WORLD_RADIUS + 5, WORLD_RADIUS - 5);
  const nz = THREE.MathUtils.clamp(raft.z + (fz * raft.speed + world.wind.z * 0.18) * dt, -WORLD_RADIUS + 5, WORLD_RADIUS - 5);
  if (terrainHeight(nx, nz) < WATER_Y - 0.18) { raft.x = nx; raft.z = nz; }
  else raft.speed *= Math.max(0, 1 - dt * 5);
  raft.group.position.set(raft.x, WATER_Y + 0.05 + Math.sin(performance.now() * 0.0018) * 0.045, raft.z);
  raft.group.rotation.set(Math.sin(performance.now() * 0.0013) * 0.012, raft.rot, Math.sin(performance.now() * 0.0017 + 1) * 0.018);
  bindPlayerToRaftSeat(raft, 0);
  player.updateCamera(dt);
  return { wading: false, swimming: false, underwater: false, moving: Math.abs(raft.speed) > .25 };
}

function clearBikeRideState() {
  game.bike=null;
}

function enterBike(bike) {
  if(!bike||bike.type!=='bike')return;
  cancelFishing(false,tr('f.endBike'));
  game.bike=bike;
  bike.speed||=0;bike.turnSpeed||=0;
  if(bike.group.userData.bikeRack)bike.group.userData.bikeRack.visible=(game.inv.gepaecktraeger||0)>0;
  player.vel.set(0,0,0);player.vy=0;player.sprinting=false;
  bindPlayerToBike(bike);
  ui.toast(tr('m.bikeMounted', { rack: (game.inv.gepaecktraeger||0)>0 ? tr('m.bikeRack') : '' }));
}

function exitBike() {
  const bike=game.bike;
  if(!bike)return;
  const sideX=Math.cos(bike.rot)*1.25,sideZ=-Math.sin(bike.rot)*1.25;
  const x=THREE.MathUtils.clamp(bike.x+sideX,-WORLD_RADIUS,WORLD_RADIUS);
  const z=THREE.MathUtils.clamp(bike.z+sideZ,-WORLD_RADIUS,WORLD_RADIUS);
  player.pos.set(x,terrainHeight(x,z),z);
  player.vel.set(0,0,0);player.vy=0;
  clearBikeRideState();
  saveGame(false,true);
  ui.toast(tr('m.bikeLeft'));
}

function bindPlayerToBike(bike) {
  player.pos.set(bike.x,bike.group.position.y+.72,bike.z);
  player.vel.set(0,0,0);player.vy=0;player.grounded=true;
  player.swimming=false;player.underwater=false;player.sprinting=false;
}

function updateBike(dt) {
  let bike=game.bike;
  if(!bike)return player.update(dt);
  if(!buildings.placed.includes(bike)) {
    bike=bikeById(bike.id);
    if(bike)game.bike=bike;
    else {clearBikeRideState();ui.toast(tr('m.bikeGone'),'hint');return player.update(dt);}
  }
  const k=player.keys,touchInput=player.touchInput;
  const throttle=bike.debugThrottle??(touchInput?.enabled?touchInput.vec.y:(k.KeyW?1:0)-(k.KeyS?1:0));
  const steer=touchInput?.enabled?touchInput.vec.x:(k.KeyD?1:0)-(k.KeyA?1:0);
  const cockpitTurn=-steer*.22-bike.turnSpeed*.055;
  bikeCockpit.rotation.y+=(cockpitTurn-bikeCockpit.rotation.y)*Math.min(1,dt*9);
  bikeCockpit.rotation.z+=((steer*.025-bike.turnSpeed*.018)-bikeCockpit.rotation.z)*Math.min(1,dt*7);
  bikeCockpit.position.y=-.42+Math.sin(performance.now()*.011)*Math.min(.012,Math.abs(bike.speed||0)*.0014);
  const upgraded=(game.inv.gelaendereifen||0)>0;
  // Abseits der ausgebauten Wege kommt das Geländefahrrad nun ebenfalls über
  // typische Hügel; Geländereifen erschließen auch deutlich rauere Hänge.
  const maxSpeed=upgraded ? 13.8 : 10.6,maxSlope=upgraded ? 1.05 : .72;
  const targetSpeed=throttle*(throttle>0?maxSpeed:3.4);
  bike.speed+=(targetSpeed-bike.speed)*Math.min(1,dt*(throttle?2.4:1.25));
  const grip=THREE.MathUtils.clamp(Math.abs(bike.speed)/4,.15,1);
  // Lenkung entspricht der Blickrichtung: D/rechts dreht nach rechts (negatives Vorzeichen).
  bike.turnSpeed+=(-steer*1.35*grip-bike.turnSpeed)*Math.min(1,dt*3.4);
  bike.rot+=bike.turnSpeed*dt*(bike.speed<0?-1:1);
  const fx=Math.sin(bike.rot),fz=Math.cos(bike.rot);
  const nx=THREE.MathUtils.clamp(bike.x+fx*bike.speed*dt,-WORLD_RADIUS+3,WORLD_RADIUS-3);
  const nz=THREE.MathUtils.clamp(bike.z+fz*bike.speed*dt,-WORLD_RADIUS+3,WORLD_RADIUS-3);
  const h=terrainHeight(nx,nz),slope=terrainSlope(nx,nz);
  // Die Welt enthält weit über tausend Ressourcen. Eine globale Suche pro
  // Fahr-Frame ließ die Framerate deshalb genau beim Aufsteigen einbrechen.
  // Ortsfeste Ressourcen kommen aus dem Raumraster; die vergleichsweise
  // kleinen, dynamischen Bau-/Landmark-Listen bleiben direkte Abfragen.
  const resourceBlocked=resources.collidesAt(nx,nz,.62);
  const structureBlocked=buildings.obstacles
    .some((o)=>o.building!==bike&&Math.hypot(nx-o.x,nz-o.z)<o.r+.62)
    ||landmarks.obstacles.some((o)=>Math.hypot(nx-o.x,nz-o.z)<o.r+.62);
  const blocked=resourceBlocked||structureBlocked;
  if(h>WATER_Y+.2&&slope<maxSlope&&!blocked) {bike.x=nx;bike.z=nz;}
  else bike.speed*=Math.max(0,1-dt*7);
  const ground=terrainHeight(bike.x,bike.z);
  bike.group.position.set(bike.x,ground,bike.z);
  bike.group.rotation.y=bike.rot;
  const front=terrainHeight(bike.x+fx*.65,bike.z+fz*.65),back=terrainHeight(bike.x-fx*.65,bike.z-fz*.65);
  bike.group.rotation.x=THREE.MathUtils.clamp(Math.atan2(front-back,1.3),-.38,.38);
  const wheelSpin=bike.speed*dt/.48;
  for(const wheel of bike.group.userData.wheels||[])wheel.rotation.x+=wheelSpin;
  bike.group.userData.bikeRack&&(bike.group.userData.bikeRack.visible=(game.inv.gepaecktraeger||0)>0);
  bindPlayerToBike(bike);
  player.yaw=bike.rot+Math.PI;
  player.updateCamera(dt);
  bike.rot=bike.group.rotation.y;
  return {wading:false,swimming:false,underwater:false,moving:Math.abs(bike.speed)>.25};
}

// ---------- Crafting ----------
ui.onCraft = (recipe) => {
  if (game.level < (recipe.level || 1)) return ui.toast(tr('m.needLevel', { n: recipe.level }), 'hint');
  if (recipe.station && ui.craftStation !== recipe.station) return ui.toast(tr('m.needWorkbench'), 'hint');
  if (recipe.requiresBike && (game.inv.fahrrad || 0) <= 0 && !buildings.placed.some((building) => building.type === 'bike')) {
    return ui.toast(tr('m.needBikeFirst'), 'hint');
  }
  for (const [id, n] of Object.entries(recipe.cost)) {
    if ((game.inv[id] || 0) < n) return;
  }
  const def = ITEMS[recipe.out];
  const alreadyUpgraded = recipe.out === 'grosser_rucksack' && (game.inv.expeditionsrucksack || 0) > 0;
  if (def.once && ((game.inv[recipe.out] || 0) > 0 || alreadyUpgraded)) return;
  let amount = recipe.yield || 1;
  if (recipe.out === 'pfeil' && (game.inv.jagdkoecher || 0) > 0) amount += 4;

  // Crafting ist atomar: erst den Zustand nach Verbrauch und Ausgabe prüfen.
  // Ist dafür kein Platz, bleiben sämtliche Zutaten unangetastet.
  const projected = { ...game.inv };
  for (const [id, n] of Object.entries(recipe.cost)) projected[id] = Math.max(0, (projected[id] || 0) - n);
  projected[recipe.out] = (projected[recipe.out] || 0) + amount;
  if (inventoryUsed(projected) > inventoryCapacity(projected)) {
    ui.toast(tr('m.noRoomFor', { name: `${amount > 1 ? `${amount}× ` : ''}${def.name}` }), 'hint');
    return;
  }

  for (const [id, n] of Object.entries(recipe.cost)) game.inv[id] = Math.max(0, (game.inv[id] || 0) - n);
  game.inv[recipe.out] = (game.inv[recipe.out] || 0) + amount;
  if (def.dura) game.dura[recipe.out] = def.dura; // neues Werkzeug: volle Haltbarkeit
  ui.toast(tr('m.crafted', { name: `${amount > 1 ? `${amount}× ` : ''}${def.name}` }));
  if (!game.craftedOnce.includes(recipe.out)) {
    game.craftedOnce.push(recipe.out);
    addXP(20, tr('xp.newCraft'));
  }
  sfx.craft();
  refreshInv();
  // Neu hergestellte Werkzeuge sofort aktivieren. Im geöffneten Crafting-Menü
  // wird die Auswahl bereits vorbereitet; sichtbar in der Hand ist sie direkt
  // nach dem Schließen des Menüs.
  if (def.type === 'tool') {
    const craftedSlot = game.hotbar.indexOf(recipe.out);
    if (craftedSlot >= 0) selectSlot(craftedSlot);
  }
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
  sfx.uiOpen();
}

function closeCraft(deferPointerLock = false) {
  sfx.uiClose();
  resumePlaying();
  // Erst nach Abschluss des aktuellen Tastaturereignisses wieder einfangen.
  // So kann Escape nicht gleichzeitig das Crafting schließen und den gerade
  // neu gesetzten Pointer-Lock lösen, was sonst das Pausenmenü öffnen würde.
  if (!touch?.enabled && !deferPointerLock) setTimeout(() => {
    if (game.state === 'playing') lockPointer();
  }, 0);
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
  // Während der Browser den Pointer-Lock neu aushandelt, darf ein zuvor
  // aktiver Unlocked-Fallback keine normale Cursorbewegung als Blick erfassen.
  player.allowUnlockedLook = false;
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
  // Das Verlassen geschieht hier absichtlich für eine UI. Ein eventuell später
  // eintreffendes pointerlockchange darf deshalb nicht als Pause-Geste gelten.
  hadLock = false;
  if (typeof document.exitPointerLock !== 'function') return;
  try {
    document.exitPointerLock();
  } catch { /* Auf Mobile-Browsern nicht immer verfügbar */ }
}

function resumePlaying() {
  // Zentrale Absicherung für jeden Einstieg ins Gameplay (Solo, Koop-Host,
  // Gast, Respawn und Rückkehr aus Untermenüs): Titelmusik gehört nur ins Menü.
  if (music.active || music.audio && !music.audio.paused) music.stop(true);
  game.state = 'playing';
  gameplayStart(); // CrazyGames-Lifecycle (No-Op im Web-Build)
  ui.showOverlay(null);
  ui.showCraft(false);
  ui.showHud(true);
  touch?.show(true);
  // Lokaler visueller Test-Hook: erlaubt gezielte Höhlenprüfungen, ohne
  // mehrere Minuten durch die Welt laufen zu müssen. Wird im Build entfernt.
  if (import.meta.env.DEV && !game.devCaveTeleported) {
    const params = new URLSearchParams(location.search);
    const caveId = params.get('debugCave');
    const cave = caveId && landmarks.list.find((entry) => entry.id === caveId);
    if (cave) {
      const atCache = params.get('spot') === 'cache';
      const cache = atCache && landmarks.caveCaches.find((entry) => entry.id === caveId);
      const cacheLocal=cache&&landmarks.localPoint(cave,cache.x,cache.z);
      const point = cache
        ? landmarks.worldPoint(cave,cacheLocal.x,cacheLocal.z+2.15)
        : landmarks.worldPoint(cave,0,1);
      const x=point.x,z=point.z;
      player.pos.set(x, landmarks.caveFloorAt(cave,x,z), z);
      player.vel.set(0,0,0);
      player.yaw = 0;
      player.hp=player.hunger=player.thirst=player.warmth=player.oxygen=player.stamina=100;
      if (!game.discoveries.includes(caveId)) game.discoveries.push(caveId);
      if(params.get('light')==='1') {
        game.inv.fackel=Math.max(1,game.inv.fackel||0);
        if(!game.hotbar.includes('fackel'))game.hotbar.push('fackel');
        game.hotIdx=game.hotbar.indexOf('fackel');
        syncSelection();
      }
      game.devCaveTeleported = true;
    } else if(params.get('debugBike')==='1') {
      game.inv.gelaendereifen=1;game.inv.gepaecktraeger=1;
      game.xp=Math.max(game.xp,1900);game.level=8;
      let bike=bikeById('debug-bike');
      if(!bike){buildings.place('bike',-4,6,Math.PI,{notifySpawn:false,id:'debug-bike'});bike=buildings.placed[buildings.placed.length-1];}
      bike.debugThrottle=params.get('drive')==='1'?1:null;
      player.pos.set(bike.x,terrainHeight(bike.x,bike.z),bike.z);
      enterBike(bike);
      if(params.get('view')==='first')player.setPerspective('first');
      refreshInv();
      game.devCaveTeleported=true;
    } else if(params.get('debugTent')==='1') {
      world.t=.5;world.night=false;
      let tent=buildings.placed.find((entry)=>entry.id==='debug-tent');
      if(!tent){
        buildings.place('tent',0,-2,0,{notifySpawn:false,id:'debug-tent'});
        tent=buildings.placed[buildings.placed.length-1];
      }
      player.pos.set(0,terrainHeight(0,6),6);
      player.vel.set(0,0,0);
      player.yaw=0;player.pitch=0;
      player.setPerspective('first');
      game.devCaveTeleported=true;
    } else if(params.get('debugRiver')==='1') {
      player.pos.set(-90,terrainHeight(-90,44),44);
      player.vel.set(0,0,0);
      player.yaw=-Math.PI/2;
      player.pitch=-.08;
      player.setPerspective('first');
      game.devCaveTeleported=true;
    }
  }
}

let hadLock = false;
let escapeInterfaceRelock = false;
let suppressPauseUntil = 0;

function closeInterfaceWithEscape(close) {
  // Escape selbst darf den vorhandenen/neuen Pointer-Lock lösen, ohne dass
  // dieser absichtliche UI-Wechsel anschließend als Pause interpretiert wird.
  suppressPauseUntil = performance.now() + 800;
  escapeInterfaceRelock = true;
  close();
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) {
    renderer.domElement.classList.add('cursor-captured');
    player.allowUnlockedLook = false;
    hadLock = true;
    resumePlaying();
  } else {
    renderer.domElement.classList.remove('cursor-captured');
    if (game.state === 'playing' && hadLock) {
      if (performance.now() < suppressPauseUntil) {
        // Falls ein Browser den Unlock erst nach dem Escape-keyup zustellt,
        // noch einmal versuchen, den Blickmodus wiederherzustellen.
        setTimeout(() => {
          if (game.state === 'playing' && !document.pointerLockElement && !touch?.enabled) lockPointer();
        }, 80);
      } else {
        game.state = 'paused';
        ui.showOverlay('pause', { coop: multiplayer.active });
        sfx.uiOpen();
      }
    }
    hadLock = false;
  }
});

player.canLook = () => game.state === 'playing';

function die(cause) {
  if (game.state === 'dead') return;
  stopDesktopAction();
  cancelFishing(true);
  game.state = 'dead';
  gameplayStop(); // CrazyGames-Lifecycle (No-Op im Web-Build)
  game.deathCause = cause;
  game.respawnAt = Date.now() + RESPAWN_WAIT;
  sfx.die();
  exitPointerLock();
  touch?.show(false);
  touch?.setSwimming(false);
  document.body.classList.remove('underwater');
  ui.showHud(false);
  // Im Koop kann man wählen, ob man am Zelt oder beim Mitspieler respawnt –
  // aber nur, wenn gerade tatsächlich ein Mitspieler in der Welt ist.
  const livingPartner = multiplayer.active ? nearestLivingPartner() : null;
  const coopPartner = livingPartner?.name || (livingPartner ? 'Mitspieler' : null);
  ui.showOverlay('dead', { days: world.day, cause, coopPartner, wait: RESPAWN_WAIT });
  ui.setRespawnCountdown(RESPAWN_WAIT);
  // Der normale 10-Hz-Snapshot stoppt im Todeszustand. Deshalb den Tod sofort
  // senden, damit der Mitspieler nicht bis zum nächsten Zustandswechsel eine
  // stehende/schwebende Figur sieht.
  multiplayer.sendPlayerState(currentPlayerNetworkState({ hp: 0, dead: true, vulnerable: false }));
}

// Liefert einen Spawnpunkt in der Nähe des Mitspielers (leicht versetzt, damit
// man nicht exakt ineinander steht). null, wenn kein Mitspieler in Reichweite ist.
function partnerSpawnPoint() {
  const remote = nearestLivingPartner();
  if (!remote) return null;
  const angle = Math.random() * Math.PI * 2;
  return { x: remote.target.x + Math.cos(angle) * 2.6, z: remote.target.z + Math.sin(angle) * 2.6 };
}

function respawn(withPenalty = false, spawnPoint = null) {
  cancelFishing(true);
  if (withPenalty) {
    let lost = 0;
    for (const id of ['holz', 'stein', 'fell', 'beeren', 'pilz', 'leuchtpilz', 'pilzpfanne', 'hoehlenragout', 'fleisch_roh', 'fleisch', 'eisenerz', 'eisen']) {
      const amount = game.inv[id] || 0;
      const drop = Math.floor(amount * 0.25);
      if (drop > 0) { game.inv[id] -= drop; lost += drop; }
    }
    if (lost) setTimeout(() => ui.toast(tr('m.recovered', { n: lost }), 'hint'), 500);
  }
  clearRaftRideState();
  clearBikeRideState();
  player.hp = player.maxHp;
  player.hunger = 60;
  player.oxygen = 100;
  player.thirst = 65;
  player.warmth = 100;
  player.stamina = player.maxStamina;
  player.exhausted = false;
  const point = spawnPoint || game.spawn;
  player.pos.set(point.x, terrainHeight(point.x, point.z), point.z);
  player.vel.set(0, 0, 0);
  game.fireDamageTimer = 0;
  game.fireWarningShown = false;
  game.warmMealUntil = 0;
  refreshInv();
}

function revivedByPartner(rescuerName = tr('m.yourTeammate')) {
  if (game.state !== 'dead') return;
  game.respawnAt = 0;
  player.hp = 45;
  player.oxygen = 100;
  player.stamina = 55;
  player.exhausted = false;
  player.vel.set(0, 0, 0);
  game.fireDamageTimer = 0;
  game.fireWarningShown = false;
  startAudioForPlay();
  prerenderFirstFrame();
  resumePlaying();
  if (!touch?.enabled) lockPointer();
  sfx.revive();
  ui.toast(tr('m.revivedBy', { name: rescuerName }));
  multiplayer.sendPlayerState(currentPlayerNetworkState({ dead: false, vulnerable: true }));
  saveGame(false, true);
}

function updateFireDamage(dt) {
  const fire = buildings.nearest('campfire', player.pos, 1.2);
  // Die Feuerstelle bleibt nach dem Erlöschen als Gebäude bestehen. Schaden,
  // Warnung und Tick-Timer dürfen deshalb ausschließlich am aktiven
  // Brennzustand hängen – nicht bloß an der Nähe zum Campfire-Mesh.
  if (!fire?.lit || fire.fuel <= 0) {
    game.fireDamageTimer = 0;
    game.fireWarningShown = false;
    return;
  }
  if (!game.fireWarningShown) {
    game.fireWarningShown = true;
    ui.toast(tr('m.fireBurns'), 'hint');
  }
  game.fireDamageTimer -= dt;
  if (game.fireDamageTimer <= 0) {
    game.fireDamageTimer = 0.4;
    player.damage(4, tr('death.fire'));
  }
}

function updateSurvival(dt, travelFactor = 1) {
  const movingDrain = player.sprinting ? 0.13 : 0;
  const bottleFactor = (game.inv.feldflasche || 0) > 0 ? 0.65 : 1;
  const survivalFactor = (game.inv.survivalset || 0) > 0 ? .82 : 1;
  player.thirst = Math.max(0, player.thirst - (0.42 + movingDrain) * bottleFactor * survivalFactor * travelFactor * dt);

  const altitude = terrainHeight(player.pos.x, player.pos.z);
  const nearWarmFire = !!buildings.nearest('campfire', player.pos, 6)?.lit;
  const hasCoat = (game.inv.pelzmantel || 0) > 0;
  const warmMeal = Date.now() < game.warmMealUntil;
  let cold = Math.max(0, (altitude - 6) / 8);
  if (world.night) cold += 0.28;
  const sheltered = buildings.isSheltered(player.pos);
  if (world.rainIntensity > 0.2 && !sheltered) cold += world.rainIntensity * 0.45;
  if (player.swimming) cold += 0.75;
  if (hasCoat) cold *= 0.35;
  if (warmMeal) cold *= 0.52;
  if (nearWarmFire) cold = -1.2;
  const warmthTarget = THREE.MathUtils.clamp(100 - cold * 85, 0, 100);
  const rate = warmthTarget < player.warmth ? 0.065 : 0.18;
  player.warmth += (warmthTarget - player.warmth) * Math.min(1, dt * rate);

  if (player.thirst < 22 && !game.thirstWarning) {
    game.thirstWarning = true;
    ui.toast(tr('m.veryThirsty'), 'hint');
  } else if (player.thirst > 45) game.thirstWarning = false;
  if (player.warmth < 24 && !game.coldWarning) {
    game.coldWarning = true;
    ui.toast(hasCoat ? tr('m.coldCoat') : tr('m.coldNoCoat'), 'hint');
  } else if (player.warmth > 55) game.coldWarning = false;
  if (player.hunger < 20 && !game.hungerWarning) {
    game.hungerWarning = true;
    ui.toast(tr('m.veryHungry'), 'hint');
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
  // Animation/Ablauf laufender Events läuft bei Host und Gast weiter.
  updateExpeditionEvent(dt);
  updateTrackingEvent(dt);
  // Im Koop erzeugt nur der Host neue Welt-Events und schickt sie an den Gast.
  if (multiplayer.active && !multiplayer.isHost()) return;
  game.eventTimer -= dt;
  if (game.eventTimer > 0 || game.expeditionEvent || game.trackingEvent) return;
  const fullSignalNetwork = landmarks.litBeaconIds().length === BEACON_COUNT;
  game.eventTimer = (130 + Math.random() * 150) * (fullSignalNetwork ? .8 : 1);
  const coop = multiplayer.active;
  const roll = Math.random();
  // Die Spurensuche ist eine persönliche Solo-Aufgabe (eigener Zielmarker) und
  // eignet sich nicht für mehrere Spieler – im Koop wird sie zu einem Airdrop.
  if (roll < 0.48 || (coop && roll < 0.73)) {
    spawnExpeditionEvent(world.night ? 'flare' : 'smoke');
  } else if (roll < 0.73) {
    spawnTrackingEvent();
  } else if (roll < 0.87) {
    applyHerdMigration();
    if (coop) multiplayer.sendWorldEvent({ kind: 'herd' });
  } else {
    world.weather='storm'; world.weatherTimer=35+Math.random()*25;
    ui.toast(tr('m.stormFront'), 'hint');
    if (coop) multiplayer.sendWorldEvent({ kind: 'storm' });
  }
}

function validTrackingPoint(x, z) {
  const edge = WORLD_RADIUS - 14;
  if (Math.abs(x) > edge || Math.abs(z) > edge) return false;
  const h = terrainHeight(x, z);
  return h > WATER_Y + .28 && h < 24 && terrainSlope(x, z) < .62;
}

function trackingAnimalKind() {
  if (game.level >= 5 && Math.random() < .22) return 'baer';
  if (game.level >= 3) return Math.random() < .5 ? 'wildschwein' : world.night ? 'wolf' : 'hirsch';
  return world.night && game.level >= 2 && Math.random() < .35 ? 'wolf' : 'hirsch';
}

function buildTrackingPath() {
  for (let route = 0; route < 24; route++) {
    const heading = Math.random() * Math.PI * 2;
    const startDistance = 28 + Math.random() * 20;
    const points = [{
      x: player.pos.x + Math.cos(heading) * startDistance,
      z: player.pos.z + Math.sin(heading) * startDistance,
    }];
    if (!validTrackingPoint(points[0].x, points[0].z)) continue;
    let angle = heading;
    for (let i = 1; i < 5; i++) {
      let next = null;
      for (let attempt = 0; attempt < 18; attempt++) {
        const turn = (Math.random() - .5) * .9;
        const distance = 13 + Math.random() * 9;
        const candidate = {
          x: points.at(-1).x + Math.cos(angle + turn) * distance,
          z: points.at(-1).z + Math.sin(angle + turn) * distance,
        };
        if (validTrackingPoint(candidate.x, candidate.z)) { next = candidate; angle += turn * .55; break; }
      }
      if (!next) break;
      points.push(next);
    }
    if (points.length === 5) return points;
  }
  return null;
}

function createTrackMarker(point, nextPoint, kind) {
  const group = new THREE.Group();
  group.position.set(point.x, terrainHeight(point.x, point.z) + .055, point.z);
  group.rotation.y = Math.atan2(nextPoint.x - point.x, nextPoint.z - point.z);
  const hoofed = ['hirsch', 'wildschwein', 'baer'].includes(kind);
  for (let i = 0; i < 4; i++) {
    const print = new THREE.Group();
    const side = i % 2 ? .18 : -.18;
    const z = (i - 1.5) * .34;
    if (hoofed) {
      for (const split of [-1, 1]) {
        const toe = new THREE.Mesh(trackPrintGeometry, trackPrintMaterial);
        toe.scale.set(.42, .08, .88);
        toe.position.set(side + split * .045, 0, z);
        toe.rotation.y = split * .13;
        print.add(toe);
      }
    } else {
      const pad = new THREE.Mesh(trackPrintGeometry, trackPrintMaterial);
      pad.scale.set(.7, .08, .72); pad.position.set(side, 0, z); print.add(pad);
      for (let toeIndex = -1; toeIndex <= 1; toeIndex++) {
        const toe = new THREE.Mesh(trackPrintGeometry, trackPrintMaterial);
        toe.scale.set(.25, .07, .3);
        toe.position.set(side + toeIndex * .07, 0, z + .11 + Math.abs(toeIndex) * .015);
        print.add(toe);
      }
    }
    group.add(print);
  }
  const ring = new THREE.Mesh(trackGlowGeometry, trackGlowMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = .045;
  ring.userData.trackGlow = true;
  group.add(ring);
  scene.add(group);
  return group;
}

function trackingTitle(kind) {
  const key = { hirsch: 'track.deer', wolf: 'track.wolf', wildschwein: 'track.boar', baer: 'track.bear' }[kind];
  return tr(key || 'track.prey');
}

function setTrackingObjective() {
  const event = game.trackingEvent;
  if (!event) return updateTutorial(true);
  if (event.phase === 'trail') ui.setObjective(tr('obj.trackClue', { a: event.index + 1, b: event.clues.length }), 'compass');
  else if (event.phase === 'hunt') ui.setObjective(tr('obj.trackHunt', { name: trackingTitle(event.kind) }), 'fist');
  else ui.setObjective(tr('m.trackSecure'), 'chest');
}

function spawnTrackingEvent() {
  const path = buildTrackingPath();
  if (!path) { game.eventTimer = 35; return; }
  const kind = trackingAnimalKind();
  const clues = path.slice(0, -1);
  game.trackingEvent = {
    phase: 'trail', kind, clues, targetPoint: path.at(-1), index: 0,
    group: createTrackMarker(clues[0], clues[1], kind), target: null, chest: null,
    x: clues[0].x, z: clues[0].z, remaining: 245,
  };
  setTrackingObjective();
  const event = game.trackingEvent;
  ui.toast(tr('m.tracksFound', { kind: kind === 'wolf' ? tr('m.wolfTracks') : tr('m.animalTracks'), dir: compassDirection(event.x, event.z) }), 'hint');
  sfx.trackingCue();
}

function revealNextTrackingClue() {
  const event = game.trackingEvent;
  if (!event || event.phase !== 'trail') return;
  const found = event.clues[event.index];
  scene.remove(event.group);
  effects.burst(new THREE.Vector3(found.x, terrainHeight(found.x, found.z) + .12, found.z), 0xd5a648, 9, 1.7);
  ui.hitFeedback('pickup');
  sfx.trackingCue();
  event.index++;
  event.remaining = Math.min(300, event.remaining + 28);
  if (event.index < event.clues.length) {
    const clue = event.clues[event.index];
    const next = event.clues[event.index + 1] || event.targetPoint;
    event.group = createTrackMarker(clue, next, event.kind);
    event.x = clue.x; event.z = clue.z;
    ui.toast(tr('m.trailNext', { a: event.index, b: event.clues.length, dir: compassDirection(event.x, event.z) }));
    setTrackingObjective();
    return;
  }

  event.phase = 'hunt';
  event.group = null;
  const target = animals.spawnAt(event.kind, event.targetPoint.x, event.targetPoint.z, {
    trackingTarget: true,
    trackingTitle: trackingTitle(event.kind),
  });
  target.group.scale.multiplyScalar(1.1);
  target.maxHp = Math.ceil(target.maxHp * 1.3);
  target.hp = target.maxHp;
  if (target.def.hostile) target.aggro = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) < 11;
  event.target = target;
  event.x = target.pos.x; event.z = target.pos.z;
  event.remaining = Math.max(event.remaining, 150);
  setTrackingObjective();
  ui.toast(tr('m.preyFlushed', { name: trackingTitle(event.kind) }), 'hint');
  sfx.dangerCue(event.kind === 'baer' ? 1 : .66);
}

function completeTrackingTarget(animal, position) {
  const event = game.trackingEvent;
  if (!event || event.phase !== 'hunt' || event.target !== animal) return;
  const chest = buildings.place('chest', position.x, position.z, Math.random() * Math.PI * 2).userData.building;
  const veteranBonus = Math.min(6, game.trackingCompleted || 0);
  chest.storage = {
    pfeil: 4 + veteranBonus,
    fleisch: 2 + Math.floor(veteranBonus / 2),
    fell: event.kind === 'baer' ? 3 : 1,
    ...(game.level >= 4 ? { eisenerz: 1 + Math.floor(veteranBonus / 3) } : {}),
  };
  chest.temporarySupply = true;
  chest.trackingReward = true;
  chest.eventTitle = tr('xp.trackerLoot');
  event.phase = 'reward'; event.target = null; event.chest = chest;
  event.x = chest.x; event.z = chest.z; event.remaining = 120;
  setTrackingObjective();
  ui.toast(tr('m.huntOver'));
}

function completeTrackingReward(chest) {
  const event = game.trackingEvent;
  if (!event || event.phase !== 'reward' || event.chest !== chest) return;
  chest.trackingReward = false;
  game.trackingCompleted = (game.trackingCompleted || 0) + 1;
  addXP(105 + Math.min(75, game.trackingCompleted * 5), tr('xp.trackDone'));
  game.trackingEvent = null;
  game.eventTimer = 90 + Math.random() * 80;
  updateTutorial(true);
  ui.toast(tr('m.trackDone', { n: game.trackingCompleted }));
  saveGame();
}

function clearTrackingEvent(removeReward = true) {
  const event = game.trackingEvent;
  if (!event) return;
  if (event.group) scene.remove(event.group);
  if (event.target && animals.list.includes(event.target)) {
    animals.group.remove(event.target.group);
    animals.list.splice(animals.list.indexOf(event.target), 1);
  }
  if (removeReward && event.chest && buildings.placed.includes(event.chest)) buildings.removeBuilding(event.chest);
  game.trackingEvent = null;
}

function updateTrackingEvent(dt) {
  const event = game.trackingEvent;
  if (!event) return;
  event.remaining -= dt;
  if (event.phase === 'trail' && event.group) {
    const ring = event.group.children.find((child) => child.userData.trackGlow);
    if (ring) {
      const pulse = 1 + Math.sin(performance.now() * .004) * .1;
      ring.scale.setScalar(pulse);
      ring.material.opacity = .2 + Math.sin(performance.now() * .004) * .08;
    }
    if (Math.hypot(player.pos.x - event.x, player.pos.z - event.z) <= 2.35) revealNextTrackingClue();
  } else if (event.phase === 'hunt' && event.target) {
    event.x = event.target.pos.x; event.z = event.target.pos.z;
  }
  if (event.remaining > 0) return;
  const phase = event.phase;
  clearTrackingEvent(true);
  game.eventTimer = 70 + Math.random() * 70;
  updateTutorial(true);
  ui.toast(phase === 'reward' ? tr('m.crateSwallowed') : tr('m.trailCold'), 'hint');
}

function trackingMapSignal() {
  const event = game.trackingEvent;
  return event ? { type: event.phase === 'trail' ? 'track' : event.phase, x:event.x, z:event.z, remaining:event.remaining } : null;
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
    if (required > game.level) ui.toast(tr('m.biomeWarn', { name: biome.name, n: required }), 'hint');
    else if (required > 1) ui.toast(tr('m.biomeTier', { name: biome.name, n: required }), 'hint');
  }
  if (world.day > game.lastRewardDay) {
    game.lastRewardDay = world.day;
    addXP(60, tr('xp.nightSurvived'));
    const cycle = world.day % 3;
    const reward = cycle === 0 ? { eisenerz: 1, pfeil: 3 } : cycle === 1 ? { holz: 3, beeren: 2 } : { stein: 3, fleisch: 1 };
    const rewardFactor = (game.inv.veteranenabzeichen || 0) > 0 ? 2 : 1;
    const gained = [];
    for (const [id, amount] of Object.entries(reward)) {
      const accepted = addItem(id, amount * rewardFactor, true);
      if (accepted) gained.push(`${accepted}× ${ITEMS[id].name}`);
    }
    if (gained.length) ui.toast(tr('m.dailySupplies', { n: world.day, list: gained.join(' · ') }));
    saveGame();
  }
}

// Himmelsrichtungen sind sprachabhängig (DE: NO/O, EN: NE/E).
function compassDirs() {
  const [n, e, s, w] = [tr('compass.n'), tr('compass.e'), tr('compass.s'), tr('compass.w')];
  return [n, n + e, e, s + e, s, s + w, w, n + w];
}

function compassDirection(x, z) {
  const a = Math.atan2(x - player.pos.x, -(z - player.pos.z));
  return compassDirs()[(Math.round(a / (Math.PI / 4)) + 8) % 8];
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

  // Alle Zufallsparameter hier festlegen, damit Host & Gast dasselbe Signal an
  // derselben Stelle mit denselben Vorräten und Wächtern erhalten.
  const params = {
    type, x: spot.x, z: spot.z, h: spot.h,
    rot: Math.random() * Math.PI * 2,
    storage: type === 'flare'
      ? { eisenerz: 4 + Math.floor(Math.random()*3), pfeil: 6, fleisch: 3, fell: 2 }
      : { eisenerz: 2 + Math.floor(Math.random()*3), holz: 6, fleisch: 2, beeren: 4 },
    eventTitle: type === 'flare' ? tr('m.emergencyCrate') : tr('m.abandonedCrate'),
    guard: Math.random() < .45 ? 'baer' : Math.random() < .65 ? 'wildschwein' : 'wolf',
  };
  params.guardCount = params.guard === 'wolf' ? 3 : params.guard === 'wildschwein' ? 2 : 1;
  applyExpeditionEvent(params);
  if (multiplayer.active) multiplayer.sendWorldEvent({ kind: 'expedition', params });
}

// Baut das Expeditionssignal aus festen Parametern – lokal beim Host wie beim Gast.
function applyExpeditionEvent(params) {
  const { type, x, z, h, rot, storage, eventTitle, guard, guardCount } = params;
  const spot = { x, z, h };
  const group = new THREE.Group();
  group.position.set(x, h, z);
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

  const chest = buildings.place('chest', x, z, rot).userData.building;
  chest.storage = { ...storage };
  chest.expeditionEvent = true;
  chest.temporarySupply = true;
  chest.eventTitle = eventTitle;
  for (let i = 0; i < guardCount; i++) animals.spawnNear(guard, spot, 5, 10);

  game.expeditionEvent = { type, x, z, group, chest, remaining:180 };
  const dir = compassDirection(x, z);
  ui.toast(type === 'flare' ? tr('m.flareSpotted', { dir }) : tr('m.smokeSpotted', { dir }), 'hint');
}

function applyHerdMigration() {
  for (let i = 0; i < 4; i++) animals.spawnNear('hirsch', player.pos, 28, 48);
  ui.toast(tr('m.deerMigration'), 'hint');
}

function updateExpeditionEvent(dt) {
  const e = game.expeditionEvent; if (!e) return;
  if (!buildings.placed.includes(e.chest)) {
    scene.remove(e.group);
    game.expeditionEvent = null;
    game.eventTimer = 100 + Math.random() * 80;
    ui.toast(tr('m.signalFaded'), 'hint');
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
    if (buildings.placed.includes(e.chest)) buildings.removeBuilding(e.chest);
    game.expeditionEvent = null;
    game.eventTimer = 100 + Math.random() * 80;
    ui.toast(tr('m.signalGone'), 'hint');
  }
}

function completeExpeditionEvent(chest) {
  const e = game.expeditionEvent;
  if (!e || e.chest !== chest) return;
  scene.remove(e.group);
  game.expeditionEvent = null;
  game.eventTimer = 110 + Math.random() * 90;
  chest.temporarySupply = true;
  chest.expeditionEvent = false;
  addXP(110, tr('xp.signalReached'));
  ui.toast(tr('m.signalReached'));
}

// ---------- Speichern / Laden ----------
function playerSaveData() {
  const occupiedWatchtower=watchtowerAtPlayer();
  return {
    inv: game.inv,
    dura: game.dura,
    hp: player.hp,
    hunger: player.hunger,
    oxygen: player.oxygen,
    thirst: player.thirst,
    warmth: player.warmth,
    stamina: player.stamina,
    pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
    watchtowerId: occupiedWatchtower?.id||null,
    spawn: game.spawn,
    tutorialStage: game.tutorialStage,
    discoveries: game.discoveries,
    bottleWater: game.bottleWater,
    hintsShown: game.hintsShown,
    xp: game.xp,
    craftedOnce: game.craftedOnce,
    visitedBiomes: game.visitedBiomes,
    lastRewardDay: game.lastRewardDay,
    gatherBonusProgress: game.gatherBonusProgress,
    warmMealUntil: game.warmMealUntil,
    trackingCompleted: game.trackingCompleted,
    caveCacheClaims: game.caveCacheClaims,
    savedAt: Date.now(),
  };
}

function singleplayerSaveData() {
  return {
    ...playerSaveData(),
    day: world.day,
    t: world.t,
    litBeacons: landmarks.litBeaconIds(),
    caveCacheDays: game.caveCacheDays,
    cacheSeed: game.cacheSeed,
    buildings: buildings.serialize(),
    loot: groundLoot.map((l) => ({ x: l.x, z: l.z, drops: l.drops })),
  };
}

function saveGame(showFeedback = false, immediateCoop = false) {
  // Im Menü gibt es nichts zu sichern. Im Tod-Zustand NICHT speichern: sonst
  // persistiert der Autosave hp=0, und beim nächsten Laden würde der Spieler mit
  // 0 Leben ins Spiel starten und sofort wieder sterben (Endlos-Todesschleife).
  if (game.state === 'menu' || game.state === 'dead') return;
  try {
    if (saveContext === 'coop') {
      multiplayer.queuePlayerState(playerSaveData(), immediateCoop ? 0 : 450);
      multiplayer.queueWorldState(sharedWorldState(), immediateCoop ? 0 : 450);
      // visibilitychange läuft vor pagehide und gibt den Requests in modernen
      // Browsern genug Zeit. Der direkte Flush ist zusätzlich wichtig, weil
      // ein verzögerter Timer beim Schließen des Tabs nicht mehr garantiert ist.
      if (immediateCoop) {
        void multiplayer.persistPlayerState();
        void multiplayer.persistWorldState();
      }
      if (showFeedback) ui.saved();
      return;
    }
    const data = singleplayerSaveData();
    const json = JSON.stringify(data);
    localStorage.setItem(SAVE_KEY, json);
    cloudSet(SAVE_KEY, json); // CrazyGames-Cloud (No-Op im Web-Build)
    cloud.queueSave(data);
    if (showFeedback) ui.saved();
  } catch {
    ui.saved(true);
  }
}

function sharedWorldState() {
  const now = performance.now() / 1000;
  return {
    buildings: buildings.serialize(),
    day: world.day,
    t: world.t,
    weather: world.weather,
    litBeacons: landmarks.litBeaconIds(),
    caveCacheDays: game.caveCacheDays,
    cacheSeed: game.cacheSeed,
    resources: resources.list.flatMap((resource, index) => (
      resource.permanentHidden ||
      resource.alive && resource.hp === resource.maxHp ? [] : [{
        index,
        hp: resource.hp,
        alive: resource.alive,
        respawnIn: Math.max(0, resource.respawnAt - now),
      }]
    )),
  };
}

function applySharedWorldState(state) {
  if (!state) return;
  // buildings.load ersetzt dauerhafte Bau-Objekte. Eine gerade geöffnete Truhe
  // muss danach auf ihr neues lokales Objekt zeigen, sonst würden weitere
  // Verschiebungen in einer veralteten, nicht mehr gespeicherten Kopie landen.
  const openStorageKey = storageKey(game.storage);
  const ridingRaftId = game.boat?.id || null;
  const ridingRaftState = game.boat ? {
    x: game.boat.x, z: game.boat.z, rot: game.boat.rot,
    speed: game.boat.speed || 0, turnSpeed: game.boat.turnSpeed || 0,
  } : null;
  const ridingRaftStorage = game.boat?.storage ? { ...game.boat.storage } : {};
  const ridingBikeId=game.bike?.id||null;
  const ridingBikeState=game.bike?{x:game.bike.x,z:game.bike.z,rot:game.bike.rot,speed:game.bike.speed||0,turnSpeed:game.bike.turnSpeed||0}:null;
  const ridingBikeStorage=game.bike?.storage?{...game.bike.storage}:{};
  if (Array.isArray(state.buildings)) {
    buildings.load(state.buildings);
    if (ridingRaftId) {
      game.boat = raftById(ridingRaftId);
      // Ein verspäteter Snapshot kann direkt nach dem Platzieren/Fahren das
      // aktive Floß noch nicht enthalten. Solange jemand darauf steht, bleibt
      // die lokale Instanz maßgeblich und wird mit derselben ID rekonstruiert.
      if (!game.boat && ridingRaftState) {
        buildings.place('raft', ridingRaftState.x, ridingRaftState.z, ridingRaftState.rot, { notifySpawn: false, id: ridingRaftId });
        game.boat = buildings.placed[buildings.placed.length - 1];
        game.boat.storage = ridingRaftStorage;
      }
      const preserved = game.boatRole === 'driver' ? ridingRaftState : raftRuntimeStates.get(ridingRaftId) || ridingRaftState;
      if (game.boat && preserved) applyRaftTransform(game.boat, preserved, 1);
      if (!game.boat) {
        game.boatRole = null;
        game.boatSeat = 0;
        game.boatDriverId = null;
      }
    }
    // Auch Beobachter behalten die zuletzt live empfangene Floßposition; ein
    // seltenerer Welt-Snapshot darf ein fahrendes Floß nicht zurückspringen lassen.
    for (const [id, runtime] of raftRuntimeStates) {
      const raft = raftById(id);
      if (raft) applyRaftTransform(raft, runtime, 1);
    }
    if(ridingBikeId) {
      game.bike=bikeById(ridingBikeId);
      if(!game.bike&&ridingBikeState) {
        buildings.place('bike',ridingBikeState.x,ridingBikeState.z,ridingBikeState.rot,{notifySpawn:false,id:ridingBikeId});
        game.bike=buildings.placed[buildings.placed.length-1];
        game.bike.storage=ridingBikeStorage;
      }
      if(game.bike&&ridingBikeState) {
        Object.assign(game.bike,ridingBikeState);
        game.bike.group.position.set(game.bike.x,terrainHeight(game.bike.x,game.bike.z),game.bike.z);
        game.bike.group.rotation.y=game.bike.rot;
        bindPlayerToBike(game.bike);
      }
      if(!game.bike)clearBikeRideState();
    }
    if (openStorageKey) {
      game.storage = storageByKey(openStorageKey);
      if (game.state === 'storage') {
        if (game.storage) ui.renderStorage(storageTitleFor(game.storage), game.inv, game.storage.storage || (game.storage.storage = {}), capacityInfo());
        else {
          game.storage = null;
          ui.showStorage(false);
          resumePlaying();
          ui.toast(tr('m.chestGone'), 'hint');
        }
      }
    }
  }
  if (Number.isFinite(state.day)) world.day = state.day;
  if (Number.isFinite(state.t)) world.t = state.t;
  // Wetter nur übernehmen, wenn wir dem Host folgen (Gast) – sonst überschriebe
  // ein eingehender Sync das autoritative Host-Wetter.
  if (typeof state.weather === 'string' && !world.weatherAutonomous) world.setWeather(state.weather);
  if (Array.isArray(state.litBeacons)) landmarks.loadBeacons(state.litBeacons);
  if (state.caveCacheDays && typeof state.caveCacheDays === 'object') game.caveCacheDays = { ...state.caveCacheDays };
  if (Number.isFinite(Number(state.cacheSeed))) {
    game.cacheSeed = (Number(state.cacheSeed) >>> 0) || 1;
    if (resources.cacheSeed !== game.cacheSeed) resources.randomizeCaches(game.cacheSeed);
  }
  landmarks.updateCaveCaches(world.day, game.caveCacheDays);
  if (Array.isArray(state.resources)) {
    const now = performance.now() / 1000;
    for (const resource of resources.list) {
      if (resource.permanentHidden) continue;
      resource.hp = resource.maxHp;
      resource.alive = true;
      resource.respawnAt = 0;
    }
    for (const saved of state.resources) {
      const resource = resources.list[saved.index];
      if (!resource) continue;
      resource.hp = Math.max(0, Math.min(resource.maxHp, Number(saved.hp) || 0));
      resource.alive = saved.alive !== false;
      resource.respawnAt = resource.alive ? 0 : now + Math.max(0, Number(saved.respawnIn) || 0);
      resource.group.visible = resource.alive;
      if (resource.kind === 'bush' && resource.group.userData.berries) resource.group.userData.berries.visible = resource.alive;
    }
  }
  restorePlayerToSavedWatchtower();
  renderer.shadowMap.needsUpdate = true;
  refreshInv();
}

function applyPlayerSaveData(data) {
  if (!data || typeof data !== 'object' || !Object.keys(data).length) return false;
  game.inv = { ...(data.inv || {}) };
  game.dura = { ...(data.dura || {}) };
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
  game.spawn = data.spawn || { x: 0, z: 6 };
  player.pos.set(data.pos?.x ?? 0, 0, data.pos?.z ?? 6);
  player.pos.y = terrainHeight(player.pos.x, player.pos.z);
  game.pendingWatchtowerId=typeof data.watchtowerId==='string'?data.watchtowerId:null;
  game.pendingWatchtowerLegacy=!Object.prototype.hasOwnProperty.call(data,'watchtowerId');
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
  game.gatherBonusProgress = data.gatherBonusProgress || 0;
  game.warmMealUntil = data.warmMealUntil || 0;
  game.trackingCompleted = Math.max(0, Number(data.trackingCompleted) || 0);
  game.caveCacheClaims = Math.max(0, Number(data.caveCacheClaims) || 0);
  refreshInv();
  updateTutorial(true);
  return true;
}

function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!applyPlayerSaveData(data)) return false;
    world.day = data.day ?? 1;
    world.t = data.t ?? 0.3;
    landmarks.loadBeacons(data.litBeacons || []);
    game.caveCacheDays = { ...(data.caveCacheDays || {}) };
    game.cacheSeed = Number.isFinite(Number(data.cacheSeed))
      ? ((Number(data.cacheSeed) >>> 0) || 1)
      : randomCacheSeed();
    resources.randomizeCaches(game.cacheSeed);
    landmarks.updateCaveCaches(world.day, game.caveCacheDays);
    buildings.load(data.buildings);
    restorePlayerToSavedWatchtower();
    restoreGroundLoot(data.loot);
    game.lastRewardDay = data.lastRewardDay || world.day;
    return true;
  } catch {
    return false;
  }
}

function localSaveData() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); }
  catch { return null; }
}

function saveTimestamp(data, fallback = 0) {
  const ownStamp = Number(data?.savedAt);
  return Number.isFinite(ownStamp) && ownStamp > 0 ? ownStamp : Date.parse(fallback) || 0;
}

async function reconcileCloudSave() {
  if (!cloud.session) return;
  // Eine laufende Expedition ist die bewusst aktuellere Version. Vor dem Sync
  // wird sie lokal fixiert, damit ein älterer Cloud-Stand sie nicht ersetzt.
  if (game.state !== 'menu' && game.state !== 'dead') saveGame(false);
  const remote = await cloud.load();
  const local = localSaveData();
  const remoteSave = remote?.save_data;
  const cloudIsNewer = remoteSave && saveTimestamp(remoteSave, remote.updated_at) > saveTimestamp(local);

  if (game.state === 'menu' && remoteSave && (!local || cloudIsNewer)) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(remoteSave));
    // Der Cloud-Sync darf den aktuellen Wizard-Schritt nicht zurücksetzen.
    ui.showOverlay('menu', { hasSave: true, startStep: document.getElementById('overlay').dataset.step || 'login' });
    ui.toast(local ? tr('m.cloudNewer') : tr('m.cloudLoaded'));
    return;
  }
  if (local) await cloud.save(local);
}

function newGame({ clearSingleplayerSave = true } = {}) {
  cancelFishing(true);
  if (clearSingleplayerSave) { localStorage.removeItem(SAVE_KEY); cloudRemove(SAVE_KEY); }
  clearRaftRideState();
  clearBikeRideState();
  raftRuntimeStates.clear();
  bikeRuntimeStates.clear();
  clearGroundLoot();
  if (game.expeditionEvent?.group) scene.remove(game.expeditionEvent.group);
  clearTrackingEvent(true);
  // Eine neue Solo-/Koop-Welt beginnt immer mit derselben vollständigen
  // Tierpopulation und übernimmt keine erlegten Tiere der vorherigen Partie.
  animals.resetLocal();
  spawnCaveAnimals();
  landmarks.loadBeacons([]);
  buildings.clear();
  game.cacheSeed = randomCacheSeed();
  resources.randomizeCaches(game.cacheSeed);
  for (const resource of resources.list) {
    if (resource.permanentHidden) continue;
    resource.hp = resource.maxHp;
    resource.alive = true;
    resource.respawnAt = 0;
    resource.group.visible = true;
    if (resource.kind === 'bush' && resource.group.userData.berries) resource.group.userData.berries.visible = true;
  }
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
  game.gatherBonusProgress = 0;
  game.warmMealUntil = 0;
  game.trackingCompleted = 0;
  game.trackingEvent = null;
  game.caveCacheDays = {};
  game.caveCacheClaims = 0;
  game.pendingWatchtowerId = null;
  game.pendingWatchtowerLegacy = false;
  landmarks.updateCaveCaches(world.day, game.caveCacheDays);
  game.expeditionEvent = null;
  game.eventTimer = 70;
  game.firstNightHintShown = false;
  game.nightAnnouncedDay = 0;
  game.raidNightActive = false;
  world.day = 1;
  world.t = 0.3;
  player.maxHp = 100;
  player.maxStamina = 100;
  player.moveSpeedMultiplier = 1;
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
  setTimeout(() => { if (game.state === 'playing') ui.toast(tr('m.hintChop')); }, 1500);
  setTimeout(() => { if (game.state === 'playing') ui.toast(tr('m.hintCraft')); }, 5000);
  setTimeout(() => { if (game.state === 'playing') ui.toast(tr('m.hintBerries')); }, 9000);
}

setInterval(() => saveGame(true), 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveGame(false, true);
});
addEventListener('pagehide', () => saveGame(false, true));

// ---------- Audio-Mute ----------
// Zwei unabhängige Quellen: der eigene Nutzer-Toggle (M-Taste) und der von der
// Plattform (CrazyGames) erzwungene Mute. Effektiv stumm ist, sobald eine der
// beiden aktiv ist — so behält die Plattform laut ihrer Vorgabe Vorrang, ohne
// den Nutzerwunsch zu vergessen, wenn die Plattform wieder freigibt.
let userMuted = false;
let platformMuted = false;
function applyMute() {
  const m = userMuted || platformMuted;
  sfx.setMuted(m);
  music.setMuted(m);
}

// ---------- Input ----------
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  if (e.code === 'KeyM' && !e.repeat) {
    userMuted = !userMuted;
    applyMute();
    ui.toast(userMuted ? tr('m.soundOff') : tr('m.soundOn'));
    return;
  }
  // Escape verhält sich in allen Spielfenstern gleich: Das oberste Fenster
  // schließen und zurück ins Spiel. Titel- und Todesbildschirm bleiben davon
  // ausgenommen, damit sie nicht versehentlich übersprungen werden können.
  if (e.code === 'Escape' && !e.repeat) {
    if (game.state === 'craft') { e.preventDefault(); closeInterfaceWithEscape(() => closeCraft(true)); return; }
    if (game.state === 'storage') { e.preventDefault(); closeInterfaceWithEscape(() => closeStorage(true)); return; }
    if (game.state === 'map') { e.preventDefault(); closeInterfaceWithEscape(() => toggleMap(false, true)); return; }
    if (game.state === 'radial') {
      e.preventDefault();
      radialChoice = selected(); // Escape verwirft eine noch nicht bestätigte Auswahl.
      closeInterfaceWithEscape(closeRadial);
      return;
    }
    if (game.state === 'paused') {
      sfx.uiClose();
      resumePlaying();
      if (!touch?.enabled) lockPointer();
      return;
    }
  }
  if (e.code === 'KeyP' && !e.repeat && ['playing', 'paused'].includes(game.state)) {
    toggleCameraMode(game.state === 'playing');
    return;
  }
  if (e.code === 'KeyK' && !e.repeat && ['playing', 'map'].includes(game.state)) { toggleMap(); return; }
  if (game.state === 'playing') {
    const numberSlot = /^Digit([1-6])$/.exec(e.code) || /^Numpad([1-6])$/.exec(e.code);
    if (numberSlot && !e.repeat) {
      const index = Number(numberSlot[1]) - 1;
      if (index < HOTBAR_FIXED_COUNT) selectSlot(index);
      return;
    }
    if (e.code === 'Tab' && !e.repeat) { openRadial(); return; }
    if (e.code === 'KeyX' && game.boat) { openStorage(game.boat, tr('s.raftHold')); return; }
    if (e.code === 'KeyX' && game.bike && (game.inv.gepaecktraeger || 0) > 0) { openStorage(game.bike, tr('s.bikeRack')); return; }
    if (e.code === 'KeyV' && (game.inv.feldflasche || 0) > 0) {
      if (game.bottleWater <= 0) ui.toast(tr('m.canteenEmpty'), 'hint');
      else { const sip=Math.min(22,game.bottleWater);game.bottleWater-=sip;player.thirst=Math.min(100,player.thirst+sip*1.7);ui.toast(tr('m.canteenDrank', { n: Math.round(game.bottleWater) }));sfx.eat(); }
      return;
    }
    if (e.code === 'KeyC') openCraft('hand');
    else if (e.code === 'KeyE' && !e.repeat) interact();
    else if (e.code === 'KeyR') buildings.rotateGhost();
    else if (e.code === 'Escape' && !document.pointerLockElement) {
      game.state = 'paused';
      gameplayStop(); // CrazyGames-Lifecycle (No-Op im Web-Build)
      ui.showOverlay('pause', { coop: multiplayer.active });
      sfx.uiOpen();
    }
  } else if (game.state === 'craft' && !e.repeat && (e.code === 'KeyE' || e.code === 'KeyC')) {
    closeCraft();
  } else if (game.state === 'storage' && (e.code === 'KeyE' || e.code === 'Escape')) {
    closeStorage();
  } else if (game.state === 'map' && e.code === 'Escape') toggleMap(false);
});
addEventListener('keyup', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); closeRadial(); }
  if (e.code === 'Escape' && escapeInterfaceRelock) {
    escapeInterfaceRelock = false;
    suppressPauseUntil = performance.now() + 500;
    if (game.state === 'playing' && !touch?.enabled) lockPointer();
  }
});

let desktopActionTimer = null;

function cancelBowDraw() {
  bowHoldIntent = false;
  player.cancelBowDraw();
  document.body.classList.remove('bowDrawing');
}

function beginBowDraw() {
  if ((game.inv.pfeil || 0) <= 0) {
    ui.toast(tr('m.noArrows'), 'hint');
    return false;
  }
  // Geflochtene Sehne: schnelleres Spannen und kürzere Nachschuss-Pause.
  const sehne = (game.inv.bogensehne || 0) > 0;
  player.bowDrawTime = sehne ? 0.45 : 0.7;
  player.bowShotCooldown = sehne ? 0.18 : 0.25;
  if (!player.beginBowDraw()) return false;
  document.body.classList.add('bowDrawing');
  return true;
}

function releaseBowShot() {
  const power = player.releaseBowDraw();
  document.body.classList.remove('bowDrawing');
  if (power == null) return false;
  shootBow(power);
  return true;
}

function stopDesktopAction(cancelBow = true) {
  clearInterval(desktopActionTimer);
  desktopActionTimer = null;
  endFishingAction();
  if (cancelBow) cancelBowDraw();
}

addEventListener('mousedown', (e) => {
  if (e.button !== 0 || game.state !== 'playing') return;
  if (e.target !== renderer.domElement) return; // UI-Klicks nicht abfangen
  stopDesktopAction();
  if (selected() === 'bogen') {
    bowHoldIntent = true;
    beginBowDraw();
    return;
  }
  if (selected() === 'angel') {
    beginFishingAction();
    return;
  }
  primaryAction();
  desktopActionTimer = setInterval(() => {
    if (game.state !== 'playing' || !document.hasFocus()) return stopDesktopAction();
    primaryAction();
  }, 480);
});

addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  bowHoldIntent = false;
  if (player.bowDrawing) releaseBowShot();
  endFishingAction();
  stopDesktopAction(false);
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
  composer?.setSize(innerWidth, innerHeight);
  // Browser-Chrome und Fullscreen-Wechsel können Resize-Events auslösen. Den
  // dabei geleerten Zeichenpuffer noch im selben Task neu füllen.
  renderer.shadowMap.needsUpdate = true;
  renderFrame();
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
  renderer.shadowMap.needsUpdate = true;
  renderFrame();
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

// Wiederbelebung beim Mitspieler (nur Koop). Fällt auf das eigene Zelt zurück,
// falls der Mitspieler die Welt in der Zwischenzeit verlassen hat.
function respawnAtPartner() {
  if (game.state !== 'dead' || Date.now() < game.respawnAt) return;
  startAudioForPlay();
  const point = partnerSpawnPoint();
  if (!point) ui.toast(tr('m.noTeammateNear'), 'hint');
  respawn(true, point);
  prerenderFirstFrame();
  resumePlaying();
  if (!touch?.enabled) lockPointer();
}

document.getElementById('btnPlay').addEventListener('click', startGame);
document.getElementById('btnRespawnPartner').addEventListener('click', respawnAtPartner);
// Aus dem Pausenmenü zurück zur Modus-Auswahl. Im Koop entspricht das dem
// sauberen Verlassen der Welt; Solo speichert vorher den Spielstand.
document.getElementById('btnMainMenu').addEventListener('click', async () => {
  if (multiplayer.active) {
    await leaveTwoPlayerMode();
    return;
  }
  saveGame(false);
  game.state = 'menu';
  exitPointerLock();
  ui.showHud(false);
  touch?.show(false);
  ui.showOverlay('menu', { hasSave: !!localSaveData(), startStep: 'mode' });
});
document.getElementById('cameraModeToggle').addEventListener('click', () => toggleCameraMode(game.state === 'playing'));

const cloudAccountEl = document.getElementById('cloudAccount');
const cloudAccountBtn = document.getElementById('cloudAccountBtn');
const cloudAuthForm = document.getElementById('cloudAuthForm');
const cloudEmail = document.getElementById('cloudEmail');
const cloudPassword = document.getElementById('cloudPassword');
const cloudStatus = document.getElementById('cloudStatus');
const cloudMessage = document.getElementById('cloudMessage');
const multiplayerLobby = document.getElementById('multiplayerLobby');
const multiplayerForm = document.getElementById('multiplayerForm');
const multiplayerName = document.getElementById('multiplayerName');
const multiplayerCode = document.getElementById('multiplayerCode');
const multiplayerMessage = document.getElementById('multiplayerMessage');
const multiplayerSummaryText = document.getElementById('multiplayerSummaryText');
const multiplayerToggle = document.getElementById('multiplayerToggle');
const multiplayerHud = document.getElementById('multiplayerHud');
const multiplayerHudName = document.getElementById('multiplayerHudName');
const multiplayerHudStatus = document.getElementById('multiplayerHudStatus');
const multiplayerHudCode = document.getElementById('multiplayerHudCode');
// Der Koop-Banner soll nicht dauerhaft im Blickfeld kleben. Wir blenden ihn nur
// kurz bei Statuswechseln ein und lassen ihn danach automatisch verschwinden.
let multiplayerHudTimer = null;
let multiplayerPartnerOnline = null;
let lastCoopPlayers = []; // zuletzt bekannte Mitspieler (für den HUD-Namen)
let coopWeatherBroadcast = null; // zuletzt vom Host gesendeter Wetterzustand
let coopAnimalTimer = 0; // Drossel für den Tier-Snapshot des Hosts
function flashMultiplayerHud(persist = false) {
  clearTimeout(multiplayerHudTimer);
  multiplayerHud.classList.remove('hidden');
  if (persist) return;
  multiplayerHudTimer = setTimeout(() => multiplayerHud.classList.add('hidden'), 4200);
}
// Gemeinsamer HUD-Name für Koop: sind Mitspieler da, zeigt er den Zähler
// „Co-op · N/4", sonst (allein verbunden) den eigenen Raumnamen. Wird sowohl vom
// subscribe- als auch vom Presence-Pfad genutzt, damit keiner den anderen
// überschreibt (früher clobberte subscribe den von onPresence gesetzten Zähler).
function renderMultiplayerHudName() {
  if (!multiplayer.active || !multiplayer.room) return;
  multiplayerHudName.textContent = lastCoopPlayers.length > 0
    ? `${tr('mp.coop')} · ${lastCoopPlayers.length + 1}/4`
    : `${tr('mp.coop')} · ${multiplayer.room.display_name}`;
}
const multiplayerHistory = document.getElementById('multiplayerHistory');
const multiplayerHistoryRefresh = document.getElementById('multiplayerHistoryRefresh');

function cloudNotice(message = '', isError = false) {
  cloudMessage.textContent = message;
  cloudMessage.classList.toggle('error', isError);
}

function readableCloudError(error) {
  const message = error?.message || tr('err.cloud');
  if (/invalid login credentials/i.test(message)) return tr('err.badCredentials');
  if (/email not confirmed/i.test(message)) return tr('err.notConfirmed');
  if (/already registered/i.test(message)) return tr('err.alreadyRegistered');
  return message;
}

cloud.subscribe((state) => {
  cloudAccountEl.classList.toggle('ready', state.enabled && state.signedIn);
  cloudAccountEl.classList.toggle('error', !!state.error);
  cloudAccountBtn.disabled = !state.enabled;
  if (!state.enabled) {
    cloudStatus.textContent = tr('menu.cloudNotConfigured');
    cloudAccountBtn.textContent = tr('menu.unavailable');
  } else if (state.signedIn) {
    cloudStatus.textContent = `${state.user.email} · ${tr('menu.synced')}`;
    cloudAccountBtn.textContent = tr('menu.signOut');
    cloudAuthForm.classList.add('hidden');
  } else {
    cloudStatus.textContent = tr('menu.localOnly');
    cloudAccountBtn.textContent = tr('menu.connectAccount');
  }
  if (!state.signedIn && multiplayer.active) {
    multiplayer.stop().finally(() => {
      removeRemotePlayersExcept();
      restoreSingleplayerInMenu();
      renderMultiplayerHistory();
    });
  } else if (state.signedIn && !multiplayerForm.classList.contains('hidden')) {
    refreshMultiplayerHistory();
  } else if (!state.signedIn) {
    renderMultiplayerHistory();
  }
  if (state.error) cloudNotice(readableCloudError({ message: state.error }), true);
  else if (state.message) cloudNotice(state.message);
});

cloudAccountBtn.addEventListener('click', async () => {
  if (cloud.session) {
    try {
      if (multiplayer.active) await leaveTwoPlayerMode(false);
      await cloud.signOut();
    }
    catch (error) { cloudNotice(readableCloudError(error), true); }
    return;
  }
  cloudNotice(tr('cl.accountBenefit'));
  cloudAuthForm.classList.remove('hidden');
  cloudEmail.focus();
});

cloudAuthForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  cloudNotice(tr('cl.connecting'));
  try {
    await cloud.signIn(cloudEmail.value.trim(), cloudPassword.value);
    cloudPassword.value = '';
    await reconcileCloudSave();
  } catch (error) { cloudNotice(readableCloudError(error), true); }
});

document.getElementById('cloudSignUp').addEventListener('click', async () => {
  if (!cloudAuthForm.reportValidity()) return;
  cloudNotice(tr('cl.creating'));
  try {
    const { session } = await cloud.signUp(cloudEmail.value.trim(), cloudPassword.value);
    cloudPassword.value = '';
    if (session) await reconcileCloudSave();
    else cloudNotice(tr('cl.almostDone'));
  } catch (error) { cloudNotice(readableCloudError(error), true); }
});

document.getElementById('cloudCancel').addEventListener('click', () => {
  cloudAuthForm.classList.add('hidden');
  cloudNotice('');
});

function multiplayerNotice(message = '', isError = false) {
  multiplayerMessage.textContent = message;
  multiplayerMessage.classList.toggle('error', isError);
}

function readableMultiplayerError(error) {
  const message = error?.message || tr('err.multiplayer');
  if (/room not found/i.test(message)) return tr('err.roomNotFound');
  if (/room is full/i.test(message)) return tr('err.roomFull');
  if (/authentication required|eingeloggt/i.test(message)) return tr('err.needAccount');
  return message;
}

function defaultPlayerName() {
  return cloud.session?.user?.email?.split('@')[0]?.slice(0, 24) || 'Survivor';
}

function renderMultiplayerHistory(entries = []) {
  multiplayerHistory.replaceChildren();
  if (!cloud.session) {
    const empty = document.createElement('p');
    empty.textContent = tr('menu.loginToSee');
    multiplayerHistory.appendChild(empty);
    return;
  }
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.textContent = tr('mp.noExpeditions');
    multiplayerHistory.appendChild(empty);
    return;
  }
  const dateFormat = new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'multiplayerHistoryItem';
    button.dataset.worldId = entry.id;
    const copy = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = entry.partner_name
      ? tr('mp.expeditionWith', { name: `${entry.partner_name}${Number(entry.member_count) > 2 ? ` +${Number(entry.member_count) - 2}` : ''}` })
      : tr('mp.expeditionOpen');
    const details = document.createElement('small');
    const updated = entry.updated_at ? dateFormat.format(new Date(entry.updated_at)) : 'unbekannt';
    details.textContent = `${tr('hud.day', { n: entry.day || 1 })} · ${tr('mp.details', { players: entry.member_count || 1, builds: entry.building_count || 0 })} · ${entry.room_code} · ${updated}`;
    const action = document.createElement('span');
    action.textContent = 'Fortsetzen';
    copy.append(title, details);
    button.append(copy, action);
    multiplayerHistory.appendChild(button);
  }
}

async function refreshMultiplayerHistory() {
  if (!cloud.session) {
    renderMultiplayerHistory();
    return;
  }
  multiplayerHistoryRefresh.disabled = true;
  const loading = document.createElement('p');
  loading.textContent = tr('mp.loading');
  multiplayerHistory.replaceChildren(loading);
  try {
    renderMultiplayerHistory(await multiplayer.history());
  } catch (error) {
    const failed = document.createElement('p');
    failed.textContent = tr('mp.loadFailed', { error: readableMultiplayerError(error) });
    multiplayerHistory.replaceChildren(failed);
  } finally {
    multiplayerHistoryRefresh.disabled = false;
  }
}

function restoreSingleplayerInMenu() {
  saveContext = 'single';
  const hasSave = !!localSaveData();
  // Ressourcenstatus gehört zur Koop-Welt und darf beim Rückweg nicht in die
  // lokale Welt durchsickern (Singleplayer speichert ihn bisher nicht separat).
  applySharedWorldState({ resources: [] });
  // Koop-Tiere gehören nicht zum Singleplayer-Spielstand. Unabhängig davon, ob
  // dieser Client Host oder Gast war, den vollständigen lokalen Bestand samt
  // Höhlentieren wiederherstellen.
  animals.resetLocal();
  spawnCaveAnimals();
  if (!loadGame()) newGame({ clearSingleplayerSave: false });
  game.state = 'menu';
  exitPointerLock();
  ui.showHud(false);
  // Rückkehr aus dem Koop: direkt zur Modus-Wahl, der Login ist bereits erledigt.
  ui.showOverlay('menu', { hasSave, startStep: 'mode' });
}

async function leaveTwoPlayerMode(showNotice = true) {
  if (saveContext === 'coop' && game.state !== 'menu' && game.state !== 'dead') saveGame(false);
  // CrazyGames-Broadcast-Koop: Einladen-Button entfernen und der Plattform
  // melden, dass der Raum nicht mehr joinbar ist bzw. verlassen wurde.
  if (IS_CRAZYGAMES) {
    hideInviteButton(crazyInviteButtonId);
    crazyInviteButtonId = null;
    crazyInviteLink = null;
    updateRoom({ isJoinable: false });
    leftRoom();
  }
  await multiplayer.stop();
  removeRemotePlayersExcept();
  multiplayerHud.classList.add('hidden');
  multiplayerForm.classList.remove('hidden');
  restoreSingleplayerInMenu();
  if (showNotice) multiplayerNotice(tr('mp.leftSaved'));
  else crazyCoopNotice('');
  if (!IS_CRAZYGAMES) await refreshMultiplayerHistory();
}

async function enterTwoPlayerMode(action, worldId = null) {
  if (!cloud.session) {
    multiplayerNotice(tr('mp.needAccount'), true);
    setMenuStep('login');
    cloudEmail.focus();
    return;
  }
  const name = (multiplayerName.value.trim() || defaultPlayerName()).slice(0, 24);
  multiplayerName.value = name;
  multiplayerNotice(tr(action === 'host' ? 'mp.creating' : 'mp.connecting'));
  document.getElementById('multiplayerHost').disabled = true;
  document.getElementById('multiplayerJoin').disabled = true;
  try {
    // Eine laufende Singleplayer-Partie wird zuerst gesichert. Danach arbeitet
    // Koop ausschließlich mit dem persönlichen Save der ausgewählten Welt.
    if (saveContext === 'single' && game.state !== 'menu' && game.state !== 'dead') saveGame(false);
    let room;
    if (action === 'host') {
      newGame({ clearSingleplayerSave: false });
      saveContext = 'coop';
      room = await multiplayer.create(name, sharedWorldState(), playerSaveData());
    } else {
      room = action === 'resume'
        ? await multiplayer.resume(worldId, name)
        : await multiplayer.join(multiplayerCode.value, name);
      saveContext = 'coop';
      if (!applyPlayerSaveData(room.player_state)) newGame({ clearSingleplayerSave: false });
    }
    applySharedWorldState(room.world_state);
    // Gast rendert nur die Host-Tiere; der Host bleibt autoritative Simulation.
    animals.setRemote(!multiplayer.isHost());
    localStorage.setItem('wildnis_last_room', room.room_code);
    multiplayerCode.value = room.room_code;
    multiplayerForm.classList.add('hidden');
    multiplayerNotice('');
    startAudioForPlay();
    prerenderFirstFrame();
    resumePlaying();
    if (!touch?.enabled) lockPointer();
    saveGame(false);
    ui.toast(action === 'host'
      ? tr('mp.created', { code: room.room_code })
      : action === 'resume'
        ? tr('mp.resumed', { code: room.room_code })
        : tr(room.is_new_member ? 'mp.joinedNew' : 'mp.joinedExisting', { code: room.room_code }));
  } catch (error) {
    multiplayerNotice(readableMultiplayerError(error), true);
    await multiplayer.stop();
    restoreSingleplayerInMenu();
  } finally {
    document.getElementById('multiplayerHost').disabled = false;
    document.getElementById('multiplayerJoin').disabled = false;
  }
}

multiplayerToggle.addEventListener('click', async () => {
  if (multiplayer.active) {
    await leaveTwoPlayerMode();
    return;
  }
  multiplayerName.value ||= defaultPlayerName();
  multiplayerCode.value ||= localStorage.getItem('wildnis_last_room') || '';
  multiplayerForm.classList.toggle('hidden');
  if (!multiplayerForm.classList.contains('hidden')) refreshMultiplayerHistory();
});

document.getElementById('multiplayerHost').addEventListener('click', () => enterTwoPlayerMode('host'));
document.getElementById('multiplayerJoin').addEventListener('click', () => {
  if (!/^[A-Z0-9]{6}$/i.test(multiplayerCode.value.trim())) return multiplayerNotice(tr('mp.codeLength'), true);
  enterTwoPlayerMode('join');
});
multiplayerCode.addEventListener('input', () => { multiplayerCode.value = multiplayerCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
multiplayerHistoryRefresh.addEventListener('click', refreshMultiplayerHistory);
multiplayerHistory.addEventListener('click', (event) => {
  const entry = event.target.closest('.multiplayerHistoryItem');
  if (entry?.dataset.worldId) enterTwoPlayerMode('resume', entry.dataset.worldId);
});

// ---- Menü-Wizard: Login → Spielmodus → Solo/Koop -------------------------
const overlayEl = document.getElementById('overlay');
const menuLoginContinue = document.getElementById('menuLoginContinue');

function setMenuStep(step) {
  if (overlayEl.dataset.kind !== 'menu') return;
  overlayEl.dataset.step = step;
  if (step === 'login' && cloud.enabled && !cloud.session) {
    cloudAuthForm.classList.remove('hidden');
  }
  if (step === 'koop') {
    multiplayerName.value ||= defaultPlayerName();
    multiplayerCode.value ||= localStorage.getItem('wildnis_last_room') || '';
    if (!multiplayer.active) multiplayerForm.classList.remove('hidden');
    refreshMultiplayerHistory();
  }
}

menuLoginContinue.addEventListener('click', () => setMenuStep('mode'));
document.getElementById('menuModeSolo').addEventListener('click', () => setMenuStep('solo'));
document.getElementById('menuModeKoop').addEventListener('click', () => setMenuStep('koop'));
document.getElementById('menuModeBack').addEventListener('click', () => setMenuStep('login'));
document.getElementById('menuSoloBack').addEventListener('click', () => setMenuStep('mode'));
document.getElementById('menuKoopBack').addEventListener('click', () => setMenuStep('mode'));

// Nach erfolgreichem Login automatisch zum Modus-Schritt weiterspringen.
cloud.subscribe((state) => {
  menuLoginContinue.innerHTML = `${state.signedIn ? tr('menu.continueShort') : tr('menu.continue')} <span aria-hidden="true">›</span>`;
  if (state.signedIn && overlayEl.dataset.kind === 'menu' && overlayEl.dataset.step === 'login') {
    setMenuStep('mode');
  }
});

multiplayer.subscribe((state) => {
  multiplayerLobby.classList.toggle('active', state.active);
  multiplayerToggle.textContent = state.active ? tr('mp.leave') : tr('menu.koopMode');
  if (!state.active) {
    multiplayerSummaryText.textContent = tr('menu.koopSub');
    clearTimeout(multiplayerHudTimer);
    multiplayerHud.classList.add('hidden');
    multiplayerPartnerOnline = null;
    lastCoopPlayers = [];
    world.weatherAutonomous = true; // Singleplayer steuert sein Wetter wieder selbst
    coopWeatherBroadcast = null;
    return;
  }
  // Nur der Host steuert Wetter/Events autonom; der Gast folgt.
  world.weatherAutonomous = multiplayer.isHost();
  multiplayerSummaryText.textContent = `${tr('mp.room', { code: state.room.room_code })} · ${tr(state.connected ? 'mp.connected' : 'mp.connectingShort')}`;
  flashMultiplayerHud();
  renderMultiplayerHudName();
  multiplayerHudCode.textContent = state.room.room_code;
  if (state.error) multiplayerNotice(state.error, true);
});

multiplayer.onPlayerState = receiveRemotePlayer;
multiplayer.onWorldState = (state) => {
  applySharedWorldState(state);
};
multiplayer.onWeather = (payload) => {
  if (payload?.weather) world.setWeather(payload.weather);
};
multiplayer.onWorldEvent = (event) => {
  if (!event) return;
  if (event.kind === 'expedition' && event.params) applyExpeditionEvent(event.params);
  else if (event.kind === 'herd') applyHerdMigration();
  else if (event.kind === 'storm') ui.toast(tr('m.stormFront'), 'hint');
  else if (event.kind === 'wolf_raid') {
    ui.toast(tr('m.packInDark'), 'hint');
    sfx.growl();
  } else if(event.kind==='wall_scratch'||event.kind==='wall_break') {
    const x=Number(event.x)||0,z=Number(event.z)||0;
    const distance=Math.hypot(player.pos.x-x,player.pos.z-z);
    if(event.kind==='wall_scratch'&&distance<42)sfx.wallScratch(wallSoundIntensity(x,z));
    if(event.kind==='wall_break'&&distance<60){
      sfx.wallBreak(wallSoundIntensity(x,z,60));
      ui.toast(tr('m.wallBroken'),'hint');
    }
  }
};
// Gast: Tierbestand vom Host übernehmen.
multiplayer.onAnimals = (list) => animals.applySnapshot(list);
// Host: Treffer eines Gasts auf ein Tier auswerten und Ergebnis zurückmelden.
multiplayer.onAnimalHit = ({ id, dmg, dir, author }) => {
  if (!multiplayer.isHost()) return;
  const animal = animals.list.find((a) => a.id === id);
  if (!animal) return;
  const d = new THREE.Vector3(dir?.x || 0, 0, dir?.z || 0);
  const result = animals.hit(animal, Math.max(0, Math.min(200, Number(dmg) || 0)), d);
  multiplayer.sendAnimalResult(author, { ...result, killPos: { x: animal.pos.x, z: animal.pos.z } });
};
// Gast: Ergebnis eines eigenen Treffers (Beute/XP) einbuchen.
multiplayer.onAnimalResult = (result) => {
  if (!result) return;
  if (result.drops) {
    const pos = result.killPos;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) spawnGroundLoot(pos.x, pos.z, result.drops);
    else grantAnimalDrops(result.drops); // Fallback, falls die Todesposition fehlt
  }
  if (result.killed) {
    if (result.xp) addXP(result.xp, `${result.name || 'Tier'} erlegt`);
    ui.toast(result.bossId ? tr('m.bossDown', { name: result.name || tr('m.animal') }) : tr('m.animalDown', { name: result.name || tr('m.animal') }), 'hint');
    saveGame(false);
  }
};
multiplayer.onAnimalChase = ({ kind, pan, sentAt } = {}) => {
  if (game.state !== 'playing' || Date.now() - Number(sentAt) > 4000) return;
  sfx.chaseAlert(kind, pan);
};
multiplayer.onRevive = ({ rescuerName, sentAt } = {}) => {
  if (Date.now() - Number(sentAt) > 4000) return;
  revivedByPartner(rescuerName || tr('m.yourTeammate'));
};
// Änderungen an Truhen und Floß-Laderäumen sofort übernehmen. Dadurch sieht
// ein Spieler den neuen Inhalt auch dann, wenn das Lagerfenster bereits offen
// ist und nicht erst beim nächsten vollständigen Welt-Sync.
multiplayer.onStorage = ({ key, storage, remove } = {}) => {
  const box = storageByKey(key);
  if (!box) return;
  if (remove) {
    const wasOpen = storageKey(game.storage) === key;
    buildings.removeBuilding(box);
    if (wasOpen) {
      game.storage = null;
      ui.showStorage(false);
      resumePlaying();
      ui.toast(tr('m.supplyCrateEmptied'), 'hint');
    }
    renderer.shadowMap.needsUpdate = true;
    return;
  }
  box.storage = cleanStorage(storage);
  if (game.state === 'storage' && storageKey(game.storage) === key) {
    game.storage = box;
    ui.renderStorage(storageTitleFor(box), game.inv, box.storage, capacityInfo());
  }
};
// Wegpunkt eines Mitspielers. Pro Spieler bleibt genau einer bestehen —
// ein neuer ersetzt den alten, statt die Karte zuzupflastern.
multiplayer.onWaypoint = ({ author, authorName, x, z, cleared } = {}) => {
  game.waypoints = (game.waypoints || []).filter((w) => w.author !== author);
  if (!cleared) game.waypoints.push({ author, authorName, x, z, remote: true });
  syncWaypoints();
  if (!cleared) ui.toast(tr('m.waypointByOther', { name: authorName || tr('m.someTeammate') }), 'hint');
};
multiplayer.onPresence = (players) => {
  const ids = players.map((entry) => entry.userId);
  removeRemotePlayersExcept(ids);
  const online = players.length > 0;
  multiplayerHud.classList.toggle('online', online);
  const names = players.map((entry) => entry.name || tr('hud.teammate'));
  lastCoopPlayers = players;
  renderMultiplayerHudName();
  multiplayerHudStatus.textContent = online
    ? tr('mp.online', { names: names.join(', ') })
    : tr('mp.waiting');
  // Broadcast-Koop (CrazyGames): Erscheint ein neuer Gast, schickt der Host
  // einmalig die volle Welt + Tiere. Im Web liefert stattdessen die DB den
  // Startzustand, dort ist broadcastOnly false → kein zusätzlicher Push.
  if (multiplayer.broadcastOnly && multiplayer.isHost() && players.length > (multiplayerPartnerOnline ?? 0)) {
    multiplayer.queueWorldState(sharedWorldState(), 0);
    if (!animals.remote) multiplayer.sendAnimals(animals.serialize());
  }
  // Nur bei echtem Wechsel (kommt/geht) kurz einblenden, nicht bei jedem
  // Presence-Heartbeat – sonst klebt der Banner wieder dauerhaft am Bildschirm.
  if (players.length !== multiplayerPartnerOnline) {
    multiplayerPartnerOnline = players.length;
    flashMultiplayerHud();
  }
};
multiplayer.onHit = (hit) => {
  if (game.state !== 'playing' || Date.now() - Number(hit.sentAt) > 4000) return;
  const animalAttack = hit.weapon === 'animal';
  ui.toast(animalAttack
    ? tr('m.attackedBy', { name: hit.attackerName || tr('m.animal') })
    : tr('m.hitBy', { name: hit.attackerName || tr('m.yourTeammate') }), 'hint');
  player.damage(
    Math.max(0, Math.min(35, Number(hit.damage) || 0)),
    animalAttack ? hit.cause : tr('m.killedBy', { name: hit.attackerName || tr('m.yourTeammate') }),
  );
  saveGame(false);
};
multiplayer.onResource = ({ index, toolId }) => {
  const resource = resources.list[index];
  if (!resource?.alive) return;
  resources.hit(resource, toolId || 'hand');
  renderer.shadowMap.needsUpdate = true;
};

document.getElementById('craftClose').addEventListener('click', closeCraft);
document.getElementById('storageClose').addEventListener('click', closeStorage);
document.getElementById('mapClose').addEventListener('click', () => toggleMap(false));

document.getElementById('btnNew').addEventListener('click', () => {
  if (localStorage.getItem(SAVE_KEY) && !confirm(tr('m.confirmNewGame'))) return;
  sfx.unlock();
  startAudioForPlay();
  newGame();
  respawn();
  player.hunger = 100;
  player.thirst = 100;
  prerenderFirstFrame();
  resumePlaying();
  saveGame(true);
  if (!touch?.enabled) lockPointer();
});

// ---------- HUD-Update ----------
function updateHUD() {
  const starving = player.hunger <= 0;
  ui.setBars(player.hp / player.maxHp * 100, player.hunger, starving, player.oxygen, player.swimming || player.oxygen < 100, player.stamina / player.maxStamina * 100, player.thirst, player.warmth);
  ui.setClock(world.day, world.elevation);
  const nextLandmark = landmarks.list.filter((l) => !game.discoveries.includes(l.id)).sort((a,b) => Math.hypot(a.x-player.pos.x,a.z-player.pos.z)-Math.hypot(b.x-player.pos.x,b.z-player.pos.z))[0];
  let compass = '';
  const starterKind = game.tutorialStage === 0 ? 'tree' : game.tutorialStage === 1 && (game.inv.stein || 0) < 2 ? 'rock' : null;
  const starterResource = starterKind && resources.list.filter((r) => r.alive && r.kind === starterKind)
    .sort((a,b) => Math.hypot(a.x-player.pos.x,a.z-player.pos.z)-Math.hypot(b.x-player.pos.x,b.z-player.pos.z))[0];
  if (game.expeditionEvent) compass = `${tr('c.signal')} ${compassDirection(game.expeditionEvent.x, game.expeditionEvent.z)} · ${Math.ceil(game.expeditionEvent.remaining)}s`;
  else if (game.trackingEvent) {
    const distance = Math.ceil(Math.hypot(game.trackingEvent.x-player.pos.x, game.trackingEvent.z-player.pos.z));
    const label = tr(game.trackingEvent.phase === 'trail' ? 'c.trail' : game.trackingEvent.phase === 'hunt' ? 'c.prey' : 'c.crate');
    compass = `${label} ${compassDirection(game.trackingEvent.x, game.trackingEvent.z)} · ${distance}m`;
  }
  else if (starterResource) compass = `${ITEMS[starterKind === 'tree' ? 'holz' : 'stein'].name} ${compassDirection(starterResource.x, starterResource.z)}`;
  else if (nextLandmark) { const a = Math.atan2(nextLandmark.x-player.pos.x, -(nextLandmark.z-player.pos.z)); compass = `${tr('c.compass')} ${compassDirs()[(Math.round(a/(Math.PI/4))+8)%8]}`; }
  ui.setBiome(`${biomeAt(player.pos.x, player.pos.z).name}${buildings.isSheltered(player.pos) ? tr('c.sheltered') : ''}`, compass);
  ui.setThreat(world.night, Math.min(10, world.day), world.day % 3 === 0);
  // Ziel unterm Fadenkreuz
  const t = raycastTargets(selected() === 'bogen' ? 40 * bowRangeBoost() : 4.6);
  if (t) {
    if (t.obj.userData.res) {
      const res=t.obj.userData.res;
      const names = { tree: tr('tgt.tree'), rock: tr('tgt.rock'), bush: tr('tgt.bush'), mushroom: res.variant==='cave'?tr('tgt.glowMushroom'):tr('tgt.mushroom'), herb: tr('tgt.herb'), cache: tr('tgt.cache') };
      ui.target(names[res.kind], ['tree', 'rock'].includes(res.kind)
        ? { current: res.hp, max: res.maxHp }
        : null);
    } else if (t.obj.userData.animal) {
      const a = t.obj.userData.animal;
      ui.target(`${a.trackingTitle || a.def.name} · ${tr('map.tier', { n: a.tier })}`, { current: a.hp, max: a.maxHp, danger: a.def.hostile });
    } else if (t.obj.userData.fish) {
      ui.target(tr('m.fishTarget'));
    }
  } else {
    ui.target(null);
  }

  // Kontext-Prompt
  let prompt = null;
  const aimedBuilding = raycastBuilding();
  const nearbyBeacon = landmarks.nearestBeacon(player.pos, 3.7, game.discoveries);
  const caveCache = landmarks.nearestCaveCache(player.pos, 3.25, game.discoveries);
  const fire = aimedBuildingOfType('campfire', 3.5, aimedBuilding);
  const tent = aimedBuildingOfType('tent', 3.2, aimedBuilding);
  const catcher = aimedBuildingOfType('raincatcher', 3.5, aimedBuilding);
  const raft = aimedBuildingOfType('raft', 3.8, aimedBuilding);
  const bike = aimedBuildingOfType('bike', 3.4, aimedBuilding);
  const tower = watchtowerAtPlayer() || aimedBuildingOfType('watchtower', 4.2, aimedBuilding);
  const chest = aimedBuildingOfType('chest', 3.5, aimedBuilding);
  const bench = aimedBuildingOfType('workbench', 3.8, aimedBuilding);
  const cave=updateCaveDarkness();
  const caveInside=!!cave;
  const aimedGate = aimedBuilding?.type === 'gate' ? aimedBuilding : null;
  const damagedWall = aimedBuilding?.type==='wall'&&aimedBuilding.hp<aimedBuilding.maxHp?aimedBuilding:null;
  const aimedResource = t?.obj?.userData?.res;
  const aimedGatherable = ['bush','mushroom','herb','cache'].includes(aimedResource?.kind)
    && camera.position.distanceTo(t.point) <= 3.4 ? aimedResource : null;
  const fireOut = fire && !fire.lit;
  const canRefuel = fire && fire.lit && fire.fuel < fire.maxFuel && (game.inv.holz || 0) > 0;
  const canCookCave = fire?.lit && (game.inv.leuchtpilz || 0)>0 && (game.inv.pilz || 0)>=2;
  const canCookMushrooms = fire?.lit && (game.inv.pilz || 0)>=3;
  const downedPartner = nearestDownedPartner();
  const nearbyLoot = game.bike || game.boat ? null : nearestGroundLoot(2.6);
  if (game.bike) prompt = tr('p.biking', { rack: (game.inv.gepaecktraeger||0)>0 ? tr('p.bikeRack') : '' });
  else if (game.boat) prompt = tr(game.boatRole === 'passenger' ? 'p.raftPassenger' : 'p.raftDriver');
  else if (downedPartner) prompt = tr('p.revive', { name: downedPartner.name });
  else if (nearbyLoot) prompt = tr('p.pickLoot');
  else if (caveCache?.type === 'tide' && caveCache.ready && !player.underwater) prompt = tr('p.diveCrate');
  else if (caveCache?.ready) prompt = tr('p.recoverCache', { name: caveCache.name });
  else if (caveCache) prompt = tr('p.cacheSearched', { name: caveCache.name, n: game.caveCacheDays[caveCache.id] });
  else if (player.swimming) prompt = tr(player.underwater ? 'p.diveDeeper' : 'p.dive');
  else if (aimedGatherable) {
    const action=aimedGatherable.kind==='bush'?tr('p.gatherBerries')
      :aimedGatherable.kind==='herb'?tr('p.gatherHerb')
      :aimedGatherable.kind==='cache'?tr('p.searchPack')
      :aimedGatherable.variant==='cave'?tr('p.gatherGlow'):tr('p.gatherMushroom');
    prompt=tr('p.gather', { action });
  }
  else if (nearbyBeacon && !nearbyBeacon.lit) prompt = tr('p.lightBeacon');
  else if (nearbyBeacon?.lit) prompt = tr('p.beaconActive');
  else if (damagedWall) prompt = selected()==='hammer'
    ? tr('p.repairWall', { a: Math.ceil(damagedWall.hp), b: damagedWall.maxHp })
    : tr('p.wallDamaged', { a: Math.ceil(damagedWall.hp), b: damagedWall.maxHp });
  else if (aimedGate) prompt = tr(aimedGate.open ? 'p.closeGate' : 'p.openGate');
  else if (tower) prompt = tr(watchtowerAtPlayer(tower) ? 'p.climbDown' : 'p.climbStand');
  else if (selected() === 'hammer' && aimedBuilding) prompt = tr('p.dismantle');
  else if (fireOut) prompt = tr((game.inv.holz || 0) > 0 ? 'p.lightFire' : 'p.fireOutNoWood');
  else if (fire && (game.inv.fleisch_roh || 0) > 0) prompt = tr('p.cookMeat', { n: game.inv.fleisch_roh });
  else if (canCookCave) prompt = tr('p.cookStew');
  else if (canCookMushrooms) prompt = tr('p.cookSkillet', { n: game.inv.pilz });
  else if (canRefuel) prompt = tr('p.addWood');
  else if (catcher) prompt = catcher.water > 1
    ? ((game.inv.feldflasche || 0) > 0 && game.bottleWater < 40
      ? tr('p.fillCanteen', { a: Math.round(game.bottleWater), b: Math.round(catcher.water) })
      : tr('p.drinkRain', { n: Math.round(catcher.water) }))
    : tr('p.catcherEmpty');
  else if (raft) prompt = tr(activeRemoteRaftDriver(raft.id) ? 'p.boardRaftPassenger' : 'p.boardRaft');
  else if (bike) prompt = tr('p.mountBike');
  else if (chest) prompt = tr('p.openChest');
  else if (bench) prompt = tr('p.useBench');
  else if (caveInside && !torchHeld()) prompt = tr('p.darkCave');
  else if (selected() === 'angel' && !game.fishing) prompt = tr('p.castRod');
  else if (tent && world.night) prompt = tr('p.sleep');
  else if (ITEMS[selected()].type === 'placeable') prompt = tr('p.place');
  else if (player.thirst <= 8) prompt = tr('p.dyingThirst');
  else if (player.warmth <= 10) prompt = tr('p.dyingCold');
  else if (starving) prompt = tr('p.starving');
  // Während des Angel-Minispiels übernimmt das ausführlichere Angel-HUD die
  // Bedienhinweise und wird nicht von einem zweiten Kontext-Prompt verdeckt.
  ui.prompt(game.fishing ? null : prompt);
  const interactHint = downedPartner ? 'tent'
    : nearbyLoot ? 'food'
    : aimedGatherable ? (aimedGatherable.kind === 'bush' ? 'berries' : aimedGatherable.kind === 'herb' ? 'sprout' : aimedGatherable.kind === 'cache' ? 'backpack' : 'mushroom')
    : caveCache?.ready ? 'craft'
    : nearbyBeacon && !nearbyBeacon.lit ? 'food'
    : damagedWall ? 'hammer'
    : aimedGate ? 'gate'
    : fireOut ? 'food'
    : (fire && fire.lit && (game.inv.fleisch_roh || 0) > 0) ? 'food'
    : (canCookCave || canCookMushrooms) ? 'food'
    : canRefuel ? 'food'
    : catcher ? 'food'
    : raft || bike || tower ? 'gate'
    : chest || bench ? 'craft'
    : (tent && world.night) ? 'tent' : null;
  touch?.setInteract(interactHint);
}

// ---------- Game-Loop ----------
let last = performance.now();
let menuAngle = 0;
let hudAccumulator = 1;
let shadowAccumulator = 1;

// Zustände, in denen der eigene Spieler in einem Menü steckt. Im Koop läuft die
// gemeinsame Welt in diesen Zuständen weiter (nur der lokale Spieler pausiert),
// damit sie beim Mitspieler nicht einfriert.
const COOP_BG_STATES = new Set(['paused', 'craft', 'storage', 'map', 'radial', 'dead']);

function tick(dt) {
  const now = performance.now();
  updateCaveDarkness();
  landmarks.updateBeacons(dt, now / 1000);
  landmarks.updateCaveCaches(world.day, game.caveCacheDays);

  player.held.visible = game.state !== 'menu' && player.perspective === 'first' && !game.bike;
  bikeCockpit.visible = game.state !== 'menu' && player.perspective === 'first' && !!game.bike;
  localAvatar.group.visible = game.state !== 'menu' && player.perspective === 'third';
  torchLight.visible = false; // wird nur im Spielzustand wieder eingeschaltet

  if (game.state === 'menu') {
    // Kamerafahrt im Hauptmenü
    menuAngle += dt * 0.06;
    camera.position.set(Math.cos(menuAngle) * 40, 26, Math.sin(menuAngle) * 40);
    camera.lookAt(0, 2, 0);
    world.update(dt * 0.4, camera.position);
    resources.update(dt * .4, world.wind, camera.position);
    buildings.update(dt, world.wind);
    effects.update(dt);
  } else if (game.state === 'playing' || (multiplayer.active && COOP_BG_STATES.has(game.state))) {
    // Im Koop läuft die Welt weiter, während der eigene Spieler in einem Menü
    // ist (Pause/Crafting/Truhe/Karte/Auswahlrad). Der lokale Spieler bleibt
    // dabei eingefroren: keine Bewegung, kein Verbrauch, kein Schaden.
    const coopBg = game.state !== 'playing';
    world.update(dt, player.pos);
    // Host verteilt jeden Wetterwechsel an den Mitspieler.
    if (multiplayer.isHost() && world.weather !== coopWeatherBroadcast) {
      coopWeatherBroadcast = world.weather;
      multiplayer.sendWeather(world.weather);
    }
    if (world.nightfall && !game.firstNightHintShown) {
      game.firstNightHintShown = true;
      ui.toast(tr('m.nightFalls'), 'hint');
    }
    if (world.nightfall) {
      const bloodMoon = world.day % 3 === 0;
      game.raidNightActive = true;
      game.raidTimer = bloodMoon ? 7 : 15;
      if (game.nightAnnouncedDay !== world.day) {
        game.nightAnnouncedDay = world.day;
        ui.toast(bloodMoon ? tr('m.bloodMoon') : tr('m.nightNumber', { n: world.day }), 'hint');
        sfx.dangerCue(bloodMoon ? 1.08 : .72);
      }
    }
    // Auch beim Laden/Fortsetzen mitten in der Nacht muss der Morgen die
    // temporären Rudel zuverlässig wieder entfernen.
    if (world.night) game.raidNightActive = true;
    if (!world.night && game.raidNightActive) {
      // Das Rudel bricht die Jagd ab und zieht ab, statt im Blickfeld zu
      // verschwinden. Entfernt wird es erst außer Sichtweite.
      if (!animals.remote) {
        const abgezogen = animals.beginRaidRetreat();
        if (abgezogen > 0) {
          ui.toast(tr('m.packRetreats'), 'hint');
          sfx.growl();
        }
      }
      game.raidNightActive = false;
    }
    if (!animals.remote) {
      animals.updateRaidRetreat([
        { pos: player.pos, yaw: player.yaw },
        ...[...remotePlayers.values()].map((r) => ({ pos: r.target, yaw: r.yaw })),
      ]);
    }
    updateNetworkRafts(dt);
    updateNetworkBikes(dt);
    updateGroundLoot(dt);
    if (coopBg && game.boat && game.boatRole === 'passenger') {
      const syncedRaft = raftById(game.boat.id);
      if (syncedRaft) {
        game.boat = syncedRaft;
        bindPlayerToRaftSeat(syncedRaft, game.boatSeat);
      }
    }
    const movement = coopBg ? { moving: false } : (game.boat ? updateRaft(dt) : game.bike ? updateBike(dt) : player.update(dt));
    // Gehaltene Schusstaste: neuen Bogenzug starten, sobald der Cooldown der
    // letzten Sehne vorbei ist (Pfeil-Check verhindert Toast-Spam pro Frame).
    if (!coopBg && bowHoldIntent && !player.bowDrawing && selected() === 'bogen' && (game.inv.pfeil || 0) > 0) beginBowDraw();
    updateLocalAvatar(dt, movement);
    if (!coopBg) updateFishing(dt);
    multiplayer.update(dt, currentPlayerNetworkState({
      moving: movement.moving, sprinting: player.sprinting,
      dead: game.state === 'dead', vulnerable: !coopBg,
    }));
    updateRemotePlayers(dt);
    updateProgression();
    document.body.classList.toggle('underwater', player.underwater);
    touch?.setSwimming(player.swimming);
    updateWorldEvents(dt);
    if (!coopBg) {
      updateFireDamage(dt);
      const travelFactor=game.bike&&(game.inv.gepaecktraeger||0)>0 ? .75 : 1;
      const starve = player.updateStats(dt, ((game.inv.survivalset || 0) > 0 ? .82 : 1)*travelFactor);
      const survival = updateSurvival(dt,travelFactor);
      if (player.hp <= 0) die(
        survival === 'thirst' ? 'Du bist verdurstet.'
          : survival === 'cold' ? 'Du bist erfroren.'
            : starve === 'starving' ? 'Du bist verhungert.'
              : starve === 'drowning' ? 'Du bist ertrunken.' : tr('death.animal')
      );
    }

    updateTorch(dt);
    updateMovementSounds(dt, movement);
    updateAmbient(dt);
    resources.update(dt, world.wind, player.pos);
    buildings.tickFuel(dt, world.rainIntensity);
    buildings.update(dt, world.wind);
    buildings.updateGhost(camera, world.terrain);
    // Aktive Feuer + getragene Fackel halten Wölfe fern
    const fires = [...buildings.activeFires(), ...landmarks.activeBeaconFires()];
    if (torchHeld()) fires.push({ x: player.pos.x, z: player.pos.z });
    if (multiplayer.isHost()) {
      for (const remote of remotePlayers.values()) {
        if (remote.held === 'fackel' || remote.held === 'laterne') fires.push({ x: remote.target.x, z: remote.target.z });
      }
    }
    const animalPlayers = [
      ...(!coopBg ? [{
        pos: player.pos, yaw: player.yaw, level: game.level, local: true,
        hurt: (n, cause) => player.damage(n, cause),
        chased: (kind, pan) => sfx.chaseAlert(kind, pan),
      }] : []),
      ...(multiplayer.isHost() ? [...remotePlayers.values()]
        .filter((remote) => remote.vulnerable)
        .map((remote) => ({
          pos: remote.target, yaw: remote.yaw, level: remote.level, local: false,
          hurt: (n, cause, animalName) => multiplayer.animalAttack(remote.id, n, cause, animalName),
          chased: (kind, pan) => multiplayer.animalChase(remote.id, kind, pan),
        })) : []),
    ];
    const threat = Math.min(10, world.day + (world.day % 3 === 0 ? 2 : 0));
    if (world.night && !animals.remote) {
      game.raidTimer -= dt;
      const raidWolves = animals.list.filter((animal) => animal.kind === 'wolf' && animal.raidWolf);
      const maxRaidWolves = Math.min(6, 2 + Math.floor(world.day / 2) + (world.day % 3 === 0 ? 2 : 0));
      if (game.raidTimer <= 0 && raidWolves.length < maxRaidWolves && animalPlayers.length) {
        // Das nächste Rudel erscheint bei dem aktiven Spieler, in dessen Nähe
        // aktuell die wenigsten Raid-Wölfe sind. So bekommt nicht nur der Host
        // die nächtliche Bedrohung ab.
        const target = [...animalPlayers].sort((a, b) => {
          const nearby = (entry) => raidWolves.filter((wolf) => Math.hypot(wolf.pos.x - entry.pos.x, wolf.pos.z - entry.pos.z) < 55).length;
          return nearby(a) - nearby(b);
        })[0];
        const spawned = animals.spawnNear('wolf', target.pos, 50, 68, { raidWolf: true, aggro: true });
        if (spawned) {
          game.raidTimer = Math.max(12, 34 - world.day * 2) * (world.day % 3 === 0 ? 0.65 : 1);
          ui.toast(tr('m.packInDark'), 'hint');
          sfx.growl();
          if (multiplayer.isHost()) multiplayer.sendWorldEvent({ kind: 'wolf_raid' });
        }
      }
    }
    animals.update(dt, {
      playerPos: player.pos,
      playerYaw: player.yaw,
      night: world.night,
      threat,
      playerLevel: game.level,
      players: animalPlayers,
      fires,
      openGates: buildings.openAnimalPassages(),
      animalObstacles: [...buildings.animalObstacles, ...landmarks.obstacles],
      damageWoodWall: damageWoodWallFromWolf,
      time: now / 1000,
      // Ein pausierter Spieler (Menü offen) nimmt keinen Tierschaden.
      hurtPlayer: (n, cause) => { if (!coopBg) player.damage(n, cause); },
    });
    // Host streamt den Tierbestand ~7x pro Sekunde an den Mitspieler.
    if (multiplayer.isHost()) {
      coopAnimalTimer -= dt;
      if (coopAnimalTimer <= 0) {
        coopAnimalTimer = 0.14;
        multiplayer.sendAnimals(animals.serialize());
      }
    }
    aquatics.update(dt, now / 1000);
    effects.update(dt);
    updateFlyingArrows(dt);
    const discovery = landmarks.update(player.pos, game.discoveries);
    if (discovery) discoverLandmark(discovery);
    // Der Wegpunkt hängt direkt an der Kamerarotation und muss deshalb mit
    // jedem gerenderten Frame nachgeführt werden. Im gedrosselten 12-Hz-HUD
    // sprang er bei Mausbewegungen sichtbar von Position zu Position.
    ui.updateWaypointMarker(player.pos, player.yaw, camera);
    // DOM-Updates, Sortierungen und mehrere Raycasts reagieren bei 12 Hz noch
    // unmittelbar, müssen aber nicht an die Render-Framerate gekoppelt sein.
    hudAccumulator += dt;
    if (hudAccumulator >= 1 / 12) {
      updateHUD();
      hudAccumulator = 0;
    }
    if (game.state === 'dead') ui.setRespawnCountdown(game.respawnAt - Date.now());
  } else {
    // Pause/Craft/Tod: Welt einfrieren, aber weiter rendern
    updateLocalAvatar(dt);
    buildings.update(dt, world.wind);
    effects.update(dt);
    if (game.state === 'dead') ui.setRespawnCountdown(game.respawnAt - Date.now());
  }

  // Die 2048er Shadowmap wird mit 10 Hz erneuert. Kamera, Gameplay und das
  // eigentliche Bild bleiben davon unabhängig flüssig.
  shadowAccumulator += dt;
  // Bei reduzierter Qualitätsstufe wird auch die Shadowmap seltener erneuert —
  // jeder Shadow-Update ist ein kompletter zusätzlicher Render-Durchlauf.
  const shadowInterval = (game.state === 'playing' ? (lowPowerDevice ? .16 : .1) : .25) * (1 + quality.level * .5);
  if (shadowAccumulator >= shadowInterval) {
    renderer.shadowMap.needsUpdate = true;
    shadowAccumulator = 0;
  }
  renderFrame();
}

renderer.setAnimationLoop(() => {
  const now = performance.now();
  // 50 FPS fühlen sich bei diesem Spiel praktisch identisch zu 60 FPS an,
  // sparen auf Retina-Macs aber rund ein Sechstel dauerhafte GPU-Arbeit.
  // Im Koop laufen Menü-Zustände mit voller Bildrate, damit die weiterlaufende
  // Welt flüssig bleibt und der Host die Simulation nicht verlangsamt.
  const coopRunning = multiplayer.active && COOP_BG_STATES.has(game.state);
  const targetFps = (game.state === 'playing' || coopRunning) ? (lowPowerDevice ? 40 : 50) : game.state === 'menu' ? 24 : 12;
  const interval = 1000 / targetFps;
  if (now - last < interval - 1) return;
  const frameGap = (now - last) / 1000;
  const dt = Math.min(frameGap, 0.05);
  // Akkumulator statt hartem Reset: Der Rest über dem Intervall bleibt als
  // Guthaben stehen. Sonst quantisiert der Throttle auf 60-Hz-Displays auf
  // 30 FPS (jedes zweite rAF verworfen), statt die Ziel-Bildrate zu erreichen.
  // Läuft das Spiel dem Takt weit hinterher, wird ohne Aufholjagd neu gestartet.
  last = now - last > interval * 2 ? now : last + interval;
  tick(dt);
  updateQuality(frameGap, targetFps);
});

document.addEventListener('visibilitychange', () => {
  last = performance.now();
  hudAccumulator = 1;
  shadowAccumulator = 1;
});

// ---------- Start ----------
touch = new TouchControls(renderer.domElement, player, {
  primary: () => { if (game.state === 'playing') primaryAction(); },
  primaryDown: () => {
    if (game.state !== 'playing') return false;
    if (selected() === 'bogen') { bowHoldIntent = true; beginBowDraw(); return false; }
    if (selected() === 'angel') { beginFishingAction(); return false; }
    primaryAction();
    return true;
  },
  primaryUp: () => {
    bowHoldIntent = false;
    if (game.state === 'playing' && player.bowDrawing) releaseBowShot();
    endFishingAction();
  },
  primaryCancel: () => { cancelBowDraw(); endFishingAction(); },
  interact: () => { if (game.state === 'playing') interact(); },
  rotate: () => { if (game.state === 'playing') buildings.rotateGhost(); },
  toggleCraft: () => game.state === 'craft' ? closeCraft() : game.state === 'playing' && openCraft(),
  pause: () => {
    if (game.state !== 'playing') return;
    stopDesktopAction();
    game.state = 'paused';
    gameplayStop(); // CrazyGames-Lifecycle (No-Op im Web-Build)
    ui.showOverlay('pause', { coop: multiplayer.active });
    sfx.uiOpen();
    touch.show(false);
  },
});
player.touchInput = touch;
// Blendet im CrazyGames-Build den eigenen Account-/Koop-Teil des Menüs aus (CSS).
document.body.classList.toggle('platform-crazygames', IS_CRAZYGAMES);
const hasSave = !!localStorage.getItem(SAVE_KEY);
// Web: Login-Schritt nur mit konfigurierter Cloud, sonst direkt zur Modus-Wahl.
// CrazyGames: kein eigener Login/Koop — direkt in die Solo-Vorbereitung.
// CrazyGames: kein eigener Login, aber Broadcast-Koop → direkt zur Modus-Wahl
// (Solo/Koop). Web: Login-Schritt nur mit konfigurierter Cloud, sonst Modus-Wahl.
const menuStartStep = IS_CRAZYGAMES ? 'mode' : (cloud.enabled ? 'login' : 'mode');
ui.showOverlay('menu', { hasSave, startStep: menuStartStep });
ui.showHud(false);
refreshInv();
updateTutorial(true);

cloud.init()
  .then((state) => state.signedIn && reconcileCloudSave())
  .catch((error) => cloudNotice(readableCloudError(error), true));

// CrazyGames: SDK initialisieren, Lade-Signale senden und einen evtl. neueren
// Cloud-Spielstand aus deren Data-Modul übernehmen. Nur im crazygames-Build aktiv.
if (IS_CRAZYGAMES) {
  (async () => {
    await initPlatform();
    // Plattform-Mute übernehmen (z.B. wenn der Nutzer im CrazyGames-Player
    // stummgeschaltet hat) und auf spätere Änderungen reagieren.
    platformMuted = platformMuteAudio();
    applyMute();
    onPlatformMuteChange((muted) => { platformMuted = muted; applyMute(); });
    loadingStart();
    reconcileCrazyCloudSave();
    loadingStop();
    await initCrazyAccountUI();
    initCrazyCoopUI();
  })();
}

// CrazyGames-Konto-Statuszeile: macht das Cloud-Speichern sichtbar (Gast →
// Fortschritt nur lokal). Kein eigener Login — der Button öffnet den SDK-Dialog.
const crazyAccountEl = document.getElementById('crazyAccount');
const crazyAccountStatus = document.getElementById('crazyAccountStatus');
const crazyAccountBtn = document.getElementById('crazyAccountBtn');
let crazyUser = null;

// Zeichnet die Statuszeile aus dem zwischengespeicherten Nutzer neu (synchron,
// auch für den Sprachwechsel).
function paintCrazyAccount() {
  if (!crazyAccountEl) return;
  const signedIn = !!crazyUser;
  crazyAccountEl.classList.toggle('ready', signedIn);
  crazyAccountStatus.textContent = signedIn
    ? tr('menu.signedInAs', { name: crazyUser.username || crazyUser.name || 'Survivor' })
    : tr('menu.guestSave');
  // Anmelden-Button nur zeigen, wenn ein Login möglich und man noch Gast ist.
  crazyAccountBtn.hidden = signedIn || !isCrazyAuthAvailable();
}

async function refreshCrazyAccount() {
  crazyUser = await getCrazyUser();
  paintCrazyAccount();
}

async function initCrazyAccountUI() {
  await refreshCrazyAccount();
  onCrazyAuthChange(() => { void refreshCrazyAccount(); });
  crazyAccountBtn.addEventListener('click', async () => {
    await showCrazyAuthPrompt();
    await refreshCrazyAccount();
  });
}

// ---- CrazyGames-Koop: Broadcast über Einladungslinks ---------------------
// Kein Supabase-Login. Identität = CrazyGames-Nutzer oder stabile lokale Gast-ID,
// Transport = anon-Realtime-Client (nur Broadcast/Presence), Räume = Einladungs-
// links des SDK. Der Host ist autoritativ und speichert lokal.
let crazyInviteButtonId = null;
let crazyInviteLink = null;

function crazyCoopNotice(message = '', isError = false) {
  const el = document.getElementById('crazyCoopMessage');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', isError);
}

function crazyRoomId() {
  const rnd = (crypto?.randomUUID?.() || `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
  return `wld${rnd.replace(/-/g, '').slice(0, 10)}`;
}

function initCrazyCoopUI() {
  // Ohne Supabase-Konfiguration (URL/anon-Key) bleibt Koop im CG-Build aus.
  if (!isBroadcastConfigured()) { document.getElementById('menuModeKoop')?.classList.add('hidden'); return; }
  const client = createBroadcastClient();
  if (!client) { document.getElementById('menuModeKoop')?.classList.add('hidden'); return; }
  // Identität injizieren: CrazyGames-Konto, sonst lokale Gast-ID.
  multiplayer.useCrazyIdentity(crazyUser?.id || localGuestId(), client);

  const nameInput = document.getElementById('crazyCoopName');
  nameInput.value ||= crazyUser?.username || crazyUser?.name || 'Survivor';

  document.getElementById('crazyCoopHost').addEventListener('click', () => enterCrazyCoop('host'));
  document.getElementById('crazyCoopInvite').addEventListener('click', () => {
    showCrazyInvite();
    // Zusätzlich zum nativen Einladen-Button den modernen Invite-Link in die
    // Zwischenablage legen — nützlich, wo der native Button nicht erscheint.
    if (crazyInviteLink && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(crazyInviteLink).then(
        () => crazyCoopNotice(tr('mp.cgLinkCopied')),
        () => { /* Clipboard verweigert — nativer Button bleibt */ },
      );
    }
  });

  // Beitritt über eine Einladung, auch mitten im laufenden Spiel: die Plattform
  // liefert die inviteParams des Gastgeber-Raums → dieser Welt beitreten.
  onJoinRoom((inviteParams) => {
    const room = inviteParams?.room;
    if (!room) return;
    setMenuStep('koop');
    void enterCrazyCoop('join', room);
  });

  // Instant Multiplayer: Wurde das Spiel über einen Einladungslink mit Raum
  // geöffnet, ist der Nutzer ein beitretender Gast → direkt joinen. Ist es der
  // Instant-Multiplayer-Einstieg ohne Raum-Param, ist der Nutzer der Party-
  // Leader → sofort eine Koop-Welt hosten und den Einladen-Button zeigen.
  const invitedRoom = getInviteParam('room');
  if (invitedRoom) {
    setMenuStep('koop');
    void enterCrazyCoop('join', invitedRoom);
  } else if (isInstantMultiplayer()) {
    setMenuStep('koop');
    void enterCrazyCoop('host');
  }
}

function showCrazyInvite(roomId) {
  const id = typeof roomId === 'string' ? roomId : multiplayer.room?.id;
  if (!id) return;
  const params = { room: id };
  // Raum bei der Plattform als joinbar melden (Party-System / Instant MP).
  updateRoom({ roomId: id, isJoinable: true, inviteParams: params });
  // Modernen Einladungslink erzeugen (für Clipboard-Fallback in der UI).
  crazyInviteLink = createInviteLink(params);
  // Zusätzlich den (deprecated) nativen Einladen-Button anzeigen.
  hideInviteButton(crazyInviteButtonId);
  crazyInviteButtonId = showInviteButton(params);
  document.getElementById('crazyCoopInvite').classList.remove('hidden');
}

async function enterCrazyCoop(action, roomId = null) {
  const nameInput = document.getElementById('crazyCoopName');
  const name = (nameInput.value.trim() || crazyUser?.username || 'Survivor').slice(0, 24);
  nameInput.value = name;
  const hostBtn = document.getElementById('crazyCoopHost');
  hostBtn.disabled = true;
  crazyCoopNotice(tr(action === 'host' ? 'mp.creating' : 'mp.cgJoining'));
  try {
    // Laufende Solo-Partie zuerst sichern; Koop nutzt danach den Koop-Save.
    if (saveContext === 'single' && game.state !== 'menu' && game.state !== 'dead') saveGame(false);
    let room;
    if (action === 'host') {
      newGame({ clearSingleplayerSave: false });
      saveContext = 'coop';
      room = await multiplayer.createCrazyRoom(name, sharedWorldState(), roomId || crazyRoomId());
      showCrazyInvite(room.id);
      crazyCoopNotice(tr('mp.cgHosting'));
    } else {
      room = await multiplayer.joinCrazyRoom(name, roomId);
      saveContext = 'coop';
      // Die echte Welt liefert gleich der Host per world_state-Broadcast.
      newGame({ clearSingleplayerSave: false });
      crazyCoopNotice(tr('mp.cgJoined'));
    }
    applySharedWorldState(room.world_state);
    animals.setRemote(!multiplayer.isHost());
    startAudioForPlay();
    prerenderFirstFrame();
    resumePlaying();
    if (!touch?.enabled) lockPointer();
    saveGame(false);
  } catch (error) {
    crazyCoopNotice(readableMultiplayerError(error) || tr('err.cgCoop'), true);
    await multiplayer.stop();
    restoreSingleplayerInMenu();
  } finally {
    hostBtn.disabled = false;
  }
}

// Übernimmt den in der CrazyGames-Cloud (Data-Modul) gespeicherten Spielstand,
// wenn er neuer ist als der lokale — dasselbe Muster wie beim Supabase-Sync.
function reconcileCrazyCloudSave() {
  const raw = cloudGet(SAVE_KEY);
  if (!raw) return;
  let remoteSave = null;
  try { remoteSave = JSON.parse(raw); } catch { return; }
  if (!remoteSave) return;
  const local = localSaveData();
  const cloudIsNewer = saveTimestamp(remoteSave) > saveTimestamp(local);
  if (game.state === 'menu' && (!local || cloudIsNewer)) {
    localStorage.setItem(SAVE_KEY, raw);
    ui.showOverlay('menu', {
      hasSave: true,
      startStep: document.getElementById('overlay').dataset.step || 'solo',
    });
    ui.toast(local ? tr('m.cloudNewer') : tr('m.cloudLoaded'));
  } else if (local && !cloudIsNewer) {
    // Lokaler Stand ist mindestens so aktuell → in die Cloud zurückschreiben.
    cloudSet(SAVE_KEY, JSON.stringify(local));
  }
}

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
window.G = { game, ui, world, player, animals, aquatics, landmarks, buildings, resources, scene, camera, addItem, tick, music, cloud, spawnTrackingEvent, quality, applyQuality, renderer, multiplayer, refreshMap };
// Debug: spawnt einen lokalen Avatar vor dem Spieler zum Justieren von Modell,
// Handposition und gehaltenem Item (z.B. G.debugAvatar('axt')).
window.G.debugAvatar = (held = 'hand') => {
  const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
  const x = player.pos.x + forward.x * 3.2;
  const z = player.pos.z + forward.z * 3.2;
  const state = { userId: 'debug', name: 'Debug', x, y: terrainHeight(x, z), z, yaw: player.yaw + Math.PI, held };
  receiveRemotePlayer(state);
  const remote = remotePlayers.get('debug');
  window.G.debugHeld = (id) => remote.avatar.setHeld(id);
  window.G.debugMove = (v = true) => { remote.moving = v; };
  return remote;
};

// Statische UI-Texte auf die aktive Sprache setzen + DE/EN-Umschalter im
// Menü-Footer verdrahten. Läuft nach den initialen DOM-Zuweisungen oben.
initI18nDom();
// Cloud-abhängige Menütexte (Status, Account-Button, Continue) neu setzen,
// wenn die Sprache umgeschaltet wird — sie werden dynamisch gerendert.
onLangChange(() => {
  cloud.emit();
  if (IS_CRAZYGAMES) paintCrazyAccount();
  // Die Landmarken-Instanzen kopieren Name und Geschichte beim Erzeugen aus den
  // Definitionen. Nach einem Sprachwechsel müssen sie neu übernommen werden,
  // sonst bleiben Karte und Chronik in der alten Sprache stehen.
  for (const entry of landmarks.list) {
    const def = LANDMARK_DEFINITIONS.find((d) => d.id === entry.id);
    if (!def) continue;
    entry.name = def.name;
    entry.story = def.story;
  }
  for (const cache of landmarks.caveCaches) {
    const def = LANDMARK_DEFINITIONS.find((d) => d.id === cache.id);
    if (def?.cache) cache.name = def.cache.name;
  }
});
