/** Spielstände im localStorage: ein Autosave plus drei manuelle Plätze */
export interface SaveMeta { slot: string; caseId: string; title: string; chapter: string; round: number; mode: string; date: number }
interface SaveEntry { meta: SaveMeta; data: string }
const KEY = 'dt-saves-v1';

function readAll(): Record<string, SaveEntry> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}
export function listSaves(): SaveMeta[] {
  return Object.values(readAll()).map((e) => e.meta).sort((a, b) => b.date - a.date);
}
export function writeSave(meta: SaveMeta, data: string): boolean {
  try { const all = readAll(); all[meta.slot] = { meta, data }; localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch { return false; }
}
export function readSave(slot: string): SaveEntry | null { return readAll()[slot] ?? null; }
export function deleteSave(slot: string) { try { const all = readAll(); delete all[slot]; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* egal */ } }
