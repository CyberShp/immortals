import { expect, test } from 'vitest';
import { cardPosition, intersectionArea } from '../src/app/ui-model';
const viewport = { width: 800, height: 600 };
const size = { width: 100, height: 80 };
test('blocked original and right side avoid the dorm label', () => {
  const dorm = { x: 290, y: 200, width: 130, height: 190 };
  const p = cardPosition(300, 300, 100, 80, viewport, [dorm]);
  expect(p).toEqual({ x: 188, y: 300 });
  expect(intersectionArea({ ...p, ...size }, dorm)).toBe(0);
});
test('right viewport edge changes side without overflow', () => {
  const p = cardPosition(790, 300, 100, 80, viewport, [
    { x: 690, y: 200, width: 110, height: 90 },
  ]);
  expect(p).toEqual({ x: 678, y: 300 });
  expect(p.x + size.width).toBeLessThanOrEqual(viewport.width);
});
test('unobstructed original appearance is preserved', () => {
  expect(cardPosition(300, 300, 100, 80, viewport)).toEqual({ x: 250, y: 212 });
  expect(cardPosition(300, 50, 100, 80, viewport)).toEqual({ x: 250, y: 62 });
});
test('all candidates intersect: minimum intersection area wins', () => {
  const obstacles = [
    { x: 0, y: 0, width: 800, height: 600 },
    { x: 220, y: 0, width: 580, height: 600 },
  ];
  const p = cardPosition(300, 300, 100, 80, viewport, obstacles);
  expect(p).toEqual({ x: 188, y: 300 });
  expect(
    obstacles.reduce((n, r) => n + intersectionArea({ ...p, ...size }, r), 0),
  ).toBe(13440);
});
test('moving labels are reconsidered and touching edges do not intersect', () => {
  const first = cardPosition(300, 300, 100, 80, viewport);
  const next = cardPosition(300, 300, 100, 80, viewport, [
    { ...first, ...size },
  ]);
  expect(next).not.toEqual(first);
  expect(
    intersectionArea({ x: 0, y: 0, ...size }, { x: 100, y: 0, ...size }),
  ).toBe(0);
});
