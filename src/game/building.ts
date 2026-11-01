import { Rng, hash2 } from './rng';

export type BuildingType = 'Hotel' | 'Bürohaus' | 'Parkhaus' | 'Kaufhaus' | 'Wohnhaus' | 'Lagerhaus';
export type RoomKind = 'treppe' | 'zimmer' | 'buero' | 'lager' | 'technik' | 'garage' | 'dach' | 'kueche' | 'waesche' | 'laden' | 'lobby';
export interface Room { id: number; floor: number; idx: number; name: string; kind: RoomKind; exit?: string }
export interface Staff { id: string; name: string; role: string }
export interface Building { node: number; type: BuildingType; name: string; floors: number; perFloor: number; rooms: Room[]; staff: Staff[] }
export interface BuildingOverride { type: BuildingType; name: string; floors?: number }

const TYPES: BuildingType[] = ['Hotel', 'Bürohaus', 'Parkhaus', 'Kaufhaus', 'Wohnhaus', 'Lagerhaus'];
const NAMES: Record<BuildingType, string[]> = {
  Hotel: ['Hotel Ambassador', 'The Belmont', 'Hotel Carlyle Court', 'Hudson Arms', 'The Lexington Grand', 'Hotel Monarch'],
  Bürohaus: ['Meridian Tower', 'Atlas Building', 'Crane & Hollis Center', 'Park Plaza Offices', 'One Liberty Annex'],
  Parkhaus: ['Icon Parking', 'Garage 24', 'Central Parking Deck', 'Uptown Garage'],
  Kaufhaus: ['Kaufhaus Whitmore', 'Bloom & Co.', 'Hargrove’s', 'Emporium 34'],
  Wohnhaus: ['The Ansonia Flats', 'Mercer Apartments', 'Brownstone Court', 'The Delancey'],
  Lagerhaus: ['Hudson Storage', 'Pier Warehouse 9', 'Midtown Cold Storage', 'Atlas Logistics'],
};
const STAFF: Record<BuildingType, [string, string][]> = {
  Hotel: [['Portier', 'Marco'], ['Zimmermädchen', 'Lupe'], ['Nachtrezeption', 'Kwame']],
  Bürohaus: [['Wachmann', 'Doug'], ['Reinigungskraft', 'Svetlana'], ['Empfang', 'Priya']],
  Parkhaus: [['Kassierer', 'Hector'], ['Wachmann', 'Earl']],
  Kaufhaus: [['Kaufhausdetektiv', 'Rita'], ['Verkäufer', 'Jamal'], ['Lagerist', 'Bo']],
  Wohnhaus: [['Hausmeister', 'Gino'], ['Nachbarin', 'Mrs. Abernathy']],
  Lagerhaus: [['Vorarbeiter', 'Stan'], ['Staplerfahrer', 'Luz']],
};

function roomFor(type: BuildingType, floor: number, idx: number, floors: number, rng: Rng): Omit<Room, 'id' | 'floor' | 'idx'> {
  if (idx === 0) return { name: floor === 0 ? 'Treppenhaus & Lobby' : 'Treppenhaus', kind: 'treppe' };
  const top = floor === floors - 1;
  if (top && idx === 1) return { name: 'Dach', kind: 'dach', exit: 'über das Dach' };
  if (floor === 0 && idx === 1) {
    if (type === 'Parkhaus' || type === 'Bürohaus') return { name: 'Tiefgarage', kind: 'garage', exit: 'durch die Tiefgarage' };
    return { name: type === 'Kaufhaus' || type === 'Lagerhaus' ? 'Laderampe' : 'Lieferanteneingang', kind: 'lager', exit: 'durch den Lieferanteneingang' };
  }
  const pick = <T,>(a: T[]) => a[rng.int(a.length)];
  switch (type) {
    case 'Hotel': return floor === 0 ? pick([{ name: 'Küche', kind: 'kueche' as RoomKind }, { name: 'Wäscherei', kind: 'waesche' as RoomKind }, { name: 'Gepäckraum', kind: 'lager' as RoomKind }]) : idx === 2 && rng.next() < 0.3 ? { name: 'Wäschekammer', kind: 'waesche' } : { name: `Zimmer ${floor + 1}0${idx}`, kind: 'zimmer' };
    case 'Bürohaus': return idx === 2 && rng.next() < 0.4 ? { name: 'Serverraum', kind: 'technik' } : { name: `Büro ${floor + 1}.${idx}`, kind: 'buero' };
    case 'Parkhaus': return idx === 2 && rng.next() < 0.3 ? { name: 'Technikraum', kind: 'technik' } : { name: `Deck ${floor + 1}, Reihe ${String.fromCharCode(64 + idx)}`, kind: 'garage' };
    case 'Kaufhaus': return floor === 0 && idx === 2 ? { name: 'Kosmetik', kind: 'laden' } : rng.next() < 0.25 ? { name: 'Lager', kind: 'lager' } : { name: pick(['Herrenmode', 'Damenmode', 'Spielwaren', 'Haushalt', 'Sport', 'Elektronik']), kind: 'laden' };
    case 'Wohnhaus': return idx === 2 && floor === 0 ? { name: 'Waschkeller', kind: 'waesche' } : { name: `Wohnung ${floor + 1}${String.fromCharCode(64 + idx)}`, kind: 'zimmer' };
    case 'Lagerhaus': return rng.next() < 0.3 ? { name: 'Kühlraum', kind: 'technik' } : { name: `Halle ${floor + 1}-${idx}`, kind: 'lager' };
  }
}

/** Deterministisches Gebäude an einem Knoten */
export function makeBuilding(seed: number, node: number, nodeName: string, override?: BuildingOverride, isPlace = false): Building {
  const rng = new Rng(hash2(node, 4711, seed));
  const type = override?.type ?? TYPES[rng.int(TYPES.length)];
  const name = override?.name ?? (isPlace ? nodeName : `${NAMES[type][rng.int(NAMES[type].length)]} (${nodeName})`);
  const floors = override?.floors ?? (type === 'Parkhaus' ? 4 : 3 + rng.int(3));
  const perFloor = 4 + rng.int(2);
  const rooms: Room[] = [];
  for (let f = 0; f < floors; f++) for (let i = 0; i < perFloor; i++) rooms.push({ id: rooms.length, floor: f, idx: i, ...roomFor(type, f, i, floors, rng) });
  const staff = STAFF[type].map(([role, n], i) => ({ id: 's' + i, name: n, role }));
  return { node, type, name, floors, perFloor, rooms, staff };
}

export function roomAt(b: Building, floor: number, idx: number) { return b.rooms[floor * b.perFloor + idx]; }
/** Erreichbare Räume in einem Schritt (gleiche Etage ±1, Treppenhaus verbindet Etagen) */
export function roomNeighbors(b: Building, r: Room, sealed: number[]): Room[] {
  const res: Room[] = [];
  for (const d of [-1, 1]) { const i = r.idx + d; if (i >= 0 && i < b.perFloor) res.push(roomAt(b, r.floor, i)); }
  if (r.idx === 0) for (const d of [-1, 1]) {
    const f = r.floor + d;
    if (f >= 0 && f < b.floors && !sealed.includes(f) && !sealed.includes(r.floor)) res.push(roomAt(b, f, 0));
  }
  return res;
}
export const ROOM_ICON: Record<RoomKind, string> = { treppe: '🪜', zimmer: '🛏', buero: '🖥', lager: '📦', technik: '⚙️', garage: '🚗', dach: '🌆', kueche: '🍳', waesche: '🧺', laden: '🛍', lobby: '🛎' };
