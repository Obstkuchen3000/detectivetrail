// Baut die Spielkarte für New York aus gemeinfreien/offenen Quellen.
//   Straßen:          US Census TIGER/Line (Public Domain) via github.com/fillerwriter/nyc-streets (Unlicense)
//   Bezirksgrenzen:   NYC Dept. of City Planning "Borough Boundaries (water areas excluded)" via github.com/dwillis/nyc-maps
//   U-Bahn:           MTA Subway Stations / NYC Open Data Subway Lines
// Aufruf: node scripts/build-city-nyc.mjs   (lädt Rohdaten nach data-src/, schreibt public/cities/nyc/map.json)
import fs from 'node:fs';
import path from 'node:path';

const SRC = {
  streets: 'https://raw.githubusercontent.com/fillerwriter/nyc-streets/HEAD/nyc-streets.geojson',
  boroughs: 'https://raw.githubusercontent.com/dwillis/nyc-maps/master/boroughs.geojson',
  stations: 'https://raw.githubusercontent.com/yangdanny97/nyc-subway-vis/HEAD/subway_stations.geojson',
  lines: 'https://raw.githubusercontent.com/jeanpan/nyc-subway-entrances-map/HEAD/data/MTA_subway_lines.geojson',
};
const RAW = 'data-src/nyc';
const OUT = 'public/cities/nyc/map.json';

// Sichtbarer Kartenausschnitt (lon/lat)
const BBOX = { w: -74.035, e: -73.905, s: 40.695, n: 40.835 };
// Spielgebiet: Manhattan bis zur 125th St
const GAME_MAX_LAT = 40.8165;
const lon0 = (BBOX.w + BBOX.e) / 2, lat0 = (BBOX.s + BBOX.n) / 2;
const KX = 111320 * Math.cos((lat0 * Math.PI) / 180), KY = 110574;
const proj = ([lon, lat]) => [Math.round((lon - lon0) * KX), Math.round((lat0 - lat) * KY)];
const inBox = ([lon, lat], pad = 0) => lon > BBOX.w - pad && lon < BBOX.e + pad && lat > BBOX.s - pad && lat < BBOX.n + pad;

async function load(name) {
  fs.mkdirSync(RAW, { recursive: true });
  const f = path.join(RAW, name + '.geojson');
  if (!fs.existsSync(f)) {
    console.log('lade', SRC[name]);
    const r = await fetch(SRC[name]);
    if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const flat = (pts) => pts.flat();
const len = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

const [streets, boroughs, stationsGj, linesGj] = await Promise.all(['streets', 'boroughs', 'stations', 'lines'].map(load));

// ---------- Land ----------
const land = [];
for (const f of boroughs.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const poly of polys) for (const ring of poly) {
    if (!ring.some((c) => inBox(c, 0.02))) continue;
    const pr = ring.map(proj); const mid = Math.floor(pr.length / 2);
    // geschlossene Ringe in zwei Hälften vereinfachen (Start = Ende)
    const p = [...simplify(pr.slice(0, mid + 1), 4).slice(0, -1), ...simplify(pr.slice(mid), 4)];
    if (p.length >= 4) rings.push(flat(p));
  }
  if (rings.length) land.push({ name: f.properties.BoroName, rings });
}

// ---------- Straßen ----------
const CLS = { S1100: 'highway', S1200: 'major', S1630: 'ramp', S1400: 'local', S1640: 'local', S1730: 'local', S1780: 'local' };
const roads = { highway: [], major: [], ramp: [], local: [], path: [] };
const MAJOR_NAME = /(\bAve\b|Broadway|Bowery|Park Row|Houston|Canal|Delancey|Central Park|Riverside Dr|Frederick Douglass|Adam Clayton|Malcolm X|Lenox|Lexington|Madison Ave|Park Ave|West St|\b(14th|23rd|34th|42nd|57th|59th|72nd|79th|86th|96th|110th|116th|125th) St)/;
const labelCands = {};
for (const f of streets.features) {
  const p = f.properties; let cls = CLS[p.MTFCC] ?? (p.MTFCC?.startsWith('S17') ? 'path' : null);
  if (!cls) continue;
  const name = p.FULLNAME || '';
  if (cls === 'local' && p.COUNTYFP === '061' && MAJOR_NAME.test(name)) cls = 'major';
  const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const part of parts) {
    if (!part.some((c) => inBox(c))) continue;
    const pts = simplify(part.map(proj), 1.5);
    if (pts.length < 2) continue;
    roads[cls].push(flat(pts));
    if (name && (cls === 'major' || cls === 'highway' || cls === 'local') && p.COUNTYFP === '061') {
      const L = len(pts); if (L < 120) continue;
      const a = pts[0], b = pts[pts.length - 1];
      const mid = pts[Math.floor(pts.length / 2)];
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      (labelCands[name] ??= []).push({ x: mid[0], y: mid[1], a: +ang.toFixed(3), L, cls });
    }
  }
}
const labels = [];
for (const [name, cands] of Object.entries(labelCands)) {
  cands.sort((p, q) => q.L - p.L);
  const chosen = [];
  const major = cands[0].cls !== 'local';
  const spacing = major ? 900 : 100000;
  for (const c of cands) { if (chosen.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > spacing)) chosen.push(c); if (chosen.length > (major ? 14 : 1)) break; }
  for (const c of chosen) labels.push({ t: name, x: c.x, y: c.y, a: c.a, m: major ? 1 : 0 });
}

// ---------- U-Bahn-Linien ----------
const subway = [];
for (const f of linesGj.features) {
  const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const part of parts) {
    if (!part.some((c) => inBox(c))) continue;
    const pts = simplify(part.map(proj), 3);
    if (pts.length >= 2) subway.push({ r: f.properties.Line, p: flat(pts) });
  }
}

// ---------- Stationen (nach Station-Komplex zusammengefasst) ----------
const raw = stationsGj.features.map((f) => ({ ...f.properties, c: f.geometry.coordinates }));
const complexes = new Map();
for (const s of raw) {
  if (!inBox(s.c)) continue;
  const key = s.complex_id;
  const e = complexes.get(key) ?? { ids: [], names: new Set(), routes: new Set(), pts: [], borough: s.borough, lat: [] };
  e.ids.push(+s.station_id); e.names.add(s.stop_name); s.daytime_routes.split(' ').forEach((r) => e.routes.add(r));
  e.pts.push(proj(s.c)); e.lat.push(s.c[1]);
  complexes.set(key, e);
}
const stations = []; const stIndexById = new Map();
for (const [cid, e] of complexes) {
  const x = Math.round(e.pts.reduce((s, p) => s + p[0], 0) / e.pts.length), y = Math.round(e.pts.reduce((s, p) => s + p[1], 0) / e.pts.length);
  const lat = e.lat.reduce((a, b) => a + b, 0) / e.lat.length;
  const idx = stations.length;
  stations.push({ id: 'st' + cid, name: [...e.names].sort((a, b) => b.length - a.length)[0], routes: [...e.routes].sort(), x, y, game: e.borough === 'M' && lat < GAME_MAX_LAT });
  e.ids.forEach((id) => stIndexById.set(id, idx));
}
// Kanten: pro Linie aufeinanderfolgende Stationen (Reihenfolge nach station_id)
const edgeMap = new Map();
const routes = new Set(raw.flatMap((s) => s.daytime_routes.split(' ')));
for (const r of routes) {
  const list = raw.filter((s) => s.daytime_routes.split(' ').includes(r) && stIndexById.has(+s.station_id)).sort((a, b) => a.station_id - b.station_id);
  for (let i = 1; i < list.length; i++) {
    const a = stIndexById.get(+list[i - 1].station_id), b = stIndexById.get(+list[i].station_id);
    if (a === b) continue;
    const d = Math.hypot(stations[a].x - stations[b].x, stations[a].y - stations[b].y);
    if (d > 3200) continue;
    const k = Math.min(a, b) + '-' + Math.max(a, b);
    const e = edgeMap.get(k) ?? { a: Math.min(a, b), b: Math.max(a, b), routes: new Set() };
    e.routes.add(r); edgeMap.set(k, e);
  }
}
const subwayEdges = [...edgeMap.values()].map((e) => [e.a, e.b, [...e.routes].sort().join('')]);

// Central Park (Eckpunkte aus bekannten Koordinaten: Columbus Circle, Grand Army Plaza, 5th Ave/110th, CPW/110th)
const parks = [{ name: 'Central Park', ring: flat([[-73.98173, 40.76811], [-73.97302, 40.76452], [-73.94930, 40.79685], [-73.95814, 40.80055]].map(proj)) }];

const [bx0, by0] = proj([BBOX.w, BBOX.n]), [bx1, by1] = proj([BBOX.e, BBOX.s]);
const out = {
  city: 'New York', origin: [lon0, lat0], scale: [KX, KY], bounds: [bx0, by0, bx1, by1],
  attribution: 'Straßen: US Census Bureau TIGER/Line (Public Domain) · Bezirke: NYC Dept. of City Planning · U-Bahn: MTA / NYC Open Data',
  land, parks, roads, labels, subway, stations, subwayEdges,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('geschrieben', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB',
  Object.fromEntries(Object.entries(roads).map(([k, v]) => [k, v.length])), 'Labels', labels.length, 'Stationen', stations.length, 'davon Spiel', stations.filter((s) => s.game).length, 'Kanten', subwayEdges.length);
