// depth 开关（?depth=1）素材同步：从 Iris 的素材目录按“最新版本号”取样图/正式图，
// 转成 webp 放进 public/assets/rebuild/depth/，并写 src/render/depth-assets.json（来源、版本、sha256、尺寸、
// 天空顶色/底色）。只新增/覆盖本目录里同名的 webp，不删除任何旧版本文件（旧版本会列出，需手动清理）。
// 第二轮：cloud_sea（黑底）按“亮度→alpha、颜色反预乘 c/α”转透明；far_islands（纯绿底）按连通域切成
// 独立透明图，去绿底并去绿边（despill）。处理参数见下方 CLOUD / KEY。
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

// 云海：α = max(R,G,B)/255（HSV 明度作“亮度”，保证反预乘 c/α 不溢出），低于 floor 的 JPEG 噪声归零。
const CLOUD = { floor: 2 / 255 };
// 绿幕：d = G − max(R,B)。d ≤ t0 不透明，d ≥ t1 全透明（纯绿底 d≈221–224），中间线性；
// 半透明像素按 F = (P − (1−α)·绿底)/α 反解前景（G 下限 min(R,B)−antiPurple，防紫边）；距透明区 despillBand px 内把 G 压到 ≤ max(R,B)+despillMargin。
// 面积 < minArea 的连通域（噪点）丢弃；每个岛四周留 pad px 透明边。
const KEY = {
  t0: 40,
  t1: 200,
  despillBand: 3,
  despillMargin: 6,
  minArea: 2000,
  pad: 4,
  antiPurple: 8,
};
// 这两层有专门的转换（其余原样转 webp）。
const PROCESS = { cloudSea: 'lumaAlpha', farIslands: 'chromaSplit' };

function lumaAlpha(data, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3],
      g = data[i * 3 + 1],
      b = data[i * 3 + 2];
    const v = Math.max(r, g, b) / 255;
    const a = v <= CLOUD.floor ? 0 : (v - CLOUD.floor) / (1 - CLOUD.floor);
    out[i * 4] = a ? Math.min(255, Math.round(r / a)) : 0;
    out[i * 4 + 1] = a ? Math.min(255, Math.round(g / a)) : 0;
    out[i * 4 + 2] = a ? Math.min(255, Math.round(b / a)) : 0;
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

function chromaSplit(data, w, h) {
  const n = w * h;
  // 绿底参考色：最上 40 行中位数近似（取均值即可，纯色底）。
  const bg = [0, 0, 0];
  for (let i = 0; i < w * 40; i++)
    for (let c = 0; c < 3; c++) bg[c] += data[i * 3 + c] / (w * 40);
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 3],
      g = data[i * 3 + 1],
      b = data[i * 3 + 2];
    const d = g - Math.max(r, b);
    alpha[i] = Math.min(1, Math.max(0, (KEY.t1 - d) / (KEY.t1 - KEY.t0)));
  }
  // 到透明（α<0.98）区域的棋盘距离，用于 despill 带。
  const far = new Int32Array(n).fill(1e9);
  for (let i = 0; i < n; i++) if (alpha[i] < 0.98) far[i] = 0;
  for (let pass = 0; pass < KEY.despillBand; pass++)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (far[i] <= pass) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const X = x + dx,
            Y = y + dy;
          if (X >= 0 && Y >= 0 && X < w && Y < h && far[Y * w + X] === pass)
            far[i] = pass + 1;
        }
      }
  const rgba = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    if (a <= 0) continue;
    const f = [0, 1, 2].map((c) =>
      Math.min(255, Math.max(0, (data[i * 3 + c] - (1 - a) * bg[c]) / a)),
    );
    if (far[i] <= KEY.despillBand)
      f[1] = Math.min(f[1], Math.max(f[0], f[2]) + KEY.despillMargin);
    // 反解在 α 偏低的边缘会多减绿，出现紫/粉边：G 不低于 min(R,B)−antiPurple。
    if (a < 1) f[1] = Math.max(f[1], Math.min(f[0], f[2]) - KEY.antiPurple);
    rgba[i * 4] = Math.round(f[0]);
    rgba[i * 4 + 1] = Math.round(f[1]);
    rgba[i * 4 + 2] = Math.round(f[2]);
    rgba[i * 4 + 3] = Math.round(a * 255);
  }
  // 连通域（α>0，8 邻接），按 x 从左到右编号。
  const lab = new Int32Array(n);
  const parts = [];
  const stack = [];
  for (let s = 0; s < n; s++) {
    if (lab[s] || alpha[s] <= 0) continue;
    const id = parts.length + 1;
    let area = 0,
      x0 = w,
      y0 = h,
      x1 = 0,
      y1 = 0;
    lab[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop();
      const x = i % w,
        y = (i / w) | 0;
      area++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx,
            Y = y + dy;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const j = Y * w + X;
          if (!lab[j] && alpha[j] > 0) {
            lab[j] = id;
            stack.push(j);
          }
        }
    }
    parts.push({ id, area, x0, y0, x1, y1 });
  }
  return parts
    .filter((p) => p.area >= KEY.minArea)
    .sort((a, b) => a.x0 - b.x0)
    .map((p) => {
      const x = Math.max(0, p.x0 - KEY.pad),
        y = Math.max(0, p.y0 - KEY.pad);
      const pw = Math.min(w, p.x1 + 1 + KEY.pad) - x,
        ph = Math.min(h, p.y1 + 1 + KEY.pad) - y;
      const buf = Buffer.alloc(pw * ph * 4);
      for (let yy = 0; yy < ph; yy++)
        for (let xx = 0; xx < pw; xx++) {
          const i = (y + yy) * w + x + xx;
          if (lab[i] !== p.id) continue; // 只要本岛像素，邻岛/噪点不进来
          rgba.copy(buf, (yy * pw + xx) * 4, i * 4, i * 4 + 4);
        }
      return { x, y, width: pw, height: ph, area: p.area, rgba: buf };
    });
}

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
  if (prev?.file && prev.file !== `rebuild/depth/${name}`)
    stale.push(prev.file);
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
  layers[key].process = PROCESS[key] ?? 'copy';
  if (argv.includes('--check')) {
    layers[key].bytes = prev?.bytes;
    continue;
  }
  await mkdir(OUT_DIR, { recursive: true });
  const webp = { quality: QUALITY, alphaQuality: 100, effort: 6 };
  if (PROCESS[key] === 'chromaSplit') {
    // 多张独立透明图：<prefix>_v<N>_<k>.webp（k 从 1 起，按源图从左到右）。
    const parts = chromaSplit(data, info.width, info.height);
    layers[key].parts = [];
    for (const [k, part] of parts.entries()) {
      const file = `${prefix}_v${best.version}_${k + 1}.webp`;
      await sharp(part.rgba, {
        raw: { width: part.width, height: part.height, channels: 4 },
      })
        .webp(webp)
        .toFile(`${OUT_DIR}/${file}`);
      layers[key].parts.push({
        file: `rebuild/depth/${file}`,
        x: part.x,
        y: part.y,
        width: part.width,
        height: part.height,
        bytes: (await stat(`${OUT_DIR}/${file}`)).size,
      });
    }
    delete layers[key].file;
    layers[key].bytes = layers[key].parts.reduce((n, p) => n + p.bytes, 0);
    continue;
  }
  const img2 =
    PROCESS[key] === 'lumaAlpha'
      ? sharp(lumaAlpha(data, info.width, info.height), {
          raw: { width: info.width, height: info.height, channels: 4 },
        })
      : sharp(raw);
  await img2.webp(webp).toFile(`${OUT_DIR}/${name}`);
  layers[key].bytes = (await stat(`${OUT_DIR}/${name}`)).size;
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
          v &&
            `${v.file ?? v.parts.map((p) => p.file).join(', ')} (v${v.version}, ${v.bytes} B)`,
        ]),
      ),
      depthDirBytes: depthBytes,
      staleFilesToRemoveManually: stale,
    },
    null,
    2,
  ),
);
