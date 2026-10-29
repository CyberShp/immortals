import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  DISCIPLE_SCALE,
  DISCIPLE_HEIGHT,
  WALK_SPEED,
  WALK_FRAME_MS,
} from '../src/render/world-scale';
import { strideLength, STRIDE_HEIGHT_RATIO } from '../src/render/disciple-gait';
import { FOOT_SPACING } from '../src/render/world';
import geometry from '../src/render/pedestal-geometry.json';
import manifest from '../public/assets/manifest.json';
import buildings from '../docs/world-buildings.json';

// 弟子缩放是绝对值：屏幕高度 = 96 × DISCIPLE_SCALE（不是在 0.7 上再乘 0.6）。
it('DISCIPLE_SCALE is the absolute 0.6 sprite scale', () => {
  expect(DISCIPLE_SCALE).toBe(0.6);
  expect(96 * DISCIPLE_SCALE).toBeCloseTo(57.6);
  expect(DISCIPLE_HEIGHT).toBeCloseTo(93.71 * 0.6);
});

it('gait stride and frame timing follow the new body height; world walk speed stays', () => {
  // 步幅按身高比例 0.7 联动缩小，避免小人迈大步造成滑步/跨步错觉。
  expect(STRIDE_HEIGHT_RATIO).toBe(0.7);
  expect(strideLength()).toBeCloseTo(0.7 * 57.6);
  // 世界速度属于 sim/行程时间语义，不随美术缩放改。
  expect(WALK_SPEED).toBe(20);
  expect(WALK_FRAME_MS).toBeCloseTo(((0.35 * 93.71 * 0.6) / 20) * 1000);
});

it('pedestal foot radius is re-measured from the 0.6 walk frames', async () => {
  const walkFrames = manifest.files.filter(
    (f) =>
      f.file.startsWith('disciple/') &&
      f.file.includes('walk-') &&
      f.file.includes('-96'),
  );
  expect(walkFrames).toHaveLength(4);
  let max = 0;
  for (const f of walkFrames) {
    const { data, info } = await sharp('public/assets/' + f.file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let r = 0;
    for (let y = f.anchor.y - 8; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * 4 + 3] > 230)
          r = Math.max(r, Math.abs(x - f.anchor.x));
    const m = geometry.footMeasurements.find((m) => m.file === f.file)!;
    expect(m.worldRadius).toBeCloseTo(r * 0.6);
    max = Math.max(max, r * 0.6);
  }
  expect(geometry.footRadius).toBe(Math.ceil(max + 1));
  expect(geometry.footRadius).toBe(16);
  // 站位间距是世界单位、不随缩放改；弟子变小后相对身宽更宽松，且仍大于碰撞脚底半径。
  expect(FOOT_SPACING).toBe(28);
  expect(FOOT_SPACING).toBeGreaterThan(geometry.footRadius);
});

it('measure script and generated building report read the same scale', () => {
  expect(readFileSync('src/render/world-scale.ts', 'utf8')).toMatch(
    /DISCIPLE_SCALE = 0\.6;/,
  );
  for (const b of buildings) {
    expect(b.discipleScale).toBe(0.6);
    expect(b.discipleHeight).toBeCloseTo(93.71 * 0.6);
  }
});
