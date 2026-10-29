import { expect, it } from 'vitest';
import { advanceGait, strideLength } from '../src/render/disciple-gait';
it('phase follows measured displacement, not commanded speed or wall clock', () => {
  const slow = advanceGait(0, 10, 1, true),
    fast = advanceGait(0, 20, 1, true);
  expect(fast.cycles).toBeCloseTo(slow.cycles * 2);
  expect(advanceGait(0, strideLength(), 2, true).cycles).toBeCloseTo(1);
});
it('blocked or zero-speed motion immediately idles without advancing phase', () => {
  const stopped = advanceGait(0.2, 0, 1, true);
  expect(stopped.moving).toBe(false);
  expect(stopped.cycles).toBe(0.2);
  expect(stopped.pose).toBe('walk-pass');
  expect(advanceGait(0.2, 0, 1, false).cycles).toBe(0.2);
});

it('Iris initial stride uses rendered height and changes frame each half-cycle displacement', () => {
  const stride = strideLength(67.2);
  expect(stride).toBeCloseTo(47.04);
  expect(advanceGait(0, stride / 2 - 0.01, 1, true, 67.2).pose).toBe(
    'walk-step',
  );
  expect(advanceGait(0, stride / 2, 1, true, 67.2).pose).toBe('walk-pass');
  expect(advanceGait(0, stride, 1, true, 67.2).phase).toBeCloseTo(0);
  expect(strideLength(67.2 * 2)).toBeCloseTo(stride * 2);
});
