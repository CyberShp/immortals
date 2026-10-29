import { describe, expect, it } from 'vitest';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import manifest from '../public/assets/manifest.json';
import traits from '../data/traits.json';
import { accessories, behaviorPose, buildingScale } from '../src/render/layout';
const root = new URL('../public/assets/', import.meta.url);
describe('Iris assets', () => {
  it('every manifest entry exists with its declared dimensions', async () => {
    for (const f of manifest.files) {
      const m = await sharp(await readFile(new URL(f.file, root))).metadata();
      expect([m.width, m.height], f.file).toEqual(f.size);
    }
  });
  it('five disciple poses have a shared 80×96 canvas and foot anchor', () => {
    const poses = manifest.files.filter((f) => f.file.includes('-96@'));
    expect(poses).toHaveLength(5);
    for (const f of poses) {
      expect(f.size).toEqual([80, 96]);
      expect(f.anchor).toEqual({ x: 40, y: 94 });
    }
  });
  it('building tiers use plot width and the same scale', () => {
    for (const id of ['hall', 'dorm', 'meditation', 'alchemy']) {
      const versions = manifest.files.filter(
        (f) => f.file.startsWith(`building/${id}-`) && f.file.includes('-map@'),
      );
      expect(versions).toHaveLength(2);
      for (const f of versions) {
        const source = manifest.files.find((e) => e.file === f.source)!;
        const expected = buildingScale(
          id,
          source.size[0],
          id === 'alchemy'
            ? buildingScale(id, source.size[0]).widthScale * 0.95
            : undefined,
        );
        expect(f.scale).toBe(expected.scale);
        expect(f.size[0]).toBe(Math.round(source.size[0] * expected.scale));
      }
      expect(versions[0].scale).toBe(versions[1].scale);
    }
  });
  it('all ten trait accessories map to actual icons', async () => {
    expect(Object.keys(accessories)).toHaveLength(10);
    for (const t of traits) {
      expect(accessories[t.accessory]).toBeTruthy();
      expect(
        (
          await stat(
            new URL(`accessory/${accessories[t.accessory]}-48@2x.webp`, root),
          )
        ).size,
      ).toBeGreaterThan(0);
    }
  });
  it.each([
    ['修炼', 'meditate'],
    ['做工', 'work'],
    ['社交', 'talk'],
    ['伤病', 'walk-pass'],
    ['未知', 'walk-pass'],
  ])('maps %s to %s', (behavior, pose) =>
    expect(behaviorPose(behavior)).toBe(pose),
  );
  it('movement overrides behavior and alternates at 180ms', () => {
    expect(behaviorPose('修炼', true, 0)).toBe('walk-step');
    expect(behaviorPose('修炼', true, 179)).toBe('walk-step');
    expect(behaviorPose('修炼', true, 180)).toBe('walk-pass');
    expect(behaviorPose('修炼', true, 360)).toBe('walk-step');
  });
  it('the whole public/assets directory is under 5MB and agrees with manifest', async () => {
    async function bytes(dir: URL): Promise<number> {
      let total = 0;
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
        total += e.isDirectory() ? await bytes(p) : (await stat(p)).size;
      }
      return total;
    }
    const total = await bytes(root);
    expect(total).toBe(manifest.totalBytes);
    expect(total).toBeLessThan(5_000_000);
  });
  it('26 retained originals are byte-identical to the read-only source', async () => {
    const originals = manifest.files.filter((f) => f.file === f.source);
    expect(originals).toHaveLength(26);
    const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    // Source is optional in CI; no source writes are ever performed.
    const source = process.env.IRIS_ASSET_SOURCE;
    if (!source) return;
    for (const f of originals)
      expect(hash(await readFile(new URL(f.file, root)))).toBe(
        hash(await readFile(`${source}/${f.source}`)),
      );
  });
});

it('garden originals match pinned SHA-256 and retain full canvas in map exports', async () => {
  const hashes = {
    t1: 'e56c84afa4b725d77730100a42b1b31a369b38add4c123a6d798afc3c536dc78',
    t2: 'f1167eae4bd6c48930731d6a4da4cc23cf2fb1dc0e819112b22c1eadef29a819',
  };
  for (const [tier, hash] of Object.entries(hashes)) {
    const file = `building/garden-${tier}@2x.webp`;
    const original = manifest.files.find((f) => f.file === file)!;
    expect(
      createHash('sha256')
        .update(await readFile(new URL(file, root)))
        .digest('hex'),
    ).toBe(hash);
    expect(original).toMatchObject({
      sha256: hash,
      size: [624, 489],
      anchor: { x: 312, y: 484 },
    });
    const mapped = manifest.files.find(
      (f) => f.file === `building/garden-${tier}-map@2x.webp`,
    )!;
    expect(mapped).toMatchObject({
      size: [624, 489],
      anchor: { x: 312, y: 484 },
      scale: 1,
    });
    expect(mapped).not.toHaveProperty('cropTop');
  }
});

it('W1c redrawn originals retain pinned measurements, anchors and SHA-256', async () => {
  const expected = [
    {
      file: 'building/dorm-t1@2x.webp',
      size: [552, 465],
      anchor: { x: 276, y: 460 },
      measure: {
        door_leaf_y_src: [357, 486],
        door_leaf_h: 129,
        door_frame_h: 151,
        building_y_src: [119, 567],
        building_h: 448,
        sprite_h: 448,
        door_ratio_leaf: 0.288,
        door_ratio_frame: 0.337,
        door_ratio_leaf_sprite: 0.288,
        footprint_body_w_src: 496,
        old_body_w_src: 302,
        width_change: 1.64,
        note: '门扇双开',
      },
      sha256:
        'ee47efa62bc7a6cf4520aad1402318482c8968a402e6afa817cc8db360cc8240',
    },
    {
      file: 'building/dorm-t2@2x.webp',
      size: [552, 465],
      anchor: { x: 276, y: 460 },
      measure: {
        door_leaf_y_src: [376, 504],
        door_leaf_h: 128,
        door_frame_h: 152,
        building_y_src: [126, 583],
        building_h: 457,
        sprite_h: 457,
        door_ratio_leaf: 0.28,
        door_ratio_frame: 0.333,
        door_ratio_leaf_sprite: 0.28,
        footprint_body_w_src: 487,
        old_body_w_src: 290,
        width_change: 1.68,
        note: '门扇双开；灯笼不计入宽度',
      },
      sha256:
        'a0d835e8562f71b94b4cf4ecf7fe17b5129bd9891b69ea7a34a5d4ba14cfd7c6',
    },
    {
      file: 'building/alchemy-t1@2x.webp',
      size: [475, 533],
      anchor: { x: 237, y: 528 },
      measure: {
        door_leaf_y_src: [359, 489],
        door_leaf_h: 130,
        door_frame_h: 169,
        building_y_src: [168, 567],
        building_h: 399,
        sprite_h: 516,
        door_ratio_leaf: 0.326,
        door_ratio_frame: 0.424,
        door_ratio_leaf_sprite: 0.252,
        footprint_body_w_src: 318,
        old_body_w_src: 175,
        width_change: 1.82,
        note: '单扇门，门楣斜；building 顶取烟囱顶 y168（不含烟），sprite 含烟到 y51；丹炉不计入宽度',
      },
      sha256:
        '69643d8402a1410df0244414b76810fb0868721b1ae9501dc92f3d0faace6d1a',
    },
    {
      file: 'building/alchemy-t2@2x.webp',
      size: [475, 533],
      anchor: { x: 237, y: 528 },
      measure: {
        door_leaf_y_src: [354, 484],
        door_leaf_h: 130,
        door_frame_h: 157,
        building_y_src: [75, 577],
        building_h: 502,
        sprite_h: 525,
        door_ratio_leaf: 0.259,
        door_ratio_frame: 0.313,
        door_ratio_leaf_sprite: 0.248,
        footprint_body_w_src: 363,
        old_body_w_src: 173,
        width_change: 2.1,
        note: '双开门；building 不含右下盆栽（底到 y600）与左侧丹炉；顶为屋脊卷饰',
      },
      sha256:
        '7fd5c9ca24b2efa7257e25b685d22b5d602a1e42d620a2db0f9b6b160719e780',
    },
  ];
  for (const f of expected) {
    expect(manifest.files.find((e) => e.file === f.file)).toMatchObject(f);
    expect(
      createHash('sha256')
        .update(await readFile(new URL(f.file, root)))
        .digest('hex'),
    ).toBe(f.sha256);
  }
});
