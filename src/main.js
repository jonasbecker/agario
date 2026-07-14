import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  WORLD_HALF, GRID_DIVISIONS, START_MASS, clamp,
  BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD,
} from './constants.js';
import { Game } from './game.js';
import { initSound, sounds, setVolume, setSoundEnabled } from './sound.js';
import { SKINS } from './skins.js';
import { loadStats, recordRound, STAT_ROWS } from './stats.js';
import { ACHIEVEMENTS, loadUnlocked, checkAchievements } from './achievements.js';
import { loadSettings, saveSettings } from './settings.js';

// Auswählbare Spielerfarben
const COLOR_PALETTE = [
  0xe74c3c, 0xe67e22, 0xf1c40f, 0x2ecc71, 0x1abc9c,
  0x3498db, 0x9b59b6, 0xe84393, 0x34495e, 0x95a5a6,
];

// ---------- Renderer & Szene ----------

const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e17); // dunkles Weltall

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
camera.position.set(0, 0, 50);

// Hintergrundraster (dezente Gitternetzlinien im Space-Look)
const grid = new THREE.GridHelper(WORLD_HALF * 2, GRID_DIVISIONS, 0x17203a, 0x17203a);
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
scene.add(new THREE.LineLoop(borderGeo, new THREE.LineBasicMaterial({ color: 0x2a3a55 })));

// Parallaxe-Sternenfeld hinter dem Raster: eine Punktwolke, die der Kamera leicht
// nachläuft und so Tiefe erzeugt (ein Draw-Call, konstante Pixelgröße)
const DUST_COUNT = 340;
const dustPositions = new Float32Array(DUST_COUNT * 3);
for (let i = 0; i < DUST_COUNT; i++) {
  dustPositions[i * 3] = (Math.random() * 2 - 1) * WORLD_HALF * 1.15;
  dustPositions[i * 3 + 1] = (Math.random() * 2 - 1) * WORLD_HALF * 1.15;
  dustPositions[i * 3 + 2] = 0;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color: 0xaebbe0, size: 4, sizeAttenuation: false, transparent: true, opacity: 0.7,
}));
dust.position.z = -3;
dust.frustumCulled = false;
scene.add(dust);

// ---------- Spiel ----------

const game = new Game(scene);
window.game = game; // für Debugging in der Konsole

// ---------- Post-Processing: Bloom/Glow ----------
// Eine EffectComposer-Kette (RenderPass -> UnrealBloomPass). Auf dem dunklen
// Space-Hintergrund lassen helle Zellen, Power-ups, Viren und Schwarze Löcher leuchten.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD
);
composer.addPass(bloomPass);
let useBloom = true; // wird in applySettings() aus den Einstellungen gesetzt

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
      (focus.spread + focus.maxR * 2) * 2.2
    );
    // Rauszoomen langsamer als Reinzoomen, damit weit gestreute Split-Zellen die
    // Kamera nicht ruckartig herausreißen
    const zoomLerp = targetH > viewH ? dt * 1.2 : dt * 3;
    viewH += (targetH - viewH) * Math.min(1, zoomLerp);
    camX += (focus.x - camX) * Math.min(1, dt * 5);
    camY += (focus.y - camY) * Math.min(1, dt * 5);
  }
  // Staub-Ebene läuft der Kamera leicht nach (Parallaxe/Tiefe)
  dust.position.set(camX * 0.08, camY * 0.08, -3);
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
  composer.setSize(window.innerWidth, window.innerHeight);
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

// W gedrückt halten stößt fortlaufend Masse aus (wie im Original) — eigenes
// Intervall statt des OS-Autorepeats, damit die Rate überall gleich ist.
let ejectHoldTimer = 0;
function stopEjectHold() {
  clearInterval(ejectHoldTimer);
  ejectHoldTimer = 0;
}
window.addEventListener('keydown', (e) => {
  // Escape/Home: universelle „Zurück/Menü"-Taste (vor dem Input/Button-Guard, damit sie
  // auch greift, wenn der Fokus auf einem Overlay-Element liegt)
  if (e.code === 'Escape' || e.code === 'Home') {
    e.preventDefault();
    if (!settingsOverlay.classList.contains('hidden')) settingsOverlay.classList.add('hidden');
    else if (!statsOverlay.classList.contains('hidden')) statsOverlay.classList.add('hidden');
    else if (!startOverlay.classList.contains('hidden') && game.playerAlive) resumeGame();
    else goToMenu();
    return;
  }
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) game.splitPlayer();
  } else if (e.code === 'KeyW') {
    if (e.repeat) return;
    game.ejectPlayer();
    stopEjectHold();
    ejectHoldTimer = setInterval(() => game.ejectPlayer(), 140);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') stopEjectHold();
});
window.addEventListener('blur', stopEjectHold);

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

// ---------- Farb- & Skin-Auswahl ----------

let selectedColor = Number(localStorage.getItem('agar-color'));
if (!COLOR_PALETTE.includes(selectedColor)) {
  selectedColor = COLOR_PALETTE[(Math.random() * COLOR_PALETTE.length) | 0];
}
let selectedSkin = localStorage.getItem('agar-skin') ?? '';
if (!SKINS.includes(selectedSkin)) selectedSkin = '';

const colorSwatches = document.getElementById('color-swatches');
COLOR_PALETTE.forEach((hex) => {
  const el = document.createElement('div');
  el.className = 'swatch' + (hex === selectedColor ? ' sel' : '');
  el.style.background = `#${hex.toString(16).padStart(6, '0')}`;
  el.addEventListener('click', () => {
    selectedColor = hex;
    localStorage.setItem('agar-color', String(hex));
    colorSwatches.querySelectorAll('.swatch').forEach((s) => s.classList.remove('sel'));
    el.classList.add('sel');
  });
  colorSwatches.appendChild(el);
});

const skinSwatches = document.getElementById('skin-swatches');
SKINS.forEach((emoji) => {
  const el = document.createElement('div');
  const isNone = emoji === '';
  el.className = 'skin' + (isNone ? ' none' : '') + (emoji === selectedSkin ? ' sel' : '');
  el.textContent = isNone ? 'kein' : emoji;
  el.addEventListener('click', () => {
    selectedSkin = emoji;
    localStorage.setItem('agar-skin', emoji);
    skinSwatches.querySelectorAll('.skin').forEach((s) => s.classList.remove('sel'));
    el.classList.add('sel');
  });
  skinSwatches.appendChild(el);
});

// Spielmodus-Auswahl (Klassisch / Battle Royale)
let selectedMode = localStorage.getItem('agar-mode') === 'battleroyale' ? 'battleroyale' : 'classic';
const modeSelect = document.getElementById('mode-select');
function refreshModeButtons() {
  modeSelect.querySelectorAll('.mode-btn').forEach((b) => {
    b.classList.toggle('sel', b.dataset.mode === selectedMode);
  });
}
modeSelect.querySelectorAll('.mode-btn').forEach((b) => {
  b.addEventListener('click', () => {
    selectedMode = b.dataset.mode;
    localStorage.setItem('agar-mode', selectedMode);
    refreshModeButtons();
  });
});
refreshModeButtons();

function startGame() {
  const name = nameInput.value.trim() || 'Namenloser Blob';
  initSound(); // braucht eine Nutzer-Geste, deshalb hier
  game.spawnPlayer(name, new THREE.Color(selectedColor), selectedSkin, selectedMode);
  startOverlay.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  document.getElementById('victory-overlay').classList.add('hidden');
  // Fokus vom Button nehmen, damit Leertaste/Enter ihn nicht erneut auslösen
  document.activeElement?.blur();
}

// Zurück ins Startmenü (schließt alle anderen Overlays); laufende Runde pausiert,
// solange das Menü offen ist (siehe loop())
function goToMenu() {
  settingsOverlay.classList.add('hidden');
  statsOverlay.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  document.getElementById('victory-overlay').classList.add('hidden');
  startOverlay.classList.remove('hidden');
}

// Laufende Runde fortsetzen (Menü schließen, ohne neu zu spawnen)
function resumeGame() {
  startOverlay.classList.add('hidden');
  document.activeElement?.blur();
}

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('respawn-btn').addEventListener('click', startGame);
document.getElementById('victory-btn').addEventListener('click', startGame);
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

// Verbucht eine beendete Runde in Statistik & Erfolgen und zeigt Erfolg-Toasts.
function finishRound(stats, won) {
  const s = recordRound(stats, won);
  const fresh = checkAchievements({
    maxMass: stats.maxMass,
    cellsEaten: stats.cellsEaten,
    timeAlive: stats.timeAlive,
    virusShots: stats.virusShots || 0,
    won,
    gamesPlayed: s.gamesPlayed,
  });
  fresh.forEach((a, i) => setTimeout(() => showAchievementToast(a), 600 + i * 900));
}

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
  finishRound(stats, false);
};

game.onVictory = (stats) => {
  sounds.powerup();
  document.getElementById('v-final-mass').textContent = stats.mass;
  document.getElementById('v-best-mass').textContent = stats.maxMass;
  document.getElementById('v-cells-eaten').textContent = stats.cellsEaten;
  document.getElementById('v-time-alive').textContent = `${stats.timeAlive}s`;
  if (stats.maxMass > highscore) {
    highscore = stats.maxMass;
    localStorage.setItem(HIGHSCORE_KEY, String(highscore));
    showStartHighscore();
  }
  document.getElementById('victory-overlay').classList.remove('hidden');
  finishRound(stats, true);
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
  if (type === 'blackhole') addShake(55);
  sounds[type]?.();
};

// ---------- Kill-Feed ----------

const killFeed = document.getElementById('kill-feed');

game.onKill = (killerName, victimName, killerIsPlayer, victimIsPlayer) => {
  const el = document.createElement('div');
  el.className = 'kill' + (killerIsPlayer || victimIsPlayer ? ' me' : '');
  el.innerHTML = `🍽️ <b>${escapeHtml(killerName)}</b> → ${escapeHtml(victimName)}`;
  killFeed.prepend(el);
  while (killFeed.children.length > 5) killFeed.lastChild.remove();
  setTimeout(() => el.remove(), 4000);
};

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------- Power-up-Effekt-HUD ----------

const effectsEl = document.getElementById('effects');

function updateEffects() {
  const fx = game.playerEffects();
  let html = '';
  if (fx.speed > 0) html += `<div class="fx">⚡ ${Math.ceil(fx.speed)}s</div>`;
  if (fx.shield > 0) html += `<div class="fx">🛡️ ${Math.ceil(fx.shield)}s</div>`;
  effectsEl.innerHTML = html;
}

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
  for (const p of game.powerups) drawMinimapDot(mapX(p.x), mapY(p.y), 2, '#ffd54f');
  if (game.settings.blackholes) {
    for (const h of game.blackholes) {
      minimapCtx.strokeStyle = '#c060ff';
      minimapCtx.lineWidth = 1.5;
      minimapCtx.beginPath();
      minimapCtx.arc(mapX(h.x), mapY(h.y), 3.5, 0, Math.PI * 2);
      minimapCtx.stroke();
    }
  }
  for (const c of game.cells) {
    if (c.owner !== 'player') drawMinimapDot(mapX(c.x), mapY(c.y), 2, 'rgba(255,255,255,0.45)');
  }
  const playerStyle = `#${game.playerColor.getHexString()}`;
  for (const c of game.playerCells()) drawMinimapDot(mapX(c.x), mapY(c.y), 3, playerStyle);

  // Battle-Royale-Zone
  if (game.mode === 'battleroyale') {
    const zr = (game.zone.r / (2 * WORLD_HALF)) * size;
    minimapCtx.strokeStyle = '#ff3b3b';
    minimapCtx.lineWidth = 1.5;
    minimapCtx.beginPath();
    minimapCtx.arc(mapX(0), mapY(0), zr, 0, Math.PI * 2);
    minimapCtx.stroke();
  }

  // Aktueller Kameraausschnitt
  const aspect = window.innerWidth / window.innerHeight;
  const w = (viewH * aspect / (2 * WORLD_HALF)) * size;
  const h = (viewH / (2 * WORLD_HALF)) * size;
  minimapCtx.strokeStyle = 'rgba(255,255,255,0.4)';
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeRect(mapX(camX) - w / 2, mapY(camY) - h / 2, w, h);
}

// ---------- Erfolge, Einstellungen, Statistik ----------

const toastsEl = document.getElementById('toasts');

function showAchievementToast(a) {
  sounds.achievement();
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="t-icon">${a.icon}</span><span>Erfolg freigeschaltet!<span class="t-sub">${a.name}</span></span>`;
  toastsEl.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// Einstellungen laden und auf Spiel/Sound anwenden
const settings = loadSettings();

function applySettings() {
  setVolume(settings.volume / 100);
  setSoundEnabled(settings.sfx);
  game.settings.wobble = settings.wobble;
  game.settings.massLabels = settings.massLabels;
  game.settings.blackholes = settings.blackholes;
  game.particles.enabled = settings.particles;
  minimap.style.display = settings.minimap ? '' : 'none';
  useBloom = settings.bloom;
}

function bindToggle(id, key) {
  const el = document.getElementById(id);
  el.checked = settings[key];
  el.addEventListener('change', () => {
    settings[key] = el.checked;
    saveSettings(settings);
    applySettings();
  });
}

const volEl = document.getElementById('opt-volume');
volEl.value = settings.volume;
volEl.addEventListener('input', () => {
  settings.volume = Number(volEl.value);
  saveSettings(settings);
  applySettings();
});
bindToggle('opt-sfx', 'sfx');
bindToggle('opt-wobble', 'wobble');
bindToggle('opt-particles', 'particles');
bindToggle('opt-minimap', 'minimap');
bindToggle('opt-mass', 'massLabels');
bindToggle('opt-bloom', 'bloom');
bindToggle('opt-blackholes', 'blackholes');
applySettings();

const settingsOverlay = document.getElementById('settings-overlay');
document.getElementById('settings-btn').addEventListener('click', () => {
  settingsOverlay.classList.remove('hidden');
});
document.getElementById('settings-close').addEventListener('click', () => {
  settingsOverlay.classList.add('hidden');
});

// Statistik-Overlay befüllen und öffnen
const statsOverlay = document.getElementById('stats-overlay');
function openStats() {
  const s = loadStats();
  const grid = document.getElementById('stat-grid');
  grid.innerHTML = '';
  for (const [key, label, fmt] of STAT_ROWS) {
    const v = fmt ? fmt(s[key]) : s[key];
    grid.insertAdjacentHTML('beforeend',
      `<div class="s-label">${label}</div><div class="s-value">${v}</div>`);
  }
  const unlocked = loadUnlocked();
  const ag = document.getElementById('ach-grid');
  ag.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    ag.insertAdjacentHTML('beforeend',
      `<div class="ach ${unlocked.has(a.id) ? 'unlocked' : ''}"><span>${a.icon}</span><span class="ach-name">${a.name}</span></div>`);
  }
  statsOverlay.classList.remove('hidden');
}
document.getElementById('stats-link').addEventListener('click', openStats);
document.getElementById('stats-close').addEventListener('click', () => {
  statsOverlay.classList.add('hidden');
});

// Gefahren-Vignette: rot aufleuchten, wenn eine Spielerzelle außerhalb der Zone ist
const dangerEl = document.getElementById('danger-vignette');
function updateDanger() {
  let danger = false;
  if (game.mode === 'battleroyale' && game.playerAlive) {
    const r2 = game.zone.r * game.zone.r;
    danger = game.playerCells().some((c) => c.x * c.x + c.y * c.y > r2);
  }
  dangerEl.classList.toggle('on', danger);
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

  // Pause, solange das Menü während einer laufenden Runde offen ist; das
  // Anfangsmenü (playerAlive === false) bleibt belebt
  const paused = !startOverlay.classList.contains('hidden') && game.playerAlive;
  if (!paused) game.update(dt);
  updateCamera(dt);
  updateHUD(dt);
  updateEffects();
  updateDanger();
  drawMinimap();
  if (useBloom) composer.render();
  else renderer.render(scene, camera);
}

loop();
