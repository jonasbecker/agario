import * as THREE from 'three';
import {
  WORLD_HALF, FOOD_MASS, FOOD_MIN_RADIUS,
  radiusFromMass, randomFoodColor, randomWorldPos, clamp,
} from './constants.js';
import { SpatialGrid } from './grid.js';

const _dummy = new THREE.Object3D();

// Alle Futter-Pellets (normales Futter + ausgestoßene Masse) in einem InstancedMesh.
export class FoodPool {
  constructor(scene, capacity) {
    this.capacity = capacity;
    const geo = new THREE.CircleGeometry(1, 12);
    const mat = new THREE.MeshBasicMaterial();
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.alive = new Uint8Array(capacity);
    this.isEject = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.mass = new Float32Array(capacity);
    this.r = new Float32Array(capacity);
    this.bornAt = new Float32Array(capacity);
    this.ownerKey = new Array(capacity).fill(null);

    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    this.baseAlive = 0;

    // Pro Frame neu befülltes Gitter für schnelle Nachbarschaftssuche
    this.grid = new SpatialGrid(180);

    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, white);
    this.mesh.instanceColor.needsUpdate = true;
  }

  spawn({ x, y, mass, color, vx = 0, vy = 0, ownerKey = null, isEject = false, time = 0 }) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    this.alive[i] = 1;
    this.isEject[i] = isEject ? 1 : 0;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.mass[i] = mass;
    this.r[i] = Math.max(FOOD_MIN_RADIUS, radiusFromMass(mass));
    this.bornAt[i] = time;
    this.ownerKey[i] = ownerKey;
    if (!isEject) this.baseAlive++;
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor.needsUpdate = true;
    return i;
  }

  spawnRandom() {
    const { x, y } = randomWorldPos(20);
    return this.spawn({ x, y, mass: FOOD_MASS, color: randomFoodColor() });
  }

  kill(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    if (!this.isEject[i]) this.baseAlive--;
    this.ownerKey[i] = null;
    this.free.push(i);
  }

  // Lässt eine Zelle alles fressen, dessen Mittelpunkt in ihr liegt. Gibt gewonnene Masse zurück.
  // Nutzt das Gitter, damit nur Futter in Zellnähe geprüft wird.
  eat(cell, time, selfEatDelay) {
    let gained = 0;
    const r2 = cell.r * cell.r;
    this.grid.query(cell.x, cell.y, cell.r, (i) => {
      if (!this.alive[i]) return;
      const dx = this.x[i] - cell.x;
      const dy = this.y[i] - cell.y;
      if (dx * dx + dy * dy > r2) return;
      if (
        this.ownerKey[i] !== null &&
        this.ownerKey[i] === cell.ownerKey &&
        time - this.bornAt[i] < selfEatDelay
      ) return;
      gained += this.mass[i];
      this.kill(i);
    });
    return gained;
  }

  update(dt) {
    const decay = Math.exp(-3 * dt);
    this.grid.clear();
    for (let i = 0; i < this.capacity; i++) {
      if (this.alive[i]) {
        if (this.vx[i] !== 0 || this.vy[i] !== 0) {
          this.x[i] = clamp(this.x[i] + this.vx[i] * dt, -WORLD_HALF, WORLD_HALF);
          this.y[i] = clamp(this.y[i] + this.vy[i] * dt, -WORLD_HALF, WORLD_HALF);
          this.vx[i] *= decay;
          this.vy[i] *= decay;
          if (Math.abs(this.vx[i]) < 1 && Math.abs(this.vy[i]) < 1) {
            this.vx[i] = 0;
            this.vy[i] = 0;
          }
        }
        this.grid.insert(i, this.x[i], this.y[i]);
      }
      _dummy.position.set(this.x[i], this.y[i], 0.3);
      const s = this.alive[i] ? this.r[i] : 0;
      _dummy.scale.set(s, s, 1);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
