// Read existing sprites only. Semantic search windows isolate stone/rail/steps;
// opaque warm neutral/wood pixels determine their convex outer contour.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
const all = JSON.parse(await readFile('scripts/grounded-geometry.json'));
const garden = JSON.parse(await readFile('scripts/garden-geometry.json'));
const world = JSON.parse(await readFile('data/world.json'));
const discipleScale = Number(
  (await readFile('src/render/world-scale.ts', 'utf8')).match(
    /DISCIPLE_SCALE = ([0-9.]+)/,
  )[1],
);
const manifest = JSON.parse(await readFile('public/assets/manifest.json'));
const footMeasurements = [];
for (const f of manifest.files.filter(
  (f) =>
    f.file.startsWith('disciple/') &&
    f.file.includes('walk-') &&
    f.file.includes('-96'),
)) {
  const { data, info } = await sharp('public/assets/' + f.file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const xs = [];
  for (let y = f.anchor.y - 8; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 230) xs.push(x);
  footMeasurements.push({
    file: f.file,
    band: [f.anchor.y - 8, info.height],
    xRange: [Math.min(...xs), Math.max(...xs)],
    worldRadius:
      Math.max(...xs.map((x) => Math.abs(x - f.anchor.x))) * discipleScale,
  });
}
const radius = Math.ceil(
  Math.max(...footMeasurements.map((f) => f.worldRadius)) + 1,
);
const windows = {
  hall: [
    [310, 468],
    [535, 395],
    [861, 476],
    [865, 568],
    [663, 730],
    [622, 732],
    [491, 696],
    [462, 713],
    [350, 658],
    [382, 608],
    [310, 574],
  ],
  dorm: [
    [307, 490],
    [533, 431],
    [894, 508],
    [894, 574],
    [688, 710],
    [640, 715],
    [539, 662],
    [491, 680],
    [376, 623],
    [399, 586],
    [306, 569],
  ],
  meditation: [
    [314, 496],
    [538, 419],
    [879, 515],
    [878, 594],
    [668, 747],
    [630, 749],
    [526, 688],
    [489, 704],
    [398, 656],
    [420, 612],
    [315, 582],
  ],
  alchemy: [
    [310, 482],
    [627, 396],
    [893, 503],
    [891, 578],
    [591, 746],
    [560, 750],
    [476, 706],
    [446, 706],
    [351, 655],
    [380, 607],
    [309, 580],
  ],
};
function inside([x, y], p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    let [a, b] = p[i],
      [u, v] = p[j];
    if (b > y !== v > y && x < ((u - a) * (y - b)) / (v - b) + a) c = !c;
  }
  return c;
}
function hull(p) {
  p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (arr) => {
    const r = [];
    for (const q of arr) {
      while (r.length > 1 && cross(r.at(-2), r.at(-1), q) <= 0) r.pop();
      r.push(q);
    }
    return r;
  };
  return [...half(p).slice(0, -1), ...half([...p].reverse()).slice(0, -1)];
}
function inflate(p, r) {
  return hull(
    p.flatMap(([x, y]) =>
      Array.from({ length: 16 }, (_, i) => [
        x + (Math.cos((i * Math.PI) / 8) * r) / Math.cos(Math.PI / 16),
        y + (Math.sin((i * Math.PI) / 8) * r) / Math.cos(Math.PI / 16),
      ]),
    ),
  );
}
const result = [];
for (const g of all) {
  const file = `public/assets/building/${g.key}-grounded@2x.webp`;
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const picked = [];
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const sx = x + g.crop[0],
        sy = y + g.crop[1],
        i = (y * info.width + x) * 4;
      if (!inside([sx, sy], windows[g.key]) || data[i + 3] < 230) continue;
      const [r, gr, b] = data.subarray(i, i + 3);
      if (r >= gr + 3 && gr >= b + 3 && r - b > 15 && r - b < 155)
        picked.push([sx, sy]);
    }
  const sourceContour = hull([...picked, ...g.stoneSource]);
  const surface = sourceContour.map((p) =>
    p.map((v, c) => g.position[c] + (v - g.anchorSource[c]) * g.worldScale),
  );
  const polygon = inflate(surface, radius);
  const step = g.stepSource.map(
    (v, c) => g.position[c] + (v - g.anchorSource[c]) * g.worldScale,
  );
  let entrance = [step[0], step[1] + radius + 10];
  while (inside(entrance, polygon)) entrance[1]++;
  result.push({
    id: g.id,
    key: g.key,
    method:
      'alpha>=230 + warm stone/wood pixels within semantic search window; hull includes old stone corners',
    window: windows[g.key],
    samples: picked.length,
    sourceContour,
    surface,
    footprint: { polygon },
    entrance,
    sortY: Math.max(...surface.map((p) => p[1])),
    step,
    position: g.position,
  });
}
// Fence source envelope, verified against opaque wood pixels; preserve central gate opening separately.
const gardenImage = await sharp(
  'public/assets/building/garden-grounded@2x.webp',
)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const fencePixels = [];
function edgeDistance(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
      ),
    );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
for (let y = 0; y < gardenImage.info.height; y++)
  for (let x = 0; x < gardenImage.info.width; x++) {
    const p = [x + garden.crop[0], y + garden.crop[1]],
      i = (y * gardenImage.info.width + x) * 4;
    const [r, g, b, a] = gardenImage.data.subarray(i, i + 4);
    if (a < 230 || r < g + 12 || g < b + 12 || r > 190) continue;
    if (
      garden.fenceSource.some(
        (q, j) => edgeDistance(p, q, garden.fenceSource[(j + 1) % 4]) < 35,
      )
    )
      fencePixels.push(p);
  }
const fenceContour = hull([...fencePixels, ...garden.fenceSource]);
const gs = fenceContour.map((p) =>
  p.map(
    (v, c) =>
      garden.position[c] + (v - garden.anchorSource[c]) * garden.worldScale,
  ),
);
const gp = inflate(gs, radius);
const ge = [garden.entrance[0], garden.entrance[1] + radius + 10];
while (inside(ge, gp)) ge[1]++;
result.push({
  id: 'B_GARDEN',
  samples: fencePixels.length,
  sourceContour: fenceContour,
  key: 'garden',
  surface: gs,
  footprint: { polygon: gp },
  entrance: ge,
  sortY: Math.max(...gs.map((p) => p[1])),
  position: garden.position,
});
const gate = world.slots.find((s) => s.id === 'B_GATE');
const gateImage = await sharp('public/assets/map/gate-foreground.webp')
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const gateSamples = gate.footprint.map(([l, t, r, b]) => {
  let count = 0;
  for (let y = t; y <= b; y++)
    for (let x = l; x <= r; x++) {
      const i = ((y - 1060) * gateImage.info.width + x - 1470) * 4;
      const [red, green, blue, alpha] = gateImage.data.subarray(i, i + 4);
      if (alpha > 230 && red > green + 3 && green > blue + 3) count++;
    }
  return count;
});
const rects = gate.footprint.map(([l, t, r, b]) => [
  l - radius,
  t - radius,
  r + radius,
  b + radius,
]);
result.push({
  id: 'B_GATE',
  measuredOpaqueWingPixels: gateSamples,
  key: 'gate',
  surfaces: gate.footprint.map(([l, t, r, b]) => [
    [l, t],
    [r, t],
    [r, b],
    [l, b],
  ]),
  footprint: rects,
  entrance: [1566, 1200 + radius],
  sortY: 1200,
  position: [1569, 1132],
});
await writeFile(
  'src/render/pedestal-geometry.json',
  await format(
    JSON.stringify({ footRadius: radius, footMeasurements, buildings: result }),
    {
      parser: 'json',
    },
  ),
);
