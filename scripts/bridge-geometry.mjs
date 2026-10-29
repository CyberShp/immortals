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
    const a = start.map((v, c) => v - u[c] * (i === 0 ? landingOverlap : 16));
    const b = end.map(
      (v, c) =>
        v + u[c] * (i === bridge.points.length - 2 ? landingOverlap : 16),
    );
    return { a, b, u, length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
}
