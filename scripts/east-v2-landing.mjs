// Read-only pixel evidence and diagnostic annotation; never paints game artwork.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import { segments } from './bridge-geometry.mjs';
const source =
  process.env.EAST_ISLAND_SOURCE ??
  '/Volumes/Media/immortal-qa/design/art/concept/map_island_east_v2.png';
// Hand measured grass/cliff-top boundary in the v2 source, not the cliff face.
const grass = [
  [263, 526],
  [273, 515],
  [301, 504],
  [320, 501],
  [337, 492],
  [354, 496],
  [374, 487],
  [400, 477],
  [437, 465],
  [460, 480],
  [445, 513],
  [420, 524],
  [397, 532],
  [375, 545],
  [346, 558],
  [316, 566],
  [291, 560],
  [277, 549],
  [266, 540],
];
const world = JSON.parse(await readFile('data/world.json'));
const bridge = world.bridges.find((b) => b.id === 'east');
const { b: end, u } = segments(bridge).at(-1);
const localEnd = end.map((v, i) => v - [2013, 521][i]);
const { data, info } = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
function inside([x, y]) {
  let hit = false;
  for (let i = 0, j = grass.length - 1; i < grass.length; j = i++) {
    const [a, b] = grass[i],
      [c, d] = grass[j];
    if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a) hit = !hit;
  }
  return hit;
}
// Trace backwards from physical bridge tip along every 1px deck lane.
const lanes = [];
for (let side = -20; side <= 20; side++) {
  let depth = 0;
  for (let t = 0; t < 140; t += 0.25) {
    const p = [
      localEnd[0] - u[0] * t - u[1] * side,
      localEnd[1] - u[1] * t + u[0] * side,
    ];
    if (!inside(p)) break;
    const i = (Math.round(p[1]) * info.width + Math.round(p[0])) * 4;
    if (
      data[i + 3] !== 255 ||
      Math.hypot(data[i] - 241, data[i + 1] - 232, data[i + 2] - 212) < 45
    )
      break;
    depth = t;
  }
  lanes.push({ side, depth });
}
const placed = JSON.parse(await readFile('docs/bridge-build.json'))
  .placements.filter((p) => p.bridge === 'east')
  .at(-1);
const centerlineLength = Math.hypot(
  ...bridge.points.at(-1).map((v, i) => v - bridge.points.at(-2)[i]),
);
const rasterRetraction = Math.max(
  0,
  centerlineLength + 10 - placed.physicalAxialMax,
);
const result = {
  rasterRetraction,
  conservativeMinimumDepth:
    Math.min(...lanes.map((l) => l.depth)) - rasterRetraction - 2,
  source,
  sourceSize: [info.width, info.height],
  grassBoundaryLocal: grass,
  anchorWorld: bridge.points.at(-1),
  anchorLocal: bridge.points.at(-1).map((v, i) => v - [2013, 521][i]),
  physicalTipWorld: end,
  physicalTipLocal: localEnd,
  measurementStep: 0.25,
  boundaryUncertainty: 2,
  centerDepth: lanes[20].depth,
  minimumDeckDepth: Math.min(...lanes.map((l) => l.depth)),
  lanes,
};
await writeFile(
  'docs/east-v2-landing.json',
  await format(JSON.stringify(result), { parser: 'json' }),
);
const poly = grass.map((p) => p.join(',')).join(' ');
const svg = `<svg width="1280" height="720"><polygon points="${poly}" fill="none" stroke="#00dd88" stroke-width="1"/><circle cx="377" cy="508" r="3" fill="#ff0044"/><line x1="167" y1="529" x2="${localEnd[0]}" y2="${localEnd[1]}" stroke="#ff0044"/><text x="210" y="600" font-size="10">center ${result.centerDepth}px / deck min ${result.minimumDeckDepth}px</text><text x="210" y="615" font-size="10">conservative min ${result.conservativeMinimumDepth.toFixed(2)}px (raster + boundary margin)</text></svg>`;
const raw = await sharp(source)
  .composite([{ input: Buffer.from(svg) }])
  .png()
  .toBuffer();
const composed = await sharp('public/assets/map/world.webp')
  .extract({ left: 2213, top: 951, width: 320, height: 210 })
  .png()
  .toBuffer();
const annotated = await sharp(raw)
  .extract({ left: 200, top: 430, width: 320, height: 210 })
  .png()
  .toBuffer();
const panels = await sharp({
  create: { width: 320, height: 420, channels: 3, background: '#ffffff' },
})
  .composite([
    { input: annotated, left: 0, top: 0 },
    { input: composed, left: 0, top: 210 },
  ])
  .png()
  .toBuffer();
await sharp(panels)
  .resize(960, 1260)
  .png()
  .toFile('/tmp/xianfu-east-v2-landing.png');
console.log(result);
