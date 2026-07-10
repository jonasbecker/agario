# Agar Klon

Ein Agar.io-Klon mit [three.js](https://threejs.org/) — Singleplayer gegen KI-Bots.

![Spiel](https://img.shields.io/badge/three.js-orthografisch%202D-green)

## Spielen

```bash
npm install
npm run dev
```

Dann http://localhost:5173 öffnen.

## Steuerung

| Eingabe | Aktion |
| --- | --- |
| Maus | Zelle bewegen |
| Leertaste | Teilen (bis 16 Zellen, verschmelzen nach Cooldown) |
| W | Masse abgeben |

## Features

- 14 KI-Bots mit zufälliger Aggressions-Persönlichkeit (jagen, fliehen, grasen)
- 1000 Futter-Pellets als InstancedMesh (ein Draw-Call)
- Grüne Viren, die große Zellen zerplatzen lassen
- Splitten, Masse ausstoßen, Wiederverschmelzen wie im Original
- 3 Sekunden Spawnschutz, sichere Spawnpunkte
- Automatischer Kamera-Zoom, Live-Bestenliste, Death-Screen mit Statistik

## Tuning

Alle Stellschrauben (Tempo, Weltgröße, Bot-Anzahl, Futterwerte, Schutzdauer …)
liegen gesammelt in [`src/constants.js`](src/constants.js).

## Architektur

| Datei | Zuständigkeit |
| --- | --- |
| `src/main.js` | Renderer, Kamera, Eingabe, HUD, Spielschleife |
| `src/game.js` | Spiellogik: Fressen, Splitten, Viren, Bot-KI |
| `src/food.js` | Futter-Pool (InstancedMesh) |
| `src/cell.js` | Zell-Optik, Namensschilder, Virus-Geometrie |
| `src/constants.js` | Alle Spielparameter |
