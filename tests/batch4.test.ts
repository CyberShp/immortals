import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { createWorld, advance } from '../src/sim/world';
import { loadData } from '../src/sim/data';
import { lifeLines, lifeLine } from '../src/display/lifeline';
import {
  snapshot,
  migrate,
  SaveManager,
  MemoryStorage,
  MAIN,
} from '../src/save';
import { applyOffline } from '../src/sim/offline';
import patch from '../src/display/roster_patch.json';
import pool from '../src/display/recruit_pool.json';
import { renderRandom } from '../src/display/random';
const create = () => createWorld(42, loadData());
function recruits() {
  const w = create();
  for (let i = 0; i < 13; i++) {
    const d = structuredClone(w.disciples[0]);
    d.id = `R${i}`;
    d.name = `新人${String.fromCharCode(65 + i)}`;
    w.disciples.push(d);
  }
  return w;
}
describe('人生线表现与存档', () => {
  it('按 name 命中六名固定弟子，不改世界；Unicode 字数 <=16', () => {
    const w = create(),
      original = JSON.stringify(w),
      lines = lifeLines(w);
    expect(Object.keys(lines)).toHaveLength(6);
    for (const entry of patch.as_array) {
      const d = w.disciples.find((d) => d.name === entry.name)!;
      expect(lifeLine(w, d.id)).toBe(entry.lifeLine);
      expect([...entry.lifeLine].length).toBeLessThanOrEqual(16);
    }
    expect(JSON.stringify(w)).toBe(original);
  });
  it('种子独立流逐轮无放回、耗尽重洗，访问顺序不影响抽签', () => {
    const w = recruits(),
      before = JSON.stringify(w.rng),
      lines = lifeLines(w);
    for (const start of [0, 6])
      expect(
        new Set(Array.from({ length: 6 }, (_, i) => lines[`R${start + i}`]))
          .size,
      ).toBe(6);
    expect(new Set(Object.values(lines).slice(6))).toEqual(
      new Set(pool.pool.map((p) => p.lifeLine)),
    );
    expect(lifeLines(recruits())).toEqual(lines);
    expect(JSON.stringify(w.rng)).toBe(before);
  });
  it('旧档补抽并落盘、导入/重读/离线后保持已抽文本', async () => {
    const w = recruits(),
      store = new MemoryStorage(),
      manager = new SaveManager(store);
    const old = { version: 2, lastSeen: 1000, world: w };
    await store.write([[MAIN, old]]);
    const loaded = (await manager.load()).save!;
    const lines = structuredClone(loaded.lifeLines);
    expect(((await store.read(MAIN)) as typeof loaded).lifeLines).toEqual(
      lines,
    );
    const imported = await manager.import(
      JSON.stringify(loaded),
      snapshot(create(), 0),
    );
    expect(imported.lifeLines).toEqual(lines);
    applyOffline(imported.world, 2, 1000);
    expect(snapshot(imported.world, 601000).lifeLines).toMatchObject(lines!);
    expect(
      migrate(JSON.parse(JSON.stringify(imported))).lifeLines,
    ).toMatchObject(lines!);
    expect(
      snapshot((await manager.load()).save!.world, 1000).lifeLines,
    ).toEqual(lines);
  });
});
describe('v1.5 游戏网格与岗位选择', () => {
  let w: typeof import('../src/render/world');
  let v: typeof import('../src/render/world-v4');
  let s: typeof import('../src/render/v4-spots');
  beforeAll(async () => {
    vi.resetModules();
    vi.stubGlobal('location', { search: '?world=v4' });
    w = await import('../src/render/world');
    v = await import('../src/render/world-v4');
    s = await import('../src/render/v4-spots');
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it('全部点/容量子位/6 环位/stages/对剑位可走且从 dorm 出生点可达', () => {
    const points = [
      ...s.satelliteSpots.flatMap((p) => [p.point, ...s.subpositions(p)]),
      ...s.stages.map((p) => p.point),
      ...s.ringPair,
    ];
    for (const p of points) {
      expect(w.walkable(p), `${p}`).toBe(true);
      expect(w.findPath(v.v4Spawn, p).length, `${p}`).toBeGreaterThan(1);
    }
    expect(s.musterPositions()).toHaveLength(6);
  }, 30000);
  it('第17条仅六席且两两至少45.92px；溢出与卫星台原地退场，阻挡席跳过', () => {
    const seats = s.musterPositions(99);
    expect(seats).toHaveLength(6);
    seats.forEach((p, i) =>
      seats
        .slice(i + 1)
        .forEach((q) =>
          expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeGreaterThanOrEqual(
            45.92,
          ),
        ),
    );
    expect(s.expeditionLanding(v.v4Spawn, seats)).toEqual(v.v4Spawn);
    expect(s.musterPositions(6, () => false)).toEqual([]);
    expect(s.expeditionLanding(v.v4Spawn, [], () => false)).toEqual(v.v4Spawn);
    for (const spot of s.satelliteSpots)
      expect(s.expeditionLanding(spot.point, [])).toEqual(spot.point);
  });
  it('被挡的第1席不会把该弟子递补到第2席；第2人仍用第2席', () => {
    const seats = s.musterPositions();
    const blockedFirst = (p: [number, number]) =>
      Math.hypot(p[0] - seats[0][0], p[1] - seats[0][1]) > 0.01;
    expect(s.expeditionLanding(v.v4Spawn, [], blockedFirst, 0)).toEqual(
      v.v4Spawn,
    );
    expect(s.expeditionLanding(v.v4Spawn, [], blockedFirst, 1)).toEqual(
      seats[1],
    );
    expect(s.expeditionLanding(v.v4Spawn, [seats[0]], undefined, 0)).toEqual(
      v.v4Spawn,
    );
    expect(w.worldMap.islands.map((i) => i.id)).toEqual([
      'main',
      'east',
      'south',
    ]);
    expect(w.worldMap.bridges.map((i) => i.id)).toEqual(['east', 'south']);
    expect(w.worldMap.bridges.every((b) => b.width > 45.92)).toBe(true);
  });
  it('spots_v2 坐标原样保留，吸附仅限2px且显式报告，坏点不抛模块异常', () => {
    for (const spot of [...s.satelliteSpots, ...s.stages]) {
      const adapted = w.worldMap.spots.find((p) => p.id === spot.id)!;
      expect(adapted.point).toEqual(spot.point);
      expect(adapted.island).toBe('island' in spot ? spot.island : 'south');
      expect(adapted.moved).toBe(0);
    }
    expect(v.v4Nearest([-1000, -1000], 'bad', 600)).toBeUndefined();
    expect(v.v4AdaptationReports.at(-1)).toMatchObject({
      id: 'bad',
      limit: 16,
      status: 'rejected',
    });
    const p = v.uv(30.262, 7.761);
    expect(v.v4Nearest(p, 'valid')).toEqual(p);
    const edge = v.uv(47.8, -5.7);
    const invalid: [number, number] = [edge[0], edge[1] - 0.5];
    expect(v.v4Walkable(invalid)).toBe(false);
    {
      const result = v.v4Nearest(invalid, 'edge');
      expect(result).toBeDefined();
      expect(v.v4AdaptationReports.at(-1)).toMatchObject({
        id: 'edge',
        status: 'snapped',
      });
    }
  });
  it('away不占岗位，清除旧分配，不推进sim随机数', () => {
    const world = create(),
      planner = new s.SpotPlanner();
    planner.plan(world, world.disciples, new Map());
    world.disciples[0].state.awayUntil = 100;
    world.disciples[1].state.behavior = '历练';
    const before = JSON.stringify(world);
    const points = planner.plan(world, world.disciples, new Map());
    expect(points).toHaveLength(4);
    expect(planner.assignments.has('d0')).toBe(false);
    expect(planner.assignments.has('d1')).toBe(false);
    expect(JSON.stringify(world)).toBe(before);
  });
  it('EV_A2 两当事人及 22 观战者不在阻挡内，间距至少45.92', () => {
    const points = s.duelPositions(24);
    expect(points).toHaveLength(24);
    points.forEach((p, i) => {
      expect(w.walkable(p)).toBe(true);
      for (const q of points.slice(i + 1))
        expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeGreaterThanOrEqual(
          45.92,
        );
    });
  });
  it('距离反比 ×3 特质偏好；满位排除；独立流可复现', () => {
    const a = s.satelliteSpots[1],
      from: [number, number] = [a.point[0] + 100, a.point[1]];
    expect(s.spotWeight(a, from, a.prefer)).toBeCloseTo(
      s.spotWeight(a, from, []) * 3,
    );
    expect(s.spotWeight(a, [from[0] + 100, from[1]], [])).toBeCloseTo(
      s.spotWeight(a, from, []) / 2,
    );
    expect(
      s.selectSpot([a], from, [], new Map([[a.id, 2]]), () => 0),
    ).toBeUndefined();
    const b = s.satelliteSpots[2];
    expect(
      s.selectSpot([a, b], from, [], new Map([[a.id, 2]]), () => 0)?.id,
    ).toBe(b.id);
    const r = renderRandom(42, 'render-spots'),
      q = renderRandom(42, 'render-spots');
    expect(Array.from({ length: 20 }, r)).toEqual(
      Array.from({ length: 20 }, q),
    );
  });
  it('100 步选点不写 sim 状态与随机数', () => {
    const world = create(),
      p = new s.SpotPlanner();
    for (let i = 0; i < 100; i++) {
      advance(world, 1);
      const before = JSON.stringify(world);
      p.plan(world, world.disciples, new Map());
      expect(JSON.stringify(world)).toBe(before);
    }
  });
  it('炉前满位最多等待两步后切换表现行为', () => {
    const world = create();
    world.buildings.push({
      ...world.buildings[0],
      id: 'B_ALCHEMY',
      name: '炼丹房',
      level: 1,
    });
    const list = world.disciples.slice(0, 2);
    for (const d of list) {
      d.state.behavior = '做工';
      d.state.location = '炼丹房';
      d.state.stepsLeft = 8;
    }
    const p = new s.SpotPlanner();
    p.plan(world, list, new Map());
    expect(p.assignments.get(list[1].id)?.waitingSince).toBe(0);
    for (let i = 1; i <= 2; i++) {
      world.tick++;
      for (const d of list) d.state.stepsLeft--;
      p.plan(world, list, new Map());
    }
    expect(p.assignments.get(list[1].id)?.waitingSince).toBeUndefined();
    expect(p.assignments.get(list[1].id)?.fallback).toBe(true);
  });
  it('跨岛过长行程只截断表现路径，桥口与南通路各段可走', () => {
    for (const id of ['E_ALCH_FRONT', 'S_SWORD_1']) {
      const spot = s.satelliteSpots.find((p) => p.id === id)!;
      const t = s.bridgeTransfer(
        v.v4Spawn,
        spot.point,
        spot.island,
        1,
        v.V4.walkSpeed,
      )!;
      expect(t).toBeDefined();
      expect(t.target).toEqual(spot.point);
      for (let i = 1; i < t.path.length; i++)
        expect(w.lineClear(t.path[i - 1], t.path[i])).toBe(true);
      expect(
        s.bridgeTransfer(
          v.v4Spawn,
          spot.point,
          spot.island,
          100,
          v.V4.walkSpeed,
        ),
      ).toBeUndefined();
    }
  });
  it('室外复用召集/讲道流程，席位与新增席位不进入殿内', async () => {
    const { outdoorHall, outdoorSeats } =
      await import('../src/render/v4-outdoor');
    const h = await import('../src/render/cool-hall');
    const st = await import('../src/render/cool-sermon');
    const hall = outdoorHall(),
      ids = create().disciples.map((d) => d.id);
    const assembly = h.startAssembly(hall, ids, 'test', () => false);
    h.addLateJoiner(hall, assembly.seats, 'late', false);
    outdoorSeats(assembly.seats);
    for (const seat of assembly.seats.values()) {
      expect(seat.inside).toBe(false);
      expect(w.walkable(seat.point!)).toBe(true);
    }
    expect(h.assemblyTick(assembly, 1, true)?.phase).toBe('ceremony');
    let done: ReturnType<typeof h.assemblyTick> = assembly;
    for (let i = 0; i < 100 && done; i++)
      done = h.assemblyTick(done, 1000, true);
    expect(done).toBeUndefined();
    let sermon: ReturnType<typeof st.sermonTick> = st.startSermon(
      hall,
      ids,
      1000,
    );
    for (const c of sermon.cushions.values()) c.point = s.v4Cushions[c.index];
    expect(st.sermonTick(sermon, 1, true)?.phase).toBe('lecture');
    for (let i = 0; i < 100 && sermon; i++)
      sermon = st.sermonTick(sermon, 1000, true);
    expect(sermon).toBeUndefined();
  });
});
