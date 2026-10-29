// 封闭房屋屋顶淡出（roofFade 开发开关）素材管线。
// 只做抠图 / 裁切 / 对齐 / 缩放 / 打包，不改画面内容。
// 用法：node scripts/roof-fade-assets.mjs [源图目录，默认 /Volumes/Media/immortal-qa/compare]
// 输出：public/assets/rebuild/roof-fade/*.webp（新路径，不覆盖现有素材）
//       src/render/roof-fade-geometry.json（世界坐标变换参数，相对门口脚底点）
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] ?? '/Volumes/Media/immortal-qa/compare';
const OUT_DIR = join(root, 'public/assets/rebuild/roof-fade');
const GEOMETRY = join(root, 'src/render/roof-fade-geometry.json');
const TARGET_DOOR = 66; // 目标门洞高（世界 px）
const SUPERSAMPLE = 2; // 素材按 2x 世界分辨率存

// 实测数据（原图像素；外观 1152×864，内景 1448×1086）。测法见 /Volumes/Media/immortal-qa/xianfu-roofhide-notes.md。
// 地台角点：left/front/right，bottom=地台外缘底线，top=地台上沿外缘。
// 底边线为可见底缘拟合直线与左右竖边的交点；front.top 由左右台高均值推出。
const MEASURED = {
  meditation: {
    exterior: 'meditation_exterior_ref.jpg',
    interior: 'meditation_interior_gpt_v4.png',
    building: 'B_MEDIT',
    ext: {
      bottom: [
        [327, 603.7],
        [710.9, 749.8],
        [885, 624.2],
      ],
      top: [[327, 580], null, [885, 603]],
    },
    int: {
      bottom: [
        [208, 548.3],
        [937.6, 1000.6],
        [1231, 818.1],
      ],
      top: [[208, 524], null, [1231, 791]],
    },
    // 门洞：门楣下沿 → 门扇底缘，两侧内门框处竖直量取 [x, 门楣下沿 y, 门底 y]
    door: [
      [482, 432, 628],
      [552, 455, 659],
    ],
    // 下层台阶前沿中点（弟子站立处）
    foot: [476.0, 699.4],
    // 蒲团中心（内景原图，绿色蒲团连通域质心）
    seats: [
      [616.1, 599.1],
      [722.0, 685.2],
    ],
    spots: [],
  },
  alchemy: {
    exterior: 'alchemy_exterior_ref.jpg',
    interior: 'alchemy_interior_gpt_v2.png',
    building: 'B_ALCHEMY',
    // 左角被大丹炉挡住：按静修室同模板平移 (+4,0)（台基带 alpha 配准）+ 本图可见底缘拟合线推得
    ext: {
      bottom: [
        [331, 599.8],
        [713.0, 750.9],
        [888, 625.1],
      ],
      top: [[331, 576.1], null, [888, 601]],
    },
    int: {
      bottom: [
        [212, 549.2],
        [945.0, 963.8],
        [1223, 796.9],
      ],
      top: [[212, 520], null, [1223, 767]],
    },
    door: [
      [484, 425, 626],
      [560, 452, 660],
    ],
    foot: [474.0, 695.2],
    seats: [],
    spots: [
      [780, 742],
      [930, 790],
      [860, 770],
    ],
  },
  dorm: {
    exterior: 'dorm_exterior_ref.jpg',
    interior: 'dorm_interior_gpt.png',
    building: 'B_DORM',
    // 外观台基两层，取外层（下层）台基
    ext: {
      bottom: [
        [224, 553.5],
        [781.9, 756.2],
        [968, 624.0],
      ],
      top: [[224, 528], null, [968, 602]],
    },
    int: {
      bottom: [
        [179, 598.0],
        [964.8, 930.7],
        [1273, 706.1],
      ],
      top: [[179, 570], null, [1273, 674]],
    },
    door: [
      [432, 418, 593],
      [510, 443, 628],
    ],
    foot: [424.0, 660.2],
    seats: [],
    spots: [
      [1017, 715],
      [900, 700],
      [960, 762],
    ],
  },
};

// ---------- 抠图：浅绿底色键控 ----------
// 背景/投影是低饱和浅绿（R/G≈0.84–0.93，B/G≈0.62–0.76）；树叶饱和度高得多（B/G≤0.52），不会被扣掉。
async function greenKey(input, { keepShadow }) {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const like = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 3],
      g = data[i * 3 + 1],
      b = data[i * 3 + 2];
    const rg = r / g,
      bg = b / g;
    like[i] =
      g > 100 && rg > 0.78 && rg < 0.98 && bg > 0.56 && bg < 0.82 ? 1 : 0;
  }
  const out = new Uint8Array(n),
    q = new Int32Array(n);
  let head = 0,
    tail = 0;
  const push = (i) => {
    if (like[i] && !out[i]) {
      out[i] = 1;
      q[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const i = q[head++],
      x = i % w,
      y = (i / w) | 0;
    if (x) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y) push(i - w);
    if (y < h - 1) push(i + w);
  }
  // 底色亮度场：对洪泛区亮像素做二次曲面拟合（排除投影）
  const gs = [];
  for (let i = 0; i < n; i += 7) if (out[i]) gs.push(data[i * 3 + 1]);
  gs.sort((a, b) => a - b);
  const gMed = gs[gs.length >> 1];
  const A = Array.from({ length: 6 }, () => new Float64Array(6));
  const B = [0, 1, 2].map(() => new Float64Array(6));
  for (let i = 0; i < n; i += 5) {
    if (!out[i] || data[i * 3 + 1] < gMed - 10) continue;
    const x = (i % w) / w,
      y = ((i / w) | 0) / h,
      f = [1, x, y, x * x, x * y, y * y];
    for (let a = 0; a < 6; a++) {
      for (let b = 0; b < 6; b++) A[a][b] += f[a] * f[b];
      for (let c = 0; c < 3; c++) B[c][a] += f[a] * data[i * 3 + c];
    }
  }
  const solve = (M, v) => {
    const m = M.map((r, i) => [...r, v[i]]);
    for (let i = 0; i < 6; i++) {
      let p = i;
      for (let k = i + 1; k < 6; k++)
        if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
      [m[i], m[p]] = [m[p], m[i]];
      for (let k = 0; k < 6; k++)
        if (k !== i) {
          const f = m[k][i] / m[i][i];
          for (let j = i; j < 7; j++) m[k][j] -= f * m[i][j];
        }
    }
    return m.map((r, i) => r[6] / r[i]);
  };
  const coef = B.map((v) => solve(A, v));
  const bgAt = (i) => {
    const x = (i % w) / w,
      y = ((i / w) | 0) / h,
      f = [1, x, y, x * x, x * y, y * y];
    return coef.map((c) => c.reduce((s, v, k) => s + v * f[k], 0));
  };
  const dist = chamfer(out, w, h);
  const bodyDist = chamfer(
    Uint8Array.from(out, (v) => 1 - v),
    w,
    h,
  );
  const body = Buffer.alloc(n * 4),
    shadow = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const bgc = bgAt(i);
    if (out[i]) {
      // 外观投影：只取变暗量，单独一层；贴着建筑 3px 内的描边光晕不要
      if (keepShadow && bodyDist[i] > 3) {
        const a = Math.max(0, ...bgc.map((v, c) => (v - data[i * 3 + c]) / v));
        if (a >= 0.06) {
          shadow[i * 4] = shadow[i * 4 + 1] = shadow[i * 4 + 2] = 20;
          shadow[i * 4 + 3] = Math.round(Math.min(1, a) * 255);
        }
      }
      continue;
    }
    let a = 1;
    if (dist[i] <= 2)
      a = Math.min(
        1,
        Math.hypot(...bgc.map((v, c) => data[i * 3 + c] - v)) / 60,
      );
    for (let c = 0; c < 3; c++)
      body[i * 4 + c] = Math.max(
        0,
        Math.min(
          255,
          Math.round((data[i * 3 + c] - (1 - a) * bgc[c]) / Math.max(a, 1e-3)),
        ),
      );
    body[i * 4 + 3] = Math.round(a * 255);
  }
  if (keepShadow) keepLargeComponents(shadow, w, h, 4000);
  return { w, h, body, shadow };
}

function chamfer(zero, w, h) {
  const n = w * h,
    d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = zero[i] ? 0 : 1e5;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y) d[i] = Math.min(d[i], d[i - w] + 1);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < h - 1) d[i] = Math.min(d[i], d[i + w] + 1);
    }
  return d;
}

function keepLargeComponents(rgba, w, h, minArea) {
  const n = w * h,
    lab = new Int32Array(n),
    q = new Int32Array(n);
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (!rgba[s * 4 + 3] || lab[s]) continue;
    next++;
    let head = 0,
      tail = 0;
    lab[s] = next;
    q[tail++] = s;
    while (head < tail) {
      const i = q[head++],
        x = i % w,
        y = (i / w) | 0;
      for (const j of [
        x ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ])
        if (j >= 0 && rgba[j * 4 + 3] && !lab[j]) {
          lab[j] = next;
          q[tail++] = j;
        }
    }
    if (tail < minArea) for (let k = 0; k < tail; k++) rgba[q[k] * 4 + 3] = 0;
  }
}

function alphaBox(rgba, w, h) {
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (rgba[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ---------- 几何 ----------
function completeCorners(c) {
  const hl = c.bottom[0][1] - c.top[0][1],
    hr = c.bottom[2][1] - c.top[2][1];
  const f = c.bottom[1];
  return {
    bottom: c.bottom,
    top: [c.top[0], [f[0], f[1] - (hl + hr) / 2], c.top[2]],
    rim: [hl, hr],
  };
}
// 最小二乘 2D 仿射：dst ≈ [a c; b d]·src + [tx ty]
function fitAffine(src, dst) {
  const AtA = Array.from({ length: 3 }, () => [0, 0, 0]),
    Atx = [0, 0, 0],
    Aty = [0, 0, 0];
  src.forEach(([x, y], k) => {
    const r = [x, y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) AtA[i][j] += r[i] * r[j];
      Atx[i] += r[i] * dst[k][0];
      Aty[i] += r[i] * dst[k][1];
    }
  });
  const inv = invert3(AtA);
  const mul = (v) =>
    inv.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  const [a, c, tx] = mul(Atx),
    [b, d, ty] = mul(Aty);
  return { a, b, c, d, tx, ty };
}
function invert3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h,
    B = -(d * i - f * g),
    C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
const apply = (m, [x, y]) => [
  m.a * x + m.c * y + m.tx,
  m.b * x + m.d * y + m.ty,
];
const compose = (m, n) => ({
  // m∘n
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
  tx: m.a * n.tx + m.c * n.ty + m.tx,
  ty: m.b * n.tx + m.d * n.ty + m.ty,
});
const round = (v, p = 4) => Math.round(v * 10 ** p) / 10 ** p;
const roundM = (m) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v, 6)]));
const roundP = (p) => p.map((v) => round(v, 2));

async function writeWebp(rgba, w, h, box, sx, sy, file) {
  const outW = Math.max(1, Math.round(box.w * sx)),
    outH = Math.max(1, Math.round(box.h * sy));
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .resize(outW, outH, { kernel: 'lanczos3' })
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(join(OUT_DIR, file));
  return {
    file: `rebuild/roof-fade/${file}`,
    width: outW,
    height: outH,
    kx: outW / box.w,
    ky: outH / box.h,
  };
}

mkdirSync(OUT_DIR, { recursive: true });
const geometry = {
  note: 'roofFade 开发开关用；变换均把素材像素映射到“相对门口脚底点(slot.entrance)”的世界坐标偏移',
  targetDoor: TARGET_DOOR,
  supersample: SUPERSAMPLE,
  buildings: {},
};
for (const [key, m] of Object.entries(MEASURED)) {
  const ext = completeCorners(m.ext),
    int = completeCorners(m.int);
  const doorPx = m.door.reduce((s, [, t, b]) => s + (b - t), 0) / m.door.length;
  const scale = TARGET_DOOR / doorPx;
  // 外观原图 → 相对门口世界偏移
  const extToWorld = {
    a: scale,
    b: 0,
    c: 0,
    d: scale,
    tx: -scale * m.foot[0],
    ty: -scale * m.foot[1],
  };
  // 内景原图 → 外观原图（上沿 3 点 + 底缘 3 点最小二乘）
  const src = [...int.top, ...int.bottom],
    dst = [...ext.top, ...ext.bottom];
  const intToExt = fitAffine(src, dst);
  const residual = src.map((p, i) =>
    Math.hypot(
      apply(intToExt, p)[0] - dst[i][0],
      apply(intToExt, p)[1] - dst[i][1],
    ),
  );
  const v = [intToExt.c, intToExt.d]; // 内景竖直方向映射后的倾斜
  const skewDeg = (Math.atan2(-v[0], v[1]) * 180) / Math.PI;

  const e = await greenKey(join(SRC, m.exterior), { keepShadow: true });
  const i = await greenKey(join(SRC, m.interior), { keepShadow: false });
  const k = scale * SUPERSAMPLE;
  const eBox = alphaBox(e.body, e.w, e.h),
    sBox = alphaBox(e.shadow, e.w, e.h),
    iBox = alphaBox(i.body, i.w, i.h);
  const ie = intToExt;
  const kInt = Math.sqrt(Math.abs(ie.a * ie.d - ie.b * ie.c)) * k;
  const extOut = await writeWebp(
    e.body,
    e.w,
    e.h,
    eBox,
    k,
    k,
    `${key}-exterior@2x.webp`,
  );
  const shOut = await writeWebp(
    e.shadow,
    e.w,
    e.h,
    sBox,
    k / 2,
    k / 2,
    `${key}-exterior-shadow.webp`,
  );
  const intOut = await writeWebp(
    i.body,
    i.w,
    i.h,
    iBox,
    kInt,
    kInt,
    `${key}-interior@2x.webp`,
  );
  const assetToSrc = (box, o) => ({
    a: 1 / o.kx,
    b: 0,
    c: 0,
    d: 1 / o.ky,
    tx: box.x,
    ty: box.y,
  });
  const extWorld = (p) => roundP(apply(extToWorld, p));
  const intWorld = (p) => roundP(apply(extToWorld, apply(intToExt, p)));
  geometry.buildings[m.building] = {
    key,
    source: { exterior: m.exterior, interior: m.interior },
    doorPx: round(doorPx, 1),
    scale: round(scale, 4),
    exterior: {
      ...extOut,
      matrix: roundM(compose(extToWorld, assetToSrc(eBox, extOut))),
    },
    shadow: {
      ...shOut,
      matrix: roundM(compose(extToWorld, assetToSrc(sBox, shOut))),
    },
    interior: {
      ...intOut,
      matrix: roundM(
        compose(extToWorld, compose(intToExt, assetToSrc(iBox, intOut))),
      ),
    },
    // 地台（外观）世界偏移：左、前、右、后
    foundationTop: [
      ...ext.top.map(extWorld),
      extWorld([
        ext.top[0][0] + ext.top[2][0] - ext.top[1][0],
        ext.top[0][1] + ext.top[2][1] - ext.top[1][1],
      ]),
    ],
    foundationBottom: [
      ...ext.bottom.map(extWorld),
      extWorld([
        ext.bottom[0][0] + ext.bottom[2][0] - ext.bottom[1][0],
        ext.bottom[0][1] + ext.bottom[2][1] - ext.bottom[1][1],
      ]),
    ],
    // 外观地台最低点作为排序 y（相对）
    sortY: round(Math.max(...ext.bottom.map((p) => extWorld(p)[1])), 2),
    seats: m.seats.map(intWorld),
    spots: m.spots.map(intWorld),
    affine: {
      intToExt: roundM(intToExt),
      residualSrcPx: residual.map((r) => round(r, 2)),
      residualWorldPx: residual.map((r) => round(r * scale, 2)),
      verticalSkewDeg: round(skewDeg, 2),
    },
    corners: { exterior: ext, interior: int },
  };
  console.log(
    key,
    'door',
    round(doorPx, 1),
    'scale',
    round(scale, 4),
    'residual(src px)',
    residual.map((r) => r.toFixed(1)).join(','),
    'files',
    extOut.width + 'x' + extOut.height,
    intOut.width + 'x' + intOut.height,
  );
}
writeFileSync(GEOMETRY, JSON.stringify(geometry, null, 2) + '\n');
console.log('wrote', GEOMETRY);
