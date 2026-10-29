import { expect, it } from 'vitest';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import geometry from '../scripts/platform-geometry.json';
import report from '../docs/platform-report.json';
import bridgeReport from '../docs/bridge-build.json';
import {
  worldMap,
  walkable,
  findPath,
  inPolygon,
  type Point,
} from '../src/render/world';
it('only two genuine internal joints; deck sides 1.2–1.3 bridge widths and 9px axial penetration', () => {
  expect(geometry.joints.map((j) => j.id)).toEqual(['west', 'east']);
  expect(worldMap.bridges.find((b) => b.id === 'north')!.points).toHaveLength(
    2,
  );
  for (const j of geometry.joints) {
    const bridge = worldMap.bridges.find((b) => b.id === j.id)!;
    for (const side of j.sideLengths)
      expect(side / bridge.width).toBeGreaterThanOrEqual(1.2);
    for (const side of j.sideLengths)
      expect(side / bridge.width).toBeLessThanOrEqual(1.3);
    const evidence = report.joints.find((p) => p.id === j.id)!;
    for (const d of evidence.penetration) {
      expect(d).toBeGreaterThanOrEqual(8);
      expect(d).toBeLessThanOrEqual(10);
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
    await readFile('scripts/platform-source.json', 'utf8'),
  );
  expect(spec.components.length).toBeGreaterThan(1);
  expect(spec.holes).toHaveLength(4);
});
