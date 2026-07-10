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
| Mausrad | Heraus-/Heranzoomen (begrenzt) |
| Touch | Zelle folgt dem Finger; Buttons für Teilen & Masse abgeben |

## Features

- 14 KI-Bots mit zufälliger Aggressions-Persönlichkeit (jagen, fliehen, grasen)
- Bots splitten wie echte Spieler: Split-Angriffe auf Beute, bis zu 4 Zellen,
  zerplatzen am Virus in Teilzellen und bewerten Gegner nach Gesamtmasse
- Viren füttern: 7× Masse (W) in einen Virus schießen lässt ihn einen neuen
  Virus in Schussrichtung feuern
- 1000 Futter-Pellets als InstancedMesh (ein Draw-Call)
- Grüne Viren, die große Zellen zerplatzen lassen
- Splitten, Masse ausstoßen, Wiederverschmelzen wie im Original
- 3 Sekunden Spawnschutz, sichere Spawnpunkte
- Automatischer Kamera-Zoom, Live-Bestenliste, Minimap
- Death-Screen mit Statistik („Gefressen von …", gefressene Zellen) und
  Highscore in localStorage
- Fress-Partikel, synthetisierte WebAudio-Sounds, organisch wabernde Zellränder
- Touch-Steuerung für Handy/Tablet

## Tuning

Alle Stellschrauben (Tempo, Weltgröße, Bot-Anzahl, Futterwerte, Schutzdauer …)
liegen gesammelt in [`src/constants.js`](src/constants.js).

## Architektur

| Datei | Zuständigkeit |
| --- | --- |
| `src/main.js` | Renderer, Kamera, Eingabe, HUD, Minimap, Spielschleife |
| `src/game.js` | Spiellogik: Fressen, Splitten, Viren, Bot-KI |
| `src/food.js` | Futter-Pool (InstancedMesh) |
| `src/particles.js` | Effekt-Partikel (InstancedMesh) |
| `src/sound.js` | Synthetisierte Sound-Effekte (WebAudio) |
| `src/cell.js` | Zell-Optik, Wobble, Namensschilder, Virus-Geometrie |
| `src/constants.js` | Alle Spielparameter |
