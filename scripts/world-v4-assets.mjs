// Read-only source intake; lossless format conversion, no resize or pixel edits.
import { readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const source =
  process.argv[2] ?? '/Volumes/Media/immortal-qa/world-v4-intake/bundle';
const root = 'public/assets/world-v4';
const files = [];
for (const dir of [
  'background',
  'main-platform',
  'bridges',
  'platforms',
  'fogband',
  'fg',
]) {
  await mkdir(path.join(root, dir), { recursive: true });
  for (const name of await readdir(path.join(source, dir))) {
    if (
      !name.endsWith('.png') ||
      name.includes('fog_factor') ||
      name.includes('rgba_mainhole')
    )
      continue;
    const input = path.join(source, dir, name),
      file = `${dir}/${name.replace('.png', '.webp')}`;
    await sharp(input)
      .webp({ lossless: true, effort: 6 })
      .toFile(path.join(root, file));
    const meta = await sharp(input).metadata();
    files.push({
      source: `${dir}/${name}`,
      file: `world-v4/${file}`,
      size: [meta.width, meta.height],
      anchor: { x: 0, y: 0 },
    });
  }
}
await writeFile(
  'src/render/world-v4-assets.json',
  JSON.stringify(files, null, 2) + '\n',
);
await copyFile(
  path.join(source, 'layout/11-main-platform-final-v1.4.json'),
  'src/render/world-v4-layout.json',
);
await copyFile(
  path.join(source, 'fg/fg_list.json'),
  'src/render/world-v4-foreground.json',
);
await mkdir('src/render/world-v4-placement', { recursive: true });
for (const f of [
  'bridges/east_bridge_v3_placement.json',
  'bridges/south_bridge_placement.json',
  'bridges/south_gate_end_cover_v2_placement.json',
  'platforms/placement.json',
])
  await copyFile(
    path.join(source, f),
    path.join('src/render/world-v4-placement', path.basename(f)),
  );
