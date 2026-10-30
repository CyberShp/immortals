// ?cool=1 主殿表现层逻辑：几何、前缘排序、屋顶计时、进出殿路线、日常分流、召集席位与计时、触发检测。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ASSEMBLY,
  COOL_ROOF,
  DOOR_FADE,
  HALL_CAPACITY,
  addLateJoiner,
  assemblyTick,
  buildCoolHall,
  coolHallSchema,
  coolRoofAlpha,
  coolRoofUpdate,
  dailySeats,
  detectTriggers,
  frontChainY,
  outdoorZ,
  planHallRoute,
  polyLength,
  releaseOrder,
  retriggerAssembly,
  roofClosed,
  routeStatus,
  seniorityOrder,
  snapshotTriggers,
  startAssembly,
  type CoolRoof,
  type P,
} from '../src/render/cool-hall';
import raw from '../src/render/cool-hall.json';

const hall = buildCoolHall(raw);
const d = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
const inPoly = (p: readonly number[], poly: readonly (readonly number[])[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
};

describe('cool-hall.json 几何', () => {
  it('zod 校验：16 站位、4 会客座、4 排队位、≥8 列队位、分层素材都在 cool/hall/', () => {
    expect(coolHallSchema.safeParse(raw).success).toBe(true);
    const bad = JSON.parse(JSON.stringify(raw));
    bad.layers.roof.file = 'map/world.webp';
    expect(coolHallSchema.safeParse(bad).success).toBe(false);
    expect(hall.hallZ).toBeCloseTo(881.6, 6);
  });
  it('16 站位两两间距 ≥63 世界 px，都在内景范围内；1 号最靠宝座', () => {
    for (const [i, a] of hall.stations.entries()) {
      // 站位在殿内地面上（地面比台基脚印高，屏幕上可略越过脚印后缘），用内景层外框判。
      const room = hall.layers.room;
      expect(a[0]).toBeGreaterThan(room.x);
      expect(a[0]).toBeLessThan(room.x + room.size[0] * room.scale);
      expect(a[1]).toBeGreaterThan(room.y);
      expect(a[1], `站位 ${i + 1}`).toBeLessThan(
        room.y + room.size[1] * room.scale,
      );
      for (const b of hall.stations.slice(i + 1))
        expect(d(a, b)).toBeGreaterThanOrEqual(63);
    }
    const toThrone = hall.stations.map((p) => d(p, hall.throne));
    expect(Math.min(...toThrone)).toBe(toThrone[0]);
  });
  it('排队位 = 列队区前 4 个；列队位两两不重叠（≥ 脚距 28），都在脚印外', () => {
    expect(hall.lineup.slice(0, 4)).toEqual(hall.queue);
    for (const [i, a] of hall.lineup.entries()) {
      expect(inPoly(a, hall.footprint)).toBe(false);
      for (const b of hall.lineup.slice(i + 1))
        expect(d(a, b)).toBeGreaterThanOrEqual(28);
    }
  });
  it('前缘排序：前缘线前的弟子画在整座主殿之上，其余按脚底 y', () => {
    const x = 1500;
    const y = frontChainY(hall.frontChain as P[], x)!;
    expect(y).toBeGreaterThan(700);
    expect(outdoorZ(hall, [x, y + 5])).toBe(hall.hallZ + 1);
    expect(outdoorZ(hall, [x, 950])).toBe(950);
    expect(outdoorZ(hall, [900, 700])).toBe(700);
  });
});

describe('屋顶淡出计时（二 #14）', () => {
  it('有人 → 0.8 s 淡出；清空 → 停 1.5 s → 0.8 s 淡回', () => {
    let r: CoolRoof = roofClosed(0);
    r = coolRoofUpdate(r, true, 0);
    expect(coolRoofAlpha(r, 400)).toBeCloseTo(0.5, 6);
    expect(coolRoofAlpha(r, COOL_ROOF.outMs)).toBe(0);
    r = coolRoofUpdate(r, false, 1000);
    r = coolRoofUpdate(r, false, 2400);
    expect(coolRoofAlpha(r, 2400)).toBe(0);
    r = coolRoofUpdate(r, false, 2600);
    expect(coolRoofAlpha(r, 2500)).toBe(0);
    expect(coolRoofAlpha(r, 2900)).toBeCloseTo(0.5, 6);
    expect(coolRoofAlpha(r, 3300)).toBe(1);
  });
  it('淡回途中有人进门：从当前 α 再淡出（不跳变）', () => {
    let r = coolRoofUpdate(roofClosed(0), true, 0);
    r = coolRoofUpdate(r, false, 800);
    r = coolRoofUpdate(r, false, 2300);
    const mid = coolRoofAlpha(r, 2700);
    expect(mid).toBeCloseTo(0.5, 6);
    r = coolRoofUpdate(r, true, 2700);
    expect(coolRoofAlpha(r, 2700)).toBeCloseTo(mid, 6);
    expect(coolRoofAlpha(r, 3100)).toBe(0);
  });
  it('清空不足 1.5 s 又有人：屋顶一直保持淡出', () => {
    let r = coolRoofUpdate(roofClosed(0), true, 0);
    r = coolRoofUpdate(r, false, 1000);
    r = coolRoofUpdate(r, true, 2000);
    r = coolRoofUpdate(r, false, 2100);
    r = coolRoofUpdate(r, false, 3500);
    expect(coolRoofAlpha(r, 3500)).toBe(0);
  });
});

describe('进出殿路线（无瞬移、门口成批淡出淡入）', () => {
  const straight = (a: P, b: P): P[] => [a, b];
  const seat = hall.stations[15] as P;
  it('殿外 → 殿内席位：经入口、台阶顶、门；门口 ±1 身位淡变，门内为殿内', () => {
    const r = planHallRoute(
      hall,
      [1300, 900],
      'outdoor',
      seat,
      true,
      straight,
    )!;
    expect(r.path[0]).toEqual([1300, 900]);
    expect(r.path.at(-1)).toEqual(seat);
    expect(r.path).toContain(hall.door);
    const s = r.doorS!;
    expect(routeStatus(r, s - DOOR_FADE - 1)).toMatchObject({
      inside: false,
      alpha: 1,
    });
    expect(routeStatus(r, s - DOOR_FADE / 2).alpha).toBeCloseTo(0.5, 6);
    expect(routeStatus(r, s).alpha).toBe(0);
    expect(routeStatus(r, s + 1).inside).toBe(true);
    expect(routeStatus(r, s + DOOR_FADE).alpha).toBe(1);
  });
  it('殿内 → 殿外：原路回门口再走 A*；殿内 → 殿内：直线', () => {
    const out = planHallRoute(
      hall,
      seat,
      'inside',
      [1000, 900],
      false,
      straight,
    )!;
    expect(out.path.slice(0, 4)).toEqual([
      seat,
      hall.door,
      hall.stairTop,
      hall.entrance,
    ]);
    expect(routeStatus(out, 0).inside).toBe(true);
    expect(routeStatus(out, polyLength(out.path)).inside).toBe(false);
    const move = planHallRoute(
      hall,
      seat,
      'inside',
      hall.stations[0] as P,
      true,
      straight,
    )!;
    expect(move.path).toEqual([seat, hall.stations[0]]);
    expect(routeStatus(move, 10).inside).toBe(true);
  });
  it('台阶上改主意：从当前位置接着走，不回到起点', () => {
    const mid: P = [
      (hall.entrance[0] + hall.stairTop[0]) / 2,
      (hall.entrance[1] + hall.stairTop[1]) / 2,
    ];
    const back = planHallRoute(
      hall,
      mid,
      'stairs',
      [1000, 900],
      false,
      straight,
    )!;
    expect(back.path.slice(0, 2)).toEqual([mid, hall.entrance]);
    const on = planHallRoute(hall, mid, 'stairs', seat, true, straight)!;
    expect(on.path).toEqual([mid, hall.stairTop, hall.door, seat]);
  });
});

describe('日常分流（二 #16）', () => {
  const ids = Array.from({ length: 24 }, (_, i) => `D${i + 1}`);
  it('16 人进殿、17–20 排队位、21 起交给其他社交站位', () => {
    const s = dailySeats(hall, new Map(), ids);
    const kinds = ids.map((id) => s.get(id)!.kind);
    expect(kinds.filter((k) => k === 'station')).toHaveLength(HALL_CAPACITY);
    expect(kinds.slice(16, 20)).toEqual(['queue', 'queue', 'queue', 'queue']);
    expect(kinds.slice(20).every((k) => k === 'overflow')).toBe(true);
    // 先到先得：第 1 人站离门最近的站位。
    const nearest = hall.stations
      .map((p, i) => [d(p, hall.door), i] as const)
      .sort((a, b) => a[0] - b[0])[0][1];
    expect(s.get('D1')!.index).toBe(nearest);
  });
  it('有人离殿：排队第 1 人补进空站位，其他人位置不变（不整体重排）', () => {
    const s = dailySeats(hall, new Map(), ids.slice(0, 20));
    const freed = s.get('D5')!;
    const next = dailySeats(
      hall,
      s,
      ids.slice(0, 20).filter((id) => id !== 'D5'),
    );
    expect(next.get('D17')).toEqual(freed);
    for (const id of ids.slice(0, 16).filter((id) => id !== 'D5'))
      expect(next.get(id)).toEqual(s.get(id));
  });
});

describe('召集全员（4.6，P6 推荐口径）', () => {
  const mk = (id: string, major: string, layer: number, age: number) => ({
    id,
    realm: { major, layer },
    ageSeasons: age,
  });
  it('资历：筑基在前；同境界按入门先后（开局 6 人同批、年长者在前）', () => {
    const list = [
      mk('a', '炼气', 3, 40),
      mk('b', '炼气', 3, 80),
      mk('c', '筑基', 1, 200),
      mk('d', '炼气', 2, 90),
      mk('e', '炼气', 3, 20),
    ];
    const join = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 3],
      ['e', 7],
    ]);
    expect(seniorityOrder(list, join)).toEqual(['c', 'b', 'a', 'e', 'd']);
  });
  it('注入 24 人：殿内恰 16（1–16 号），其余 8 人在列队区，列队位不重复', () => {
    const order = Array.from({ length: 24 }, (_, i) => `D${i + 1}`);
    const a = startAssembly(hall, order, 'test');
    const seats = [...a.seats.values()];
    expect(seats.filter((s) => s.kind === 'station')).toHaveLength(16);
    const line = seats.filter((s) => s.kind === 'lineup');
    expect(line).toHaveLength(8);
    expect(new Set(line.map((s) => s.index)).size).toBe(8);
    expect(a.seats.get('D1')).toMatchObject({ kind: 'station', index: 0 });
  });
  it('补位：补到号最大的空站位；殿内满则列队区末尾；不挪其他人', () => {
    const order = Array.from({ length: 10 }, (_, i) => `D${i + 1}`);
    const a = startAssembly(hall, order, 'test');
    const before = new Map(a.seats);
    expect(addLateJoiner(hall, a.seats, 'N1')).toMatchObject({
      kind: 'station',
      index: 15,
    });
    for (const [id, s] of before) expect(a.seats.get(id)).toEqual(s);
    const full = startAssembly(
      hall,
      Array.from({ length: 18 }, (_, i) => `F${i}`),
      't',
    );
    expect(addLateJoiner(hall, full.seats, 'N2')).toMatchObject({
      kind: 'lineup',
      index: 2,
    });
  });
  it('计时：到齐或 30 s 超时开仪式，仪式 20 s，散开列队区先走、殿内 16→1', () => {
    const order = Array.from({ length: 18 }, (_, i) => `D${i + 1}`);
    let a = startAssembly(hall, order, 't')!;
    a = assemblyTick(a, ASSEMBLY.gatherTimeoutMs - 1, false)!;
    expect(a.phase).toBe('gather');
    a = assemblyTick(a, 1, false)!;
    expect(a.phase).toBe('ceremony');
    a = assemblyTick(a, ASSEMBLY.ceremonyMs, true)!;
    expect(a.phase).toBe('disperse');
    expect([...a.released]).toEqual(['D17']);
    expect(releaseOrder(a.seats).slice(0, 4)).toEqual([
      'D17',
      'D18',
      'D16',
      'D15',
    ]);
    expect(releaseOrder(a.seats).at(-1)).toBe('D1');
    let end: typeof a | undefined = a;
    for (let i = 0; i < 40 && end; i++)
      end = assemblyTick(end, ASSEMBLY.releaseGapMs, true);
    expect(end).toBeUndefined();
  });
  it('到齐提前开仪式；仪式中再触发：结束后不散开、直接下一轮', () => {
    let a = startAssembly(hall, ['A', 'B'], 't')!;
    a = assemblyTick(a, 1000, true)!;
    expect(a.phase).toBe('ceremony');
    retriggerAssembly(a, 'again');
    a = assemblyTick(a, ASSEMBLY.ceremonyMs, true)!;
    expect(a.phase).toBe('gather');
    expect(a.released.size).toBe(0);
  });
  it('触发：新弟子入门、炼气→筑基、EV_SEC_02 结算；小境界不触发；跳多步（离线）不补演', () => {
    const w = {
      tick: 10,
      disciples: [
        { id: 'a', realm: { major: '炼气' } },
        { id: 'b', realm: { major: '炼气' } },
      ],
      flags: {} as Record<string, unknown>,
    };
    const s0 = snapshotTriggers(w);
    expect(detectTriggers(undefined, w)).toEqual([]);
    expect(detectTriggers(s0, { ...w, tick: 11 })).toEqual([]);
    expect(
      detectTriggers(s0, {
        ...w,
        tick: 11,
        disciples: [...w.disciples, { id: 'c', realm: { major: '炼气' } }],
      }),
    ).toEqual(['入门:c']);
    expect(
      detectTriggers(s0, {
        ...w,
        tick: 11,
        disciples: [w.disciples[0], { id: 'b', realm: { major: '筑基' } }],
      }),
    ).toEqual(['筑基:b']);
    expect(
      detectTriggers(s0, { ...w, tick: 11, flags: { 'done:EV_SEC_02': 11 } }),
    ).toEqual(['宗门会议']);
    expect(
      detectTriggers(s0, { ...w, tick: 40, flags: { 'done:EV_SEC_02': 40 } }),
    ).toEqual([]);
  });
});

describe('cool 打开时：排队位/列队位在可走区且不压入口通道（>28）', () => {
  let w: typeof import('../src/render/world');
  beforeAll(async () => {
    vi.resetModules();
    vi.stubGlobal('location', { search: '?cool=1' });
    w = await import('../src/render/world');
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it('列队位全部可走，离所有进主殿入口的 A* 通道 > 28', () => {
    const cool = w.coolWorld!;
    const e = hall.entrance as P;
    const sources: P[] = [
      ...cool.slots.filter((s) => s.id !== 'B_HALL').map((s) => s.entrance),
      ...cool.spots.map((s) => s.point),
      cool.quarry,
      cool.expeditionPoint,
    ];
    const paths = sources.map((from) => w.findPath(from, e));
    for (const p of hall.lineup) {
      expect(w.walkable(p as P), `${p}`).toBe(true);
      expect(w.channelClearance(p as P, paths), `${p}`).toBeGreaterThan(28);
    }
    expect(cool.slots.find((s) => s.id === 'B_HALL')!.entrance).toEqual(e);
  });
});
