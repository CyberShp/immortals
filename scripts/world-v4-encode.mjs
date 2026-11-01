// Bounded RGB encoding; original files are immutable. Decode and measure every 512px block.
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const assets = JSON.parse(
  await readFile('src/render/world-v4-assets.json', 'utf8'),
);
const out = 'public/assets/world-v4/encoded';
await mkdir(out, { recursive: true });
const records = [];
const main = await sharp(
  'public/assets/world-v4/main-platform/main_platform_v4refine_v3_3600x1920.webp',
)
  .ensureAlpha()
  .raw()
  .toBuffer();
for (const asset of assets.filter((a) =>
  /\/(background|main-platform|platforms|fogband)\//.test(a.file),
)) {
  const { data, info } = await sharp('public/assets/' + asset.file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tiles = [];
  for (let y = 0; y < info.height; y += 512)
    for (let x = 0; x < info.width; x += 512) {
      const width = Math.min(512, info.width - x),
        height = Math.min(512, info.height - y);
      const raw = await sharp(data, { raw: info })
        .extract({ left: x, top: y, width, height })
        .raw()
        .toBuffer();
      // Omit only background blocks covered by alpha=255, including a 2px sampling guard.
      if (
        asset.file.includes('/background/') &&
        x >= 344 &&
        y >= 202 &&
        x + width <= 3940 &&
        y + height <= 2118
      ) {
        let covered = true;
        for (let yy = y - 2; yy < y + height + 2 && covered; yy++)
          for (let xx = x - 2; xx < x + width + 2; xx++)
            if (main[((yy - 200) * 3600 + xx - 342) * 4 + 3] !== 255) {
              covered = false;
              break;
            }
        if (covered) {
          tiles.push({
            x,
            y,
            width,
            height,
            omitted: true,
            reason: 'main alpha=255 plus 2px guard',
            bytes: 0,
          });
          continue;
        }
      }
      const opts = { raw: { width, height, channels: 4 } };
      const measure = async (b, restoreAlpha = false) => {
        const d = await sharp(b).ensureAlpha().raw().toBuffer();
        if (restoreAlpha) for (let i = 3; i < d.length; i += 4) d[i] = raw[i];
        let max = 0,
          sum = 0,
          sq = 0,
          over4 = 0,
          alpha = 0;
        for (let i = 0; i < d.length; i += 4) {
          let pm = 0;
          alpha = Math.max(alpha, Math.abs(d[i + 3] - raw[i + 3]));
          for (let c = 0; c < 3; c++) {
            const delta = Math.abs(d[i + c] - raw[i + c]);
            max = Math.max(max, delta);
            pm = Math.max(pm, delta);
            sum += delta;
            sq += delta * delta;
          }
          if (pm > 4) over4++;
        }
        return {
          max,
          mean: sum / (width * height * 3),
          psnr: sq
            ? 10 * Math.log10(65025 / (sq / (width * height * 3)))
            : null,
          over4: over4 / (width * height),
          alpha,
        };
      };
      let extension = 'webp',
        repairBytes = null;
      const alphaRaw = Buffer.from(
        Array.from({ length: width * height }, (_, i) => raw[i * 4 + 3]),
      );
      const alphaBytes = alphaRaw.some((a) => a !== 255)
        ? await sharp(alphaRaw, { raw: { width, height, channels: 1 } })
            .webp({ lossless: true, effort: 6 })
            .toBuffer()
        : null;
      let best = await sharp(raw, opts)
          .webp({ lossless: true, effort: 6 })
          .toBuffer(),
        encoding = 'lossless',
        metrics = await measure(best);
      // Preserve sparse outliers losslessly instead of raising quality for an entire block.
      for (const quality of [95, 96, 98]) {
        const b = await sharp(raw, opts)
          .removeAlpha()
          .avif({ quality, effort: 6, chromaSubsampling: '4:4:4' })
          .toBuffer();
        const decoded = await sharp(b).ensureAlpha().raw().toBuffer();
        const repair = Buffer.alloc(raw.length);
        let repairedPixels = 0;
        for (let i = 0; i < raw.length; i += 4) {
          if (
            Math.max(
              ...[0, 1, 2].map((c) => Math.abs(raw[i + c] - decoded[i + c])),
            ) > 8
          ) {
            for (let c = 0; c < 3; c++) {
              repair[i + c] = raw[i + c];
              decoded[i + c] = raw[i + c];
            }
            repair[i + 3] = 255;
            repairedPixels++;
          }
          decoded[i + 3] = raw[i + 3];
        }
        const correction = repairedPixels
          ? await sharp(repair, opts)
              .webp({ lossless: true, effort: 6 })
              .toBuffer()
          : null;
        const m = await measure(await sharp(decoded, opts).png().toBuffer());
        if (
          m.alpha === 0 &&
          m.max <= 8 &&
          (m.psnr === null || m.psnr >= 45) &&
          b.length + (alphaBytes?.length ?? 0) + (correction?.length ?? 0) <
            best.length
        ) {
          best = b;
          encoding = `avif-q${quality}-444+lossless-outliers`;
          metrics = { ...m, repairedPixels };
          extension = 'avif';
          repairBytes = correction;
          break;
        }
      }
      if (extension === 'webp' && metrics.max !== 0) {
        const result = spawnSync(
          'python3',
          [
            '-c',
            "from PIL import Image;import sys,io;im=Image.frombytes('RGBA',(int(sys.argv[1]),int(sys.argv[2])),sys.stdin.buffer.read());out=io.BytesIO();im.save(out,format='WEBP',lossless=True,exact=True,method=6);sys.stdout.buffer.write(out.getvalue())",
            String(width),
            String(height),
          ],
          { input: raw, maxBuffer: 8 * 1024 * 1024 },
        );
        if (result.status !== 0) throw Error(result.stderr.toString());
        best = result.stdout;
        metrics = await measure(best);
      }
      if (
        metrics.alpha !== 0 ||
        metrics.max > 8 ||
        (metrics.psnr !== null && metrics.psnr < 45)
      )
        throw Error('Encoding threshold failed');
      const file = `world-v4/encoded/${asset.file.split('/').at(-1).replace('.webp', '')}-${x}-${y}.${extension}`;
      let alphaFile, repairFile;
      if (repairBytes) {
        repairFile = file.replace('.avif', '-repair.webp');
        await writeFile('public/assets/' + repairFile, repairBytes);
      }
      if (extension === 'avif' && alphaBytes) {
        alphaFile = file.replace('.avif', '-alpha.webp');
        await writeFile('public/assets/' + alphaFile, alphaBytes);
      }
      await writeFile('public/assets/' + file, best);
      tiles.push({
        file,
        alphaFile,
        repairFile,
        x,
        y,
        width,
        height,
        bytes:
          best.length +
          (repairBytes?.length ?? 0) +
          (extension === 'avif' ? (alphaBytes?.length ?? 0) : 0),
        encoding,
        ...metrics,
      });
    }
  records.push({ file: asset.file, size: [info.width, info.height], tiles });
  console.log(
    asset.file,
    tiles.reduce((s, t) => s + t.bytes, 0),
  );
}
await writeFile(
  'src/render/world-v4-encoded.json',
  JSON.stringify(records, null, 2) + '\n',
);
// The existing inventory includes retained originals and its own JSON bytes.
const { readdir, stat } = await import('node:fs/promises');
async function diskBytes(dir) {
  let bytes = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const file = dir + '/' + e.name;
    if (file === 'public/assets/manifest.json') continue;
    bytes += e.isDirectory() ? await diskBytes(file) : (await stat(file)).size;
  }
  return bytes;
}
const assetBytes = await diskBytes('public/assets');
let inventory = await readFile('public/assets/manifest.json', 'utf8');
inventory = inventory.replace(
  /"assetBytes": \d+/,
  `"assetBytes": ${assetBytes}`,
);
for (let i = 0; i < 3; i++)
  inventory = inventory.replace(
    /"totalBytes": \d+/,
    `"totalBytes": ${assetBytes + Buffer.byteLength(inventory)}`,
  );
await writeFile('public/assets/manifest.json', inventory);
