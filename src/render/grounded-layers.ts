import garden from '../../scripts/garden-geometry.json';
import geometry from '../../scripts/grounded-geometry.json';

// Hand-measured stone front (left / front / right); no change to collision or anchor.
export function groundedLayer(file: string) {
  if (file.startsWith('building/garden-t')) {
    // Only the front fence/gate strip occludes; beds and surrounding soil stay on ground.
    const points = [
      [210, 397],
      [600, 641],
      [947, 399],
      [947, 457],
      [600, 704],
      [210, 451],
    ];
    return {
      g: garden,
      points: points.map(([x, y]) => [
        (x - garden.anchorSource[0]) * garden.worldScale,
        (y - garden.anchorSource[1]) * garden.worldScale,
      ]),
    };
  }
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
