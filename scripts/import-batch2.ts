import {
  readFile,
  writeFile,
  copyFile,
  mkdir,
  readdir,
  stat,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { format } from 'prettier';
import { headSpecks } from './alpha-components';
const source = '/Volumes/Media/immortal-qa/design/art/assets';
const root = 'public/assets';
const input = JSON.parse(await readFile(`${source}/manifest.json`, 'utf8'));
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
const selected = input.files.filter((f: { file: string }) =>
  /^(portrait\/|icon\/|disciple\/f-)/.test(f.file),
);
for (const f of selected) {
  await mkdir(`${root}/${f.category}`, { recursive: true });
  await copyFile(`${source}/${f.file}`, `${root}/${f.file}`);
  const entry = {
    file: f.file,
    size: f.size,
    anchor: { x: f.anchor.x, y: f.anchor.y },
    scale: 1,
    source: f.file,
    batch: 2,
    sha256: createHash('sha256')
      .update(await readFile(`${source}/${f.file}`))
      .digest('hex'),
  };
  manifest.files = manifest.files.filter(
    (e: { file: string }) => e.file !== f.file,
  );
  manifest.files.push(entry);
}
const file = 'disciple/f-walk-pass-96@2x.webp';
for (const height of [32, 24]) {
  const { data, info } = await sharp(`${root}/${file}`)
    .resize({ height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  console.log(
    JSON.stringify({
      height,
      headSpecks: headSpecks(data, info.width, info.height),
    }),
  );
}
async function bytes(dir: string): Promise<number> {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true }))
    n += e.isDirectory()
      ? await bytes(`${dir}/${e.name}`)
      : e.name === 'manifest.json'
        ? 0
        : (await stat(`${dir}/${e.name}`)).size;
  return n;
}
manifest.assetBytes = await bytes(root);
let json = '';
for (;;) {
  json = await format(JSON.stringify(manifest), { parser: 'json' });
  const total = manifest.assetBytes + Buffer.byteLength(json);
  if (total === manifest.totalBytes) break;
  manifest.totalBytes = total;
}
await writeFile(`${root}/manifest.json`, json);
console.log(
  `Copied ${selected.length} batch2 files; ${manifest.totalBytes} bytes total`,
);
