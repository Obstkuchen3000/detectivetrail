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
  culprit?: boolean;
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
}
export interface Contact {
  id: string;
  name: string;
  role: string;
  place: string;
  hue: number;
  unlockedBy?: string[];
  phoneUnavailable?: string;
  questions: Question[];
}
export interface Place { name: string; lon: number; lat: number }
export interface CaseDef {
  id: string;
  cityId: string;
  title: string;
  subtitle: string;
  briefing: string[];
  maxRounds: number;
  pingRounds: number[];
  places: Record<string, Place>;
  crimeScene: string;
  units: { name: string; lon: number; lat: number }[];
  suspects: Suspect[];
  cards: Record<string, CardDef>;
  startCards: string[];
  sceneItems: { cardId: string; icon: string; dx: number; dy: number }[];
  combos: { a: string; b: string; result: string }[];
  contacts: Contact[];
  timed: { round: number; card: string; needs?: string }[];
  dropItems: { icon: string; title: string }[];
  fugitiveIntro: string;
}
