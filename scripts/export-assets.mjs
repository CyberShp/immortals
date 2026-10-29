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
import { format } from 'prettier';
import { tsImport } from 'tsx/esm/api';
const { plots } = await tsImport('../src/render/layout.ts', import.meta.url);
const source = '/Volumes/Media/immortal-qa/design/art/assets';
const output = new URL('../public/assets/', import.meta.url);
const input = JSON.parse(
  await readFile(path.join(source, 'manifest.json'), 'utf8'),
);
const files = [];
for (const item of input.files.filter((f) => f.file.endsWith('.webp'))) {
  const src = path.join(source, item.file);
  await mkdir(new URL(`${item.category}/`, output), { recursive: true });
  await copyFile(src, new URL(item.file, output));
  files.push({
    file: item.file,
    size: item.size,
    anchor: { x: item.anchor.x, y: item.anchor.y },
    scale: 1,
    source: item.file,
  });
  if (item.category === 'map') continue;
  const scale =
    item.category === 'disciple'
      ? 96 / item.size[1]
      : item.category === 'accessory'
        ? 48 / Math.max(...item.size)
        : (plots[item.name.split('-')[0]][2] -
            plots[item.name.split('-')[0]][0]) /
          item.size[0];
  const suffix = { disciple: '96', accessory: '48', building: 'map' }[
    item.category
  ];
  const file = `${item.category}/${item.name}-${suffix}@2x.webp`;
  const size = item.size.map((n) => Math.round(n * scale));
  await sharp(src)
    .resize(...size, { kernel: 'lanczos3' })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(new URL(file, output).pathname);
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
    scale,
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
