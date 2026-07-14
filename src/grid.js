import { WORLD_HALF } from './constants.js';

// Uniformes räumliches Gitter zur schnellen Nachbarschaftssuche.
// Wird pro Frame neu befüllt und für die Futtersuche genutzt, damit Zellen
// nicht mehr über alle Pellets iterieren müssen (O(Zellen×Futter) → O(Zellen)).
export class SpatialGrid {
  constructor(cellSize = 180) {
    this.cellSize = cellSize;
    this.cols = Math.ceil((WORLD_HALF * 2) / cellSize) + 1;
    this.buckets = new Map(); // Schlüssel = row * cols + col → Array von Indizes
  }

  _key(x, y) {
    const col = ((x + WORLD_HALF) / this.cellSize) | 0;
    const row = ((y + WORLD_HALF) / this.cellSize) | 0;
    return row * this.cols + col;
  }

  clear() {
    this.buckets.clear();
  }

  insert(i, x, y) {
    const key = this._key(x, y);
    const b = this.buckets.get(key);
    if (b) b.push(i);
    else this.buckets.set(key, [i]);
  }

  // Ruft cb(i) für alle Indizes in den Buckets auf, die den Kreis (x, y, r) berühren.
  // Kann Kandidaten knapp außerhalb des Radius liefern — der Aufrufer prüft die Distanz.
  query(x, y, r, cb) {
    const minCol = Math.max(0, ((x - r + WORLD_HALF) / this.cellSize) | 0);
    const maxCol = Math.min(this.cols - 1, ((x + r + WORLD_HALF) / this.cellSize) | 0);
    const minRow = Math.max(0, ((y - r + WORLD_HALF) / this.cellSize) | 0);
    const maxRow = Math.min(this.cols - 1, ((y + r + WORLD_HALF) / this.cellSize) | 0);
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const b = this.buckets.get(row * this.cols + col);
        if (b) for (let k = 0; k < b.length; k++) cb(b[k]);
      }
    }
  }
}
