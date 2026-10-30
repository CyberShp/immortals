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
  });
});
