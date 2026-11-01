import type { CityMap } from '../game/types';
import type { CaseDef } from './types';
import { saphirCase } from './nyc-saphir';
import { falschgeldCase } from './nyc-falschgeld';
import { generateCase, parseQuickId } from './generator';

export const STORY_CASES: CaseDef[] = [saphirCase, falschgeldCase];

export function resolveCase(id: string, map: CityMap): CaseDef | null {
  const q = parseQuickId(id);
  if (q) return generateCase(map, q);
  return STORY_CASES.find((c) => c.id === id) ?? null;
}
