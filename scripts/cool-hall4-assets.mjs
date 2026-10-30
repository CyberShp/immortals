// ?cool=1 主殿 v4g 素材导出（只处理 hall4，不动其它 cool 素材）：
// batch1-cut/out-v4g/hall4/*.png（v4g/cut.py 切层结果）→ public/assets/cool/hall4/*.webp，
// 并把 groups.cool.files 里的 cool/hall4/ 条目替换为本次结果、重算总字节（tests/assets.test.ts 校验）。
// 编码参数与 scripts/cool-assets.mjs 一致。用法：node scripts/cool-hall4-assets.mjs [out-v4g 目录]
import sharp from 'sharp';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { format } from 'prettier';

const SRC =
  process.argv[2] ??
  '/Volumes/Media/immortal-qa/art-rebuild/cool-rebuild/batch1-cut/out-v4g';
const DST = 'public/assets/cool/hall4';
const SOURCE = {
  'hall-shadow':
    'v4g 外景 hall_ext_v4g_roof_v1.png 地面落影（抠图背景族 × 台基外扩/右侧地面）',
  'hall-base':
    'v4g 外景 hall_ext_v4g_roof_v1.png 台基前缘层（前排望柱柱头切线以下，不含正面台阶）',
  'hall-stair-front':
    'v4g 外景 hall_ext_v4g_roof_v1.png 正面台阶（各楼层都显示）',
  'hall-roof': 'v4g 外景 hall_ext_v4g_roof_v1.png 切线以上 − 9 根外檐柱',
  'hall-ocol':
    'v4g 外景 hall_ext_v4g_roof_v1.png 外檐柱（柱身+箍，柱础留在屋顶层）',
  'hall-room-main':
    'forge_interior_v1/hall_int_v4g_v3.png（ECC 仿射配准到外景）切线以上',
  'hall-room-left':
    'forge_interior_v1/side_left_v1.png（ECC 仿射配准到外景）切线以上',
  'hall-room-right':
    'forge_interior_v1/side_right_v1.png（ECC 仿射配准到外景）切线以上',
  'hall-room-floor2':
    'forge_interior_v1/floor2_council_v1.png（ECC 仿射配准到外景）切线以上',
  'hall-col':
    'forge_interior_v1/hall_int_v4g_v3.png 4 根金柱（柱头/柱身/柱础矩形 − 地面色）',
  'hall-carpet':
    'hall_int_v4g_v3.png 红毯沿轴向挤出到宝座台阶脚（脚本色块，v4g/carpet.py）',
};
const sourceOf = (name) =>
  SOURCE[name] ?? SOURCE[name.replace(/-\d+$/, '')] ?? '';
await mkdir(DST, { recursive: true });
const files = [];
for (const name of (await readdir(`${SRC}/hall4`))
  .filter((f) => f.endsWith('.png'))
  .sort()) {
  const out = `${DST}/${name.replace(/\.png$/, '.webp')}`;
  const img = sharp(`${SRC}/hall4/${name}`);
  const { width, height } = await img.metadata();
  await img
    .webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(out);
  files.push({
    file: out.slice('public/assets/'.length),
    size: [width, height],
    bytes: (await stat(out)).size,
    source: sourceOf(name.replace(/\.png$/, '')),
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
const cool = manifest.groups.cool;
cool.files = [
  ...cool.files.filter((f) => !f.file.startsWith('cool/hall4/')),
  ...files,
];
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
