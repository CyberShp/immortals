import { describe, expect, it } from 'vitest';
import {
  regions,
  locationRegion,
  plots,
  discipleSlot,
  nameBox,
  buildingArt,
  buildingLabelBox,
} from '../src/render/layout';
import buildings from '../data/buildings.json';
const overlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
describe('map gathering layout', () => {
  for (const [location, region] of Object.entries(regions)) {
    it.each([1, 2, 3, 4, 5, 6])(
      `${location}: keeps %i feet inside the region with distinct slots`,
      (count) => {
        const slots = Array.from({ length: count }, (_, i) =>
          discipleSlot(region, i, count),
        );
        const [left, top, right, bottom] = region.rect;
        for (const [i, a] of slots.entries()) {
          expect(a.x).toBeGreaterThanOrEqual(left);
          expect(a.x).toBeLessThanOrEqual(right);
          expect(a.y).toBeGreaterThanOrEqual(top);
          expect(a.y).toBeLessThanOrEqual(bottom);
          for (const b of slots.slice(i + 1)) {
            if (a.row === b.row)
              expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(20);
            else expect(Math.abs(a.y - b.y)).toBeGreaterThan(0);
          }
        }
      },
    );
  }
  it('uses three 34px columns and rows at 300/280 on the lower platform', () => {
    const slots = Array.from({ length: 6 }, (_, i) =>
      discipleSlot(regions.空地, i, 6),
    );
    expect(slots[1].x - slots[0].x).toBe(34);
    expect(slots.map((s) => s.y)).toEqual([300, 300, 300, 280, 280, 280]);
    for (const height of [24, 48, 96]) {
      const boxes = slots.map((p) => nameBox(p.x, p.y, p.row, height));
      boxes.forEach((a, i) =>
        boxes.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)),
      );
    }
  });
  it('resolves unknown locations to the right terrace', () => {
    expect(locationRegion('未识别地点')).toBe(regions.未知);
    expect(regions.未知.rect).toEqual([430, 170, 530, 200]);
  });
  it('centers construction areas 6px below their plot within its width', () => {
    for (const [id, key] of Object.entries(buildingArt)) {
      const p = plots[key],
        region = locationRegion(`工地:${id}`);
      expect(region.center).toEqual([(p[0] + p[2]) / 4, p[3] / 2 + 6]);
      expect([region.rect[0], region.rect[2]]).toEqual([p[0] / 2, p[2] / 2]);
    }
  });
  it('keeps all five label bounds apart, including reservations, levels and construction marks', () => {
    // Longest supported text for each building, with a 2px stroke on each side.
    const boxes = buildings.map((b) => {
      const texts = [`${b.name}预留位`, `${b.name} Lv${b.maxLevel} ⚒`];
      return buildingLabelBox(
        b.id,
        texts.sort((a, b) => b.length - a.length)[0],
      );
    });
    boxes.forEach((a, i) =>
      boxes.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)),
    );
  });
});

it('uses the quarry rock and meditation grass coordinates', () => {
  expect(regions.采石点).toEqual({
    center: [385, 66],
    rect: [365, 60, 410, 72],
  });
  expect(regions.静修室).toEqual({
    center: [447, 148],
    rect: [424, 135, 470, 160],
  });
});

it.each(Object.entries(regions))(
  '%s region avoids the four solid building plots',
  (_location, region) => {
    const [left, top, right, bottom] = region.rect;
    for (const key of ['hall', 'dorm', 'meditation', 'alchemy']) {
      const [x0, y0, x1, y1] = plots[key];
      expect(
        overlap(
          { x: left, y: top, width: right - left, height: bottom - top },
          { x: x0 / 2, y: y0 / 2, width: (x1 - x0) / 2, height: (y1 - y0) / 2 },
        ),
        key,
      ).toBe(false);
    }
  },
);

it('allows the garden region inside its garden plot', () => {
  const [left, top, right, bottom] = regions.药圃.rect;
  const [x0, y0, x1, y1] = plots.garden;
  expect(left).toBeGreaterThanOrEqual(x0 / 2);
  expect(top).toBeGreaterThanOrEqual(y0 / 2);
  expect(right).toBeLessThanOrEqual(x1 / 2);
  expect(bottom).toBeLessThanOrEqual(y1 / 2);
});
