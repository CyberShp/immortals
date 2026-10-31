// ?cool=1 B5–B9 建筑素材导出（只处理 cool/b5b9/，不动其它 cool 素材）：
// immortal-qa/art-rebuild/cool-rebuild/batch3-b5b9/out/*.png（matte.py 抠图 + layout.py 几何缩放/裁切/切层，未改美术像素）
// → public/assets/cool/b5b9/*.webp；groups.cool.files 里 cool/b5b9/ 条目整体替换（含 anchor = 最低足迹角、baseQuad 左/前/右/后四角，
// 均为导出 webp 的像素坐标）；同时把 out/layout.json 的世界放置写进 src/render/cool-buildings.json。
// 编码参数与 scripts/cool-hall4-assets.mjs 一致。用法：node scripts/cool-b5b9-assets.mjs [out 目录]
import sharp from 'sharp';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { format } from 'prettier';

const SRC =
  process.argv[2] ??
  '/Volumes/Media/immortal-qa/art-rebuild/cool-rebuild/batch3-b5b9/out';
const DST = 'public/assets/cool/b5b9';
const SOURCE = {
  gate: 'B5 门楼（Iris 交付原图抠图；水平镜像使门朝左下；门洞背景按拓扑置透明）',
  dorm: 'B6 居舍院落（抠图；去右墙外长影，留 ≤0.3 格接触影）',
  'alchemy-house': 'B7 丹房（同图切层：台基底边/台阶顶以上）',
  'alchemy-yard':
    'B7 炉院（同图切层：地面层，含台阶、丹炉、药架、石案；去左落影）',
  medit: 'B8 聚灵阵（抠图，无影；内切椭圆 254.6 px）',
  garden: 'B9 药田（地面层；去石板外栅栏影）',
};
const layout = JSON.parse(await readFile(`${SRC}/layout.json`, 'utf8'));
await mkdir(DST, { recursive: true });
const files = [];
for (const [name, l] of Object.entries(layout.layers).sort()) {
  const out = `${DST}/${name}.webp`;
  const img = sharp(`${SRC}/${name}.png`);
  const { width, height } = await img.metadata();
  if (width !== l.size[0] || height !== l.size[1])
    throw new Error(`${name} 尺寸不符 ${width}×${height}`);
  await img
    .webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(out);
  files.push({
    file: out.slice('public/assets/'.length),
    size: [width, height],
    bytes: (await stat(out)).size,
    source: SOURCE[name] ?? '',
    anchor: l.anchor,
    baseQuad: l.baseQuad,
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
  ...cool.files.filter((f) => !f.file.startsWith('cool/b5b9/')),
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
const SLOT = {
  gate: 'B_GATE',
  dorm: 'B_DORM',
  'alchemy-house': 'B_ALCHEMY',
  'alchemy-yard': 'B_ALCHEMY',
  medit: 'B_MEDIT',
  garden: 'B_GARDEN',
};
const buildings = {
  $comment:
    'cool B5–B9 立绘的世界放置（scripts/cool-b5b9-assets.mjs 由 batch3-b5b9/out/layout.json 生成）。x/y=精灵左上角世界坐标，scale=0.5（2x 素材）；layer=ground 画在地面层(z=-900)，sort 按 sortY（最低足迹角世界 y）与弟子排序。footprintUV 为立绘实测台基四角（左/前/右/后），碰撞以 cool-world.json 为准。',
  k: layout.k,
  layers: Object.entries(layout.layers).map(([name, l]) => ({
    id: name,
    slot: SLOT[name],
    file: `cool/b5b9/${name}.webp`,
    size: l.size,
    x: l.x,
    y: l.y,
    scale: l.scale,
    layer: l.layer,
    sortY: l.sortY,
    footprintUV: l.footprintUV,
  })),
};
await writeFile(
  'src/render/cool-buildings.json',
  await format(JSON.stringify(buildings), { parser: 'json' }),
);
console.log(
  files.length,
  'files',
  files.reduce((n, f) => n + f.bytes, 0),
  'bytes; total',
  manifest.totalBytes,
);
