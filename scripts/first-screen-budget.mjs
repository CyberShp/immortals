// Conservative on-disk upper bound, not browser Resource Timing measurement.
// 只报告不断言：已取消预算，指挥官 2026-10-30 02:26 决定（原 ≤2,500,000 bytes 失败条件已删除）。
// Includes ALL JS chunks even though some renderers are loaded on demand.
import { readFile, readdir, stat } from 'node:fs/promises';
const manifest = JSON.parse(
  await readFile('public/assets/manifest.json', 'utf8'),
);
const paths = new Set([
  'index.html',
  ...(await readdir('dist/bundles')).map((f) => `bundles/${f}`),
  ...manifest.files
    .filter((f) => f.file.includes('-map@') || f.file.includes('-96@'))
    .map((f) => `assets/${f.file}`),
  'assets/map/world.webp',
  'assets/map/world-mini.webp',
  'assets/map/gate-foreground.webp',
  ...['stone', 'herb', 'pill', 'fame'].map(
    (n) => `assets/icon/resource-${n}-32@2x.webp`,
  ),
]);
let bytes = 0;
for (const file of paths) bytes += (await stat(`dist/${file}`)).size;
console.log(
  JSON.stringify(
    {
      method: 'static upper bound; all bundles included; browser not run',
      files: paths.size,
      bytes,
      limit: null,
      note: '已取消预算，指挥官 2026-10-30 02:26 决定',
    },
    null,
    2,
  ),
);
