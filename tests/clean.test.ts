import { nearestWalkable } from '../src/render/world';
import { expect, it } from 'vitest';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  worldMap,
  walkable,
  findPath,
  inPolygon,
  inFootprint,
  footprintRects,
  footprintPolygons,
  lineClear,
  type Point,
} from '../src/render/world';
import buildings from '../docs/world-buildings.json';
import manifest from '../public/assets/manifest.json';
import geometry from '../scripts/clean-main-geometry.json';
it('clean main geometry matches the compositing source and every entrance/spawn is legal', () => {
  expect(worldMap.islands[0].walkable).toEqual(geometry.walkable);
  expect(worldMap.islands[0].obstacles).toEqual(geometry.obstacles);
  for (const slot of worldMap.slots) {
    expect(walkable(slot.entrance), slot.id).toBe(true);
    expect(
      worldMap.slots.some((s) => inFootprint(slot.entrance, s.footprint)),
    ).toBe(false);
    expect(
      findPath([1590, 1050], slot.entrance).length,
      slot.id,
    ).toBeGreaterThan(1);
  }
  for (const spot of worldMap.spots) {
    const island = worldMap.islands.find((i) => i.id === spot.island)!;
    expect(
      walkable(
        nearestWalkable([
          spot.point[0] + island.offset[0],
          spot.point[1] + island.offset[1],
        ]),
      ),
    ).toBe(true);
  }
});
it('north bridge-to-plaza corridor is free of every building footprint', () => {
  const corridor = [1555, 735, 1650, 1050];
  const hall = worldMap.slots.find((s) => s.id === 'B_HALL')!;
  expect([(hall.rect[0] + hall.rect[2]) / 2, hall.rect[3]]).toEqual([
    1440, 930,
  ]);
  for (const slot of worldMap.slots)
    for (const poly of footprintPolygons(slot.footprint)) {
      const l = Math.min(...poly.map((p) => p[0])),
        r = Math.max(...poly.map((p) => p[0])),
        t = Math.min(...poly.map((p) => p[1])),
        b = Math.max(...poly.map((p) => p[1]));
      expect(
        l < corridor[2] &&
          r > corridor[0] &&
          t < corridor[3] &&
          b > corridor[1],
        slot.id,
      ).toBe(false);
    }
  expect(findPath([1575, 735], [1590, 1050]).length).toBeGreaterThan(1);
  expect(lineClear([1575, 735], [1590, 1050])).toBe(true);
});
it('alchemy alpha bottom edge stays on the measured grass top face for both tiers', async () => {
  for (const b of buildings.filter((b) => b.file.includes('alchemy'))) {
    const f = manifest.files.find((f) => f.file === b.file)!;
    const { data, info } = await sharp('public/assets/' + b.file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let count = 0;
    for (let x = 0; x < info.width; x++) {
      let y = info.height - 1;
      while (y >= 0 && data[(y * info.width + x) * 4 + 3] < 32) y--;
      if (y < 0) continue;
      const p: Point = [
        b.x + (x - f.anchor.x) * b.scale - 950,
        b.y + (y - f.anchor.y) * b.scale - 620,
      ];
      expect(
        inPolygon(p, worldMap.islands[0].walkable),
        `${b.file} cliff ${p}`,
      ).toBe(true);
      count++;
    }
    expect(count).toBeGreaterThan(50);
  }
});
it('original body widths are retained and only allowed world geometry changes', async () => {
  const before = JSON.parse(
    execFileSync('git', ['show', 'HEAD:docs/world-buildings.json'], {
      encoding: 'utf8',
    }),
  );
  for (const b of buildings.filter((b) => !b.file.includes('garden')))
    expect(b.bodyWidth).toBe(
      before.find(
        (v: { file: string }) => v.file === b.file.replace('-t2-', '-t1-'),
      ).bodyWidth,
    );
  const old = JSON.parse(
    execFileSync('git', ['show', 'HEAD:data/world.json'], { encoding: 'utf8' }),
  );
  expect(worldMap.bridges).toEqual(old.bridges);
  expect(worldMap.islands.slice(1)).toEqual(old.islands.slice(1));
  expect(worldMap.width).toBe(old.width);
  expect(worldMap.height).toBe(old.height);
  const source = await readFile(
    homedir() + '/cutwork/backup/map_main_clean_v1.jpg',
  );
  const design = await readFile(
    '/Volumes/Media/immortal-qa/design/art/concept/map_main_clean_v1.jpg',
  );
  expect(createHash('sha256').update(source).digest('hex')).toBe(
    createHash('sha256').update(design).digest('hex'),
  );
  expect(
    execFileSync('git', ['diff', 'HEAD', '--', 'src/sim/'], {
      encoding: 'utf8',
    }),
  ).toBe('');
});

it('gate has two solid wings and a 54px central passage across both approaches', () => {
  const gate = worldMap.slots.find((s) => s.id === 'B_GATE')!;
  const rects = footprintRects(gate.footprint);
  expect(rects).toHaveLength(2);
  expect(rects[1][0] - rects[0][2]).toBe(54);
  for (const [l, t, r, b] of rects)
    for (let x = l; x <= r; x += 2)
      for (let y = t; y <= b; y += 2) expect(walkable([x, y])).toBe(false);
  for (let y = 1090; y <= 1230; y++) expect(walkable([1566, y])).toBe(true);
  for (const [a, b] of [
    [
      [1566, 1090],
      [1566, 1230],
    ],
    [
      [1566, 1230],
      [1566, 1090],
    ],
  ] as [Point, Point][]) {
    const path = findPath(a, b);
    expect(path).toEqual([a, b]);
    expect(lineClear(a, b)).toBe(true);
  }
  expect(gate.entrance).toEqual([1566, 1200]);
});
it('gate foreground retains exact source pixels, covers the lintel and leaves the door opening transparent', async () => {
  const { data, info } = await sharp('public/assets/map/gate-foreground.webp')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const source = await sharp('public/assets/map/world.webp')
    .extract({ left: 1470, top: 1060, width: 220, height: 150 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect([info.width, info.height]).toEqual([220, 150]);
  const alpha = (x: number, y: number) =>
    data[((y - 440) * 220 + x - 520) * 4 + 3];
  expect(alpha(615, 480)).toBe(255);
  expect(alpha(615, 505)).toBe(255);
  expect(alpha(615, 535)).toBe(0);
  expect(alpha(580, 540)).toBe(255);
  expect(alpha(660, 550)).toBe(255);
  for (let i = 0; i < 220 * 150; i++)
    if (data[i * 4 + 3])
      for (let c = 0; c < 3; c++)
        expect(data[i * 4 + c]).toBe(source[i * 3 + c]);
});
