import raw from './spots-v2.json';
import {
  uv,
  v4Walkable,
  v4Spawn,
  v4Layout,
  v4Island,
  type P,
} from './world-v4';
import {
  worldMap,
  destination,
  findPath,
  pathLength,
  spacedLanding,
} from './world';
import { renderRandom } from '../display/random';
import type { World } from '../sim/world';
import type { Disciple } from '../sim/data';
export type Spot = {
  id: string;
  island: string;
  point: P;
  cat: string;
  cap: number;
  prefer: string[];
  building?: string;
};
export const satelliteSpots: Spot[] = raw.spots.map((s) => ({
  ...s,
  point: uv(...(s.uv as P)),
  prefer: 'prefer' in s ? s.prefer! : [],
}));
export const stages = raw.stages.map((s) => ({
  ...s,
  point: uv(...(s.uv as P)),
}));
export const v4Cushions = [
  ...v4Layout.cushion_block.west_centers,
  ...v4Layout.cushion_block.east_centers,
].map((p) => uv(...(p as P)));
/** Screen-grid orthonormal axes: horizontal (u,v)=(.7071,-.7071), vertical=(.7071,.7071). */
export function musterPositions(count = 6, walkable = v4Walkable): P[] {
  const center = raw.spots.find((s) => s.id === 'S_MUSTER')!.uv;
  return Array.from({ length: Math.min(6, count) }, (_, i) => {
    const a = (i * Math.PI) / 3,
      x = 0.6 * Math.cos(a),
      y = 0.6 * Math.sin(a);
    return uv(center[0] + 0.7071 * (x + y), center[1] + 0.7071 * (-x + y));
  }).filter(walkable);
}
/** First six main-platform departures reserve distinct landings; satellite/overflow stay put. */
export function expeditionLanding(
  from: P,
  reserved: readonly P[],
  walkable = v4Walkable,
  slot = reserved.length,
): P {
  if (v4Island(from) !== 'main') return from;
  const point = musterPositions(6, () => true)[slot];
  return point &&
    walkable(point) &&
    reserved.every((q) => Math.hypot(point[0] - q[0], point[1] - q[1]) >= 45.92)
    ? point
    : from;
}
export function subpositions(spot: Spot): P[] {
  if (spot.id === 'S_MUSTER') return musterPositions(spot.cap);
  if (spot.cap === 1) return [spot.point];
  const source = raw.spots.find((s) => s.id === spot.id);
  if (source)
    return [-1, 1].map((k) =>
      uv(source.uv[0] + k * 0.1767, source.uv[1] - k * 0.1767),
    );
  return [spot.point];
}
export const ringPair = [-1, 1].map((k) => {
  const p = raw.stages[0].uv;
  return uv(p[0] + k * 0.424, p[1] - k * 0.424);
});
export function duelPositions(count: number): P[] {
  const points = [...ringPair];
  for (const stage of stages.slice(1))
    if (points.length < count) points.push(stage.point);
  // Additional spectators grow around the two watch anchors, without projecting onto obstacles.
  for (let ring = 1; points.length < count && ring < 100; ring++)
    for (const stage of stages.slice(1))
      for (let i = 0; i < 12 && points.length < count; i++) {
        const p: P = [
          stage.point[0] + ring * 55 * Math.cos((i * Math.PI) / 6),
          stage.point[1] + ring * 55 * Math.sin((i * Math.PI) / 6),
        ];
        if (
          v4Walkable(p) &&
          points.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= 45.92)
        )
          points.push(p);
      }
  return points.slice(0, count);
}
export const spotWeight = (spot: Spot, from: P, traits: readonly string[]) =>
  (spot.prefer.some((t) => traits.includes(t)) ? 3 : 1) /
  Math.max(1, Math.hypot(spot.point[0] - from[0], spot.point[1] - from[1]));
export function selectSpot(
  spots: Spot[],
  from: P,
  traits: readonly string[],
  occupied: ReadonlyMap<string, number>,
  random: () => number,
) {
  const available = spots.filter(
    (s) => (occupied.get(s.id) ?? 0) < subpositions(s).length,
  );
  if (!available.length) return undefined;
  let roll =
    random() *
    available.reduce((sum, s) => sum + spotWeight(s, from, traits), 0);
  return (
    available.find((s) => (roll -= spotWeight(s, from, traits)) < 0) ??
    available.at(-1)
  );
}
const category = (d: Disciple) =>
  ({ 修炼: 'train', 做工: 'work', 社交: 'social', 休息: 'rest', 历练: 'fade' })[
    d.state.behavior
  ];
export type Assignment = {
  point: P;
  spot?: Spot;
  slot?: number;
  key: string;
  waitingSince?: number;
  fallback?: boolean;
};
export class SpotPlanner {
  assignments = new Map<string, Assignment>();
  private seed = -1;
  private lastTick = -1;
  private random = renderRandom(0, 'render-spots');
  reset() {
    this.assignments.clear();
    this.seed = -1;
    this.lastTick = -1;
  }
  plan(world: World, list: Disciple[], positions: ReadonlyMap<string, P>) {
    if (world.rng.seed !== this.seed || world.tick < this.lastTick) {
      this.seed = world.rng.seed;
      this.random = renderRandom(this.seed, 'render-spots');
      this.assignments.clear();
    }
    this.lastTick = world.tick;
    list = list.filter(
      (d) =>
        !d.state.awayUntil && d.state.behavior !== '历练' && d.stage !== '坐化',
    );
    const main: Spot[] = worldMap.spots
      .filter((s) => s.island === 'main')
      .map((s) => ({
        id: s.id,
        island: 'main',
        point: s.point,
        cat: s.kind === 'social' ? 'social' : 'train',
        cap: 1,
        prefer:
          s.kind === 'sword'
            ? ['T_SWORD', 'T_PROUD']
            : s.kind === 'meditate'
              ? ['T_ALOOF', 'T_DILIGENT']
              : ['T_KIND', 'T_AMOROUS'],
      }));
    const keys = new Map(
      list.map((d) => [
        d.id,
        `${d.state.behavior}:${d.state.location}:${world.tick + d.state.stepsLeft}`,
      ]),
    );
    for (const [id, a] of this.assignments) {
      const key = keys.get(id);
      if (!key) this.assignments.delete(id);
      else if (key !== a.key) {
        if (
          a.waitingSince !== undefined &&
          a.key.split(':').slice(0, 2).join(':') ===
            key.split(':').slice(0, 2).join(':')
        )
          a.key = key;
        else this.assignments.delete(id);
      }
    }
    const occupied = new Map<string, number>();
    for (const a of this.assignments.values())
      if (a.spot) occupied.set(a.spot.id, (occupied.get(a.spot.id) ?? 0) + 1);
    return list.map((d, i) => {
      const previous = this.assignments.get(d.id);
      if (previous && previous.waitingSince === undefined)
        return previous.point;
      const from = positions.get(d.id) ?? v4Spawn;
      const key = keys.get(d.id)!;
      const homeSpots =
        d.state.behavior === '休息'
          ? main.map((s) => ({ ...s, cat: 'rest', prefer: ['T_LAZY'] }))
          : main;
      let candidates = [...homeSpots, ...satelliteSpots].filter(
        (s) =>
          s.cat === category(d) &&
          (!s.building ||
            world.buildings.some((b) => b.id === s.building && b.level > 0)),
      );
      if (d.state.location === '炼丹房')
        candidates = candidates.filter((s) => s.id === 'E_ALCH_FRONT');
      else candidates = candidates.filter((s) => s.id !== 'E_ALCH_FRONT');
      if (d.state.behavior === '做工' && d.state.location !== '炼丹房') {
        const point = destination(d, Math.max(1, world.tick), i);
        this.assignments.set(d.id, { point, key });
        return point;
      }
      const waitingSince = previous?.waitingSince ?? world.tick;
      const fallback = world.tick - waitingSince >= 2;
      if (fallback) candidates = main;
      const spot = selectSpot(
        candidates,
        from,
        d.traits,
        occupied,
        this.random,
      );
      if (!spot) {
        if (fallback) {
          const point = spacedLanding(
            from,
            [...this.assignments.values()].map((a) => a.point),
          );
          this.assignments.set(d.id, { point, key, fallback: true });
          return point;
        }
        this.assignments.set(d.id, { point: from, key, waitingSince });
        return from;
      }
      const taken = new Set(
        [...this.assignments.values()]
          .filter((a) => a.spot?.id === spot.id)
          .map((a) => a.slot),
      );
      const slot = subpositions(spot).findIndex((_, n) => !taken.has(n));
      const point = subpositions(spot)[slot];
      occupied.set(spot.id, (occupied.get(spot.id) ?? 0) + 1);
      this.assignments.set(d.id, { point, spot, slot, key, fallback });
      return point;
    });
  }
}
export function bridgeTransfer(
  from: P,
  target: P,
  island: string,
  steps: number,
  speed: number,
) {
  const path = findPath(from, target);
  if (
    !['east', 'south'].includes(island) ||
    v4Island(from) === island ||
    pathLength(path) / speed <= steps * 10
  )
    return undefined;
  const bridge = island === 'east' ? uv(43.76, -4.3) : uv(30.262, 13.2);
  const approach =
    island === 'south'
      ? [
          ...findPath(from, uv(30.262, 7.761)),
          uv(30.262, 9.2),
          uv(30.262, 12.2),
          bridge,
        ]
      : findPath(from, bridge);
  return { path: approach, target };
}
