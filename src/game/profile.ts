import { TALENTS, type Side } from './progress';

/** Lokales Spielerprofil (Account) mit Level, Erfahrung, Talenten und Statistik */
export interface Profile {
  id: string;
  name: string;
  hue: number;
  created: number;
  xp: number;
  talents: Record<string, number>;
  stats: { games: number; solved: number; escaped: number; caught: number; chapters: number; bestScore: number };
}

const KEY = 'dt-profiles-v1';
const ACTIVE = 'dt-active-profile';

export const levelFromXp = (xp: number) => { let l = 1; while (xp >= xpForLevel(l + 1)) l++; return l; };
/** Gesamterfahrung, die für ein Level nötig ist */
export const xpForLevel = (l: number) => (l <= 1 ? 0 : Math.round(120 * Math.pow(l - 1, 1.45)));
export const talentPoints = (p: Profile) => levelFromXp(p.xp);   // ein Punkt pro Level
export const spentPoints = (p: Profile) => Object.values(p.talents).reduce((a, b) => a + b, 0);

function readAll(): Profile[] { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } }
function writeAll(list: Profile[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* Speicher voll oder gesperrt */ } }

export function listProfiles() { return readAll(); }
export function activeProfile(): Profile | null {
  let id: string | null = null; try { id = localStorage.getItem(ACTIVE); } catch { /* egal */ }
  const all = readAll();
  return all.find((p) => p.id === id) ?? all[0] ?? null;
}
export function setActive(id: string) { try { localStorage.setItem(ACTIVE, id); } catch { /* egal */ } }
export function saveProfile(p: Profile) { const all = readAll().filter((x) => x.id !== p.id); all.push(p); writeAll(all); }
export function deleteProfile(id: string) { writeAll(readAll().filter((p) => p.id !== id)); }
export function createProfile(name: string): Profile {
  const p: Profile = { id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: name.trim().slice(0, 24) || 'Detective', hue: Math.floor(Math.random() * 360), created: Date.now(), xp: 0, talents: {}, stats: { games: 0, solved: 0, escaped: 0, caught: 0, chapters: 0, bestScore: 0 } };
  saveProfile(p); setActive(p.id);
  return p;
}

export function canRaise(p: Profile, id: string): string | null {
  const t = TALENTS.find((x) => x.id === id)!;
  const lvl = levelFromXp(p.xp);
  if (lvl < t.minLevel) return `Erst ab Level ${t.minLevel}`;
  if ((p.talents[id] ?? 0) >= t.maxRank) return 'Höchster Rang erreicht';
  if (spentPoints(p) >= talentPoints(p)) return 'Keine freien Talentpunkte';
  return null;
}
export function raiseTalent(p: Profile, id: string) { if (canRaise(p, id)) return; p.talents[id] = (p.talents[id] ?? 0) + 1; saveProfile(p); }
export function resetTalents(p: Profile, side: Side) { for (const t of TALENTS) if (t.side === side) delete p.talents[t.id]; saveProfile(p); }

/** Ergebnis einer Partie gutschreiben; liefert Details für die Anzeige */
export function awardGame(p: Profile, r: { xp: number; solved: boolean; escaped: boolean; caught: boolean; chapters: number; score: number }) {
  const before = levelFromXp(p.xp);
  p.xp += Math.max(0, Math.round(r.xp));
  p.stats.games++; p.stats.chapters += r.chapters;
  if (r.solved) p.stats.solved++;
  if (r.escaped) p.stats.escaped++;
  if (r.caught) p.stats.caught++;
  p.stats.bestScore = Math.max(p.stats.bestScore, r.score);
  saveProfile(p);
  const after = levelFromXp(p.xp);
  return { before, after, gained: Math.round(r.xp) };
}

/** Übertragungscode, um ein Profil auf ein anderes Gerät mitzunehmen */
export function exportCode(p: Profile) { return 'DT1-' + btoa(unescape(encodeURIComponent(JSON.stringify(p)))); }
export function importCode(code: string): Profile | null {
  try {
    const raw = code.trim().replace(/^DT1-/, '');
    const p = JSON.parse(decodeURIComponent(escape(atob(raw)))) as Profile;
    if (!p.id || typeof p.xp !== 'number' || !p.talents || !p.stats) return null;
    saveProfile(p); setActive(p.id);
    return p;
  } catch { return null; }
}
