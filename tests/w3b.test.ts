import { it, expect } from 'vitest';
import { createWorld, advance } from '../src/sim/world';
import { loadData } from '../src/sim/data';
import { discipleDestinations, DISCIPLE_SCALE } from '../src/render/world';
import { placeNames, headBox, intersects } from '../src/render/layout';
for (const tick of [0, 60, 600])
  it(`names avoid every body and keep four CSS pixels from hair at tick ${tick}`, () => {
    const w = createWorld(42, loadData());
    advance(w, tick);
    const destinations = discipleDestinations(w.disciples, w.tick);
    for (const zoom of [0.25, 0.5, 1, 1.5]) {
      const points = destinations.map(([x, y], i) => ({
        x: x / 2,
        y: y / 2,
        height: (96 * DISCIPLE_SCALE) / 2,
        name: w.disciples[i].name,
      }));
      const gap = 4 / (2 * zoom);
      const boxes = placeNames(points, [], gap);
      boxes.forEach((box) =>
        points.forEach((p) => {
          const head = headBox(p);
          expect(
            intersects(box, {
              x: head.x - gap,
              y: head.y - gap,
              width: head.width + gap * 2,
              height: head.height + gap * 2,
            }),
          ).toBe(false);
          expect(
            intersects(box, {
              x: p.x - p.height / 2,
              y: p.y - p.height,
              width: p.height,
              height: p.height,
            }),
          ).toBe(false);
        }),
      );
    }
  });
