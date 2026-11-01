export interface CityMap {
  city: string;
  origin: [number, number];
  scale: [number, number];
  bounds: [number, number, number, number];
  attribution: string;
  land: { name: string; rings: number[][] }[];
  parks: { name: string; ring: number[] }[];
  roads: Record<string, number[][]>;
  labels: { t: string; x: number; y: number; a: number; m: number }[];
  subway: { r: string; p: number[] }[];
  stations: { id: string; name: string; routes: string[]; x: number; y: number; game: boolean }[];
  subwayEdges: [number, number, string][];
}

export interface GNode {
  id: string;
  name: string;
  x: number;
  y: number;
  kind: 'station' | 'poi';
  routes: string[];
  camera: boolean;
}

export type MoveMode = 'foot' | 'bike' | 'subway' | 'taxi' | 'stay';
export interface MoveOption { to: number; mode: MoveMode; route?: string }

export type TraceKind = 'start' | 'cctv' | 'metrocard' | 'taxi' | 'ping' | 'sighting' | 'item' | 'bike' | 'heli' | 'clear';
export interface Trace {
  id: number;
  round: number;
  kind: TraceKind;
  x: number;
  y: number;
  r?: number;
  text: string;
  tag?: string;
  node?: number;
  route?: string;
  /** falsche Fährte des Flüchtigen (für Ermittler nicht erkennbar) */
  fake?: boolean;
}

export type AnnoType = 'pin' | 'person' | 'circle' | 'line' | 'note';
export interface Annotation {
  id: number;
  type: AnnoType;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r?: number;
  text?: string;
  color: string;
}

export interface SearchArea { x: number; y: number; r: number; round: number }

export interface HiddenItem {
  id: string;
  x: number;
  y: number;
  icon: string;
  title: string;
  /** Karte, die beim Fund auf die Pinnwand kommt */
  cardId?: string;
  /** Fundstück vom Flüchtigen: Runde, in der er hier war */
  round?: number;
  found: boolean;
}

export interface BoardCard { id: string; x: number; y: number; isNew: boolean }

export interface Unit { id: string; name: string; short: string; color: string; node: number; moved: boolean }

export interface LogEntry { round: number; text: string; kind?: 'info' | 'good' | 'bad' }
