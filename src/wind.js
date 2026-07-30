import * as THREE from 'three';

// Gemeinsame Wind-Uniforms für alle Vegetations-Materialien. Die Auslenkung
// passiert komplett im Vertex-Shader: keine zusätzlichen Draw-Calls, keine
// CPU-Arbeit pro Objekt, nur ein paar sin() auf ohnehin sehr grober Geometrie.
// Die Welt schreibt hier einmal pro Frame den aktuellen Windvektor hinein.
export const windUniforms = {
  uWindTime: { value: 0 },
  // xz-Windvektor; seine Länge ist bereits die Windstärke inklusive Böen,
  // dadurch skaliert die Auslenkung automatisch mit dem Wetter.
  uWindVec: { value: new THREE.Vector2(0.35, 0.1) },
};

// Position des Spielers, damit Vegetation vor ihm zur Seite weicht. Ein
// einziger Uniform-Satz für alle betroffenen Materialien — kein Suchen nach
// betroffenen Instanzen, keine CPU-Arbeit pro Halm.
export const trampleUniforms = {
  uTramplePos: { value: new THREE.Vector3(0, -999, 0) },
  uTrampleRadius: { value: 1.3 },
  uTrampleStrength: { value: 0.55 },
};

export function updateWindUniforms(dt, wind, playerPos = null) {
  windUniforms.uWindTime.value += dt;
  if (wind) windUniforms.uWindVec.value.set(wind.x, wind.z);
  if (playerPos) trampleUniforms.uTramplePos.value.copy(playerPos);
}

/**
 * Lässt Vegetation vor dem Spieler zur Seite weichen.
 *
 * Die Verdrängung passiert in Weltkoordinaten, damit sie unabhängig von der
 * Drehung der Instanz immer radial vom Spieler weg zeigt. Dafür wird
 * <project_vertex> ersetzt statt <begin_vertex> ergänzt — mvPosition behält
 * dabei seine Bedeutung, sonst bräche vViewPosition und damit die Beleuchtung.
 *
 * Kombinierbar mit applyWindSway: beide hängen sich nacheinander in
 * onBeforeCompile ein und greifen an unterschiedlichen Stellen an.
 */
// reach ist die lokale Höhe, ab der voll gebogen wird. Sie muss unter der
// Höhe der kürzesten Exemplare liegen — liegt sie darüber, erreicht kein
// einziger Vertex die volle Auslenkung und der Effekt verpufft.
export function applyTrample(material, { instanced = false, reach = 0.35 } = {}) {
  const uniforms = { ...trampleUniforms, uTrampleReach: { value: reach } };
  material.userData.trample = uniforms;

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uTramplePos;
        uniform float uTrampleRadius;
        uniform float uTrampleStrength;
        uniform float uTrampleReach;`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        ${instanced ? '#ifdef USE_INSTANCING\n  mvPosition = instanceMatrix * mvPosition;\n#endif' : ''}
        vec4 trampleWorld = modelMatrix * mvPosition;
        {
          // Nur der obere Teil der Pflanze weicht aus, der Ansatz bleibt im
          // Boden stehen. uTrampleReach ist die Höhe, ab der voll gebogen wird.
          vec3 trampleOrigin = (modelMatrix ${instanced ? '* instanceMatrix ' : ''}* vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float trampleH = clamp((trampleWorld.y - trampleOrigin.y) / uTrampleReach, 0.0, 1.0);
          vec2 trampleDelta = trampleWorld.xz - uTramplePos.xz;
          float trampleDist = length(trampleDelta);
          // Vertikal begrenzen, damit der Spieler nicht Gras auf dem Hügel
          // über sich oder im Tal unter sich umknickt.
          float trampleBand = 1.0 - smoothstep(1.2, 2.4, abs(trampleOrigin.y - uTramplePos.y));
          float tramplePush = (1.0 - smoothstep(0.0, uTrampleRadius, trampleDist)) * trampleBand * trampleH;
          vec2 trampleDir = trampleDist > 0.001 ? trampleDelta / trampleDist : vec2(0.0, 1.0);
          trampleWorld.xz += trampleDir * (tramplePush * uTrampleStrength);
          // Was zur Seite weicht, sackt auch etwas ab — sonst sieht es aus,
          // als würde das Gras vor dem Spieler fliehen statt niedergedrückt.
          trampleWorld.y -= tramplePush * uTrampleStrength * 0.45;
        }
        mvPosition = viewMatrix * trampleWorld;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  refreshCacheKey(material, instanced);
  material.needsUpdate = true;
  return material;
}

/**
 * Hängt eine Wind-Biegung an ein bestehendes Material.
 *
 * Die Stärke wächst mit der lokalen Höhe des Vertex: unten am Ansatz bleibt
 * alles stehen, oben schwingt es. Dadurch löst sich nichts vom Boden bzw. vom
 * Stamm ab, ohne dass pro Objekt Daten gebacken werden müssten.
 *
 * @param {THREE.Material} material  Zielmaterial (wird in-place erweitert)
 * @param {object} opts
 *   amplitude – maximale Auslenkung in lokalen Einheiten bei Windstärke 1
 *   pivot     – lokales y, ab dem gebogen wird (Unterkante der Geometrie)
 *   span      – lokale y-Spanne von pivot bis zur vollen Auslenkung
 *   speed     – Frequenzfaktor; Gras schwingt schneller als eine Baumkrone
 *   instanced – true für InstancedMesh (Phase kommt aus der Instanz-Matrix)
 */
export function applyWindSway(material, {
  amplitude = 0.12,
  pivot = 0,
  span = 1,
  speed = 1,
  instanced = false,
} = {}) {
  const uniforms = {
    ...windUniforms,
    uSwayAmp: { value: amplitude },
    uSwayPivot: { value: pivot },
    uSwaySpan: { value: Math.max(1e-4, span) },
    uSwaySpeed: { value: speed },
  };
  material.userData.windSway = uniforms;

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uWindTime;
        uniform vec2 uWindVec;
        uniform float uSwayAmp;
        uniform float uSwayPivot;
        uniform float uSwaySpan;
        uniform float uSwaySpeed;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // Der Ursprung des Objekts liefert eine ortsfeste Phase. Benachbarte
          // Pflanzen laufen dadurch als Welle durch die Landschaft, statt im
          // Gleichtakt zu wackeln.
          vec3 swayOrigin = (modelMatrix ${instanced ? '* instanceMatrix ' : ''}* vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float swayPhase = swayOrigin.x * 0.26 + swayOrigin.z * 0.19;
          float swayAmt = clamp((transformed.y - uSwayPivot) / uSwaySpan, 0.0, 1.0);
          // Quadratisch: der Ansatz bleibt steif, die Spitze gibt nach.
          swayAmt *= swayAmt;
          float swayOsc = sin(uWindTime * (1.15 * uSwaySpeed) + swayPhase) * 0.62
                        + sin(uWindTime * (2.35 * uSwaySpeed) + swayPhase * 1.73) * 0.26;
          // Richtung und Stärke getrennt: bei Flaute bleibt ein Grundwehen
          // übrig, sonst steht die ganze Vegetation an ruhigen Tagen still.
          float swayForce = length(uWindVec);
          vec2 swayDir = swayForce > 0.001 ? uWindVec / swayForce : vec2(1.0, 0.0);
          float swayGain = 0.3 + swayForce * 0.85;
          transformed.xz += swayDir * (uSwayAmp * swayAmt * swayGain) * (0.55 + swayOsc * 0.8);
        }`);
  };
  refreshCacheKey(material, instanced);
  material.needsUpdate = true;
  return material;
}

// Ohne eigenen Cache-Key würde three.js Programme über onBeforeCompile.toString()
// unterscheiden — das ist für alle Aufrufe hier identisch, die erzeugten Shader
// sind es aber nicht. Der Key muss deshalb jede Kombination auseinanderhalten,
// sonst bekäme z. B. ein Material mit Wind, aber ohne Trampeln, das Programm
// des Nachbarn. Die Zahlenwerte stecken in Uniforms und dürfen geteilt werden.
function refreshCacheKey(material, instanced) {
  const parts = [
    material.type,
    instanced ? 'inst' : 'single',
    material.userData.windSway ? 'sway' : '',
    material.userData.trample ? 'trample' : '',
  ].filter(Boolean);
  const key = parts.join('-');
  material.customProgramCacheKey = () => key;
}
