import type { Game } from './game';
import type { MoveOption } from './types';
import { dist } from './geo';

/** Heuristischer Computergegner für den Flüchtigen */
export function aiChooseMove(g: Game): MoveOption {
  const G = g.graph;
  const opts = g.fugitiveOptions();
  const units = g.units.map((u) => u.node);
  const known = [...g.traces].filter((t) => t.kind !== 'ping' && t.kind !== 'taxi').sort((a, b) => b.round - a.round)[0];
  const visited = new Set(g.fugitive.path.slice(-4).map((p) => p.node));
  const hereThreat = Math.min(...units.map((u) => G.unitDist[u][g.fugitive.node]));
  const recentlySeen = g.traces.some((t) => t.round >= g.round - 1 && (t.kind === 'cctv' || t.kind === 'sighting' || t.kind === 'metrocard'));
  const ex = g.chapter.escape;
  const exits = g.escapeNodes();
  const exitHops = exits.map((e) => G.fugHops(e));
  const roundsToEscape = ex ? ex.fromRound - g.round : 99;
  let best = opts[0], bestScore = -Infinity;
  for (const o of opts) {
    const n = G.nodes[o.to];
    // Sofortige Flucht über einen offenen Ausgang
    if (ex && g.round >= ex.fromRound && exits.includes(o.to)) return o;
    const threat = Math.min(...units.map((u) => G.unitDist[u][o.to]));
    let s = Math.min(threat, 4) * 9;
    if (threat <= 1) s -= 30;
    if (n.camera && o.mode !== 'stay') s -= g.warrant ? 9 : 5;
    if (o.mode === 'subway') s -= 4 + (hereThreat <= 1 ? -6 : 0);
    if (o.mode === 'taxi') s -= g.fugitive.taxis <= 1 ? 12 : 6 - (hereThreat <= 1 ? 6 : 0);
    if (o.mode === 'stay') s += recentlySeen ? -8 : 2;
    if (visited.has(o.to)) s -= 3;
    if (known) s += Math.min(dist(n.x, n.y, known.x, known.y), 3000) / 400;
    s += Math.min(G.walk[o.to].length, 5) * 0.8;
    if (ex) {
      const hops = Math.min(...exitHops.map((d) => d[o.to]));
      // je näher die Öffnung der Ausgänge, desto stärker zieht es ihn dorthin
      const pull = roundsToEscape <= 0 ? 9 : roundsToEscape <= 3 ? 5 : 1.5;
      s -= hops * pull;
      const guarded = exits.some((e) => units.includes(e));
      if (guarded && hops <= 1) s -= 4;
    }
    s += g.rnd() * 7;
    if (s > bestScore) { bestScore = s; best = o; }
  }
  return best;
}
