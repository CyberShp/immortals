export interface RngState {
  seed: number;
  state: number;
  calls: number;
}
export function makeRng(seed: number): RngState {
  return { seed: seed >>> 0, state: seed >>> 0, calls: 0 };
}
export function random(rng: RngState): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  rng.calls++;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function offlineSeed(seed: number, lastSeen: number): number {
  return (seed + Math.trunc(lastSeen)) >>> 0;
}
