// Lossless source-aligned tiles. Old originals are never written or deleted.
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out =
  process.argv[2] ??
  '/Volumes/Media/immortal-qa/integration2/evidence/tile-candidate';
await mkdir(out, { recursive: true });
const assets = JSON.parse(
  await readFile('src/render/world-v4-assets.json', 'utf8'),
);
const records = [];
for (const a of assets.filter((a) =>
  /\/(background|main-platform|platforms)\//.test(a.file),
)) {
  const raw = await sharp('public/assets/' + a.file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tiles = [];
  const dir = 'world-v4/tiles/' + a.file.split('/').at(-1).replace('.webp', '');
  await mkdir(out + '/' + dir, { recursive: true });
  for (let y = 0; y < raw.info.height; y += 256)
    for (let x = 0; x < raw.info.width; x += 256) {
      const width = Math.min(256, raw.info.width - x),
        height = Math.min(256, raw.info.height - y);
      const expected = await sharp(raw.data, { raw: raw.info })
        .extract({ left: x, top: y, width, height })
        .raw()
        .toBuffer();
      const file = `${dir}/${x}-${y}.webp`;
      const encoded = await sharp(expected, {
        raw: { width, height, channels: 4 },
      })
        .webp({ lossless: true, effort: 6 })
        .toBuffer();
      const actual = await sharp(encoded).ensureAlpha().raw().toBuffer();
      // The source WebPs already canonicalise transparent RGB; require exact decoded bytes.
      let diff = 0;
      for (let i = 0; i < actual.length; i += 4)
        if (
          actual[i + 3] !== expected[i + 3] ||
          (expected[i + 3] &&
            actual.subarray(i, i + 4).compare(expected.subarray(i, i + 4)))
        )
          diff++;
      if (Buffer.compare(actual, expected))
        throw Error(`${file}: decoded RGBA differs`);
      if (diff) throw Error(`${file}: ${diff} changed pixels`);
      await writeFile(out + '/' + file, encoded);
      tiles.push({
        file,
        x,
        y,
        width,
        height,
        bytes: encoded.length,
        sha256: createHash('sha256').update(encoded).digest('hex'),
        differentVisiblePixels: diff,
      });
    }
  records.push({
    file: a.file,
    width: raw.info.width,
    height: raw.info.height,
    tiles,
  });
  console.log(
    a.file,
    tiles.reduce((s, t) => s + t.bytes, 0),
  );
}
await writeFile(
  out + '/manifest.json',
  JSON.stringify(records, null, 2) + '\n',
);
