/**
 * Fortschrittssystem: Talente (dauerhaft, an das Profil-Level gebunden),
 * Einsatzkarten (Roguelite-Auswahl pro Akt) und Fahndungsdruck.
 * Alles wirkt über ein gemeinsames Modifikator-Objekt auf das Spiel.
 */
export interface Mods {
  // Ermittler
  apFirstRound: number;      // zusätzliche EP in Runde 1 jedes Akts
  apEvery: number;           // alle N Runden +1 EP (0 = aus)
  searchRadiusMul: number;
  camBonus: number;          // + Wahrscheinlichkeit Kamera-Treffer
  pingRadiusMul: number;     // < 1 = genauer
  unitReachBonus: number;    // Meter
  raidSeconds: number;       // zusätzliche Sekunden im Raumbild
  freeCalls: number;         // kostenlose Anrufe pro Runde
  extraUnits: number;
  hintCost: number;
  roadblockRounds: number;   // zusätzliche Runden Haltbarkeit
  freeHeli: number;          // Gratis-Hubschrauber pro Partie
  freeObserve: number;
  warrantPenalty: number;    // Rundenstrafe bei falschem Haftbefehl
  informant: number;         // Anzahl Informanten-Tipps (genaue Position) pro Partie
  // Flüchtige
  taxis: number;
  camMinus: number;
  disguises: number;
  disguiseLen: number;
  decoys: number;
  headStart: number;
  pingRadiusMulFug: number;  // > 1 = ungenauer für die Polizei
  raidEscape: number;        // Bonus auf Fluchtchance aus Gebäuden
  dropMul: number;           // Wahrscheinlichkeit, etwas zu verlieren
  jammer: number;            // Störsender: unterdrückt Funkzellen-Ortungen
}

export const BASE_MODS: Mods = {
  apFirstRound: 0, apEvery: 0, searchRadiusMul: 1, camBonus: 0, pingRadiusMul: 1, unitReachBonus: 0, raidSeconds: 0, freeCalls: 0,
  extraUnits: 0, hintCost: 40, roadblockRounds: 0, freeHeli: 0, freeObserve: 0, warrantPenalty: 2, informant: 0,
  taxis: 0, camMinus: 0, disguises: 0, disguiseLen: 0, decoys: 0, headStart: 0, pingRadiusMulFug: 1, raidEscape: 0, dropMul: 1, jammer: 0,
};

export type Side = 'det' | 'fug';
export interface Talent { id: string; side: Side; name: string; icon: string; desc: string; maxRank: number; minLevel: number; apply: (m: Mods, rank: number) => void }

export const TALENTS: Talent[] = [
  // ---------- Ermittler ----------
  { id: 'doppelschicht', side: 'det', icon: '☕', name: 'Doppelschicht', desc: '+1 Einsatzpunkt in der ersten Runde jedes Akts (Rang 2: zusätzlich alle 4 Runden +1).', maxRank: 2, minLevel: 1, apply: (m, r) => { m.apFirstRound += 1; if (r >= 2) m.apEvery = 4; } },
  { id: 'kriminaltechnik', side: 'det', icon: '🔬', name: 'Kriminaltechnik', desc: 'Suchgebiete sind je Rang 15 % größer.', maxRank: 3, minLevel: 1, apply: (m, r) => { m.searchRadiusMul += 0.15 * r; } },
  { id: 'kameranetz', side: 'det', icon: '📹', name: 'Kameranetz', desc: 'Kameras erfassen den Flüchtigen je Rang 8 % häufiger.', maxRank: 3, minLevel: 2, apply: (m, r) => { m.camBonus += 0.08 * r; } },
  { id: 'funkzelle', side: 'det', icon: '📶', name: 'Funkspezialist', desc: 'Funkzellen-Ortungen sind je Rang 15 % genauer.', maxRank: 2, minLevel: 3, apply: (m, r) => { m.pingRadiusMul -= 0.15 * r; } },
  { id: 'streifen', side: 'det', icon: '🚓', name: 'Schnelle Streifen', desc: 'Einheiten fahren je Rang 150 m weiter.', maxRank: 2, minLevel: 4, apply: (m, r) => { m.unitReachBonus += 150 * r; } },
  { id: 'kontakte', side: 'det', icon: '📞', name: 'Gute Kontakte', desc: 'Der erste Anruf jeder Runde kostet keinen Einsatzpunkt.', maxRank: 1, minLevel: 5, apply: (m) => { m.freeCalls += 1; } },
  { id: 'spuernase', side: 'det', icon: '👃', name: 'Spürnase', desc: 'Bei Durchsuchungen je Rang 5 Sekunden mehr pro Raum.', maxRank: 2, minLevel: 3, apply: (m, r) => { m.raidSeconds += 5 * r; } },
  { id: 'richter', side: 'det', icon: '⚖️', name: 'Draht zum Richter', desc: 'Ein falscher Haftbefehl kostet nur 1 statt 2 Runden. Tipps kosten 25 statt 40 Punkte.', maxRank: 1, minLevel: 6, apply: (m) => { m.warrantPenalty = 1; m.hintCost = 25; } },
  { id: 'echo', side: 'det', icon: '🚔', name: 'Einheit Echo', desc: 'Eine fünfte Einheit steht zur Verfügung.', maxRank: 1, minLevel: 10, apply: (m) => { m.extraUnits += 1; } },
  // ---------- Flüchtige ----------
  { id: 'taxi', side: 'fug', icon: '🚕', name: 'Taxifahrer-Freund', desc: 'Je Rang eine Taxifahrt mehr pro Akt.', maxRank: 2, minLevel: 1, apply: (m, r) => { m.taxis += r; } },
  { id: 'unauffaellig', side: 'fug', icon: '🧢', name: 'Unauffällig', desc: 'Kameras erfassen dich je Rang 8 % seltener.', maxRank: 3, minLevel: 1, apply: (m, r) => { m.camMinus += 0.08 * r; } },
  { id: 'maske', side: 'fug', icon: '🎭', name: 'Meister der Maske', desc: 'Eine Verkleidung mehr pro Akt (Rang 2: sie hält 3 statt 2 Runden).', maxRank: 2, minLevel: 2, apply: (m, r) => { m.disguises += 1; if (r >= 2) m.disguiseLen += 1; } },
  { id: 'faehrten', side: 'fug', icon: '🧭', name: 'Fährtenleger', desc: 'Je Rang eine falsche Fährte mehr pro Akt.', maxRank: 2, minLevel: 3, apply: (m, r) => { m.decoys += r; } },
  { id: 'sohlen', side: 'fug', icon: '👟', name: 'Leise Sohlen', desc: 'Du verlierst je Rang 25 % seltener Gegenstände.', maxRank: 2, minLevel: 2, apply: (m, r) => { m.dropMul -= 0.25 * r; } },
  { id: 'funkloch', side: 'fug', icon: '📵', name: 'Funkloch', desc: 'Funkzellen-Ortungen sind je Rang 20 % ungenauer.', maxRank: 2, minLevel: 4, apply: (m, r) => { m.pingRadiusMulFug += 0.2 * r; } },
  { id: 'versteck', side: 'fug', icon: '🏚', name: 'Versteckkünstler', desc: 'Aus Gebäuden entkommst du je Rang 10 % leichter.', maxRank: 2, minLevel: 5, apply: (m, r) => { m.raidEscape += 0.1 * r; } },
  { id: 'vorsprung', side: 'fug', icon: '⏩', name: 'Vorsprung', desc: 'Ein zusätzlicher Zug zu Beginn jedes Akts.', maxRank: 1, minLevel: 7, apply: (m) => { m.headStart += 1; } },
];

/** Einsatzkarten / Kniffe: Roguelite-Auswahl zu Beginn jedes Akts */
export interface Perk { id: string; side: Side; icon: string; name: string; desc: string; apply: (m: Mods) => void }
export const PERKS: Perk[] = [
  { id: 'informant', side: 'det', icon: '🕵️', name: 'Informant', desc: 'Einmal in dieser Partie verrät ein Informant die genaue Position des Täters.', apply: (m) => { m.informant += 1; } },
  { id: 'ueberstunden', side: 'det', icon: '⏱', name: 'Überstunden', desc: 'Ab sofort alle 3 Runden +1 Einsatzpunkt.', apply: (m) => { m.apEvery = m.apEvery ? Math.max(2, m.apEvery - 1) : 3; } },
  { id: 'heli', side: 'det', icon: '🚁', name: 'Hubschrauber-Bereitschaft', desc: 'Ein Hubschrauber-Einsatz kostet keine Einsatzpunkte.', apply: (m) => { m.freeHeli += 1; } },
  { id: 'observ', side: 'det', icon: '👁', name: 'Observationsteam', desc: 'Zwei Observationen kosten keine Einsatzpunkte.', apply: (m) => { m.freeObserve += 2; } },
  { id: 'sperren', side: 'det', icon: '🚧', name: 'Betonsperren', desc: 'Straßensperren halten eine Runde länger.', apply: (m) => { m.roadblockRounds += 1; } },
  { id: 'kamera', side: 'det', icon: '📹', name: 'Kamera-Upgrade', desc: 'Kameras erfassen in dieser Partie 15 % häufiger.', apply: (m) => { m.camBonus += 0.15; } },
  { id: 'reichweite', side: 'det', icon: '🏎', name: 'Interceptor', desc: 'Einheiten fahren in dieser Partie 200 m weiter.', apply: (m) => { m.unitReachBonus += 200; } },
  { id: 'labor', side: 'det', icon: '🧪', name: 'Großes Suchgebiet', desc: 'Suchgebiete sind in dieser Partie 25 % größer.', apply: (m) => { m.searchRadiusMul += 0.25; } },
  { id: 'gtaxi', side: 'fug', icon: '🚕', name: 'Bargeldreserve', desc: 'Zwei zusätzliche Taxifahrten.', apply: (m) => { m.taxis += 2; } },
  { id: 'gmaske', side: 'fug', icon: '🎭', name: 'Perücke', desc: 'Eine zusätzliche Verkleidung.', apply: (m) => { m.disguises += 1; } },
  { id: 'gfaehrte', side: 'fug', icon: '🧭', name: 'Komplize', desc: 'Eine zusätzliche falsche Fährte.', apply: (m) => { m.decoys += 1; } },
  { id: 'stoersender', side: 'fug', icon: '📡', name: 'Störsender', desc: 'Die nächsten zwei Funkzellen-Ortungen fallen aus.', apply: (m) => { m.jammer += 2; } },
  { id: 'kapuze', side: 'fug', icon: '🧥', name: 'Tiefe Kapuze', desc: 'Kameras erfassen dich in dieser Partie 15 % seltener.', apply: (m) => { m.camMinus += 0.15; } },
  { id: 'gvorsprung', side: 'fug', icon: '⏩', name: 'Fluchtwagen', desc: 'Ein zusätzlicher Zug Vorsprung im nächsten Akt.', apply: (m) => { m.headStart += 1; } },
  { id: 'saubere', side: 'fug', icon: '🧤', name: 'Handschuhe', desc: 'Du verlierst in dieser Partie kaum noch Gegenstände.', apply: (m) => { m.dropMul *= 0.3; } },
];

/** Fahndungsdruck: freiwillige Erschwernis für mehr Erfahrung */
export const HEAT_LEVELS = [
  { level: 0, name: 'Normal', minLevel: 1, xpMul: 1, desc: 'Keine Erschwernis.' },
  { level: 1, name: 'Angespannt', minLevel: 3, xpMul: 1.25, desc: 'Gegner eine Stufe stärker.' },
  { level: 2, name: 'Großfahndung', minLevel: 6, xpMul: 1.5, desc: 'Gegner stärker, eine Runde weniger pro Akt.' },
  { level: 3, name: 'Ausnahmezustand', minLevel: 10, xpMul: 2, desc: 'Gegner auf „schwer“, zwei Runden weniger, seltenere Funkzellen bzw. früherer Haftbefehl.' },
];

export function buildMods(talents: Record<string, number>, side: Side | null, perks: string[]): Mods {
  const m: Mods = { ...BASE_MODS };
  if (side) for (const t of TALENTS) { const r = talents[t.id] ?? 0; if (r > 0 && t.side === side) t.apply(m, Math.min(r, t.maxRank)); }
  for (const id of perks) PERKS.find((p) => p.id === id)?.apply(m);
  return m;
}
