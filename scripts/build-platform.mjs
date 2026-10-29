import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { format } from 'prettier';
import { finishEdges } from './grounded-edge.mjs';
const spec = JSON.parse(await readFile('scripts/platform-source.json'));
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
    if (
      spec.holes.some((h) => inside(p, h)) &&
      !spec.components.slice(5).some((poly) => inside(p, poly))
    )
      a = 0;
    // Hand-defined geometric feather on the three fading post feet, not a colour key.
    for (const [l, r, start, end] of [
      [246, 292, 480, 555],
      [390, 409, 550, 610],
      [552, 601, 716, 773],
      [861, 908, 480, 546],
    ])
      if (x >= l && x <= r && y > start)
        a *= Math.max(0, 1 - (y - start) / (end - start));
    data[i + 3] = Math.round(a * 255);
  }
const crop = [236, 120, 682, 655];
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
await writeFile('public/assets/bridge/platform-map@2x.webp', encoded);
const lengths = spec.deck.map((a, i) =>
  Math.hypot(
    a[0] - spec.deck[(i + 1) % 4][0],
    a[1] - spec.deck[(i + 1) % 4][1],
  ),
);
const scale = 50 / (lengths.reduce((a, b) => a + b) / 4);
const local = spec.deck.map((p) =>
  p.map((v, c) => (v - spec.anchor[c]) * scale),
);
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
      sideLengths: lengths.map((l) => l * scale),
      overlap: 9,
    };
  }),
);
const config = {
  file: 'bridge/platform-map@2x.webp',
  size: crop.slice(2),
  anchor: spec.anchor.map((v, c) => v - crop[c]),
  scale,
  deckLocal: local,
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
  platformDeck: spec.deck,
};
const index = manifest.files.findIndex((e) => e.file === f.file);
if (index < 0) manifest.files.push(f);
else manifest.files[index] = f;
await writeFile(
  'public/assets/manifest.json',
  await format(JSON.stringify(manifest), { parser: 'json' }),
);
console.log(JSON.stringify(config, null, 2));
