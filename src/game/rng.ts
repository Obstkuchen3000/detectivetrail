/** Serialisierbarer Zufallsgenerator (mulberry32) */
export class Rng {
  constructor(public s: number) { this.s >>>= 0; }
  next = () => {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  int(n: number) { return Math.floor(this.next() * n); }
  pick<T>(a: readonly T[]): T { return a[this.int(a.length)]; }
  shuffle<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
}
export function mulberry32(seed: number) { return new Rng(seed).next; }
export function hash2(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
