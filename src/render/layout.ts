import { WALK_FRAME_MS } from './world-scale';
/** Coordinates in the original 1280×720 artwork; rendering uses half size. */
export const plots: Record<string, readonly [number, number, number, number]> =
  {
    hall: [492, 171, 707, 294],
    dorm: [345, 248, 465, 329],
    meditation: [727, 228, 842, 316],
    garden: [463, 300, 681, 426],
    alchemy: [702, 342, 822, 435],
    gate: [533, 442, 705, 571],
  };
export const buildingArt: Record<string, string> = {
  B_HALL: 'hall',
  B_DORM: 'dorm',
  B_MEDIT: 'meditation',
  B_GARDEN: 'garden',
  B_ALCHEMY: 'alchemy',
};
export const accessories: Record<string, string> = {
  腰间书卷: 'scroll',
  蒲扇: 'fan',
  背负长剑: 'sword',
  背药篓: 'basket',
  腰挂酒葫芦: 'gourd',
  桃花簪: 'hairpin',
  斗笠: 'hat',
  朱红发带: 'ribbon',
  手串念珠: 'beads',
  铜钱串: 'coins',
};
export function behaviorPose(behavior: string, moving = false, elapsed = 0) {
  if (moving)
    return Math.floor(elapsed / WALK_FRAME_MS) % 2 ? 'walk-pass' : 'walk-step';
  return (
    (
      { 修炼: 'meditate', 做工: 'work', 社交: 'talk' } as Record<string, string>
    )[behavior] ?? 'walk-pass'
  );
}
export function plotFoot(id: string): [number, number] {
  const p = plots[buildingArt[id]];
  return [(p[0] + p[2]) / 4, p[3] / 2];
}
export type Region = {
  center: readonly [number, number];
  rect: readonly [number, number, number, number];
};
// Logical 640×360 coordinates, measured at the disciple's feet.
export const regions: Record<string, Region> = {
  空地: { center: [215, 296], rect: [165, 280, 262, 305] },
  松下: { center: [195, 90], rect: [165, 82, 235, 96] },
  采石点: { center: [385, 66], rect: [365, 60, 410, 72] },
  药圃: { center: [285, 185], rect: [245, 165, 320, 200] },
  静修室: { center: [447, 148], rect: [424, 135, 470, 160] },
  炼丹房: { center: [381, 224], rect: [355, 218, 410, 230] },
  主殿: { center: [300, 152], rect: [265, 148, 335, 156] },
  未知: { center: [470, 185], rect: [430, 170, 530, 200] },
  ...Object.fromEntries(
    Object.entries(buildingArt).map(([id, key]) => {
      const p = plots[key];
      const y = p[3] / 2 + 6;
      return [
        `工地:${id}`,
        {
          center: [(p[0] + p[2]) / 4, y],
          rect: [p[0] / 2, key === 'garden' ? y - 8 : y - 6, p[2] / 2, y],
        },
      ];
    }),
  ),
};
export function locationRegion(location: string): Region {
  return regions[location] ?? regions.未知;
}
export function discipleSlot(region: Region, index: number, count: number) {
  const [left, top, right, bottom] = region.rect;
  const columns = Math.min(3, Math.floor((right - left) / 34) + 1);
  const row = Math.floor(index / columns);
  const rows = Math.ceil(count / columns);
  const rowCount = Math.min(columns, count - row * columns);
  const spacing = Math.min(34, (right - left) / Math.max(1, rowCount - 1));
  const width = (rowCount - 1) * spacing;
  const start = Math.max(
    left,
    Math.min(right - width, region.center[0] - width / 2),
  );
  const front =
    region === regions.空地
      ? 300
      : Math.min(bottom, region.center[1] + (rows - 1) * 10);
  const rowSpacing = Math.min(20, (front - top) / Math.max(1, rows - 1));
  return {
    x: start + (index % columns) * spacing,
    y: front - row * rowSpacing,
    row,
  };
}
export function nameBox(x: number, y: number, row: number, height: number) {
  return { x: x - 7, y: y + (row ? -height - 14 : 2), width: 14, height: 14 };
}
export function buildingLabelPosition(id: string): [number, number] {
  if (id === 'B_HALL') return [285, 69];
  if (id === 'B_MEDIT') return [426, 129.5];
  if (id === 'B_GARDEN') return [286, 150.5];
  const [x, y] = plotFoot(id);
  return [x, y + (id === 'B_ALCHEMY' ? 17 : 3)];
}

export const discipleBodyHeight = (48 * 451) / 462;
export const doorRules: Record<string, { pixels: number; target: number }> = {
  hall: { pixels: 72, target: 0.6 },
  dorm: { pixels: 62, target: 0.4 },
  meditation: { pixels: 78, target: 0.4 },
  alchemy: { pixels: 56, target: 0.4 },
};
export function buildingScale(
  key: string,
  sourceWidth: number,
  override?: number,
) {
  const widthScale = (plots[key][2] - plots[key][0]) / sourceWidth;
  const rule = doorRules[key];
  const needed = rule
    ? (rule.target * discipleBodyHeight * 2) / rule.pixels
    : widthScale;
  const scale =
    override ?? Math.min(Math.max(widthScale, needed), widthScale * 1.15);
  const doorHeight = rule ? (rule.pixels * scale) / 2 : null;
  const doorRatio =
    doorHeight === null ? null : doorHeight / discipleBodyHeight;
  return {
    scale,
    widthScale,
    relativeScale: scale / widthScale,
    needed,
    doorHeight,
    doorRatio,
    meetsDoorRule: rule ? doorRatio! >= rule.target - 1e-9 : null,
  };
}
import { CONFIG } from '../sim/config';
export function rootRingColors(elements: readonly string[]): string[] {
  return elements.map(
    (e) =>
      CONFIG.elements[e as keyof typeof CONFIG.elements]?.color ?? '#808080',
  );
}
export const shortName = (name: string) =>
  Array.from(name).slice(0, 4).join('') +
  (Array.from(name).length > 4 ? '…' : '');
export type Box = { x: number; y: number; width: number; height: number };
export const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
export type NamePoint = {
  x: number;
  y: number;
  name: string;
  row?: number;
  height?: number;
  bodyWidth?: number;
};
export const nameFontSize = 10.5;
export function headBox(p: NamePoint): Box {
  const height = p.height ?? 48;
  const width = p.bodyWidth ?? height;
  return { x: p.x - width / 2, y: p.y - height, width, height: height * 0.35 };
}
export function placeNames(points: NamePoint[], obstacles: Box[] = []): Box[] {
  const boxes: Box[] = [];
  const heads = points.map(headBox);
  for (const [index, p] of points.entries()) {
    const width = Array.from(p.name).length * nameFontSize + 4;
    // Rear labels end 4px above the displayed body; front labels sit below feet.
    const base = {
      x: p.x - width / 2,
      y: p.row ? p.y - (p.height ?? 48) - 4 - 17 : p.y + 3,
      width,
      height: 17,
    };
    for (let offset = 0; ; offset++) {
      // Try small horizontal corrections before moving farther from the person.
      const found = [0, -2, 2, -4, 4, -6, 6, -8, 8, -10, 10, -12, 12]
        .map((dx) => ({
          ...base,
          x: base.x + dx,
          y: base.y + (p.row ? -offset : offset),
        }))
        .find(
          (b) =>
            !obstacles.some((a) => intersects(a, b)) &&
            !boxes.some((a) => intersects(a, b)) &&
            !heads.some((head, i) => i !== index && intersects(head, b)),
        );
      if (found) {
        boxes.push(found);
        break;
      }
    }
  }
  return boxes;
}
export function buildingLabelBox(id: string, text: string): Box {
  const [x, y] = buildingLabelPosition(id);
  const width = Array.from(text).length * 11 + 4;
  return {
    x: id === 'B_MEDIT' ? x - 2 : x - width / 2,
    y: y - 2,
    width,
    height: 17,
  };
}
export const buildingDepth = (id: string, y: number) =>
  id === 'B_GARDEN' ? -500 + y / 10000 : y;
export const meditationProtected: Box[] = [
  { x: 363, y: 114, width: 58, height: 44 },
  buildingLabelBox('B_MEDIT', '静修室预留位'),
];

/** CSS object-fit: contain preserves the smaller canvas scale on both axes. */
export function compactMetrics(cssWidth: number, cssHeight: number) {
  const scale = Math.max(0.001, Math.min(cssWidth / 640, cssHeight / 360));
  return {
    scale,
    diameter: 14 / scale,
    fontSize: 11 / scale,
    spacing: 16 / scale,
  };
}
export function compactSlot(
  region: Region,
  index: number,
  count: number,
  spacing: number,
) {
  return {
    x: region.center[0] + (index - (count - 1) / 2) * spacing,
    y: region.center[1],
  };
}
