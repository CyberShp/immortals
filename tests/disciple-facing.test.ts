import { expect, it } from 'vitest';
import manifest from '../public/assets/manifest.json';
import {
  defaultFacing,
  horizontalFacing,
  spriteFlip,
} from '../src/render/disciple-facing';
it('each shipped full/96 pose declares its observed default direction (idle shares walk-pass)', () => {
  const files = manifest.files.filter((f) => f.file.startsWith('disciple/'));
  expect(files).toHaveLength(16);
  for (const { file } of files)
    expect(defaultFacing(file), file).toBe(
      file.includes('meditate') ? 0 : file.includes('talk') ? 1 : -1,
    );
});
it('horizontal velocity controls visual facing; vertical/tiny x retains previous', () => {
  for (const { file } of manifest.files.filter(
    (f) => f.file.startsWith('disciple/') && !f.file.includes('meditate'),
  ))
    for (const velocity of [-20, 20]) {
      const expectedDefault = file.includes('talk') ? 1 : -1;
      expect(
        spriteFlip(file, horizontalFacing(velocity, -1)) * expectedDefault,
        file,
      ).toBe(Math.sign(velocity));
    }
  expect(horizontalFacing(0, -1)).toBe(-1);
  expect(horizontalFacing(0.01, -1)).toBe(-1);
  expect(horizontalFacing(-0.01, 1)).toBe(1);
});

it('pixel skin centroid independently verifies all full/96 source directions', async () => {
  const sharp = (await import('sharp')).default;
  for (const f of manifest.files.filter((f) =>
    f.file.startsWith('disciple/'),
  )) {
    const { data, info } = await sharp('public/assets/' + f.file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let head = 0,
      hx = 0,
      skin = 0,
      sx = 0;
    for (let y = 0; y < info.height * 0.45; y++)
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 4;
        if (data[i + 3] < 230) continue;
        head++;
        hx += x;
        const [r, g, b] = data.subarray(i, i + 3);
        if (r > 175 && g > 105 && b > 60 && r > g * 1.1 && g > b * 1.08) {
          skin++;
          sx += x;
        }
      }
    expect(skin).toBeGreaterThan(50);
    const offset = (sx / skin - hx / head) / info.width;
    const measured = Math.abs(offset) < 0.02 ? 0 : Math.sign(offset);
    expect(defaultFacing(f.file), `${f.file}: skin/head offset ${offset}`).toBe(
      measured,
    );
  }
});
