import { readFileSync } from 'node:fs';
const platform = JSON.parse(
  readFileSync(new URL('./platform-geometry.json', import.meta.url)),
);
export function platformRadius(direction) {
  const p = platform.deckLocal;
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length],
      e = [b[0] - a[0], b[1] - a[1]],
      cross = (u, v) => u[0] * v[1] - u[1] * v[0],
      den = cross(direction, e);
    if (Math.abs(den) < 1e-9) continue;
    const t = cross(a, e) / den,
      u = cross(a, direction) / den;
    if (t >= 0 && u >= 0 && u <= 1) return t;
  }
  throw Error('ray misses platform');
}
// Shore anchors stay fixed; the physical deck overlaps each shore by 10 world px.
export const landingOverlap = 10;
export const bridgeRegions = [
  { id: 'north', left: 1510, top: 475, width: 140, height: 300 },
  { id: 'west', left: 825, top: 935, width: 390, height: 155 },
  { id: 'east', left: 1970, top: 950, width: 475, height: 155 },
];
export function segments(bridge) {
  return bridge.points.slice(1).map((end, i) => {
    const start = bridge.points[i];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const u = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
    const a = start.map(
      (v, c) => v - u[c] * (i === 0 ? landingOverlap : 9 - platformRadius(u)),
    );
    const b = end.map(
      (v, c) =>
        v +
        u[c] *
          (i === bridge.points.length - 2
            ? landingOverlap
            : 9 - platformRadius(u.map((v) => -v))),
    );
    return { a, b, u, length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
}
