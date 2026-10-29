import geometry from './pedestal-geometry.json';
export const pedestalGeometry = geometry;
export function buildingSortY(id: string, baseY: number) {
  return geometry.buildings.find((b) => b.id === id)?.sortY ?? baseY;
}
