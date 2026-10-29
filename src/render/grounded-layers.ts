import body from './grounded-body.json';
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
  // Only roof/walls above the visible platform top belong to the y-sorted body.
  // Meditation's front pillar is retained as a separate body polygon; its floor is ground.
  const cut = body[g.key as keyof typeof body];
  const points = [
    [g.crop[0], g.crop[1]],
    [g.crop[0] + g.crop[2], g.crop[1]],
    [g.crop[0] + g.crop[2], cut.topLine.at(-1)![1]],
    ...[...cut.topLine].reverse(),
    [g.crop[0], cut.topLine[0][1]],
  ];
  return {
    g,
    extraPolygons: cut.pillars.map((poly) =>
      poly.map(([x, y]) => [
        (x - g.anchorSource[0]) * g.worldScale,
        (y - g.anchorSource[1]) * g.worldScale,
      ]),
    ),
    points: points.map(([x, y]) => [
      (x - g.anchorSource[0]) * g.worldScale,
      (y - g.anchorSource[1]) * g.worldScale,
    ]),
  };
}
export function insideGroundedBody(
  x: number,
  y: number,
  points: number[][],
  extraPolygons: number[][][] = [],
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [a, b] = points[i],
      [u, v] = points[j];
    if (b > y !== v > y && x < ((u - a) * (y - b)) / (v - b) + a)
      inside = !inside;
  }
  return inside || extraPolygons.some((poly) => insideGroundedBody(x, y, poly));
}
