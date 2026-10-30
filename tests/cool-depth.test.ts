import { describe, expect, it } from 'vitest';
import { COOL_DEPTH, bandScreenY } from '../src/render/cool-depth';

describe('cool 自有纵深配置', () => {
  it('S3 未交付：全部为占位（asset 为 null）', () => {
    expect(COOL_DEPTH.sky.asset).toBeNull();
    expect(COOL_DEPTH.clouds).toHaveLength(3);
    expect(COOL_DEPTH.clouds.every((b) => b.asset === null)).toBe(true);
  });
  it('视差：远层比近层动得少，层序由远到近视差递增', () => {
    const view = { width: 1440, height: 900 };
    const ps = COOL_DEPTH.clouds.map((b) => b.parallax);
    expect([...ps].sort((a, b) => a - b)).toEqual(ps);
    for (const band of COOL_DEPTH.clouds) {
      const at = (y: number) =>
        bandScreenY(band, { x: 1800, y, zoom: 1 }, view);
      expect(at(COOL_DEPTH.center.y)).toBeCloseTo(
        view.height / 2 + band.y - COOL_DEPTH.center.y,
      );
      expect(
        at(COOL_DEPTH.center.y) - at(COOL_DEPTH.center.y + 100),
      ).toBeCloseTo(100 * band.parallax);
    }
  });
});
