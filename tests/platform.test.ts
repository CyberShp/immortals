import { expect, it } from 'vitest';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import geometry from '../scripts/platform-geometry.json';
import report from '../docs/round-platform-report.json';
import bridgeReport from '../docs/bridge-build.json';
import {
  worldMap,
  walkable,
  findPath,
  inPolygon,
  type Point,
} from '../src/render/world';
it('round platforms preserve post scale and provide 20–30px bridge penetration', () => {
  expect(geometry.joints.map((j) => j.id)).toEqual(['west', 'east']);
  expect(worldMap.bridges.find((b) => b.id === 'north')!.points).toHaveLength(
    2,
  );
  for (const j of geometry.joints) {
    const bridge = worldMap.bridges.find((b) => b.id === j.id)!;
    expect(geometry.postDiameterWorld / geometry.bridgePostWorld).toBeCloseTo(
      1,
    );
    for (const diameter of geometry.bridgePostWorldSamples) {
      expect(geometry.postDiameterWorld / diameter).toBeGreaterThan(0.9);
      expect(geometry.postDiameterWorld / diameter).toBeLessThan(1.1);
    }
    // Source is oversized when posts match; do not shrink posts to force a 1.5 deck ratio.
    expect(geometry.deckRatio).toBeCloseTo(geometry.deckWidth / bridge.width);
    expect(geometry.deckRatio).toBeGreaterThan(1.8);
    const evidence = report.joints.find((p) => p.id === j.id)!;
    for (const d of evidence.physicalPenetration) {
      expect(d).toBeGreaterThanOrEqual(20);
      expect(d).toBeLessThanOrEqual(30);
    }
    const actual = bridgeReport.placements.filter((p) => p.bridge === j.id);
    expect(actual[0].b).toEqual(evidence.bridgeEnds[0]);
    expect(actual[1].a).toEqual(evidence.bridgeEnds[1]);
    expect(walkable(j.center as Point)).toBe(true);
    const path = findPath(bridge.points[0], bridge.points.at(-1)!);
    let through = false;
    for (let i = 1; i < path.length; i++)
      for (let t = 0; t <= 1; t += 0.01) {
        const p: Point = [
          path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
          path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
        ];
        if (inPolygon(p, j.polygon as Point[])) through = true;
      }
    expect(through).toBe(true);
  }
});
it('polygon-cut platform has transparent corners, opaque deck anchor and no beige fringe', async () => {
  const { data, info } = await sharp('public/assets/' + geometry.file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual(geometry.size);
  expect(
    data[(geometry.anchor[1] * info.width + geometry.anchor[0]) * 4 + 3],
  ).toBe(255);
  for (const [x, y] of [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
  ])
    expect(data[(y * info.width + x) * 4 + 3]).toBe(0);
  expect(report.edge.samples).toBeGreaterThan(100);
  expect(report.edge.ratio).toBeLessThan(0.01);
  expect(report.outsideJointMAE).toBeLessThan(0.5);
  const spec = JSON.parse(
    await readFile('scripts/round-platform-source.json', 'utf8'),
  );
  expect(spec.components.length).toBeGreaterThan(1);
  expect(spec.holes).toHaveLength(4);
  expect(report.layerOrder).toEqual([
    'islands',
    'round platforms (source shadow only)',
    'bridge shadows and bridges',
  ]);
  expect(geometry.baked).toBe(true);
});

it('opaque bridges remain above round platform posts in the baked image', async () => {
  const { data } = await sharp('public/assets/map/world.webp')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (const joint of report.joints) {
    expect(joint.coveredSamples.length).toBeGreaterThan(10);
    let sum = 0;
    for (const sample of joint.coveredSamples) {
      const i = (sample.point[1] * 3200 + sample.point[0]) * 3;
      for (let c = 0; c < 3; c++) sum += Math.abs(data[i + c] - sample.rgb[c]);
    }
    expect(sum / (joint.coveredSamples.length * 3)).toBeLessThan(6);
  }
});
