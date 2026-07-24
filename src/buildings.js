import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { terrainHeight, terrainSlope, WATER_Y } from './world.js';

const CAMPFIRE_MODEL_URL = new URL('../assets/Campfire 3D Model.glb', import.meta.url).href;
const MODEL_LOADER = new GLTFLoader();
let campfireModelPromise = null;

function loadCampfireModel() {
  campfireModelPromise ||= MODEL_LOADER.loadAsync(CAMPFIRE_MODEL_URL).then(({ scene }) => scene);
  return campfireModelPromise;
}

function keepGeometryBelow(geometry, maxY) {
  const position = geometry.getAttribute('position');
  if (!position) return geometry;
  const sourceIndex = geometry.index;
  const triangleCount = (sourceIndex?.count ?? position.count) / 3;
  const kept = [];
  const vertexAt = (i) => sourceIndex ? sourceIndex.getX(i) : i;
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const a = vertexAt(triangle * 3);
    const b = vertexAt(triangle * 3 + 1);
    const c = vertexAt(triangle * 3 + 2);
    const centerY = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    if (centerY <= maxY) kept.push(a, b, c);
  }
  const result = geometry.clone();
  result.setIndex(kept);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

const MATERIALS = new Map();
function std(color, roughness = .94, metalness = 0) {
  const key = `${color}-${roughness}-${metalness}`;
  if (!MATERIALS.has(key)) MATERIALS.set(key, new THREE.MeshStandardMaterial({ color, flatShading: false, roughness, metalness }));
  return MATERIALS.get(key);
}

function flameDrop(height, radius, color, opacity = .9) {
  const profile = [
    [0, 0], [.58, .025], [1, .17], [.9, .4],
    [.58, .66], [.22, .88], [0, 1],
  ].map(([x, y]) => new THREE.Vector2(x * radius, y * height));
  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 16),
    new THREE.MeshBasicMaterial({
      // HDR-Farbe (>1): der Flammenkern brennt unter ACES heißer aus und
      // bekommt vom Desktop-Bloom einen echten Feuerschein.
      color: new THREE.Color(color).multiplyScalar(1.55),
      fog: false, transparent: true, opacity,
      depthWrite: false, blending: THREE.NormalBlending,
    })
  );
  mesh.userData.baseScale = mesh.scale.clone();
  return mesh;
}

export const DEFS = {
  campfire: { name: 'Lagerfeuer', r: 0.9, fire: true, blocksPlayer: false, lightColor: 0xffa040, lightI: 2.4, lightD: 16 },
  torch: { name: 'Fackel', r: 0.2, fire: true, lightColor: 0xffb050, lightI: 1.3, lightD: 9 },
  wall: { name: 'Holzwand', r: 0.45, connectable: true, groundHalf:.95, blocksAnimals: true, blocksPlayer: true, maxHp: 100 },
  stonewall: { name: 'Steinmauer', r: 0.48, connectable: true, groundHalf:1.08, blocksAnimals: true, blocksPlayer: true },
  gate: { name: 'Wildtor', r: 0.45, connectable: true, groundHalf:1.05, blocksAnimals: true, blocksPlayer: true },
  // Ein Zelt braucht ebenen Boden — am Hang stehen Plane und Heringe sichtbar
  // schief, deshalb ist die Platzierung dort gesperrt statt getrickst.
  tent: { name: 'Zelt', r: 1.5, spawn: true, maxSlope: 0.16 },
  raincatcher: { name: 'Regenfänger', r: 1.15 },
  raft: { name: 'Floß', r: 1.45, blocksPlayer: false, waterOnly: true },
  bike: { name: 'Geländefahrrad', r: 1.05, blocksPlayer: false },
  chest: { name: 'Holztruhe', r: 0.75 },
  workbench: { name: 'Werkbank', r: 1.15 },
  roof: { name: 'Holzdach', r: 2.2, blocksPlayer: false, shelter: true },
  watchtower: { name: 'Hochsitz', r: 1.75, blocksPlayer: false, blocksAnimals: true, maxSlope: .2 },
};

// Nutzbare Grundflächen unter dem Holzdach. Die Maße sind Halbausdehnungen in
// lokaler X/Z-Richtung und bewusst etwas großzügiger als die sichtbaren Meshes.
// Regenfänger und hohe/große Konstruktionen fehlen absichtlich.
const UNDER_ROOF_FOOTPRINTS = {
  campfire: { x: .78, z: .78 },
  torch: { x: .18, z: .18 },
  chest: { x: .72, z: .5 },
  workbench: { x: 1.15, z: .62 },
};

function fitsUnderRoof(type, x, z, rot, roof) {
  const footprint = UNDER_ROOF_FOOTPRINTS[type];
  if (!footprint || !roof) return false;

  const dx = x - roof.x, dz = z - roof.z;
  const c = Math.cos(roof.rot), s = Math.sin(roof.rot);
  const localX = c * dx - s * dz;
  const localZ = s * dx + c * dz;

  // Gedrehte Objektgrundfläche in das Koordinatensystem des Dachs projizieren.
  const relativeRot = rot - roof.rot;
  const rc = Math.abs(Math.cos(relativeRot)), rs = Math.abs(Math.sin(relativeRot));
  const extentX = rc * footprint.x + rs * footprint.z;
  const extentZ = rs * footprint.x + rc * footprint.z;

  // Die Dachfläche misst etwa 4.7 × 4 Meter. Sicherheitsabstand zu den vier
  // äußeren Pfosten verhindert sichtbares Ineinanderschneiden.
  return Math.abs(localX) + extentX <= 1.78
    && Math.abs(localZ) + extentZ <= 1.28;
}

function canShareRoofSpace(newType, x, z, rot, existing) {
  if (existing.type === 'roof') return fitsUnderRoof(newType, x, z, rot, existing);
  if (newType === 'roof') return fitsUnderRoof(existing.type, existing.x, existing.z, existing.rot, { x, z, rot });
  return false;
}

function buildCampfire() {
  const g = new THREE.Group();
  loadCampfireModel().then((source) => {
    const model = source.clone(true);
    model.traverse((child) => {
      if (!child.isMesh) return;
      // Im gelieferten GLB sind Sockel und statische Flamme ein Mesh. Der
      // hochliegende Flammenbereich wird entfernt, damit Ausgehen, Regen und
      // Brennstoff weiterhin korrekt dargestellt werden können.
      child.geometry = keepGeometryBelow(child.geometry, .08);
      child.material = child.material.clone();
      child.material.roughness = .86;
      child.material.metalness = 0;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y, -center.z);
    const orientation = new THREE.Group();
    orientation.scale.setScalar(.82);
    orientation.add(model);
    g.add(orientation);
  }).catch((error) => console.warn('Campfire-Modell konnte nicht geladen werden', error));

  const flames = new THREE.Group();
  flames.position.y = .24;
  const outer = flameDrop(.78, .27, 0xff5518, .82);
  outer.position.set(0, 0, 0);
  const side = flameDrop(.5, .15, 0xff7a1f, .86);
  side.position.set(-.13, .035, .015);
  side.rotation.z = .27;
  const middle = flameDrop(.58, .18, 0xffa52b, .88);
  middle.position.set(.025, .02, -.025);
  middle.rotation.z = -.08;
  const core = flameDrop(.36, .105, 0xffd94b, .94);
  core.position.set(.015, .045, -.05);
  core.rotation.z = .1;
  flames.add(outer, side, middle, core);
  g.add(flames);
  g.userData.flames = flames;
  return g;
}

function buildTorch() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.15, 9), std(0x6e4a2c));
  stick.position.y = 0.55;
  stick.castShadow = true;
  g.add(stick);
  const flames = new THREE.Group();
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.38, 5), new THREE.MeshBasicMaterial({ color: 0xffa63d }));
  f.position.y = 1.3;
  flames.add(f);
  g.add(flames);
  g.userData.flames = flames;
  return g;
}

function buildWall() {
  const g = new THREE.Group();
  const plankColors = [0x93643a, 0x865a34, 0xa16f40];
  for (let i = 0; i < 7; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.18, .245, .18), std(plankColors[i % plankColors.length]));
    plank.position.set((i % 2 ? 1 : -1) * .025, .15 + i * .245, (i % 3 - 1) * .008);
    plank.rotation.z = (i % 3 - 1) * .006; plank.castShadow = true; g.add(plank);
  }
  for (const y of [0.42, 1.28]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(2.34,.14,.28),std(0x71492b));rail.position.set(0,y,-.08);g.add(rail); }
  for (const x of [-0.95, 0.95]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.0, 9), std(0x654226));
    post.position.set(x, 1.0, 0);
    post.castShadow = true;
    g.add(post);
  }
  // Dunkle Kratzspuren werden abhängig vom Schaden stufenweise eingeblendet.
  // Sie liegen knapp vor der Wand, damit sie nicht mit den Planken flimmern.
  const damageMarks=[];
  for(let i=0;i<4;i++){
    const mark=new THREE.Mesh(new THREE.BoxGeometry(.035,.58,.025),std(0x352216));
    mark.position.set(-.42+i*.27,.72+(i%2)*.28,.115);
    mark.rotation.z=.56+(i%2)*.12;mark.visible=false;g.add(mark);damageMarks.push(mark);
  }
  g.userData.damageMarks=damageMarks;
  return g;
}

function buildStoneWall() {
  const g = new THREE.Group();
  const colors = [0x777b78, 0x686e6b, 0x858984, 0x5f6663];
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 4; column++) {
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(.54, .32, .42),
        std(colors[(row * 3 + column) % colors.length], .98),
      );
      stone.position.set(-.82 + column * .55 + (row % 2 ? .02 : -.02), .18 + row * .32, (column % 2 ? 1 : -1) * .012);
      stone.rotation.set((column % 2 ? 1 : -1) * .012, 0, (row + column) % 3 === 0 ? .018 : -.008);
      stone.castShadow = true;
      stone.receiveShadow = true;
      g.add(stone);
    }
  }
  const capL = new THREE.Mesh(new THREE.BoxGeometry(1.08, .25, .48), std(0x727773, .97));
  const capR = capL.clone();
  capL.position.set(-.55, 1.75, 0); capR.position.set(.55, 1.75, 0);
  capL.castShadow = capR.castShadow = true;
  g.add(capL, capR);
  return g;
}

function buildGate() {
  const g = new THREE.Group();
  for (const x of [-1.05, 1.05]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.15, 9), std(0x5f4026));
    post.position.set(x, 1.05, 0);
    post.castShadow = true;
    g.add(post);
  }
  const hinge = new THREE.Group();
  hinge.position.x = -0.95;
  for (const y of [0.38, 1.05, 1.72]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.18), std(0x8a5a32));
    beam.position.set(0.95, y, 0);
    beam.castShadow = true;
    hinge.add(beam);
  }
  const brace = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.13, 0.16), std(0x704a2b));
  brace.position.set(0.95, 1.05, 0);
  brace.rotation.z = -0.58;
  hinge.add(brace);
  g.add(hinge);
  g.userData.gateDoor = hinge;
  return g;
}

function buildTent() {
  const g = new THREE.Group();
  const fabric=(color,roughness)=>new THREE.MeshStandardMaterial({color,roughness,side:THREE.DoubleSide});
  const canvas=fabric(0xb99a66,.95),canvasLight=fabric(0xc9ad77,.94),canvasDark=fabric(0x8f734c,.97);
  const wood=std(0x5e4028,.97),ropeMat=std(0xa89570,1),inside=fabric(0x211b17,1);
  const panel=(points,material)=>{
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    geometry.setIndex(points.length===4?[0,1,2,0,2,3]:[0,1,2]);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
  };
  const beam=(start,end,radius,material=wood)=>{
    const direction=new THREE.Vector3().subVectors(end,start),length=direction.length();
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*1.12,length,7),material);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());mesh.castShadow=true;g.add(mesh);return mesh;
  };
  const ridgeY=2.15,halfX=1.55,front=1.42,rear=-1.42;
  // Zwei leicht verschieden gefärbte, echte Stoffflächen statt eines glatten Kegels.
  panel([new THREE.Vector3(0,ridgeY,rear),new THREE.Vector3(0,ridgeY,front),new THREE.Vector3(-halfX,.08,front),new THREE.Vector3(-halfX,.08,rear)],canvas);
  panel([new THREE.Vector3(0,ridgeY,front),new THREE.Vector3(0,ridgeY,rear),new THREE.Vector3(halfX,.08,rear),new THREE.Vector3(halfX,.08,front)],canvasLight);
  panel([new THREE.Vector3(-halfX,.08,rear),new THREE.Vector3(halfX,.08,rear),new THREE.Vector3(0,ridgeY,rear)],canvasDark);
  // Vorderseite mit dunklem Innenraum und sichtbar zurückgebundenen Klappen.
  panel([new THREE.Vector3(-halfX,.08,front+.012),new THREE.Vector3(halfX,.08,front+.012),new THREE.Vector3(0,ridgeY,front+.012)],inside);
  panel([new THREE.Vector3(-halfX,.08,front+.025),new THREE.Vector3(-.52,.08,front+.035),new THREE.Vector3(0,ridgeY,front+.025)],canvas);
  panel([new THREE.Vector3(.52,.08,front+.035),new THREE.Vector3(halfX,.08,front+.025),new THREE.Vector3(0,ridgeY,front+.025)],canvasLight);
  // Schlafrolle im Eingang macht das Zelt bewohnt und funktional.
  const matRoll=new THREE.Mesh(new THREE.BoxGeometry(1.05,.09,1.35),std(0x657258,.98));
  matRoll.position.set(0,.1,.78);matRoll.castShadow=true;g.add(matRoll);
  const blanket=new THREE.Mesh(new THREE.BoxGeometry(.82,.075,.52),std(0x8c563f,.96));
  blanket.position.set(0,.19,.43);blanket.rotation.x=.05;g.add(blanket);
  // Firststange, A-Stützen und gebundene Türklappen.
  beam(new THREE.Vector3(0,ridgeY+.1,rear-.28),new THREE.Vector3(0,ridgeY+.1,front+.3),.055);
  for(const z of[rear-.03,front+.03]){
    beam(new THREE.Vector3(-halfX-.1,.04,z),new THREE.Vector3(0,ridgeY+.18,z),.045);
    beam(new THREE.Vector3(halfX+.1,.04,z),new THREE.Vector3(0,ridgeY+.18,z),.045);
  }
  for(const side of[-1,1])beam(new THREE.Vector3(side*.34,.67,front+.08),new THREE.Vector3(side*.74,.2,front+.27),.025,canvasDark);
  // Vier Abspannungen folgen wirklich vom First zu einzelnen Heringen.
  for(const z of[rear-.18,front+.18])for(const side of[-1,1]){
    const pegX=side*2.02,pegZ=z+(z>0?.38:-.38);
    beam(new THREE.Vector3(side*.12,ridgeY-.08,z),new THREE.Vector3(pegX,.08,pegZ),.012,ropeMat);
    const peg=new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,.28,5),wood);
    peg.position.set(pegX,.14,pegZ);peg.rotation.z=side*.22;
    peg.userData.groundSupport={x:pegX,z:pegZ,length:.28};g.add(peg);
  }
  // Saum, Nähte und ein Reparaturflicken brechen die großen Stoffflächen auf.
  for(const x of[-halfX,halfX]){
    const skirt=new THREE.Mesh(new THREE.BoxGeometry(.12,.23,2.92),canvasDark);skirt.position.set(x,-.015,0);g.add(skirt);
  }
  beam(new THREE.Vector3(-.78,1.13,rear-.012),new THREE.Vector3(.05,2.07,rear-.012),.012,ropeMat);
  const patch=new THREE.Mesh(new THREE.PlaneGeometry(.42,.3),std(0x806749,.99));
  patch.position.set(-.9,.78,-.79);patch.rotation.set(-.64,.55,-.08);g.add(patch);
  return g;
}

function buildRaincatcher() {
  const g = new THREE.Group();
  const wood = std(0x68472d);
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.65, 0.65]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.25, 5), wood);
    leg.position.set(sx, 0.62, sz);leg.userData.groundSupport={x:sx,z:sz,length:1.25}; leg.castShadow = true; g.add(leg);
  }
  // Querstreben geben dem Gestell Gewicht und erklären, wie die Schale gehalten wird.
  for (const z of [-0.65, 0.65]) {
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.75, 5), wood);
    brace.rotation.z = Math.PI / 2; brace.position.set(0, 0.7, z); g.add(brace);
  }

  const basinMat = std(0x617565);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.62, 0.42, 24, 2, true), basinMat);
  basin.position.y = 1.18; basin.rotation.y = Math.PI / 12; basin.castShadow = true; g.add(basin);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.62, 0.1, 12), std(0x526356));
  bottom.position.y = 1.0; bottom.rotation.y = Math.PI / 12; bottom.castShadow = true; g.add(bottom);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.065, 5, 12), std(0x829382));
  rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI / 12; rim.position.y = 1.4; g.add(rim);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.94, 0.94, 0.045, 24),
    new THREE.MeshStandardMaterial({ color: 0x328fbd, roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.82 })
  );
  water.position.y = 1.08; water.visible = false; g.add(water);
  g.userData.waterSurface = water;
  g.userData.waterMinY = 1.08;
  g.userData.waterMaxY = 1.34;
  return g;
}

function buildRaft() {
  const g = new THREE.Group();
  for (let i = -3; i <= 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.2, 10), std(i % 2 ? 0x76502e : 0x845b34));
    log.rotation.x = Math.PI / 2;
    log.position.set(i * 0.32, 0.12, 0);
    log.castShadow = true; g.add(log);
  }
  for (const z of [-1.05, 1.05]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.13, 0.2), std(0x553820));
    beam.position.set(0, 0.28, z); g.add(beam);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.8, 6), std(0x5d4027));
  pole.position.set(0, 1.55, 0.25); g.add(pole);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.7), new THREE.MeshStandardMaterial({ color: 0xd8c59d, side: THREE.DoubleSide, roughness: 1 }));
  sail.position.set(0, 1.65, 0.3); sail.rotation.y = Math.PI / 2; g.add(sail);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.18, 0.38), std(0x664427));
  seat.position.set(0, 0.5, -0.45); g.add(seat);
  return g;
}

function buildBike() {
  const g=new THREE.Group(),rubber=std(0x202321),metal=std(0x59646a),frame=std(0xb86a2f),leather=std(0x4d3526);
  for(const z of [-.78,.78]) {
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.48,.075,8,20),rubber);
    wheel.rotation.y=Math.PI/2;wheel.position.set(0,.5,z);wheel.castShadow=true;g.add(wheel);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.18,8),metal);
    hub.rotation.z=Math.PI/2;hub.position.set(0,.5,z);g.add(hub);
  }
  const bar=(length,x,y,z,rx=0)=>{const part=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,length,7),frame);part.position.set(x,y,z);part.rotation.x=rx;part.castShadow=true;g.add(part);return part;};
  bar(1.05,0,.74,0,.98);bar(.92,0,.76,-.08,-.93);bar(.9,0,.54,0,Math.PI/2);
  const fork=bar(1.0,0,.82,.43,-.52);fork.material=metal;
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.3,.1,.42),leather);seat.position.set(0,1.12,-.18);seat.castShadow=true;g.add(seat);
  const post=bar(.5,0,.93,-.18,0);post.material=metal;
  // Lenker quer zur Fahrtrichtung (X-Achse) statt längs – vorher zeigte er nach vorn/hinten.
  const handle=bar(.62,0,1.18,.67,0);handle.material=metal;handle.rotation.set(0,0,Math.PI/2);
  const pedals=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.48,8),metal);pedals.rotation.z=Math.PI/2;pedals.position.set(0,.55,0);g.add(pedals);
  const rack=new THREE.Group();
  for(const x of [-.18,.18]) {const rail=new THREE.Mesh(new THREE.BoxGeometry(.035,.04,.65),metal);rail.position.set(x,.91,-.62);rack.add(rail);}
  const cross=new THREE.Mesh(new THREE.BoxGeometry(.42,.05,.5),metal);cross.position.set(0,.94,-.62);rack.add(cross);
  // Sichtbare Satteltasche auf dem Gepäckträger, damit das Upgrade am Fahrrad erkennbar ist.
  const canvas=std(0x6b4a2c),strap=std(0x3c2a1a);
  const bagBody=new THREE.Mesh(new THREE.BoxGeometry(.5,.36,.46),canvas);bagBody.position.set(0,1.16,-.62);bagBody.castShadow=true;rack.add(bagBody);
  const bagFlap=new THREE.Mesh(new THREE.BoxGeometry(.54,.16,.14),canvas);bagFlap.position.set(0,1.3,-.4);rack.add(bagFlap);
  for(const x of [-.14,.14]){const buckle=new THREE.Mesh(new THREE.BoxGeometry(.06,.24,.05),strap);buckle.position.set(x,1.14,-.38);rack.add(buckle);}
  rack.visible=false;g.add(rack);g.userData.bikeRack=rack;
  g.userData.wheels=g.children.filter((child)=>child.geometry?.type==='TorusGeometry');
  return g;
}

function buildWatchtower() {
  const g=new THREE.Group();
  const timber=std(0x694629),plank=std(0x875c33),dark=std(0x4d3422);
  const PLATFORM_Y=3.88;
  const beam=(geometry,material,x,y,z)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
  };
  // Vier tragende Stämme mit Kreuzstreben bilden eine breite, glaubwürdige
  // Basis. groundSupport verlängert die Beine an kleinen Bodenunebenheiten.
  for(const x of[-1.08,1.08])for(const z of[-.92,.92]){
    const leg=beam(new THREE.CylinderGeometry(.12,.17,3.75,7),timber,x,1.875,z);
    leg.userData.groundSupport={x,z,length:3.75};
  }
  for(const side of[-1,1]){
    const brace=beam(new THREE.BoxGeometry(.13,4.05,.13),dark,side*1.1,1.95,0);
    brace.rotation.x=side*.48;
    const cross=beam(new THREE.BoxGeometry(.13,4.05,.13),dark,0,1.95,side*.94);
    cross.rotation.z=side*.5;
  }
  beam(new THREE.BoxGeometry(2.75,.22,2.35),plank,0,3.76,0);
  // Brusthohe Brüstung; vorne bleibt mittig der Leiterdurchstieg frei.
  for(const x of[-1.26,1.26]) beam(new THREE.BoxGeometry(.13,1.02,2.35),timber,x,4.32,0);
  beam(new THREE.BoxGeometry(2.65,1.02,.13),timber,0,4.32,-1.08);
  for(const x of[-.95,.95]) beam(new THREE.BoxGeometry(.72,1.02,.13),timber,x,4.32,1.08);
  // Freie Sitzbank: Der Hochsitz bleibt nach oben offen und eignet sich damit
  // auch als klare Aussichts- und Schussplattform.
  beam(new THREE.BoxGeometry(2.05,.18,.5),dark,0,4.18,-.68);
  // Leiter an der Vorderseite (+Z).
  for(const x of[-.43,.43]) beam(new THREE.CylinderGeometry(.055,.07,3.85,7),timber,x,1.93,1.27);
  for(let y=.35;y<3.82;y+=.38) beam(new THREE.CylinderGeometry(.045,.05,.86,7),plank,0,y,1.27).rotation.z=Math.PI/2;
  g.userData.platformY=PLATFORM_Y;
  g.userData.platformRadius=1.03;
  g.userData.railRadius=.78;
  g.userData.ladderGapHalfWidth=.5;
  return g;
}

function buildChest() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.72, 0.8), std(0x76502e)); body.position.y = 0.36; g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.18, 0.88), std(0x8c6238)); lid.position.y = 0.81; g.add(lid);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.08), std(0xb08b45)); lock.position.set(0, 0.61, 0.45); g.add(lock);
  const metal = std(0x504f4b);
  for (const x of [-.46,.46]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(.09,.82,.86), metal); band.position.set(x,.44,0); g.add(band);
  }
  for (const x of [-.67,.67]) for (const z of [-.43,.43]) {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(.08,.18,.08), metal); corner.position.set(x,.14,z); g.add(corner);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.18,.025,5,9,Math.PI),metal);
  handle.rotation.x=Math.PI/2;handle.position.set(0,.52,-.45);g.add(handle);
  return g;
}
function buildWorkbench() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 1), std(0x80572f)); top.position.y = 1.05; g.add(top);
  for (const x of [-0.85, 0.85]) for (const z of [-0.32, 0.32]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1, 0.16), std(0x5c3d24)); leg.position.set(x, 0.5, z);leg.userData.groundSupport={x,z,length:1}; g.add(leg); }
  const vice = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.35), std(0x777d84)); vice.position.set(0.65, 1.28, 0); g.add(vice);
  const lowerShelf = new THREE.Mesh(new THREE.BoxGeometry(1.85,.12,.72),std(0x684526));lowerShelf.position.y=.38;g.add(lowerShelf);
  const tool = new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.75,5),std(0x59402a));tool.rotation.z=Math.PI/2;tool.position.set(-.35,1.22,.12);g.add(tool);
  const toolHead = new THREE.Mesh(new THREE.BoxGeometry(.28,.14,.16),std(0x6f7478));toolHead.position.set(.02,1.22,.12);g.add(toolHead);
  for(let i=0;i<3;i++){const plank=new THREE.Mesh(new THREE.BoxGeometry(.95,.1,.18),std(0x916238));plank.position.set(-.2+i*.08,.5+i*.1,0);plank.rotation.y=.18;g.add(plank);}
  return g;
}
function buildRoof() {
  const g = new THREE.Group();
  for (const x of [-2, 2]) for (const z of [-1.5, 1.5]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 2.5, 5), std(0x624227)); post.position.set(x, 1.25, z);post.userData.groundSupport={x,z,length:2.5}; g.add(post); }
  for (const s of [-1, 1]) { const panel = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.14, 2), std(0x85643a)); panel.position.set(0, 2.62, s * 0.75); panel.rotation.x = s * 0.28; g.add(panel); }
  return g;
}

const BUILDERS = { campfire: buildCampfire, torch: buildTorch, wall: buildWall, stonewall: buildStoneWall, gate: buildGate, tent: buildTent, raincatcher: buildRaincatcher, raft: buildRaft, bike: buildBike, chest: buildChest, workbench: buildWorkbench, roof: buildRoof, watchtower: buildWatchtower };

function buildingId(type, x, z, supplied) {
  if (supplied) return String(supplied);
  if (globalThis.crypto?.randomUUID) return `${type}-${crypto.randomUUID()}`;
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}-${Math.round(x * 10)}-${Math.round(z * 10)}`;
}

function placeOnGround(group,type,x,z,rot) {
  const def=DEFS[type];
  group.rotation.order='YXZ';
  group.rotation.set(0,rot,0);
  if(def.waterOnly){group.position.set(x,WATER_Y+.05,z);return WATER_Y+.05;}

  // Mauern und Tore folgen mit ihrer langen Achse dem Hang. Beide Endpfosten
  // treffen dadurch denselben sichtbaren Terrainboden statt abwechselnd darin
  // zu verschwinden oder darüber zu schweben.
  if(def.connectable){
    const half=def.groundHalf||1.08,ax=Math.cos(rot),az=-Math.sin(rot);
    const low=terrainHeight(x-ax*half,z-az*half);
    const high=terrainHeight(x+ax*half,z+az*half);
    const center=(low+high)*.5;
    group.position.set(x,center,z);
    group.rotation.z=Math.atan2(high-low,half*2);
    return center;
  }

  const supports=[];
  group.traverse(child=>{if(child.userData.groundSupport)supports.push(child);});
  if(!supports.length){
    const h=terrainHeight(x,z);group.position.set(x,h,z);return h;
  }
  const c=Math.cos(rot),s=Math.sin(rot);
  const samples=supports.map(child=>{
    const support=child.userData.groundSupport;
    return terrainHeight(x+c*support.x+s*support.z,z-s*support.x+c*support.z);
  });
  const base=Math.max(...samples);
  group.position.set(x,base,z);
  supports.forEach((child,index)=>{
    const support=child.userData.groundSupport;
    support.originalY??=child.position.y;
    support.originalScaleY??=child.scale.y;
    const extension=Math.max(0,base-samples[index]);
    child.position.y=support.originalY-extension*.5;
    child.scale.y=support.originalScaleY*(support.length+extension)/support.length;
  });
  return base;
}

// Lagerfeuer-Brennstoff (in Sekunden Brenndauer)
const CAMPFIRE_MAX_FUEL = 180;   // maximaler Vorrat
const CAMPFIRE_INIT_FUEL = 90;   // frisch gebaut
export const CAMPFIRE_WOOD_FUEL = 45; // ein Holz füllt so viel nach

export class Buildings {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.placed = []; // {type, x, z, rot, group}
    this.obstacles = []; // {x, z, r}
    this.animalObstacles = []; // Wände und geschlossene Tore
    this.platforms = []; // Begehbare Oberseiten von gebauten Hochsitzen
    this.fires = []; // {x, z, building}
    this.lights = []; // {light, base}
    this.onTentPlaced = null;
    this.onFireOut = null; // Callback wenn ein Lagerfeuer ausgeht

    this.ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x4dff7c, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghost = null;
    this.ghostType = null;
    this.ghostRot = 0;
    this.ghostValid = false;
    this.ghostReplaceWall = null;
    this.ray = new THREE.Raycaster();
  }

  setGhostType(type) {
    if (this.ghostType === type) return;
    if (this.ghost) {
      this.group.remove(this.ghost);
      this.ghost = null;
    }
    this.ghostType = type;
    if (type) {
      this.ghost = BUILDERS[type]();
      this.ghost.traverse((m) => {
        if (m.isMesh) {
          m.material = this.ghostMatOk;
          m.castShadow = false;
        }
      });
      this.ghost.visible = false;
      this.group.add(this.ghost);
    }
  }

  updateGhost(camera, terrain) {
    if (!this.ghost) return;
    this.ray.setFromCamera({ x: 0, y: 0 }, camera);
    this.ray.far = 9;
    this.ghostReplaceWall = null;
    if (this.ghostType === 'gate') {
      const wallHit = this.ray.intersectObjects(
        this.placed.filter((b) => b.type === 'wall' || b.type === 'stonewall').map((b) => b.group),
        true
      )[0];
      if (wallHit) {
        let node = wallHit.object;
        while (node && !node.userData.building) node = node.parent;
        this.ghostReplaceWall = node?.userData.building || null;
      }
    }
    const hits = this.ray.intersectObject(terrain);
    if (!hits.length && !this.ghostReplaceWall) {
      this.ghost.visible = false;
      this.ghostValid = false;
      return;
    }
    const p = this.ghostReplaceWall
      ? new THREE.Vector3(this.ghostReplaceWall.x, 0, this.ghostReplaceWall.z)
      : hits[0].point.clone();
    if (this.ghostType === 'gate') {
      if (this.ghostReplaceWall) {
        this.ghostRot = this.ghostReplaceWall.rot;
      } else {
        this.snapToWallEnd(p);
      }
    } else if (DEFS[this.ghostType].connectable) this.snapToWallEnd(p);
    const h = terrainHeight(p.x, p.z);
    const waterOnly = DEFS[this.ghostType].waterOnly;
    this.ghost.visible = true;
    placeOnGround(this.ghost,this.ghostType,p.x,p.z,this.ghostRot);

    const maxSlope = DEFS[this.ghostType].maxSlope ?? 0.45;
    let valid = !!this.ghostReplaceWall || (waterOnly ? h < WATER_Y - 0.55 : (h > WATER_Y + 0.25 && terrainSlope(p.x, p.z) < maxSlope));
    if (valid) {
      const def = DEFS[this.ghostType];
      for (const b of this.placed) {
        if (b === this.ghostReplaceWall) continue;
        if (canShareRoofSpace(this.ghostType, p.x, p.z, this.ghostRot, b)) continue;
        if (Math.hypot(b.x - p.x, b.z - p.z) < def.r + DEFS[b.type].r + 0.3) { valid = false; break; }
      }
    }
    if (this.ghostType === 'gate' && !this.ghostReplaceWall) valid = false;
    this.ghostValid = valid;
    const mat = valid ? this.ghostMatOk : this.ghostMatBad;
    this.ghost.traverse((m) => { if (m.isMesh) m.material = mat; });
  }

  snapToWallEnd(p) {
    const half = 1.1;
    const ax = Math.cos(this.ghostRot), az = -Math.sin(this.ghostRot);
    let best = null;
    let bestD = 0.9;
    for (const b of this.placed) {
      if (!DEFS[b.type].connectable) continue;
      const bx = Math.cos(b.rot), bz = -Math.sin(b.rot);
      for (const side of [-1, 1]) {
        const ex = b.x + bx * half * side;
        const ez = b.z + bz * half * side;
        for (const ownSide of [-1, 1]) {
          const cx = ex - ax * half * ownSide;
          const cz = ez - az * half * ownSide;
          const d = Math.hypot(cx - p.x, cz - p.z);
          if (d < bestD) { bestD = d; best = { x: cx, z: cz }; }
        }
      }
    }
    if (best) { p.x = best.x; p.z = best.z; }
  }

  rotateGhost() {
    this.ghostRot += Math.PI / 4;
  }

  tryPlace(type) {
    if (!this.ghost || !this.ghost.visible || !this.ghostValid || this.ghostType !== type) return false;
    if (type === 'gate' && this.ghostReplaceWall) this.removeBuilding(this.ghostReplaceWall);
    this.place(type, this.ghost.position.x, this.ghost.position.z, this.ghostRot);
    this.ghostReplaceWall = null;
    return true;
  }

  removeBuilding(building) {
    this.group.remove(building.group);
    this.placed = this.placed.filter((b) => b !== building);
    const playerRemaining = this.obstacles.filter((o) => o.building !== building && !this.isInsideBuilding(o, building));
    const animalRemaining = this.animalObstacles.filter((o) => o.building !== building && !this.isInsideBuilding(o, building));
    this.obstacles.splice(0, this.obstacles.length, ...playerRemaining);
    this.animalObstacles.splice(0, this.animalObstacles.length, ...animalRemaining);
    const platformRemaining=this.platforms.filter((platform)=>platform.building!==building);
    this.platforms.splice(0,this.platforms.length,...platformRemaining);
    this.fires = this.fires.filter((f) => f.building !== building);
    for (const entry of this.lights.filter((l) => l.building === building)) this.scene.remove(entry.light);
    this.lights = this.lights.filter((l) => l.building !== building);
  }

  clear() {
    for (const building of [...this.placed]) this.removeBuilding(building);
    this.setGhostType(null);
  }

  isInsideBuilding(point, building) {
    const def = DEFS[building.type];
    const dx = point.x - building.x, dz = point.z - building.z;
    if (!def?.connectable) return Math.hypot(dx, dz) < (def?.r || 1) + 0.2;
    const ax = Math.cos(building.rot), az = -Math.sin(building.rot);
    const along = Math.abs(dx * ax + dz * az);
    const across = Math.abs(-dx * az + dz * ax);
    return along < 1.2 && across < 0.75;
  }

  dismantle(building) {
    if (!building || !this.placed.includes(building)) return { ok: false, reason: 'invalid' };
    const storedItems = Object.values(building.storage || {}).some((amount) => amount > 0);
    if (storedItems) return { ok: false, reason: 'storage-not-empty' };
    const refunds = {
      wall: { holz: 2 }, stonewall: { stein: 5 }, gate: { holz: 2, stein: 1 },
      torch: { holz: 1 }, campfire: { holz: 2, stein: 1 },
      tent: { holz: 5, fell: 1 },
      raincatcher: { holz: 3, stein: 1 },
      raft: { holz: 8 },
      bike: { holz: 4, eisen: 4, fell: 1 },
      chest: { holz: 4 }, workbench: { holz: 6, stein: 3 }, roof: { holz: 3 },
      watchtower: { holz: 9, fell: 1 },
    };
    this.removeBuilding(building);
    return { ok: true, refunds: refunds[building.type] || {} };
  }

  toggleGate(building, occupants = []) {
    if (!building || building.type !== 'gate') return false;
    // Ein Tor darf nicht auf Spieler oder Tiere zugeschlagen werden. Die
    // Prüfung nutzt den tatsächlichen Durchgang statt eines großen Kreises um
    // das komplette Gebäude, sodass man es von direkt daneben bedienen kann.
    if (building.open && this.isGateOccupied(building, occupants)) return false;
    building.open = !building.open;
    if (building.open) {
      this.removeGateBarriers(building);
    } else {
      this.addGateBarriers(building);
    }
    return true;
  }

  isGateOccupied(building, occupants = []) {
    const ax = Math.cos(building.rot), az = -Math.sin(building.rot);
    return occupants.some((occupant) => {
      const dx = occupant.x - building.x, dz = occupant.z - building.z;
      const along = Math.abs(dx * ax + dz * az);
      const across = Math.abs(-dx * az + dz * ax);
      const radius = occupant.r ?? .42;
      return along < 1.08 + radius && across < .24 + radius;
    });
  }

  removeGateBarriers(building) {
    const playerRemaining = this.obstacles.filter((o) => o.building !== building);
    const animalRemaining = this.animalObstacles.filter((o) => o.building !== building);
    this.obstacles.splice(0, this.obstacles.length, ...playerRemaining);
    this.animalObstacles.splice(0, this.animalObstacles.length, ...animalRemaining);
  }

  addGateBarriers(building) {
    this.removeGateBarriers(building);
    const ax = Math.cos(building.rot), az = -Math.sin(building.rot);
    for (const offset of [-0.78, 0, 0.78]) {
      const x = building.x + ax * offset, z = building.z + az * offset;
      this.obstacles.push({ x, z, r: .38, building });
      this.animalObstacles.push({ x, z, r: .5, building });
    }
  }

  place(type, x, z, rot, options = {}) {
    const def = DEFS[type];
    const g = BUILDERS[type]();
    placeOnGround(g,type,x,z,rot);
    this.group.add(g);
    const building = { id: buildingId(type, x, z, options.id), type, x, z, rot, group: g, open: false };
    if(def.maxHp){building.maxHp=def.maxHp;building.hp=def.maxHp;}
    if (type === 'raft' || type === 'bike') { building.speed = 0; building.turnSpeed = 0; }
    if (type === 'chest' || type === 'raft' || type === 'bike') building.storage = {};
    if (type === 'raincatcher') { building.water = 0; building.maxWater = 100; }
    g.userData.building = building;
    this.placed.push(building);
    if (def.connectable) {
      const ax = Math.cos(rot), az = -Math.sin(rot);
      for (const offset of [-0.78, 0, 0.78]) {
        const obstacle = { x: x + ax * offset, z: z + az * offset, r: 0.38, building };
        if (def.blocksPlayer) this.obstacles.push(obstacle);
        if (def.blocksAnimals) this.animalObstacles.push({ ...obstacle, r: 0.5 });
      }
    } else {
      if (def.blocksPlayer !== false) this.obstacles.push({ x, z, r: def.r, building });
      if (def.blocksAnimals) this.animalObstacles.push({ x, z, r: def.r, building });
    }
    if(type==='watchtower'){
      building.platform={
        x,z,r:g.userData.platformRadius,railRadius:g.userData.railRadius,
        ladderGapHalfWidth:g.userData.ladderGapHalfWidth,rot,
        y:g.position.y+g.userData.platformY,building,
      };
      this.platforms.push(building.platform);
      // Der Unterbau ist am Boden ein echtes Hindernis. `top` sorgt dafür,
      // dass dieselbe Kollision den Spieler oben auf der Plattform nicht aus
      // dem Hochsitz herausdrückt.
      this.obstacles.push({x,z,r:1.1,top:building.platform.y-.3,building});
    }
    if (def.fire) {
      const isCamp = type === 'campfire';
      building.maxFuel = isCamp ? CAMPFIRE_MAX_FUEL : Infinity;
      building.fuel = isCamp ? CAMPFIRE_INIT_FUEL : Infinity;
      building.lit = true;
      this.fires.push({ x, z, building });
      const light = new THREE.PointLight(def.lightColor, def.lightI, def.lightD, 1.6);
      light.position.set(x, g.position.y + (type === 'torch' ? 1.4 : 1.0), z);
      this.scene.add(light);
      this.lights.push({ light, base: def.lightI, building });
    }
    // Nur ein bewusst vom lokalen Spieler gebautes Zelt setzt dessen
    // persönlichen Spawnpunkt. Beim Laden/Koop-Sync werden bestehende Bauten
    // still rekonstruiert; sonst gäbe es wiederholte Toasts und der letzte
    // geladene Zeltplatz würde fälschlich den persönlichen Spawn überschreiben.
    if (def.spawn && options.notifySpawn !== false && this.onTentPlaced) this.onTentPlaced(x, z);
    return g;
  }

  updateDamageVisual(building) {
    if(building?.type!=='wall'||!building.maxHp)return;
    const damage=1-THREE.MathUtils.clamp(building.hp/building.maxHp,0,1);
    const marks=building.group.userData.damageMarks||[];
    for(let i=0;i<marks.length;i++)marks[i].visible=damage>(i+1)/(marks.length+1);
    // Stark beschädigte Planken hängen etwas schief, ohne die Kollision oder
    // die Anschlussposition benachbarter Segmente zu verändern.
    building.group.rotation.z=damage>.72?.025:damage>.4?.012:0;
  }

  damageWoodWall(building, amount) {
    if(!building||building.type!=='wall'||!this.placed.includes(building))return null;
    building.hp=Math.max(0,building.hp-Math.max(0,Number(amount)||0));
    this.updateDamageVisual(building);
    const result={destroyed:building.hp<=0,hp:building.hp,maxHp:building.maxHp,building};
    if(result.destroyed)this.removeBuilding(building);
    return result;
  }

  repairWoodWall(building, amount=35) {
    if(!building||building.type!=='wall'||!this.placed.includes(building)||building.hp>=building.maxHp)return 0;
    const restored=Math.min(Math.max(0,Number(amount)||0),building.maxHp-building.hp);
    building.hp+=restored;this.updateDamageVisual(building);return restored;
  }

  nearest(type, pos, maxDist) {
    let best = null, bestD = maxDist;
    for (const b of this.placed) {
      if (b.type !== type) continue;
      const d = Math.hypot(b.x - pos.x, b.z - pos.z);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  // Verbrennt den Brennstoff der Lagerfeuer. Nur im Spielzustand aufrufen,
  // damit Feuer nicht während Pause/Menü ausgehen.
  tickFuel(dt, rainIntensity = 0) {
    for (const b of this.placed) {
      if (b.type === 'raincatcher') {
        b.water = Math.min(b.maxWater, b.water + rainIntensity * 2.2 * dt);
        continue;
      }
      if (b.type !== 'campfire' || !b.lit) continue;
      b.fuel -= dt;
      if (b.fuel <= 0) {
        b.fuel = 0;
        b.lit = false;
        if (this.onFireOut) this.onFireOut(b);
      }
    }
  }

  // Feuer mit Holz nachlegen / wieder anzünden. Gibt true zurück bei Erfolg.
  refuel(building, seconds) {
    if (!building || building.type !== 'campfire') return false;
    if (building.fuel >= building.maxFuel) return false;
    building.fuel = Math.min(building.maxFuel, building.fuel + seconds);
    building.lit = building.fuel > 0;
    return true;
  }

  // Positionen aktuell brennender Feuer (für die Wolfsabwehr).
  activeFires() {
    return this.fires.filter((f) => f.building.lit !== false).map((f) => ({ x: f.x, z: f.z }));
  }

  openAnimalPassages() {
    return this.placed
      .filter((building)=>building.type==='gate'&&building.open)
      .map((building)=>({x:building.x,z:building.z,rot:building.rot}));
  }

  drinkFrom(building, amount = 30) {
    if (!building || building.type !== 'raincatcher' || building.water < 1) return 0;
    const taken = Math.min(amount, building.water);
    building.water -= taken;
    return taken;
  }

  isSheltered(pos) {
    return this.placed.some((b) => (b.type === 'roof' && Math.hypot(b.x - pos.x, b.z - pos.z) < 2.25)
      || (b.type === 'tent' && Math.hypot(b.x - pos.x, b.z - pos.z) < 1.45));
  }

  update(dt, wind = null) {
    const t = performance.now() * 0.001;
    for (const b of this.placed) {
      if (b.type === 'gate') {
        const door = b.group.userData.gateDoor;
        const target = b.open ? -Math.PI / 2 : 0;
        door.rotation.y += (target - door.rotation.y) * Math.min(1, dt * 10);
      }
      const flames = b.group.userData.flames;
      if (b.type === 'raincatcher' && b.group.userData.waterSurface) {
        const surface = b.group.userData.waterSurface;
        const fill = Math.min(1, b.water / b.maxWater);
        surface.visible = b.water > 1;
        // Der Pegel steigt innerhalb der konischen Schale; nur die Breite wächst mit.
        surface.position.y = THREE.MathUtils.lerp(b.group.userData.waterMinY, b.group.userData.waterMaxY, fill);
        const width = THREE.MathUtils.lerp(0.72, 1, fill);
        surface.scale.set(width * (1 + Math.sin(t * 1.8 + b.x) * 0.006), 1, width);
      }
      if (flames) {
        const lit = b.lit !== false;
        flames.visible = lit;
        // Flammen schrumpfen, wenn der Brennstoff zur Neige geht
        const fuelFrac = b.maxFuel && isFinite(b.maxFuel) ? Math.min(1, b.fuel / (b.maxFuel * 0.4)) : 1;
        if (lit) {
          const windForce = wind ? Math.hypot(wind.x, wind.z) : 0;
          flames.rotation.z = wind ? -wind.x * 0.18 : 0;
          flames.rotation.x = wind ? wind.z * 0.18 : 0;
          flames.children.forEach((f, i) => {
            const s = (0.85 + Math.sin(t * (9 + windForce * 5) + i * 2.1 + b.x) * (0.18 + windForce * 0.05)) * (0.5 + fuelFrac * 0.5);
            const base = f.userData.baseScale;
            const sy = (0.8 + Math.sin(t * 11 + i * 1.3) * 0.25) * (0.5 + fuelFrac * 0.5);
            f.scale.set(base ? base.x * s : s, base ? base.y * sy : sy, base ? base.z * s : s);
            f.rotation.y += dt * 2;
          });
        }
      }
    }
    for (const l of this.lights) {
      const lit = l.building.lit !== false;
      if (!lit) { l.light.intensity = 0; continue; }
      const fuelFrac = l.building.maxFuel && isFinite(l.building.maxFuel)
        ? Math.min(1, l.building.fuel / (l.building.maxFuel * 0.4)) : 1;
      l.light.intensity = l.base * (0.5 + fuelFrac * 0.5) * (0.85 + Math.sin(t * 12 + l.light.position.x) * 0.12 + Math.random() * 0.06);
    }
  }

  serialize() {
    // Zeitlich begrenzte Expeditionskisten gehören nicht dauerhaft zum Spielstand.
    return this.placed.filter((b) => !b.expeditionEvent && !b.temporarySupply).map((b) => ({ id: b.id, type: b.type, x: b.x, z: b.z, rot: b.rot, open: !!b.open, hp: b.hp, fuel: b.fuel, water: b.water, storage: b.storage }));
  }

  load(list) {
    // Laufende Event-/Vorratskisten gehören nicht zum synchronisierten Save und
    // müssen einen Welt-Sync überleben – nur dauerhafte Bauten werden ersetzt.
    for (const building of [...this.placed]) {
      if (!building.expeditionEvent && !building.temporarySupply) this.removeBuilding(building);
    }
    this.setGhostType(null);
    for (const b of list || []) {
      const legacyId = `${b.type}:${Math.round(b.x * 10)}:${Math.round(b.z * 10)}`;
      this.place(b.type, b.x, b.z, b.rot, { notifySpawn: false, id: b.id || legacyId });
      const placed = this.placed[this.placed.length - 1];
      if(b.type==='wall'&&typeof b.hp==='number'){
        placed.hp=Math.max(1,Math.min(placed.maxHp,b.hp));
        this.updateDamageVisual(placed);
      }
      if (b.type === 'gate' && b.open) this.toggleGate(placed);
      if (b.type === 'campfire' && typeof b.fuel === 'number') {
        placed.fuel = Math.max(0, Math.min(placed.maxFuel, b.fuel));
        placed.lit = placed.fuel > 0;
      }
      if (b.type === 'raincatcher' && typeof b.water === 'number') placed.water = Math.max(0, Math.min(placed.maxWater, b.water));
      if ((b.type === 'chest' || b.type === 'raft' || b.type === 'bike') && b.storage) placed.storage = { ...b.storage };
    }
  }
}
