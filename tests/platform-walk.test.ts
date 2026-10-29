import { expect, it } from 'vitest';
import {
  corridorCut,
  findPath,
  inFootprint,
  inPolygon,
  lineClear,
  platformWalkables,
  walkable,
  worldMap,
  type Point,
} from '../src/render/world';

// Walkable area before platforms: islands (minus obstacles), bridges, minus
// building footprints and the corridor cut. Platforms may only add their deck.
function baseWalkable(p: Point) {
  if (p[0] < 0 || p[1] < 0 || p[0] >= 3200 || p[1] >= 1400) return false;
  if (worldMap.slots.some((s) => inFootprint(p, s.footprint))) return false;
  if (inFootprint(p, { polygon: corridorCut })) return false;
  return (
    worldMap.bridges.some((b) => inPolygon(p, b.walkable)) ||
    worldMap.islands.some((d) => {
      const q: Point = [p[0] - d.offset[0], p[1] - d.offset[1]];
      return (
        inPolygon(q, d.walkable) && !d.obstacles.some((h) => inPolygon(q, h))
      );
    })
  );
}
const scaled = (c: Point, v: Point, k: number): Point => [
  c[0] + (v[0] - c[0]) * k,
  c[1] + (v[1] - c[1]) * k,
];
const center = (poly: Point[]): Point => [
  poly.reduce((s, p) => s + p[0], 0) / poly.length,
  poly.reduce((s, p) => s + p[1], 0) / poly.length,
];

it('platform walkable area is exactly base walkable ∪ deck ellipse', () => {
  expect(platformWalkables.map((p) => p.id).sort()).toEqual(['east', 'west']);
  for (const { polygon } of platformWalkables) {
    const xs = polygon.map((p) => p[0]),
      ys = polygon.map((p) => p[1]);
    // Dense grid over the deck bbox plus a 30px margin.
    for (let x = Math.min(...xs) - 30; x <= Math.max(...xs) + 30; x += 2)
      for (let y = Math.min(...ys) - 30; y <= Math.max(...ys) + 30; y += 2) {
        const p: Point = [x + 0.25, y + 0.25];
        const blocked =
          worldMap.slots.some((s) => inFootprint(p, s.footprint)) ||
          inFootprint(p, { polygon: corridorCut });
        expect(walkable(p)).toBe(
          !blocked && (baseWalkable(p) || inPolygon(p, polygon)),
        );
      }
  }
});

it('outer ring of each deck stays non-walkable where it was (cliff faces are not opened)', () => {
  for (const { id, polygon } of platformWalkables) {
    const c = center(polygon);
    let blockedOutside = 0;
    for (let i = 0; i < polygon.length; i++) {
      const v = polygon[i],
        m = scaled(v, polygon[(i + 1) % polygon.length], 0.5);
      for (const edge of [v, m])
        for (const k of [1.04, 1.1, 1.25]) {
          const out = scaled(c, edge, k);
          if (inPolygon(out, polygon)) continue;
          expect(walkable(out), `${id} ${out}`).toBe(baseWalkable(out));
          if (!baseWalkable(out)) {
            blockedOutside++;
            expect(lineClear(c, out), `${id} line ${out}`).toBe(false);
            expect(findPath(c, out), `${id} path ${out}`).toEqual([]);
          }
        }
      // Points just inside the deck are walkable.
      expect(walkable(scaled(c, v, 0.92)), `${id} inner`).toBe(true);
    }
    // Both platforms hang partly over cliffs / void, so the ring check is real.
    expect(blockedOutside, id).toBeGreaterThan(10);
  }
});

it('from each deck both bridge ends are reachable without leaving deck/base walkable', () => {
  for (const { id, polygon } of platformWalkables) {
    const c = center(polygon);
    expect(walkable(c)).toBe(true);
    const bridge = worldMap.bridges.find((b) => b.id === id)!;
    const ends = [bridge.points[0], bridge.points[bridge.points.length - 1]];
    for (const end of ends as Point[]) {
      const path = findPath(c, end);
      expect(path.length, `${id} -> ${end}`).toBeGreaterThan(1);
      for (let i = 1; i < path.length; i++) {
        const [a, b] = [path[i - 1], path[i]];
        const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
        for (let s = 0; s <= n; s++) {
          const p: Point = [
            a[0] + ((b[0] - a[0]) * s) / Math.max(1, n),
            a[1] + ((b[1] - a[1]) * s) / Math.max(1, n),
          ];
          expect(
            baseWalkable(p) || inPolygon(p, polygon),
            `${id} path point ${p}`,
          ).toBe(true);
        }
      }
    }
  }
});
