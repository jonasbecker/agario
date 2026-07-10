// Synthetisierte Sound-Effekte über WebAudio — keine Audiodateien nötig.

let ctx = null;

// Muss aus einer Nutzer-Geste heraus aufgerufen werden (Klick auf "Spielen"),
// sonst blockiert der Browser den AudioContext.
export function initSound() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function blip(freq, dur, { type = 'sine', vol = 0.15, slide = 0 } = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

export const sounds = {
  food: () => blip(480 + Math.random() * 320, 0.07, { vol: 0.05, slide: 220 }),
  eat: () => blip(200, 0.2, { vol: 0.2, slide: 170 }),
  split: () => blip(700, 0.12, { type: 'square', vol: 0.07, slide: -260 }),
  eject: () => blip(420, 0.08, { type: 'square', vol: 0.04, slide: -130 }),
  virus: () => blip(150, 0.45, { type: 'sawtooth', vol: 0.16, slide: -70 }),
  death: () => blip(330, 0.8, { type: 'triangle', vol: 0.22, slide: -270 }),
};
