import type { Box } from './layout';
export type Mask = {
  width: number;
  height: number;
  alpha: Uint8Array;
  anchorX: number;
  anchorY: number;
};
export type Occluder = {
  key?: string;
  mask: Mask;
  x: number;
  y: number;
  z: number;
};
export function opaqueAt(m: Mask, x: number, y: number) {
  x = Math.floor(x);
  y = Math.floor(y);
  return (
    x >= 0 &&
    y >= 0 &&
    x < m.width &&
    y < m.height &&
    m.alpha[y * m.width + x] > 0
  );
}
export function overlapPixels(m: Mask, x: number, y: number, boxes: Box[]) {
  let count = 0;
  for (let py = 0; py < m.height; py++)
    for (let px = 0; px < m.width; px++) {
      if (!opaqueAt(m, px, py)) continue;
      const wx = x - m.anchorX + px + 0.5,
        wy = y - m.anchorY + py + 0.5;
      if (
        boxes.some(
          (b) =>
            wx >= b.x && wx < b.x + b.width && wy >= b.y && wy < b.y + b.height,
        )
      )
        count++;
    }
  return count;
}
export function headVisibility(
  m: Mask,
  x: number,
  y: number,
  z: number,
  buildings: Occluder[],
  facing = 1,
) {
  let top = m.height,
    bottom = 0;
  for (let py = 0; py < m.height; py++)
    for (let px = 0; px < m.width; px++)
      if (opaqueAt(m, px, py)) {
        top = Math.min(top, py);
        bottom = Math.max(bottom, py + 1);
      }
  let total = 0,
    covered = 0;
  for (let py = top; py < top + (bottom - top) * 0.35; py++)
    for (let px = 0; px < m.width; px++) {
      if (!opaqueAt(m, px, py)) continue;
      total++;
      const wx = x + (px + 0.5 - m.anchorX) * facing,
        wy = y + py + 0.5 - m.anchorY;
      if (
        buildings.some(
          (b) =>
            b.z > z &&
            opaqueAt(
              b.mask,
              wx - b.x + b.mask.anchorX,
              wy - b.y + b.mask.anchorY,
            ),
        )
      )
        covered++;
    }
  return total ? 1 - covered / total : 1;
}
export function visibilityOrder(
  m: Mask,
  x: number,
  y: number,
  buildings: Occluder[],
  facing = 1,
) {
  const before = headVisibility(m, x, y, y, buildings, facing);
  let z = y;
  if (before < 0.6)
    for (const b of [...buildings].sort((a, b) => a.z - b.z)) {
      if (b.z < z) continue;
      z = b.z + 0.01;
      if (headVisibility(m, x, y, z, buildings, facing) >= 0.6) break;
    }
  return {
    z,
    before,
    visible: headVisibility(m, x, y, z, buildings, facing),
    raised: z !== y,
  };
}

export type LabelOverlap = {
  label: string;
  other: string;
  kind: 'building' | 'label';
  pixels: number;
};
/** Each unordered label pair is reported once; mask overlaps are directional. */
export function labelOverlaps(
  labels: { id: string; box: Box }[],
  buildings: Occluder[],
): LabelOverlap[] {
  const result: LabelOverlap[] = [];
  for (const [i, label] of labels.entries()) {
    for (const building of buildings) {
      if (building.key === label.id) continue;
      result.push({
        label: label.id,
        other: building.key!,
        kind: 'building',
        pixels: overlapPixels(building.mask, building.x, building.y, [
          label.box,
        ]),
      });
    }
    for (const other of labels.slice(i + 1)) {
      let pixels = 0;
      const a = label.box,
        b = other.box;
      for (let y = Math.floor(a.y); y < a.y + a.height; y++)
        for (let x = Math.floor(a.x); x < a.x + a.width; x++)
          if (
            x + 0.5 >= a.x &&
            y + 0.5 >= a.y &&
            x + 0.5 < a.x + a.width &&
            y + 0.5 < a.y + a.height &&
            x + 0.5 >= b.x &&
            x + 0.5 < b.x + b.width &&
            y + 0.5 >= b.y &&
            y + 0.5 < b.y + b.height
          )
            pixels++;
      result.push({ label: label.id, other: other.id, kind: 'label', pixels });
    }
  }
  return result;
}
