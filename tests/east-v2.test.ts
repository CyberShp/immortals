import { expect, it } from 'vitest';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import platforms from '../scripts/platform-geometry.json';
import landing from '../docs/east-v2-landing.json';
import bridgeReport from '../docs/bridge-build.json';
it('v2 grass supports the full 40px deck at least 10px beyond its cliff-top boundary', async () => {
  expect(landing.sourceSize).toEqual([1280, 720]);
  expect(landing.anchorWorld).toEqual([2390, 1029]);
  expect(landing.conservativeMinimumDepth).toBeGreaterThanOrEqual(10);
  const actual = bridgeReport.placements
    .filter((p) => p.bridge === 'east')
    .at(-1)!;
  expect(actual.b).toEqual(landing.physicalTipWorld);
  const { data, info } = await sharp(landing.source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tip = landing.physicalTipLocal;
  const dx = 170 / Math.hypot(170, 17),
    dy = -17 / Math.hypot(170, 17);
  for (let side = -20; side <= 20; side++)
    for (let t = 0; t <= 10; t++) {
      const x = Math.round(tip[0] - dx * t - dy * side),
        y = Math.round(tip[1] - dy * t + dx * side);
      const i = (y * info.width + x) * 4;
      expect(data[i + 3]).toBe(255);
      expect(
        Math.hypot(data[i] - 241, data[i + 1] - 232, data[i + 2] - 212),
      ).toBeGreaterThan(45);
    }
});
it('v2 recomposition preserves pixels outside the east replacement region within codec tolerance', async () => {
  const before = await sharp(
    execFileSync('git', ['show', '7ea9869:public/assets/map/world.webp'], {
      maxBuffer: 20e6,
    }),
  )
    .removeAlpha()
    .raw()
    .toBuffer();
  const after = await sharp('public/assets/map/world.webp')
    .removeAlpha()
    .raw()
    .toBuffer();
  let sum = 0,
    n = 0;
  for (let y = 0; y < 1400; y++)
    for (let x = 0; x < 3200; x++) {
      // Round platform replacement is intentional; retain the same codec tolerance elsewhere.
      if (
        platforms.joints.some(
          (j) =>
            Math.abs(x - j.center[0]) < 125 && Math.abs(y - j.center[1]) < 110,
        )
      )
        continue;
      if (x >= 2290 && x <= 2495 && y >= 945 && y <= 1120) continue;
      for (let c = 0; c < 3; c++) {
        const i = (y * 3200 + x) * 3 + c;
        sum += Math.abs(before[i] - after[i]);
        n++;
      }
    }
  console.log({ eastV2OutsideReplacementMAE: sum / n });
  expect(sum / n).toBeLessThan(0.5);
});
