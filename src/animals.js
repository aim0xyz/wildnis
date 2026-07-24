import * as THREE from 'three';
import { terrainHeight, biomeAt, dangerTierAt, dryCaveFloorY, WATER_Y, WORLD_RADIUS, CROCODILE_RIVERS, riverInfluence } from './world.js';
import { sfx } from './sfx.js';

const MATERIALS = new Map();
function std(color, roughness = .92) {
  const key = `${color}-${roughness}`;
  if (!MATERIALS.has(key)) MATERIALS.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness }));
  return MATERIALS.get(key);
}

// Bewusst kleine, gemeinsam genutzte Geometrien: Die deutlich facettierteren
// Silhouetten lesen sich besser als die alten glatten Kugeln und benötigen pro
// Tier nur einen Bruchteil der Vertices.
const POLY_GEO = new THREE.IcosahedronGeometry(1, 1);
const TINY_POLY_GEO = new THREE.IcosahedronGeometry(1, 0);
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
const CONE_GEO = new THREE.ConeGeometry(1, 1, 6, 1);
const ROD_GEO = new THREE.CylinderGeometry(1, .78, 1, 5, 1);
const BOSS_RING_GEO = new THREE.RingGeometry(1.25, 1.48, 32);
const LIMB_GEOMETRIES = new Map();

function meshFrom(geometry, color) {
  const mesh = new THREE.Mesh(geometry, std(color));
  mesh.castShadow = true;
  return mesh;
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = meshFrom(BOX_GEO, color);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

function ellipsoid(rx, ry, rz, color, x = 0, y = 0, z = 0, tiny = false) {
  const m = meshFrom(tiny ? TINY_POLY_GEO : POLY_GEO, color);
  m.scale.set(rx, ry, rz);
  m.position.set(x, y, z);
  return m;
}

function limb(radiusTop, radiusBottom, length, color, x, y, z) {
  const ratio = Math.round((radiusTop / radiusBottom) * 100) / 100;
  if (!LIMB_GEOMETRIES.has(ratio)) {
    LIMB_GEOMETRIES.set(ratio, new THREE.CylinderGeometry(ratio, 1, 1, 5, 1));
  }
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const m = meshFrom(LIMB_GEOMETRIES.get(ratio), color);
  m.scale.set(radiusBottom, length, radiusBottom);
  m.position.y = -length / 2;
  pivot.add(m);
  return pivot;
}

function cone(radius, length, color, x, y, z, rotationX = 0) {
  const m = meshFrom(CONE_GEO, color);
  m.scale.set(radius, length, radius);
  m.position.set(x, y, z);
  m.rotation.x = rotationX;
  return m;
}

const rodDirection = new THREE.Vector3();
const rodMidpoint = new THREE.Vector3();
const rodUp = new THREE.Vector3(0, 1, 0);
function rodBetween(start, end, radius, color) {
  const direction = rodDirection.subVectors(end, start);
  const length = direction.length();
  const rod = meshFrom(ROD_GEO, color);
  rod.scale.set(radius, length, radius);
  rod.position.copy(rodMidpoint.addVectors(start, end).multiplyScalar(.5));
  rod.quaternion.setFromUnitVectors(rodUp, direction.normalize());
  return rod;
}

function addEyes(group, x, y, z, radius = .03, color = 0x101313) {
  for (const side of [-1, 1]) group.add(ellipsoid(radius, radius * 1.08, radius * .7, color, side * x, y, z, true));
}

function fourLegs(group, { x, frontZ, backZ, y, length, top, bottom, color, hoofColor, hoofScale = 1 }) {
  const legs = [];
  for (const side of [-1, 1]) {
    for (const [z, front] of [[backZ, false], [frontZ, true]]) {
      const leg = limb(top, bottom, length, color, side * x, y, z);
      leg.userData.strideSign = (side > 0) === front ? 1 : -1;
      if (hoofColor != null) {
        const hoof = box(bottom * 1.9 * hoofScale, bottom * .8, bottom * 2.5 * hoofScale, hoofColor, 0, -length - bottom * .2, bottom * .42);
        leg.add(hoof);
      }
      group.add(leg);
      legs.push(leg);
    }
  }
  return legs;
}

export const KINDS = {
  hase: {
    name: 'Hase', hp: 2, walk: 1.6, flee: 5.6, fleeR: 9, hop: 0.28,
    // Fell ist ein zentrales frühes Baumaterial. Die frühere 30%-Chance wirkte
    // wie verlorene Beute und machte den Koop-Fortschritt unnötig zufällig.
    drops: () => ({ fleisch_roh: 1, fell: 1 }),
  },
  hirsch: {
    name: 'Hirsch', hp: 8, walk: 1.3, flee: 6.1, fleeR: 13, hop: 0.08,
    drops: () => ({ fleisch_roh: 3, fell: 1 }),
  },
  wolf: {
    name: 'Wolf', hp: 14, walk: 1.8, chase: 5.3, dmg: 12, hop: 0.06, hostile: true, aggroDay: 11, aggroNight: 26, disengage: 42, fireFear: true, contactR: 1.55, attackR: 1.9,
    drops: () => ({ fleisch_roh: 2, fell: 2 }),
  },
  wildschwein: {
    name: 'Wildschwein', hp: 18, walk: 1.35, chase: 5.8, dmg: 15, hop: 0.035, hostile: true, aggroDay: 7, aggroNight: 9, disengage: 30, contactR: 2.05, attackR: 2.35,
    drops: () => ({ fleisch_roh: 4, fell: 1 }),
  },
  baer: {
    name: 'Bär', hp: 38, walk: 1.15, chase: 4.7, dmg: 24, hop: 0.025, hostile: true, aggroDay: 13, aggroNight: 16, disengage: 48, fireFear: true, contactR: 2.55, attackR: 2.85,
    drops: () => ({ fleisch_roh: 6, fell: 4 }),
  },
  // Im Wasser der gefährlichste Gegner des Spiels. Es schießt aus dem Fluss,
  // verfolgt Beute aber nur ein kurzes Stück über Land und kehrt dann um.
  krokodil: {
    name: 'Krokodil', hp: 30, walk: .85, chase: 6.4, dmg: 22, hop: .02, hostile: true,
    aggroDay: 18, aggroNight: 21, disengage: 30, contactR: 2.15, attackR: 2.75,
    aquatic: true, landChaseLimit: 14,
    // Als einzige Art skaliert die Beute mit dem Tier. Ohne das lohnt sich der
    // gefährliche Außengürtel nicht — man farmt sonst am nächstgelegenen Fluss.
    drops: (tier = 1) => ({ fleisch_roh: 4, krokodilleder: 2 + Math.floor(Math.max(0, tier - 6) / 2) }),
  },
};

// Die riesige Karte braucht einen sichtbar höheren Bestand. Vor allem Beutetiere
// werden dichter gesetzt; Raubtiere steigen moderater, damit "voller" nicht
// automatisch "ständig im Kampf" bedeutet. Entfernte Tiere laufen weiterhin
// nur mit dem gedrosselten Fern-Update.
const COUNTS = { hase: 58, hirsch: 36, wolf: 22, wildschwein: 32, baer: 14, krokodil: 16 };

// Eine lokale Gittersuche wird nur gestartet, wenn ein Wolf tatsächlich an
// einem Hindernis hängen bleibt. Dadurch finden Rudel offene Tore, Lücken und
// Mauerenden, ohne dass für jedes Tier in jedem Frame Navigation berechnet
// werden muss.
function findPathAroundObstacles(start, goal, obstacles = []) {
  const padding = 22;
  const rawMinX = Math.max(-WORLD_RADIUS + 5, Math.min(start.x, goal.x) - padding);
  const rawMaxX = Math.min(WORLD_RADIUS - 5, Math.max(start.x, goal.x) + padding);
  const rawMinZ = Math.max(-WORLD_RADIUS + 5, Math.min(start.z, goal.z) - padding);
  const rawMaxZ = Math.min(WORLD_RADIUS - 5, Math.max(start.z, goal.z) + padding);
  const cell = Math.max(1.1, Math.max(rawMaxX - rawMinX, rawMaxZ - rawMinZ) / 110);
  const cols = Math.max(2, Math.floor((rawMaxX - rawMinX) / cell) + 1);
  const rows = Math.max(2, Math.floor((rawMaxZ - rawMinZ) / cell) + 1);
  const minX = rawMinX, minZ = rawMinZ;
  const total = cols * rows;
  const toCol = (x) => THREE.MathUtils.clamp(Math.round((x - minX) / cell), 0, cols - 1);
  const toRow = (z) => THREE.MathUtils.clamp(Math.round((z - minZ) / cell), 0, rows - 1);
  const startIndex = toRow(start.z) * cols + toCol(start.x);
  const goalIndex = toRow(goal.z) * cols + toCol(goal.x);

  // Räumliche Buckets halten die Kollisionsprüfung auch bei großen Basen
  // günstig: Für eine Zelle werden nur Hindernisse aus ihrer Umgebung geprüft.
  const bucketSize = 5;
  const buckets = new Map();
  const bucketKey = (x, z) => `${Math.floor(x / bucketSize)},${Math.floor(z / bucketSize)}`;
  for (const obstacle of obstacles) {
    const radius = obstacle.r + .48;
    if (obstacle.x + radius < rawMinX || obstacle.x - radius > rawMaxX || obstacle.z + radius < rawMinZ || obstacle.z - radius > rawMaxZ) continue;
    const minBucketX = Math.floor((obstacle.x - radius) / bucketSize);
    const maxBucketX = Math.floor((obstacle.x + radius) / bucketSize);
    const minBucketZ = Math.floor((obstacle.z - radius) / bucketSize);
    const maxBucketZ = Math.floor((obstacle.z + radius) / bucketSize);
    for (let bx = minBucketX; bx <= maxBucketX; bx++) {
      for (let bz = minBucketZ; bz <= maxBucketZ; bz++) {
        const key = `${bx},${bz}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(obstacle);
      }
    }
  }

  const state = new Uint8Array(total); // 0 unbekannt, 1 blockiert, 2 frei
  const walkable = (index) => {
    if (index === startIndex || index === goalIndex) return true;
    if (state[index]) return state[index] === 2;
    const col = index % cols, row = Math.floor(index / cols);
    const x = minX + col * cell, z = minZ + row * cell;
    let blocked = terrainHeight(x, z) < WATER_Y + .15;
    if (!blocked) {
      for (const obstacle of buckets.get(bucketKey(x, z)) || []) {
        if (Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.r + .48) { blocked = true; break; }
      }
    }
    state[index] = blocked ? 1 : 2;
    return !blocked;
  };

  const parent = new Int32Array(total);
  parent.fill(-1);
  const queue = new Int32Array(total);
  let read = 0, write = 0;
  queue[write++] = startIndex;
  parent[startIndex] = startIndex;
  const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  while (read < write && parent[goalIndex] < 0) {
    const current = queue[read++];
    const col = current % cols, row = Math.floor(current / cols);
    for (const [dc, dr] of directions) {
      const nc = col + dc, nr = row + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const next = nr * cols + nc;
      if (parent[next] >= 0 || !walkable(next)) continue;
      // Diagonal nicht durch die Ecke zweier Kollisionskreise schneiden.
      if (dc && dr && (!walkable(row * cols + nc) || !walkable(nr * cols + col))) continue;
      parent[next] = current;
      queue[write++] = next;
      if (next === goalIndex) break;
    }
  }
  if (parent[goalIndex] < 0) return null;

  const path = [];
  for (let index = goalIndex; index !== startIndex; index = parent[index]) {
    const col = index % cols, row = Math.floor(index / cols);
    path.push({ x: minX + col * cell, z: minZ + row * cell });
  }
  path.reverse();
  if (path.length) path[path.length - 1] = { x: goal.x, z: goal.z };
  return path;
}

// Feste Reviere statt Kartenmarker: Wer weit genug in die neue Wildnis fährt,
// kann diese Gegner zufällig entdecken. Nach einer Niederlage kehren sie erst
// nach einigen Minuten zurück.
const BOSS_SITES = [
  { id:'weisser_leitwolf', title:'Weißer Leitwolf', kind:'wolf', level:4, tier:6, x:620, z:620, scale:1.45, hp:3.4, damage:1.18, color:0x9fdcff, drops:{fleisch_roh:6,fell:8,eisen:2} },
  { id:'moorkeiler', title:'Moorkeiler', kind:'wildschwein', level:7, tier:8, x:-690, z:65, scale:1.52, hp:3.6, damage:1.2, color:0xe4a45f, drops:{fleisch_roh:10,fell:6,eisen:3} },
  { id:'alter_bergbaer', title:'Alter Bergbär', kind:'baer', level:10, tier:10, x:-205, z:-680, scale:1.58, hp:3.25, damage:1.16, color:0xe8c477, drops:{fleisch_roh:14,fell:10,eisen:5} },
  // Zwei Endgame-Reviere im neuen Außengürtel. Ohne sie wären die stärksten
  // Gegner des Spiels normales Wild am Kartenrand.
  { id:'flussfuerst', title:'Flussfürst', kind:'krokodil', level:13, tier:13, x:812, z:-141, scale:1.6, hp:3.4, damage:1.2, color:0x7fd88f, drops:{fleisch_roh:12,krokodilleder:14,eisen:4} },
  { id:'narbenbaer', title:'Narbenbär der Nordschlucht', kind:'baer', level:17, tier:15, x:-72, z:-991, scale:1.72, hp:3.6, damage:1.24, color:0xd98c4a, drops:{fleisch_roh:18,fell:14,krokodilleder:6,eisen:8} },
];

function buildHase() {
  const g = new THREE.Group();
  const fur = 0xad8a60, light = 0xd7bd91, dark = 0x6f5540;
  const body = ellipsoid(.34, .34, .5, fur, 0, .43, -.04); g.add(body);
  g.add(ellipsoid(.28, .3, .32, 0xb9976c, 0, .48, .27));
  const head = ellipsoid(.24, .25, .27, 0xc0a174, 0, .72, .43); g.add(head);
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = ellipsoid(.065, .3, .052, fur, side * .1, 1.02, .37);
    ear.rotation.z = -side * .11;
    const inner = ellipsoid(.026, .205, .014, 0x9b675e, side * .1, 1.02, .423, true);
    inner.rotation.z = ear.rotation.z;
    g.add(ear, inner); ears.push(ear);
  }
  for (const side of [-1, 1]) g.add(ellipsoid(.105, .08, .11, light, side * .075, .66, .65, true));
  g.add(ellipsoid(.045, .035, .035, dark, 0, .69, .76, true));
  addEyes(g, .13, .78, .62, .027);
  const tail = new THREE.Group(); tail.position.set(0, .47, -.5); tail.add(ellipsoid(.13, .13, .13, 0xf1e6d2, 0, 0, 0)); g.add(tail);
  const legs = fourLegs(g, { x:.19, frontZ:.3, backZ:-.25, y:.35, length:.24, top:.1, bottom:.075, color:dark, hoofColor:null });
  for (const leg of legs) leg.add(ellipsoid(.1, .065, .18, dark, 0, -.25, .045, true));
  g.userData.body = body; g.userData.head = head; g.userData.tail = tail; g.userData.ears = ears; g.userData.legs = legs;
  return g;
}

function buildHirsch() {
  const g = new THREE.Group();
  const coat = 0x875a36, coatLight = 0xa5774b, dark = 0x4a3529, bone = 0xcab98f;
  const body = ellipsoid(.58, .6, 1.05, coat, 0, 1.15, 0); g.add(body);
  g.add(ellipsoid(.52, .64, .57, coatLight, 0, 1.22, .48));
  g.add(ellipsoid(.43, .48, .28, 0xd9c6a2, 0, 1.16, -.9));
  const legs = fourLegs(g, { x:.31, frontZ:.58, backZ:-.6, y:.98, length:.9, top:.095, bottom:.06, color:coat, hoofColor:dark });
  const neck = ellipsoid(.23, .67, .27, coat, 0, 1.72, .62); neck.rotation.x = -.26; g.add(neck);
  const head = ellipsoid(.25, .28, .46, coatLight, 0, 2.12, 1.02); head.rotation.x = -.08; g.add(head);
  g.add(ellipsoid(.19, .14, .3, 0x6b4932, 0, 2.04, 1.39));
  g.add(ellipsoid(.12, .075, .055, dark, 0, 2.06, 1.66, true));
  addEyes(g, .17, 2.19, 1.38, .03);
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = cone(.12, .3, coat, side * .24, 2.37, 1.02);
    ear.rotation.z = side * 1.08; g.add(ear); ears.push(ear);
    const base = new THREE.Vector3(side * .12, 2.37, .94);
    const top = new THREE.Vector3(side * .2, 2.92, .88);
    g.add(rodBetween(base, top, .035, bone));
    g.add(rodBetween(new THREE.Vector3(side*.17,2.63,.9), new THREE.Vector3(side*.38,2.82,.88), .026, bone));
    g.add(rodBetween(new THREE.Vector3(side*.19,2.79,.89), new THREE.Vector3(side*.39,3.02,.84), .024, bone));
  }
  const tail = new THREE.Group(); tail.position.set(0, 1.35, -1.0);
  const tailMesh = ellipsoid(.115, .17, .22, 0xf0e5cf, 0, 0, 0); tail.rotation.x = -.25; tail.add(tailMesh); g.add(tail);
  g.userData.body=body; g.userData.neck=neck; g.userData.legs=legs; g.userData.head=head; g.userData.tail=tail; g.userData.ears=ears;
  return g;
}

function buildWolf() {
  const g = new THREE.Group();
  const fur = 0x656a70, light = 0x8a8d8d, dark = 0x3c4147;
  const body = ellipsoid(.45, .46, .9, fur, 0, .84, -.02); g.add(body);
  g.add(ellipsoid(.49, .56, .48, light, 0, .94, .46));
  g.add(ellipsoid(.44, .48, .44, dark, 0, .87, -.54));
  const legs = fourLegs(g, { x:.24, frontZ:.52, backZ:-.54, y:.7, length:.64, top:.09, bottom:.058, color:dark, hoofColor:0x272b2e, hoofScale:1.15 });
  const neck = ellipsoid(.31, .4, .38, fur, 0, 1.08, .62); neck.rotation.x = -.18; g.add(neck);
  const head = ellipsoid(.31, .31, .4, fur, 0, 1.22, .89); g.add(head);
  g.add(ellipsoid(.19, .16, .38, light, 0, 1.12, 1.22));
  g.add(ellipsoid(.105, .08, .07, 0x181b1c, 0, 1.14, 1.55, true));
  addEyes(g, .135, 1.29, 1.17, .034, 0x171a1b);
  const ears=[];
  for(const side of [-1,1]) {
    const ear=cone(.13,.32,dark,side*.17,1.55,.84); ear.rotation.z=-side*.1; g.add(ear); ears.push(ear);
    const inner=cone(.065,.19,0x7a5550,side*.17,1.55,.87); inner.rotation.z=-side*.1; g.add(inner);
  }
  const tail = new THREE.Group(); tail.position.set(0, 1.0, -.82);
  const tailMesh = cone(.16,.72,fur,0,0,-.34,-Math.PI/2); tail.add(tailMesh); tail.rotation.x = -.35; g.add(tail);
  g.userData.body=body;g.userData.neck=neck;g.userData.legs=legs;g.userData.head=head;g.userData.tail=tail;g.userData.ears=ears;
  return g;
}

function buildWildschwein() {
  const g = new THREE.Group();
  const hide=0x51443b, shoulder=0x625248, dark=0x2f2926, snout=0x846b5d;
  const body=ellipsoid(.64,.54,1.02,hide,0,.79,-.05);g.add(body);
  g.add(ellipsoid(.66,.65,.58,shoulder,0,.9,.5));
  const head=ellipsoid(.48,.45,.55,shoulder,0,.87,.91);g.add(head);
  const legs=fourLegs(g,{x:.32,frontZ:.54,backZ:-.58,y:.63,length:.48,top:.13,bottom:.085,color:dark,hoofColor:0x211e1c,hoofScale:1.15});
  g.add(ellipsoid(.35,.21,.32,snout,0,.72,1.36));
  g.add(ellipsoid(.25,.15,.075,0x2b2522,0,.73,1.64,true));
  for(const side of [-1,1])g.add(ellipsoid(.035,.025,.018,0x0f1010,side*.1,.75,1.7,true));
  addEyes(g,.25,.98,1.25,.03);
  const ears=[];
  for(const side of [-1,1]){const ear=cone(.13,.27,dark,side*.28,1.23,.83);ear.rotation.z=side*.5;g.add(ear);ears.push(ear);}
  for(let i=0;i<9;i++){
    const bristle=cone(.055,.28+(i%3)*.04,dark,(i%2-.5)*.07,1.35-Math.abs(i-4)*.018,-.72+i*.19);
    bristle.rotation.x=(i-4)*.035;g.add(bristle);
  }
  for(const side of [-1,1]){
    const tusk=cone(.055,.3,0xe7d8b5,side*.24,.61,1.49,-.82);tusk.rotation.z=-side*.16;g.add(tusk);
  }
  const tail=new THREE.Group();tail.position.set(0,.94,-1.02);
  const curl=new THREE.Mesh(new THREE.TorusGeometry(.12,.025,5,9,Math.PI*1.55),std(dark));curl.rotation.y=Math.PI/2;tail.add(curl);g.add(tail);
  g.userData.body=body;g.userData.legs=legs;g.userData.head=head;g.userData.tail=tail;g.userData.ears=ears;
  return g;
}

function buildBaer() {
  const g = new THREE.Group();
  const fur=0x4b3528, light=0x624737, dark=0x2b221d;
  const body=ellipsoid(.9,.82,1.22,fur,0,1.1,-.08);g.add(body);
  g.add(ellipsoid(.86,.94,.7,light,0,1.32,.48));
  g.add(ellipsoid(.72,.7,.68,fur,0,1.03,-.69));
  const legs=fourLegs(g,{x:.45,frontZ:.6,backZ:-.62,y:.88,length:.74,top:.24,bottom:.18,color:dark,hoofColor:0x211b18,hoofScale:1.2});
  for(const leg of legs)leg.add(ellipsoid(.23,.11,.31,dark,0,-.76,.09));
  const head=ellipsoid(.61,.57,.61,light,0,1.58,1.12);g.add(head);
  g.add(ellipsoid(.38,.27,.43,0x7a5c47,0,1.39,1.64));
  g.add(ellipsoid(.17,.115,.075,dark,0,1.46,2.0,true));
  addEyes(g,.25,1.67,1.62,.038);
  const ears=[];
  for(const side of [-1,1]){
    const ear=ellipsoid(.18,.19,.1,fur,side*.43,1.99,1.05);g.add(ear);ears.push(ear);
    g.add(ellipsoid(.1,.11,.025,0x38271f,side*.43,1.99,1.145,true));
  }
  const tail=new THREE.Group();tail.position.set(0,1.22,-1.22);tail.add(ellipsoid(.16,.14,.15,dark,0,0,0,true));g.add(tail);
  g.userData.body=body;g.userData.legs=legs;g.userData.head=head;g.userData.tail=tail;g.userData.ears=ears;
  return g;
}

function buildKrokodil() {
  const g = new THREE.Group();
  const scale=0x4a5c3a, belly=0x8a9468, dark=0x2b3524, ridge=0x394429;
  // Flach und lang: Im Wasser ragen nur Rücken, Augen und Schnauze heraus.
  const body=ellipsoid(.52,.34,1.35,scale,0,.42,-.1);g.add(body);
  g.add(ellipsoid(.46,.26,.9,belly,0,.26,-.05,true));
  const legs=fourLegs(g,{x:.42,frontZ:.6,backZ:-.62,y:.3,length:.26,top:.11,bottom:.075,color:dark,hoofColor:0x1d241a,hoofScale:1.1});
  const neck=ellipsoid(.38,.28,.42,scale,0,.44,.98);g.add(neck);
  const head=ellipsoid(.34,.22,.62,scale,0,.42,1.5);g.add(head);
  // Lange, schmale Schnauze — die Silhouette, die das Tier lesbar macht.
  g.add(ellipsoid(.22,.15,.52,scale,0,.4,2.05));
  g.add(ellipsoid(.2,.12,.48,belly,0,.31,2.05,true));
  g.add(ellipsoid(.07,.05,.05,dark,0,.44,2.55,true));
  addEyes(g,.19,.6,1.62,.045,0xd8c257);
  for(const side of [-1,1])g.add(ellipsoid(.1,.08,.11,scale,side*.19,.55,1.6));
  // Zahnreihe und Rückenkamm: zwei Details, die aus der Distanz die Bedrohung
  // signalisieren, bevor die Aggro greift.
  for(let i=0;i<7;i++){
    for(const side of [-1,1]){
      const tooth=cone(.026,.09,0xe8e2cc,side*.15,.33,1.75+i*.12,Math.PI);g.add(tooth);
    }
  }
  const ridges=[];
  for(let i=0;i<9;i++){
    const plate=cone(.075,.17+(i<5?.06:0),ridge,(i%2-.5)*.05,.68-Math.abs(i-3)*.012,.55-i*.24);
    plate.rotation.x=(i-3)*.02;g.add(plate);ridges.push(plate);
  }
  const tail=new THREE.Group();tail.position.set(0,.42,-1.3);
  const tailMesh=ellipsoid(.28,.2,.85,scale,0,0,-.72);tail.add(tailMesh);
  const tailTip=ellipsoid(.13,.13,.5,dark,0,.03,-1.5);tail.add(tailTip);
  for(let i=0;i<5;i++)tail.add(cone(.06,.15,ridge,0,.16,-.35-i*.28));
  g.add(tail);
  g.userData.body=body;g.userData.neck=neck;g.userData.legs=legs;g.userData.head=head;g.userData.tail=tail;g.userData.ears=ridges;
  return g;
}

const BUILDERS = { hase: buildHase, hirsch: buildHirsch, wolf: buildWolf, wildschwein: buildWildschwein, baer: buildBaer, krokodil: buildKrokodil };

class Animal {
  constructor(kind, x, z) {
    this.kind = kind;
    this.def = KINDS[kind];
    // Gemeinsame Berechnung mit der Karte (world.js), damit die dort
    // angezeigte Stufe immer dem tatsächlichen Wild vor Ort entspricht.
    this.tier = dangerTierAt(x, z);
    const scale = 1 + (this.tier - 1) * 0.16;
    this.maxHp = Math.round(this.def.hp * scale);
    this.hp = this.maxHp;
    this.damage = Math.round((this.def.dmg || 0) * (1 + (this.tier - 1) * 0.12));
    this.group = BUILDERS[kind]();
    this.group.position.set(x, terrainHeight(x, z), z);
    this.group.traverse((m) => { m.userData.animal = this; });
    this.state = 'wander';
    this.target = new THREE.Vector2(x, z);
    this.retargetAt = 0;
    this.aggro = false;
    this.biteCd = 0;
    this.siegeCd = Math.random() * .6;
    this.navPath = [];
    this.navRepathAt = 0;
    this.navTargetX = x;
    this.navTargetZ = z;
    // Flusstiere starten im Wasser; das ist zugleich ihr erster Rückzugspunkt.
    this.lastWaterX = this.def.aquatic ? x : null;
    this.lastWaterZ = this.def.aquatic ? z : null;
    this.returningToWater = false;
    this.phase = Math.random() * 10;
    this.moving = false;
    // Individuelle Pirschrichtung verhindert, dass ein ganzes Rudel synchron
    // um ein Feuer kreist. Der Richtungswechsel erzeugt kurzes Hin-und-her.
    this.fireProwlDir = Math.random() < .5 ? -1 : 1;
    this.fireProwlUntil = 0;
    this.fireStalking = false;
    this.farUpdateAccum = Math.random() * .2;
    this.legs = this.group.userData.legs || [];
    this.head = this.group.userData.head || null;
    this.tail = this.group.userData.tail || null;
    this.body = this.group.userData.body || null;
    this.neck = this.group.userData.neck || null;
    this.ears = this.group.userData.ears || [];
    for (const part of [this.body, this.neck, this.head, this.tail, ...this.ears, ...this.legs].filter(Boolean)) {
      part.userData.restPosition = part.position.clone();
      part.userData.restRotation = part.rotation.clone();
    }
    this.refreshGroundOffset();
  }

  // Abstand zum zuletzt bekannten Wasserpunkt. Billiger als pro Frame das
  // Ufer zu suchen und korrigiert sich selbst, sobald das Tier wieder
  // schwimmt.
  waterDistance() {
    const p = this.group.position;
    if (terrainHeight(p.x, p.z) <= WATER_Y - .1) {
      this.lastWaterX = p.x;
      this.lastWaterZ = p.z;
      return 0;
    }
    if (this.lastWaterX == null) return 0;
    return Math.hypot(p.x - this.lastWaterX, p.z - this.lastWaterZ);
  }

  refreshGroundOffset() {
    this.group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(this.group);
    this.groundOffset=-(bounds.min.y-this.group.position.y);
  }

  setTier(tier, force = false) {
    const next=Math.max(1,Math.min(12,Math.round(tier||1)));
    if(!force&&next===this.tier)return;
    const ratio=this.maxHp>0?THREE.MathUtils.clamp(this.hp/this.maxHp,0,1):1;
    this.tier=next;
    const scale=1+(next-1)*.16;
    this.maxHp=Math.round(this.def.hp*scale*(this.healthMultiplier||1));
    this.hp=Math.max(1,Math.round(this.maxHp*ratio));
    this.damage=Math.round((this.def.dmg||0)*(1+(next-1)*.12)*(this.damageMultiplier||1));
    if(!this.bossId){
      const visual=1+Math.min(.14,(next-1)*.018);
      this.group.scale.multiplyScalar(visual/(this.tierVisualScale||1));
      this.tierVisualScale=visual;
    }
    this.refreshGroundOffset();
  }

  get pos() { return this.group.position; }

  // Begehbarer Boden für Höhlenwächter: Die geraden Höhlen (Wurzelhöhle,
  // Eiskluft) senken nur die SICHTBARE Terrainhaut ab; die Physik der Spieler
  // kommt dort aus Plattformen. terrainHeight() liefert im Inneren deshalb die
  // Höhe des Bergs ÜBER der Höhle — Tiere würden im Fels schweben. Die Felder
  // floorBaseY/floorOriginZ sind reine Daten und überleben so Save/Load & Koop.
  caveFloorY(x, z) {
    const bounds = this.caveBounds;
    if (!bounds || bounds.floorBaseY == null) return null;
    if (x < bounds.minX - 1.2 || x > bounds.maxX + 1.2) return null;
    if (z < bounds.minZ - 1 || z > bounds.maxZ + 1) return null;
    return bounds.floorBaseY + dryCaveFloorY(z - bounds.floorOriginZ) + 0.12;
  }

  // --- Koop-Gast: vom Host empfangenen Zielzustand übernehmen bzw. anzeigen ---
  applyNet(x, z, ry, hp, state) {
    this.netX = x; this.netZ = z; this.netRy = ry;
    this.hp = hp; this.state = state;
  }

  updateRemote(dt) {
    if (this.netX == null) return;
    const p = this.pos;
    const prevX = p.x, prevZ = p.z;
    const k = Math.min(1, dt * 10);
    p.x += (this.netX - p.x) * k;
    p.z += (this.netZ - p.z) * k;
    const caveFloor = this.caveFloorY(p.x, p.z);
    p.y = (caveFloor != null ? caveFloor : terrainHeight(p.x, p.z))+(this.groundOffset||0);
    const moved = Math.hypot(p.x - prevX, p.z - prevZ);
    this.moving = moved > 0.003;
    let dr = this.netRy - this.group.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    this.group.rotation.y += dr * Math.min(1, dt * 8);
    // Leichte Beinanimation abhängig von der Bewegung.
    this.phase += dt * (this.moving ? 11 : 1.5);
    const swing = this.moving ? Math.sin(this.phase) * 0.5 : 0;
    this.legs.forEach((leg, i) => {
      if (leg?.userData.restRotation) leg.rotation.x = leg.userData.restRotation.x + swing * (i % 2 ? -1 : 1);
    });
  }

  pickWander(now) {
    // Flusstiere patrouillieren ihren Lauf, statt ins Umland zu wandern. Ohne
    // das driften sie über die Ufer ab und der Fluss wäre bald leer.
    if (this.def.aquatic) {
      const p = this.group.position;
      const anchorX = this.lastWaterX ?? p.x, anchorZ = this.lastWaterZ ?? p.z;
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 3 + Math.random() * 22;
        const tx = anchorX + Math.cos(a) * d;
        const tz = anchorZ + Math.sin(a) * d;
        if (riverInfluence(tx, tz) > .45) {
          this.target.set(tx, tz);
          this.retargetAt = now + 3 + Math.random() * 5;
          return;
        }
      }
      this.target.set(anchorX, anchorZ);
      this.retargetAt = now + 2 + Math.random() * 3;
      return;
    }
    if (this.caveBounds) {
      this.target.set(
        THREE.MathUtils.lerp(this.caveBounds.minX, this.caveBounds.maxX, Math.random()),
        THREE.MathUtils.lerp(this.caveBounds.minZ, this.caveBounds.maxZ, Math.random()),
      );
      this.retargetAt = now + 2.5 + Math.random() * 4;
      return;
    }
    if(this.territoryRadius&&Number.isFinite(this.homeX)&&Number.isFinite(this.homeZ)){
      const a=Math.random()*Math.PI*2,d=4+Math.random()*(this.territoryRadius-4);
      this.target.set(this.homeX+Math.cos(a)*d,this.homeZ+Math.sin(a)*d);
      this.retargetAt=now+3+Math.random()*5;
      return;
    }
    // Nur Ziele auf trockenem Land wählen, damit Tiere nicht ständig am Ufer
    // auf ein unerreichbares Ziel zulaufen.
    for (let attempt = 0; attempt < 20; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = 5 + Math.random() * 14;
      const tx = THREE.MathUtils.clamp(this.pos.x + Math.cos(a) * d, -WORLD_RADIUS + 10, WORLD_RADIUS - 10);
      const tz = THREE.MathUtils.clamp(this.pos.z + Math.sin(a) * d, -WORLD_RADIUS + 10, WORLD_RADIUS - 10);
      if (terrainHeight(tx, tz) >= WATER_Y + 0.15) {
        this.target.set(tx, tz);
        break;
      }
    }
    this.retargetAt = now + 3 + Math.random() * 5;
  }

  update(dt, ctx) {
    const now = ctx.time;
    this.siegeCd=Math.max(0,(this.siegeCd||0)-dt);
    this.biteCd=Math.max(0,(this.biteCd||0)-dt);
    const p = this.pos;
    // Im Koop simuliert nur der Host die Tier-KI. Er kennt aber beide Spieler:
    // Jedes Tier reagiert deshalb auf den jeweils nächstgelegenen aktiven
    // Spieler, statt grundsätzlich nur den Host wahrzunehmen.
    const candidates = Array.isArray(ctx.players)
      ? ctx.players
      : [{ pos: ctx.playerPos, yaw: ctx.playerYaw, level: ctx.playerLevel, hurt: ctx.hurtPlayer, local: true }];
    let perceivedPlayer = null;
    let dp = Infinity;
    for (const candidate of candidates) {
      if (!candidate?.pos) continue;
      const distance = Math.hypot(candidate.pos.x - p.x, candidate.pos.z - p.z);
      if (distance < dp) { dp = distance; perceivedPlayer = candidate; }
    }
    const playerPos = perceivedPlayer?.pos || ctx.playerPos;
    const playerYaw = perceivedPlayer?.yaw ?? ctx.playerYaw;
    const playerLevel = perceivedPlayer?.level ?? ctx.playerLevel;
    const hurtPlayer = perceivedPlayer?.hurt || ctx.hurtPlayer;
    const aquaticInWater = this.def.aquatic && terrainHeight(p.x, p.z) <= WATER_Y - .1;
    if (aquaticInWater) {
      // Jede Position im Wasser ist ein gültiger Rückzugspunkt. Sobald das
      // Krokodil den Fluss wieder erreicht, beginnt es erneut zu patrouillieren.
      this.lastWaterX = p.x;
      this.lastWaterZ = p.z;
      this.returningToWater = false;
    }
    let speed = 0;
    let dirX = 0, dirZ = 0;
    let faceX = 0, faceZ = 0;
    this.fireStalking = false;

    // Ein abziehendes Rudel jagt nicht mehr. Der Rückzug hat Vorrang vor der
    // gesamten Aggro-Logik, sonst würde die Aggro sofort neu greifen, sobald
    // der Spieler in Reichweite bleibt.
    if (this.retreating) {
      this.aggro = false;
      // Grundrichtung: vom nächsten Spieler weg.
      const wegX = p.x - playerPos.x, wegZ = p.z - playerPos.z;
      const laenge = Math.hypot(wegX, wegZ);
      const grund = laenge > .001 ? Math.atan2(wegX, wegZ) : this.group.rotation.y;
      // Geradeaus weg führt oft ins Wasser oder gegen einen Felsen. Ohne
      // Ausweichen drückt der Wolf dauerhaft gegen die Sperre und bleibt
      // sichtbar stehen, statt sich zurückzuziehen.
      //
      // Der Fächer prüft dieselbe Bedingung wie der Bewegungscode weiter
      // unten (Uferlinie bei WATER_Y + 0.15) und auf Schrittweite, nicht auf
      // Fernsicht: Eine Richtung, die drei Meter weiter wieder an Land führt,
      // nützt nichts, wenn schon der nächste Schritt im Wasser endet. Der
      // Sweep geht über volle 360°, damit auf einer Landzunge immer ein
      // Ausweg gefunden wird — notfalls zurück am Spieler vorbei.
      const begehbar = (winkel) => {
        const sx = Math.sin(winkel), sz = Math.cos(winkel);
        for (const weite of [1.1, 2.6]) {
          const tx = p.x + sx * weite, tz = p.z + sz * weite;
          if (terrainHeight(tx, tz) < WATER_Y + .15) return false;
          if (ctx.animalObstacles?.some((o) => Math.hypot(tx - o.x, tz - o.z) < o.r + .45)) return false;
        }
        return true;
      };

      // Einmal gewählte Richtung wird beibehalten. Ohne dieses Festhalten
      // wird jeden Frame neu entschieden, der Fächer kippt zwischen links- und
      // rechtsherum, und der Wolf tritt im Wald auf der Stelle statt abzuziehen.
      if (this.retreatHeading == null || !begehbar(this.retreatHeading)) {
        let gewaehlt = null;
        for (let i = 0; i < 16 && gewaehlt == null; i++) {
          // 0, +22°, -22°, +45°, -45° … bis ±180°: Weg vom Spieler wird
          // zuerst geprüft, seitlich erst danach.
          const versatz = Math.ceil(i / 2) * (i % 2 ? 1 : -1) * (Math.PI / 8);
          if (begehbar(grund + versatz)) gewaehlt = grund + versatz;
        }
        // Steht der Wolf komplett fest (etwa auf einer überfluteten Insel),
        // übernimmt die Zeitgrenze in updateRaidRetreat.
        this.retreatHeading = gewaehlt ?? grund;
      }
      dirX = Math.sin(this.retreatHeading); dirZ = Math.cos(this.retreatHeading);
      faceX = dirX; faceZ = dirZ;
      // Zügiger Trab statt voller Jagdgeschwindigkeit: Es ist ein Abziehen,
      // keine Panikflucht.
      speed = (this.def.chase || this.def.walk) * .78;
    } else if (this.def.hostile) {
      if (!perceivedPlayer) this.aggro = false;
      const threat = ctx.threat || 1;
      const aggroR = (ctx.night ? this.def.aggroNight : this.def.aggroDay) + (this.kind === 'wolf' ? Math.min(12, threat * 2) : 0) + (this.bossId ? 7 : 0);
      if (!this.aggro && dp < aggroR) {
        this.aggro = true;
        if (dp < 30) {
          const dx = p.x - playerPos.x, dz = p.z - playerPos.z;
          const pan = dp > .001 ? THREE.MathUtils.clamp((dx * Math.cos(playerYaw || 0) - dz * Math.sin(playerYaw || 0)) / dp, -1, 1) : 0;
          if (perceivedPlayer?.chased) perceivedPlayer.chased(this.kind, pan, dp);
          else if (perceivedPlayer?.local !== false) sfx.chaseAlert(this.kind, pan);
        }
      }
      // Nacht-Rudel werden bewusst weiter entfernt erzeugt. Sie behalten die
      // aufgenommene Fährte deshalb über eine größere Distanz.
      const disengageR = this.raidWolf ? 90 : this.bossId ? this.def.disengage+28 : this.def.disengage;
      if (this.aggro && dp > disengageR) {
        this.aggro = false;
        this.navPath.length = 0;
      }
      // Krokodile geben auf, sobald sie sich zu weit vom Wasser entfernen.
      // Das Ufer ist damit eine verlässliche Fluchtoption und der Kampf im
      // Fluss eine bewusste Entscheidung des Spielers, keine Falle.
      if (this.aggro && this.def.aquatic) {
        const dryDistance = this.waterDistance();
        if (dryDistance > this.def.landChaseLimit) {
          this.aggro = false;
          this.navPath.length = 0;
          this.returningToWater = true;
        }
      }
      // Rennt der Spieler aus der allgemeinen Sichtweite, wird die Aggro oben
      // bereits beendet. Ein Krokodil, das dann an Land steht, muss trotzdem
      // explizit zum Fluss zurückkehren und darf dort nicht einfrieren.
      if (this.def.aquatic && !this.aggro && !aquaticInWater && this.lastWaterX != null) {
        this.returningToWater = true;
      }

      if (this.aggro) {
        // Feuer meiden. Befindet sich der Spieler im Lichtkreis, laufen Wölfe
        // und Bären am Rand langsam auf und ab, statt dort einzufrieren.
        let nearFire = null;
        for (const f of this.def.fireFear && !this.caveBounds ? ctx.fires : []) {
          const df = Math.hypot(f.x - p.x, f.z - p.z);
          const playerAtFire = Math.hypot(f.x - playerPos.x, f.z - playerPos.z) < 7.5;
          if ((df < 7.6 || (playerAtFire && df < 15)) && (!nearFire || df < nearFire.distance)) nearFire = { ...f, distance: df };
        }
        if (nearFire) {
          const df = nearFire.distance || 1;
          const radialX = (p.x - nearFire.x) / df;
          const radialZ = (p.z - nearFire.z) / df;
          if (now >= this.fireProwlUntil) {
            if (Math.random() < .62) this.fireProwlDir *= -1;
            this.fireProwlUntil = now + 2.8 + Math.random() * 4.2;
          }
          // Tangentiale Bewegung plus sanfte Korrektur auf einen sicheren Ring.
          // Innerhalb des Rings dominiert die Fluchtbewegung nach außen.
          const safeRadius = 9.6;
          const correction = THREE.MathUtils.clamp((safeRadius - df) * .48, -.42, 1.15);
          dirX = -radialZ * this.fireProwlDir + radialX * correction;
          dirZ = radialX * this.fireProwlDir + radialZ * correction;
          speed = this.def.walk * (df < 7.4 ? 1.35 : .82);
          this.fireStalking = true;
          // Beim seitlichen Pirschen bleibt der Blick auf Spieler und Feuer.
          faceX = playerPos.x - p.x;
          faceZ = playerPos.z - p.z;
        } else {
          dirX = playerPos.x - p.x;
          dirZ = playerPos.z - p.z;
          let navigating = false;
          if (this.kind === 'wolf') {
            // Ein bewegtes Ziel macht den alten Weg ungültig. Nahe erreichte
            // Wegpunkte werden fortlaufend entfernt, bis der Wolf wieder freie
            // Sicht auf sein eigentliches Ziel hat.
            if (Math.hypot(playerPos.x - this.navTargetX, playerPos.z - this.navTargetZ) > 4) this.navPath.length = 0;
            while (this.navPath.length && Math.hypot(p.x - this.navPath[0].x, p.z - this.navPath[0].z) < .68) this.navPath.shift();
            if (!this.navPath.length) this.navRepathAt = 0;
            if (this.navPath.length) {
              dirX = this.navPath[0].x - p.x;
              dirZ = this.navPath[0].z - p.z;
              navigating = true;
            }
          }
          // Liegt zwischen Tier und Spieler eine Zaunseite, wird ein offenes
          // Wildtor als echter Durchgang angesteuert. Ohne diese kleine
          // Navigation blieb die direkte Verfolgung oft am Nachbarsegment
          // hängen, obwohl die Torkollision bereits korrekt entfernt war.
          let passage=null,passageScore=Infinity;
          for(const gate of ctx.openGates||[]){
            const normalX=Math.sin(gate.rot),normalZ=Math.cos(gate.rot);
            const animalSide=(p.x-gate.x)*normalX+(p.z-gate.z)*normalZ;
            const playerSide=(playerPos.x-gate.x)*normalX+(playerPos.z-gate.z)*normalZ;
            if(animalSide*playerSide>=-.35)continue;
            const animalDistance=Math.hypot(p.x-gate.x,p.z-gate.z);
            const playerDistance=Math.hypot(playerPos.x-gate.x,playerPos.z-gate.z);
            const score=animalDistance+playerDistance*.45;
            if(animalDistance<48&&playerDistance<34&&score<passageScore){passage=gate;passageScore=score;}
          }
          if(!navigating&&passage&&Math.hypot(p.x-passage.x,p.z-passage.z)>1.05){
            dirX=passage.x-p.x;dirZ=passage.z-p.z;
          }
          const enraged=this.bossId&&this.hp/this.maxHp<.45;
          speed = this.def.chase * Math.min(1.35, 0.94 + threat * 0.06)*(enraged?1.18:1);
          // Große Tiere stoppen mit ihrem Körper vor dem Spieler, statt mit dem
          // Gruppenmittelpunkt bis in die Kamera zu laufen.
          if (dp <= (this.def.contactR || 1.55)) speed = 0;
          // Spieler am Feuer? Dann Abstand halten
          for (const f of this.def.fireFear && !this.caveBounds ? ctx.fires : []) {
            if (Math.hypot(f.x - playerPos.x, f.z - playerPos.z) < 6 && dp < 9) {
              speed = 0;
              break;
            }
          }
          // Tiere können einen Spieler auf einer hohen Plattform nicht durch
          // den Boden hindurch beißen. Der horizontale Abstand allein reichte
          // zuvor aus, selbst wenn mehrere Meter Höhe dazwischenlagen.
          const verticalDistance=Math.abs((playerPos.y??p.y)-p.y);
          const barrierBetween=(ctx.animalObstacles||[]).some((obstacle)=>{
            const vx=playerPos.x-p.x,vz=playerPos.z-p.z,lengthSq=vx*vx+vz*vz||1;
            const t=THREE.MathUtils.clamp(((obstacle.x-p.x)*vx+(obstacle.z-p.z)*vz)/lengthSq,0,1);
            return Math.hypot(obstacle.x-(p.x+vx*t),obstacle.z-(p.z+vz*t))<obstacle.r+.28;
          });
          if (dp < (this.def.attackR || 2) && verticalDistance < 2.05 && !barrierBetween && this.biteCd <= 0) {
            this.biteCd = this.bossId?(enraged?.72:.95):1.2;
            const playerScale = 1 + Math.max(0, (playerLevel || 1) - this.tier) * 0.025;
            hurtPlayer?.(Math.round(this.damage * playerScale * Math.min(1.55, 0.9 + threat * 0.08)), `Ein ${this.def.name} (Stufe ${this.tier}) hat dich erwischt.`, this.def.name);
          }
        }
      } else {
        if (this.def.aquatic && this.returningToWater && this.lastWaterX != null) {
          // Nach dem kurzen Landangriff nicht stehenbleiben, sondern zügig zu
          // dem zuletzt berührten Wasserpunkt zurückkriechen.
          dirX = this.lastWaterX - p.x;
          dirZ = this.lastWaterZ - p.z;
          speed = Math.hypot(dirX, dirZ) > .55 ? this.def.chase * .52 : 0;
        } else {
          if (now > this.retargetAt) this.pickWander(now);
          dirX = this.target.x - p.x; dirZ = this.target.y - p.z;
          speed = Math.hypot(dirX, dirZ) > 1 ? this.def.walk : 0;
        }
      }
    } else {
      // Beutetiere: fliehen wenn Spieler nah
      if (!perceivedPlayer && this.state === 'flee') this.state = 'wander';
      if (perceivedPlayer && (dp < this.def.fleeR || this.state === 'flee')) {
        this.state = dp > this.def.fleeR + 7 ? 'wander' : 'flee';
      }
      if (this.state === 'flee') {
        dirX = p.x - playerPos.x;
        dirZ = p.z - playerPos.z;
        speed = this.def.flee;
      } else {
        if (now > this.retargetAt) this.pickWander(now);
        dirX = this.target.x - p.x; dirZ = this.target.y - p.z;
        speed = Math.hypot(dirX, dirZ) > 1 ? this.def.walk : 0;
      }
    }

    // Harte Sicherheitsauflösung auch dann, wenn das Tier bereits steht oder der
    // Spieler selbst hineinläuft. So kann kein einzelner Frame den Bären in der
    // First-Person-Kamera festsetzen.
    if (this.def.hostile && this.aggro) {
      const minDist = this.def.contactR || 1.55;
      if (dp < minDist) {
        let awayX = p.x - playerPos.x;
        let awayZ = p.z - playerPos.z;
        const awayLen = Math.hypot(awayX, awayZ);
        if (awayLen < 0.001) { awayX = -Math.sin(playerYaw || 0); awayZ = -Math.cos(playerYaw || 0); }
        else { awayX /= awayLen; awayZ /= awayLen; }
        p.x = playerPos.x + awayX * minDist;
        p.z = playerPos.z + awayZ * minDist;
      }
      if (speed === 0) this.group.rotation.y = Math.atan2(dirX, dirZ);
    }

    this.moving = speed > 0.1;
    if (this.moving) {
      // Der explosive Antritt findet im Wasser statt. An Land bleibt das Tier
      // bedrohlich, ist aber deutlich langsamer und lässt sich abschütteln.
      if (this.def.aquatic && terrainHeight(p.x, p.z) > WATER_Y - .1) speed *= .6;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len; dirZ /= len;
      let nx = p.x + dirX * speed * dt;
      let nz = p.z + dirZ * speed * dt;

      // Wölfe dürfen angreifen, aber nicht in den Körper des Spielers laufen.
      if (this.def.hostile) {
        let px = nx - playerPos.x;
        let pz = nz - playerPos.z;
        let playerDist = Math.hypot(px, pz);
        const minPlayerDist = this.def.contactR || 1.55;
        if (playerDist < minPlayerDist) {
          if (playerDist < 0.001) {
            px = -dirX || 1;
            pz = -dirZ || 0;
            playerDist = Math.hypot(px, pz);
          }
          nx = playerPos.x + (px / playerDist) * minPlayerDist;
          nz = playerPos.z + (pz / playerDist) * minPlayerDist;
        }
      }
      nx = THREE.MathUtils.clamp(nx, -WORLD_RADIUS + 6, WORLD_RADIUS - 6);
      nz = THREE.MathUtils.clamp(nz, -WORLD_RADIUS + 6, WORLD_RADIUS - 6);
      // Alle Landtiere bleiben an der Uferlinie stehen.
      const nh = terrainHeight(nx, nz);
      const blockingObstacle = ctx.animalObstacles?.find((o) => Math.hypot(nx - o.x, nz - o.z) < o.r + 0.42);
      if (blockingObstacle) {
        const wall=blockingObstacle.building;
        // Nur Wölfe belagern nachts normale Holzwände. Steinmauern, Wildtore
        // und alle übrigen Bauten bleiben dauerhaft unzerstörbar.
        if(this.kind==='wolf'&&ctx.night&&this.aggro&&wall?.type==='wall'){
          this.group.rotation.y=Math.atan2(wall.x-p.x,wall.z-p.z);
          let routeExists = this.navPath.length > 0;
          const targetMoved = Math.hypot(playerPos.x - this.navTargetX, playerPos.z - this.navTargetZ) > 4;
          if (now >= this.navRepathAt || targetMoved) {
            const route = findPathAroundObstacles(p, playerPos, ctx.animalObstacles || []);
            this.navTargetX = playerPos.x;
            this.navTargetZ = playerPos.z;
            this.navPath = route || [];
            routeExists = this.navPath.length > 0;
            this.navRepathAt = now + (routeExists ? 1.4 : 2.2);
          }
          // Die Wand ist kein Ziel, sondern nur das letzte Mittel: Kratzen
          // beginnt erst, wenn die Suche keinen begehbaren Zugang gefunden hat.
          if(!routeExists&&this.siegeCd<=0){
            this.siegeCd=1.05+Math.random()*.5;
            ctx.damageWoodWall?.(wall,7+Math.min(4,this.tier)*.7,this);
          }
        }
        if (this.fireStalking) {
          this.fireProwlDir *= -1;
          this.fireProwlUntil = now + 2 + Math.random() * 2;
        }
        if (!this.def.hostile || !this.aggro) this.pickWander(now);
        speed = 0;
        this.moving = false;
      } else if (!this.def.aquatic && nh < WATER_Y + 0.15 && this.caveFloorY(nx, nz) == null) {
        // Nur Landtiere werden an der Uferlinie gestoppt. Diese gemeinsame
        // Prüfung blockierte zuvor aus Versehen jeden Schritt der Krokodile.
        this.pickWander(now);
        speed = 0;
        this.moving = false;
      } else if (this.def.aquatic && nh >= WATER_Y + .15 && !this.aggro && !this.returningToWater) {
        // Beim normalen Patrouillieren bleiben Krokodile im Fluss. Trockenes
        // Land betreten sie nur für einen Angriff oder auf dem Rückweg.
        this.pickWander(now);
        speed = 0;
        this.moving = false;
      } else {
        p.x = nx; p.z = nz;
        this.group.rotation.y = this.fireStalking
          ? Math.atan2(faceX, faceZ)
          : Math.atan2(dirX, dirZ);
      }
    }

    this.phase += dt * (this.moving ? 10 : 2);
    const caveFloor = this.caveFloorY(p.x, p.z);
    // Flusstiere treiben dicht unter der Oberfläche, damit Rücken und Augen
    // sichtbar bleiben — ohne das säßen sie unsichtbar auf dem Flussbett.
    const floatLevel = this.def.aquatic ? WATER_Y - .28 : WATER_Y - 0.4;
    const ground = caveFloor != null ? caveFloor : Math.max(terrainHeight(p.x, p.z), floatLevel);
    const hop = this.moving ? Math.abs(Math.sin(this.phase)) * this.def.hop : 0;
    p.y = ground+(this.groundOffset||0)+hop;

    // Niedrig aufgelöste Modelle gewinnen besonders stark durch klare Posen.
    // Diagonaler Vierbein-Gang, ein minimales Schulterwippen und voneinander
    // unabhängige Kopf-/Ohrbewegungen vermitteln Gewicht ohne Skelettsystem.
    const animBlend = Math.min(1, dt * 12);
    const strideAmount = this.kind === 'hase' ? .82 : this.kind === 'hirsch' ? .5 : this.kind === 'baer' ? .34 : .43;
    const stride = this.moving ? Math.sin(this.phase) * strideAmount : 0;
    this.legs.forEach((leg, i) => {
      const rest = leg.userData.restRotation?.x || 0;
      const sign = leg.userData.strideSign || (i % 2 ? -1 : 1);
      const target = rest + sign * stride;
      leg.rotation.x += (target - leg.rotation.x) * animBlend;
    });

    if (this.body) {
      const rest = this.body.userData.restPosition;
      const restRot = this.body.userData.restRotation;
      const lift = this.moving ? Math.abs(Math.sin(this.phase)) * (this.kind === 'hase' ? .045 : .018) : Math.sin(this.phase * .35) * .009;
      this.body.position.y = rest.y + lift;
      this.body.rotation.z = restRot.z + (this.moving ? Math.sin(this.phase) * .018 : 0);
    }
    if (this.neck) {
      const rest = this.neck.userData.restRotation;
      this.neck.rotation.x = rest.x + Math.sin(this.phase * .48) * (this.moving ? .025 : .045);
    }
    if (this.head) {
      const rest = this.head.userData.restRotation;
      const hostilePosture = this.aggro && this.def.hostile ? .065 : 0;
      // Direkt nach einem Biss schnellt der Kopf kurz hoch. Das macht den
      // Treffer beim flachen Krokodilmodell auch ohne Skelett/Jaw-Rig lesbar.
      const biteSnap = this.kind === 'krokodil' && this.biteCd > .78
        ? Math.sin(THREE.MathUtils.clamp((1.2 - this.biteCd) / .42, 0, 1) * Math.PI) * .16
        : 0;
      this.head.rotation.x = rest.x + hostilePosture + biteSnap + Math.sin(this.phase * .45) * (this.moving ? .025 : .045);
      this.head.rotation.y = rest.y + (!this.moving ? Math.sin(this.phase * .17) * .075 : 0);
    }
    if (this.tail) {
      const rest = this.tail.userData.restRotation;
      const wag = this.kind === 'krokodil'
        ? (this.moving ? (aquaticInWater ? .38 : .16) : .045)
        : this.kind === 'wolf' ? (this.aggro ? .2 : .09)
          : this.kind === 'hase' ? .045 : .07;
      this.tail.rotation.y = rest.y + Math.sin(this.phase * .72) * wag;
    }
    this.ears.forEach((ear, i) => {
      const rest = ear.userData.restRotation;
      const twitch = Math.sin(this.phase * .23 + i * 1.7) * (!this.moving ? .035 : .012);
      ear.rotation.z = rest.z + twitch;
    });

  }
}

export class Animals {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.list = [];
    this.respawnQueue = [];
    this.nextId = 1;
    this.difficultyLevel = 1;
    this.bossCooldowns = new Map();
    // Render-Sichtweite; die adaptive Qualitätsregelung darf sie absenken.
    this.viewDistance = 285;
    // remote = true: Koop-Gast, der nur die vom Host gestreamten Tiere als
    // Puppets darstellt und keine eigene KI/Respawns rechnet.
    this.remote = false;
    for (const [kind, count] of Object.entries(COUNTS)) {
      for (let i = 0; i < count; i++) this.spawn(kind);
    }
  }

  // Wechselt zwischen lokaler Simulation (Singleplayer/Host) und Remote-Puppets
  // (Koop-Gast). Beim Wechsel wird der Tierbestand passend zurückgesetzt.
  setRemote(remote) {
    if (this.remote === remote && !remote) return false;
    for (const a of this.list) this.group.remove(a.group);
    this.list.length = 0;
    this.respawnQueue.length = 0;
    this.remote = remote;
    if (!remote) this.resetLocal();
    return true;
  }

  resetLocal() {
    for (const a of this.list) this.group.remove(a.group);
    this.list.length = 0;
    this.respawnQueue.length = 0;
    this.nextId = 1;
    this.difficultyLevel = 1;
    this.bossCooldowns.clear();
    this.remote = false;
    for (const [kind, count] of Object.entries(COUNTS)) {
      for (let i = 0; i < count; i++) this.spawn(kind);
    }
  }

  // Kompakter Zustand aller Tiere für die Übertragung an den Mitspieler (Host).
  serialize() {
    return this.list.map((a) => ({
      id: a.id, k: a.kind, t: a.tier,
      b:a.bossId||null,bn:a.bossTitle||null,bs:a.bossScale||null,bc:a.bossColor||null,
      x: Math.round(a.pos.x * 100) / 100,
      z: Math.round(a.pos.z * 100) / 100,
      r: Math.round(a.group.rotation.y * 100) / 100,
      hp: a.hp, mh: a.maxHp, st: a.state, ag: a.aggro ? 1 : 0,
    }));
  }

  // Gleicht den Puppet-Bestand des Gasts mit dem Host-Snapshot ab.
  applySnapshot(list) {
    if (!this.remote || !Array.isArray(list)) return;
    const seen = new Set();
    const byId = new Map(this.list.map((a) => [a.id, a]));
    for (const s of list) {
      seen.add(s.id);
      let a = byId.get(s.id);
      if (!a) {
        a = this.spawnAt(s.k, s.x, s.z, { id:s.id,tier:s.t,bossId:s.b,bossTitle:s.bn,bossScale:s.bs,bossColor:s.bc,remoteBoss:!!s.b });
      }
      a.maxHp = s.mh;
      a.applyNet(s.x, s.z, s.r, s.hp, s.st);
      a.aggro = !!s.ag;
    }
    for (const a of [...this.list]) {
      if (!seen.has(a.id)) {
        this.group.remove(a.group);
        this.list.splice(this.list.indexOf(a), 1);
      }
    }
  }

  // Krokodile leben ausschließlich in den Flüssen des Außengürtels. Der
  // normale randomSpot verwirft alles unter 0,6 m Höhe und würde ein Flusstier
  // daher nie platzieren — deshalb ein eigener Sampler entlang der Läufe.
  riverSpot(avoidPositions = []) {
    if (!CROCODILE_RIVERS.length) return null;
    for (let i = 0; i < 60; i++) {
      const river = CROCODILE_RIVERS[Math.floor(Math.random() * CROCODILE_RIVERS.length)];
      const segment = 1 + Math.floor(Math.random() * (river.path.length - 1));
      const a = river.path[segment - 1], b = river.path[segment];
      const t = Math.random();
      // Leichter Querversatz verteilt die Tiere über die Flussbreite, bleibt
      // aber innerhalb der schwimmtiefen Mitte.
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const length = Math.hypot(dx, dz) || 1;
      const offset = (Math.random() - .5) * 4.2;
      const x = a[0] + dx * t - (dz / length) * offset;
      const z = a[1] + dz * t + (dx / length) * offset;
      if (Math.hypot(x - river.ford.x, z - river.ford.z) < 18) continue;
      if (avoidPositions.some((pos) => pos && Math.hypot(x - pos.x, z - pos.z) < 55)) continue;
      const bed = terrainHeight(x, z);
      // Zu flach ist Ufer, zu tief ist offenes Meer. Nur das ausgehobene
      // Flussbett (rund -1,5 m) ist Krokodil-Revier — sonst treiben sie dort,
      // wo ein Fluss in die See mündet, weit draußen im Wasser.
      if (bed > WATER_Y - .45 || bed < -2.6) continue;
      return { x, z };
    }
    return null;
  }

  randomSpot(minDistFromOrigin = 20, kind = null, avoidPositions = []) {
    const minPlayerDistance = ['wolf', 'wildschwein', 'baer'].includes(kind) ? 50 : 32;
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 2 * (WORLD_RADIUS - 20);
      const z = (Math.random() - 0.5) * 2 * (WORLD_RADIUS - 20);
      if (Math.hypot(x, z) < minDistFromOrigin) continue;
      if (avoidPositions.some((pos) => pos && Math.hypot(x - pos.x, z - pos.z) < minPlayerDistance)) continue;
      const h = terrainHeight(x, z);
      if (h <= 0.6) continue;
      if (kind === 'baer' && h < 5.2) continue;
      if (kind === 'wildschwein' && (h < 0.9 || h > 7.5)) continue;
      return { x, z };
    }
    // Lieber einen Respawn auslassen als ein Tier sichtbar direkt neben einem
    // Spieler oder auf ungeeignetem Gelände erscheinen lassen.
    return null;
  }

  spawn(kind, avoidPositions = []) {
    const s = kind === 'krokodil'
      ? this.riverSpot(avoidPositions)
      : this.randomSpot(['wolf', 'baer'].includes(kind) ? 45 : 22, kind, avoidPositions);
    return s ? this.spawnAt(kind, s.x, s.z) : null;
  }

  spawnAt(kind, x, z, options = {}) {
    const a = new Animal(kind, x, z);
    Object.assign(a, options);
    if(options.bossId){
      a.healthMultiplier=options.healthMultiplier||a.healthMultiplier||3.25;
      a.damageMultiplier=options.damageMultiplier||a.damageMultiplier||1.16;
      a.bossTitle=options.bossTitle||a.bossTitle||'Altes Raubtier';
      a.trackingTitle=a.bossTitle;
      a.bossScale=options.bossScale||a.bossScale||1.45;
      a.bossColor=options.bossColor||a.bossColor||0xe8c477;
      a.group.scale.multiplyScalar(a.bossScale);
      const aura=new THREE.Mesh(BOSS_RING_GEO,new THREE.MeshBasicMaterial({
        color:a.bossColor,transparent:true,opacity:.24,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,
      }));
      aura.rotation.x=-Math.PI/2;aura.position.y=.045;aura.userData.bossAura=true;a.group.add(aura);a.bossAura=aura;
    }
    if(options.tier!=null)a.setTier(options.tier,true);
    else if(a.def.hostile){
      const minimum=Math.min(9,1+Math.floor(((this.difficultyLevel||1)-1)*.68));
      a.setTier(Math.max(a.tier,minimum),true);
    }
    a.refreshGroundOffset();
    const spawnFloor=a.caveFloorY(x,z);
    // Dieselbe Schwimmhöhe wie im Update. Ohne das säßen frisch erzeugte
    // Flusstiere bis zum ersten Nah-Update auf dem Grund und poppten dann
    // sichtbar nach oben.
    const spawnGround=spawnFloor!=null?spawnFloor
      :Math.max(terrainHeight(x,z),a.def.aquatic?WATER_Y-.28:WATER_Y-.4);
    a.group.position.y=spawnGround+(a.groundOffset||0);
    if (a.id == null) a.id = this.nextId++;
    this.group.add(a.group);
    this.list.push(a);
    return a;
  }

  spawnNear(kind, center, minRadius = 24, maxRadius = 36, options = {}) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = minRadius + Math.random() * (maxRadius - minRadius);
      const x = THREE.MathUtils.clamp(center.x + Math.cos(a) * d, -WORLD_RADIUS + 8, WORLD_RADIUS - 8);
      const z = THREE.MathUtils.clamp(center.z + Math.sin(a) * d, -WORLD_RADIUS + 8, WORLD_RADIUS - 8);
      if (Math.hypot(x - center.x, z - center.z) < minRadius) continue;
      if (terrainHeight(x, z) > WATER_Y + 0.2) {
        return this.spawnAt(kind, x, z, options);
      }
    }
    return null;
  }

  // Rückgabe: { killed, drops, name, hp, maxHp }
  hit(animal, dmg, fromDir) {
    animal.hp -= dmg;
    this.effects.burst(animal.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xc0392b, 8, 3);

    if (animal.def.hostile) animal.aggro = true;
    else animal.state = 'flee';

    // Rückstoß
    animal.pos.x += fromDir.x * 0.9;
    animal.pos.z += fromDir.z * 0.9;

    if (animal.hp <= 0) {
      const drops = animal.bossDrops ? {...animal.bossDrops} : animal.def.drops(animal.tier);
      this.group.remove(animal.group);
      this.list.splice(this.list.indexOf(animal), 1);
      // Nacht-Rudel sind eine zeitlich begrenzte Bedrohung. Sie werden nicht
      // zusätzlich als normale Wildpopulation wiedergeboren.
      if(animal.bossId)this.bossCooldowns.set(animal.bossId,performance.now()/1000+420);
      else if (!animal.raidWolf) {
        this.respawnQueue.push({
          kind: animal.kind,
          at: performance.now() / 1000 + 70 + Math.random() * 40,
          caveBounds: animal.caveBounds || null,
          home: animal.caveBounds ? { x: animal.homeX, z: animal.homeZ } : null,
        });
      }
      const baseXP = { hase: 8, hirsch: 16, wolf: 28, wildschwein: 34, baer: 60, krokodil: 52 }[animal.kind] || 12;
      return { killed:true,drops,name:animal.bossTitle||animal.def.name,xp:Math.round(baseXP*(1+(animal.tier-1)*.18)*(animal.bossId?3:1)),tier:animal.tier,bossId:animal.bossId||null };
    }
    return { killed:false,drops:null,name:animal.bossTitle||animal.def.name,hp:animal.hp,maxHp:animal.maxHp,tier:animal.tier,bossId:animal.bossId||null };
  }

  updateDifficulty(level, playerPositions = []) {
    const next=Math.max(1,Math.floor(Number(level)||1));
    if(next!==this.difficultyLevel){
      this.difficultyLevel=next;
      const minimum=Math.min(9,1+Math.floor((next-1)*.68));
      for(const animal of this.list){
        if(animal.def.hostile&&!animal.bossId)animal.setTier(Math.max(animal.tier,minimum),true);
      }
    }
    const now=performance.now()/1000;
    for(const site of BOSS_SITES){
      if(next<site.level||this.list.some(a=>a.bossId===site.id)||(this.bossCooldowns.get(site.id)||0)>now)continue;
      if(playerPositions.some(pos=>pos&&Math.hypot(pos.x-site.x,pos.z-site.z)<80))continue;
      const tier=Math.max(site.tier,Math.min(12,1+Math.floor(next*.75)));
      this.spawnAt(site.kind,site.x,site.z,{
        bossId:site.id,bossTitle:site.title,bossScale:site.scale,bossColor:site.color,
        healthMultiplier:site.hp,damageMultiplier:site.damage,bossDrops:site.drops,
        tier,homeX:site.x,homeZ:site.z,territoryRadius:34,
      });
    }
  }

  // Bei Tagesanbruch bricht das Rudel die Jagd ab, statt aus der Szene zu
  // verschwinden. Entfernt werden die Wölfe erst, wenn sie weit weg UND außer
  // Sicht sind — siehe updateRaidRetreat. Vorher poppten sie mitten im Bild weg.
  beginRaidRetreat() {
    let abgebrochen = 0;
    for (const animal of this.list) {
      if (!animal.raidWolf || animal.retreating) continue;
      animal.retreating = true;
      animal.retreatSince = performance.now() / 1000;
      animal.aggro = false;
      animal.navPath.length = 0;
      animal.retargetAt = 0;
      abgebrochen++;
    }
    return abgebrochen;
  }

  // Räumt zurückgezogene Wölfe ab, sobald sie niemand mehr sehen kann.
  //
  // Reine Entfernung genügt dafür nicht: Tiere werden bis viewDistance (285 m)
  // gerendert. Ein Wolf würde also auch auf 130 m noch sichtbar verschwinden —
  // genau der Effekt, der behoben werden soll. Deshalb zählt zusätzlich die
  // Blickrichtung: Hinter dem Rücken darf er sofort gehen, im Blickfeld erst
  // jenseits der Renderweite.
  updateRaidRetreat(viewers = []) {
    for (const animal of [...this.list]) {
      if (!animal.retreating) continue;
      const p = animal.group.position;
      let beobachtet = false;
      for (const v of viewers) {
        if (!v?.pos) continue;
        const dx = p.x - v.pos.x, dz = p.z - v.pos.z;
        const abstand = Math.hypot(dx, dz);
        if (abstand > this.viewDistance + 20) continue;
        if (abstand < 55) { beobachtet = true; break; }
        // Blickrichtung des Spielers ist (-sin yaw, -cos yaw).
        let relativ = Math.atan2(-dx, -dz) - (v.yaw || 0);
        relativ = Math.atan2(Math.sin(relativ), Math.cos(relativ));
        // Großzügige 75° zu jeder Seite: lieber einen Moment länger warten,
        // als das Verschwinden im Augenwinkel zu zeigen.
        if (Math.abs(relativ) < 1.31) { beobachtet = true; break; }
      }
      // Notbremse: Bleibt ein Wolf am Ufer oder an einer Wand hängen, käme er
      // nie weit genug weg und bliebe sonst dauerhaft als Rudelrest stehen.
      const zuLange = performance.now() / 1000 - (animal.retreatSince || 0) > 150;
      if (beobachtet && !zuLange) continue;
      this.group.remove(animal.group);
      this.list.splice(this.list.indexOf(animal), 1);
    }
  }

  // Beim Laden mitten am Tag dürfen keine Rudelreste zurückbleiben.
  clearRaidWolves() {
    for (const animal of [...this.list]) {
      if (!animal.raidWolf) continue;
      this.group.remove(animal.group);
      this.list.splice(this.list.indexOf(animal), 1);
    }
  }

  update(dt, ctx) {
    // Koop-Gast: keine KI, nur die Host-Puppets weich interpolieren.
    if (this.remote) {
      for (const a of this.list) {
        const dx = a.pos.x - ctx.playerPos.x, dz = a.pos.z - ctx.playerPos.z;
        a.group.visible = dx * dx + dz * dz <= this.viewDistance * this.viewDistance;
        a.updateRemote(dt);
      }
      return;
    }
    this.updateDifficulty(ctx.playerLevel,Array.isArray(ctx.players)?ctx.players.map(entry=>entry?.pos).filter(Boolean):[ctx.playerPos]);
    // Wildschweine verteidigen ihre Rotte gemeinsam.
    for (const a of this.list) if (a.kind === 'wildschwein' && a.aggro) {
      for (const mate of this.list) if (mate.kind === 'wildschwein' && Math.hypot(mate.pos.x-a.pos.x,mate.pos.z-a.pos.z)<11) mate.aggro=true;
    }
    const perceivedPositions = Array.isArray(ctx.players)
      ? ctx.players.map((entry) => entry?.pos).filter(Boolean)
      : [ctx.playerPos];
    for (const a of this.list) {
      const dx = a.pos.x - ctx.playerPos.x, dz = a.pos.z - ctx.playerPos.z;
      const renderDistanceSq = dx * dx + dz * dz;
      let distanceSq = Infinity;
      for (const pos of perceivedPositions) {
        const d = (a.pos.x - pos.x) ** 2 + (a.pos.z - pos.z) ** 2;
        if (d < distanceSq) distanceSq = d;
      }
      // Jenseits des Nebels weder rendern noch die vollständige KI mit der
      // Bildrate takten. Bei Annäherung läuft sie sofort wieder in Echtzeit.
      a.group.visible = renderDistanceSq <= this.viewDistance * this.viewDistance;
      if(a.bossAura){
        a.bossAura.rotation.z+=dt*.42;
        a.bossAura.material.opacity=.18+Math.sin(ctx.time*2+a.id)*.08;
      }
      if (!a.aggro && distanceSq > 190 * 190) {
        a.farUpdateAccum += dt;
        if (a.farUpdateAccum < .2) continue;
        const farDt = Math.min(.25, a.farUpdateAccum);
        a.farUpdateAccum = 0;
        a.update(farDt, ctx);
      } else {
        a.farUpdateAccum = 0;
        a.update(dt, ctx);
      }
    }
    const now = performance.now() / 1000;
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      if (now >= this.respawnQueue[i].at) {
        const entry = this.respawnQueue[i];
        if (entry.caveBounds && entry.home) {
          this.spawnAt(entry.kind, entry.home.x, entry.home.z, {
            caveBounds: entry.caveBounds,
            homeX: entry.home.x,
            homeZ: entry.home.z,
          });
        } else this.spawn(entry.kind, perceivedPositions);
        this.respawnQueue.splice(i, 1);
      }
    }
  }
}
