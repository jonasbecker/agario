import * as THREE from 'three';

// Schwarzes Loch: ein einziges Quad je Loch mit ShaderMaterial. Der Fragment-
// Shader zeichnet eine rotierende, hell glühende Akkretionsscheibe um einen
// dunklen „Void"-Kern (Zentrum transparent -> zeigt den dunklen Space-Hintergrund).
// Additives Blending + helle Bänder triggern den Bloom-Pass. Ein Draw-Call/Loch.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;   // Akkretionsfarbe
  uniform vec3 uHot;     // heißer Innenrand
  uniform float uCore;   // Event-Horizon-Radius als Anteil (0..1)

  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p) * 2.0;          // 0 im Zentrum, 1 am Quad-Rand (= Radius)
    if (d > 1.0) discard;
    float ang = atan(p.y, p.x);

    // spiralige Streifen: drehen sich mit der Zeit, enger nach innen
    float streak = 0.5 + 0.5 * sin(ang * 5.0 - uTime * 4.0 + 3.0 / max(d, 0.16));
    // Ringprofil: 0 im Void, steigt knapp außerhalb des Kerns, verblasst zum Rand
    float ring = smoothstep(uCore, uCore + 0.08, d) * (1.0 - smoothstep(0.45, 1.0, d));
    float intensity = ring * (0.30 + 0.70 * streak);
    // heißer Rand direkt am Event Horizon
    float rim = exp(-pow((d - uCore) * 16.0, 2.0));

    float glow = clamp(intensity + rim, 0.0, 1.0);
    vec3 col = mix(uColor, uHot, glow);
    float alpha = clamp(intensity + rim * 0.9, 0.0, 1.0);
    gl_FragColor = vec4(col * (0.7 + 0.6 * glow), alpha);
  }
`;

export function makeBlackholeView(scene, coreFrac) {
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x7a3cff) },
      uHot: { value: new THREE.Color(0xffe6ff) },
      uCore: { value: coreFrac },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = -0.5; // hinter den Zellen, vor dem Raster
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, mat };
}

export function disposeBlackholeView(view, scene) {
  scene.remove(view.mesh);
  view.mesh.geometry.dispose();
  view.mat.dispose();
}
