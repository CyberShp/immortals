import { expect, it } from 'vitest';
import sharp from 'sharp';
import corridor from '../src/render/main-corridor.json';
import manifest from '../public/assets/manifest.json';
import buildings from '../docs/world-buildings.json';
import {
  walkable,
  findPath,
  lineClear,
  footprintPolygons,
  inFootprint,
  worldMap,
  FOOT_SPACING,
  type Point,
} from '../src/render/world';
it('new corridor excludes every alpha >= .5 hall pixel and the stone footprint', async () => {
  const f = manifest.files.find((f) => f.file === corridor.source)!,
    b = buildings.find((b) => b.file === corridor.source)!;
  const { data, info } = await sharp('public/assets/' + corridor.source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let checks = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 128) continue;
      const p: Point = [
        b.x + (x + 0.5 - f.anchor.x) * b.scale,
        b.y + (y + 0.5 - f.anchor.y) * b.scale,
      ];
      if (p[0] < 1555 || p[0] > 1650 || p[1] < 735 || p[1] > 1050) continue;
      expect(walkable(p)).toBe(false);
      checks++;
    }
  expect(checks).toBeGreaterThan(100);
  const hall = worldMap.slots.find((s) => s.id === 'B_HALL')!;
  for (const row of corridor.rows)
    for (let y = row.top + 0.5; y < row.bottom; y++)
      for (let x = row.right + 0.5; x < 1650; x++)
        expect(inFootprint([x, y], hall.footprint)).toBe(false);
  for (const poly of footprintPolygons(hall.footprint))
    expect(Math.max(...poly.map((p) => p[0]))).toBeLessThan(1555);
});
it('narrowest corridor fits the conservative 28px foot-spacing width, and a full-width passage remains open', () => {
  expect(FOOT_SPACING).toBe(28);
  expect(corridor.minWidth).toBeGreaterThanOrEqual(FOOT_SPACING);
  for (let y = 735; y <= 1050; y++) {
    const row = corridor.rows.find((r) => y >= r.top && y <= r.bottom);
    const left = row?.right ?? 1555;
    const center = (left + 1650) / 2;
    for (let x = center - FOOT_SPACING / 2; x <= center + FOOT_SPACING / 2; x++)
      expect(walkable([x, y])).toBe(true);
  }
  const path = findPath([1575, 735], [1590, 1050]);
  expect(path[0]).toEqual([1575, 735]);
  expect(path.at(-1)).toEqual([1590, 1050]);
  for (let i = 1; i < path.length; i++) {
    expect(lineClear(path[i - 1], path[i])).toBe(true);
    for (let t = 0; t <= 1; t += 0.005)
      expect(
        walkable([
          path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
          path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
        ]),
      ).toBe(true);
  }
});
it('cut is confined to the adjacent corridor stretch, preserving the original left edge elsewhere', () => {
  expect(corridor.rows[0].top).toBeGreaterThan(820);
  expect(corridor.rows.at(-1)!.bottom).toBeLessThan(880);
  for (const p of corridor.blockedPolygon) {
    expect(p[0]).toBeGreaterThanOrEqual(1555);
    expect(p[0]).toBeLessThan(1650);
  }
  for (let y = 735; y <= 1050; y++) {
    if (y >= corridor.rows[0].top && y <= corridor.rows.at(-1)!.bottom)
      continue;
    expect(walkable([1555, y])).toBe(true);
  }
});
