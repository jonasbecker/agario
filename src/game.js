import * as THREE from 'three';
import {
  WORLD_HALF, START_MASS, SPAWN_PROTECTION, radiusFromMass, speedFromMass,
  EAT_MASS_RATIO, IMPULSE_DAMPING,
  FOOD_COUNT, FOOD_CAPACITY,
  MIN_SPLIT_MASS, MAX_PLAYER_CELLS, SPLIT_IMPULSE,
  EJECT_MIN_MASS, EJECT_MASS_LOSS, EJECT_MASS_GAIN, EJECT_IMPULSE, EJECT_SELF_EAT_DELAY,
  mergeDelay,
  VIRUS_COUNT, VIRUS_MASS, VIRUS_EXPLODE_RATIO,
  BOT_COUNT, BOT_RESPAWN_DELAY, BOT_NAMES,
  randomCellColor, randomFoodColor, randomWorldPos, clamp,
} from './constants.js';
import { FoodPool } from './food.js';
import { makeCellView, disposeCellView, makeVirusView, setLabelOrder } from './cell.js';

let nextId = 1;

export class Game {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.food = new FoodPool(scene, FOOD_CAPACITY);
    this.cells = [];
    this.viruses = [];
    this.bots = [];

    this.playerAlive = false;
    this.playerName = '';
    this.playerColor = randomCellColor();
    this.mouse = { x: 0, y: 0 };
    this.lastPlayerMass = 0;
    this.maxMass = 0;
    this.spawnTime = 0;
    this.onPlayerDeath = null;

    for (let i = 0; i < FOOD_COUNT; i++) this.food.spawnRandom();

    const virusR = radiusFromMass(VIRUS_MASS);
    for (let i = 0; i < VIRUS_COUNT; i++) {
      const { x, y } = randomWorldPos(200);
      this.viruses.push({ x, y, r: virusR, view: makeVirusView(scene) });
    }

    for (let i = 0; i < BOT_COUNT; i++) {
      const bot = {
        key: `bot${i}`,
        name: BOT_NAMES[i % BOT_NAMES.length],
        color: randomCellColor(),
        cell: null,
        respawnAt: 0,
        foodTarget: -1,
        retargetAt: 0,
      };
      this.bots.push(bot);
      this.spawnBot(bot);
    }
  }

  // ---------- Zellen-Verwaltung ----------

  createCell({ owner, ownerKey, name, color, mass, x, y }) {
    const cell = {
      id: nextId++,
      owner, ownerKey, name, color,
      mass, x, y,
      r: radiusFromMass(mass),
      tx: x, ty: y,       // Bewegungsziel
      ix: 0, iy: 0,        // Impuls (Split/Explosion)
      mergeAt: 0,
      protectedUntil: 0,
      displayR: radiusFromMass(mass), // sanft animierter Anzeige-Radius
      view: makeCellView(color, name, this.scene),
    };
    this.cells.push(cell);
    return cell;
  }

  removeCell(cell, silent = false) {
    const idx = this.cells.indexOf(cell);
    if (idx === -1) return;
    this.cells.splice(idx, 1);
    disposeCellView(cell.view, this.scene);

    if (cell.owner === 'player') {
      if (!silent && !this.cells.some((c) => c.owner === 'player')) {
        this.playerAlive = false;
        this.onPlayerDeath?.({
          mass: Math.round(this.lastPlayerMass),
          maxMass: Math.round(this.maxMass),
          timeAlive: Math.round(this.time - this.spawnTime),
        });
      }
    } else {
      cell.owner.cell = null;
      cell.owner.respawnAt = this.time + BOT_RESPAWN_DELAY;
    }
  }

  playerCells() {
    return this.cells.filter((c) => c.owner === 'player');
  }

  playerMass() {
    let m = 0;
    for (const c of this.cells) if (c.owner === 'player') m += c.mass;
    return m;
  }

  // ---------- Spawnen ----------

  findSafeSpawn() {
    for (let attempt = 0; attempt < 24; attempt++) {
      const pos = randomWorldPos(150);
      const danger = this.cells.some(
        (c) => c.mass > 40 && Math.hypot(c.x - pos.x, c.y - pos.y) < 600
      );
      if (!danger) return pos;
    }
    return randomWorldPos(150);
  }

  spawnPlayer(name) {
    // silent: Aufräumen alter Zellen darf nicht den Tod-Callback (Death-Overlay) auslösen
    for (const c of this.playerCells()) this.removeCell(c, true);
    this.playerName = name;
    this.playerColor = randomCellColor();
    const { x, y } = this.findSafeSpawn();
    const cell = this.createCell({
      owner: 'player', ownerKey: 'player', name,
      color: this.playerColor, mass: START_MASS, x, y,
    });
    cell.protectedUntil = this.time + SPAWN_PROTECTION;
    this.playerAlive = true;
    this.maxMass = START_MASS;
    this.lastPlayerMass = START_MASS;
    this.spawnTime = this.time;
  }

  spawnBot(bot) {
    const { x, y } = this.findSafeSpawn();
    const mass = 15 + Math.random() * 35;
    // Persönlichkeit: wie aggressiv dieser Bot Beute jagt (wird pro Leben neu gewürfelt)
    bot.aggression = 0.25 + Math.random() * 0.65;
    bot.cell = this.createCell({
      owner: bot, ownerKey: bot.key, name: bot.name,
      color: bot.color, mass, x, y,
    });
    bot.cell.protectedUntil = this.time + SPAWN_PROTECTION;
  }

  // ---------- Spieler-Aktionen ----------

  setMouseWorld(x, y) {
    this.mouse.x = x;
    this.mouse.y = y;
  }

  splitPlayer() {
    if (!this.playerAlive) return;
    const existing = this.playerCells();
    let slots = MAX_PLAYER_CELLS - existing.length;
    for (const cell of existing) {
      if (slots <= 0) break;
      if (cell.mass < MIN_SPLIT_MASS) continue;
      slots--;
      cell.mass /= 2;
      const dx = this.mouse.x - cell.x;
      const dy = this.mouse.y - cell.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      const delay = mergeDelay(cell.mass);
      cell.mergeAt = this.time + delay;
      const child = this.createCell({
        owner: 'player', ownerKey: 'player', name: this.playerName,
        color: this.playerColor, mass: cell.mass,
        x: cell.x + nx * cell.r * 0.2, y: cell.y + ny * cell.r * 0.2,
      });
      child.ix = nx * SPLIT_IMPULSE;
      child.iy = ny * SPLIT_IMPULSE;
      child.mergeAt = this.time + delay;
    }
  }

  ejectPlayer() {
    if (!this.playerAlive) return;
    for (const cell of this.playerCells()) {
      if (cell.mass < EJECT_MIN_MASS) continue;
      cell.mass -= EJECT_MASS_LOSS;
      const dx = this.mouse.x - cell.x;
      const dy = this.mouse.y - cell.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      this.food.spawn({
        x: cell.x + nx * (cell.r + 5),
        y: cell.y + ny * (cell.r + 5),
        mass: EJECT_MASS_GAIN,
        color: this.playerColor,
        vx: nx * EJECT_IMPULSE,
        vy: ny * EJECT_IMPULSE,
        ownerKey: 'player',
        isEject: true,
        time: this.time,
      });
    }
  }

  // ---------- Update ----------

  update(dt) {
    this.time += dt;

    for (const c of this.cells) c.r = radiusFromMass(c.mass);

    this.updateBots(dt);
    this.moveCells(dt);
    this.resolvePlayerOverlaps();
    this.food.update(dt);
    this.eatFood();
    this.eatCells();
    this.updateViruses();
    this.applyDecay(dt);
    this.respawnFood(dt);
    this.respawnBots();
    this.syncViews(dt);

    if (this.playerAlive) {
      this.lastPlayerMass = this.playerMass();
      if (this.lastPlayerMass > this.maxMass) this.maxMass = this.lastPlayerMass;
    }
  }

  moveCells(dt) {
    const damping = Math.exp(-IMPULSE_DAMPING * dt);
    for (const cell of this.cells) {
      if (cell.owner === 'player') {
        cell.tx = this.mouse.x;
        cell.ty = this.mouse.y;
      }
      const dx = cell.tx - cell.x;
      const dy = cell.ty - cell.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) {
        // In Zielnähe abbremsen, damit Zellen nicht um den Cursor zittern
        const speed = speedFromMass(cell.mass) * Math.min(1, d / (cell.r * 0.5 + 1));
        cell.x += (dx / d) * speed * dt;
        cell.y += (dy / d) * speed * dt;
      }
      cell.x += cell.ix * dt;
      cell.y += cell.iy * dt;
      cell.ix *= damping;
      cell.iy *= damping;
      cell.x = clamp(cell.x, -WORLD_HALF, WORLD_HALF);
      cell.y = clamp(cell.y, -WORLD_HALF, WORLD_HALF);
    }
  }

  resolvePlayerOverlaps() {
    const cells = this.playerCells();
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const b = cells[j];
        if (!this.cells.includes(a) || !this.cells.includes(b)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const canMerge = this.time >= a.mergeAt && this.time >= b.mergeAt;

        if (canMerge) {
          if (d < Math.max(a.r, b.r) * 0.5) {
            const big = a.mass >= b.mass ? a : b;
            const small = big === a ? b : a;
            big.mass += small.mass;
            this.removeCell(small);
          }
        } else if (d < a.r + b.r) {
          // Auseinanderschieben, solange sie nicht verschmelzen dürfen
          const overlap = a.r + b.r - d;
          let nx, ny;
          if (d > 0.001) {
            nx = dx / d;
            ny = dy / d;
          } else {
            const ang = Math.random() * Math.PI * 2;
            nx = Math.cos(ang);
            ny = Math.sin(ang);
          }
          const total = a.mass + b.mass;
          a.x -= nx * overlap * (b.mass / total);
          a.y -= ny * overlap * (b.mass / total);
          b.x += nx * overlap * (a.mass / total);
          b.y += ny * overlap * (a.mass / total);
        }
      }
    }
  }

  eatFood() {
    for (const cell of this.cells) {
      const gained = this.food.eat(cell, this.time, EJECT_SELF_EAT_DELAY);
      if (gained > 0) cell.mass += gained;
    }
  }

  eatCells() {
    const eaten = new Set();
    for (let i = 0; i < this.cells.length; i++) {
      for (let j = i + 1; j < this.cells.length; j++) {
        const a = this.cells[i];
        const b = this.cells[j];
        if (eaten.has(a) || eaten.has(b)) continue;
        if (a.ownerKey === b.ownerKey) continue;
        // Spawnschutz: frisch gespawnte Zellen fressen nicht und werden nicht gefressen
        if (a.protectedUntil > this.time || b.protectedUntil > this.time) continue;

        let big = null;
        let small = null;
        if (a.mass > b.mass * EAT_MASS_RATIO) { big = a; small = b; }
        else if (b.mass > a.mass * EAT_MASS_RATIO) { big = b; small = a; }
        else continue;

        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < big.r - small.r * 0.35) {
          big.mass += small.mass;
          eaten.add(small);
        }
      }
    }
    for (const cell of eaten) this.removeCell(cell);
  }

  updateViruses() {
    for (const virus of this.viruses) {
      for (const cell of [...this.cells]) {
        if (cell.mass < VIRUS_MASS * VIRUS_EXPLODE_RATIO) continue;
        const d = Math.hypot(cell.x - virus.x, cell.y - virus.y);
        if (d >= cell.r - virus.r * 0.4) continue;

        if (cell.owner === 'player') this.explodePlayerCell(cell);
        else this.popBotCell(cell);

        const pos = randomWorldPos(200);
        virus.x = pos.x;
        virus.y = pos.y;
        break;
      }
    }
  }

  explodePlayerCell(cell) {
    cell.mass += VIRUS_MASS * 0.5;
    const slots = MAX_PLAYER_CELLS - this.playerCells().length;
    const n = Math.min(slots, 7, Math.floor(cell.mass / 20) - 1);
    if (n <= 0) return;
    const each = cell.mass / (n + 1);
    cell.mass = each;
    const delay = mergeDelay(each);
    cell.mergeAt = this.time + delay;
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * Math.PI * 2;
      const child = this.createCell({
        owner: 'player', ownerKey: 'player', name: this.playerName,
        color: this.playerColor, mass: each, x: cell.x, y: cell.y,
      });
      child.ix = Math.cos(ang) * (400 + Math.random() * 250);
      child.iy = Math.sin(ang) * (400 + Math.random() * 250);
      child.mergeAt = this.time + delay;
    }
  }

  popBotCell(cell) {
    const lost = cell.mass * 0.45;
    cell.mass -= lost;
    const n = Math.min(10, Math.max(3, Math.floor(lost / 10)));
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = 300 + Math.random() * 350;
      this.food.spawn({
        x: cell.x, y: cell.y,
        mass: lost / n,
        color: randomFoodColor(),
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        ownerKey: cell.ownerKey,
        isEject: true,
        time: this.time,
      });
    }
  }

  applyDecay(dt) {
    for (const cell of this.cells) {
      if (cell.mass > 200) cell.mass *= 1 - 0.007 * dt;
    }
  }

  respawnFood(dt) {
    let budget = Math.ceil(dt * 30);
    while (this.food.baseAlive < FOOD_COUNT && budget-- > 0) this.food.spawnRandom();
  }

  respawnBots() {
    for (const bot of this.bots) {
      if (!bot.cell && this.time >= bot.respawnAt) this.spawnBot(bot);
    }
  }

  // ---------- Bot-KI ----------

  updateBots(dt) {
    for (const bot of this.bots) {
      const c = bot.cell;
      if (!c) continue;

      // 1. Vor größeren Zellen fliehen
      let threat = null;
      let threatDist = Infinity;
      // 2. Kleinere Zellen jagen
      let prey = null;
      let preyDist = Infinity;

      for (const o of this.cells) {
        if (o.ownerKey === c.ownerKey) continue;
        const d = Math.hypot(o.x - c.x, o.y - c.y);
        if (o.mass > c.mass * 1.3 && d - o.r < 350 + c.r && d < threatDist) {
          threat = o;
          threatDist = d;
        } else if (c.mass > o.mass * 1.3 && d < 200 + 400 * bot.aggression + c.r && d < preyDist) {
          prey = o;
          preyDist = d;
        }
      }

      if (threat) {
        const dx = c.x - threat.x;
        const dy = c.y - threat.y;
        const d = Math.hypot(dx, dy) || 1;
        c.tx = c.x + (dx / d) * 500;
        c.ty = c.y + (dy / d) * 500;
        // In der Nähe der Wand zur Mitte hin ausweichen
        if (Math.abs(c.tx) > WORLD_HALF - 100) c.tx *= 0.7;
        if (Math.abs(c.ty) > WORLD_HALF - 100) c.ty *= 0.7;
      } else if (prey) {
        c.tx = prey.x;
        c.ty = prey.y;
      } else {
        // 3. Futter suchen (Ziel wird periodisch aus Zufallsstichprobe gewählt)
        const f = this.food;
        if (
          bot.foodTarget < 0 ||
          !f.alive[bot.foodTarget] ||
          this.time >= bot.retargetAt
        ) {
          bot.retargetAt = this.time + 0.5;
          let best = -1;
          let bestD = Infinity;
          for (let s = 0; s < 30; s++) {
            const i = (Math.random() * f.capacity) | 0;
            if (!f.alive[i]) continue;
            const d = Math.hypot(f.x[i] - c.x, f.y[i] - c.y);
            if (d < bestD) { bestD = d; best = i; }
          }
          bot.foodTarget = best;
        }
        if (bot.foodTarget >= 0 && f.alive[bot.foodTarget]) {
          c.tx = f.x[bot.foodTarget];
          c.ty = f.y[bot.foodTarget];
        }
      }

      // 4. Viren meiden, wenn der Bot daran zerplatzen würde
      if (c.mass > VIRUS_MASS * VIRUS_EXPLODE_RATIO) {
        for (const virus of this.viruses) {
          const d = Math.hypot(c.x - virus.x, c.y - virus.y);
          if (d < c.r + virus.r + 60) {
            const nx = (c.x - virus.x) / (d || 1);
            const ny = (c.y - virus.y) / (d || 1);
            c.tx = c.x + nx * 400;
            c.ty = c.y + ny * 400;
            break;
          }
        }
      }
    }
  }

  // ---------- Rendering-Sync ----------

  syncViews(dt) {
    for (const cell of this.cells) {
      const v = cell.view;
      // Radius sanft zum Sollwert animieren (weiches Wachsen/Schrumpfen)
      cell.displayR += (cell.r - cell.displayR) * Math.min(1, dt * 8);
      // Größere Zellen leicht höher, damit sie kleinere überdecken
      v.group.position.set(cell.x, cell.y, 1 + Math.min(8, cell.displayR * 0.01));
      v.group.scale.setScalar(cell.displayR);
      setLabelOrder(v, cell.displayR);

      // Spawnschutz: Zelle pulsiert halbtransparent
      const fillMat = v.fill.material;
      const rimMat = v.rim.material;
      if (cell.protectedUntil > this.time) {
        if (!fillMat.transparent) {
          fillMat.transparent = rimMat.transparent = true;
          fillMat.needsUpdate = rimMat.needsUpdate = true;
        }
        const pulse = 0.55 + 0.25 * Math.sin(this.time * 12);
        fillMat.opacity = pulse;
        rimMat.opacity = pulse;
      } else if (fillMat.transparent) {
        fillMat.transparent = rimMat.transparent = false;
        fillMat.opacity = rimMat.opacity = 1;
        fillMat.needsUpdate = rimMat.needsUpdate = true;
      }
    }
    for (const virus of this.viruses) {
      // Gleiche Z-Formel wie Zellen: kleinere Zellen verstecken sich unter dem Virus
      virus.view.group.position.set(virus.x, virus.y, 1 + Math.min(8, virus.r * 0.01));
      virus.view.group.scale.setScalar(virus.r);
    }
  }

  // ---------- Abfragen für Kamera & HUD ----------

  playerFocus() {
    const cells = this.playerCells();
    if (cells.length === 0) return null;
    let totalMass = 0;
    let cx = 0;
    let cy = 0;
    let maxR = 0;
    for (const c of cells) {
      totalMass += c.mass;
      cx += c.x * c.mass;
      cy += c.y * c.mass;
      if (c.r > maxR) maxR = c.r;
    }
    cx /= totalMass;
    cy /= totalMass;
    let spread = 0;
    for (const c of cells) {
      const d = Math.hypot(c.x - cx, c.y - cy) + c.r;
      if (d > spread) spread = d;
    }
    return { x: cx, y: cy, totalMass, maxR, spread };
  }

  leaderboard() {
    const entries = [];
    if (this.playerAlive) {
      entries.push({ name: this.playerName, mass: this.playerMass(), isPlayer: true });
    }
    for (const bot of this.bots) {
      if (bot.cell) entries.push({ name: bot.name, mass: bot.cell.mass, isPlayer: false });
    }
    entries.sort((a, b) => b.mass - a.mass);
    return entries.slice(0, 10);
  }
}
