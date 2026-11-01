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
  const amb = g.chapter.ambush;
  const target = g.ambushTarget();
  const targetHops = target !== null ? G.fugHops(target) : null;
  const lvl = g.opts.fugitive;
  const noise = lvl === 'leicht' ? 14 : lvl === 'schwer' ? 3 : 7;
  const threatW = lvl === 'leicht' ? 6 : 9;
  // Hilfsmittel
  if (g.fugitive.gadgets.disguise > 0 && g.fugitive.disguise <= 0 && (g.warrant || hereThreat <= 1) && lvl !== 'leicht' && g.rnd() < 0.6) g.useDisguise();
  if (g.fugitive.gadgets.decoy > 0 && recentlySeen && lvl !== 'leicht' && g.rnd() < 0.5) g.armDecoy();
  const unitsNoTarget = target !== null ? units.filter((u) => u !== target) : units;
  let best = opts[0], bestScore = -Infinity;
  for (const o of opts) {
    const n = G.nodes[o.to];
    // Sofortige Flucht über einen offenen Ausgang
    if (ex && g.round >= ex.fromRound && exits.includes(o.to)) return o;
    // Hinterhalt: zuschlagen, sobald es so weit ist
    if (amb && o.to === target && g.round >= amb.fromRound) return o;
    const threat = Math.min(99, ...unitsNoTarget.map((u) => G.unitDist[u][o.to]));
    let s = Math.min(threat, 4) * threatW;
    if (threat <= 1) s -= 30;
    if (n.camera && o.mode !== 'stay') s -= g.warrant ? 9 : 5;
    if (o.mode === 'subway') s -= 4 + (hereThreat <= 1 ? -6 : 0);
    if (o.mode === 'taxi') s -= g.fugitive.taxis <= 1 ? 12 : 6 - (hereThreat <= 1 ? 6 : 0);
    if (o.mode === 'bike') s -= 3 + (hereThreat <= 1 ? -4 : 0);
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
    if (amb && targetHops) {
      const h = targetHops[o.to];
      const left = amb.fromRound - g.round;
      // vor der Zeit nicht direkt aufs Ziel, aber in Lauerstellung; danach mit aller Macht hin
      const desired = left <= 0 ? 0 : Math.min(left, 2);
      if (o.to === target && left > 0) s -= 30;
      else s -= Math.max(0, h - desired) * (left <= 1 ? 25 : 6);
      if (left <= 1 && threat <= 1) s += 20; // Risiko in Kauf nehmen
    }
    s += g.rnd() * noise;
    if (s > bestScore) { bestScore = s; best = o; }
  }
  return best;
}
