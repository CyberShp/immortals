import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
const w = JSON.parse(await readFile('data/world.json', 'utf8'));
const buildings = JSON.parse(
  await readFile('docs/world-buildings.json', 'utf8'),
);
const svg = `<svg width="3200" height="1400">${w.islands.map((d) => [d.walkable, ...d.obstacles].map((p) => `<polygon points="${p.map((v) => v.map((n, i) => n + d.offset[i]).join(',')).join(' ')}" fill="none" stroke="cyan" stroke-width="3"/>`).join('')).join('')}${w.bridges.map((b) => `<polyline points="${b.points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="cyan" stroke-width="3"/>`).join('')}${w.spots
  .map((s) => {
    const d = w.islands.find((d) => d.id === s.island),
      x = s.point[0] + d.offset[0],
      y = s.point[1] + d.offset[1];
    return `<circle cx="${x}" cy="${y}" r="6" fill="cyan"/><text x="${x + 8}" y="${y}" font-size="18">${s.id}</text>`;
  })
  .join(
    '',
  )}${w.slots.map((s) => `<rect x="${s.rect[0]}" y="${s.rect[1]}" width="${s.rect[2] - s.rect[0]}" height="${s.rect[3] - s.rect[1]}" fill="none" stroke="magenta" stroke-width="3"/><circle cx="${s.front[0]}" cy="${s.front[1]}" r="6" fill="yellow"/>`).join('')}${buildings.map((b) => `<rect x="${b.x - b.bodyWidth / 2}" y="${b.bodyBottom - 20}" width="${b.bodyWidth}" height="20" fill="orange" fill-opacity=".25" stroke="orange"/>`).join('')}</svg>`;
await mkdir('artifacts', { recursive: true });
await sharp('public/assets/map/world.webp')
  .composite([{ input: Buffer.from(svg) }])
  .png()
  .toFile('artifacts/xianfu-world-walkable-preview.png');
