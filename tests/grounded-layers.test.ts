import { expect, it } from 'vitest';
import sharp from 'sharp';
import {
  groundedLayer,
  insideGroundedBody,
} from '../src/render/grounded-layers';
import geometry from '../scripts/grounded-geometry.json';
import { walkable, worldMap } from '../src/render/world';

it('ground front pixels on reachable ground are below disciples; body keeps fixed anchor and footprint', async () => {
  const counts: Record<string, number> = {};
  for (const g of geometry) {
    const split = groundedLayer(`building/${g.key}-t1-map@2x.webp`)!;
    const { data, info } = await sharp(
      `public/assets/building/${g.key}-grounded@2x.webp`,
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let formerlyOccluded = 0;
    for (let y = 0; y < info.height; y += 3)
      for (let x = 0; x < info.width; x += 3) {
        if (data[(y * info.width + x) * 4 + 3] < 128) continue;
        const dx = (x - g.anchor.x) * g.worldScale,
          dy = (y - g.anchor.y) * g.worldScale;
        if (dy >= 0 || insideGroundedBody(dx, dy, split.points)) continue;
        if (walkable([g.position[0] + dx, g.position[1] + dy]))
          formerlyOccluded++;
      }
    counts[g.key] = formerlyOccluded;
    expect(formerlyOccluded).toBeGreaterThan(0);
    expect(
      insideGroundedBody(
        g.entrance[0] - g.position[0],
        g.entrance[1] - g.position[1],
        split.points,
      ),
    ).toBe(false);
    expect(worldMap.slots.find((s) => s.id === g.id)!.footprint).toEqual({
      polygon: g.footprint,
    });
  }
  console.log(
    'grounded former ground occlusion sample counts (3 source px grid)',
    counts,
  );
});
