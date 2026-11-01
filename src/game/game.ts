import type { CaseDef, CardDef, Chapter, Contact } from '../cases/types';
import type { Annotation, BoardCard, CityMap, HiddenItem, HiddenState, LogEntry, MoveOption, RaidState, SearchArea, Trace, Unit } from './types';
import { makeBuilding, roomNeighbors, type Building } from './building';
import { BASE_MODS, buildMods, PERKS, type Mods, type Side } from './progress';
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
export interface GameOptions { police: AiLevel; fugitive: AiLevel; talents?: Record<string, number>; side?: Side | null; heat?: number }
const LEVELS: AiLevel[] = ['leicht', 'normal', 'schwer'];
export const HELI_RADIUS = 500;
export const ACTION_COST = { search: 1, roadblock: 1, observe: 1, heli: 2, raid: 1 } as const;
export const RAID_TURNS = 4, RAID_ACTIONS = 3, RAID_LOOK_SECONDS = 25;
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
  fugitive = { node: 0, taxis: 3, path: [] as FugitiveStep[], movesLeft: 1, disguise: 0, gadgets: { disguise: 1, decoy: 1 }, decoyArmed: false, hidden: null as HiddenState | null };
  raid: RaidState | null = null;
  raidedThisRound: number[] = [];
  private buildingCache = new Map<number, Building>();
  roadblocks: { node: number; round: number }[] = [];
  observed: number[] = [];
  resolved: string[] = [];
  opts: GameOptions = { police: 'normal', fugitive: 'normal' };
  /** Roguelite: gewählte Einsatzkarten/Kniffe und aktuelle Auswahl */
  /** Optionen wie gewählt (vor Fahndungsdruck), für Speicherstände */
  rawOpts: GameOptions = { police: 'normal', fugitive: 'normal' };
  perks: string[] = [];
  draft: string[] = [];
  mods: Mods = { ...BASE_MODS };
  charges = { informant: 0, freeHeli: 0, freeObserve: 0, jammer: 0 };
  freeCallsUsed = 0;
  xpAwarded = false;
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
  stats = { arrests: 0, wrongWarrants: 0, threads: 0, wrongThreads: 0, hints: 0, wrongPresent: 0, roundsUsed: 0, tracesLeft: 0, raids: 0, buildingCaptures: 0, startedAt: Date.now() };
  cards: Record<string, CardDef>;
  lastEvent: { text: string; kind: 'good' | 'bad' | 'info' } | null = null;
  sfx: (s: Sfx) => void = () => {};
  private listeners = new Set<() => void>();
  private nextId = 1;

  constructor(public map: CityMap, public def: CaseDef, public mode: GameMode, public seed = (Date.now() & 0xffffff) + 1, opts?: Partial<GameOptions>) {
    this.rng = new Rng(seed);
    this.opts = { ...this.opts, ...opts };
    this.rawOpts = { ...this.opts };
    // Fahndungsdruck macht den Gegner stärker
    const heat = this.opts.heat ?? 0;
    const bump = (l: AiLevel) => LEVELS[Math.min(2, LEVELS.indexOf(l) + (heat >= 3 ? 2 : heat))];
    if (this.opts.side === 'det') this.opts.fugitive = bump(this.opts.fugitive);
    if (this.opts.side === 'fug') this.opts.police = bump(this.opts.police);
    this.mods = buildMods(this.opts.talents ?? {}, this.opts.side ?? null, []);
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
    for (let k = 0; k < this.mods.extraUnits; k++) {
      const occ = new Set(this.units.map((u) => u.node));
      const base = this.graph.nodes[this.units[0].node];
      const node = this.graph.nearest(base.x + 600, base.y - 600, (i) => !occ.has(i) && this.graph.nodes[i].kind === 'station');
      this.units.push({ id: 'u' + this.units.length, name: 'Einheit Echo', short: 'E', color: '#c084fc', node, moved: false });
    }
    this.graph.setUnitReach(UNIT_REACH + this.mods.unitReachBonus);
    this.addLog('Fall eröffnet: ' + def.title, 'info');
    this.startChapter(0);
  }

  get chapter(): Chapter { return this.def.chapters[this.chapterIdx]; }
  /** Rundenlimit des Akts (Fahndungsdruck verkürzt bzw. verlängert) */
  get maxRounds() {
    const heat = this.opts.heat ?? 0; const d = heat >= 3 ? 2 : heat >= 2 ? 1 : 0;
    return this.chapter.maxRounds + (this.opts.side === 'det' ? -d : this.opts.side === 'fug' ? d : 0);
  }
  get pingRounds() {
    const pr = this.chapter.pingRounds;
    return (this.opts.heat ?? 0) >= 3 && this.opts.side === 'det' ? pr.filter((_, i) => i % 2 === 0) : pr;
  }
  costOf(action: keyof typeof ACTION_COST) {
    if (action === 'heli' && this.charges.freeHeli > 0) return 0;
    if (action === 'observe' && this.charges.freeObserve > 0) return 0;
    return ACTION_COST[action];
  }
  apForRound(first: boolean) {
    return AP_PER_ROUND + (first ? this.mods.apFirstRound : 0) + (!first && this.mods.apEvery && this.round % this.mods.apEvery === 0 ? 1 : 0);
  }
  /** Aktuelle Werte des Flüchtigen zu Aktbeginn (nach Talenten/Kniffen) */
  private chapterFugitiveStats() {
    const ch = this.chapter;
    return { taxis: ch.taxis + (ch.tutorial ? 0 : this.mods.taxis), gadgets: { disguise: ch.tutorial ? 0 : 1 + this.mods.disguises, decoy: ch.tutorial ? 0 : 1 + this.mods.decoys }, movesLeft: 1 + (ch.headStart ?? 0) + (ch.tutorial ? 0 : this.mods.headStart) };
  }
  pickPerk(id: string) {
    if (this.phase !== 'chapter-intro' || !this.draft.includes(id)) return;
    const before = this.mods;
    this.perks.push(id);
    this.mods = buildMods(this.opts.talents ?? {}, this.opts.side ?? null, this.perks);
    this.charges.informant += this.mods.informant - before.informant;
    this.charges.freeHeli += this.mods.freeHeli - before.freeHeli;
    this.charges.freeObserve += this.mods.freeObserve - before.freeObserve;
    this.charges.jammer += this.mods.jammer - before.jammer;
    this.graph.setUnitReach(UNIT_REACH + this.mods.unitReachBonus);
    Object.assign(this.fugitive, this.chapterFugitiveStats());
    this.ap = this.apForRound(true);
    this.draft = [];
    this.addLog(`Gewählt: ${PERKS.find((p) => p.id === id)!.name}`, 'good');
    this.sfx('found'); this.emit();
  }
  skipDraft() { this.draft = []; this.emit(); }
  useInformant() {
    if (this.phase !== 'detective' || this.charges.informant <= 0) return;
    this.charges.informant--;
    const N = this.graph.nodes[this.fugitive.node];
    this.addTrace({ round: this.round, kind: 'sighting', x: N.x, y: N.y, node: this.fugitive.node, text: `Informant: Die Zielperson ist gerade bei ${N.name}${this.fugitive.hidden ? ' (in einem Gebäude)' : ''}` });
    this.belief = [this.fugitive.node];
    this.notify(`Ihr Informant meldet sich: Die Zielperson ist bei ${N.name}.`, 'good'); this.sfx('trace'); this.emit();
  }
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
    this.round = 1; this.warrant = null; this.result = null; this.freeCallsUsed = 0;
    this.traces = []; this.searchAreas = []; this.items = []; this.marked.clear(); this.cleared.clear(); this.callActive.clear();
    this.units.forEach((u) => (u.moved = false));
    const start = this.placeNode(ch.start);
    // Einheiten dürfen nicht auf dem Startpunkt stehen
    for (const u of this.units) if (u.node === start || dist(this.graph.nodes[u.node].x, this.graph.nodes[u.node].y, this.graph.nodes[start].x, this.graph.nodes[start].y) < 500) {
      const occ = new Set(this.units.map((x) => x.node));
      const sn = this.graph.nodes[start];
      u.node = this.graph.nearest(sn.x + 1400, sn.y + 900, (k) => !occ.has(k) && this.graph.nodes[k].kind === 'station');
    }
    this.fugitive = { node: start, path: [{ round: 0, node: start, mode: 'stay' }], disguise: 0, decoyArmed: false, hidden: null, ...this.chapterFugitiveStats() };
    this.ap = this.apForRound(true);
    // Roguelite-Auswahl: drei zufällige Karten der eigenen Seite
    const side = this.opts.side;
    this.draft = side && !ch.tutorial ? this.rng.shuffle(PERKS.filter((p) => p.side === side).map((p) => p.id)).slice(0, 3) : [];
    this.roadblocks = []; this.observed = []; this.raid = null; this.raidedThisRound = [];
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
    for (const r of this.roadblocks) if (r.round < this.round && r.round >= this.round - 1 - this.mods.roadblockRounds) b.add(r.node);
    const t = this.ambushTarget(); if (t !== null) b.delete(t); // getarnte Observation am Ziel
    return b;
  }
  fugitiveOptions() {
    const o = this.graph.fugitiveOptions(this.fugitive.node, this.fugitive.taxis, this.blockedForFugitive());
    if (this.chapter.tutorial) return o.filter((x) => x.mode === 'foot' || x.mode === 'stay');
    // Verschanzen im Gebäude am aktuellen Knoten (bzw. darin bleiben)
    const filtered = this.fugitive.hidden ? o.filter((x) => x.mode !== 'stay') : o;
    filtered.push({ to: this.fugitive.node, mode: 'hide' });
    return filtered;
  }

  // ---------------- Gebäude ----------------
  buildingAt(node: number): Building {
    let b = this.buildingCache.get(node);
    if (!b) {
      const key = [...this.graph.placeIndex].find(([, n]) => n === node)?.[0];
      const ov = key ? this.def.buildings?.[key] : undefined;
      b = makeBuilding(this.seed, node, this.graph.nodes[node].name, ov, this.graph.nodes[node].kind === 'poi');
      this.buildingCache.set(node, b);
    }
    return b;
  }
  /** KI-Wahl eines Verstecks: eher oben, nicht im Treppenhaus */
  pickHideRoom(b: Building): number {
    const rooms = b.rooms.filter((r) => r.kind !== 'treppe');
    const w = rooms.map((r) => 1 + r.floor + (r.exit ? 1.5 : 0));
    let x = this.rnd() * w.reduce((a, c) => a + c, 0);
    for (let i = 0; i < rooms.length; i++) { x -= w[i]; if (x <= 0) return rooms[i].id; }
    return rooms[rooms.length - 1].id;
  }
  activeRoadblocks() { return this.roadblocks.filter((r) => r.round >= this.round - (this.phase === 'detective' ? 0 : 1) - this.mods.roadblockRounds); }

  // Hilfsmittel des Flüchtigen
  useDisguise() { if (this.phase !== 'fugitive' || this.fugitive.gadgets.disguise <= 0) return; this.fugitive.gadgets.disguise--; this.fugitive.disguise = 2 + this.mods.disguiseLen; this.sfx('click'); this.emit(); }
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
    const wasHidden = this.fugitive.hidden;
    if (opt.mode !== 'hide' && wasHidden) {
      this.fugitive.hidden = null;
      if (this.units.some((u) => u.node === from) && this.rnd() < 0.6)
        this.addTrace({ round: this.round, kind: 'sighting', x: A.x, y: A.y, node: from, text: `Jemand verlässt hastig ${this.buildingAt(from).name}` });
    }
    if (opt.mode === 'hide') return this.applyHide(opt);
    this.fugitive.node = to;
    this.fugitive.path.push({ round: this.round, node: to, mode: opt.mode, route: opt.route });
    const r = this.round;
    const camChance = this.fugitive.disguise > 0 ? 0 : this.chapter.tutorial ? 1 : Math.max(0, Math.min(1, (this.warrant ? 0.85 : 0.5) + this.mods.camBonus - this.mods.camMinus));
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
    if (opt.mode !== 'stay' && this.rnd() < 0.4 * this.mods.dropMul) {
      const d = this.def.dropItems[Math.floor(this.rnd() * this.def.dropItems.length)];
      const ang = this.rnd() * Math.PI * 2, off = 25 + this.rnd() * 70;
      this.items.push({ id: 'drop' + this.nextId++, x: A.x + Math.cos(ang) * off, y: A.y + Math.sin(ang) * off, icon: d.icon, title: d.title, round: r - 1, found: false });
    }
    this.fugitive.movesLeft--;
    const done = this.fugitive.movesLeft <= 0;
    if (done && this.fugitive.disguise > 0) this.fugitive.disguise--;
    if (done && this.pingRounds.includes(r)) {
      if (this.charges.jammer > 0) { this.charges.jammer--; this.addLog('Funkzelle: Störung im Netz, keine Ortung möglich.', 'info'); }
      else {
        const pm = this.mods.pingRadiusMul * this.mods.pingRadiusMulFug;
        const ang = this.rnd() * Math.PI * 2, off = this.rnd() * 520 * pm;
        tr({ round: r, kind: 'ping', x: B.x + Math.cos(ang) * off, y: B.y + Math.sin(ang) * off, r: Math.round(700 * pm), text: 'Funkzelle: Ein Prepaid-Handy hat sich eingewählt' });
      }
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
    this.afterFugitiveMove(done, fresh);
  }

  private afterFugitiveMove(done: boolean, fresh: Trace[]) {
    const r = this.round;
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

  private applyHide(opt: MoveOption) {
    const node = this.fugitive.node; const b = this.buildingAt(node); const r = this.round;
    const N = this.graph.nodes[node];
    const fresh: Trace[] = [];
    if (!this.fugitive.hidden) {
      this.fugitive.hidden = { node, room: opt.room ?? this.pickHideRoom(b), rounds: 0, trail: [] };
      if (this.rnd() < 0.5) {
        this.addTrace({ round: r, kind: 'building', x: N.x, y: N.y, node, text: `Zeuge: Jemand passend zur Beschreibung ging ins ${b.name}` });
        fresh.push(this.traces[this.traces.length - 1]);
      }
    } else {
      this.fugitive.hidden.rounds++;
      if (opt.room !== undefined) this.fugitive.hidden.room = opt.room;
    }
    this.fugitive.path.push({ round: r, node, mode: 'hide' });
    this.fugitive.movesLeft--;
    const done = this.fugitive.movesLeft <= 0;
    if (done && this.fugitive.disguise > 0) this.fugitive.disguise--;
    if (done && this.pingRounds.includes(r)) this.addLog('Funkzelle: Das gesuchte Handy hat kein Netz, vielleicht abgeschirmt.', 'info');
    this.stats.tracesLeft += fresh.length;
    updateBeliefAfterMove(this, fresh);
    this.sfx('move');
    this.afterFugitiveMove(done, fresh);
  }

  // ---------------- Durchsuchung ----------------
  canRaid(node: number) {
    return this.phase === 'detective' && !!this.warrant && !this.raid && this.ap >= ACTION_COST.raid && !this.raidedThisRound.includes(node) && this.units.some((u) => u.node === node);
  }
  startRaid(node: number) {
    if (!this.canRaid(node)) return false;
    this.ap -= ACTION_COST.raid;
    this.raidedThisRound.push(node);
    this.stats.raids++;
    const b = this.buildingAt(node);
    this.raid = { node, turn: 1, maxTurns: RAID_TURNS, actions: RAID_ACTIONS, searched: [], sealed: [], guarded: [], asked: [], log: [`Zugriffsteam betritt ${b.name}. Alle Ausgänge sind vorerst offen.`], open: null, openedAt: 0, clues: [], ended: null };
    this.addLog(`Durchsuchung gestartet: ${b.name}`, 'info');
    this.sfx('radio'); this.emit();
    return true;
  }
  fugitiveInRaid() { return !!this.raid && !!this.fugitive.hidden && this.fugitive.hidden.node === this.raid.node; }
  raidSeconds() { return RAID_LOOK_SECONDS + this.mods.raidSeconds; }
  raidSearch(room: number) {
    const R = this.raid; if (!R || R.ended || R.actions <= 0 || R.open !== null) return false;
    R.actions--; R.open = room; R.openedAt = Date.now();
    this.sfx('click'); this.emit(); return true;
  }
  /** Spieler hat die Person im Raumbild entdeckt */
  raidCatch() {
    const R = this.raid; if (!R || R.open === null || !this.fugitiveInRaid() || this.fugitive.hidden!.room !== R.open) return;
    const b = this.buildingAt(R.node);
    R.log.unshift(`Zugriff in ${b.rooms[R.open].name}!`); R.ended = 'caught'; R.open = null;
    this.stats.arrests++; this.stats.buildingCaptures++; this.stats.roundsUsed += this.round;
    this.fugitive.hidden = null;
    this.result = { winner: 'detectives', reason: `Das Zugriffsteam hat ${this.culprit.name} in ${b.name} aufgespürt und festgenommen.`, final: this.isLastChapter };
    this.sfx('siren'); this.emit();
  }
  raidClue() {
    const R = this.raid; if (!R || R.open === null || R.clues.includes(R.open)) return;
    R.clues.push(R.open);
    const t = this.fugitive.hidden?.trail.filter((x) => x.room === R.open).pop();
    R.log.unshift(`Spuren in ${this.buildingAt(R.node).rooms[R.open].name}: Hier war vor Kurzem jemand${t ? ` (Durchgang ${t.turn})` : ''}!`);
    this.sfx('found'); this.emit();
  }
  raidLeaveRoom() {
    const R = this.raid; if (!R || R.open === null) return;
    const room = R.open; R.open = null;
    R.searched.push({ room, turn: R.turn, result: R.clues.includes(room) ? 'spuren' : 'leer' });
    R.log.unshift(`${this.buildingAt(R.node).rooms[room].name}: ${R.clues.includes(room) ? 'Spuren gefunden, aber niemand angetroffen.' : 'nichts gefunden.'}`);
    this.emit();
  }
  /** Hinweis, ob in diesem Raum Spuren liegen (früher dort, jetzt nicht mehr) */
  raidRoomHasTrail(room: number) {
    const h = this.fugitive.hidden; if (!h || !this.raid || h.node !== this.raid.node) return false;
    return h.room !== room && h.trail.some((t) => t.room === room);
  }
  raidSeal(floor: number) {
    const R = this.raid; if (!R || R.ended || R.actions <= 0 || R.sealed.includes(floor)) return;
    R.actions--; R.sealed.push(floor);
    R.log.unshift(`${floor === 0 ? 'Erdgeschoss' : floor + '. Stock'} abgeriegelt: Dort kommt niemand mehr ins Treppenhaus.`);
    this.sfx('radio'); this.emit();
  }
  raidGuard(room: number) {
    const R = this.raid; if (!R || R.ended || R.actions <= 0 || R.guarded.includes(room)) return;
    R.actions--; R.guarded.push(room);
    R.log.unshift(`Ausgang gesichert: ${this.buildingAt(R.node).rooms[room].name}.`);
    this.sfx('radio'); this.emit();
  }
  raidAsk(staffId: string): string | null {
    const R = this.raid; if (!R || R.ended || R.actions <= 0 || R.asked.includes(staffId)) return null;
    const b = this.buildingAt(R.node); const st = b.staff.find((s) => s.id === staffId)!;
    R.actions--; R.asked.push(staffId);
    let text: string;
    if (!this.fugitiveInRaid()) text = this.rnd() < 0.85 ? 'Hier ist heute niemand Fremdes reingekommen, da bin ich mir sicher.' : 'Hm, ich glaube, vorhin lief jemand durchs Treppenhaus … oder war das ein Lieferant?';
    else {
      const room = b.rooms[this.fugitive.hidden!.room];
      const idx = b.staff.indexOf(st);
      if (idx === 0) { const f = this.rnd() < 0.8 ? room.floor : Math.max(0, Math.min(b.floors - 1, room.floor + (this.rnd() < 0.5 ? -1 : 1))); text = `Der Aufzug hat vorhin ${f === 0 ? 'im Erdgeschoss' : `im ${f}. Stock`} gehalten. Ein Mann ist ausgestiegen und hat sich umgesehen.`; }
      else if (idx === 1) { const nb = roomNeighbors(b, room, []); const r2 = this.rnd() < 0.6 || !nb.length ? room : nb[Math.floor(this.rnd() * nb.length)]; text = `Bei „${r2.name}“ habe ich ein Geräusch gehört, als ob jemand eine Tür ganz leise zumacht.`; }
      else text = room.exit ? `Die Tür ${room.exit} war nicht abgeschlossen, das ist sie sonst immer.` : `Jemand hat nach dem kürzesten Weg nach draußen gefragt, sehr nervös.`;
    }
    R.log.unshift(`${st.role} ${st.name}: „${text}“`);
    this.sfx('answer'); this.emit();
    return text;
  }
  /** Durchgang beenden: der Flüchtige bewegt sich im Gebäude */
  raidEndTurn() {
    const R = this.raid; if (!R || R.ended) return;
    if (R.open !== null) this.raidLeaveRoom();
    const b = this.buildingAt(R.node);
    if (this.fugitiveInRaid()) {
      const h = this.fugitive.hidden!;
      const cur = b.rooms[h.room];
      // Fluchtversuch über einen ungesicherten Ausgang
      if (cur.exit && !R.guarded.includes(cur.id) && R.turn >= 2 && this.rnd() < Math.min(0.97, 0.75 + this.mods.raidEscape)) {
        const occ = new Set(this.units.map((u) => u.node));
        const out = this.graph.walk[R.node].filter((n) => !occ.has(n));
        const dest = out.length ? out[Math.floor(this.rnd() * out.length)] : R.node;
        this.fugitive.hidden = null; this.fugitive.node = dest;
        this.fugitive.path.push({ round: this.round, node: dest, mode: 'foot' });
        const D = this.graph.nodes[dest];
        this.addTrace({ round: this.round, kind: 'sighting', x: D.x, y: D.y, node: dest, text: `Flucht ${cur.exit}! Gesehen bei ${D.name}` });
        this.belief = [dest];
        R.ended = 'escaped'; R.log.unshift(`Alarm! Die Zielperson ist ${cur.exit} entkommen und läuft Richtung ${D.name}.`);
        this.notify(`Die Zielperson ist ${cur.exit} aus ${b.name} entkommen!`, 'bad'); this.sfx('fail');
        this.emit(); return;
      }
      const opts = [cur, ...roomNeighbors(b, cur, R.sealed)];
      let best = cur, bs = -Infinity;
      for (const r of opts) {
        let s = this.rnd() * 3;
        if (R.searched.some((x) => x.room === r.id)) s += 3;           // schon durchsucht = sicherer
        if (r.exit && !R.guarded.includes(r.id)) s += R.turn >= 1 ? 6 : 1;
        if (r.exit && R.guarded.includes(r.id)) s -= 6;
        if (r.kind === 'treppe') s -= 1.5;
        if (r.id === cur.id) s += 1;
        if (s > bs) { bs = s; best = r; }
      }
      if (best.id !== cur.id) { h.trail.push({ room: cur.id, turn: R.turn }); h.room = best.id; }
    }
    R.turn++; R.actions = RAID_ACTIONS;
    if (R.turn > R.maxTurns) { R.ended = 'failed'; R.log.unshift('Die Durchsuchung wird ergebnislos abgebrochen. Das Team zieht sich zurück.'); }
    else R.log.unshift(`— Durchgang ${R.turn} —`);
    this.emit();
  }
  raidAbort() { const R = this.raid; if (!R || R.ended) return; R.open = null; R.ended = 'aborted'; R.log.unshift('Durchsuchung abgebrochen.'); this.emit(); }
  raidClose() { if (!this.raid?.ended) return; const caught = this.raid.ended === 'caught'; this.raid = null; if (caught) this.phase = 'over'; this.emit(); }

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
    if (u.node !== this.fugitive.node || this.phase === 'over' || this.fugitive.hidden) return;
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
    this.searchAreas.push({ x, y, r: Math.round(SEARCH_RADIUS * this.mods.searchRadiusMul), round: this.round });
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
    if (this.phase !== 'detective' || this.ap < this.costOf('observe') || this.observed.includes(node)) return false;
    if (this.charges.freeObserve > 0) this.charges.freeObserve--; else this.ap -= ACTION_COST.observe;
    this.observed.push(node);
    if (this.mode !== 'fugitive') this.notify(`Observation eingerichtet: ${this.graph.nodes[node].name} wird ab jetzt dauerhaft überwacht.`, 'info');
    this.sfx('radio'); this.emit(); return true;
  }

  heliScan(x: number, y: number) {
    if (this.phase !== 'detective' || this.ap < this.costOf('heli')) return false;
    if (this.charges.freeHeli > 0) this.charges.freeHeli--; else this.ap -= ACTION_COST.heli;
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
      this.round += this.mods.warrantPenalty;
      this.notify(`Der Haftbefehl gegen ${s.name} wird abgelehnt, die Beweise reichen nicht. Sie verlieren ${this.mods.warrantPenalty} Runde(n).`, 'bad');
      this.sfx('fail');
      if (this.round > this.maxRounds) this.finishFugitiveWin();
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
    if (this.phase !== 'detective') return false;
    if (this.freeCallsUsed < this.mods.freeCalls) this.freeCallsUsed++;
    else { if (!this.canSpend()) return false; this.ap--; }
    this.callActive.set(c.id, this.round); this.sfx('phone'); this.emit(); return true;
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
    if (this.round > this.maxRounds) { this.finishFugitiveWin(); this.emit(); return; }
    this.ap = this.apForRound(false); this.freeCallsUsed = 0;
    this.units.forEach((u) => (u.moved = false));
    this.board.forEach((c) => (c.isNew = false));
    this.fugitive.movesLeft = 1;
    this.raidedThisRound = []; this.raid = null;
    this.toFugitivePhase();
  }

  private finishFugitiveWin() {
    this.stats.roundsUsed += Math.min(this.round, this.maxRounds);
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
      chapterSnapshot: this.chapterSnapshot, stats: this.stats, nextId: this.nextId, roadblocks: this.roadblocks, observed: this.observed, resolved: this.resolved, opts: this.rawOpts, raid: this.raid, raidedThisRound: this.raidedThisRound, perks: this.perks, draft: this.draft, xpAwarded: this.xpAwarded, charges: this.charges, freeCallsUsed: this.freeCallsUsed,
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
    g.fugitive = { disguise: 0, gadgets: { disguise: 0, decoy: 0 }, decoyArmed: false, hidden: null, ...d.fugitive };
    g.raid = d.raid ?? null; g.raidedThisRound = d.raidedThisRound ?? [];
    g.xpAwarded = !!d.xpAwarded;
    g.perks = d.perks ?? []; g.draft = d.draft ?? []; g.charges = d.charges ?? g.charges; g.freeCallsUsed = d.freeCallsUsed ?? 0;
    g.mods = buildMods(g.opts.talents ?? {}, g.opts.side ?? null, g.perks); g.graph.setUnitReach(UNIT_REACH + g.mods.unitReachBonus);
    if (g.raid && g.raid.open !== null) g.raid.openedAt = Date.now();
    return g;
  }
}
