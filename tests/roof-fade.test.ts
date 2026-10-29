import { describe, expect, it } from 'vitest';
import {
  easeInOut,
  indoorSpot,
  insideInset,
  offsetPoints,
  retargetRoof,
  roofAlpha,
  roofAnimating,
  roofFadeBuildings,
  roofFadeEnabled,
  ROOF_HIDE_MS,
  ROOF_SHOW_MS,
  INDOOR_INSET,
  type Point,
} from '../src/render/roof-fade';
import pedestal from '../src/render/pedestal-geometry.json';

const entranceOf = (id: string) =>
  pedestal.buildings.find((b) => b.id === id)!.entrance as Point;

describe('roof fade', () => {
  it('is off unless ?roofFade=1', () => {
    expect(roofFadeEnabled('')).toBe(false);
    expect(roofFadeEnabled('?roofFade=0')).toBe(false);
    expect(roofFadeEnabled('?debug=1&roofFade=1')).toBe(true);
  });

  it('covers the three closed houses with door-height scales', () => {
    expect(Object.keys(roofFadeBuildings).sort()).toEqual([
      'B_ALCHEMY',
      'B_DORM',
      'B_MEDIT',
    ]);
    for (const b of Object.values(roofFadeBuildings)) {
      expect(b.doorPx * b.scale).toBeCloseTo(66, 1);
      expect(b.exterior.file).toMatch(/^rebuild\/roof-fade\//);
      expect(b.interior.file).toMatch(/^rebuild\/roof-fade\//);
      expect(b.foundationTop).toHaveLength(4);
    }
  });

  it('eases 1→0 in 0.3s and back in 0.5s', () => {
    let t = retargetRoof(undefined, true, 1000);
    expect(t!.duration).toBe(ROOF_HIDE_MS);
    expect(roofAlpha(t, 1000)).toBe(1);
    expect(roofAlpha(t, 1150)).toBeCloseTo(0.5, 5);
    expect(roofAlpha(t, 1300)).toBe(0);
    expect(roofAnimating(t, 1299)).toBe(true);
    expect(roofAnimating(t, 1300)).toBe(false);
    t = retargetRoof(t, true, 1400);
    expect(t!.start).toBe(1000);
    t = retargetRoof(t, false, 2000);
    expect(t!.duration).toBe(ROOF_SHOW_MS);
    expect(roofAlpha(t, 2250)).toBeCloseTo(0.5, 5);
    expect(roofAlpha(t, 2500)).toBe(1);
  });

  it('reverses from the current alpha without jumping', () => {
    const hide = retargetRoof(undefined, true, 0)!;
    const mid = roofAlpha(hide, 150);
    const show = retargetRoof(hide, false, 150)!;
    expect(roofAlpha(show, 150)).toBeCloseTo(mid, 6);
    expect(show.duration).toBeCloseTo(ROOF_SHOW_MS * (1 - mid), 6);
    expect(easeInOut(0.25)).toBeCloseTo(0.125, 6);
  });

  it('puts every indoor spot inside the inset foundation, entrance outside', () => {
    for (const [id, b] of Object.entries(roofFadeBuildings)) {
      const e = entranceOf(id);
      const diamond = offsetPoints(b.foundationTop, e);
      expect(insideInset(e, diamond, INDOOR_INSET)).toBe(false);
      for (let i = 0; i < 8; i++)
        expect(
          insideInset(indoorSpot(b, e, i).point, diamond, INDOOR_INSET),
        ).toBe(true);
    }
  });

  it('seats the first two meditators on the measured cushions', () => {
    const b = roofFadeBuildings.B_MEDIT;
    const e = entranceOf('B_MEDIT');
    expect(indoorSpot(b, e, 0).seat).toBe(true);
    expect(indoorSpot(b, e, 1).seat).toBe(true);
    expect(indoorSpot(b, e, 2).seat).toBe(false);
  });
});
