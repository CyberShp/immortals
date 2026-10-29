import { expect, it } from 'vitest';
import geometry from '../src/render/pedestal-geometry.json';
import {
  worldMap,
  walkable,
  findPath,
  lineClear,
  type Point,
} from '../src/render/world';
import { buildingSortY } from '../src/render/pedestal';
it('visible steps/rails and the foot-radius clearance are blocked', () => {
  for (const b of geometry.buildings) {
    if (b.step)
      expect(walkable(b.step as Point), `${b.id} stair ${b.step}`).toBe(false);
    for (const surface of b.surface ? [b.surface] : b.surfaces!)
      for (const p of surface)
        expect(walkable(p as Point), `${b.id} outer ${p}`).toBe(false);
  }
});
it('body sort anchor is the pedestal front, not the soil patch bottom', () => {
  for (const b of geometry.buildings.filter((b) => b.step)) {
    const slot = worldMap.slots.find((s) => s.id === b.id)!;
    const sort = buildingSortY(b.id, slot.rect[3]);
    expect(sort).toBeCloseTo(b.sortY);
    expect(b.sortY - 1).toBeLessThan(sort);
    expect(b.sortY + 1).toBeGreaterThan(sort);
  }
});
it('all effective entrances are reachable and segments/grid shortcuts avoid the new collision', () => {
  for (const b of geometry.buildings) {
    const p = worldMap.slots.find((s) => s.id === b.id)!.entrance;
    expect(p).toEqual(b.entrance);
    expect(walkable(p)).toBe(true);
    const path = findPath([1590, 1050], p);
    expect(path.length, b.id).toBeGreaterThan(1);
    path.slice(1).forEach((q, i) => expect(lineClear(path[i], q)).toBe(true));
  }
});

it('16px clearance (0.6 scale) covers every measured shoe tip and blocks the full radius around pedestal edges', () => {
  expect(geometry.footRadius).toBe(16);
  for (const f of geometry.footMeasurements)
    expect(f.worldRadius + 1).toBeLessThanOrEqual(geometry.footRadius);
  for (const b of geometry.buildings) {
    for (const surface of b.surface ? [b.surface] : b.surfaces!)
      for (const p of surface)
        for (let i = 0; i < 16; i++)
          expect(
            walkable([
              p[0] + Math.cos((i * Math.PI) / 8) * 15.9,
              p[1] + Math.sin((i * Math.PI) / 8) * 15.9,
            ]),
            `${b.id}: radius sample`,
          ).toBe(false);
  }
});
