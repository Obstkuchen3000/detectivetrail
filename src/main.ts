import './style.css';
import { CITIES } from './data/cities';
import { STORY_CASES, TUTORIAL, resolveCase } from './cases';
import { deleteCustomCase, listCustomCases, saveCustomCase } from './cases/custom';
import { validateCase } from './cases/validate';
import type { CaseDef } from './cases/types';
import { quickId, type Difficulty } from './cases/generator';
import { ACTION_COST, Game, type AiLevel, type GameMode, type GameOptions } from './game/game';
import { computeScore, recordBest } from './game/score';
import { nextHint } from './game/hints';
import { Coach } from './ui/coach';
import { RaidView } from './ui/raid';
import { HEAT_LEVELS, PERKS } from './game/progress';
import { activeProfile, awardGame, levelFromXp } from './game/profile';
import { profileChip, profileScreen, welcomeScreen, xpBar } from './ui/profile';
import { ROOM_ICON } from './game/building';
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
const aiOpts: GameOptions = { police: 'normal', fugitive: 'normal' };
let heat = 0;
function heatChips(rerender: () => void) {
  const lvl = levelFromXp(activeProfile()?.xp ?? 0);
  return h('div', { class: 'quick ai' }, h('label', {}, 'Fahndungsdruck (mehr Erfahrung, gilt solo)'),
    h('div', { class: 'chips' }, ...HEAT_LEVELS.map((hl) => h('button', { class: 'chip' + (heat === hl.level ? ' on' : ''), disabled: lvl < hl.minLevel, title: lvl < hl.minLevel ? `Ab Level ${hl.minLevel}` : hl.desc, onclick: () => { heat = hl.level; rerender(); } }, `${'🔥'.repeat(hl.level)}${hl.level ? ' ' : ''}${hl.name}${lvl < hl.minLevel ? ' 🔒' : ''} · EP ×${hl.xpMul}`))),
    h('small', {}, HEAT_LEVELS[heat].desc));
}
function aiChips(rerender: () => void) {
  const row = (label: string, key: 'police' | 'fugitive') => h('div', { class: 'ai-row' }, h('small', {}, label),
    h('div', { class: 'chips' }, ...(['leicht', 'normal', 'schwer'] as AiLevel[]).map((l) => h('button', { class: 'chip' + (aiOpts[key] === l ? ' on' : ''), onclick: () => { aiOpts[key] = l; rerender(); } }, l))));
  return h('div', { class: 'quick ai' }, h('label', {}, 'Computergegner'), row('KI-Flüchtiger (wenn Sie ermitteln)', 'fugitive'), row('KI-Polizei (wenn Sie fliehen)', 'police'));
}

// ---------------- Menüs ----------------
function screen(...children: (Node | string | null | undefined | false)[]) {
  destroyCurrent?.(); destroyCurrent = null;
  fill(app, h('div', { class: 'screen' }, h('div', { class: 'screen-inner' }, ...children)));
}
const back = (fn: () => void) => h('button', { class: 'btn ghost', onclick: () => { play('click'); fn(); } }, '← Zurück');
const muteBtn = () => { const b = h('button', { class: 'btn ghost small', title: 'Ton an/aus', onclick: () => { setMuted(!isMuted()); b.textContent = isMuted() ? '🔇' : '🔊'; play('click'); } }, isMuted() ? '🔇' : '🔊'); return b; };

function title() {
  const prof = activeProfile();
  if (!prof) { destroyCurrent?.(); destroyCurrent = null; welcomeScreen(app, () => title()); return; }
  const auto = readSave('auto');
  screen(
    profileChip(prof, () => { play('click'); destroyCurrent?.(); destroyCurrent = null; profileScreen(app, title); }),
    h('div', { class: 'logo' }, h('span', {}, 'DETECTIVE'), h('span', { class: 'accent' }, 'TRAIL')),
    h('p', { class: 'tag' }, 'Lagezentrum · Pinnwand · Verhörraum'),
    h('div', { class: 'col' },
      auto ? h('button', { class: 'btn big', onclick: () => loadSlot('auto') }, `▶ Fortsetzen`, h('small', { class: 'sub' }, `${auto.meta.title} · ${auto.meta.chapter} · Runde ${auto.meta.round}`)) : null,
      h('button', { class: 'btn big' + (auto ? ' ghost' : ''), onclick: () => { play('click'); cityMenu(); } }, '＋ Neuer Fall'),
      h('button', { class: 'btn ghost', onclick: () => startNew('nyc', TUTORIAL.id, 'solo') }, '🎓 Tutorial: Erster Arbeitstag'),
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
      h('button', { class: 'tile', onclick: () => { play('click'); customMenu(cityId); } }, h('div', { class: 'tile-title' }, '🛠 Eigene Fälle'), h('div', { class: 'tile-sub' }, 'Selbst geschriebene Fälle als JSON-Datei laden, prüfen und spielen. Mit Vorlage.')),
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
        bestBadge(c.id),
        h('div', { class: 'tile-title' }, c.title),
        h('div', { class: 'tile-sub' }, c.subtitle),
        h('p', { class: 'tile-teaser' }, c.teaser),
        h('div', { class: 'acts' }, ...c.chapters.map((ch, i) => h('span', {}, `Akt ${['I', 'II', 'III', 'IV', 'V'][i]}: ${ch.title}`)))))),
    back(() => typeMenu(cityId)),
  );
}

function roleMenu(start: (mode: GameMode) => void, onBack: () => void) {
  const rerender = () => roleMenu(start, onBack);
  screen(
    h('h2', {}, 'Rolle & Modus'),
    h('div', { class: 'grid three' },
      h('button', { class: 'tile', onclick: () => start('solo') }, h('div', { class: 'tile-title' }, '🕵️ Ermittler'), h('div', { class: 'tile-sub' }, 'Solo: Sie ermitteln, der Computer steuert den Flüchtigen.')),
      h('button', { class: 'tile', onclick: () => start('fugitive') }, h('div', { class: 'tile-title' }, '🦊 Flüchtiger'), h('div', { class: 'tile-sub' }, 'Solo: Sie fliehen, die Polizei wird vom Computer gesteuert und wertet Ihre Spuren aus.')),
      h('button', { class: 'tile', onclick: () => start('hotseat') }, h('div', { class: 'tile-title' }, '👥 2 Spieler'), h('div', { class: 'tile-sub' }, 'An einem Gerät: Eine Person ermittelt, die andere flieht verdeckt.')),
    ),
    aiChips(rerender),
    heatChips(rerender),
    back(onBack),
  );
}

function quickMenu(cityId: string) {
  let difficulty: Difficulty = 'normal', escape = true, seed = 1 + Math.floor(Math.random() * 999999);
  const best = bestOf('quick:solo');
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
      best ? h('small', { class: 'best' }, `🏆 Ihr Bestwert als Ermittler: ${best} Punkte`) : null,
    ),
    aiChips(() => render()),
    heatChips(() => render()),
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
  const prof = activeProfile();
  const side = mode === 'solo' ? 'det' as const : mode === 'fugitive' ? 'fug' as const : null;
  startGame(new Game(map, def, mode, undefined, { ...aiOpts, talents: prof?.talents ?? {}, side, heat: side && caseId !== TUTORIAL.id ? heat : 0 }));
}

function bestOf(key: string): number { try { return JSON.parse(localStorage.getItem('dt-best-v1') ?? '{}')[key] ?? 0; } catch { return 0; } }
function bestBadge(caseId: string) {
  const b = Math.max(bestOf(caseId + ':solo'), bestOf(caseId + ':hotseat'));
  return b ? h('div', { class: 'best-badge' }, `🏆 ${b}`) : null;
}

function customMenu(cityId: string) {
  const list = listCustomCases();
  const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } }) as HTMLInputElement;
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f) return;
    let def: CaseDef;
    try { def = JSON.parse(await f.text()); } catch { toast('Die Datei ist kein gültiges JSON.', 'bad'); return; }
    const errs = validateCase(def);
    if (errs.length) {
      modal(h('div', { class: 'rules' }, h('h3', {}, `❌ ${errs.length} Problem(e) im Fall`), h('ul', {}, ...errs.slice(0, 40).map((e) => h('li', {}, e)))));
      return;
    }
    def.kind = 'story'; def.cityId = cityId;
    if (!def.id.startsWith('custom:')) def.id = 'custom:' + def.id;
    saveCustomCase(def);
    toast(`„${def.title}“ wurde geladen.`, 'good');
    customMenu(cityId);
  });
  screen(
    h('h2', {}, 'Eigene Fälle'),
    h('p', { class: 'hint narrow' }, 'Schreiben Sie einen Fall als JSON-Datei, im selben Format wie die eingebauten Fälle. Die Vorlage ist der Tutorial-Fall. Die Feldbeschreibung steht im Repository unter docs/FALL-FORMAT.md. Beim Laden wird der Fall automatisch geprüft.'),
    h('div', { class: 'row center wrap' },
      h('button', { class: 'btn', onclick: () => file.click() }, '📂 Fall-Datei laden'),
      h('button', { class: 'btn ghost', onclick: () => download('vorlage-fall.json', JSON.stringify({ ...TUTORIAL, id: 'mein-fall', title: 'Mein Fall' }, null, 2)) }, '⬇ Vorlage herunterladen'),
      file,
    ),
    list.length ? h('div', { class: 'saves' }, ...list.map((c) => h('div', { class: 'save-row' },
      h('div', { class: 'grow' }, h('b', {}, c.title), h('small', {}, `${c.subtitle ?? ''} · ${c.chapters.length} Akt(e)`)),
      h('button', { class: 'btn', onclick: () => roleMenu((mode) => startNew(cityId, c.id, mode), () => customMenu(cityId)) }, 'Spielen'),
      h('button', { class: 'btn ghost small', onclick: () => download(c.id.replace(/[^a-z0-9-]/gi, '_') + '.json', JSON.stringify(c, null, 2)) }, '⬇'),
      h('button', { class: 'btn ghost small', onclick: () => { if (confirm('Fall löschen?')) { deleteCustomCase(c.id); customMenu(cityId); } } }, '🗑')))) : h('p', { class: 'hint' }, 'Noch keine eigenen Fälle geladen.'),
    back(() => typeMenu(cityId)),
  );
}
function download(name: string, text: string) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
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
    h('h4', {}, 'Spezialaktionen (Einsatzpunkte)'),
    h('ul', {},
      h('li', {}, '📡 Suchgebiet (1 EP): Macht Fundstücke im Umkreis von 220 m sichtbar.'),
      h('li', {}, '🚧 Straßensperre (1 EP): Den gewählten Knoten kann der Flüchtige im nächsten Zug nicht betreten.'),
      h('li', {}, '👁 Observation (1 EP): Der Knoten wird dauerhaft überwacht. Betritt der Flüchtige ihn, gibt es sicher eine Meldung.'),
      h('li', {}, '🚁 Hubschrauber (2 EP): Ein Wärmebild im Radius von 500 m zeigt den Flüchtigen genau, oder dass er nicht dort ist.'),
    ),
    h('h4', {}, 'Gebäude: Verschanzen & Durchsuchen'),
    h('p', {}, 'Flüchtige können sich in einem Gebäude am aktuellen Knoten verschanzen. Dann erfassen sie weder Kameras noch Funkzelle noch Hubschrauber, aber sie sitzen fest. Mit Haftbefehl kann eine Einheit vor Ort das Gebäude durchsuchen (🏢 neben der Einheit, 1 EP). Eine Durchsuchung hat 4 Durchgänge mit je 3 Aktionen: einen Raum durchsuchen (im Raumbild die versteckte Person finden, 25 Sekunden), eine Etage abriegeln, einen Ausgang sichern oder Personal befragen. Nach jedem Durchgang wechselt die Zielperson vielleicht den Raum, und an einem ungesicherten Ausgang kann sie entkommen.'),
    h('h4', {}, 'Verhöre & Lügen'),
    h('p', {}, 'Manche Personen lügen. Wenn eine Aussage nicht zu Ihren Beweisen passt, befragen Sie die Person vor Ort und legen das passende Beweisstück vor. Ein falsches Beweisstück kostet Wertung.'),
    h('h4', {}, 'Hinterhalt'),
    h('p', {}, 'In manchen Akten kündigt der Täter sein Ziel als Rätsel an. Lila Ringe markieren die möglichen Ziele. Warten Sie mit einer Einheit am richtigen Ort, dann ertappen Sie ihn auf frischer Tat, auch ohne Haftbefehl.'),
    h('h4', {}, 'Tipps & Wertung'),
    h('p', {}, '💡 gibt einen Tipp und kostet 40 Punkte. Am Ende bekommen Sie Punkte und einen Rang. Gesparte Runden und Erkenntnisse zählen positiv, gerissene Fäden, falsche Haftbefehle und Tipps negativ.'),
    h('h4', {}, 'Profil, Level & Talente'),
    h('p', {}, 'Jede Partie bringt Erfahrung (EP) für Ihr Profil. Pro Level gibt es einen Talentpunkt für die Talentbäume der Ermittler und der Flüchtigen. Zu Beginn jedes Akts wählen Sie außerdem eine von drei zufälligen Einsatzkarten (als Flüchtiger: Kniffe), die bis zum Ende der Partie gelten. Fahndungsdruck macht den Gegner stärker und bringt mehr EP. Talente, Karten und Fahndungsdruck gelten nur im Solo-Spiel.'),
    h('h4', {}, 'Als Flüchtiger'),
    h('p', {}, 'Die KI-Polizei sieht nur, was auch ein menschlicher Ermittler sehen würde, also Ihre Spuren. Nach einigen Runden hat sie Ihren Namen und darf Sie verhaften. Ihre Hilfsmittel: 🚲 Leihrad (zwei Schritte weit, hinterlässt eine Ausleih-Spur), 🎭 Verkleidung (zwei Runden lang erkennen Sie weder Kameras noch Hubschrauber) und 🧭 falsche Fährte (legt eine gefälschte U-Bahn-Spur).'),
  ));
}

// ---------------- Spiel ----------------
function startGame(game: Game) {
  destroyCurrent?.(); destroyCurrent = null;
  const map = game.map, def = game.def;
  game.sfx = play;
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  let view: 'map' | 'board' | 'talk' = 'map';
  let reveal = false;
  const viewer = (): Viewer => (game.phase === 'over' ? (reveal || game.mode === 'fugitive' ? 'reveal' : 'detective') : game.mode === 'fugitive' || (game.mode === 'hotseat' && game.phase === 'fugitive') ? 'fugitive' : 'detective');

  const top = h('header', { class: 'topbar' });
  const mapHost = h('div', { class: 'map-host' });
  const tools = h('div', { class: 'toolbar' });
  const side = h('aside', { class: 'side' });
  const timeline = h('div', { class: 'timeline' });
  const sideToggle = h('button', { class: 'side-toggle', title: 'Seitenleiste ein-/ausblenden', onclick: () => { side.classList.toggle('collapsed'); sideToggle.classList.toggle('collapsed'); } }, '☰');
  if (window.innerWidth < 760) { side.classList.add('collapsed'); sideToggle.classList.add('collapsed'); }
  const mapView = h('section', { class: 'view view-map' }, mapHost, tools, side, sideToggle, timeline);
  const tl = { upTo: 0, only: false, active: false };
  const coach = def.id === TUTORIAL.id && game.mode !== 'fugitive' ? new Coach(() => render()) : null;
  const pin = new Pinboard(game, () => switchView('talk'));
  const talk = new InterrogationRoom(game, (place) => {
    const n = game.graph.nodes[game.graph.placeIndex.get(place)!]; switchView('map'); mv.focus(n.x, n.y, Math.max(mv.scale, 0.6));
  });
  const raidView = new RaidView(game);
  const overlay = h('div', { class: 'overlay-host' });
  fill(app, h('div', { class: 'game' }, top, h('main', {}, mapView, pin.el, talk.el, raidView.el), overlay, coach?.el ?? null));

  const mv = new MapView(mapHost, map, game, {
    viewer,
    fugitiveOptions: () => game.fugitiveOptions(),
    onFugitivePick: (opts) => chooseFugitiveMove(opts),
    askText,
    onHint: (t) => toast(t, 'info'),
    traceFilter: (t) => !tl.active || (tl.only ? t.round === tl.upTo : t.round <= tl.upTo),
  });
  const focusStart = () => { const n = game.graph.nodes[game.fugitive.path[0].node]; mv.focus(n.x, n.y, 0.55); };
  setTimeout(focusStart, 50);
  const coachTimer = coach ? window.setInterval(() => coach.update({ game, view, scale: mv.scale }), 400) : 0;
  destroyCurrent = () => { mv.destroy(); unsub(); clearInterval(coachTimer); };

  function switchView(v: typeof view) { view = v; play('click'); render(); }

  function chooseFugitiveMove(opts: MoveOption[]) {
    const n = game.graph.nodes[opts[0].to];
    const exits = game.escapeNodes();
    const desc: Record<string, string> = { hide: game.fugitive.hidden ? '🏢 Im Versteck bleiben (Raum wählen)' : `🏢 Im ${game.buildingAt(opts[0].to).name} verschanzen: keine Kameras, kein Funk, aber du sitzt fest`, bike: '🚲 Leihrad (zwei Schritte): Die Ausleihstation wird bekannt.', foot: '🚶 Zu Fuß: Kameras können dich erfassen.', subway: '🚇 U-Bahn: Einstieg und Linie werden bekannt.', taxi: '🚕 Taxi: Das Ziel ist ungefähr bekannt. Es bleiben ' + game.fugitive.taxis + ' Fahrten.', stay: '⏸ Abtauchen' };
    const close = modal(h('div', { class: 'ask' },
      h('h3', {}, 'Nach ' + n.name + (n.camera ? ' 📹' : '') + (exits.includes(opts[0].to) ? ' ⇲' : '')),
      game.ambushTarget() === opts[0].to && game.chapter.ambush ? h('p', { class: 'hint' }, game.round >= game.chapter.ambush.fromRound ? 'Dein Ziel! Wenn dort niemand wartet, gelingt der Coup.' : `Dein Ziel, aber erst ab Runde ${game.chapter.ambush.fromRound}. Wenn dort jetzt schon Polizei wartet, bist du dran.`) : null,
      exits.includes(opts[0].to) && game.chapter.escape ? h('p', { class: 'hint' }, game.round >= game.chapter.escape.fromRound ? 'Der Fluchtpunkt ist offen. Damit entkommst du!' : `Der Fluchtpunkt öffnet erst ab Runde ${game.chapter.escape.fromRound}.`) : null,
      ...opts.map((o) => h('button', { class: 'btn wide', onclick: () => { close(); if (o.mode === 'hide') chooseHideRoom(); else game.applyFugitiveMove(o); } }, desc[o.mode] + (o.route ? ` (Linie ${o.route})` : ''))),
      h('button', { class: 'btn ghost', onclick: () => close() }, 'Abbrechen'),
    ));
  }

  function chooseHideRoom() {
    const b = game.buildingAt(game.fugitive.node);
    const cur = game.fugitive.hidden?.room;
    const close = modal(h('div', { class: 'ask' },
      h('h3', {}, `🏢 ${b.name}: Versteck wählen`),
      h('p', { class: 'hint' }, 'Wenn die Polizei das Gebäude stürmt, durchsucht sie Raum für Raum. Ausgänge (🚪) bieten eine Chance zur Flucht, sind aber naheliegend. Oben ist es ruhiger, aber der Weg nach draußen ist weiter.'),
      h('div', { class: 'hide-grid' }, ...Array.from({ length: b.floors }, (_, i) => b.floors - 1 - i).map((f) => h('div', { class: 'row wrap' },
        h('b', { class: 'fl' }, f === 0 ? 'EG' : `${f}. OG`),
        ...b.rooms.filter((r) => r.floor === f && r.kind !== 'treppe').map((r) => h('button', { class: 'chip' + (r.id === cur ? ' on' : ''), onclick: () => { close(); game.applyFugitiveMove({ to: game.fugitive.node, mode: 'hide', room: r.id }); } }, `${ROOM_ICON[r.kind]} ${r.name}${r.exit ? ' 🚪' : ''}`))))),
      h('button', { class: 'btn ghost', onclick: () => close() }, 'Abbrechen'),
    ));
  }

  const TOOLS: [Tool, string, string][] = [
    ['select', '🖐', 'Auswählen / Einheiten bewegen / Fundstücke aufheben'],
    ['search', '📡', `Suchgebiet einrichten (${ACTION_COST.search} EP)`],
    ['roadblock', '🚧', `Straßensperre auf einen Knoten (${ACTION_COST.roadblock} EP)`],
    ['observe', '👁', `Observation: Knoten dauerhaft überwachen (${ACTION_COST.observe} EP)`],
    ['heli', '🚁', `Hubschrauber mit Wärmebild, 500 m Radius (${ACTION_COST.heli} EP)`],
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
      ...TOOLS.map(([t, icon, tip]) => h('button', { class: 'tool' + (mv.tool === t ? ' on' : ''), title: tip, onclick: () => { play('click'); mv.tool = t; mv.selectedUnit = null; renderTools(); const tipText: Partial<Record<Tool, string>> = { search: 'Klicken Sie auf die Karte, um ein Suchgebiet mit 220 m Radius einzurichten.', roadblock: 'Klicken Sie auf einen Knoten: Dort kommt der Flüchtige im nächsten Zug nicht durch.', observe: 'Klicken Sie auf einen Knoten, der ab jetzt dauerhaft überwacht wird.', heli: 'Klicken Sie auf den Mittelpunkt des Gebiets, das der Hubschrauber absuchen soll.' }; if (tipText[t]) toast(tipText[t]!, 'info'); } }, icon)),
      h('div', { class: 'sep' }),
      ...COLORS.map((c) => h('button', { class: 'swatch' + (mv.color === c ? ' on' : ''), style: { background: c }, onclick: () => { mv.color = c; renderTools(); } })),
      h('div', { class: 'sep' }),
      ...zoomBtns,
    );
  }

  function traceIcon(t: Trace) { return { start: '✕', cctv: '📹', metrocard: '🚇', taxi: '🚕', ping: '📶', sighting: '👁', item: '◆', bike: '🚲', heli: '🚁', clear: '🚁', building: '🏢' }[t.kind]; }

  function renderTimeline() {
    if (game.phase === 'chapter-intro' || game.round < 2) { fill(timeline); timeline.style.display = 'none'; return; }
    timeline.style.display = '';
    const max = Math.min(game.round, game.maxRounds);
    if (!tl.active) tl.upTo = max;
    const slider = h('input', { type: 'range', min: 0, max, value: tl.upTo }) as HTMLInputElement;
    slider.addEventListener('input', () => { tl.upTo = +slider.value; tl.active = true; lab.textContent = labelText(); });
    const labelText = () => (tl.active ? (tl.only ? `nur Runde ${tl.upTo}` : `Spuren bis Runde ${tl.upTo}`) : 'alle Spuren');
    const lab = h('span', { class: 'tl-label' }, labelText());
    fill(timeline, h('span', {}, '⏱'), slider, lab,
      h('button', { class: 'chip' + (tl.only ? ' on' : ''), onclick: () => { tl.only = !tl.only; tl.active = true; renderTimeline(); } }, 'nur diese Runde'),
      tl.active ? h('button', { class: 'chip', onclick: () => { tl.active = false; tl.only = false; renderTimeline(); } }, 'alle') : null);
  }

  function showHint() {
    if (!confirm(`Einen Tipp ansehen? Das kostet ${game.mods.hintCost} Punkte in der Wertung.`)) return;
    const text = nextHint(game);
    play('found');
    modal(h('div', { class: 'ask' }, h('h3', {}, '💡 Tipp'), h('p', {}, text), h('small', { class: 'hint' }, `Bisher benutzte Tipps: ${game.stats.hints}`)));
  }

  function objectivePanel() {
    const ch = game.chapter;
    return h('div', { class: 'panel objective-panel' },
      h('h3', {}, `Akt ${game.chapterIdx + 1}/${def.chapters.length} · ${ch.title}`),
      h('p', {}, viewer() === 'fugitive' ? ch.fugitiveIntro : ch.objective),
      ch.ambush ? h('p', { class: 'warnline amb' }, viewer() === 'fugitive' ? `🎯 Dein Ziel: ${def.places[ch.ambush.target].name}, ab Runde ${ch.ambush.fromRound}` : `🎯 Mögliche Ziele (ab Runde ${ch.ambush.fromRound}): ` + ch.ambush.candidates.map((p) => def.places[p].name).join(', ')) : null,
      game.perks.length ? h('p', { class: 'perk-line' }, game.perks.map((id) => PERKS.find((x) => x.id === id)!.icon).join(' '), ' ', h('small', {}, game.perks.map((id) => PERKS.find((x) => x.id === id)!.name).join(', '))) : null,
      viewer() === 'detective' && game.charges.informant > 0 && game.phase === 'detective' ? h('button', { class: 'btn small', onclick: () => game.useInformant() }, `🕵️ Informant anrufen (${game.charges.informant}×)`) : null,
      viewer() === 'detective' && (game.charges.freeHeli || game.charges.freeObserve) ? h('small', { class: 'okline' }, [game.charges.freeHeli ? `🚁 ${game.charges.freeHeli}× gratis` : '', game.charges.freeObserve ? `👁 ${game.charges.freeObserve}× gratis` : ''].filter(Boolean).join(' · ')) : null,
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
          h('p', {}, `🚕 Taxifahrten: ${game.fugitive.taxis} · Runde ${game.round}/${game.maxRounds}`),
          h('p', { class: game.warrant ? 'warnline' : '' }, game.warrant ? '⚠️ Es gibt einen Haftbefehl gegen dich. Jede Einheit kann dich festnehmen, und die Kameras erkennen dich öfter.' : 'Noch kennt die Polizei deinen Namen nicht.'),
          game.fugitive.movesLeft > 1 ? h('p', { class: 'warnline' }, `Vorsprung: noch ${game.fugitive.movesLeft} Züge`) : null,
          h('div', { class: 'legend' }, h('span', { class: 'lg foot' }, 'zu Fuß'), h('span', { class: 'lg bike' }, 'Rad'), h('span', { class: 'lg sub' }, 'U-Bahn'), h('span', { class: 'lg taxi' }, 'Taxi')),
          game.fugitive.hidden ? h('p', { class: 'okline' }, `🏢 Verschanzt in ${game.buildingAt(game.fugitive.hidden.node).name}, ${game.buildingAt(game.fugitive.hidden.node).rooms[game.fugitive.hidden.room].name} (seit ${game.fugitive.hidden.rounds + 1} Runde(n)). Klicke auf einen Knoten, um das Gebäude zu verlassen.`) : null,
          game.phase === 'fugitive' ? h('button', { class: 'btn wide', onclick: () => chooseHideRoom() }, game.fugitive.hidden ? '🏢 Im Versteck bleiben / Raum wechseln' : `🏢 Im Gebäude verschanzen`) : null,
          game.fugitive.disguise > 0 ? h('p', { class: 'okline' }, `🎭 Verkleidet: noch ${game.fugitive.disguise} Runde(n) unerkannt`) : null,
          game.fugitive.decoyArmed ? h('p', { class: 'okline' }, '🧭 Die falsche Fährte wird bei deinem nächsten Zug gelegt.') : null,
          game.phase === 'fugitive' && (game.fugitive.gadgets.disguise > 0 || game.fugitive.gadgets.decoy > 0) ? h('div', { class: 'row wrap' },
            game.fugitive.gadgets.disguise > 0 ? h('button', { class: 'btn small', onclick: () => game.useDisguise() }, `🎭 Verkleidung (${game.fugitive.gadgets.disguise}×)`) : null,
            game.fugitive.gadgets.decoy > 0 && !game.fugitive.decoyArmed ? h('button', { class: 'btn small', onclick: () => game.armDecoy() }, `🧭 Falsche Fährte (${game.fugitive.gadgets.decoy}×)`) : null) : null,
          h('p', { class: 'hint' }, 'Klicke auf einen markierten Knoten. Rote Punkte sind Kameras.'),
          game.phase === 'fugitive' && !game.fugitive.hidden ? h('button', { class: 'btn wide', onclick: () => game.applyFugitiveMove({ to: game.fugitive.node, mode: 'stay' }) }, '⏸ Abtauchen (bleiben, keine Spur)') : null,
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
          h('small', {}, u.moved ? 'gefahren' : 'bereit'),
          game.canRaid(u.node) ? h('span', { class: 'raid-btn', title: `Gebäude durchsuchen (${ACTION_COST.raid} EP)`, onclick: (e: Event) => { e.stopPropagation(); game.startRaid(u.node); } }, '🏢') : null)),
        game.warrant && game.phase === 'detective' ? h('p', { class: 'hint' }, '🏢 neben einer Einheit: das Gebäude an ihrem Standort durchsuchen (1 EP). Verschanzte Flüchtige findet man nur so.') : null,
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
      h('div', { class: 'stat' }, h('small', {}, 'RUNDE'), h('b', {}, `${Math.min(game.round, game.maxRounds)}/${game.maxRounds}`)),
      det ? h('div', { class: 'stat' }, h('small', {}, 'EINSATZPUNKTE'), h('b', { class: 'pips' }, ...Array.from({ length: Math.max(2, game.ap) }, (_, i) => h('i', { class: i < game.ap ? 'on' : '' })))) : null,
      h('div', { class: 'stat' }, h('small', {}, 'HAFTBEFEHL'), h('b', { class: game.warrant ? 'ok' : 'warn' }, game.warrant ? 'liegt vor' : 'fehlt')),
      det ? h('nav', { class: 'tabs' },
        h('button', { class: view === 'map' ? 'on' : '', onclick: () => switchView('map') }, '🗺 Lagekarte'),
        h('button', { class: view === 'board' ? 'on' : '', onclick: () => switchView('board') }, '📌 Pinnwand', newCards ? h('span', { class: 'badge' }, String(newCards)) : null),
        h('button', { class: view === 'talk' ? 'on' : '', onclick: () => switchView('talk') }, '🎙 Verhöre', openQ ? h('span', { class: 'badge dim' }, String(openQ)) : null),
      ) : h('nav', { class: 'tabs' }, h('span', { class: 'fug-label' }, '🦊 ' + (game.phase === 'fugitive' ? 'Dein Zug' : 'Flucht'))),
      h('div', { class: 'grow' }),
      det && game.phase === 'detective' && !game.raid ? h('button', { class: 'btn end', onclick: () => { mv.selectedUnit = null; game.endDetectiveTurn(); } }, 'Runde beenden ▶') : null,
      det && game.phase === 'detective' ? h('button', { class: 'btn ghost small', title: 'Tipp (kostet 40 Punkte)', onclick: showHint }, '💡') : null,
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
        game.draft.length ? h('div', { class: 'draft' },
          h('div', { class: 'classified' }, fugMode ? 'WÄHLE EINEN KNIFF' : 'WÄHLEN SIE EINE EINSATZKARTE'),
          h('div', { class: 'draft-cards' }, ...game.draft.map((id) => { const pk = PERKS.find((x) => x.id === id)!; return h('button', { class: 'perk', onclick: () => game.pickPerk(id) }, h('span', { class: 'picon' }, pk.icon), h('b', {}, pk.name), h('small', {}, pk.desc)); })),
          h('button', { class: 'link', onclick: () => game.skipDraft() }, 'ohne Karte weiter')) : null,
        game.perks.length ? h('p', { class: 'perk-line' }, 'Im Gepäck: ' + game.perks.map((id) => { const pk = PERKS.find((x) => x.id === id)!; return pk.icon + ' ' + pk.name; }).join(' · ')) : null,
        h('div', { class: 'row center' }, h('button', { class: 'btn big', disabled: game.draft.length > 0, onclick: () => { game.beginChapter(); focusStart(); } }, fugMode ? 'Flucht beginnen' : 'Ermittlung aufnehmen')),
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
      document.querySelector('.toasts')?.replaceChildren();
      const r = game.result;
      const detWin = r.winner === 'detectives';
      const playerWon = fugMode ? !detWin : detWin;
      const chapterOnly = detWin && !r.final;
      let scoreBox: HTMLElement | null = null;
      if (r.final || !detWin) {
        const sc = computeScore(game);
        const best = game.mode !== 'hotseat' ? recordBest(def.id, game.mode, sc) : null;
        let xpBox: HTMLElement | null = null;
        const prof = activeProfile();
        if (prof && game.mode !== 'hotseat') {
          if (!game.xpAwarded) {
            game.xpAwarded = true;
            const solved = detWin && r.final && !fugMode, escaped = !detWin && fugMode;
            const mul = HEAT_LEVELS[game.opts.heat ?? 0].xpMul;
            const base = def.id === TUTORIAL.id ? 150 : sc.points / 3 + game.stats.arrests * (fugMode ? 0 : 40) + (solved || escaped ? 150 : 0) + (fugMode ? game.stats.roundsUsed * 6 : 0) + 20;
            const res = awardGame(prof, { xp: base * mul, solved, escaped, caught: fugMode && detWin, chapters: fugMode ? game.chapterIdx : game.stats.arrests, score: sc.points });
            (game as unknown as { _xp: typeof res })._xp = res;
          }
          const res = (game as unknown as { _xp?: { before: number; after: number; gained: number } })._xp;
          const p2 = activeProfile()!;
          xpBox = h('div', { class: 'xpbox' },
            h('div', { class: 'row' }, h('b', {}, `+${res?.gained ?? 0} EP`), h('span', { class: 'grow' }), h('span', {}, `${p2.name} · Level ${levelFromXp(p2.xp)}`)),
            xpBar(p2),
            res && res.after > res.before ? h('div', { class: 'levelup' }, `⬆ Level ${res.after}! ${res.after - res.before} neue${res.after - res.before > 1 ? '' : 'r'} Talentpunkt${res.after - res.before > 1 ? 'e' : ''}. Verteilen Sie ihn im Profil.`) : null);
        }
        scoreBox = h('div', { class: 'scorebox' },
          h('div', { class: 'rank' }, '★'.repeat(sc.stars + 1) + '☆'.repeat(4 - sc.stars), h('b', {}, sc.rank)),
          h('div', { class: 'points' }, `${sc.points} Punkte`, best ? h('small', {}, best.isNew ? ' · 🏆 neuer Bestwert!' : ` · Bestwert ${best.best}`) : null),
          h('table', {}, ...sc.lines.filter(([, v]) => v !== 0).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: v < 0 ? 'neg' : 'pos' }, (v > 0 ? '+' : '') + v)))),
          xpBox);
      }
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
        scoreBox,
        stats,
        h('div', { class: 'row center wrap' }, ...buttons.filter(Boolean) as HTMLElement[]))));
    } else if (game.phase === 'over' && reveal) {
      overlay.append(h('div', { class: 'reveal-bar' }, 'Die orange Linie zeigt die Fluchtroute. ', h('button', { class: 'btn small', onclick: () => { reveal = false; render(); } }, 'Zurück zur Auswertung')));
    }
  }

  function render() {
    if (viewer() !== 'detective' && view !== 'map') view = 'map';
    const raiding = !!game.raid && viewer() === 'detective';
    mapView.classList.toggle('active', view === 'map' && !raiding);
    pin.el.classList.toggle('active', view === 'board' && !raiding);
    talk.el.classList.toggle('active', view === 'talk' && !raiding);
    raidView.el.classList.toggle('active', raiding);
    raidView.render();
    renderTop(); renderTools(); renderSide(); renderOverlay(); renderTimeline();
    coach?.update({ game, view, scale: mv.scale });
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
