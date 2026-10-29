// Conservative on-disk upper bound, not browser Resource Timing measurement.
// Includes ALL JS chunks even though some renderers are loaded on demand.
import { readFile, readdir, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
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
  ...['stone', 'herb', 'pill', 'fame'].map(
    (n) => `assets/icon/resource-${n}-32@2x.webp`,
  ),
]);
let bytes = 0;
for (const file of paths) bytes += (await stat(`dist/${file}`)).size;
assert.ok(bytes <= 2_500_000, `Static first-screen upper bound ${bytes}`);
console.log(
  JSON.stringify(
    {
      method: 'static upper bound; all bundles included; browser not run',
      files: paths.size,
      bytes,
      limit: 2_500_000,
    },
    null,
    2,
  ),
);
