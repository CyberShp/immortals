import sharp from 'sharp';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { format } from 'prettier';
import { bridgeRegions, segments } from './bridge-geometry.mjs';
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const blank = (width, height) =>
  sharp({ create: { width, height, channels: 4, background: transparent } });
// Rotate around the actual deck midpoint, then crop/tile along its axis.
async function strip(entry, mirror, worldWidth) {
  const [p, q] = entry.anchors;
  const center = [(p.x + q.x) / 2, (p.y + q.y) / 2];
  const side = Math.ceil(Math.hypot(...entry.size)) * 2;
  let image = await blank(side, side)
    .composite([
      {
        input: `public/assets/${entry.file}`,
        left: Math.round(side / 2 - center[0]),
        top: Math.round(side / 2 - center[1]),
      },
    ])
    .png()
    .toBuffer();
  if (mirror) image = await sharp(image).flop().png().toBuffer();
  const angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
  image = await sharp(image)
    .rotate(mirror ? angle : -angle, { background: transparent })
    .png()
    .toBuffer();
  const meta = await sharp(image).metadata();
  const length = entry.deck.repeatLength;
  const height = 280;
  const extracted = await sharp(image)
    .extract({
      left: Math.round((meta.width - length) / 2),
      top: Math.round((meta.height - height) / 2),
      width: length,
      height,
    })
    .png()
    .toBuffer();
  // A single uniform scale; never independently resize plank width/height.
  const scale = worldWidth / entry.deck.walkableWidth;
  return sharp(extracted)
    .resize({ width: Math.round(length * scale) })
    .png()
    .toBuffer();
}
export async function buildBridges(canvas, islands) {
  const world = JSON.parse(await readFile('data/world.json', 'utf8'));
  const manifest = JSON.parse(
    await readFile('public/assets/manifest.json', 'utf8'),
  );
  const layers = [],
    placements = [];
  let northRail;
  for (const bridge of world.bridges) {
    for (const [index, s] of segments(bridge).entries()) {
      const degrees = (Math.atan2(s.u[1], s.u[0]) * 180) / Math.PI;
      const diagonal = Math.abs(degrees) > 12 && Math.abs(degrees) < 70;
      const entry = manifest.files.find(
        (f) => f.file === `map/bridge-${diagonal ? 'd' : 'h'}@2x.webp`,
      );
      const tile = await strip(entry, diagonal && degrees < 0, bridge.width);
      const tm = await sharp(tile).metadata(),
        length = Math.round(s.length);
      const repeats = [];
      for (let x = 0; x < length; x += tm.width) {
        const width = Math.min(tm.width, length - x);
        repeats.push({
          input: await sharp(tile)
            .extract({ left: 0, top: 0, width, height: tm.height })
            .png()
            .toBuffer(),
          left: x,
          top: 0,
        });
      }
      const horizontal = await blank(length, tm.height)
        .composite(repeats)
        .png()
        .toBuffer();
      let image = await sharp(horizontal)
        .rotate(degrees, { background: transparent })
        .png()
        .toBuffer();
      const meta = await sharp(image).metadata();
      const left = Math.round((s.a[0] + s.b[0]) / 2 - meta.width / 2),
        top = Math.round((s.a[1] + s.b[1]) / 2 - meta.height / 2);
      // Miter cut at an internal joint: retain only this segment's half-plane.
      const decoded = await sharp(image)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (const jointIndex of [index, index + 1]) {
        if (jointIndex === 0 || jointIndex === bridge.points.length - 1)
          continue;
        const joint = bridge.points[jointIndex];
        const prev = bridge.points[jointIndex - 1],
          next = bridge.points[jointIndex + 1];
        const l1 = Math.hypot(joint[0] - prev[0], joint[1] - prev[1]),
          l2 = Math.hypot(next[0] - joint[0], next[1] - joint[1]);
        const u = joint.map((v, c) => (v - prev[c]) / l1 + (next[c] - v) / l2);
        for (let y = 0; y < meta.height; y++)
          for (let x = 0; x < meta.width; x++) {
            const dot =
              (left + x - joint[0]) * u[0] + (top + y - joint[1]) * u[1];
            if (jointIndex === index ? dot < 0 : dot >= 0)
              decoded.data[(y * meta.width + x) * 4 + 3] = 0;
          }
      }
      image = await sharp(decoded.data, { raw: decoded.info }).png().toBuffer();
      if (bridge.id === 'north') {
        await sharp(image).toFile('/tmp/xianfu-bridge-north-sprite.png');
        const centerX = bridge.points[0][0];
        const fromY = Math.ceil((s.a[1] + s.b[1]) / 2),
          toY = Math.floor(s.b[1]) - 2;
        const missingRows = [];
        for (let wy = fromY; wy <= toY; wy++) {
          let present = false;
          // Back rope in the source becomes the right rail after +90 degrees.
          for (let wx = centerX + 24; wx <= centerX + 37; wx++) {
            const x = wx - left,
              y = wy - top;
            if (
              x >= 0 &&
              y >= 0 &&
              x < meta.width &&
              y < meta.height &&
              decoded.data[(y * meta.width + x) * 4 + 3] >= 128
            )
              present = true;
          }
          if (!present) missingRows.push(wy);
        }
        northRail = {
          fromY,
          toY,
          xRange: [centerX + 24, centerX + 37],
          alphaThreshold: 128,
          missingRows,
        };
      }
      const { data, info } = await sharp(image)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      // Derived shadow only: blacken existing silhouette, reduce alpha, blur, offset.
      for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = Math.round(data[i + 3] * 0.25);
      }
      const shadow = await sharp(data, { raw: info })
        .blur(1.2)
        .png()
        .toBuffer();
      layers.push(
        { input: shadow, left: left + 1, top: top + 3 },
        { input: image, left, top },
      );
      const physical = [];
      for (let y = 0; y < info.height; y++)
        for (let x = 0; x < info.width; x++) {
          if (decoded.data[(y * info.width + x) * 4 + 3] > 32)
            physical.push(
              (left + x - bridge.points[index][0]) * s.u[0] +
                (top + y - bridge.points[index][1]) * s.u[1],
            );
        }
      placements.push({
        bridge: bridge.id,
        index,
        source: entry.file,
        mirror: diagonal && degrees < 0,
        degrees,
        scale: bridge.width / entry.deck.walkableWidth,
        a: s.a,
        b: s.b,
        physicalAxialMin: Math.min(...physical),
        physicalAxialMax: Math.max(...physical),
      });
    }
  }
  // Compose exclusively from the source-island canvas and new bridge layers.
  // HEAD's whole-image lossy pipeline, including its size fallback.
  const composed = await sharp(canvas, {
    raw: { width: 3200, height: 1400, channels: 3 },
  })
    .composite(layers)
    .png()
    .toBuffer();
  let quality = 86;
  while (true) {
    await sharp(composed)
      .webp({ quality, effort: 6 })
      .toFile('public/assets/map/world.webp');
    if ((await stat('public/assets/map/world.webp')).size <= 1500000) break;
    if ((quality -= 5) < 35) throw Error('world exceeds budget');
  }
  await sharp(composed)
    .resize(320, 140)
    .webp({ quality: 75 })
    .toFile('public/assets/map/world-mini.webp');
  const miniRegions = bridgeRegions.map((r) => ({
    left: Math.floor(r.left / 10) - 2,
    top: Math.floor(r.top / 10) - 2,
    width: Math.ceil(r.width / 10) + 5,
    height: Math.ceil(r.height / 10) + 5,
  }));
  for (const r of bridgeRegions)
    await sharp('public/assets/map/world.webp')
      .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
      .resize({ width: r.width * 2 })
      .png()
      .toFile(`/tmp/xianfu-bridge-${r.id}.png`);
  await sharp('public/assets/map/world.webp')
    .resize(1600)
    .png()
    .toFile('/tmp/xianfu-bridge-panorama.png');
  // Keep source-only landing evidence, before either old tiles or new bridges.
  const landingSamples = world.bridges.flatMap((b) =>
    [0, b.points.length - 1].map((index) => {
      const p = b.points[index],
        other = b.points[index === 0 ? 1 : index - 1];
      const length = Math.hypot(p[0] - other[0], p[1] - other[1]);
      return {
        bridge: b.id,
        anchor: p,
        samples: [8, 9, 10, 11, 12].map((distance) => {
          const point = p.map((v, c) =>
            Math.round(v + ((v - other[c]) / length) * distance),
          );
          const offset = (point[1] * 3200 + point[0]) * 3;
          return {
            distance,
            point,
            rgb: [...canvas.subarray(offset, offset + 3)],
          };
        }),
      };
    }),
  );
  await writeFile(
    'docs/bridge-build.json',
    await format(
      JSON.stringify({
        baselineCommit: 'a2b79f6381cf1ae006fed537686651e296433c39',
        regions: bridgeRegions,
        miniRegions,
        placements,
        northRail,
        landingSamples,
        sourceIslandCount: islands.length,
      }),
      { parser: 'json' },
    ),
  );
  async function bytes(dir) {
    let n = 0;
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      n += e.isDirectory()
        ? await bytes(p)
        : e.name === 'manifest.json'
          ? 0
          : (await stat(p)).size;
    }
    return n;
  }
  manifest.assetBytes = await bytes('public/assets');
  let json;
  for (;;) {
    json = await format(JSON.stringify(manifest), { parser: 'json' });
    const total = manifest.assetBytes + Buffer.byteLength(json);
    if (total === manifest.totalBytes) break;
    manifest.totalBytes = total;
  }
  await writeFile('public/assets/manifest.json', json);
  const buildReport = JSON.parse(
    await readFile('docs/world-build.json', 'utf8'),
  );
  buildReport.bytes = (await stat('public/assets/map/world.webp')).size;
  buildReport.quality = quality;
  buildReport.miniQuality = 75;
  buildReport.bridges =
    'Iris bridge_v1; keyed, axial middle repeats, uniform scale, miter crop, alpha-derived shadow; see bridge-build.json';
  buildReport.encoding =
    'whole source-island canvas + new bridge layers; lossy WebP, HEAD quality fallback';
  await writeFile(
    'docs/world-build.json',
    await format(JSON.stringify(buildReport), { parser: 'json' }),
  );
  console.log({
    worldBytes: (await stat('public/assets/map/world.webp')).size,
    quality,
    placements,
    landingSamples,
  });
}
