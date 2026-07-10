import * as THREE from 'three';

// Welt
export const WORLD_HALF = 2000;          // Welt reicht von -2000 bis +2000
export const GRID_DIVISIONS = 80;

// Masse & Physik
export const START_MASS = 25;
export const SPAWN_PROTECTION = 3;       // s Unverwundbarkeit nach dem Spawnen
export const radiusFromMass = (m) => 4 * Math.sqrt(m);
export const speedFromMass = (m) => 580 / Math.pow(m, 0.28);
export const EAT_MASS_RATIO = 1.3;       // so viel größer muss man sein, um zu fressen
export const IMPULSE_DAMPING = 2.2;      // Abklingrate von Split-/Stoß-Impulsen (1/s)

// Futter
export const FOOD_COUNT = 1000;
export const FOOD_CAPACITY = 1400;
export const FOOD_MASS = 1.5;
export const FOOD_MIN_RADIUS = 6;

// Spieler-Aktionen
export const MIN_SPLIT_MASS = 36;
export const MAX_PLAYER_CELLS = 16;
export const SPLIT_IMPULSE = 600;
export const EJECT_MIN_MASS = 43;
export const EJECT_MASS_LOSS = 16;
export const EJECT_MASS_GAIN = 13;
export const EJECT_IMPULSE = 700;
export const EJECT_SELF_EAT_DELAY = 0.7; // s bevor man eigene Masse wieder fressen kann
export const mergeDelay = (mass) => Math.min(30, 10 + mass * 0.02);

// Viren
export const VIRUS_COUNT = 12;
export const VIRUS_MASS = 120;
export const VIRUS_EXPLODE_RATIO = 1.15;
export const VIRUS_FEED_COUNT = 7;       // so oft füttern, bis der Virus schießt
export const VIRUS_MAX = 20;             // Obergrenze für abgeschossene Viren
export const VIRUS_SHOT_IMPULSE = 900;

// Bots
export const BOT_COUNT = 14;
export const BOT_RESPAWN_DELAY = 2.5;
export const MAX_BOT_CELLS = 4;
export const BOT_NAMES = [
  'Blobert', 'Kugelblitz', 'Zellina', 'Dr. Glibber', 'MegaMampf',
  'Schnappi', 'Wackelpudding', 'NomNom', 'Glibberich', 'Amöbert',
  'Bakteria', 'Blasius', 'Knuddel', 'Futterneid', 'Plopp', 'Zelluloid',
];

export function randomCellColor() {
  return new THREE.Color().setHSL(Math.random(), 0.72, 0.56);
}

export function randomFoodColor() {
  return new THREE.Color().setHSL(Math.random(), 0.85, 0.62);
}

export function randomWorldPos(margin = 100) {
  return {
    x: (Math.random() * 2 - 1) * (WORLD_HALF - margin),
    y: (Math.random() * 2 - 1) * (WORLD_HALF - margin),
  };
}

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
