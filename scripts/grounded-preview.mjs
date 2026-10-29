// Static original-art composition plus diagnostic vectors; no painted art.
import sharp from 'sharp';
import { tsImport } from 'tsx/esm/api';
const { groundedLayer, insideGroundedBody } = await tsImport(
  '../src/render/grounded-layers.ts',
  import.meta.url,
);
const { walkable } = await tsImport('../src/render/world.ts', import.meta.url);
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { format } from 'prettier';
const geometry = JSON.parse(await readFile('scripts/grounded-geometry.json'));
const manifest = JSON.parse(await readFile('public/assets/manifest.json'));
const placements = JSON.parse(await readFile('docs/world-buildings.json'));
const world = JSON.parse(await readFile('data/world.json'));
function inside([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = poly[i],
      [u, v] = poly[j];
    if (b > y !== v > y && x < ((u - a) * (y - b)) / (v - b) + a) c = !c;
  }
  return c;
}
const crop = { left: 950, top: 620, width: 1280, height: 720 };
const layers = [],
  groundLayers = [],
  images = [],
  report = [];
for (const g of geometry) {
  const file = `building/${g.key}-t1-map@2x.webp`,
    f = manifest.files.find((f) => f.file === file),
    b = placements.find((b) => b.file === file);
  const decoded = await sharp('public/assets/' + file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  images.push({ g, f, b, ...decoded });
  const split = groundedLayer(file);
  let relieved = 0,
    corridorRelieved = 0;
  for (const body of [false, true]) {
    const pixels = Buffer.from(decoded.data);
    for (let y = 0; y < decoded.info.height; y++)
      for (let x = 0; x < decoded.info.width; x++) {
        const dx = (x - f.anchor.x) * b.scale,
          dy = (y - f.anchor.y) * b.scale;
        const keepBody = insideGroundedBody(dx, dy, split.points);
        if (
          !body &&
          !keepBody &&
          pixels[(y * decoded.info.width + x) * 4 + 3] >= 128 &&
          dy < 0 &&
          walkable([b.x + dx, b.y + dy])
        ) {
          relieved++;
          if (
            b.x + dx >= 1555 &&
            b.x + dx <= 1650 &&
            b.y + dy >= 735 &&
            b.y + dy <= 1050
          )
            corridorRelieved++;
        }
        if (keepBody !== body) pixels[(y * decoded.info.width + x) * 4 + 3] = 0;
      }
    (body ? layers : groundLayers).push({
      input: await sharp(pixels, {
        raw: {
          width: decoded.info.width,
          height: decoded.info.height,
          channels: 4,
        },
      })
        .resize({ width: Math.round(f.size[0] * b.scale) })
        .png()
        .toBuffer(),
      left: Math.round(b.x - f.anchor.x * b.scale - 950),
      top: Math.round(b.y - f.anchor.y * b.scale - 620),
    });
  }
  const full = await sharp(`public/assets/building/${g.key}-grounded@2x.webp`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0,
    sum = 0,
    residue = 0,
    shadow = 0;
  const mean = [0, 0, 0];
  for (let i = 0; i < full.data.length; i += 4) {
    const a = full.data[i + 3] / 255,
      rgb = [...full.data.subarray(i, i + 3)];
    if (a >= 0.05 && a <= 0.95) {
      count++;
      sum += Math.hypot(...rgb.map((v, c) => v - g.background[c]));
      rgb.forEach((v, c) => (mean[c] += v));
      if (
        Math.min(
          Math.hypot(...rgb.map((v, c) => v - g.background[c])),
          Math.hypot(rgb[0] - 241, rgb[1] - 232, rgb[2] - 212),
        ) < 30
      )
        residue++;
      const x = ((i / 4) % full.info.width) + g.crop[0],
        y = Math.floor(i / 4 / full.info.width) + g.crop[1];
      if (x > g.bodySpan[1] && y > 500 && a < 0.35 && Math.max(...rgb) < 150)
        shadow++;
    }
  }
  report.push({
    key: g.key,
    occlusion: {
      relievedWalkablePixels: relieved,
      relievedCorridorPixels: corridorRelieved,
      sampleWorldArea: b.scale * b.scale,
      alphaMinimum: 128,
    },
    edge: {
      pixels: count,
      meanRGB: mean.map((v) => v / count),
      meanPixelBackgroundDistance: sum / count,
      meanColorBackgroundDistance: Math.hypot(
        ...mean.map((v, c) => v / count - g.background[c]),
      ),
      beigeWithin30Ratio: residue / count,
      exteriorShadowPixels: shadow,
    },
  });
}
let vectors =
  '<rect x="605" y="115" width="95" height="315" fill="none" stroke="#07b" stroke-width="2"/>';
const pairwise = [];
for (const image of images) {
  const { g, f, b, data, info } = image,
    entry = report.find((r) => r.key === g.key);
  let outside = 0,
    corridor = 0,
    totalGround = 0;
  const bad = [];
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 13) continue;
      const wx = b.x + (x - f.anchor.x) * b.scale,
        wy = b.y + (y - f.anchor.y) * b.scale;
      const sy = g.crop[1] + y / g.exportScale;
      // Conservative visible ground band: lower source region outside the measured stone base.
      if (sy >= 500 && !inside([wx, wy], g.footprint)) {
        totalGround++;
        if (!inside([wx - 950, wy - 620], world.islands[0].walkable)) {
          outside++;
          bad.push([wx, wy]);
        }
        if (wx >= 1555 && wx <= 1650 && wy >= 735 && wy <= 1050) {
          corridor++;
          bad.push([wx, wy]);
        }
      }
    }
  entry.ground = {
    definition:
      'source y>=500 outside stone polygon, alpha>=0.05; conservative ground/shrub band',
    area: totalGround * b.scale * b.scale,
    outsideWalkableArea: outside * b.scale * b.scale,
    corridorArea: corridor * b.scale * b.scale,
  };
  if (bad.length) {
    const xs = bad.map((p) => p[0]),
      ys = bad.map((p) => p[1]);
    entry.violationBounds = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];
    const [l, t, r, bt] = entry.violationBounds;
    vectors += `<rect x="${l - 950}" y="${t - 620}" width="${r - l}" height="${bt - t}" stroke="#e22" fill="none" stroke-width="2"/>`;
  }
  vectors += `<polygon points="${g.footprint.map((p) => [p[0] - 950, p[1] - 620].join(',')).join(' ')}" stroke="#e80" fill="none" stroke-width="1.5"/><circle cx="${g.entrance[0] - 950}" cy="${g.entrance[1] - 620}" r="3" fill="#0a5"/><text x="${g.position[0] - 950}" y="${g.position[1] - 620 + 15}" font-size="12">${g.key}</text>`;
  for (const other of images.filter((o) => o.g.key > g.key)) {
    let pixels = 0;
    const hits = [];
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] < 13) continue;
        const wx = b.x + (x - f.anchor.x) * b.scale,
          wy = b.y + (y - f.anchor.y) * b.scale;
        const ox = Math.round(
            (wx - other.b.x) / other.b.scale + other.f.anchor.x,
          ),
          oy = Math.round((wy - other.b.y) / other.b.scale + other.f.anchor.y);
        if (
          ox >= 0 &&
          oy >= 0 &&
          ox < other.info.width &&
          oy < other.info.height &&
          other.data[(oy * other.info.width + ox) * 4 + 3] >= 13
        ) {
          pixels++;
          hits.push([wx, wy]);
        }
      }
    pairwise.push({
      a: g.key,
      b: other.g.key,
      alphaOverlapArea: pixels * b.scale * b.scale,
    });
    if (hits.length) {
      const xs = hits.map((p) => p[0]),
        ys = hits.map((p) => p[1]);
      vectors += `<rect x="${Math.min(...xs) - 950}" y="${Math.min(...ys) - 620}" width="${Math.max(...xs) - Math.min(...xs)}" height="${Math.max(...ys) - Math.min(...ys)}" stroke="#d0c" fill="none" stroke-width="2"/>`;
    }
  }
}
await sharp('public/assets/map/world.webp')
  .extract(crop)
  .composite([...groundLayers, ...layers])
  .png()
  .toFile('/tmp/xianfu-grounded-main.png');
vectors +=
  '<polygon points="' +
  world.islands[0].walkable.map((p) => p.join(',')).join(' ') +
  '" fill="none" stroke="#08c" stroke-width="1"/>';
await sharp('/tmp/xianfu-grounded-main.png')
  .composite([
    { input: Buffer.from(`<svg width="1280" height="720">${vectors}</svg>`) },
  ])
  .png()
  .toFile('/tmp/xianfu-grounded-overlap.png');
await mkdir('artifacts', { recursive: true });
await copyFile(
  '/tmp/xianfu-grounded-overlap.png',
  'artifacts/xianfu-grounded-overlap.png',
);
await writeFile(
  'docs/grounded-report.json',
  await format(
    JSON.stringify({
      buildings: report,
      pairwise,
      thresholds: {
        edgeAlpha: [0.05, 0.95],
        minMeanPixelDistance: 60,
        maxBeigeRatio: 0.01,
        sourceFeather: 7,
      },
    }),
    { parser: 'json' },
  ),
);
console.log(JSON.stringify({ buildings: report, pairwise }, null, 2));

const cutouts = [];
for (const [i, g] of geometry.entries())
  cutouts.push({
    input: await sharp(`public/assets/building/${g.key}-grounded@2x.webp`)
      .resize({ width: 380, height: 380, fit: 'inside' })
      .flatten({ background: '#608060' })
      .png()
      .toBuffer(),
    left: (i % 2) * 400 + 10,
    top: Math.floor(i / 2) * 400 + 10,
  });
await sharp({
  create: { width: 800, height: 800, channels: 3, background: '#608060' },
})
  .composite(cutouts)
  .png()
  .toFile('/tmp/xianfu-grounded-cutouts.png');
