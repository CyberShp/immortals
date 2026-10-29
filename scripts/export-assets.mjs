import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  stat,
  readdir,
} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { format } from 'prettier';
import { tsImport } from 'tsx/esm/api';
const { plots, buildingScale, meditationProtected } = await tsImport(
  '../src/render/layout.ts',
  import.meta.url,
);
const { overlapPixels } = await tsImport(
  '../src/render/visibility.ts',
  import.meta.url,
);
const source = '/Volumes/Media/immortal-qa/design/art/assets';
const output = new URL('../public/assets/', import.meta.url);
const input = JSON.parse(
  await readFile(path.join(source, 'manifest.json'), 'utf8'),
);
const files = [];
for (const item of input.files.filter(
  (f) =>
    f.file.endsWith('.webp') &&
    (['map', 'building', 'accessory'].includes(f.category) ||
      (f.category === 'disciple' &&
        ['walk-step', 'walk-pass', 'meditate', 'work', 'talk'].includes(
          f.name,
        ))),
)) {
  const src =
    item.name.startsWith('garden-') && process.env.GARDEN_SOURCE_DIR
      ? path.join(process.env.GARDEN_SOURCE_DIR, path.basename(item.file))
      : path.join(source, item.file);
  await mkdir(new URL(`${item.category}/`, output), { recursive: true });
  await copyFile(src, new URL(item.file, output));
  files.push({
    file: item.file,
    size: item.size,
    anchor: { x: item.anchor.x, y: item.anchor.y },
    scale: 1,
    ...(item.footprint
      ? {
          footprint: item.footprint,
          sha256: createHash('sha256')
            .update(await readFile(src))
            .digest('hex'),
        }
      : {}),
    ...(item.measure
      ? {
          measure: item.measure,
          crop: item.crop,
          sha256: createHash('sha256')
            .update(await readFile(src))
            .digest('hex'),
        }
      : {}),
    source: item.file,
  });
  if (item.category === 'map') continue;
  let scale =
    item.category === 'disciple'
      ? 96 / item.size[1]
      : item.category === 'accessory'
        ? 48 / Math.max(...item.size)
        : (plots[item.name.split('-')[0]][2] -
            plots[item.name.split('-')[0]][0]) /
          item.size[0];
  const key = item.name.split('-')[0];
  let downshift = 0,
    overlap = 0;
  if (item.category === 'building') {
    scale = key === 'garden' ? 1 : buildingScale(key, item.size[0]).scale;
    if (key === 'alchemy') {
      const collisionMasks = new Map();
      async function collision(s, dy) {
        let mask = collisionMasks.get(s);
        if (!mask) {
          const width = Math.round(item.size[0] * s),
            height = Math.round(item.size[1] * s);
          const encoded = await sharp(src)
            .resize(width, height, { kernel: 'lanczos3' })
            .webp({ quality: 90, alphaQuality: 100, effort: 6 })
            .toBuffer();
          const { data, info } = await sharp(encoded)
            .resize(Math.round(width / 2), Math.round(height / 2))
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          const alpha = Uint8Array.from(
            { length: info.width * info.height },
            (_, i) => data[i * 4 + 3],
          );
          mask = {
            width: info.width,
            height: info.height,
            alpha,
            anchorX: Math.round(item.anchor.x * s) / 2,
            anchorY: Math.round(item.anchor.y * s) / 2,
          };
          collisionMasks.set(s, mask);
        }
        return overlapPixels(mask, 381, 217.5 + dy, meditationProtected);
      }

      overlap = await collision(scale, 0);
      if (overlap) {
        scale = buildingScale(key, item.size[0]).widthScale * 0.95;
        while (
          (overlap = await collision(scale, downshift)) > 0 &&
          downshift < 24
        )
          downshift++;
      }
    }
  }
  const suffix = { disciple: '96', accessory: '48', building: 'map' }[
    item.category
  ];
  const file = `${item.category}/${item.name}-${suffix}@2x.webp`;
  const size = [
    Math.round(item.size[0] * scale),
    Math.round(item.size[1] * scale),
  ];
  const pipeline = sharp(src);
  await pipeline
    .resize(...size, { kernel: 'lanczos3' })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(new URL(file, output).pathname);
  let collisionDetails = {};
  if (key === 'alchemy' && item.category === 'building') {
    const { data, info } = await sharp(new URL(file, output).pathname)
      .resize(Math.round(size[0] / 2), Math.round(size[1] / 2))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const mask = {
      width: info.width,
      height: info.height,
      anchorX: Math.round(item.anchor.x * scale) / 2,
      anchorY: Math.round(item.anchor.y * scale) / 2,
      alpha: Uint8Array.from(
        { length: info.width * info.height },
        (_, i) => data[i * 4 + 3],
      ),
    };
    const originX = 381 - mask.anchorX,
      originY = 217.5 + downshift - mask.anchorY;
    const points = [];
    let bottom = -Infinity;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        if (!mask.alpha[y * info.width + x]) continue;
        bottom = Math.max(bottom, originY + y + 1);
        const wx = originX + x + 0.5,
          wy = originY + y + 0.5;
        const b = meditationProtected[0];
        if (wx >= b.x && wx < b.x + b.width && wy >= b.y && wy < b.y + b.height)
          points.push([wx, wy]);
      }
    collisionDetails = {
      plotOverlapPixels: overlapPixels(mask, 381, 217.5 + downshift, [
        meditationProtected[0],
      ]),
      labelOverlapPixels: overlapPixels(mask, 381, 217.5 + downshift, [
        meditationProtected[1],
      ]),
      plotOverlapBounds: points.length
        ? [
            Math.min(...points.map((p) => p[0])),
            Math.min(...points.map((p) => p[1])),
            Math.max(...points.map((p) => p[0])),
            Math.max(...points.map((p) => p[1])),
          ]
        : null,
      opaqueBottom: bottom,
      cliffThreshold: 235,
      extendsOntoCliff: bottom >= 235,
    };
  }
  files.push({
    file,
    size,
    anchor: {
      x:
        item.category === 'accessory'
          ? size[0] / 2
          : Math.round(item.anchor.x * scale),
      y:
        item.category === 'accessory'
          ? size[1] / 2
          : Math.round(item.anchor.y * scale),
    },
    ...(item.category === 'building'
      ? {
          ...buildingScale(key, item.size[0], scale),
          downshift,
          overlapPixels: overlap,
          ...collisionDetails,
          ...(item.footprint ? { footprint: item.footprint } : {}),
        }
      : { scale }),
    ...(item.measure
      ? {
          measure: item.measure,
          crop: item.crop,
          sha256: createHash('sha256')
            .update(await readFile(new URL(file, output)))
            .digest('hex'),
        }
      : {}),
    source: item.file,
  });
}
async function bytes(dir) {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
    n += e.isDirectory()
      ? await bytes(p)
      : e.name === 'manifest.json'
        ? 0
        : (await stat(p)).size;
  }
  return n;
}
const assetBytes = await bytes(output);
const manifest = { files, assetBytes, totalBytes: assetBytes };
let json;
for (;;) {
  json = await format(JSON.stringify(manifest), { parser: 'json' });
  const total = assetBytes + Buffer.byteLength(json);
  if (total === manifest.totalBytes) break;
  manifest.totalBytes = total;
}
await writeFile(new URL('manifest.json', output), json);
console.log(
  `${files.length} files; public/assets total ${manifest.totalBytes} bytes`,
);

await import('./world-buildings.mjs');
