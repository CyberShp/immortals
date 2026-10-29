import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { format } from 'prettier';
import { segments, platformRadius } from './bridge-geometry.mjs';
const g = JSON.parse(await readFile('scripts/platform-geometry.json'));
const world = JSON.parse(await readFile('data/world.json'));
const build = JSON.parse(await readFile('docs/bridge-build.json'));
const { data: bridges } = await sharp('/tmp/xianfu-round-bridges.png')
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { data: art } = await sharp('public/assets/' + g.file)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let samples = 0,
  beige = 0;
for (let i = 0; i < art.length; i += 4) {
  if (art[i + 3] < 13 || art[i + 3] > 242) continue;
  samples++;
  if (Math.hypot(art[i] - 241, art[i + 1] - 232, art[i + 2] - 212) < 35)
    beige++;
}
const base = await sharp('/tmp/xianfu-round-islands.png')
  .removeAlpha()
  .raw()
  .toBuffer();
const final = await sharp('public/assets/map/world.webp')
  .removeAlpha()
  .raw()
  .toBuffer();
const resized = await sharp('public/assets/' + g.file)
  .resize({ width: Math.round(g.size[0] * g.scale) })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
function inside([x, y], poly) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = poly[i],
      [c, d] = poly[j];
    if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a) yes = !yes;
  }
  return yes;
}
let svg = '';
const joints = [];
for (const j of g.joints) {
  const bridge = world.bridges.find((b) => b.id === j.id),
    s = segments(bridge),
    p = build.placements.filter((b) => b.bridge === j.id);
  const radii = [platformRadius(s[0].u.map((v) => -v)), platformRadius(s[1].u)];
  const nominal = radii.map(
    (r, i) =>
      r - Math.hypot(...(i ? s[1].a : s[0].b).map((v, c) => v - j.center[c])),
  );
  const length = Math.hypot(
    ...bridge.points[1].map((v, c) => v - bridge.points[0][c]),
  );
  const physical = [
    radii[0] - (length - p[0].physicalAxialMax),
    radii[1] - p[1].physicalAxialMin,
  ];
  const posts = g.posts.map((post) => {
    const point = post.local.map((v, c) => v + j.center[c]);
    const alpha =
      bridges[(Math.round(point[1]) * 3200 + Math.round(point[0])) * 4 + 3];
    return {
      id: post.id,
      source: post.center,
      local: post.local,
      world: point,
      bridgeCoversCenter: alpha >= 128,
    };
  });
  let terrainOverlap = 0,
    islandWalkableOverlap = 0,
    coveredPixels = 0,
    coveredError = 0;
  const coveredSamples = [];
  const terrainBounds = [Infinity, Infinity, -Infinity, -Infinity];
  const left = Math.round(j.center[0] - g.anchor[0] * g.scale),
    top = Math.round(j.center[1] - g.anchor[1] * g.scale);
  for (let y = 0; y < resized.info.height; y++)
    for (let x = 0; x < resized.info.width; x++) {
      if (resized.data[(y * resized.info.width + x) * 4 + 3] < 128) continue;
      const wx = left + x,
        wy = top + y,
        i = (wy * 3200 + wx) * 3,
        bi = (wy * 3200 + wx) * 4;
      if (
        Math.hypot(base[i] - 241, base[i + 1] - 232, base[i + 2] - 212) > 45
      ) {
        terrainOverlap++;
        terrainBounds[0] = Math.min(terrainBounds[0], wx);
        terrainBounds[1] = Math.min(terrainBounds[1], wy);
        terrainBounds[2] = Math.max(terrainBounds[2], wx);
        terrainBounds[3] = Math.max(terrainBounds[3], wy);
      }
      if (
        world.islands.some((island) =>
          inside(
            [wx - island.offset[0], wy - island.offset[1]],
            island.walkable,
          ),
        )
      )
        islandWalkableOverlap++;
      if (bridges[bi + 3] === 255) {
        coveredPixels++;
        if (coveredPixels % 137 === 0)
          coveredSamples.push({
            point: [wx, wy],
            rgb: [...bridges.subarray(bi, bi + 3)],
          });
        for (let c = 0; c < 3; c++)
          coveredError += Math.abs(final[i + c] - bridges[bi + c]);
      }
    }
  joints.push({
    ...j,
    coveredSamples,
    terrainOverlap,
    terrainBounds,
    islandWalkableOverlap,
    coveredPixels,
    coveredBridgeMAE: coveredError / (coveredPixels * 3),
    bridgeEnds: [s[0].b, s[1].a],
    penetration: nominal,
    physicalPenetration: physical,
    posts,
  });
  svg += `<polygon points="${j.polygon.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#00ffff" stroke-width="1"/><text x="${j.center[0] - 60}" y="${j.center[1] - 80}" font-size="12">${j.id}: deck ${g.deckWidth.toFixed(1)} / inset ${physical.map((v) => v.toFixed(1))}</text>`;
  for (const post of posts)
    svg += `<circle cx="${post.world[0]}" cy="${post.world[1]}" r="5" fill="none" stroke="#ff00ff"/><text x="${post.world[0] + 5}" y="${post.world[1]}" font-size="8">${post.id}</text>`;
  for (const line of s)
    svg += `<line x1="${line.a[0]}" y1="${line.a[1]}" x2="${line.b[0]}" y2="${line.b[1]}" stroke="#f00"/><circle cx="${line.a[0]}" cy="${line.a[1]}" r="2" fill="#f00"/><circle cx="${line.b[0]}" cy="${line.b[1]}" r="2" fill="#f00"/>`;
}
const overlay = await sharp('public/assets/map/world.webp')
  .composite([
    { input: Buffer.from(`<svg width="3200" height="1400">${svg}</svg>`) },
  ])
  .png()
  .toBuffer();
const panels = [];
for (const [i, j] of g.joints.entries()) {
  const crop = {
    left: j.center[0] - 125,
    top: j.center[1] - 100,
    width: 250,
    height: 210,
  };
  panels.push({
    input: await sharp(overlay).extract(crop).resize(750, 630).png().toBuffer(),
    left: i * 750,
    top: 0,
  });
  await sharp('public/assets/map/world.webp')
    .extract(crop)
    .resize(750, 630)
    .png()
    .toFile(`/tmp/xianfu-round-${j.id}.png`);
}
await sharp({
  create: { width: 1500, height: 630, channels: 3, background: '#fff' },
})
  .composite(panels)
  .png()
  .toFile('/tmp/xianfu-round-overlay.png');
const now = await sharp('public/assets/map/world.webp')
  .removeAlpha()
  .raw()
  .toBuffer();
const before = await sharp(
  execFileSync('git', ['show', 'b3e89b6:public/assets/map/world.webp'], {
    maxBuffer: 20e6,
  }),
)
  .removeAlpha()
  .raw()
  .toBuffer();
let sum = 0,
  n = 0;
for (let y = 0; y < 1400; y++)
  for (let x = 0; x < 3200; x++) {
    if (
      g.joints.some(
        (j) =>
          Math.abs(x - j.center[0]) < 125 && Math.abs(y - j.center[1]) < 110,
      )
    )
      continue;
    for (let c = 0; c < 3; c++) {
      const i = (y * 3200 + x) * 3 + c;
      sum += Math.abs(now[i] - before[i]);
      n++;
    }
  }
const report = {
  sourceActualSize: [1152, 864],
  scale: g.scale,
  deckRatio: g.deckRatio,
  postRatio: g.postDiameterWorld / g.bridgePostWorld,
  joints,
  edge: { samples, beige, ratio: beige / samples },
  outsideJointMAE: sum / n,
  layerOrder: [
    'islands',
    'round platforms (source shadow only)',
    'bridge shadows and bridges',
  ],
  north: { segmentCount: 1, screenshot: [1575, 735] },
};
await writeFile(
  'docs/round-platform-report.json',
  await format(JSON.stringify(report), { parser: 'json' }),
);
console.log(report);
