import type { CaseDef, CardDef, Chapter, Contact } from '../cases/types';
import type { Annotation, BoardCard, CityMap, HiddenItem, LogEntry, MoveOption, SearchArea, Trace, Unit } from './types';
import { CityGraph, TAXI_MIN, UNIT_REACH } from './graph';
import { dist, project } from './geo';
import { Rng } from './rng';
import { aiChooseMove } from './ai';
import { detectiveAiTurn, updateBeliefAfterMove, updateBeliefAfterUnits } from './detectiveAi';

/** solo = Ermittler gegen KI-Flüchtigen · fugitive = Flüchtiger gegen KI-Ermittler · hotseat = 2 Spieler */
export type GameMode = 'solo' | 'hotseat' | 'fugitive';
export type Phase = 'chapter-intro' | 'handover-fugitive' | 'fugitive' | 'handover-detective' | 'detective' | 'over';
export type Sfx = 'click' | 'pin' | 'thread' | 'snap' | 'found' | 'phone' | 'answer' | 'radio' | 'trace' | 'siren' | 'fail' | 'warrant' | 'move' | 'chapter';

export const AP_PER_ROUND = 2;
export type AiLevel = 'leicht' | 'normal' | 'schwer';
export interface GameOptions { police: AiLevel; fugitive: AiLevel }
export const HELI_RADIUS = 500;
export const ACTION_COST = { search: 1, roadblock: 1, observe: 1, heli: 2 } as const;
export const SEARCH_RADIUS = 220;
const UNIT_COLORS = ['#38bdf8', '#a3e635', '#f472b6', '#fbbf24'];

export interface FugitiveStep { round: number; node: number; mode: MoveOption['mode']; route?: string }
export interface GameResult { winner: 'detectives' | 'fugitive'; reason: string; final: boolean }

export class Game {
  graph: CityGraph;
  rng: Rng;
  chapterIdx = 0;
  round = 1;
  phase: Phase = 'chapter-intro';
  ap = AP_PER_ROUND;
  fugitive = { node: 0, taxis: 3, path: [] as FugitiveStep[], movesLeft: 1, disguise: 0, gadgets: { disguise: 1, decoy: 1 }, decoyArmed: false };
  roadblocks: { node: number; round: number }[] = [];
  observed: number[] = [];
  resolved: string[] = [];
  opts: GameOptions = { police: 'normal', fugitive: 'normal' };
  units: Unit[];
  traces: Trace[] = [];
  annotations: Annotation[] = [];
  searchAreas: SearchArea[] = [];
  items: HiddenItem[] = [];
  board = new Map<string, BoardCard>();
  threads: [string, string][] = [];
  cleared = new Set<string>();
  marked = new Set<string>();
  warrant: string | null = null;
  asked: string[] = [];
  callActive = new Map<string, number>();
  log: LogEntry[] = [];
  result: GameResult | null = null;
  /** mögliche Aufenthaltsorte des Flüchtigen aus Sicht der KI-Ermittler */
  belief: number[] = [];
  aiWarrantRound = 99;
  chapterSnapshot: string | null = null;
  stats = { arrests: 0, wrongWarrants: 0, threads: 0, wrongThreads: 0, hints: 0, wrongPresent: 0, roundsUsed: 0, tracesLeft: 0, startedAt: Date.now() };
  cards: Record<string, CardDef>;
  lastEvent: { text: string; kind: 'good' | 'bad' | 'info' } | null = null;
  sfx: (s: Sfx) => void = () => {};
  private listeners = new Set<() => void>();
  private nextId = 1;

  constructor(public map: CityMap, public def: CaseDef, public mode: GameMode, public seed = (Date.now() & 0xffffff) + 1, opts?: Partial<GameOptions>) {
    this.rng = new Rng(seed);
    this.opts = { ...this.opts, ...opts };
    const places = Object.entries(def.places).map(([key, p]) => { const [x, y] = project(map, p.lon, p.lat); return { key, name: p.name, x, y }; });
    this.graph = new CityGraph(map, places, seed);
    this.cards = { ...def.cards };
    for (const s of def.suspects)
      this.cards['dossier_' + s.id] = { kind: 'dossier', title: s.name, text: `${s.age} J. · ${s.job}\nGröße ${s.height} · Schuhgr. ${s.shoe} · ${s.smoker}${s.extra ? '\n' + s.extra : ''}\n${s.notes}` };
    for (const ch of def.chapters) this.graph.nodes[this.placeNode(ch.start)].camera = true;
    const used = new Set<number>();
    this.units = def.units.map((u, i) => {
      const [x, y] = project(map, u.lon, u.lat);
      const node = this.graph.nearest(x, y, (k) => !used.has(k) && this.graph.nodes[k].kind === 'station');
      used.add(node);
      return { id: 'u' + i, name: 'Einheit ' + u.name, short: u.name[0], color: UNIT_COLORS[i % 4], node, moved: false };
    });
    this.addLog('Fall eröffnet: ' + def.title, 'info');
    this.startChapter(0);
  }

  get chapter(): Chapter { return this.def.chapters[this.chapterIdx]; }
  get culprit() { return this.def.suspects.find((s) => s.id === this.chapter.culprit)!; }
  get isLastChapter() { return this.chapterIdx >= this.def.chapters.length - 1; }
  rnd = () => this.rng.next();
  placeNode(key: string) { return this.graph.placeIndex.get(key)!; }
  escapeNodes(): number[] { return this.chapter.escape ? this.chapter.escape.places.map((p) => this.placeNode(p)) : []; }
  ambushTarget(): number | null { return this.chapter.ambush ? this.placeNode(this.chapter.ambush.target) : null; }
  ambushCandidates(): number[] { return this.chapter.ambush ? this.chapter.ambush.candidates.map((p) => this.placeNode(p)) : []; }

  subscribe(f: () => void) { this.listeners.add(f); return () => this.listeners.delete(f); }
  emit() { this.listeners.forEach((f) => f()); }
  addLog(text: string, kind: LogEntry['kind'] = 'info') { this.log.unshift({ round: this.round, text, kind }); if (this.log.length > 80) this.log.length = 80; }
  notify(text: string, kind: 'good' | 'bad' | 'info' = 'info') { this.lastEvent = { text, kind }; this.addLog(text, kind); }
  private addTrace(t: Omit<Trace, 'id'>) { this.traces.push({ ...t, id: this.nextId++ }); }

  // ---------------- Akte ----------------
  startChapter(i: number) {
    this.chapterIdx = i;
    const ch = this.chapter;
    this.round = 1; this.ap = AP_PER_ROUND; this.warrant = null; this.result = null;
    this.traces = []; this.searchAreas = []; this.items = []; this.marked.clear(); this.cleared.clear(); this.callActive.clear();
    this.units.forEach((u) => (u.moved = false));
    const start = this.placeNode(ch.start);
    // Einheiten dürfen nicht auf dem Startpunkt stehen
    for (const u of this.units) if (u.node === start || dist(this.graph.nodes[u.node].x, this.graph.nodes[u.node].y, this.graph.nodes[start].x, this.graph.nodes[start].y) < 500) {
      const occ = new Set(this.units.map((x) => x.node));
      const sn = this.graph.nodes[start];
      u.node = this.graph.nearest(sn.x + 1400, sn.y + 900, (k) => !occ.has(k) && this.graph.nodes[k].kind === 'station');
    }
    this.fugitive = { node: start, taxis: ch.taxis, path: [{ round: 0, node: start, mode: 'stay' }], movesLeft: 1 + (ch.headStart ?? 0), disguise: 0, gadgets: { disguise: ch.tutorial ? 0 : 1, decoy: ch.tutorial ? 0 : 1 }, decoyArmed: false };
    this.roadblocks = []; this.observed = [];
    const sn = this.graph.nodes[start];
    this.addTrace({ round: 0, kind: 'start', x: sn.x, y: sn.y, text: (i === 0 ? 'Tatort: ' : 'Ausgangspunkt: ') + sn.name, tag: i === 0 ? 'TATORT' : 'START' });
    for (const p of ch.searchAt ?? [ch.start]) { const n = this.graph.nodes[this.placeNode(p)]; this.searchAreas.push({ x: n.x, y: n.y, r: 160, round: 0 }); }
    for (const it of ch.sceneItems) {
      const n = this.graph.nodes[this.placeNode(it.place)];
      this.items.push({ id: 'scene-' + it.cardId, x: n.x + it.dx, y: n.y + it.dy, icon: it.icon, title: this.cards[it.cardId].title, cardId: it.cardId, found: this.board.has(it.cardId) });
    }
    for (const id of ch.startCards) this.placeCard(id);
    for (const s of this.def.suspects) if ((s.chapter ?? 0) === i) this.placeCard('dossier_' + s.id);
    this.belief = [start];
    this.aiWarrantRound = (this.opts.police === 'leicht' ? 6 : this.opts.police === 'schwer' ? 2 : 3) + this.rng.int(3);
    this.phase = 'chapter-intro';
    this.chapterSnapshot = null;
    this.chapterSnapshot = this.serialize();
  }

  /** Nach dem Akt-Intro: Flucht beginnt */
  beginChapter() {
    if (this.phase !== 'chapter-intro') return;
    this.addLog(`Akt ${this.chapterIdx + 1}: ${this.chapter.title}`, 'info');
    this.sfx('chapter');
    this.toFugitivePhase();
  }

  nextChapter() {
    if (!this.result || this.result.winner !== 'detectives' || this.result.final) return;
    this.startChapter(this.chapterIdx + 1);
    this.emit();
  }

  private toFugitivePhase() {
    if (this.mode === 'solo') { this.phase = 'fugitive'; this.runAi(); }
    else if (this.mode === 'hotseat') { this.phase = 'handover-fugitive'; this.emit(); }
    else { this.phase = 'fugitive'; this.emit(); }
  }

  // ---------------- Flüchtiger ----------------
  blockedForFugitive() {
    const b = new Set(this.units.map((u) => u.node));
    for (const r of this.roadblocks) if (r.round === this.round - 1) b.add(r.node);
    const t = this.ambushTarget(); if (t !== null) b.delete(t); // getarnte Observation am Ziel
    return b;
  }
  fugitiveOptions() {
    const o = this.graph.fugitiveOptions(this.fugitive.node, this.fugitive.taxis, this.blockedForFugitive());
    return this.chapter.tutorial ? o.filter((x) => x.mode === 'foot' || x.mode === 'stay') : o;
  }
  activeRoadblocks() { return this.roadblocks.filter((r) => r.round >= this.round - (this.phase === 'detective' ? 0 : 1)); }

  // Hilfsmittel des Flüchtigen
  useDisguise() { if (this.phase !== 'fugitive' || this.fugitive.gadgets.disguise <= 0) return; this.fugitive.gadgets.disguise--; this.fugitive.disguise = 2; this.sfx('click'); this.emit(); }
  armDecoy() { if (this.phase !== 'fugitive' || this.fugitive.gadgets.decoy <= 0) return; this.fugitive.gadgets.decoy--; this.fugitive.decoyArmed = true; this.sfx('click'); this.emit(); }

  private runAi() {
    while (this.phase === 'fugitive') this.applyFugitiveMove(aiChooseMove(this));
  }

  beginFugitiveTurn() { if (this.phase === 'handover-fugitive') { this.phase = 'fugitive'; this.emit(); } }
  beginDetectiveTurn() { if (this.phase === 'handover-detective') { this.phase = 'detective'; this.emit(); } }

  applyFugitiveMove(opt: MoveOption) {
    if (this.phase !== 'fugitive') return;
    const G = this.graph; const from = this.fugitive.node; const to = opt.to;
    const A = G.nodes[from], B = G.nodes[to];
    if (opt.mode === 'taxi' && this.fugitive.taxis <= 0) return;
    this.fugitive.node = to;
    this.fugitive.path.push({ round: this.round, node: to, mode: opt.mode, route: opt.route });
    const r = this.round;
    const camChance = this.fugitive.disguise > 0 ? 0 : this.chapter.tutorial ? 1 : this.warrant ? 0.85 : 0.5;
    const fresh: Trace[] = [];
    const tr = (t: Omit<Trace, 'id'>) => { this.addTrace(t); fresh.push(this.traces[this.traces.length - 1]); };
    if (opt.mode === 'subway') tr({ round: r, kind: 'metrocard', x: A.x, y: A.y, node: from, route: opt.route, text: `Fahrkarte entwertet: ${A.name}, Linie ${opt.route}` });
    else if (opt.mode === 'taxi') {
      this.fugitive.taxis--;
      const ang = this.rnd() * Math.PI * 2, off = this.rnd() * 380;
      tr({ round: r, kind: 'taxi', x: B.x + Math.cos(ang) * off, y: B.y + Math.sin(ang) * off, r: 520, text: 'Taxifahrt, bar bezahlt: Das Ziel ist ungefähr bekannt' });
    }
    else if (opt.mode === 'bike') tr({ round: r, kind: 'bike', x: A.x, y: A.y, node: from, text: `Leihrad ausgeliehen: ${A.name}` });
    if (this.fugitive.decoyArmed) {
      this.fugitive.decoyArmed = false;
      const cands = G.nodes.map((n, i) => i).filter((i) => G.nodes[i].kind === 'station' && G.sub[i].length && Math.hypot(G.nodes[i].x - B.x, G.nodes[i].y - B.y) > 900 && Math.hypot(G.nodes[i].x - B.x, G.nodes[i].y - B.y) < 2800);
      if (cands.length) {
        const fn = cands[Math.floor(this.rnd() * cands.length)]; const F = G.nodes[fn];
        const route = G.sub[fn][0].routes[0];
        this.addTrace({ round: r, kind: 'metrocard', x: F.x, y: F.y, node: fn, route, fake: true, text: `Fahrkarte entwertet: ${F.name}, Linie ${route}` });
        fresh.push(this.traces[this.traces.length - 1]);
      }
    }
    if (this.observed.includes(to) && this.fugitive.disguise <= 0) tr({ round: r, kind: 'cctv', x: B.x, y: B.y, node: to, text: `Observation meldet Zielperson: ${B.name}` });
    else if (opt.mode !== 'stay' && B.camera && this.rnd() < camChance) tr({ round: r, kind: 'cctv', x: B.x, y: B.y, node: to, text: `Kamera-Treffer: ${B.name}` });
    if (opt.mode !== 'stay' && this.rnd() < 0.4) {
      const d = this.def.dropItems[Math.floor(this.rnd() * this.def.dropItems.length)];
      const ang = this.rnd() * Math.PI * 2, off = 25 + this.rnd() * 70;
      this.items.push({ id: 'drop' + this.nextId++, x: A.x + Math.cos(ang) * off, y: A.y + Math.sin(ang) * off, icon: d.icon, title: d.title, round: r - 1, found: false });
    }
    this.fugitive.movesLeft--;
    const done = this.fugitive.movesLeft <= 0;
    if (done && this.fugitive.disguise > 0) this.fugitive.disguise--;
    if (done && this.chapter.pingRounds.includes(r)) {
      const ang = this.rnd() * Math.PI * 2, off = this.rnd() * 520;
      tr({ round: r, kind: 'ping', x: B.x + Math.cos(ang) * off, y: B.y + Math.sin(ang) * off, r: 700, text: 'Funkzelle: Ein Prepaid-Handy hat sich eingewählt' });
    }
    this.stats.tracesLeft += fresh.length;
    updateBeliefAfterMove(this, fresh);
    this.sfx('move');
    // Hinterhalt: Der Täter erreicht sein Ziel
    const amb = this.chapter.ambush;
    if (amb && to === this.placeNode(amb.target)) {
      const guard = this.units.find((u) => u.node === to);
      if (guard) {
        this.stats.arrests++; this.stats.roundsUsed += r;
        this.result = { winner: 'detectives', reason: `${guard.name} hat ${this.culprit.name} bei ${B.name} auf frischer Tat ertappt.`, final: this.isLastChapter };
        this.phase = 'over'; this.sfx('siren'); this.emit(); return;
      }
      if (r >= amb.fromRound) {
        this.stats.roundsUsed += r;
        this.result = { winner: 'fugitive', reason: `${this.culprit.name} hat bei ${B.name} zugeschlagen und ist mit der Beute verschwunden. Niemand hat dort gewartet.`, final: true };
        this.phase = 'over'; this.sfx('fail'); this.emit(); return;
      }
    }
    // Flucht über einen Ausgang?
    const ex = this.chapter.escape;
    if (ex && r >= ex.fromRound && this.escapeNodes().includes(to)) {
      this.stats.roundsUsed += r;
      this.result = { winner: 'fugitive', reason: `${this.culprit.name} hat sich über ${B.name} abgesetzt. Die Spur verliert sich.`, final: true };
      this.phase = 'over'; this.sfx('fail'); this.emit(); return;
    }
    if (!done) { this.emit(); return; }
    for (const t of this.chapter.timed) if (t.round <= r && (!t.needs || this.board.has(t.needs)) && !this.board.has(t.card)) { this.placeCard(t.card); this.notify('Neue Unterlagen: ' + this.cards[t.card].title, 'info'); }
    if (this.mode === 'fugitive') {
      this.phase = 'detective';
      detectiveAiTurn(this);
      if (this.phase === 'detective') this.endDetectiveTurn();
      else this.emit();
      return;
    }
    this.phase = this.mode === 'hotseat' ? 'handover-detective' : 'detective';
    if (fresh.length) this.sfx('trace');
    this.emit();
  }

  // ---------------- Ermittler ----------------
  unitReach(i: number): number[] {
    const u = this.units[i]; if (u.moved) return [];
    const occ = new Set(this.units.map((x) => x.node));
    return this.graph.unitReachList[u.node].filter((n) => !occ.has(n));
  }

  moveUnit(i: number, node: number) {
    if (this.phase !== 'detective') return;
    const u = this.units[i];
    if (u.moved || !this.unitReach(i).includes(node)) return;
    u.node = node; u.moved = true;
    this.sfx('radio');
    this.checkContact(u);
    this.emit();
  }

  checkAllContacts() { for (const u of this.units) if (this.phase !== 'over') this.checkContact(u, true); }

  private checkContact(u: Unit, quiet = false) {
    if (u.node !== this.fugitive.node || this.phase === 'over') return;
    const nd = this.graph.nodes[u.node];
    if (this.warrant === this.chapter.culprit) {
      this.stats.arrests++;
      this.stats.roundsUsed += this.round;
      const final = this.isLastChapter;
      this.result = { winner: 'detectives', reason: `${u.name} hat ${this.culprit.name} bei ${nd.name} festgenommen.`, final };
      this.phase = 'over';
      this.sfx('siren');
    } else if (!quiet) {
      this.addTrace({ round: this.round, kind: 'sighting', x: nd.x, y: nd.y, node: u.node, text: `${u.name}: Sichtkontakt bei ${nd.name}` });
      this.belief = [u.node];
      this.notify(`${u.name} sieht bei ${nd.name} eine Person, die zur Beschreibung passt. Ohne gültigen Haftbefehl ist keine Festnahme möglich.`, 'bad');
      this.sfx('trace');
    }
  }

  canSpend(n = 1) { return this.phase === 'detective' && this.ap >= n; }

  placeSearch(x: number, y: number) {
    if (!this.canSpend()) return false;
    this.ap--;
    this.searchAreas.push({ x, y, r: SEARCH_RADIUS, round: this.round });
    if (this.mode !== 'fugitive') this.notify('Suchgebiet eingerichtet. Zoomen Sie hinein und suchen Sie nach Auffälligkeiten.', 'info');
    this.sfx('radio');
    this.emit();
    return true;
  }

  placeRoadblock(node: number) {
    if (!this.canSpend(ACTION_COST.roadblock) || this.roadblocks.some((r) => r.node === node && r.round === this.round)) return false;
    this.ap -= ACTION_COST.roadblock;
    this.roadblocks.push({ node, round: this.round });
    if (this.mode !== 'fugitive') this.notify(`Straßensperre bei ${this.graph.nodes[node].name}: Der Flüchtige kommt in der nächsten Runde dort nicht durch.`, 'info');
    this.sfx('radio'); this.emit(); return true;
  }

  placeObservation(node: number) {
    if (!this.canSpend(ACTION_COST.observe) || this.observed.includes(node)) return false;
    this.ap -= ACTION_COST.observe;
    this.observed.push(node);
    if (this.mode !== 'fugitive') this.notify(`Observation eingerichtet: ${this.graph.nodes[node].name} wird ab jetzt dauerhaft überwacht.`, 'info');
    this.sfx('radio'); this.emit(); return true;
  }

  heliScan(x: number, y: number) {
    if (!this.canSpend(ACTION_COST.heli)) return false;
    this.ap -= ACTION_COST.heli;
    const F = this.graph.nodes[this.fugitive.node];
    if (dist(F.x, F.y, x, y) <= HELI_RADIUS && this.fugitive.disguise <= 0) {
      this.addTrace({ round: this.round, kind: 'heli', x: F.x, y: F.y, node: this.fugitive.node, text: `Hubschrauber: Wärmebild erfasst Zielperson bei ${F.name}` });
      this.belief = [this.fugitive.node];
      this.notify(`Treffer! Der Hubschrauber hat die Zielperson bei ${F.name} erfasst.`, 'good');
    } else {
      this.addTrace({ round: this.round, kind: 'clear', x, y, r: HELI_RADIUS, text: 'Hubschrauber: In diesem Gebiet kein Treffer' });
      this.belief = this.belief.filter((i) => dist(this.graph.nodes[i].x, this.graph.nodes[i].y, x, y) > HELI_RADIUS);
      if (this.mode !== 'fugitive') this.notify('Der Hubschrauber findet in diesem Gebiet niemanden.', 'info');
    }
    this.sfx('radio'); this.emit(); return true;
  }

  isSearched(x: number, y: number) { return this.searchAreas.some((s) => dist(s.x, s.y, x, y) <= s.r); }

  collectItem(id: string, silent = false) {
    const it = this.items.find((i) => i.id === id);
    if (!it || it.found || !this.isSearched(it.x, it.y)) return;
    it.found = true;
    if (it.cardId) { this.placeCard(it.cardId); if (!silent) this.notify(`Fundstück gesichert: ${it.title}. Es hängt jetzt an der Pinnwand.`, 'good'); }
    else {
      this.addTrace({ round: it.round ?? 0, kind: 'item', x: it.x, y: it.y, text: `Fundstück: ${it.title} (aus Runde ${it.round})` });
      if (!silent) this.notify(`Fundstück: ${it.title}. Die Spurensicherung ordnet es dem Flüchtigen zu, er war in Runde ${it.round} hier.`, 'good');
    }
    if (!silent) this.sfx('found');
    this.emit();
  }

  // ---------------- Pinnwand ----------------
  placeCard(id: string, near?: [number, number]) {
    if (this.board.has(id)) return;
    const [x, y] = this.freeSpot(near ? near[0] : 40, near ? near[1] + 120 : 40);
    this.board.set(id, { id, x, y, isNew: true });
  }

  /** Nächster freier Platz auf der Pinnwand (Karten ca. 200 × 230 px) */
  private freeSpot(px: number, py: number): [number, number] {
    const cards = [...this.board.values()];
    const free = (x: number, y: number) => cards.every((c) => Math.abs(c.x - x) > 210 || Math.abs(c.y - y) > 240);
    let best: [number, number] = [px, py], bd = Infinity;
    for (let gx = 0; gx < 11; gx++) for (let gy = 0; gy < 9; gy++) {
      const x = 40 + gx * 230, y = 40 + gy * 250;
      if (!free(x, y)) continue;
      const d = Math.hypot(x - px, (y - py) * 1.3);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    return [best[0] + (this.rnd() - 0.5) * 16, best[1] + (this.rnd() - 0.5) * 16];
  }

  tryConnect(a: string, b: string): 'ok' | 'wrong' | 'known' {
    if (a === b) return 'wrong';
    if (this.threads.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) return 'known';
    const c = this.def.combos.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
    if (!c) { this.stats.wrongThreads++; this.sfx('snap'); return 'wrong'; }
    this.threads.push([a, b]);
    this.stats.threads++;
    const A = this.board.get(a)!, B = this.board.get(b)!;
    const fresh = !this.board.has(c.result);
    this.placeCard(c.result, [(A.x + B.x) / 2, Math.max(A.y, B.y)]);
    this.threads.push([a, c.result], [b, c.result]);
    const card = this.cards[c.result];
    if (card.clears) this.cleared.add(card.clears);
    if (fresh) this.notify('Neue Erkenntnis: ' + card.title, 'good');
    this.sfx('thread');
    this.emit();
    return 'ok';
  }

  toggleCleared(id: string) { this.cleared.has(id) ? this.cleared.delete(id) : this.cleared.add(id); this.emit(); }
  toggleMark(id: string) { this.marked.has(id) ? this.marked.delete(id) : this.marked.add(id); this.emit(); }

  warrantCandidates() { return this.chapter.candidates.map((id) => this.def.suspects.find((s) => s.id === id)!).filter((s) => !this.cleared.has(s.id)); }

  requestWarrant(id: string) {
    if (this.phase !== 'detective' || this.warrant) return;
    const s = this.def.suspects.find((x) => x.id === id)!;
    if (id === this.chapter.culprit) {
      this.warrant = id;
      this.notify(`Der Richter unterschreibt den Haftbefehl gegen ${s.name}. Das Fahndungsfoto ist an alle Kameras verteilt.`, 'good');
      this.sfx('warrant');
      for (const u of this.units) if (u.node === this.fugitive.node) { this.checkContact(u); break; }
    } else {
      this.cleared.add(id);
      this.stats.wrongWarrants++;
      this.round += 2;
      this.notify(`Der Haftbefehl gegen ${s.name} wird abgelehnt, die Beweise reichen nicht. Sie verlieren 2 Runden.`, 'bad');
      this.sfx('fail');
      if (this.round > this.chapter.maxRounds) this.finishFugitiveWin();
    }
    this.emit();
  }

  // ---------------- Verhöre ----------------
  contactVisible(c: Contact) {
    if ((c.fromChapter ?? 0) > this.chapterIdx) return false;
    if (c.untilChapter !== undefined && this.chapterIdx > c.untilChapter) return false;
    return !c.unlockedBy || c.unlockedBy.some((k) => this.board.has(k));
  }
  contactUnlocked(c: Contact) { return this.contactVisible(c); }
  visibleQuestions(c: Contact) { return c.questions.filter((q) => (q.fromChapter ?? 0) <= this.chapterIdx); }
  unitAtPlace(c: Contact) {
    if (c.custody) return { name: 'Verhörraum im Revier' } as Unit;
    const n = this.graph.placeIndex.get(c.place); return this.units.find((u) => u.node === n) ?? null;
  }
  callIsActive(c: Contact) { return this.callActive.get(c.id) === this.round; }
  startCall(c: Contact) {
    if (this.callIsActive(c)) return true;
    if (!this.canSpend()) return false;
    this.ap--; this.callActive.set(c.id, this.round); this.sfx('phone'); this.emit(); return true;
  }
  isAsked(c: Contact, qId: string) { return this.asked.includes(c.id + '.' + qId); }
  ask(c: Contact, qId: string, mode: 'phone' | 'person') {
    const q = c.questions.find((q) => q.id === qId)!;
    const key = c.id + '.' + q.id;
    if (this.asked.includes(key) || this.phase !== 'detective') return;
    if (mode === 'phone' && (!this.callIsActive(c) || q.mode === 'person')) return;
    if (mode === 'person' && !this.unitAtPlace(c)) return;
    if (q.requires && !this.board.has(q.requires)) return;
    this.asked.push(key);
    this.sfx('answer');
    for (const g of q.gives ?? []) if (!this.board.has(g)) { this.placeCard(g); this.notify(`Neu an der Pinnwand: ${this.cards[g].title}`, 'good'); }
    this.emit();
  }

  /** Beweisstück vorlegen, um eine Lüge zu entlarven. Liefert die neue Antwort oder null. */
  present(c: Contact, cardId: string): string | null {
    if (this.phase !== 'detective' || !this.unitAtPlace(c)) return null;
    for (const q of this.visibleQuestions(c)) {
      const key = c.id + '.' + q.id;
      if (!q.contradiction || !this.asked.includes(key) || this.resolved.includes(key)) continue;
      if (q.contradiction.card !== cardId) continue;
      this.resolved.push(key);
      this.sfx('thread');
      for (const g of q.contradiction.gives ?? []) if (!this.board.has(g)) { this.placeCard(g); this.notify(`Widerspruch aufgedeckt! Neu an der Pinnwand: ${this.cards[g].title}`, 'good'); }
      this.emit();
      return q.contradiction.answer;
    }
    this.stats.wrongPresent++;
    this.sfx('snap');
    this.emit();
    return null;
  }
  openLies(c: Contact) { return this.visibleQuestions(c).filter((q) => q.contradiction && this.asked.includes(c.id + '.' + q.id) && !this.resolved.includes(c.id + '.' + q.id)); }

  // ---------------- Annotationen ----------------
  addAnnotation(a: Omit<Annotation, 'id'>) { this.annotations.push({ ...a, id: this.nextId++ }); this.sfx('pin'); this.emit(); }
  removeAnnotation(id: number) { this.annotations = this.annotations.filter((a) => a.id !== id); this.emit(); }

  endDetectiveTurn() {
    if (this.phase !== 'detective') return;
    updateBeliefAfterUnits(this);
    this.round++;
    if (this.round > this.chapter.maxRounds) { this.finishFugitiveWin(); this.emit(); return; }
    this.ap = AP_PER_ROUND;
    this.units.forEach((u) => (u.moved = false));
    this.board.forEach((c) => (c.isNew = false));
    this.fugitive.movesLeft = 1;
    this.toFugitivePhase();
  }

  private finishFugitiveWin() {
    this.stats.roundsUsed += Math.min(this.round, this.chapter.maxRounds);
    this.result = { winner: 'fugitive', reason: `${this.culprit.name} ist entkommen. Die Zeit ist abgelaufen, und die Spur ist kalt.`, final: true };
    this.phase = 'over';
    this.sfx('fail');
  }

  unitReachMeters() { return UNIT_REACH; }
  taxiMin() { return TAXI_MIN; }

  // ---------------- Speichern ----------------
  serialize(): string {
    return JSON.stringify({
      v: 1, seed: this.seed, mode: this.mode, rng: this.rng.s, chapterIdx: this.chapterIdx, round: this.round, phase: this.phase, ap: this.ap,
      fugitive: this.fugitive, units: this.units, traces: this.traces, annotations: this.annotations, searchAreas: this.searchAreas, items: this.items,
      board: [...this.board.values()], threads: this.threads, cleared: [...this.cleared], marked: [...this.marked], warrant: this.warrant,
      asked: this.asked, callActive: [...this.callActive], log: this.log, result: this.result, belief: this.belief, aiWarrantRound: this.aiWarrantRound,
      chapterSnapshot: this.chapterSnapshot, stats: this.stats, nextId: this.nextId, roadblocks: this.roadblocks, observed: this.observed, resolved: this.resolved, opts: this.opts,
    });
  }

  static restore(map: CityMap, def: CaseDef, json: string): Game {
    const d = JSON.parse(json);
    const g = new Game(map, def, d.mode, d.seed, d.opts);
    g.rng.s = d.rng; g.chapterIdx = d.chapterIdx; g.round = d.round; g.phase = d.phase; g.ap = d.ap;
    g.fugitive = d.fugitive; g.units = d.units; g.traces = d.traces; g.annotations = d.annotations; g.searchAreas = d.searchAreas; g.items = d.items;
    g.board = new Map((d.board as BoardCard[]).map((c) => [c.id, c])); g.threads = d.threads; g.cleared = new Set(d.cleared); g.marked = new Set(d.marked);
    g.warrant = d.warrant; g.asked = d.asked; g.callActive = new Map(d.callActive); g.log = d.log; g.result = d.result; g.belief = d.belief;
    // Hotseat: nach dem Laden nicht direkt die Sicht des Flüchtigen zeigen
    if (g.mode === 'hotseat' && g.phase === 'fugitive') g.phase = 'handover-fugitive';
    g.aiWarrantRound = d.aiWarrantRound; g.chapterSnapshot = d.chapterSnapshot ?? (d.phase === 'chapter-intro' ? json : null); g.stats = { ...g.stats, ...d.stats }; g.nextId = d.nextId;
    g.roadblocks = d.roadblocks ?? []; g.observed = d.observed ?? []; g.resolved = d.resolved ?? [];
    g.fugitive = { disguise: 0, gadgets: { disguise: 0, decoy: 0 }, decoyArmed: false, ...d.fugitive };
    return g;
  }
}
