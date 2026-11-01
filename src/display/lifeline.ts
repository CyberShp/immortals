import patch from './roster_patch.json';
import pool from './recruit_pool.json';
import { renderRandom } from './random';
import type { World } from '../sim/world';
export type LifeLines = Record<string, string>;
const overlays = new WeakMap<World, LifeLines>();
const fixed = patch.set as Record<string, { lifeLine: string }>;
/** Old saves replay roster order with a seed-derived shuffled deck. Dead disciples remain in roster. */
export function lifeLines(world: World, saved?: LifeLines): LifeLines {
  const lines = saved ? { ...saved } : (overlays.get(world) ?? {});
  const random = renderRandom(world.rng.seed, 'render-lifeline');
  let deck: string[] = [];
  for (const d of world.disciples) {
    if (fixed[d.name]) {
      lines[d.id] = fixed[d.name].lifeLine;
      continue;
    }
    if (!deck.length) {
      deck = pool.pool.map((p) => p.lifeLine);
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
    }
    const drawn = deck.pop()!;
    lines[d.id] ??= drawn;
  }
  overlays.set(world, lines);
  return lines;
}
export function lifeLine(world: World, id: string) {
  return lifeLines(world)[id] ?? '';
}
