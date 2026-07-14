// Freischaltbare Erfolge. Der Prüf-Kontext kombiniert die Werte des laufenden
// Lebens mit den dauerhaften Statistiken.

const KEY = 'agar-achievements';

export const ACHIEVEMENTS = [
  { id: 'mass500',   icon: '🐖', name: '500 Masse',   test: (c) => c.maxMass >= 500 },
  { id: 'mass1000',  icon: '🐋', name: '1000 Masse',  test: (c) => c.maxMass >= 1000 },
  { id: 'eat5',      icon: '😋', name: '5 Kills',      test: (c) => c.cellsEaten >= 5 },
  { id: 'survive2',  icon: '⏱️', name: '2 Min am Leben', test: (c) => c.timeAlive >= 120 },
  { id: 'virusshot', icon: '🦠', name: 'Virus-Schuss', test: (c) => c.virusShots >= 1 },
  { id: 'brwin',     icon: '🏆', name: 'Battle Royale', test: (c) => c.won },
  { id: 'games10',   icon: '🎮', name: '10 Spiele',    test: (c) => c.gamesPlayed >= 10 },
];

export function loadUnlocked() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function save(set) {
  localStorage.setItem(KEY, JSON.stringify([...set]));
}

// Prüft alle Erfolge gegen den Kontext und gibt die NEU freigeschalteten zurück.
export function checkAchievements(ctx) {
  const unlocked = loadUnlocked();
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (!unlocked.has(a.id) && a.test(ctx)) {
      unlocked.add(a.id);
      fresh.push(a);
    }
  }
  if (fresh.length) save(unlocked);
  return fresh;
}
