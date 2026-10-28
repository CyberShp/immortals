import { performance } from 'node:perf_hooks';
import { loadData } from '../src/sim/data';
import { createWorld, advance } from '../src/sim/world';
import { CONFIG } from '../src/sim/config';
const args = process.argv.slice(2);
const arg = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : Number(args[i + 1]);
};
const seed = arg('--seed', 42),
  rounds = arg('--rounds', 6);
if (
  !Number.isSafeInteger(seed) ||
  !Number.isSafeInteger(rounds) ||
  rounds < 0 ||
  rounds > 10000
)
  throw new Error('种子与轮数必须为整数，轮数范围为 0 至 10000');
const world = createWorld(seed, loadData());
const start = performance.now();
for (let i = 0; i < rounds; i++) {
  const before = world.logs.length;
  advance(world, CONFIG.stepsPerRound);
  console.log(
    `第 ${world.round} 轮｜灵石 ${world.resources.stone.toFixed(1)} · 灵草 ${world.resources.herb.toFixed(1)} · 丹药 ${world.resources.pill} · 声望 ${world.resources.reputation}\n${world.disciples.map((d) => `${d.name} ${d.realm.major}${d.realm.layer}层（${d.stage}）`).join('；')}\n事件：${world.logs.slice(before).join('；') || '本轮无新增纪事'}`,
  );
}
console.log(
  `模拟耗时：${(performance.now() - start).toFixed(2)} 毫秒；种子 ${seed}；随机调用 ${world.rng.calls} 次。`,
);
