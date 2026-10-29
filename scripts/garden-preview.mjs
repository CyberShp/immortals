import sharp from 'sharp';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { format } from 'prettier';
import { tsImport } from 'tsx/esm/api';
const { insideGroundedBody, groundedLayer } = await tsImport(
  '../src/render/grounded-layers.ts',
  import.meta.url,
);
const { walkable, findPath } = await tsImport(
  '../src/render/world.ts',
  import.meta.url,
);
const buildSource = await readFile('scripts/build-world.mjs', 'utf8');
const eastSource = buildSource.slice(buildSource.indexOf("id: 'east'"));
const envelope = JSON.parse(
  eastSource
    .match(/envelope:\s*(\[[\s\S]*?\n    \]),/)[1]
    .replace(/,\s*]/g, ']'),
);
let outsideEnvelope = 0;
const g = JSON.parse(await readFile('scripts/garden-geometry.json'));
const world = JSON.parse(await readFile('data/world.json')),
  east = world.islands.find((i) => i.id === 'east');
const manifest = JSON.parse(await readFile('public/assets/manifest.json'));
const f = manifest.files.find(
  (f) => f.file === 'building/garden-t1-map@2x.webp',
);
const { data, info } = await sharp('public/assets/' + f.file)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
function inside([x, y], p) {
  return insideGroundedBody(x, y, p);
}
const steps = [
  [
    [594, 294],
    [626, 301],
    [611, 337],
    [581, 331],
  ],
  [
    [712, 334],
    [737, 348],
    [713, 367],
    [696, 359],
  ],
];
// Hand-traced creek water strip, separate from the broad pre-existing rock/stream obstacle.
const creek = [
  [776, 236],
  [788, 248],
  [774, 273],
  [776, 295],
  [767, 311],
  [784, 329],
  [783, 350],
  [812, 369],
  [818, 386],
  [796, 391],
  [772, 375],
  [761, 352],
  [762, 331],
  [747, 317],
  [753, 294],
  [755, 273],
  [763, 255],
];
let creekHits = 0;
const stepHits = [0, 0];
const violation = [],
  counts = {
    outsideWalkable: 0,
    bridge: 0,
    obstacles: Array(east.obstacles.length).fill(0),
  };
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
let opaque = 0,
  covered = 0,
  total = 0;
for (let y = 350; y <= 463; y++)
  for (let x = 510; x <= 695; x++)
    if (
      inside([x + 0.5, y + 0.5], g.oldPad) ||
      padDistance([x + 0.5, y + 0.5], g.oldPad) <= 4
    ) {
      total++;
      const px = Math.floor(
          ((x + 0.5 - g.target[0]) / g.worldScale +
            g.sourceCenter[0] -
            g.crop[0]) *
            g.exportScale,
        ),
        py = Math.floor(
          ((y + 0.5 - g.target[1]) / g.worldScale +
            g.sourceCenter[1] -
            g.crop[1]) *
            g.exportScale,
        );
      if (data[(py * info.width + px) * 4 + 3] >= 243) covered++;
    }
for (let y = 0; y < info.height; y++)
  for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 13) continue;
    opaque++;
    const p = [
      g.position[0] + (x - f.anchor.x) * g.mapScale - g.offset[0],
      g.position[1] + (y - f.anchor.y) * g.mapScale - g.offset[1],
    ];
    if (!inside(p, envelope)) outsideEnvelope++;
    if (inside(p, creek)) {
      creekHits++;
      violation.push(p);
    }
    steps.forEach((poly, i) => {
      if (inside(p, poly)) {
        stepHits[i]++;
        violation.push(p);
      }
    });
    if (!inside(p, east.walkable)) {
      counts.outsideWalkable++;
      violation.push(p);
    }
    for (let i = 0; i < east.obstacles.length; i++)
      if (inside(p, east.obstacles[i])) {
        counts.obstacles[i]++;
        violation.push(p);
      }
    // Existing east bridge landing neighborhood, local x 337..420, y 472..535.
    if (p[0] >= 337 && p[0] <= 420 && p[1] >= 472 && p[1] <= 535) {
      counts.bridge++;
      violation.push(p);
    }
  }
const edges = [];
for (const suffix of ['grounded', 't1-map', 't2-map']) {
  const { data: d } = await sharp(
    `public/assets/building/garden-${suffix}@2x.webp`,
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let n = 0,
    beige = 0,
    dist = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 13 || d[i + 3] > 242) continue;
    n++;
    const v = Math.hypot(...g.background.map((b, c) => d[i + c] - b));
    dist += v;
    if (
      Math.min(v, Math.hypot(d[i] - 241, d[i + 1] - 232, d[i + 2] - 212)) < 30
    )
      beige++;
  }
  edges.push({
    suffix,
    pixels: n,
    beigeRatio: beige / n,
    meanBackgroundDistance: dist / n,
  });
}
const report = {
  coverage: { covered, total, ratio: covered / total, alphaMinimum: 243 },
  areaPerPixel: g.mapScale ** 2,
  opaqueArea: opaque * g.mapScale ** 2,
  counts,
  creek: {
    polygon: creek,
    pixels: creekHits,
    area: creekHits * g.mapScale ** 2,
  },
  outsideIslandEnvelopeArea: outsideEnvelope * g.mapScale ** 2,
  outsideWalkableArea: counts.outsideWalkable * g.mapScale ** 2,
  obstacleAreas: counts.obstacles.map((n) => n * g.mapScale ** 2),
  importantSteps: {
    polygons: steps,
    pixels: stepHits,
    area: stepHits.map((n) => n * g.mapScale ** 2),
  },
  edges,
  entranceWalkable: walkable(g.entrance),
  path: findPath([1590, 1050], g.entrance),
  layer: groundedLayer(f.file).points,
};
await writeFile(
  'docs/garden-grounded-report.json',
  await format(JSON.stringify(report), { parser: 'json' }),
);
const crop = { left: 2300, top: 720, width: 750, height: 500 };
const sprite = await sharp('public/assets/' + f.file)
  .resize({ width: Math.round(info.width * g.mapScale) })
  .png()
  .toBuffer();
await sharp('public/assets/map/world.webp')
  .extract(crop)
  .composite([
    {
      input: sprite,
      left: Math.round(g.position[0] - f.anchor.x * g.mapScale - crop.left),
      top: Math.round(g.position[1] - f.anchor.y * g.mapScale - crop.top),
    },
  ])
  .png()
  .toFile('/tmp/xianfu-grounded-garden-east.png');
const points = (p) =>
  p
    .map(([x, y]) =>
      [x + g.offset[0] - crop.left, y + g.offset[1] - crop.top].join(','),
    )
    .join(' ');
let svg = `<svg width="750" height="500"><polygon points="${points(g.oldPad)}" stroke="#f0f" fill="none"/><polygon points="${points(east.walkable)}" stroke="#08c" fill="none"/><polygon points="${g.footprint.map(([x, y]) => [x - crop.left, y - crop.top].join(',')).join(' ')}" stroke="#f80" fill="none"/><circle cx="${g.entrance[0] - crop.left}" cy="${g.entrance[1] - crop.top}" r="3" fill="#0f0"/>`;
for (const p of [...east.obstacles, ...steps, creek])
  svg += `<polygon points="${points(p)}" stroke="#e33" fill="none"/>`;
for (const [x, y] of violation)
  svg += `<rect x="${x + g.offset[0] - crop.left}" y="${y + g.offset[1] - crop.top}" width=".5" height=".5" fill="#f00"/>`;
svg += '</svg>';
await sharp('/tmp/xianfu-grounded-garden-east.png')
  .composite([{ input: Buffer.from(svg) }])
  .png()
  .toFile('/tmp/xianfu-grounded-garden-overlap.png');
await mkdir('artifacts', { recursive: true });
await copyFile(
  '/tmp/xianfu-grounded-garden-overlap.png',
  'artifacts/xianfu-grounded-garden-overlap.png',
);
console.log(JSON.stringify(report, null, 2));
