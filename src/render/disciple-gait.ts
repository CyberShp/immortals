import { DISCIPLE_SCALE } from './world-scale';
// Iris initial calibration: 0.7 body heights per cycle; revise this single ratio after her measurement.
// Ratio of body height, so stride shrinks with DISCIPLE_SCALE (0.6 → 40.32 world px/cycle).
export const STRIDE_HEIGHT_RATIO = 0.7;
export const strideLength = (height = 96 * DISCIPLE_SCALE) =>
  STRIDE_HEIGHT_RATIO * height;
export const WALK_CYCLE_FRAMES = 2;
export const MIN_WALK_SPEED = 0.5;
export function advanceGait(
  cycles: number,
  distance: number,
  dt: number,
  canMove: boolean,
  height = 96 * DISCIPLE_SCALE,
) {
  const speed = dt > 0 ? Math.max(0, distance) / dt : 0;
  const advance =
    speed >= MIN_WALK_SPEED ? Math.max(0, distance) / strideLength(height) : 0;
  const next = cycles + advance,
    moving = canMove && speed >= MIN_WALK_SPEED;
  return {
    cycles: next,
    phase: next % 1,
    moving,
    pose:
      moving && Math.floor(next * WALK_CYCLE_FRAMES) % WALK_CYCLE_FRAMES === 0
        ? 'walk-step'
        : 'walk-pass',
  };
}
