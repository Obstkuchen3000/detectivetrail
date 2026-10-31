import type { CityMap } from '../game/types';
import { Rng } from '../game/rng';
import type { CardDef, CaseDef, Contact, Place, SceneItem, Suspect } from './types';

export type Difficulty = 'leicht' | 'normal' | 'schwer';
export interface QuickParams { seed: number; difficulty: Difficulty; escape: boolean }

export const quickId = (p: QuickParams) => `quick:${p.seed}:${p.difficulty}:${p.escape ? 1 : 0}`;
export function parseQuickId(id: string): QuickParams | null {
  const m = /^quick:(\d+):(leicht|normal|schwer):([01])$/.exec(id);
  return m ? { seed: +m[1], difficulty: m[2] as Difficulty, escape: m[3] === '1' } : null;
}

const CRIMES = [
  { kind: 'Juwelierraub', site: 'Juwelier', loot: 'eine Schatulle mit Rohdiamanten', owner: ['Abramov', 'Castellano', 'Lindqvist', 'Okafor'] },
  { kind: 'Bankeinbruch', site: 'Bankfiliale', loot: 'den Inhalt von elf Schließfächern', owner: ['Union Trust', 'Harbor Savings', 'Metro Federal'] },
  { kind: 'Kunstdiebstahl', site: 'Galerie', loot: 'ein kleines Ölgemälde von unschätzbarem Wert', owner: ['Duval', 'Rothmann', 'Sato', 'Bellweather'] },
  { kind: 'Datendiebstahl', site: 'Start-up', loot: 'einen Server mit Kundendaten', owner: ['Nimbus Labs', 'Quantic', 'Paperkite'] },
  { kind: 'Auktionshaus-Coup', site: 'Auktionshaus', loot: 'eine Taschenuhr aus dem Besitz eines Präsidenten', owner: ['Whitcombe', 'Varga & Söhne', 'Holloway'] },
  { kind: 'Briefmarkenraub', site: 'Philatelie', loot: 'die „Invertierte Möwe“, eine Fehldruck-Briefmarke', owner: ['Kessling', 'Marchetti'] },
];
const WITNESS_SITES = ['Kiosk', 'Diner', 'Waschsalon', 'Hotelrezeption', 'Buchladen', 'Blumenladen', 'Pizzeria', 'Taxistand', 'Bodega', 'Friseursalon'];
const FIRST_M = ['Adam', 'Victor', 'Marcus', 'Leon', 'Darnell', 'Hiro', 'Mateo', 'Felix', 'Omar', 'Pavel', 'Rory', 'Samuel', 'Theo', 'Isaac'];
const FIRST_F = ['Nora', 'Iris', 'Camila', 'Yuki', 'Amara', 'Greta', 'Lena', 'Priya', 'Rosa', 'Talia', 'Vivian', 'Zoe', 'Hannah', 'Mei'];
const LAST = ['Archer', 'Brennan', 'Cruz', 'Dorsey', 'Ellison', 'Fontaine', 'Gallo', 'Hartley', 'Ibarra', 'Jensen', 'Kowal', 'Laurent', 'Mercer', 'Novak', 'Osei', 'Petrov', 'Quinn', 'Reyes', 'Sandoval', 'Tanaka', 'Underwood', 'Varga', 'Whitlock', 'Yilmaz'];
const JOBS = ['Elektriker', 'Ex-Sicherheitsberater', 'Kunststudent', 'Lieferfahrer', 'Barkeeper', 'Restaurator', 'IT-Techniker', 'Fensterputzer', 'Taxifahrer', 'Schlosser', 'Croupier', 'Portier', 'Fotograf', 'Antiquitätenhändler'];
const SMOKES = ['Nichtraucher', 'Lucky Strike', 'Marlboro', 'Camel', 'Zigarillos'];
const HAIR = ['schwarz', 'braun', 'blond', 'rot', 'grau'];
const COATS = ['Lederjacke', 'Trenchcoat', 'Kapuzenpulli', 'Daunenjacke', 'Jeansjacke', 'Anzugjacke'];
const HUBS: Record<string, Place> = {
  penn: { name: 'Penn Station Hauptausgang', lon: -73.9929, lat: 40.7502 },
  portauth: { name: 'Port Authority Busbahnhof', lon: -73.9903, lat: 40.7568 },
  gct: { name: 'Grand Central Terminal', lon: -73.9772, lat: 40.7527 },
  helidt: { name: 'Downtown Heliport', lon: -74.0088, lat: 40.7015 },
  ferry: { name: 'Whitehall Ferry Terminal', lon: -74.0132, lat: 40.7022 },
  heli30: { name: 'West 30th St Heliport', lon: -74.0075, lat: 40.7535 },
};

type Attr = 'shoe' | 'height' | 'smoke' | 'hair' | 'hand' | 'coat';
interface Gen { name: string; female: boolean; cm: number; shoe: number; smoke: string; hair: string; left: boolean; coat: string; job: string; age: number }
const heightBucket = (cm: number) => (cm >= 181 ? 'groß (über 1,80 m)' : cm >= 170 ? 'mittelgroß (1,70 bis 1,80 m)' : 'eher klein (unter 1,70 m)');
const fmtCm = (cm: number) => (cm / 100).toFixed(2).replace('.', ',') + ' m';

export function generateCase(map: CityMap, p: QuickParams): CaseDef {
  const rng = new Rng(p.seed * 2654435761);
  const toLonLat = (x: number, y: number): [number, number] => [map.origin[0] + x / map.scale[0], map.origin[1] - y / map.scale[1]];
  const stations = map.stations.filter((s) => s.game);
  const offset = (x: number, y: number, d: number): [number, number] => { const a = rng.next() * Math.PI * 2; return toLonLat(x + Math.cos(a) * d, y + Math.sin(a) * d); };

  // ---- Tatort & Orte
  const crime = rng.pick(CRIMES);
  const owner = rng.pick(crime.owner);
  const scene = rng.pick(stations.filter((s) => s.y > -6500));
  const places: Record<string, Place> = {};
  const [slon, slat] = offset(scene.x, scene.y, 110);
  places.tatort = { name: `${crime.site} ${owner}`, lon: slon, lat: slat };
  const near = rng.shuffle(stations.filter((s) => { const d = Math.hypot(s.x - scene.x, s.y - scene.y); return d > 350 && d < 1700; }));
  const witnessSites = rng.shuffle([...WITNESS_SITES]);
  const wKeys = ['zeuge1', 'zeuge2', 'zeuge3'];
  wKeys.forEach((k, i) => {
    const s = near[i % Math.max(1, near.length)] ?? scene;
    const [lon, lat] = offset(s.x, s.y, 90);
    places[k] = { name: `${witnessSites[i]} an der ${s.name}`, lon, lat };
  });
  const revStation = rng.pick(stations.filter((s) => { const d = Math.hypot(s.x - scene.x, s.y - scene.y); return d > 1200 && d < 3000; }).concat([scene]));
  const [rlon, rlat] = offset(revStation.x, revStation.y, 80);
  places.labor = { name: 'Kriminaltechnik (Revier)', lon: rlon, lat: rlat };

  // ---- Verdächtige
  const n = p.difficulty === 'leicht' ? 4 : p.difficulty === 'normal' ? 5 : 6;
  const usedLast = new Set<string>();
  const gens: Gen[] = Array.from({ length: n }, () => {
    const female = rng.next() < 0.45;
    let last = rng.pick(LAST); while (usedLast.has(last)) last = rng.pick(LAST); usedLast.add(last);
    const cm = female ? 158 + rng.int(22) : 168 + rng.int(27);
    return {
      name: `${rng.pick(female ? FIRST_F : FIRST_M)} ${last}`, female, cm, shoe: Math.round(cm / 4.4 + rng.int(3) - 1),
      smoke: rng.pick(SMOKES), hair: rng.pick(HAIR), left: rng.next() < 0.3, coat: rng.pick(COATS), job: rng.pick(JOBS), age: 22 + rng.int(40),
    };
  });
  const ci = rng.int(n);
  const C = gens[ci];
  if (C.smoke === 'Nichtraucher' && rng.next() < 0.6) C.smoke = rng.pick(SMOKES.slice(1));

  // ---- Indizienkette: Merkmale wählen, bis der Täter eindeutig ist
  const val = (g: Gen, a: Attr): string => ({ shoe: String(g.shoe), height: heightBucket(g.cm), smoke: g.smoke, hair: g.hair, hand: g.left ? 'links' : 'rechts', coat: g.coat })[a];
  const pool: Attr[] = rng.shuffle(['shoe', 'height', 'hair', 'hand', 'coat', ...(C.smoke !== 'Nichtraucher' ? ['smoke' as Attr] : [])]);
  const nClues = p.difficulty === 'leicht' ? 2 : 3;
  const chosen = pool.slice(0, nClues);
  const mutate = (g: Gen, a: Attr) => {
    if (a === 'shoe') g.shoe = C.shoe + (rng.next() < 0.5 ? -2 : 2);
    if (a === 'height') g.cm = C.cm >= 176 ? 163 + rng.int(6) : 184 + rng.int(8);
    if (a === 'hair') g.hair = rng.pick(HAIR.filter((h) => h !== C.hair));
    if (a === 'hand') g.left = !C.left;
    if (a === 'coat') g.coat = rng.pick(COATS.filter((c) => c !== C.coat));
    if (a === 'smoke') g.smoke = rng.pick(SMOKES.filter((s) => s !== C.smoke));
  };
  const matchesAll = (g: Gen) => chosen.every((a) => val(g, a) === val(C, a));
  // Rote Heringe: ein Unschuldiger teilt bewusst ein Merkmal
  const herring = gens.find((_, i) => i !== ci)!;
  const h0 = chosen[0];
  if (h0 === 'hair') herring.hair = C.hair; if (h0 === 'coat') herring.coat = C.coat; if (h0 === 'hand') herring.left = C.left; if (h0 === 'smoke') herring.smoke = C.smoke;
  // Unschuldige, die alle Merkmale teilen, in einem Merkmal verändern
  gens.forEach((g, i) => { if (i !== ci && matchesAll(g)) mutate(g, chosen[chosen.length - 1]); });

  const suspects: Suspect[] = gens.map((g, i) => ({
    id: 's' + i, name: g.name, age: g.age, job: g.job, height: fmtCm(g.cm), shoe: g.shoe, smoker: g.smoke,
    extra: `Haare: ${g.hair} · ${g.left ? 'Linkshänder' : 'Rechtshänder'}${g.female ? 'in' : ''} · trägt oft ${g.coat}`,
    notes: rng.pick(['Kannte das Objekt von früheren Aufträgen.', 'Hat Geldsorgen.', 'Wurde in der Nähe gesehen.', 'Vorbestraft wegen Einbruchs.', 'Hatte Streit mit dem Eigentümer.', 'Gilt als zuverlässig. Zu zuverlässig?']),
    hue: rng.int(360),
  }));

  // ---- Karten, Kombinationen, Kontakte
  const cards: Record<string, CardDef> = {
    bericht: { kind: 'dokument', icon: '📄', title: 'Einsatzbericht', text: `${crime.kind} bei ${places.tatort.name}. Gestohlen wurde ${crime.loot}. Der Täter ist zu Fuß geflohen.` },
  };
  const combos: CaseDef['combos'] = [];
  const sceneItems: SceneItem[] = [];
  const timed: CaseDef['chapters'][0]['timed'] = [];
  const contacts: Contact[] = [];
  const wNames = rng.shuffle([...FIRST_M, ...FIRST_F]).slice(0, 3).map((f) => `${f} ${rng.pick(LAST)}`);
  const wq: Contact['questions'][] = [[], [], []];
  const labQ: Contact['questions'] = [];
  const startCards = ['bericht'];
  const itemPos = () => { const a = rng.next() * Math.PI * 2, d = 25 + rng.next() * 85; return { dx: Math.cos(a) * d, dy: Math.sin(a) * d }; };
  let wi = rng.int(3);
  const nextW = () => (wi = (wi + 1) % 3);

  for (const a of chosen) {
    const k = 'k_' + a;
    if (a === 'shoe') {
      cards.abdruck = { kind: 'fund', icon: '👣', title: 'Schuhabdruck', text: 'Ein deutlicher Sohlenabdruck an der Tür. Er muss vermessen werden.' };
      cards.gutachten_schuh = { kind: 'dokument', icon: '📐', title: 'Gutachten Abdruck', text: 'Die Vermessung ist abgeschlossen. Die Ergebnisse liegen der Kriminaltechnik vor.' };
      cards[k] = { kind: 'erkenntnis', icon: '👟', title: 'Schuhgröße', text: `Der Abdruck stammt von Schuhgröße ${C.shoe}.` };
      sceneItems.push({ place: 'tatort', cardId: 'abdruck', icon: 'shoe', ...itemPos() });
      timed.push({ round: 2, card: 'gutachten_schuh', needs: 'abdruck' });
      combos.push({ a: 'abdruck', b: 'gutachten_schuh', result: k });
    }
    if (a === 'height') {
      cards.kamera = { kind: 'beweis', icon: '📷', title: 'Kamerabild', text: 'Unscharf: eine Gestalt in einem Türrahmen. Ohne Vergleichsmaß ist die Größe nicht zu schätzen.' };
      cards.tuermass = { kind: 'aussage', icon: '📏', title: 'Der Türrahmen', text: 'Ein Zeuge: „Die Tür ist genau 2,10 m hoch. Ich kann Ihnen zeigen, wo der Kopf war.“' };
      cards[k] = { kind: 'erkenntnis', icon: '🧍', title: 'Körpergröße', text: `Gemessen am Türrahmen ist der Täter ${heightBucket(C.cm)}.` };
      startCards.push('kamera');
      const w = nextW();
      wq[w].push({ id: 'tuer', mode: 'person', requires: 'kamera', text: 'Können Sie die Größe auf dem Kamerabild einschätzen?', answer: '(Er geht mit Ihnen zur Tür.) Der Kopf war ungefähr hier. Messen Sie selbst.', gives: ['tuermass'] });
      combos.push({ a: 'kamera', b: 'tuermass', result: k });
    }
    if (a === 'smoke') {
      cards.stummel = { kind: 'fund', icon: '🚬', title: 'Stummel', text: 'Ein frischer Stummel, ausgetreten neben dem Eingang.' };
      cards.labor_stummel = { kind: 'dokument', icon: '🧪', title: 'Laborbefund Stummel', text: 'Die Analyse des Stummels ist abgeschlossen.' };
      cards[k] = { kind: 'erkenntnis', icon: '🚬', title: 'Rauchgewohnheit', text: `Der Täter raucht ${C.smoke}.` };
      sceneItems.push({ place: 'tatort', cardId: 'stummel', icon: 'cig', ...itemPos() });
      timed.push({ round: 3, card: 'labor_stummel', needs: 'stummel' });
      combos.push({ a: 'stummel', b: 'labor_stummel', result: k });
    }
    if (a === 'hair') {
      cards.haar = { kind: 'fund', icon: '🔍', title: 'Haar am Fenster', text: 'Ein einzelnes Haar am Fensterrahmen. Die Farbe ist im Licht schwer zu bestimmen.' };
      cards.haaranalyse = { kind: 'dokument', icon: '🔬', title: 'Haaranalyse', text: 'Das Mikroskop liefert die natürliche Farbe des Haares.' };
      cards[k] = { kind: 'erkenntnis', icon: '💇', title: 'Haarfarbe', text: `Der Täter hat ${C.hair}e Haare.` };
      sceneItems.push({ place: 'tatort', cardId: 'haar', icon: 'paper', ...itemPos() });
      labQ.push({ id: 'haar', mode: 'any', requires: 'haar', text: 'Können Sie das Haar analysieren?', answer: 'Schicken Sie es rüber, wir legen es unters Mikroskop.', gives: ['haaranalyse'] });
      combos.push({ a: 'haar', b: 'haaranalyse', result: k });
    }
    if (a === 'hand') {
      cards.kratzer = { kind: 'fund', icon: '🔧', title: 'Kratzspuren am Schloss', text: 'Werkzeugspuren am Schließzylinder, schräg angesetzt.' };
      cards.werkzeug = { kind: 'dokument', icon: '🛠️', title: 'Werkzeuggutachten', text: 'Die Kriminaltechnik hat den Ansatzwinkel rekonstruiert.' };
      cards[k] = { kind: 'erkenntnis', icon: '✋', title: 'Führende Hand', text: `Der Täter ist ${C.left ? 'Linkshänder' : 'Rechtshänder'}.` };
      sceneItems.push({ place: 'tatort', cardId: 'kratzer', icon: 'pick', ...itemPos() });
      labQ.push({ id: 'werkzeug', mode: 'any', requires: 'kratzer', text: 'Was verraten die Kratzspuren?', answer: 'Der Ansatzwinkel ist eindeutig. Das Gutachten schicke ich Ihnen gleich.', gives: ['werkzeug'] });
      combos.push({ a: 'kratzer', b: 'werkzeug', result: k });
    }
    if (a === 'coat') {
      cards.faser = { kind: 'fund', icon: '🧵', title: 'Stofffaser', text: 'Eine Faser, hängen geblieben am Türbeschlag.' };
      cards.kleidung = { kind: 'aussage', icon: '🧥', title: 'Was trug die Person?', text: `Eine Zeugin hat eine Person in ${C.coat} wegrennen sehen.` };
      cards[k] = { kind: 'erkenntnis', icon: '🧥', title: 'Kleidung', text: `Faser und Zeugin passen zusammen: Der Täter trug ${C.coat}.` };
      sceneItems.push({ place: 'tatort', cardId: 'faser', icon: 'glove', ...itemPos() });
      const w = nextW();
      wq[w].push({ id: 'kleid', mode: 'any', text: 'Haben Sie jemanden wegrennen sehen?', answer: `Ja, ziemlich in Eile. Die Person trug ${C.coat}, mehr habe ich nicht erkannt.`, gives: ['kleidung'] });
      combos.push({ a: 'faser', b: 'kleidung', result: k });
    }
  }
  // Füllfragen und falsche Fährte
  const innocent = suspects.find((s) => s.id !== 's' + ci)!;
  cards.anonym = { kind: 'aussage', icon: '✉️', title: 'Anonymer Hinweis', text: `Ein Anrufer behauptet: „Fragen Sie mal ${innocent.name}, der hatte Streit mit dem Besitzer.“` };
  wq[0].push({ id: 'allg', mode: 'any', text: 'Ist Ihnen heute etwas aufgefallen?', answer: rng.pick(['Viel Polizei, sonst nichts. Ist ja New York.', 'Jemand hat sehr lange telefoniert, direkt vor meinem Fenster.', 'Ein Taxi hat zweimal die Runde gedreht.']) });
  wq[1].push({ id: 'tipp', mode: 'any', text: 'Haben Sie einen Verdacht?', answer: 'Ich will niemanden anschwärzen… aber es kam ein anonymer Anruf bei mir an.', gives: ['anonym'] });
  wq[2].push({ id: 'richtung', mode: 'person', text: 'In welche Richtung lief die Person?', answer: rng.pick(['Richtung U-Bahn, ganz sicher.', 'Zum Park, glaube ich.', 'Richtung Fluss.']) });
  wKeys.forEach((k, i) => contacts.push({ id: k, name: wNames[i], role: 'Zeuge · ' + places[k].name.split(' an der ')[0], place: k, hue: rng.int(360), questions: wq[i] }));
  contacts.push({ id: 'labor', name: 'Dr. Ruth Calloway', role: 'Kriminaltechnik', place: 'labor', hue: 180, questions: [...labQ, { id: 'stand', mode: 'any', text: 'Gibt es Neuigkeiten?', answer: 'Wir arbeiten dran. Bringen Sie mir Spuren, dann bekommen Sie Antworten.' }] });

  const maxRounds = p.difficulty === 'leicht' ? 14 : p.difficulty === 'normal' ? 12 : 10;
  const pingRounds = Array.from({ length: maxRounds }, (_, i) => i + 1).filter((r) => r % (p.difficulty === 'schwer' ? 4 : 3) === 0);
  let escape: CaseDef['chapters'][0]['escape'];
  if (p.escape) {
    const keys = rng.shuffle(Object.keys(HUBS)).slice(0, 3);
    for (const k of keys) places[k] = HUBS[k];
    escape = { places: keys, fromRound: maxRounds - 4 };
  }

  // Einheiten rund um den Tatort
  const units = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((name, i) => {
    const a = (i / 4) * Math.PI * 2 + rng.next() * 0.8, d = 1800 + rng.next() * 1500;
    const [lon, lat] = toLonLat(scene.x + Math.cos(a) * d, scene.y + Math.sin(a) * d);
    return { name, lon, lat };
  });

  return {
    id: quickId(p),
    cityId: 'nyc',
    kind: 'quick',
    title: `${crime.kind}: ${places.tatort.name}`,
    subtitle: `Schnellfall · ${p.difficulty}${p.escape ? ' · Fluchtpunkte' : ''}`,
    teaser: `Gestohlen wurde ${crime.loot}. ${n} Verdächtige, ${nClues} Indizienketten, ${maxRounds} Runden.`,
    places,
    units,
    suspects,
    cards,
    combos,
    contacts,
    dropItems: [{ icon: 'cig', title: 'Stummel' }, { icon: 'ticket', title: 'Fahrschein' }, { icon: 'cup', title: 'Becher' }, { icon: 'paper', title: 'Papierfetzen' }],
    chapters: [{
      title: crime.kind,
      intro: [
        `Alarm bei ${places.tatort.name}: Jemand hat ${crime.loot} gestohlen.`,
        'Die Spurensicherung hat den Tatort abgesperrt. Sammeln Sie die Fundstücke ein, befragen Sie Zeugen und verbinden Sie die Hinweise an der Pinnwand.',
        escape ? `Ab Runde ${escape.fromRound} kann der Täter die Stadt über ${escape.places.map((k) => places[k].name).join(', ')} verlassen.` : `Sie haben ${maxRounds} Runden.`,
      ],
      objective: `Finden Sie unter ${n} Verdächtigen die richtige Person und verhaften Sie sie.`,
      culprit: 's' + ci,
      candidates: suspects.map((s) => s.id),
      start: 'tatort',
      maxRounds,
      pingRounds,
      taxis: p.difficulty === 'schwer' ? 4 : 3,
      escape,
      startCards,
      sceneItems,
      timed,
      fugitiveIntro: `Du bist ${C.name}. Die Beute ist in deiner Tasche. ${escape ? `Erreiche ab Runde ${escape.fromRound} einen Fluchtpunkt.` : `Halte ${maxRounds} Runden durch.`}`,
      outro: [`${C.name} ist festgenommen. Die Beute ist sichergestellt.`],
    }],
    epilogue: [`Fall ${quickId(p).split(':')[1]} ist gelöst. Wollen Sie einen neuen Fall würfeln?`],
  };
}
