// Source-pixel composition and geometry annotations only.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
const { findPath } = await tsImport('../src/render/world.ts', import.meta.url);
const g = JSON.parse(await readFile('src/render/main-corridor.json'));
const world = JSON.parse(await readFile('data/world.json'));
const b = JSON.parse(await readFile('docs/world-buildings.json')).find(
  (b) => b.file === g.source,
);
const f = JSON.parse(await readFile('public/assets/manifest.json')).files.find(
  (f) => f.file === g.source,
);
const input = await sharp('public/assets/' + g.source)
  .resize({ width: Math.round(f.size[0] * b.scale) })
  .png()
  .toBuffer();
const image = await sharp('public/assets/map/world.webp')
  .composite([
    {
      input,
      left: Math.round(b.x - f.anchor.x * b.scale),
      top: Math.round(b.y - f.anchor.y * b.scale),
    },
  ])
  .png()
  .toBuffer();
const path = findPath([1575, 735], [1590, 1050]);
const points = (p) => p.map((p) => p.join(',')).join(' ');
const hall = world.slots.find((s) => s.id === 'B_HALL');
const left = [
  [1555, 735],
  [1555, g.rows[0].top],
  ...g.rows.flatMap((r) => [
    [r.right, r.top],
    [r.right, r.bottom],
  ]),
  [1555, g.rows.at(-1).bottom],
  [1555, 1050],
];
const svg = `<svg width="3200" height="1400"><rect x="1555" y="735" width="95" height="315" fill="none" stroke="#06c" stroke-width="2" stroke-dasharray="5 4"/><polygon points="${points(g.blockedPolygon)}" fill="#e44" fill-opacity=".45"/><polyline points="${points(left)}" fill="none" stroke="#090" stroke-width="2"/><polygon points="${points(hall.footprint.polygon)}" fill="none" stroke="#f80" stroke-width="2"/><polyline points="${points(path)}" fill="none" stroke="#c0c" stroke-width="2"/><text x="1290" y="1090" font-size="14">blue: old / green: new / orange: stone / magenta: path</text><text x="1290" y="1110" font-size="14">minimum width ${g.minWidth}px; passage requirement 28px; blocked ${g.removedArea}px2</text></svg>`;
const annotated = await sharp(image)
  .composite([{ input: Buffer.from(svg) }])
  .png()
  .toBuffer();
await sharp(annotated)
  .extract({ left: 1280, top: 700, width: 420, height: 430 })
  .resize({ width: 840 })
  .png()
  .toFile('/tmp/xianfu-corridor.png');
console.log({
  minWidth: g.minWidth,
  removedArea: g.removedArea,
  range: [g.rows[0].top, g.rows.at(-1).bottom],
  path,
});
