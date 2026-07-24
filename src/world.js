import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fbm, mulberry32 } from './noise.js';

const GROUND_COVER_TEXTURE_URL = new URL(
  '../assets/ground-cover/Ekfs_bush_map.png',
  import.meta.url,
).href;

const GROUND_COVER_SPECS = [
  // Der Außengürtel reicht bis 1230 m. Die früheren Radien von 340–680 m
  // ließen mehr als die Hälfte der Karte ohne hochwertige Bodenbedeckung.
  { name: 'grass-1', file: 'grass-1.glb', kind: 'grass', count: 1650, lowCount: 390, radius: 1190, scale: [.42, .78], seed: 7301 },
  { name: 'grass-2', file: 'grass-2.glb', kind: 'grass', count: 1420, lowCount: 350, radius: 1190, scale: [.38, .7], seed: 7302 },
  { name: 'flower-3', file: 'flower-3.glb', kind: 'flower', count: 420, lowCount: 90, radius: 1050, scale: [.72, 1.12], seed: 7311 },
  { name: 'flower-5', file: 'flower-5.glb', kind: 'flower', count: 420, lowCount: 90, radius: 1050, scale: [.7, 1.08], seed: 7312 },
  { name: 'mushroom-1', file: 'mushroom-1.glb', kind: 'mushroom', count: 135, lowCount: 34, radius: 980, scale: [.18, .36], seed: 7321 },
  { name: 'mushroom-3', file: 'mushroom-3.glb', kind: 'mushroom', count: 135, lowCount: 34, radius: 980, scale: [.18, .35], seed: 7322 },
  { name: 'mushroom-4', file: 'mushroom-4.glb', kind: 'mushroom', count: 125, lowCount: 32, radius: 980, scale: [.22, .42], seed: 7323 },
  { name: 'bush-1', file: 'bush-1.glb', kind: 'bush', count: 105, lowCount: 26, radius: 1080, scale: [.42, .72], seed: 7331 },
  { name: 'bush-2', file: 'bush-2.glb', kind: 'bush', count: 100, lowCount: 25, radius: 1080, scale: [.4, .68], seed: 7332 },
  { name: 'bush-3', file: 'bush-3.glb', kind: 'bush', count: 100, lowCount: 25, radius: 1080, scale: [.4, .67], seed: 7333 },
].map((spec) => ({
  ...spec,
  url: new URL(`../assets/ground-cover/${spec.file}`, import.meta.url).href,
}));

const groundCoverLoader = new GLTFLoader();
const groundCoverTextureLoader = new THREE.TextureLoader();

async function loadGroundCoverGeometry(url) {
  const gltf = await groundCoverLoader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  let sourceMesh = null;
  gltf.scene.traverse((node) => {
    if (!sourceMesh && node.isMesh) sourceMesh = node;
  });
  if (!sourceMesh) throw new Error(`Ground-cover asset has no mesh: ${url}`);
  const geometry = sourceMesh.geometry.clone();
  // Die Konvertierung speichert die Zentrierung als Parent-Transform. Für
  // Instancing wird sie einmal in die Geometrie gebacken.
  geometry.applyMatrix4(sourceMesh.matrixWorld);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export const WATER_Y = 0;
// Die Wildnis soll sich wie ein Kontinent und nicht wie eine kleine Arena anfühlen.
// Die Geometrie bleibt bewusst moderat unterteilt, damit die größere Karte auch
// auf schwächeren Geräten spielbar bleibt.
// Radius 1230 statt 820 ergibt die 2,25-fache Fläche. Bewusst nicht mehr:
// Die 59 Landmarks reichen im Schnitt nur 122 m ins Land, ein größerer Ring
// bliebe leer. Der neue Außengürtel 640–1230 m trägt die Flüsse, Krokodile
// und die Gegner-Tiers 8–12.
export const WORLD_RADIUS = 1230;
const SIZE = 2460;
// Die Segmentzahl wächst mit der Kante mit, damit die Metergröße eines
// Terrain-Quads (~6,9 m) und damit die Geländeauflösung erhalten bleibt.
const SEGS = 356;
let activeTerrainSegments=SEGS;
let physicsHeightCache=null;
let visualHeightCache=null;
const DAY_SECONDS = 8 * 60;
const NIGHT_SECONDS = 3 * 60;

// Das Routennetz verbindet alle großen Festlandregionen. Der dritte Wert ist
// die Zielhöhe des befahrbaren Korridors; dadurch sind die Wege nicht länger
// nur aufgemalte Bänder über dem rohen, teils unpassierbaren Terrain.
export const BIKE_ROUTE_PATHS = [
  [[8,-8,1.8],[45,-25,4.5],[82,-58,3],[125,-90,1.2],[166,-128,6.2],[198,-154,17.5],[178,-184,20.5],[216,-211,28],[255,-220,30.5],[290,-165,29.5]],
  [[-15,10,1.7],[-55,35,1.1],[-98,72,1],[-140,105,6],[-205,82,3.5],[-270,55,2.3],[-330,42,.9],[-390,48,1],[-432,50,2.1],[-500,49,3],[-570,50,5],[-625,50,7.8],[-690,65,7],[-755,92,5.6]],
  [[-140,105,6],[-162,128,3.8],[-185,145,1.7]],
  [[0,0,1.8],[0,-90,1.4],[20,-180,2.5],[30,-280,3.8],[-30,-380,5],[-100,-500,6.4],[-150,-600,7.2],[-205,-680,6.5],[-245,-755,5.4]],
  [[0,0,1.8],[35,100,1.4],[20,220,2],[15,330,3],[-40,480,4.8],[-125,625,6.6],[-160,700,6.2],[-185,765,5.2]],
  [[0,0,1.8],[100,20,2],[180,25,2.8],[260,35,3.5],[350,100,4.2],[420,190,3.2],[470,265,1.1],[560,325,3.1],[650,380,5.2],[745,420,5.8]],
  [[15,330,3],[-90,390,4],[-210,440,4.5],[-330,490,5],[-420,520,5.4],[-530,570,5.8],[-650,625,5.6]],

  // Erschließung des Außengürtels ab 640 m. Vorher endete jede Route bei
  // ±755 — der komplette neue Ring war wegelos. Alle Wegpunkte sind gegen
  // das Gelände geprüft (Höhe > 1 m, Neigung < 0,6), damit die Korridore
  // nicht als Damm über offenes Wasser gelegt werden.
  [[745,420,5.3],[772,407,2.5],[798,393,4.4],[825,380,2.9],[852,366,2.4],[869,354,1.1],[905,339,2.8]],
  [[650,380,4.9],[653,301,3.2],[656,221,3.4],[659,162,1],[662,63,2],[645,-13,1.5],[668,-96,2]],
  [[668,-96,2],[726,-106,5.6],[784,-116,3.5],[842,-126,4.9],[967,-132,1.2],[1013,-163,1],[1074,-165,1.1]],
  [[290,-165,29.5],[321,-250,12.4],[351,-335,4.6],[393,-404,1.1],[397,-543,1.3],[450,-584,1.2],[474,-676,3.2]],
  [[474,-676,3.2],[465,-747,3.6],[455,-818,1.2],[436,-887,1.2],[428,-954,1.1],[423,-1021,2.2],[417,-1101,1.2]],
  [[-755,92,4.1],[-799,36,1.2],[-813,-14,1.3],[-905,-83,1],[-938,-113,1.4],[-969,-179,1],[-1018,-243,3.7]],
  [[-185,765,5.1],[-228,732,1.2],[-317,707,1.7],[-342,662,4.9],[-394,627,6.6],[-447,593,4.1],[-499,558,5.2]],
  [[-499,558,5.2],[-549,611,1.2],[-594,655,3.6],[-651,706,3.2],[-690,767,5.5],[-750,821,6.5],[-800,874,2.4]],
  [[-185,765,5.1],[-155,784,1.4],[-58,857,1.1],[5,888,5.1],[68,928,4.8],[132,969,2],[195,1010,1.1]],
  [[420,190,3.2],[430,300,3.8],[430,430,4.8],[510,535,5.3],[620,620,5.7],[715,685,5.4]],
];
export const TRAIL_PATHS = BIKE_ROUTE_PATHS.map((path) => path.map(([x,z]) => [x,z]));

// Lokale Mittellinie der Schattenhöhle. Der Eingang liegt bei +Z; danach
// knickt der Gang mehrfach ab und führt bis unter den Kern des Felsmassivs.
export const SHADOW_CAVE_ORIGIN = { x: -440, z: 48 };
export const SHADOW_CAVE_PATH = [
  [0, 4], [-.45, 0], [-1.15, -5], [.75, -10.5],
  [1.35, -16], [-.65, -21.5], [-.15, -27.5],
];

// Flussläufe sind Teil der echten Terrainhöhe (Physik UND Visual): Wasser,
// Ufersand, Schilf und Fische entstehen dadurch automatisch über die
// vorhandenen höhenbasierten Systeme.
//
// Der Heimatfluss verbindet den Nordwestsee über den flachen Sattel westlich
// des Basislagers mit der Südbucht. Die drei weiteren Läufe erschließen den
// neuen Außengürtel und sind der Lebensraum der Krokodile.
const RIVER_DEFS = [
  {
    id: 'heimatfluss',
    path: [[-52,-78],[-62,-40],[-59,-8],[-64,22],[-72,44],[-80,62],[-86,88],[-92,106]],
    // An der Kreuzung mit dem Westpfad hebt sich das Flussbett zu einer
    // watbaren Furt, damit die Route zur Schattenhöhle begehbar bleibt.
    ford: { x: -77, z: 56 },
    crocodiles: false,
  },
  {
    id: 'ostfluss',
    path: [[382,-58],[521,-88],[663,-119],[812,-141],[961,-152],[1118,-143]],
    ford: { x: 663, z: -119 },
    crocodiles: true,
  },
  {
    id: 'suedwestfluss',
    path: [[-298,418],[-431,527],[-563,648],[-702,761],[-848,879],[-988,1002]],
    ford: { x: -563, z: 648 },
    crocodiles: true,
  },
  {
    // Folgt bewusst dem Landkorridor bei x≈440. Weiter westlich zerfällt der
    // Norden in offenes Wasser — dort wäre es kein Fluss, sondern Meer.
    id: 'nordfluss',
    path: [[430,-455],[441,-585],[452,-700],[448,-820],[441,-940],[430,-1075]],
    ford: { x: 452, z: -700 },
    crocodiles: true,
  },
];

// Der Einfluss eines Flusses verschwindet ab 13,5 m Abstand. Eine je Lauf
// vorberechnete Bounding-Box verhindert, dass terrainHeight für jeden Punkt
// der Welt jeden Fluss durchrechnet — das ist der heißeste Pfad im Spiel.
const RIVER_BOX_PADDING = 18;
for (const river of RIVER_DEFS) {
  const xs = river.path.map((p) => p[0]);
  const zs = river.path.map((p) => p[1]);
  river.minX = Math.min(...xs) - RIVER_BOX_PADDING;
  river.maxX = Math.max(...xs) + RIVER_BOX_PADDING;
  river.minZ = Math.min(...zs) - RIVER_BOX_PADDING;
  river.maxZ = Math.max(...zs) + RIVER_BOX_PADDING;
}

export const RIVERS = RIVER_DEFS;
export const RIVER_PATH = RIVER_DEFS[0].path;
export const CROCODILE_RIVERS = RIVER_DEFS.filter((r) => r.crocodiles);

export const RIVER_CROSSINGS = [
  { x:-59,z:-14,rotation:0,length:11 },
  // Die mittlere Furt folgt diagonal dem Westweg statt quer zu ihm zu liegen.
  { x:-76,z:53,rotation:.71,length:25 },
  { x:-89,z:96,rotation:-.12,length:11 },
  { x:663,z:-119,rotation:1.36,length:13 },
  { x:-563,z:648,rotation:-.69,length:13 },
  { x:452,z:-700,rotation:1.51,length:13 },
];

// Liefert den stärksten Flusseinfluss an dieser Stelle. Läufe überlappen sich
// nicht, das Maximum ist daher zugleich der zuständige Fluss.
export function riverInfluenceAt(x, z) {
  let best = 0;
  let source = null;
  for (const river of RIVER_DEFS) {
    if (x < river.minX || x > river.maxX || z < river.minZ || z > river.maxZ) continue;
    const hit = closestPointOnPath(x, z, river.path);
    const influence = 1 - THREE.MathUtils.smoothstep(hit.distance, 3.4, 13.5);
    if (influence > best) { best = influence; source = river; }
  }
  return { influence: best, river: source };
}

export function riverInfluence(x, z) {
  return riverInfluenceAt(x, z).influence;
}

export const DRY_CAVE_DESCENT_ANGLE = THREE.MathUtils.degToRad(20);
export const DRY_CAVE_DESCENT_RUN = 11;
export const dryCaveFloorY = (z) => -Math.tan(DRY_CAVE_DESCENT_ANGLE)
  * Math.min(DRY_CAVE_DESCENT_RUN, Math.max(0, -z));

// Die Gezeitengrotte bleibt am Eingang lange trocken. Erst tief im Berg
// senkt sich der Gang in die geflutete Schmugglerkammer ab.
export function tideCaveFloorY(z) {
  const depth = Math.max(0, -z);
  if (depth <= 13) return .05;
  return .05 - Math.min(4.35, (depth - 13) * .435);
}

const STRAIGHT_CAVE_CUTS = [
  { x:-185,z:145,rotation:0,length:18,width:6.2,floor:dryCaveFloorY },
  { x:290,z:-165,rotation:0,length:20,width:6.2,floor:dryCaveFloorY },
  { x:-300,z:205,rotation:Math.PI,length:28,width:6.5,floor:tideCaveFloorY },
];

function segmentDistance(x, z, a, b) {
  const abx = b[0] - a[0], abz = b[1] - a[1];
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((x - a[0]) * abx + (z - a[1]) * abz) / lengthSq, 0, 1);
  return Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t));
}

function closestPointOnPath(x, z, path) {
  let best = { distance: Infinity, progress: 0 };
  let traversed = 0;
  const lengths = path.slice(1).map((point, i) => Math.hypot(point[0] - path[i][0], point[1] - path[i][1]));
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const abx = b[0] - a[0], abz = b[1] - a[1];
    const lengthSq = abx * abx + abz * abz || 1;
    const t = THREE.MathUtils.clamp(((x - a[0]) * abx + (z - a[1]) * abz) / lengthSq, 0, 1);
    const distance = Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t));
    if (distance < best.distance) best = { distance, progress: (traversed + lengths[i - 1] * t) / total };
    traversed += lengths[i - 1];
  }
  return best;
}

function closestBikeRoute(x,z) {
  let best={distance:Infinity,height:0};
  for(const path of BIKE_ROUTE_PATHS) for(let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[1]-a[1],lengthSq=dx*dx+dz*dz||1;
    const t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/lengthSq,0,1);
    const px=a[0]+dx*t,pz=a[1]+dz*t,distance=Math.hypot(x-px,z-pz);
    if(distance<best.distance)best={distance,height:THREE.MathUtils.lerp(a[2],b[2],t)};
  }
  return best;
}

function riverCrossingInfluence(x,z,crossing) {
  const dx=x-crossing.x,dz=z-crossing.z,c=Math.cos(crossing.rotation),s=Math.sin(crossing.rotation);
  const along=Math.abs(c*dx-s*dz),across=Math.abs(s*dx+c*dz);
  const lengthFade=1-THREE.MathUtils.smoothstep(along,crossing.length-1.5,crossing.length+4);
  const widthFade=1-THREE.MathUtils.smoothstep(across,4,8);
  return Math.max(0,lengthFade*widthFade);
}

export function distanceToTrail(x, z) {
  let best = Infinity;
  for (const path of TRAIL_PATHS) {
    for (let i = 1; i < path.length; i++) best = Math.min(best, segmentDistance(x, z, path[i - 1], path[i]));
  }
  return best;
}

function massif(x, z, cx, cz, radiusX, radiusZ, height, seed) {
  const nx = (x - cx) / radiusX, nz = (z - cz) / radiusZ;
  const distance = Math.hypot(nx, nz);
  if (distance >= 1) return 0;
  const edge = 1 - distance;
  const smooth = edge * edge * (3 - 2 * edge);
  const ridges = .82 + fbm(x * .018 + seed, z * .018 - seed) * .28;
  return smooth * height * ridges;
}

function terrainHeightRaw(x, z, caveMode = 'physics', skipStraightCaves = false) {
  let h = (fbm(x * 0.0085 + 8.3, z * 0.0085 + 3.1) - 0.47) * 26;
  h += (fbm(x * 0.05 + 100, z * 0.05 + 50) - 0.5) * 2.2;

  // Großmaßstäbliche Gebirgszüge statt überall ähnlicher Hügel. Mehrere
  // überlappende Rücken erzeugen Gipfel, Sättel und tatsächlich begehbare
  // Anstiege, ohne eine senkrechte Arena-Wand zu formen.
  h += massif(x, z, 225, -205, 165, 155, 31, 31);
  h += massif(x, z, 300, -170, 105, 120, 15, 44);
  h += massif(x, z, -190, -245, 150, 135, 24, 57);
  h += massif(x, z, -265, -225, 105, 110, 12, 68);
  // Die Schattenhöhle sitzt nun in einem echten Felsmassiv.
  h += massif(x, z, -440, -10, 88, 78, 21, 83);

  // Breite, sanft modellierte Fahrkorridore. Abseits der Wege bleibt das
  // natürliche Relief erhalten; im Kern folgt die Höhe dem geplanten Profil.
  const bikeRoute=closestBikeRoute(x,z);
  if(bikeRoute.distance<10) {
    const routeBlend=1-THREE.MathUtils.smoothstep(bikeRoute.distance,3.2,10);
    h=THREE.MathUtils.lerp(h,Math.max(.72,bikeRoute.height),routeBlend*.96);
  }

  // Der Physikboden folgt exakt dem verwinkelten Tunnel. Die Route beginnt
  // außerhalb des Portals und endet tief unter dem Berg statt im freien Himmel.
  const caveX = x - SHADOW_CAVE_ORIGIN.x;
  const caveZ = z - SHADOW_CAVE_ORIGIN.z;
  const cavePoint = closestPointOnPath(caveX, caveZ, SHADOW_CAVE_PATH);
  const caveCutRadius = caveMode === 'visual' ? 9.2 : 6.2;
  if (cavePoint.distance < caveCutRadius) {
    const lateralEdge = caveMode === 'visual' ? 8.8 : 6.2;
    const lateral = 1 - THREE.MathUtils.smoothstep(cavePoint.distance, 2.35, lateralEdge);
    const entranceFade = THREE.MathUtils.smoothstep(cavePoint.progress, 0, .08);
    const sealedEndFade = caveMode === 'visual'
      ? 1 - THREE.MathUtils.smoothstep(cavePoint.progress, .93, 1)
      : 1;
    // Der sichtbare Terrainboden liegt unter dem gebauten Höhlenboden. Zuvor
    // lag beides auf gleicher Höhe und erzeugte grüne, flackernde Querbänder.
    const caveFloor = caveMode === 'visual' ? .15 : 1.25;
    h = THREE.MathUtils.lerp(h, caveFloor, lateral * entranceFade * sealedEndFade);
  }
  // Startgebiet in der Mitte einebnen (Camp-Wiese)
  const d = Math.hypot(x, z);
  const flat = THREE.MathUtils.clamp(1 - d / 26, 0, 1);
  h = THREE.MathUtils.lerp(h, 1.6, flat * 0.9);
  // Abgelegene Expeditionsinseln, von tiefen Fahrrinnen vom Kernland getrennt.
  for (const [ix, iz, peak] of [[-50,250,7],[245,110,10],[-150,-260,8],[430,-330,11],[-455,-345,9]]) {
    const id = Math.hypot(x-ix,z-iz);
    if (id < 42) h = Math.max(h, 0.75 + (1-id/42) * peak);
    else if (id < 62) {
      // Ein durchgehender, mindestens zehn Meter breiter Wassergraben hält die
      // kleinen Expeditionsinseln bewusst dem Floß vorbehalten – unabhängig
      // davon, wie hoch das darunterliegende prozedurale Gebirge ausfällt.
      const channel=Math.min(
        THREE.MathUtils.smoothstep(id,42,48),
        1-THREE.MathUtils.smoothstep(id,56,62),
      );
      h=THREE.MathUtils.lerp(h,Math.min(h,-1.45),channel);
    }
  }
  // Der Fluss senkt das Terrain unter den Wasserspiegel. In der Mitte ist er
  // schwimmtief; zur Furt am Westpfad hin steigt das Bett auf Wattiefe an.
  const { influence: river, river: riverDef } = riverInfluenceAt(x, z);
  if (river > 0) {
    const ford = riverDef.ford;
    const fordLift = 1 - THREE.MathUtils.smoothstep(Math.hypot(x - ford.x, z - ford.z), 6, 15);
    const bed = THREE.MathUtils.lerp(-1.5, -0.32, fordLift);
    h = Math.min(h, THREE.MathUtils.lerp(h, bed, river));
  }
  // Drei steinerne Furten heben den Flussboden physisch über Wasser. Die
  // Übergänge sind breit genug für Fahrradlenkung und laufen an den Ufern aus.
  for(const crossing of RIVER_CROSSINGS) {
    const influence=riverCrossingInfluence(x,z,crossing);
    if(influence>0)h=Math.max(h,WATER_Y+.46-(1-influence)*2.25);
  }
  // Für die geraden Höhlen wird nur die sichtbare Terrainhaut abgesenkt. Die
  // begehbare Physik kommt aus den Höhlenplattformen. Dadurch schneiden keine
  // Grasdreiecke mehr durch den Innenraum, während Portal und Felsmantel den
  // Übergang an der Oberfläche sauber verdecken.
  if (caveMode === 'visual' && !skipStraightCaves) {
    for (const cave of STRAIGHT_CAVE_CUTS) {
      const dx=x-cave.x,dz=z-cave.z,cos=Math.cos(cave.rotation),sin=Math.sin(cave.rotation);
      const localX=cos*dx-sin*dz,localZ=sin*dx+cos*dz,depth=-localZ;
      if(depth<0||depth>cave.length+1||Math.abs(localX)>=cave.width)continue;
      const lateral=1-THREE.MathUtils.smoothstep(Math.abs(localX),3.2,cave.width);
      const entrance=THREE.MathUtils.smoothstep(depth,.4,3);
      const end=1-THREE.MathUtils.smoothstep(depth,cave.length-.5,cave.length+1);
      const base=terrainHeightRaw(cave.x,cave.z,'physics',true);
      const hiddenFloor=base+cave.floor(-depth)-.7;
      h=THREE.MathUtils.lerp(h,Math.min(h,hiddenFloor),lateral*entrance*end);
    }
  }
  return h;
}

function configureTerrainSurface(segments) {
  activeTerrainSegments=segments;
  const count=(segments+1)*(segments+1);
  physicsHeightCache=new Float32Array(count);physicsHeightCache.fill(NaN);
  visualHeightCache=new Float32Array(count);visualHeightCache.fill(NaN);
}

function gridHeight(ix,iz,caveMode) {
  const side=activeTerrainSegments+1,index=iz*side+ix;
  const cache=caveMode==='visual'?visualHeightCache:physicsHeightCache;
  if(!cache)configureTerrainSurface(activeTerrainSegments);
  const activeCache=caveMode==='visual'?visualHeightCache:physicsHeightCache;
  if(Number.isNaN(activeCache[index])){
    const step=SIZE/activeTerrainSegments;
    activeCache[index]=terrainHeightRaw(-SIZE/2+ix*step,-SIZE/2+iz*step,caveMode);
  }
  return activeCache[index];
}

// Einzige Bodenabfrage für Rendering UND Physik. PlaneGeometry besteht aus
// zwei Dreiecken pro Rasterzelle; dieselbe baryzentrische Interpolation sorgt
// dafür, dass Füße, Ressourcen und Bauten exakt auf der sichtbaren Oberfläche
// stehen und nicht zwischen mathematischer Kurve und Mesh versinken.
export function terrainHeight(x,z,caveMode='physics',skipStraightCaves=false) {
  if(skipStraightCaves)return terrainHeightRaw(x,z,caveMode,true);
  const step=SIZE/activeTerrainSegments;
  const gx=THREE.MathUtils.clamp((x+SIZE/2)/step,0,activeTerrainSegments-1e-7);
  const gz=THREE.MathUtils.clamp((z+SIZE/2)/step,0,activeTerrainSegments-1e-7);
  const ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz;
  const h00=gridHeight(ix,iz,caveMode),h10=gridHeight(ix+1,iz,caveMode);
  const h01=gridHeight(ix,iz+1,caveMode),h11=gridHeight(ix+1,iz+1,caveMode);
  return u+v<=1
    ? h00+u*(h10-h00)+v*(h01-h00)
    : h11+(1-u)*(h01-h11)+(1-v)*(h10-h11);
}

export function terrainSlope(x, z) {
  const e = 1.2;
  const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// Gefahrenstufe eines Ortes. Einzige Quelle für die Tier-Berechnung der
// Gegner UND für die Stufenangabe auf der Karte — sonst zeigt die Karte
// Werte an, die mit dem tatsächlichen Wild vor Ort nicht übereinstimmen.
export const BIOME_TIER = { meadow: 1, forest: 2, coast: 3, marsh: 4, alpine: 5 };

export function dangerTierAt(x, z) {
  const biomeTier = BIOME_TIER[biomeAt(x, z).id] || 1;
  const distanceTier = Math.min(7, Math.floor(Math.hypot(x, z) / (WORLD_RADIUS / 7.15)));
  return Math.min(12, biomeTier + distanceTier);
}

// Gefahrenstufe einer ganzen Gegend statt eines einzelnen Punktes.
//
// Für die Karte ist der Punktwert irreführend: Orte stehen bewusst auf
// flachem, begehbarem Grund (Küste, Wiese, Moor — niedriger Biomwert),
// während das Wild aus dem umliegenden Wald und Gebirge herüberzieht. Der
// Punktwert blieb dadurch bei 7 stehen, obwohl vor Ort Tier-11-Gegner
// unterwegs sind. Maßgeblich ist deshalb das gefährlichste Gelände im
// Umkreis, nicht der Boden direkt unter dem Wegweiser.
export function areaDangerTier(x, z, radius = 110) {
  let hoechste = dangerTierAt(x, z);
  for (let ring = 1; ring <= 2; ring++) {
    const abstand = radius * ring / 2;
    for (let i = 0; i < 8; i++) {
      const winkel = i / 8 * Math.PI * 2 + ring * .39;
      const px = x + Math.cos(winkel) * abstand;
      const pz = z + Math.sin(winkel) * abstand;
      if (Math.hypot(px, pz) > WORLD_RADIUS) continue;
      const tier = dangerTierAt(px, pz);
      if (tier > hoechste) hoechste = tier;
    }
  }
  return hoechste;
}

// Anzeigenamen der Biome. Die Werte werden zur Laufzeit von der i18n-Schicht
// überschrieben; die Biom-IDs darüber bleiben unverändert Spiellogik.
export const BIOME_NAMES = {
  rivervalley: 'Flusstal',
  crocriver: 'Krokodilfluss',
  coast: 'Küste',
  alpine: 'Hochgebirge',
  marsh: 'Moorland',
  forest: 'Dichter Wald',
  meadow: 'Grasland',
};

export function biomeAt(x, z) {
  const h = terrainHeight(x, z);
  // Das Flusstal zählt nicht als Küste: Es liegt mitten im Startgebiet und
  // soll weder die Küsten-Gefahrenstufe noch deren Entdeckungs-XP auslösen.
  // Das gilt aber nur für den Heimatfluss. Die Krokodilflüsse im Außengürtel
  // dürfen NICHT auf Wiesen-Niveau abgestuft werden, sonst fiele ihr
  // biomeTier auf 1 und die Gegner dort blieben Anfängerwild.
  const { influence: river, river: riverDef } = riverInfluenceAt(x, z);
  if (river > 0.25) {
    if (!riverDef.crocodiles) return { id: 'meadow', name: BIOME_NAMES.rivervalley };
    return { id: 'marsh', name: BIOME_NAMES.crocriver };
  }
  if (h < 0.9) return { id: 'coast', name: BIOME_NAMES.coast };
  if (h > 12) return { id: 'alpine', name: BIOME_NAMES.alpine };
  const climate = fbm(x * 0.012 + 610, z * 0.012 - 270);
  if (climate < 0.34 && h < 4.5) return { id: 'marsh', name: BIOME_NAMES.marsh };
  // Zwei zusammenhängende, unregelmäßige Waldkerne sorgen dafür, dass ein
  // Wald als Region und nicht nur als zufällige Baumgruppe lesbar ist.
  const forestPatchA = 1 - Math.hypot(x - 95, z + 65) / 102;
  const forestPatchB = 1 - Math.hypot(x + 140, z - 105) / 88;
  const forestPatchC = 1 - Math.hypot(x - 430, z - 430) / 118;
  const forestPatchD = 1 - Math.hypot(x + 420, z - 520) / 104;
  const forestEdge = (fbm(x * .035 + 90, z * .035 - 40) - .5) * .3;
  if (Math.max(forestPatchA, forestPatchB,forestPatchC,forestPatchD) + forestEdge > .08 && h < 9.5) return { id: 'forest', name: BIOME_NAMES.forest };
  if (climate > 0.61) return { id: 'forest', name: BIOME_NAMES.forest };
  return { id: 'meadow', name: BIOME_NAMES.meadow };
}

const C_SAND = new THREE.Color(0xdbc27f);
const C_GRASS_A = new THREE.Color(0x6ab944);
const C_GRASS_B = new THREE.Color(0x4d9636);
const C_GRASS_DRY = new THREE.Color(0x9fae4a);
// Warmes Kalkstein-Grau wie in den Alpenfotos statt kühlem Blaugrau.
const C_ROCK = new THREE.Color(0x97928a);
const C_SNOW = new THREE.Color(0xf2f4f8);

const SKY_DAY = new THREE.Color(0x7ec8e8);
const SKY_DUSK = new THREE.Color(0xf79862);
const SKY_NIGHT = new THREE.Color(0x0d1226);
const SKY_STORM = new THREE.Color(0x59626b);
const SUN_DAY = new THREE.Color(0xfff2cc);
const SUN_DUSK = new THREE.Color(0xff9d5c);
const HORIZON_DAY = new THREE.Color(0xdcebf2);
const HORIZON_NIGHT = new THREE.Color(0x27314a);
const SKY_GROUND = new THREE.Color(0x50645a);
const SUN_TINT_LOW = new THREE.Color(0xff9d55);
const SUN_TINT_HIGH = new THREE.Color(0xfff0c4);
const CLOUD_DAY = new THREE.Color(0xffffff);
const CLOUD_DUSK = new THREE.Color(0xffc9a4);
const CLOUD_NIGHT = new THREE.Color(0x39445e);
const CLOUD_STORM = new THREE.Color(0x76818c);
const WATER_SHALLOW_DAY = new THREE.Color(0x35c4c6);
const WATER_DEEP_DAY = new THREE.Color(0x1173ad);
const WATER_SHALLOW_NIGHT = new THREE.Color(0x14374a);
const WATER_DEEP_NIGHT = new THREE.Color(0x081c30);
const SHORE_FOAM_DAY = new THREE.Color(0xddeff0);
const SHORE_FOAM_NIGHT = new THREE.Color(0x7895a8);

function noiseTexture(size = 128, seed = 71) {
  const rand = mulberry32(seed);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const broad = Math.sin(x * 0.24) * 11 + Math.cos(y * 0.19) * 9;
      const value = THREE.MathUtils.clamp(128 + broad + (rand() - 0.5) * 54, 0, 255);
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class World {
  constructor(scene, { lowPowerDevice = false } = {}) {
    this.scene = scene;
    // Obergrenze für die Nebel-Distanz. Senkt die adaptive Qualitätsregelung
    // die Objekt-Sichtweite, zieht sie den Nebel mit heran, damit entfernte
    // Objekte im Nebel verschwinden statt sichtbar aus dem Nichts zu ploppen.
    this.fogFarCap = Infinity;
    this.lowPowerDevice = lowPowerDevice;
    this.t = 0.3; // Tageszeit 0..1 (0 = Mitternacht)
    this.day = 1;
    this.night = false;
    this.elevation = 1;
    this._sunDir = new THREE.Vector3();
    this._moonDir = new THREE.Vector3();
    // Getrennter Ziel- und Anzeigewert verhindert sichtbare Farbsprünge, wenn
    // Schlafen, Koop-Synchronisation oder ein Wetterwechsel die Zielstimmung
    // innerhalb eines Frames deutlich versetzen.
    this._skyTarget = new THREE.Color(SKY_DAY);
    this._skyBase = new THREE.Color(SKY_DAY);
    this._horizonTarget = new THREE.Color(HORIZON_DAY);

    scene.background = new THREE.Color(SKY_DAY);
    scene.fog = new THREE.Fog(SKY_DAY.clone(), 60, 260);

    this.buildTerrain();
    this.buildTrails();
    this.buildWater();
    this.buildRiverCrossings();
    this.buildLights();
    this.buildSky();
    this.buildGrass();
    this.buildAssetGroundCover();
    this.buildReeds();
    this.buildGroundDetails();
    this.buildMicroDetails();
    this.buildFireflies();
    this.buildAmbientMoments();
    this.buildClouds();
    this.buildBirds();
    this.buildRain();
  }

  buildTerrain() {
    const segments = this.lowPowerDevice ? 236 : SEGS;
    configureTerrainSurface(segments);
    let g = new THREE.PlaneGeometry(SIZE, SIZE, segments, segments);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i), 'visual'));
    }
    g.computeVertexNormals();

    // Weiche, höhen- und biomeabhängige Vertex-Farben. Das erhält die klare
    // Lesbarkeit der Welt, ohne dass jedes Terrain-Dreieck als Facette auffällt.
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const col = new THREE.Color();
    const normal = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const cx = p.getX(i), cy = p.getY(i), cz = p.getZ(i);
      const ny = normal.getY(i);
      if (cy < .7) col.copy(C_SAND);
      else if (cy < 1.35) {
        col.lerpColors(C_SAND, C_GRASS_DRY, THREE.MathUtils.smoothstep(cy, .7, 1.35));
      }
      else if (cy > 17) col.copy(C_SNOW);
      else if (ny < 0.72 || cy > 9.5) {
        col.copy(C_ROCK);
        if (cy > 13) col.lerp(C_SNOW, THREE.MathUtils.smoothstep(cy, 13, 17));
      }
      else {
        const m = fbm(cx * 0.03 + 40, cz * 0.03 + 40);
        col.lerpColors(C_GRASS_A, C_GRASS_B, THREE.MathUtils.clamp((m - 0.3) * 2.4, 0, 1));
        if (m > 0.62) col.lerp(C_GRASS_DRY, 0.55);
        const biome = biomeAt(cx, cz).id;
        if (biome === 'forest') col.lerp(new THREE.Color(0x285f35), 0.38);
        else if (biome === 'marsh') col.lerp(new THREE.Color(0x66704a), 0.48);
      }
      // Feines Erd- und Feuchtigkeitsrauschen verhindert große Farbflächen.
      const jitter = (fbm(cx * 0.35, cz * 0.35) - 0.5) * 0.065;
      col.offsetHSL(0, 0, jitter);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const bump = noiseTexture(128, 701);
    bump.repeat.set(95, 95);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: false, roughness: 0.94,
      bumpMap: bump, bumpScale: 0.18,
    });
    this.terrain = new THREE.Mesh(g, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  buildTrails() {
    this.trails = [];
    const material = new THREE.MeshStandardMaterial({ color: 0x8a7148, roughness: 1, metalness: 0 });
    for (let pathIndex = 0; pathIndex < TRAIL_PATHS.length; pathIndex++) {
      const control = TRAIL_PATHS[pathIndex];
      const samples = [];
      for (let segment = 1; segment < control.length; segment++) {
        const a = control[segment - 1], b = control[segment];
        const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(2, Math.ceil(distance / 3));
        for (let i = segment === 1 ? 0 : 1; i <= steps; i++) {
          const t = i / steps;
          samples.push([THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t)]);
        }
      }

      const positions = [], colors = [], indices = [];
      const color = new THREE.Color();
      for (let i = 0; i < samples.length; i++) {
        const prev = samples[Math.max(0, i - 1)], next = samples[Math.min(samples.length - 1, i + 1)];
        const tx = next[0] - prev[0], tz = next[1] - prev[1];
        const length = Math.hypot(tx, tz) || 1;
        const px = -tz / length, pz = tx / length;
        const width = 1.25 + Math.sin(i * 1.73 + pathIndex) * .18;
        for (const side of [-1, 1]) {
          const x = samples[i][0] + px * width * side;
          const z = samples[i][1] + pz * width * side;
          positions.push(x, terrainHeight(x, z) + .045, z);
          color.setHex(0x8a7148).offsetHSL(0, 0, Math.sin(i * 2.1 + side) * .025);
          colors.push(color.r, color.g, color.b);
        }
        if (i < samples.length - 1) {
          const base = i * 2;
          indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const trail = new THREE.Mesh(geometry, material.clone());
      trail.material.vertexColors = true;
      trail.receiveShadow = true;
      trail.name = `trail-${pathIndex + 1}`;
      this.scene.add(trail);
      this.trails.push(trail);
    }
  }

  buildRiverCrossings() {
    this.riverCrossings = new THREE.Group();
    this.riverCrossings.name = 'Steinfurten';
    const colors = [0x777b79,0x656b69,0x858983,0x59615f];
    for(let crossingIndex=0;crossingIndex<RIVER_CROSSINGS.length;crossingIndex++) {
      const crossing=RIVER_CROSSINGS[crossingIndex],c=Math.cos(crossing.rotation),s=Math.sin(crossing.rotation);
      let stoneIndex=0;
      for(let along=-crossing.length;along<=crossing.length;along+=1.72) for(const across of [-1.55,0,1.55]) {
        const jitter=Math.sin((stoneIndex+1)*12.31+crossingIndex)*.16;
        const x=crossing.x+c*(along+jitter)+s*across;
        const z=crossing.z-s*(along+jitter)+c*across;
        const stone=new THREE.Mesh(
          new THREE.DodecahedronGeometry(.72+(stoneIndex%3)*.055,0),
          new THREE.MeshStandardMaterial({color:colors[stoneIndex%colors.length],roughness:.98}),
        );
        stone.position.set(x,Math.max(WATER_Y+.12,terrainHeight(x,z)+.08),z);
        stone.scale.set(1.24+(stoneIndex%2)*.12,.28,1.02+(stoneIndex%3)*.07);
        stone.rotation.set((stoneIndex%2?1:-1)*.035,crossing.rotation+(stoneIndex%3-1)*.055,(stoneIndex%3-1)*.025);
        stone.castShadow=true;stone.receiveShadow=true;
        this.riverCrossings.add(stone);
        stoneIndex++;
      }
    }
    this.scene.add(this.riverCrossings);
  }

  buildWater() {
    const waterBump = noiseTexture(128, 812);
    waterBump.repeat.set(84, 84);

    // Terrainhöhe einmalig in eine Tiefenkarte backen. Der Fragment-Shader
    // liest daraus die Wassertiefe: flaches Wasser wird türkis und
    // durchsichtiger, tiefes Wasser satt blau — plus Schaumsaum am Ufer.
    // Muss die Terrainkante überragen, sonst bricht das Meer sichtbar ab.
    const WATER_PLANE_SIZE = SIZE + 540;
    const depthSize = 384;
    const depthData = new Uint8Array(depthSize * depthSize);
    for (let ty = 0; ty < depthSize; ty++) {
      const z = (ty / (depthSize - 1) - 0.5) * WATER_PLANE_SIZE;
      for (let tx = 0; tx < depthSize; tx++) {
        const x = (tx / (depthSize - 1) - 0.5) * WATER_PLANE_SIZE;
        const depth = THREE.MathUtils.clamp((WATER_Y - terrainHeight(x, z)) / 14, 0, 1);
        depthData[ty * depthSize + tx] = Math.round(depth * 255);
      }
    }
    const depthMap = new THREE.DataTexture(depthData, depthSize, depthSize, THREE.RedFormat);
    depthMap.wrapS = depthMap.wrapT = THREE.ClampToEdgeWrapping;
    depthMap.minFilter = THREE.LinearFilter;
    depthMap.magFilter = THREE.LinearFilter;
    depthMap.needsUpdate = true;

    const waterUniforms = {
      uWaterTime: { value: 0 },
      uWaveStrength: { value: 1 },
      uWaterWind: { value: new THREE.Vector2(.35, .15) },
      uWaterHorizon: { value: new THREE.Color(0xa8d6e5) },
      uDepthMap: { value: depthMap },
      uPlaneSize: { value: WATER_PLANE_SIZE },
      uShallowColor: { value: new THREE.Color(0x41b1b8) },
      uDeepColor: { value: new THREE.Color(0x155e8e) },
    };
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x257aa9, transparent: true, opacity: 0.82, depthWrite: false,
      roughness: 0.11, metalness: 0, clearcoat: 1,
      clearcoatRoughness: 0.075, ior: 1.333, reflectivity: .78,
      specularIntensity: 1, bumpMap: waterBump, bumpScale: 0.17,
      emissive: 0x05283a, emissiveIntensity: 0.1,
    });
    mat.userData.waterUniforms = waterUniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, waterUniforms);
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        uniform float uWaterTime;
        uniform float uWaveStrength;
        uniform vec2 uWaterWind;
        float wildnisWave(vec2 p) {
          vec2 d1 = normalize(vec2(.84,.54) + uWaterWind * .22);
          vec2 d2 = normalize(vec2(-.38,.93) + uWaterWind * .16);
          return (sin(dot(p,d1)*.034 + uWaterTime*1.08)*.13
            + sin(dot(p,d2)*.061 - uWaterTime*.82)*.065
            + sin((p.x+p.y)*.118 + uWaterTime*1.42)*.024) * uWaveStrength;
        }
        vec2 wildnisWaveSlope(vec2 p) {
          vec2 d1 = normalize(vec2(.84,.54) + uWaterWind * .22);
          vec2 d2 = normalize(vec2(-.38,.93) + uWaterWind * .16);
          float a = cos(dot(p,d1)*.034 + uWaterTime*1.08)*.13*.034;
          float b = cos(dot(p,d2)*.061 - uWaterTime*.82)*.065*.061;
          float c = cos((p.x+p.y)*.118 + uWaterTime*1.42)*.024*.118;
          return (d1*a + d2*b + vec2(c)) * uWaveStrength;
        }`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vec2 wildnisSlope = wildnisWaveSlope(position.xy);
        objectNormal = normalize(vec3(-wildnisSlope.x, -wildnisSlope.y, 1.0));`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying vec2 vWildnisXZ;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.z += wildnisWave(position.xy);
        // Die Plane liegt via rotation.x=-PI/2 im Raum: Welt-XZ = (x, -y).
        vWildnisXZ = vec2(position.x, -position.y);`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uWaterHorizon;
        uniform float uWaterTime;
        uniform sampler2D uDepthMap;
        uniform float uPlaneSize;
        uniform vec3 uShallowColor;
        uniform vec3 uDeepColor;
        varying vec2 vWildnisXZ;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Die Wurzelhöhle sinkt unter den Meeresspiegel, ist geologisch aber
        // geschlossen und trocken. Die globale Wasserfläche darf den Tunnel
        // deshalb nicht wie eine horizontale Glasscheibe durchschneiden.
        if (abs(vWildnisXZ.x + 185.0) < 4.7 && vWildnisXZ.y > 123.5 && vWildnisXZ.y < 147.5) discard;
        float wildnisDepth = texture2D(uDepthMap, vWildnisXZ / uPlaneSize + 0.5).r;
        diffuseColor.rgb = mix(uShallowColor, uDeepColor, smoothstep(0.015, 0.5, wildnisDepth));
        // Weicher, atmender Schaumsaum entlang der Uferlinie.
        float foamBand = 1.0 - smoothstep(0.012, 0.085, wildnisDepth);
        float foamPulse = 0.6 + 0.4 * sin(uWaterTime * 1.5 + wildnisDepth * 160.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 0.97), foamBand * foamPulse * 0.8);
        // Flaches Wasser ist durchsichtiger, tiefes deckender.
        diffuseColor.a *= mix(0.6, 1.0, smoothstep(0.0, 0.3, wildnisDepth));
        float wildnisFresnel = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.2);
        diffuseColor.rgb = mix(diffuseColor.rgb, uWaterHorizon, wildnisFresnel * .38);`,
      );
    };
    mat.customProgramCacheKey = () => 'wildnis-water-v5';

    const waterSegments = this.lowPowerDevice ? 64 : 120;
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(WATER_PLANE_SIZE, WATER_PLANE_SIZE, waterSegments, waterSegments), mat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y;
    this.water.renderOrder = -1;
    this.scene.add(this.water);

    // Dünne, unterbrochene Schaumbänder folgen der prozeduralen Höhenlinie
    // des Ufers. Instancing hält hunderte Segmente bei einem Draw Call.
    const foamMax = this.lowPowerDevice ? 90 : 280;
    const foamGeo = new THREE.RingGeometry(.55, 1, 12, 1, .15, Math.PI * 1.7);
    foamGeo.rotateX(-Math.PI / 2);
    const foamMat = new THREE.MeshBasicMaterial({
      color:0xddeff0, transparent:true, opacity:.18, depthWrite:false,
      side:THREE.DoubleSide, fog:true,
    });
    this.shoreFoam = new THREE.InstancedMesh(foamGeo, foamMat, foamMax);
    this.shoreFoam.renderOrder = 1;
    const rand = mulberry32(41821), matrix = new THREE.Matrix4();
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const placed = [];
    let foamCount = 0;
    for (let tries=0; foamCount<foamMax && tries<foamMax*80; tries++) {
      const x=(rand()-.5)*2*(WORLD_RADIUS-5), z=(rand()-.5)*2*(WORLD_RADIUS-5);
      const h=terrainHeight(x,z);
      if(h<-.11||h>.13)continue;
      const gx=terrainHeight(x+1.2,z)-terrainHeight(x-1.2,z);
      const gz=terrainHeight(x,z+1.2)-terrainHeight(x,z-1.2);
      const gradient=Math.hypot(gx,gz);
      if(gradient<.045||gradient>2.1)continue;
      if(placed.some((p)=>Math.hypot(p.x-x,p.z-z)<3.1))continue;
      placed.push({x,z});
      position.set(x,WATER_Y+.035,z);
      euler.set(0,Math.atan2(gz,gx)+Math.PI/2,0);rotation.setFromEuler(euler);
      const s=.72+rand()*.95;scale.set(s*(1.6+rand()*1.5),1,s*(.35+rand()*.3));
      matrix.compose(position,rotation,scale);this.shoreFoam.setMatrixAt(foamCount++,matrix);
    }
    this.shoreFoam.count=foamCount;
    this.shoreFoam.instanceMatrix.needsUpdate=true;
    this.shoreFoam.computeBoundingSphere();
    this.scene.add(this.shoreFoam);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x486b3a, 0.7);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2cc, 2.4);
    this.sun.castShadow = true;
    // Desktop verträgt die 4-fache Schattenauflösung problemlos, weil die
    // Shadowmap ohnehin nur mit ~10 Hz neu gerendert wird (s. main.js).
    const shadowRes = this.lowPowerDevice ? 1024 : 2048;
    this.sun.shadow.mapSize.set(shadowRes, shadowRes);
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.camera.left = -48;
    this.sun.shadow.camera.right = 48;
    this.sun.shadow.camera.top = 48;
    this.sun.shadow.camera.bottom = -48;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.moon = new THREE.DirectionalLight(0x8899dd, 0);
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);
  }

  buildSky() {
    // Ein farbiger Himmelsdom ersetzt die flache Hintergrundfarbe. Der Dom
    // folgt dem Spieler, sodass Horizont und Zenit auch am Weltrand stimmen.
    this.skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(610, 32, 18),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          topColor: { value: new THREE.Color(0x468fc2) },
          horizonColor: { value: new THREE.Color(0xc9e4e8) },
          bottomColor: { value: new THREE.Color(0x77978d) },
          sunDirection: { value: new THREE.Vector3(0, 1, 0) },
          sunTint: { value: new THREE.Color(0xffe3b0) },
          sunHaze: { value: 0 },
        },
        vertexShader: `varying vec3 vWorldDir; void main(){vWorldDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        // Atmosphärischer Verlauf mit Sonnen-Streulicht: ein enger heller Kranz
        // um die Sonne plus ein breiter warmer Schleier zum Horizont hin.
        // Das Dithering bricht sichtbare Farbbänder im weichen Verlauf auf.
        fragmentShader: `varying vec3 vWorldDir;
          uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 bottomColor;
          uniform vec3 sunDirection;uniform vec3 sunTint;uniform float sunHaze;
          void main(){
            vec3 d=normalize(vWorldDir);
            float h=d.y;
            vec3 c=h>0.0
              ? mix(horizonColor,topColor,pow(smoothstep(0.0,.82,h),.82))
              : mix(horizonColor,bottomColor,smoothstep(0.0,.22,-h));
            float s=max(dot(d,normalize(sunDirection)),0.0);
            float horizonBoost=1.0-smoothstep(0.0,.5,abs(h));
            c+=sunTint*(pow(s,24.0)*.5+pow(s,4.0)*.16+pow(s,1.6)*.10*horizonBoost)*sunHaze;
            float n=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
            c+=(n-.5)*.012;
            gl_FragColor=vec4(c,1.0);
          }`,
      })
    );
    this.skyDome.renderOrder = -1000;
    this.scene.add(this.skyDome);

    // HDR-Farbe (>1): unter ACES brennt die Scheibe weiß aus, und der
    // Bloom-Pass auf Desktop zieht einen echten Glüh-Kranz um die Sonne.
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(10, 12, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffdf7a).multiplyScalar(2.4), fog: false })
    );
    this.scene.add(this.sunMesh);

    // Weicher Lichtkranz: eine transparente Kugel, auch auf
    // Mobilgeraeten deutlich billiger als ein Post-Processing-Bloom-Pass.
    this.sunGlow = new THREE.Mesh(
      new THREE.SphereGeometry(18, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffc85c, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })
    );
    this.scene.add(this.sunGlow);

    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(7, 10, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe6ff).multiplyScalar(1.7), fog: false })
    );
    this.scene.add(this.moonMesh);

    this.moonGlow = new THREE.Mesh(
      new THREE.SphereGeometry(12, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0x9fb8ff, transparent: true, opacity: 0.11,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })
    );
    this.scene.add(this.moonGlow);

    // Sterne
    const rand = mulberry32(99);
    const n = 450;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const az = rand() * Math.PI * 2;
      const el = Math.asin(rand() * 0.95 + 0.05);
      const r = 400;
      arr[i * 3] = Math.cos(az) * Math.cos(el) * r;
      arr[i * 3 + 1] = Math.sin(el) * r;
      arr[i * 3 + 2] = Math.sin(az) * Math.cos(el) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false,
    }));
    this.scene.add(this.stars);
  }

  buildGrass() {
    const rand = mulberry32(4242);
    // Ein Büschel besteht aus mehreren flachen, spitz zulaufenden Halmen statt
    // aus einem Kegel. DoubleSide hält sie aus jedem Blickwinkel sichtbar.
    const bladePositions = [];
    const blades = [
      [0,0,.82,0],[-.1,.05,.58,.9],[.11,-.03,.68,1.75],[-.04,-.1,.48,2.6],[.08,.1,.55,3.45],[-.13,-.05,.72,4.35],
    ];
    for (const [ox,oz,height,angle] of blades) {
      const width=.055, rx=Math.cos(angle)*width, rz=Math.sin(angle)*width;
      const leanX=Math.sin(angle)*height*.12, leanZ=-Math.cos(angle)*height*.12;
      bladePositions.push(
        ox-rx,0,oz-rz, ox+rx,0,oz+rz, ox+leanX,height,oz+leanZ,
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(bladePositions,3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color:0xffffff, side:THREE.DoubleSide, roughness:1, flatShading:true });
    // Die detaillierten Pack-Gräser ergänzen diese günstige Fernvegetation.
    // Günstige Instanzen füllen auch die weiten Ebenen zwischen den größeren
    // Asset-Büscheln. Auf schwachen Geräten bleibt das Budget deutlich kleiner.
    const count = this.lowPowerDevice ? 4400 : 17000;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    const cA = new THREE.Color(0x78b94a), cB = new THREE.Color(0x3f7f35);
    const forestA = new THREE.Color(0x3f7434), forestB = new THREE.Color(0x264f2d);
    const marshA = new THREE.Color(0x687847), marshB = new THREE.Color(0x44583b);
    const col = new THREE.Color();
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 30) {
      tries++;
      const x = (rand() - 0.5) * 2 * (WORLD_RADIUS - 5);
      const z = (rand() - 0.5) * 2 * (WORLD_RADIUS - 5);
      const h = terrainHeight(x, z);
      if (h < 0.6 || h > 7.5 || terrainSlope(x, z) > 0.5) continue;
      if (distanceToTrail(x, z) < 2.75) continue;
      const biome = biomeAt(x,z).id;
      v.set(x, h+.015, z);
      // Leichte gemeinsame Neigung lässt Windrichtung erkennen, ohne dass die
      // Halme wie starre, senkrechte Spitzen wirken.
      const windLean=.05+rand()*.11;
      eul.set(windLean, rand() * Math.PI, (rand()-.5)*.08);
      q.setFromEuler(eul);
      const sc = 0.62 + rand() * 1.0;
      s.set(sc*(.82+rand()*.35), sc, sc*(.82+rand()*.35));
      m.compose(v, q, s);
      mesh.setMatrixAt(placed, m);
      if(biome==='forest')col.lerpColors(forestA,forestB,rand());
      else if(biome==='marsh')col.lerpColors(marshA,marshB,rand());
      else col.lerpColors(cA,cB,rand());
      col.offsetHSL((rand()-.5)*.025,(rand()-.5)*.06,(rand()-.5)*.055);
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  buildAssetGroundCover() {
    this.assetGroundCover = [];
    this.groundCoverReady = Promise.all([
      groundCoverTextureLoader.loadAsync(GROUND_COVER_TEXTURE_URL),
      ...GROUND_COVER_SPECS.map((spec) => loadGroundCoverGeometry(spec.url)),
    ]).then(([paletteTexture, ...geometries]) => {
      paletteTexture.colorSpace = THREE.SRGBColorSpace;
      paletteTexture.wrapS = paletteTexture.wrapT = THREE.ClampToEdgeWrapping;
      paletteTexture.minFilter = THREE.LinearMipmapLinearFilter;
      paletteTexture.magFilter = THREE.NearestFilter;
      paletteTexture.anisotropy = 2;

      const material = new THREE.MeshStandardMaterial({
        map: paletteTexture,
        roughness: .94,
        metalness: 0,
        side: THREE.DoubleSide,
      });

      GROUND_COVER_SPECS.forEach((spec, index) => {
        const count = this.lowPowerDevice ? spec.lowCount : spec.count;
        const mesh = new THREE.InstancedMesh(geometries[index], material, count);
        mesh.name = `ground-cover-${spec.name}`;
        mesh.castShadow = false;
        mesh.receiveShadow = false;

        const rand = mulberry32(spec.seed);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const euler = new THREE.Euler();
        let placed = 0;

        for (let tries = 0; placed < count && tries < count * 55; tries++) {
          // Kreisförmige Verteilung vermeidet die sichtbaren dichten Ecken
          // einer quadratischen Spawnfläche.
          const angle = rand() * Math.PI * 2;
          const distance = Math.sqrt(rand()) * spec.radius;
          const x = Math.cos(angle) * distance;
          const z = Math.sin(angle) * distance;
          const h = terrainHeight(x, z);
          const slope = terrainSlope(x, z);
          const biome = biomeAt(x, z).id;

          if (distanceToTrail(x, z) < (spec.kind === 'bush' ? 3.2 : 2.45)) continue;

          if (spec.kind === 'grass' && (h < .62 || h > 7.3 || slope > .46 || biome === 'alpine')) continue;
          if (spec.kind === 'flower' && (h < .8 || h > 6.2 || slope > .34 || !['meadow', 'forest'].includes(biome))) continue;
          if (spec.kind === 'mushroom' && (h < .58 || h > 5.8 || slope > .4 || !['forest', 'marsh'].includes(biome))) continue;
          if (spec.kind === 'bush' && (h < .7 || h > 6.7 || slope > .36 || !['forest', 'marsh'].includes(biome))) continue;

          position.set(x, h + .012, z);
          euler.set((rand() - .5) * .05, rand() * Math.PI * 2, (rand() - .5) * .05);
          rotation.setFromEuler(euler);
          const uniformScale = THREE.MathUtils.lerp(spec.scale[0], spec.scale[1], rand());
          scale.set(
            uniformScale * (.88 + rand() * .2),
            uniformScale * (.9 + rand() * .22),
            uniformScale * (.88 + rand() * .2),
          );
          matrix.compose(position, rotation, scale);
          mesh.setMatrixAt(placed++, matrix);
        }

        mesh.count = placed;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
        this.assetGroundCover.push(mesh);
      });
    }).catch((error) => {
      console.warn('Ground-cover assets konnten nicht geladen werden.', error);
    });
  }

  buildReeds() {
    const rand = mulberry32(6060);
    const geo = new THREE.CylinderGeometry(0.025, 0.035, 0.9, 5);
    geo.translate(0, 0.42, 0);
    const reedCount = this.lowPowerDevice ? 420 : 1150;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x668f45, flatShading: false, roughness: 0.96 }), reedCount);
    const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    let placed = 0;
    for (let tries = 0; placed < reedCount && tries < reedCount * 38; tries++) {
      const x = (rand() - 0.5) * 430, z = (rand() - 0.5) * 430;
      const h = terrainHeight(x, z);
      if (h < -0.18 || h > 0.48 || terrainSlope(x, z) > 0.5) continue;
      pos.set(x, h, z);
      const s = 0.65 + rand() * 0.8;
      scale.set(s, s, s);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(placed++, matrix);
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
  }

  buildGroundDetails() {
    const rand = mulberry32(9091);
    const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
    const quat = new THREE.Quaternion(), euler = new THREE.Euler();

    // Umgestürzte, bemooste Stämme machen Wälder lesbarer und weniger leer.
    const logGeo = new THREE.CylinderGeometry(0.16, 0.23, 2.5, 7);
    const logMax = this.lowPowerDevice ? 80 : 230;
    const logs = new THREE.InstancedMesh(logGeo, new THREE.MeshStandardMaterial({ color:0x59422c, roughness:1, flatShading:false }), logMax);
    let logCount = 0;
    for (let tries=0; logCount<logMax && tries<logMax*80; tries++) {
      const x=(rand()-.5)*2*(WORLD_RADIUS-10),z=(rand()-.5)*2*(WORLD_RADIUS-10),h=terrainHeight(x,z);
      if (h<.7||h>6.5||terrainSlope(x,z)>.34||biomeAt(x,z).id!=='forest'||distanceToTrail(x,z)<3.2) continue;
      pos.set(x,h+.18,z); euler.set(Math.PI/2+(rand()-.5)*.1,rand()*Math.PI,(rand()-.5)*.12); quat.setFromEuler(euler);
      const s=.7+rand()*.75; scale.set(s,s,s); matrix.compose(pos,quat,scale); logs.setMatrixAt(logCount++,matrix);
    }
    logs.count=logCount; logs.instanceMatrix.needsUpdate=true; logs.castShadow=true; logs.receiveShadow=true; this.scene.add(logs);

    // Helles Geröll markiert Gebirge schon aus der Entfernung.
    const rockGeo=new THREE.DodecahedronGeometry(.45,0);
    const screeMax=this.lowPowerDevice?150:460;
    const scree=new THREE.InstancedMesh(rockGeo,new THREE.MeshStandardMaterial({color:0x777b7d,roughness:1,flatShading:false}),screeMax);
    let rockCount=0;
    for(let tries=0;rockCount<screeMax&&tries<screeMax*55;tries++){
      const x=(rand()-.5)*2*(WORLD_RADIUS-10),z=(rand()-.5)*2*(WORLD_RADIUS-10),h=terrainHeight(x,z);
      if(h<6.7||terrainSlope(x,z)>.82)continue;
      pos.set(x,h+.12,z);euler.set(rand(),rand()*Math.PI,rand());quat.setFromEuler(euler);const s=.28+rand()*.9;scale.set(s, s*(.55+rand()*.55), s);matrix.compose(pos,quat,scale);scree.setMatrixAt(rockCount++,matrix);
    }
    scree.count=rockCount;scree.instanceMatrix.needsUpdate=true;scree.castShadow=true;scree.receiveShadow=true;this.scene.add(scree);

    // Treibholz liegt nicht nur direkt an der Wasserlinie, sondern auch im
    // trockenen Spülsaum. Dadurch liest sich die Sandzone als echter Strand.
    const driftGeo=new THREE.CylinderGeometry(.07,.1,1.7,6);
    const driftMax=this.lowPowerDevice?75:210;
    const drift=new THREE.InstancedMesh(driftGeo,new THREE.MeshStandardMaterial({color:0x8d7452,roughness:1,flatShading:false}),driftMax);
    let driftCount=0;
    for(let tries=0;driftCount<driftMax&&tries<driftMax*90;tries++){
      const x=(rand()-.5)*2*(WORLD_RADIUS-10),z=(rand()-.5)*2*(WORLD_RADIUS-10),h=terrainHeight(x,z);
      if(h<.12||h>1.05||terrainSlope(x,z)>.42)continue;
      pos.set(x,h+.09,z);euler.set(Math.PI/2,rand()*Math.PI,(rand()-.5)*.08);quat.setFromEuler(euler);const s=.55+rand()*.9;scale.set(s,s,s);matrix.compose(pos,quat,scale);drift.setMatrixAt(driftCount++,matrix);
    }
    drift.count=driftCount;drift.instanceMatrix.needsUpdate=true;drift.castShadow=true;this.scene.add(drift);
  }

  buildMicroDetails() {
    const rand = mulberry32(21991);
    const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
    const quat = new THREE.Quaternion(), euler = new THREE.Euler();

    // Kleine Steine brechen die sonst zu saubere Bodenfläche in allen Biomen.
    const pebbleMax = this.lowPowerDevice ? 650 : 3000;
    const pebbleGeo = new THREE.DodecahedronGeometry(0.13, 0);
    const pebbles = new THREE.InstancedMesh(pebbleGeo, new THREE.MeshStandardMaterial({ color: 0x777a73, roughness: 0.95 }), pebbleMax);
    const pebbleColor = new THREE.Color();
    let pebbleCount = 0;
    for (let tries = 0; pebbleCount < pebbleMax && tries < pebbleMax * 24; tries++) {
      const x = (rand() - .5) * 2 * (WORLD_RADIUS - 6), z = (rand() - .5) * 2 * (WORLD_RADIUS - 6);
      const h = terrainHeight(x, z);
      if (h < .45 || h > 10.5 || terrainSlope(x, z) > .78) continue;
      pos.set(x, h + .035, z); euler.set(rand() * .5, rand() * Math.PI * 2, rand() * .5); quat.setFromEuler(euler);
      const s = .45 + rand() * 1.8; scale.set(s * (.7 + rand() * .8), s * (.35 + rand() * .35), s); matrix.compose(pos, quat, scale);
      pebbles.setMatrixAt(pebbleCount, matrix);
      pebbleColor.setHex(h > 7 ? 0x858989 : h < .7 ? 0xb59e71 : 0x6f7169).offsetHSL(0, 0, (rand() - .5) * .1);
      pebbles.setColorAt(pebbleCount++, pebbleColor);
    }
    pebbles.count = pebbleCount; pebbles.instanceMatrix.needsUpdate = true;
    if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
    pebbles.castShadow = !this.lowPowerDevice; pebbles.receiveShadow = true; this.scene.add(pebbles);

    // Kleine Muschelschalen geben dem breiten Sandband einen eigenen Charakter.
    // Eine einzige instanzierte Geometrie hält den zusätzlichen Aufwand gering.
    const shellMax = this.lowPowerDevice ? 90 : 280;
    const shellGeo = new THREE.SphereGeometry(.12, 7, 4, 0, Math.PI * 2, 0, Math.PI * .56);
    shellGeo.scale(1, .34, .72);
    const shells = new THREE.InstancedMesh(shellGeo, new THREE.MeshStandardMaterial({ color:0xffffff, roughness:.96 }), shellMax);
    const shellColor = new THREE.Color();
    const shellPalette = [0xe8d7b5, 0xd7b48e, 0xf0e3c9, 0xc98e78];
    let shellCount = 0;
    for (let tries = 0; shellCount < shellMax && tries < shellMax * 40; tries++) {
      const x = (rand() - .5) * 2 * (WORLD_RADIUS - 6), z = (rand() - .5) * 2 * (WORLD_RADIUS - 6);
      const h = terrainHeight(x, z);
      if (h < .5 || h > 1.22 || terrainSlope(x, z) > .38) continue;
      pos.set(x, h + .025, z); euler.set(0, rand() * Math.PI * 2, (rand() - .5) * .22); quat.setFromEuler(euler);
      const s = .45 + rand() * 1.1; scale.set(s * (.8 + rand() * .4), s, s); matrix.compose(pos, quat, scale);
      shells.setMatrixAt(shellCount, matrix);
      shellColor.setHex(shellPalette[Math.floor(rand() * shellPalette.length)]).offsetHSL(0, 0, (rand() - .5) * .06);
      shells.setColorAt(shellCount++, shellColor);
    }
    shells.count = shellCount; shells.instanceMatrix.needsUpdate = true;
    if (shells.instanceColor) shells.instanceColor.needsUpdate = true;
    shells.receiveShadow = true; this.scene.add(shells);

    // Laubstreu verdichtet Wälder visuell, ohne zusätzliche transparente Texturen.
    const leafMax = this.lowPowerDevice ? 620 : 2800;
    const leafGeo = new THREE.CircleGeometry(.11, 6); leafGeo.rotateX(-Math.PI / 2);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }), leafMax);
    const leafColor = new THREE.Color();
    let leafCount = 0;
    const leafPalette = [0x6d4e2e, 0x8c6738, 0x9c7b3c, 0x4f572c];
    for (let tries = 0; leafCount < leafMax && tries < leafMax * 28; tries++) {
      const x = (rand() - .5) * 2 * (WORLD_RADIUS - 8), z = (rand() - .5) * 2 * (WORLD_RADIUS - 8), h = terrainHeight(x, z);
      if (h < .6 || h > 7 || terrainSlope(x, z) > .48 || biomeAt(x, z).id !== 'forest' || distanceToTrail(x,z)<2.8) continue;
      pos.set(x, h + .018, z); euler.set((rand() - .5) * .18, rand() * Math.PI * 2, (rand() - .5) * .18); quat.setFromEuler(euler);
      const s = .55 + rand() * 1.25; scale.set(s * (.55 + rand() * .8), s, s); matrix.compose(pos, quat, scale);
      leaves.setMatrixAt(leafCount, matrix); leafColor.setHex(leafPalette[Math.floor(rand() * leafPalette.length)]); leaves.setColorAt(leafCount++, leafColor);
    }
    leaves.count = leafCount; leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    leaves.receiveShadow = true; this.scene.add(leaves);
  }

  buildFireflies() {
    const rand = mulberry32(8080);
    const count = 130;
    // Jedes Glühwürmchen hat einen festen Anker im Wrap-Fenster. Die Punkte
    // liegen in Weltkoordinaten und schweben knapp über dem Terrain an ihrer
    // eigenen Position — sie laufen also weder mit dem Spieler mit, noch
    // hängen sie in der Luft vor Hügeln.
    this.fireflyData = [];
    for (let i = 0; i < count; i++) {
      this.fireflyData.push({
        ox: (rand() - 0.5) * 80, oz: (rand() - 0.5) * 80,
        hover: 0.35 + rand() * 1.6,
        phase: rand() * Math.PI * 2,
        speed: 0.5 + rand() * 0.9,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      // HDR-Farbe: lässt die Punkte im Desktop-Bloom als weiche Lichter glimmen.
      color: new THREE.Color(0xffee78).multiplyScalar(1.8), size: 3.2, sizeAttenuation: false,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);
  }

  updateFireflies(playerPos) {
    const arr = this.fireflies.geometry.attributes.position.array;
    const t = performance.now(), W = 80;
    for (let i = 0; i < this.fireflyData.length; i++) {
      const f = this.fireflyData[i];
      // Der Anker wird um Vielfache der Fenstergröße zum Spieler gewrappt —
      // die resultierende Weltposition ist stabil, solange man sich in der
      // Nähe bewegt, und taucht nur beim Fensterwechsel an neuer Stelle auf.
      const wx = f.ox + Math.round((playerPos.x - f.ox) / W) * W + Math.sin(t * 0.00025 * f.speed + f.phase) * 1.4;
      const wz = f.oz + Math.round((playerPos.z - f.oz) / W) * W + Math.cos(t * 0.0002 * f.speed + f.phase * 1.7) * 1.4;
      arr[i * 3] = wx;
      arr[i * 3 + 1] = terrainHeight(wx, wz) + f.hover + Math.sin(t * 0.0007 * f.speed + f.phase) * 0.25;
      arr[i * 3 + 2] = wz;
    }
    this.fireflies.geometry.attributes.position.needsUpdate = true;
  }

  buildAmbientMoments() {
    const rand=mulberry32(91821);
    const count=this.lowPowerDevice?34:82;
    const positions=new Float32Array(count*3);
    this.pollenDrift=[];
    for(let i=0;i<count;i++){
      positions[i*3]=(rand()-.5)*60;
      positions[i*3+1]=.5+rand()*8;
      positions[i*3+2]=(rand()-.5)*60;
      this.pollenDrift.push({rise:.04+rand()*.09,phase:rand()*Math.PI*2});
    }
    const pollenGeo=new THREE.BufferGeometry();
    pollenGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    this.pollen=new THREE.Points(pollenGeo,new THREE.PointsMaterial({
      color:new THREE.Color(0xffd98a).multiplyScalar(1.35),size:this.lowPowerDevice?.055:.075,
      transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,
    }));
    this.pollen.frustumCulled=false;this.scene.add(this.pollen);

    this.shootingStars=[];
    for(let i=0;i<3;i++){
      const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(-15,-4.5,3)]);
      const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xcfe8ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
      line.visible=false;line.userData.life=0;this.scene.add(line);this.shootingStars.push(line);
    }
    this.shootingStarTimer=18+rand()*28;
  }

  updateAmbientMoments(dt,playerPos,elev,rain) {
    const biome=biomeAt(playerPos.x,playerPos.z).id;
    const onLand=terrainHeight(playerPos.x,playerPos.z)>WATER_Y+.2;
    const pollenTarget=elev>.07&&rain<.22&&onLand&&['meadow','forest'].includes(biome) ? .58 : 0;
    this.pollen.material.opacity+=(pollenTarget-this.pollen.material.opacity)*Math.min(1,dt*.5);
    // Pollen leben in Weltkoordinaten: Wind treibt sie über die Landschaft,
    // gewrappt wird nur relativ zum Spieler — sie laufen nicht mehr mit ihm mit.
    const arr=this.pollen.geometry.attributes.position.array;
    for(let i=0;i<this.pollenDrift.length;i++){
      const drift=this.pollenDrift[i];
      arr[i*3]+=dt*(this.wind.x*.28+Math.sin(performance.now()*.00045+drift.phase)*.035);
      arr[i*3+1]+=dt*drift.rise;
      arr[i*3+2]+=dt*this.wind.z*.28;
      if(arr[i*3]-playerPos.x>30)arr[i*3]-=60;if(arr[i*3]-playerPos.x<-30)arr[i*3]+=60;
      if(arr[i*3+2]-playerPos.z>30)arr[i*3+2]-=60;if(arr[i*3+2]-playerPos.z<-30)arr[i*3+2]+=60;
      const ground=terrainHeight(arr[i*3],arr[i*3+2]);
      if(arr[i*3+1]>ground+8.5||arr[i*3+1]<ground)arr[i*3+1]=ground+.35;
    }
    this.pollen.geometry.attributes.position.needsUpdate=true;

    if(elev<-.16&&rain<.12){
      this.shootingStarTimer-=dt;
      if(this.shootingStarTimer<=0){
        const line=this.shootingStars.find(star=>star.userData.life<=0);
        if(line){
          line.visible=true;line.userData.life=.75+Math.random()*.45;
          line.position.set(playerPos.x+(Math.random()-.5)*150,75+Math.random()*35,playerPos.z-90-Math.random()*70);
          line.rotation.y=(Math.random()-.5)*.7;
          line.userData.velocity=new THREE.Vector3(25+Math.random()*16,-7-Math.random()*5,5+Math.random()*8);
        }
        this.shootingStarTimer=20+Math.random()*42;
      }
    }
    for(const star of this.shootingStars){
      if(star.userData.life<=0)continue;
      star.userData.life-=dt;star.position.addScaledVector(star.userData.velocity,dt);
      star.material.opacity=THREE.MathUtils.clamp(star.userData.life*2.4,0,.9);
      if(star.userData.life<=0){star.visible=false;star.material.opacity=0;}
    }
  }

  buildClouds() {
    this.clouds = [];
    const rand = mulberry32(777);
    // Facettierte, strahlend weiße Kumuluswolken statt grauer Blobs. Flat
    // Shading + Sonnenlicht ergibt helle Kuppen und schattige Unterseiten;
    // die Farbe wird in update() an Tageszeit und Wetter angepasst.
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.92,
      flatShading: true, roughness: 1, metalness: 0,
      emissive: 0xb8ccdd, emissiveIntensity: 0.42,
    });
    const count = this.lowPowerDevice ? 9 : 14;
    for (let i = 0; i < count; i++) {
      const grp = new THREE.Group();
      const parts = 4 + Math.floor(rand() * 4);
      // Ein großer Kernpuff, um den sich kleinere Puffs mit angehobener
      // Basis gruppieren — die flache Unterkante liest sich als Kumulus.
      for (let k = 0; k < parts; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), this.cloudMat);
        const core = k === 0;
        const sx = core ? 9 + rand() * 8 : 4 + rand() * 5;
        b.scale.set(sx, sx * (0.42 + rand() * 0.2), sx * (0.6 + rand() * 0.35));
        b.position.set(
          core ? 0 : (rand() - 0.5) * 20,
          core ? 0 : rand() * 2.2 - 0.4,
          core ? 0 : (rand() - 0.5) * 11,
        );
        b.rotation.y = rand() * Math.PI;
        grp.add(b);
      }
      grp.position.set((rand() - 0.5) * 1000, 62 + rand() * 46, (rand() - 0.5) * 1000);
      grp.scale.setScalar(0.75 + rand() * 0.85);
      grp.userData.speed = 1 + rand() * 1.5;
      this.scene.add(grp);
      this.clouds.push(grp);
    }
  }

  buildBirds() {
    this.birds = [];
    const rand = mulberry32(313);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b2b34, flatShading: true, roughness: 1 });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.5), mat);
        wing.position.x = s * 0.8;
        g.add(wing);
      }
      g.userData = {
        radius: 20 + rand() * 45,
        height: 32 + rand() * 24,
        speed: (0.08 + rand() * 0.12) * (rand() < 0.5 ? -1 : 1),
        phase: rand() * Math.PI * 2,
        flap: rand() * Math.PI * 2,
      };
      g.scale.setScalar(0.55 + rand() * 0.35);
      this.scene.add(g);
      this.birds.push(g);
    }
  }

  buildRain() {
    this.weather = 'clear';        // clear | rain | storm
    this.rainIntensity = 0;        // 0..1 gleitend
    this.weatherTimer = 45 + Math.random() * 45;
    // Im Koop steuert nur der Host das Wetter; der Gast folgt (autonom = false).
    this.weatherAutonomous = true;
    this.flash = 0;                // Blitz-Helligkeit (klingt ab)
    this.onThunder = null;         // Callback (dist 0..1) für Donner-Sound
    this._flashColor = new THREE.Color(0xdfe8ff);
    // Träger Wind statt Zufallswackeln: Richtung und Stärke ändern sich langsam.
    this.wind = { x: 0.35, z: 0.1, speed: 0.18, gust: 0, angle: 0.28 };
    this.windTarget = { angle: 0.28, speed: 0.2 };
    this.windTimer = 18 + Math.random() * 25;
    this.gustTimer = 5 + Math.random() * 9;

    const count = 1300;
    this.rainCount = count;
    this.rainRadius = 26;
    this.rainDrops = [];
    for (let i = 0; i < count; i++) {
      this.rainDrops.push({
        x: (Math.random() - 0.5) * 2 * this.rainRadius,
        z: (Math.random() - 0.5) * 2 * this.rainRadius,
        y: Math.random() * 24,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xaccbe6, transparent: true, opacity: 0 });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  // Setzt den Wetterzustand direkt (für den Koop-Gast, der dem Host folgt).
  setWeather(weather) {
    if (weather !== 'clear' && weather !== 'rain' && weather !== 'storm') return;
    this.weather = weather;
    this.weatherTimer = 40 + Math.random() * 40; // nur relevant, falls wieder autonom
  }

  updateWeather(dt) {
    // Wetterzustand periodisch wechseln – im Koop nur beim Host (autonom).
    if (this.weatherAutonomous) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        const r = Math.random();
        if (this.weather === 'clear') {
          this.weather = r < 0.32 ? 'rain' : r < 0.46 ? 'storm' : 'clear';
          this.weatherTimer = this.weather === 'clear' ? 40 + Math.random() * 45 : 40 + Math.random() * 40;
        } else {
          this.weather = r < 0.68 ? 'clear' : this.weather === 'rain' ? 'storm' : 'rain';
          this.weatherTimer = this.weather === 'clear' ? 60 + Math.random() * 60 : 25 + Math.random() * 35;
        }
      }
    }
    const target = this.weather === 'clear' ? 0 : this.weather === 'storm' ? 1 : 0.65;
    this.rainIntensity += (target - this.rainIntensity) * Math.min(1, dt * 0.4);
    if (this.rainIntensity < 0.001) this.rainIntensity = 0;

    // Blitz & Donner im Sturm
    this.flash *= Math.max(0, 1 - dt * 3.2);
    if (this.weather === 'storm' && this.rainIntensity > 0.55 && Math.random() < dt * 0.09) {
      this.flash = 1;
      const dist = 0.25 + Math.random() * 0.75; // 1 = nah
      const delay = (1 - dist) * 3200 + 250;
      if (this.onThunder) setTimeout(() => this.onThunder(dist), delay);
    }
  }

  updateWind(dt) {
    this.windTimer -= dt;
    if (this.windTimer <= 0) {
      this.windTarget.angle += (Math.random() - 0.5) * 1.35;
      const base = this.weather === 'storm' ? 0.82 : this.weather === 'rain' ? 0.5 : 0.2;
      this.windTarget.speed = THREE.MathUtils.clamp(base + (Math.random() - 0.5) * 0.25, 0.06, 1);
      this.windTimer = 22 + Math.random() * 38;
    }
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.wind.gust = (0.12 + Math.random() * 0.3) * (this.weather === 'storm' ? 1.6 : 1);
      this.gustTimer = 4 + Math.random() * 10;
    }
    this.wind.gust = Math.max(0, this.wind.gust - dt * 0.16);
    let delta = this.windTarget.angle - this.wind.angle;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.wind.angle += delta * Math.min(1, dt * 0.08);
    this.wind.speed += (this.windTarget.speed - this.wind.speed) * Math.min(1, dt * 0.12);
    const force = THREE.MathUtils.clamp(this.wind.speed + this.wind.gust, 0, 1.25);
    this.wind.x = Math.cos(this.wind.angle) * force;
    this.wind.z = Math.sin(this.wind.angle) * force;
  }

  updateRain(dt, playerPos) {
    const mat = this.rain.material;
    mat.opacity = this.rainIntensity * 0.5;
    if (this.rainIntensity <= 0.01) { this.rain.visible = false; return; }
    this.rain.visible = true;
    const pos = this.rain.geometry.attributes.position.array;
    const R = this.rainRadius;
    const speed = 52 + this.rainIntensity * 18;
    const streak = 0.7 + this.rainIntensity * 0.5;
    for (let i = 0; i < this.rainCount; i++) {
      const d = this.rainDrops[i];
      d.y -= speed * dt;
      if (d.y < 0) {
        d.y += 22 + Math.random() * 4;
        d.x = (Math.random() - 0.5) * 2 * R;
        d.z = (Math.random() - 0.5) * 2 * R;
      }
      const bx = playerPos.x + d.x, bz = playerPos.z + d.z, by = playerPos.y + d.y;
      const j = i * 6;
      pos[j] = bx; pos[j + 1] = by; pos[j + 2] = bz;
      const drift = 0.42 + this.rainIntensity * 0.3;
      pos[j + 3] = bx - this.wind.x * drift; pos[j + 4] = by - streak; pos[j + 5] = bz - this.wind.z * drift;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  // Nachts schlafen -> Morgen
  sleep() {
    if (this.t >= 0.7) this.day++;
    this.t = 0.27;
  }

  update(dt, playerPos) {
    // Je ungefähr eine Hälfte des normierten Zyklus ist hell bzw. dunkel.
    const rate = this.night ? 0.5 / NIGHT_SECONDS : 0.5 / DAY_SECONDS;
    this.t += dt * rate;
    if (this.t >= 1) { this.t -= 1; this.day++; }

    const ang = (this.t - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    this.elevation = elev;
    const wasNight = this.night;
    this.night = elev < -0.02;
    this.nightfall = !wasNight && this.night;

    this.updateWeather(dt);
    this.updateWind(dt);
    const rain = this.rainIntensity;

    const sunDir = this._sunDir.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();

    // Sonne + Schattenkamera folgt dem Spieler
    this.sun.position.copy(playerPos).addScaledVector(sunDir, 100);
    this.sun.target.position.copy(playerPos);
    this.sun.intensity = THREE.MathUtils.clamp(elev * 3.2, 0, 2.6) * (1 - rain * 0.7);
    this.sun.color.lerpColors(SUN_DUSK, SUN_DAY, THREE.MathUtils.clamp(elev * 3, 0, 1));
    this.sunMesh.position.copy(playerPos).addScaledVector(sunDir, 380);
    this.sunGlow.position.copy(this.sunMesh.position);
    this.sunGlow.material.opacity = 0.08 + THREE.MathUtils.clamp(elev, 0, 1) * 0.14;

    const moonDir = this._moonDir.copy(sunDir).negate();
    moonDir.y = Math.abs(moonDir.y);
    this.moon.position.copy(playerPos).addScaledVector(moonDir, 100);
    this.moon.target.position.copy(playerPos);
    this.moon.intensity = THREE.MathUtils.clamp(-elev, 0, 1) * 0.4;
    this.moonMesh.position.copy(playerPos).addScaledVector(moonDir, 380);
    this.moonMesh.visible = elev < 0.1;
    this.moonGlow.position.copy(this.moonMesh.position);
    this.moonGlow.visible = this.moonMesh.visible;

    this.hemi.intensity = (0.22 + THREE.MathUtils.clamp(elev, 0, 1) * 0.85) * (1 - rain * 0.35) + this.flash * 1.4;

    // Himmel/Nebel-Farbe. Smoothstep nimmt an den Übergangsgrenzen die
    // Geschwindigkeit heraus; das zusätzliche Dämpfen fängt größere Sprünge
    // durch Schlafen oder Netzwerksynchronisation ab.
    const skyTarget = this._skyTarget
      .copy(SKY_NIGHT)
      .lerp(SKY_DUSK, THREE.MathUtils.smoothstep(elev, -.18, 0))
      .lerp(SKY_DAY, THREE.MathUtils.smoothstep(elev, 0, .25));
    // Regen zieht den Himmel ins Graue, ein Blitz lässt ihn kurz aufhellen
    if (rain > 0) skyTarget.lerp(SKY_STORM, rain * 0.6 * THREE.MathUtils.clamp(elev + 0.3, 0.15, 1));
    this._skyBase.lerp(skyTarget, 1 - Math.exp(-dt * 1.8));
    const sky = this.scene.background.copy(this._skyBase);
    if (this.flash > 0.01) sky.lerp(this._flashColor, this.flash * 0.55);
    this.scene.fog.color.copy(sky);
    this.scene.fog.far = Math.min(this.fogFarCap, 260 + THREE.MathUtils.clamp(elev, 0, 1) * 70 - rain * 130);

    const top = this.skyDome.material.uniforms.topColor.value;
    const horizon = this.skyDome.material.uniforms.horizonColor.value;
    const bottom = this.skyDome.material.uniforms.bottomColor.value;
    const dayBlend = THREE.MathUtils.smoothstep(elev, -.12, .12);
    top.copy(sky).offsetHSL(0.015, THREE.MathUtils.lerp(.08, .16, dayBlend), THREE.MathUtils.lerp(-.02, -.1, dayBlend));
    this._horizonTarget.copy(HORIZON_NIGHT).lerp(HORIZON_DAY, dayBlend);
    horizon.copy(sky).lerp(this._horizonTarget, THREE.MathUtils.lerp(.28, .36, dayBlend));
    bottom.copy(sky).lerp(SKY_GROUND, THREE.MathUtils.lerp(.16, .42, dayBlend));
    this.skyDome.position.copy(playerPos);
    // Sonnen-Streulicht im Dom: mittags dezent, in Horizontnähe warm und
    // kräftig; Regen dämpft den Schleier.
    const domeUniforms = this.skyDome.material.uniforms;
    domeUniforms.sunDirection.value.copy(sunDir);
    const lowSun = 1 - THREE.MathUtils.clamp(Math.abs(elev) / 0.45, 0, 1);
    domeUniforms.sunHaze.value = (THREE.MathUtils.clamp(elev * 6 + 0.25, 0, 1) * (0.5 + lowSun * 0.8)) * (1 - rain * 0.85);
    domeUniforms.sunTint.value.lerpColors(SUN_TINT_LOW, SUN_TINT_HIGH, THREE.MathUtils.clamp(elev * 2.4, 0, 1));

    this.stars.material.opacity = THREE.MathUtils.clamp(-elev * 4, 0, 1);
    this.stars.position.set(playerPos.x, 0, playerPos.z);
    const localBiome=biomeAt(playerPos.x,playerPos.z).id;
    const fireflyHabitat=['forest','meadow','marsh'].includes(localBiome)&&terrainHeight(playerPos.x,playerPos.z)>WATER_Y+.15;
    this.fireflies.material.opacity = fireflyHabitat?THREE.MathUtils.clamp((-elev - 0.02) * 5, 0, 0.9)*(1-rain*.8):0;
    if (this.fireflies.material.opacity > 0.01) this.updateFireflies(playerPos);
    this.updateAmbientMoments(dt,playerPos,elev,rain);

    // Wolken driften und nehmen die Lichtstimmung an: weiß am Tag, warm in
    // der Dämmerung, dunkel blaugrau in der Nacht, fahl bei Sturm.
    for (const c of this.clouds) {
      c.position.x += (c.userData.speed + this.wind.x * 2.2) * dt;
      c.position.z += this.wind.z * 2.2 * dt;
      if (c.position.x > 560) c.position.x = -560;
      if (c.position.x < -560) c.position.x = 560;
      if (c.position.z > 560) c.position.z = -560;
      if (c.position.z < -560) c.position.z = 560;
    }
    if (this.cloudMat) {
      const cloudCol = this.cloudMat.color;
      cloudCol.copy(CLOUD_NIGHT)
        .lerp(CLOUD_DUSK, THREE.MathUtils.smoothstep(elev, -.18, -.05))
        .lerp(CLOUD_DAY, THREE.MathUtils.smoothstep(elev, -.05, .22));
      if (rain > 0) cloudCol.lerp(CLOUD_STORM, rain * 0.75);
      this.cloudMat.emissive.copy(cloudCol).multiplyScalar(0.5);
      this.cloudMat.emissiveIntensity = 0.22 + THREE.MathUtils.clamp(elev, 0, 1) * 0.3;
    }

    this.water.position.y = WATER_Y;
    const waterUniforms = this.water.material.userData.waterUniforms;
    if (waterUniforms) {
      waterUniforms.uWaterTime.value += dt;
      waterUniforms.uWaveStrength.value = .78 + rain * .62 + Math.min(.35, Math.hypot(this.wind.x,this.wind.z)*.12);
      waterUniforms.uWaterWind.value.set(this.wind.x,this.wind.z);
      waterUniforms.uWaterHorizon.value.copy(sky).lerp(this._horizonTarget,.55);
      // Tageslicht steuert die Wasserpalette: türkis/blau am Tag, fast
      // schwarzblau in der Nacht; Regen entsättigt Richtung Graugrün.
      const daylight = THREE.MathUtils.clamp(elev * 3 + 0.35, 0, 1);
      waterUniforms.uShallowColor.value.lerpColors(WATER_SHALLOW_NIGHT, WATER_SHALLOW_DAY, daylight);
      waterUniforms.uDeepColor.value.lerpColors(WATER_DEEP_NIGHT, WATER_DEEP_DAY, daylight);
      if (rain > 0) {
        waterUniforms.uShallowColor.value.lerp(SKY_STORM, rain * 0.3);
        waterUniforms.uDeepColor.value.lerp(SKY_STORM, rain * 0.2);
      }
      // Leichtes Eigenleuchten in der Wasserfarbe hält das Blau auch unter
      // dem ACES-Tonemapping satt, statt zu einem Graugrün abzudunkeln.
      this.water.material.emissive
        .copy(waterUniforms.uDeepColor.value)
        .lerp(waterUniforms.uShallowColor.value, 0.35);
      this.water.material.emissiveIntensity = 0.06 + daylight * 0.3;
    }
    if (this.shoreFoam) {
      this.shoreFoam.material.opacity = (.12 + Math.sin(performance.now()*.0014)*.035) * (1 + rain*.4);
      this.shoreFoam.material.color.lerpColors(
        SHORE_FOAM_NIGHT,
        SHORE_FOAM_DAY,
        THREE.MathUtils.smoothstep(elev, -.16, .02),
      );
    }
    if (this.water.material.bumpMap) {
      this.water.material.bumpMap.offset.x += dt * (0.009 + this.wind.x * .003);
      this.water.material.bumpMap.offset.y += dt * (0.005 + this.wind.z * .003);
    }

    // Vögel kreisen tagsüber über dem Spieler und schlagen mit den Flügeln
    const dayAmt = THREE.MathUtils.clamp(elev * 5, 0, 1);
    for (const b of this.birds) {
      const u = b.userData;
      u.phase += dt * u.speed;
      u.flap += dt * 7;
      b.position.set(
        playerPos.x + Math.cos(u.phase) * u.radius,
        u.height + Math.sin(u.phase * 2) * 1.6,
        playerPos.z + Math.sin(u.phase) * u.radius,
      );
      b.rotation.y = -u.phase + (u.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
      const flap = Math.sin(u.flap) * 0.5;
      b.children[0].rotation.z = 0.35 + flap;
      b.children[1].rotation.z = -0.35 - flap;
      b.visible = dayAmt > 0.05 && this.rainIntensity < 0.35;
    }

    this.updateRain(dt, playerPos);
  }
}
