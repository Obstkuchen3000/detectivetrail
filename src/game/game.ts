import type { CaseDef, CardDef, Contact } from '../cases/types';
import type { Annotation, BoardCard, CityMap, HiddenItem, LogEntry, MoveOption, SearchArea, Trace, Unit } from './types';
import { CityGraph, UNIT_REACH } from './graph';
import { dist, project } from './geo';
import { mulberry32 } from './rng';
import { aiChooseMove } from './ai';

export type GameMode = 'solo' | 'hotseat';
export type Phase = 'handover-fugitive' | 'fugitive' | 'handover-detective' | 'detective' | 'over';

export const AP_PER_ROUND = 2;
export const SEARCH_RADIUS = 220;
const UNIT_COLORS = ['#38bdf8', '#a3e635', '#f472b6', '#fbbf24'];

export interface FugitiveStep { round: number; node: number; mode: MoveOption['mode']; route?: string }

export class Game {
  graph: CityGraph;
  rnd: () => number;
  round = 1;
  phase: Phase = 'fugitive';
  ap = AP_PER_ROUND;
  fugitive: { node: number; taxis: number; path: FugitiveStep[] };
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
  asked = new Set<string>();
  callActive = new Map<string, number>();
  log: LogEntry[] = [];
  result: { winner: 'detectives' | 'fugitive'; reason: string } | null = null;
  private listeners = new Set<() => void>();
  private nextId = 1;
  cards: Record<string, CardDef>;
  lastEvent: { text: string; kind: 'good' | 'bad' | 'info' } | null = null;

  constructor(public map: CityMap, public def: CaseDef, public mode: GameMode, seed = Date.now() & 0xffffff) {
    this.rnd = mulberry32(seed);
    const places = Object.entries(def.places).map(([key, p]) => { const [x, y] = project(map, p.lon, p.lat); return { key, name: p.name, x, y }; });
    this.graph = new CityGraph(map, places, seed);
    this.cards = { ...def.cards };
    for (const s of def.suspects)
      this.cards['dossier_' + s.id] = { kind: 'dossier', title: s.name, text: `${s.age} J. · ${s.job}\nGröße ${s.height} · Schuhgr. ${s.shoe} · ${s.smoker}\n${s.notes}` };

    const scene = this.graph.placeIndex.get(def.crimeScene)!;
    this.graph.nodes[scene].camera = true;
    this.fugitive = { node: scene, taxis: 3, path: [{ round: 0, node: scene, mode: 'stay' }] };
    const used = new Set<number>([scene]);
    this.units = def.units.map((u, i) => {
      const [x, y] = project(map, u.lon, u.lat);
      const node = this.graph.nearest(x, y, (k) => !used.has(k) && this.graph.nodes[k].kind === 'station');
      used.add(node);
      return { id: 'u' + i, name: 'Einheit ' + u.name, short: u.name[0], color: UNIT_COLORS[i % 4], node, moved: false };
    });

    const sc = this.graph.nodes[scene];
    this.addTrace({ round: 0, kind: 'start', x: sc.x, y: sc.y, text: 'Tatort, 02:10 Uhr' });
    this.searchAreas.push({ x: sc.x, y: sc.y, r: 160, round: 0 });
    for (const it of def.sceneItems)
      this.items.push({ id: 'scene-' + it.cardId, x: sc.x + it.dx, y: sc.y + it.dy, icon: it.icon, title: this.cards[it.cardId].title, cardId: it.cardId, found: false });
    let i = 0;
    for (const id of [...def.startCards, ...def.suspects.map((s) => 'dossier_' + s.id)]) this.placeCard(id, i++);
    this.board.forEach((c) => (c.isNew = false));
    this.addLog('Fall eröffnet: ' + def.title, 'info');
    this.phase = mode === 'hotseat' ? 'handover-fugitive' : 'fugitive';
    if (mode === 'solo') this.runAi();
  }

  subscribe(f: () => void) { this.listeners.add(f); return () => this.listeners.delete(f); }
  emit() { this.listeners.forEach((f) => f()); }
  addLog(text: string, kind: LogEntry['kind'] = 'info') { this.log.unshift({ round: this.round, text, kind }); }
  notify(text: string, kind: 'good' | 'bad' | 'info' = 'info') { this.lastEvent = { text, kind }; this.addLog(text, kind); }
  private addTrace(t: Omit<Trace, 'id'>) { this.traces.push({ ...t, id: this.nextId++ }); }

  // ---------------- Flüchtiger ----------------
  blockedForFugitive() { return new Set(this.units.map((u) => u.node)); }
  fugitiveOptions() { return this.graph.fugitiveOptions(this.fugitive.node, this.fugitive.taxis, this.blockedForFugitive()); }

  private runAi() {
    const opt = aiChooseMove(this);
    this.applyFugitiveMove(opt);
  }

  beginFugitiveTurn() { if (this.phase === 'handover-fugitive') { this.phase = 'fugitive'; this.emit(); } }
  beginDetectiveTurn() { if (this.phase === 'handover-detective') { this.phase = 'detective'; this.emit(); } }

  applyFugitiveMove(opt: MoveOption) {
    const G = this.graph; const from = this.fugitive.node; const to = opt.to;
    const A = G.nodes[from], B = G.nodes[to];
    this.fugitive.node = to;
    this.fugitive.path.push({ round: this.round, node: to, mode: opt.mode, route: opt.route });
    const r = this.round;
    const camChance = this.warrant ? 0.85 : 0.5;
    if (opt.mode === 'subway') {
      this.addTrace({ round: r, kind: 'metrocard', x: A.x, y: A.y, text: `Fahrkarte entwertet: ${A.name}, Linie ${opt.route}` });
    } else if (opt.mode === 'taxi') {
      this.fugitive.taxis--;
      const ang = this.rnd() * Math.PI * 2, off = this.rnd() * 380;
      this.addTrace({ round: r, kind: 'taxi', x: B.x + Math.cos(ang) * off, y: B.y + Math.sin(ang) * off, r: 520, text: 'Taxi-Fahrt mit Bargeld: Ziel ungefähr bekannt' });
    }
    if (opt.mode !== 'stay' && B.camera && this.rnd() < camChance)
      this.addTrace({ round: r, kind: 'cctv', x: B.x, y: B.y, text: `Kamera-Treffer: ${B.name}` });
    if (opt.mode !== 'stay' && this.rnd() < 0.4) {
      const d = this.def.dropItems[Math.floor(this.rnd() * this.def.dropItems.length)];
      const ang = this.rnd() * Math.PI * 2, off = 25 + this.rnd() * 70;
      this.items.push({ id: 'drop' + this.nextId++, x: A.x + Math.cos(ang) * off, y: A.y + Math.sin(ang) * off, icon: d.icon, title: d.title, round: r - 1, found: false });
    }
    if (this.def.pingRounds.includes(r)) {
      const ang = this.rnd() * Math.PI * 2, off = this.rnd() * 520;
      this.addTrace({ round: r, kind: 'ping', x: B.x + Math.cos(ang) * off, y: B.y + Math.sin(ang) * off, r: 700, text: 'Funkzelle: Ein Prepaid-Handy hat sich eingewählt' });
    }
    for (const t of this.def.timed) if (t.round === r && (!t.needs || this.board.has(t.needs))) { this.placeCard(t.card); this.notify('Neue Unterlagen: ' + this.cards[t.card].title, 'info'); }
    // Flüchtiger läuft in eine Einheit? (nur möglich, wenn eingeschlossen)
    this.phase = this.mode === 'hotseat' ? 'handover-detective' : 'detective';
    this.lastEvent = null;
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
    this.checkContact(u);
    this.emit();
  }

  private checkContact(u: Unit) {
    if (u.node !== this.fugitive.node) return;
    const nd = this.graph.nodes[u.node];
    const culprit = this.def.suspects.find((s) => s.culprit)!;
    if (this.warrant === culprit.id) {
      this.result = { winner: 'detectives', reason: `${u.name} hat ${culprit.name} bei ${nd.name} festgenommen. Der „Blaue Reiher“ ist sichergestellt.` };
      this.phase = 'over';
    } else {
      this.addTrace({ round: this.round, kind: 'sighting', x: nd.x, y: nd.y, text: `${u.name}: Sichtkontakt bei ${nd.name}` });
      this.notify(`${u.name} sieht bei ${nd.name} eine Person, die zur Beschreibung passt. Ohne gültigen Haftbefehl ist keine Festnahme möglich.`, 'bad');
    }
  }

  canSpend(n = 1) { return this.phase === 'detective' && this.ap >= n; }

  placeSearch(x: number, y: number) {
    if (!this.canSpend()) return false;
    this.ap--;
    this.searchAreas.push({ x, y, r: SEARCH_RADIUS, round: this.round });
    const n = this.items.filter((it) => !it.found && this.isSearched(it.x, it.y)).length;
    this.notify(`Suchgebiet eingerichtet. Zoomen Sie hinein und suchen Sie nach Auffälligkeiten.${n ? '' : ' (Die Beamten melden bisher nichts.)'}`, 'info');
    this.emit();
    return true;
  }

  isSearched(x: number, y: number) { return this.searchAreas.some((s) => dist(s.x, s.y, x, y) <= s.r); }

  collectItem(id: string) {
    const it = this.items.find((i) => i.id === id);
    if (!it || it.found || !this.isSearched(it.x, it.y)) return;
    it.found = true;
    if (it.cardId) { this.placeCard(it.cardId); this.notify(`Fundstück gesichert: ${it.title}. Es hängt jetzt an der Pinnwand.`, 'good'); }
    else {
      this.addTrace({ round: it.round ?? 0, kind: 'item', x: it.x, y: it.y, text: `Fundstück: ${it.title} (stammt aus Runde ${it.round})` });
      this.notify(`Fundstück: ${it.title}. Die Spurensicherung ordnet es dem Flüchtigen zu, er war in Runde ${it.round} hier.`, 'good');
    }
    this.emit();
  }

  // Pinnwand
  placeCard(id: string, slot?: number, near?: [number, number]) {
    if (this.board.has(id)) return;
    let x: number, y: number;
    if (slot !== undefined) { x = 40 + (slot % 4) * 230; y = 40 + Math.floor(slot / 4) * 250; }
    else [x, y] = this.freeSpot(near ? near[0] : 40, near ? near[1] + 120 : 560);
    this.board.set(id, { id, x, y, isNew: true });
  }

  /** Nächster freier Platz auf der Pinnwand (Karten ca. 200 × 220 px) */
  private freeSpot(px: number, py: number): [number, number] {
    const cards = [...this.board.values()];
    const free = (x: number, y: number) => cards.every((c) => Math.abs(c.x - x) > 210 || Math.abs(c.y - y) > 225);
    let best: [number, number] = [px, py], bd = Infinity;
    for (let gx = 0; gx < 9; gx++) for (let gy = 0; gy < 7; gy++) {
      const x = 40 + gx * 230, y = 40 + gy * 235;
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
    if (!c) return 'wrong';
    this.threads.push([a, b]);
    const A = this.board.get(a)!, B = this.board.get(b)!;
    const fresh = !this.board.has(c.result);
    this.placeCard(c.result, undefined, [(A.x + B.x) / 2, Math.max(A.y, B.y)]);
    this.threads.push([a, c.result], [b, c.result]);
    const card = this.cards[c.result];
    if (card.clears) this.cleared.add(card.clears);
    if (fresh) this.notify('Neue Erkenntnis: ' + card.title, 'good');
    this.emit();
    return 'ok';
  }

  toggleMark(id: string) { this.marked.has(id) ? this.marked.delete(id) : this.marked.add(id); this.emit(); }

  requestWarrant(id: string) {
    if (this.phase !== 'detective' || this.warrant) return;
    const s = this.def.suspects.find((x) => x.id === id)!;
    if (s.culprit) {
      this.warrant = id;
      this.notify(`Der Richter unterschreibt den Haftbefehl gegen ${s.name}. Das Fahndungsfoto ist an alle Kameras verteilt.`, 'good');
      for (const u of this.units) if (u.node === this.fugitive.node) { this.checkContact(u); break; }
    } else {
      this.cleared.add(id);
      this.round += 2;
      this.notify(`Der Haftbefehl gegen ${s.name} wird abgelehnt, die Beweise reichen nicht. Sie verlieren 2 Runden.`, 'bad');
      if (this.round > this.def.maxRounds) this.finishFugitiveWin();
    }
    this.emit();
  }

  // Verhöre
  contactUnlocked(c: Contact) { return !c.unlockedBy || c.unlockedBy.some((k) => this.board.has(k)); }
  unitAtPlace(c: Contact) { const n = this.graph.placeIndex.get(c.place); return this.units.find((u) => u.node === n) ?? null; }
  callIsActive(c: Contact) { return this.callActive.get(c.id) === this.round; }
  startCall(c: Contact) {
    if (this.callIsActive(c)) return true;
    if (!this.canSpend()) return false;
    this.ap--; this.callActive.set(c.id, this.round); this.emit(); return true;
  }
  ask(c: Contact, qId: string, mode: 'phone' | 'person') {
    const q = c.questions.find((q) => q.id === qId)!;
    const key = c.id + '.' + q.id;
    if (this.asked.has(key)) return;
    if (mode === 'phone' && (!this.callIsActive(c) || q.mode === 'person')) return;
    if (mode === 'person' && !this.unitAtPlace(c)) return;
    if (q.requires && !this.board.has(q.requires)) return;
    this.asked.add(key);
    for (const g of q.gives ?? []) if (!this.board.has(g)) { this.placeCard(g); this.notify(`Neue Aussage an der Pinnwand: ${this.cards[g].title}`, 'good'); }
    this.emit();
  }

  // Annotationen
  addAnnotation(a: Omit<Annotation, 'id'>) { this.annotations.push({ ...a, id: this.nextId++ }); this.emit(); }
  removeAnnotation(id: number) { this.annotations = this.annotations.filter((a) => a.id !== id); this.emit(); }

  endDetectiveTurn() {
    if (this.phase !== 'detective') return;
    this.round++;
    if (this.round > this.def.maxRounds) { this.finishFugitiveWin(); this.emit(); return; }
    this.ap = AP_PER_ROUND;
    this.units.forEach((u) => (u.moved = false));
    this.board.forEach((c) => (c.isNew = false));
    if (this.mode === 'solo') { this.phase = 'fugitive'; this.runAi(); }
    else { this.phase = 'handover-fugitive'; this.emit(); }
  }

  private finishFugitiveWin() {
    const culprit = this.def.suspects.find((s) => s.culprit)!;
    this.result = { winner: 'fugitive', reason: `${culprit.name} ist mit dem „Blauen Reiher“ entkommen. Sein Kontakt hat ihn aus der Stadt gebracht.` };
    this.phase = 'over';
  }

  unitReachMeters() { return UNIT_REACH; }
}
