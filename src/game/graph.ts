import type { CityMap, GNode, MoveOption } from './types';
import { dist, pointInRings } from './geo';
import { mulberry32 } from './rng';


export interface PlaceInput { key: string; name: string; x: number; y: number }

export const UNIT_REACH = 1500; // Meter pro Runde (Streifenwagen)
export const TAXI_MIN = 700, TAXI_MAX = 2600;
export const SUBWAY_MAX_STOPS = 4;

export class CityGraph {
  nodes: GNode[] = [];
  walk: number[][] = [];
  sub: { to: number; routes: string }[][] = [];
  placeIndex = new Map<string, number>();
  /** Runden, die eine Einheit von i nach j braucht */
  unitDist: number[][] = [];

  constructor(map: CityMap, places: PlaceInput[], seed: number) {
    const rnd = mulberry32(seed ^ 0x5eed);
    const gameLand = map.land.filter((l) => l.name === 'Manhattan').flatMap((l) => l.rings);
    const stMap = new Map<number, number>();
    map.stations.forEach((s, i) => {
      if (!s.game) return;
      stMap.set(i, this.nodes.length);
      this.nodes.push({ id: s.id, name: s.name, x: s.x, y: s.y, kind: 'station', routes: s.routes, camera: false });
    });
    for (const p of places) {
      this.placeIndex.set(p.key, this.nodes.length);
      this.nodes.push({ id: 'poi-' + p.key, name: p.name, x: p.x, y: p.y, kind: 'poi', routes: [], camera: false });
    }
    const n = this.nodes.length;
    for (const nd of this.nodes) nd.camera = rnd() < 0.38;
    this.walk = Array.from({ length: n }, () => []);
    this.sub = Array.from({ length: n }, () => []);

    // Fußwege: Gabriel-Graph (nur über Land, max. 1200 m)
    const N = this.nodes;
    const onLand = (x: number, y: number) => pointInRings(gameLand, x, y);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const d = dist(N[i].x, N[i].y, N[j].x, N[j].y);
        if (d > 1200) continue;
        const mx = (N[i].x + N[j].x) / 2, my = (N[i].y + N[j].y) / 2;
        let ok = true;
        for (let k = 0; k < n && ok; k++) if (k !== i && k !== j && dist(N[k].x, N[k].y, mx, my) < d / 2) ok = false;
        if (!ok) continue;
        if (![0.25, 0.5, 0.75].every((t) => onLand(N[i].x + (N[j].x - N[i].x) * t, N[i].y + (N[j].y - N[i].y) * t))) continue;
        this.walk[i].push(j); this.walk[j].push(i);
      }
    // Zusammenhang sicherstellen
    const comp = () => {
      const c = new Array(n).fill(-1); let id = 0;
      for (let s = 0; s < n; s++) {
        if (c[s] >= 0) continue;
        const st = [s]; c[s] = id;
        while (st.length) { const v = st.pop()!; for (const w of this.walk[v]) if (c[w] < 0) { c[w] = id; st.push(w); } }
        id++;
      }
      return { c, id };
    };
    for (let guard = 0; guard < 50; guard++) {
      const { c, id } = comp(); if (id <= 1) break;
      let best = [0, 0, Infinity];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (c[i] === 0 && c[j] !== 0) {
        const d = dist(N[i].x, N[i].y, N[j].x, N[j].y); if (d < best[2]) best = [i, j, d];
      }
      this.walk[best[0]].push(best[1]); this.walk[best[1]].push(best[0]);
    }

    for (const [a, b, routes] of map.subwayEdges) {
      const A = stMap.get(a), B = stMap.get(b);
      if (A === undefined || B === undefined) continue;
      this.sub[A].push({ to: B, routes }); this.sub[B].push({ to: A, routes });
    }

    // Erreichbarkeit der Einheiten
    const reach: number[][] = Array.from({ length: n }, (_, i) => {
      const r: number[] = [];
      for (let j = 0; j < n; j++) if (j !== i && dist(N[i].x, N[i].y, N[j].x, N[j].y) <= UNIT_REACH) r.push(j);
      return r;
    });
    this.unitReachList = reach;
    this.unitDist = Array.from({ length: n }, (_, s) => {
      const d = new Array(n).fill(99); d[s] = 0; const q = [s];
      for (let qi = 0; qi < q.length; qi++) { const v = q[qi]; for (const w of reach[v]) if (d[w] === 99) { d[w] = d[v] + 1; q.push(w); } }
      return d;
    });
  }
  unitReachList: number[][] = [];
  private hopCache = new Map<number, number[]>();
  /** Zugzahl des Flüchtigen (Fuß/U-Bahn-Kanten) von jedem Knoten zu Ziel t */
  fugHops(t: number): number[] {
    let d = this.hopCache.get(t);
    if (d) return d;
    const n = this.nodes.length; d = new Array(n).fill(99); d[t] = 0; const q = [t];
    for (let qi = 0; qi < q.length; qi++) {
      const v = q[qi];
      const nb = [...this.walk[v], ...this.sub[v].map((e) => e.to)];
      for (const w of nb) if (d[w] === 99) { d[w] = d[v] + 1; q.push(w); }
    }
    this.hopCache.set(t, d);
    return d;
  }
  /** Leihrad: alle Knoten in genau zwei Fußschritten */
  bikeTargets(v: number): number[] {
    const one = new Set(this.walk[v]); const res = new Set<number>();
    for (const a of one) for (const b of this.walk[a]) if (b !== v && !one.has(b)) res.add(b);
    return [...res];
  }
  /** Ziele einer U-Bahn-Fahrt von v auf Linie r (max. SUBWAY_MAX_STOPS) */
  subwayTargets(v: number, r: string): number[] {
    const depth = new Map<number, number>([[v, 0]]); const q = [v];
    for (let qi = 0; qi < q.length; qi++) {
      const x = q[qi]; const dx = depth.get(x)!;
      if (dx >= SUBWAY_MAX_STOPS) continue;
      for (const e of this.sub[x]) if (e.routes.includes(r) && !depth.has(e.to)) { depth.set(e.to, dx + 1); q.push(e.to); }
    }
    depth.delete(v);
    return [...depth.keys()];
  }

  nearest(x: number, y: number, filter?: (i: number) => boolean): number {
    let best = -1, bd = Infinity;
    this.nodes.forEach((nd, i) => { if (filter && !filter(i)) return; const d = dist(nd.x, nd.y, x, y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /** Alle Zugoptionen des Flüchtigen von Knoten v */
  fugitiveOptions(v: number, taxisLeft: number, blocked: Set<number>): MoveOption[] {
    const opts: MoveOption[] = [{ to: v, mode: 'stay' }];
    const seen = new Set<string>();
    const add = (o: MoveOption) => { const k = o.to + o.mode + (o.route ?? ''); if (blocked.has(o.to) || o.to === v || seen.has(k)) return; seen.add(k); opts.push(o); };
    for (const w of this.walk[v]) add({ to: w, mode: 'foot' });
    for (const w of this.bikeTargets(v)) add({ to: w, mode: 'bike' });
    if (this.nodes[v].kind === 'station') {
      const letters = new Set(this.sub[v].flatMap((e) => e.routes.split('')));
      for (const r of letters)
        for (const w of this.subwayTargets(v, r)) if (!opts.some((o) => o.to === w && o.mode === 'subway')) add({ to: w, mode: 'subway', route: r });
    }
    if (taxisLeft > 0) {
      const a = this.nodes[v];
      this.nodes.forEach((b, i) => { const d = dist(a.x, a.y, b.x, b.y); if (d >= TAXI_MIN && d <= TAXI_MAX) add({ to: i, mode: 'taxi' }); });
    }
    return opts;
  }
}
