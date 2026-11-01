import { expect, it } from 'vitest';
import sharp from 'sharp';
import { stat } from 'node:fs/promises';
import manifest from '../src/render/world-v4-encoded.json';
for (const layer of manifest)
  it(`v4 encoded pixels, alpha and byte inventory: ${layer.file}`, async () => {
    const source = await sharp('public/assets/' + layer.file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const main = layer.file.includes('/background/')
      ? await sharp(
          'public/assets/world-v4/main-platform/main_platform_v4refine_v3_3600x1920.webp',
        )
          .ensureAlpha()
          .raw()
          .toBuffer()
      : undefined;
    for (const tile of layer.tiles) {
      if (!('file' in tile) || !tile.file) {
        expect(main).toBeDefined();
        for (let y = tile.y - 2; y < tile.y + tile.height + 2; y++)
          for (let x = tile.x - 2; x < tile.x + tile.width + 2; x++) {
            if (main![((y - 200) * 3600 + x - 342) * 4 + 3] !== 255)
              throw Error('Omitted block is not fully covered');
          }
        continue;
      }
      const actual = await sharp('public/assets/' + tile.file)
        .ensureAlpha()
        .raw()
        .toBuffer();
      let bytes = (await stat('public/assets/' + tile.file)).size;
      for (const [file, alpha] of [
        ['alphaFile' in tile ? tile.alphaFile : undefined, true],
        ['repairFile' in tile ? tile.repairFile : undefined, false],
      ] as const) {
        if (!file) continue;
        const patch = await sharp('public/assets/' + file)
          .ensureAlpha()
          .raw()
          .toBuffer();
        bytes += (await stat('public/assets/' + file)).size;
        for (let i = 0; i < actual.length; i += 4) {
          if (alpha) actual[i + 3] = patch[i];
          else if (patch[i + 3])
            for (let c = 0; c < 3; c++) actual[i + c] = patch[i + c];
        }
      }
      let max = 0,
        sq = 0,
        alphaMax = 0;
      for (let y = 0; y < tile.height; y++)
        for (let x = 0; x < tile.width; x++) {
          const i = (y * tile.width + x) * 4,
            j = ((y + tile.y) * source.info.width + x + tile.x) * 4;
          for (let c = 0; c < 3; c++) {
            const d = Math.abs(actual[i + c] - source.data[j + c]);
            max = Math.max(max, d);
            sq += d * d;
          }
          alphaMax = Math.max(
            alphaMax,
            Math.abs(actual[i + 3] - source.data[j + 3]),
          );
        }
      expect(alphaMax, tile.file).toBe(0);
      expect(max, tile.file).toBeLessThanOrEqual(8);
      expect(
        sq
          ? 10 * Math.log10(65025 / (sq / (tile.width * tile.height * 3)))
          : Infinity,
        tile.file,
      ).toBeGreaterThanOrEqual(45);
      expect(bytes, tile.file).toBe(tile.bytes);
    }
  }, 30000);
