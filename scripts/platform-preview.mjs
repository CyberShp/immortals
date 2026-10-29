import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { format } from 'prettier';
import { segments, platformRadius } from './bridge-geometry.mjs';
const g = JSON.parse(await readFile('scripts/platform-geometry.json'));
const world = JSON.parse(await readFile('data/world.json'));
const art = await sharp('public/assets/' + g.file)
  .resize({ width: Math.round(g.size[0] * g.scale) })
  .png()
  .toBuffer();
const layers = g.joints.map((j) => ({
  input: art,
  left: Math.round(j.center[0] - g.anchor[0] * g.scale),
  top: Math.round(j.center[1] - g.anchor[1] * g.scale),
}));
let v = '';
const evidence = [];
for (const j of g.joints) {
  const b = world.bridges.find((b) => b.id === j.id),
    s = segments(b);
  const normals = g.deckLocal.map((p, i) => {
    const q = g.deckLocal[(i + 1) % 4];
    return (Math.atan2(-(q[0] - p[0]), q[1] - p[1]) * 180) / Math.PI;
  });
  const rays = [j.angles[0] + 180, j.angles[1]],
    diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const mismatch = rays.map((a) => Math.min(...normals.map((b) => diff(a, b))));
  evidence.push({
    ...j,
    openingNormals: normals,
    outwardRays: rays,
    angleMismatch: mismatch,
    bridgeEnds: [s[0].b, s[1].a],
    penetration: [
      platformRadius(s[0].u.map((v) => -v)) -
        Math.hypot(s[0].b[0] - j.center[0], s[0].b[1] - j.center[1]),
      platformRadius(s[1].u) -
        Math.hypot(s[1].a[0] - j.center[0], s[1].a[1] - j.center[1]),
    ],
  });
  v += `<polygon points="${j.polygon.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#00f" stroke-width="2"/><rect x="${j.center[0] - 41}" y="${j.center[1] - 29}" width="82" height="59" fill="none" stroke="#f0f"/><text x="${j.center[0] - 50}" y="${j.center[1] - 48}" font-size="18">${j.id}</text>`;
  for (const line of s)
    v += `<line x1="${line.a[0]}" y1="${line.a[1]}" x2="${line.b[0]}" y2="${line.b[1]}" stroke="#e70"/><circle cx="${line.b[0]}" cy="${line.b[1]}" r="3" fill="#e70"/>`;
}
v +=
  '<circle cx="1575" cy="735" r="12" fill="none" stroke="#00f"/><text x="1590" y="735" font-size="18">north shore, no internal joint</text>';
await sharp('public/assets/map/world.webp')
  .composite(layers)
  .png()
  .toFile('/tmp/xianfu-platform-composite.png');
await sharp('/tmp/xianfu-platform-composite.png')
  .composite([
    { input: Buffer.from(`<svg width="3200" height="1400">${v}</svg>`) },
  ])
  .png()
  .toFile('/tmp/xianfu-platform-overlay.png');
const { data } = await sharp('public/assets/' + g.file)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let edge = 0,
  beige = 0;
for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] < 13 || data[i + 3] > 242) continue;
  edge++;
  if (Math.hypot(data[i] - 241, data[i + 1] - 232, data[i + 2] - 212) < 35)
    beige++;
}
const now = await sharp('public/assets/map/world.webp')
  .removeAlpha()
  .raw()
  .toBuffer();
const before = await sharp(
  execFileSync('git', ['show', '2946ede:public/assets/map/world.webp'], {
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
          Math.abs(x - j.center[0]) < 120 && Math.abs(y - j.center[1]) < 100,
      )
    )
      continue;
    for (let c = 0; c < 3; c++) {
      sum += Math.abs(
        now[(y * 3200 + x) * 3 + c] - before[(y * 3200 + x) * 3 + c],
      );
      n++;
    }
  }
const report = {
  sourceActualSize: [1152, 864],
  joints: evidence,
  edge: { samples: edge, beige, ratio: beige / edge },
  outsideJointMAE: sum / n,
  north: {
    segmentCount: 1,
    angle: 90,
    screenshot: [1575, 735],
    mainLocal: [625, 115],
    northLocal: [625, 735],
  },
};
await writeFile(
  'docs/platform-report.json',
  await format(JSON.stringify(report), { parser: 'json' }),
);
console.log(JSON.stringify(report, null, 2));
