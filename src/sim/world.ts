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
const nat = z.number().int().nonnegative();
export const eventSchema = z.object({
  id: z.string(),
  hint: z.string(),
  text: z.string(),
  createdTick: nat,
  options: z.array(z.string()).min(1),
  defaultOption: nat,
  kind: z.enum(['宗门', '突破']),
  chain: z.boolean(),
});
export const worldSchema = z.object({
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
});
export type World = z.infer<typeof worldSchema>;
export interface StepContext {
  offline?: boolean;
  age?: boolean;
  breakthroughs?: Record<string, number>;
  onBreakthrough?: (text: string) => void;
  onFull?: () => void;
}
export function createWorld(seed: number, data: GameData): World {
  return {
    tick: 0,
    round: 0,
    season: '春',
    resources: { ...data.resources },
    capacity: { ...data.balance.capacity },
    disciples: structuredClone(data.disciples),
    buildings: structuredClone(data.buildings),
    events: [
      {
        id: 'M1_WELCOME',
        hint: '山门初开，诸事待兴',
        text: '弟子已入山。请掌门定下今日的基调。',
        createdTick: 0,
        options: ['安心修行', '先顾生计'],
        defaultOption: 0,
        kind: '宗门',
        chain: false,
      },
    ],
    logs: ['山门初开，六位弟子入册。'],
    rng: makeRng(seed),
    flags: {},
  };
}
export function log(w: World, text: string) {
  w.logs.push(`第${w.round + 1}季 · ${text}`);
  w.logs = w.logs.slice(-C.logLimit);
}
export function resolveEvent(w: World, id: string, option: number) {
  const e = w.events.find((e) => e.id === id);
  if (!e || !e.options[option]) return;
  w.disciples.forEach((d) => {
    d.policy = option === 1 ? '勤工' : '均衡';
  });
  log(w, `${e.hint}：${e.options[option]}`);
  w.events = w.events.filter((e) => e.id !== id);
}
export function updateStage(d: Disciple) {
  d.stage =
    d.remainingSeasons === 0
      ? '坐化'
      : d.remainingSeasons <= C.offlineAgeRounds ||
          d.ageSeasons >= d.lifespanSeasons * C.elderlyRatio
        ? '迟暮'
        : d.ageSeasons < C.youthYears * C.seasonsPerYear
          ? '少年'
          : d.ageSeasons < C.adultYears * C.seasonsPerYear
            ? '青年'
            : '壮年';
}
function choose(w: World, d: Disciple) {
  if (
    d.needs.energy < C.restBelow ||
    (d.state.behavior === '休息' && d.needs.energy < C.restUntil)
  ) {
    d.state.behavior = '休息';
    d.state.location = '居舍';
    return;
  }
  if (d.state.stepsLeft > 0) return;
  const scores: { behavior: Disciple['state']['behavior']; score: number }[] = [
    {
      behavior: '修炼',
      score:
        (C.needMax - d.needs.drive) *
        (d.policy === '专修' ? C.policyMultiplier : 1) *
        (d.needs.drive < C.restBelow ? C.lowDriveMultiplier : 1) *
        (d.traits.includes('T_DILIGENT') ? C.diligentXp : 1),
    },
  ];
  if (d.state.injuredUntil <= w.tick)
    scores.push(
      {
        behavior: '做工',
        score:
          (C.workScore + C.vacancies * C.vacancyScore) *
          (d.policy === '勤工' ? C.policyMultiplier : 1) *
          (d.traits.includes('T_LAZY') ? C.lazyYield : 1),
      },
      { behavior: '社交', score: C.needMax - d.needs.mood },
    );
  const best = Math.max(...scores.map((s) => s.score));
  const ties = scores.filter((s) => s.score === best);
  d.state.behavior = ties[Math.floor(random(w.rng) * ties.length)].behavior;
  d.state.stepsLeft =
    d.state.behavior === '社交'
      ? C.socialDurationMin + Math.floor(random(w.rng) * C.socialDurationRange)
      : C.durationMin + Math.floor(random(w.rng) * C.durationRange);
  d.state.location =
    d.state.behavior === '修炼'
      ? '空地'
      : d.state.behavior === '社交'
        ? '松下'
        : '采石点';
}
function breakthrough(w: World, d: Disciple, ctx: StepContext) {
  if (d.realm.major === '筑基') return;
  const threshold = C.xpThreshold[d.realm.layer - 1];
  if (d.realm.xp < threshold) return;
  d.realm.xp = threshold;
  const major = d.realm.layer === 3;
  if (
    ctx.offline &&
    (major || (ctx.breakthroughs?.[d.id] ?? 0) >= C.offlineBreakthroughs)
  )
    return;
  if (major && w.resources.pill < C.majorPills) return;
  if (d.state.injuredUntil > w.tick) return;
  if (major) w.resources.pill -= C.majorPills;
  const chance = Math.min(
    major ? C.majorChanceCap : C.chanceCap,
    (major ? C.majorBase : C.breakthroughBase) +
      C.rootChance[d.root.grade] +
      (d.traits.includes('T_PROUD') ? C.proudBonus : 0) +
      (d.needs.mood >= C.goodMood ? C.moodBonus : 0),
  );
  if (random(w.rng) < chance) {
    if (major) {
      d.realm.major = '筑基';
      d.realm.layer = 1;
      d.remainingSeasons += C.lifespan.筑基 - d.lifespanSeasons;
      d.lifespanSeasons = C.lifespan.筑基;
    } else d.realm.layer++;
    d.realm.xp = 0;
    w.resources.reputation += major
      ? C.majorReputation
      : C.breakthroughReputation;
    if (ctx.breakthroughs)
      ctx.breakthroughs[d.id] = (ctx.breakthroughs[d.id] ?? 0) + 1;
    const text = `${d.name}突破至${d.realm.major}${d.realm.layer}层`;
    log(w, text);
    ctx.onBreakthrough?.(text);
  } else {
    d.realm.xp *= major ? C.majorFailureXp : C.failureXp;
    d.needs.mood = Math.max(0, d.needs.mood - C.failureMood);
    d.state.injuredUntil = w.tick + C.stepsPerRound * (major ? 2 : 1);
    log(w, `${d.name}冲关未成，静养一季。`);
  }
}
export function capResources(w: World, onFull?: () => void) {
  for (const key of ['stone', 'herb', 'pill'] as const) {
    const cap =
      w.capacity[key] *
      (w.buildings.find((b) => b.id === 'B_HALL')?.level ?? 1);
    if (w.resources[key] > cap) {
      w.resources[key] = cap;
      onFull?.();
    }
  }
}
export function step(w: World, ctx: StepContext = {}): World {
  w.tick++;
  w.resources.stone += C.passiveStone;
  for (const d of w.disciples) {
    if (d.remainingSeasons === 0 || d.state.awayUntil > w.tick) continue;
    choose(w, d);
    d.needs.mood -= C.moodDecay;
    d.needs.drive -=
      C.driveDecay * (d.traits.includes('T_DILIGENT') ? C.diligentDecay : 1);
    const b = d.state.behavior;
    d.needs.energy -= C.energyCost[b];
    if (b === '休息') d.needs.energy += C.restGain;
    if (b === '社交')
      d.needs.mood +=
        C.socialGain * (d.root.elements.includes('水') ? C.elementalBonus : 1);
    if (b === '修炼') {
      d.needs.drive += C.meditationDrive;
      d.realm.xp +=
        C.xpPerStep *
        C.rootXp[d.root.grade] *
        (d.traits.includes('T_DILIGENT') ? C.diligentXp : 1) *
        (d.needs.mood < C.restBelow ? C.lowMoodMultiplier : 1);
      breakthrough(w, d, ctx);
    }
    if (b === '做工') {
      const herb =
        w.buildings.some((b) => b.id === 'B_GARDEN') &&
        d.root.elements.includes('木');
      const key = herb ? 'herb' : 'stone';
      w.resources[key] +=
        (herb ? C.workHerb : C.workStone) *
        (d.root.elements.includes(herb ? '木' : '土') ? C.elementalBonus : 1) *
        (d.traits.includes('T_LAZY') ? C.lazyYield : 1);
    }
    for (const key of ['energy', 'mood', 'drive'] as const)
      d.needs[key] = Math.max(0, Math.min(C.needMax, d.needs[key]));
    d.state.stepsLeft = Math.max(0, d.state.stepsLeft - 1);
  }
  if (w.tick % C.stepsPerRound === 0) {
    w.round++;
    w.season = (['春', '夏', '秋', '冬'] as const)[w.round % 4];
    w.resources.reputation += w.buildings.length;
    for (const d of w.disciples) {
      if (d.remainingSeasons > 0 && ctx.age !== false) {
        d.ageSeasons++;
        d.remainingSeasons = Math.max(
          ctx.offline ? 1 : 0,
          d.remainingSeasons - 1,
        );
        updateStage(d);
        if (d.remainingSeasons === 0) log(w, `${d.name}于松下坐化。`);
      }
    }
  }
  for (const e of [...w.events])
    if (!e.chain && (ctx.offline || w.tick - e.createdTick >= C.stepsPerRound))
      resolveEvent(w, e.id, e.defaultOption);
  capResources(w, ctx.onFull);
  return w;
}
export function advance(w: World, n: number, ctx: StepContext = {}): World {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error('推进步数必须是非负整数');
  for (let i = 0; i < n; i++) step(w, ctx);
  return w;
}
