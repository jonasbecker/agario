import * as THREE from 'three';
import {
  WORLD_HALF, START_MASS, SPAWN_PROTECTION, radiusFromMass, speedFromMass,
  EAT_MASS_RATIO, IMPULSE_DAMPING,
  FOOD_COUNT, FOOD_CAPACITY,
  MIN_SPLIT_MASS, MAX_PLAYER_CELLS, SPLIT_IMPULSE,
  EJECT_MIN_MASS, EJECT_MASS_LOSS, EJECT_MASS_GAIN, EJECT_IMPULSE, EJECT_SELF_EAT_DELAY,
  mergeDelay,
  VIRUS_COUNT, VIRUS_MASS, VIRUS_EXPLODE_RATIO,
  VIRUS_FEED_COUNT, VIRUS_MAX, VIRUS_SHOT_IMPULSE,
  BOT_COUNT, BOT_RESPAWN_DELAY, BOT_NAMES, MAX_BOT_CELLS,
  POWERUP_COUNT, POWERUP_RADIUS, POWERUP_RESPAWN, POWERUP_MIN_MASS,
  BOOST_DURATION, BOOST_SPEED_MULT, SHIELD_DURATION,
  ZONE_START, ZONE_MIN, ZONE_SHRINK_INTERVAL, ZONE_SHRINK_STEP, ZONE_DAMAGE,
  randomCellColor, randomWorldPos, clamp,
} from './constants.js';
import { FoodPool } from './food.js';
import { ParticlePool } from './particles.js';
import { SKINS } from './skins.js';
import {
  makeCellView, disposeCellView, makeVirusView, setLabelOrder, updateCellWobble,
  makePowerupView, disposePowerupView, makeZoneView, updateMassLabel,
} from './cell.js';

let nextId = 1;

const VIRUS_GREEN = new THREE.Color(0x33cc33);

// Power-up-Typen: Symbol + Halo-Farbe
const POWERUP_TYPES = [
  { type: 'speed', emoji: '⚡', color: new THREE.Color(0xffd54f) },
  { type: 'shield', emoji: '🛡️', color: new THREE.Color(0x64b5f6) },
];

export class Game {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.food = new FoodPool(scene, FOOD_CAPACITY);
    this.particles = new ParticlePool(scene);
    this.cells = [];
    this.viruses = [];
    this.bots = [];

    this.powerups = [];
    this.effects = new Map(); // ownerKey -> { speedUntil, shieldUntil }
    this.nextPowerupAt = 0;

    // Battle Royale
    this.mode = 'classic';
    this.zone = { r: ZONE_START, targetR: ZONE_START, nextShrinkAt: 0 };
    this.zoneView = makeZoneView(scene);
    this.roundEnded = false;
    this.onVictory = null;

    this.playerAlive = false;
    this.playerName = '';
    this.playerColor = randomCellColor();
    this.playerSkin = '';
    this.mouse = { x: 0, y: 0 };
    this.lastPlayerMass = 0;
    this.maxMass = 0;
    this.spawnTime = 0;
    this.cellsEaten = 0;
    this.foodEaten = 0;
    this.playerVirusShots = 0;
    this.lastKiller = null;
    this.onPlayerDeath = null;
    this.onEvent = null;
    this.onKill = null;

    // Aus den Einstellungen steuerbare Optik-Flags
    this.settings = { wobble: true, massLabels: false };

    for (let i = 0; i < FOOD_COUNT; i++) this.food.spawnRandom();

    for (let i = 0; i < VIRUS_COUNT; i++) {
      const { x, y } = randomWorldPos(200);
      this.viruses.push(this.makeVirus(x, y));
    }

    for (let i = 0; i < POWERUP_COUNT; i++) this.spawnPowerup();

    for (let i = 0; i < BOT_COUNT; i++) {
      const bot = {
        key: `bot${i}`,
        name: BOT_NAMES[i % BOT_NAMES.length],
        color: randomCellColor(),
        // Etwa jeder dritte Bot trägt einen Emoji-Skin (bleibt über Respawns gleich)
        skin: Math.random() < 0.35 ? SKINS[1 + ((Math.random() * (SKINS.length - 1)) | 0)] : '',
        respawnAt: 0,
        foodTarget: -1,
        retargetAt: 0,
      };
      this.bots.push(bot);
      this.spawnBot(bot);
    }
  }

  makeVirus(x, y) {
    return {
      x, y,
      r: radiusFromMass(VIRUS_MASS),
      fed: 0,              // Fütterungen seit dem letzten Schuss
      dirX: 1, dirY: 0,    // Richtung der letzten Fütterung
      vx: 0, vy: 0,        // Impuls frisch abgeschossener Viren
      view: makeVirusView(this.scene),
    };
  }

  // ---------- Zellen-Verwaltung ----------

  createCell({ owner, ownerKey, name, color, mass, x, y, skin = '' }) {
    const cell = {
      id: nextId++,
      owner, ownerKey, name, color, skin,
      mass, x, y,
      r: radiusFromMass(mass),
      tx: x, ty: y,       // Bewegungsziel
      ix: 0, iy: 0,        // Impuls (Split/Explosion)
      mergeAt: 0,
      protectedUntil: 0,
      displayR: radiusFromMass(mass), // sanft animierter Anzeige-Radius
      view: makeCellView(color, name, this.scene, skin),
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
          cellsEaten: this.cellsEaten,
          foodEaten: this.foodEaten,
          virusShots: this.playerVirusShots,
          killer: this.lastKiller,
        });
      }
    } else if (!this.cells.some((c) => c.owner === cell.owner)) {
      // Bot ist erst tot, wenn seine letzte Zelle weg ist
      cell.owner.respawnAt = this.time + BOT_RESPAWN_DELAY;
    }
  }

  cellsOf(ownerKey) {
    return this.cells.filter((c) => c.ownerKey === ownerKey);
  }

  massOf(ownerKey) {
    let m = 0;
    for (const c of this.cells) if (c.ownerKey === ownerKey) m += c.mass;
    return m;
  }

  playerCells() {
    return this.cellsOf('player');
  }

  playerMass() {
    return this.massOf('player');
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

  // Spawnpunkt in einem Ring um den Spieler (nah genug für Action, aber außerhalb
  // des Sicherheitsabstands), damit beim Großwerden immer Gegner in Sicht sind.
  findSpawnNearPlayer() {
    const focus = this.playerFocus();
    if (!focus) return this.findSafeSpawn();
    for (let attempt = 0; attempt < 16; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 700 + Math.random() * 700;
      const x = clamp(focus.x + Math.cos(ang) * dist, -WORLD_HALF + 150, WORLD_HALF - 150);
      const y = clamp(focus.y + Math.sin(ang) * dist, -WORLD_HALF + 150, WORLD_HALF - 150);
      const danger = this.cells.some(
        (c) => c.mass > 40 && Math.hypot(c.x - x, c.y - y) < 500
      );
      if (!danger) return { x, y };
    }
    return this.findSafeSpawn();
  }

  spawnPlayer(name, color = null, skin = '', mode = 'classic') {
    // silent: Aufräumen alter Zellen darf nicht den Tod-Callback (Death-Overlay) auslösen
    for (const c of this.playerCells()) this.removeCell(c, true);
    this.mode = mode;
    this.roundEnded = false;
    if (mode === 'battleroyale') {
      this.zone.r = this.zone.targetR = ZONE_START;
      this.zone.nextShrinkAt = this.time + ZONE_SHRINK_INTERVAL;
      // Vollständiges Feld: tote Bots sofort wiederbeleben
      for (const bot of this.bots) {
        if (!this.cells.some((c) => c.owner === bot)) this.spawnBot(bot);
      }
    }
    this.zoneView.line.visible = mode === 'battleroyale';
    this.playerName = name;
    this.playerColor = color || randomCellColor();
    this.playerSkin = skin;
    const { x, y } = this.findSafeSpawn();
    const cell = this.createCell({
      owner: 'player', ownerKey: 'player', name,
      color: this.playerColor, skin, mass: START_MASS, x, y,
    });
    cell.protectedUntil = this.time + SPAWN_PROTECTION;
    this.playerAlive = true;
    this.maxMass = START_MASS;
    this.lastPlayerMass = START_MASS;
    this.spawnTime = this.time;
    this.cellsEaten = 0;
    this.foodEaten = 0;
    this.playerVirusShots = 0;
    this.lastKiller = null;
  }

  spawnBot(bot) {
    // Mit ~40 % Chance in Spielernähe spawnen (nur wenn der Spieler lebt),
    // damit der Bildschirm beim Großwerden belebt bleibt
    const nearPlayer = this.playerAlive && this.playerMass() > 60 && Math.random() < 0.4;
    const { x, y } = nearPlayer ? this.findSpawnNearPlayer() : this.findSafeSpawn();
    const mass = 15 + Math.random() * 35;
    // Persönlichkeit: wie aggressiv dieser Bot Beute jagt (wird pro Leben neu gewürfelt)
    bot.aggression = 0.25 + Math.random() * 0.65;
    const cell = this.createCell({
      owner: bot, ownerKey: bot.key, name: bot.name,
      color: bot.color, skin: bot.skin, mass, x, y,
    });
    cell.protectedUntil = this.time + SPAWN_PROTECTION;
  }

  // ---------- Spieler-Aktionen ----------

  setMouseWorld(x, y) {
    this.mouse.x = x;
    this.mouse.y = y;
  }

  // Teilt alle Zellen eines Besitzers Richtung (tx, ty) — Spieler und Bots
  splitCells(ownerKey, tx, ty, maxCells) {
    const existing = this.cellsOf(ownerKey);
    let slots = maxCells - existing.length;
    let didSplit = false;
    for (const cell of existing) {
      if (slots <= 0) break;
      if (cell.mass < MIN_SPLIT_MASS) continue;
      slots--;
      didSplit = true;
      cell.mass /= 2;
      const dx = tx - cell.x;
      const dy = ty - cell.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      const delay = mergeDelay(cell.mass);
      cell.mergeAt = this.time + delay;
      const child = this.createCell({
        owner: cell.owner, ownerKey, name: cell.name,
        color: cell.color, skin: cell.skin, mass: cell.mass,
        x: cell.x + nx * cell.r * 0.2, y: cell.y + ny * cell.r * 0.2,
      });
      child.ix = nx * SPLIT_IMPULSE;
      child.iy = ny * SPLIT_IMPULSE;
      child.mergeAt = this.time + delay;
    }
    return didSplit;
  }

  splitPlayer() {
    if (!this.playerAlive) return;
    if (this.splitCells('player', this.mouse.x, this.mouse.y, MAX_PLAYER_CELLS)) {
      this.onEvent?.('split');
    }
  }

  ejectPlayer() {
    if (!this.playerAlive) return;
    let didEject = false;
    for (const cell of this.playerCells()) {
      if (cell.mass < EJECT_MIN_MASS) continue;
      cell.mass -= EJECT_MASS_LOSS;
      didEject = true;
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
    if (didEject) this.onEvent?.('eject');
  }

  // ---------- Update ----------

  update(dt) {
    this.time += dt;

    for (const c of this.cells) c.r = radiusFromMass(c.mass);

    this.updateBots(dt);
    this.moveCells(dt);
    this.resolveOverlaps();
    this.food.update(dt);
    this.particles.update(dt);
    this.eatFood();
    this.eatCells();
    this.updateViruses(dt);
    this.updatePowerups(dt);
    if (this.mode === 'battleroyale') this.updateZone(dt);
    this.applyDecay(dt);
    this.respawnFood(dt);
    this.respawnBots();
    this.syncViews(dt);
    if (this.mode === 'battleroyale') this.checkVictory();

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
        const boost = this.hasSpeed(cell.ownerKey) ? BOOST_SPEED_MULT : 1;
        const speed = speedFromMass(cell.mass) * boost * Math.min(1, d / (cell.r * 0.5 + 1));
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

  // Zellen desselben Besitzers verschmelzen bzw. schieben sich auseinander
  resolveOverlaps() {
    const groups = new Map();
    for (const c of this.cells) {
      const g = groups.get(c.ownerKey);
      if (g) g.push(c);
      else groups.set(c.ownerKey, [c]);
    }
    for (const cells of groups.values()) {
      if (cells.length > 1) this.resolveGroupOverlaps(cells);
    }
  }

  resolveGroupOverlaps(cells) {
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
      const delta = this.food.eat(cell, this.time, EJECT_SELF_EAT_DELAY);
      if (delta === 0) continue;
      // Gift (negatives Delta) kann Masse abziehen, aber nicht unter einen Boden
      cell.mass = Math.max(10, cell.mass + delta);
      if (cell.ownerKey === 'player') {
        this.foodEaten++;
        this.onEvent?.(delta < 0 ? 'poison' : 'food');
      }
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
        // Spawnschutz ist symmetrisch: geschützte Zellen fressen nicht und
        // werden nicht gefressen
        if (this.isSpawnProtected(a) || this.isSpawnProtected(b)) continue;

        let big = null;
        let small = null;
        if (a.mass > b.mass * EAT_MASS_RATIO) { big = a; small = b; }
        else if (b.mass > a.mass * EAT_MASS_RATIO) { big = b; small = a; }
        else continue;

        // Power-up-Schild schützt nur davor, gefressen zu werden (offensiv nutzbar):
        // Die größere Zelle darf trotz eigenem Schild fressen.
        if (this.hasShield(small)) continue;

        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < big.r - small.r * 0.35) {
          big.mass += small.mass;
          eaten.add(small);
          // Platz-Effekt skaliert mit der Größe der gefressenen Zelle
          this.particles?.burst(small.x, small.y, small.color, Math.min(20, 8 + small.r * 0.2));
          if (small.r > 22) this.particles?.ring(small.x, small.y, small.color, small.r * 0.6, 20);
          if (big.ownerKey === 'player') {
            this.cellsEaten++;
            this.onEvent?.('eat');
          }
          if (small.ownerKey === 'player') this.lastKiller = big.name;
          // Kill-Feed: nur „echte" Kills melden (kein Verschlucken winziger Splitter),
          // Spieler-Beteiligung immer
          const involvesPlayer = big.ownerKey === 'player' || small.ownerKey === 'player';
          if (involvesPlayer || small.mass > 24) {
            this.onKill?.(big.name, small.name, big.ownerKey === 'player', small.ownerKey === 'player');
          }
        }
      }
    }
    for (const cell of eaten) this.removeCell(cell);
  }

  updateViruses(dt) {
    const damping = Math.exp(-IMPULSE_DAMPING * dt);
    for (const virus of this.viruses) {
      // Impuls frisch abgeschossener Viren abbauen
      if (virus.vx !== 0 || virus.vy !== 0) {
        virus.x = clamp(virus.x + virus.vx * dt, -WORLD_HALF, WORLD_HALF);
        virus.y = clamp(virus.y + virus.vy * dt, -WORLD_HALF, WORLD_HALF);
        virus.vx *= damping;
        virus.vy *= damping;
        if (Math.abs(virus.vx) < 1 && Math.abs(virus.vy) < 1) virus.vx = virus.vy = 0;
      }

      for (const cell of [...this.cells]) {
        if (cell.mass < VIRUS_MASS * VIRUS_EXPLODE_RATIO) continue;
        const d = Math.hypot(cell.x - virus.x, cell.y - virus.y);
        if (d >= cell.r - virus.r * 0.4) continue;

        const maxCells = cell.ownerKey === 'player' ? MAX_PLAYER_CELLS : MAX_BOT_CELLS;
        this.explodeCell(cell, maxCells);
        this.particles?.burst(virus.x, virus.y, VIRUS_GREEN, 14, 320);
        if (cell.ownerKey === 'player') this.onEvent?.('virus');

        const pos = randomWorldPos(200);
        virus.x = pos.x;
        virus.y = pos.y;
        virus.fed = 0;
        break;
      }
    }
    this.feedViruses();
  }

  // Geworfene Masse (W) füttert Viren; nach genug Fütterungen schießt der Virus
  // einen neuen Virus in die Fütterrichtung ab. Grid-Abfrage pro Virus.
  feedViruses() {
    const f = this.food;
    for (const virus of this.viruses) {
      const r2 = virus.r * virus.r;
      f.grid.query(virus.x, virus.y, virus.r, (i) => {
        if (!f.alive[i] || !f.isEject[i]) return;
        const dx = f.x[i] - virus.x;
        const dy = f.y[i] - virus.y;
        if (dx * dx + dy * dy > r2) return;
        const speed = Math.hypot(f.vx[i], f.vy[i]);
        if (speed > 40) {
          virus.dirX = f.vx[i] / speed;
          virus.dirY = f.vy[i] / speed;
        }
        const fedByPlayer = f.ownerKey[i] === 'player';
        f.kill(i);
        virus.fed++;
        if (virus.fed >= VIRUS_FEED_COUNT) {
          virus.fed = 0;
          if (this.viruses.length < VIRUS_MAX) {
            this.shootVirus(virus);
            if (fedByPlayer) this.playerVirusShots++;
          }
        }
      });
    }
  }

  shootVirus(from) {
    const virus = this.makeVirus(from.x, from.y);
    virus.vx = from.dirX * VIRUS_SHOT_IMPULSE;
    virus.vy = from.dirY * VIRUS_SHOT_IMPULSE;
    this.viruses.push(virus);
  }

  // ---------- Power-ups ----------

  spawnPowerup() {
    const def = POWERUP_TYPES[(Math.random() * POWERUP_TYPES.length) | 0];
    const { x, y } = randomWorldPos(150);
    this.powerups.push({
      x, y, r: POWERUP_RADIUS, type: def.type,
      view: makePowerupView(this.scene, def.emoji, def.color),
    });
  }

  updatePowerups(dt) {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      // Aufsammeln: ausreichend große Zelle berührt das Power-up
      let taken = null;
      for (const cell of this.cells) {
        if (cell.mass < POWERUP_MIN_MASS) continue;
        if (Math.hypot(cell.x - p.x, cell.y - p.y) < cell.r + p.r * 0.4) { taken = cell; break; }
      }
      if (taken) {
        this.applyEffect(taken.ownerKey, p.type);
        this.particles?.burst(p.x, p.y, p.view.halo.material.color, 16, 260);
        if (taken.ownerKey === 'player') this.onEvent?.('powerup');
        disposePowerupView(p.view, this.scene);
        this.powerups.splice(i, 1);
        this.nextPowerupAt = this.time + POWERUP_RESPAWN;
      }
    }
    // Nachwachsen lassen, sobald die Wartezeit seit dem letzten Verbrauch um ist
    if (this.powerups.length < POWERUP_COUNT && this.time >= (this.nextPowerupAt ?? 0)) {
      this.spawnPowerup();
      this.nextPowerupAt = this.time + POWERUP_RESPAWN;
    }
  }

  applyEffect(ownerKey, type) {
    let e = this.effects.get(ownerKey);
    if (!e) { e = { speedUntil: 0, shieldUntil: 0 }; this.effects.set(ownerKey, e); }
    if (type === 'speed') e.speedUntil = this.time + BOOST_DURATION;
    else if (type === 'shield') e.shieldUntil = this.time + SHIELD_DURATION;
  }

  hasSpeed(ownerKey) {
    const e = this.effects.get(ownerKey);
    return e ? e.speedUntil > this.time : false;
  }

  // Spawnschutz: symmetrisch — geschützte Zellen fressen nicht und werden nicht gefressen
  isSpawnProtected(cell) {
    return cell.protectedUntil > this.time;
  }

  // Power-up-Schild: offensiv — Träger kann fressen, wird aber nicht gefressen
  hasShield(cell) {
    const e = this.effects.get(cell.ownerKey);
    return e ? e.shieldUntil > this.time : false;
  }

  // Restzeiten der Spieler-Effekte fürs HUD (0 wenn inaktiv)
  playerEffects() {
    const e = this.effects.get('player');
    if (!e) return { speed: 0, shield: 0 };
    return {
      speed: Math.max(0, e.speedUntil - this.time),
      shield: Math.max(0, e.shieldUntil - this.time),
    };
  }

  explodeCell(cell, maxCells) {
    cell.mass += VIRUS_MASS * 0.5;
    const slots = maxCells - this.cellsOf(cell.ownerKey).length;
    const n = Math.min(slots, 7, Math.floor(cell.mass / 20) - 1);
    if (n <= 0) return;
    const each = cell.mass / (n + 1);
    cell.mass = each;
    const delay = mergeDelay(each);
    cell.mergeAt = this.time + delay;
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * Math.PI * 2;
      const child = this.createCell({
        owner: cell.owner, ownerKey: cell.ownerKey, name: cell.name,
        color: cell.color, skin: cell.skin, mass: each, x: cell.x, y: cell.y,
      });
      child.ix = Math.cos(ang) * (400 + Math.random() * 250);
      child.iy = Math.sin(ang) * (400 + Math.random() * 250);
      child.mergeAt = this.time + delay;
    }
  }

  applyDecay(dt) {
    for (const cell of this.cells) {
      if (cell.mass > 200) cell.mass *= 1 - 0.007 * dt;
    }
  }

  // ---------- Battle Royale ----------

  updateZone(dt) {
    const z = this.zone;
    // Zielradius stufenweise verkleinern, aktuellen Radius sanft nachführen
    if (this.time >= z.nextShrinkAt && z.targetR > ZONE_MIN) {
      z.targetR = Math.max(ZONE_MIN, z.targetR - ZONE_SHRINK_STEP);
      z.nextShrinkAt = this.time + ZONE_SHRINK_INTERVAL;
    }
    z.r += (z.targetR - z.r) * Math.min(1, dt * 0.6);

    // Schaden außerhalb der Zone; kleine Zellen sterben
    const r2 = z.r * z.r;
    for (const cell of [...this.cells]) {
      if (cell.x * cell.x + cell.y * cell.y <= r2) continue;
      cell.mass -= ZONE_DAMAGE * dt;
      if (cell.mass <= 8) {
        if (cell.ownerKey === 'player') this.onEvent?.('death');
        this.particles?.burst(cell.x, cell.y, cell.color, 12);
        this.removeCell(cell);
      }
    }
  }

  checkVictory() {
    if (this.roundEnded || !this.playerAlive) return;
    // Sieg, wenn nur noch Spielerzellen übrig sind
    if (!this.cells.some((c) => c.ownerKey !== 'player')) {
      this.roundEnded = true;
      this.onVictory?.({
        mass: Math.round(this.playerMass()),
        maxMass: Math.round(this.maxMass),
        timeAlive: Math.round(this.time - this.spawnTime),
        cellsEaten: this.cellsEaten,
        foodEaten: this.foodEaten,
        virusShots: this.playerVirusShots,
      });
    }
  }

  respawnFood(dt) {
    let budget = Math.ceil(dt * 30);
    while (this.food.baseAlive < FOOD_COUNT && budget-- > 0) this.food.spawnRandom();
  }

  respawnBots() {
    // Im Battle Royale gibt es kein Nachspawnen — letzter Überlebender gewinnt
    if (this.mode === 'battleroyale') return;
    for (const bot of this.bots) {
      if (this.time >= bot.respawnAt && !this.cells.some((c) => c.owner === bot)) {
        this.spawnBot(bot);
      }
    }
  }

  // ---------- Bot-KI ----------

  updateBots(dt) {
    // Gesamtmasse pro Besitzer einmal pro Frame vorberechnen
    const massByOwner = new Map();
    for (const c of this.cells) {
      massByOwner.set(c.ownerKey, (massByOwner.get(c.ownerKey) ?? 0) + c.mass);
    }

    for (const bot of this.bots) {
      const cells = this.cellsOf(bot.key);
      if (cells.length === 0) continue;
      // Entscheidungen trifft die größte Zelle, alle Zellen folgen demselben Ziel
      let c = cells[0];
      for (const cell of cells) if (cell.mass > c.mass) c = cell;

      // 1. Vor größeren Gegnern fliehen
      let threat = null;
      let threatDist = Infinity;
      // 2. Kleinere Zellen jagen
      let prey = null;
      let preyDist = Infinity;

      for (const o of this.cells) {
        if (o.ownerKey === c.ownerKey) continue;
        const d = Math.hypot(o.x - c.x, o.y - c.y);
        // Gefährlich ist eine Zelle auch, wenn ihr Besitzer insgesamt deutlich
        // stärker ist (gesplittete Gegner können wieder verschmelzen)
        const strength = Math.max(o.mass, (massByOwner.get(o.ownerKey) ?? 0) * 0.7);
        if (strength > c.mass * 1.3 && d - o.r < 350 + c.r && d < threatDist) {
          threat = o;
          threatDist = d;
        } else if (c.mass > o.mass * 1.3 && d < 200 + 400 * bot.aggression + c.r && d < preyDist) {
          prey = o;
          preyDist = d;
        }
      }

      let tx = c.tx;
      let ty = c.ty;

      if (threat) {
        const dx = c.x - threat.x;
        const dy = c.y - threat.y;
        const d = Math.hypot(dx, dy) || 1;
        tx = c.x + (dx / d) * 500;
        ty = c.y + (dy / d) * 500;
        // In der Nähe der Wand zur Mitte hin ausweichen
        if (Math.abs(tx) > WORLD_HALF - 100) tx *= 0.7;
        if (Math.abs(ty) > WORLD_HALF - 100) ty *= 0.7;
      } else if (prey) {
        tx = prey.x;
        ty = prey.y;
        // Split-Angriff: halbierte Zelle kann die Beute noch fressen und
        // erreicht sie mit Split-Impuls (~270 Einheiten) plus Nachlaufen —
        // die Reichweite muss größer sein als der Flucht-Abstand der Beute
        if (
          cells.length < MAX_BOT_CELLS &&
          c.mass >= MIN_SPLIT_MASS &&
          c.mass / 2 > prey.mass * EAT_MASS_RATIO &&
          preyDist < c.r + 420 &&
          Math.random() < bot.aggression * 3 * dt
        ) {
          this.splitCells(bot.key, prey.x, prey.y, MAX_BOT_CELLS);
        }
      } else {
        // 3. Futter suchen: nächstes Pellet in wachsendem Radius per Grid,
        // Zufallsstichprobe als Fallback wenn nichts in der Nähe ist
        const f = this.food;
        if (
          bot.foodTarget < 0 ||
          !f.alive[bot.foodTarget] ||
          this.time >= bot.retargetAt
        ) {
          bot.retargetAt = this.time + 0.5;
          let best = -1;
          let bestD = Infinity;
          for (const radius of [400, 900]) {
            f.grid.query(c.x, c.y, radius, (i) => {
              if (!f.alive[i]) return;
              const d = Math.hypot(f.x[i] - c.x, f.y[i] - c.y);
              if (d < bestD) { bestD = d; best = i; }
            });
            if (best >= 0) break;
          }
          if (best < 0) {
            for (let s = 0; s < 30; s++) {
              const i = (Math.random() * f.capacity) | 0;
              if (!f.alive[i]) continue;
              const d = Math.hypot(f.x[i] - c.x, f.y[i] - c.y);
              if (d < bestD) { bestD = d; best = i; }
            }
          }
          bot.foodTarget = best;
        }
        if (bot.foodTarget >= 0 && f.alive[bot.foodTarget]) {
          tx = f.x[bot.foodTarget];
          ty = f.y[bot.foodTarget];
        }
      }

      // Im Battle Royale zur Mitte steuern, wenn die größte Zelle nah am Zonenrand ist
      if (this.mode === 'battleroyale' && Math.hypot(c.x, c.y) > this.zone.r * 0.82) {
        tx = 0;
        ty = 0;
      }

      for (const cell of cells) {
        cell.tx = tx;
        cell.ty = ty;
      }

      // 4. Viren meiden — pro Zelle, die daran zerplatzen würde
      for (const cell of cells) {
        if (cell.mass <= VIRUS_MASS * VIRUS_EXPLODE_RATIO) continue;
        for (const virus of this.viruses) {
          const d = Math.hypot(cell.x - virus.x, cell.y - virus.y);
          if (d < cell.r + virus.r + 60) {
            const nx = (cell.x - virus.x) / (d || 1);
            const ny = (cell.y - virus.y) / (d || 1);
            cell.tx = cell.x + nx * 400;
            cell.ty = cell.y + ny * 400;
            break;
          }
        }
      }
    }
  }

  // ---------- Rendering-Sync ----------

  syncViews(dt) {
    // Masse-Labels nur ~alle 0.3s aktualisieren
    this.massLabelTick = (this.massLabelTick ?? 0) - dt;
    const refreshMass = this.settings.massLabels && this.massLabelTick <= 0;
    if (refreshMass) this.massLabelTick = 0.3;

    for (const cell of this.cells) {
      const v = cell.view;
      if (this.settings.wobble) updateCellWobble(v, this.time);
      if (refreshMass) updateMassLabel(v, cell.mass, true);
      else if (!this.settings.massLabels && v.massLabel.visible) updateMassLabel(v, 0, false);
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
      // Gefütterte Viren schwellen sichtbar an
      virus.view.group.scale.setScalar(virus.r * (1 + virus.fed * 0.035));
    }
    const pulse = 1 + 0.12 * Math.sin(this.time * 5);
    for (const p of this.powerups) {
      p.view.group.position.set(p.x, p.y, 0.6);
      p.view.group.scale.setScalar(p.r * pulse);
    }
    if (this.mode === 'battleroyale') {
      this.zoneView.line.scale.setScalar(this.zone.r);
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
      const mass = this.massOf(bot.key);
      if (mass > 0) entries.push({ name: bot.name, mass, isPlayer: false });
    }
    entries.sort((a, b) => b.mass - a.mass);
    return entries.slice(0, 10);
  }
}
