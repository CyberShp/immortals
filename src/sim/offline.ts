import { CONFIG as C } from './config';
import { makeRng, offlineSeed } from './rng';
import { advance, relationTier, type World } from './world';
export interface OfflineTime {
  elapsedMs: number;
  clamped: 'none' | 'negative' | 'over7d';
  effectiveMs: number;
  rounds: number;
}
export interface OfflineSummary extends OfflineTime {
  resources: World['resources'];
  breakthroughs: string[];
  warehouseFull: boolean;
  hints: string[];
  clockRollback: boolean;
  relations: string[];
}
export interface OfflineConfig {
  maxMs: number;
  roundMs: number;
  bands: readonly { end: number; rate: number }[];
}
export function computeOffline(
  lastSeen: number,
  now: number,
  config: OfflineConfig = C.offline,
): OfflineTime {
  const raw = now - lastSeen;
  if (!Number.isFinite(raw) || raw < 0)
    return { elapsedMs: 0, clamped: 'negative', effectiveMs: 0, rounds: 0 };
  const elapsed = Math.min(raw, config.maxMs);
  let effectiveMs = 0,
    start = 0;
  for (const band of config.bands) {
    effectiveMs += Math.max(0, Math.min(elapsed, band.end) - start) * band.rate;
    start = band.end;
  }
  return {
    elapsedMs: raw,
    clamped: raw > config.maxMs ? 'over7d' : 'none',
    effectiveMs,
    rounds: Math.floor(effectiveMs / config.roundMs),
  };
}
export function applyOffline(
  w: World,
  rounds: number,
  lastSeen: number,
  time: OfflineTime = {
    elapsedMs: rounds * C.offline.roundMs,
    effectiveMs: rounds * C.offline.roundMs,
    rounds,
    clamped: 'none',
  },
): OfflineSummary {
  const max = computeOffline(0, C.offline.maxMs).rounds;
  if (!Number.isSafeInteger(rounds) || rounds < 0 || rounds > max)
    throw new Error('离线轮数超出允许范围');
  const before = { ...w.resources };
  const relationsBefore = new Map(
    w.disciples.flatMap((d) =>
      Object.entries(d.relations).map(([id, r]) => [
        `${d.id}:${id}`,
        relationTier(r.value),
      ]),
    ),
  );
  const summary: OfflineSummary = {
    ...time,
    rounds,
    resources: { stone: 0, herb: 0, pill: 0, reputation: 0 },
    breakthroughs: [],
    relations: [],
    warehouseFull: false,
    hints: w.events.filter((e) => !e.chain).map((e) => e.hint),
    clockRollback: time.clamped === 'negative',
  };
  if (!rounds) return summary;
  const overflow = w.events.filter((e) => e.chain).slice(C.offlineQueueLimit);
  if (overflow.length) {
    w.flags.deferredEvents = JSON.stringify(overflow);
    w.events = w.events.filter((e) => !overflow.includes(e));
  }
  const seed = w.rng.seed;
  w.rng = makeRng(offlineSeed(seed, lastSeen));
  w.rng.seed = seed;
  const counts: Record<string, number> = {};
  for (let r = 0; r < rounds; r++)
    advance(w, C.stepsPerRound, {
      offline: true,
      age: r < C.offlineAgeRounds,
      breakthroughs: counts,
      onBreakthrough: (t) => {
        summary.breakthroughs.push(t);
        summary.hints.push(t);
      },
      onHint: (t) => summary.hints.push(t),
      onFull: () => {
        summary.warehouseFull = true;
      },
    });
  for (const d of w.disciples)
    d.realm.xp = Math.min(d.realm.xp, C.xpThreshold[d.realm.layer - 1]);
  for (const d of w.disciples)
    for (const [id, r] of Object.entries(d.relations)) {
      const old = relationsBefore.get(`${d.id}:${id}`) ?? '平常';
      const current = relationTier(r.value);
      if (d.id < id && old !== current)
        summary.relations.push(
          `${d.name}与${w.disciples.find((x) => x.id === id)?.name}：${old}→${current}`,
        );
    }
  for (const key of Object.keys(before) as (keyof typeof before)[])
    summary.resources[key] = w.resources[key] - before[key];
  summary.hints = summary.hints.slice(0, C.offlineHintLimit);
  return summary;
}
