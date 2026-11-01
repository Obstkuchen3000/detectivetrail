import type { Room, RoomKind } from '../game/building';
import { Rng, hash2 } from '../game/rng';

/**
 * Prozedurales Raumbild (Frontalansicht, Strichzeichnung) für die Gebäudedurchsuchung.
 * Versteckt sich der Flüchtige hier, steht er halb verdeckt hinter einem Möbelstück.
 */
const INK = '#cfe3f5', FILL = '#0d1b2b', W = 520, H = 320, FLOOR = 262;

type Item = { w: number; draw: (x: number) => string; cover?: boolean; decoy?: boolean; low?: boolean };
const st = `stroke="${INK}" stroke-width="2" fill="${FILL}" stroke-linejoin="round"`;
const ln = `stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"`;

const I = {
  bed: (): Item => ({ w: 130, draw: (x) => `<rect x="${x}" y="${FLOOR - 50}" width="130" height="34" ${st}/><rect x="${x}" y="${FLOOR - 78}" width="16" height="78" ${st}/><rect x="${x + 20}" y="${FLOOR - 62}" width="34" height="14" rx="5" ${st}/><line x1="${x + 6}" y1="${FLOOR - 16}" x2="${x + 6}" y2="${FLOOR}" ${ln}/><line x1="${x + 124}" y1="${FLOOR - 16}" x2="${x + 124}" y2="${FLOOR}" ${ln}/>` }),
  wardrobe: (): Item => ({ w: 70, cover: true, draw: (x) => `<rect x="${x}" y="${FLOOR - 150}" width="70" height="150" ${st}/><line x1="${x + 35}" y1="${FLOOR - 146}" x2="${x + 35}" y2="${FLOOR - 4}" ${ln}/><circle cx="${x + 30}" cy="${FLOOR - 80}" r="2" fill="${INK}"/><circle cx="${x + 40}" cy="${FLOOR - 80}" r="2" fill="${INK}"/>` }),
  desk: (): Item => ({ low: true, w: 100, cover: true, draw: (x) => `<rect x="${x}" y="${FLOOR - 62}" width="100" height="10" ${st}/><rect x="${x + 4}" y="${FLOOR - 52}" width="92" height="52" ${st}/><rect x="${x + 30}" y="${FLOOR - 92}" width="36" height="26" ${st}/><line x1="${x + 48}" y1="${FLOOR - 66}" x2="${x + 48}" y2="${FLOOR - 62}" ${ln}/>` }),
  curtain: (): Item => ({ w: 80, cover: true, draw: (x) => `<rect x="${x + 6}" y="${FLOOR - 200}" width="68" height="80" fill="#132a42" stroke="${INK}" stroke-width="2"/><path d="M${x} ${FLOOR - 206} q10 100 0 206 h36 q-8 -100 0 -206z" ${st}/><path d="M${x + 80} ${FLOOR - 206} q-10 100 0 206 h-30 q8 -100 0 -206z" ${st}/><line x1="${x - 4}" y1="${FLOOR - 206}" x2="${x + 84}" y2="${FLOOR - 206}" ${ln}/>` }),
  lamp: (): Item => ({ w: 34, decoy: true, draw: (x) => `<line x1="${x + 17}" y1="${FLOOR}" x2="${x + 17}" y2="${FLOOR - 120}" ${ln}/><circle cx="${x + 17}" cy="${FLOOR - 128}" r="11" ${st}/><line x1="${x + 6}" y1="${FLOOR}" x2="${x + 28}" y2="${FLOOR}" ${ln}/>` }),
  coat: (): Item => ({ w: 40, decoy: true, draw: (x) => `<line x1="${x + 20}" y1="${FLOOR}" x2="${x + 20}" y2="${FLOOR - 150}" ${ln}/><circle cx="${x + 20}" cy="${FLOOR - 140}" r="8" ${st}/><path d="M${x + 6} ${FLOOR - 128} h28 l4 70 h-36z" ${st}/>` }),
  plant: (): Item => ({ w: 44, decoy: true, draw: (x) => `<rect x="${x + 10}" y="${FLOOR - 30}" width="24" height="30" ${st}/><path d="M${x + 22} ${FLOOR - 30} q-24 -40 -6 -70 M${x + 22} ${FLOOR - 30} q20 -30 10 -64 M${x + 22} ${FLOOR - 30} q2 -50 0 -84" ${ln}/>` }),
  shelf: (): Item => ({ w: 90, cover: true, draw: (x) => `<rect x="${x}" y="${FLOOR - 140}" width="90" height="140" ${st}/>${[1, 2, 3].map((i) => `<line x1="${x}" y1="${FLOOR - 140 + i * 35}" x2="${x + 90}" y2="${FLOOR - 140 + i * 35}" ${ln}/>`).join('')}${[0, 1, 2, 3].map((i) => `<rect x="${x + 8 + i * 20}" y="${FLOOR - 132 + (i % 2) * 35}" width="12" height="24" ${st}/>`).join('')}` }),
  boxes: (): Item => ({ low: true, w: 96, cover: true, draw: (x) => `<rect x="${x}" y="${FLOOR - 50}" width="50" height="50" ${st}/><rect x="${x + 46}" y="${FLOOR - 60}" width="50" height="60" ${st}/><rect x="${x + 12}" y="${FLOOR - 96}" width="54" height="46" ${st}/><line x1="${x + 25}" y1="${FLOOR - 50}" x2="${x + 25}" y2="${FLOOR - 36}" ${ln}/><line x1="${x + 39}" y1="${FLOOR - 96}" x2="${x + 39}" y2="${FLOOR - 80}" ${ln}/>` }),
  car: (): Item => ({ low: true, w: 150, cover: true, draw: (x) => `<path d="M${x} ${FLOOR - 22} v-26 q4 -10 20 -12 l24 -26 h58 l28 26 q18 2 20 14 v24z" ${st}/><circle cx="${x + 32}" cy="${FLOOR - 18}" r="16" ${st}/><circle cx="${x + 118}" cy="${FLOOR - 18}" r="16" ${st}/><path d="M${x + 50} ${FLOOR - 60} l16 -20 h40 l18 20z" ${ln}/>` }),
  pillar: (): Item => ({ w: 40, cover: true, draw: (x) => `<rect x="${x}" y="${FLOOR - 230}" width="40" height="230" ${st}/><line x1="${x}" y1="${FLOOR - 120}" x2="${x + 40}" y2="${FLOOR - 120}" stroke="#facc15" stroke-width="3"/>` }),
  acunit: (): Item => ({ low: true, w: 110, cover: true, draw: (x) => `<rect x="${x}" y="${FLOOR - 80}" width="110" height="80" ${st}/><circle cx="${x + 55}" cy="${FLOOR - 40}" r="26" ${st}/><line x1="${x + 30}" y1="${FLOOR - 40}" x2="${x + 80}" y2="${FLOOR - 40}" ${ln}/><line x1="${x + 55}" y1="${FLOOR - 66}" x2="${x + 55}" y2="${FLOOR - 14}" ${ln}/>` }),
  tank: (): Item => ({ w: 90, cover: true, draw: (x) => `<rect x="${x + 6}" y="${FLOOR - 170}" width="78" height="120" rx="8" ${st}/><path d="M${x + 6} ${FLOOR - 170} l39 -22 l39 22" ${st}/><line x1="${x + 14}" y1="${FLOOR - 50}" x2="${x + 6}" y2="${FLOOR}" ${ln}/><line x1="${x + 76}" y1="${FLOOR - 50}" x2="${x + 84}" y2="${FLOOR}" ${ln}/>` }),
  counter: (): Item => ({ low: true, w: 140, cover: true, draw: (x) => `<rect x="${x}" y="${FLOOR - 70}" width="140" height="70" ${st}/><rect x="${x - 4}" y="${FLOOR - 76}" width="148" height="8" ${st}/>${[0, 1, 2].map((i) => `<rect x="${x + 10 + i * 44}" y="${FLOOR - 58}" width="36" height="48" ${st}/>`).join('')}` }),
  fridge: (): Item => ({ w: 64, cover: true, draw: (x) => `<rect x="${x}" y="${FLOOR - 170}" width="64" height="170" rx="4" ${st}/><line x1="${x}" y1="${FLOOR - 110}" x2="${x + 64}" y2="${FLOOR - 110}" ${ln}/><line x1="${x + 54}" y1="${FLOOR - 150}" x2="${x + 54}" y2="${FLOOR - 124}" ${ln}/>` }),
  washer: (): Item => ({ w: 62, draw: (x) => `<rect x="${x}" y="${FLOOR - 78}" width="62" height="78" ${st}/><circle cx="${x + 31}" cy="${FLOOR - 40}" r="20" ${st}/><circle cx="${x + 31}" cy="${FLOOR - 40}" r="12" ${ln}/>` }),
  cart: (): Item => ({ low: true, w: 84, cover: true, draw: (x) => `<path d="M${x} ${FLOOR - 96} h84 l-8 80 h-68z" ${st}/><path d="M${x + 6} ${FLOOR - 96} q12 -16 24 0 q12 -18 26 0 q12 -14 24 0" ${ln}/><circle cx="${x + 16}" cy="${FLOOR - 8}" r="8" ${st}/><circle cx="${x + 68}" cy="${FLOOR - 8}" r="8" ${st}/>` }),
  rack: (): Item => ({ w: 110, cover: true, draw: (x) => `<line x1="${x}" y1="${FLOOR - 150}" x2="${x + 110}" y2="${FLOOR - 150}" ${ln}/><line x1="${x + 6}" y1="${FLOOR - 150}" x2="${x + 6}" y2="${FLOOR}" ${ln}/><line x1="${x + 104}" y1="${FLOOR - 150}" x2="${x + 104}" y2="${FLOOR}" ${ln}/>${[0, 1, 2, 3, 4].map((i) => `<path d="M${x + 12 + i * 19} ${FLOOR - 150} l-4 8 h24 l-4 -8 M${x + 8 + i * 19} ${FLOOR - 142} h22 v90 h-22z" ${st}/>`).join('')}` }),
  mannequin: (): Item => ({ w: 40, decoy: true, draw: (x) => `<circle cx="${x + 20}" cy="${FLOOR - 160}" r="11" ${st}/><path d="M${x + 6} ${FLOOR - 146} h28 l-4 60 h-20z" ${st}/><line x1="${x + 20}" y1="${FLOOR - 86}" x2="${x + 20}" y2="${FLOOR - 6}" ${ln}/><line x1="${x + 8}" y1="${FLOOR - 4}" x2="${x + 32}" y2="${FLOOR - 4}" ${ln}/>` }),
  machine: (): Item => ({ low: true, w: 100, cover: true, draw: (x) => `<rect x="${x}" y="${FLOOR - 120}" width="100" height="120" ${st}/>${[0, 1, 2].map((i) => `<circle cx="${x + 20 + i * 30}" cy="${FLOOR - 96}" r="7" ${st}/>`).join('')}<rect x="${x + 12}" y="${FLOOR - 70}" width="76" height="40" ${st}/><path d="M${x + 100} ${FLOOR - 100} h40 v-120" ${ln}/>` }),
  server: (): Item => ({ w: 70, cover: true, draw: (x) => `<rect x="${x}" y="${FLOOR - 180}" width="70" height="180" ${st}/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<line x1="${x + 8}" y1="${FLOOR - 166 + i * 22}" x2="${x + 62}" y2="${FLOOR - 166 + i * 22}" ${ln}/><circle cx="${x + 56}" cy="${FLOOR - 160 + i * 22}" r="2" fill="#4ade80"/>`).join('')}` }),
  stairs: (): Item => ({ w: 150, cover: true, draw: (x) => `<path d="M${x} ${FLOOR} ${[0, 1, 2, 3, 4, 5, 6].map((i) => `v-${22} h20`).join(' ')} V${FLOOR}z" ${st}/><line x1="${x}" y1="${FLOOR - 40}" x2="${x + 140}" y2="${FLOOR - 190}" ${ln}/>` }),
  door: (): Item => ({ w: 60, draw: (x) => `<rect x="${x}" y="${FLOOR - 170}" width="60" height="170" ${st}/><circle cx="${x + 48}" cy="${FLOOR - 85}" r="3" fill="${INK}"/><rect x="${x + 14}" y="${FLOOR - 196}" width="32" height="16" fill="#14532d" stroke="${INK}"/><text x="${x + 30}" y="${FLOOR - 184}" font-size="9" fill="#86efac" text-anchor="middle" font-family="monospace">EXIT</text>` }),
  suitcase: (): Item => ({ w: 46, decoy: true, draw: (x) => `<rect x="${x}" y="${FLOOR - 52}" width="46" height="52" rx="4" ${st}/><path d="M${x + 14} ${FLOOR - 52} v-10 h18 v10" ${ln}/>` }),
};

const PALETTE: Record<RoomKind, (() => Item)[]> = {
  zimmer: [I.bed, I.wardrobe, I.desk, I.curtain, I.lamp, I.suitcase, I.coat],
  buero: [I.desk, I.desk, I.shelf, I.plant, I.coat, I.server, I.lamp],
  lager: [I.boxes, I.boxes, I.shelf, I.boxes, I.cart, I.pillar],
  technik: [I.machine, I.server, I.boxes, I.pillar, I.shelf],
  garage: [I.car, I.pillar, I.car, I.boxes],
  dach: [I.acunit, I.tank, I.acunit, I.door],
  kueche: [I.counter, I.fridge, I.cart, I.shelf, I.coat],
  waesche: [I.washer, I.washer, I.cart, I.shelf, I.cart],
  laden: [I.rack, I.mannequin, I.counter, I.rack, I.mannequin, I.plant],
  treppe: [I.stairs, I.door, I.plant, I.coat],
  lobby: [I.counter, I.plant, I.lamp, I.suitcase],
};

/** Person: Strichfigur, halb hinter dem Möbel */
const person = (x: number, crouch: boolean) => {
  const top = crouch ? FLOOR - 92 : FLOOR - 172;
  return `<g data-hit="fug" class="fug" style="cursor:crosshair">
    <circle cx="${x}" cy="${top}" r="12" stroke="${INK}" stroke-width="2" fill="#16273b"/>
    <path d="M${x - 9} ${top - 6} q9 -14 18 0" stroke="${INK}" stroke-width="2" fill="#0b1320"/>
    <circle cx="${x - 4}" cy="${top + 1}" r="1.6" fill="${INK}"/><circle cx="${x + 4}" cy="${top + 1}" r="1.6" fill="${INK}"/>
    <path d="M${x - 16} ${top + 14} h32 l6 ${crouch ? 48 : 78} h-44z" stroke="${INK}" stroke-width="2" fill="#16273b"/>
    <line x1="${x - 8}" y1="${top + (crouch ? 62 : 92)}" x2="${x - 10}" y2="${FLOOR}" stroke="${INK}" stroke-width="2"/>
    <line x1="${x + 8}" y1="${top + (crouch ? 62 : 92)}" x2="${x + 10}" y2="${FLOOR}" stroke="${INK}" stroke-width="2"/>
    <rect x="${x - 26}" y="${top - 18}" width="52" height="${FLOOR - top + 22}" fill="transparent"/>
  </g>`;
};

const clueArt = (x: number, kind: number) => `<g data-hit="clue" style="cursor:crosshair">${kind === 0
  ? [0, 1, 2, 3].map((i) => `<ellipse cx="${x + i * 22}" cy="${FLOOR + 14 + (i % 2) * 8}" rx="7" ry="4" fill="none" stroke="#f6efd8" stroke-width="1.6"/>`).join('')
  : kind === 1 ? `<rect x="${x}" y="${FLOOR - 16}" width="16" height="16" fill="${FILL}" stroke="#f6efd8" stroke-width="1.6"/><path d="M${x + 4} ${FLOOR - 20} q4 -8 0 -14 M${x + 11} ${FLOOR - 20} q4 -8 0 -14" stroke="#f6efd8" stroke-width="1.2" fill="none"/>`
    : `<path d="M${x} ${FLOOR + 6} l18 -3 l6 10 l-16 4z" fill="${FILL}" stroke="#f6efd8" stroke-width="1.6"/><line x1="${x + 3}" y1="${FLOOR + 8}" x2="${x + 18}" y2="${FLOOR + 5}" stroke="#f6efd8"/>`}<rect x="${x - 8}" y="${FLOOR - 26}" width="${kind === 0 ? 86 : 40}" height="46" fill="transparent"/></g>`;

export function roomSvg(seed: number, room: Room, opts: { fugitive: boolean; clue: boolean }): string {
  const rng = new Rng(hash2(room.id, room.floor * 31 + room.idx, seed));
  const pal = PALETTE[room.kind];
  const items: Item[] = [];
  let used = 0;
  const pool = rng.shuffle(pal.slice());
  for (const make of [...pool, ...rng.shuffle(pal.slice())]) {
    const it = make();
    if (used + it.w + 26 > W - 40) continue;
    items.push(it); used += it.w + 26;
    if (items.length >= 5) break;
  }
  if (!items.some((i) => i.cover)) items[0] = (pal.map((m) => m()).find((i) => i.cover) ?? items[0]);
  rng.shuffle(items);
  const gap = (W - 40 - items.reduce((s, i) => s + i.w, 0)) / (items.length + 1);
  let x = 20 + gap;
  const placed = items.map((it) => { const p = { it, x }; x += it.w + gap; return p; });
  const covers = placed.filter((p) => p.it.cover);
  const hideAt = covers[rng.int(covers.length)];
  const wall = room.kind === 'dach' ? `<rect width="${W}" height="${FLOOR}" fill="#081a30"/>${Array.from({ length: 9 }, (_, i) => `<rect x="${i * 60 + rng.int(20)}" y="${110 + rng.int(60)}" width="${30 + rng.int(20)}" height="${FLOOR - 110}" fill="#0c223b" stroke="#1e3f63"/>`).join('')}`
    : `<rect width="${W}" height="${FLOOR}" fill="#0f2034"/>${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 46}" y1="0" x2="${i * 46}" y2="${FLOOR}" stroke="#13283f"/>`).join('')}`;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="room-svg" xmlns="http://www.w3.org/2000/svg">${wall}<rect y="${FLOOR}" width="${W}" height="${H - FLOOR}" fill="#0a1626"/><line x1="0" y1="${FLOOR}" x2="${W}" y2="${FLOOR}" stroke="#2a5a85" stroke-width="2"/>`;
  for (const p of placed) {
    if (opts.fugitive && p === hideAt) {
      // Person hinter dem Möbel – je nach Möbel geduckt, Kopf oder Schulter lugen hervor
      const side = rng.next() < 0.5 ? -1 : 1;
      // halb dahinter: nur ein Streifen von Kopf/Schulter/Bein lugt hervor
      const px = side < 0 ? p.x + 4 + rng.int(6) : p.x + p.it.w - 4 - rng.int(6);
      svg += person(px, !!p.it.low);
    }
    svg += `<g>${p.it.draw(p.x)}</g>`;
  }
  if (opts.clue) svg += clueArt(30 + rng.int(W - 140), rng.int(3));
  svg += `</svg>`;
  return svg;
}
