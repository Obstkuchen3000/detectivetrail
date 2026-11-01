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
  const bike = fresh.find((t) => t.kind === 'bike');
  if (metro && metro.node !== undefined && metro.route) {
    for (const w of G.subwayTargets(metro.node, metro.route)) next.add(w);
  } else if (bike && bike.node !== undefined) {
    for (const w of G.bikeTargets(bike.node)) next.add(w);
  } else if (taxi) {
    G.nodes.forEach((n, i) => { if (dist(n.x, n.y, taxi.x, taxi.y) <= (taxi.r ?? 520) + 40) next.add(i); });
  } else {
    for (const v of prev) { next.add(v); for (const w of G.walk[v]) next.add(w); }
  }
  const bld = fresh.find((t) => t.kind === 'building');
  if (bld && bld.node !== undefined) next = new Set([bld.node]);
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
  const lvl = g.opts.police;
  // Hubschrauber bei großer Unsicherheit (nur „schwer“)
  if (lvl === 'schwer' && g.belief.length > 6 && g.ap >= 2) g.heliScan(cx, cy);
  // Suchgebiet, wenn die Lage unklar ist
  if (lvl !== 'leicht' && g.belief.length > 4 && g.ap > 0) {
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
  // Gebäude stürmen, wenn eine Einheit dort steht und es Indizien gibt
  if (g.warrant && g.phase === 'detective') {
    for (const u of g.units) {
      const n = u.node;
      const tip = g.traces.some((t) => t.kind === 'building' && t.node === n && t.round >= g.round - 3) || (g.belief.length <= 2 && g.belief.includes(n));
      if (tip && g.canRaid(n)) { aiRaid(g, n); break; }
    }
    if (g.phase !== 'detective') return;
  }
  // Straßensperre auf den wahrscheinlichsten Fluchtweg
  if (lvl !== 'leicht' && g.ap > 0 && g.phase === 'detective' && g.belief.length > 1) {
    const cnt = new Map<number, number>();
    for (const b of g.belief) for (const w of G.walk[b]) cnt.set(w, (cnt.get(w) ?? 0) + 1);
    const best = [...cnt].filter(([n]) => !g.units.some((u) => u.node === n)).sort((a, b) => b[1] - a[1])[0];
    if (best) g.placeRoadblock(best[0]);
  }
  g.checkAllContacts();
}

/** KI-Polizei durchsucht ein Gebäude (Modus „Flüchtiger“) */
function aiRaid(g: Game, node: number) {
  g.startRaid(node);
  const R = g.raid!; const b = g.buildingAt(node);
  const findP = g.opts.police === 'leicht' ? 0.5 : g.opts.police === 'schwer' ? 0.85 : 0.7;
  let hintFloor: number | null = null;
  while (g.raid && !R.ended) {
    while (R.actions > 0 && !R.ended) {
      const staff = b.staff.find((s) => !R.asked.includes(s.id));
      if (staff && R.turn <= 2) {
        const t = g.raidAsk(staff.id) ?? '';
        const m = /im (\d+)\. Stock|im Erdgeschoss/.exec(t);
        if (m) hintFloor = m[1] ? +m[1] : 0;
        continue;
      }
      const exit = b.rooms.find((r) => r.exit && !R.guarded.includes(r.id) && (hintFloor === null || Math.abs(r.floor - hintFloor) <= 1));
      if (exit && R.guarded.length < 1) { g.raidGuard(exit.id); continue; }
      const cand = b.rooms.filter((r) => r.kind !== 'treppe' && !R.searched.some((x) => x.room === r.id && x.turn === R.turn));
      cand.sort((a, c) => (hintFloor === null ? 0 : Math.abs(a.floor - hintFloor) - Math.abs(c.floor - hintFloor)) + (g.rnd() - 0.5));
      const room = cand[0]; if (!room) break;
      g.raidSearch(room.id);
      if (g.fugitiveInRaid() && g.fugitive.hidden!.room === room.id && g.rnd() < findP) { g.raidCatch(); break; }
      if (g.raidRoomHasTrail(room.id)) g.raidClue();
      g.raidLeaveRoom();
    }
    if (R.ended) break;
    g.raidEndTurn();
  }
  g.addLog(`Polizei-Durchsuchung in ${b.name}: ${R.log.slice(0, 3).reverse().join(' · ')}`, R.ended === 'caught' ? 'bad' : 'info');
  g.raidClose();
}
