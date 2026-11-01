import type { Game } from '../game/game';
import type { Annotation, CityMap, MoveOption, Trace } from '../game/types';
import { UNIT_REACH } from '../game/graph';
import { dist } from '../game/geo';
import { Wimmel, drawClue, drawFig } from './wimmel';

export type Tool = 'select' | 'pin' | 'person' | 'circle' | 'line' | 'note' | 'search' | 'erase';
export type Viewer = 'detective' | 'fugitive' | 'reveal';

const ROUTE_COLORS: Record<string, string> = {
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E', '4': '#00933C', '5': '#00933C', '6': '#00933C', '7': '#B933AD',
  A: '#0039A6', C: '#0039A6', E: '#0039A6', B: '#FF6319', D: '#FF6319', F: '#FF6319', M: '#FF6319', G: '#6CBE45',
  J: '#996633', Z: '#996633', L: '#A7A9AC', N: '#FCCC0A', Q: '#FCCC0A', R: '#FCCC0A', W: '#FCCC0A', S: '#808183',
};
export const routeColor = (r: string) => ROUTE_COLORS[r[0]] ?? '#888';

const WIMMEL_SCALE = 1.6;
const ITEM_SCALE = 2.2;
const MAX_SCALE = 6, MIN_SCALE = 0.03;

const C = {
  water: '#030c16', grid: 'rgba(56,189,248,0.05)', land: '#13263b', landEdge: '#2a5a85', park: '#0f2c25',
  local: '#081420', major: '#0a1a2b', highway: '#0d2236', path: '#1b3d31', label: '#8fb6d6', node: '#9fc4e6',
  lots: 'rgba(120,170,215,0.22)', curb: 'rgba(110,160,205,0.35)',
};

export interface MapCallbacks {
  viewer: () => Viewer;
  fugitiveOptions: () => MoveOption[];
  onFugitivePick: (opts: MoveOption[]) => void;
  askText: (title: string, placeholder: string, options?: string[]) => Promise<string | null>;
  onHint: (text: string) => void;
}

export class MapView {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scale = 0.1; tx = 0; ty = 0;
  tool: Tool = 'select';
  color = '#ef4444';
  selectedUnit: number | null = null;
  private paths: Record<string, Path2D> = {};
  private land = new Path2D(); private parks = new Path2D();
  private subway: { c: string; p: Path2D }[] = [];
  private wimmel: Wimmel;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { kind: 'pan' | 'circle' | 'line'; sx: number; sy: number; wx: number; wy: number; moved: boolean; tx0: number; ty0: number } | null = null;
  private pinch: { d: number; s: number; cx: number; cy: number } | null = null;
  private mouse = { x: 0, y: 0, wx: 0, wy: 0, inside: false };
  private raf = 0;
  private t0 = performance.now();
  dpr = 1;

  constructor(private host: HTMLElement, private map: CityMap, private game: Game, private cb: MapCallbacks) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-canvas';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    for (const [k, lines] of Object.entries(map.roads)) {
      const p = new Path2D();
      for (const l of lines) { p.moveTo(l[0], l[1]); for (let i = 2; i < l.length; i += 2) p.lineTo(l[i], l[i + 1]); }
      this.paths[k] = p;
    }
    for (const l of map.land) for (const r of l.rings) { this.land.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) this.land.lineTo(r[i], r[i + 1]); this.land.closePath(); }
    for (const pk of map.parks) { const r = pk.ring; this.parks.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) this.parks.lineTo(r[i], r[i + 1]); this.parks.closePath(); }
    const byColor = new Map<string, Path2D>();
    for (const s of map.subway) {
      const c = routeColor(s.r); let p = byColor.get(c); if (!p) byColor.set(c, (p = new Path2D()));
      p.moveTo(s.p[0], s.p[1]); for (let i = 2; i < s.p.length; i += 2) p.lineTo(s.p[i], s.p[i + 1]);
    }
    this.subway = [...byColor].map(([c, p]) => ({ c, p }));
    this.wimmel = new Wimmel(map);
    this.bind();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.fitToGame();
    this.loop();
  }

  private ro: ResizeObserver;
  destroy() { cancelAnimationFrame(this.raf); this.ro.disconnect(); this.canvas.remove(); }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    const r = this.host.getBoundingClientRect();
    this.canvas.width = Math.max(1, r.width * this.dpr); this.canvas.height = Math.max(1, r.height * this.dpr);
    this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
  }
  get w() { return this.canvas.width / this.dpr; }
  get h() { return this.canvas.height / this.dpr; }

  fitToGame() {
    const ns = this.game.graph.nodes;
    const xs = ns.map((n) => n.x), ys = ns.map((n) => n.y);
    this.fit(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 40);
  }
  fit(x0: number, y0: number, x1: number, y1: number, pad = 40) {
    const s = Math.min((this.w - pad * 2) / Math.max(1, x1 - x0), (this.h - pad * 2) / Math.max(1, y1 - y0));
    this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    this.tx = this.w / 2 - ((x0 + x1) / 2) * this.scale; this.ty = this.h / 2 - ((y0 + y1) / 2) * this.scale;
  }
  focus(x: number, y: number, scale?: number) {
    if (scale) this.scale = scale;
    this.tx = this.w / 2 - x * this.scale; this.ty = this.h / 2 - y * this.scale;
  }
  toWorld(sx: number, sy: number) { return { x: (sx - this.tx) / this.scale, y: (sy - this.ty) / this.scale }; }
  toScreen(x: number, y: number) { return { x: x * this.scale + this.tx, y: y * this.scale + this.ty }; }
  zoomAt(sx: number, sy: number, f: number) {
    const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * f));
    const w = this.toWorld(sx, sy); this.scale = ns; this.tx = sx - w.x * ns; this.ty = sy - w.y * ns;
  }

  // ---------------- Eingabe ----------------
  private bind() {
    const cv = this.canvas;
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0022)); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const r = cv.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
      this.pointers.set(e.pointerId, { x: sx, y: sy });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        this.drag = null; return;
      }
      const w = this.toWorld(sx, sy);
      const kind = e.button !== 0 ? 'pan' : this.tool === 'circle' ? 'circle' : this.tool === 'line' ? 'line' : 'pan';
      this.drag = { kind, sx, sy, wx: w.x, wy: w.y, moved: false, tx0: this.tx, ty0: this.ty };
    });
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const w = this.toWorld(sx, sy); this.mouse = { x: sx, y: sy, wx: w.x, wy: w.y, inside: true };
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: sx, y: sy });
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        this.zoomAt(cx, cy, (this.pinch.s * (d / this.pinch.d)) / this.scale);
        this.tx += cx - this.pinch.cx; this.ty += cy - this.pinch.cy; this.pinch.cx = cx; this.pinch.cy = cy;
        return;
      }
      const d = this.drag; if (!d) return;
      if (Math.hypot(sx - d.sx, sy - d.sy) > 4) d.moved = true;
      if (d.kind === 'pan' && d.moved) { this.tx = d.tx0 + sx - d.sx; this.ty = d.ty0 + sy - d.sy; }
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; this.drag = null; return; }
      const d = this.drag; this.drag = null; if (!d) return;
      const r = cv.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; const w = this.toWorld(sx, sy);
      if (d.kind === 'circle' && d.moved) { this.game.addAnnotation({ type: 'circle', x: d.wx, y: d.wy, r: dist(d.wx, d.wy, w.x, w.y), color: this.color }); return; }
      if (d.kind === 'line' && d.moved) { this.game.addAnnotation({ type: 'line', x: d.wx, y: d.wy, x2: w.x, y2: w.y, color: this.color }); return; }
      if (!d.moved) this.click(sx, sy, w.x, w.y);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => (this.mouse.inside = false));
  }

  private nodeAt(sx: number, sy: number, filter?: (i: number) => boolean, rad = 16) {
    let best = -1, bd = rad;
    this.game.graph.nodes.forEach((n, i) => { if (filter && !filter(i)) return; const p = this.toScreen(n.x, n.y); const d = Math.hypot(p.x - sx, p.y - sy); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  private async click(sx: number, sy: number, wx: number, wy: number) {
    const g = this.game, viewer = this.cb.viewer();
    if (viewer === 'fugitive') {
      const opts = this.cb.fugitiveOptions();
      const n = this.nodeAt(sx, sy, (i) => opts.some((o) => o.to === i), 20);
      if (n >= 0) this.cb.onFugitivePick(opts.filter((o) => o.to === n));
      return;
    }
    if (viewer !== 'detective') return;
    switch (this.tool) {
      case 'select': {
        // Fundstück?
        if (this.scale >= ITEM_SCALE * 0.8) {
          const it = g.items.find((it) => !it.found && g.isSearched(it.x, it.y) && Math.hypot(this.toScreen(it.x, it.y).x - sx, this.toScreen(it.x, it.y).y - sy) < Math.max(14, 2.4 * this.scale));
          if (it) { g.collectItem(it.id); return; }
        }
        const ui = g.units.findIndex((u) => { const n = g.graph.nodes[u.node]; const p = this.toScreen(n.x, n.y); return Math.hypot(p.x - sx, p.y - sy) < 16; });
        if (ui >= 0 && ui !== this.selectedUnit) {
          if (g.phase !== 'detective') { this.cb.onHint('Warten Sie, bis Sie am Zug sind.'); return; }
          this.selectedUnit = ui;
          if (g.units[ui].moved) this.cb.onHint(`${g.units[ui].name} ist in dieser Runde schon gefahren.`);
          g.emit(); return;
        }
        if (this.selectedUnit !== null) {
          const reach = g.unitReach(this.selectedUnit);
          const n = this.nodeAt(sx, sy, (i) => reach.includes(i), 20);
          if (n >= 0) { g.moveUnit(this.selectedUnit, n); this.selectedUnit = null; return; }
          this.selectedUnit = null; g.emit(); return;
        }
        if (this.scale < ITEM_SCALE && g.searchAreas.some((s) => dist(s.x, s.y, wx, wy) < s.r)) this.cb.onHint('Zoomen Sie weiter hinein (Mausrad/Pinch), um Fundstücke im Suchgebiet zu erkennen.');
        break;
      }
      case 'search':
        if (g.phase !== 'detective') return;
        if (!g.canSpend()) { this.cb.onHint('Keine Einsatzpunkte mehr in dieser Runde.'); return; }
        g.placeSearch(wx, wy);
        this.tool = 'select'; g.emit();
        break;
      case 'pin': case 'note': {
        const t = await this.cb.askText(this.tool === 'pin' ? 'Markierung beschriften' : 'Notiz', this.tool === 'pin' ? 'z. B. Versteck?' : 'Text…');
        if (t !== null) g.addAnnotation({ type: this.tool, x: wx, y: wy, text: t, color: this.color });
        break;
      }
      case 'person': {
        const t = await this.cb.askText('Person markieren', 'Name', g.def.suspects.map((s) => s.name));
        if (t) g.addAnnotation({ type: 'person', x: wx, y: wy, text: t, color: this.color });
        break;
      }
      case 'erase': {
        let best: Annotation | null = null, bd = 14;
        for (const a of g.annotations) {
          const p = this.toScreen(a.x, a.y); let d = Math.hypot(p.x - sx, p.y - sy);
          if (a.type === 'circle') d = Math.min(d, Math.abs(d - a.r! * this.scale));
          if (a.type === 'line') { const q = this.toScreen(a.x2!, a.y2!); d = segDist(sx, sy, p.x, p.y, q.x, q.y); }
          if (d < bd) { bd = d; best = a; }
        }
        if (best) g.removeAnnotation(best.id);
        break;
      }
    }
  }

  // ---------------- Zeichnen ----------------
  private loop = () => { if (this.host.offsetParent !== null) this.draw(); this.raf = requestAnimationFrame(this.loop); };

  private draw() {
    const ctx = this.ctx, g = this.game, s = this.scale, dpr = this.dpr;
    const t = (performance.now() - this.t0) / 1000;
    const viewer = this.cb.viewer();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.water; ctx.fillRect(0, 0, this.w, this.h);
    // Raster
    const step = niceStep(80 / s);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
    const tl = this.toWorld(0, 0), br = this.toWorld(this.w, this.h);
    for (let x = Math.floor(tl.x / step) * step; x < br.x; x += step) { const p = this.toScreen(x, 0).x; ctx.moveTo(p, 0); ctx.lineTo(p, this.h); }
    for (let y = Math.floor(tl.y / step) * step; y < br.y; y += step) { const p = this.toScreen(0, y).y; ctx.moveTo(0, p); ctx.lineTo(this.w, p); }
    ctx.stroke();

    // Welt
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * this.tx, dpr * this.ty);
    ctx.fillStyle = C.land; ctx.fill(this.land);
    ctx.strokeStyle = C.landEdge; ctx.lineWidth = 1.5 / s; ctx.stroke(this.land);
    ctx.fillStyle = C.park; ctx.fill(this.parks);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const lw = (m: number, minPx: number) => Math.max(m, minPx / s);
    const tl0 = this.toWorld(0, 0), br0 = this.toWorld(this.w, this.h);
    // Häuserblöcke: Parzellen bei mittlerem Zoom
    if (s > 0.7) {
      ctx.strokeStyle = C.lots; ctx.lineWidth = Math.max(0.3, 0.8 / s);
      const cs = Wimmel.cellSize;
      for (let cx = Math.floor(tl0.x / cs) - 1; cx <= Math.floor(br0.x / cs); cx++)
        for (let cy = Math.floor(tl0.y / cs) - 1; cy <= Math.floor(br0.y / cs); cy++) { const p = this.wimmel.lots(cx, cy); if (p) ctx.stroke(p); }
    }
    ctx.strokeStyle = C.path; ctx.lineWidth = lw(2, 0.5); ctx.stroke(this.paths.path);
    // Bordsteinkante (helle Kontur), dann Fahrbahn
    if (s > 0.45) {
      ctx.strokeStyle = C.curb;
      ctx.lineWidth = lw(11, 1.6); ctx.stroke(this.paths.local);
      ctx.lineWidth = lw(16, 2.2); ctx.stroke(this.paths.major); ctx.stroke(this.paths.ramp);
      ctx.lineWidth = lw(19, 2.6); ctx.stroke(this.paths.highway);
    }
    ctx.strokeStyle = C.local; ctx.lineWidth = lw(9, 0.9); ctx.stroke(this.paths.local);
    ctx.strokeStyle = C.major; ctx.lineWidth = lw(13, 1.3); ctx.stroke(this.paths.major); ctx.stroke(this.paths.ramp);
    ctx.strokeStyle = C.highway; ctx.lineWidth = lw(16, 1.7); ctx.stroke(this.paths.highway);
    if (s > 1.2) { ctx.strokeStyle = 'rgba(160,200,230,0.18)'; ctx.lineWidth = 0.25; ctx.setLineDash([3, 3]); ctx.stroke(this.paths.local); ctx.stroke(this.paths.major); ctx.setLineDash([]); }
    ctx.globalAlpha = s > 1.5 ? 0.25 : 0.55;
    for (const sl of this.subway) { ctx.strokeStyle = sl.c; ctx.lineWidth = lw(5, 1.4); ctx.stroke(sl.p); }
    ctx.globalAlpha = 1;

    // Fußwege des Spielgraphen
    if (s > 0.18 && s < 2) {
      ctx.strokeStyle = 'rgba(148,197,240,0.10)'; ctx.lineWidth = 1 / s; ctx.setLineDash([4 / s, 4 / s]); ctx.beginPath();
      g.graph.walk.forEach((ns, i) => ns.forEach((j) => { if (j > i) { const a = g.graph.nodes[i], b = g.graph.nodes[j]; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } }));
      ctx.stroke(); ctx.setLineDash([]);
    }

    // Wimmelbild
    if (s >= WIMMEL_SCALE) {
      const cs = Wimmel.cellSize;
      for (let cx = Math.floor(tl.x / cs) - 1; cx <= Math.floor(br.x / cs); cx++)
        for (let cy = Math.floor(tl.y / cs) - 1; cy <= Math.floor(br.y / cs); cy++)
          for (const f of this.wimmel.get(cx, cy)) {
            if (f.x < tl.x - 5 || f.x > br.x + 5 || f.y < tl.y - 5 || f.y > br.y + 5) continue;
            ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a); drawFig(ctx, f.k, f.v); ctx.restore();
          }
    }

    // Suchgebiete
    for (const a of g.searchAreas) {
      ctx.save();
      ctx.fillStyle = 'rgba(56,189,248,0.05)'; ctx.strokeStyle = 'rgba(56,189,248,0.7)'; ctx.lineWidth = 1.5 / s; ctx.setLineDash([8 / s, 5 / s]);
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      // Radar-Sweep
      const ang = (t * 1.2 + a.x) % (Math.PI * 2);
      const grad = ctx.createConicGradient(ang, a.x, a.y);
      grad.addColorStop(0, 'rgba(56,189,248,0.18)'); grad.addColorStop(0.08, 'rgba(56,189,248,0)'); grad.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Versteckte Fundstücke
    if (s >= ITEM_SCALE * 0.7)
      for (const it of g.items) {
        if (it.found || !g.isSearched(it.x, it.y)) continue;
        const glint = 0.5 + 0.5 * Math.sin(t * 2.2 + it.x);
        ctx.save(); ctx.translate(it.x, it.y); ctx.rotate((it.x * 7) % 6);
        ctx.globalAlpha = 0.85 + 0.15 * glint; drawClue(ctx, it.icon);
        ctx.restore();
      }

    // Ab hier: Bildschirmkoordinaten
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawLabels();
    this.drawAnnotations();
    this.drawTraces(t);
    this.drawExits(t);
    this.drawNodes(viewer);
    if (viewer === 'fugitive' || viewer === 'reveal') this.drawFugitive(viewer, t);
    this.drawUnits(t);
    this.drawPreview();
    this.drawHud();
  }

  private drawLabels() {
    const ctx = this.ctx, s = this.scale;
    const boxes: number[][] = [];
    const free = (x: number, y: number, w: number, h: number) => { for (const b of boxes) if (x < b[2] && x + w > b[0] && y < b[3] && y + h > b[1]) return false; boxes.push([x, y, x + w, y + h]); return true; };
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // POIs & Stationen zuerst
    const g = this.game;
    g.graph.nodes.forEach((n) => {
      const p = this.toScreen(n.x, n.y); if (p.x < -50 || p.y < -20 || p.x > this.w + 50 || p.y > this.h + 20) return;
      if (n.kind === 'poi' && s > 0.09) {
        ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace'; const w = ctx.measureText(n.name).width;
        if (free(p.x - w / 2, p.y + 8, w, 13)) { ctx.fillStyle = '#fbbf24'; ctx.fillText(n.name, p.x, p.y + 15); }
      } else if (n.kind === 'station' && s > 0.32) {
        ctx.font = '10px "JetBrains Mono", ui-monospace, monospace'; const w = ctx.measureText(n.name).width;
        if (free(p.x - w / 2, p.y + 6, w, 12)) { ctx.fillStyle = 'rgba(200,225,245,0.75)'; ctx.fillText(n.name, p.x, p.y + 12); }
      }
    });
    if (s < 0.12) return;
    for (const l of this.map.labels) {
      if (l.m === 0 && s < 0.9) continue;
      const p = this.toScreen(l.x, l.y); if (p.x < -100 || p.y < -30 || p.x > this.w + 100 || p.y > this.h + 30) continue;
      ctx.font = (l.m ? '600 ' : '') + (l.m ? 10 : 9) + 'px "JetBrains Mono", ui-monospace, monospace';
      const txt = l.t.toUpperCase(); const w = ctx.measureText(txt).width;
      const bw = Math.abs(Math.cos(l.a)) * w + 10, bh = Math.abs(Math.sin(l.a)) * w + 10;
      if (!free(p.x - bw / 2, p.y - bh / 2, bw, bh)) continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(l.a);
      ctx.fillStyle = l.m ? C.label : 'rgba(127,169,204,0.6)'; ctx.fillText(txt, 0, 0); ctx.restore();
    }
  }

  private drawAnnotations() {
    const ctx = this.ctx;
    for (const a of this.game.annotations) {
      const p = this.toScreen(a.x, a.y);
      ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = 2;
      if (a.type === 'circle') {
        ctx.save(); ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.arc(p.x, p.y, a.r! * this.scale, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.arc(p.x, p.y, a.r! * this.scale, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.stroke();
        label(ctx, `${Math.round(a.r!)} m`, p.x, p.y - a.r! * this.scale - 8, a.color);
      } else if (a.type === 'line') {
        const q = this.toScreen(a.x2!, a.y2!);
        ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
        arrowHead(ctx, p.x, p.y, q.x, q.y);
        label(ctx, `${Math.round(dist(a.x, a.y, a.x2!, a.y2!))} m`, (p.x + q.x) / 2, (p.y + q.y) / 2 - 10, a.color);
      } else if (a.type === 'pin') {
        ctx.beginPath(); ctx.arc(p.x, p.y - 14, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x, p.y); ctx.stroke();
        if (a.text) label(ctx, a.text, p.x, p.y - 28, a.color);
      } else if (a.type === 'person') {
        ctx.fillStyle = '#0b1828'; ctx.beginPath(); ctx.roundRect(p.x - 14, p.y - 34, 28, 30, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(p.x, p.y - 24, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 8, 10, 6, 0, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 2); ctx.stroke();
        if (a.text) label(ctx, a.text, p.x, p.y - 44, a.color);
      } else if (a.type === 'note') {
        ctx.font = '12px "Caveat", "Comic Sans MS", cursive';
        const w = Math.max(60, ctx.measureText(a.text ?? '').width + 14);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-0.04);
        ctx.fillStyle = '#fde68a'; ctx.fillRect(-w / 2, -14, w, 28); ctx.fillStyle = '#1f2937'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(a.text ?? '', 0, 0);
        ctx.restore();
      }
    }
  }

  private drawTraces(t: number) {
    const ctx = this.ctx, g = this.game;
    for (const tr of g.traces) {
      const age = g.round - tr.round;
      const alpha = Math.max(0.35, 1 - age * 0.12);
      const p = this.toScreen(tr.x, tr.y);
      ctx.save(); ctx.globalAlpha = alpha;
      const col = traceColor(tr);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
      if (tr.r) {
        const R = tr.r * this.scale;
        ctx.setLineDash(tr.kind === 'taxi' ? [10, 6] : [2, 5]);
        ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = alpha * 0.08; ctx.fill(); ctx.globalAlpha = alpha;
        if (tr.kind === 'ping') for (let k = 1; k <= 3; k++) { ctx.globalAlpha = alpha * 0.5 * (1 - ((t * 0.4 + k / 3) % 1)); ctx.beginPath(); ctx.arc(p.x, p.y, R * ((t * 0.4 + k / 3) % 1), 0, Math.PI * 2); ctx.stroke(); }
        ctx.globalAlpha = alpha;
        label(ctx, `R${tr.round} ${tr.kind === 'ping' ? 'FUNKZELLE' : 'TAXI'}`, p.x, p.y - R - 9, col);
      } else {
        const icon = { start: '✕', cctv: '◉', metrocard: 'M', sighting: '!', item: '◆', ping: '', taxi: '' }[tr.kind];
        if (tr.kind === 'sighting') { const k = (t % 1.5) / 1.5; ctx.globalAlpha = alpha * (1 - k); ctx.beginPath(); ctx.arc(p.x, p.y, 10 + k * 22, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = alpha; }
        ctx.fillStyle = '#05101c'; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.font = 'bold 11px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon, p.x, p.y + 0.5);
        label(ctx, tr.kind === 'start' ? (tr.tag ?? 'START') : 'R' + tr.round, p.x + 20, p.y - 12, col);
      }
      ctx.restore();
    }
  }

  private drawExits(t: number) {
    const g = this.game, ex = g.chapter.escape; if (!ex) return;
    const open = g.round >= ex.fromRound;
    const ctx = this.ctx;
    for (const n of g.escapeNodes()) {
      const nd = g.graph.nodes[n]; const p = this.toScreen(nd.x, nd.y);
      ctx.save();
      ctx.strokeStyle = open ? '#f43f5e' : '#a3a3a3'; ctx.fillStyle = 'rgba(5,16,28,.9)'; ctx.lineWidth = 2;
      const pulse = open ? 4 + Math.sin(t * 4) * 3 : 0;
      ctx.beginPath(); ctx.roundRect(p.x - 13 - pulse / 2, p.y - 13 - pulse / 2, 26 + pulse, 26 + pulse, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = open ? '#f43f5e' : '#a3a3a3'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⇲', p.x, p.y + 1);
      label(ctx, open ? 'FLUCHTPUNKT OFFEN' : `FLUCHTPUNKT AB R${ex.fromRound}`, p.x, p.y + 24, open ? '#f43f5e' : '#a3a3a3');
      ctx.restore();
    }
  }

  private drawNodes(viewer: Viewer) {
    const ctx = this.ctx, g = this.game, s = this.scale;
    const reach = this.selectedUnit !== null && viewer === 'detective' ? new Set(g.unitReach(this.selectedUnit)) : null;
    const r = s > 0.3 ? 4 : 3;
    g.graph.nodes.forEach((n, i) => {
      const p = this.toScreen(n.x, n.y); if (p.x < -20 || p.y < -20 || p.x > this.w + 20 || p.y > this.h + 20) return;
      if (n.kind === 'poi') {
        ctx.fillStyle = '#05101c'; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - r - 2); ctx.lineTo(p.x + r + 2, p.y); ctx.lineTo(p.x, p.y + r + 2); ctx.lineTo(p.x - r - 2, p.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = '#05101c'; ctx.strokeStyle = C.node; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      if (n.camera && s > 0.25) { ctx.fillStyle = '#f87171'; ctx.beginPath(); ctx.arc(p.x + r + 3, p.y - r - 1, 2, 0, Math.PI * 2); ctx.fill(); }
      if (reach?.has(i)) { ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2); ctx.stroke(); }
    });
    if (reach && this.mouse.inside) {
      const h = this.nodeAt(this.mouse.x, this.mouse.y, (i) => reach.has(i), 20);
      if (h >= 0) { const p = this.toScreen(g.graph.nodes[h].x, g.graph.nodes[h].y); ctx.fillStyle = 'rgba(74,222,128,0.25)'; ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.fill(); label(ctx, g.graph.nodes[h].name, p.x, p.y - 20, '#4ade80'); }
    }
  }

  private drawFugitive(viewer: Viewer, t: number) {
    const ctx = this.ctx, g = this.game;
    const path = g.fugitive.path;
    ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2.5; ctx.setLineDash([2, 4]); ctx.beginPath();
    path.forEach((st, i) => { const n = g.graph.nodes[st.node]; const p = this.toScreen(n.x, n.y); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.stroke(); ctx.setLineDash([]);
    path.forEach((st) => { if (!st.round) return; const n = g.graph.nodes[st.node]; const p = this.toScreen(n.x, n.y); label(ctx, `R${st.round}${st.mode === 'subway' ? ' 🚇' : st.mode === 'taxi' ? ' 🚕' : st.mode === 'stay' ? ' ⏸' : ''}`, p.x - 18, p.y + 16, '#fb923c'); });
    const cur = g.graph.nodes[g.fugitive.node]; const p = this.toScreen(cur.x, cur.y);
    ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.arc(p.x, p.y, 8 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#05101c'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('X', p.x, p.y + 0.5);
    if (viewer !== 'fugitive' || g.phase !== 'fugitive') return;
    const opts = this.cb.fugitiveOptions();
    const byNode = new Map<number, MoveOption[]>();
    for (const o of opts) if (o.mode !== 'stay') { const a = byNode.get(o.to) ?? []; a.push(o); byNode.set(o.to, a); }
    for (const [n, os] of byNode) {
      const q = this.toScreen(g.graph.nodes[n].x, g.graph.nodes[n].y);
      const modes = new Set(os.map((o) => o.mode));
      let rr = 9;
      for (const m of ['foot', 'subway', 'taxi'] as const) if (modes.has(m)) { ctx.strokeStyle = m === 'foot' ? '#e2e8f0' : m === 'subway' ? '#facc15' : '#f97316'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, Math.PI * 2); ctx.stroke(); rr += 4; }
    }
  }

  private drawUnits(t: number) {
    const ctx = this.ctx, g = this.game;
    g.units.forEach((u, i) => {
      const n = g.graph.nodes[u.node]; const p = this.toScreen(n.x, n.y);
      const sel = i === this.selectedUnit;
      if (sel) {
        ctx.save(); ctx.strokeStyle = u.color; ctx.globalAlpha = 0.35; ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, UNIT_REACH * this.scale, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.globalAlpha = u.moved && g.phase === 'detective' ? 0.6 : 1;
      ctx.fillStyle = '#05101c'; ctx.strokeStyle = u.color; ctx.lineWidth = sel ? 3 : 2;
      ctx.beginPath(); ctx.roundRect(p.x - 11, p.y - 11, 22, 22, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = u.color; ctx.font = 'bold 12px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(u.short, p.x, p.y + 0.5);
      if (sel) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5); ctx.beginPath(); ctx.roundRect(p.x - 15, p.y - 15, 30, 30, 7); ctx.stroke(); }
      ctx.restore();
    });
  }

  private drawPreview() {
    const d = this.drag, ctx = this.ctx; if (!d || !d.moved || !this.mouse.inside) return;
    const a = this.toScreen(d.wx, d.wy);
    ctx.strokeStyle = this.color; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    if (d.kind === 'circle') { const R = Math.hypot(this.mouse.x - a.x, this.mouse.y - a.y); ctx.beginPath(); ctx.arc(a.x, a.y, R, 0, Math.PI * 2); ctx.stroke(); label(ctx, `${Math.round(R / this.scale)} m`, a.x, a.y - R - 8, this.color); }
    if (d.kind === 'line') { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(this.mouse.x, this.mouse.y); ctx.stroke(); label(ctx, `${Math.round(dist(d.wx, d.wy, this.mouse.wx, this.mouse.wy))} m`, (a.x + this.mouse.x) / 2, (a.y + this.mouse.y) / 2 - 10, this.color); }
    ctx.setLineDash([]);
  }

  private drawHud() {
    const ctx = this.ctx;
    // Maßstab
    const m = niceStep(120 / this.scale); const px = m * this.scale;
    ctx.strokeStyle = '#7fa9cc'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(16, this.h - 18); ctx.lineTo(16 + px, this.h - 18); ctx.moveTo(16, this.h - 23); ctx.lineTo(16, this.h - 13); ctx.moveTo(16 + px, this.h - 23); ctx.lineTo(16 + px, this.h - 13); ctx.stroke();
    ctx.fillStyle = '#7fa9cc'; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(m >= 1000 ? m / 1000 + ' km' : m + ' m', 20 + px, this.h - 12);
    if (this.mouse.inside) {
      const lon = this.map.origin[0] + this.mouse.wx / this.map.scale[0], lat = this.map.origin[1] - this.mouse.wy / this.map.scale[1];
      ctx.textAlign = 'right'; ctx.fillText(`${lat.toFixed(5)}°N  ${(-lon).toFixed(5)}°W  ·  ZOOM ${this.scale.toFixed(2)}`, this.w - 12, this.h - 12);
    }
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(127,169,204,0.55)'; ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(this.map.attribution, 16, this.h - 34);
    if (this.scale >= WIMMEL_SCALE * 0.9 && this.scale < ITEM_SCALE * 0.7 && this.game.searchAreas.some((a) => { const p = this.toScreen(a.x, a.y); return p.x > 0 && p.x < this.w && p.y > 0 && p.y < this.h; })) {
      ctx.textAlign = 'center'; ctx.fillStyle = '#38bdf8'; ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillText('▸ Weiter zoomen, um Fundstücke zu erkennen', this.w / 2, 24);
    }
  }
}

function traceColor(t: Trace) {
  return { start: '#ef4444', cctv: '#f87171', metrocard: '#facc15', taxi: '#f59e0b', ping: '#22d3ee', sighting: '#ef4444', item: '#e879f9' }[t.kind];
}
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(4,14,26,0.85)'; ctx.fillRect(x - w / 2, y - 7, w, 14);
  ctx.fillStyle = color; ctx.fillText(text, x, y + 0.5);
}
function arrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 10 * Math.cos(a - 0.4), y2 - 10 * Math.sin(a - 0.4)); ctx.lineTo(x2 - 10 * Math.cos(a + 0.4), y2 - 10 * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
}
function niceStep(v: number) { const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay; const L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
