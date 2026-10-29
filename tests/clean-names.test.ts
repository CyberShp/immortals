import { expect, it } from 'vitest';
import {
  overheadNames,
  overheadNameGap,
  overheadNameFontSize,
  intersects,
} from '../src/render/layout';
import { avoidDiscipleHeads } from '../src/render/visibility';
import gate from '../scripts/clean-gate-art.json';
it('names use a fixed smaller overhead anchor and do not drift when blocked by roofs', () => {
  const p = { x: 1566, y: 1210, height: 65, bodyWidth: 40, name: '沈言' };
  const [clear] = overheadNames([p]);
  expect(overheadNameFontSize).toBe(16);
  expect(clear.y + clear.height).toBe(p.y - p.height - overheadNameGap);
  expect(clear.visible).toBe(true);
  const [hidden] = overheadNames(
    [p],
    [
      {
        x: gate.crop[0],
        y: gate.crop[1],
        width: gate.crop[2],
        height: gate.crop[3],
      },
    ],
  );
  expect(hidden.visible).toBe(false);
  expect(hidden.x).toBe(clear.x);
  expect(hidden.y).toBe(clear.y);
  const [otherRoof] = overheadNames(
    [p],
    [{ x: clear.x, y: clear.y, width: clear.width, height: clear.height }],
  );
  expect(otherRoof.visible).toBe(false);
});
it('only collision-free labels remain visible among crowded bodies and names', () => {
  const people = [
    { x: 100, y: 150, height: 60, bodyWidth: 40, name: '甲乙' },
    { x: 110, y: 150, height: 60, bodyWidth: 40, name: '丙丁' },
    { x: 100, y: 90, height: 60, bodyWidth: 40, name: '戊己' },
  ];
  const boxes = overheadNames(people);
  expect(boxes.some((b) => !b.visible)).toBe(true);
  for (const [i, b] of boxes.entries())
    if (b.visible) {
      for (const p of people)
        expect(
          intersects(b, { x: p.x - 20, y: p.y - 60, width: 40, height: 60 }),
        ).toBe(false);
      for (const c of boxes.slice(i + 1).filter((c) => c.visible))
        expect(intersects(b, c)).toBe(false);
    }
  expect(
    avoidDiscipleHeads({ x: 0, y: 0, width: 100, height: 30 }, [
      { x: -20, y: -100, width: 200, height: 200 },
    ]).alpha,
  ).toBe(0);
});
