import * as THREE from 'three';
import { WORLD_HALF, GRID_DIVISIONS, START_MASS } from './constants.js';
import { Game } from './game.js';

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

function updateCamera(dt) {
  const focus = game.playerFocus();
  if (focus) {
    const targetH = Math.max(
      700,
      700 * Math.pow(focus.totalMass / START_MASS, 0.15),
      (focus.spread + focus.maxR * 2) * 2.4
    );
    viewH += (targetH - viewH) * Math.min(1, dt * 2);
    camX += (focus.x - camX) * Math.min(1, dt * 5);
    camY += (focus.y - camY) * Math.min(1, dt * 5);
  }
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-viewH * aspect) / 2;
  camera.right = (viewH * aspect) / 2;
  camera.top = viewH / 2;
  camera.bottom = -viewH / 2;
  camera.position.set(camX, camY, 50);
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Eingabe ----------

const ndc = { x: 0, y: 0 };

window.addEventListener('pointermove', (e) => {
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -((e.clientY / window.innerHeight) * 2 - 1);
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) game.splitPlayer();
  } else if (e.code === 'KeyW') {
    game.ejectPlayer();
  }
});

// ---------- UI ----------

const startOverlay = document.getElementById('start-overlay');
const deathOverlay = document.getElementById('death-overlay');
const nameInput = document.getElementById('name-input');
const scoreValue = document.getElementById('score-value');
const leaderboardList = document.getElementById('leaderboard-list');

function startGame() {
  const name = nameInput.value.trim() || 'Namenloser Blob';
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

game.onPlayerDeath = (stats) => {
  document.getElementById('final-mass').textContent = stats.mass;
  document.getElementById('best-mass').textContent = stats.maxMass;
  document.getElementById('time-alive').textContent = `${stats.timeAlive}s`;
  deathOverlay.classList.remove('hidden');
};

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
  renderer.render(scene, camera);
}

loop();
