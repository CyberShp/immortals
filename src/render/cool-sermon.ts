// ?cool=1 大能讲道 demo（08 增补 4.4–4.6，R5）：只由调试钩子 __coolHall.sermon(ms?) 触发，纯表现层。
// 纯函数 + 纯数据：不 import pixi、不读写 sim；蒲团排布按 4.5 公式从主殿几何现算。
import { ASSEMBLY, type CoolHall, type P, type Seat } from './cool-hall';

export const SERMON = {
  /** 讲道默认时长（沿用召集仪式 20 s，调试可改；正式时长待定）。 */
  defaultMs: 20_000,
  /** 大能 / P9 / 蒲团淡入淡出（推荐值，同屋顶淡变 0.8 s）。 */
  fadeMs: 800,
  /** 拂袖 2 帧播一遍的时长（cool-frames.json master.flick.periodMs）。 */
  flickMs: 800,
  /** 4.5：首排距台阶脚 40、排距 32、每排 6、内侧距中轴 32、同排相邻 32。 */
  firstRow: 40,
  rowGap: 32,
  perRow: 6,
  inner: 32,
  spacing: 32,
  gatherTimeoutMs: ASSEMBLY.gatherTimeoutMs,
  releaseGapMs: ASSEMBLY.releaseGapMs,
};

const unit = (v: readonly number[]): P => {
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
};
/**
 * 排布坐标系：n = 台阶顶→台阶脚（entrance）方向；a = 主殿足迹里离台阶脚最近的一条边（台阶前沿）
 * 的方向，取 x 为正。左 = −a（屏幕左），右 = +a。
 */
export function sermonAxes(hall: CoolHall) {
  const n = unit([
    hall.entrance[0] - hall.stairTop[0],
    hall.entrance[1] - hall.stairTop[1],
  ]);
  const fp = hall.footprint;
  let best = { d: Infinity, a: [1, 0] as P };
  for (let i = 0; i < fp.length; i++) {
    const p = fp[i],
      q = fp[(i + 1) % fp.length];
    const d = Math.hypot(
      (p[0] + q[0]) / 2 - hall.entrance[0],
      (p[1] + q[1]) / 2 - hall.entrance[1],
    );
    if (d < best.d) best = { d, a: unit([q[0] - p[0], q[1] - p[1]]) };
  }
  const a: P = best.a[0] < 0 ? [-best.a[0], -best.a[1]] : best.a;
  return { n, a };
}
/** 资历 r（0 起）的蒲团：第 ⌊r/6⌋ 排；同排 左内、右内、左中、右中、左外、右外。 */
export function sermonSlot(r: number) {
  const row = Math.floor(r / SERMON.perRow),
    pos = r % SERMON.perRow;
  return { row, side: pos % 2 === 0 ? -1 : 1, ring: Math.floor(pos / 2) };
}
export function sermonPoint(hall: CoolHall, r: number): P {
  const { n, a } = sermonAxes(hall);
  const { row, side, ring } = sermonSlot(r);
  const along = SERMON.firstRow + SERMON.rowGap * row;
  const off = side * (SERMON.inner + SERMON.spacing * ring);
  return [
    +(hall.entrance[0] + n[0] * along + a[0] * off).toFixed(1),
    +(hall.entrance[1] + n[1] * along + a[1] * off).toFixed(1),
  ];
}

export type Cushion = {
  index: number;
  point: P;
  /** 蒲团出现的讲道时钟（淡入起点）。 */
  at: number;
  /** 主人起身离开的讲道时钟（淡出起点）；未离开为 undefined。 */
  releasedAt?: number;
};
export type Sermon = {
  phase: 'gather' | 'lecture' | 'disperse' | 'outro';
  /** 只在未暂停时累加（老板键暂停同召集）。 */
  clock: number;
  phaseStart: number;
  durationMs: number;
  cushions: Map<string, Cushion>;
  /** 讲道期间触发的召集（顺延到讲道结束，从蒲团直接去聚集）。 */
  queuedAssembly: string[];
  /** 散场已放走的人数。 */
  releasedCount: number;
};
export function startSermon(
  hall: CoolHall,
  order: readonly string[],
  durationMs = SERMON.defaultMs,
): Sermon {
  return {
    phase: 'gather',
    clock: 0,
    phaseStart: 0,
    durationMs,
    cushions: new Map(
      order.map((id, i) => [
        id,
        { index: i, point: sermonPoint(hall, i), at: 0 },
      ]),
    ),
    queuedAssembly: [],
    releasedCount: 0,
  };
}
/** 讲道席位（只给仍坐着的人；起身后交还日常规则）。 */
export function sermonSeat(s: Sermon, id: string): Seat | undefined {
  const c = s.cushions.get(id);
  if (!c || c.releasedAt !== undefined) return undefined;
  return { kind: 'cushion', index: c.index, point: c.point, inside: false };
}
/** 讲道中新到者：补到下一个空蒲团（号 = 现有最大号 + 1，排满自然开新一排），不整体重排。 */
export function addSermonJoiner(hall: CoolHall, s: Sermon, id: string) {
  const next =
    Math.max(-1, ...[...s.cushions.values()].map((c) => c.index)) + 1;
  s.cushions.set(id, {
    index: next,
    point: sermonPoint(hall, next),
    at: s.clock,
  });
  return s.cushions.get(id)!;
}
/** 离山（不在图上）：空蒲团淡出，不补。 */
export function leaveSermon(s: Sermon, id: string) {
  const c = s.cushions.get(id);
  if (c && c.releasedAt === undefined) c.releasedAt = s.clock;
}
/** 散场顺序：后排先走；同排外侧先、内侧后（同环左先右后）。 */
export function sermonReleaseOrder(s: Sermon) {
  return [...s.cushions]
    .filter(([, c]) => c.releasedAt === undefined)
    .sort((x, y) => {
      const a = sermonSlot(x[1].index),
        b = sermonSlot(y[1].index);
      return b.row - a.row || b.ring - a.ring || a.side - b.side;
    })
    .map(([id]) => id);
}
/**
 * 推进讲道时钟。返回 undefined 表示讲道结束。
 * gather：到齐或 50 s 超时 → lecture（开头拂袖一遍）；lecture 满 durationMs → disperse；
 * disperse：先拂袖 0.8 s，然后按 sermonReleaseOrder 每 700 ms 放一人；全部放完 → outro：
 * 大能与 P9 淡出 0.8 s，最后一个蒲团淡完即结束。
 */
export function sermonTick(
  s: Sermon,
  dtMs: number,
  allArrived: boolean,
): Sermon | undefined {
  s.clock += Math.max(0, dtMs);
  const t = s.clock - s.phaseStart;
  if (s.phase === 'gather' && (allArrived || t >= SERMON.gatherTimeoutMs)) {
    s.phase = 'lecture';
    s.phaseStart = s.clock;
  } else if (s.phase === 'lecture' && t >= s.durationMs) {
    s.phase = 'disperse';
    s.phaseStart = s.clock;
  }
  if (s.phase === 'disperse') {
    const since = s.clock - s.phaseStart - SERMON.flickMs;
    if (since >= 0) {
      const order = sermonReleaseOrder(s);
      const due = Math.max(
        0,
        Math.floor(since / SERMON.releaseGapMs) + 1 - s.releasedCount,
      );
      for (const id of order.slice(0, due)) {
        s.cushions.get(id)!.releasedAt = s.clock;
        s.releasedCount++;
      }
      if (order.length <= due) {
        s.phase = 'outro';
        s.phaseStart = s.clock;
      }
    }
  }
  if (s.phase === 'outro') {
    const lastFade = Math.max(
      s.phaseStart + SERMON.fadeMs,
      ...[...s.cushions.values()].map(
        (c) => (c.releasedAt ?? s.clock) + SERMON.fadeMs,
      ),
    );
    if (s.clock >= lastFade) return undefined;
  }
  return s;
}
/** 讲道中触发召集：顺延；讲道一结束（或已在散场）就把所有人交给召集，蒲团与大能淡出。 */
export function handoffSermon(s: Sermon) {
  for (const c of s.cushions.values()) c.releasedAt ??= s.clock;
  s.phase = 'outro';
  s.phaseStart = s.clock;
  return s;
}
const fade = (t: number) => Math.max(0, Math.min(1, t / SERMON.fadeMs));
/** 大能与 P9 淡光的 α：开场淡入 0.8 s，outro 淡出 0.8 s。 */
export function sermonMasterAlpha(s: Sermon) {
  if (s.phase === 'outro') return 1 - fade(s.clock - s.phaseStart);
  return fade(s.clock);
}
export function cushionAlpha(s: Sermon, c: Cushion) {
  const fin = fade(s.clock - c.at);
  return c.releasedAt === undefined
    ? fin
    : Math.min(fin, 1 - fade(s.clock - c.releasedAt));
}
/** 大能动作：聚集站立；讲道开头拂袖一遍后循环讲述；散场先拂袖一遍再站着淡出。 */
export function sermonMasterAction(s: Sermon): 'stand' | 'lecture' | 'flick' {
  const t = s.clock - s.phaseStart;
  if (s.phase === 'lecture') return t < SERMON.flickMs ? 'flick' : 'lecture';
  if (s.phase === 'disperse') return t < SERMON.flickMs ? 'flick' : 'stand';
  return 'stand';
}
