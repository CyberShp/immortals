import sharp from 'sharp';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { format } from 'prettier';
import { tsImport } from 'tsx/esm/api';
const { DISCIPLE_SCALE, DISCIPLE_HEIGHT: H } = await tsImport(
  '../src/render/world-scale.ts',
  import.meta.url,
);
const { doorRules } = await tsImport(
  '../src/render/layout.ts',
  import.meta.url,
);
const manifest = JSON.parse(
  await readFile('public/assets/manifest.json', 'utf8'),
);
const world = JSON.parse(await readFile('data/world.json', 'utf8'));
const names = {
  hall: 'B_HALL',
  dorm: 'B_DORM',
  meditation: 'B_MEDIT',
  alchemy: 'B_ALCHEMY',
  garden: 'B_GARDEN',
};
const buildings = [];
const bodyCaps = {};
for (let pass = 0; pass < 2; pass++) {
  buildings.length = 0;
  for (const f of manifest.files.filter((f) => f.file.includes('-map@'))) {
    const key = f.file.split('/')[1].split('-')[0],
      slot = world.slots.find((s) => s.id === names[key]),
      [l, t, r, b] = slot.rect,
      centerX = (l + r) / 2,
      centerY = (t + b) / 2;
    let x = centerX,
      y = b;
    const original = manifest.files.find((o) => o.file === f.source);
    const exportScale = f.scale;
    const measure = original.measure;
    const bodyWidth = measure?.footprint_body_w_src ?? original.size[0];
    const bottomOffset = measure
      ? original.crop[3] - measure.building_y_src[1]
      : 0;
    const doorPixels = measure?.door_leaf_h ?? doorRules[key]?.pixels;
    const target = doorRules[key]?.target;
    let footprintWorld;
    const { data, info } = await sharp('public/assets/' + f.file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    function inspect(scale) {
      if (key !== 'garden') y = b + bottomOffset * exportScale * scale;
      let overlapSelfSlot = 0,
        overlapNeighborSlots = 0,
        bottom = -Infinity,
        left = Infinity,
        right = -Infinity;
      const neighbors = [
        ...world.slots.filter((s) => s.id !== slot.id),
        { id: 'plaza', rect: [1413, 920, 1631, 1046] },
      ];
      const overlapsBySlot = Object.fromEntries(
        neighbors.map((s) => [s.id, 0]),
      );
      for (let py = 0; py < info.height; py++)
        for (let px = 0; px < info.width; px++) {
          if (!data[(py * info.width + px) * 4 + 3]) continue;
          const wx = x + (px - f.anchor.x) * scale,
            wy = y + (py - f.anchor.y) * scale;
          bottom = Math.max(bottom, wy + scale);
          left = Math.min(left, wx);
          right = Math.max(right, wx + scale);
          const overlaps = (rect) =>
            wx + scale > rect[0] &&
            wx < rect[2] &&
            wy + scale > rect[1] &&
            wy < rect[3];
          if (overlaps(slot.rect)) overlapSelfSlot++;
          let neighbor = false;
          for (const s of neighbors)
            if (overlaps(s.rect)) {
              overlapsBySlot[s.id]++;
              neighbor = true;
            }
          if (neighbor) overlapNeighborSlots++;
        }
      return {
        overlapSelfSlot,
        overlapNeighborSlots,
        overlapsBySlot,
        bottom,
        left,
        right,
      };
    }
    let scale = 1;
    if (key === 'garden') {
      const corners = f.footprint.corners_canvas;
      const points = Object.values(corners);
      const minX = Math.min(...points.map((p) => p[0])),
        maxX = Math.max(...points.map((p) => p[0]));
      const minY = Math.min(...points.map((p) => p[1])),
        maxY = Math.max(...points.map((p) => p[1]));
      scale = Math.min(
        0.24,
        (r - l + 12) / (maxX - minX),
        (b - t + 12) / (maxY - minY),
      );
      if (scale < 0.2) throw Error('Garden footprint cannot fit');
      x = centerX + (f.anchor.x - (minX + maxX) / 2) * scale;
      y = centerY + (f.anchor.y - (minY + maxY) / 2) * scale;
      footprintWorld = Object.fromEntries(
        Object.entries(corners).map(([k, p]) => [
          k,
          [x + (p[0] - f.anchor.x) * scale, y + (p[1] - f.anchor.y) * scale],
        ]),
      );
    }
    if (key !== 'garden') {
      const widthScale = (r - l) / bodyWidth;
      const desired = Math.max(widthScale, (target * H) / doorPixels);
      const cap = Math.min(
        widthScale * 1.15,
        bodyCaps[key] ? bodyCaps[key] / bodyWidth : Infinity,
      );
      let maxScale = cap;
      if (key === 'alchemy' || key === 'meditation') {
        let lo = 0,
          hi = cap;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          const a = inspect(mid / exportScale);
          if (
            a.overlapNeighborSlots === 0 &&
            (key !== 'alchemy' || a.bottom <= 1090)
          )
            lo = mid;
          else hi = mid;
        }
        maxScale = lo;
      }
      scale = Math.min(desired, maxScale) / exportScale;
    }
    const bounds = inspect(scale);
    buildings.push({
      file: f.file,
      scale,
      x,
      y,
      ...bounds,
      ...(footprintWorld ? { footprintWorld } : {}),
      discipleScale: DISCIPLE_SCALE,
      discipleHeight: H,
      sourceScale: scale * exportScale,
      bodyWidth: bodyWidth * exportScale * scale,
      bodyWidthRatio: (bodyWidth * exportScale * scale) / (r - l),
      bodyWidthBasis: measure
        ? 'footprint_body_w_src'
        : 'canvas width (legacy proxy)',
      bodyBottomOffsetSource: bottomOffset,
      bodyBottom: y - bottomOffset * exportScale * scale,
      doorRule: target ? `>=${target}H` : null,
      doorRatio: doorPixels ? (doorPixels * exportScale * scale) / H : null,
      meetsDoorRule: doorPixels
        ? (doorPixels * exportScale * scale) / H >= target - 1e-9
        : null,
      gardenFits:
        key === 'garden'
          ? Object.values(footprintWorld).every(
              ([x, y]) => x >= l - 6 && x <= r + 6 && y >= t - 6 && y <= b + 6,
            )
          : null,
    });
  }
  if (pass === 0) {
    for (const key of ['dorm', 'alchemy'])
      bodyCaps[key] =
        1.1 *
        Math.min(
          ...buildings
            .filter((b) => b.file.includes('/' + key + '-'))
            .map((b) => b.bodyWidth),
        );
  }
}
await writeFile(
  'docs/world-buildings.json',
  await format(JSON.stringify(buildings), { parser: 'json' }),
);
await appendFile(
  'STATUS.md',
  `- ${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })} W1c 建筑测量：${JSON.stringify(buildings)}；scale 为 map 导出图倍率，sourceScale 为源像素最终倍率；两级按本体宽归一，炼丹房按 alpha 全像素约束。\n`,
);

for (const f of manifest.files) {
  const b = buildings.find((b) => b.file === f.file);
  if (!b) continue;
  Object.assign(f, {
    worldScale: b.scale,
    worldAnchor: { x: b.x, y: b.y },
    worldSourceScale: b.sourceScale,
    worldBodyWidthRatio: b.bodyWidthRatio,
    worldMeetsDoorRule: b.meetsDoorRule,
    worldBodyBottom: b.bodyBottom,
    worldDoorRule: b.doorRule,
    worldDoorRatio: b.doorRatio,
  });
  if (b.footprintWorld) f.footprintWorld = b.footprintWorld;
}
let json;
for (;;) {
  json = await format(JSON.stringify(manifest), { parser: 'json' });
  const total = manifest.assetBytes + Buffer.byteLength(json);
  if (total === manifest.totalBytes) break;
  manifest.totalBytes = total;
}
await writeFile('public/assets/manifest.json', json);
