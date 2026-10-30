// ?cool=1 主殿（B1 外观 / B2 内景）的表现层逻辑：分层几何、前缘遮挡排序、屋顶淡出计时、
// 门口成批淡出淡入、日常站位分流（二 #14 #16）、召集全员（4.6，P6 推荐口径）。
// 纯函数 + 纯数据：不 import pixi、不读写 sim，只被 map.ts 在 cool 打开时调用；sim 基线不受影响。
import { z } from 'zod';
import raw from './cool-hall.json';

export type P = [number, number];
/** 楼层视图：outside=外观（屋顶不透明）；main=一层正殿；left/right=一层左右厅。
 *  v6：指挥官（经 Iris）取消二层/三层，只保留一层两侧厅；二层内景、上下楼梯与楼层切换已撤下。 */
export const COOL_FLOORS = ['outside', 'main', 'left', 'right'] as const;
export type CoolFloor = (typeof COOL_FLOORS)[number];
export type CoolRoom = Exclude<CoolFloor, 'outside'>;
/** URL ?coolFloor=main|left|right → 固定一层厅视图（屋顶淡出并保持）；缺省/其它值（含已取消的 floor2）= auto（按殿内有人自动淡出，内景为正殿）。 */
export function coolFloorParam(search: string): CoolRoom | 'auto' {
  const v = new URLSearchParams(search).get('coolFloor');
  return v === 'main' || v === 'left' || v === 'right' ? v : 'auto';
}
const point = z.tuple([z.number().finite(), z.number().finite()]);
const layer = z.object({
  file: z.string().regex(/^cool\/hall[24]?\//),
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  x: z.number(),
  y: z.number(),
  scale: z.number().positive(),
});
export const coolHallSchema = z.object({
  footprint: z.array(point).min(3),
  frontChain: z.array(point).min(2),
  entrance: point,
  stairTop: point,
  door: point,
  throne: point,
  throneFront: point,
  stations: z.array(point).length(16),
  /** 08 增补 R2：8 把交椅（筑基资历 1–8 号；1 号离宝座最近，奇偶分列过道两侧）。face：人物朝向（无背面帧，左右各一）。 */
  chairs: z
    .array(z.object({ point, face: z.enum(['left', 'right']) }))
    .length(8),
  /** 客座：只画不分配（08 增补 R2）。 */
  guests: z.array(point).min(1),
  queue: z.array(point).length(4),
  lineup: z.array(point).min(8),
  layers: z.object({
    base: layer,
    room: layer,
    roof: layer,
    /** 殿内金柱（只在正殿内景画，z=柱脚 y）。 */
    columns: z.array(layer.extend({ foot: point })).min(1),
    /** v4g：外景地面落影（z=-905，与其它建筑落影同层），始终画。 */
    shadow: layer.optional(),
    /** v4g：外檐柱（z=hallZ-0.5，α 随屋顶）；内景视图不画（柱脚落在殿内地面上）。v5p 只剩 5 根（v4g 编号 1/3/4/6/9）。 */
    outerColumns: z.array(layer.extend({ foot: point })).optional(),
    /** v4g：红毯延伸（正殿，z=-899.5 贴在内景之上）。 */
    carpet: layer.optional(),
    /** v4g：台阶层（只剩正面台阶，z=hallZ-1），floors 列出在哪些视图里显示（outside = 屋顶不透明时）。
     *  v6：殿内上二层楼梯 / 二层下楼口已撤下（二层取消），不再有殿内楼梯层。 */
    stairs: z
      .array(layer.extend({ floors: z.array(z.enum(COOL_FLOORS)).min(1) }))
      .optional(),
    /** v4g：一层左右厅内景（与 room=正殿同机位同台基）。v6：二层内景已撤下。 */
    rooms: z
      .object({ left: layer, right: layer })
      .partial()
      .strict()
      .optional(),
  }),
});
export type CoolHall = z.infer<typeof coolHallSchema> & { hallZ: number };
export function buildCoolHall(input: unknown = raw): CoolHall {
  const h = coolHallSchema.parse(input);
  return { ...h, hallZ: Math.max(...h.frontChain.map((p) => p[1])) };
}

const dist = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
export function polyLength(path: readonly (readonly number[])[]) {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += dist(path[i - 1], path[i]);
  return n;
}

// ---------- 前缘遮挡排序 ----------
/** 台基前缘折线在 x 处的 y；x 不在折线 x 范围内返回 undefined。 */
export function frontChainY(chain: readonly P[], x: number) {
  let best: number | undefined;
  for (let i = 1; i < chain.length; i++) {
    const [a, b] = [chain[i - 1], chain[i]];
    const [x0, x1] = a[0] <= b[0] ? [a, b] : [b, a];
    if (x < x0[0] || x > x1[0] || x0[0] === x1[0]) continue;
    const y = x0[1] + ((x - x0[0]) / (x1[0] - x0[0])) * (x1[1] - x0[1]);
    best = best === undefined ? y : Math.max(best, y);
  }
  return best;
}
/**
 * 殿外弟子的排序 z：主殿各层按 hallZ 一个整体排序；脚在台基前缘线之前（同 x 下 y ≥ 前缘）
 * 的弟子一律画在整座主殿之上（z = max(y, hallZ+1)），避免"脚在殿前、头被屋檐盖住"。
 */
export function outdoorZ(hall: CoolHall, p: P) {
  const y = frontChainY(hall.frontChain, p[0]);
  return y !== undefined && p[1] >= y ? Math.max(p[1], hall.hallZ + 1) : p[1];
}

// ---------- 屋顶淡出（二 #14）----------
export const COOL_ROOF = { outMs: 800, holdMs: 1500, backMs: 800 };
export type CoolRoof = {
  from: number;
  to: number;
  start: number;
  dur: number;
  emptySince?: number;
};
export const roofClosed = (now = 0): CoolRoof => ({
  from: 1,
  to: 1,
  start: now,
  dur: 0,
});
export function coolRoofAlpha(r: CoolRoof, now: number) {
  if (r.dur <= 0 || now >= r.start + r.dur) return r.to;
  if (now <= r.start) return r.from;
  return r.from + ((r.to - r.from) * (now - r.start)) / r.dur;
}
/** 殿内有人立刻从当前 α 淡出（满程 0.8 s）；清空后停 1.5 s 再从当前 α 淡回（满程 0.8 s）。 */
export function coolRoofUpdate(r: CoolRoof, occupied: boolean, now: number) {
  const alpha = coolRoofAlpha(r, now);
  if (occupied) {
    if (r.to === 0) return { ...r, emptySince: undefined };
    return {
      from: alpha,
      to: 0,
      start: now,
      dur: COOL_ROOF.outMs * alpha,
    };
  }
  const emptySince = r.emptySince ?? now;
  if (r.to === 1) return r.emptySince === undefined ? r : { ...r };
  if (now - emptySince < COOL_ROOF.holdMs) return { ...r, emptySince };
  const start = emptySince + COOL_ROOF.holdMs;
  const from = coolRoofAlpha(r, start);
  return { from, to: 1, start, dur: COOL_ROOF.backMs * (1 - from) };
}
export const roofAnimatingCool = (r: CoolRoof, now: number) =>
  now < r.start + r.dur || (r.to === 0 && r.emptySince !== undefined);

// ---------- 进出殿路线 ----------
/** 门口一个身位（脚距 28）内淡出/淡入。 */
export const DOOR_FADE = 28;
export type HallRoute = {
  path: P[];
  /** 路线上门口点的弧长位置；不过门为 undefined。 */
  doorS?: number;
  /** 过门前是否在殿内。 */
  insideBefore: boolean;
};
function approach(hall: CoolHall): P[] {
  return [hall.entrance as P, hall.stairTop as P, hall.door as P];
}
/** 点投到 入口→台阶顶→门 折线上的弧长与距离。 */
export function approachParam(hall: CoolHall, p: P) {
  const a = approach(hall);
  let best = { s: 0, d: Infinity },
    acc = 0;
  for (let i = 1; i < a.length; i++) {
    const [u, v] = [a[i - 1], a[i]];
    const l = dist(u, v);
    const t = l
      ? Math.max(
          0,
          Math.min(
            1,
            ((p[0] - u[0]) * (v[0] - u[0]) + (p[1] - u[1]) * (v[1] - u[1])) /
              (l * l),
          ),
        )
      : 0;
    const q: P = [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t];
    const d = dist(p, q);
    if (d < best.d) best = { s: acc + t * l, d };
    acc += l;
  }
  return best;
}
/**
 * 规划一段路线（全部是表现层折线）：
 * - 殿外可走区 → 殿外：outdoorPath(from, to)
 * - 殿外 → 殿内席位：outdoorPath(from, 入口) + 台阶顶 + 门 + 席位
 * - 殿内 → 殿内：直线
 * - 殿内 → 殿外：门 + 台阶顶 + 入口（原路退回）+ outdoorPath(入口, to)
 * - 正在台阶上（不在可走区、不在殿内）：沿 入口→台阶顶→门 折线往需要的方向接着走。
 */
export function planHallRoute(
  hall: CoolHall,
  from: P,
  where: 'outdoor' | 'stairs' | 'inside',
  to: P,
  toInside: boolean,
  outdoorPath: (a: P, b: P) => P[],
): HallRoute | undefined {
  const route = planHallRouteRaw(hall, from, where, to, toInside, outdoorPath);
  // 门口一个身位内改道且新路线不再过门（如门口被放回殿外/殿内换位）：把门放在“身后”
  // （doorS 取负的离门距离），α 从当前值接着淡回，不跳变（7.2 #17 / 7.5 #35）。
  const door = approach(hall)[2];
  const d = dist(from, door);
  if (route && route.doorS === undefined && d < DOOR_FADE)
    return { ...route, doorS: -d, insideBefore: where !== 'inside' };
  return route;
}
function planHallRouteRaw(
  hall: CoolHall,
  from: P,
  where: 'outdoor' | 'stairs' | 'inside',
  to: P,
  toInside: boolean,
  outdoorPath: (a: P, b: P) => P[],
): HallRoute | undefined {
  const a = approach(hall);
  const doorAt = (path: P[]) => {
    let s = 0;
    for (let i = 1; i < path.length; i++) {
      s += dist(path[i - 1], path[i]);
      if (path[i] === a[2]) return s;
    }
    return undefined;
  };
  const join = (head: P[], tail: P[]) =>
    tail.length && head.length && dist(head.at(-1)!, tail[0]) < 1e-6
      ? [...head, ...tail.slice(1)]
      : [...head, ...tail];
  if (where === 'inside') {
    if (toInside) return { path: [from, to], insideBefore: true };
    const out = outdoorPath(a[0], to);
    if (!out.length) return;
    const path = join([from, a[2], a[1], a[0]], out);
    return { path, doorS: doorAt(path), insideBefore: true };
  }
  if (where === 'stairs') {
    const s = approachParam(hall, from).s;
    const l1 = dist(a[0], a[1]);
    if (toInside) {
      const path: P[] = [from, ...(s < l1 ? [a[1]] : []), a[2], to];
      return { path, doorS: doorAt(path), insideBefore: false };
    }
    const out = outdoorPath(a[0], to);
    if (!out.length) return;
    return {
      path: join([from, ...(s > l1 ? [a[1]] : []), a[0]], out),
      insideBefore: false,
    };
  }
  if (!toInside) {
    const path = outdoorPath(from, to);
    return path.length ? { path, insideBefore: false } : undefined;
  }
  const out = outdoorPath(from, a[0]);
  if (!out.length) return;
  const path = join(out, [a[0], a[1], a[2], to]);
  return { path, doorS: doorAt(path), insideBefore: false };
}
/** 路线上弧长 s 处：是否在殿内、门口淡变 α。 */
export function routeStatus(route: HallRoute | undefined, s: number) {
  if (!route) return { inside: false, alpha: 1, doorDistance: Infinity };
  if (route.doorS === undefined)
    return {
      inside: route.insideBefore,
      alpha: 1,
      doorDistance: Infinity,
    };
  const d = Math.abs(s - route.doorS);
  return {
    inside: s < route.doorS ? route.insideBefore : !route.insideBefore,
    alpha: Math.min(1, d / DOOR_FADE),
    doorDistance: d,
  };
}

// ---------- 席位 ----------
export type Seat = {
  kind: 'chair' | 'station' | 'queue' | 'lineup' | 'overflow' | 'cushion';
  /** 椅/站位/排队位/列队位序号（0 起）；chair/station 序号 + 1 即椅号 1–8 / 站位号 1–16（1 号近宝座）。 */
  index: number;
  point?: P;
  inside: boolean;
  /** 坐椅者朝向（chairs[i].face）：left = 面朝左前（P7 原朝向 chair-r），right = 面朝右前。 */
  face?: 'left' | 'right';
};
export const HALL_CAPACITY = 16;
export const HALL_CHAIRS = 8;
/** 08 增补 2.1：有座资格（demo 只看境界 ≥ 筑基；执事/长老/宗主代理身份字段待定）。 */
export const chairEligible = (d: { realm: { major: string } }) =>
  d.realm.major === '筑基';
/** 日常站位：先到先得，按离门由近到远取空站位；第 17–20 人排队位；第 21 人起交回调用方去其他社交站位。不整体重排。 */
export function dailySeats(
  hall: CoolHall,
  prev: ReadonlyMap<string, Seat>,
  goers: readonly string[],
) {
  const next = new Map<string, Seat>();
  const goerSet = new Set(goers);
  for (const [id, seat] of prev)
    if (goerSet.has(id) && seat.kind !== 'lineup') next.set(id, seat);
  const taken = (kind: Seat['kind']) =>
    new Set(
      [...next.values()].filter((s) => s.kind === kind).map((s) => s.index),
    );
  const byDoor = hall.stations
    .map((p, i) => ({ i, d: dist(p, hall.door) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((e) => e.i);
  // 殿内有空位时，排队的人优先进殿（按排队序号）。
  for (const [id, seat] of [...next].sort((a, b) => a[1].index - b[1].index)) {
    if (seat.kind !== 'queue' && seat.kind !== 'overflow') continue;
    const st = taken('station');
    const free = byDoor.find((i) => !st.has(i));
    if (free === undefined) break;
    next.set(id, {
      kind: 'station',
      index: free,
      point: hall.stations[free] as P,
      inside: true,
    });
  }
  for (const id of goers) {
    if (next.has(id)) continue;
    const st = taken('station');
    const free = byDoor.find((i) => !st.has(i));
    if (free !== undefined) {
      next.set(id, {
        kind: 'station',
        index: free,
        point: hall.stations[free] as P,
        inside: true,
      });
      continue;
    }
    const q = taken('queue');
    const qi = hall.queue.findIndex((_, i) => !q.has(i));
    if (qi >= 0) {
      next.set(id, {
        kind: 'queue',
        index: qi,
        point: hall.queue[qi] as P,
        inside: false,
      });
      continue;
    }
    next.set(id, {
      kind: 'overflow',
      index: taken('overflow').size,
      inside: false,
    });
  }
  return next;
}

export type SeniorityInput = {
  id: string;
  realm: { major: string; layer: number };
  ageSeasons: number;
};
const MAJOR_RANK: Record<string, number> = { 炼气: 0, 筑基: 1 };
/**
 * P6 推荐口径：境界高者在前（大境界、再小层）；同境界按入门先后，开局 6 人视为同批、年长者在前；
 * 之后入门按入册顺序。joinOrder：弟子在 world.disciples 中的下标（入册顺序）。
 */
export function seniorityOrder(
  list: readonly SeniorityInput[],
  joinOrder: ReadonlyMap<string, number>,
  initialBatch = 6,
) {
  const batch = (id: string) => {
    const j = joinOrder.get(id) ?? Infinity;
    return j < initialBatch ? 0 : j;
  };
  return [...list]
    .sort(
      (a, b) =>
        (MAJOR_RANK[b.realm.major] ?? 0) - (MAJOR_RANK[a.realm.major] ?? 0) ||
        b.realm.layer - a.realm.layer ||
        batch(a.id) - batch(b.id) ||
        b.ageSeasons - a.ageSeasons ||
        (joinOrder.get(a.id) ?? 0) - (joinOrder.get(b.id) ?? 0),
    )
    .map((d) => d.id);
}
const seatOf = (hall: CoolHall, rank: number): Seat =>
  rank < HALL_CAPACITY
    ? {
        kind: 'station',
        index: rank,
        point: hall.stations[rank] as P,
        inside: true,
      }
    : rank - HALL_CAPACITY < hall.lineup.length
      ? {
          kind: 'lineup',
          index: rank - HALL_CAPACITY,
          point: hall.lineup[rank - HALL_CAPACITY] as P,
          inside: false,
        }
      : { kind: 'overflow', index: rank - HALL_CAPACITY, inside: false };
const chairOf = (hall: CoolHall, i: number): Seat => ({
  kind: 'chair',
  index: i,
  point: hall.chairs[i].point as P,
  inside: true,
  face: hall.chairs[i].face,
});
/**
 * 召集席位表（08 增补 2.2）：有座资格者按资历取前 8 坐椅 1–8；其余（含第 9 名起的有座资格者）
 * 按资历从站位 1 号排起，站满 16 去列队区。空椅保持空着，无座者不补坐；会客座从不分配。
 */
export function assemblySeats(
  hall: CoolHall,
  order: readonly string[],
  seated: (id: string) => boolean = () => false,
) {
  const seats = new Map<string, Seat>();
  let chairs = 0;
  for (const id of order)
    if (chairs < HALL_CHAIRS && seated(id))
      seats.set(id, chairOf(hall, chairs++));
  let rank = 0;
  for (const id of order)
    if (!seats.has(id)) seats.set(id, seatOf(hall, rank++));
  return new Map(order.map((id) => [id, seats.get(id)!]));
}
/**
 * 召集中途补位：有座资格者坐号最大的空椅，椅满按站位规则；站位规则 = 殿内有空位补号最大的空站位，
 * 殿内满则排到列队区末尾。不整体重排。
 */
export function addLateJoiner(
  hall: CoolHall,
  seats: Map<string, Seat>,
  id: string,
  seated = false,
) {
  if (seated) {
    const taken = new Set(
      [...seats.values()].filter((s) => s.kind === 'chair').map((s) => s.index),
    );
    for (let i = HALL_CHAIRS - 1; i >= 0; i--)
      if (!taken.has(i)) {
        seats.set(id, chairOf(hall, i));
        return seats.get(id)!;
      }
  }
  const used = new Set(
    [...seats.values()].filter((s) => s.kind === 'station').map((s) => s.index),
  );
  for (let i = HALL_CAPACITY - 1; i >= 0; i--)
    if (!used.has(i)) {
      seats.set(id, seatOf(hall, i));
      return seats.get(id)!;
    }
  const tail = Math.max(
    HALL_CAPACITY - 1,
    ...[...seats.values()]
      .filter((s) => s.kind !== 'station' && s.kind !== 'chair')
      .map((s) => HALL_CAPACITY + s.index),
  );
  seats.set(id, seatOf(hall, tail + 1));
  return seats.get(id)!;
}

// ---------- 召集计时（08 增补 1.1 + 拍板 #1：到齐上限 50 s、仪式 20 s）----------
export const ASSEMBLY = {
  /** 08 增补拍板 #1：等待上限 50 s（原 P6 推荐 30 s）。 */
  gatherTimeoutMs: 50_000,
  ceremonyMs: 20_000,
  /** 散开时相邻两人出发间隔，避免门口对穿。 */
  releaseGapMs: 700,
  /** 08 增补 1.1：聚集段（走向自己的席位）速度 = routeSpeed × 1.6，到席位即恢复。 */
  gatherSpeed: 1.6,
};
/**
 * 聚集段速度系数（召集、讲道共用）= 1.6，全员相同。指挥官拍板（2026-10-30 23:10）：按 N1，
 * 表现层任何阶段都不做迟暮减速（聚集 1.6，日常/散场 1.0），故不再按境界/年龄区分。
 */
export const gatherSpeedFactor = (): number => ASSEMBLY.gatherSpeed;
/** 一段路线的走完时间（ms）：路长 / (routeSpeed × walkScale × 系数)；系数缺省 = 1.0（日常/散场）。 */
export function coolMotionMs(
  length: number,
  speed: number,
  walkScale = 1,
  factor?: number,
) {
  return factor === undefined
    ? (length / (speed * walkScale)) * 1000
    : (length / (speed * walkScale * factor)) * 1000;
}
export type Assembly = {
  phase: 'gather' | 'ceremony' | 'disperse';
  /** 只在未暂停时累加的召集时钟（老板键暂停时一起停）。 */
  clock: number;
  phaseStart: number;
  seats: Map<string, Seat>;
  /** 散开顺序：列队区先走（列队号小的先），殿内 16 → 1 号。 */
  released: Set<string>;
  /** 召集期间又触发的召集次数：当前仪式结束后不散开，直接开始下一个。 */
  queued: number;
  reasons: string[];
};
export function startAssembly(
  hall: CoolHall,
  order: readonly string[],
  reason: string,
  seated?: (id: string) => boolean,
): Assembly {
  return {
    phase: 'gather',
    clock: 0,
    phaseStart: 0,
    seats: assemblySeats(hall, order, seated),
    released: new Set(),
    queued: 0,
    reasons: [reason],
  };
}
/** 散开顺序：列队区先（列队号小的先），再殿内站位 16 → 1，最后椅 8 → 1。 */
export function releaseOrder(seats: ReadonlyMap<string, Seat>) {
  const rank = (s: Seat) =>
    s.kind === 'chair'
      ? 2000 + (HALL_CHAIRS - 1 - s.index)
      : s.kind === 'station'
        ? 1000 + (HALL_CAPACITY - 1 - s.index)
        : s.index;
  return [...seats].sort((a, b) => rank(a[1]) - rank(b[1])).map(([id]) => id);
}
/** 推进召集时钟。allArrived：所有参加者都已到席位。返回 undefined 表示召集结束、恢复日常。 */
export function assemblyTick(
  a: Assembly,
  dtMs: number,
  allArrived: boolean,
): Assembly | undefined {
  a.clock += Math.max(0, dtMs);
  const t = a.clock - a.phaseStart;
  if (a.phase === 'gather') {
    if (allArrived || t >= ASSEMBLY.gatherTimeoutMs) {
      a.phase = 'ceremony';
      a.phaseStart = a.clock;
    }
  } else if (a.phase === 'ceremony') {
    if (t >= ASSEMBLY.ceremonyMs) {
      if (a.queued > 0) {
        a.queued--;
        a.phase = 'gather';
      } else a.phase = 'disperse';
      a.phaseStart = a.clock;
    }
  }
  if (a.phase === 'disperse') {
    const order = releaseOrder(a.seats);
    const n = Math.min(
      order.length,
      Math.floor((a.clock - a.phaseStart) / ASSEMBLY.releaseGapMs) + 1,
    );
    order.slice(0, n).forEach((id) => a.released.add(id));
    if (order.every((id) => a.released.has(id))) return undefined;
  }
  return a;
}
/** 召集期间又触发：未散开则顺延；已在散开则未走的人保留席位、重新开始聚集。 */
export function retriggerAssembly(a: Assembly, reason: string) {
  a.reasons.push(reason);
  if (a.phase === 'disperse') {
    for (const id of a.released) a.seats.delete(id);
    a.released.clear();
    a.phase = 'gather';
    a.phaseStart = a.clock;
  } else a.queued++;
  return a;
}

// ---------- 召集触发（挂在事件结算上，只读 world 快照，不改 sim）----------
export type TriggerState = {
  tick: number;
  ids: Set<string>;
  majors: Map<string, string>;
  sec02: unknown;
};
export type TriggerWorld = {
  tick: number;
  disciples: readonly { id: string; realm: { major: string } }[];
  flags: Record<string, unknown>;
};
export function snapshotTriggers(w: TriggerWorld): TriggerState {
  return {
    tick: w.tick,
    ids: new Set(w.disciples.map((d) => d.id)),
    majors: new Map(w.disciples.map((d) => [d.id, d.realm.major])),
    sec02: w.flags['done:EV_SEC_02'],
  };
}
/**
 * 对比两次 draw 之间的 world：新弟子入门（EV_SEC_01 收下 / 考验三日后入门）、炼气→筑基
 * （EV_BRK_02 成功）、EV_SEC_02 结算。tick 一次跳过多步（离线结算、调试快进）不补演。
 */
export function detectTriggers(
  prev: TriggerState | undefined,
  w: TriggerWorld,
) {
  const reasons: string[] = [];
  if (!prev || w.tick < prev.tick || w.tick - prev.tick > 1) return reasons;
  for (const d of w.disciples) {
    if (!prev.ids.has(d.id)) reasons.push(`入门:${d.id}`);
    else if (prev.majors.get(d.id) !== '筑基' && d.realm.major === '筑基')
      reasons.push(`筑基:${d.id}`);
  }
  const sec02 = w.flags['done:EV_SEC_02'];
  if (sec02 !== undefined && sec02 !== prev.sec02) reasons.push('宗门会议');
  return reasons;
}
