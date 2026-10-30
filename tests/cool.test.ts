// ?cool=1 冷色单石台骨架：开关解析、与 depth/roofFade 的优先级、cool-world.json 校验、
// 可走区域扣除脚印、路径不出可走区、dorm→hall 步行时间（只报告，不改 WALK_SPEED）。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  COOL_SETTINGS,
  coolEnabled,
  depthActive,
  roofFadeActive,
} from '../src/render/cool-config';
import {
  buildCoolWorld,
  coolActive,
  coolWorld,
  coolWorldSchema,
  transformOf,
} from '../src/render/cool-world';
import raw from '../src/render/cool-world.json';
import { worldMap } from '../src/render/world';
import { buildingLabelObstacles } from '../src/render/building-labels';
import { createWorld, step } from '../src/sim/world';
import { loadData } from '../src/sim/data';
import { DISCIPLE_HEIGHT } from '../src/render/world-scale';

type P = [number, number];
const clone = () => JSON.parse(JSON.stringify(raw));

describe('?cool=1 开关', () => {
  it.each([
    ['?cool=1', true],
    ['?debug=1&cool=1', true],
    ['', false],
    ['?cool=0', false],
    ['?cool=true', false],
    ['?cool', false],
    ['?depth=1', false],
  ])('coolEnabled(%j) = %s', (search, on) =>
    expect(coolEnabled(search)).toBe(on),
  );
  it('cool 优先于 depth：cool 开时纵深默认关，可配置打开；cool 关时完全按 ?depth=1', () => {
    expect(COOL_SETTINGS.depthWithCool).toBe(false);
    expect(depthActive('?depth=1')).toBe(true);
    expect(depthActive('')).toBe(false);
    expect(depthActive('?cool=1')).toBe(false);
    expect(depthActive('?cool=1&depth=1')).toBe(false);
    expect(depthActive('?cool=1&depth=1', { depthWithCool: true })).toBe(true);
    expect(depthActive('?cool=1', { depthWithCool: true })).toBe(false);
  });
  it('roofFade 同理：cool 开时默认关', () => {
    expect(COOL_SETTINGS.roofFadeWithCool).toBe(false);
    expect(roofFadeActive('?roofFade=1')).toBe(true);
    expect(roofFadeActive('?roofFade=1&cool=1')).toBe(false);
    expect(
      roofFadeActive('?roofFade=1&cool=1', { roofFadeWithCool: true }),
    ).toBe(true);
  });
  it('默认（无 location / 无 ?cool=1）：不构建 cool 几何，世界仍是旧四岛', () => {
    expect(coolActive).toBe(false);
    expect(coolWorld).toBeNull();
    expect(worldMap.islands.map((i) => i.id)).toHaveLength(4);
    expect(worldMap.bridges.length).toBeGreaterThan(0);
    expect(buildingLabelObstacles.some((b) => b.id === 'B_GATE')).toBe(true);
  });
});

describe('cool-world.json 校验', () => {
  it('当前配置通过 zod 校验：6 槽位（5 sim + 山门）、14 点位（3/3/8）', () => {
    const c = coolWorldSchema.parse(raw);
    expect(c.slots.map((s) => s.id).sort()).toEqual([
      'B_ALCHEMY',
      'B_DORM',
      'B_GARDEN',
      'B_GATE',
      'B_HALL',
      'B_MEDIT',
    ]);
    expect(c.spots).toHaveLength(14);
    expect(c.k).toBe(0.6);
    expect(c.world).toEqual({ width: 3200, height: 1400 });
  });
  it('k=0.6 时石台视觉外框约 1600×1200 且在 3200×1400 世界内居中', () => {
    const w = buildCoolWorld(raw);
    expect(w.background.width).toBeCloseTo(1600, -1);
    expect(w.background.height).toBeCloseTo(1200, -1);
    expect(w.background.x + w.background.width / 2).toBeCloseTo(1600, 6);
    expect(w.background.y + w.background.height / 2).toBeCloseTo(700, 6);
    const t = transformOf(coolWorldSchema.parse(raw));
    expect(t([0, 0])).toEqual([w.background.x, w.background.y]);
  });
  it.each([
    ['少一个槽位', (c: typeof raw) => c.slots.pop()],
    ['缺山门', (c: typeof raw) => (c.slots[5].id = 'B_TOWER')],
    ['点位类型数不对', (c: typeof raw) => (c.spots[0].kind = 'social')],
    ['k 太大石台出世界', (c: typeof raw) => (c.k = 1.3)],
    ['多边形少于 3 点', (c: typeof raw) => c.walkable.splice(2)],
    [
      '背景不在 cool/ 目录',
      (c: typeof raw) => (c.background.file = 'map/world.webp'),
    ],
  ])('拒绝非法配置：%s', (_name, mutate) => {
    const c = clone();
    mutate(c);
    expect(coolWorldSchema.safeParse(c).success).toBe(false);
  });
});

describe('cool 打开时的可走区域与寻路', () => {
  let w: typeof import('../src/render/world');
  let cool: NonNullable<typeof coolWorld>;
  beforeAll(async () => {
    vi.resetModules();
    vi.stubGlobal('location', { search: '?cool=1' });
    w = await import('../src/render/world');
    cool = w.coolWorld!;
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it('world.ts 换成单石台：1 个 platform 岛、无桥、槽位来自 cool-world.json', () => {
    expect(w.coolActive).toBe(true);
    expect(w.worldMap.islands.map((i) => i.id)).toEqual(['platform']);
    expect(w.worldMap.bridges).toEqual([]);
    expect(w.worldMap.slots).toBe(cool.slots);
    expect(w.worldMap.width).toBe(3200);
  });
  it('可走 = 石台多边形 − 建筑脚印 − 装饰障碍', () => {
    const platform = cool.islands[0].walkable;
    const centroid = (p: P[]): P => [
      p.reduce((n, q) => n + q[0], 0) / p.length,
      p.reduce((n, q) => n + q[1], 0) / p.length,
    ];
    for (const s of cool.slots) {
      const poly = (s.footprint as { polygon: P[] }).polygon;
      expect(w.walkable(centroid(poly)), s.id).toBe(false);
      for (const q of poly) expect(w.walkable(q), `${s.id} 角点`).toBe(false);
    }
    for (const o of cool.islands[0].obstacles)
      expect(w.walkable(centroid(o))).toBe(false);
    // 石台外（四角世界边、石台外缘外侧）不可走。
    for (const q of [
      [10, 10],
      [3190, 1390],
      [cool.background.x + 5, cool.background.y + 5],
    ] as P[])
      expect(w.walkable(q)).toBe(false);
    // 网格上所有可走点都在石台多边形内、且不在任何脚印内。
    let n = 0;
    for (let y = 0; y < 1400; y += 20)
      for (let x = 0; x < 3200; x += 20)
        if (w.walkable([x, y])) {
          n++;
          expect(w.inPolygon([x, y], platform)).toBe(true);
          expect(
            cool.slots.some((s) => w.inFootprint([x, y], s.footprint)),
          ).toBe(false);
        }
    expect(n).toBeGreaterThan(500);
  });
  it('所有入口、点位、采石点、历练点都落在可走区', () => {
    for (const s of cool.slots)
      expect(w.walkable(s.entrance), `${s.id} entrance`).toBe(true);
    for (const s of cool.spots)
      expect(w.walkable(s.point), `${s.id}`).toBe(true);
    expect(w.walkable(cool.quarry)).toBe(true);
    expect(w.walkable(cool.expeditionPoint)).toBe(true);
  });
  it('任意入口/点位之间都有路，且路径逐段不出可走区', () => {
    const points: P[] = [
      ...cool.slots.map((s) => s.entrance),
      ...cool.spots.map((s) => s.point),
      cool.quarry,
    ];
    for (const a of points)
      for (const b of points) {
        if (a === b) continue;
        const path = w.findPath(a, b);
        expect(path.length, `${a}→${b}`).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < path.length; i++) {
          const [p, q] = [path[i - 1], path[i]];
          const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
          for (let d = 0; d <= len; d += 2) {
            const t = len ? d / len : 0;
            expect(
              w.walkable([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]),
            ).toBe(true);
          }
        }
      }
  });
  it('sim 弟子的落点（开局与之后若干 tick）全部在冷色可走区内', () => {
    const world = createWorld(42, loadData());
    for (let tick = 0; tick <= 60; tick++) {
      if (tick) step(world);
      const dest = w.discipleDestinations(world.disciples, world.tick);
      dest.forEach((p) => expect(w.walkable(p), `${tick} ${p}`).toBe(true));
    }
  });
  it('dorm→hall 步行时间（占位石台重测，WALK_SPEED 不变）', () => {
    const dorm = cool.slots.find((s) => s.id === 'B_DORM')!.front,
      hall = cool.slots.find((s) => s.id === 'B_HALL')!.front;
    const seconds = w.walkTimeSeconds(dorm, hall);
    const length = w.pathLength(w.findPath(dorm, hall));
    console.log({
      coolDormToHall: { seconds, length, walkSpeed: w.WALK_SPEED },
    });
    expect(Number.isFinite(seconds)).toBe(true);
    expect(w.WALK_SPEED).toBe(20);
    // Lore 选 A：主殿入口跟随 Iris 台阶脚，k=0.6 时落入 8–15 s 目标（实测 13.00 s）。
    expect(seconds).toBeGreaterThanOrEqual(8);
    expect(seconds).toBeLessThanOrEqual(15);
    expect(seconds).toBeCloseTo(13.0, 1);
    expect(length / w.WALK_SPEED).toBeCloseTo(seconds, 6);
  });
  it('主殿入口在西侧台阶脚：脚印西南面外侧、可走、A* 可达', () => {
    const src = coolWorldSchema
      .parse(raw)
      .slots.find((s) => s.id === 'B_HALL')!;
    expect(src.entrance).toEqual([488, 374]);
    const hall = cool.slots.find((s) => s.id === 'B_HALL')!;
    const poly = (hall.footprint as { polygon: P[] }).polygon;
    const [west, south] = [poly[0], poly[1]];
    // 西南面（西角→南角）外侧，且位于西半段（不是原来的南角正前方）。
    const [ex, ey] = hall.entrance;
    const side =
      (south[0] - west[0]) * (ey - west[1]) -
      (south[1] - west[1]) * (ex - west[0]);
    expect(side).toBeGreaterThan(0);
    expect((ex - west[0]) / (south[0] - west[0])).toBeLessThan(0.5);
    expect(w.inFootprint(hall.entrance, hall.footprint)).toBe(false);
    expect(w.walkable(hall.entrance)).toBe(true);
    for (const s of cool.slots) {
      if (s.id === 'B_HALL') continue;
      expect(
        w.findPath(s.entrance, hall.entrance).length,
        s.id,
      ).toBeGreaterThanOrEqual(2);
    }
  });
  it('社交站位 5 在主殿台阶前约一个身位，且不挡入口通道（A* 路径）', () => {
    const hall = cool.slots.find((s) => s.id === 'B_HALL')!.entrance;
    const spot = cool.spots.find((s) => s.id === 'C_SOCIAL_5')!.point;
    expect(w.walkable(spot)).toBe(true);
    const gap = Math.hypot(spot[0] - hall[0], spot[1] - hall[1]);
    // 一个身位：不小于脚距 FOOT_SPACING，不超过弟子身高。
    expect(gap).toBeGreaterThanOrEqual(w.FOOT_SPACING);
    expect(gap).toBeLessThanOrEqual(DISCIPLE_HEIGHT);
    const seg = (p: P, a: P, b: P) => {
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        l = dx * dx + dy * dy;
      const u = l
        ? Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l),
          )
        : 0;
      return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy);
    };
    const sources: P[] = [
      ...cool.slots.filter((s) => s.id !== 'B_HALL').map((s) => s.entrance),
      ...cool.spots.filter((s) => s.id !== 'C_SOCIAL_5').map((s) => s.point),
      cool.quarry,
      cool.expeditionPoint,
    ];
    for (const from of sources) {
      const path = w.findPath(from, hall);
      expect(path.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < path.length; i++)
        expect(
          seg(spot, path[i - 1], path[i]),
          `${from}`,
        ).toBeGreaterThanOrEqual(w.FOOT_SPACING);
    }
  });
  it('多人同站铺开背离入口：社交站位 5 第 2~4 人离所有进主殿 A* 通道 > 脚距', () => {
    const hall = cool.slots.find((s) => s.id === 'B_HALL')!.entrance;
    const anchor = w.nearestWalkable(
      cool.spots.find((s) => s.id === 'C_SOCIAL_5')!.point,
    );
    // 与上一条同一通道口径（独立重算，不依赖 spreadChannel）：其余槽位入口、其余站位、
    // 采石点、外出点到主殿入口的 A* 路径。
    const sources: P[] = [
      ...cool.slots.filter((s) => s.id !== 'B_HALL').map((s) => s.entrance),
      ...cool.spots.filter((s) => s.id !== 'C_SOCIAL_5').map((s) => s.point),
      cool.quarry,
      cool.expeditionPoint,
    ];
    const paths = sources.map((from) => w.findPath(from, hall));
    const occupied: P[] = [];
    for (let i = 0; i < 4; i++)
      occupied.push(w.spacedLanding(anchor, occupied));
    expect(occupied[0]).toEqual(anchor);
    for (const p of occupied.slice(1)) {
      expect(w.walkable(p)).toBe(true);
      expect(w.channelClearance(p, paths), `${p}`).toBeGreaterThan(
        w.FOOT_SPACING,
      );
    }
  });
  it('多人同站铺开：所有站位 6 人都在可走区内、不进脚印、互相 ≥ 脚距、结果确定；无通道站位保持原顺序', () => {
    const FS = w.FOOT_SPACING;
    const original = (anchor: P, occupied: P[]): P => {
      for (let ring = 0; ring <= 100; ring++)
        for (let dy = -ring; dy <= ring; dy++)
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const p: P = [anchor[0] + dx * FS, anchor[1] + dy * FS];
            if (!w.walkable(p) || !w.lineClear(anchor, p)) continue;
            if (occupied.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < FS))
              continue;
            return p;
          }
      throw Error('none');
    };
    const spread = (anchor: P, f: (a: P, o: P[]) => P) => {
      const occ: P[] = [];
      for (let i = 0; i < 6; i++) occ.push(f(anchor, occ));
      return occ;
    };
    const withChannel: string[] = [];
    for (const s of cool.spots) {
      const anchor = w.nearestWalkable(s.point);
      const got = spread(anchor, w.spacedLanding);
      expect(spread(anchor, w.spacedLanding)).toEqual(got);
      for (const [i, p] of got.entries()) {
        expect(w.walkable(p), s.id).toBe(true);
        for (const slot of cool.slots)
          expect(w.inFootprint(p, slot.footprint), `${s.id} ${slot.id}`).toBe(
            false,
          );
        for (const q of got.slice(0, i))
          expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeGreaterThanOrEqual(
            FS - 1e-9,
          );
      }
      const channel = w.spreadChannel(anchor);
      if (channel) {
        withChannel.push(s.id);
        for (const p of got.slice(1))
          expect(w.channelClearance(p, channel), s.id).toBeGreaterThan(FS);
      } else expect(got, s.id).toEqual(spread(anchor, original));
    }
    // 离最近建筑入口 ≤ 3 个脚距的站位才有入口通道概念。
    expect(withChannel).toEqual([
      'C_SOCIAL_1',
      'C_SOCIAL_4',
      'C_SOCIAL_5',
      'C_SOCIAL_6',
    ]);
  });
  it.each([
    ['C_SOCIAL_4', 'B_DORM'],
    ['C_SOCIAL_6', 'B_GATE'],
  ])(
    '%s 站位本身离 %s 入口通道约一个身位（28–56 px），靠近入口、可走、不进脚印',
    (id, slotId) => {
      const FS = w.FOOT_SPACING;
      const e = cool.slots.find((s) => s.id === slotId)!.entrance;
      const spot = cool.spots.find((s) => s.id === id)!.point;
      expect(w.walkable(spot)).toBe(true);
      for (const slot of cool.slots)
        expect(w.inFootprint(spot, slot.footprint), slot.id).toBe(false);
      // 独立重算通道：其余槽位入口、其余站位、采石点、外出点到该入口的 A* 路径。
      const sources: P[] = [
        ...cool.slots.map((s) => s.entrance),
        ...cool.spots.filter((s) => s.id !== id).map((s) => s.point),
        cool.quarry,
        cool.expeditionPoint,
      ].filter((p) => Math.hypot(p[0] - e[0], p[1] - e[1]) > 1e-6);
      const paths = sources.map((from) => w.findPath(from, e));
      const d = w.channelClearance(spot, paths);
      expect(d).toBeGreaterThanOrEqual(FS);
      expect(d).toBeLessThanOrEqual(2 * FS);
      // 仍靠近入口，且保留入口通道概念（铺开背离入口仍生效）。
      expect(Math.hypot(spot[0] - e[0], spot[1] - e[1])).toBeLessThanOrEqual(
        w.SPREAD_CHANNEL_RADIUS,
      );
      expect(w.spreadChannel(w.nearestWalkable(spot))).not.toBeNull();
      for (const other of cool.spots.filter((s) => s.id !== id))
        expect(
          Math.hypot(spot[0] - other.point[0], spot[1] - other.point[1]),
          other.id,
        ).toBeGreaterThanOrEqual(2 * FS);
    },
  );
});
