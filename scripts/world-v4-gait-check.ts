import { advanceGait, strideLength } from '../src/render/disciple-gait';
import { coolFrame } from '../src/render/cool-disciple';
import { DISCIPLE_SCALE } from '../src/render/world-scale';
import { V4 } from '../src/render/world-v4';
import assert from 'node:assert/strict';
const height = 96 * DISCIPLE_SCALE * V4.actorScale;
const stride = strideLength(height);
const results = [32.8, 48].map((speed) => {
  let cycles = 0,
    distance = 0;
  const frames = new Set<string>();
  for (let i = 0; i < 600; i++) {
    distance += speed / 60;
    cycles = advanceGait(cycles, speed / 60, 1 / 60, true, height).cycles;
    frames.add(coolFrame('m', 'walk', cycles, (i * 1000) / 60));
  }
  assert.ok(Math.abs(distance / cycles - stride) < 1e-9);
  assert.equal(frames.size, 8);
  return {
    speed,
    stride,
    pixelsPerFrame: stride / 8,
    fps: (speed / stride) * 8,
    cycleSeconds: stride / speed,
    distance,
    cycles,
    observedPixelsPerCycle: distance / cycles,
  };
});
console.log(
  JSON.stringify(
    {
      height,
      results,
      ratio: 48 / 32.8,
      note: 'distance-driven gait already scales FPS; no animation or speed change',
    },
    null,
    2,
  ),
);
