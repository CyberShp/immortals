// depth 开关（?depth=1）素材同步：从 Iris 的素材目录按“最新版本号”取样图/正式图，
// 转成 webp 放进 public/assets/rebuild/depth/，并写 src/render/depth-assets.json（来源、版本、sha256、尺寸、
// 天空顶色/底色）。只新增/覆盖本目录里同名的 webp，不删除任何旧版本文件（旧版本会列出，需手动清理）。
// 用法：node scripts/depth-assets.mjs [--source DIR] [--check]
//   --check：只检查源目录是否有比仓库更新的版本，不写文件（有更新时退出码 1）。
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { format } from 'prettier';

const argv = process.argv.slice(2);
const opt = (name, fallback) =>
  argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const SOURCE = opt(
  '--source',
  process.env.DEPTH_ASSET_SOURCE ??
    '/Volumes/Media/immortal-qa/art-rebuild/depth',
);
const OUT_DIR = 'public/assets/rebuild/depth';
const CONFIG = 'src/render/depth-assets.json';
const QUALITY = 88;
// 层键 → Iris 的文件名前缀（版本号 _v<N> 递增）。没有文件的层在运行时自动跳过。
export const LAYER_SOURCES = {
  backdrop: 'backdrop_sky_far', // L0 天空+远峰+远云海（不透明）
  farIslands: 'far_islands', // L1 远景小浮岛（带透明，Iris 待出）
  cloudSea: 'cloud_sea', // L2 中景云海（带透明，Iris 待出；缺省时用 mist 占位）
  mist: 'mist_screen', // L6 前景薄雾（黑底白雾，screen 语义）
};

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function latest(prefix, files) {
  const re = new RegExp(`^${prefix}_v(\\d+)\\.(jpe?g|png|webp)$`, 'i');
  const hits = files
    .map((f) => [f, re.exec(f)])
    .filter(([, m]) => m)
    .map(([f, m]) => ({ file: f, version: Number(m[1]) }))
    .sort((a, b) => b.version - a.version);
  return { best: hits[0], all: hits };
}

const files = await readdir(SOURCE);
const previous = JSON.parse(await readFile(CONFIG, 'utf8').catch(() => '{}'));
const layers = {};
const stale = [];
let newer = false;
for (const [key, prefix] of Object.entries(LAYER_SOURCES)) {
  const { best } = await latest(prefix, files);
  if (!best) {
    layers[key] = null;
    continue;
  }
  const raw = await readFile(`${SOURCE}/${best.file}`);
  const name = `${prefix}_v${best.version}.webp`;
  const prev = previous.layers?.[key];
  if (!prev || prev.version < best.version || prev.sha256 !== sha(raw))
    newer = true;
  if (prev && prev.file !== `rebuild/depth/${name}`) stale.push(prev.file);
  const img = sharp(raw);
  const meta = await img.metadata();
  const { data, info } = await sharp(raw)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rowMean = (y) => {
    const s = [0, 0, 0];
    for (let x = 0; x < info.width; x++)
      for (let c = 0; c < 3; c++)
        s[c] += data[(y * info.width + x) * info.channels + c];
    return s.map((v) => Math.round(v / info.width));
  };
  const hex = (rgb) => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  layers[key] = {
    file: `rebuild/depth/${name}`,
    source: `${SOURCE}/${best.file}`,
    version: best.version,
    sha256: sha(raw),
    width: meta.width,
    height: meta.height,
    // 边缘外延伸色（spec 三节 L0：边缘外用天空顶色/云海底色延伸）。
    topColor: hex(rowMean(0)),
    bottomColor: hex(rowMean(info.height - 1)),
  };
  if (!argv.includes('--check')) {
    await mkdir(OUT_DIR, { recursive: true });
    await sharp(raw)
      .webp({ quality: QUALITY, alphaQuality: 100, effort: 6 })
      .toFile(`${OUT_DIR}/${name}`);
    layers[key].bytes = (await stat(`${OUT_DIR}/${name}`)).size;
  } else layers[key].bytes = prev?.bytes;
}
if (argv.includes('--check')) {
  console.log(
    newer ? '源目录有更新版本，运行不带 --check 同步。' : '已是最新。',
  );
  process.exit(newer ? 1 : 0);
}
const world = {
  file: 'rebuild/depth/world_alpha.webp',
  source:
    'public/assets/map/world.webp → scripts/depth-world-alpha.py（程序化去纸色背景，岛外透明）',
  bytes: (await stat(`${OUT_DIR}/world_alpha.webp`)).size,
};
const config = {
  generatedBy: 'scripts/depth-assets.mjs',
  sourceDir: SOURCE,
  world,
  layers,
};
await writeFile(
  CONFIG,
  await format(JSON.stringify(config), { parser: 'json' }),
);

// manifest 只记目录总字节（与 roof-fade 相同做法，tests/assets.test.ts 校验）。
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
manifest.assetBytes = await bytes('public/assets');
let json;
for (;;) {
  json = await format(JSON.stringify(manifest), { parser: 'json' });
  const total = manifest.assetBytes + Buffer.byteLength(json);
  if (total === manifest.totalBytes) break;
  manifest.totalBytes = total;
}
await writeFile('public/assets/manifest.json', json);
const depthBytes = (await bytes(OUT_DIR)) ?? 0;
console.log(
  JSON.stringify(
    {
      layers: Object.fromEntries(
        Object.entries(layers).map(([k, v]) => [
          k,
          v && `${v.file} (v${v.version}, ${v.bytes} B)`,
        ]),
      ),
      depthDirBytes: depthBytes,
      staleFilesToRemoveManually: stale,
    },
    null,
    2,
  ),
);
