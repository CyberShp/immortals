import { z } from 'zod';
import { CONFIG as C } from './config';
import {
  buildingSchema,
  discipleSchema,
  resourcesSchema,
  type Disciple,
  type GameData,
} from './data';
import { makeRng, random } from './rng';
import {
  buildingDefinitions as buildings,
  eventDefinitions as definitions,
  traitDefinitions as traits,
} from './catalog';
import {
  optionSchema,
  type Condition,
  type Effect,
  type EventDefinition,
  type EventOption,
} from './schema';
const nat = z.number().int().nonnegative();
export const eventSchema = z.object({
  id: z.string(),
  hint: z.string(),
  text: z.string(),
  createdTick: nat,
  options: z.array(z.string()).min(1),
  defaultOption: nat,
  kind: z.string(),
  chain: z.boolean(),
  definitionId: z.string().default(''),
  roles: z.record(z.string(), z.string()).default({}),
  choices: z.array(optionSchema).default([]),
  priority: nat.default(0),
});
export const worldSchema = z
  .object({
    tick: nat,
    round: nat,
    season: z.enum(['春', '夏', '秋', '冬']),
    resources: resourcesSchema,
    capacity: resourcesSchema.omit({ reputation: true }),
    disciples: z.array(discipleSchema),
    buildings: z.array(buildingSchema),
    events: z.array(eventSchema).max(C.queueLimit),
    logs: z.array(z.string()).max(C.logLimit),
    rng: z.object({ seed: nat, state: nat, calls: nat }),
    flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  })
  .superRefine((w, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const scale = w.buildings.find((b) => b.id === 'B_HALL')?.level || 1;
    for (const key of ['stone', 'herb', 'pill'] as const)
      if (w.resources[key] > w.capacity[key] * scale)
        issue(['resources', key], '资源超过仓库上限');
    for (const key of ['disciples', 'buildings', 'events'] as const)
      if (new Set(w[key].map((x) => x.id)).size !== w[key].length)
        issue([key], '编号重复');
    w.buildings.forEach((b, i) => {
      if (!buildings.some((x) => x.id === b.id))
        issue(['buildings', i, 'id'], '未知建筑');
    });
    w.events.forEach((e, i) => {
      if (e.definitionId && !definitions.some((d) => d.id === e.definitionId))
        issue(['events', i, 'definitionId'], '未知事件');
      for (const id of Object.values(e.roles))
        if (!w.disciples.some((d) => d.id === id))
          issue(['events', i, 'roles'], '角色不存在');
    });
  });

export type World = z.infer<typeof worldSchema>;
type Roles = Record<string, string>;
type Pending = World['events'][number];
export interface StepContext {
  offline?: boolean;
  age?: boolean;
  breakthroughs?: Record<string, number>;
  onBreakthrough?: (text: string) => void;
  onFull?: () => void;
  onHint?: (text: string) => void;
}
const clamp = (v: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, v));
const living = (w: World) => w.disciples.filter((d) => d.remainingSeasons > 0);
const present = (w: World) => living(w).filter((d) => !d.state.awayUntil);
const byId = (w: World, id: string) => w.disciples.find((d) => d.id === id);
const bld = (w: World, id: string) => w.buildings.find((b) => b.id === id);
export const traitEffect = (d: Disciple, key: string, base = 1) =>
  d.traits.reduce(
    (v, id) => v * (traits.find((t) => t.id === id)?.effects[key] ?? 1),
    base,
  );
const bonus = (d: Disciple, key: string) =>
  d.traits.reduce(
    (v, id) => v + (traits.find((t) => t.id === id)?.effects[key] ?? 0),
    0,
  );
export function relationTier(v: number) {
  return v <= -60
    ? '仇怨'
    : v < -19
      ? '不睦'
      : v < 20
        ? '平常'
        : v < 60
          ? '交好'
          : '知己';
}
function relation(a: Disciple, b: Disciple) {
  return (a.relations[b.id] ??= { value: 0, tags: [] });
}
function changeRelation(a: Disciple, b: Disciple, n: number) {
  if (a.id === b.id) return;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ])
    relation(x, y).value = clamp(relation(x, y).value + n, -100, 100);
}
export function createWorld(seed: number, data: GameData): World {
  const w: World = {
    tick: 0,
    round: 0,
    season: '春',
    resources: { ...data.resources },
    capacity: { ...data.balance.capacity },
    disciples: structuredClone(data.disciples),
    buildings: structuredClone(data.buildings),
    events: [],
    logs: ['山门初开，六位弟子入册。'],
    rng: makeRng(seed),
    flags: { autoMaster: true },
  };
  w.disciples.forEach(updateStage);
  return w;
}
export function log(w: World, text: string) {
  w.logs.push(`第${Math.max(1, Math.ceil(w.tick / 30))}季 · ${text}`);
  w.logs = w.logs.slice(-C.logLimit);
}
export function updateStage(d: Disciple) {
  d.stage =
    d.remainingSeasons === 0
      ? '坐化'
      : d.remainingSeasons <= 8 ||
          d.ageSeasons >= d.lifespanSeasons * C.elderlyRatio
        ? '迟暮'
        : d.ageSeasons < C.youthYears * 4
          ? '少年'
          : d.ageSeasons < C.adultYears * 4
            ? '青年'
            : '壮年';
}
function compare(a: unknown, b: unknown, op = 'gte') {
  if (op === 'eq') return a === b;
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  return op === 'lt'
    ? a < b
    : op === 'lte'
      ? a <= b
      : op === 'gt'
        ? a > b
        : a >= b;
}
function path(object: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (o, k) =>
        o && typeof o === 'object'
          ? (o as Record<string, unknown>)[k]
          : undefined,
      object,
    );
}
export function matches(
  w: World,
  c: Condition,
  roles: Roles = {},
  subject?: Disciple,
): boolean {
  const a = subject ?? byId(w, roles[c.who ?? 'A']),
    b = byId(w, roles.B),
    v = c.value,
    key = c.key ?? '';
  switch (c.op) {
    case 'any':
      return c.conditions!.some((x) => matches(w, x, roles, subject));
    case 'all':
      return c.conditions!.every((x) => matches(w, x, roles, subject));
    case 'trait':
      return !!a && c.values!.some((t) => a.traits.includes(t));
    case 'root':
      return (
        !!a && c.values!.some((t) => (a.root.elements as string[]).includes(t))
      );
    case 'field':
      return !!a && compare(path(a, key) ?? 0, v, c.compare);
    case 'xpFull':
      return !!a && a.realm.xp >= C.xpThreshold[a.realm.layer - 1];
    case 'resource':
      return compare(
        w.resources[key as keyof World['resources']],
        v,
        c.compare,
      );
    case 'building':
      return compare(bld(w, key)?.level ?? 0, v, c.compare);
    case 'relation':
      return !!a && !!b && compare(relation(a, b).value, v, c.compare);
    case 'tag':
      return !!a && !!b && relation(a, b).tags.includes(key);
    case 'completed':
      return (
        typeof w.flags[`done:${key}`] === 'number' &&
        w.tick - Number(w.flags[`done:${key}`]) >= Number(v ?? 0) * 30
      );
    case 'notCompleted':
      return w.flags[`done:${key}`] === undefined;
    case 'time':
      return key === 'night'
        ? w.tick % 30 >= C.scheduler.daySteps
        : w.tick % 30 < C.scheduler.daySteps;
    case 'sameLocation':
      return (
        !!a &&
        !!b &&
        a.state.location === b.state.location &&
        (!c.values || c.values.includes(a.state.location))
      );
    case 'population':
      return present(w).length >= Number(v);
    case 'vacancy':
      return living(w).length < ((bld(w, 'B_DORM')?.level ?? 1) === 2 ? 9 : 6);
    case 'healthy':
      return !!a && a.state.injuredUntil <= w.tick;
    case 'returned':
      return !!a && a.state.awayUntil > 0 && a.state.awayUntil <= w.tick;
    case 'signal':
      return !!a && a.flags[key] === w.tick;
    case 'alone':
      return (
        !!a &&
        !present(w).some(
          (d) =>
            d.id !== a.id &&
            d.state.location === a.state.location &&
            d.state.behavior === '修炼',
        )
      );
  }
}
const all = (w: World, cs: Condition[], r: Roles = {}, d?: Disciple) =>
  cs.every((c) => matches(w, c, r, d));
export function costText(cost: EventOption['cost']) {
  return (
    Object.entries(cost)
      .map(
        ([k, v]) =>
          `${({ stone: '灵石', herb: '灵草', pill: '丹药' } as Record<string, string>)[k]} ${v}`,
      )
      .join('、') || '无消耗'
  );
}
function afford(w: World, cost: EventOption['cost']) {
  return Object.entries(cost).every(
    ([k, v]) => w.resources[k as keyof typeof cost] >= v!,
  );
}
function pay(w: World, cost: EventOption['cost']) {
  for (const [k, v] of Object.entries(cost))
    w.resources[k as keyof typeof cost] -= v!;
}
export function optionAvailable(w: World, e: Pending, index: number) {
  const o = e.choices[index];
  return !!o && afford(w, o.cost) && all(w, o.conditions, e.roles);
}
export function defaultOption(w: World, e: Pending) {
  return e.choices.findIndex((o, i) => o.default && optionAvailable(w, e, i));
}
export function setPolicy(w: World, id: string, policy: Disciple['policy']) {
  if (!['均衡', '专修', '勤工'].includes(policy)) throw new Error('未知方针');
  const d = byId(w, id);
  if (!d) throw new Error('弟子不存在');
  d.policy = policy;
  d.state.stepsLeft = 0;
}
export function buildingOrder(w: World, id: string) {
  const def = buildings.find((b) => b.id === id);
  if (!def) return { available: false, reason: '未知建筑', cost: {} };
  const b = bld(w, id);
  const cost = { ...def.cost };
  if (id === 'B_HALL')
    cost.stone = Math.max(
      0,
      (cost.stone ?? 0) - Number(w.flags.hallDiscount ?? 0),
    );
  const reason = b?.targetLevel
    ? '正在建造'
    : (b?.level ?? 0) >= def.maxLevel
      ? '已达最高等级'
      : !all(w, def.unlock)
        ? '未满足解锁条件'
        : !afford(w, cost)
          ? '资源不足'
          : '';
  return { available: !reason, reason, cost };
}
export function build(w: World, id: string) {
  const order = buildingOrder(w, id);
  if (!order.available) return false;
  const def = buildings.find((b) => b.id === id)!;
  pay(w, order.cost);
  let b = bld(w, id);
  if (!b) {
    b = {
      id,
      name: def.name,
      level: 0,
      x: def.slot[0],
      y: def.slot[1],
      progress: 0,
      targetLevel: 0,
      builtTick: 0,
    };
    w.buildings.push(b);
  }
  b.targetLevel = b.level + 1;
  b.progress = 0;
  log(w, `${b.name}开工`);
  return true;
}
export const upgrade = build;
function pick<T>(w: World, items: T[]): T {
  return items[Math.floor(random(w.rng) * items.length)];
}
function selectRoles(w: World, def: EventDefinition): Roles | null {
  const busy = new Set(w.events.flatMap((e) => Object.values(e.roles)));
  const slots = Object.entries(def.roles);
  const candidates: { roles: Roles; weight: number }[] = [];
  function visit(index: number, roles: Roles, weight: number) {
    if (index === slots.length) {
      if (all(w, def.trigger.conditions, roles))
        candidates.push({ roles, weight });
      return;
    }
    const [slot, spec] = slots[index],
      bound = w.flags[`cast:${def.chain}:${slot}`];
    let pool = w.disciples.filter(
      (d) =>
        (!bound || d.id === bound) &&
        !busy.has(d.id) &&
        !Object.values(roles).includes(d.id) &&
        (spec.allowDead || d.remainingSeasons > 0) &&
        (spec.allowAway || !d.state.awayUntil) &&
        (bound || all(w, spec.conditions, { ...roles, [slot]: d.id }, d)),
    );
    if (spec.select === 'highestRelation' && roles.A && pool.length) {
      const a = byId(w, roles.A)!;
      const top = Math.max(...pool.map((d) => relation(a, d).value));
      pool = pool.filter((d) => relation(a, d).value === top);
    }
    for (const d of pool)
      visit(
        index + 1,
        { ...roles, [slot]: d.id },
        weight *
          (spec.weights ?? []).reduce(
            (v, x) => v * (all(w, x.conditions, roles, d) ? x.value : 1),
            1,
          ),
      );
  }
  visit(0, {}, 1);
  if (!candidates.length) return null;
  let roll = random(w.rng) * candidates.reduce((n, c) => n + c.weight, 0);
  return (
    candidates.find((c) => (roll -= c.weight) < 0)?.roles ??
    candidates.at(-1)!.roles
  );
}
export function substitute(w: World, text: string, roles: Roles) {
  return text.replace(
    /\{([A-Z])\}/g,
    (_, k) => byId(w, roles[k])?.name ?? '门人',
  );
}
function schedule(w: World, ctx: StepContext) {
  if (w.tick - Number(w.flags.lastEvent ?? -6) < C.scheduler.interval) return;

  const candidates: { def: EventDefinition; roles: Roles; pity: boolean }[] =
    [];
  for (const def of definitions) {
    if (
      ctx.offline &&
      def.chain &&
      w.events.filter((e) => e.chain).length >= C.offlineQueueLimit
    )
      continue;
    if (w.events.some((e) => e.definitionId === def.id)) continue;
    if (def.chain && w.flags[`done:${def.id}`] !== undefined) continue;
    if (
      def.chain &&
      def.step > 1 &&
      w.flags[`done:EV_${def.chain}${def.step - 1}`] === undefined
    )
      continue;
    if (ctx.offline && (def.id === 'EV_BRK_02' || def.id === 'EV_B3')) continue;
    const roles = selectRoles(w, def);
    if (!roles || !all(w, def.trigger.conditions, roles)) continue;
    const a = byId(w, roles.A);
    if (
      def.kind === '突破' &&
      a &&
      (a.state.injuredUntil > w.tick ||
        (ctx.offline && (ctx.breakthroughs?.[a.id] ?? 0) >= 2))
    )
      continue;
    const cd = `cool:${def.id}:${roles.A ?? 'sect'}`;
    if (w.tick - Number(w.flags[cd] ?? -10000) < def.cooldown * 30) continue;
    const pity = !!def.pity && w.tick >= def.pity * 30;
    if (!pity && def.trigger.cadence === 'round') {
      const key = `roll:${def.id}:${w.round}`;
      if (w.flags[key] !== undefined) {
        if (!w.flags[key]) continue;
      } else {
        w.flags[key] = random(w.rng) < def.trigger.chance;
        if (!w.flags[key]) continue;
      }
    } else if (!pity && random(w.rng) >= def.trigger.chance) continue;
    candidates.push({ def, roles, pity });
  }
  candidates.sort(
    (a, b) =>
      Number(b.pity) - Number(a.pity) || b.def.priority - a.def.priority,
  );
  const first = candidates[0];
  if (!first) return;
  const pool = candidates.filter(
    (c) => c.pity === first.pity && c.def.priority === first.def.priority,
  );
  const weights = pool.map((c) => {
    const a = byId(w, c.roles.A),
      b = byId(w, c.roles.B);
    let weight = 1;
    if (a && c.def.kind === '情缘') weight *= traitEffect(a, 'romanceWeight');
    if (a && c.def.kind === '争执') {
      weight *= traitEffect(a, 'conflictWeight') * (a.needs.mood < 30 ? 2 : 1);
      if (b) {
        const r = relation(a, b);
        weight *= r.value <= -60 ? 3 : 1;
        weight *= r.tags.includes('宿敌') ? 2 : 1;
      }
      if (
        present(w).some(
          (d) =>
            d.id !== a.id &&
            d.state.location === a.state.location &&
            d.traits.includes('T_KIND'),
        )
      )
        weight *= 0.5;
    }
    if (a && c.def.id === 'EV_D2') weight *= Number(a.flags.D2Weight ?? 1);
    return weight;
  });
  let draw = random(w.rng) * weights.reduce((a, b) => a + b, 0);
  const candidate =
    pool[pool.findIndex((_, i) => (draw -= weights[i]) < 0)] ?? first;
  const { def, roles, pity } = candidate;
  if (w.events.length >= C.queueLimit) {
    const disposable = w.events
      .filter((e) => !e.chain)
      .sort((a, b) => a.priority - b.priority)[0];
    if (!disposable) return;
    w.events = w.events.filter((e) => e !== disposable);
    log(w, `${disposable.hint}（队列溢出）`);
  }
  const branch = def.branches.find((b) => all(w, b.conditions, roles));
  const choices = structuredClone(branch?.options ?? def.options);
  const event: Pending = {
    id: `${def.id}@${w.tick}`,
    definitionId: def.id,
    hint: substitute(w, def.hint, roles),
    text: substitute(w, branch?.text ?? def.text, roles),
    createdTick: w.tick,
    options: choices.map((o) => substitute(w, o.label, roles)),
    choices,
    defaultOption: 0,
    kind: def.kind,
    chain: !!def.chain,
    roles,
    priority: def.priority,
  };
  event.defaultOption = Math.max(0, defaultOption(w, event));
  w.events.push(event);
  w.flags.lastEvent = w.tick;
  w.flags[`first:${def.id}`] ??= w.tick;
  if (pity) w.flags[`pity:${def.id}`] = true;
  if (def.chain)
    for (const [slot, id] of Object.entries(roles))
      w.flags[`cast:${def.chain}:${slot}`] = id;
  log(w, event.hint);
  ctx.onHint?.(event.hint);
}
function breakthrough(
  w: World,
  d: Disciple,
  major: boolean,
  extra: number,
  ctx: StepContext,
) {
  if (
    d.realm.major === '筑基' ||
    (ctx.offline && (major || (ctx.breakthroughs?.[d.id] ?? 0) >= 2))
  )
    return;
  const chance = Math.min(
    major ? C.majorChanceCap : C.chanceCap,
    (major ? C.majorBase : C.breakthroughBase) +
      C.rootChance[d.root.grade] +
      bonus(d, 'breakthrough') +
      (d.needs.mood >= C.goodMood ? C.moodBonus : 0) +
      extra,
  );
  if (random(w.rng) < chance) {
    d.realm.xp = Math.max(0, d.realm.xp - C.xpThreshold[d.realm.layer - 1]);
    if (major) {
      d.realm.major = '筑基';
      d.realm.layer = 1;
      d.remainingSeasons += C.lifespan.筑基 - d.lifespanSeasons;
      d.lifespanSeasons = C.lifespan.筑基;
      present(w).forEach((x) => (x.needs.mood = clamp(x.needs.mood + 10)));
    } else d.realm.layer++;
    w.resources.reputation += major ? 15 : 3;
    d.flags.flash = w.tick + 1;
    if (ctx.breakthroughs)
      ctx.breakthroughs[d.id] = (ctx.breakthroughs[d.id] ?? 0) + 1;
    const text = `${d.name}突破至${d.realm.major}${d.realm.layer}层`;
    log(w, text);
    ctx.onBreakthrough?.(text);
    for (const other of living(w))
      if (other.relations[d.id]?.tags.includes('道侣'))
        other.needs.mood = clamp(other.needs.mood + 20);
  } else {
    d.realm.xp = major ? C.xpThreshold[2] * 0.5 : d.realm.xp * 0.7;
    d.needs.mood = clamp(d.needs.mood - 20);
    d.state.injuredUntil = w.tick + (major ? 60 : 30);
    log(w, `${d.name}冲关未成，静养。`);
  }
}
function recruit(w: World, mood = 0) {
  if (!matches(w, { op: 'vacancy' })) {
    w.resources.reputation += 2;
    return;
  }
  const grades = Object.keys(C.rootXp) as Disciple['root']['grade'][];
  let roll = random(w.rng) * 100;
  const gi = C.rootWeights.findIndex((v) => (roll -= v) < 0);
  const grade = grades[gi];
  const elements: Disciple['root']['elements'] = [];
  const pool: Disciple['root']['elements'] = ['金', '木', '水', '火', '土'];
  const count =
    C.rootElements[gi] + (gi === 3 ? Math.floor(random(w.rng) * 2) : 0);
  while (elements.length < count) {
    const e = pick(w, pool);
    if (!elements.includes(e)) elements.push(e);
  }
  const ts = [pick(w, traits).id];
  if (random(w.rng) < 0.5)
    ts.push(
      pick(
        w,
        traits.filter(
          (t) => !ts.includes(t.id) && !t.exclusive.includes(ts[0]),
        ),
      ).id,
    );
  const d = structuredClone(w.disciples[0]);
  d.id = `d${w.disciples.length}`;
  d.name = pick(w, C.names);
  d.gender = random(w.rng) < 0.5 ? '男' : '女';
  d.ageSeasons = 56 + Math.floor(random(w.rng) * 48);
  d.lifespanSeasons = 400;
  d.remainingSeasons = 400 - d.ageSeasons;
  d.root = { grade, elements };
  d.realm = { major: '炼气', layer: 1, xp: 0 };
  d.traits = ts;
  d.needs = { energy: 90, mood: clamp(75 + mood), drive: 55 };
  d.relations = {};
  d.flags = {};
  d.policy = '均衡';
  d.state = {
    behavior: '修炼',
    location: '空地',
    stepsLeft: 0,
    injuredUntil: 0,
    awayUntil: 0,
  };
  d.look = {
    body: d.gender,
    hair: '束发',
    trim: elements[0],
    accessory: ts[0],
  };
  updateStage(d);
  w.disciples.push(d);
  log(w, `${d.name}拜入山门。`);
}
type EffectContext = {
  w: World;
  e: Pending;
  a: Disciple;
  b: Disciple;
  targets: Disciple[];
  ctx: StepContext;
};
const handlers: Record<Effect['type'], (f: Effect, c: EffectContext) => void> =
  {
    resources: (f, { w }) => {
      for (const [k, v] of Object.entries(f.values ?? {}))
        w.resources[k as keyof World['resources']] += v;
    },
    need: (f, { targets }) =>
      targets.forEach((d) => {
        const k = f.key as keyof Disciple['needs'];
        d.needs[k] = clamp(d.needs[k] + Number(f.value));
      }),
    xp: (f, { targets }) =>
      targets.forEach((d) => (d.realm.xp += Number(f.value))),
    relation: (f, { a, b }) => changeRelation(a, b, Number(f.value)),
    flag: (f, { targets }) =>
      targets.forEach((d) => (d.flags[f.key!] = f.value!)),
    breakthrough: (f, { w, a, ctx }) =>
      breakthrough(w, a, false, Number(f.value), ctx),
    foundation: (f, { w, a, ctx }) =>
      breakthrough(w, a, true, Number(f.value), ctx),
    wait: () => {},
    coworkRelation: (f, { w, a }) =>
      present(w)
        .filter((d) => d.state.location === a.state.location)
        .forEach((d) => changeRelation(a, d, Number(f.value))),
    stopAlchemy: (f, { w }) => {
      w.flags.alchemyStop = w.tick + Number(f.value);
    },
    depart: (f, { w, a }) => {
      a.state.awayUntil = w.tick + Number(f.value);
      a.state.behavior = '历练';
      a.state.location = '山外';
    },
    adventure: (_, { w, a }) => {
      const r = random(w.rng),
        lucky = 0.25 + bonus(a, 'lucky'),
        injury = 0.15 + bonus(a, 'injury');
      const multi = a.root.elements.includes('金') ? 1.2 : 1;
      if (r < lucky) {
        w.resources.stone += 60 * multi;
        w.resources.pill += multi;
        w.resources.reputation += 5;
      } else if (r >= 1 - injury) {
        w.resources.stone += 10 * multi;
        a.state.injuredUntil = w.tick + 60;
      } else {
        w.resources.stone += 30 * multi;
        w.resources.herb += 15 * multi;
      }
      a.realm.xp += bonus(a, 'adventureXp');
      a.state.awayUntil = 0;
      a.state.stepsLeft = 0;
      a.state.behavior = '休息';
      a.state.location = '居舍';
    },
    recruit: (_, { w }) => recruit(w),
    recruitLater: (f, { w }) => {
      w.flags.recruitAt = w.tick + Number(f.value);
    },
    report: (_, { w }) => {
      w.flags.storyReport = true;
    },
    mediate: (_, { w, a, b }) => {
      const kind = present(w).find((d) => d.traits.includes('T_KIND'));
      if (kind) {
        changeRelation(kind, a, 5);
        changeRelation(kind, b, 5);
      } else changeRelation(a, b, -5);
    },
    duel: (_, { w, a, b }) => {
      const rank = (d: Disciple) =>
        (d.realm.major === '筑基' ? 1000 : 0) +
        d.realm.layer * 200 +
        d.realm.xp;
      const loser = rank(a) >= rank(b) ? b : a;
      loser.needs.mood = clamp(loser.needs.mood - 15);
      w.resources.reputation += 5;
      a.realm.xp += 30;
      b.realm.xp += 30;
      changeRelation(a, b, 15);
    },
    tag: (f, { a, b }) => {
      for (const [x, y] of [
        [a, b],
        [b, a],
      ])
        if (!relation(x, y).tags.includes(f.key!))
          relation(x, y).tags.push(f.key!);
    },
    lifespan: (f, { a }) => {
      if (a.remainingSeasons > 0) a.remainingSeasons += Number(f.value);
    },
    concern: (_, { a, b }) => {
      if (relation(a, b).value >= 40) b.needs.mood = clamp(b.needs.mood - 5);
    },
    remaining: (f, { a }) => {
      a.remainingSeasons = Number(f.value);
    },
    legacy: (_, { a }) => {
      a.flags.legacy = true;
    },
    inherit: (_, { a, b }) => {
      if (
        b.traits.length < 2 &&
        !b.traits.includes(a.traits[0]) &&
        !traits
          .find((t) => t.id === a.traits[0])!
          .exclusive.some((t) => b.traits.includes(t))
      )
        b.traits.push(a.traits[0]);
    },
    studyTogether: (f, { w, a, b }) => {
      for (const [x, y] of [
        [a, b],
        [b, a],
      ]) {
        x.flags.studyUntil = w.tick + Number(f.value) * 30;
        x.flags.studyPartner = y.id;
      }
    },
    studyApart: (_, { w, b }) => {
      b.flags.apartUntil = w.tick + 30;
    },
    retry: (_, { w, e }) => {
      w.flags[`retry:${e.definitionId}`] =
        Number(w.flags[`retry:${e.definitionId}`] ?? 0) + 1;
    },
    treasure: (f, { w, a }) => {
      w.resources.stone += Number(f.value) * traitEffect(a, 'treasure');
    },
    motivation: (f, { w, a }) => {
      a.flags.motivationUntil = w.tick + Number(f.value) * 30;
    },
    hallDiscount: (f, { w }) => {
      w.flags.hallDiscount = Number(f.value);
    },
  };
export function resolveEvent(
  w: World,
  id: string,
  optionIndex: number,
  ctx: StepContext = {},
) {
  const e = w.events.find((e) => e.id === id);
  if (!e) return false;
  if (!e.definitionId) {
    w.events = w.events.filter((x) => x !== e);
    return true;
  }
  if (!optionAvailable(w, e, optionIndex)) return false;
  if (ctx.offline && e.chain) return false;
  const option = e.choices[optionIndex];
  const a = byId(w, e.roles.A)!,
    b = byId(w, e.roles.B)!;
  if (
    ctx.offline &&
    option.effects.some(
      (f) =>
        f.type === 'foundation' ||
        (f.type === 'breakthrough' && (ctx.breakthroughs?.[a.id] ?? 0) >= 2),
    )
  )
    return false;
  pay(w, option.cost);
  for (const f of option.effects) {
    const targets =
      f.target === 'all'
        ? living(w)
        : f.target === 'both'
          ? [a, b]
          : [f.target === 'B' ? b : a];
    handlers[f.type](f, { w, e, a, b, targets: targets.filter(Boolean), ctx });
  }
  w.flags[`done:${e.definitionId}`] = w.tick;
  w.flags[`cool:${e.definitionId}:${e.roles.A ?? 'sect'}`] = w.tick;
  if (
    option.effects.some((f) => f.type === 'retry') &&
    Number(w.flags[`retry:${e.definitionId}`]) <= 1
  )
    delete w.flags[`done:${e.definitionId}`];
  w.flags.resolved = Number(w.flags.resolved ?? 0) + 1;
  log(w, `${e.hint}：${e.options[optionIndex]}`);
  ctx.onHint?.(e.hint);
  w.events = w.events.filter((x) => x !== e);
  w.disciples.forEach(updateStage);
  capResources(w, ctx.onFull);
  return true;
}
function jobs(w: World, d: Disciple) {
  const slots: { location: string; capacity: number; priority: number }[] = [];
  const next = C.autoBuild.find(
    (o) =>
      (bld(w, o.id)?.level ?? 0) <
      buildings.find((b) => b.id === o.id)!.maxLevel,
  );
  const reserve =
    w.flags.autoMaster !== false &&
    C.jobs.reserveConstruction &&
    next &&
    !bld(w, next.id)?.targetLevel
      ? buildingOrder(w, next.id).cost
      : {};
  for (const b of w.buildings) {
    const def = buildings.find((x) => x.id === b.id)!;
    if (b.targetLevel)
      slots.push({
        location: `工地:${b.id}`,
        capacity: 1,
        priority: C.jobs.constructionPriority,
      });
    if (!b.level) continue;
    if (b.id === 'B_HALL')
      slots.push({
        location: '采石点',
        capacity: def.capacity,
        priority:
          w.resources.stone < (reserve.stone ?? 0)
            ? C.jobs.reservePriority
            : C.jobs.stonePriority,
      });
    if (b.id === 'B_GARDEN')
      slots.push({
        location: '药圃',
        capacity: def.capacity,
        priority:
          w.resources.herb < (reserve.herb ?? 0)
            ? C.jobs.reservePriority
            : d.root.elements.includes('木')
              ? C.jobs.woodGardenPriority
              : C.jobs.gardenPriority,
      });
    if (
      b.id === 'B_ALCHEMY' &&
      w.resources.herb >= def.output.herbCost &&
      w.resources.stone >= def.output.stoneCost + (reserve.stone ?? 0) &&
      Number(w.flags.alchemyStop ?? 0) <= w.tick
    )
      slots.push({
        location: '炼丹房',
        capacity: 1,
        priority: d.root.elements.includes('火')
          ? C.jobs.fireAlchemyPriority
          : C.jobs.alchemyPriority,
      });
  }
  return slots
    .map((s) => ({
      ...s,
      capacity:
        s.capacity -
        present(w).filter(
          (x) =>
            x.id !== d.id &&
            x.state.behavior === '做工' &&
            x.state.location === s.location &&
            x.state.stepsLeft > 0,
        ).length,
    }))
    .filter((s) => s.capacity > 0)
    .sort((a, b) => b.priority - a.priority);
}
function choose(w: World, d: Disciple) {
  if (
    d.needs.energy < 30 ||
    (d.state.behavior === '休息' && d.needs.energy < 80)
  ) {
    d.state.behavior = '休息';
    d.state.location = '居舍';
    d.state.stepsLeft = 0;
    return;
  }
  if (d.state.stepsLeft > 0) return;
  const available = jobs(w, d);
  const scores: { behavior: Disciple['state']['behavior']; score: number }[] = [
    {
      behavior: '修炼',
      score:
        (100 - d.needs.drive) *
        (d.policy === '专修' ? C.policyMultiplier : 1) *
        (d.needs.drive < C.restBelow ? C.lowDriveMultiplier : 1) *
        traitEffect(d, 'xp'),
    },
  ];
  if (d.state.injuredUntil <= w.tick) {
    if (available.length && !d.flags.静养)
      scores.push({
        behavior: '做工',
        score:
          (40 + available.reduce((n, j) => n + j.capacity, 0) * 10) *
          (d.policy === '勤工' ? C.policyMultiplier : 1) *
          traitEffect(d, 'yield'),
      });
    scores.push({
      behavior: '社交',
      score: (100 - d.needs.mood) * traitEffect(d, 'socialScore'),
    });
  }
  const best = Math.max(...scores.map((s) => s.score));
  d.state.behavior = pick(
    w,
    scores.filter((s) => s.score === best),
  ).behavior;
  d.state.stepsLeft =
    d.state.behavior === '社交'
      ? 3 + Math.floor(random(w.rng) * 3)
      : 4 + Math.floor(random(w.rng) * 5);
  d.state.location =
    d.state.behavior === '修炼'
      ? bld(w, 'B_MEDIT')?.level &&
        present(w).filter(
          (x) =>
            x.id !== d.id &&
            x.state.behavior === '修炼' &&
            x.state.location === '静修室',
        ).length < 3
        ? '静修室'
        : '空地'
      : d.state.behavior === '社交'
        ? '松下'
        : (available[0]?.location ?? '采石点');
  d.flags.walkUntil = w.tick + 1;
}
function socialCoefficient(a: Disciple, b: Disciple) {
  let value = 1;
  for (const id of a.traits) {
    const t = traits.find((t) => t.id === id)!;
    let factor = t.relations['*'] ?? 1;
    for (const other of b.traits)
      if (t.relations[other] !== undefined) factor = t.relations[other];
    if (
      id === 'T_AMOROUS' &&
      b.traits.includes('T_ALOOF') &&
      relation(a, b).value >= 30
    )
      factor = 1.5;
    value *= factor;
  }
  return value;
}
function work(w: World, d: Disciple) {
  if (d.needs.energy < C.restBelow) return;
  const garden = buildings.find((b) => b.id === 'B_GARDEN')!.output,
    alchemy = buildings.find((b) => b.id === 'B_ALCHEMY')!.output,
    hall = buildings.find((b) => b.id === 'B_HALL')!.output;
  const location = d.state.location;
  const factor =
    traitEffect(d, 'yield') *
    (Number(d.flags.motivationUntil ?? 0) > w.tick ? 1.5 : 1);
  let key: 'stone' | 'herb' = 'stone',
    amount = 0;
  if (location === '采石点')
    amount =
      hall.stone *
      (d.root.elements.includes('土') ? C.elements.土.stone : 1) *
      factor;
  if (location === '药圃') {
    key = 'herb';
    amount =
      garden.herb *
      (d.root.elements.includes('木') ? C.elements.木.herb : 1) *
      traitEffect(d, 'herb') *
      factor;
    d.flags.gardenWork = Number(d.flags.gardenWork ?? 0) + 1;
  }
  if (location === '炼丹房' && Number(w.flags.alchemyStop ?? 0) <= w.tick) {
    if (
      !w.flags.alchemySteps &&
      w.resources.herb >= alchemy.herbCost &&
      w.resources.stone >=
        alchemy.stoneCost +
          (w.flags.autoMaster !== false &&
          C.jobs.reserveConstruction &&
          w.round >= 4 &&
          (bld(w, 'B_HALL')?.level ?? 1) < 2 &&
          !bld(w, 'B_HALL')?.targetLevel
            ? (buildingOrder(w, 'B_HALL').cost.stone ?? 0)
            : 0)
    ) {
      w.resources.herb -= alchemy.herbCost;
      w.resources.stone -= alchemy.stoneCost;
      w.flags.alchemySteps = alchemy.batchSteps;
    }
    if (Number(w.flags.alchemySteps) > 0) {
      w.flags.alchemySteps = Number(w.flags.alchemySteps) - 1;
      if (w.flags.alchemySteps === 0) {
        const chance =
          alchemy.chance +
          (d.root.elements.includes('火') ? C.elements.火.alchemy : 0) +
          bonus(d, 'alchemy') +
          Number(d.flags.nextAlchemy ?? 0);
        delete d.flags.nextAlchemy;
        if (random(w.rng) < chance) {
          w.resources.pill += alchemy.pill;
          w.flags.firstPill ??= w.tick;
        } else d.flags.alchemyFailed = w.tick;
      }
    }
  }
  const debt = Math.min(amount, Number(d.flags.yieldDebt ?? 0));
  d.flags.yieldDebt = Math.max(0, Number(d.flags.yieldDebt ?? 0) - debt);
  w.resources[key] += amount - debt;
}
export function capResources(w: World, onFull?: () => void) {
  for (const k of ['stone', 'herb', 'pill'] as const) {
    const max = w.capacity[k] * (bld(w, 'B_HALL')?.level || 1);
    if (w.resources[k] > max) onFull?.();
    w.resources[k] = clamp(w.resources[k], 0, max);
  }
  w.resources.reputation = Math.max(0, w.resources.reputation);
}
export function step(w: World, ctx: StepContext = {}): World {
  w.tick++;
  w.resources.stone += C.passiveStone;
  if (!ctx.offline && w.flags.deferredEvents) {
    const deferred = z
      .array(eventSchema)
      .parse(JSON.parse(String(w.flags.deferredEvents)));
    while (deferred.length && w.events.length < C.queueLimit)
      w.events.push(deferred.shift()!);
    if (deferred.length) w.flags.deferredEvents = JSON.stringify(deferred);
    else delete w.flags.deferredEvents;
  }
  if (w.flags.recruitAt && w.tick >= Number(w.flags.recruitAt)) {
    recruit(w, 10);
    delete w.flags.recruitAt;
  }
  if (w.flags.autoMaster !== false && !ctx.offline) {
    for (const order of C.autoBuild) {
      const def = buildings.find((b) => b.id === order.id)!;
      if ((bld(w, order.id)?.level ?? 0) >= def.maxLevel) continue;
      if (w.round >= order.round) build(w, order.id);
      break;
    }
  }
  for (const d of w.disciples) {
    if (!d.remainingSeasons || d.state.awayUntil) continue;
    choose(w, d);
    d.needs.mood -= C.moodDecay * traitEffect(d, 'moodDecay');
    d.needs.drive -= C.driveDecay * traitEffect(d, 'driveDecay');
    const b = d.state.behavior;
    d.needs.energy -= b === '历练' ? 1 : C.energyCost[b];
    if (b === '休息') {
      d.needs.energy += C.restGain * traitEffect(d, 'rest');
      if (bld(w, 'B_DORM')?.level === 2) d.needs.mood++;
    }
    if (b === '社交') {
      d.needs.mood +=
        4 *
        (d.root.elements.includes('水') ? 1.2 : 1) *
        traitEffect(d, 'socialMood');
      if (d.state.stepsLeft === 1) {
        const candidates = present(w).filter(
          (x) => x.id !== d.id && relation(d, x).value > -20,
        );
        if (candidates.length) {
          candidates.sort(
            (a, b) => relation(d, b).value - relation(d, a).value,
          );
          const partner = candidates[0];
          changeRelation(
            d,
            partner,
            3 * socialCoefficient(d, partner) * socialCoefficient(partner, d),
          );
        }
        if (random(w.rng) < bonus(d, 'drunkChance'))
          d.needs.energy -= bonus(d, 'drunkEnergy');
      }
    }
    if (b === '修炼') {
      d.needs.drive += 4;
      const peers = present(w).filter(
        (x) =>
          x.id !== d.id &&
          x.state.location === d.state.location &&
          x.state.behavior === '修炼',
      );
      let multiplier =
        traitEffect(d, 'xp') * (peers.length ? 1 : traitEffect(d, 'aloneXp'));
      for (const peer of peers) {
        const r = relation(d, peer);
        if (d.state.location === '静修室' && r.value >= 60) multiplier *= 1.1;
        if (r.tags.includes('道侣')) multiplier *= 1.2;
        if (r.tags.includes('宿敌')) multiplier *= 1.1;
        if (
          d.state.location === '静修室' &&
          d.flags.剑书同修 &&
          peer.flags.剑书同修
        )
          multiplier *= 1.15;
        if (
          d.flags.studyPartner === peer.id &&
          Number(d.flags.studyUntil) > w.tick
        )
          multiplier *= 1.1;
      }
      if (Number(d.flags.apartUntil) > w.tick) multiplier *= 1.05;
      if (!(
        d.realm.major === '炼气' &&
        d.realm.layer === 3 &&
        d.realm.xp >= 200
      ))
        d.realm.xp +=
          C.xpPerStep *
          C.rootXp[d.root.grade] *
          (d.state.location === '静修室'
            ? buildings.find((b) => b.id === 'B_MEDIT')!.output.xp
            : 1) *
          multiplier *
          (d.needs.mood < C.restBelow ? C.lowMoodMultiplier : 1);
      if (ctx.offline && d.realm.major === '炼气' && d.realm.layer === 3)
        d.realm.xp = Math.min(200, d.realm.xp);
    }
    if (b === '做工') work(w, d);
    for (const k of ['energy', 'mood', 'drive'] as const)
      d.needs[k] = clamp(d.needs[k]);
    d.state.stepsLeft = Math.max(0, d.state.stepsLeft - 1);
  }
  const workers = present(w).filter((d) => d.state.behavior === '做工');
  for (let i = 0; i < workers.length; i++)
    for (let j = i + 1; j < workers.length; j++) {
      const a = workers[i],
        b = workers[j],
        key = `cowork:${b.id}`;
      if (a.state.location === b.state.location) {
        a.flags[key] = Number(a.flags[key] ?? 0) + 1;
        if (Number(a.flags[key]) % 3 === 0) changeRelation(a, b, 1);
      } else a.flags[key] = 0;
    }
  for (const b of w.buildings) {
    if (!b.targetLevel) continue;
    const worker = workers.find((d) => d.state.location === `工地:${b.id}`);
    b.progress +=
      (worker ? 1 : 0.5) / (worker?.root.elements.includes('土') ? 0.8 : 1);
    const def = buildings.find((x) => x.id === b.id)!;
    if (b.progress >= def.duration) {
      b.level = b.targetLevel;
      b.targetLevel = 0;
      b.progress = 0;
      b.builtTick = w.tick;
      w.flags[`built:${b.id}:${b.level}`] = w.tick;
      log(w, `${b.name} Lv${b.level}落成`);
    }
  }
  if (w.tick % 30 === 0) {
    w.round++;
    w.season = (['春', '夏', '秋', '冬'] as const)[w.round % 4];
    w.resources.reputation += w.buildings.filter((b) => b.level).length;
    for (const d of w.disciples) {
      d.flags.gardenWork = 0;
      d.flags.yieldDebt = 0;
      if (d.remainingSeasons && ctx.age !== false) {
        d.ageSeasons++;
        d.remainingSeasons = Math.max(
          ctx.offline ? 1 : 0,
          d.remainingSeasons - 1,
        );
        updateStage(d);
        if (!d.remainingSeasons) {
          d.flags.legacy = true;
          log(w, `${d.name}于松下坐化。`);
        }
      }
      for (const r of Object.values(d.relations))
        if (!r.tags.includes('道侣') && !r.tags.includes('宿敌'))
          r.value = Math.sign(r.value) * Math.max(0, Math.abs(r.value) - 1);
      if (d.flags.studyPartner && Number(d.flags.studyUntil) >= w.tick) {
        const partner = byId(w, String(d.flags.studyPartner));
        if (partner && d.id < partner.id) changeRelation(d, partner, 10);
      }
    }
  }
  for (const e of [...w.events]) {
    if (ctx.offline && e.chain) continue;
    if (ctx.offline || w.tick - e.createdTick >= 30) {
      let choice = defaultOption(w, e);
      if (choice < 0)
        choice = e.choices.findIndex((_, i) => optionAvailable(w, e, i));
      if (choice >= 0) resolveEvent(w, e.id, choice, ctx);
    }
  }
  schedule(w, ctx);
  if (ctx.offline)
    for (const e of [...w.events])
      if (!e.chain) {
        let i = defaultOption(w, e);
        if (i < 0)
          i = e.choices.findIndex((_, index) => optionAvailable(w, e, index));
        if (i >= 0) resolveEvent(w, e.id, i, ctx);
      }
  for (const n of [20, 50])
    if (w.resources.reputation >= n) w.flags[`reputation:${n}`] ??= w.tick;
  capResources(w, ctx.onFull);
  return w;
}
export function advance(w: World, n: number, ctx: StepContext = {}): World {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error('推进步数必须是非负整数');
  for (let i = 0; i < n; i++) step(w, ctx);
  return w;
}
