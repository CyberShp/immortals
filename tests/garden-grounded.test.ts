import { expect, it } from 'vitest';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import g from '../scripts/garden-geometry.json';
import manifest from '../public/assets/manifest.json';
import {
  insideGroundedBody,
  groundedLayer,
} from '../src/render/grounded-layers';
import {
  segmentDistance,
  nearestWalkable,
  worldMap,
  walkable,
  inFootprint,
  findPath,
} from '../src/render/world';
it('expanded old pad is covered at alpha .95; enlarged overlap is explicitly measured', async () => {
  const f = manifest.files.find(
    (f) => f.file === 'building/garden-t1-map@2x.webp',
  )!;
  const { data, info } = await sharp('public/assets/' + f.file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let total = 0;
  for (let y = 350; y <= 463; y++)
    for (let x = 510; x <= 695; x++)
      if (
        insideGroundedBody(x + 0.5, y + 0.5, g.oldPad) ||
        g.oldPad.some(
          (a, i) =>
            segmentDistance(
              [x + 0.5, y + 0.5],
              a as [number, number],
              g.oldPad[(i + 1) % g.oldPad.length] as [number, number],
            ) <= 4,
        )
      ) {
        const px = Math.floor(
            ((x + 0.5 - g.target[0]) / g.worldScale +
              g.sourceCenter[0] -
              g.crop[0]) *
              g.exportScale,
          ),
          py = Math.floor(
            ((y + 0.5 - g.target[1]) / g.worldScale +
              g.sourceCenter[1] -
              g.crop[1]) *
              g.exportScale,
          );
        expect(
          data[(py * info.width + px) * 4 + 3],
          `${x},${y}`,
        ).toBeGreaterThanOrEqual(243);
        total++;
      }
  expect(total).toBe(16421);
  expect(g.crop[2] * g.worldScale).toBeGreaterThanOrEqual(420);
  expect(g.crop[2] * g.worldScale).toBeLessThan(422);
  let outside = 0,
    obstacles = 0;
  const island = worldMap.islands.find((i) => i.id === 'east')!;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 13) continue;
      const p = [
        g.position[0] + (x - f.anchor.x) * g.mapScale - g.offset[0],
        g.position[1] + (y - f.anchor.y) * g.mapScale - g.offset[1],
      ];
      if (!insideGroundedBody(p[0], p[1], island.walkable)) outside++;
      if (island.obstacles.some((poly) => insideGroundedBody(p[0], p[1], poly)))
        obstacles++;
      expect(p[0] >= 337 && p[0] <= 420 && p[1] >= 472 && p[1] <= 535).toBe(
        false,
      );
    }
  expect(outside).toBe(1351);
  expect(obstacles).toBe(11572);
});
it('garden edge RGB and beige rejection survive both tiers and map scale', async () => {
  for (const suffix of ['grounded', 't1-map', 't2-map']) {
    const { data: d, info } = await sharp(
      `public/assets/building/garden-${suffix}@2x.webp`,
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let n = 0,
      beige = 0,
      sum = 0,
      bleed = 0,
      distance = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 13 || d[i + 3] > 242) continue;
      n++;
      const v = Math.hypot(...g.background.map((b, c) => d[i + c] - b));
      sum += v;
      if (
        Math.min(v, Math.hypot(d[i] - 241, d[i + 1] - 232, d[i + 2] - 212)) < 30
      )
        beige++;
    }
    expect(n).toBeGreaterThan(100);
    expect(beige / n).toBeLessThan(0.01);
    expect(sum / n).toBeGreaterThan(60);
    for (let y = 12; y < info.height - 12; y++)
      for (let x = 12; x < info.width - 12; x++) {
        const i = (y * info.width + x) * 4;
        if (d[i + 3] !== 0) continue;
        let best = Infinity;
        for (let dy = -12; dy <= 12; dy++)
          for (let dx = -12; dx <= 12; dx++) {
            const j = ((y + dy) * info.width + x + dx) * 4;
            if (d[j + 3] === 255)
              best = Math.min(
                best,
                Math.hypot(
                  d[i] - d[j],
                  d[i + 1] - d[j + 1],
                  d[i + 2] - d[j + 2],
                ),
              );
          }
        if (Number.isFinite(best)) {
          bleed++;
          distance += best;
        }
      }
    expect(bleed).toBeGreaterThan(0);
    expect(distance / bleed).toBeLessThan(35);
  }
  expect(
    await readFile('public/assets/building/garden-t1-map@2x.webp'),
  ).toEqual(await readFile('public/assets/building/garden-t2-map@2x.webp'));
});
it('garden polygon/entrance and layer split preserve other world bytes', async () => {
  const slot = worldMap.slots.find((s) => s.id === 'B_GARDEN')!;
  expect(slot.footprint).toEqual({ polygon: g.footprint });
  expect(walkable(slot.entrance)).toBe(true);
  expect(inFootprint(slot.entrance, slot.footprint)).toBe(false);
  expect(findPath([1590, 1050], slot.entrance).at(-1)).toEqual(slot.entrance);
  const split = groundedLayer('building/garden-t1-map@2x.webp')!;
  const local = (p: number[]) => [
    (p[0] - g.anchorSource[0]) * g.worldScale,
    (p[1] - g.anchorSource[1]) * g.worldScale,
  ];
  for (const [p, body] of [
    [[580, 450], false],
    [[440, 570], true],
    [[580, 730], false],
  ] as [number[], boolean][]) {
    const [x, y] = local(p);
    expect(insideGroundedBody(x, y, split.points)).toBe(body);
  }
  const original = execFileSync('git', ['show', 'e70d6cf:data/world.json'], {
      encoding: 'utf8',
    }),
    current = (await readFile('data/world.json', 'utf8'))
      // East v2 changes exactly these three geometric tuples; bridge.test.ts validates them.
      .replace('[2390, 1029]', '[2350, 1033]')
      .replace('[2401.940446, 1047.905707]', '[2361.940446, 1051.905707]')
      .replace('[2397.960298, 1008.104219]', '[2357.960298, 1012.104219]');
  const strip = (text: string) => {
    const start = text.indexOf(
        '    {\n      "id": "B_GARDEN"',
        text.indexOf('  "slots":'),
      ),
      end = text.indexOf('\n    }', start) + 6;
    return text.slice(0, start) + text.slice(end);
  };
  expect(strip(current)).toBe(strip(original));
  const old = JSON.parse(original).slots.find(
      (s: { id: string }) => s.id === 'B_GARDEN',
    ),
    now = JSON.parse(current).slots.find(
      (s: { id: string }) => s.id === 'B_GARDEN',
    );
  for (const key of ['rect', 'front', 'footprint', 'entrance'])
    now[key] = old[key];
  expect(now).toEqual(old);
});

it('preserved east meditation reference projects outside the enlarged fence', () => {
  const p: [number, number] = [2763, 921];
  expect(walkable(p)).toBe(false);
  const actual = nearestWalkable(p);
  expect(walkable(actual)).toBe(true);
  expect(findPath([1590, 1050], actual).at(-1)).toEqual(actual);
  expect(
    inFootprint(
      actual,
      worldMap.slots.find((s) => s.id === 'B_GARDEN')!.footprint,
    ),
  ).toBe(false);
});
