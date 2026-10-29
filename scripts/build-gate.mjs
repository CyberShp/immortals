// Source-pixel cutout only: re-layer the existing gate, preserving the baked ground.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
export const gateArt = JSON.parse(
  await readFile(new URL('./clean-gate-art.json', import.meta.url)),
);
function inside(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = poly[i],
      [u, v] = poly[j];
    if (b > y !== v > y && x < ((u - a) * (y - b)) / (v - b) + a) c = !c;
  }
  return c;
}
export async function buildGate() {
  const [left, top, width, height] = gateArt.crop;
  const { data, info } = await sharp('public/assets/map/world.webp')
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data[(y * width + x) * 4 + 3] = gateArt.polygons.some((p) =>
        inside(x + 520 + 0.5, y + 440 + 0.5, p),
      )
        ? 255
        : 0;
  await sharp(data, { raw: info })
    .webp({ lossless: true })
    .toFile('public/assets/' + gateArt.file);
}
