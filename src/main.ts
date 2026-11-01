import './style.css';
import { CITIES } from './data/cities';
import { STORY_CASES, resolveCase } from './cases';
import { quickId, type Difficulty } from './cases/generator';
import { Game, type GameMode } from './game/game';
import type { CityMap, MoveOption, Trace } from './game/types';
import { MapView, routeColor, type Tool, type Viewer } from './map/MapView';
import { askText, fill, h, modal, toast } from './ui/dom';
import { Pinboard } from './ui/pinboard';
import { InterrogationRoom } from './ui/interrogation';
import { isMuted, play, setMuted } from './ui/sound';
import { deleteSave, listSaves, readSave, writeSave } from './ui/saves';

const app = document.getElementById('app')!;
const mapCache = new Map<string, Promise<CityMap>>();
const loadMap = (cityId: string) => {
  const url = CITIES.find((c) => c.id === cityId)!.mapUrl!;
  if (!mapCache.has(url)) mapCache.set(url, fetch(url).then((r) => r.json()));
  return mapCache.get(url)!;
};
let destroyCurrent: (() => void) | null = null;

// ---------------- Menüs ----------------
function screen(...children: (Node | string | null | undefined | false)[]) {
  destroyCurrent?.(); destroyCurrent = null;
  fill(app, h('div', { class: 'screen' }, h('div', { class: 'screen-inner' }, ...children)));
}
const back = (fn: () => void) => h('button', { class: 'btn ghost', onclick: () => { play('click'); fn(); } }, '← Zurück');
const muteBtn = () => { const b = h('button', { class: 'btn ghost small', title: 'Ton an/aus', onclick: () => { setMuted(!isMuted()); b.textContent = isMuted() ? '🔇' : '🔊'; play('click'); } }, isMuted() ? '🔇' : '🔊'); return b; };

function title() {
  const auto = readSave('auto');
  screen(
    h('div', { class: 'logo' }, h('span', {}, 'DETECTIVE'), h('span', { class: 'accent' }, 'TRAIL')),
    h('p', { class: 'tag' }, 'Lagezentrum · Pinnwand · Verhörraum'),
    h('div', { class: 'col' },
      auto ? h('button', { class: 'btn big', onclick: () => loadSlot('auto') }, `▶ Fortsetzen`, h('small', { class: 'sub' }, `${auto.meta.title} · ${auto.meta.chapter} · Runde ${auto.meta.round}`)) : null,
      h('button', { class: 'btn big' + (auto ? ' ghost' : ''), onclick: () => { play('click'); cityMenu(); } }, '＋ Neuer Fall'),
      h('button', { class: 'btn ghost', onclick: loadMenu }, 'Spielstand laden'),
      h('div', { class: 'row center' }, h('button', { class: 'btn ghost', onclick: rules }, 'Spielregeln'), muteBtn()),
    ),
    h('p', { class: 'foot' }, 'Ein Ermittlungsspiel auf echten Stadtkarten.'),
  );
}

function cityMenu() {
  screen(
    h('h2', {}, 'Stadt wählen'),
    h('div', { class: 'grid' }, ...CITIES.map((c) =>
      h('button', { class: 'tile' + (c.available ? '' : ' locked'), disabled: !c.available, onclick: () => { play('click'); typeMenu(c.id); } },
        h('div', { class: 'tile-title' }, c.name), h('div', { class: 'tile-sub' }, c.country + ' · ' + c.tagline)))),
    back(title),
  );
}

function typeMenu(cityId: string) {
  screen(
    h('h2', {}, 'Art des Falls'),
    h('div', { class: 'grid two' },
      h('button', { class: 'tile', onclick: () => { play('click'); storyMenu(cityId); } }, h('div', { class: 'tile-title' }, '📚 Storyfälle'), h('div', { class: 'tile-sub' }, 'Lange, handgeschriebene Fälle in mehreren Akten, mit Wendungen, vielen Zeugen und mehreren Flüchtigen nacheinander.')),
      h('button', { class: 'tile', onclick: () => { play('click'); quickMenu(cityId); } }, h('div', { class: 'tile-title' }, '🎲 Schnellspiel'), h('div', { class: 'tile-sub' }, 'Ein zufällig erzeugter Fall für 15 bis 30 Minuten. Jeder Fall ist anders.')),
    ),
    back(cityMenu),
  );
}

function storyMenu(cityId: string) {
  const cases = STORY_CASES.filter((c) => c.cityId === cityId);
  screen(
    h('h2', {}, 'Storyfälle'),
    h('div', { class: 'grid two' }, ...cases.map((c) =>
      h('button', { class: 'tile case', onclick: () => { play('click'); roleMenu((mode) => startNew(cityId, c.id, mode), () => storyMenu(cityId)); } },
        h('div', { class: 'tile-title' }, c.title),
        h('div', { class: 'tile-sub' }, c.subtitle),
        h('p', { class: 'tile-teaser' }, c.teaser),
        h('div', { class: 'acts' }, ...c.chapters.map((ch, i) => h('span', {}, `Akt ${['I', 'II', 'III', 'IV', 'V'][i]}: ${ch.title}`)))))),
    back(() => typeMenu(cityId)),
  );
}

function roleMenu(start: (mode: GameMode) => void, onBack: () => void) {
  screen(
    h('h2', {}, 'Rolle & Modus'),
    h('div', { class: 'grid three' },
      h('button', { class: 'tile', onclick: () => start('solo') }, h('div', { class: 'tile-title' }, '🕵️ Ermittler'), h('div', { class: 'tile-sub' }, 'Solo: Sie ermitteln, der Computer steuert den Flüchtigen.')),
      h('button', { class: 'tile', onclick: () => start('fugitive') }, h('div', { class: 'tile-title' }, '🦊 Flüchtiger'), h('div', { class: 'tile-sub' }, 'Solo: Sie fliehen, die Polizei wird vom Computer gesteuert und wertet Ihre Spuren aus.')),
      h('button', { class: 'tile', onclick: () => start('hotseat') }, h('div', { class: 'tile-title' }, '👥 2 Spieler'), h('div', { class: 'tile-sub' }, 'An einem Gerät: Eine Person ermittelt, die andere flieht verdeckt.')),
    ),
    back(onBack),
  );
}

function quickMenu(cityId: string) {
  let difficulty: Difficulty = 'normal', escape = true, seed = 1 + Math.floor(Math.random() * 999999);
  const render = () => screen(
    h('h2', {}, 'Schnellspiel'),
    h('div', { class: 'quick' },
      h('label', {}, 'Schwierigkeit'),
      h('div', { class: 'chips' }, ...(['leicht', 'normal', 'schwer'] as Difficulty[]).map((d) => h('button', { class: 'chip' + (d === difficulty ? ' on' : ''), onclick: () => { difficulty = d; render(); } }, d))),
      h('small', {}, { leicht: '4 Verdächtige · 2 Indizienketten · 14 Runden', normal: '5 Verdächtige · 3 Indizienketten · 12 Runden', schwer: '6 Verdächtige · 3 Indizienketten · 10 Runden, seltenere Funkzellen' }[difficulty]),
      h('label', {}, 'Variante'),
      h('div', { class: 'chips' },
        h('button', { class: 'chip' + (escape ? ' on' : ''), onclick: () => { escape = true; render(); } }, 'mit Fluchtpunkten'),
        h('button', { class: 'chip' + (!escape ? ' on' : ''), onclick: () => { escape = false; render(); } }, 'nur Zeitlimit')),
      h('label', {}, 'Fallnummer'),
      h('div', { class: 'row' }, h('code', { class: 'seed' }, '#' + seed), h('button', { class: 'btn ghost small', onclick: () => { seed = 1 + Math.floor(Math.random() * 999999); play('click'); render(); } }, '🎲 neu würfeln')),
      h('small', {}, 'Mit derselben Fallnummer bekommt jeder denselben Fall, zum Beispiel für einen Vergleich mit Freunden.'),
    ),
    h('div', { class: 'grid three' },
      h('button', { class: 'tile', onclick: () => startNew(cityId, quickId({ seed, difficulty, escape }), 'solo') }, h('div', { class: 'tile-title' }, '🕵️ Ermitteln')),
      h('button', { class: 'tile', onclick: () => startNew(cityId, quickId({ seed, difficulty, escape }), 'fugitive') }, h('div', { class: 'tile-title' }, '🦊 Fliehen')),
      h('button', { class: 'tile', onclick: () => startNew(cityId, quickId({ seed, difficulty, escape }), 'hotseat') }, h('div', { class: 'tile-title' }, '👥 2 Spieler')),
    ),
    back(() => typeMenu(cityId)),
  );
  render();
}

function loadMenu() {
  const saves = listSaves();
  screen(
    h('h2', {}, 'Spielstände'),
    saves.length ? h('div', { class: 'saves' }, ...saves.map((s) => h('div', { class: 'save-row' },
      h('div', { class: 'grow' }, h('b', {}, (s.slot === 'auto' ? '⟳ Autosave · ' : `Platz ${s.slot} · `) + s.title), h('small', {}, `${s.chapter} · Runde ${s.round} · ${modeName(s.mode)} · ${new Date(s.date).toLocaleString('de-DE')}`)),
      h('button', { class: 'btn', onclick: () => loadSlot(s.slot) }, 'Laden'),
      h('button', { class: 'btn ghost small', onclick: () => { if (confirm('Spielstand löschen?')) { deleteSave(s.slot); loadMenu(); } } }, '🗑')))) : h('p', { class: 'hint' }, 'Noch keine Spielstände vorhanden.'),
    back(title),
  );
}
const modeName = (m: string) => ({ solo: 'Ermittler', fugitive: 'Flüchtiger', hotseat: '2 Spieler' })[m] ?? m;

async function loadSlot(slot: string) {
  const s = readSave(slot); if (!s) return;
  const cityId = 'nyc';
  const map = await loadMap(cityId);
  const def = resolveCase(s.meta.caseId, map);
  if (!def) { toast('Fall nicht gefunden.', 'bad'); return; }
  try { startGame(Game.restore(map, def, s.data)); } catch (e) { console.error(e); toast('Spielstand ist beschädigt.', 'bad'); }
}

async function startNew(cityId: string, caseId: string, mode: GameMode) {
  play('click');
  screen(h('p', { class: 'tag' }, 'Lade Karte…'));
  const map = await loadMap(cityId);
  const def = resolveCase(caseId, map)!;
  startGame(new Game(map, def, mode));
}

function rules() {
  modal(h('div', { class: 'rules' },
    h('h2', {}, 'Spielregeln'),
    h('h4', {}, 'Ziel'),
    h('p', {}, 'Ermitteln Sie, wer der Täter ist, beantragen Sie einen Haftbefehl und stellen Sie den Flüchtigen mit einer Einheit, bevor die Zeit abläuft oder er einen Fluchtpunkt erreicht. Storyfälle bestehen aus mehreren Akten mit jeweils einem eigenen Flüchtigen.'),
    h('h4', {}, 'Ablauf einer Runde'),
    h('p', {}, 'Zuerst zieht der Flüchtige verdeckt: zu Fuß zu einem Nachbarknoten, mit der U-Bahn bis zu 4 Stationen auf einer Linie, mit dem Taxi (0,7 bis 2,6 km, begrenzte Fahrten) oder er taucht ab und bleibt stehen. Danach sind Sie dran. Jede Einheit fährt bis zu 1,5 km weit, und Sie haben 2 Einsatzpunkte (EP).'),
    h('h4', {}, 'Spuren'),
    h('ul', {},
      h('li', {}, 'U-Bahn: Die Einstiegsstation und die Linie werden bekannt, das Ziel nicht.'),
      h('li', {}, 'Taxi: Es gibt einen ungefähren Zielradius.'),
      h('li', {}, 'Kameras (rote Punkte): An diesen Knoten wird der Flüchtige mit einer gewissen Wahrscheinlichkeit erfasst, mit Haftbefehl noch eher.'),
      h('li', {}, 'Funkzelle: In bestimmten Runden gibt es einen Radius, in dem sich der Flüchtige befindet.'),
      h('li', {}, 'Fundstücke: Der Flüchtige verliert unterwegs Dinge. Richten Sie ein Suchgebiet ein (1 EP), zoomen Sie tief hinein und finden Sie sie im Gewusel.'),
      h('li', {}, 'Wenn keine U-Bahn- und keine Taxispur auftaucht, ist er zu Fuß unterwegs oder abgetaucht.'),
    ),
    h('h4', {}, 'Fluchtpunkte'),
    h('p', {}, 'In manchen Akten öffnen ab einer bestimmten Runde Fluchtpunkte wie Heliports, Bahnhöfe oder Piers. Erreicht der Flüchtige einen offenen Fluchtpunkt, ist er weg. Eine Einheit auf dem Fluchtpunkt blockiert ihn.'),
    h('h4', {}, 'Werkzeuge'),
    h('p', {}, 'Mit Markierung, Person, Radius, Linie und Notiz zeichnen Sie Ihre Überlegungen auf die Karte. Auf der Pinnwand verbinden Sie Hinweise mit roten Fäden. Im Verhörraum telefonieren Sie (1 EP) oder befragen Personen vor Ort. Festgenommene können Sie jederzeit im Revier befragen.'),
    h('h4', {}, 'Festnahme'),
    h('p', {}, 'Steht eine Einheit am Knoten des Flüchtigen, gibt es Sichtkontakt. Festnehmen dürfen Sie nur mit einem Haftbefehl gegen die richtige Person. Ein falscher Antrag kostet 2 Runden.'),
    h('h4', {}, 'Als Flüchtiger'),
    h('p', {}, 'Die KI-Polizei sieht nur, was auch ein menschlicher Ermittler sehen würde, also Ihre Spuren. Nach einigen Runden hat sie Ihren Namen und darf Sie verhaften.'),
  ));
}

// ---------------- Spiel ----------------
function startGame(game: Game) {
  destroyCurrent?.(); destroyCurrent = null;
  const map = game.map, def = game.def;
  game.sfx = play;
  let view: 'map' | 'board' | 'talk' = 'map';
  let reveal = false;
  const viewer = (): Viewer => (game.phase === 'over' ? (reveal || game.mode === 'fugitive' ? 'reveal' : 'detective') : game.mode === 'fugitive' || (game.mode === 'hotseat' && game.phase === 'fugitive') ? 'fugitive' : 'detective');

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
  fill(app, h('div', { class: 'game' }, top, h('main', {}, mapView, pin.el, talk.el), overlay));

  const mv = new MapView(mapHost, map, game, {
    viewer,
    fugitiveOptions: () => game.fugitiveOptions(),
    onFugitivePick: (opts) => chooseFugitiveMove(opts),
    askText,
    onHint: (t) => toast(t, 'info'),
  });
  const focusStart = () => { const n = game.graph.nodes[game.fugitive.path[0].node]; mv.focus(n.x, n.y, 0.55); };
  setTimeout(focusStart, 50);
  destroyCurrent = () => { mv.destroy(); unsub(); };

  function switchView(v: typeof view) { view = v; play('click'); render(); }

  function chooseFugitiveMove(opts: MoveOption[]) {
    const n = game.graph.nodes[opts[0].to];
    const exits = game.escapeNodes();
    const desc: Record<string, string> = { foot: '🚶 Zu Fuß: Kameras können dich erfassen.', subway: '🚇 U-Bahn: Einstieg und Linie werden bekannt.', taxi: '🚕 Taxi: Das Ziel ist ungefähr bekannt. Es bleiben ' + game.fugitive.taxis + ' Fahrten.', stay: '⏸ Abtauchen' };
    const close = modal(h('div', { class: 'ask' },
      h('h3', {}, 'Nach ' + n.name + (n.camera ? ' 📹' : '') + (exits.includes(opts[0].to) ? ' ⇲' : '')),
      exits.includes(opts[0].to) && game.chapter.escape ? h('p', { class: 'hint' }, game.round >= game.chapter.escape.fromRound ? 'Der Fluchtpunkt ist offen. Damit entkommst du!' : `Der Fluchtpunkt öffnet erst ab Runde ${game.chapter.escape.fromRound}.`) : null,
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
    const zoomBtns = [
      h('button', { class: 'tool', title: 'Ganze Karte', onclick: () => mv.fitToGame() }, '⤢'),
      h('button', { class: 'tool', title: 'Hineinzoomen', onclick: () => mv.zoomAt(mv.w / 2, mv.h / 2, 1.6) }, '+'),
      h('button', { class: 'tool', title: 'Herauszoomen', onclick: () => mv.zoomAt(mv.w / 2, mv.h / 2, 1 / 1.6) }, '−'),
    ];
    if (viewer() !== 'detective') { fill(tools, ...zoomBtns); return; }
    fill(tools,
      ...TOOLS.map(([t, icon, tip]) => h('button', { class: 'tool' + (mv.tool === t ? ' on' : ''), title: tip, onclick: () => { play('click'); mv.tool = t; mv.selectedUnit = null; renderTools(); if (t === 'search') toast('Klicken Sie auf die Karte, um ein Suchgebiet mit 220 m Radius einzurichten.', 'info'); } }, icon)),
      h('div', { class: 'sep' }),
      ...COLORS.map((c) => h('button', { class: 'swatch' + (mv.color === c ? ' on' : ''), style: { background: c }, onclick: () => { mv.color = c; renderTools(); } })),
      h('div', { class: 'sep' }),
      ...zoomBtns,
    );
  }

  function traceIcon(t: Trace) { return { start: '✕', cctv: '📹', metrocard: '🚇', taxi: '🚕', ping: '📶', sighting: '👁', item: '◆' }[t.kind]; }

  function objectivePanel() {
    const ch = game.chapter;
    return h('div', { class: 'panel objective-panel' },
      h('h3', {}, `Akt ${game.chapterIdx + 1}/${def.chapters.length} · ${ch.title}`),
      h('p', {}, viewer() === 'fugitive' ? ch.fugitiveIntro : ch.objective),
      ch.escape ? h('p', { class: 'warnline' }, `⇲ Fluchtpunkte ${game.round >= ch.escape.fromRound ? 'OFFEN' : 'ab Runde ' + ch.escape.fromRound}: ` + ch.escape.places.map((p) => def.places[p].name).join(', ')) : null,
    );
  }

  function renderSide() {
    if (viewer() === 'fugitive' || (game.mode === 'fugitive' && game.phase === 'over')) {
      const here = game.graph.nodes[game.fugitive.node];
      fill(side,
        objectivePanel(),
        h('div', { class: 'panel fugitive' },
          h('h3', {}, '🦊 ' + game.culprit.name),
          h('p', {}, h('b', {}, 'Standort: '), here.name),
          h('p', {}, `🚕 Taxifahrten: ${game.fugitive.taxis} · Runde ${game.round}/${game.chapter.maxRounds}`),
          h('p', { class: game.warrant ? 'warnline' : '' }, game.warrant ? '⚠️ Es gibt einen Haftbefehl gegen dich. Jede Einheit kann dich festnehmen, und die Kameras erkennen dich öfter.' : 'Noch kennt die Polizei deinen Namen nicht.'),
          game.fugitive.movesLeft > 1 ? h('p', { class: 'warnline' }, `Vorsprung: noch ${game.fugitive.movesLeft} Züge`) : null,
          h('div', { class: 'legend' }, h('span', { class: 'lg foot' }, 'zu Fuß'), h('span', { class: 'lg sub' }, 'U-Bahn'), h('span', { class: 'lg taxi' }, 'Taxi')),
          h('p', { class: 'hint' }, 'Klicke auf einen markierten Knoten. Rote Punkte sind Kameras.'),
          game.phase === 'fugitive' ? h('button', { class: 'btn wide', onclick: () => game.applyFugitiveMove({ to: game.fugitive.node, mode: 'stay' }) }, '⏸ Abtauchen (bleiben, keine Spur)') : null,
        ),
        traceList(true),
        game.mode === 'fugitive' ? h('div', { class: 'panel log' }, h('h3', {}, 'Polizeifunk (abgehört)'), ...game.log.slice(0, 6).map((l) => h('div', { class: 'logline ' + (l.kind ?? '') }, h('span', {}, 'R' + l.round), ' ' + l.text))) : null,
      );
      return;
    }
    fill(side,
      objectivePanel(),
      h('div', { class: 'panel' },
        h('h3', {}, 'Einheiten'),
        ...game.units.map((u, i) => h('button', { class: 'unit-row' + (mv.selectedUnit === i ? ' on' : '') + (u.moved ? ' moved' : ''), onclick: () => { const n = game.graph.nodes[u.node]; mv.tool = 'select'; mv.selectedUnit = u.moved ? null : i; mv.focus(n.x, n.y); render(); } },
          h('span', { class: 'ubadge', style: { borderColor: u.color, color: u.color } }, u.short),
          h('span', { class: 'grow' }, h('b', {}, u.name), h('small', {}, game.graph.nodes[u.node].name)),
          h('small', {}, u.moved ? 'gefahren' : 'bereit'))),
      ),
      traceList(false),
      h('div', { class: 'panel log' }, h('h3', {}, 'Funkprotokoll'), ...game.log.slice(0, 7).map((l) => h('div', { class: 'logline ' + (l.kind ?? '') }, h('span', {}, 'R' + l.round), ' ' + l.text))),
    );
  }

  function traceList(fug: boolean) {
    const ts = [...game.traces].sort((a, b) => b.round - a.round || b.id - a.id);
    return h('div', { class: 'panel traces' },
      h('h3', {}, fug ? 'Deine Spuren (sieht die Polizei)' : 'Spuren'),
      ts.length ? null : h('p', { class: 'hint' }, 'Noch keine Spuren.'),
      ...ts.map((t) => h('button', { class: 'trace-row', onclick: () => mv.focus(t.x, t.y, Math.max(mv.scale, t.r ? 0.4 : 0.7)) },
        h('span', { class: 'tr-r' }, 'R' + t.round), h('span', {}, traceIcon(t)), h('span', { class: 'grow' }, t.text),
        t.route ? h('span', { class: 'route', style: { background: routeColor(t.route) } }, t.route) : null)),
    );
  }

  function saveDialog() {
    const saves = listSaves();
    const close = modal(h('div', { class: 'ask' },
      h('h3', {}, 'Spiel speichern'),
      ...['1', '2', '3'].map((slot) => {
        const s = saves.find((x) => x.slot === slot);
        return h('button', { class: 'btn wide', onclick: () => { doSave(slot); close(); toast(`Gespeichert auf Platz ${slot}.`, 'good'); } }, `Platz ${slot}: ` + (s ? `${s.title} · ${s.chapter} · R${s.round}` : 'leer'));
      }),
      h('button', { class: 'btn ghost', onclick: () => close() }, 'Abbrechen'),
    ));
  }
  function doSave(slot: string) {
    writeSave({ slot, caseId: def.id, title: def.title, chapter: `Akt ${game.chapterIdx + 1}`, round: game.round, mode: game.mode, date: Date.now() }, game.serialize());
  }

  function renderTop() {
    const newCards = [...game.board.values()].filter((c) => c.isNew).length;
    const contacts = game.def.contacts.filter((c) => game.contactVisible(c));
    const openQ = contacts.reduce((n, c) => n + game.visibleQuestions(c).filter((q) => !game.isAsked(c, q.id)).length, 0);
    const det = viewer() === 'detective';
    fill(top,
      h('div', { class: 'brand' }, 'DT', h('small', {}, def.title)),
      h('div', { class: 'stat' }, h('small', {}, 'AKT'), h('b', {}, `${game.chapterIdx + 1}/${def.chapters.length}`)),
      h('div', { class: 'stat' }, h('small', {}, 'RUNDE'), h('b', {}, `${Math.min(game.round, game.chapter.maxRounds)}/${game.chapter.maxRounds}`)),
      det ? h('div', { class: 'stat' }, h('small', {}, 'EINSATZPUNKTE'), h('b', { class: 'pips' }, ...[0, 1].map((i) => h('i', { class: i < game.ap ? 'on' : '' })))) : null,
      h('div', { class: 'stat' }, h('small', {}, 'HAFTBEFEHL'), h('b', { class: game.warrant ? 'ok' : 'warn' }, game.warrant ? 'liegt vor' : 'fehlt')),
      det ? h('nav', { class: 'tabs' },
        h('button', { class: view === 'map' ? 'on' : '', onclick: () => switchView('map') }, '🗺 Lagekarte'),
        h('button', { class: view === 'board' ? 'on' : '', onclick: () => switchView('board') }, '📌 Pinnwand', newCards ? h('span', { class: 'badge' }, String(newCards)) : null),
        h('button', { class: view === 'talk' ? 'on' : '', onclick: () => switchView('talk') }, '🎙 Verhöre', openQ ? h('span', { class: 'badge dim' }, String(openQ)) : null),
      ) : h('nav', { class: 'tabs' }, h('span', { class: 'fug-label' }, '🦊 ' + (game.phase === 'fugitive' ? 'Dein Zug' : 'Flucht'))),
      h('div', { class: 'grow' }),
      det && game.phase === 'detective' ? h('button', { class: 'btn end', onclick: () => { mv.selectedUnit = null; game.endDetectiveTurn(); } }, 'Runde beenden ▶') : null,
      h('button', { class: 'btn ghost small', title: 'Speichern', onclick: saveDialog }, '💾'),
      muteBtn(),
      h('button', { class: 'btn ghost small', title: 'Regeln', onclick: rules }, '?'),
      h('button', { class: 'btn ghost small', title: 'Hauptmenü', onclick: () => { if (confirm('Zum Hauptmenü? Der Autosave bleibt erhalten.')) title(); } }, '✕'),
    );
  }

  function renderOverlay() {
    fill(overlay);
    const ch = game.chapter;
    const fugMode = game.mode === 'fugitive';
    if (game.phase === 'chapter-intro') {
      overlay.append(h('div', { class: 'handover intro' }, h('div', { class: 'dossier' },
        h('div', { class: 'classified' }, def.kind === 'story' ? `AKT ${['I', 'II', 'III', 'IV', 'V'][game.chapterIdx]} VON ${def.chapters.length}` : 'SCHNELLFALL'),
        h('h2', {}, ch.title),
        ...ch.intro.map((p) => h('p', {}, p)),
        h('p', { class: 'objective-line' }, '🎯 ' + (fugMode ? ch.fugitiveIntro : ch.objective)),
        game.mode === 'hotseat' ? h('p', { class: 'warn' }, `Zwei Spieler: Die fliehende Person spielt in diesem Akt ${game.culprit.name}. Vor jedem Zug erscheint ein Übergabe-Bildschirm.`) : null,
        h('div', { class: 'row center' }, h('button', { class: 'btn big', onclick: () => { game.beginChapter(); focusStart(); } }, fugMode ? 'Flucht beginnen' : 'Ermittlung aufnehmen')),
      )));
    } else if (game.phase === 'handover-fugitive') {
      overlay.append(h('div', { class: 'handover' }, h('div', {},
        h('div', { class: 'big-icon' }, '🦊'), h('h2', {}, `Runde ${game.round}: Der Flüchtige ist dran`),
        h('p', {}, 'Wer ermittelt, schaut jetzt bitte weg. Gib das Gerät an die fliehende Person weiter.'),
        h('button', { class: 'btn big', onclick: () => game.beginFugitiveTurn() }, `Ich bin ${game.culprit.name}, los!`))));
    } else if (game.phase === 'handover-detective') {
      overlay.append(h('div', { class: 'handover' }, h('div', {},
        h('div', { class: 'big-icon' }, '🕵️'), h('h2', {}, `Runde ${game.round}: Die Ermittler sind dran`),
        h('p', {}, 'Der Flüchtige hat gezogen. Gib das Gerät an die Ermittler zurück.'),
        h('button', { class: 'btn big', onclick: () => game.beginDetectiveTurn() }, 'Weiter ermitteln'))));
    } else if (game.phase === 'over' && game.result && !reveal) {
      const r = game.result;
      const detWin = r.winner === 'detectives';
      const playerWon = fugMode ? !detWin : detWin;
      const chapterOnly = detWin && !r.final;
      const stats = h('p', { class: 'hint' }, `Erkenntnisse: ${[...game.board.keys()].filter((k) => game.cards[k].kind === 'erkenntnis').length} · Fäden: ${game.stats.threads} (gerissen: ${game.stats.wrongThreads}) · Falsche Haftbefehle: ${game.stats.wrongWarrants}`);
      const buttons: (HTMLElement | null)[] = [];
      if (chapterOnly) buttons.push(h('button', { class: 'btn big', onclick: () => { reveal = false; game.nextChapter(); } }, `Weiter zu Akt ${game.chapterIdx + 2} ▶`));
      if (!detWin && game.chapterSnapshot) buttons.push(h('button', { class: 'btn', onclick: () => { const g2 = Game.restore(map, def, game.chapterSnapshot!); startGame(g2); } }, '↻ Akt wiederholen'));
      buttons.push(h('button', { class: 'btn ghost', onclick: () => { reveal = true; switchView('map'); mv.fitToGame(); } }, 'Fluchtroute ansehen'));
      if ((r.final || !detWin) && def.kind === 'quick') buttons.push(h('button', { class: 'btn', onclick: () => quickMenu(def.cityId) }, '🎲 Neuer Schnellfall'));
      if (r.final || !detWin) buttons.push(h('button', { class: 'btn ghost', onclick: () => title() }, 'Hauptmenü'));
      overlay.append(h('div', { class: 'handover ' + (playerWon ? 'win' : 'lose') }, h('div', { class: 'endcard' },
        h('div', { class: 'big-icon' }, detWin ? '🚔' : '💨'),
        h('h2', {}, chapterOnly ? (fugMode ? 'Gefasst!' : `Akt ${game.chapterIdx + 1} abgeschlossen`) : detWin ? (fugMode ? 'Gefasst! Der Fall ist abgeschlossen.' : 'Fall gelöst!') : fugMode ? 'Entkommen! Du hast gewonnen.' : 'Entkommen…'),
        h('p', {}, r.reason),
        ...(detWin ? ch.outro.map((p) => h('p', {}, p)) : []),
        detWin && r.final ? h('div', { class: 'epilogue' }, h('h4', {}, 'Epilog'), ...def.epilogue.map((p) => h('p', {}, p))) : null,
        chapterOnly && fugMode ? h('p', { class: 'warnline' }, `Im nächsten Akt spielst du ${def.suspects.find((s) => s.id === def.chapters[game.chapterIdx + 1].culprit)!.name}.`) : null,
        stats,
        h('div', { class: 'row center wrap' }, ...buttons.filter(Boolean) as HTMLElement[]))));
    } else if (game.phase === 'over' && reveal) {
      overlay.append(h('div', { class: 'reveal-bar' }, 'Die orange Linie zeigt die Fluchtroute. ', h('button', { class: 'btn small', onclick: () => { reveal = false; render(); } }, 'Zurück zur Auswertung')));
    }
  }

  function render() {
    if (viewer() !== 'detective' && view !== 'map') view = 'map';
    mapView.classList.toggle('active', view === 'map');
    pin.el.classList.toggle('active', view === 'board');
    talk.el.classList.toggle('active', view === 'talk');
    renderTop(); renderTools(); renderSide(); renderOverlay();
    if (view === 'board') pin.render();
    if (view === 'talk') talk.render();
    if (game.lastEvent) { toast(game.lastEvent.text, game.lastEvent.kind); game.lastEvent = null; }
  }
  let lastKey = '';
  const unsub = game.subscribe(() => {
    const key = game.chapterIdx + ':' + game.round + ':' + game.phase;
    if (key !== lastKey) {
      if (game.phase === 'detective' && game.mode !== 'fugitive') {
        const fresh = game.traces.filter((t) => t.round === game.round && t.kind !== 'start');
        if (fresh.length) toast(`Runde ${game.round}: ${fresh.length} neue Spur(en): ` + fresh.map((t) => t.text).join(' · '), 'info');
        else toast(`Runde ${game.round}: Keine neuen Spuren. Der Flüchtige bleibt unsichtbar.`, 'info');
      }
      if (game.mode === 'fugitive' && game.phase === 'fugitive' && game.round > 1 && game.fugitive.movesLeft === 1) toast(`Runde ${game.round}: Die Polizei hat ihre Einheiten verlegt.`, 'info');
      if (game.phase === 'chapter-intro') { reveal = false; setTimeout(focusStart, 30); }
      if (game.phase === 'handover-detective' || game.phase === 'handover-fugitive') { mv.selectedUnit = null; mv.fitToGame(); }
      if (game.phase === 'over' && game.result && (game.result.final || game.result.winner === 'fugitive')) deleteSave('auto');
      else if (['detective', 'fugitive', 'chapter-intro', 'over'].includes(game.phase)) doSave('auto');
    }
    lastKey = key;
    render();
  });
  render();
}

title();
