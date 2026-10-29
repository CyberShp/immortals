import { expect, it } from 'vitest';
import { finishEdges } from '../scripts/grounded-edge.mjs';
it('erodes one pixel without moving RGB interior or expanding alpha; bleeds opaque color into zero alpha', () => {
  const src = Buffer.alloc(9 * 9 * 4);
  for (let y = 1; y < 8; y++)
    for (let x = 1; x < 8; x++) {
      const i = (y * 9 + x) * 4;
      src.set(
        [73, 101, 41, x === 1 || y === 1 || x === 7 || y === 7 ? 80 : 255],
        i,
      );
    }
  const out = finishEdges(src, 9, 9, 1);
  for (let i = 0; i < 81; i++) {
    expect(out[i * 4 + 3]).toBeLessThanOrEqual(src[i * 4 + 3]);
    expect([...out.subarray(i * 4, i * 4 + 3)]).toEqual([73, 101, 41]);
  }
  expect(out[(1 * 9 + 4) * 4 + 3]).toBe(0);
  expect(out[(2 * 9 + 4) * 4 + 3]).toBe(80);
  expect(out[(4 * 9 + 4) * 4 + 3]).toBe(255);
});
