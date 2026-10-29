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
  if (moving) return Math.floor(elapsed / 180) % 2 ? 'walk-pass' : 'walk-step';
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
  const columns = Math.min(4, Math.floor((right - left) / 20) + 1);
  const row = Math.floor(index / columns);
  const rows = Math.ceil(count / columns);
  const rowCount = Math.min(columns, count - row * columns);
  const spacing = Math.min(28, (right - left) / Math.max(1, rowCount - 1));
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
  const [x, y] = plotFoot(id);
  return [x, y + (id === 'B_ALCHEMY' ? 17 : 3)];
}
