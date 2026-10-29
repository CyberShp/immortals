import measured from '../src/render/pedestal-geometry.json';
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
    // At small alchemy scale the 18px shoe clearance legitimately excludes the
    // whole ground fringe; the large hall still exercises walkable ground layering.
    if (g.key === 'hall') expect(formerlyOccluded).toBeGreaterThan(0);
    expect(
      insideGroundedBody(
        g.entrance[0] - g.position[0],
        g.entrance[1] - g.position[1],
        split.points,
      ),
    ).toBe(false);
    expect(worldMap.slots.find((s) => s.id === g.id)!.footprint).toEqual(
      measured.buildings.find((b) => b.id === g.id)!.footprint,
    );
  }
  console.log(
    'grounded former ground occlusion sample counts (3 source px grid)',
    counts,
  );
});

it('Iris body masks exclude visible stone, treads and meditation floor but retain the front pillar', async () => {
  const cuts = (await import('../src/render/grounded-body.json')).default;
  for (const g of geometry) {
    const split = groundedLayer(`building/${g.key}-t1-map@2x.webp`)!;
    const cut = cuts[g.key as keyof typeof cuts];
    for (const [x, y] of cut.groundSamples) {
      expect(
        insideGroundedBody(
          (x - g.anchorSource[0]) * g.worldScale,
          (y - g.anchorSource[1]) * g.worldScale,
          split.points,
          split.extraPolygons,
        ),
        `${g.key} stone/floor ${x},${y}`,
      ).toBe(false);
    }
    const roof = [550, 300];
    expect(
      insideGroundedBody(
        (roof[0] - g.anchorSource[0]) * g.worldScale,
        (roof[1] - g.anchorSource[1]) * g.worldScale,
        split.points,
        split.extraPolygons,
      ),
    ).toBe(true);
  }
  const g = geometry.find((g) => g.key === 'meditation')!,
    split = groundedLayer('building/meditation-t1-map@2x.webp')!;
  expect(
    insideGroundedBody(
      (650 - g.anchorSource[0]) * g.worldScale,
      (580 - g.anchorSource[1]) * g.worldScale,
      split.points,
      split.extraPolygons,
    ),
  ).toBe(true);
});
