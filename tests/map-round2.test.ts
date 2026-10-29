import { it, expect } from 'vitest';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import manifest from '../public/assets/manifest.json';
import { CONFIG } from '../src/sim/config';
import { createWorld } from '../src/sim/world';
import { loadData } from '../src/sim/data';
import {
  headBox,
  buildingLabelBox,
  buildingDepth,
  buildingArt,
  plotFoot,
  rootRingColors,
  shortName,
  placeNames,
  intersects,
  discipleSlot,
  regions,
  plots,
  meditationProtected,
} from '../src/render/layout';
import {
  type Mask,
  type Occluder,
  visibilityOrder,
  labelOverlaps,
  overlapPixels,
} from '../src/render/visibility';
import { clampCamera } from '../src/render/camera';
async function mask(file: string, scale = 0.5): Promise<Mask> {
  const f = manifest.files.find((f) => f.file === file)!;
  const { data, info } = await sharp(
    await readFile(new URL('../public/assets/' + file, import.meta.url)),
  )
    .resize(Math.round(f.size[0] * scale), Math.round(f.size[1] * scale))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    anchorX: f.anchor.x * scale,
    anchorY: f.anchor.y * scale,
    alpha: Uint8Array.from(
      { length: info.width * info.height },
      (_, i) => data[i * 4 + 3],
    ),
  };
}
it.each([1, 2, 3, 4, 5])('maps %i roots directly from CONFIG', (count) => {
  const elements = Object.keys(CONFIG.elements).slice(0, count);
  expect(rootRingColors(elements)).toEqual(
    elements.map(
      (e) => CONFIG.elements[e as keyof typeof CONFIG.elements].color,
    ),
  );
});
it('unknown roots and long names', () => {
  expect(rootRingColors(['未知'])).toEqual(['#808080']);
  expect(shortName('一二三四五')).toBe('一二三四…');
});
it.each(Object.keys(regions))(
  '%s names avoid all other names and heads',
  (location) => {
    for (const height of [24, 48, 96]) {
      const points = createWorld(42, loadData()).disciples.map((d, i) => ({
        ...discipleSlot(regions[location], i, 6),
        name: d.name,
        height,
      }));
      const boxes = placeNames(points);
      boxes.forEach((a, i) => {
        expect(a.width).toBe(Array.from(points[i].name).length * 10.5 + 4);
        boxes.slice(i + 1).forEach((b) => expect(intersects(a, b)).toBe(false));
        points.forEach((p, j) => {
          if (i !== j) expect(intersects(a, headBox(p))).toBe(false);
        });
        if (points[i].row)
          expect(a.y + a.height).toBeLessThanOrEqual(points[i].y - height - 4);
        else expect(a.y).toBeGreaterThanOrEqual(points[i].y + 3);
      });
    }
  },
);
it('camera clamps zoom and every edge without blank space', () => {
  for (const zoom of [0, 1, 1.5, 2, 3, 4])
    for (const x of [-999, 300, 999])
      for (const y of [-999, 200, 999]) {
        const c = clampCamera({ zoom, x, y });
        expect(c.zoom).toBeGreaterThanOrEqual(1);
        expect(c.zoom).toBeLessThanOrEqual(3);
        expect(c.x - 320 / c.zoom).toBeGreaterThanOrEqual(0);
        expect(c.y - 180 / c.zoom).toBeGreaterThanOrEqual(0);
        expect(c.x + 320 / c.zoom).toBeLessThanOrEqual(640);
        expect(c.y + 180 / c.zoom).toBeLessThanOrEqual(360);
      }
});
it('actual t1 alpha masks protect heads throughout every region and pose', async () => {
  const buildings: Occluder[] = [];
  for (const f of manifest.files.filter((f) => f.file.includes('t1-map'))) {
    const key = f.file.split('/')[1].split('-')[0],
      p = plots[key];
    const y = p[3] / 2 + (f.downshift ?? 0);
    buildings.push({
      mask: await mask(f.file),
      x: (p[0] + p[2]) / 4,
      y,
      z: buildingDepth(key === 'garden' ? 'B_GARDEN' : key, y),
    });
  }
  const affected = new Set<string>();
  let raised = 0;
  for (const f of manifest.files.filter((f) => f.file.includes('-96@'))) {
    const m = await mask(f.file);
    for (const [name, r] of Object.entries(regions))
      for (let x = r.rect[0]; x <= r.rect[2]; x += 4)
        for (let y = r.rect[1]; y <= r.rect[3]; y += 4)
          for (const facing of [-1, 1]) {
            const result = visibilityOrder(m, x, y, buildings, facing);
            if (result.before < 0.6) affected.add(name);
            raised += Number(result.raised);
            expect(
              result.visible,
              `${name} ${f.file} ${x},${y}`,
            ).toBeGreaterThanOrEqual(0.6);
          }
  }
  expect(raised).toBeGreaterThan(0);
  console.log('调整前遮挡地点:', [...affected].sort().join('、'));
}, 30000);
it('alchemy final alpha overlap matches manifest at the permitted shift cap', async () => {
  for (const f of manifest.files.filter(
    (f) => f.file.includes('alchemy-') && f.file.includes('-map'),
  )) {
    const m = await mask(f.file);
    const count = overlapPixels(
      m,
      381,
      217.5 + (f.downshift ?? 0),
      meditationProtected,
    );
    expect(count).toBe(f.overlapPixels);
    expect(
      overlapPixels(m, 381, 217.5 + (f.downshift ?? 0), [
        meditationProtected[1],
      ]),
    ).toBe(0);
    if (count) {
      expect(f.downshift).toBe(24);
      for (let dy = 0; dy <= 24; dy++)
        expect(
          overlapPixels(m, 381, 217.5 + dy, [meditationProtected[0]]),
        ).toBeGreaterThan(0);
    } else if (f.downshift)
      expect(
        overlapPixels(m, 381, 217.5 + f.downshift - 1, meditationProtected),
      ).toBeGreaterThan(0);
  }
});
it('garden crops at y150 with bottom anchor and no roof in top five rows', async () => {
  for (const f of manifest.files.filter(
    (f) => f.file.includes('garden-') && f.file.includes('-map'),
  )) {
    expect(f.size).toEqual([218, 113]);
    expect(f.anchor.y).toBe(Math.round(137 * f.scale));
    const { data, info } = await sharp(
      await readFile(new URL('../public/assets/' + f.file, import.meta.url)),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let total = 0,
      blue = 0;
    for (let i = 0; i < info.width * 5; i++) {
      const [r, g, b, a] = data.subarray(i * 4, i * 4 + 4);
      if (!a) continue;
      total++;
      if (r < 150 && g < 160 && b > 120 && b > r) blue++;
    }
    expect(blue / Math.max(1, total)).toBeLessThan(0.02);
  }
});

it('all-built labels avoid alchemy/meditation and garden remains below every disciple', async () => {
  const buildings: Occluder[] = [];
  const labels = Object.keys(buildingArt).map((id) => ({
    id,
    box: buildingLabelBox(
      id,
      `${id === 'B_MEDIT' ? '静修室' : id === 'B_ALCHEMY' ? '炼丹房' : '建筑'} Lv1`,
    ),
  }));
  for (const tier of [1, 2]) {
    buildings.length = 0;
    for (const [id, art] of Object.entries(buildingArt)) {
      const file = `building/${art}-t${tier}-map@2x.webp`;
      const f = manifest.files.find((f) => f.file === file)!;
      const [x, foot] = plotFoot(id),
        y = foot + (f.downshift ?? 0);
      buildings.push({
        key: id,
        mask: await mask(file),
        x,
        y,
        z: buildingDepth(id, y),
      });
    }
    const overlaps = labelOverlaps(labels, buildings).filter(
      (o) =>
        (o.label === 'B_MEDIT' && o.other === 'B_ALCHEMY') ||
        (o.label === 'B_ALCHEMY' && o.other === 'B_MEDIT'),
    );
    expect(overlaps).toHaveLength(3);
    expect(overlaps.every((o) => o.pixels === 0)).toBe(true);
    const garden = buildings.find((b) => b.key === 'B_GARDEN')!;
    expect(garden.z).toBeLessThan(
      Math.min(...Object.values(regions).map((r) => r.rect[1])),
    );
  }
});
it('overlap diagnostics report positive mask and label collisions', () => {
  const result = labelOverlaps(
    [
      { id: 'a', box: { x: 0, y: 0, width: 2, height: 2 } },
      { id: 'b', box: { x: 1, y: 1, width: 2, height: 2 } },
    ],
    [
      {
        key: 'b',
        x: 0,
        y: 0,
        z: 0,
        mask: {
          width: 2,
          height: 2,
          anchorX: 0,
          anchorY: 0,
          alpha: new Uint8Array([255, 255, 255, 255]),
        },
      },
    ],
  );
  expect(result).toEqual([
    { label: 'a', other: 'b', kind: 'building', pixels: 4 },
    { label: 'a', other: 'b', kind: 'label', pixels: 1 },
  ]);
});
