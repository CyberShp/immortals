// ?cool=1 批次一素材导出：batch1-cut/out/ 下抠好的 RGBA PNG → public/assets/cool/<同路径>.webp，
// 并重写 manifest.json 的 groups.cool 与总字节（tests/assets.test.ts 校验）。不碰任何旧素材。
// 抠图/分层脚本在 immortal-qa/art-rebuild/cool-rebuild/batch1-cut/（hall_layers.py、cut_disciple.py、cut_ui.py）。
// 用法：node scripts/cool-assets.mjs [out 目录]
import sharp from 'sharp';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import { format } from 'prettier';

const SRC =
  process.argv[2] ??
  '/Volumes/Media/immortal-qa/art-rebuild/cool-rebuild/batch1-cut/out';
const DST = 'public/assets/cool';
const sources = JSON.parse(await readFile(`${SRC}/sources.json`, 'utf8'));
const sourceOf = (rel) =>
  Object.entries(sources).find(([k]) =>
    new RegExp(`^${k.replace('.', '\\.').replace('*', '[^/]+')}$`).test(rel),
  )?.[1] ?? '';

async function walk(dir, rel = '') {
  const out = [];
  for (const e of (
    await readdir(`${dir}/${rel}`, { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(dir, r)));
    else if (e.name.endsWith('.png')) out.push(r);
  }
  return out;
}
// 旧占位底图（概念图羽化）不再使用：批次一起地面改为带标注的平面色块占位。
await rm(`${DST}/scene_concept_cool_v1-placeholder.webp`, { force: true });
const files = [];
for (const rel of await walk(SRC)) {
  const out = `${DST}/${rel.replace(/\.png$/, '.webp')}`;
  await mkdir(dirname(out), { recursive: true });
  const img = sharp(`${SRC}/${rel}`);
  const { width, height } = await img.metadata();
  await img
    .webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(out);
  files.push({
    file: out.slice('public/assets/'.length),
    size: [width, height],
    bytes: (await stat(out)).size,
    source: sourceOf(rel),
  });
}

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
    note: '冷色新场景批次一素材（Iris 已交付件的切层/抠图）；默认首屏不加载、不计入 first-screen-budget。石台 S1 未交付，地面为代码画的带标注色块占位，不在此列。',
    files,
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
console.log(
  files.length,
  'files',
  files.reduce((n, f) => n + f.bytes, 0),
  'bytes; total',
  manifest.totalBytes,
);
