import type { Game } from './game';

export interface Score { points: number; rank: string; stars: number; lines: [string, number][] }

const DET_RANKS = ['Streifenpolizist', 'Detective', 'Inspector', 'Chefermittler', 'Legende des NYPD'];
const FUG_RANKS = ['Kleinkrimineller', 'Gerissener Ganove', 'Meisterdieb', 'Phantom', 'Mythos der Unterwelt'];

/** Wertung am Ende einer Partie – aus Sicht der Person am Gerät */
export function computeScore(g: Game): Score {
  const lines: [string, number][] = [];
  const insights = [...g.board.keys()].filter((k) => g.cards[k].kind === 'erkenntnis').length;
  const totalMax = g.def.chapters.slice(0, g.chapterIdx + 1).reduce((s, c) => s + c.maxRounds, 0) - (g.chapter.maxRounds - g.maxRounds) * (g.chapterIdx + 1);
  if (g.mode === 'fugitive') {
    const escaped = g.result?.winner === 'fugitive';
    lines.push(['Durchgehaltene Runden', g.stats.roundsUsed * 25]);
    if (escaped) lines.push(['Flucht gelungen', 500]);
    lines.push(['Hinterlassene Spuren', -g.stats.tracesLeft * 12]);
    lines.push(['Abgeschlossene Akte der Polizei', -g.stats.arrests * 120]);
  } else {
    const solved = g.result?.winner === 'detectives' && g.result.final;
    lines.push(['Abgeschlossene Akte', g.stats.arrests * 300]);
    if (solved) lines.push(['Fall gelöst', 300]);
    lines.push(['Gesparte Runden', Math.max(0, totalMax - g.stats.roundsUsed) * 20]);
    lines.push(['Erkenntnisse', insights * 25]);
    lines.push(['Zugriff im Gebäude', g.stats.buildingCaptures * 100]);
    lines.push(['Gerissene Fäden', -g.stats.wrongThreads * 10]);
    lines.push(['Falsche Haftbefehle', -g.stats.wrongWarrants * 120]);
    lines.push(['Falsch vorgelegte Beweise', -g.stats.wrongPresent * 15]);
    lines.push(['Benutzte Tipps', -g.stats.hints * g.mods.hintCost]);
  }
  const points = Math.max(0, Math.round(lines.reduce((s, [, v]) => s + v, 0)));
  // Maßstab relativ zur Zahl der Akte
  const scale = (g.mode === 'fugitive' ? 450 : 520) * g.def.chapters.length;
  const stars = Math.max(0, Math.min(4, Math.floor((points / scale) * 4)));
  return { points, rank: (g.mode === 'fugitive' ? FUG_RANKS : DET_RANKS)[stars], stars, lines };
}

const BEST_KEY = 'dt-best-v1';
export function recordBest(caseId: string, mode: string, s: Score): { best: number; isNew: boolean } {
  let all: Record<string, number> = {};
  try { all = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}'); } catch { /* leer */ }
  const key = caseId.startsWith('quick:') ? 'quick:' + mode : caseId + ':' + mode;
  const prev = all[key] ?? 0;
  const isNew = s.points > prev;
  if (isNew) { all[key] = s.points; try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch { /* egal */ } }
  return { best: Math.max(prev, s.points), isNew };
}
