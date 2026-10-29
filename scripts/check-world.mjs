import {
  readFile,
  writeFile,
  readdir,
  stat,
  appendFile,
} from 'node:fs/promises';
import { format } from 'prettier';
import { tsImport } from 'tsx/esm/api';
import assert from 'node:assert/strict';
const {
  worldMap,
  inPolygon,
  walkable,
  findPath,
  pathLength,
  WALK_SPEED,
  walkTimeSeconds,
} = await tsImport('../src/render/world.ts', import.meta.url);
const areas = worldMap.islands.map((d) => {
  let n = 0;
  for (let y = 2; y < 720; y += 4)
    for (let x = 2; x < 1280; x += 4)
      if (
        inPolygon([x, y], d.walkable) &&
        walkable([x + d.offset[0], y + d.offset[1]])
      )
        n += 16;
  return { id: d.id, netArea: n, ratioToMain: 0 };
});
for (const d of areas) d.ratioToMain = d.netArea / areas[0].netArea;
const a = worldMap.slots.find((s) => s.id === 'B_DORM').front,
  b = worldMap.slots.find((s) => s.id === 'B_HALL').front;
const manifest = JSON.parse(
  await readFile('public/assets/manifest.json', 'utf8'),
);
const files = [
  'dist/index.html',
  ...(await readdir('dist/bundles')).map((f) => 'dist/bundles/' + f),
  'public/assets/map/world.webp',
  'public/assets/map/world-mini.webp',
  ...manifest.files
    .filter(
      (f) =>
        f.file.includes('-map@') ||
        f.file.includes('-96@') ||
        f.file.includes('-48@'),
    )
    .map((f) => 'public/assets/' + f.file),
];
const firstLoadUpperBound = await Promise.all(
  files.map(async (file) => ({ file, bytes: (await stat(file)).size })),
);
const bytes = firstLoadUpperBound.reduce((n, f) => n + f.bytes, 0);
assert.ok(bytes <= 2500000, `Upper bound ${bytes}`);
const report = {
  areas,
  areaSampling: 4,
  totalAreaRatio: areas.reduce((n, d) => n + d.netArea, 0) / areas[0].netArea,
  trip: {
    from: a,
    to: b,
    path: findPath(a, b),
    length: pathLength(findPath(a, b)),
    speed: WALK_SPEED,
    seconds: walkTimeSeconds(a, b),
  },
  firstLoadUpperBoundBytes: bytes,
  firstLoadUpperBound,
  browserVerified: false,
};
await writeFile(
  'docs/world-acceptance.json',
  await format(JSON.stringify(report), { parser: 'json' }),
);
await appendFile(
  'STATUS.md',
  `- ${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })} W1 净可走面积（4px 栅格，扣建筑底座/地块与障碍，单位²）：${JSON.stringify(areas)}；总计主岛 ${report.totalAreaRatio.toFixed(3)} 倍，未达 3 倍；首屏静态保守上界 ${bytes} bytes（全部 bundles+实际地图/建筑/弟子+所有小饰品），≤2.5MB，选整图；浏览器网络实测待外部 e2e。\n`,
);
console.log(report.trip, areas, bytes);
