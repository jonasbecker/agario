// Nutzereinstellungen in localStorage.

const KEY = 'agar-settings';
const DEFAULTS = {
  volume: 70,
  sfx: true,
  wobble: true,
  particles: true,
  minimap: true,
  massLabels: false,
  bloom: true,
  blackholes: true,
};

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
