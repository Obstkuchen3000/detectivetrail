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
  const here = G.nodes[g.fugitive.node];
  const hereThreat = Math.min(...units.map((u) => G.unitDist[u][g.fugitive.node]));
  const recentlySeen = g.traces.some((t) => t.round >= g.round - 1 && (t.kind === 'cctv' || t.kind === 'sighting' || t.kind === 'metrocard'));
  let best = opts[0], bestScore = -Infinity;
  for (const o of opts) {
    const n = G.nodes[o.to];
    const threat = Math.min(...units.map((u) => G.unitDist[u][o.to]));
    let s = Math.min(threat, 4) * 9;
    if (threat <= 1) s -= 30;
    if (n.camera && o.mode !== 'stay') s -= g.warrant ? 9 : 5;
    if (o.mode === 'subway') s -= 4 + (hereThreat <= 1 ? -6 : 0);
    if (o.mode === 'taxi') s -= g.fugitive.taxis <= 1 ? 12 : 6 - (hereThreat <= 1 ? 6 : 0);
    if (o.mode === 'stay') s += recentlySeen ? -8 : 2;
    if (visited.has(o.to)) s -= 3;
    if (known) s += Math.min(dist(n.x, n.y, known.x, known.y), 3000) / 400;
    s += Math.min(G.walk[o.to].length, 5) * 0.8; // Fluchtwege offen halten
    s += g.rnd() * 7;
    void here;
    if (s > bestScore) { bestScore = s; best = o; }
  }
  return best;
}
