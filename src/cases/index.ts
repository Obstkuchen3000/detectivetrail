import type { CityMap } from '../game/types';
import type { CaseDef } from './types';
import { saphirCase } from './nyc-saphir';
import { falschgeldCase } from './nyc-falschgeld';
import { uhrmacherCase } from './nyc-uhrmacher';
import { tutorialCase } from './nyc-tutorial';
import { generateCase, parseQuickId } from './generator';
import { listCustomCases } from './custom';

export const TUTORIAL = tutorialCase;
export const STORY_CASES: CaseDef[] = [saphirCase, falschgeldCase, uhrmacherCase];

export function resolveCase(id: string, map: CityMap): CaseDef | null {
  const q = parseQuickId(id);
  if (q) return generateCase(map, q);
  if (id === tutorialCase.id) return tutorialCase;
  return STORY_CASES.find((c) => c.id === id) ?? listCustomCases().find((c) => c.id === id) ?? null;
}
