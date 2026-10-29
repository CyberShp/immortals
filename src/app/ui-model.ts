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
export function cardPosition(
  x: number,
  headY: number,
  width: number,
  height: number,
  viewport: { width: number; height: number },
) {
  const clamp = (n: number, max: number) =>
    Math.max(8, Math.min(Math.max(8, max), n));
  return {
    x: clamp(x - width / 2, viewport.width - width - 8),
    y: clamp(
      headY - height - 8 >= 40 ? headY - height - 8 : headY + 12,
      viewport.height - height - 8,
    ),
  };
}
export const panelEntries = [
  '门人',
  '建造',
  '纪事',
  '传承录',
  '小窗',
  '设置/存档',
] as const;
