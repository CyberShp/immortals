import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
const source =
  process.argv[2] ?? '/Volumes/Media/immortal-qa/integration2-intake/bridge-v5';
const file = 'public/assets/world-v4/bridges/east_bridge_v5.webp';
const png = await readFile(`${source}/east_bridge_v5.png`);
const original = await sharp(png)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const temp = await mkdtemp(join(tmpdir(), 'bridge-v5-'));
execFileSync('python3', [
  '-c',
  'from PIL import Image; import sys; Image.open(sys.argv[1]).save(sys.argv[2],lossless=True,exact=True,method=6)',
  `${source}/east_bridge_v5.png`,
  `${temp}/bridge.webp`,
]);
const encoded = await readFile(`${temp}/bridge.webp`);
const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer();
assert.equal(
  Buffer.compare(original.data, decoded),
  0,
  'PNG/WebP exact decoded RGBA',
);
const prior = JSON.parse(
  await readFile(
    'src/render/world-v4-placement/east_bridge_v3_placement.json',
    'utf8',
  ),
);
const placement = JSON.parse(
  await readFile(`${source}/east_bridge_v5_placement.json`, 'utf8'),
);
const normalise = (x) =>
  JSON.parse(
    JSON.stringify(x).replaceAll('east_bridge_v5.png', 'east_bridge_v3.png'),
  );
assert.deepEqual(
  normalise(placement),
  prior,
  'placement unchanged except filename',
);
let purple = 0,
  magenta = 0,
  cyan = 0,
  edgePixels = 0;
const { width, height } = original.info;
const alpha = (x, y) =>
  x < 0 || x >= width || y < 0 || y >= height
    ? 0
    : decoded[(y * width + x) * 4 + 3];
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4,
      [r, g, b, a] = decoded.subarray(i, i + 4);
    if (a > 0 && a < 255 && Math.min(r - g, b - g) > 6) purple++;
    if (!a) continue;
    let edge = false;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (dx * dx + dy * dy <= 4 && !alpha(x + dx, y + dy)) edge = true;
    if (edge) {
      edgePixels++;
      if (r - g > 25 && b - g > 25) magenta++;
      if (b > r + 30 && b > g + 10 && Math.max(r, g, b) > 153) cyan++;
    }
  }
assert.equal(purple + magenta + cyan, 0);
await writeFile(file, encoded);
const report = {
  file,
  width,
  height,
  decodedDifferentBytes: 0,
  placementEqual: true,
  semiTransparentPurple: purple,
  edgeMagenta: magenta,
  edgeCyan: cyan,
  edgePixels,
  pngSha256: createHash('sha256').update(png).digest('hex'),
  webpSha256: createHash('sha256').update(encoded).digest('hex'),
};
console.log(JSON.stringify(report, null, 2));
