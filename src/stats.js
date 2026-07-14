// Dauerhafte Spielerstatistiken in localStorage.

const KEY = 'agar-stats';
const DEFAULTS = {
  gamesPlayed: 0,
  totalCellsEaten: 0,
  totalFoodEaten: 0,
  longestLife: 0,
  bestMass: 0,
  brWins: 0,
};

export function loadStats() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveStats(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

// Verbucht eine beendete Runde und gibt die aktualisierten Stats zurück.
export function recordRound(stats, won = false) {
  const s = loadStats();
  s.gamesPlayed++;
  s.totalCellsEaten += stats.cellsEaten || 0;
  s.totalFoodEaten += stats.foodEaten || 0;
  s.longestLife = Math.max(s.longestLife, stats.timeAlive || 0);
  s.bestMass = Math.max(s.bestMass, stats.maxMass || 0);
  if (won) s.brWins++;
  saveStats(s);
  return s;
}

// Beschriftung + Formatierung fürs Statistik-Overlay
export const STAT_ROWS = [
  ['gamesPlayed', 'Spiele gespielt'],
  ['bestMass', 'Größte Masse'],
  ['totalCellsEaten', 'Zellen gefressen'],
  ['totalFoodEaten', 'Futter gefressen'],
  ['longestLife', 'Längstes Leben', (v) => `${v}s`],
  ['brWins', 'Battle-Royale-Siege'],
];
