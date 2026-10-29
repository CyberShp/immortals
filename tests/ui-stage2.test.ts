import { expect, it } from 'vitest';
import {
  cardPosition,
  rosterRows,
  relatedEvents,
  panelEntries,
} from '../src/app/ui-model';
import { createWorld } from '../src/sim/world';
import { loadData } from '../src/sim/data';
import {
  worldMap,
  walkTimeSeconds,
  discipleDestinations,
  walkable,
} from '../src/render/world';
import {
  DISCIPLE_HEIGHT,
  WALK_SPEED,
  WALK_FRAME_MS,
} from '../src/render/world-scale';
import {
  behaviorPose,
  placeNames,
  intersects,
  headBox,
} from '../src/render/layout';
import { readFileSync } from 'node:fs';
it('card flips below top edge and clamps at every viewport boundary', () => {
  for (const viewport of [
    { width: 480, height: 320 },
    { width: 1440, height: 900 },
  ])
    for (const x of [-100, 0, 250, 2000])
      for (const y of [-100, 45, 300, 1200]) {
        const p = cardPosition(x, y, 238, 180, viewport);
        expect(p.x).toBeGreaterThanOrEqual(8);
        expect(p.x + 238).toBeLessThanOrEqual(viewport.width - 8);
        expect(p.y).toBeGreaterThanOrEqual(8);
        expect(p.y + 180).toBeLessThanOrEqual(viewport.height - 8);
      }
  expect(cardPosition(200, 50, 238, 180, { width: 480, height: 320 }).y).toBe(
    62,
  );
});
it('roster filters and sorting are stable, independent and do not mutate world', () => {
  const w = createWorld(42, loadData());
  const before = JSON.stringify(w);
  for (const sort of ['energy', 'realm'] as const) {
    const rows = rosterRows(w, {
      realm: '',
      eventsOnly: false,
      sort,
      descending: false,
    });
    expect(rows).toHaveLength(6);
    const reverse = rosterRows(w, {
      realm: '',
      eventsOnly: false,
      sort,
      descending: true,
    });
    if (sort === 'energy')
      expect(reverse[0].needs.energy).toBeGreaterThanOrEqual(
        rows[0].needs.energy,
      );
  }
  expect(
    rosterRows(w, {
      realm: '筑基',
      eventsOnly: false,
      sort: 'realm',
      descending: false,
    }).every((d) => d.realm.major === '筑基'),
  ).toBe(true);
  expect(
    rosterRows(w, {
      realm: '',
      eventsOnly: true,
      sort: 'energy',
      descending: false,
    }),
  ).toHaveLength(0);
  expect(JSON.stringify(w)).toBe(before);
  w.events.push({
    id: 'test',
    hint: '事件',
    text: '事件',
    createdTick: 0,
    options: ['确定'],
    defaultOption: 0,
    kind: '测试',
    chain: false,
    definitionId: '',
    roles: { a: w.disciples[0].id },
    choices: [],
    priority: 0,
  });
  expect(relatedEvents(w, w.disciples[0].id)).toHaveLength(1);
  expect(
    rosterRows(w, {
      realm: '',
      eventsOnly: true,
      sort: 'energy',
      descending: false,
    }).map((d) => d.id),
  ).toEqual([w.disciples[0].id]);
});
it('dorm to hall takes 8–15 seconds and animation stride matches body height', () => {
  const seconds = walkTimeSeconds(
    worldMap.slots.find((s) => s.id === 'B_DORM')!.front,
    worldMap.slots.find((s) => s.id === 'B_HALL')!.front,
  );
  expect(seconds).toBeGreaterThanOrEqual(8);
  expect(seconds).toBeLessThanOrEqual(15);
  expect((WALK_FRAME_MS / 1000) * WALK_SPEED).toBeCloseTo(
    DISCIPLE_HEIGHT * 0.35,
  );
  expect(behaviorPose('做工', true, 0)).toBe('walk-step');
  expect(behaviorPose('做工', true, WALK_FRAME_MS + 1)).toBe('walk-pass');
});
it('initial disciples are on main island and new scale names avoid heads and building labels', () => {
  const w = createWorld(42, loadData());
  const destinations = discipleDestinations(w.disciples, 0);
  const points = w.disciples.map((d, i) => {
    const [x, y] = destinations[i];
    expect(walkable([x, y])).toBe(true);
    expect(x).toBeGreaterThan(1200);
    expect(x).toBeLessThan(1800);
    return {
      x: x / 2,
      y: y / 2,
      name: d.name,
      height: DISCIPLE_HEIGHT / 2,
      row: 0,
    };
  });
  const obstacles = worldMap.slots.map((s) => ({
    x: s.rect[0] / 2,
    y: (s.rect[1] - 50) / 2,
    width: (s.rect[2] - s.rect[0]) / 2,
    height: 17,
  }));
  const boxes = placeNames(points, obstacles);
  boxes.forEach((b, i) => {
    expect(b.y).toBeGreaterThan(points[i].y);
    expect(obstacles.some((o) => intersects(o, b))).toBe(false);
    expect(points.some((p) => intersects(headBox(p), b))).toBe(false);
    boxes.slice(i + 1).forEach((o) => expect(intersects(o, b)).toBe(false));
  });
});
it('all UI entries and one shared dialog are wired in source', () => {
  const source = readFileSync('src/app/main.ts', 'utf8');
  panelEntries.forEach((label) => expect(source).toContain(label));
  expect(source.match(/<dialog /g)).toHaveLength(1);
  for (const id of [
    'roster-open',
    'build-open',
    'journal-open',
    'legacy-open',
    'settings-open',
    'save-open',
    'story-open',
    'offline-open',
  ])
    expect(source).toContain(`el('${id}').onclick`);
});
