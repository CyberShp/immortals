import { nearestWalkable } from '../src/render/world';
import { expect, it } from 'vitest';
import sharp from 'sharp';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import manifest from '../public/assets/manifest.json';
import report from '../docs/bridge-build.json';
import {
  worldMap,
  inPolygon,
  walkable,
  findPath,
  lineClear,
  segmentDistance,
  type Point,
} from '../src/render/world';
const islandAt = (p: Point) =>
  worldMap.islands.find((i) => {
    const local: Point = [p[0] - i.offset[0], p[1] - i.offset[1]];
    return (
      inPolygon(local, i.walkable) &&
      !i.obstacles.some((o) => inPolygon(local, o))
    );
  });
it('bridge cutouts have transparent corners, opaque deck anchors and declared dimensions', async () => {
  for (const f of manifest.files.filter((f) =>
    f.file.startsWith('map/bridge-'),
  )) {
    const { data, info } = await sharp(`public/assets/${f.file}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual(f.size);
    for (const [x, y] of [
      [0, 0],
      [info.width - 1, 0],
      [0, info.height - 1],
      [info.width - 1, info.height - 1],
    ])
      expect(data[(y * info.width + x) * 4 + 3]).toBe(0);
    expect(f.anchors).toHaveLength(2);
    for (const a of f.anchors!)
      expect(
        data[(Math.round(a.y) * info.width + Math.round(a.x)) * 4 + 3],
      ).toBeGreaterThan(240);
    expect(f.deck!.walkableWidth).toBeLessThan(f.deck!.width);
    // A horizontal plank gap, disconnected from the outer background, is keyed too.
    if (f.file.includes('bridge-h'))
      expect(data[(115 * info.width + 10) * 4 + 3]).toBeLessThan(30);
  }
});
it('Iris shore anchors are fixed and both ends have source-island overlap of exactly 10px', async () => {
  expect(
    worldMap.bridges.map((b) =>
      b.id === 'east' ? b.points.at(-1) : b.points[0],
    ),
  ).toEqual([
    [1575, 525],
    [875, 995],
    [2350, 1033],
  ]);
  const originals = new Map<string, Buffer>();
  for (const island of worldMap.islands) {
    const source =
      island.id === 'main'
        ? homedir() + '/cutwork/backup/map_main_clean_v1.jpg'
        : `/Volumes/Media/immortal-qa/design/art/concept/map_island_${island.id}_v1.jpg`;
    originals.set(
      island.id,
      await sharp(source).removeAlpha().raw().toBuffer(),
    );
  }
  for (const b of worldMap.bridges) {
    for (const index of [0, b.points.length - 1]) {
      const p = b.points[index],
        q = b.points[index ? index - 1 : 1];
      expect(islandAt(p), `${b.id} shore ${index}`).toBeTruthy();
      const len = Math.hypot(p[0] - q[0], p[1] - q[1]);
      const u = p.map((v, c) => (v - q[c]) / len);
      for (let t = 8; t <= 12; t++) {
        const point = p.map((v, c) => Math.round(v + u[c] * t)) as Point;
        expect(islandAt(point), `${b.id} inward ${t}`).toBeTruthy();
        const island = islandAt(point)!;
        const offset =
          ((point[1] - island.offset[1]) * 1280 + point[0] - island.offset[0]) *
          3;
        const rgb = [...originals.get(island.id)!.subarray(offset, offset + 3)];
        // Island-top polygon + non-paper source pixels: includes painted wooden
        // landings in the original island art, not just green grass.
        expect(
          Math.hypot(rgb[0] - 241, rgb[1] - 232, rgb[2] - 212),
        ).toBeGreaterThan(45);
      }
      const placed = report.placements.filter((s) => s.bridge === b.id);
      const end = index ? placed.at(-1)!.b : placed[0].a;
      expect(Math.hypot(end[0] - p[0], end[1] - p[1])).toBeCloseTo(10);
      // Derived from actual alpha pixels after scale/rotation/miter, excluding shadow.
      const physicalOverlap = index
        ? placed.at(-1)!.physicalAxialMax - len
        : -placed[0].physicalAxialMin;
      expect(physicalOverlap).toBeGreaterThanOrEqual(8);
      expect(physicalOverlap).toBeLessThanOrEqual(12);
      const outward = b.walkable.map(
        (v) => (v[0] - p[0]) * u[0] + (v[1] - p[1]) * u[1],
      );
      expect(Math.max(...outward)).toBeLessThanOrEqual(12);
    }
  }
});
it('deck centerlines are walkable and both rail exteriors are blocked over the gaps', () => {
  for (const b of worldMap.bridges) {
    let outsideChecks = 0;
    for (let i = 1; i < b.points.length; i++) {
      const a = b.points[i - 1],
        z = b.points[i],
        len = Math.hypot(z[0] - a[0], z[1] - a[1]);
      for (let t = 0; t <= 1; t += 0.025) {
        const p: Point = [a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t];
        expect(walkable(p), `${b.id} center ${t}`).toBe(true);
        if (t < 0.2 || t > 0.8) continue;
        for (const sign of [-1, 1]) {
          const d = b.width / 2 + 6;
          const q: Point = [
            p[0] - ((z[1] - a[1]) / len) * d * sign,
            p[1] + ((z[0] - a[0]) / len) * d * sign,
          ];
          if (islandAt(q)) continue; // Grass next to a shore is legitimately walkable.
          expect(walkable(q), `${b.id} outside ${q}`).toBe(false);
          outsideChecks++;
        }
      }
    }
    expect(outsideChecks).toBeGreaterThan(5);
  }
});
it('main-to-island paths traverse each corresponding bridge and remain walkable', () => {
  const start = worldMap.slots.find((s) => s.id === 'B_HALL')!.front;
  for (const b of worldMap.bridges) {
    const island = worldMap.islands.find((i) => i.id === b.id)!;
    const spot = worldMap.spots.find((s) => s.island === b.id)!;
    const to = nearestWalkable(
      spot.point.map((v, c) => v + island.offset[c]) as Point,
    );
    const path = findPath(start, to);
    expect(path.length).toBeGreaterThan(1);
    let crossed = false;
    path.slice(1).forEach((z, i) => {
      const a = path[i];
      expect(lineClear(a, z)).toBe(true);
      const n = Math.ceil(Math.hypot(z[0] - a[0], z[1] - a[1]));
      for (let k = 0; k <= n; k++) {
        const p: Point = [
          a[0] + ((z[0] - a[0]) * k) / n,
          a[1] + ((z[1] - a[1]) * k) / n,
        ];
        if (
          !islandAt(p) &&
          b.points
            .slice(1)
            .some((q, j) => segmentDistance(p, b.points[j], q) < b.width / 2)
        )
          crossed = true;
      }
    });
    expect(crossed, b.id).toBe(true);
  }
});
function differenceStats(differences: number[]) {
  const histogram = new Uint32Array(256);
  let sum = 0;
  for (const d of differences) {
    histogram[d]++;
    sum += d;
  }
  let accumulated = 0,
    p99 = 0;
  for (; p99 < 255; p99++) {
    accumulated += histogram[p99];
    if (accumulated >= differences.length * 0.99) break;
  }
  return { mae: sum / differences.length, p99 };
}
it('whole-image lossy encoding preserves outside-bridge pixels within codec tolerance', async () => {
  for (const [name, regions, p99Limit] of [
    ['world', report.regions, 8],
    ['world-mini', report.miniRegions, 12],
  ] as const) {
    // Pinned HEAD at the start of Bridge1, independent of future bridge commits.
    const before = await sharp(
      execFileSync(
        'git',
        ['show', `${report.baselineCommit}:public/assets/map/${name}.webp`],
        { maxBuffer: 16 * 1024 * 1024 },
      ),
    )
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const after = await sharp(`public/assets/map/${name}.webp`)
      .removeAlpha()
      .raw()
      .toBuffer();
    const differences: number[] = [];
    let changedInside = 0;
    for (let y = 0; y < before.info.height; y++)
      for (let x = 0; x < before.info.width; x++) {
        const factor = name === 'world' ? 1 : 10;
        // Clean1 intentionally replaces the main source rectangle; preserve all other islands.
        if (x >= 940 / factor && x < 2240 / factor && y >= 610 / factor)
          continue;
        const inside = regions.some(
          (r) =>
            x >= r.left &&
            x < r.left + r.width &&
            y >= r.top &&
            y < r.top + r.height,
        );
        for (let c = 0; c < 3; c++) {
          const i = (y * before.info.width + x) * 3 + c;
          const d = Math.abs(before.data[i] - after[i]);
          if (inside) {
            if (d) changedInside++;
          } else differences.push(d);
        }
      }
    const stats = differenceStats(differences);
    console.log({ image: name, outsideBridgeDifference: stats });
    expect(stats.mae, name).toBeLessThanOrEqual(1.5);
    expect(stats.p99, name).toBeLessThanOrEqual(p99Limit);
    expect(changedInside, name).toBeGreaterThan(0);
  }
});
it('old tile footprints are contained in bridge regions and the removed east tail restores source island art', async () => {
  const oldWorld = JSON.parse(
    execFileSync('git', ['show', `${report.baselineCommit}:data/world.json`], {
      encoding: 'utf8',
    }),
  ) as typeof worldMap;
  for (const b of oldWorld.bridges)
    for (let i = 1; i < b.points.length; i++) {
      const a = b.points[i - 1],
        z = b.points[i];
      for (
        let y = Math.floor(Math.min(a[1], z[1]) - 25);
        y <= Math.ceil(Math.max(a[1], z[1]) + 25);
        y++
      )
        for (
          let x = Math.floor(Math.min(a[0], z[0]) - 25);
          x <= Math.ceil(Math.max(a[0], z[0]) + 25);
          x++
        ) {
          if (segmentDistance([x, y], a, z) > 25) continue;
          expect(
            report.regions.some(
              (r) =>
                x >= r.left &&
                x < r.left + r.width &&
                y >= r.top &&
                y < r.top + r.height,
            ),
            `${b.id} old footprint ${x},${y}`,
          ).toBe(true);
        }
    }
  // This old baked segment was removed, not covered by the new bridge. Compare
  // with the original island pixels, not HEAD (which still contains those tiles).
  const source = await sharp(
    '/Volumes/Media/immortal-qa/design/art/concept/map_island_east_v1.jpg',
  )
    .removeAlpha()
    .raw()
    .toBuffer();
  const actual = await sharp('public/assets/map/world.webp')
    .removeAlpha()
    .raw()
    .toBuffer();
  const old = await sharp(
    execFileSync('git', [
      'show',
      `${report.baselineCommit}:public/assets/map/world.webp`,
    ]),
  )
    .removeAlpha()
    .raw()
    .toBuffer();
  const differences: number[] = [],
    oldDifferences: number[] = [];
  const paper = [245, 236, 221],
    target = [241, 232, 212];
  for (let y = 1002; y < 1030; y++)
    for (let x = 2380; x < 2410; x++)
      for (let c = 0; c < 3; c++) {
        const v = source[((y - 521) * 1280 + x - 2013) * 3 + c];
        const calibrated = Math.min(
          target[c],
          Math.min(
            255,
            Math.round(
              v *
                (1 +
                  (target[c] / paper[c] - 1) *
                    Math.max(0, Math.min(1, (v - 125) / 80))),
            ),
          ),
        );
        const i = (y * 3200 + x) * 3 + c;
        differences.push(Math.abs(actual[i] - calibrated));
        oldDifferences.push(Math.abs(old[i] - calibrated));
      }
  const stats = differenceStats(differences),
    oldStats = differenceStats(oldDifferences);
  console.log({ removedEastTail: stats, oldTiledTail: oldStats });
  expect(stats.mae).toBeLessThanOrEqual(5);
  expect(oldStats.mae).toBeGreaterThan(5); // Demonstrate this check rejects the old tiles.
});
it('north right rail survives middle cropping, rotation and lower-half repetition', async () => {
  const f = manifest.files.find((f) => f.file === 'map/bridge-h@2x.webp')!;
  const { data, info } = await sharp(`public/assets/${f.file}`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const center = (f.anchors![0].x + f.anchors![1].x) / 2;
  for (
    let x = Math.ceil(center - f.deck!.repeatLength / 2);
    x < Math.floor(center + f.deck!.repeatLength / 2);
    x++
  ) {
    let present = false;
    for (let y = 25; y <= 65; y++)
      if (data[(y * info.width + x) * 4 + 3] >= 128) present = true;
    expect(present, `source back rail column ${x}`).toBe(true);
  }
  expect(report.northRail.toY - report.northRail.fromY + 1).toBe(114);
  expect(report.northRail.missingRows).toEqual([]);
});
it('Clean1 preserves bridge and other-island geometry bytes from HEAD', async () => {
  const before = execFileSync('git', ['show', 'HEAD:data/world.json'], {
    encoding: 'utf8',
  });
  const after = await readFile('data/world.json', 'utf8');
  const fixed = (s: string) =>
    s.slice(s.indexOf('    {\n      "id": "north"'), s.indexOf('  "slots":'));
  expect(fixed(after)).toBe(fixed(before));
});
