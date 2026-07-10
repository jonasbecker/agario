import * as THREE from 'three';

// Kreissegmente pro Zelle — jede Zelle bekommt eine eigene Geometrie,
// deren Rand pro Frame organisch wabert (siehe updateCellWobble)
const CELL_SEGMENTS = 40;

function makeVirusGeometry(spikes = 18) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.86;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  return new THREE.ShapeGeometry(shape, 2);
}
const virusGeo = makeVirusGeometry();

// Namensschilder: Material pro Text cachen (Split-Zellen teilen sich eins)
const labelMaterialCache = new Map();

function getLabelMaterial(text) {
  let mat = labelMaterialCache.get(text);
  if (mat) return mat;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  let fontSize = 38;
  ctx.font = `bold ${fontSize}px 'Segoe UI', Helvetica, Arial, sans-serif`;
  const width = ctx.measureText(text).width;
  if (width > 236) fontSize = Math.floor(fontSize * (236 / width));
  ctx.font = `bold ${fontSize}px 'Segoe UI', Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = 7;
  ctx.strokeText(text, 128, 34);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  labelMaterialCache.set(text, mat);
  return mat;
}

// Zelle = dunkler Rand + Füllung + optionales Namensschild, alles in einer Gruppe,
// die pro Frame auf den Zellradius skaliert wird.
export function makeCellView(color, name, scene) {
  const group = new THREE.Group();
  const geo = new THREE.CircleGeometry(1, CELL_SEGMENTS);

  const rim = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.78) })
  );
  group.add(rim);

  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  fill.scale.setScalar(0.93);
  fill.position.z = 0.05;
  group.add(fill);

  let label = null;
  if (name) {
    label = new THREE.Sprite(getLabelMaterial(name));
    label.scale.set(2.3, 0.575, 1);
    label.position.z = 0.1;
    group.add(label);
  }

  scene.add(group);
  return {
    group, rim, fill, label, geo,
    // Zufällige Phase/Tempo, damit nicht alle Zellen synchron wabern
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 2 + Math.random() * 1.5,
  };
}

// Lässt den Zellrand organisch wabern: Ring-Vertices der Einheitskreis-Geometrie
// werden mit zwei überlagerten Sinuswellen radial verschoben. Ganzzahlige
// Wellenzahlen halten die Naht (erster/letzter Ring-Vertex) geschlossen.
export function updateCellWobble(view, time) {
  const pos = view.geo.attributes.position;
  const ring = pos.count - 2; // Vertex 0 = Mittelpunkt, letzter = Nahtduplikat
  const t1 = time * view.wobbleSpeed + view.wobblePhase;
  const t2 = time * view.wobbleSpeed * 1.7 - view.wobblePhase;
  for (let j = 1; j < pos.count; j++) {
    const ang = ((j - 1) / ring) * Math.PI * 2;
    const r = 1 + 0.02 * Math.sin(ang * 5 + t1) + 0.012 * Math.sin(ang * 9 + t2);
    pos.setXY(j, Math.cos(ang) * r, Math.sin(ang) * r);
  }
  pos.needsUpdate = true;
}

export function disposeCellView(view, scene) {
  scene.remove(view.group);
  view.geo.dispose();
  view.rim.material.dispose();
  view.fill.material.dispose();
  // Label-Material bleibt im Cache (wird von Split-Zellen wiederverwendet)
}

export function makeVirusView(scene) {
  const group = new THREE.Group();
  const rim = new THREE.Mesh(virusGeo, new THREE.MeshBasicMaterial({ color: 0x27a327 }));
  group.add(rim);
  const fill = new THREE.Mesh(virusGeo, new THREE.MeshBasicMaterial({ color: 0x33cc33 }));
  fill.scale.setScalar(0.9);
  fill.position.z = 0.05;
  group.add(fill);
  scene.add(group);
  return { group };
}

// Sorgt dafür, dass Labels großer Zellen über denen kleiner Zellen liegen
export function setLabelOrder(view, radius) {
  if (view.label) view.label.renderOrder = 100 + radius;
}
