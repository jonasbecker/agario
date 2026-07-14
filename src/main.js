import * as THREE from 'three';
import { WORLD_HALF, GRID_DIVISIONS, START_MASS, clamp } from './constants.js';
import { Game } from './game.js';
import { initSound, sounds } from './sound.js';

// ---------- Renderer & Szene ----------

const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f6f8);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
camera.position.set(0, 0, 50);

// Hintergrundraster wie in agar.io
const grid = new THREE.GridHelper(WORLD_HALF * 2, GRID_DIVISIONS, 0xd5dde2, 0xd5dde2);
grid.rotation.x = Math.PI / 2;
grid.position.z = -2;
scene.add(grid);

// Weltrand
const borderGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-WORLD_HALF, -WORLD_HALF, -1),
  new THREE.Vector3(WORLD_HALF, -WORLD_HALF, -1),
  new THREE.Vector3(WORLD_HALF, WORLD_HALF, -1),
  new THREE.Vector3(-WORLD_HALF, WORLD_HALF, -1),
]);
scene.add(new THREE.LineLoop(borderGeo, new THREE.LineBasicMaterial({ color: 0x90a4ae })));

// ---------- Spiel ----------

const game = new Game(scene);
window.game = game; // für Debugging in der Konsole

// ---------- Kamera-Steuerung ----------

let viewH = 900;
let camX = 0;
let camY = 0;
let zoom = 1; // manueller Zoom-Faktor (Mausrad), multipliziert den Auto-Zoom
let shake = 0; // aktuelle Erschütterungsstärke (klingt ab)

function addShake(mag) {
  shake = Math.min(60, shake + mag);
}

function updateCamera(dt) {
  const focus = game.playerFocus();
  if (focus) {
    const targetH = zoom * Math.max(
      700,
      700 * Math.pow(focus.totalMass / START_MASS, 0.15),
      (focus.spread + focus.maxR * 2) * 2.4
    );
    viewH += (targetH - viewH) * Math.min(1, dt * 2);
    camX += (focus.x - camX) * Math.min(1, dt * 5);
    camY += (focus.y - camY) * Math.min(1, dt * 5);
  }
  // Erschütterung: zufälliger Versatz, proportional zur aktuellen Kamerahöhe,
  // damit der Effekt bei jedem Zoom gleich stark wirkt
  let sx = 0;
  let sy = 0;
  if (shake > 0.5) {
    const amp = (shake / 60) * viewH * 0.02;
    sx = (Math.random() * 2 - 1) * amp;
    sy = (Math.random() * 2 - 1) * amp;
    shake *= Math.exp(-9 * dt);
  } else {
    shake = 0;
  }
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-viewH * aspect) / 2;
  camera.right = (viewH * aspect) / 2;
  camera.top = viewH / 2;
  camera.bottom = -viewH / 2;
  camera.position.set(camX + sx, camY + sy, 50);
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Eingabe ----------

const ndc = { x: 0, y: 0 };

function updatePointer(e) {
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -((e.clientY / window.innerHeight) * 2 - 1);
}
window.addEventListener('pointermove', updatePointer);
// Auch pointerdown, damit die Zelle auf Touch-Geräten dem Finger folgt
window.addEventListener('pointerdown', updatePointer);

window.addEventListener('wheel', (e) => {
  zoom = clamp(zoom * Math.exp(e.deltaY * 0.001), 0.6, 1.8);
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) game.splitPlayer();
  } else if (e.code === 'KeyW') {
    game.ejectPlayer();
  }
});

// Touch-Buttons (nur bei groben Zeigern sichtbar, siehe CSS)
const touchControls = document.getElementById('touch-controls');
for (const ev of ['pointerdown', 'pointermove']) {
  // Berührungen auf den Buttons dürfen nicht das Bewegungsziel setzen
  touchControls.addEventListener(ev, (e) => e.stopPropagation());
}
document.getElementById('split-btn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  game.splitPlayer();
});
const ejectBtn = document.getElementById('eject-btn');
let ejectTimer = 0;
ejectBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  game.ejectPlayer();
  clearInterval(ejectTimer);
  ejectTimer = setInterval(() => game.ejectPlayer(), 140);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  ejectBtn.addEventListener(ev, () => clearInterval(ejectTimer));
}

// ---------- UI ----------

const startOverlay = document.getElementById('start-overlay');
const deathOverlay = document.getElementById('death-overlay');
const nameInput = document.getElementById('name-input');
const scoreValue = document.getElementById('score-value');
const leaderboardList = document.getElementById('leaderboard-list');

function startGame() {
  const name = nameInput.value.trim() || 'Namenloser Blob';
  initSound(); // braucht eine Nutzer-Geste, deshalb hier
  game.spawnPlayer(name);
  startOverlay.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  // Fokus vom Button nehmen, damit Leertaste/Enter ihn nicht erneut auslösen
  document.activeElement?.blur();
}

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('respawn-btn').addEventListener('click', startGame);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startGame();
  e.stopPropagation();
});

// ---------- Highscore & Death-Screen ----------

const HIGHSCORE_KEY = 'agar-highscore';
let highscore = Number(localStorage.getItem(HIGHSCORE_KEY)) || 0;

function showStartHighscore() {
  if (highscore <= 0) return;
  document.getElementById('start-highscore-value').textContent = highscore;
  document.getElementById('start-highscore').classList.remove('hidden');
}
showStartHighscore();

game.onPlayerDeath = (stats) => {
  sounds.death();
  addShake(55);
  document.getElementById('killer-name').textContent = stats.killer || '???';
  document.getElementById('final-mass').textContent = stats.mass;
  document.getElementById('best-mass').textContent = stats.maxMass;
  document.getElementById('cells-eaten').textContent = stats.cellsEaten;
  document.getElementById('time-alive').textContent = `${stats.timeAlive}s`;
  const isRecord = stats.maxMass > highscore;
  if (isRecord) {
    highscore = stats.maxMass;
    localStorage.setItem(HIGHSCORE_KEY, String(highscore));
    showStartHighscore();
  }
  document.getElementById('death-highscore').textContent = highscore;
  document.getElementById('new-record').classList.toggle('hidden', !isRecord);
  deathOverlay.classList.remove('hidden');
};

// ---------- Sound-Ereignisse ----------

let lastFoodSound = 0;

game.onEvent = (type) => {
  if (type === 'food') {
    // Futter-Plopp drosseln, sonst knattert es bei Fressorgien
    const now = performance.now();
    if (now - lastFoodSound < 80) return;
    lastFoodSound = now;
  }
  if (type === 'virus') addShake(45);
  sounds[type]?.();
};

// ---------- Minimap ----------

const minimap = document.getElementById('minimap');
const minimapCtx = minimap.getContext('2d');

function drawMinimapDot(x, y, radius, style) {
  minimapCtx.fillStyle = style;
  minimapCtx.beginPath();
  minimapCtx.arc(x, y, radius, 0, Math.PI * 2);
  minimapCtx.fill();
}

function drawMinimap() {
  const size = minimap.width;
  // Welt- zu Kartenkoordinaten; Canvas-y zeigt nach unten
  const mapX = (x) => ((x + WORLD_HALF) / (2 * WORLD_HALF)) * size;
  const mapY = (y) => size - ((y + WORLD_HALF) / (2 * WORLD_HALF)) * size;
  minimapCtx.clearRect(0, 0, size, size);

  for (const v of game.viruses) drawMinimapDot(mapX(v.x), mapY(v.y), 2, '#33cc33');
  for (const c of game.cells) {
    if (c.owner !== 'player') drawMinimapDot(mapX(c.x), mapY(c.y), 2, 'rgba(255,255,255,0.45)');
  }
  const playerStyle = `#${game.playerColor.getHexString()}`;
  for (const c of game.playerCells()) drawMinimapDot(mapX(c.x), mapY(c.y), 3, playerStyle);

  // Aktueller Kameraausschnitt
  const aspect = window.innerWidth / window.innerHeight;
  const w = (viewH * aspect / (2 * WORLD_HALF)) * size;
  const h = (viewH / (2 * WORLD_HALF)) * size;
  minimapCtx.strokeStyle = 'rgba(255,255,255,0.4)';
  minimapCtx.strokeRect(mapX(camX) - w / 2, mapY(camY) - h / 2, w, h);
}

let leaderboardTimer = 0;

function updateHUD(dt) {
  scoreValue.textContent = Math.round(game.lastPlayerMass);
  leaderboardTimer -= dt;
  if (leaderboardTimer > 0) return;
  leaderboardTimer = 0.4;
  leaderboardList.innerHTML = '';
  game.leaderboard().forEach((entry, i) => {
    const li = document.createElement('li');
    if (entry.isPlayer) li.classList.add('me');
    const name = document.createElement('span');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}.`;
    name.appendChild(rank);
    name.appendChild(document.createTextNode(entry.name));
    const mass = document.createElement('span');
    mass.textContent = Math.round(entry.mass);
    li.appendChild(name);
    li.appendChild(mass);
    leaderboardList.appendChild(li);
  });
}

// ---------- Spielschleife ----------

const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  // Mausposition in Weltkoordinaten (vor dem Update, mit aktueller Kamera)
  const aspect = window.innerWidth / window.innerHeight;
  game.setMouseWorld(
    camX + (ndc.x * viewH * aspect) / 2,
    camY + (ndc.y * viewH) / 2
  );

  game.update(dt);
  updateCamera(dt);
  updateHUD(dt);
  drawMinimap();
  renderer.render(scene, camera);
}

loop();
