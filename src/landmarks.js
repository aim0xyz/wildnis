import * as THREE from 'three';
import {
  DRY_CAVE_DESCENT_ANGLE, DRY_CAVE_DESCENT_RUN, SHADOW_CAVE_PATH,
  dryCaveFloorY, terrainHeight, tideCaveFloorY,
} from './world.js';

function mat(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 0.55 : 0, flatShading: false, roughness: .94 });
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

function localPoint(landmark, x, z) {
  const rotation=landmark.rotation||0,dx=x-landmark.x,dz=z-landmark.z;
  return {
    x:Math.cos(rotation)*dx-Math.sin(rotation)*dz,
    z:Math.sin(rotation)*dx+Math.cos(rotation)*dz,
  };
}

function distanceToLocalPath(x,z,path) {
  let nearest=Infinity;
  for(let i=1;i<path.length;i++) {
    const [ax,az]=path[i-1],[bx,bz]=path[i],dx=bx-ax,dz=bz-az;
    const lengthSq=dx*dx+dz*dz||1;
    const t=THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/lengthSq,0,1);
    nearest=Math.min(nearest,Math.hypot(x-(ax+dx*t),z-(az+dz*t)));
  }
  return nearest;
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
  // Boden, Wände und Dach folgen derselben Route. So führt der Gang mit
  // mehreren sanften Kurven unter den Berg und bleibt durchgehend begehbar.
  const floorMaterial = mat(0x343839);
  for (let i=1;i<SHADOW_CAVE_PATH.length;i++) {
    const [ax,az]=SHADOW_CAVE_PATH[i-1], [bx,bz]=SHADOW_CAVE_PATH[i];
    const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),angle=Math.atan2(dx,dz);
    const px=dz/length,pz=-dx/length,steps=Math.ceil(length/1.3);
    if(i>1) {
      const floor=mesh(new THREE.BoxGeometry(5.5,.16,length+.4),floorMaterial,(ax+bx)/2,.05,(az+bz)/2);
      floor.rotation.y=angle;floor.receiveShadow=true;g.add(floor);
    }
    if(i>=3) {
      const ceiling=mesh(new THREE.BoxGeometry(6.35,.14,length+.4),inner,(ax+bx)/2,3.08,(az+bz)/2);
      ceiling.rotation.y=angle;g.add(ceiling);
    }
    // Der erste Abschnitt ist die offene Rampe vor dem Portal. Dort genügt
    // der Portalbogen; Tunnelwände und -dach beginnen erst hinter ihm.
    if(i===1) continue;
    for(let step=0;step<=steps;step++) {
      if(i===2&&step===0) continue;
      const t=step/steps,x=THREE.MathUtils.lerp(ax,bx,t),z=THREE.MathUtils.lerp(az,bz,t);
      const shellMaterial=z>-6?outer:inner;
      for(const side of [-1,1]) {
        const wallX=x+px*side*(3.15+Math.sin((z+i)*.31)*.14);
        const wallZ=z+pz*side*(3.15+Math.sin((z+i)*.31)*.14);
        const rock=mesh(new THREE.DodecahedronGeometry(1.28+((i+step)%3)*.06,0),shellMaterial,wallX,1.3,wallZ);
        rock.scale.set(.86,1.2,1.02);rock.rotation.set(z*.13,side*.22,z*.08);g.add(rock);
      }
      const roof=mesh(new THREE.DodecahedronGeometry(1.48,0),shellMaterial,x,3.65,z);
      roof.scale.set(2.18,.66,1.04);roof.rotation.y=angle;g.add(roof);
    }
  }
  // Ein breiter, geschlossener Felsrücken verschluckt den inneren Tunnel.
  // Von außen ist dadurch kein langes Rohr mehr sichtbar; die Portalöffnung
  // sitzt am Fuß des Rückens und der Gang liegt vollständig darunter.
  for(let i=3;i<SHADOW_CAVE_PATH.length;i++) {
    const [x,z]=SHADOW_CAVE_PATH[i];
    const depth=(i-3)/(SHADOW_CAVE_PATH.length-4);
    const radius=3.8+depth*1.35;
    for(const side of [-1,1]) {
      const cover=mesh(new THREE.DodecahedronGeometry(radius,0),outer,x+side*(5.1+depth*1.15),2.35+depth*1.55,z);
      cover.scale.set(1.08,.86,1.32);cover.rotation.set(.08*side,i*.37,.12*side);g.add(cover);
    }
    const cap=mesh(new THREE.DodecahedronGeometry(radius+1.05,0),outer,x,5+depth*2.05,z);
    cap.scale.set(1.38,.68,1.22);cap.rotation.set(.06,i*.31,.04);g.add(cap);
  }
  // Punkt 0 liegt als Terrain-Übergang noch vor dem sichtbaren Portal.
  const [entranceX,entranceZ]=SHADOW_CAVE_PATH[1];
  const [darknessX,darknessZ]=SHADOW_CAVE_PATH[2];
  const darkness = mesh(new THREE.PlaneGeometry(4.15,2.65),new THREE.MeshBasicMaterial({color:0x080a0a,side:THREE.DoubleSide}),darknessX,1.45,darknessZ);
  g.add(darkness);

  // Massiver Portalbogen bindet den Tunnel sichtbar an den umliegenden Berg.
  for (const [x,y,s] of [[-3.2,.85,1.25],[3.2,.85,1.25],[-2.35,2.25,1.05],[2.35,2.25,1.05],[-1.15,3.05,1.0],[0,3.28,1.05],[1.15,3.05,1.0]]) {
    const portal = mesh(new THREE.DodecahedronGeometry(s,0), outer, entranceX+x, y, entranceZ+.2);
    portal.scale.z=.78; portal.rotation.set(x*.08,y*.14,x*.11); g.add(portal);
  }

  // Stalaktiten und Stalagmiten geben dem Inneren eine eindeutige unterirdische
  // Silhouette, bleiben aber seitlich außerhalb des Laufkorridors.
  for (let i=0;i<14;i++) {
    const pathPoint=SHADOW_CAVE_PATH[Math.min(SHADOW_CAVE_PATH.length-1,1+Math.floor(i/3))];
    const z=pathPoint[1]-(i%3)*1.25,centerX=pathPoint[0];
    const side=i%2?-1:1;
    const stalactite=mesh(new THREE.ConeGeometry(.18+(i%3)*.045,.65+(i%4)*.14,6),inner,centerX+side*(1.45+(i%3)*.2),2.7,z);
    stalactite.rotation.z=side*.08;g.add(stalactite);
    if(i%3===0){const floorSpike=mesh(new THREE.ConeGeometry(.16,.5,6),inner,centerX-side*1.7,.27,z-.7);g.add(floorSpike);}
  }
  // Erzadern geben der Erkundung einen unmittelbaren Zweck.
  for(const [x,y,z,s] of [[-2.2,.7,-8,.38],[2.05,1.25,-14,.3],[-2.1,1.7,-20,.25],[1.8,.55,-25,.42]]){
    const crystal=mesh(new THREE.OctahedronGeometry(s,0),ore,x,y,z);crystal.rotation.z=.5;g.add(crystal);
  }
  // Die versiegelte Endkammer verhindert einen Hinterausgang.
  const [endX,endZ]=SHADOW_CAVE_PATH.at(-1);
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2;const r=mesh(new THREE.DodecahedronGeometry(1.25,0),inner,endX+Math.cos(a)*2.1,1.25+Math.sin(a)*.8,endZ-.35);g.add(r);}
  const bones=mesh(new THREE.CylinderGeometry(.035,.05,.8,5),mat(0xd8cfb4),endX+.45,.16,endZ+2.8);bones.rotation.z=Math.PI/2;g.add(bones);
  // Sichtbarer Expeditionsvorrat; die eigentliche Belohnung wird beim Erreichen
  // der versiegelten Kammer über das Landmark-System vergeben.
  const cache=buildCaveCache(0x66452b);cache.position.set(endX-.45,.08,endZ+2.3);
  g.add(cache);
  // Schwaches, warmes Erz-Glimmen: macht die Adern im Dunkeln auffindbar und
  // gibt der Schattenhöhle Tiefe, ohne die Dunkelheit aufzuheben.
  const oreGlow=new THREE.PointLight(0xff9a4a,.85,11,2);oreGlow.position.set(0,1.6,-14);g.add(oreGlow);
  const endGlow=new THREE.PointLight(0xffb35c,.75,9,2);endGlow.position.set(endX,1.35,endZ+1.6);g.add(endGlow);
  return g;
}

function shadowCaveCollision(width=3.15) {
  const collision=[];
  // Abschnitt 1 ist nur der natürliche Hang vor dem Portal und bleibt frei.
  for(let i=2;i<SHADOW_CAVE_PATH.length;i++) {
    const [ax,az]=SHADOW_CAVE_PATH[i-1],[bx,bz]=SHADOW_CAVE_PATH[i];
    const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),px=dz/length,pz=-dx/length;
    const steps=Math.ceil(length/1.65);
    for(let step=0;step<=steps;step++) {
      const t=step/steps,x=THREE.MathUtils.lerp(ax,bx,t),z=THREE.MathUtils.lerp(az,bz,t);
      collision.push({x:x-px*width,z:z-pz*width,r:.64},{x:x+px*width,z:z+pz*width,r:.64});
    }
  }
  const [endX,endZ]=SHADOW_CAVE_PATH.at(-1);
  for(let i=0;i<5;i++) collision.push({x:endX-2.2+i*1.1,z:endZ-.35,r:.72});
  return collision;
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

function buildMushroomGrove() {
  const g=new THREE.Group(), stem=mat(0xd8c7a3), caps=[mat(0xa94b38),mat(0xc77a3e),mat(0x7aa99a,0x2d8b76)];
  for(let i=0;i<18;i++){
    const a=i/18*Math.PI*2,r=1.7+(i%4)*.48,s=.55+(i%3)*.16;
    const cluster=new THREE.Group();cluster.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
    cluster.add(mesh(new THREE.CylinderGeometry(.06,.09,.42,7),stem,0,.21,0));
    const cap=mesh(new THREE.SphereGeometry(.24,9,5,0,Math.PI*2,0,Math.PI*.54),caps[i%caps.length],0,.42,0);
    cap.scale.set(1.2,.72,1);cluster.add(cap);g.add(cluster);
  }
  const stump=sitsOnGround(mesh(new THREE.CylinderGeometry(.65,.82,.55,9),mat(0x59402c),0,.275,0));g.add(stump);
  return g;
}

function buildSummitCairn() {
  const g=new THREE.Group(), stone=mat(0x737a7b), wood=mat(0x60432a);
  for(let i=0;i<6;i++){
    const rock=mesh(new THREE.DodecahedronGeometry(.72-i*.075,0),stone,(i%2-.5)*.12,.32+i*.48,(i%3-1)*.08);
    rock.scale.y=.62;rock.rotation.set(i*.21,i*.63,i*.13);g.add(rock);
  }
  const pole=mesh(new THREE.CylinderGeometry(.035,.055,3.5,6),wood,1.2,1.75,0);g.add(pole);
  const flag=mesh(new THREE.PlaneGeometry(1.25,.62),mat(0xb85f3b),1.82,2.8,0);flag.position.x=1.82;g.add(flag);
  return g;
}

function buildCaveCache(color = 0x76502f) {
  const cache = new THREE.Group();
  cache.userData.caveCache = true;
  const box = mesh(new THREE.BoxGeometry(1.05,.52,.72),mat(color),0,.28,0);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0,.56,-.32);
  const lid = mesh(new THREE.BoxGeometry(1.1,.15,.76),mat(color + 0x101008),0,0,.32);
  lidPivot.add(lid);
  for(const x of [-.36,.36]) cache.add(mesh(new THREE.BoxGeometry(.07,.63,.77),mat(0x4b5150),x,.34,0));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(.74,.36),new THREE.MeshBasicMaterial({color:0xffd06b,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}));
  glow.rotation.x=-Math.PI/2;glow.position.y=.66;glow.visible=false;
  cache.add(box,lidPivot,glow);
  cache.userData.lid = lidPivot;
  cache.userData.glow = glow;
  return cache;
}

function addCaveShell(group, { length, width = 2.15, floorY = .03, outer = 0x555b58, inner = 0x303534, descent = false, accent = null }) {
  const outerMat=mat(outer),innerMat=mat(inner);
  const floorAt=descent?dryCaveFloorY:()=>floorY;
  for(const side of [-1,1]) for(let z=-length;z<=.5;z+=1.45){
    const rock=mesh(new THREE.DodecahedronGeometry(1.2+(Math.abs(Math.round(z))%3)*.08,0),z>-.8?outerMat:innerMat,side*(width+.55+Math.sin(z*.41)*.14),floorAt(z)+1.25,z);
    rock.scale.set(.8,1.15,1.02);rock.rotation.set(z*.08,side*.2,z*.11);group.add(rock);
  }
  for(let z=-length;z<=.2;z+=1.35){
    const roof=mesh(new THREE.DodecahedronGeometry(1.38,0),z>-.8?outerMat:innerMat,Math.sin(z*.3)*.14,floorAt(z)+3.35,z);
    roof.scale.set(2.05,.64,1.02);roof.rotation.y=z*.14;group.add(roof);
  }
  const floorMat=mat(inner-0x080808);
  if(descent) {
    const depth=-dryCaveFloorY(-DRY_CAVE_DESCENT_RUN);
    const slopeLength=Math.hypot(DRY_CAVE_DESCENT_RUN,depth);
    const slope=mesh(new THREE.BoxGeometry(width*2+.8,.14,slopeLength+.35),floorMat,0,-depth/2,-DRY_CAVE_DESCENT_RUN/2);
    slope.rotation.x=-DRY_CAVE_DESCENT_ANGLE;slope.receiveShadow=true;group.add(slope);
    const levelLength=Math.max(.5,length-DRY_CAVE_DESCENT_RUN);
    const level=mesh(new THREE.BoxGeometry(width*2+.8,.14,levelLength+.45),floorMat,0,-depth,-DRY_CAVE_DESCENT_RUN-levelLength/2);
    level.receiveShadow=true;group.add(level);
  } else {
    const floor=mesh(new THREE.BoxGeometry(width*2+.8,.14,length+.5),floorMat,0,floorY,-length/2+.25);
    floor.receiveShadow=true;group.add(floor);
  }
  // Eine durchgehende, zwischen den Felsbrocken versteckte Decke verhindert
  // helle Himmelsspalten. Die unregelmäßigen Dachfelsen bleiben sichtbar.
  if(descent) {
    const depth=-dryCaveFloorY(-DRY_CAVE_DESCENT_RUN),slopeLength=Math.hypot(DRY_CAVE_DESCENT_RUN,depth);
    const ceilingSlope=mesh(new THREE.BoxGeometry(width*2+2,.14,slopeLength+.3),innerMat,0,2.95-depth/2,-DRY_CAVE_DESCENT_RUN/2);
    ceilingSlope.rotation.x=-DRY_CAVE_DESCENT_ANGLE;group.add(ceilingSlope);
    const levelLength=Math.max(.5,length-DRY_CAVE_DESCENT_RUN);
    group.add(mesh(new THREE.BoxGeometry(width*2+2,.14,levelLength+.35),innerMat,0,2.95-depth,-DRY_CAVE_DESCENT_RUN-levelLength/2));
  } else {
    group.add(mesh(new THREE.BoxGeometry(width*2+2,.14,length+.25),innerMat,0,2.95,-length/2+.1));
  }
  for(const [x,y,s] of [[-2.8,.75,1.1],[2.8,.75,1.1],[-2.05,2,1],[2.05,2,1],[-.95,2.72,.9],[0,3,.95],[.95,2.72,.9]]){
    const portal=mesh(new THREE.DodecahedronGeometry(s,0),outerMat,x,y,.15);portal.scale.z=.78;portal.rotation.z=x*.06;group.add(portal);
  }
  // Zwei versetzte Felsrippen brechen die Sichtachse bis zur Endkammer. Auf
  // der jeweils anderen Seite bleibt ein mindestens 1,4 m breiter Durchgang.
  for(const [z,side] of [[-length*.34,-1],[-length*.66,1]]) {
    for(const offset of [.72,1.48]) {
      const rib=mesh(new THREE.DodecahedronGeometry(.82,0),innerMat,side*(width-offset),floorAt(z)+1.32,z);
      rib.scale.set(.88,1.62,.78);rib.rotation.set(.12,side*.24,.08*side);group.add(rib);
    }
  }
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2;const end=mesh(new THREE.DodecahedronGeometry(1.18,0),innerMat,Math.cos(a)*1.85,floorAt(-length)+1.2+Math.sin(a)*.75,-length-1);group.add(end);}
  // Tropfsteine geben den Gängen eine echte Höhlensilhouette. Sie hängen bzw.
  // stehen seitlich, damit der Laufkorridor in der Mitte frei bleibt.
  for(let i=0;i<Math.floor(length/1.6);i++){
    const z=-1.2-i*1.6,side=i%2?-1:1,fy=floorAt(z);
    const stalactite=mesh(new THREE.ConeGeometry(.15+(i%3)*.05,.55+(i%4)*.22,6),innerMat,side*(width-.55),fy+2.58,z);
    stalactite.rotation.x=Math.PI;stalactite.rotation.z=side*.06;group.add(stalactite);
    if(i%2===0){const spike=mesh(new THREE.ConeGeometry(.14+(i%2)*.04,.5+(i%3)*.2,6),innerMat,-side*(width-.72),fy+.24,z-.8);group.add(spike);}
  }
  // Optionale leuchtende Kristallnester samt schwachem Punktlicht machen die
  // Höhle stimmungsvoll erkundbar statt nur stockdunkel.
  if(accent){
    const crystalMat=new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:.8,roughness:.42});
    for(const [cx,cz,s] of [[-width+.78,-length*.42,.24],[width-.82,-length*.72,.3],[.42,-length+.85,.34]]){
      const fy=floorAt(cz);
      for(let k=0;k<3;k++){
        const crystal=mesh(new THREE.OctahedronGeometry(s*(1-k*.22),0),crystalMat,cx+(k-1)*.28,fy+.2+k*.07,cz+(k%2)*.3);
        crystal.rotation.set(k*.5,k*.9,.4);group.add(crystal);
      }
    }
    const glow=new THREE.PointLight(accent,1.1,13,2);
    glow.position.set(0,floorAt(-length*.7)+1.5,-length*.7);
    group.add(glow);
  }
}

function buildRootCave() {
  const g=new THREE.Group();addCaveShell(g,{length:18,width:2.25,outer:0x554533,inner:0x332c25,descent:true,accent:0xd89a4a});
  const rootMat=mat(0x5f3d28);
  for(let i=0;i<8;i++){
    const z=-1.5-i*2;
    const root=mesh(new THREE.CylinderGeometry(.08+(i%3)*.025,.13,4.25,6),rootMat,(i%2-.5)*.7,dryCaveFloorY(z)+2.45,z);
    root.rotation.z=Math.PI/2+(i%2?-.12:.12);root.rotation.y=i*.37;g.add(root);
  }
  for(let i=0;i<14;i++){
    const z=-2-i*1.05,x=(i%2?1:-1)*(1.35+(i%3)*.18);
    const floorY=dryCaveFloorY(z);
    const stem=mesh(new THREE.CylinderGeometry(.035,.055,.28,6),mat(0xd5c39f),x,floorY+.14,z);g.add(stem);
    const cap=mesh(new THREE.SphereGeometry(.13,7,4,0,Math.PI*2,0,Math.PI*.55),mat(i%3?0xa8583c:0xc47c42),x,floorY+.28,z);g.add(cap);
  }
  const cache=buildCaveCache(0x654329);cache.position.set(.55,dryCaveFloorY(-15.3)+.08,-15.3);g.add(cache);return g;
}

function buildIceCave() {
  const g=new THREE.Group();addCaveShell(g,{length:20,width:2.05,outer:0x737e82,inner:0x35454c,descent:true});
  const iceMat=mat(0x78b9c7,0x2c839a);
  for(let i=0;i<18;i++){
    const side=i%2?-1:1,z=-1-i*1.05;
    const floorY=dryCaveFloorY(z);
    const crystal=mesh(new THREE.ConeGeometry(.13+(i%4)*.04,.65+(i%3)*.28,6),iceMat,side*(1.35+(i%3)*.2),floorY+.34,z);
    crystal.rotation.z=side*(.15+(i%2)*.08);g.add(crystal);
    if(i%3===0){const hanging=mesh(new THREE.ConeGeometry(.11,.72,6),iceMat,-side*1.1,floorY+2.45,z-.4);hanging.rotation.z=Math.PI;g.add(hanging);}
  }
  const light=new THREE.PointLight(0x65d9ff,1.7,17,2);light.position.set(0,dryCaveFloorY(-13)+1.3,-13);g.add(light);
  const cache=buildCaveCache(0x52636b);cache.position.set(-.5,dryCaveFloorY(-17.2)+.08,-17.2);g.add(cache);return g;
}

function buildTideCave() {
  const g=new THREE.Group();addCaveShell(g,{length:28,width:2.35,floorY:-4.3,outer:0x596264,inner:0x25383c,accent:0x4fd0a8});
  const algae=mat(0x3f8f77,0x1d765e),wood=mat(0x54402f);
  // Der Eingang liegt trocken am Hang. Breite, flache Felsstufen senken den
  // Gang erst im Berg unter den Meeresspiegel ab; die hintere Kammer ist tief
  // genug, dass zur Schmugglerkiste wirklich getaucht werden muss.
  const caveFloor=mat(0x1d2d30),dryLength=13,dropRun=10,drop=4.35;
  const dryFloor=mesh(new THREE.BoxGeometry(5.35,.18,dryLength+.35),caveFloor,0,.05,-dryLength/2);
  dryFloor.receiveShadow=true;g.add(dryFloor);
  const slopeLength=Math.hypot(dropRun,drop);
  const slope=mesh(new THREE.BoxGeometry(5.35,.18,slopeLength+.35),caveFloor,0,.05-drop/2,-dryLength-dropRun/2);
  slope.rotation.x=-Math.atan2(drop,dropRun);slope.receiveShadow=true;g.add(slope);
  const rearFloor=mesh(new THREE.BoxGeometry(5.35,.18,5.35),caveFloor,0,-4.3,-25.5);
  rearFloor.receiveShadow=true;g.add(rearFloor);
  for(let i=0;i<12;i++){
    const z=-2-i*1.55,floorY=tideCaveFloorY(z);
    const bulb=mesh(new THREE.IcosahedronGeometry(.08+(i%3)*.025,0),algae,(i%2?1:-1)*(1.45+(i%3)*.2),floorY+.15+(i%3)*.16,z);g.add(bulb);
  }
  for(let i=0;i<5;i++){
    const z=-10-i*3.1;
    const plank=mesh(new THREE.BoxGeometry(1.8,.12,.24),wood,(i%2-.5)*.45,tideCaveFloorY(z)+.16,z);plank.rotation.y=i*.58;g.add(plank);
  }
  // Großer Felsmantel: Von außen ist nur das Portal in der Küstenklippe
  // sichtbar, nicht der dahinterliegende Tunnelkörper.
  const cliffMat=mat(0x596264);
  for(let i=0;i<4;i++) {
    const z=-5-i*6.4,depth=i/3,radius=3.7+depth*1.1;
    for(const side of [-1,1]) {
      const rock=mesh(new THREE.DodecahedronGeometry(radius,0),cliffMat,side*(5.1+depth*.8),2.2+depth*1.1,z);
      rock.scale.set(1.05,.82,1.25);rock.rotation.set(.08*side,i*.43,.1*side);g.add(rock);
    }
    const cap=mesh(new THREE.DodecahedronGeometry(radius+1,0),cliffMat,0,4.8+depth*1.5,z);
    cap.scale.set(1.35,.66,1.25);cap.rotation.y=i*.38;g.add(cap);
  }
  // Unterhalb der normalen Tunnelwaende schliesst eine zweite Felslage die
  // geflutete Kammer, damit man unter Wasser nicht aus der Hoehle hinaussieht.
  for(const side of [-1,1]) for(let z=-8;z>=-28;z-=1.55) {
    const rock=mesh(new THREE.DodecahedronGeometry(1.28,0),mat(0x25383c),side*2.9,-1.72,z);
    rock.scale.set(.82,1.72,1.05);rock.rotation.set(z*.07,side*.19,z*.09);g.add(rock);
  }
  const cache=buildCaveCache(0x4f4938);cache.position.set(.45,-4.22,-25.2);g.add(cache);return g;
}

function caveCollision(length,width=2.2){return[
  ...Array.from({length:Math.ceil(length/1.7)+1},(_,i)=>({x:-width-.12,z:.5-i*1.7,r:.62})),
  ...Array.from({length:Math.ceil(length/1.7)+1},(_,i)=>({x:width+.12,z:.5-i*1.7,r:.62})),
  ...[[-length*.34,-1],[-length*.66,1]].flatMap(([z,side])=>[
    {x:side*(width-.72),z,r:.58},{x:side*(width-1.48),z,r:.58},
  ]),
  ...Array.from({length:5},(_,i)=>({x:-2+i,z:-length-1,r:.7})),
];}
function cavePlatforms(length){return Array.from({length:Math.ceil(length)+1},(_,i)=>({
  x:0,z:-i,r:1.4,localY:dryCaveFloorY(-i)+.12,overrideTerrain:true,dry:true,
}));}
function tideCavePlatforms(length){return Array.from({length:Math.ceil(length)+1},(_,i)=>({
  x:0,z:-i,r:1.4,localY:tideCaveFloorY(-i),overrideTerrain:true,
}));}

const BEACON_SITES = {
  steinkreis: { x:0, z:-6 },
  jaegerlager: { x:-.7, z:-.2 },
  frostwarte: { x:2.8, z:1.5 },
  nordwacht: { x:0, z:0 },
  ostpass: { x:0, z:0 },
  westheiligtum: { x:0, z:-6 },
};

function buildSignalBeacon() {
  const group = new THREE.Group();
  const stone = mat(0x626664), iron = mat(0x4b504e), wood = mat(0x5f3d27);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const rock = mesh(new THREE.DodecahedronGeometry(.24 + (i % 2) * .05, 0), stone, Math.cos(a) * .62, .17, Math.sin(a) * .62);
    rock.scale.y = .72; group.add(rock);
  }
  for (const angle of [-.62, .62]) {
    const log = mesh(new THREE.CylinderGeometry(.09, .12, 1.05, 6), wood, 0, .2, 0);
    log.rotation.set(Math.PI / 2, 0, angle); group.add(log);
  }
  const bowl = mesh(new THREE.CylinderGeometry(.58, .42, .22, 9), iron, 0, .35, 0);
  group.add(bowl);
  const flameMat = new THREE.MeshBasicMaterial({ color:0xffad36, transparent:true, opacity:.92, depthWrite:false });
  const coreMat = new THREE.MeshBasicMaterial({ color:0xffec8b, transparent:true, opacity:.86, depthWrite:false });
  const flame = mesh(new THREE.ConeGeometry(.28, .95, 7), flameMat, 0, .92, 0);
  const core = mesh(new THREE.ConeGeometry(.14, .58, 6), coreMat, 0, .76, .02);
  const light = new THREE.PointLight(0xff9a3a, 0, 20, 1.7);
  light.position.y = 1.25;
  flame.visible = false; core.visible = false;
  group.add(flame, core, light);
  group.userData.flame = flame;
  group.userData.core = core;
  group.userData.light = light;
  return group;
}

// Die vier Eckpfosten eines Wachturms — mehrfach verwendet, deshalb einmal
// benannt statt in jeder Definition wiederholt.
const WATCHTOWER_COLLISION = [{x:-1.2,z:-1.2,r:.2},{x:1.2,z:-1.2,r:.2},{x:-1.2,z:1.2,r:.2},{x:1.2,z:1.2,r:.2}];

export const DEFINITIONS = [
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
  { id:'pilzhain',name:'Der flüsternde Pilzhain',story:'Der feuchte Waldboden ist voller essbarer Pilze. Drei Waldpilze ergeben am Lagerfeuer eine wärmende Pilzpfanne.',x:160,z:-110,build:buildMushroomGrove,reward:{pilz:6},collision:[{x:0,z:0,r:.62}] },
  { id:'frostwarte',name:'Die Frostwarte',story:'Du hast den höchsten Rücken bezwungen. Das verlassene Gipfellager beweist, dass vor dir schon jemand nach den Geheimnissen der Berge suchte.',x:225,z:-205,build:buildSummitCairn,reward:{eisen:3,fell:3,pilzpfanne:1},collision:[{x:0,z:0,r:.55},{x:1.2,z:0,r:.15}] },
  { id:'kuestenwrack', name:'Das gestrandete Wrack', story:'Jenseits der alten Küste liegt ein zerbrochenes Schiff mit Metall aus einer fremden Zeit.', x:-50,z:250,build:buildWreck,reward:{eisenerz:6,holz:8},collision:[{x:0,z:0,r:2.4}] },
  { id:'erzinsel', name:'Die Erzklippen', story:'Rostfarbene Adern durchziehen den Fels. Eine Expedition hierher lohnt sich.', x:245,z:110,build:buildOreCamp,reward:{eisenerz:9,stein:6},collision:[{x:0,z:0,r:1}] },
  { id:'nordwacht', name:'Die verlassene Nordwacht', story:'Vom morschen Turm aus überblickt man eine Wildnis, die größer ist als jede alte Karte.', x:-150,z:-260,build:buildWatchtower,reward:{fell:4,eisenerz:4},collision:[{x:-1.2,z:-1.2,r:.2},{x:1.2,z:-1.2,r:.2},{x:-1.2,z:1.2,r:.2},{x:1.2,z:1.2,r:.2}] },
  {
    id:'wurzelhoehle',name:'Die verschlungene Wurzelhöhle',
    story:'Unter dem westlichen Wald haben uralte Wurzeln eine trockene Kammer geöffnet. Pilze und vergessene Sammlervorräte wachsen hier immer wieder nach.',
    x:-185,z:145,discoverX:-185,discoverZ:129,build:buildRootCave,reward:{pilz:3,beeren:2},
    collision:caveCollision(18,2.25),platforms:cavePlatforms(18),clearance:{width:4,minZ:-20,maxZ:7},interiorWidth:2.45,interiorStartZ:-1.1,caveFloor:dryCaveFloorY,
    cache:{name:'Sammlerversteck',cooldownDays:2,type:'root'},
  },
  {
    id:'eiskluft',name:'Die singende Eiskluft',
    story:'Blaues Eis singt im Bergwind. Zwischen den Kristallen liegen Erz und Ausrüstung früherer Gipfelexpeditionen.',
    x:290,z:-165,discoverX:290,discoverZ:-182,build:buildIceCave,reward:{eisenerz:4,stein:3},
    collision:caveCollision(20,2.05),platforms:cavePlatforms(20),clearance:{width:4,minZ:-22,maxZ:7},interiorWidth:2.25,interiorStartZ:-1.1,caveFloor:dryCaveFloorY,
    cache:{name:'Gefrorener Expeditionsvorrat',cooldownDays:3,type:'ice'},
  },
  {
    id:'gezeitengrotte',name:'Die ertrunkene Gezeitengrotte',
    story:'Nur bei ruhiger See ist der Eingang zu erkennen. Unter Wasser wartet die Ladung eines längst zerbrochenen Schmugglerboots.',
    x:-300,z:205,rotation:Math.PI,discoverX:-300,discoverZ:197,build:buildTideCave,reward:{eisen:2,pfeil:6},
    collision:caveCollision(28,2.35),platforms:tideCavePlatforms(28),clearance:{width:4.2,minZ:-30,maxZ:7},interiorWidth:2.55,interiorStartZ:-1.1,caveFloor:tideCaveFloorY,
    cache:{name:'Versunkene Schmugglerkiste',cooldownDays:3,type:'tide'},
  },
  {
    id:'schattenhoehle', name:'Die Schattenhöhle',
    story:'Du bist durch den Wolfsbau bis in die versiegelte Kammer vorgedrungen. Erzadern und ein verlorener Expeditionsvorrat belohnen den Weg ins Dunkel.',
    x:-440,z:48, discoverX:-440,discoverZ:24,build:buildCave,reward:{eisenerz:9,stein:7,pfeil:6,fell:2},
    collision:shadowCaveCollision(),
    clearance:{width:6.5,minZ:-30,maxZ:7},interiorWidth:3.05,interiorStartZ:-1.15,cavePath:SHADOW_CAVE_PATH,caveFloor:()=>.05,
    cache:{name:'Verlorener Expeditionsvorrat',cooldownDays:4,type:'shadow'},
  },
  { id:'sternfall', name:'Der Sternfallkrater', story:'Ein fremdes Gestein pulsiert noch immer schwach. Seine Splitter eignen sich für besonders widerstandsfähige Werkzeuge.',x:455,z:-340,build:buildCrater,reward:{eisenerz:12,stein:8},collision:[{x:0,z:0,r:1.2}] },
  { id:'versunkene_ruinen', name:'Die versunkenen Ruinen', story:'Zwischen Moorwasser und alten Mauern findest du Zeichen einer vergessenen Expedition.',x:-470,z:315,build:buildRuins,reward:{holz:10,eisenerz:5},collision:[{x:-3,z:-2,r:.5},{x:3,z:-2,r:.5},{x:-3,z:2,r:.5},{x:3,z:2,r:.5}] },
  { id:'ostpass', name:'Der zerbrochene Ostpass', story:'Von hier führt ein alter Pfad in die entlegensten Berge. Jemand hat vor dir versucht, sie zu kartieren.',x:470,z:265,build:buildWatchtower,reward:{fell:5,holz:8},collision:[{x:-1.2,z:-1.2,r:.2},{x:1.2,z:-1.2,r:.2},{x:-1.2,z:1.2,r:.2},{x:1.2,z:1.2,r:.2}] },
  { id:'westheiligtum', name:'Das Heiligtum am Weltrand', story:'Die Steine markieren keinen Abschluss, sondern einen Anfang: Hinter jedem Horizont wartet eine weitere Geschichte.',x:-455,z:-345,build:buildStoneCircle,reward:{stein:12,beeren:8},collision:[] },
  { id:'nordgratstation', name:'Die Nordgratstation', story:'Jenseits der alten Karte steht eine vereiste Vermessungsstation. Ihre Markierungen weisen noch tiefer in die Wildnis.',x:-150,z:-600,build:buildWatchtower,reward:{eisenerz:7,fell:4,holz:6},collision:[{x:-1.2,z:-1.2,r:.2},{x:1.2,z:-1.2,r:.2},{x:-1.2,z:1.2,r:.2},{x:1.2,z:1.2,r:.2}] },
  { id:'westklippenposten', name:'Der Westklippenposten', story:'Ein einsamer Posten markiert das Ende der alten Wege. Dahinter beginnt unkartiertes Land.',x:-625,z:50,build:buildWatchtower,reward:{holz:10,eisenerz:5},collision:[{x:-1.2,z:-1.2,r:.2},{x:1.2,z:-1.2,r:.2},{x:-1.2,z:1.2,r:.2},{x:1.2,z:1.2,r:.2}] },
  { id:'suedaue', name:'Der Steinkreis der Südaue', story:'Die weit entfernten Steine zeigen, dass auch der neue Süden einst von Reisenden erreicht wurde.',x:-125,z:625,build:buildStoneCircle,reward:{stein:14,beeren:10},collision:[] },

  // Außengürtel jenseits von 640 m. Vorher endete jedes Entdeckungsziel bei
  // 637 m, während die Karte bis 1230 m reicht — der gesamte gefährliche Ring
  // war zielloses Laufland. Die Orte folgen den drei Krokodilflüssen und den
  // beiden Endgame-Revieren, damit die Route dorthin etwas zu finden hat.
  { id:'ostfurt_lager', name:'Das Lager an der Ostfurt', story:'Wer den Fluss hier querte, ließ Vorräte zurück. Die tiefen Kratzspuren im Holz stammen von keinem Wolf.',x:668,z:-96,build:buildWatchtower,reward:{eisenerz:8,holz:10,fell:5},collision:WATCHTOWER_COLLISION },
  { id:'schuppenbank', name:'Die Schuppenbank', story:'Eine Sandbank voller abgeworfener Panzerschuppen. Das Leder der Flusstiere ist zäher als jedes Fell.',x:806,z:-168,build:buildOreCamp,reward:{krokodilleder:4,eisenerz:6},collision:[{x:0,z:0,r:1}] },
  { id:'ostmuendung', name:'Die Mündungsklippen', story:'Der Ostfluss verliert sich im Meer. Von den Klippen siehst du, wie weit die Wildnis wirklich reicht.',x:1074,z:-165,build:buildStoneCircle,reward:{stein:16,eisenerz:8},collision:[] },
  { id:'suedwest_wacht', name:'Die Sumpfwacht', story:'Ein Beobachtungsposten über dem Moor. Die Leiter ist frisch ausgebessert — jemand war kürzlich hier.',x:-499,z:558,build:buildWatchtower,reward:{holz:12,eisenerz:6,heilkraut:4},collision:WATCHTOWER_COLLISION },
  { id:'moorruine', name:'Die Ruine im Schilf', story:'Halb versunkene Mauern. Zwischen den Steinen glänzt Metall, das niemand mehr geholt hat.',x:-725,z:796,build:buildRuins,reward:{eisenerz:11,holz:9},collision:[{x:-3,z:-2,r:.5},{x:3,z:-2,r:.5},{x:-3,z:2,r:.5},{x:3,z:2,r:.5}] },
  { id:'suedwestrand', name:'Der Steinkreis am Südwestrand', story:'Der letzte gesetzte Stein vor dem offenen Wasser. Hier endet, was je kartiert wurde.',x:-800,z:874,build:buildStoneCircle,reward:{stein:18,beeren:12},collision:[] },
  { id:'nordfurt_station', name:'Die Station an der Nordfurt', story:'Eine Vermessungsstation am Flussübergang. Die letzten Einträge im Buch brechen mitten im Satz ab.',x:474,z:-676,build:buildWatchtower,reward:{eisenerz:9,fell:6,holz:8},collision:WATCHTOWER_COLLISION },
  { id:'schluchtkrater', name:'Der Krater der Nordschlucht', story:'Ein Einschlag hat den Fels aufgerissen. In der Nähe hörst du etwas Großes durch das Unterholz brechen.',x:392,z:-889,build:buildCrater,reward:{eisenerz:14,stein:10},collision:[{x:0,z:0,r:1.2}] },
  { id:'nordkap', name:'Das Nordkap', story:'Der nördlichste Punkt, den ein Mensch erreicht hat. Der Wind trägt Geräusche heran, die du nicht zuordnen kannst.',x:417,z:-1101,build:buildStoneCircle,reward:{stein:16,fell:8},collision:[] },
  { id:'ostgrat', name:'Der Ostgrat', story:'Ein Bergrücken zwischen zwei Flusstälern. Von oben erkennst du die Reviere der großen Tiere.',x:905,z:339,build:buildSummitCairn,reward:{eisen:4,fell:5,hoehlenragout:1},collision:[{x:0,z:0,r:.55},{x:1.2,z:0,r:.15}] },
  { id:'westkliff', name:'Das Westkliff', story:'Zerklüfteter Fels über der Brandung. Ein altes Seil führt in eine Spalte, aus der kalte Luft steigt.',x:-1018,z:-243,build:buildOreCamp,reward:{eisenerz:13,stein:9},collision:[{x:0,z:0,r:1}] },
  { id:'suedwrack', name:'Das zweite Wrack', story:'Noch ein gestrandetes Schiff, weit außerhalb jeder Route. Wer immer hier ankam — er ging nicht zu Fuß weiter.',x:195,z:1010,build:buildWreck,reward:{eisenerz:10,holz:12},collision:[{x:0,z:0,r:2.4}] },
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
      const rotation=def.rotation||0,cos=Math.cos(rotation),sin=Math.sin(rotation);
      const worldOffset=(x,z)=>({x:x*cos+z*sin,z:-x*sin+z*cos});
      // Jeder bodengebundene Bestandteil tastet das Terrain an seiner eigenen
      // Weltposition ab. So schweben Objekte auf Hängen nicht über dem Boden.
      for (const child of group.children) {
        if (!child.userData.sitsOnGround) continue;
        const offset=worldOffset(child.position.x,child.position.z);
        child.position.y += terrainHeight(def.x + offset.x, def.z + offset.z) - baseHeight;
      }
      group.rotation.y=rotation;
      group.position.set(def.x, baseHeight, def.z);
      this.group.add(group);
      for (const shape of def.collision || []) {
        const offset=worldOffset(shape.x,shape.z);
        const ground = terrainHeight(def.x + offset.x, def.z + offset.z);
        this.obstacles.push({
          x: def.x + offset.x, z: def.z + offset.z, r: shape.r, landmark: def.id,
          top: shape.height == null ? null : ground + shape.height,
        });
      }
      for (const platform of def.platforms || []) {
        const offset=worldOffset(platform.x,platform.z);
        const x = def.x + offset.x;
        const z = def.z + offset.z;
        const y = platform.localY == null ? terrainHeight(x, z) + platform.height : baseHeight + platform.localY;
        this.platforms.push({ x, z, r: platform.r, y, overrideTerrain:!!platform.overrideTerrain, dry:!!platform.dry });
      }
      return { ...def, group };
    });
    this.caveCaches = this.list.flatMap((landmark) => {
      if (!landmark.cache) return [];
      let cacheGroup = null;
      landmark.group.traverse((node) => { if (node.userData.caveCache) cacheGroup = node; });
      if (!cacheGroup) return [];
      landmark.group.updateWorldMatrix(true, true);
      const position = cacheGroup.getWorldPosition(new THREE.Vector3());
      landmark.caveCache = true;
      landmark.cacheReady = true;
      return [{
        id:landmark.id, landmark, group:cacheGroup, x:position.x, y:position.y, z:position.z,
        name:landmark.cache.name, cooldownDays:landmark.cache.cooldownDays, type:landmark.cache.type, ready:true,
      }];
    });
    this.beacons = Object.entries(BEACON_SITES).flatMap(([landmarkId, offset]) => {
      const landmark = this.list.find((entry) => entry.id === landmarkId);
      if (!landmark) return [];
      const x = landmark.x + offset.x, z = landmark.z + offset.z;
      const group = buildSignalBeacon();
      group.position.set(x, terrainHeight(x, z), z);
      this.group.add(group);
      const beacon = { id:landmarkId, landmark, x, z, group, lit:false };
      landmark.beacon = true;
      landmark.beaconLit = false;
      return [beacon];
    });
  }

  setBeaconLit(id, lit = true) {
    const beacon = this.beacons.find((entry) => entry.id === id);
    if (!beacon) return false;
    beacon.lit = !!lit;
    beacon.landmark.beaconLit = beacon.lit;
    beacon.group.userData.flame.visible = beacon.lit;
    beacon.group.userData.core.visible = beacon.lit;
    beacon.group.userData.light.intensity = beacon.lit ? 3.8 : 0;
    return true;
  }

  loadBeacons(ids = []) {
    const active = new Set(Array.isArray(ids) ? ids : []);
    for (const beacon of this.beacons) this.setBeaconLit(beacon.id, active.has(beacon.id));
  }

  litBeaconIds() { return this.beacons.filter((beacon) => beacon.lit).map((beacon) => beacon.id); }

  localPoint(landmark,x,z) { return localPoint(landmark,x,z); }

  worldPoint(landmark,localX,localZ) {
    const rotation=landmark.rotation||0;
    return {
      x:landmark.x+localX*Math.cos(rotation)+localZ*Math.sin(rotation),
      z:landmark.z-localX*Math.sin(rotation)+localZ*Math.cos(rotation),
    };
  }

  caveFloorAt(landmark,x,z) {
    if(!landmark?.clearance)return terrainHeight(x,z);
    const local=localPoint(landmark,x,z);
    return terrainHeight(landmark.x,landmark.z)+(landmark.caveFloor?.(local.z)??0);
  }

  containsCave(landmark,position,margin=0) {
    if(!landmark?.clearance||!position)return false;
    const local=localPoint(landmark,position.x,position.z);
    const horizontal=landmark.cavePath
      ? distanceToLocalPath(local.x,local.z,landmark.cavePath)<3.45+margin
      : Math.abs(local.x)<landmark.clearance.width+margin
        && local.z>landmark.clearance.minZ-margin
        && local.z<Math.min(1.25,landmark.clearance.maxZ)+margin;
    if(!horizontal)return false;
    // Ohne Höhenprüfung konnte man Höhlen auf dem Berg darüber entdecken,
    // abdunkeln und sogar deren Kisten durch den Fels hindurch plündern.
    return Math.abs(position.y-this.caveFloorAt(landmark,position.x,position.z))<2.35+margin;
  }

  // Enger als containsCave(): Diese Prüfung beschreibt ausschließlich den
  // begehbaren Innenraum hinter dem Portal. Clearance bleibt dagegen bewusst
  // großzügig für Entdeckung und das Freihalten von Bäumen/Felsen.
  isInsideCave(landmark,position,margin=0) {
    if(!landmark?.clearance||!position)return false;
    const local=localPoint(landmark,position.x,position.z);
    const startZ=landmark.interiorStartZ??-1.1;
    const endZ=landmark.clearance.minZ-.65;
    if(local.z>=startZ+margin*.15||local.z<=endZ-margin)return false;
    const width=(landmark.interiorWidth??2.5)+margin;
    const horizontal=landmark.cavePath
      ? distanceToLocalPath(local.x,local.z,landmark.cavePath.slice(1))<width
      : Math.abs(local.x)<width;
    if(!horizontal)return false;
    return Math.abs(position.y-this.caveFloorAt(landmark,position.x,position.z))<2.45;
  }

  nearestBeacon(playerPos, maxDistance = 3.6, discovered = []) {
    let nearest = null, nearestDistance = maxDistance;
    for (const beacon of this.beacons) {
      if (!discovered.includes(beacon.id)) continue;
      const distance = Math.hypot(playerPos.x - beacon.x, playerPos.z - beacon.z);
      if (distance <= nearestDistance) { nearest = beacon; nearestDistance = distance; }
    }
    return nearest;
  }

  activeBeaconFires() {
    return this.beacons.filter((beacon) => beacon.lit).map((beacon) => ({ x:beacon.x, z:beacon.z }));
  }

  updateBeacons(dt, time = 0) {
    for (const beacon of this.beacons) {
      if (!beacon.lit) continue;
      const flame = beacon.group.userData.flame, core = beacon.group.userData.core;
      flame.scale.set(1 + Math.sin(time * 8 + beacon.x) * .08, .88 + Math.sin(time * 11 + beacon.z) * .14, 1);
      flame.rotation.y += dt * 1.8;
      core.scale.y = .9 + Math.sin(time * 13 + beacon.x * .1) * .12;
      beacon.group.userData.light.intensity = 3.45 + Math.sin(time * 10 + beacon.z) * .45;
    }
    for (const cache of this.caveCaches) {
      if (!cache.ready || !cache.group.userData.glow) continue;
      cache.group.userData.glow.material.opacity = .14 + (Math.sin(time * 4 + cache.x) + 1) * .07;
    }
  }

  updateCaveCaches(day, cooldowns = {}) {
    for (const cache of this.caveCaches) {
      const ready = day >= (Number(cooldowns[cache.id]) || 0);
      cache.ready = ready;
      cache.landmark.cacheReady = ready;
      cache.landmark.cacheNextDay = Number(cooldowns[cache.id]) || day;
      cache.group.userData.glow.visible = ready;
      cache.group.userData.lid.rotation.x = ready ? 0 : -.72;
    }
  }

  nearestCaveCache(playerPos, maxDistance = 3.2, discovered = []) {
    let nearest = null, nearestDistance = maxDistance;
    for (const cache of this.caveCaches) {
      if (!discovered.includes(cache.id)) continue;
      if (Math.abs(playerPos.y-cache.y) > 2.35) continue;
      const distance = Math.hypot(playerPos.x - cache.x, playerPos.z - cache.z);
      if (distance <= nearestDistance) { nearest = cache; nearestDistance = distance; }
    }
    return nearest;
  }

  update(playerPos, discovered) {
    for (const landmark of this.list) {
      if (discovered.includes(landmark.id)) continue;
      const x = landmark.discoverX ?? landmark.x;
      const z = landmark.discoverZ ?? landmark.z;
      if (Math.hypot(playerPos.x - x, playerPos.z - z) <= 8
        && (!landmark.clearance || this.containsCave(landmark,playerPos,.8))) return landmark;
    }
    return null;
  }
}

export const LANDMARK_COUNT = DEFINITIONS.length;
export const BEACON_COUNT = Object.keys(BEACON_SITES).length;
