// Read existing art only; generate navigation geometry, never alter image assets.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import { createHash } from 'node:crypto';
const file = 'building/hall-t1-map@2x.webp';
const manifest = JSON.parse(await readFile('public/assets/manifest.json'));
const placement = JSON.parse(await readFile('docs/world-buildings.json')).find(
  (b) => b.file === file,
);
const entry = manifest.files.find((e) => e.file === file);
const input = await readFile('public/assets/' + file);
const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const old = [1555, 735, 1650, 1050],
  profile = new Map();
for (let py = 0; py < info.height; py++)
  for (let px = 0; px < info.width; px++) {
    if (data[(py * info.width + px) * 4 + 3] < 128) continue;
    const x0 = placement.x + (px - entry.anchor.x) * placement.scale,
      x1 = x0 + placement.scale;
    const y0 = placement.y + (py - entry.anchor.y) * placement.scale,
      y1 = y0 + placement.scale;
    if (x1 <= old[0] || x0 >= old[2] || y1 <= old[1] || y0 >= old[3]) continue;
    for (
      let y = Math.max(old[1], Math.floor(y0));
      y < Math.min(old[3], Math.ceil(y1));
      y++
    )
      profile.set(y, Math.max(profile.get(y) ?? old[0], Math.ceil(x1) + 1));
  }
const rows = [];
const first = Math.min(...profile.keys()),
  last = Math.max(...profile.keys()) + 1;
for (let y = first; y < last; y++) {
  const x = profile.get(y) ?? old[0];
  const previous = rows.at(-1);
  if (previous && previous.right === x) previous.bottom = y + 1;
  else rows.push({ top: y, bottom: y + 1, right: x });
}
const polygon = [[old[0], first]];
for (const row of rows)
  polygon.push([row.right, row.top], [row.right, row.bottom]);
polygon.push([old[0], last]);
const record = {
  source: file,
  sourceSha256: createHash('sha256').update(input).digest('hex'),
  alphaThreshold: 128,
  margin: 1,
  old,
  rows,
  blockedPolygon: polygon,
  minWidth: old[2] - Math.max(...rows.map((r) => r.right)),
  removedArea: rows.reduce(
    (a, r) => a + (r.bottom - r.top) * (r.right - old[0]),
    0,
  ),
};
await writeFile(
  'src/render/main-corridor.json',
  await format(JSON.stringify(record), { parser: 'json' }),
);
console.log(JSON.stringify(record, null, 2));
