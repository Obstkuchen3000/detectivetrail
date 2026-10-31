import type { CityMap } from '../game/types';
import { hash2, mulberry32 } from '../game/rng';

/** Prozedurales Wimmel-Gewusel entlang der Straßen (nur bei starkem Zoom sichtbar) */
export interface Fig { x: number; y: number; k: number; a: number; v: number }
export const FIG_KINDS = ['person', 'person2', 'car', 'tree', 'bike', 'dog', 'bench', 'cab'] as const;

const CELL = 120;

export class Wimmel {
  private segs = new Map<string, number[]>(); // Liste von x1,y1,x2,y2,klasse
  private cache = new Map<string, Fig[]>();
  constructor(map: CityMap) {
    const classes: [string, number][] = [['local', 0], ['major', 1], ['path', 2], ['ramp', 1]];
    for (const [cls, c] of classes) for (const line of map.roads[cls] ?? []) {
      for (let i = 2; i < line.length; i += 2) {
        const x1 = line[i - 2], y1 = line[i - 1], x2 = line[i], y2 = line[i + 1];
        const L = Math.hypot(x2 - x1, y2 - y1);
        // Segmente in Stücke < CELL zerlegen
        const parts = Math.max(1, Math.ceil(L / CELL));
        for (let p = 0; p < parts; p++) {
          const ax = x1 + ((x2 - x1) * p) / parts, ay = y1 + ((y2 - y1) * p) / parts;
          const bx = x1 + ((x2 - x1) * (p + 1)) / parts, by = y1 + ((y2 - y1) * (p + 1)) / parts;
          const key = Math.floor((ax + bx) / 2 / CELL) + ',' + Math.floor((ay + by) / 2 / CELL);
          let arr = this.segs.get(key); if (!arr) this.segs.set(key, (arr = []));
          arr.push(ax, ay, bx, by, c);
        }
      }
    }
  }
  static cellSize = CELL;
  private lotCache = new Map<string, Path2D>();

  /** Parzellenlinien (Häuserfronten + Grundstücksgrenzen) entlang der Straßen einer Zelle */
  lots(cx: number, cy: number): Path2D | null {
    const key = cx + ',' + cy;
    if (this.lotCache.has(key)) return this.lotCache.get(key)!;
    const segs = this.segs.get(key);
    if (!segs) { this.lotCache.set(key, null as unknown as Path2D); return null; }
    const p = new Path2D();
    const rnd = mulberry32(hash2(cx, cy, 11));
    for (let i = 0; i < segs.length; i += 5) {
      const [x1, y1, x2, y2, c] = segs.slice(i, i + 5);
      if (c === 2) continue;
      const L = Math.hypot(x2 - x1, y2 - y1); if (L < 8) continue;
      const ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux;
      const half = c === 1 ? 8 : 5.5;
      for (const side of [-1, 1]) {
        const o = side * (half + 2.5);
        // Häuserfront
        p.moveTo(x1 + ux * 6 + nx * o, y1 + uy * 6 + ny * o); p.lineTo(x2 - ux * 6 + nx * o, y2 - uy * 6 + ny * o);
        // Grundstücksgrenzen
        for (let t = 6 + rnd() * 10; t < L - 6; t += 7 + rnd() * 16) {
          const depth = 14 + rnd() * 18;
          const bx = x1 + ux * t + nx * o, by = y1 + uy * t + ny * o;
          p.moveTo(bx, by); p.lineTo(bx + nx * side * depth, by + ny * side * depth);
        }
      }
    }
    this.lotCache.set(key, p);
    return p;
  }

  get(cx: number, cy: number): Fig[] {
    const key = cx + ',' + cy;
    let figs = this.cache.get(key);
    if (figs) return figs;
    figs = [];
    const segs = this.segs.get(key);
    if (segs) {
      const rnd = mulberry32(hash2(cx, cy, 7));
      for (let i = 0; i < segs.length; i += 5) {
        const [x1, y1, x2, y2, c] = segs.slice(i, i + 5);
        const L = Math.hypot(x2 - x1, y2 - y1); if (L < 1) continue;
        const ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux;
        const ang = Math.atan2(uy, ux);
        const half = c === 1 ? 9 : c === 2 ? 1.5 : 6;
        for (let t = rnd() * 8; t < L; t += 7 + rnd() * 6) {
          const px = x1 + ux * t, py = y1 + uy * t;
          const side = rnd() < 0.5 ? -1 : 1;
          const r = rnd();
          if (c === 2) { if (r < 0.35) figs.push({ x: px + nx * side * 1.5, y: py + ny * side * 1.5, k: rnd() < 0.5 ? 0 : 1, a: ang + (rnd() - 0.5) * 2, v: rnd() }); continue; }
          if (r < 0.42) figs.push({ x: px + nx * side * (half + 1 + rnd() * 2), y: py + ny * side * (half + 1 + rnd() * 2), k: rnd() < 0.55 ? 0 : 1, a: ang + (rnd() - 0.5) * 3, v: rnd() });
          else if (r < 0.6) figs.push({ x: px + nx * side * (half * 0.4), y: py + ny * side * (half * 0.4), k: rnd() < 0.2 ? 7 : 2, a: ang + (side < 0 ? Math.PI : 0), v: rnd() });
          else if (r < 0.66) figs.push({ x: px + nx * side * (half + 5), y: py + ny * side * (half + 5), k: 3, a: rnd() * 6, v: rnd() });
          else if (r < 0.69) figs.push({ x: px + nx * side * half * 0.8, y: py + ny * side * half * 0.8, k: 4, a: ang, v: rnd() });
          else if (r < 0.71) figs.push({ x: px + nx * side * (half + 2), y: py + ny * side * (half + 2), k: 5, a: rnd() * 6, v: rnd() });
          else if (r < 0.73) figs.push({ x: px + nx * side * (half + 3.5), y: py + ny * side * (half + 3.5), k: 6, a: ang, v: rnd() });
        }
      }
    }
    this.cache.set(key, figs);
    return figs;
  }
}

const INK = '#cfe3f5';
const FILL = '#0d1b2b';

/** Zeichnet eine Figur im Weltkoordinatensystem (Meter), bereits an x,y verschoben und gedreht */
export function drawFig(ctx: CanvasRenderingContext2D, k: number, v: number) {
  ctx.strokeStyle = INK; ctx.fillStyle = FILL; ctx.lineWidth = 0.28;
  switch (FIG_KINDS[k]) {
    case 'person':
    case 'person2': {
      // Draufsicht: Schultern + Kopf (+ Arme)
      ctx.beginPath(); ctx.ellipse(0, 0, 0.55, 1.05, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (k === 1) { ctx.beginPath(); ctx.moveTo(0.2, 0.9); ctx.lineTo(0.9, 1.4); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0.1, 0, 0.5, 0, Math.PI * 2); ctx.fillStyle = v > 0.6 ? INK : FILL; ctx.fill(); ctx.stroke();
      break;
    }
    case 'car':
    case 'cab': {
      ctx.fillStyle = k === 7 ? '#3a3410' : FILL;
      ctx.beginPath(); ctx.roundRect(-2.2, -0.95, 4.4, 1.9, 0.5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(-0.9, -0.75, 1.9, 1.5, 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -0.75); ctx.lineTo(1.5, -0.6); ctx.moveTo(1, 0.75); ctx.lineTo(1.5, 0.6); ctx.stroke();
      break;
    }
    case 'tree': {
      ctx.beginPath();
      for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 2, r = 2.2 + (i % 2 ? 0.45 : 0) + v * 0.4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'bike': {
      ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(1, 0); ctx.moveTo(0.7, -0.4); ctx.lineTo(0.7, 0.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.1, 0, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    }
    case 'dog': {
      ctx.beginPath(); ctx.ellipse(0, 0, 0.7, 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0.8, 0, 0.25, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.7, 0); ctx.lineTo(-1.1, 0.25); ctx.stroke();
      break;
    }
    case 'bench': {
      ctx.beginPath(); ctx.rect(-1, -0.3, 2, 0.6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(1, 0); ctx.stroke();
      break;
    }
  }
}

/** Versteckte Hinweise – gleicher Zeichenstil, aber eigene Formen */
export function drawClue(ctx: CanvasRenderingContext2D, icon: string) {
  ctx.scale(1.5, 1.5);
  ctx.strokeStyle = '#f6efd8'; ctx.fillStyle = FILL; ctx.lineWidth = 0.3;
  switch (icon) {
    case 'shoe':
      ctx.beginPath(); ctx.ellipse(0, -0.55, 0.55, 0.75, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0.75, 0.42, 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-0.4, -0.55 + i * 0.25); ctx.lineTo(0.4, -0.55 + i * 0.25); ctx.stroke(); }
      break;
    case 'cig':
      ctx.beginPath(); ctx.rect(-0.9, -0.18, 1.8, 0.36); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.35, -0.18); ctx.lineTo(0.35, 0.18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.9, 0); ctx.quadraticCurveTo(-1.4, -0.5, -1.2, -0.9); ctx.stroke();
      break;
    case 'pick':
      ctx.beginPath(); ctx.moveTo(-1.2, 0); ctx.lineTo(0.8, 0); ctx.lineTo(1.1, -0.35); ctx.stroke();
      ctx.beginPath(); ctx.rect(-1.5, -0.2, 0.5, 0.4); ctx.stroke();
      break;
    case 'cup':
      ctx.beginPath(); ctx.arc(0, 0, 0.75, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 0.45, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0.25, -0.2, 0.08, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'ticket':
      ctx.beginPath(); ctx.rect(-0.9, -0.55, 1.8, 1.1); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.9, 0.2); ctx.lineTo(0.9, 0.2); ctx.stroke();
      break;
    case 'paper':
      ctx.beginPath(); ctx.moveTo(-0.9, -0.6); ctx.lineTo(0.3, -0.9); ctx.lineTo(0.9, -0.2); ctx.lineTo(0.6, 0.8); ctx.lineTo(-0.5, 0.7); ctx.lineTo(-0.8, 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.5, -0.4); ctx.lineTo(0.4, 0.4); ctx.moveTo(0.3, -0.6); ctx.lineTo(-0.3, 0.3); ctx.stroke();
      break;
    case 'glove':
      ctx.beginPath(); ctx.roundRect(-0.55, -0.2, 1.1, 1.1, 0.3); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.roundRect(-0.55 + i * 0.28, -1, 0.24, 0.85, 0.12); ctx.stroke(); }
      ctx.beginPath(); ctx.roundRect(0.55, 0, 0.5, 0.25, 0.12); ctx.stroke();
      break;
  }
}
