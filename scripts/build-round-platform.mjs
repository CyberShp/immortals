import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { format } from 'prettier';
import { finishEdges } from './grounded-edge.mjs';
const spec = JSON.parse(await readFile('scripts/round-platform-source.json'));
const world = JSON.parse(await readFile('data/world.json'));
function inside([x, y], p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [a, b] = p[i],
      [u, v] = p[j];
    if (b > y !== v > y && x < ((u - a) * (y - b)) / (v - b) + a) c = !c;
  }
  return c;
}
function distance(p, poly) {
  return Math.min(
    ...poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        t = Math.max(
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
const { data, info } = await sharp(spec.source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (info.width !== spec.size[0] || info.height !== spec.size[1])
  throw Error('source size changed');
for (let y = 0; y < info.height; y++)
  for (let x = 0; x < info.width; x++) {
    const p = [x + 0.5, y + 0.5],
      i = (y * info.width + x) * 4;
    let a = Math.max(
      0,
      ...spec.components.map((poly) =>
        inside(p, poly) ? Math.min(1, distance(p, poly) / spec.feather) : 0,
      ),
    );
    // Geometric fades preserve the source's fading beams without colour keying.
    for (const [l, r, start, end] of spec.fades)
      if (x >= l && x <= r && y > start)
        a *= Math.max(0, 1 - (y - start) / (end - start));
    if (spec.holes.some((h) => inside(p, h))) a = 0;
    data[i + 3] = Math.round(a * 255);
  }
const crop = spec.crop;
const cut = await sharp(data, { raw: info })
  .extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] })
  .raw()
  .toBuffer();
const pixels = finishEdges(cut, crop[2], crop[3], 1);
const encoded = execFileSync(
  'python3',
  ['scripts/encode-grounded.py', String(crop[2]), String(crop[3])],
  { input: pixels, maxBuffer: 10e6 },
);
await mkdir('public/assets/bridge', { recursive: true });
await writeFile('public/assets/bridge/platform-round.webp', encoded);
const bridgePostWorldSamples = spec.bridgePostMeasurements.flatMap((m) =>
  m.ranges.map(([a, b]) => ((b - a) * 40) / m.walkableWidth),
);
const bridgePostWorld =
  bridgePostWorldSamples.reduce((a, b) => a + b) /
  bridgePostWorldSamples.length;
const postDiameter =
  spec.postMeasurements.reduce((a, p) => a + p.diameter, 0) /
  spec.postMeasurements.length;
const scale = bridgePostWorld / postDiameter;
const local = Array.from({ length: 64 }, (_, i) => [
  Math.cos((i * Math.PI) / 32) * spec.ellipse[0] * scale,
  Math.sin((i * Math.PI) / 32) * spec.ellipse[1] * scale,
]);
const joints = world.bridges.flatMap((b) =>
  b.points.slice(1, -1).map((center, i) => {
    const prev = b.points[i],
      next = b.points[i + 2];
    const angle = (a, z) =>
      (Math.atan2(z[1] - a[1], z[0] - a[0]) * 180) / Math.PI;
    return {
      id: b.id,
      center,
      referenceIsland: b.id === 'west' ? 'main' : 'east',
      islandLocal: center.map(
        (v, c) => v - (b.id === 'west' ? [950, 620] : [2013, 521])[c],
      ),
      angles: [angle(prev, center), angle(center, next)],
      polygon: local.map((p) => p.map((v, c) => v + center[c])),
      scale,
      overlap: 25,
    };
  }),
);
const config = {
  file: 'bridge/platform-round.webp',
  size: crop.slice(2),
  anchor: spec.anchor.map((v, c) => v - crop[c]),
  scale,
  deckLocal: local,
  baked: true,
  overlap: 25,
  bridgePostWorld,
  bridgePostWorldSamples,
  postDiameterWorld: postDiameter * scale,
  deckWidth: spec.ellipse[0] * 2 * scale,
  deckRatio: (spec.ellipse[0] * 2 * scale) / 40,
  targetDeckScale: 60 / (spec.ellipse[0] * 2),
  targetDeckPostRatio:
    ((60 / (spec.ellipse[0] * 2)) * postDiameter) / bridgePostWorld,
  posts: spec.postMeasurements.map((p) => ({
    ...p,
    local: p.center.map((v, c) => (v - spec.anchor[c]) * scale),
  })),
  joints,
  northScreenshot: [1575, 735],
};
await writeFile(
  'scripts/platform-geometry.json',
  await format(JSON.stringify(config), { parser: 'json' }),
);
const manifest = JSON.parse(await readFile('public/assets/manifest.json'));
const f = {
  file: config.file,
  size: config.size,
  anchor: { x: config.anchor[0], y: config.anchor[1] },
  scale: 1,
  source: spec.source,
  crop,
  platformDeck: local,
};
manifest.files = manifest.files.filter(
  (e) => e.file !== 'bridge/platform-map@2x.webp',
);
const index = manifest.files.findIndex((e) => e.file === f.file);
if (index < 0) manifest.files.push(f);
else manifest.files[index] = f;
await writeFile(
  'public/assets/manifest.json',
  await format(JSON.stringify(manifest), { parser: 'json' }),
);
console.log(JSON.stringify(config, null, 2));
