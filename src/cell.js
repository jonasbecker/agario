import * as THREE from 'three';
import { getSkinTexture } from './skins.js';
import { WOBBLE_STRETCH, WOBBLE_STRETCH_SCALE } from './constants.js';

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
export function makeCellView(color, name, scene, skin = '') {
  const group = new THREE.Group();
  const geo = new THREE.CircleGeometry(1, CELL_SEGMENTS);

  const rim = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.78) })
  );
  group.add(rim);

  // Skin: Emoji-Textur überlagert die Farbfüllung (map + color multiplizieren)
  const skinTex = getSkinTexture(skin);
  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: skinTex ? 0xffffff : color,
    map: skinTex,
  }));
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

  // Optionales Masse-Label (unter dem Namen), standardmäßig unsichtbar
  const massLabel = new THREE.Sprite();
  massLabel.scale.set(1.4, 0.35, 1);
  massLabel.position.set(0, -0.42, 0.11);
  massLabel.visible = false;
  group.add(massLabel);

  scene.add(group);
  return {
    group, rim, fill, label, massLabel, geo, massShown: -1,
    // Zufällige Phase/Tempo, damit nicht alle Zellen synchron wabern
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 2 + Math.random() * 1.5,
  };
}

// Masse-Zahl als Sprite; Materialien werden über einen Cache geteilt, damit
// nicht pro Zelle und Frame eine neue Textur entsteht.
const massMaterialCache = new Map();
function getMassMaterial(value) {
  let mat = massMaterialCache.get(value);
  if (mat) return mat;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.font = "bold 30px 'Segoe UI', Helvetica, Arial, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 6;
  ctx.strokeText(value, 64, 26);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(value, 64, 26);
  mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false,
  });
  massMaterialCache.set(value, mat);
  return mat;
}

// Zeigt/versteckt die Masse-Zahl; aktualisiert die Textur nur bei Wertwechsel.
export function updateMassLabel(view, mass, enabled) {
  const ml = view.massLabel;
  if (!enabled) {
    if (ml.visible) ml.visible = false;
    return;
  }
  ml.visible = true;
  const rounded = Math.round(mass);
  if (rounded !== view.massShown) {
    view.massShown = rounded;
    ml.material = getMassMaterial(String(rounded));
  }
}

// Lässt den Zellrand organisch wabern: Ring-Vertices der Einheitskreis-Geometrie
// werden mit zwei überlagerten Sinuswellen radial verschoben. Ganzzahlige
// Wellenzahlen halten die Naht (erster/letzter Ring-Vertex) geschlossen.
// Zusätzlich streckt sich die Zelle bei Bewegung in Fahrtrichtung (Tropfenform).
export function updateCellWobble(view, time, speed = 0, dirX = 0, dirY = 0) {
  const pos = view.geo.attributes.position;
  const ring = pos.count - 2; // Vertex 0 = Mittelpunkt, letzter = Nahtduplikat
  const t1 = time * view.wobbleSpeed + view.wobblePhase;
  const t2 = time * view.wobbleSpeed * 1.7 - view.wobblePhase;
  // Streckung skaliert mit dem Tempo; cos²-Term ist ganzzahlig-periodisch -> Naht bleibt zu
  const stretch = Math.min(WOBBLE_STRETCH, speed * WOBBLE_STRETCH_SCALE);
  const velAng = stretch > 0 ? Math.atan2(dirY, dirX) : 0;
  for (let j = 1; j < pos.count; j++) {
    const ang = ((j - 1) / ring) * Math.PI * 2;
    let r = 1 + 0.02 * Math.sin(ang * 5 + t1) + 0.012 * Math.sin(ang * 9 + t2);
    if (stretch > 0) {
      const c = Math.cos(ang - velAng);
      r += stretch * (c * c - 0.35); // vorne/hinten raus, seitlich leicht rein
    }
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

// Power-up: pulsierender heller Kreis mit Emoji-Symbol, als Sprite-Gruppe.
const powerupTexCache = new Map();
function getPowerupTexture(emoji) {
  let tex = powerupTexCache.get(emoji);
  if (tex) return tex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = `${size * 0.7}px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  powerupTexCache.set(emoji, tex);
  return tex;
}

export function makePowerupView(scene, emoji, color) {
  const group = new THREE.Group();
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
  );
  group.add(halo);
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getPowerupTexture(emoji), depthTest: false, depthWrite: false, transparent: true,
  }));
  icon.scale.set(1.5, 1.5, 1);
  icon.position.z = 0.1;
  group.add(icon);
  scene.add(group);
  return { group, halo };
}

export function disposePowerupView(view, scene) {
  scene.remove(view.group);
  view.halo.geometry.dispose();
  view.halo.material.dispose();
}

// Battle-Royale-Zonengrenze: roter Kreisumriss (Einheitskreis, pro Frame skaliert)
export function makeZoneView(scene) {
  const pts = [];
  const seg = 96;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0xff3b3b }));
  line.position.z = -1;
  line.visible = false;
  scene.add(line);
  return { line, geo };
}
