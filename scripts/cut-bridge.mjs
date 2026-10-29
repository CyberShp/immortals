// Only colour-key, alpha decontamination and axial cropping of Iris pixels.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { format } from 'prettier';
const source = process.argv[2] ?? `${homedir()}/cutwork/backup/bridge_v1.jpg`;
const input = await readFile(source);
const { data, info } = await sharp(input)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (info.width !== 1280 || info.height !== 720)
  throw Error('Expected 1280x720 bridge_v1');
const manifest = JSON.parse(
  await readFile('public/assets/manifest.json', 'utf8'),
);
for (const spec of [
  {
    id: 'h',
    crop: [320, 50, 650, 212],
    start: [322, 165],
    end: [967, 165],
    width: 102,
  },
  {
    id: 'd',
    crop: [340, 300, 594, 356],
    start: [415, 393],
    end: [852, 565],
    width: 88,
  },
]) {
  const [left, top, width, height] = spec.crop;
  const dx = spec.end[0] - spec.start[0],
    dy = spec.end[1] - spec.start[1];
  const length = Math.hypot(dx, dy),
    ux = dx / length,
    uy = dy / length;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const wx = x + left,
        wy = y + top,
        s = (wy * 1280 + wx) * 3,
        t = (y * width + x) * 4;
      const rgb = [...data.subarray(s, s + 3)];
      const distance = Math.hypot(rgb[0] - 246, rgb[1] - 235, rgb[2] - 220);
      // Apply everywhere, including the disconnected paper slivers between planks.
      let alpha = Math.max(0, Math.min(1, (distance - 18) / 32));
      const axial = (wx - spec.start[0]) * ux + (wy - spec.start[1]) * uy;
      if (axial < -1 || axial > length + 1) alpha = 0;
      for (let c = 0; c < 3; c++)
        rgba[t + c] = alpha
          ? Math.max(
              0,
              Math.min(
                255,
                (rgb[c] - (1 - alpha) * [246, 235, 220][c]) / alpha,
              ),
            )
          : 0;
      rgba[t + 3] = Math.round(alpha * 255);
    }
  const file = `map/bridge-${spec.id}@2x.webp`;
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .webp({ lossless: true, effort: 6 })
    .toFile(`public/assets/${file}`);
  const anchors = [spec.start, spec.end].map(([x, y]) => ({
    x: x - left,
    y: y - top,
  }));
  const entry = {
    file,
    size: [width, height],
    anchor: anchors[0],
    anchors,
    scale: 1,
    source: 'bridge_v1.jpg',
    sourceSha256: createHash('sha256').update(input).digest('hex'),
    crop: spec.crop,
    deck: {
      width: spec.width + 16,
      walkableWidth: spec.width,
      axisLength: length,
      repeatLength: spec.id === 'h' ? 164 : 145,
    },
    operation:
      'colour key, decontaminate alpha, crop inside end ropes; no painted pixels',
  };
  const index = manifest.files.findIndex((f) => f.file === file);
  if (index < 0) manifest.files.push(entry);
  else manifest.files[index] = entry;
}
await writeFile(
  'public/assets/manifest.json',
  await format(JSON.stringify(manifest), { parser: 'json' }),
);
