import { describe, it, expect } from 'vitest';
import { loadData, validate } from '../src/sim/data';
import {
  eventDefinitions,
  buildingDefinitions,
  traitDefinitions,
} from '../src/sim/catalog';
import {
  eventsSchema,
  conditionSchema,
  traitsSchema,
  buildingsSchema,
} from '../src/sim/schema';
import {
  createWorld,
  advance,
  step,
  resolveEvent,
  defaultOption,
  matches,
  build,
  buildingOrder,
  setPolicy,
  traitEffect,
  worldSchema,
  optionAvailable,
} from '../src/sim/world';
import { applyOffline } from '../src/sim/offline';
const fresh = (seed = 42) => createWorld(seed, loadData());
function defaults(w: ReturnType<typeof fresh>) {
  for (const e of [...w.events]) {
    const i = defaultOption(w, e);
    if (i >= 0) resolveEvent(w, e.id, i);
  }
}
describe('M2 数据入口', () => {
  it('精确数量、默认项、三字姓名文案长度', () => {
    expect(traitDefinitions).toHaveLength(10);
    expect(buildingDefinitions).toHaveLength(5);
    expect(eventDefinitions).toHaveLength(20);
    for (const e of eventDefinitions) {
      expect(e.options.some((o) => o.default)).toBe(true);
      expect(
        e.hint.replaceAll('{A}', '甲乙丙').replaceAll('{B}', '丁戊己').length,
      ).toBeLessThanOrEqual(16);
      expect(
        e.text.replaceAll('{A}', '甲乙丙').replaceAll('{B}', '丁戊己').length,
      ).toBeLessThanOrEqual(40);
    }
  });
  it('拒绝数量、效果名、条件词和必填字段错误', () => {
    expect(() =>
      validate(traitsSchema, traitDefinitions.slice(1), 'data/traits.json'),
    ).toThrow(/data\/traits.json/);
    expect(
      buildingsSchema.safeParse([
        ...buildingDefinitions,
        buildingDefinitions[0],
      ]).success,
    ).toBe(false);
    const bad = structuredClone(eventDefinitions);
    bad[0].options.forEach((o) => (o.default = false));
    expect(() => validate(eventsSchema, bad, 'data/events.json')).toThrow(
      /options.*默认/,
    );
    expect(conditionSchema.safeParse({ op: 'resource' }).success).toBe(false);
    expect(conditionSchema.safeParse({ op: 'magic' }).success).toBe(false);
    const wrong = JSON.parse(JSON.stringify(eventDefinitions));
    wrong[0].options[0].effects[0].type = '随便成功';
    expect(eventsSchema.safeParse(wrong).success).toBe(false);
  });
  it('互斥特质拒绝入档', () => {
    const w = fresh();
    w.disciples[0].traits = ['T_DILIGENT', 'T_LAZY'];
    expect(worldSchema.safeParse(w).success).toBe(false);
  });
});
describe('条件解释器与结算', () => {
  it('条件命中与不命中，特质效果来自数据', () => {
    const w = fresh(),
      r = { A: 'd0', B: 'd1' };
    expect(matches(w, { op: 'trait', values: ['T_PROUD'] }, r)).toBe(true);
    expect(matches(w, { op: 'root', values: ['木'] }, r)).toBe(false);
    expect(matches(w, { op: 'building', key: 'B_GARDEN', value: 1 }, r)).toBe(
      false,
    );
    w.disciples[0].realm.xp = 150;
    expect(matches(w, { op: 'xpFull' }, r)).toBe(true);
    expect(traitEffect(w.disciples[1], 'xp')).toBe(1.2);
    expect(traitEffect(w.disciples[4], 'rest')).toBe(1.3);
  });
  it('建造解锁、成本原子性、土灵根工期与无人半速', () => {
    const w = fresh();
    w.flags.autoMaster = false;
    expect(build(w, 'B_ALCHEMY')).toBe(false);
    expect(w.resources.stone).toBe(80);
    expect(build(w, 'B_GARDEN')).toBe(true);
    expect(w.resources.stone).toBe(40);
    expect(build(w, 'B_GARDEN')).toBe(false);
    w.disciples.forEach((d) => {
      d.needs.energy = 0;
      d.state.behavior = '休息';
    });
    step(w);
    expect(w.buildings.find((b) => b.id === 'B_GARDEN')!.progress).toBe(0.5);
    const d = w.disciples[1];
    d.needs.energy = 90;
    d.state = {
      ...d.state,
      behavior: '做工',
      location: '工地:B_GARDEN',
      stepsLeft: 5,
    };
    step(w);
    expect(w.buildings.find((b) => b.id === 'B_GARDEN')!.progress).toBe(1.75);
    expect(buildingOrder(w, 'B_HALL').available).toBe(false);
  });
  it('固定剧本 A1/B1、保底、角色锁定及同人队列约束', () => {
    const w = fresh();
    for (let i = 0; i < 180; i++) {
      step(w);
      const ids = w.events.flatMap((e) => Object.values(e.roles));
      expect(new Set(ids).size).toBe(ids.length);
      defaults(w);
    }
    expect(w.flags['first:EV_A1']).toBeTypeOf('number');
    expect(w.flags['first:EV_B1']).toBeTypeOf('number');
    expect(w.flags['pity:EV_B1']).toBe(true);
    expect(w.flags['cast:A:A']).toBe('d0');
    expect(w.flags['cast:A:B']).toBe('d1');
  });
  it('成本不足拒绝，不修改世界；超时处理连锁默认', () => {
    const w = fresh();
    step(w);
    const e = w.events[0];
    expect(e.definitionId).toBe('EV_A1');
    const before = structuredClone(w);
    expect(resolveEvent(w, e.id, 99)).toBe(false);
    expect(w).toEqual(before);
    advance(w, 30);
    expect(w.flags['done:EV_A1']).toBeTypeOf('number');
    const def = eventDefinitions.find((d) => d.id === 'EV_B2')!;
    const pending = {
      ...e,
      choices: def.options,
      options: def.options.map((o) => o.label),
    };
    w.resources.pill = 0;
    expect(optionAvailable(w, pending, 0)).toBe(false);
  });
  it('百种子逐步资源边界与运行状态可校验', () => {
    for (let seed = 0; seed < 100; seed++) {
      const w = fresh(seed);
      for (let i = 0; i < 180; i++) {
        step(w);
        defaults(w);
        const scale = w.buildings.find((b) => b.id === 'B_HALL')?.level ?? 1;
        for (const k of ['stone', 'herb', 'pill'] as const) {
          expect(w.resources[k]).toBeGreaterThanOrEqual(0);
          expect(w.resources[k]).toBeLessThanOrEqual(w.capacity[k] * scale);
        }
      }
      expect(worldSchema.safeParse(w).success).toBe(true);
    }
  });
  it('同种子同决策逐步一致，存档接续一致', () => {
    const a = fresh(17),
      b = fresh(17);
    for (let i = 0; i < 180; i++) {
      if (i === 50) {
        setPolicy(a, 'd0', '专修');
        setPolicy(b, 'd0', '专修');
      }
      step(a);
      step(b);
      defaults(a);
      defaults(b);
      expect(a).toEqual(b);
    }
    expect(advance(structuredClone(a), 30)).toEqual(advance(b, 30));
  });
});
describe('离线节点保护', () => {
  it('连锁最多三个且保持原决策不自动通过，非连锁自动结算', () => {
    const w = fresh();
    step(w);
    const first = structuredClone(w.events[0]);
    const ages = w.disciples.map((d) => d.ageSeasons);
    const summary = applyOffline(w, 160, 123);
    expect(w.events.filter((e) => e.chain).length).toBeLessThanOrEqual(3);
    expect(w.events.find((e) => e.id === first.id)).toEqual(first);
    expect(w.flags['done:EV_A1']).toBeUndefined();
    expect(summary.hints.length).toBeLessThanOrEqual(10);
    expect(summary.relations).toBeInstanceOf(Array);
    for (let i = 0; i < 6; i++) {
      expect(w.disciples[i].ageSeasons - ages[i]).toBe(8);
      expect(w.disciples[i].remainingSeasons).toBeGreaterThanOrEqual(1);
    }
    expect(w.disciples.filter((d) => d.realm.major === '筑基')).toHaveLength(1);
  });
});

describe('事件效果注册表', () => {
  it('每个事件每条分支的可用选项均可结算并序列化', () => {
    for (const def of eventDefinitions)
      for (const choices of [
        def.options,
        ...def.branches.map((b) => b.options),
      ])
        for (let index = 0; index < choices.length; index++) {
          const w = fresh();
          w.resources = { stone: 350, herb: 100, pill: 19, reputation: 60 };
          if (choices[index].label === '暂缓') w.resources.pill = 0;
          const e = {
            id: 'test',
            definitionId: def.id,
            hint: def.hint,
            text: def.text,
            createdTick: 0,
            options: choices.map((o) => o.label),
            choices,
            defaultOption: 0,
            kind: def.kind,
            chain: !!def.chain,
            roles: { A: 'd0', B: 'd1' },
            priority: def.priority,
          };
          w.events = [e];
          expect(resolveEvent(w, e.id, index)).toBe(true);
          expect(worldSchema.safeParse(w).success).toBe(true);
        }
  });
});

it('坏效果参数和越界存档被拒绝', () => {
  const bad = structuredClone(eventDefinitions);
  bad[0].options[0].effects[0].value = '无法计算';
  expect(eventsSchema.safeParse(bad).success).toBe(false);
  const w = fresh();
  w.resources.stone = 401;
  expect(worldSchema.safeParse(w).success).toBe(false);
});
