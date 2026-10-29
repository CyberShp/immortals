import { afterEach, expect, it } from 'vitest';
import { eventDefinitions as defs } from '../src/sim/catalog';
import { eventDefinitionSchema } from '../src/sim/schema';
import { loadData } from '../src/sim/data';
import { createWorld, step, resolveEvent } from '../src/sim/world';

const original = [...defs];
afterEach(() => defs.splice(0, defs.length, ...original));
const definition = (id: string) =>
  structuredClone(original.find((e) => e.id === id)!);
function world(tick: number) {
  const w = createWorld(42, loadData());
  w.tick = tick;
  w.round = Math.floor(tick / 30);
  w.flags.autoMaster = false;
  for (const d of w.disciples) {
    d.storyLines = []; // Isolate timing from story-cast eligibility.
    d.state.behavior = '休息';
    d.state.stepsLeft = 100;
    d.needs.energy = 90;
  }
  return w;
}

it.each([
  ['EV_ADV_01', 3],
  ['EV_ADV_02', 4],
] as const)('%s 在上一轮末被拦截、目标轮首步可入队', (id, round) => {
  const def = definition(id);
  expect(def.trigger.earliestRound).toBe(round);
  expect(def.trigger.chance).toBe(id === 'EV_ADV_01' ? 0.06 : 1);
  def.trigger.chance = 1;
  defs.splice(0, defs.length, def);
  const last = (round - 1) * 30;
  const w = world(last - 1);
  // ADV_02 提前已满足回山条件，独立证明其显式门槛。
  if (id === 'EV_ADV_02') w.disciples[0].state.awayUntil = last;
  step(w);
  expect(w.tick).toBe(last);
  expect(Math.ceil(w.tick / 30)).toBe(round - 1);
  expect(w.events).toHaveLength(0);
  expect(w.flags[`first:${id}`]).toBeUndefined();
  step(w);
  expect(w.events[0]).toMatchObject({
    definitionId: id,
    createdTick: last + 1,
  });
  expect(w.flags[`first:${id}`]).toBe(last + 1);
  expect(Math.ceil(Number(w.flags[`first:${id}`]) / 30)).toBe(round);
});

it.each(['step', 'round'] as const)(
  '门槛前 %s 不消耗 RNG、不登记掷骰，其他事件结果相同',
  (cadence) => {
    const adv = definition('EV_ADV_01');
    adv.trigger.cadence = cadence;
    adv.trigger.chance = 1;
    const other = definition('EV_SEC_01');
    other.trigger.conditions = [];
    const a = world(59),
      b = structuredClone(a);
    defs.splice(0, defs.length, adv, other);
    step(a);
    defs.splice(0, defs.length, other);
    step(b);
    expect(a.events[0].definitionId).toBe(other.id);
    expect(a.rng).toEqual(b.rng);
    expect(a).toEqual(b);
    expect(
      Object.keys(a.flags).some((k) => k.startsWith('roll:EV_ADV_01:')),
    ).toBe(false);
    // 第 60/61 步的 w.round 均为 2；门槛前不能用掉该轮的首次机会。
    a.events = [];
    delete a.flags.lastEvent;
    defs.splice(0, defs.length, adv);
    step(a);
    expect(a.events[0].definitionId).toBe(adv.id);
    if (cadence === 'round') expect(a.flags['roll:EV_ADV_01:2']).toBe(true);
  },
);

it('第 61 步准行，离山满 30 步在第 91 步归来', () => {
  const adv = definition('EV_ADV_01');
  adv.trigger.chance = 1;
  defs.splice(0, defs.length, adv);
  const w = world(60);
  step(w);
  const event = w.events[0];
  expect(resolveEvent(w, event.id, 0)).toBe(true);
  expect(w.disciples.find((d) => d.id === event.roles.A)!.state.awayUntil).toBe(
    91,
  );
  defs.splice(0, defs.length, definition('EV_ADV_02'));
  while (w.tick < 90) step(w);
  expect(w.events).toHaveLength(0);
  step(w);
  expect(w.flags['first:EV_ADV_02']).toBe(91);
});

it('最早轮次可省略，指定时必须为正整数', () => {
  const def = definition('EV_ADV_01');
  delete def.trigger.earliestRound;
  expect(eventDefinitionSchema.safeParse(def).success).toBe(true);
  for (const value of [0, -1, 1.5, Infinity]) {
    def.trigger.earliestRound = value;
    expect(eventDefinitionSchema.safeParse(def).success).toBe(false);
  }
  def.trigger.earliestRound = 1;
  expect(eventDefinitionSchema.safeParse(def).success).toBe(true);
});
