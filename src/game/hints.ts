import type { Game } from './game';

/** Liefert den nächsten sinnvollen Tipp (kostet Punkte) */
export function nextHint(g: Game): string {
  g.stats.hints++;
  const P = (k: string) => g.def.places[k]?.name ?? k;
  // 1) Fundstücke im Suchgebiet
  const item = g.items.find((i) => !i.found && i.cardId && g.isSearched(i.x, i.y));
  if (item) {
    const n = g.graph.nodes.reduce((b, nd) => (Math.hypot(nd.x - item.x, nd.y - item.y) < Math.hypot(b.x - item.x, b.y - item.y) ? nd : b));
    return `Im Suchgebiet bei ${n.name} liegt noch ein Fundstück. Zoomen Sie ganz nah heran und suchen Sie nach hellen, ungewöhnlichen Gegenständen.`;
  }
  // 2) Mögliche Verbindung an der Pinnwand
  const combo = g.def.combos.find((c) => g.board.has(c.a) && g.board.has(c.b) && !g.board.has(c.result));
  if (combo) return `Pinnwand: Verbinden Sie „${g.cards[combo.a].title}“ mit „${g.cards[combo.b].title}“.`;
  // 3) Ergiebige Frage, die sofort gestellt werden kann
  for (const c of g.def.contacts) {
    if (!g.contactVisible(c)) continue;
    for (const q of g.visibleQuestions(c)) {
      if (g.isAsked(c, q.id) || !q.gives?.some((x) => !g.board.has(x))) continue;
      if (q.requires && !g.board.has(q.requires)) continue;
      if (q.mode === 'person' && !c.custody) return `Schicken Sie eine Einheit zu ${P(c.place)}. ${c.name} weiß vor Ort mehr („${q.text}“).`;
      return `Verhöre: Fragen Sie ${c.name}: „${q.text}“`;
    }
  }
  // 4) Widerspruch aufdecken
  for (const c of g.def.contacts) {
    if (!g.contactVisible(c)) continue;
    for (const q of g.visibleQuestions(c)) if (q.contradiction && g.isAsked(c, q.id) && !g.resolved.includes(c.id + '.' + q.id))
      return `${c.name} hat Sie angelogen („${q.text}“). Legen Sie vor Ort das passende Beweisstück vor.`;
  }
  // 5) Haftbefehl
  const open = g.warrantCandidates();
  if (!g.warrant && open.length === 1) return `Alle anderen sind ausgeschlossen. Beantragen Sie den Haftbefehl gegen ${open[0].name}.`;
  if (!g.warrant) {
    const missing = g.def.combos.find((c) => !g.board.has(c.result) && (g.board.has(c.a) || g.board.has(c.b)));
    if (missing) { const have = g.board.has(missing.a) ? missing.a : missing.b; return `Zu „${g.cards[have].title}“ fehlt noch ein passendes Gegenstück. Suchen Sie weiter, fragen Sie nach oder warten Sie auf Unterlagen.`; }
    return 'Prüfen Sie die Dossiers: Welche Verdächtigen passen nicht zu Ihren Erkenntnissen? Streichen Sie sie mit ✗.';
  }
  // 6) Verschanzt?
  const quiet = g.round - Math.max(0, ...g.traces.filter((t) => t.kind !== 'start' && !t.fake).map((t) => t.round));
  const bt = [...g.traces].reverse().find((t) => t.kind === 'building');
  if (bt && bt.round >= g.round - 3) return `Ein Zeuge hat jemanden in ein Gebäude gehen sehen (Runde ${bt.round}). Fahren Sie mit einer Einheit hin und durchsuchen Sie es (🏢 neben der Einheit).`;
  if (quiet >= 2) return 'Seit zwei Runden gibt es keine Spuren. Vielleicht hat sich die Zielperson in einem Gebäude verschanzt. Durchsuchen Sie Gebäude am letzten bekannten Ort; das Personal verrät, ob dort jemand Fremdes ist.';
  // 7) Verfolgung
  const last = [...g.traces].filter((t) => !t.r && t.kind !== 'start').sort((a, b) => b.round - a.round)[0];
  const ex = g.chapter.escape;
  if (ex && g.round >= ex.fromRound - 2) return `Die Fluchtpunkte öffnen bald. Stellen Sie Einheiten auf ${ex.places.map(P).join(', ')}.`;
  if (last) return `Die letzte sichere Spur stammt aus Runde ${last.round}. Ziehen Sie einen Radius darum und kreisen Sie den Bereich mit mehreren Einheiten ein.`;
  return 'Richten Sie ein Suchgebiet ein. Verlorene Gegenstände verraten, wo der Flüchtige war.';
}
