import { expect, it } from 'vitest';
import { loadData, discipleSchema } from '../src/sim/data';
import { eventDefinitions as defs } from '../src/sim/catalog';
import { eventDefinitionSchema } from '../src/sim/schema';
import {
  createWorld,
  isStoryCast,
  selectRoles,
  step,
  resolveEvent,
} from '../src/sim/world';
const fresh = () => createWorld(42, loadData());
const adv = () => structuredClone(defs.find((e) => e.id === 'EV_ADV_01')!);

it('六名开局主要角色在未完线时全部排除，所有涉及线结束才释放', () => {
  const w = fresh();
  expect(w.disciples.map((d) => d.storyLines)).toEqual([
    ['A'],
    ['A', 'C'],
    ['C'],
    ['B'],
    ['D'],
    ['B'],
  ]);
  expect(selectRoles(w, adv())).toBeNull();
  w.flags['done:EV_A3'] = 60;
  expect(isStoryCast(w, w.disciples[1])).toBe(true);
  expect(selectRoles(w, adv())).toEqual({ A: 'd0' });
  w.flags['done:EV_C3'] = 60;
  const onlyShen = adv();
  onlyShen.roles.A.conditions.push({
    op: 'field',
    key: 'id',
    value: 'd1',
    compare: 'eq',
  });
  expect(selectRoles(w, onlyShen)).toEqual({ A: 'd1' });
});

it('未结事件排除所有角色槽，结算后解除', () => {
  const w = fresh();
  w.flags['done:EV_A3'] = 0;
  step(w);
  const pending = w.events[0];
  pending.roles = { B: 'd0' };
  expect(selectRoles(w, adv())).toBeNull();
  w.events = [];
  expect(selectRoles(w, adv())).toEqual({ A: 'd0' });
});

it('实际招新不继承开局故事线，被连锁绑定后排除、终结后释放', () => {
  const w = fresh();
  w.buildings.find((b) => b.id === 'B_DORM')!.level = 2;
  const recruit = defs.find((e) => e.id === 'EV_SEC_01')!;
  w.events.push({
    id: 'recruit',
    definitionId: recruit.id,
    roles: {},
    hint: '',
    text: '',
    createdTick: 0,
    options: recruit.options.map((o) => o.label),
    choices: recruit.options,
    defaultOption: 0,
    kind: recruit.kind,
    chain: false,
    priority: 0,
  });
  expect(resolveEvent(w, 'recruit', 0)).toBe(true);
  const d = w.disciples.at(-1)!;
  expect(d.id).toBe('d6');
  expect(d.storyLines).toEqual([]);
  expect(isStoryCast(w, d)).toBe(false);
  d.ageSeasons = 80;
  const onlyNew = adv();
  onlyNew.roles.A.conditions.push({
    op: 'field',
    key: 'id',
    value: d.id,
    compare: 'eq',
  });
  expect(selectRoles(w, onlyNew)).toEqual({ A: d.id });
  w.flags['cast:A:A'] = d.id;
  expect(isStoryCast(w, d)).toBe(true);
  expect(selectRoles(w, onlyNew)).toBeNull();
  w.flags['done:EV_A3'] = 1;
  expect(isStoryCast(w, d)).toBe(false);
  expect(selectRoles(w, onlyNew)).toEqual({ A: d.id });
});

it('无多情角色释放未开启 C 线，临时忙碌或离山不能判线死亡；招新恢复可开性', () => {
  const w = fresh();
  const shen = w.disciples[1];
  w.flags['done:EV_A3'] = 0;
  w.disciples[2].state.awayUntil = 120;
  expect(isStoryCast(w, shen)).toBe(true);
  w.disciples[2].traits = ['T_WINE'];
  expect(isStoryCast(w, shen)).toBe(false);
  const newcomer = structuredClone(w.disciples[2]);
  newcomer.id = 'd6';
  newcomer.storyLines = [];
  newcomer.traits = ['T_AMOROUS'];
  w.disciples.push(newcomer);
  expect(isStoryCast(w, shen)).toBe(true);
});

it('离山后再绑定故事线不阻止原人回山，有未结事件则等待解除', () => {
  const w = fresh();
  w.tick = 91;
  const d = w.disciples[0];
  d.state.awayUntil = 91;
  w.flags['cast:A:A'] = d.id;
  const ret = defs.find((e) => e.id === 'EV_ADV_02')!;
  expect(selectRoles(w, ret)).toEqual({ A: d.id });
  w.events.push({
    id: 'busy',
    definitionId: 'busy',
    roles: { A: d.id },
    hint: '',
    text: '',
    createdTick: 91,
    options: [],
    choices: [],
    defaultOption: 0,
    kind: '社交',
    chain: false,
    priority: 0,
  });
  expect(selectRoles(w, ret)).toBeNull();
  step(w);
  expect(d.state.awayUntil).toBe(91);
  w.events = [];
  delete w.flags.lastEvent;
  while (w.tick < 121 && !w.events.some((e) => e.definitionId === ret.id))
    step(w);
  const e = w.events.find((e) => e.definitionId === ret.id)!;
  expect(e).toBeDefined();
  expect(e.roles.A).toBe(d.id);
  expect(resolveEvent(w, e.id, 0)).toBe(true);
  expect(d.state.awayUntil).toBe(0);
});

it('可选排除字段由 schema 校验，未配置事件照常选人，旧弟子字段默认空', () => {
  const def = adv();
  expect(eventDefinitionSchema.safeParse(def).success).toBe(true);
  expect(
    eventDefinitionSchema.safeParse({
      ...def,
      roles: { A: { conditions: [], excludeStoryCast: 'yes' } },
    }).success,
  ).toBe(false);
  delete def.roles.A.excludeStoryCast;
  expect(selectRoles(fresh(), def)).not.toBeNull();
  const { storyLines: _lines, ...legacy } = fresh().disciples[0];
  expect(_lines).toEqual(['A']);
  expect(discipleSchema.parse(legacy).storyLines).toEqual([]);
  expect(
    discipleSchema.safeParse({ ...legacy, storyLines: ['Z'] }).success,
  ).toBe(false);
});

it('方案 2 精力门槛为 60，59 不可出行、60 可出行', () => {
  const w = fresh();
  w.flags['done:EV_A3'] = 0;
  const d = w.disciples[0];
  d.needs.energy = 59;
  expect(selectRoles(w, adv())).toBeNull();
  d.needs.energy = 60;
  expect(selectRoles(w, adv())).toEqual({ A: d.id });
});
