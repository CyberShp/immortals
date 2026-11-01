// ?cool=1 主殿表现层逻辑：几何、前缘排序、屋顶计时、进出殿路线、日常分流、召集席位与计时、触发检测。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ASSEMBLY,
  coolMotionMs,
  gatherSpeedFactor,
  COOL_ROOF,
  DOOR_FADE,
  HALL_CAPACITY,
  addLateJoiner,
  chairEligible,
  HALL_CHAIRS,
  assemblyTick,
  buildCoolHall,
  coolHallSchema,
  coolFloorParam,
  COOL_FLOORS,
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
import { routeSpeed } from '../src/render/world';
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

describe('cool-hall.json v4g 分层与一层三厅（v6：二层/三层取消）', () => {
  it('所有层同一坐标系（同 scale）、都在 cool/hall4/；正面台阶外观与一层各厅都显示；左右厅内景与正殿同框', () => {
    const L = hall.layers;
    const all = [
      L.base,
      L.room,
      L.roof,
      L.shadow!,
      L.carpet!,
      ...L.columns,
      ...L.outerColumns!,
      ...L.stairs!,
      ...Object.values(L.rooms!),
    ];
    expect(all).toHaveLength(17);
    for (const l of all) {
      expect(l.file.startsWith('cool/hall4/')).toBe(true);
      expect(l.scale).toBeCloseTo(L.base.scale, 9);
    }
    expect(L.stairs).toHaveLength(1);
    expect(L.stairs![0].file).toBe('cool/hall4/hall-stair-front.webp');
    expect(L.stairs![0].floors).toEqual(['outside', 'main', 'left', 'right']);
    expect(Object.keys(L.rooms!).sort()).toEqual(['left', 'right']);
    // 外檐柱柱脚都在台基前缘附近（≤ 台基底边以下）。
    for (const c of L.outerColumns!)
      expect(c.foot[1]).toBeLessThanOrEqual(hall.hallZ);
  });
  it('v6：二层内景、上二层楼梯、二层下楼口都不再被引用，schema 拒绝 floor2', () => {
    const text = JSON.stringify(hall);
    for (const f of [
      'hall-room-floor2',
      'hall-stair-up-main',
      'hall-stair-down-floor2',
    ])
      expect(text).not.toContain(f);
    expect(COOL_FLOORS).toEqual(['outside', 'main', 'left', 'right']);
    const bad = JSON.parse(JSON.stringify(raw));
    bad.layers.stairs[0].floors = ['floor2'];
    expect(coolHallSchema.safeParse(bad).success).toBe(false);
    const bad2 = JSON.parse(JSON.stringify(raw));
    bad2.layers.rooms.floor2 = { ...bad2.layers.rooms.left };
    expect(coolHallSchema.safeParse(bad2).success).toBe(false);
  });
  it('?coolFloor= 只接受 main/left/right，其它（含已取消的 floor2 / 三层）回 auto', () => {
    expect(coolFloorParam('?cool=1&coolFloor=main')).toBe('main');
    expect(coolFloorParam('?cool=1&coolFloor=left')).toBe('left');
    expect(coolFloorParam('?cool=1&coolFloor=right')).toBe('right');
    expect(coolFloorParam('?cool=1&coolFloor=floor2')).toBe('auto');
    expect(coolFloorParam('?cool=1&coolFloor=floor3')).toBe('auto');
    expect(coolFloorParam('?cool=1')).toBe('auto');
  });
});

describe('cool-hall.json 几何', () => {
  it('zod 校验：16 站位、4 会客座、4 排队位、≥8 列队位、分层素材都在 cool/hall/', () => {
    expect(coolHallSchema.safeParse(raw).success).toBe(true);
    const bad = JSON.parse(JSON.stringify(raw));
    bad.layers.roof.file = 'map/world.webp';
    expect(coolHallSchema.safeParse(bad).success).toBe(false);
    expect(hall.hallZ).toBeCloseTo(871.4, 6);
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
  it('08 增补 R2/R7：8 把交椅分列过道两侧（1 号离宝座最近、奇偶分侧），同侧 ≥32、离站位 ≥40；v4g 4 金柱 + v5p 5 外檐柱、客座只画', () => {
    expect(hall.layers.columns).toHaveLength(4);
    expect(hall.layers.outerColumns).toHaveLength(5);
    expect(hall.layers.base.file.startsWith('cool/hall4/')).toBe(true);
    expect(hall.chairs).toHaveLength(8);
    const tf = hall.throneFront;
    const dt = hall.chairs.map((c) => d(c.point, tf));
    expect(Math.min(...dt)).toBe(dt[0]);
    // 过道方向（八卦→宝座）的叉积定侧：奇数号同侧、偶数号另一侧。
    const side = (p: readonly number[]) =>
      Math.sign(
        (hall.throne[0] - tf[0]) * (p[1] - tf[1]) -
          (hall.throne[1] - tf[1]) * (p[0] - tf[0]),
      );
    const odd = side(hall.chairs[0].point);
    for (const [i, c] of hall.chairs.entries()) {
      expect(side(c.point), `交椅 ${i + 1}`).toBe(i % 2 ? -odd : odd);
      for (const [j, e] of hall.chairs.entries())
        if (j > i && j % 2 === i % 2)
          expect(d(c.point, e.point)).toBeGreaterThanOrEqual(32);
      for (const s of hall.stations)
        expect(d(c.point, s)).toBeGreaterThanOrEqual(40);
    }
    // 同侧朝向一致（无背面帧：两侧各一个朝向）。
    expect(
      new Set(hall.chairs.filter((_, i) => i % 2 === 0).map((c) => c.face))
        .size,
    ).toBe(1);
    expect(
      new Set(hall.chairs.filter((_, i) => i % 2 === 1).map((c) => c.face))
        .size,
    ).toBe(1);
    expect(hall.guests.length).toBeGreaterThanOrEqual(1);
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
  it('门口一个身位内改道、新路线不过门：α 从当前值接着淡回，不跳到 1', () => {
    const door = hall.door as P;
    const near: P = [door[0] - 5, door[1] + 5];
    const d = Math.hypot(5, 5);
    for (const [where, inside] of [
      ['stairs', false],
      ['inside', true],
    ] as const) {
      const to: P = inside ? (hall.stations[3] as P) : [1300, 900];
      const r = planHallRoute(hall, near, where, to, inside, straight)!;
      const st0 = routeStatus(r, 0);
      expect(st0.inside).toBe(inside);
      expect(st0.alpha).toBeCloseTo(d / DOOR_FADE, 6);
      expect(routeStatus(r, 1).alpha).toBeGreaterThan(st0.alpha);
      expect(routeStatus(r, DOOR_FADE).alpha).toBe(1);
      expect(routeStatus(r, DOOR_FADE).inside).toBe(inside);
    }
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
  it('N6（拍板 2）：注入 8 名筑基 + 16 炼气 = 24 人 → 8 把椅全坐满、16 个站位全用、会客座不分配', () => {
    const zj = Array.from({ length: 8 }, (_, i) => `Z${i + 1}`);
    const lq = Array.from({ length: 16 }, (_, i) => `L${i + 1}`);
    const a = startAssembly(hall, [...zj, ...lq], 't', (id) =>
      id.startsWith('Z'),
    );
    const seats = [...a.seats.values()];
    const chairs = seats.filter((s) => s.kind === 'chair').map((s) => s.index);
    expect(chairs.sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const st = seats.filter((s) => s.kind === 'station').map((s) => s.index);
    expect(new Set(st).size).toBe(16);
    expect(seats.every((s) => s.kind === 'chair' || s.kind === 'station')).toBe(
      true,
    );
  });
  it('N8 身份：筑基 ≤8 全坐椅、第 9 名筑基进站位且在全部炼气之前；炼气不坐；空椅不补；会客座从不分配', () => {
    expect(chairEligible({ realm: { major: '筑基' } })).toBe(true);
    expect(chairEligible({ realm: { major: '炼气' } })).toBe(false);
    const zj = Array.from({ length: 9 }, (_, i) => `Z${i + 1}`);
    const lq = Array.from({ length: 6 }, (_, i) => `L${i + 1}`);
    const seated = (id: string) => id.startsWith('Z');
    const a = startAssembly(hall, [...zj, ...lq], 't', seated);
    for (let i = 0; i < HALL_CHAIRS; i++)
      expect(a.seats.get(zj[i])).toMatchObject({
        kind: 'chair',
        index: i,
        face: hall.chairs[i].face,
        point: hall.chairs[i].point,
      });
    expect(a.seats.get('Z9')).toMatchObject({ kind: 'station', index: 0 });
    expect(a.seats.get('L1')).toMatchObject({ kind: 'station', index: 1 });
    for (const id of lq) expect(a.seats.get(id)!.kind).toBe('station');
    // 开局口径：1 名筑基 + 5 炼气 → 椅 1 有人，椅 2–8 空，站位 1–5。
    const b = startAssembly(
      hall,
      ['LSZ', 'a', 'b', 'c', 'd', 'e'],
      't',
      (id) => id === 'LSZ',
    );
    expect(b.seats.get('LSZ')).toMatchObject({ kind: 'chair', index: 0 });
    expect(
      ['a', 'b', 'c', 'd', 'e'].map((id) => b.seats.get(id)!.index),
    ).toEqual([0, 1, 2, 3, 4]);
    expect(
      [...b.seats.values()].filter((s) => s.kind === 'chair'),
    ).toHaveLength(1);
    // 中途补位：炼气不补空椅；筑基补号最大的空椅；椅满按站位规则。
    expect(addLateJoiner(hall, b.seats, 'x')).toMatchObject({
      kind: 'station',
      index: 15,
    });
    expect(addLateJoiner(hall, b.seats, 'Zx', true)).toMatchObject({
      kind: 'chair',
      index: 7,
    });
    const full = startAssembly(hall, zj.slice(0, 8), 't', seated);
    expect(addLateJoiner(hall, full.seats, 'Zy', true)).toMatchObject({
      kind: 'station',
      index: 15,
    });
    // 会客座从不出现在任何席位里。
    const gs = new Set(hall.guests.map((g) => g.join()));
    for (const s of [...a.seats.values(), ...b.seats.values()])
      expect(gs.has(s.point?.join() ?? '')).toBe(false);
    // 散开：列队区 → 站位 16→1 → 椅 8→1。
    expect(releaseOrder(a.seats).at(-1)).toBe('Z1');
    expect(releaseOrder(a.seats).slice(-8)).toEqual(
      [...zj.slice(0, 8)].reverse(),
    );
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
  it('计时：到齐或 50 s 超时开仪式，仪式 20 s，散开列队区先走、殿内 16→1', () => {
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
  // 2026-11-01：Lore 10 居舍院落与旧布局冲突，见 V3_FAILURES.md；指挥官第 4 批决定标已知失败，保留原期望。
  it.fails('列队位全部可走，离所有进主殿入口的 A* 通道 > 28', () => {
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
  it('N1/N4/N5：聚集段 duration = 路长/(routeSpeed×1.6)，迟暮同样 1.6；日常/散场 1.0（迟暮也 1.0，无 ×0.7）；上限 50 s、仪式 20 s、放人 700 ms', () => {
    expect(Object.keys(ASSEMBLY).filter((k) => /elder/i.test(k))).toEqual([]);
    expect(ASSEMBLY.gatherTimeoutMs).toBe(50_000);
    expect(ASSEMBLY.ceremonyMs).toBe(20_000);
    expect(ASSEMBLY.releaseGapMs).toBe(700);
    expect(gatherSpeedFactor()).toBe(1.6);
    for (const len of [131, 650, 1569, 1600, 1780]) {
      const path: [number, number][] = [
        [0, 0],
        [len, 0],
      ];
      const v = routeSpeed(path);
      expect(coolMotionMs(len, v, 1, gatherSpeedFactor())).toBeCloseTo(
        (len / (v * 1.6)) * 1000,
        6,
      );
      // 日常 / 散场：不带系数 = 1.0 倍。
      expect(coolMotionMs(len, v, 1, undefined)).toBeCloseTo(
        (len / v) * 1000,
        6,
      );
      // 全图任意路线聚集 ≤ 80/1.6 = 50 s。
      expect(coolMotionMs(len, v, 1, 1.6)).toBeLessThanOrEqual(50_000 + 1e-6);
    }
    expect(
      routeSpeed([
        [0, 0],
        [1000, 0],
      ]) * 1.6,
    ).toBe(32);
  });
});
