import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG as C, configSchema } from '../src/sim/config';
import { loadData } from '../src/sim/data';
import { eventDefinitions as defs } from '../src/sim/catalog';
import {
  advance,
  build,
  createWorld,
  defaultOption,
  matches,
  optionCost,
  resolveEvent,
  rewardAmount,
  step,
  type World,
} from '../src/sim/world';
import { applyOffline } from '../src/sim/offline';
import { formatAge } from '../src/display/format';
const fresh = () => createWorld(42, loadData());
const def = (id: string) => defs.find((e) => e.id === id)!;
const trigger = (w: World, id: string, roles = { A: 'd2', B: 'd1' }) =>
  def(id).trigger.conditions.every((c) => matches(w, c, roles));
function pending(w: World, id: string, roles = { A: 'd2', B: 'd1' }) {
  const d = def(id);
  const e = {
    id: `${id}@${w.tick}`,
    definitionId: id,
    hint: d.hint,
    text: d.text,
    createdTick: w.tick,
    options: d.options.map((o) => o.label),
    choices: structuredClone(d.options),
    defaultOption: 0,
    kind: d.kind,
    chain: !!d.chain,
    roles,
    priority: d.priority,
  };
  w.events.push(e);
  return e;
}
function medit(w: World) {
  w.resources.reputation = 20;
  w.resources.herb = 20;
  expect(build(w, 'B_MEDIT')).toBe(true);
  const b = w.buildings.find((b) => b.id === 'B_MEDIT')!;
  b.level = 1;
  b.targetLevel = 0;
}
const originalTimeout = C.scheduler.autoResolveSteps;
const originalCost = C.costs.c3BlessStone;
afterEach(() => {
  C.scheduler.autoResolveSteps = originalTimeout;
  C.costs.c3BlessStone = originalCost;
});
describe('v1.1 条件边界', () => {
  it('B2 距 B1 满一轮且余寿不超过三轮', () => {
    const w = fresh(),
      roles = { A: 'd5', B: 'd3' };
    w.flags['done:EV_B1'] = 10;
    w.tick = 39;
    w.disciples[5].remainingSeasons = 3;
    expect(trigger(w, 'EV_B2', roles)).toBe(false);
    w.tick = 40;
    expect(trigger(w, 'EV_B2', roles)).toBe(true);
    w.disciples[5].remainingSeasons = 4;
    expect(trigger(w, 'EV_B2', roles)).toBe(false);
  });
  it('A3 必须距 A2 两轮', () => {
    const w = fresh();
    w.flags['done:EV_A2'] = 5;
    w.tick = 64;
    expect(trigger(w, 'EV_A3')).toBe(false);
    w.tick++;
    expect(trigger(w, 'EV_A3')).toBe(true);
  });
  it('C1 要求建筑和 B 打坐，允许 A 不社交、B 不独处，默认关系加二十', () => {
    const w = fresh();
    expect(trigger(w, 'EV_C1')).toBe(false);
    medit(w);
    expect(trigger(w, 'EV_C1')).toBe(true);
    w.disciples[1].state.behavior = '做工';
    expect(trigger(w, 'EV_C1')).toBe(false);
    w.disciples[1].state.behavior = '修炼';
    const e = pending(w, 'EV_C1');
    resolveEvent(w, e.id, defaultOption(w, e));
    expect(w.disciples[2].relations.d1.value).toBe(25);
    expect(def('EV_C1').pity).toBe(2);
  });
  it('C 线只取多情，无多情时实际调度不开 C1', () => {
    for (const id of ['EV_C1', 'EV_C2', 'EV_C3']) {
      const w = fresh();
      expect(
        def(id).roles.A.conditions.every((c) => matches(w, c, { A: 'd5' })),
      ).toBe(false);
      expect(
        def(id).roles.A.conditions.every((c) => matches(w, c, { A: 'd2' })),
      ).toBe(true);
    }
    const w = fresh();
    w.disciples[2].traits = ['T_WINE'];
    for (let i = 0; i < 180; i++) {
      step(w);
      for (const e of [...w.events]) resolveEvent(w, e.id, defaultOption(w, e));
    }
    expect(w.flags['first:EV_C1']).toBeUndefined();
  });
  it('C2 要求满一轮、关系二十与静修室；C3 要求 C2 和关系四十', () => {
    const w = fresh();
    w.tick = 30;
    w.flags['done:EV_C1'] = 0;
    w.disciples[2].relations.d1.value = 20;
    expect(trigger(w, 'EV_C2')).toBe(false);
    medit(w);
    expect(trigger(w, 'EV_C2')).toBe(true);
    w.tick = 29;
    expect(trigger(w, 'EV_C2')).toBe(false);
    w.tick = 30;
    w.disciples[2].relations.d1.value = 19;
    expect(trigger(w, 'EV_C2')).toBe(false);
    w.disciples[2].relations.d1.value = 40;
    expect(trigger(w, 'EV_C3')).toBe(false);
    w.flags['done:EV_C2'] = 30;
    expect(trigger(w, 'EV_C3')).toBe(true);
    w.disciples[2].relations.d1.value = 39;
    expect(trigger(w, 'EV_C3')).toBe(false);
  });
  it('默许立即加十，两次轮末各加十，之后停止', () => {
    const w = fresh();
    w.tick = 1;
    w.flags.autoMaster = false;
    const e = pending(w, 'EV_C2');
    resolveEvent(w, e.id, 0);
    expect(w.disciples[2].relations.d1.value).toBe(15);
    // 隔离自然社交和其他事件，但保留轮末回归。
    w.flags.lastEvent = 10000;
    w.disciples.forEach((d) => {
      d.state.awayUntil = 10000;
    });
    advance(w, 29);
    expect(w.disciples[2].relations.d1.value).toBe(24);
    advance(w, 30);
    expect(w.disciples[2].relations.d1.value).toBe(33);
    advance(w, 30);
    expect(w.disciples[2].relations.d1.value).toBe(32);
  });
  it('同修期间双方修为加成 10%，到期停止', () => {
    const a = fresh();
    a.flags.autoMaster = false;
    a.flags.lastEvent = 10000;
    a.disciples = a.disciples.filter((d) => ['d1', 'd2'].includes(d.id));
    a.disciples.forEach((d) => {
      d.state.stepsLeft = 100;
      d.realm.xp = 0;
    });
    const b = structuredClone(a);
    const e = pending(b, 'EV_C2');
    resolveEvent(b, e.id, 0);
    step(a);
    step(b);
    for (let i = 0; i < 2; i++)
      expect(b.disciples[i].realm.xp).toBeCloseTo(
        a.disciples[i].realm.xp * 1.1,
      );
    for (const w of [a, b]) {
      w.tick = 59;
      w.disciples.forEach((d) => {
        d.realm.xp = 0;
      });
    }
    step(a);
    step(b);
    expect(b.disciples.map((d) => d.realm.xp)).toEqual(
      a.disciples.map((d) => d.realm.xp),
    );
  });
  it('D1 劳作且精力至少四十，30% 与第二轮末保底；SEC_02 优先级三', () => {
    const w = fresh(),
      roles = { A: 'd4', B: 'd1' },
      d = w.disciples[4];
    d.state.behavior = '做工';
    d.needs.energy = 40;
    expect(trigger(w, 'EV_D1', roles)).toBe(true);
    d.needs.energy = 39;
    expect(trigger(w, 'EV_D1', roles)).toBe(false);
    d.needs.energy = 80;
    d.state.behavior = '修炼';
    expect(trigger(w, 'EV_D1', roles)).toBe(false);
    expect(def('EV_D1')).toMatchObject({
      pity: 2,
      trigger: { chance: 0.3, cadence: 'round' },
    });
    expect(def('EV_SEC_02').priority).toBe(3);
  });
});
describe('参数、支付和寿元', () => {
  it.each([10, 17])('超时参数 %i 步生效，前一步仍未结算', (timeout) => {
    C.scheduler.autoResolveSteps = timeout;
    const w = fresh();
    step(w);
    const e = w.events[0];
    advance(w, timeout - 1);
    expect(w.events.some((x) => x.id === e.id)).toBe(true);
    step(w);
    expect(w.flags[`done:${e.definitionId}`]).toBe(e.createdTick + timeout);
  });
  it.each([10, 23])('C3 成本 %i 灵石真实扣款；不足走退路且关系减十', (cost) => {
    C.costs.c3BlessStone = cost;
    const w = fresh();
    w.resources.stone = cost;
    const e = pending(w, 'EV_C3');
    expect(optionCost(e.choices[0])).toEqual({ stone: cost });
    expect(defaultOption(w, e)).toBe(0);
    resolveEvent(w, e.id, defaultOption(w, e));
    expect(w.resources.stone).toBe(0);
    expect(w.disciples[2].relations.d1.tags).toContain('道侣');
    const x = fresh();
    x.resources.stone = cost - 1;
    const f = pending(x, 'EV_C3');
    expect(defaultOption(x, f)).toBe(1);
    resolveEvent(x, f.id, defaultOption(x, f));
    expect(x.resources.stone).toBe(cost - 1);
    expect(x.disciples[2].relations.d1.value).toBe(-5);
    expect(x.flags['done:EV_C3']).toBeUndefined();
  });
  it('默认退路是第一个可支付选项，不限免费；筑基按丹药动态默认', () => {
    const w = fresh(),
      e = pending(w, 'EV_SEC_02');
    w.resources.stone = 10;
    e.choices[1].cost.stone = 5;
    expect(defaultOption(w, e)).toBe(1);
    resolveEvent(w, e.id, defaultOption(w, e));
    expect(w.resources.stone).toBe(5);
    const f = pending(w, 'EV_BRK_02');
    w.resources.pill = 3;
    expect(defaultOption(w, f)).toBe(0);
    w.resources.pill = 2;
    expect(defaultOption(w, f)).toBe(1);
  });
  it('配置拒绝负数、小数、零等待与重复姓名', () => {
    for (const n of [-1, 0, 1.5]) {
      const c = structuredClone(C);
      c.scheduler.autoResolveSteps = n;
      expect(configSchema.safeParse(c).success).toBe(false);
    }
    for (const n of [-1, 1.5]) {
      const c = structuredClone(C);
      c.costs.c3BlessStone = n;
      expect(configSchema.safeParse(c).success).toBe(false);
    }
    const c = structuredClone(C);
    c.names[1] = c.names[0];
    expect(configSchema.safeParse(c).success).toBe(false);
  });
  it('长老 714 季显示 178 岁、余寿六季；延寿不改年龄且增加寿元上限', () => {
    const w = fresh(),
      d = w.disciples[5];
    expect([d.ageSeasons, d.lifespanSeasons, d.remainingSeasons]).toEqual([
      714, 720, 6,
    ]);
    expect(formatAge(d.ageSeasons)).toBe('178 岁');
    expect(formatAge(103)).toBe('25 岁');
    w.resources.pill = 5;
    const e = pending(w, 'EV_B2', { A: 'd5', B: 'd3' });
    resolveEvent(w, e.id, 0);
    expect([d.ageSeasons, d.lifespanSeasons, d.remainingSeasons]).toEqual([
      714, 728, 14,
    ]);
  });
  it('奖励在入库时取整，常规劳作仍保留小数', () => {
    expect(rewardAmount('pill', 1.8)).toBe(1);
    expect(rewardAmount('stone', 1.5)).toBe(2);
    expect(rewardAmount('herb', 1.4)).toBe(1);
    const w = fresh();
    const e = pending(w, 'EV_WRK_01');
    e.choices[0].effects = [
      { type: 'resources', values: { pill: 1.8, stone: 1.5, herb: 1.4 } },
    ];
    resolveEvent(w, e.id, 0);
    expect(w.resources).toMatchObject({ pill: 4, stone: 82, herb: 1 });
    const x = fresh();
    x.disciples[0].root.elements = ['金'];
    x.disciples[0].traits = ['T_LUCKY'];
    x.rng.state = 0;
    const f = pending(x, 'EV_ADV_02', { A: 'd0', B: 'd1' });
    resolveEvent(x, f.id, 1);
    expect(x.resources.pill).toBe(4);
  });
});
it('招新姓名十二签不放回，存档接续仍不重名；年龄、性别、杂根与特质范围', () => {
  let w = fresh();
  const names: string[] = [],
    ages: number[] = [];
  const genders = new Set<string>(),
    roots = new Set<number>(),
    traits = new Set<number>();
  for (let i = 0; i < 240; i++) {
    w.disciples.forEach((d) => {
      d.remainingSeasons = 0;
    });
    const e = pending(w, 'EV_SEC_01');
    expect(resolveEvent(w, e.id, 0)).toBe(true);
    const d = w.disciples.at(-1)!;
    names.push(d.name);
    ages.push(d.ageSeasons);
    genders.add(d.gender);
    traits.add(d.traits.length);
    if (d.root.grade === '杂灵根') roots.add(d.root.elements.length);
    if (i === 5) w = JSON.parse(JSON.stringify(w));
  }
  for (let i = 0; i < names.length; i += 12)
    expect(new Set(names.slice(i, i + 12)).size).toBe(12);
  expect(new Set(w.disciples.map((d) => d.id)).size).toBe(w.disciples.length);
  expect(Math.min(...ages)).toBeGreaterThanOrEqual(56);
  expect(Math.max(...ages)).toBeLessThanOrEqual(103);
  expect(genders.size).toBe(2);
  expect([...roots].sort()).toEqual([4, 5]);
  expect([...traits].sort()).toEqual([1, 2]);
});
it('离线结束各层修为封顶，已有工程完工但不新开，保护仍在', () => {
  const w = fresh();
  expect(build(w, 'B_GARDEN')).toBe(true);
  w.disciples.slice(0, 3).forEach((d, i) => {
    d.realm = { major: '炼气', layer: i + 1, xp: 5000 };
    d.state.awayUntil = 10000;
  });
  const ages = w.disciples.map((d) => d.ageSeasons);
  const summary = applyOffline(w, 160, 123);
  expect(w.disciples.slice(0, 3).map((d) => d.realm.xp)).toEqual([
    100, 150, 200,
  ]);
  expect(w.buildings.find((b) => b.id === 'B_GARDEN')!.level).toBe(1);
  expect(w.buildings.some((b) => b.id === 'B_MEDIT')).toBe(false);
  expect(w.buildings.some((b) => b.targetLevel)).toBe(false);
  expect(w.events.filter((e) => e.chain).length).toBeLessThanOrEqual(3);
  w.disciples.forEach((d, i) => {
    expect(d.ageSeasons - ages[i]).toBe(8);
    expect(d.remainingSeasons).toBeGreaterThanOrEqual(1);
    expect(d.realm.xp).toBeLessThanOrEqual(C.xpThreshold[d.realm.layer - 1]);
    expect(
      summary.breakthroughs.filter((t) => t.startsWith(d.name)).length,
    ).toBeLessThanOrEqual(2);
  });
});

it('每轮首次满足只掷一次；保底免掷但仍遵守条件、间隔和同人唯一', () => {
  const original = [...defs],
    d1 = structuredClone(def('EV_D1'));
  d1.trigger.chance = 0;
  defs.splice(0, defs.length, d1);
  try {
    const w = fresh();
    w.flags.autoMaster = false;
    const d = w.disciples[4];
    const working = () => {
      d.state.behavior = '做工';
      d.state.location = '采石点';
      d.state.stepsLeft = 100;
      d.needs.energy = 90;
    };
    d.state.behavior = '修炼';
    d.state.stepsLeft = 100;
    step(w);
    expect(w.flags['roll:EV_D1:0']).toBeUndefined();
    working();
    step(w);
    expect(w.flags['roll:EV_D1:0']).toBe(false);
    d1.trigger.chance = 1;
    working();
    step(w);
    expect(w.events).toHaveLength(0);
    w.tick = 29;
    working();
    step(w);
    expect(w.events[0].definitionId).toBe('EV_D1');
    w.events = [];
    w.tick = 59;
    w.flags.lastEvent = 59;
    d1.trigger.chance = 0;
    working();
    step(w);
    expect(w.events).toHaveLength(0);
    w.flags.lastEvent = 0;
    d.state.behavior = '修炼';
    step(w);
    expect(w.events).toHaveLength(0);
    w.events.push({
      id: 'busy',
      definitionId: '',
      hint: '忙碌',
      text: '',
      createdTick: w.tick,
      options: ['等待'],
      choices: [],
      defaultOption: 0,
      kind: '社交',
      chain: false,
      roles: { A: 'd4' },
      priority: 0,
    });
    working();
    step(w);
    expect(w.events).toHaveLength(1);
    w.events = [];
    working();
    step(w);
    expect(w.events[0].definitionId).toBe('EV_D1');
    expect(w.flags['pity:EV_D1']).toBe(true);
  } finally {
    defs.splice(0, defs.length, ...original);
  }
});

it('冷却从结算按事件与主角计算；无主角按宗门，行为改变不取消结算', () => {
  const w = fresh();
  w.tick = 10;
  const e = pending(w, 'EV_ADV_01', { A: 'd0', B: 'd1' });
  w.tick = 40;
  w.disciples[0].state.behavior = '休息';
  expect(resolveEvent(w, e.id, 1)).toBe(true);
  expect(w.flags['cool:EV_ADV_01:d0']).toBe(40);
  expect(w.flags['cool:EV_ADV_01:d1']).toBeUndefined();
  const f = pending(w, 'EV_SEC_01');
  f.roles = {} as typeof f.roles;
  resolveEvent(w, f.id, 1);
  expect(w.flags['cool:EV_SEC_01:sect']).toBe(40);
  const original = [...defs],
    adv = structuredClone(def('EV_ADV_01'));
  adv.trigger.chance = 1;
  // 隔离触发条件，只测正式调度中的冷却键与边界。
  delete adv.trigger.earliestRound;
  adv.trigger.conditions = [];
  adv.roles = { A: { conditions: [] } };
  defs.splice(0, defs.length, adv);
  try {
    w.flags.autoMaster = false;
    w.disciples = w.disciples.slice(0, 1);
    step(w);
    expect(w.events).toHaveLength(0);
    const other = structuredClone(w.disciples[0]);
    other.id = 'new';
    w.disciples = [other];
    step(w);
    expect(w.events[0].roles.A).toBe('new');
    w.events = [];
    w.disciples[0].id = 'd0';
    w.flags.lastEvent = 0;
    w.tick = 98;
    step(w);
    expect(w.events).toHaveLength(0);
    step(w);
    expect(w.events[0].roles.A).toBe('d0');
  } finally {
    defs.splice(0, defs.length, ...original);
  }
});
