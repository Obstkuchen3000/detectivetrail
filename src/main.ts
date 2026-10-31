import './style.css';
import { CITIES } from './data/cities';
import { CASES } from './cases/nyc-saphir';
import type { CaseDef } from './cases/types';
import { Game, type GameMode } from './game/game';
import type { CityMap, MoveOption, Trace } from './game/types';
import { MapView, routeColor, type Tool, type Viewer } from './map/MapView';
import { askText, fill, h, modal, toast } from './ui/dom';
import { Pinboard } from './ui/pinboard';
import { InterrogationRoom } from './ui/interrogation';

const app = document.getElementById('app')!;
const mapCache = new Map<string, Promise<CityMap>>();
const loadMap = (url: string) => { if (!mapCache.has(url)) mapCache.set(url, fetch(url).then((r) => r.json())); return mapCache.get(url)!; };

// ---------------- Menüs ----------------
function screen(...children: (Node | string | null | undefined | false)[]) {
  fill(app, h('div', { class: 'screen' }, h('div', { class: 'screen-inner' }, ...children)));
}

function title() {
  screen(
    h('div', { class: 'logo' }, h('span', {}, 'DETECTIVE'), h('span', { class: 'accent' }, 'TRAIL')),
    h('p', { class: 'tag' }, 'Lagezentrum · Pinnwand · Verhörraum'),
    h('div', { class: 'col' },
      h('button', { class: 'btn big', onclick: cityMenu }, '▶ Neuer Fall'),
      h('button', { class: 'btn ghost', onclick: rules }, 'Spielregeln'),
    ),
    h('p', { class: 'foot' }, 'Ein Ermittlungsspiel auf echten Stadtkarten.'),
  );
}

function cityMenu() {
  screen(
    h('h2', {}, 'Stadt wählen'),
    h('div', { class: 'grid' }, ...CITIES.map((c) =>
      h('button', { class: 'tile' + (c.available ? '' : ' locked'), disabled: !c.available, onclick: () => modeMenu(c.id) },
        h('div', { class: 'tile-title' }, c.name), h('div', { class: 'tile-sub' }, c.country + ' · ' + c.tagline)))),
    h('button', { class: 'btn ghost', onclick: title }, '← Zurück'),
  );
}

function modeMenu(cityId: string) {
  screen(
    h('h2', {}, 'Spielmodus'),
    h('div', { class: 'grid two' },
      h('button', { class: 'tile', onclick: () => caseMenu(cityId, 'solo') }, h('div', { class: 'tile-title' }, '🕵️ Solo'), h('div', { class: 'tile-sub' }, 'Sie ermitteln, der Computer steuert den Flüchtigen.')),
      h('button', { class: 'tile', onclick: () => caseMenu(cityId, 'hotseat') }, h('div', { class: 'tile-title' }, '👥 2 Spieler'), h('div', { class: 'tile-sub' }, 'An einem Gerät: Eine Person ermittelt, die andere flieht verdeckt.')),
    ),
    h('button', { class: 'btn ghost', onclick: cityMenu }, '← Zurück'),
  );
}

function caseMenu(cityId: string, mode: GameMode) {
  const cases = CASES.filter((c) => c.cityId === cityId);
  screen(
    h('h2', {}, 'Fall wählen'),
    h('div', { class: 'grid' }, ...cases.map((c) =>
      h('button', { class: 'tile case', onclick: () => briefing(cityId, c, mode) }, h('div', { class: 'tile-title' }, c.title), h('div', { class: 'tile-sub' }, c.subtitle + ` · ${c.maxRounds} Runden`)))),
    h('button', { class: 'btn ghost', onclick: () => modeMenu(cityId) }, '← Zurück'),
  );
}

function briefing(cityId: string, c: CaseDef, mode: GameMode) {
  const city = CITIES.find((x) => x.id === cityId)!;
  const ready = loadMap(city.mapUrl!);
  screen(
    h('div', { class: 'dossier' },
      h('div', { class: 'classified' }, 'VERTRAULICH · ' + city.name.toUpperCase()),
      h('h2', {}, 'Akte: ' + c.title),
      ...c.briefing.map((p) => h('p', {}, p)),
      mode === 'hotseat' ? h('p', { class: 'warn' }, 'Zwei Spieler: Vor jedem Zug erscheint ein Übergabe-Bildschirm. Wer ermittelt, schaut weg, während der Flüchtige zieht.') : null,
    ),
    h('div', { class: 'row center' },
      h('button', { class: 'btn ghost', onclick: () => caseMenu(cityId, mode) }, '← Zurück'),
      h('button', { class: 'btn big', onclick: async (e: Event) => { (e.target as HTMLButtonElement).textContent = 'Lade Karte…'; startGame(await ready, c, mode); } }, 'Ermittlung starten'),
    ),
  );
}

function rules() {
  modal(h('div', { class: 'rules' },
    h('h2', {}, 'Spielregeln'),
    h('h4', {}, 'Ziel'),
    h('p', {}, 'Ermitteln Sie, wer der Täter ist, beantragen Sie einen Haftbefehl und stellen Sie den Flüchtigen mit einer Einheit, bevor die letzte Runde vorbei ist.'),
    h('h4', {}, 'Ablauf einer Runde'),
    h('p', {}, 'Zuerst zieht der Flüchtige verdeckt: zu Fuß zu einem Nachbarknoten, mit der U-Bahn bis zu 4 Stationen auf einer Linie, mit dem Taxi (0,7 bis 2,6 km, nur 3 Fahrten) oder er taucht ab und bleibt stehen. Danach sind Sie dran. Jede Einheit fährt bis zu 1,5 km weit, und Sie haben 2 Einsatzpunkte (EP).'),
    h('h4', {}, 'Spuren'),
    h('ul', {},
      h('li', {}, 'U-Bahn: Die Einstiegsstation und die Linie werden bekannt, das Ziel nicht.'),
      h('li', {}, 'Taxi: Es gibt einen ungefähren Zielradius.'),
      h('li', {}, 'Kameras (rote Punkte): An diesen Knoten wird der Flüchtige mit einer gewissen Wahrscheinlichkeit erfasst, mit Haftbefehl noch eher.'),
      h('li', {}, 'Funkzelle: In bestimmten Runden gibt es einen Radius, in dem sich der Flüchtige befindet.'),
      h('li', {}, 'Fundstücke: Der Flüchtige verliert unterwegs Dinge. Richten Sie ein Suchgebiet ein (1 EP), zoomen Sie tief hinein und finden Sie sie im Gewusel.'),
    ),
    h('h4', {}, 'Werkzeuge'),
    h('p', {}, 'Mit Markierung, Person, Radius, Linie und Notiz zeichnen Sie Ihre Überlegungen auf die Karte. Auf der Pinnwand verbinden Sie Hinweise mit roten Fäden. Im Verhörraum telefonieren Sie (1 EP) oder befragen Personen vor Ort, wenn eine Einheit dort ist.'),
    h('h4', {}, 'Festnahme'),
    h('p', {}, 'Steht eine Einheit am Knoten des Flüchtigen, gibt es Sichtkontakt. Festnehmen dürfen Sie nur mit einem Haftbefehl gegen die richtige Person. Ein falscher Antrag kostet 2 Runden.'),
  ));
}

// ---------------- Spiel ----------------
function startGame(map: CityMap, def: CaseDef, mode: GameMode) {
  const game = new Game(map, def, mode);
  let view: 'map' | 'board' | 'talk' = 'map';
  let reveal = false;
  const viewer = (): Viewer => (game.phase === 'over' ? (reveal ? 'reveal' : 'detective') : game.mode === 'hotseat' && game.phase === 'fugitive' ? 'fugitive' : 'detective');

  const top = h('header', { class: 'topbar' });
  const mapHost = h('div', { class: 'map-host' });
  const tools = h('div', { class: 'toolbar' });
  const side = h('aside', { class: 'side' });
  const mapView = h('section', { class: 'view view-map' }, mapHost, tools, side);
  const pin = new Pinboard(game, () => switchView('talk'));
  const talk = new InterrogationRoom(game, (place) => {
    const n = game.graph.nodes[game.graph.placeIndex.get(place)!]; switchView('map'); mv.focus(n.x, n.y, Math.max(mv.scale, 0.6));
  });
  const overlay = h('div', { class: 'overlay-host' });
  app.replaceChildren(h('div', { class: 'game' }, top, h('main', {}, mapView, pin.el, talk.el), overlay));

  const mv = new MapView(mapHost, map, game, {
    viewer,
    fugitiveOptions: () => game.fugitiveOptions(),
    onFugitivePick: (opts) => chooseFugitiveMove(opts),
    askText,
    onHint: (t) => toast(t, 'info'),
  });
  const sc = game.graph.nodes[game.graph.placeIndex.get(def.crimeScene)!];
  setTimeout(() => mv.focus(sc.x, sc.y, 0.55), 50);

  function switchView(v: typeof view) { view = v; render(); }

  function chooseFugitiveMove(opts: MoveOption[]) {
    const n = game.graph.nodes[opts[0].to];
    const desc: Record<string, string> = { foot: '🚶 Zu Fuß: Kameras können dich erfassen.', subway: '🚇 U-Bahn: Einstieg und Linie werden bekannt.', taxi: '🚕 Taxi: Das Ziel ist ungefähr bekannt. Es bleiben ' + game.fugitive.taxis + ' Fahrten.', stay: '⏸ Abtauchen' };
    const close = modal(h('div', { class: 'ask' },
      h('h3', {}, 'Nach ' + n.name + (n.camera ? ' 📹' : '')),
      ...opts.map((o) => h('button', { class: 'btn wide', onclick: () => { close(); game.applyFugitiveMove(o); } }, desc[o.mode] + (o.route ? ` (Linie ${o.route})` : ''))),
      h('button', { class: 'btn ghost', onclick: () => close() }, 'Abbrechen'),
    ));
  }

  const TOOLS: [Tool, string, string][] = [
    ['select', '🖐', 'Auswählen / Einheiten bewegen / Fundstücke aufheben'],
    ['search', '📡', 'Suchgebiet einrichten (1 EP)'],
    ['pin', '📍', 'Markierung setzen'],
    ['person', '👤', 'Person markieren'],
    ['circle', '◯', 'Suchradius ziehen'],
    ['line', '↗', 'Linie / Route ziehen'],
    ['note', '📝', 'Notiz'],
    ['erase', '⌫', 'Markierung löschen'],
  ];
  const COLORS = ['#ef4444', '#facc15', '#22d3ee', '#4ade80', '#f8fafc'];

  function renderTools() {
    if (viewer() === 'fugitive') { fill(tools, ); return; }
    fill(tools, 
      ...TOOLS.map(([t, icon, tip]) => h('button', { class: 'tool' + (mv.tool === t ? ' on' : ''), title: tip, onclick: () => { mv.tool = t; mv.selectedUnit = null; renderTools(); if (t === 'search') toast('Klicken Sie auf die Karte, um ein Suchgebiet mit 220 m Radius einzurichten.', 'info'); } }, icon)),
      h('div', { class: 'sep' }),
      ...COLORS.map((c) => h('button', { class: 'swatch' + (mv.color === c ? ' on' : ''), style: { background: c }, onclick: () => { mv.color = c; renderTools(); } })),
      h('div', { class: 'sep' }),
      h('button', { class: 'tool', title: 'Ganze Karte', onclick: () => mv.fitToGame() }, '⤢'),
      h('button', { class: 'tool', title: 'Hineinzoomen', onclick: () => mv.zoomAt(mv.w / 2, mv.h / 2, 1.6) }, '+'),
      h('button', { class: 'tool', title: 'Herauszoomen', onclick: () => mv.zoomAt(mv.w / 2, mv.h / 2, 1 / 1.6) }, '−'),
    );
  }

  function traceIcon(t: Trace) { return { start: '✕', cctv: '📹', metrocard: '🚇', taxi: '🚕', ping: '📶', sighting: '👁', item: '◆' }[t.kind]; }

  function renderSide() {
    if (viewer() === 'fugitive') {
      const culprit = def.suspects.find((s) => s.culprit)!;
      const here = game.graph.nodes[game.fugitive.node];
      fill(side, 
        h('div', { class: 'panel fugitive' },
          h('h3', {}, '🦊 Flüchtiger · ' + culprit.name),
          h('p', {}, def.fugitiveIntro),
          h('p', {}, h('b', {}, 'Standort: '), here.name),
          h('p', {}, `🚕 Taxifahrten: ${game.fugitive.taxis} · Runde ${game.round}/${def.maxRounds}`),
          h('div', { class: 'legend' }, h('span', { class: 'lg foot' }, 'zu Fuß'), h('span', { class: 'lg sub' }, 'U-Bahn'), h('span', { class: 'lg taxi' }, 'Taxi')),
          h('p', { class: 'hint' }, 'Klicke auf einen markierten Knoten. Knoten mit 📹 haben Kameras.'),
          h('button', { class: 'btn wide', onclick: () => game.applyFugitiveMove({ to: game.fugitive.node, mode: 'stay' }) }, '⏸ Abtauchen (bleiben, keine Spur)'),
        ),
        traceList(true),
      );
      return;
    }
    fill(side, 
      h('div', { class: 'panel' },
        h('h3', {}, 'Einheiten'),
        ...game.units.map((u, i) => h('button', { class: 'unit-row' + (mv.selectedUnit === i ? ' on' : '') + (u.moved ? ' moved' : ''), onclick: () => { const n = game.graph.nodes[u.node]; mv.tool = 'select'; mv.selectedUnit = u.moved ? null : i; mv.focus(n.x, n.y); render(); } },
          h('span', { class: 'ubadge', style: { borderColor: u.color, color: u.color } }, u.short),
          h('span', { class: 'grow' }, h('b', {}, u.name), h('small', {}, game.graph.nodes[u.node].name)),
          h('small', {}, u.moved ? 'gefahren' : 'bereit'))),
        h('p', { class: 'hint' }, 'Klicken Sie eine Einheit an und dann einen grün markierten Knoten.'),
      ),
      traceList(false),
      h('div', { class: 'panel log' }, h('h3', {}, 'Funkprotokoll'), ...game.log.slice(0, 7).map((l) => h('div', { class: 'logline ' + (l.kind ?? '') }, h('span', {}, 'R' + l.round), ' ' + l.text))),
    );
  }

  function traceList(fug: boolean) {
    const ts = [...game.traces].sort((a, b) => b.round - a.round || b.id - a.id);
    return h('div', { class: 'panel traces' },
      h('h3', {}, fug ? 'Deine Spuren (sichtbar für die Ermittler)' : 'Spuren'),
      ts.length ? null : h('p', { class: 'hint' }, 'Noch keine Spuren.'),
      ...ts.map((t) => h('button', { class: 'trace-row', onclick: () => mv.focus(t.x, t.y, Math.max(mv.scale, t.r ? 0.4 : 0.7)) },
        h('span', { class: 'tr-r' }, 'R' + t.round), h('span', {}, traceIcon(t)), h('span', { class: 'grow' }, t.text),
        t.kind === 'metrocard' ? h('span', { class: 'route', style: { background: routeColor(t.text.slice(-1)) } }, t.text.slice(-1)) : null)),
    );
  }

  function renderTop() {
    const newCards = [...game.board.values()].filter((c) => c.isNew).length;
    const contacts = game.def.contacts.filter((c) => game.contactUnlocked(c));
    const openQ = contacts.reduce((n, c) => n + c.questions.filter((q) => !game.asked.has(c.id + '.' + q.id)).length, 0);
    const det = viewer() === 'detective';
    fill(top, 
      h('div', { class: 'brand' }, 'DT', h('small', {}, def.title)),
      h('div', { class: 'stat' }, h('small', {}, 'RUNDE'), h('b', {}, `${Math.min(game.round, def.maxRounds)}/${def.maxRounds}`)),
      h('div', { class: 'stat' }, h('small', {}, 'EINSATZPUNKTE'), h('b', { class: 'pips' }, ...[0, 1].map((i) => h('i', { class: i < game.ap ? 'on' : '' })))),
      h('div', { class: 'stat' }, h('small', {}, 'HAFTBEFEHL'), h('b', { class: game.warrant ? 'ok' : 'warn' }, game.warrant ? 'liegt vor' : 'fehlt')),
      det ? h('nav', { class: 'tabs' },
        h('button', { class: view === 'map' ? 'on' : '', onclick: () => switchView('map') }, '🗺 Lagekarte'),
        h('button', { class: view === 'board' ? 'on' : '', onclick: () => switchView('board') }, '📌 Pinnwand', newCards ? h('span', { class: 'badge' }, String(newCards)) : null),
        h('button', { class: view === 'talk' ? 'on' : '', onclick: () => switchView('talk') }, '🎙 Verhöre', openQ ? h('span', { class: 'badge dim' }, String(openQ)) : null),
      ) : h('nav', { class: 'tabs' }, h('span', { class: 'fug-label' }, '🦊 Zug des Flüchtigen')),
      h('div', { class: 'grow' }),
      det && game.phase === 'detective' ? h('button', { class: 'btn end', onclick: () => { mv.selectedUnit = null; game.endDetectiveTurn(); } }, 'Runde beenden ▶') : null,
      h('button', { class: 'btn ghost small', onclick: rules }, '?'),
      h('button', { class: 'btn ghost small', onclick: () => { if (confirm('Spiel verlassen?')) { mv.destroy(); title(); } } }, '✕'),
    );
  }

  function renderOverlay() {
    overlay.replaceChildren();
    const culprit = def.suspects.find((s) => s.culprit)!;
    if (game.phase === 'handover-fugitive') {
      overlay.append(h('div', { class: 'handover' }, h('div', {},
        h('div', { class: 'big-icon' }, '🦊'), h('h2', {}, `Runde ${game.round}: Der Flüchtige ist dran`),
        h('p', {}, 'Wer ermittelt, schaut jetzt bitte weg. Gib das Gerät an den Flüchtigen weiter.'),
        h('button', { class: 'btn big', onclick: () => game.beginFugitiveTurn() }, `Ich bin ${culprit.name}, los!`))));
    } else if (game.phase === 'handover-detective') {
      overlay.append(h('div', { class: 'handover' }, h('div', {},
        h('div', { class: 'big-icon' }, '🕵️'), h('h2', {}, `Runde ${game.round}: Die Ermittler sind dran`),
        h('p', {}, 'Der Flüchtige hat gezogen. Gib das Gerät an die Ermittler zurück.'),
        h('button', { class: 'btn big', onclick: () => game.beginDetectiveTurn() }, 'Weiter ermitteln'))));
    } else if (game.phase === 'over' && game.result && !reveal) {
      const win = game.result.winner === 'detectives';
      overlay.append(h('div', { class: 'handover ' + (win ? 'win' : 'lose') }, h('div', {},
        h('div', { class: 'big-icon' }, win ? '🚔' : '💨'),
        h('h2', {}, win ? 'Fall gelöst!' : 'Entkommen…'),
        h('p', {}, game.result.reason),
        h('p', { class: 'hint' }, `Gefundene Erkenntnisse: ${[...game.board.keys()].filter((k) => game.cards[k].kind === 'erkenntnis').length} · Spuren: ${game.traces.length} · Runde ${Math.min(game.round, def.maxRounds)}`),
        h('div', { class: 'row center' },
          h('button', { class: 'btn', onclick: () => { reveal = true; switchView('map'); mv.fitToGame(); } }, 'Fluchtroute aufdecken'),
          h('button', { class: 'btn ghost', onclick: () => { mv.destroy(); title(); } }, 'Hauptmenü')))));
    }
  }

  function render() {
    if (viewer() === 'fugitive' && view !== 'map') view = 'map';
    mapView.classList.toggle('active', view === 'map');
    pin.el.classList.toggle('active', view === 'board');
    talk.el.classList.toggle('active', view === 'talk');
    renderTop(); renderTools(); renderSide(); renderOverlay();
    if (view === 'board') pin.render();
    if (view === 'talk') talk.render();
    if (game.lastEvent) { toast(game.lastEvent.text, game.lastEvent.kind); game.lastEvent = null; }
  }
  let lastPhase = game.phase;
  let lastRound = game.round;
  game.subscribe(() => {
    if (game.phase === 'detective' && (lastPhase !== 'detective' || lastRound !== game.round)) {
      const fresh = game.traces.filter((t) => t.round === game.round);
      if (fresh.length) toast(`Runde ${game.round}: ${fresh.length} neue Spur(en): ` + fresh.map((t) => t.text).join(' · '), 'info');
      else toast(`Runde ${game.round}: Keine neuen Spuren. Der Flüchtige bleibt unsichtbar.`, 'info');
    }
    lastPhase = game.phase; lastRound = game.round;
    render();
  });
  render();
  if (game.phase === 'detective') toast('Der Täter ist auf der Flucht! Der Tatort ist abgesperrt. Zoomen Sie ins Suchgebiet und suchen Sie Fundstücke.', 'info');
}

title();
