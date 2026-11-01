import {
  v4Active,
  v4Walkable,
  v4Navigation,
  v4SegmentBlocked,
} from './world-v4';
import { pedestalGeometry } from './pedestal';
import corridor from './main-corridor.json';
export const corridorCut = corridor.blockedPolygon as [number, number][];
import platform from '../../scripts/platform-geometry.json';
export const platformWalkables = platform.joints.map((j) => ({
  id: j.id,
  polygon: j.polygon as [number, number][],
}));
import { z } from 'zod';
import raw from '../../data/world.json';
import { coolActive, coolWorld } from './cool-world';
export { coolActive, coolWorld } from './cool-world';
import type { Disciple } from '../sim/data';
const point = z.tuple([z.number().finite(), z.number().finite()]);
const polygon = z.array(point).min(3);
const rect = z.tuple([z.number(), z.number(), z.number(), z.number()]);
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
        entrance: point,
        footprint: z.union([rect, z.array(rect).min(1), z.object({ polygon })]),
      }),
    )
    .length(6),
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
export const sourceWorldMap = worldSchema.parse(raw);
type ClassicWorldMap = z.infer<typeof worldSchema>;
type WorldMap = Omit<ClassicWorldMap, 'width' | 'height'> & {
  width: number;
  height: number;
};
// Presentation-only overrides. Raw data and simulation remain byte-for-byte untouched.
const classicWorldMap: ClassicWorldMap = worldSchema.parse({
  ...raw,
  slots: raw.slots.map((slot) => {
    const measured = pedestalGeometry.buildings.find((b) => b.id === slot.id);
    return measured
      ? {
          ...slot,
          footprint: measured.footprint,
          entrance: measured.entrance,
          front: measured.entrance,
        }
      : slot;
  }),
});
// ?cool=1：换成单石台几何（cool-world.json，独立 zod 校验）；关闭时即原四岛几何。
export const worldMap: WorldMap = coolWorld ?? classicWorldMap;
// 旧四岛专用的走廊切口与圆台连接面，cool 下不参与可走判定与导航。
const activeCorridorCut: Point[] | null = coolActive ? null : corridorCut;
const activePlatformWalkables = coolActive ? [] : platformWalkables;
export type Point = [number, number];
export { DISCIPLE_SCALE, DISCIPLE_HEIGHT } from './world-scale';
// Legacy renderer interpolated every trip over 1.2s, not at a constant speed.
// Reference: old dorm plot front (202.5,170.5) -> hall (299.75,153).
import { WALK_SPEED as BASE_WALK_SPEED } from './world-scale';
export const WALK_SPEED = BASE_WALK_SPEED * (v4Active ? 1.64 : 1);
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
export type FootprintRect = [number, number, number, number];
export type Footprint = FootprintRect | FootprintRect[] | { polygon: Point[] };
export function footprintRects(footprint: Footprint): FootprintRect[] {
  if ('polygon' in footprint)
    throw new Error('Polygon footprint requires footprintPolygons');
  return typeof footprint[0] === 'number'
    ? [footprint as FootprintRect]
    : (footprint as FootprintRect[]);
}
export function footprintPolygons(footprint: Footprint): Point[][] {
  if ('polygon' in footprint) return [footprint.polygon];
  return footprintRects(footprint).map(([l, t, r, b]) => [
    [l, t],
    [r, t],
    [r, b],
    [l, b],
  ]);
}
export function inFootprint(p: Point, footprint: Footprint) {
  if ('polygon' in footprint)
    return (
      inPolygon(p, footprint.polygon) ||
      footprint.polygon.some(
        (a, i) =>
          segmentDistance(
            p,
            a,
            footprint.polygon[(i + 1) % footprint.polygon.length],
          ) <= 1e-7,
      )
    );
  return footprintRects(footprint).some((rect) => inRect(p, rect));
}
function inRect(p: Point, rect: readonly number[]) {
  return (
    p[0] >= rect[0] && p[0] <= rect[2] && p[1] >= rect[1] && p[1] <= rect[3]
  );
}
export function walkable(p: Point) {
  if (v4Active) return v4Walkable(p);
  if (p[0] < 0 || p[1] < 0 || p[0] >= worldMap.width || p[1] >= worldMap.height)
    return false;
  if (worldMap.slots.some((s) => inFootprint(p, s.footprint))) return false;
  if (activeCorridorCut && inFootprint(p, { polygon: activeCorridorCut }))
    return false;
  return (
    activePlatformWalkables.some((b) => inPolygon(p, b.polygon)) ||
    worldMap.bridges.some((b) => inPolygon(p, b.walkable)) ||
    worldMap.islands.some((d) => {
      const q: Point = [p[0] - d.offset[0], p[1] - d.offset[1]];
      return (
        inPolygon(q, d.walkable) && !d.obstacles.some((h) => inPolygon(q, h))
      );
    })
  );
}
const navigationPolygons: Point[][] = v4Active
  ? v4Navigation
  : [
      ...(activeCorridorCut ? [activeCorridorCut] : []),
      ...worldMap.islands.flatMap((i) =>
        [i.walkable, ...i.obstacles].map((poly) =>
          poly.map((p) => [p[0] + i.offset[0], p[1] + i.offset[1]] as Point),
        ),
      ),
      ...worldMap.bridges.map((b) => b.walkable),
      ...activePlatformWalkables.map((b) => b.polygon),
      ...worldMap.slots.flatMap((s) => footprintPolygons(s.footprint)),
    ];
const navigationEdges = navigationPolygons.flatMap((poly) =>
  poly.map((a, i) => [a, poly[(i + 1) % poly.length]]),
);
export function lineClear(a: Point, b: Point) {
  if (!walkable(a) || !walkable(b)) return false;
  if (v4Active && v4SegmentBlocked(a, b)) return false;
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    cuts = [0, 1];
  // Partition at every geometry boundary, then test each open interval.
  // Fixed-distance sampling can miss a short corner crossing during interpolation.
  for (const [p, q] of navigationEdges) {
    if (
      Math.max(p[0], q[0]) < Math.min(a[0], b[0]) ||
      Math.min(p[0], q[0]) > Math.max(a[0], b[0]) ||
      Math.max(p[1], q[1]) < Math.min(a[1], b[1]) ||
      Math.min(p[1], q[1]) > Math.max(a[1], b[1])
    )
      continue;
    const ex = q[0] - p[0],
      ey = q[1] - p[1],
      det = dx * ey - dy * ex;
    if (Math.abs(det) < 1e-10) continue;
    const px = p[0] - a[0],
      py = p[1] - a[1];
    const t = (px * ey - py * ex) / det,
      u = (px * dy - py * dx) / det;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((a, b) => a - b);
  for (let i = 1; i < cuts.length; i++) {
    const t = (cuts[i - 1] + cuts[i]) / 2;
    if (!walkable([a[0] + dx * t, a[1] + dy * t])) return false;
  }
  // Closed footprints also reject tangencies, so the exact corner cannot be occupied.
  if (v4Active)
    return cuts.every((t) => walkable([a[0] + dx * t, a[1] + dy * t]));
  return cuts.every(
    (t) =>
      !worldMap.slots.some((s) =>
        inFootprint([a[0] + dx * t, a[1] + dy * t], s.footprint),
      ),
  );
}
const CELL = 10,
  COLS = Math.ceil(worldMap.width / CELL),
  ROWS = Math.ceil(worldMap.height / CELL);
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
export function destinationBuilding(d: Disciple) {
  return d.state.location.startsWith('工地:')
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
}
export function destination(d: Disciple, tick: number, index = 0): Point {
  const hash = idHash(`${d.id}:${stintOf(d.id, tick)}`);
  const building = destinationBuilding(d);
  let p: Point;
  const kind =
    d.traits.includes('T_SWORD') || String(d.state.behavior) === '练功'
      ? 'sword'
      : ['修炼', '休息'].includes(d.state.behavior)
        ? 'meditate'
        : 'social';
  if (tick === 0) {
    const home = coolActive ? 'platform' : 'main';
    const spots = worldMap.spots.filter(
      (s) => s.island === home && s.kind === 'social',
    );
    const main = worldMap.islands.find((s) => s.id === home)!;
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
  if (building) return worldMap.slots.find((s) => s.id === building)!.entrance;
  else if (d.state.behavior === '做工' && d.state.location === '采石点')
    p = nearestWalkable(coolWorld ? coolWorld.quarry : [1720, 752]);
  else {
    const spots = worldMap.spots.filter((s) => s.kind === kind),
      s = spots[hash % spots.length],
      island = worldMap.islands.find((i) => i.id === s.island)!;
    p = [s.point[0] + island.offset[0], s.point[1] + island.offset[1]];
  }
  return spacedLanding(nearestWalkable(p), [], index);
}

export const FOOT_SPACING = 28;
// 多人同站铺开（仅表现层，不进 sim）：第 1 人站锚点；从第 2 人起若锚点离最近建筑入口
// ≤ SPREAD_CHANNEL_RADIUS（有"入口通道"概念），只取离该入口全部 A* 通道 > 脚距的格子，
// 同一环内离通道越远越先（稳定排序，无随机，结果确定）。没有通道概念的站位保持原顺序。
// 只在 ?cool=1 打开：旧四岛世界保持原排列，保证开关关闭时逐像素不变。
export const SPREAD_CHANNEL_RADIUS = 3 * FOOT_SPACING;
const SPREAD_CHANNEL_RINGS = 4;
export const spreadAwayActive = coolActive;
/** 点到一组折线的最近距离。 */
export function channelClearance(p: Point, paths: Point[][]) {
  let best = Infinity;
  for (const path of paths)
    for (let i = 1; i < path.length; i++)
      best = Math.min(best, segmentDistance(p, path[i - 1], path[i]));
  return best;
}
const entranceChannels = new Map<string, { from: Point; path: Point[] }[]>();
function channelsInto(slot: (typeof worldMap.slots)[number]) {
  const hit = entranceChannels.get(slot.id);
  if (hit) return hit;
  const e = slot.entrance as Point;
  const sources: Point[] = [
    ...worldMap.slots.map((s) => s.entrance as Point),
    ...worldMap.spots.map((s): Point => {
      const o = worldMap.islands.find((i) => i.id === s.island)!.offset;
      return [s.point[0] + o[0], s.point[1] + o[1]];
    }),
    ...(coolWorld ? [coolWorld.quarry, coolWorld.expeditionPoint] : []),
  ];
  const result = sources
    .filter((p) => Math.hypot(p[0] - e[0], p[1] - e[1]) > 1e-6)
    .map((from) => ({ from, path: findPath(from, e) }))
    .filter((c) => c.path.length >= 2);
  entranceChannels.set(slot.id, result);
  return result;
}
const spreadCache = new Map<string, Point[][] | null>();
/** 锚点对应的入口通道（最近建筑入口的全部来向 A* 路径，不含从锚点自身出发的那条）；无通道概念时为 null。 */
export function spreadChannel(anchor: Point): Point[][] | null {
  if (!spreadAwayActive) return null;
  const key = anchor.join(',');
  const hit = spreadCache.get(key);
  if (hit !== undefined) return hit;
  let best = Infinity,
    slot: (typeof worldMap.slots)[number] | undefined;
  for (const s of worldMap.slots) {
    const d = Math.hypot(anchor[0] - s.entrance[0], anchor[1] - s.entrance[1]);
    if (d < best) {
      best = d;
      slot = s;
    }
  }
  const result =
    slot && best > 1e-6 && best <= SPREAD_CHANNEL_RADIUS
      ? channelsInto(slot)
          .filter(
            (c) =>
              Math.hypot(c.from[0] - anchor[0], c.from[1] - anchor[1]) >=
              FOOT_SPACING,
          )
          .map((c) => c.path)
      : null;
  spreadCache.set(key, result);
  return result;
}
function ringCells(anchor: Point, ring: number): Point[] {
  const cells: Point[] = [];
  for (let dy = -ring; dy <= ring; dy++)
    for (let dx = -ring; dx <= ring; dx++)
      if (Math.max(Math.abs(dx), Math.abs(dy)) === ring)
        cells.push([
          anchor[0] + dx * FOOT_SPACING,
          anchor[1] + dy * FOOT_SPACING,
        ]);
  return cells;
}
// Search actual walkable grid candidates; projecting blocked offsets back onto
// an edge can collapse several occupants to the same point.
export function spacedLanding(
  anchor: Point,
  occupied: Point[],
  skip = 0,
): Point {
  const free = (p: Point) =>
    walkable(p) &&
    lineClear(anchor, p) &&
    !occupied.some(
      (q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < FOOT_SPACING - 1e-9,
    );
  const channel = spreadChannel(anchor);
  if (channel) {
    let left = skip;
    for (let ring = 0; ring <= SPREAD_CHANNEL_RINGS; ring++) {
      const cells = ringCells(anchor, ring);
      const order = ring
        ? cells
            .map((p) => ({ p, d: channelClearance(p, channel) }))
            .filter((c) => c.d > FOOT_SPACING)
            .sort((a, b) => b.d - a.d)
            .map((c) => c.p)
        : cells;
      for (const p of order) {
        if (!free(p)) continue;
        if (left-- > 0) continue;
        return p;
      }
    }
    // 附近没有离通道足够远的空格：退回原顺序（极端拥挤时才会走到）。
  }
  for (let ring = 0; ring <= 100; ring++)
    for (const p of ringCells(anchor, ring)) {
      if (!free(p)) continue;
      if (skip-- > 0) continue;
      return p;
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
    occupied.push(
      tick > 0 && destinationBuilding(d)
        ? anchor
        : spacedLanding(anchor, occupied),
    );
  }
  return occupied;
}
