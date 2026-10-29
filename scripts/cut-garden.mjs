import sharp from 'sharp';
import { groundedCutout } from './grounded-cutout.mjs';
import { finishEdges } from './grounded-edge.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { format } from 'prettier';
const input = await readFile(
  `${homedir()}/cutwork/backup/garden_grounded_v1.jpg`,
);
const { rgba, w, h, bg, crop, anchor, anchorSource } =
  await groundedCutout(input);
const cut = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
  .extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] })
  .raw()
  .toBuffer();
const finished = finishEdges(cut, crop[2], crop[3], 1);
const encode = (data, w, h) =>
  execFileSync(
    'python3',
    ['scripts/encode-grounded.py', String(w), String(h)],
    { input: data, maxBuffer: 32 * 1024 * 1024 },
  );
const full = encode(finished, crop[2], crop[3]);
await writeFile('public/assets/building/garden-grounded@2x.webp', full);
export function inside([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = poly[i],
      [u, v] = poly[j];
    if (b > y !== v > y && x < ((u - a) * (y - b)) / (v - b) + a) c = !c;
  }
  return c;
}
// Conservative hand-traced stone rim and dark shadow, measured on world.webp.
const oldPad = [
  [541, 355],
  [577, 357],
  [636, 365],
  [679, 373],
  [690, 379],
  [686, 404],
  [678, 444],
  [670, 458],
  [637, 457],
  [574, 451],
  [523, 442],
  [515, 433],
  [520, 401],
  [530, 373],
];
const target = [603, 405],
  sourceCenter = [580, 486],
  offset = [2013, 521];
function padDistance(p, poly) {
  return Math.min(
    ...poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
        ),
      );
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    }),
  );
}
const samples = [];
for (let y = 350; y <= 463; y++)
  for (let x = 510; x <= 695; x++)
    if (
      inside([x + 0.5, y + 0.5], oldPad) ||
      padDistance([x + 0.5, y + 0.5], oldPad) <= 4
    )
      samples.push([x + 0.5, y + 0.5]);
let worldScale, map, meta, exportScale, covered;
for (let step = 487; step <= 650; step++) {
  worldScale = step / 1000;
  const width = Math.round(crop[2] * worldScale * 2);
  exportScale = width / crop[2];
  const resized = await sharp(finished, {
    raw: { width: crop[2], height: crop[3], channels: 4 },
  })
    .resize({ width })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = finishEdges(
    resized.data,
    resized.info.width,
    resized.info.height,
    1,
  );
  covered = samples.filter(([x, y]) => {
    const px = Math.floor(
        ((x - target[0]) / worldScale + sourceCenter[0] - crop[0]) *
          exportScale,
      ),
      py = Math.floor(
        ((y - target[1]) / worldScale + sourceCenter[1] - crop[1]) *
          exportScale,
      );
    return (
      px >= 0 &&
      py >= 0 &&
      px < resized.info.width &&
      py < resized.info.height &&
      pixels[(py * resized.info.width + px) * 4 + 3] >= 243
    );
  }).length;
  if (covered === samples.length) {
    map = encode(pixels, resized.info.width, resized.info.height);
    meta = await sharp(map).metadata();
    break;
  }
}
if (!map)
  throw Error('cannot cover measured old pad at expanded pad alpha >= .95');
const position = anchorSource.map(
  (v, c) =>
    +(offset[c] + target[c] + (v - sourceCenter[c]) * worldScale).toFixed(6),
);
const transform = (p) =>
  p.map(
    (v, c) =>
      +(offset[c] + target[c] + (v - sourceCenter[c]) * worldScale).toFixed(6),
  );
// Fence base contact polygon; includes the gate, so entry stops outside.
const fence = [
  [216, 447],
  [567, 224],
  [943, 451],
  [600, 699],
];
const footprint = fence.map(transform),
  entrance = transform([440, 601]);
// Outward normal to the left/front fence (south-west), 10 world px.
entrance[0] = +(entrance[0] - 5.49).toFixed(6);
entrance[1] = +(entrance[1] + 8.36).toFixed(6);
const half = Math.max(anchor.x, crop[2] - anchor.x) * worldScale;
const rect = [
  position[0] - half,
  position[1] - anchor.y * worldScale,
  position[0] + half,
  position[1],
].map((v) => +v.toFixed(6));
const g = {
  key: 'garden',
  id: 'B_GARDEN',
  sourceSize: [w, h],
  background: bg,
  crop,
  anchorSource,
  anchor,
  worldScale,
  exportScale,
  mapScale: worldScale / exportScale,
  position,
  oldBodyWidth: (943 - 216) * worldScale,
  bodySpan: [216, 943],
  footprint,
  entrance,
  rect,
  oldPad,
  target,
  sourceCenter,
  offset,
  covered,
  total: samples.length,
  sharedTiers: true,
  fenceSource: fence,
};
await writeFile(
  'scripts/garden-geometry.json',
  await format(JSON.stringify(g), { parser: 'json' }),
);
const manifest = JSON.parse(await readFile('public/assets/manifest.json'));
function upsert(e) {
  const i = manifest.files.findIndex((f) => f.file === e.file);
  if (i < 0) manifest.files.push(e);
  else manifest.files[i] = e;
}
upsert({
  file: 'building/garden-grounded@2x.webp',
  size: crop.slice(2),
  anchor,
  scale: 1,
  source: 'garden_grounded_v1.jpg',
  sourceSha256: createHash('sha256').update(input).digest('hex'),
  crop,
  grounded: true,
});
for (const tier of [1, 2]) {
  const file = `building/garden-t${tier}-map@2x.webp`;
  await writeFile('public/assets/' + file, map);
  upsert({
    file,
    size: [meta.width, meta.height],
    anchor: { x: anchor.x * exportScale, y: anchor.y * exportScale },
    source: 'building/garden-grounded@2x.webp',
    scale: exportScale,
    grounded: true,
    worldScale: g.mapScale,
    worldAnchor: { x: position[0], y: position[1] },
  });
}
await writeFile(
  'public/assets/manifest.json',
  await format(JSON.stringify(manifest), { parser: 'json' }),
);
let text = await readFile('data/world.json', 'utf8');
const world = JSON.parse(text),
  slot = world.slots.find((s) => s.id === 'B_GARDEN');
Object.assign(slot, {
  rect,
  front: entrance,
  entrance,
  footprint: { polygon: footprint },
});
const start = text.indexOf(
    '    {\n      "id": "B_GARDEN"',
    text.indexOf('  "slots":'),
  ),
  end = text.indexOf('\n    }', start) + 6;
text =
  text.slice(0, start) +
  (await format(JSON.stringify(slot), { parser: 'json' }))
    .trimEnd()
    .split('\n')
    .map((l) => '    ' + l)
    .join('\n') +
  text.slice(end);
await writeFile('data/world.json', text);
console.log(JSON.stringify(g, null, 2));
