import manifest from '../../public/assets/manifest.json';
import worldBuildings from '../../docs/world-buildings.json';
import gateArt from '../../scripts/clean-gate-art.json';
import { worldMap, walkable, coolWorld, type Point } from './world';
import { buildingArt, intersects, type Box } from './layout';

export function buildingLabelPosition(id: string): Point {
  // ?cool=1：名牌直接用 cool-world.json 的 label 锚点。
  const cool = coolWorld?.slots.find((s) => s.id === id);
  if (cool) return [...cool.label];
  const s = worldMap.slots.find((s) => s.id === id)!;
  const grounded = worldBuildings.some(
    (b) => b.file.includes('/' + buildingArt[id] + '-') && 'grounded' in b,
  );
  const bottoms = worldBuildings
    .filter((b) => b.file.includes('/' + buildingArt[id] + '-'))
    .map((b) => b.bottom);
  // Stable across tiers: text starts 8 world units below the lowest art pixel,
  // Keep plaques close enough to identify their owner at a glance.
  return [
    (s.rect[0] + s.rect[2]) / 2,
    (grounded && id !== 'B_GARDEN'
      ? s.rect[3]
      : Math.max(s.rect[3], ...bottoms)) + 8,
  ];
}
export function buildingLabelBox(id: string, text: string) {
  const [x, y] = buildingLabelPosition(id);
  const width = Array.from(text).reduce(
    (n, c) => n + (/[^\x00-\x7F]/.test(c) ? 16 : c === ' ' ? 4 : 10),
    8,
  );
  return {
    x: x - width / 2,
    y: y,
    width,
    height: 20,
  };
}

// Reserve both tiers, including transparent margins, so upgrades never move a
// plaque onto another building. The gate's baked artwork is reserved as well.
const classicLabelObstacles = () => [
  ...worldBuildings.map((b) => {
    const e = manifest.files.find((e) => e.file === b.file)!;
    return {
      id:
        Object.entries(buildingArt).find(([, art]) =>
          b.file.includes(`/${art}-`),
        )?.[0] ?? '',
      x: b.x - e.anchor.x * b.scale,
      y: b.y - e.anchor.y * b.scale,
      width: e.size[0] * b.scale,
      height: e.size[1] * b.scale,
    };
  }),
  {
    id: 'B_GATE',
    x: gateArt.crop[0],
    y: gateArt.crop[1],
    width: gateArt.crop[2],
    height: gateArt.crop[3],
  },
];
// ?cool=1：占位立绘画在冷色槽位脚印前角（rect 底边中点），名牌避让按同一位置算；
// 山门没有立绘，只避让它的小脚印外框。
const coolLabelObstacles = (cool: NonNullable<typeof coolWorld>) => [
  ...worldBuildings.flatMap((b) => {
    const id = Object.entries(buildingArt).find(([, art]) =>
      b.file.includes(`/${art}-`),
    )?.[0];
    const slot = cool.slots.find((s) => s.id === id);
    const e = manifest.files.find((e) => e.file === b.file);
    if (!slot || !e) return [];
    const x = (slot.rect[0] + slot.rect[2]) / 2,
      y = slot.rect[3];
    return [
      {
        id: slot.id,
        x: x - e.anchor.x * b.scale,
        y: y - e.anchor.y * b.scale,
        width: e.size[0] * b.scale,
        height: e.size[1] * b.scale,
      },
    ];
  }),
  ...cool.slots
    .filter((s) => s.id === 'B_GATE')
    .map((s) => ({
      id: s.id,
      x: s.rect[0],
      y: s.rect[1],
      width: s.rect[2] - s.rect[0],
      height: s.rect[3] - s.rect[1],
    })),
];
export const buildingLabelObstacles = coolWorld
  ? coolLabelObstacles(coolWorld)
  : classicLabelObstacles();

export function distanceToBox(p: Point, box: Box) {
  return Math.hypot(
    Math.max(box.x - p[0], 0, p[0] - box.x - box.width),
    Math.max(box.y - p[1], 0, p[1] - box.y - box.height),
  );
}
export function labelOnWalkable(box: Box) {
  // Include the entire rectangle, not just its center near a cliff or obstacle.
  for (let y = 0; y <= Math.ceil(box.height); y++)
    for (let x = 0; x <= Math.ceil(box.width); x++)
      if (
        !walkable([
          box.x + Math.min(x, box.width),
          box.y + Math.min(y, box.height),
        ])
      )
        return false;
  return true;
}
export function labelBelongsTo(id: string, box: Box) {
  const center: Point = [box.x + box.width / 2, box.y + box.height / 2];
  const own = buildingLabelObstacles.filter((b) => b.id === id);
  const others = buildingLabelObstacles.filter((b) => b.id !== id);
  return own.every((b) =>
    others.every(
      (other) => distanceToBox(center, b) < distanceToBox(center, other),
    ),
  );
}
let cachedKey = '';
let cached: { id: string; box: Box }[] = [];
/** Horizontal clearance first; at most 24px extra descent, always nearest its owner. */
export function layoutBuildingLabels<T extends { id: string; box: Box }>(
  labels: T[],
): T[] {
  const sorted = [...labels].sort(
    (a, b) => a.box.y - b.box.y || a.id.localeCompare(b.id),
  );
  const key = JSON.stringify(sorted.map(({ id, box }) => ({ id, box })));
  if (key === cachedKey)
    return cached.map((p) => ({
      ...sorted.find((l) => l.id === p.id)!,
      box: { ...p.box },
    }));
  const occupied: Box[] = [...buildingLabelObstacles];
  const result = sorted.map((label) => {
    let chosen: Box | undefined;
    for (let dy = 0; dy <= 24 && !chosen; dy += 2) {
      for (const dx of [
        0,
        ...Array.from({ length: 20 }, (_, i) => [
          (i + 1) * 4,
          -(i + 1) * 4,
        ]).flat(),
      ]) {
        const box = { ...label.box, x: label.box.x + dx, y: label.box.y + dy };
        if (
          occupied.some((other) =>
            intersects(box, {
              x: other.x - 4,
              y: other.y - 4,
              width: other.width + 8,
              height: other.height + 8,
            }),
          )
        )
          continue;
        if (!labelBelongsTo(label.id, box) || !labelOnWalkable(box)) continue;
        chosen = box;
        break;
      }
    }
    // cool 骨架的锚点是手工估描的占位：找不到无歧义位置时退回锚点原位，不让整帧崩掉。
    if (!chosen && coolWorld) chosen = { ...label.box };
    if (!chosen)
      throw new Error(
        `No unambiguous walkable plaque placement: ${label.id} ${JSON.stringify(label.box)}`,
      );
    occupied.push(chosen);
    return { ...label, box: chosen };
  });
  cachedKey = key;
  cached = result.map(({ id, box }) => ({ id, box: { ...box } }));
  return result;
}
