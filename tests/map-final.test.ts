import { avoidDiscipleHeads } from '../src/render/visibility';
import { expect, it } from 'vitest';
import { advance, createWorld } from '../src/sim/world';
import { loadData } from '../src/sim/data';
import { buildingDefinitions } from '../src/sim/catalog';
import {
  buildingLabelBox,
  compactMetrics,
  compactSlot,
  discipleSlot,
  intersects,
  locationRegion,
  placeNames,
  regions,
} from '../src/render/layout';

it.each([0, 60])(
  'tick %i names avoid all building labels and stay within 18px of their owner',
  (tick) => {
    const w = createWorld(42, loadData());
    advance(w, tick);
    const visible = w.disciples.filter(
      (d) =>
        d.stage !== '坐化' &&
        !d.state.awayUntil &&
        !['休息', '历练'].includes(d.state.behavior),
    );
    const points = visible.map((d) => {
      const peers = visible.filter(
        (other) =>
          locationRegion(other.state.location) ===
          locationRegion(d.state.location),
      );
      return {
        ...discipleSlot(
          locationRegion(d.state.location),
          peers.indexOf(d),
          peers.length,
        ),
        name: d.name,
        height: 48,
      };
    });
    const buildings = buildingDefinitions.map((def) => {
      const b = w.buildings.find((b) => b.id === def.id);
      return buildingLabelBox(
        def.id,
        b
          ? `${b.name} Lv${b.level}${b.targetLevel && b.targetLevel > b.level ? ' ⚒' : ''}`
          : `${def.name}预留位`,
      );
    });
    const names = placeNames(points, buildings);
    expect(names.length).toBeGreaterThan(0);
    names.forEach((box, i) => {
      [...buildings, ...names.slice(i + 1)].forEach((other) =>
        expect(intersects(box, other), points[i].name).toBe(false),
      );
      const p = points[i];
      expect(
        Math.hypot(
          box.x + box.width / 2 - p.x,
          box.y + box.height / 2 - (p.y - (p.row ? 48 : 0)),
        ),
        p.name,
      ).toBeLessThanOrEqual(18);
      if (p.row) {
        expect(Math.abs(box.x + box.width / 2 - p.x)).toBeLessThanOrEqual(12);
        expect(p.y - 48 - box.y - box.height).toBeGreaterThanOrEqual(2);
        expect(p.y - 48 - box.y - box.height).toBeLessThanOrEqual(4);
      }
    });
  },
);
it.each([
  [480, 270],
  [450, 180],
  [320, 100],
])('compact markers retain CSS size in %ix%i canvas', (width, height) => {
  const m = compactMetrics(width, height);
  expect(m.diameter * m.scale).toBeCloseTo(14);
  expect(m.fontSize * m.scale).toBeCloseTo(11);
  const points = Array.from({ length: 6 }, (_, i) =>
    compactSlot(regions.空地, i, 6, m.spacing),
  );
  points
    .slice(1)
    .forEach((p, i) => expect((p.x - points[i].x) * m.scale).toBeCloseTo(16));
});

it('building labels rise at most 20 and fade when any head still overlaps', () => {
  const box = { x: 0, y: 30, width: 80, height: 30 };
  expect(avoidDiscipleHeads(box, [])).toEqual({ box, rise: 0, alpha: 1 });
  const head = { x: 10, y: 45, width: 20, height: 25 };
  const raised = avoidDiscipleHeads(box, [head]);
  expect(raised.rise).toBe(15);
  expect(raised.alpha).toBe(1);
  expect(intersects(raised.box, head)).toBe(false);
  const blocked = avoidDiscipleHeads(box, [
    head,
    { x: 0, y: 0, width: 20, height: 50 },
  ]);
  expect(blocked.rise).toBe(20);
  expect(blocked.alpha).toBe(0);
  expect(avoidDiscipleHeads(box, []).alpha).toBe(1);
});
