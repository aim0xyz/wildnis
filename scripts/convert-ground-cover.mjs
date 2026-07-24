import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// FBXLoader creates an image element even when we deliberately replace the
// source material later. A tiny DOM shim keeps this one-off Node conversion
// independent from a browser.
globalThis.document = {
  createElementNS() {
    return {
      addEventListener() {},
      removeEventListener() {},
      set src(_value) {},
      get src() { return ''; },
    };
  },
};

globalThis.FileReader = class FileReader {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onload?.({ target: this });
    this.onloadend?.({ target: this });
  }

  async readAsDataURL(blob) {
    const bytes = Buffer.from(await blob.arrayBuffer());
    this.result = `data:${blob.type};base64,${bytes.toString('base64')}`;
    this.onload?.({ target: this });
    this.onloadend?.({ target: this });
  }
};

const root = process.cwd();
const sourceDir = path.join(root, 'assets/3D Low Poly Shrubs Flowers Mushrooms Pack/fbx');
const outputDir = path.join(root, 'assets/ground-cover');
const selected = [
  ['_grass_1.fbx', 'grass-1.glb'],
  ['_grass_2.fbx', 'grass-2.glb'],
  ['_flower_3.fbx', 'flower-3.glb'],
  ['_flower_5.fbx', 'flower-5.glb'],
  ['_mashroom_1.fbx', 'mushroom-1.glb'],
  ['_mashroom_3.fbx', 'mushroom-3.glb'],
  ['_mashroom_4.fbx', 'mushroom-4.glb'],
  ['_bush_1.fbx', 'bush-1.glb'],
  ['_bush_2.fbx', 'bush-2.glb'],
  ['_bush_3.fbx', 'bush-3.glb'],
];

const loader = new FBXLoader();
const exporter = new GLTFExporter();
await fs.mkdir(outputDir, { recursive: true });

for (const [inputName, outputName] of selected) {
  const bytes = await fs.readFile(path.join(sourceDir, inputName));
  const source = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), sourceDir);
  source.updateMatrixWorld(true);

  const meshes = [];
  source.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    geometry.scale(0.01, 0.01, 0.01); // Das Pack ist in Zentimetern angelegt.
    meshes.push(geometry);
  });
  if (!meshes.length) throw new Error(`${inputName} enthält kein Mesh.`);

  const mergedScene = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  for (const geometry of meshes) mergedScene.add(new THREE.Mesh(geometry, material));

  const bounds = new THREE.Box3().setFromObject(mergedScene);
  const center = bounds.getCenter(new THREE.Vector3());
  mergedScene.position.set(-center.x, -bounds.min.y, -center.z);
  mergedScene.updateMatrixWorld(true);

  const binary = await exporter.parseAsync(mergedScene, {
    binary: true,
    onlyVisible: true,
  });
  await fs.writeFile(path.join(outputDir, outputName), Buffer.from(binary));

  const size = bounds.getSize(new THREE.Vector3());
  console.log(`${outputName}: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m`);
}
