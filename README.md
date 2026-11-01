# Detective Trail

Ein Ermittlungsspiel im Browser mit Lagezentrum, Pinnwand und Verhörraum. Grundlage sind echte Stadtkarten.
Sie verfolgen einen flüchtigen Täter von oben auf der Stadtkarte, suchen im Wimmelbild nach Fundstücken,
verbinden Hinweise mit roten Fäden und befragen Zeugen am Telefon oder vor Ort.

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm run build      # Typprüfung + Produktions-Build nach dist/
```

## Spielprinzip

| Ansicht | Inhalt |
|---|---|
| 🗺 **Lagekarte** | Manhattan auf Basis echter Kartendaten, mit Häuserblöcken und Parzellen. Sie bewegen Einheiten, richten Suchgebiete ein und markieren Pins, Personen, Radien, Linien und Notizen. Bei starkem Zoom erscheint ein Wimmelbild aus Passanten, Autos und Bäumen, in dem die Fundstücke versteckt sind. |
| 📌 **Pinnwand** | Hinweise erscheinen als Karten. Verbinden Sie zwei Nadeln mit einem roten Faden: Gehören die Hinweise zusammen, bleibt der Faden hängen und eine neue Erkenntnis entsteht. Sonst reißt er. Hier markieren oder streichen Sie Verdächtige und beantragen den Haftbefehl. |
| 🎙 **Verhöre** | Sie können Kontakte anrufen (kostet 1 Einsatzpunkt) oder vor Ort befragen, wenn eine Einheit dort steht. Vor Ort können Sie Beweisstücke vorlegen. Festgenommene befragen Sie direkt im Revier. |

**Verdeckte Verfolgung:** Der Flüchtige zieht unsichtbar. Er geht zu Fuß, fährt U-Bahn (bis zu 4 Stationen), nimmt ein Taxi oder taucht ab.
Dabei hinterlässt er Spuren: entwertete Fahrkarten (Einstiegsstation und Linie), Kamera-Treffer, ungefähre Taxi-Ziele,
Funkzellen-Radien und verlorene Gegenstände. Festnehmen dürfen Sie erst mit einem Haftbefehl gegen den richtigen Verdächtigen.
In manchen Akten öffnen ab einer bestimmten Runde **Fluchtpunkte** wie Heliports, Bahnhöfe oder Piers.

### Spielarten

- **Storyfälle** in drei Akten, jeder Akt mit eigenem Flüchtigen und einer Wendung am Ende:
  - *Der Blaue Reiher*: Saphirraub, dann der Kurier mit dem Stein, dann die Auftraggeberin
  - *Falsches Spiel*: Falschgeldbote, dann der Fälscher, dann der Bankier
- **Schnellspiel**: prozedural erzeugte Fälle mit einer Fallnummer (Seed). Wählbar sind Schwierigkeit und Fluchtpunkte.
  Der Generator garantiert, dass die Indizienkette genau eine verdächtige Person übrig lässt.

### Rollen

- **Ermittler (Solo)** gegen einen Computer-Flüchtigen
- **Flüchtiger (Solo)** gegen Computer-Ermittler. Die KI wertet nur die öffentlich sichtbaren Spuren aus und kennt Ihre Position nicht.
- **2 Spieler** an einem Gerät (Hotseat mit Übergabe-Bildschirm)

### Komfort

- Autosave nach jedem Phasenwechsel plus drei manuelle Speicherplätze im Browser (localStorage)
- „Akt wiederholen“, wenn ein Akt verloren geht
- Synthetische Soundeffekte über WebAudio, stummschaltbar

## Kartendaten (New York)

`scripts/build-city-nyc.mjs` lädt die Rohdaten und erzeugt daraus `public/cities/nyc/map.json` (~350 KB, Meter-Projektion):

| Ebene | Quelle | Lizenz |
|---|---|---|
| Straßen | US Census Bureau TIGER/Line, via [fillerwriter/nyc-streets](https://github.com/fillerwriter/nyc-streets) | Public Domain / Unlicense |
| Land / Bezirke | NYC Dept. of City Planning „Borough Boundaries (Clipped to Shoreline)“, via [dwillis/nyc-maps](https://github.com/dwillis/nyc-maps) | NYC Open Data (frei nutzbar) |
| U-Bahn-Stationen | MTA Subway Stations (NYC Open Data) | frei nutzbar |
| U-Bahn-Linien | NYC Open Data Subway Lines | frei nutzbar |

Central Park ist aus vier bekannten Eckkoordinaten nachgezeichnet. Die Karte neu erzeugen:

```bash
npm run build:nyc
```

## Projektstruktur

```
scripts/build-city-nyc.mjs  Kartenaufbereitung
public/cities/nyc/map.json  fertige Spielkarte
src/data/cities.ts          Städteauswahl (weitere Städte vorbereitet)
src/cases/                  Storyfälle (Akte, Hinweise, Kombinationen, Kontakte) und Schnellfall-Generator
src/game/                   Spielgraph, Regeln, Spuren, KI-Flüchtiger, KI-Ermittler, Speichern
src/map/                    Canvas-Kartenrenderer und Wimmelbild-Generator
src/ui/                     Pinnwand, Verhörraum, Dialoge, Sound, Spielstände
```

## Eine neue Stadt hinzufügen

1. Ein Build-Skript nach dem Vorbild von `build-city-nyc.mjs` schreiben, das dasselbe JSON-Format erzeugt
   (Land, Straßen nach Klassen, Labels, Stationen mit Flag `game`, `subwayEdges`).
2. Die Stadt in `src/data/cities.ts` mit `available: true` eintragen.
3. Einen Fall in `src/cases/` anlegen (Orte als Längen- und Breitengrad, Akte in `chapters`) und ihn in `src/cases/index.ts` registrieren.
