// Read-only source inspection: annotations only, never rebuilds or edits bridges.
import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';
const source =
  '/Volumes/Media/immortal-qa/design/art/concept/map_island_east_v1.jpg';
const local = [328, 472, 435, 550],
  offset = [2013, 521];
const world = local.map((v, i) => v + offset[i % 2]);
await sharp(source)
  .composite([
    {
      input: Buffer.from(
        `<svg width="1280" height="720"><rect x="328" y="472" width="107" height="78" fill="none" stroke="#ff0066" stroke-width="2"/><rect x="250" y="650" width="750" height="45" fill="white" opacity=".85"/><text x="260" y="670" font-size="16" fill="#000">old painted bridge: local [${local}] / world [${world}]</text><text x="260" y="690" font-size="14" fill="#000">wood, posts and contact shadow; conservative 1-2px outline allowance</text></svg>`,
      ),
    },
  ])
  .png()
  .toFile('/tmp/xianfu-east-old-bridge.png');
await mkdir('artifacts', { recursive: true });
await copyFile(
  '/tmp/xianfu-east-old-bridge.png',
  'artifacts/xianfu-east-old-bridge.png',
);
console.log(JSON.stringify({ source, local, world }));
