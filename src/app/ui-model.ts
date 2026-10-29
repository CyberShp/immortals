import type { Disciple } from '../sim/data';
import type { World } from '../sim/world';
export const relatedEvents = (w: World, id: string) =>
  w.events.filter((e) => Object.values(e.roles).includes(id));
export type RosterFilter = {
  realm: string;
  eventsOnly: boolean;
  sort: 'energy' | 'realm';
  descending: boolean;
};
export function rosterRows(w: World, filter: RosterFilter): Disciple[] {
  const rank = (d: Disciple) =>
    ['炼气', '筑基', '金丹', '元婴', '化神'].indexOf(d.realm.major) * 100 +
    d.realm.layer;
  return w.disciples
    .filter(
      (d) =>
        (!filter.realm || d.realm.major === filter.realm) &&
        (!filter.eventsOnly || relatedEvents(w, d.id).length > 0),
    )
    .sort(
      (a, b) =>
        (filter.sort === 'energy'
          ? a.needs.energy - b.needs.energy
          : rank(a) - rank(b)) * (filter.descending ? -1 : 1) ||
        a.id.localeCompare(b.id),
    );
}
export type ScreenRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export function intersectionArea(a: ScreenRect, b: ScreenRect) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}
export function cardPosition(
  x: number,
  headY: number,
  width: number,
  height: number,
  viewport: { width: number; height: number },
  obstacles: readonly ScreenRect[] = [],
) {
  const clamp = (n: number, max: number) =>
    Math.max(8, Math.min(Math.max(8, max), n));
  const original = {
    x: clamp(x - width / 2, viewport.width - width - 8),
    y: clamp(
      headY - height - 8 >= 40 ? headY - height - 8 : headY + 12,
      viewport.height - height - 8,
    ),
  };
  const sides = [
    { x: x + 12, y: headY },
    { x: x - width - 12, y: headY },
    { x: x - width / 2, y: headY - height - 8 },
    { x: x - width / 2, y: headY + 12 },
  ];
  const candidates = [original, ...sides];
  for (const delta of [-24, 24, -48, 48])
    sides.forEach((p, i) =>
      candidates.push({
        x: p.x + (i >= 2 ? delta : 0),
        y: p.y + (i < 2 ? delta : 0),
      }),
    );
  const inside = candidates.filter(
    (p) =>
      p.x >= 0 &&
      p.y >= 0 &&
      p.x + width <= viewport.width &&
      p.y + height <= viewport.height,
  );
  // Keep fallback positions inside the viewport as well. Stable ties retain priority.
  const valid = inside.length
    ? inside
    : [
        {
          x: Math.max(0, Math.min(original.x, viewport.width - width)),
          y: Math.max(0, Math.min(original.y, viewport.height - height)),
        },
      ];
  let best = valid[0],
    least = Infinity;
  for (const p of valid) {
    const area = obstacles.reduce(
      (sum, obstacle) =>
        sum + intersectionArea({ ...p, width, height }, obstacle),
      0,
    );
    if (area === 0) return p;
    if (area < least) {
      best = p;
      least = area;
    }
  }
  return best;
}
export const panelEntries = [
  '门人',
  '建造',
  '纪事',
  '传承录',
  '小窗',
  '设置/存档',
] as const;
