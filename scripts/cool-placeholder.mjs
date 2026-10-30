// ?cool=1 占位底图：Iris 概念图 → 四边羽化到画布底色 → webp（public/assets/cool/）。
// 用法：node scripts/cool-placeholder.mjs [概念图路径]
// 只写 public/assets/cool/ 与 manifest.json（groups.cool + 目录总字节），不碰任何旧素材。
import sharp from 'sharp';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { format } from 'prettier';

const SOURCE =
  process.argv[2] ??
  '/Volumes/Media/immortal-qa/art-rebuild/cool-rebuild/scene_concept_cool_v1.jpg';
const OUT = 'scene_concept_cool_v1-placeholder.webp';
const cool = JSON.parse(await readFile('src/render/cool-world.json', 'utf8'));
const hex = cool.background.canvasColor;
const bg = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const FEATHER = 48;

const { data, info } = await sharp(SOURCE)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height } = info;
if (width !== cool.background.size[0] || height !== cool.background.size[1])
  throw Error(
    `概念图尺寸 ${width}×${height} 与 cool-world.json background.size 不符`,
  );
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const d = Math.min(x, y, width - 1 - x, height - 1 - y);
    if (d >= FEATHER) continue;
    const t = 0.5 - 0.5 * Math.cos((Math.PI * d) / FEATHER); // 0 边缘 → 1 内部
    const i = (y * width + x) * 3;
    for (let c = 0; c < 3; c++)
      data[i + c] = Math.round(bg[c] + (data[i + c] - bg[c]) * t);
  }
await sharp(data, { raw: { width, height, channels: 3 } })
  .webp({ quality: 82, effort: 6 })
  .toFile(`public/assets/cool/${OUT}`);

async function bytes(dir) {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    n += e.isDirectory()
      ? await bytes(p)
      : e.name === 'manifest.json'
        ? 0
        : (await stat(p)).size;
  }
  return n;
}
const manifest = JSON.parse(
  await readFile('public/assets/manifest.json', 'utf8'),
);
manifest.groups = {
  ...manifest.groups,
  cool: {
    firstScreen: false,
    loadedWhen: '?cool=1',
    note: '冷色新场景骨架素材；默认首屏不加载、不计入 first-screen-budget',
    files: [
      {
        file: `cool/${OUT}`,
        size: [width, height],
        bytes: (await stat(`public/assets/cool/${OUT}`)).size,
        source: SOURCE.split('/').pop(),
        placeholder: cool.background.placeholder,
      },
    ],
  },
};
manifest.assetBytes = await bytes('public/assets');
let json;
for (;;) {
  json = await format(JSON.stringify(manifest), { parser: 'json' });
  const total = manifest.assetBytes + Buffer.byteLength(json);
  if (total === manifest.totalBytes) break;
  manifest.totalBytes = total;
}
await writeFile('public/assets/manifest.json', json);
console.log(JSON.stringify(manifest.groups.cool, null, 2));
