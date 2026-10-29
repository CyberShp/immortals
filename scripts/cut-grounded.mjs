// Original Iris pixels only: soft colour key, background decontamination,
// alpha feather, crop and uniform downsampling. No generated art pixels.
import sharp from 'sharp';
import { finishEdges } from './grounded-edge.mjs';
const encode = (data, w, h) =>
  execFileSync(
    'python3',
    ['scripts/encode-grounded.py', String(w), String(h)],
    { input: data, maxBuffer: 32 * 1024 * 1024 },
  );
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { format } from 'prettier';
const specs = {
  hall: {
    id: 'B_HALL',
    body: [318, 854],
    stone: [
      [318, 562],
      [640, 720],
      [854, 555],
      [532, 397],
    ],
    step: [438, 701],
  },
  dorm: {
    id: 'B_DORM',
    body: [314, 886],
    stone: [
      [314, 564],
      [667, 698],
      [886, 565],
      [533, 431],
    ],
    step: [451, 669],
  },
  meditation: {
    id: 'B_MEDIT',
    body: [322, 870],
    stone: [
      [322, 568],
      [654, 734],
      [870, 585],
      [538, 419],
    ],
    step: [476, 674],
  },
  alchemy: {
    id: 'B_ALCHEMY',
    body: [321, 882],
    stone: [
      [321, 565],
      [576, 732],
      [882, 563],
      [627, 396],
    ],
    step: [447, 677],
  },
};
const baseline = JSON.parse(
  execFileSync('git', ['show', '0073c92:docs/world-buildings.json'], {
    encoding: 'utf8',
  }),
);
const baselineWorld = JSON.parse(
  execFileSync('git', ['show', '0073c92:data/world.json'], {
    encoding: 'utf8',
  }),
);
const worldText = await readFile('data/world.json', 'utf8'),
  world = JSON.parse(worldText);
const manifest = JSON.parse(
  await readFile('public/assets/manifest.json', 'utf8'),
);
const records = [];
for (const [key, spec] of Object.entries(specs)) {
  const input = await readFile(
    `${homedir()}/cutwork/backup/${key}_grounded_v1.jpg`,
  );
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  if (w !== 1152 || h !== 864) throw Error(key + ' expected 1152x864');
  const samples = [[], [], []];
  for (const [sx, sy] of [
    [0, 0],
    [w - 40, 0],
    [0, h - 40],
    [w - 40, h - 40],
  ])
    for (let y = sy; y < sy + 40; y++)
      for (let x = sx; x < sx + 40; x++)
        for (let c = 0; c < 3; c++) samples[c].push(data[(y * w + x) * 3 + c]);
  const bg = samples.map(
    (a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)],
  );
  const distance = new Float32Array(w * h),
    outside = new Uint8Array(w * h),
    queue = new Int32Array(w * h);
  let tail = 0,
    head = 0;
  for (let i = 0; i < w * h; i++)
    distance[i] = Math.hypot(...bg.map((v, c) => data[i * 3 + c] - v));
  const push = (i) => {
    if (!outside[i] && distance[i] < 65) {
      outside[i] = 1;
      queue[tail++] = i;
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
    const i = queue[head++],
      x = i % w,
      y = Math.floor(i / w);
    if (x) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const alpha = new Float32Array(w * h),
    edge = new Float32Array(w * h);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = outside[i]
      ? distance[i] > 12
        ? Math.max(0, ...bg.map((v, c) => (v - data[i * 3 + c]) / v))
        : 0
      : 1;
    edge[i] = alpha[i] > 0.02 ? 1e5 : 0;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x) edge[i] = Math.min(edge[i], edge[i - 1] + 1);
      if (y) edge[i] = Math.min(edge[i], edge[i - w] + 1);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) edge[i] = Math.min(edge[i], edge[i + 1] + 1);
      if (y < h - 1) edge[i] = Math.min(edge[i], edge[i + w] + 1);
    }
  const rgba = Buffer.alloc(w * h * 4);
  let l = w,
    r = 0,
    t = h,
    b = 0,
    solidBottom = 0;
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i],
      fade = Math.min(1, edge[i] / 7),
      final = a * fade;
    for (let c = 0; c < 3; c++)
      rgba[i * 4 + c] = a
        ? Math.max(0, Math.min(255, (data[i * 3 + c] - (1 - a) * bg[c]) / a))
        : 0;
    rgba[i * 4 + 3] = Math.round(final * 255);
    if (final > 0.05) {
      const x = i % w,
        y = Math.floor(i / w);
      l = Math.min(l, x);
      r = Math.max(r, x);
      t = Math.min(t, y);
      b = Math.max(b, y);
    }
    if (final >= 0.8) solidBottom = Math.max(solidBottom, Math.floor(i / w));
  }
  let minX = w,
    maxX = 0;
  for (let y = solidBottom - 8; y <= solidBottom; y++)
    for (let x = 0; x < w; x++)
      if (rgba[(y * w + x) * 4 + 3] >= 204) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
  const anchorSource = [(minX + maxX) / 2, solidBottom];
  l = Math.max(0, l - 2);
  t = Math.max(0, t - 2);
  r = Math.min(w - 1, r + 2);
  b = Math.min(h - 1, b + 2);
  const crop = [l, t, r - l + 1, b - t + 1],
    anchor = { x: anchorSource[0] - l, y: anchorSource[1] - t };
  const full = `building/${key}-grounded@2x.webp`;
  const cut = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: l, top: t, width: crop[2], height: crop[3] })
    .raw()
    .toBuffer();
  const finished = finishEdges(cut, crop[2], crop[3], 1);
  const image = encode(finished, crop[2], crop[3]);
  await writeFile(`public/assets/${full}`, image);
  const old = baseline.find((v) => v.file === `building/${key}-t1-map@2x.webp`),
    worldScale = old.bodyWidth / (spec.body[1] - spec.body[0]);
  const mapWidth = Math.round(crop[2] * worldScale * 2),
    exportScale = mapWidth / crop[2],
    scale = worldScale / exportScale;
  const resized = await sharp(finished, {
    raw: { width: crop[2], height: crop[3], channels: 4 },
  })
    .resize({ width: mapWidth })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const map = encode(
    finishEdges(resized.data, resized.info.width, resized.info.height, 1),
    resized.info.width,
    resized.info.height,
  );
  const meta = await sharp(map).metadata();
  const slot = world.slots.find((s) => s.id === spec.id),
    oldSlot = baselineWorld.slots.find((s) => s.id === spec.id),
    position = [(oldSlot.rect[0] + oldSlot.rect[2]) / 2, oldSlot.rect[3]];
  const transform = (p) =>
    p.map(
      (v, c) => +(position[c] + (v - anchorSource[c]) * worldScale).toFixed(6),
    );
  const footprint = spec.stone.map(transform),
    entrance = transform(spec.step);
  entrance[1] = +(entrance[1] + 10).toFixed(6);
  const halfWidth = Math.max(anchor.x, crop[2] - anchor.x) * worldScale;
  slot.rect = [
    +(position[0] - halfWidth).toFixed(6),
    +(position[1] - anchor.y * worldScale).toFixed(6),
    +(position[0] + halfWidth).toFixed(6),
    position[1],
  ];
  slot.footprint = { polygon: footprint };
  slot.front = entrance;
  slot.entrance = entrance;
  const upsert = (f) => {
    const i = manifest.files.findIndex((v) => v.file === f.file);
    if (i < 0) manifest.files.push(f);
    else manifest.files[i] = f;
  };
  upsert({
    file: full,
    size: [crop[2], crop[3]],
    anchor,
    scale: 1,
    source: `${key}_grounded_v1.jpg`,
    sourceSha256: createHash('sha256').update(input).digest('hex'),
    crop,
    grounded: true,
  });
  for (const tier of [1, 2]) {
    const file = `building/${key}-t${tier}-map@2x.webp`;
    await writeFile(`public/assets/${file}`, map);
    const existing = manifest.files.find((f) => f.file === file);
    upsert({
      ...existing,
      file,
      size: [meta.width, meta.height],
      anchor: { x: anchor.x * exportScale, y: anchor.y * exportScale },
      source: full,
      scale: exportScale,
      grounded: true,
      worldScale: scale,
      worldAnchor: { x: position[0], y: position[1] },
    });
  }
  records.push({
    key,
    id: spec.id,
    sourceSize: [w, h],
    background: bg,
    crop,
    anchorSource,
    anchor,
    anchorMethod:
      'alpha >= 0.8; midpoint of min/max x in bottom 9 solid rows; feather 7 source px',
    bodySpan: spec.body,
    oldBodyWidth: old.bodyWidth,
    bodyWidthMethod:
      '0073c92 t1 world-buildings.bodyWidth; source stone/plinth left-right extremes excluding soil/grass',
    worldScale,
    mapScale: scale,
    exportScale,
    position,
    stoneSource: spec.stone,
    stepSource: spec.step,
    footprint,
    entrance,
    rect: slot.rect,
    sharedTiers: true,
  });
}
await writeFile(
  'scripts/grounded-geometry.json',
  await format(JSON.stringify(records), { parser: 'json' }),
);
await writeFile(
  'public/assets/manifest.json',
  await format(JSON.stringify(manifest), { parser: 'json' }),
);
// Rewrite only the permitted four slot fields, preserving all other world bytes.
let output = worldText;
for (const spec of Object.values(specs)) {
  const start = output.indexOf(
    '    {\n      "id": "' + spec.id + '"',
    output.indexOf('  "slots":'),
  );
  const end = output.indexOf('\n    }', start) + 6;
  const slot = world.slots.find((s) => s.id === spec.id);
  const formatted = (await format(JSON.stringify(slot), { parser: 'json' }))
    .trimEnd()
    .split('\n')
    .map((line) => '    ' + line)
    .join('\n');
  output = output.slice(0, start) + formatted + output.slice(end);
}
await writeFile('data/world.json', output);
