# Eigene Fälle schreiben

Ein Fall ist eine JSON-Datei. Laden kannst du sie im Spiel unter **Neuer Fall → New York → 🛠 Eigene Fälle**.
Am einfachsten startest du mit **„⬇ Vorlage herunterladen“**. Die Vorlage ist der Tutorial-Fall, den du dann umschreibst.
Beim Laden prüft das Spiel den Fall und listet alle Fehler auf, zum Beispiel fehlende Karten oder Orte.

## Grundgerüst

```jsonc
{
  "id": "mein-fall",                 // eindeutig, ohne Leerzeichen
  "cityId": "nyc",
  "kind": "story",
  "title": "Mein Fall",
  "subtitle": "Kurzbeschreibung",
  "teaser": "Ein Satz für die Fallauswahl",
  "places":   { ... },               // Orte mit Längen- und Breitengrad
  "units":    [ ... ],               // Startpositionen der Polizeieinheiten
  "suspects": [ ... ],               // Verdächtige (bekommen automatisch eine Dossier-Karte)
  "cards":    { ... },               // alle Hinweiskarten
  "combos":   [ ... ],               // welche zwei Karten zusammen eine neue ergeben
  "contacts": [ ... ],               // Zeugen und Verhöre
  "dropItems": [ ... ],              // Dinge, die der Flüchtige unterwegs verliert
  "chapters": [ ... ],               // ein oder mehrere Akte
  "epilogue": [ "Absatz", "Absatz" ]
}
```

## Orte (`places`)

```json
"juwelier": { "name": "Juwelier am Broadway", "lon": -73.9874, "lat": 40.7505 }
```

Koordinaten findest du zum Beispiel per Rechtsklick in einer Online-Karte. Sie müssen in Manhattan liegen
(ungefähr lon −74,02 bis −73,93 und lat 40,70 bis 40,82). Jeder Ort wird ein eigener Knoten auf der Karte.

## Verdächtige (`suspects`)

```json
{ "id": "anna", "name": "Anna Berg", "age": 34, "job": "Juwelierin", "height": "1,70 m", "shoe": 39,
  "smoker": "Nichtraucherin", "extra": "Linkshänderin", "notes": "Hat Schulden.", "hue": 200, "chapter": 0 }
```

`chapter` gibt an, ab welchem Akt das Dossier an der Pinnwand hängt (0 = erster Akt). `hue` ist die Farbe des Porträts (0 bis 360).
Die Dossier-Karte heißt automatisch `dossier_<id>` und kann in Kombinationen verwendet werden.

## Karten (`cards`)

```json
"schuh": { "kind": "fund", "icon": "👣", "title": "Schuhabdruck", "text": "Größe 45, Arbeitsstiefel." },
"anna_frei": { "kind": "erkenntnis", "title": "Anna entlastet", "text": "…", "clears": "anna" }
```

`kind` ist einer dieser Werte: `dokument`, `beweis`, `aussage`, `fund`, `erkenntnis`. `clears` streicht einen Verdächtigen automatisch.

## Kombinationen (`combos`)

```json
{ "a": "foto", "b": "schuh", "result": "profil" }
```

Verbindet man `a` und `b` an der Pinnwand mit einem Faden, entsteht `result`.

## Kontakte und Fragen (`contacts`)

```jsonc
{
  "id": "zeuge", "name": "Rocco", "role": "Hotdog-Verkäufer", "place": "hotdog", "hue": 30,
  "unlockedBy": ["bon"],      // erst sichtbar, wenn eine dieser Karten an der Pinnwand hängt
  "fromChapter": 0, "untilChapter": 1,
  "custody": false,           // true = sitzt im Revier, Verhör ohne Einheit möglich
  "questions": [
    { "id": "q1", "mode": "any", "text": "Frage?", "answer": "Antwort.", "gives": ["karte"] },
    { "id": "q2", "mode": "person", "requires": "foto", "text": "Kennen Sie den?", "answer": "…" },
    { "id": "q3", "mode": "any", "text": "Wo waren Sie?", "answer": "Zu Hause. (gelogen)",
      "contradiction": { "card": "kassenbon", "answer": "Na gut, ich war im Laden …", "gives": ["gestaendnis"] } }
  ]
}
```

- `mode: "any"`: am Telefon oder vor Ort. `mode: "person"`: nur vor Ort, also mit einer Einheit am Ort oder bei `custody`.
- `requires`: Die Frage erscheint erst, wenn diese Karte an der Pinnwand hängt (Beweis vorlegen).
- `contradiction`: Die Antwort ist eine Lüge. Legt man vor Ort die Karte `card` vor, kommt die Wahrheit heraus.

## Akte (`chapters`)

```jsonc
{
  "title": "Die Tatnacht",
  "intro": ["Absatz 1", "Absatz 2"],
  "objective": "Was ist zu tun?",
  "culprit": "anna",                     // wer in diesem Akt flieht
  "candidates": ["anna", "ben", "cem"],  // wer für den Haftbefehl in Frage kommt
  "start": "juwelier",                   // Startort des Flüchtigen
  "maxRounds": 14,
  "pingRounds": [3, 6, 9, 12],           // Runden mit Funkzellen-Ortung
  "taxis": 3,
  "headStart": 1,                        // optional: zusätzliche Züge vorweg
  "escape": { "places": ["penn"], "fromRound": 8 },                        // optional: Fluchtpunkte
  "ambush": { "target": "ziel", "candidates": ["ziel", "a", "b"], "fromRound": 6 },  // optional: Hinterhalt
  "tutorial": false,                     // true = Flüchtiger nur zu Fuß, Kameras immer
  "startCards": ["tatbericht"],
  "sceneItems": [ { "place": "juwelier", "cardId": "schuh", "icon": "shoe", "dx": -30, "dy": 20 } ],
  "searchAt": ["juwelier"],              // optional: von Anfang an abgesuchte Orte
  "timed": [ { "round": 3, "card": "labor", "needs": "kippe" } ],
  "fugitiveIntro": "Text für die Person, die flieht",
  "outro": ["Text nach der Festnahme"]
}
```

Symbole für Fundstücke (`icon`): `shoe`, `cig`, `pick`, `cup`, `ticket`, `paper`, `glove`. `dx`/`dy` ist der Versatz in Metern zum Ort.
