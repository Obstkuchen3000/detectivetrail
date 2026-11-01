export interface Suspect {
  id: string;
  name: string;
  age: number;
  job: string;
  height: string;
  shoe: number;
  smoker: string;
  notes: string;
  hue: number;
  /** ab welchem Akt (0-basiert) das Dossier an der Pinnwand hängt */
  chapter?: number;
  extra?: string;
}
export interface CardDef {
  title: string;
  text: string;
  kind: 'dokument' | 'beweis' | 'aussage' | 'dossier' | 'erkenntnis' | 'fund';
  icon?: string;
  /** entlastet einen Verdächtigen */
  clears?: string;
}
export interface Question {
  id: string;
  text: string;
  mode: 'any' | 'person';
  requires?: string;
  answer: string;
  gives?: string[];
  fromChapter?: number;
  /** Die Antwort ist gelogen: mit dem passenden Beweisstück (vor Ort) kippt sie */
  contradiction?: { card: string; answer: string; gives?: string[] };
}
export interface Contact {
  id: string;
  name: string;
  role: string;
  place: string;
  hue: number;
  unlockedBy?: string[];
  fromChapter?: number;
  untilChapter?: number;
  /** sitzt in Gewahrsam: Verhör im Revier ohne Einheit möglich */
  custody?: boolean;
  questions: Question[];
}
export interface Place { name: string; lon: number; lat: number }
export interface SceneItem { place: string; cardId: string; icon: string; dx: number; dy: number }

export interface Chapter {
  title: string;
  intro: string[];
  objective: string;
  /** Verdächtiger, der in diesem Akt flieht */
  culprit: string;
  /** Kandidaten für den Haftbefehl */
  candidates: string[];
  start: string;
  maxRounds: number;
  pingRounds: number[];
  taxis: number;
  /** Zusätzliche Züge des Flüchtigen vor der ersten Runde */
  headStart?: number;
  escape?: { places: string[]; fromRound: number };
  /** Hinterhalt: Der Täter will ab fromRound an einem von mehreren möglichen Orten zuschlagen */
  ambush?: { target: string; candidates: string[]; fromRound: number };
  /** Lernmodus: Flüchtiger geht nur zu Fuß, Kameras erfassen ihn immer */
  tutorial?: boolean;
  startCards: string[];
  sceneItems: SceneItem[];
  searchAt?: string[];
  timed: { round: number; card: string; needs?: string }[];
  fugitiveIntro: string;
  outro: string[];
}

export interface CaseDef {
  id: string;
  cityId: string;
  kind: 'story' | 'quick';
  title: string;
  subtitle: string;
  teaser: string;
  places: Record<string, Place>;
  units: { name: string; lon: number; lat: number }[];
  suspects: Suspect[];
  cards: Record<string, CardDef>;
  combos: { a: string; b: string; result: string }[];
  contacts: Contact[];
  dropItems: { icon: string; title: string }[];
  chapters: Chapter[];
  epilogue: string[];
}
