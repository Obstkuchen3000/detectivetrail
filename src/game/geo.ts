import type { CityMap } from './types';

export function project(map: CityMap, lon: number, lat: number): [number, number] {
  return [Math.round((lon - map.origin[0]) * map.scale[0]), Math.round((map.origin[1] - lat) * map.scale[1])];
}

/** Even-odd-Test über alle Ringe (flache Arrays x,y,x,y,...) */
export function pointInRings(rings: number[][], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
