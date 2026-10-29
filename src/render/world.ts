import { z } from 'zod';
import raw from '../../data/world.json';
import buildingMasks from '../../docs/world-buildings.json';
import type { Disciple } from '../sim/data';
const point = z.tuple([z.number().finite(), z.number().finite()]);
const polygon = z.array(point).min(3);
export const worldSchema = z.object({
  width: z.literal(3200),
  height: z.literal(1400),
  islands: z
    .array(
      z.object({
        id: z.string(),
        offset: point,
        walkable: polygon,
        obstacles: z.array(polygon),
      }),
    )
    .length(4),
  bridges: z.array(
    z.object({
      id: z.string(),
      points: z.array(point).min(2),
      width: z.number().positive(),
      walkable: polygon,
    }),
  ),
  slots: z
    .array(
      z.object({
        id: z.string(),
        rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        front: point,
      }),
    )
    .length(5),
  spots: z.array(
    z.object({
      id: z.string(),
      island: z.string(),
      kind: z.enum(['meditate', 'social', 'sword']),
      point,
      original: point,
      moved: z.number(),
    }),
  ),
});
export const worldMap = worldSchema.parse(raw);
export type Point = [number, number];
export { DISCIPLE_SCALE, DISCIPLE_HEIGHT } from './world-scale';
// Legacy renderer interpolated every trip over 1.2s, not at a constant speed.
// Reference: old dorm plot front (202.5,170.5) -> hall (299.75,153).
import { WALK_SPEED } from './world-scale';
export { WALK_SPEED } from './world-scale';
export function inPolygon([x, y]: Point, poly: Point[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = poly[i],
      [u, v] = poly[j];
    if (b > y != v > y && x < ((u - a) * (y - b)) / (v - b) + a) c = !c;
  }
  return c;
}
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const gardenGround = buildingMasks.flatMap((b) => {
  if (!('footprintWorld' in b) || !b.footprintWorld) return [];
  const c = b.footprintWorld;
  const poly = [c.left, c.top, c.right, c.bottom] as Point[];
  return [
    {
      poly,
      left: Math.min(...poly.map((p) => p[0])) - 2,
      right: Math.max(...poly.map((p) => p[0])) + 2,
      top: Math.min(...poly.map((p) => p[1])) - 2,
      bottom: Math.max(...poly.map((p) => p[1])) + 2,
    },
  ];
});
export function walkable(p: Point) {
  // Both tiers reserve their entire ground parallelogram, including its edges.
  for (const g of gardenGround) {
    if (p[0] < g.left || p[0] > g.right || p[1] < g.top || p[1] > g.bottom)
      continue;
    if (
      inPolygon(p, g.poly) ||
      g.poly.some((a, i) => segmentDistance(p, a, g.poly[(i + 1) % 4]) <= 2)
    )
      return false;
  }
  // Reserve the union of tier base silhouettes as well as the plot lower half.
  if (
    buildingMasks.some(
      (b) =>
        p[0] >= b.left - 2 &&
        p[0] <= b.right + 2 &&
        p[1] >= b.bottom - 12 &&
        p[1] <= b.bottom + 2,
    )
  )
    return false;

  if (p[0] < 0 || p[1] < 0 || p[0] >= 3200 || p[1] >= 1400) return false;
  if (
    worldMap.slots.some(
      (s) =>
        p[0] >= s.rect[0] - 4 &&
        p[0] <= s.rect[2] + 4 &&
        p[1] >= (s.rect[1] + s.rect[3]) / 2 - 4 &&
        p[1] <= s.rect[3] + 4,
    )
  )
    return false;
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
export function lineClear(a: Point, b: Point) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
  for (let i = 0; i <= n; i++)
    if (
      !walkable([
        a[0] + ((b[0] - a[0]) * i) / (n || 1),
        a[1] + ((b[1] - a[1]) * i) / (n || 1),
      ])
    )
      return false;
  return true;
}
const CELL = 10,
  COLS = 320,
  ROWS = 140;
const grid = Uint8Array.from({ length: COLS * ROWS }, (_, i) =>
  Number(walkable([(i % COLS) * CELL, Math.floor(i / COLS) * CELL])),
);
const pos = (i: number): Point => [
  (i % COLS) * CELL,
  Math.floor(i / COLS) * CELL,
];
export function nearestWalkable(p: Point): Point {
  if (walkable(p)) return [...p];
  let best = Infinity,
    result: Point | undefined;
  grid.forEach((v, i) => {
    if (!v) return;
    const q = pos(i),
      d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < best) {
      best = d;
      result = q;
    }
  });
  if (!result) throw Error('Empty walkable world');
  return result;
}
function nearestNode(p: Point) {
  let best = Infinity,
    result = -1;
  const cx = Math.round(p[0] / CELL),
    cy = Math.round(p[1] / CELL);
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx,
        y = cy + dy,
        i = y * COLS + x;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS || !grid[i]) continue;
      const q = pos(i),
        d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < best && lineClear(p, q)) {
        best = d;
        result = i;
      }
    }
  if (result >= 0) return result;
  grid.forEach((v, i) => {
    if (!v) return;
    const q = pos(i),
      d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < best && lineClear(p, q)) {
      best = d;
      result = i;
    }
  });
  return result;
}
// Geometry is immutable for this render world; reuse exact grid-edge checks
// across routes instead of resampling the same building footprints every search.
const edgeClear = new Uint8Array(COLS * ROWS * 9);
function gridEdgeClear(i: number, n: number, dx: number, dy: number) {
  const key = i * 9 + (dy + 1) * 3 + dx + 1;
  if (!edgeClear[key]) {
    const value = lineClear(pos(i), pos(n)) ? 2 : 1;
    edgeClear[key] = value;
    edgeClear[n * 9 + (1 - dy) * 3 + 1 - dx] = value;
  }
  return edgeClear[key] === 2;
}
const cache = new Map<string, Point[]>();
export function findPath(from: Point, to: Point): Point[] {
  if (!walkable(from) || !walkable(to)) return [];
  const key = [...from, ...to].join(',');
  const hit = cache.get(key);
  if (hit) return hit.map((p) => [...p]);
  if (lineClear(from, to)) return [[...from], [...to]];
  const start = nearestNode(from),
    end = nearestNode(to);
  if (start < 0 || end < 0) return [];
  const costs = new Float64Array(grid.length).fill(Infinity),
    parents = new Int32Array(grid.length).fill(-1);
  const heap: { i: number; f: number }[] = [];
  const push = (v: { i: number; f: number }) => {
    heap.push(v);
    let k = heap.length - 1;
    while (k) {
      const p = (k - 1) >> 1;
      if (heap[p].f <= v.f) break;
      heap[k] = heap[p];
      k = p;
    }
    heap[k] = v;
  };
  const pop = () => {
    const top = heap[0],
      v = heap.pop()!;
    if (heap.length) {
      let k = 0;
      while (k * 2 + 1 < heap.length) {
        let c = k * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++;
        if (heap[c].f >= v.f) break;
        heap[k] = heap[c];
        k = c;
      }
      heap[k] = v;
    }
    return top;
  };
  costs[start] = 0;
  push({ i: start, f: 0 });
  const closed = new Set<number>();
  while (heap.length) {
    const { i } = pop();
    if (closed.has(i)) continue;
    if (i === end) break;
    closed.add(i);
    for (const dy of [-1, 0, 1])
      for (const dx of [-1, 0, 1]) {
        if (!dx && !dy) continue;
        const x = (i % COLS) + dx,
          y = Math.floor(i / COLS) + dy,
          n = y * COLS + x;
        if (
          x < 0 ||
          x >= COLS ||
          y < 0 ||
          y >= ROWS ||
          !grid[n] ||
          closed.has(n) ||
          !gridEdgeClear(i, n, dx, dy)
        )
          continue;
        const g = costs[i] + Math.hypot(dx, dy) * CELL;
        if (g < costs[n]) {
          costs[n] = g;
          parents[n] = i;
          push({
            i: n,
            f: g + Math.hypot(pos(n)[0] - to[0], pos(n)[1] - to[1]),
          });
        }
      }
  }
  if (!Number.isFinite(costs[end])) return [];
  const points: Point[] = [to];
  for (let i = end; i !== -1; i = parents[i]) points.unshift(pos(i));
  points.unshift(from);
  const smooth: Point[] = [points[0]];
  for (let i = 0; i < points.length - 1;) {
    let j = points.length - 1;
    while (j > i + 1 && !lineClear(points[i], points[j])) j--;
    smooth.push(points[j]);
    i = j;
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, smooth);
  return smooth.map((p) => [...p]);
}
export const pathLength = (path: Point[]) =>
  path
    .slice(1)
    .reduce(
      (n, p, i) => n + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]),
      0,
    );
// Keep local walks at their established pace; long crossings finish within 80s.
export const routeSpeed = (path: Point[]) =>
  Math.max(WALK_SPEED, pathLength(path) / 80);
export function walkTimeSeconds(from: Point, to: Point) {
  const p = findPath(from, to);
  return p.length ? pathLength(p) / routeSpeed(p) : Infinity;
}
export function alongPath(path: Point[], distance: number): Point {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance <= len)
      return [
        a[0] + ((b[0] - a[0]) * distance) / (len || 1),
        a[1] + ((b[1] - a[1]) * distance) / (len || 1),
      ];
    distance -= len;
  }
  return path.at(-1) ?? [1500, 950];
}
export const STINT = 12;
export function idHash(value: string) {
  let hash = 2166136261;
  for (const c of value)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
export const stintOf = (id: string, tick: number) =>
  Math.floor((tick + (idHash(id) % STINT)) / STINT);
export function islandOf(p: Point) {
  return (
    worldMap.islands.find((i) =>
      inPolygon([p[0] - i.offset[0], p[1] - i.offset[1]], i.walkable),
    )?.id ?? null
  );
}
export function destination(d: Disciple, tick: number, index = 0): Point {
  const hash = idHash(`${d.id}:${stintOf(d.id, tick)}`);
  const building = d.state.location.startsWith('工地:')
    ? d.state.location.slice(3)
    : (
        {
          主殿: 'B_HALL',
          居舍: 'B_DORM',
          静修室: 'B_MEDIT',
          炼丹房: 'B_ALCHEMY',
          药圃: 'B_GARDEN',
        } as Record<string, string>
      )[d.state.location];
  let p: Point;
  const kind =
    d.traits.includes('T_SWORD') || String(d.state.behavior) === '练功'
      ? 'sword'
      : ['修炼', '休息'].includes(d.state.behavior)
        ? 'meditate'
        : 'social';
  if (tick === 0) {
    const spots = worldMap.spots.filter(
      (s) => s.island === 'main' && s.kind === 'social',
    );
    const main = worldMap.islands.find((s) => s.id === 'main')!;
    const anchors: Point[] = [
      ...spots.map((s): Point => [
        s.point[0] + main.offset[0],
        s.point[1] + main.offset[1],
      ]),
      worldMap.slots.find((s) => s.id === 'B_HALL')!.front,
    ];
    return spacedLanding(
      anchors[index % anchors.length],
      [],
      Math.floor(index / anchors.length),
    );
  }
  if (building && d.state.behavior === '做工')
    p = worldMap.slots.find((s) => s.id === building)!.front;
  else if (d.state.behavior === '做工' && d.state.location === '采石点')
    p = nearestWalkable([1720, 752]);
  else {
    const spots = worldMap.spots.filter((s) => s.kind === kind),
      s = spots[hash % spots.length],
      island = worldMap.islands.find((i) => i.id === s.island)!;
    p = [s.point[0] + island.offset[0], s.point[1] + island.offset[1]];
  }
  return spacedLanding(nearestWalkable(p), [], index);
}

export const FOOT_SPACING = 28;
// Search actual walkable grid candidates; projecting blocked offsets back onto
// an edge can collapse several occupants to the same point.
export function spacedLanding(
  anchor: Point,
  occupied: Point[],
  skip = 0,
): Point {
  for (let ring = 0; ring <= 100; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const p: Point = [
          anchor[0] + dx * FOOT_SPACING,
          anchor[1] + dy * FOOT_SPACING,
        ];
        if (!walkable(p) || !lineClear(anchor, p)) continue;
        if (
          occupied.some(
            (q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < FOOT_SPACING - 1e-9,
          )
        )
          continue;
        if (skip-- > 0) continue;
        return p;
      }
    }
  }
  throw Error('No spaced walkable landing near ' + anchor.join(','));
}

export function discipleDestinations(
  disciples: Disciple[],
  tick: number,
): Point[] {
  const occupied: Point[] = [];
  for (const [i, d] of disciples.entries()) {
    const anchor = destination(d, tick, tick === 0 ? i : 0);
    occupied.push(spacedLanding(anchor, occupied));
  }
  return occupied;
}
