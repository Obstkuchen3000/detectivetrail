import type { CaseDef } from './types';

const KEY = 'dt-custom-cases-v1';
export function listCustomCases(): CaseDef[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
export function saveCustomCase(def: CaseDef) {
  const all = listCustomCases().filter((c) => c.id !== def.id);
  all.push(def);
  localStorage.setItem(KEY, JSON.stringify(all));
}
export function deleteCustomCase(id: string) {
  try { localStorage.setItem(KEY, JSON.stringify(listCustomCases().filter((c) => c.id !== id))); } catch { /* egal */ }
}
