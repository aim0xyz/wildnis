import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight, terrainSlope, biomeAt, distanceToTrail, WATER_Y, WORLD_RADIUS } from './world.js';
import { fbm, mulberry32 } from './noise.js';
import { toolDamage } from './items.js';

const TRUNK = 0x765039;
const FOLIAGE = [0x397b43, 0x4b8c49, 0x2f6d3c, 0x5c984d];

// Geteilte Geometrien halten die detaillierteren Bäume auch bei mehreren
// hundert Instanzen bezahlbar. Form und Größe entstehen über Skalierung.
const TRUNK_GEO = new THREE.CylinderGeometry(.46, 1, 1, 12, 4);
const BRANCH_GEO = new THREE.CylinderGeometry(.42, 1, 1, 9, 2);
const LEAF_GEO = new THREE.SphereGeometry(1, 14, 10);
const PINE_GEO = new THREE.ConeGeometry(1, 1, 12, 3);
const UP = new THREE.Vector3(0, 1, 0);

// Nachwachszeiten in Sekunden als [Grundwert, Zufallsspanne]. Ein Spieltag
// dauert 660 s (8 min Tag + 3 min Nacht) — die Werte sind daran ausgerichtet.
//
// Holz und Stein wachsen am langsamsten nach. Vorher waren es 80-130 s, also
// rund sechs Ernten pro Spieltag an derselben Stelle; damit lohnte es sich,
// an einem Fleck stehen zu bleiben, statt die Karte zu nutzen. Jetzt dauert
// eine Ernte etwa eine halbe bis dreiviertel Tageslänge.
//
// Nahrung (Beeren, Pilze) wird bewusst nur moderat verlangsamt: Hunger und
// Durst laufen unabhängig weiter, und knappe Nahrung trifft den frühen
// Spielstand härter als den späten.
const REGROW_SECONDS = {
  tree:         [330, 220],   // 5,5 - 9,2 min
  rock:         [330, 220],
  bush:         [115,  75],   // 1,9 - 3,2 min
  mushroom:     [270, 170],
  mushroomCave: [430, 210],
  herb:         [340, 250],
  cache:        [900, 600],   // 15 - 25 min
};

function regrowDelay(kind) {
  const [basis, spanne] = REGROW_SECONDS[kind] || [330, 220];
  return basis + Math.random() * spanne;
}

function angularRockGeometry(variant) {
  let geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    // Pro Variante gleichmäßige, aber nicht kugelförmige Bruchflächen. Die
    // Unterseite wird abgeflacht, damit der Fels satt im Boden steht.
    const fracture = .9 + Math.sin(x * (3.7 + variant) + z * 4.3 + y * 2.1 + variant * 1.9) * .1;
    x *= fracture * (1 + ((variant % 3) - 1) * .055);
    z *= fracture * (1 + (((variant + 1) % 3) - 1) * .05);
    y *= .88 + Math.cos(x * 3.1 - z * 2.7 + variant) * .08;
    y = Math.max(-.54, y);
    position.setXYZ(i, x, y, z);
  }
  position.needsUpdate = true;
  if (geometry.index) geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const ROCK_GEOS = [0, 1, 2, 3].map(angularRockGeometry);
const ROCK_CHIP_GEO = new THREE.DodecahedronGeometry(1, 0);
const ROCK_MOSS_GEO = new THREE.DodecahedronGeometry(.58, 1);
const MUSHROOM_STEM_GEO = new THREE.CylinderGeometry(.055, .075, .34, 7, 1);
const MUSHROOM_CAP_GEO = new THREE.SphereGeometry(.2, 9, 5, 0, Math.PI * 2, 0, Math.PI * .54);
const HERB_LEAF_GEO = new THREE.ConeGeometry(.11, .62, 6, 1);
const CACHE_BODY_GEO = new THREE.BoxGeometry(1.05, .72, .56);
const CACHE_POCKET_GEO = new THREE.BoxGeometry(.72, .38, .2);
const CACHE_STRAP_GEO = new THREE.BoxGeometry(.12, .76, .59);

const MATERIALS = new Map();
function std(color, roughness = 0.96) {
  const key = `${color}-${roughness}`;
  if (!MATERIALS.has(key)) MATERIALS.set(key, new THREE.MeshStandardMaterial({ color, flatShading: false, roughness }));
  return MATERIALS.get(key);
}

const MUSHROOM_FOREST_MAT = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.88 });
const MUSHROOM_CAVE_MAT = new THREE.MeshStandardMaterial({
  vertexColors:true, roughness:.72, emissive:0x2cf2d0, emissiveIntensity:.62,
});

function coloredGeometry(source, transform, color) {
  const geometry=source.clone();geometry.applyMatrix4(transform);
  const rgb=new THREE.Color(color), colors=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<geometry.attributes.position.count;i++)rgb.toArray(colors,i*3);
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  return geometry;
}

function rockMaterial(color) {
  const key = `rock-${color}`;
  if (!MATERIALS.has(key)) {
    MATERIALS.set(key, new THREE.MeshStandardMaterial({ color, roughness: .94, flatShading: true }));
  }
  return MATERIALS.get(key);
}

function foliage(color) {
  const key = `foliage-${color}`;
  if (!MATERIALS.has(key)) {
    MATERIALS.set(key, new THREE.MeshStandardMaterial({
      color, roughness: .9, flatShading: false,
      emissive: color, emissiveIntensity: .045,
    }));
  }
  return MATERIALS.get(key);
}

function branchBetween(start, end, baseRadius, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(BRANCH_GEO, material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
  mesh.scale.set(baseRadius, direction.length(), baseRadius);
  mesh.castShadow = true;
  return mesh;
}

export class Resources {
  constructor(scene, { lowPowerDevice = false } = {}) {
    this.scene = scene;
    this.lowPowerDevice = lowPowerDevice;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.list = [];
    this.obstacles = []; // {x, z, r, res}
    // Kollisionsabfragen sollen nicht bei jeder Bewegung alle Ressourcen der
    // gesamten Karte durchlaufen. Ressourcen sind ortsfest, deshalb reicht ein
    // einmalig beim Spawn aufgebautes, grobes Raumraster.
    this.obstacleCellSize = 24;
    this.obstacleGrid = new Map();
    // Render-Sichtweite; die adaptive Qualitätsregelung darf sie absenken.
    this.viewDistance = 285;
    this.spawnAll();
  }

  spawnAll() {
    const rand = mulberry32(1337);
    const taken = [];
    const findSpot = (minDist, minH, maxH, maxSlope, densityFn, sampler = null) => {
      for (let attempt = 0; attempt < 55; attempt++) {
        let x, z;
        if (sampler) {
          const sample = sampler(rand);
          x = sample.x; z = sample.z;
        } else {
          x = (rand() - 0.5) * 2 * (WORLD_RADIUS - 8);
          z = (rand() - 0.5) * 2 * (WORLD_RADIUS - 8);
        }
        if (Math.hypot(x, z) < 7) continue; // Spawnwiese frei halten
        const h = terrainHeight(x, z);
        if (h < minH || h > maxH || terrainSlope(x, z) > maxSlope) continue;
        if (distanceToTrail(x, z) < 3.1) continue;
        if (densityFn && !densityFn(x, z, rand)) continue;
        let ok = true;
        for (const t of taken) {
          if (Math.hypot(t.x - x, t.z - z) < minDist) { ok = false; break; }
        }
        if (!ok) continue;
        taken.push({ x, z });
        return { x, z, h };
      }
      return null;
    };

    const regionSampler = (cx, cz, radius) => (random) => {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius;
      return { x: cx + Math.cos(angle) * distance, z: cz + Math.sin(angle) * distance };
    };
    const denseForest = (x, z) => biomeAt(x, z).id === 'forest';
    const wildForest = (x, z, random) => biomeAt(x, z).id === 'forest'
      ? random() < .78
      : fbm(x * .02 + 300, z * .02 + 300) > .69;

    // Zwei dicht bestückte, klar begrenzte Waldregionen plus eine kleinere
    // Wildnis-Verteilung. Die Gesamtzahl bleibt nahe am alten Budget, die
    // räumliche Konzentration macht den Wald aber tatsächlich geschlossen.
    // WICHTIG: Anzahl und Reihenfolge der abbaubaren Ressourcen müssen
    // geräteunabhängig sein. Der Koop-World-State synchronisiert Ressourcen per
    // Index – bei unterschiedlicher Anzahl (früher Mobile vs. Desktop) würde
    // beim Abbauen der falsche Baum als gefällt markiert. Daher feste Zahlen;
    // die Performance-Reduktion auf schwachen Geräten passiert nur beim
    // Mesh-Detail (siehe addResource), nicht bei der Platzierung.
    for (const region of [
      { x:95, z:-65, r:94, count:265 },
      { x:-140, z:105, r:82, count:195 },
    ]) {
      const sampler = regionSampler(region.x, region.z, region.r);
      for (let i = 0; i < region.count; i++) {
        const p = findSpot(2.85, 1.35, 9.2, .55, denseForest, sampler);
        if (p) this.addResource('tree', p, rand);
      }
    }
    for (let i = 0; i < 335; i++) {
      const p = findSpot(3.15, 1.35, 9.5, .58, wildForest);
      if (p) this.addResource('tree', p, rand);
    }
    for (let i = 0; i < 290; i++) {
      const p = findSpot(3.5, .55, 36, .92);
      if (p) this.addResource('rock', p, rand);
    }
    for (let i = 0; i < 175; i++) {
      const p = findSpot(4, 1.45, 6.5, .45);
      if (p) this.addResource('bush', p, rand);
    }
    // Sammelbare Pilzgruppen wachsen bewusst nur im Wald. Sie sind echte
    // Ressourcen und nicht Teil der rein dekorativen Bodenbedeckung.
    for (let i = 0; i < 165; i++) {
      const p = findSpot(1.2, .9, 6.2, .46, (x,z)=>biomeAt(x,z).id==='forest');
      if (p) this.addResource('mushroom', p, rand, 'forest');
    }
    // Seltene Leuchtpilze markieren den Weg durch die Schattenhöhle und geben
    // der gefährlichen Expedition einen wiederkehrenden kulinarischen Nutzen.
    for (const [x,z] of [[-441.15,43],[-438.9,40],[-441.05,36],[-439,33],[-441.1,29],[-438.95,26],[-440.8,23]]) {
      this.addResource('mushroom', { x, z, h:terrainHeight(x,z) }, rand, 'cave');
    }

    // Alles ab hier wird bewusst nur angehängt. So behalten ältere
    // Spielstände und Koop-Welten die Indizes aller bisherigen Ressourcen.
    // Die neue äußere Wildnis erhält deutlich mehr nutzbare Vegetation statt
    // bloß neuer Kartenmarker.
    const outerWilds = (x, z) => Math.hypot(x, z) > 455 && Math.hypot(x, z) < WORLD_RADIUS - 22;
    for (let i = 0; i < 190; i++) {
      const p = findSpot(3.2, 1.3, 10.5, .58, (x,z,r)=>outerWilds(x,z) && wildForest(x,z,r));
      if (p) this.addResource('tree', p, rand);
    }
    for (let i = 0; i < 115; i++) {
      const p = findSpot(3.55, .6, 34, .86, outerWilds);
      if (p) this.addResource('rock', p, rand);
    }
    for (let i = 0; i < 75; i++) {
      const p = findSpot(3.7, 1.35, 7.2, .46, outerWilds);
      if (p) this.addResource('bush', p, rand);
    }
    for (let i = 0; i < 65; i++) {
      const p = findSpot(1.35, 1, 7, .48, (x,z)=>outerWilds(x,z) && biomeAt(x,z).id==='forest');
      if (p) this.addResource('mushroom', p, rand, 'forest');
    }

    // Heilpflanzen und verlorene Feldrucksäcke sind unmarkierte, wiederkehrende
    // Entdeckungen. Ein eigener Mindestabstand verhindert sichtbare Reihen.
    const finds = [];
    const findWildernessSpot = (minDist, predicate) => {
      for (let attempt=0; attempt<140; attempt++) {
        const angle=rand()*Math.PI*2;
        const distance=42+Math.sqrt(rand())*(WORLD_RADIUS-70);
        const x=Math.cos(angle)*distance,z=Math.sin(angle)*distance,h=terrainHeight(x,z);
        if(h<1.1||h>15||terrainSlope(x,z)>.52||distanceToTrail(x,z)<2.4||!predicate(x,z,h))continue;
        if(finds.some(p=>Math.hypot(p.x-x,p.z-z)<minDist))continue;
        finds.push({x,z});return{x,z,h};
      }
      return null;
    };
    for(let i=0;i<115;i++){
      const p=findWildernessSpot(8,(x,z)=>biomeAt(x,z).id!=='coast');
      if(p)this.addResource('herb',p,rand);
    }
    for(let i=0;i<42;i++){
      const p=findWildernessSpot(24,(x,z)=>Math.hypot(x,z)>90&&biomeAt(x,z).id!=='coast');
      if(p)this.addResource('cache',p,rand);
    }

    // Nachbewaldung des Außengürtels. Nach der Kartenvergrößerung lag die
    // Baumdichte dort bei 115/km² gegenüber 439/km² im Kern — Holz ist aber
    // das Grundmaterial für Pfeile und Reparaturen, und genau dort stehen die
    // stärksten Gegner. Steine, Büsche und Pilze sind außen bereits dichter
    // als innen und bleiben deshalb unangetastet.
    //
    // Bewusst ANGEHÄNGT statt die Zahlen oben zu erhöhen: Der Koop-World-State
    // und alte Spielstände adressieren Ressourcen über ihren Index. Eine
    // Änderung weiter oben würde in bestehenden Welten die falschen Bäume als
    // gefällt markieren.
    const nachwuchsRing = (x, z) => {
      const d = Math.hypot(x, z);
      return d > 620 && d < WORLD_RADIUS - 25;
    };
    for (let i = 0; i < 640; i++) {
      const p = findSpot(3.25, 1.3, 11, .6, (x, z, r) => nachwuchsRing(x, z) && wildForest(x, z, r));
      if (p) this.addResource('tree', p, rand);
    }
    for (let i = 0; i < 34; i++) {
      const p = findWildernessSpot(9, (x, z) => nachwuchsRing(x, z) && biomeAt(x, z).id !== 'coast');
      if (p) this.addResource('herb', p, rand);
    }

    // Zusätzliche Bestückung wird ausschließlich am Listenende angehängt, damit
    // Ressourcen-Indizes alter Spielstände und laufender Koop-Welten stabil
    // bleiben. Lockere Baumgruppen schließen leere Wiesen, während Felsen und
    // Büsche auch außerhalb der beiden alten Kernwälder Blickpunkte schaffen.
    const fullerForest = (x, z, random) => {
      const biome = biomeAt(x, z).id;
      if (biome === 'forest') return random() < .94;
      return biome === 'meadow' && fbm(x * .017 + 611, z * .017 - 277) > .64 && random() < .72;
    };
    for (let i = 0; i < 520; i++) {
      const p = findSpot(3.05, 1.2, 10.8, .58, fullerForest);
      if (p) this.addResource('tree', p, rand);
    }
    for (let i = 0; i < 360; i++) {
      const p = findSpot(3.25, .5, 35, .9, (x, z) => biomeAt(x, z).id !== 'coast');
      if (p) this.addResource('rock', p, rand);
    }
    for (let i = 0; i < 190; i++) {
      const p = findSpot(3.35, 1.2, 7.2, .48, (x, z) => ['forest', 'meadow', 'marsh'].includes(biomeAt(x, z).id));
      if (p) this.addResource('bush', p, rand);
    }
    for (let i = 0; i < 120; i++) {
      const p = findSpot(1.25, .8, 7, .48, (x, z) => ['forest', 'marsh'].includes(biomeAt(x, z).id));
      if (p) this.addResource('mushroom', p, rand, 'forest');
    }

    // Der Übergangsring zwischen Startwäldern und Außengebieten war trotz der
    // globalen Ergänzung noch sichtbar dünner. Eigene Sampler schließen genau
    // diesen Korridor, ohne die ohnehin dichten Startwälder weiter zuzustopfen.
    const midlands = (x, z) => {
      const d = Math.hypot(x, z);
      return d > 270 && d < 680;
    };
    for (let i = 0; i < 260; i++) {
      const p = findSpot(3.05, 1.2, 10.5, .58, (x, z, r) => midlands(x, z) && fullerForest(x, z, r));
      if (p) this.addResource('tree', p, rand);
    }
    for (let i = 0; i < 120; i++) {
      const p = findSpot(3.2, .55, 32, .88, midlands);
      if (p) this.addResource('rock', p, rand);
    }
    for (let i = 0; i < 100; i++) {
      const p = findSpot(3.3, 1.2, 7, .48, (x, z) => midlands(x, z) && ['forest', 'meadow', 'marsh'].includes(biomeAt(x, z).id));
      if (p) this.addResource('bush', p, rand);
    }
  }

  addResource(kind, p, rand, variant = null) {
    // Das Mesh-Detail darf je nach Gerät variieren (Mobile = einfacher). Damit
    // das aber NICHT den Platzierungs-Stream verschiebt (und so Positionen und
    // die Index-Reihenfolge geräteunabhängig bleiben), bekommt jede Ressource
    // einen eigenen, aus dem Platzierungs-Stream abgeleiteten Seed fürs Mesh.
    const draw = mulberry32((rand() * 4294967296) >>> 0);
    let group, hp, r;
    if (kind === 'tree') { group = this.buildTree(draw); hp = 5; r = 0.55; }
    else if (kind === 'rock') { group = this.buildRock(draw); hp = 5; r = 1.2; }
    else if (kind === 'bush') { group = this.buildBush(draw); hp = 1; r = 0; }
    else if (kind === 'mushroom') { group = this.buildMushroom(draw, variant); hp = 1; r = 0; }
    else if (kind === 'herb') { group = this.buildHerb(draw); hp = 1; r = 0; }
    else { group = this.buildFieldCache(draw); hp = 1; r = .42; }

    group.position.set(p.x, p.h, p.z);
    const biome = biomeAt(p.x, p.z).id;
    if (kind === 'tree' && biome === 'forest') group.scale.multiplyScalar(1.15);
    if (kind === 'bush' && biome === 'marsh') group.scale.set(1.15, 0.72, 1.15);
    if (kind === 'rock' && biome === 'alpine') group.scale.multiplyScalar(1.12);
    group.rotation.y = rand() * Math.PI * 2;
    // Einige Low-Poly-Geometrien reichen lokal unter y=0 (besonders Felsen
    // und Büsche). Den echten unteren Rand auf den Boden setzen statt nur den
    // theoretischen Gruppenursprung.
    group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(group);
    // Am Hang zählt nicht die Höhe am Mittelpunkt, sondern der tiefste Boden
    // unter der Standfläche — sonst schwebt die Talseite sichtbar in der Luft.
    // Der tiefste Vertex bestimmt, wo das Objekt tatsächlich aufsetzt; direkt
    // darunter muss das Terrain mit abgetastet werden.
    let lowY=Infinity,lowX=p.x,lowZ=p.z;
    const v=new THREE.Vector3();
    group.traverse((m)=>{
      if(!m.isMesh||!m.geometry?.attributes?.position)return;
      const posAttr=m.geometry.attributes.position;
      for(let i=0;i<posAttr.count;i++){
        v.fromBufferAttribute(posAttr,i);m.localToWorld(v);
        if(v.y<lowY){lowY=v.y;lowX=v.x;lowZ=v.z;}
      }
    });
    const footprint=Math.max(.3,Math.min(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z)*.32);
    let ground=Math.min(p.h,terrainHeight(lowX,lowZ));
    for(let k=0;k<4;k++){
      const a=k*Math.PI/2+Math.PI/4;
      ground=Math.min(ground,terrainHeight(p.x+Math.cos(a)*footprint,p.z+Math.sin(a)*footprint));
    }
    // Wichtig: lowY (echter tiefster Vertex) statt bounds.min.y — die Box3 aus
    // setFromObject ist bei rotierten Meshes konservativ zu tief und hob die
    // Objekte dadurch um bis zu ~0.3m über den sichtbaren Boden.
    group.position.y+=ground-lowY;
    this.group.add(group);

    const res = {
      kind, group, hp, maxHp: hp,
      x: p.x, z: p.z, alive: true, respawnAt: 0, shakeT: 0,
      groundOffset: group.position.y - p.h,
      baseRotZ: 0,
      windPhase: rand() * Math.PI * 2,
      variant,
      windFlex: kind === 'tree' ? 0.035 + rand() * 0.025 : kind === 'bush' ? 0.055 : kind === 'mushroom' ? .012 : kind === 'herb' ? .04 : 0,
    };
    group.traverse((m) => { m.userData.res = res; });
    // Die Kind-Meshes einer Ressource bewegen sich nie relativ zur Gruppe
    // (Wind/Shake drehen nur die Gruppe selbst). Ohne autoUpdate spart sich
    // Three.js pro Frame tausende Matrix-Kompositionen.
    group.traverse((m) => {
      if (m === group) return;
      m.updateMatrix();
      m.matrixAutoUpdate = false;
    });
    this.list.push(res);
    if (r > 0) {
      const obstacle = { x: p.x, z: p.z, r, res };
      this.obstacles.push(obstacle);
      const key = this.obstacleCellKey(p.x, p.z);
      const cell = this.obstacleGrid.get(key);
      if (cell) cell.push(obstacle);
      else this.obstacleGrid.set(key, [obstacle]);
    }
  }

  obstacleCellKey(x, z) {
    return `${Math.floor(x / this.obstacleCellSize)},${Math.floor(z / this.obstacleCellSize)}`;
  }

  rebuildObstacleGrid() {
    this.obstacleGrid.clear();
    for (const obstacle of this.obstacles) {
      obstacle.x = obstacle.res.x;
      obstacle.z = obstacle.res.z;
      const key = this.obstacleCellKey(obstacle.x, obstacle.z);
      const cell = this.obstacleGrid.get(key);
      if (cell) cell.push(obstacle);
      else this.obstacleGrid.set(key, [obstacle]);
    }
  }

  // Verteilt verlorene Feldtaschen reproduzierbar pro Welt. Ein zufälliger
  // Seed erzeugt neue Fundorte; derselbe Seed stellt sie beim Laden und für
  // Koop-Gäste identisch wieder her.
  randomizeCaches(seed) {
    const normalizedSeed = (Number(seed) >>> 0) || 1;
    const random = mulberry32(normalizedSeed);
    const caches = this.list.filter((resource) => resource.kind === 'cache');
    const placed = [];

    for (const cache of caches) {
      let spot = null;
      for (let attempt = 0; attempt < 240; attempt++) {
        const angle = random() * Math.PI * 2;
        const distance = 55 + Math.sqrt(random()) * (WORLD_RADIUS - 95);
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        const h = terrainHeight(x, z);
        if (h <= WATER_Y + .38 || h > 15 || terrainSlope(x, z) > .52) continue;
        if (distanceToTrail(x, z) < 2.6) continue;
        if (placed.some((entry) => Math.hypot(entry.x - x, entry.z - z) < 34)) continue;
        // Nicht in einem Baum, Felsen oder einer anderen Tasche verstecken.
        if (this.obstacles.some((obstacle) => obstacle.res !== cache
          && obstacle.res.kind !== 'cache'
          && Math.hypot(obstacle.x - x, obstacle.z - z) < obstacle.r + 1.1)) continue;
        spot = { x, z, h };
        break;
      }
      if (!spot) continue;
      cache.x = spot.x;
      cache.z = spot.z;
      cache.group.position.set(spot.x, spot.h + (cache.groundOffset || 0), spot.z);
      cache.group.rotation.y = random() * Math.PI * 2;
      cache.permanentHidden = false;
      cache.hp = cache.maxHp;
      cache.alive = true;
      cache.respawnAt = 0;
      cache.group.visible = true;
      placed.push(spot);
    }

    this.cacheSeed = normalizedSeed;
    this.rebuildObstacleGrid();
    return placed.length;
  }

  collidesAt(x, z, padding = .62) {
    const size = this.obstacleCellSize;
    // Größter Ressourcenradius (Felsen) plus Fahrzeugpolster. So werden auch
    // Hindernisse erfasst, deren Mittelpunkt knapp außerhalb der Zelle liegt.
    const radius = 1.2 + padding;
    const minX = Math.floor((x - radius) / size), maxX = Math.floor((x + radius) / size);
    const minZ = Math.floor((z - radius) / size), maxZ = Math.floor((z + radius) / size);
    for (let cellX = minX; cellX <= maxX; cellX++) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ++) {
        const cell = this.obstacleGrid.get(`${cellX},${cellZ}`);
        if (!cell) continue;
        for (const obstacle of cell) {
          if (obstacle.res.alive && Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.r + padding) return true;
        }
      }
    }
    return false;
  }

  buildTree(rand) {
    const g = new THREE.Group();
    const h = 2.45 + rand() * 1.25;
    const trunkRadius = .31 + rand() * .08;
    const bark = rand() < .28 ? 0x624431 : rand() < .55 ? 0x765039 : TRUNK;
    const barkMat = std(bark);
    const trunk = new THREE.Mesh(TRUNK_GEO, barkMat);
    trunk.scale.set(trunkRadius, h, trunkRadius);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    g.add(trunk);
    const col = FOLIAGE[Math.floor(rand() * FOLIAGE.length)];
    if (rand() < 0.55) {
      // Nadelbaum: schmalere, überlappende Astkränze mit sichtbarem Stamm.
      const levels = (this.lowPowerDevice ? 2 : 3) + Math.floor(rand() * 2);
      let y = h * .58;
      let rad = 1.05 + rand() * .35;
      for (let i = 0; i < levels; i++) {
        const coneHeight = 1.55 + rand() * .3;
        const cone = new THREE.Mesh(PINE_GEO, foliage(col));
        cone.scale.set(rad, coneHeight, rad);
        cone.position.set((rand() - .5) * .06, y + coneHeight * .5, (rand() - .5) * .06);
        cone.rotation.y = rand() * Math.PI;
        cone.castShadow = true;
        g.add(cone);
        y += .7;
        rad *= .77;
      }
      const tip = new THREE.Mesh(PINE_GEO, foliage(col));
      tip.scale.set(.28, 1.05, .28); tip.position.y = y + .5; tip.castShadow = true; g.add(tip);
    } else {
      // Ein zentraler Leitast und seitliche Äste wachsen tatsächlich vom Stamm
      // zu ihren Kronensegmenten. Dadurch entstehen keine Querbalken mehr.
      const leaderTop = new THREE.Vector3(0, h + .8, 0);
      g.add(branchBetween(new THREE.Vector3(0, h * .62, 0), leaderTop, trunkRadius * .48, barkMat));

      const lateralCount = this.lowPowerDevice ? 3 : 5;
      const tips = [];
      for (let i = 0; i < lateralCount; i++) {
        const a = i / lateralCount * Math.PI * 2 + rand() * .35;
        const reach = .62 + rand() * .34;
        const start = new THREE.Vector3(0, h * (.6 + rand() * .13), 0);
        const end = new THREE.Vector3(Math.cos(a) * reach, h * .82 + rand() * .55, Math.sin(a) * reach);
        g.add(branchBetween(start, end, trunkRadius * (.32 + rand() * .08), barkMat));
        tips.push(end);
      }

      // Viele kleinere Volumen lesen sich als zusammenhängende Krone, lassen
      // aber noch Astgabeln und eine natürliche, asymmetrische Silhouette frei.
      tips.push(leaderTop, new THREE.Vector3(0, h + .28, 0));
      for (let i = 0; i < tips.length; i++) {
        const blobColor = FOLIAGE[(FOLIAGE.indexOf(col) + (i % 2)) % FOLIAGE.length];
        const blob = new THREE.Mesh(LEAF_GEO, foliage(blobColor));
        const size = i >= lateralCount ? .76 + rand() * .16 : .64 + rand() * .2;
        blob.position.copy(tips[i]);
        blob.position.add(new THREE.Vector3((rand() - .5) * .18, .2 + rand() * .18, (rand() - .5) * .18));
        blob.scale.set(size * (1 + rand() * .16), size * (.78 + rand() * .18), size * (1 + rand() * .16));
        blob.rotation.y = rand() * Math.PI;
        blob.castShadow = true;
        blob.receiveShadow = true;
        g.add(blob);
      }

    }
    const s = 0.85 + rand() * 0.55;
    g.scale.setScalar(s);
    return g;
  }

  buildRock(rand) {
    const g = new THREE.Group();
    const grey = [0x777b7d, 0x85888a, 0x929596, 0x696e70][Math.floor(rand() * 4)];
    const sx = 1.05 + rand() * .42;
    const sy = .72 + rand() * .3;
    const sz = 1 + rand() * .4;
    const rock = new THREE.Mesh(ROCK_GEOS[Math.floor(rand() * ROCK_GEOS.length)], rockMaterial(grey));
    rock.scale.set(sx, sy, sz);
    rock.position.y = .54 * sy;
    rock.rotation.set((rand() - .5) * .12, rand() * Math.PI, (rand() - .5) * .1);
    rock.castShadow = true;
    rock.receiveShadow = true;
    g.add(rock);
    if (rand() < .72) {
      const small = new THREE.Mesh(ROCK_CHIP_GEO, rockMaterial(grey - 0x080808));
      small.scale.set(.32 + rand() * .18, .2 + rand() * .12, .28 + rand() * .16);
      small.position.set((rand() < .5 ? -1 : 1) * (.78 + rand() * .34), small.scale.y * .52, (rand() - .5) * .9);
      small.rotation.set(rand() * .35, rand() * Math.PI, rand() * .25);
      small.castShadow = true;
      small.receiveShadow = true;
      g.add(small);
    }
    if (rand() < .48) {
      const moss = new THREE.Mesh(ROCK_MOSS_GEO, rockMaterial(0x536b3c));
      moss.scale.set(1.05, .13, .76);
      moss.position.set(-.12, sy * .94, .04);
      moss.rotation.y = rand() * Math.PI;
      g.add(moss);
    }
    return g;
  }

  buildBush(rand) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(.48 + rand() * .22, 1), std(i === 1 ? 0x397c3e : 0x2e6b34, .92));
      bush.position.set((i - 1) * .38, .4 + (i % 2) * .14, (rand() - .5) * .24);
      bush.scale.set(1, .7 + rand() * .25, .9); bush.rotation.y = rand() * Math.PI; bush.castShadow = true; g.add(bush);
    }
    const berries = new THREE.Group();
    const bcol = rand() < 0.5 ? 0xd23b4e : 0x4757c8;
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), std(bcol, .72));
      const a = rand() * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.55, 0.45 + (rand() - 0.3) * 0.4, Math.sin(a) * 0.55);
      berries.add(b);
    }
    g.add(berries);
    g.userData.berries = berries;
    return g;
  }

  buildMushroom(rand, variant = 'forest') {
    const cave = variant === 'cave';
    const pieces=[], matrix=new THREE.Matrix4(), position=new THREE.Vector3();
    const scale=new THREE.Vector3(), rotation=new THREE.Quaternion(), euler=new THREE.Euler();
    const count = cave ? 4 : 3;
    for (let i=0;i<count;i++) {
      const s=(cave ? .7 : .62)+rand()*(cave ? .62 : .5);
      const angle=i/count*Math.PI*2+rand()*.5;
      const x=Math.cos(angle)*(.12+rand()*.2),z=Math.sin(angle)*(.12+rand()*.2);
      position.set(x,.17*s,z);scale.set(s,s*(.85+rand()*.35),s);rotation.identity();matrix.compose(position,rotation,scale);
      pieces.push(coloredGeometry(MUSHROOM_STEM_GEO,matrix,cave?0xaec8bd:0xd8c8a4));
      position.set(x,.34*s,z);scale.set(s*(1+rand()*.2),s*(.72+rand()*.16),s);euler.set(0,rand()*Math.PI,0);rotation.setFromEuler(euler);matrix.compose(position,rotation,scale);
      pieces.push(coloredGeometry(MUSHROOM_CAP_GEO,matrix,cave?0x6ac7b5:(rand()<.5?0xa94b38:0xc47a3c)));
    }
    const geometry=mergeGeometries(pieces,false);
    for(const piece of pieces)piece.dispose();
    const mushroom=new THREE.Mesh(geometry,cave?MUSHROOM_CAVE_MAT:MUSHROOM_FOREST_MAT);
    mushroom.castShadow=true;return mushroom;
  }

  buildHerb(rand) {
    const g=new THREE.Group();
    const greens=[0x3f8f4c,0x55a856,0x2f7744];
    for(let i=0;i<7;i++){
      const leaf=new THREE.Mesh(HERB_LEAF_GEO,std(greens[i%greens.length],.9));
      const a=i/7*Math.PI*2+rand()*.25;
      leaf.position.set(Math.cos(a)*.13,.24,Math.sin(a)*.13);
      leaf.rotation.set(Math.cos(a)*.48,0,-Math.sin(a)*.48);
      leaf.scale.set(.75+rand()*.35,.75+rand()*.35,.7);
      leaf.castShadow=true;g.add(leaf);
    }
    for(let i=0;i<3;i++){
      const bloom=new THREE.Mesh(new THREE.SphereGeometry(.065,7,5),std(0xe5d56d,.78));
      const a=i/3*Math.PI*2;bloom.position.set(Math.cos(a)*.17,.46+rand()*.1,Math.sin(a)*.17);g.add(bloom);
    }
    return g;
  }

  buildFieldCache(rand) {
    const g=new THREE.Group();
    const body=new THREE.Mesh(CACHE_BODY_GEO,std(rand()<.5?0x596341:0x6b6144,.96));
    body.position.y=.39;body.rotation.x=-.08;body.castShadow=true;body.receiveShadow=true;g.add(body);
    const pocket=new THREE.Mesh(CACHE_POCKET_GEO,std(0x817455,.98));
    pocket.position.set(0,.34,.36);pocket.castShadow=true;g.add(pocket);
    for(const x of[-.29,.29]){
      const strap=new THREE.Mesh(CACHE_STRAP_GEO,std(0x3d3528,.96));
      strap.position.set(x,.4,0);g.add(strap);
    }
    const cloth=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.88,8),std(0x8b7252,.98));
    cloth.rotation.z=Math.PI/2;cloth.position.set(0,.83,-.12);cloth.castShadow=true;g.add(cloth);
    g.rotation.z=(rand()-.5)*.12;
    return g;
  }

  // Rückgabe: { destroyed, drops, hint } oder null wenn nichts passiert
  hit(res, toolId) {
    if (!res.alive) return null;

    if (res.kind === 'bush') {
      res.alive = false;
      res.group.userData.berries.visible = false;
      res.respawnAt = performance.now() / 1000 + regrowDelay('bush');
      res.shakeT = 0.3;
      return { destroyed: false, drops: { beeren: 2 }, kind: 'bush', hp: 0, maxHp: 1 };
    }

    if (res.kind === 'mushroom') {
      res.alive = false;
      res.group.visible = false;
      res.respawnAt = performance.now() / 1000 + regrowDelay(res.variant === 'cave' ? 'mushroomCave' : 'mushroom');
      return {
        destroyed: false,
        drops: res.variant === 'cave' ? { leuchtpilz:1 } : { pilz:1 + (Math.random()<.28?1:0) },
        kind: 'mushroom', variant:res.variant, hp: 0, maxHp: 1,
      };
    }

    if (res.kind === 'herb') {
      res.alive=false;res.group.visible=false;
      res.respawnAt=performance.now()/1000+regrowDelay('herb');
      return { destroyed:false, drops:{heilkraut:1+(Math.random()<.3?1:0)}, kind:'herb', hp:0, maxHp:1 };
    }

    if (res.kind === 'cache') {
      res.alive=false;res.group.visible=false;
      res.respawnAt=performance.now()/1000+regrowDelay('cache');
      const drops={
        holz:2+Math.floor(Math.random()*3),
        stein:2+Math.floor(Math.random()*3),
        // Verlorene Feldtaschen enthalten immer etwas gegerbtes Material;
        // gelegentlich ist noch ein zweites brauchbares Fellstück erhalten.
        fell:1+(Math.random()<.28?1:0),
      };
      const roll=Math.random();
      if(roll<.35)drops.eisen=1;
      else if(roll<.7)drops.pfeil=3+Math.floor(Math.random()*4);
      else drops.verband=1;
      return { destroyed:false, drops, kind:'cache', hp:0, maxHp:1 };
    }

    const dmg = toolDamage(toolId, res.kind);
    res.hp -= dmg;
    res.shakeT = 0.3;

    let hint = null;
    if (res.kind === 'rock' && !['spitzhacke','metallhacke'].includes(toolId)) hint = 'Mit einer Spitzhacke geht das schneller!';
    if (res.kind === 'tree' && !['axt','metallaxt'].includes(toolId)) hint = 'Mit einer Axt geht das schneller!';

    if (res.hp <= 0) {
      res.alive = false;
      res.group.visible = false;
      res.respawnAt = performance.now() / 1000 + regrowDelay(res.kind);
      const highOre = res.kind === 'rock' && terrainHeight(res.x, res.z) > 5.5;
      const drops = res.kind === 'tree' ? { holz: 4 } : { stein: 3, ...(highOre && Math.random() < 0.72 ? { eisenerz: 1 + (Math.random() < 0.25 ? 1 : 0) } : {}) };
      return { destroyed: true, drops, kind: res.kind, hint: null, hp: 0, maxHp: res.maxHp };
    }
    return { destroyed: false, drops: null, kind: res.kind, hint, hp: res.hp, maxHp: res.maxHp };
  }

  update(dt, wind = null, viewerPos = null) {
    const now = performance.now() / 1000;
    const force = wind ? Math.hypot(wind.x, wind.z) : 0;
    // Hinter dem maximalen Nebelbereich wären Ressourcen vollständig verdeckt,
    // wurden bisher aber trotzdem gerendert und animiert.
    const maxDistanceSq = this.viewDistance * this.viewDistance;
    // Wind-Biegung ist jenseits dieser Distanz nicht mehr wahrnehmbar. Statische
    // Gruppen frieren ihre Matrix ein, statt sie jeden Frame neu zu berechnen.
    const windDistanceSq = 130 * 130;
    for (const res of this.list) {
      if (!res.alive && res.respawnAt > 0 && now >= res.respawnAt) {
        res.alive = true;
        res.hp = res.maxHp;
        res.respawnAt = 0;
        if (res.kind === 'bush') res.group.userData.berries.visible = true;
      }

      const dx = viewerPos ? res.x - viewerPos.x : 0;
      const dz = viewerPos ? res.z - viewerPos.z : 0;
      const distSq = dx * dx + dz * dz;
      const inRange = !viewerPos || distSq <= maxDistanceSq;
      res.group.visible = res.alive && inRange;
      const animate = res.alive && res.shakeT > 0
        || (res.alive && inRange && (!viewerPos || distSq <= windDistanceSq) && res.windFlex > 0);
      if (!animate) {
        if (res.shakeT > 0) res.shakeT = Math.max(0, res.shakeT - dt);
        if (res.group.matrixAutoUpdate) {
          res.group.updateMatrix();
          res.group.matrixAutoUpdate = false;
        }
        continue;
      }
      if (!res.group.matrixAutoUpdate) res.group.matrixAutoUpdate = true;

      const pulse = 0.72 + Math.sin(now * (1.4 + force * 1.8) + res.windPhase) * 0.28;
      const bend = res.windFlex * force * pulse;
      if (res.shakeT > 0) {
        res.shakeT -= dt;
        const s = Math.max(res.shakeT, 0);
        res.group.rotation.z = Math.sin(s * 40) * s * 0.25 + (wind ? wind.x * bend : 0);
        if (s <= 0) res.group.rotation.z = wind ? wind.x * bend : 0;
      } else if (res.windFlex) {
        res.group.rotation.z += ((wind ? wind.x * bend : 0) - res.group.rotation.z) * Math.min(1, dt * 5);
        res.group.rotation.x += ((wind ? -wind.z * bend : 0) - res.group.rotation.x) * Math.min(1, dt * 5);
      }
    }
  }
}
