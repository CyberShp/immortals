import geometry from '../../scripts/grounded-geometry.json';

// Hand-measured stone front (left / front / right); no change to collision or anchor.
export function groundedLayer(file: string) {
  const g = geometry.find((g) => file.startsWith(`building/${g.key}-t`));
  if (!g) return;
  const [left, front, right] = g.stoneSource;
  const points = [
    [g.crop[0], g.crop[1]],
    [g.crop[0] + g.crop[2], g.crop[1]],
    [g.crop[0] + g.crop[2], right[1]],
    right,
    front,
    left,
    [g.crop[0], left[1]],
  ];
  return {
    g,
    points: points.map(([x, y]) => [
      (x - g.anchorSource[0]) * g.worldScale,
      (y - g.anchorSource[1]) * g.worldScale,
    ]),
  };
}
export function insideGroundedBody(x: number, y: number, points: number[][]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [a, b] = points[i],
      [u, v] = points[j];
    if (b > y !== v > y && x < ((u - a) * (y - b)) / (v - b) + a)
      inside = !inside;
  }
  return inside;
}
