import type { Game } from './game';
import type { Trace } from './types';
import { dist } from './geo';

/**
 * KI-Ermittler: führt eine Menge möglicher Aufenthaltsorte (belief) nur anhand
 * öffentlich sichtbarer Spuren – sie schummelt nicht.
 */
export function updateBeliefAfterMove(g: Game, fresh: Trace[]) {
  const G = g.graph;
  let prev = new Set(g.belief.length ? g.belief : [g.fugitive.path[0].node]);
  let next = new Set<number>();
  const metro = fresh.find((t) => t.kind === 'metrocard');
  const taxi = fresh.find((t) => t.kind === 'taxi');
  if (metro && metro.node !== undefined && metro.route) {
    for (const w of G.subwayTargets(metro.node, metro.route)) next.add(w);
  } else if (taxi) {
    G.nodes.forEach((n, i) => { if (dist(n.x, n.y, taxi.x, taxi.y) <= (taxi.r ?? 520) + 40) next.add(i); });
  } else {
    for (const v of prev) { next.add(v); for (const w of G.walk[v]) next.add(w); }
  }
  const cctv = fresh.find((t) => t.kind === 'cctv');
  if (cctv && cctv.node !== undefined) next = new Set([cctv.node]);
  const ping = fresh.find((t) => t.kind === 'ping');
  if (ping) next = new Set([...next].filter((i) => dist(G.nodes[i].x, G.nodes[i].y, ping.x, ping.y) <= (ping.r ?? 700) + 40));
  for (const u of g.units) next.delete(u.node);
  if (!next.size) G.nodes.forEach((n, i) => { const last = g.traces[g.traces.length - 1]; if (last && dist(n.x, n.y, last.x, last.y) < 2500) next.add(i); });
  g.belief = [...next];
  void prev; prev = next;
}

export function updateBeliefAfterUnits(g: Game) {
  const occ = new Set(g.units.map((u) => u.node));
  const b = g.belief.filter((n) => !occ.has(n));
  if (b.length) g.belief = b;
}

/** Ein kompletter Zug der KI-Ermittler (Modus „Flüchtiger“) */
export function detectiveAiTurn(g: Game) {
  const G = g.graph;
  if (!g.warrant && g.round >= g.aiWarrantRound) {
    g.warrant = g.chapter.culprit;
    g.notify('Die Ermittler haben dich identifiziert! Es gibt einen Haftbefehl, und dein Foto hängt an jeder Kamera.', 'bad');
    g.sfx('warrant');
  }
  const belief = new Set(g.belief);
  const cx = g.belief.reduce((s, i) => s + G.nodes[i].x, 0) / Math.max(1, g.belief.length);
  const cy = g.belief.reduce((s, i) => s + G.nodes[i].y, 0) / Math.max(1, g.belief.length);
  // Suchgebiet, wenn die Lage unklar ist
  if (g.belief.length > 4 && g.ap > 0) {
    g.placeSearch(cx, cy);
    for (const it of g.items) if (!it.found && !it.cardId && g.isSearched(it.x, it.y) && g.rnd() < 0.7) g.collectItem(it.id, true);
  }
  // Ausgänge sichern
  const exits = g.escapeNodes();
  const covered = new Set<number>();
  const order = g.units.map((u, i) => i).sort((a, b) => dist(G.nodes[g.units[a].node].x, G.nodes[g.units[a].node].y, cx, cy) - dist(G.nodes[g.units[b].node].x, G.nodes[g.units[b].node].y, cx, cy));
  let exitGuard = exits.length && g.chapter.escape && g.round >= g.chapter.escape.fromRound - 2 ? 1 : 0;
  for (const i of order) {
    if (g.phase !== 'detective') return;
    const u = g.units[i];
    const cand = [u.node, ...g.unitReach(i)];
    let best = u.node, bs = -Infinity;
    for (const n of cand) {
      const nd = G.nodes[n];
      let s = 0;
      if (belief.has(n)) s += g.warrant ? 8 : 4;
      for (const b of g.belief) if (!covered.has(b) && G.unitDist[n][b] <= 1) s += 1;
      s -= dist(nd.x, nd.y, cx, cy) / 900;
      if (exitGuard && exits.includes(n)) s += 6;
      s += g.rnd() * 0.5;
      if (s > bs) { bs = s; best = n; }
    }
    if (exitGuard && exits.includes(best)) exitGuard = 0;
    for (const b of g.belief) if (G.unitDist[best][b] <= 1) covered.add(b);
    if (best !== u.node) g.moveUnit(i, best);
  }
  g.checkAllContacts();
}
