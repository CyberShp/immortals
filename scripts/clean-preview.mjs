// Static diagnostic composition: existing art only; SVG contains geometry annotations and shadows.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const world = JSON.parse(await readFile('data/world.json'));
const buildings = JSON.parse(await readFile('docs/world-buildings.json'));
const manifest = JSON.parse(await readFile('public/assets/manifest.json'));
const layers = [];
const svg = (body) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">${body}</svg>`,
  );
let shadows = '';
for (const b of buildings
  .filter((b) => b.file.includes('t1') && !b.file.includes('garden'))
  .sort((a, b) => a.bodyBottom - b.bodyBottom)) {
  const f = manifest.files.find((f) => f.file === b.file);
  const x = b.x - 950,
    y = b.y - 620;
  if (!b.grounded)
    shadows += `<ellipse cx="${x}" cy="${b.bodyBottom - 620 + 3}" rx="${(b.bodyWidth * 1.05) / 2}" ry="${(b.bodyWidth * 1.05 * 0.18) / 2}" fill="#3b2a1a" opacity=".27"/>`;
  layers.push({
    input: await sharp('public/assets/' + b.file)
      .resize({ width: Math.round(f.size[0] * b.scale) })
      .png()
      .toBuffer(),
    left: Math.round(x - f.anchor.x * b.scale),
    top: Math.round(y - f.anchor.y * b.scale),
  });
}
const main = world.islands[0];
let overlay = `<polygon points="${main.walkable.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#26a6dd" stroke-width="2"/>`;
for (const poly of main.obstacles)
  overlay += `<polygon points="${poly.map((p) => p.join(',')).join(' ')}" fill="#ff6600" fill-opacity=".18" stroke="#f60"/>`;
for (const s of world.slots.filter((s) => s.id !== 'B_GARDEN')) {
  const polygons = s.footprint.polygon
    ? [s.footprint.polygon]
    : (typeof s.footprint[0] === 'number' ? [s.footprint] : s.footprint).map(
        ([l, t, r, b]) => [
          [l, t],
          [r, t],
          [r, b],
          [l, b],
        ],
      );
  for (const poly of polygons)
    overlay += `<polygon points="${poly.map(([x, y]) => [x - 950, y - 620].join(',')).join(' ')}" fill="#f33" fill-opacity=".16" stroke="#d22"/><circle cx="${s.entrance[0] - 950}" cy="${s.entrance[1] - 620}" r="4" fill="#1b5"/>`;
}
overlay +=
  '<rect x="605" y="115" width="95" height="315" fill="#33eeaa" fill-opacity=".12" stroke="#088"/><circle cx="640" cy="430" r="6" fill="none" stroke="#088"/>';
overlay +=
  '<rect x="589" y="490" width="54" height="110" fill="#33eeaa" fill-opacity=".15" stroke="#088"/><path d="M616 490 V600" fill="none" stroke="#088" stroke-dasharray="4 3"/>';
await sharp('public/assets/map/world.webp')
  .extract({ left: 950, top: 620, width: 1280, height: 720 })
  .composite([{ input: svg(shadows) }, ...layers, { input: svg(overlay) }])
  .png()
  .toFile('/tmp/xianfu-clean-preview.png');
