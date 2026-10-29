import { describe, expect, it } from 'vitest';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import manifest from '../public/assets/manifest.json';
import traits from '../data/traits.json';
import { accessories, behaviorPose, plots } from '../src/render/layout';
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
    for (const id of ['hall', 'dorm', 'meditation', 'garden', 'alchemy']) {
      const versions = manifest.files.filter(
        (f) => f.file.startsWith(`building/${id}-`) && f.file.includes('-map@'),
      );
      expect(versions).toHaveLength(2);
      for (const f of versions)
        expect(
          Math.abs(f.size[0] - (plots[id][2] - plots[id][0])),
        ).toBeLessThanOrEqual(1);
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
