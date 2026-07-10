import * as THREE from 'three';

const _dummy = new THREE.Object3D();

// Kurzlebige Effekt-Partikel (Fress-Burst, Virus-Platzer) in einem InstancedMesh.
// Ringpuffer: bei vollem Pool werden die ältesten Partikel überschrieben.
export class ParticlePool {
  constructor(scene, capacity = 256) {
    this.capacity = capacity;
    const geo = new THREE.CircleGeometry(1, 8);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.alive = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.cursor = 0;

    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, white);
    this.mesh.instanceColor.needsUpdate = true;
  }

  burst(x, y, color, count = 10, speed = 220) {
    const n = Math.round(count);
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const ang = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.9);
      this.alive[i] = 1;
      this.x[i] = x;
      this.y[i] = y;
      this.vx[i] = Math.cos(ang) * s;
      this.vy[i] = Math.sin(ang) * s;
      this.maxLife[i] = this.life[i] = 0.35 + Math.random() * 0.3;
      this.size[i] = 3 + Math.random() * 4;
      this.mesh.setColorAt(i, color);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    const drag = Math.exp(-4 * dt);
    for (let i = 0; i < this.capacity; i++) {
      if (this.alive[i]) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {
          this.alive[i] = 0;
        } else {
          this.x[i] += this.vx[i] * dt;
          this.y[i] += this.vy[i] * dt;
          this.vx[i] *= drag;
          this.vy[i] *= drag;
        }
      }
      // Partikel schrumpfen über ihre Lebenszeit auf null
      const s = this.alive[i] ? this.size[i] * (this.life[i] / this.maxLife[i]) : 0;
      _dummy.position.set(this.x[i], this.y[i], 0.5);
      _dummy.scale.set(s, s, 1);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
