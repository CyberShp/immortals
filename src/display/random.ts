/** Presentation-only stream. Never reads or advances World.rng.state/calls. */
export function renderRandom(seed: number, namespace: string) {
  let state = seed >>> 0;
  for (const c of namespace)
    state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
