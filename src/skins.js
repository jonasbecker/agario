import * as THREE from 'three';

// Emoji-Skins: werden als runde Textur auf die Zellfüllung gelegt.
// Der Schlüssel ist das Emoji selbst; '' bedeutet „kein Skin" (einfarbig).
export const SKINS = ['', '🐱', '🌍', '🍕', '😎', '🦊', '👾', '🍉', '🐸', '⭐', '💀', '🦄'];

const textureCache = new Map();

// Rundes Emoji auf transparentem Grund; die Zellfarbe scheint am Rand durch.
export function getSkinTexture(emoji) {
  if (!emoji) return null;
  let tex = textureCache.get(emoji);
  if (tex) return tex;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Auf den Kreis beschränken, damit nichts über den Zellrand ragt
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.font = `${size * 0.72}px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  ctx.restore();

  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(emoji, tex);
  return tex;
}
