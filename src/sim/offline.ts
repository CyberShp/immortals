import { CONFIG as C } from './config';
import { makeRng, offlineSeed } from './rng';
import { advance, type World } from './world';
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
  const summary: OfflineSummary = {
    ...time,
    rounds,
    resources: { stone: 0, herb: 0, pill: 0, reputation: 0 },
    breakthroughs: [],
    warehouseFull: false,
    hints: w.events.filter((e) => !e.chain).map((e) => e.hint),
    clockRollback: time.clamped === 'negative',
  };
  if (!rounds) return summary;
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
      onFull: () => {
        summary.warehouseFull = true;
      },
    });
  // 连锁节点由 M2 调度器产生，离线最多保留三个决策节点。
  w.events = w.events.slice(0, C.offlineQueueLimit);
  for (const key of Object.keys(before) as (keyof typeof before)[])
    summary.resources[key] = w.resources[key] - before[key];
  summary.hints = summary.hints.slice(0, C.offlineHintLimit);
  return summary;
}
