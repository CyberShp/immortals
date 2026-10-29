import { nearestWalkable } from '../src/render/world';
import { footprintPolygons } from '../src/render/world';
import { expect, it } from 'vitest';
import sharp from 'sharp';
import { stat } from 'node:fs/promises';
import {
  worldSchema,
  worldMap,
  walkable,
  findPath,
  lineClear,
  pathLength,
  WALK_SPEED,
  walkTimeSeconds,
  destination,
  destinationBuilding,
  discipleDestinations,
  FOOT_SPACING,
  STINT,
  stintOf,
  islandOf,
  routeSpeed,
} from '../src/render/world';
import { createWorld, step, advance } from '../src/sim/world';
import { loadData } from '../src/sim/data';
import buildings from '../docs/world-buildings.json';
const points = [
  ...worldMap.spots.map((s) => {
    const d = worldMap.islands.find((d) => d.id === s.island)!;
    return nearestWalkable([
      s.point[0] + d.offset[0],
      s.point[1] + d.offset[1],
    ]);
  }),
  ...worldMap.slots.map((s) => s.front),
];
it('validates world configuration and all landing/front positions', () => {
  expect(worldSchema.safeParse(worldMap).success).toBe(true);
  points.forEach((p) => expect(walkable(p), JSON.stringify(p)).toBe(true));
});
it('every pair of island spots and building fronts is reachable without crossing obstacles', () => {
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const path = findPath(points[i], points[j]);
      expect(
        path.length,
        JSON.stringify([points[i], points[j]]),
      ).toBeGreaterThan(0);
      path.slice(1).forEach((p, k) => expect(lineClear(path[k], p)).toBe(true));
    }
}, 30000);
it('render destinations and paths never mutate simulation across 200 steps', () => {
  const a = createWorld(42, loadData()),
    b = createWorld(42, loadData());
  for (let i = 0; i < 200; i++) {
    step(a);
    a.disciples.forEach((d, k) => destination(d, a.tick, k));
    step(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }
});
it('reports dorm to hall walking duration', () => {
  const a = worldMap.slots.find((s) => s.id === 'B_DORM')!.front,
    b = worldMap.slots.find((s) => s.id === 'B_HALL')!.front;
  const path = findPath(a, b);
  expect(path.length).toBeGreaterThan(0);
  console.log({
    dormHallLength: pathLength(path),
    speed: WALK_SPEED,
    seconds: walkTimeSeconds(a, b),
  });
});
it('four source dimensions and world budget', async () => {
  for (const file of [
    'map_main_clean_v1.jpg',
    'map_island_north_v1.jpg',
    'map_island_west_v1.jpg',
    'map_island_east_v1.jpg',
  ]) {
    const m = await sharp(
      '/Volumes/Media/immortal-qa/design/art/concept/' + file,
    ).metadata();
    expect([m.width, m.height]).toEqual([1280, 720]);
  }
  const m = await sharp('public/assets/map/world.webp').metadata();
  expect([m.width, m.height]).toEqual([3200, 1400]);
  expect((await stat('public/assets/map/world.webp')).size).toBeLessThanOrEqual(
    1500000,
  );
});
it('alchemy actual alpha masks avoid meditation and cliff', async () => {
  for (const b of buildings.filter((b) => b.file.includes('alchemy'))) {
    const { data, info } = await sharp('public/assets/' + b.file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const manifest = (await import('../public/assets/manifest.json')).default;
    const f = manifest.files.find((f) => f.file === b.file)!;
    // The new placement can overlap the other sprite's transparent bounding margin.
    const medit = buildings.find((m) =>
      m.file.includes('meditation-t' + (b.file.includes('t1') ? '1' : '2')),
    )!;
    const mf = manifest.files.find((f) => f.file === medit.file)!;
    const md = await sharp('public/assets/' + medit.file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        if (!data[(y * info.width + x) * 4 + 3]) continue;
        const wx = b.x + (x - f.anchor.x) * b.scale,
          wy = b.y + (y - f.anchor.y) * b.scale;
        expect(wy + b.scale).toBeLessThanOrEqual(1090);
        const mx = Math.floor((wx - medit.x) / medit.scale + mf.anchor.x);
        const my = Math.floor((wy - medit.y) / medit.scale + mf.anchor.y);
        if (mx >= 0 && my >= 0 && mx < md.info.width && my < md.info.height)
          expect(md.data[(my * md.info.width + mx) * 4 + 3]).toBe(0);
      }
  }
});
it('invalid cloud endpoints never produce a fake direct path', () =>
  expect(findPath([10, 10], points[0])).toEqual([]));
it('grounded garden fence polygon excludes crops from walking', () => {
  const slot = worldMap.slots.find((s) => s.id === 'B_GARDEN')!;
  const poly = footprintPolygons(slot.footprint)[0];
  for (const p of poly) expect(walkable(p)).toBe(false);
  const center = poly.reduce(
    (a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4],
    [0, 0],
  );
  expect(walkable(center as [number, number])).toBe(false);
  expect(walkable(slot.entrance)).toBe(true);
});

it('W1c measured doors, tier widths and body alignment agree with source geometry', async () => {
  const { DISCIPLE_HEIGHT, DISCIPLE_SCALE } =
    await import('../src/render/world-scale');
  const manifest = (await import('../public/assets/manifest.json')).default;
  for (const b of buildings) {
    expect(b.discipleHeight).toBe(DISCIPLE_HEIGHT);
    expect(b.discipleScale).toBe(DISCIPLE_SCALE);
    const f = manifest.files.find((f) => f.file === b.file)!;
    expect(b.grounded).toBe(true);
    expect(b.sourceScale).toBeCloseTo(b.scale * f.scale);
    expect(b.bodyBottom).toBe(b.y);
    expect(b.doorRule).toBeNull();
  }
  for (const key of ['dorm', 'alchemy']) {
    const pair = buildings.filter((b) => b.file.includes(key));
    expect(
      Math.max(...pair.map((b) => b.bodyWidth)) /
        Math.min(...pair.map((b) => b.bodyWidth)),
    ).toBeLessThanOrEqual(1.1 + 1e-9);
  }
});

for (const tick of [0, 60]) {
  it(`rendered landing feet stay separated at tick ${tick}`, () => {
    for (const seed of [1, 42, 2026]) {
      const w = createWorld(seed, loadData());
      for (let i = 0; i < tick; i++) step(w);
      const before = JSON.stringify(w);
      const points = discipleDestinations(w.disciples, w.tick);
      points.forEach((p, i) => {
        expect(walkable(p)).toBe(true);
        for (const q of points.slice(0, i)) {
          if (
            worldMap.slots.some(
              (s) =>
                s.entrance[0] === p[0] &&
                s.entrance[1] === p[1] &&
                q[0] === p[0] &&
                q[1] === p[1],
            )
          )
            continue;
          const distance = Math.hypot(p[0] - q[0], p[1] - q[1]);
          expect(distance).toBeGreaterThanOrEqual(24);
          expect(distance).toBeGreaterThanOrEqual(FOOT_SPACING - 1e-9);
        }
      });
      expect(discipleDestinations(w.disciples, w.tick)).toEqual(points);
      expect(JSON.stringify(w)).toBe(before);
      if (tick === 0) {
        expect(points.slice(0, 4)).toEqual([
          [1540, 1030],
          [1590, 1050],
          [1640, 1030],
          worldMap.slots.find((s) => s.id === 'B_HALL')!.entrance,
        ]);
      }
    }
  });
}
it('six workers share the exact entrance before fading inside', () => {
  for (const slot of worldMap.slots) {
    const w = createWorld(42, loadData());
    w.disciples.forEach((d) => {
      d.state.location = `工地:${slot.id}`;
      d.state.behavior = '做工';
    });
    const points = discipleDestinations(w.disciples, 60);
    points.forEach((p) => {
      expect(walkable(p)).toBe(true);
      expect(lineClear(slot.front, p)).toBe(true);
      expect(p).toEqual(slot.entrance);
    });
  }
});

it('600 simulation ticks distribute outdoor destinations across every island at least eight percent', () => {
  const w = createWorld(42, loadData());
  const counts: Record<string, number> = {};
  let total = 0;
  for (let tick = 0; tick <= 600; tick++) {
    for (const p of discipleDestinations(
      w.disciples.filter((d) => !destinationBuilding(d)),
      w.tick,
    )) {
      const island = islandOf(p);
      expect(island).not.toBeNull();
      counts[island!] = (counts[island!] ?? 0) + 1;
      total++;
    }
    advance(w, 1);
  }
  console.log({ islandDestinations: counts, total });
  for (const island of worldMap.islands)
    expect(counts[island.id] / total).toBeGreaterThanOrEqual(0.08);
});
it('idle destination is stable within each phased stint and work goes to its front', () => {
  const w = createWorld(42, loadData());
  for (const d of w.disciples) {
    d.state.behavior = '社交';
    d.state.location = '空地';
    for (let tick = 2; tick <= 600; tick++)
      if (stintOf(d.id, tick) === stintOf(d.id, tick - 1))
        expect(destination(d, tick)).toEqual(destination(d, tick - 1));
    d.state.behavior = '做工';
    d.state.location = '药圃';
    expect(destination(d, 60)).toEqual(
      worldMap.slots.find((s) => s.id === 'B_GARDEN')!.front,
    );
    d.state.location = '采石点';
    expect(islandOf(destination(d, 60))).toBe('main');
  }
});
it('longest landing route fits seventy percent of a stint including spaced destinations', () => {
  const anchors = [...points];
  // Include six-person crowd offsets, not just the unoccupied map anchors.
  const w = createWorld(42, loadData());
  for (const tick of [0, 60, 600]) {
    advance(w, tick - w.tick);
    anchors.push(...discipleDestinations(w.disciples, w.tick));
  }
  let longest = 0,
    seconds = 0;
  for (let i = 0; i < anchors.length; i++)
    for (let j = i + 1; j < anchors.length; j++) {
      const path = findPath(anchors[i], anchors[j]);
      expect(path.length).toBeGreaterThan(0);
      longest = Math.max(longest, pathLength(path));
      seconds = Math.max(seconds, pathLength(path) / routeSpeed(path));
    }
  console.log({ longestPath: longest, maximumSeconds: seconds });
  expect(seconds).toBeLessThanOrEqual(STINT * 10 * 0.7);
}, 30000);
it('meditation alpha overlaps only its own slot', () => {
  for (const b of buildings.filter((b) => b.file.includes('meditation'))) {
    expect(b.overlapSelfSlot).toBeGreaterThan(0);
    expect(b.overlapNeighborSlots).toBe(0);
  }
});
