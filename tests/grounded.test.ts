import { expect, it } from 'vitest';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import geometry from '../scripts/grounded-geometry.json';
import manifest from '../public/assets/manifest.json';
import {
  worldMap,
  inFootprint,
  footprintPolygons,
  walkable,
  findPath,
  type Point,
} from '../src/render/world';

it.each(geometry)(
  '$key soft-key edge rejects beige spill while retaining transparent contact shadow',
  async (g) => {
    for (const file of [
      `building/${g.key}-grounded@2x.webp`,
      `building/${g.key}-t1-map@2x.webp`,
    ]) {
      const { data, info } = await sharp('public/assets/' + file)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let n = 0,
        residue = 0,
        distance = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3] / 255;
        if (a < 0.05 || a > 0.95) continue;
        n++;
        const rgb = [...data.subarray(i, i + 3)];
        const d = Math.hypot(...rgb.map((v, c) => v - g.background[c]));
        distance += d;
        if (
          Math.min(d, Math.hypot(rgb[0] - 241, rgb[1] - 232, rgb[2] - 212)) < 30
        )
          residue++;
      }
      expect(n).toBeGreaterThan(100);
      expect(distance / n).toBeGreaterThan(60);
      expect(residue / n).toBeLessThan(0.01);
      for (const [x, y] of [
        [0, 0],
        [info.width - 1, 0],
        [0, info.height - 1],
        [info.width - 1, info.height - 1],
      ])
        expect(data[(y * info.width + x) * 4 + 3]).toBeLessThan(13);
    }
    const report = JSON.parse(
      await readFile('docs/grounded-report.json', 'utf8'),
    );
    expect(
      report.buildings.find((b: { key: string }) => b.key === g.key).edge
        .exteriorShadowPixels,
    ).toBeGreaterThan(100);
  },
);
it('grounded tiers share pixels, preserve world anchors and match old t1 body widths', async () => {
  const before = JSON.parse(
    execFileSync('git', ['show', '0073c92:data/world.json'], {
      encoding: 'utf8',
    }),
  );
  for (const g of geometry) {
    const old = before.slots.find((s: { id: string }) => s.id === g.id);
    expect(g.position).toEqual([(old.rect[0] + old.rect[2]) / 2, old.rect[3]]);
    expect(g.worldScale * (g.bodySpan[1] - g.bodySpan[0])).toBeCloseTo(
      g.oldBodyWidth,
      8,
    );
    expect(
      await readFile(`public/assets/building/${g.key}-t1-map@2x.webp`),
    ).toEqual(await readFile(`public/assets/building/${g.key}-t2-map@2x.webp`));
    const entry = manifest.files.find(
      (f) => f.file === `building/${g.key}-grounded@2x.webp`,
    )!;
    expect(
      createHash('sha256')
        .update(
          await readFile(
            `${homedir()}/cutwork/backup/${g.key}_grounded_v1.jpg`,
          ),
        )
        .digest('hex'),
    ).toBe('sourceSha256' in entry ? entry.sourceSha256 : null);
  }
});
it('closed diamond collisions retain diagonal free space, legal reachable entrances, and fixed non-slot bytes', async () => {
  for (const g of geometry) {
    const slot = worldMap.slots.find((s) => s.id === g.id)!;
    expect(footprintPolygons(slot.footprint)).toEqual([g.footprint]);
    for (const p of g.footprint)
      expect(inFootprint(p as Point, slot.footprint)).toBe(true);
    const center = g.footprint.reduce(
      (p, q) => [p[0] + q[0] / 4, p[1] + q[1] / 4],
      [0, 0],
    ) as Point;
    expect(inFootprint(center, slot.footprint)).toBe(true);
    const corner: Point = [
      Math.min(...g.footprint.map((p) => p[0])),
      Math.min(...g.footprint.map((p) => p[1])),
    ];
    expect(inFootprint(corner, slot.footprint)).toBe(false);
    expect(walkable(slot.entrance)).toBe(true);
    expect(inFootprint(slot.entrance, slot.footprint)).toBe(false);
    expect(findPath([1590, 1050], slot.entrance).length).toBeGreaterThan(1);
  }
  const old = execFileSync('git', ['show', '0073c92:data/world.json'], {
      encoding: 'utf8',
    }),
    now = await readFile('data/world.json', 'utf8');
  expect(now.slice(0, now.indexOf('  "slots":'))).toBe(
    old.slice(0, old.indexOf('  "slots":')),
  );
  expect(now.slice(now.indexOf('  "spots":'))).toBe(
    old.slice(old.indexOf('  "spots":')),
  );
  const a = JSON.parse(old),
    b = JSON.parse(now);
  for (const g of geometry)
    for (const field of ['rect', 'front', 'footprint', 'entrance'])
      b.slots.find((s: { id: string }) => s.id === g.id)[field] = a.slots.find(
        (s: { id: string }) => s.id === g.id,
      )[field];
  expect(b).toEqual(a);
});

it.each(geometry)(
  '$key encoded transparent RGB bleeds from opaque pixels at full and map sizes',
  async (g) => {
    for (const suffix of ['grounded', 't1-map', 't2-map']) {
      const { data, info } = await sharp(
        `public/assets/building/${g.key}-${suffix}@2x.webp`,
      )
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let samples = 0,
        totalDistance = 0,
        beige = 0;
      for (let y = 12; y < info.height - 12; y++)
        for (let x = 12; x < info.width - 12; x++) {
          const i = (y * info.width + x) * 4;
          if (data[i + 3] !== 0) continue;
          let best = Infinity;
          for (let dy = -12; dy <= 12; dy++)
            for (let dx = -12; dx <= 12; dx++) {
              const j = ((y + dy) * info.width + x + dx) * 4;
              if (data[j + 3] === 255)
                best = Math.min(
                  best,
                  Math.hypot(
                    data[i] - data[j],
                    data[i + 1] - data[j + 1],
                    data[i + 2] - data[j + 2],
                  ),
                );
            }
          if (!Number.isFinite(best)) continue;
          samples++;
          totalDistance += best;
          if (
            Math.hypot(data[i] - 241, data[i + 1] - 232, data[i + 2] - 212) < 30
          )
            beige++;
        }
      expect(samples).toBeGreaterThan(0);
      expect(totalDistance / samples).toBeLessThan(35);
      expect(beige / samples).toBeLessThan(0.01);
    }
  },
);
