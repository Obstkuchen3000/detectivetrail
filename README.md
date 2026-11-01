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

## Online spielen (GitHub Pages)

Das Repository enthält einen Workflow (`.github/workflows/pages.yml`), der das Spiel bei jedem Push auf `main` baut und veröffentlicht. Einmalig einrichten:

1. **Settings → Pages → Build and deployment → Source:** „GitHub Actions“ wählen.
2. **Settings → Secrets and variables → Actions → Reiter „Variables“ → New repository variable:** Name `PAGES_ENABLED`, Wert `true`.
3. **Actions → „Auf GitHub Pages veröffentlichen“ → Run workflow** (oder einfach etwas auf `main` pushen).

Danach ist das Spiel unter `https://<benutzername>.github.io/detectivetrail/` erreichbar.
Hinweis: Für **private** Repositories gibt es GitHub Pages nur mit einem kostenpflichtigen Plan (z. B. GitHub Pro). Alternativ kann das Repository öffentlich gestellt werden.

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
  - *Der Uhrmacher*: Rätselbriefe mit zwei Hinterhalt-Akten, dazwischen die Jagd auf den Meister
- **Schnellspiel**: prozedural erzeugte Fälle mit einer Fallnummer (Seed). Wählbar sind Schwierigkeit und Fluchtpunkte.
  Der Generator garantiert, dass die Indizienkette genau eine verdächtige Person übrig lässt.

### Rollen

- **Ermittler (Solo)** gegen einen Computer-Flüchtigen
- **Flüchtiger (Solo)** gegen Computer-Ermittler. Die KI wertet nur die öffentlich sichtbaren Spuren aus und kennt Ihre Position nicht.
- **2 Spieler** an einem Gerät (Hotseat mit Übergabe-Bildschirm)

### Ermittlungswerkzeuge

- **Spezialaktionen** für Einsatzpunkte: Suchgebiet, Straßensperre, Observation und Hubschrauber mit Wärmebild
- **Lügen im Verhör:** Aussagen, die nicht zu den Beweisen passen, mit dem richtigen Beweisstück vor Ort kippen
- **Hinterhalt-Akte:** Das Ziel des Täters aus einem Rätsel ableiten und dort auf frischer Tat zugreifen
- **Zeitachse:** Spuren bis zu einer Runde oder nur einer bestimmten Runde einblenden
- **Tipps (💡)** gegen Punktabzug und eine **Wertung mit Rang** und lokalem Bestwert am Ende
- **Tutorial „Erster Arbeitstag“** mit Coach, der Schritt für Schritt durch alle Ansichten führt

### Gebäude: Verschanzen & Durchsuchen

- Flüchtige können sich in einem Gebäude am aktuellen Knoten verschanzen. Dort sind sie für Kameras, Funkzelle und Hubschrauber unsichtbar, sitzen aber fest. Manchmal sieht ein Zeuge, wie sie hineingehen.
- Mit Haftbefehl durchsucht eine Einheit vor Ort das Gebäude. Es öffnet sich ein Querschnitt mit Etagen und Räumen (Hotel, Bürohaus, Parkhaus, Kaufhaus, Wohnhaus, Lagerhaus).
- Pro Durchgang gibt es 3 Aktionen: einen Raum durchsuchen, eine Etage abriegeln, einen Ausgang sichern oder Personal befragen.
- Raumbilder als Wimmelbild: Die Person steht halb hinter Möbeln, dazwischen Schaufensterpuppen, Mäntel und Lampen als Täuschung, dazu Spuren früherer Verstecke. Für jeden Raum gibt es 25 Sekunden.
- Die Zielperson wechselt zwischen den Durchgängen den Raum und entkommt über ungesicherte Ausgänge (Dach, Tiefgarage, Lieferanteneingang).
- Storyfälle haben feste Gebäude, zum Beispiel das Hotel The Plaza.

### Für Flüchtige

- 🚲 Leihrad (zwei Schritte, Ausleih-Spur), 🎭 Verkleidung (zwei Runden unsichtbar für Kameras und Hubschrauber) und 🧭 falsche Fährte (gefälschte U-Bahn-Spur)
- Getrennt einstellbare Stärke von KI-Flüchtigem und KI-Polizei (leicht, normal, schwer)

### Eigene Fälle

Fälle lassen sich als JSON-Datei schreiben und im Spiel unter **🛠 Eigene Fälle** laden. Dabei werden sie automatisch geprüft.
Das Format ist in [`docs/FALL-FORMAT.md`](docs/FALL-FORMAT.md) beschrieben. Eine Vorlage kann im Spiel heruntergeladen werden.

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
