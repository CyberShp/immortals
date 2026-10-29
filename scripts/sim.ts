import { formatResources, formatLog } from '../src/display/format';
import { loadData } from '../src/sim/data';
import {
  createWorld,
  step,
  resolveEvent,
  defaultOption,
  type World,
} from '../src/sim/world';
import { eventDefinitions } from '../src/sim/catalog';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const arg = (k: string, d: number) =>
  args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d;
const rounds = arg('--rounds', 6),
  count = arg('--seeds', 1),
  seed = arg('--seed', 42);
for (const n of [rounds, count, seed])
  if (!Number.isSafeInteger(n) || n < 0 || n > 10000)
    throw new Error('参数必须为 0 至 10000 的整数');
const auto = (w: World) => {
  for (const e of [...w.events]) {
    const i = defaultOption(w, e);
    if (i >= 0) resolveEvent(w, e.id, i);
  }
};
const results: World[] = [];
for (let n = 0; n < count; n++) {
  const w = createWorld(args.includes('--seeds') ? n : seed, loadData());
  for (let r = 0; r < rounds; r++) {
    const before = w.logs.length;
    for (let i = 0; i < 30; i++) {
      step(w);
      if (!args.includes('--idle')) auto(w);
    }
    if (!args.includes('--seeds'))
      console.log(
        `第 ${w.round} 轮｜资源 ${JSON.stringify(formatResources(w.resources))}\n建筑：${w.buildings.map((b) => `${b.name} Lv${b.level}${b.targetLevel ? '（建造中）' : ''}`).join('；')}\n弟子：${w.disciples.map((d) => `${d.name} ${d.realm.major}${d.realm.layer}层 ${d.stage}`).join('；')}\n事件：${w.logs.slice(before).map(formatLog).join('；')}\n故事：${['A', 'B', 'C', 'D'].map((c) => `${c} ${[1, 2, 3].filter((i) => w.flags[`done:EV_${c}${i}`] !== undefined).length}`).join(' / ')}`,
      );
  }
  results.push(w);
}
if (args.includes('--seeds')) {
  const ends = ['EV_A3', 'EV_B3', 'EV_C3', 'EV_D2'];
  const median = (values: number[]) => {
    values.sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length / 2)] : null;
  };
  const complete = (w: World, id: string) =>
    w.flags[`done:${id}`] !== undefined;
  const distribution: Record<string, number> = {};
  for (const w of results) {
    const n = ends.filter((e) => complete(w, e)).length;
    distribution[n] = (distribution[n] ?? 0) + 1;
  }
  const timingKeys = [
    'built:B_GARDEN:1',
    'first:EV_BRK_01',
    'first:EV_A1',
    'built:B_MEDIT:1',
    'first:EV_B1',
    'first:EV_C1',
    'first:EV_D1',
    'built:B_ALCHEMY:1',
    'first:EV_BRK_02',
    'first:EV_A2',
    'built:B_DORM:2',
    'firstPill',
    'first:EV_B2',
    'first:EV_C2',
    'first:EV_D2',
    'first:EV_A3',
    'first:EV_B3',
    'built:B_HALL:2',
    'first:EV_C3',
    'first:EV_SEC_02',
    'reputation:20',
    'reputation:50',
    ...eventDefinitions.map((e) => `first:${e.id}`),
  ];
  const report = {
    模式: args.includes('--idle')
      ? '零操作超时默认'
      : '出现即选默认（不可负担时选第一个付得起的选项）',
    种子数: count,
    轮数: rounds,
    主殿Lv2完成率:
      results.filter((w) =>
        w.buildings.some((b) => b.id === 'B_HALL' && b.level === 2),
      ).length / count,
    故事线完成率: Object.fromEntries(
      ends.map((id) => [
        id,
        results.filter((w) => complete(w, id)).length / count,
      ]),
    ),
    每局完成数分布: distribution,
    SEC_02命中率:
      results.filter((w) => w.flags['first:EV_SEC_02'] !== undefined).length /
      count,
    每局至少三条比例:
      results.filter((w) => ends.filter((id) => complete(w, id)).length >= 3)
        .length / count,
    每局至少三条: results.every(
      (w) => ends.filter((id) => complete(w, id)).length >= 3,
    ),
    节奏中位数: Object.fromEntries(
      timingKeys.map((k) => {
        const reached = results.filter((w) => typeof w.flags[k] === 'number');
        return [
          k,
          {
            命中数: reached.length,
            轮: median(reached.map((w) => Math.ceil(Number(w.flags[k]) / 30))),
          },
        ];
      }),
    ),
  };
  console.log(JSON.stringify(report, null, 2));
  if (args.includes('--report'))
    writeFileSync(
      args[args.indexOf('--report') + 1],
      JSON.stringify(report, null, 2) + '\n',
    );
}
