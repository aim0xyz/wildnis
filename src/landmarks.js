import * as THREE from 'three';
import { terrainHeight } from './world.js';

function mat(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 0.55 : 0, flatShading: true, roughness: 1 });
}

function mesh(geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function sitsOnGround(object) {
  object.userData.sitsOnGround = true;
  return object;
}

function buildStoneCircle() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const height = 2.5 + (i % 2) * 0.55;
    const stone = sitsOnGround(mesh(new THREE.BoxGeometry(0.75, height, 0.7), mat(0x777d78), Math.cos(a) * 4, height / 2, Math.sin(a) * 4));
    stone.rotation.set((i % 3 - 1) * 0.08, -a, (i % 2 ? 1 : -1) * 0.08);
    g.add(stone);
  }
  const altar = sitsOnGround(mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.65, 7), mat(0x666b68), 0, 0.325, 0));
  g.add(altar);
  return g;
}

function buildAbandonedCamp() {
  const g = new THREE.Group();
  const wood = mat(0x69472d);
  for (let i = 0; i < 4; i++) {
    const post = sitsOnGround(mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.7, 5), wood, i < 2 ? -2 : 2, 1.35, i % 2 ? -1.4 : 1.4));
    post.rotation.z = (i % 2 ? -1 : 1) * 0.15;
    g.add(post);
  }
  const roof = mesh(new THREE.BoxGeometry(4.9, 0.16, 3.7), mat(0x78603b), 0, 2.35, 0);
  roof.rotation.z = -0.12;
  g.add(roof);
  g.add(sitsOnGround(mesh(new THREE.BoxGeometry(1.4, 0.8, 1), wood, 0.9, 0.4, 0.3)));
  g.add(sitsOnGround(mesh(new THREE.CylinderGeometry(0.65, 0.75, 0.25, 8), mat(0x545451), -0.7, 0.125, -0.2)));
  return g;
}

function buildAncientTree() {
  const g = new THREE.Group();
  const trunk = mat(0x5b3a25);
  for (let i = 0; i < 3; i++) {
    const t = mesh(new THREE.CylinderGeometry(0.65, 1.25, 7.5, 7), trunk, (i - 1) * 0.65, 3.5, 0);
    t.rotation.z = (i - 1) * 0.1;
    g.add(t);
  }
  const leaves = mat(0x2b6f43, 0x0d301b);
  for (const [x, y, z, s] of [[0, 8, 0, 2.8], [-2, 7, 0, 2.1], [2, 7.4, .4, 2.2], [0, 7, -2, 2]]) {
    g.add(mesh(new THREE.IcosahedronGeometry(s, 1), leaves, x, y, z));
  }
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), mat(0x9fffb8, 0x42ff72), Math.cos(a) * 2.3, 1.2 + (i % 3) * 0.5, Math.sin(a) * 2.3));
  }
  return g;
}

function buildWreck() {
  const g = new THREE.Group(), wood = mat(0x4f3828);
  const hull = mesh(new THREE.BoxGeometry(5.5, 0.8, 2.1), wood, 0, 0.45, 0); hull.rotation.z = 0.16; g.add(hull);
  const mast = mesh(new THREE.CylinderGeometry(.1,.16,5,6), wood, .5,2.4,0); mast.rotation.z=.35; g.add(mast);
  g.add(sitsOnGround(mesh(new THREE.BoxGeometry(1.2,.8,1), mat(0x75502d),-1.4,.4,.2)));
  return g;
}
function buildOreCamp() {
  const g=new THREE.Group();
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2; const r=mesh(new THREE.OctahedronGeometry(.55+i%2*.2),mat(i%2?0x68737c:0x9b7042),Math.cos(a)*2,.5,Math.sin(a)*2);g.add(r);}
  g.add(sitsOnGround(mesh(new THREE.BoxGeometry(1.4,.7,1),mat(0x5f4228),0,.35,0))); return g;
}
function buildWatchtower() {
  const g=new THREE.Group(), wood=mat(0x60432a);
  for(const x of [-1.2,1.2])for(const z of [-1.2,1.2])g.add(sitsOnGround(mesh(new THREE.CylinderGeometry(.1,.15,5,5),wood,x,2.5,z)));
  g.add(mesh(new THREE.BoxGeometry(3.4,.22,3.4),mat(0x795734),0,4.5,0));
  g.add(mesh(new THREE.ConeGeometry(2.5,1.4,4),mat(0x514a32),0,5.3,0)); return g;
}

function buildCave() {
  const g = new THREE.Group();
  const outer = mat(0x55595a), inner = mat(0x292d2e), ore = mat(0x9b7042, 0x4b260d);
  // Langer, begehbarer Felstunnel mit genau einem Eingang bei +Z. Der Fundpunkt
  // liegt tief im Inneren; am Ende schließt eine Kammer den zweiten Ausgang.
  for (const side of [-1, 1]) {
    for (let z = -25; z <= 5; z += 1.35) {
      const rock = mesh(new THREE.DodecahedronGeometry(1.35 + (Math.abs(z) % 2) * .12, 0), z < 1 ? inner : outer, side * (2.05 + Math.sin(z*.31)*.28), 1.25, z - 2.1);
      rock.scale.set(.9, 1.25, 1.05); rock.rotation.set(z*.13,side*.22,z*.08); g.add(rock);
    }
  }
  for (let z = -25; z <= 5; z += 1.3) {
    const roof = mesh(new THREE.DodecahedronGeometry(1.55,0), z < 1 ? inner : outer, Math.sin(z*.23)*.25, 3.15, z - 2.1);
    roof.scale.set(1.55,.72,1.05); roof.rotation.y=z*.17; g.add(roof);
  }
  const floor = mesh(new THREE.BoxGeometry(3.6,.16,34),mat(0x343839),0,.05,-11); floor.receiveShadow=true;g.add(floor);
  const darkness = mesh(new THREE.PlaneGeometry(3.25,2.65),new THREE.MeshBasicMaterial({color:0x080a0a,side:THREE.DoubleSide}),0,1.45,-.5);
  g.add(darkness);
  // Erzadern geben der Erkundung einen unmittelbaren Zweck.
  for(const [x,y,z,s] of [[-1.45,.7,-8,.38],[1.5,1.25,-14,.3],[-1.6,1.7,-20,.25],[1.55,.55,-25,.42]]){
    const crystal=mesh(new THREE.OctahedronGeometry(s,0),ore,x,y,z);crystal.rotation.z=.5;g.add(crystal);
  }
  // Die versiegelte Endkammer verhindert einen Hinterausgang.
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2;const r=mesh(new THREE.DodecahedronGeometry(1.25,0),inner,Math.cos(a)*2.1,1.25+Math.sin(a)*.8,-28);g.add(r);}
  const bones=mesh(new THREE.CylinderGeometry(.035,.05,.8,5),mat(0xd8cfb4),.45,.16,-24.5);bones.rotation.z=Math.PI/2;g.add(bones);
  return g;
}

function buildCrater() {
  const g=new THREE.Group(), dark=mat(0x3d4141), glow=mat(0x65a9a1,0x2dd8c4);
  for(let i=0;i<18;i++){const a=i/18*Math.PI*2,r=4.5+(i%3)*.35;const s=mesh(new THREE.DodecahedronGeometry(.75+(i%2)*.25,0),dark,Math.cos(a)*r,.3,Math.sin(a)*r);s.scale.y=.55;g.add(s);}
  g.add(sitsOnGround(mesh(new THREE.IcosahedronGeometry(1.25,1),glow,0,1.05,0))); return g;
}
function buildRuins() {
  const g=new THREE.Group(), stone=mat(0x77746c);
  for(const [x,z,h] of [[-3,-2,4],[3,-2,3.2],[-3,2,2.5],[3,2,4.5]])g.add(sitsOnGround(mesh(new THREE.BoxGeometry(.8,h,.8),stone,x,h/2,z)));
  for(let i=0;i<5;i++)g.add(sitsOnGround(mesh(new THREE.BoxGeometry(1.2,.45,.7),stone,-2.4+i*1.2,.23,0))); return g;
}

const DEFINITIONS = [
  {
    id: 'steinkreis', name: 'Der alte Steinkreis', story: 'Verwitterte Zeichen erzählen von Menschen, die hier vor langer Zeit Schutz suchten.',
    x: 75, z: 0, build: buildStoneCircle, reward: { stein: 8 },
    // Die einzelnen Menhire bleiben getrennt, damit man in den Kreis hineinlaufen kann.
    collision: [
      ...Array.from({ length: 8 }, (_, i) => {
        const a = i / 8 * Math.PI * 2;
        return { x: Math.cos(a) * 4, z: Math.sin(a) * 4, r: 0.48 };
      }),
      { x: 0, z: 0, r: 1.15, height: 0.65 },
    ],
    platforms: [{ x: 0, z: 0, r: 1.05, height: 0.65 }],
  },
  {
    id: 'jaegerlager', name: 'Das verlassene Jägerlager', story: 'Die Glut ist kalt, doch unter dem morschen Dach liegen noch brauchbare Vorräte.',
    x: -127, z: 105, build: buildAbandonedCamp, reward: { holz: 10, fell: 2 },
    // Nur tragende Pfosten, Kiste und Feuerstelle blockieren; unter dem Dach bleibt Platz.
    collision: [
      { x: -2, z: 1.4, r: 0.18 }, { x: -2, z: -1.4, r: 0.18 },
      { x: 2, z: 1.4, r: 0.18 }, { x: 2, z: -1.4, r: 0.18 },
      { x: 0.9, z: 0.3, r: 0.72 }, { x: -0.7, z: -0.2, r: 0.66 },
    ],
  },
  {
    id: 'uralter_baum', name: 'Der Hüter des Waldes', story: 'Dieser Baum ist älter als jeder Pfad. Zwischen seinen Wurzeln schimmert ein vergessener Vorrat.',
    x: 81, z: -66, build: buildAncientTree, reward: { holz: 8, beeren: 6 },
    collision: [{ x: 0, z: 0, r: 1.45 }],
  },
  { id:'kuestenwrack', name:'Das gestrandete Wrack', story:'Jenseits der alten Küste liegt ein zerbrochenes Schiff mit Metall aus einer fremden Zeit.', x:-50,z:250,build:buildWreck,reward:{eisenerz:6,holz:8},collision:[{x:0,z:0,r:2.4}] },
  { id:'erzinsel', name:'Die Erzklippen', story:'Rostfarbene Adern durchziehen den Fels. Eine Expedition hierher lohnt sich.', x:245,z:110,build:buildOreCamp,reward:{eisenerz:9,stein:6},collision:[{x:0,z:0,r:1}] },
  { id:'nordwacht', name:'Die verlassene Nordwacht', story:'Vom morschen Turm aus überblickt man eine Wildnis, die größer ist als jede alte Karte.', x:-150,z:-260,build:buildWatchtower,reward:{fell:4,eisenerz:4},collision:[{x:-1.2,z:-1.2,r:.2},{x:1.2,z:-1.2,r:.2},{x:-1.2,z:1.2,r:.2},{x:1.2,z:1.2,r:.2}] },
  { id:'schattenhoehle', name:'Die Schattenhöhle', story:'Du bist bis in die versiegelte Kammer vorgedrungen. Die Erzadern beweisen, dass unter der Wildnis ein viel älteres System liegt.', x:-440,z:20, discoverX:-440,discoverZ:-4,build:buildCave,reward:{eisenerz:9,stein:7},collision:[] },
  { id:'sternfall', name:'Der Sternfallkrater', story:'Ein fremdes Gestein pulsiert noch immer schwach. Seine Splitter eignen sich für besonders widerstandsfähige Werkzeuge.',x:455,z:-340,build:buildCrater,reward:{eisenerz:12,stein:8},collision:[{x:0,z:0,r:1.2}] },
  { id:'versunkene_ruinen', name:'Die versunkenen Ruinen', story:'Zwischen Moorwasser und alten Mauern findest du Zeichen einer vergessenen Expedition.',x:-470,z:315,build:buildRuins,reward:{holz:10,eisenerz:5},collision:[{x:-3,z:-2,r:.5},{x:3,z:-2,r:.5},{x:-3,z:2,r:.5},{x:3,z:2,r:.5}] },
  { id:'ostpass', name:'Der zerbrochene Ostpass', story:'Von hier führt ein alter Pfad in die entlegensten Berge. Jemand hat vor dir versucht, sie zu kartieren.',x:470,z:265,build:buildWatchtower,reward:{fell:5,holz:8},collision:[{x:-1.2,z:-1.2,r:.2},{x:1.2,z:-1.2,r:.2},{x:-1.2,z:1.2,r:.2},{x:1.2,z:1.2,r:.2}] },
  { id:'westheiligtum', name:'Das Heiligtum am Weltrand', story:'Die Steine markieren keinen Abschluss, sondern einen Anfang: Hinter jedem Horizont wartet eine weitere Geschichte.',x:-455,z:-345,build:buildStoneCircle,reward:{stein:12,beeren:8},collision:[] },
];

export class Landmarks {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Landmarks';
    scene.add(this.group);
    this.obstacles = [];
    this.platforms = [];
    this.list = DEFINITIONS.map((def) => {
      const group = def.build();
      const baseHeight = terrainHeight(def.x, def.z);
      // Jeder bodengebundene Bestandteil tastet das Terrain an seiner eigenen
      // Weltposition ab. So schweben Objekte auf Hängen nicht über dem Boden.
      for (const child of group.children) {
        if (!child.userData.sitsOnGround) continue;
        child.position.y += terrainHeight(def.x + child.position.x, def.z + child.position.z) - baseHeight;
      }
      group.position.set(def.x, baseHeight, def.z);
      this.group.add(group);
      for (const shape of def.collision || []) {
        const ground = terrainHeight(def.x + shape.x, def.z + shape.z);
        this.obstacles.push({
          x: def.x + shape.x, z: def.z + shape.z, r: shape.r, landmark: def.id,
          top: shape.height == null ? null : ground + shape.height,
        });
      }
      for (const platform of def.platforms || []) {
        const x = def.x + platform.x;
        const z = def.z + platform.z;
        this.platforms.push({ x, z, r: platform.r, y: terrainHeight(x, z) + platform.height });
      }
      return { ...def, group };
    });
  }

  update(playerPos, discovered) {
    for (const landmark of this.list) {
      if (discovered.includes(landmark.id)) continue;
      const x = landmark.discoverX ?? landmark.x;
      const z = landmark.discoverZ ?? landmark.z;
      if (Math.hypot(playerPos.x - x, playerPos.z - z) <= 8) return landmark;
    }
    return null;
  }
}

export const LANDMARK_COUNT = DEFINITIONS.length;
