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
| Leertaste | Teilen (bis 16 Zellen, verschmelzen nach kurzem Cooldown) |
| W (halten) | Masse abgeben — gedrückt halten stößt fortlaufend aus |
| Mausrad | Heraus-/Heranzoomen (begrenzt) |
| Touch | Zelle folgt dem Finger; Buttons für Teilen & Masse abgeben |
| ⚙️ | Einstellungen (Lautstärke, Effekte, Minimap …) |

## Spielmodi

- **Klassisch** — endlos wachsen, größter Blob werden
- **Battle Royale** — eine rote Zone schrumpft stufenweise, außerhalb verliert man
  Masse; wer als letzter übrig bleibt, gewinnt

## Features

- Dunkler Space-Look mit Bloom-Glow (EffectComposer/UnrealBloom): Zellen, Futter,
  Power-ups, Viren und Schwarze Löcher leuchten; Parallaxe-Sternenfeld für Tiefe
- **Schwarze Löcher**: glühende Akkretionsscheibe (ShaderMaterial) mit Gravitationssog
  (invers zur Distanz, proportional zur Masse); am Event Horizon wird man rapide
  leergesaugt und zerstört, Futter spiralt über das räumliche Gitter hinein
- Game Feel: Trägheit/Gewicht (schwere Zellen driften träger), elastischer Abprall
  an Viren und beim Split, in Fahrtrichtung gestreckte Zellränder
- 24 fordernde KI-Bots mit zufälliger Aggressions-Persönlichkeit (jagen, fliehen, grasen)
- Bots splitten wie echte Spieler: Split-Angriffe auf Beute, bis zu 4 Zellen,
  zerplatzen am Virus in Teilzellen und bewerten Gegner nach Gesamtmasse
- Bots holen gezielt Power-ups und locken größere Verfolger in Viren (Fallen)
- Viren füttern: 7× Masse (W) in einen Virus schießen lässt ihn einen neuen
  Virus in Schussrichtung feuern
- 2600 Futter-Pellets als InstancedMesh (ein Draw-Call), räumliches Gitter für
  schnelle Kollisionen — der Bildschirm bleibt auch beim Großwerden gefüllt
- Futter-Typen: goldenes Futter (viel Masse) und rotes Gift (Masseverlust)
- Power-ups: Speed-Boost (⚡) und Schild (🛡️, offensiv nutzbar) als Welt-Pickups
- Emoji-Skins und Farbwähler auf dem Startscreen
- Grüne Viren, die große Zellen zerplatzen lassen
- Splitten, Masse ausstoßen, zügiges Wiederverschmelzen wie im Original
- 3 Sekunden Spawnschutz, sichere Spawnpunkte
- Automatischer Kamera-Zoom, Live-Bestenliste, Minimap, Kill-Feed
- Death-/Victory-Screen mit Statistik, Highscore und persistenten Gesamtstatistiken
- Freischaltbare Erfolge, Einstellungsmenü (Lautstärke, Effekte, Wobble,
  Minimap, Masse-Anzeige, Bloom-Glow, Schwarze Löcher)
- Fress-Partikel & Death-Schockwellen, Screen-Shake, synthetisierte
  WebAudio-Sounds, organisch wabernde Zellränder
- Weiches Kollabieren gefressener Zellen, Squash-Impuls beim Fressen,
  ruhiger Auto-Zoom und Parallaxe-Tiefe im Hintergrund
- Touch-Steuerung für Handy/Tablet

## Tuning

Alle Stellschrauben (Tempo, Weltgröße, Bot-Anzahl, Futterwerte, Schutzdauer …)
liegen gesammelt in [`src/constants.js`](src/constants.js).

## Architektur

| Datei | Zuständigkeit |
| --- | --- |
| `src/main.js` | Renderer, Kamera, Bloom-Pipeline, Eingabe, HUD, Minimap, Overlays, Spielschleife |
| `src/game.js` | Spiellogik: Fressen, Splitten, Viren, Power-ups, Schwarze Löcher, Physik, Battle Royale, Bot-KI |
| `src/food.js` | Futter-Pool (InstancedMesh) mit Futter-Typen |
| `src/grid.js` | Räumliches Gitter für schnelle Nachbarschaftssuche |
| `src/particles.js` | Effekt-Partikel (InstancedMesh, per-Instance-Alpha) |
| `src/sound.js` | Synthetisierte Sound-Effekte (WebAudio) |
| `src/cell.js` | Zell-Optik, richtungsabhängiger Wobble, Skins, Schilder, Virus & Zone |
| `src/blackhole.js` | Schwarzes-Loch-View (ShaderMaterial-Akkretionsscheibe) |
| `src/skins.js` | Emoji-Skin-Texturen |
| `src/stats.js` | Persistente Statistiken (localStorage) |
| `src/achievements.js` | Erfolg-Definitionen und Freischaltung |
| `src/settings.js` | Nutzereinstellungen (localStorage) |
| `src/constants.js` | Alle Spielparameter |
