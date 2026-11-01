/** Lore v1.4 presentation adapter. Never imported by simulation. */
import layout from './world-v4-layout.json';
import fg from './world-v4-foreground.json';
import assets from './world-v4-assets.json';
import east from './world-v4-placement/east_bridge_v3_placement.json';
import south from './world-v4-placement/south_bridge_placement.json';
import covers from './world-v4-placement/south_gate_end_cover_v2_placement.json';
import platforms from './world-v4-placement/placement.json';
import type { CoolWorld } from './cool-world';
export { layout as v4Layout, assets as v4Assets };
export const v4ForegroundBounds = new Map(
  fg.objects.map((f) => [
    'world-v4/fg/' + f.filename.replace('.png', '.webp'),
    f.bbox,
  ]),
);
export type P = [number, number];
export const V4 = {
  width: 4997,
  height: 2320,
  offset: [342, 200] as P,
  cellWidth: 170.417,
  cellHeight: 80.667,
  actorScale: 1.64,
  walkSpeed: 32.8,
};
export function worldV4Enabled(search: string) {
  const p = new URLSearchParams(search);
  return (
    p.get('world') === 'v4' ||
    (p.get('world') !== 'v3' &&
      p.get('world') !== 'classic' &&
      p.get('cool') !== '1')
  );
}
export const v4Active =
  typeof location !== 'undefined' && worldV4Enabled(location.search ?? '');
export const offset = (p: readonly number[]): P => [p[0] + 342, p[1] + 200];
export function uv(u: number, v: number, cellHeight = V4.cellHeight): P {
  const f = layout.frame,
    t = f.canvas_transform;
  return [
    t.sx * (f.a * (u - v) + f.x0) + 342,
    (t.sy * (f.b * (u + v) + f.y0) - 33) * (cellHeight / V4.cellHeight) + 200,
  ];
}
export function toUV([x, y]: P): P {
  const f = layout.frame,
    t = f.canvas_transform;
  const a = ((x - 342) / t.sx - f.x0) / f.a,
    b = ((y - 200 + 33) / t.sy - f.y0) / f.b;
  return [(a + b) / 2, (b - a) / 2];
}
export const rect = (r: readonly number[]): P[] => [
  uv(r[0], r[2]),
  uv(r[1], r[2]),
  uv(r[1], r[3]),
  uv(r[0], r[3]),
];
const poly = (p: number[][]) => p.map(offset);
export function contains(p: P, ps: P[]) {
  let inside = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const a = ps[i],
      b = ps[j],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    if (Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t) < 0.12)
      return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
const c = layout.collision_px,
  wa = layout.walk_areas_v14;
export const v4Blocked = Object.entries(c.blocked)
  .filter(([id]) => !id.startsWith('dorm_') || id === 'dorm_yard')
  .map(([id, b]) => ({ id, polygon: poly(b.poly_px) }));
v4Blocked.push({
  id: 'room_walls',
  polygon: rect(wa.east.blocked_uv.room_walls),
});
// Exact UV rectangles avoid the 0.1 px rounded gate boundary invading the guaranteed passage.
for (const b of v4Blocked)
  if (b.id.startsWith('gate'))
    b.polygon = rect(c.blocked[b.id as keyof typeof c.blocked].uv_rect);
const corridors: P[][] = [
  poly(c.pad_px),
  poly(c.bridge_mouth_px),
  rect(layout.gate_passage_uv),
];
for (const id of ['R2_bridge', 'R3_back_trail']) {
  const r = layout.roads.find((r) => r.id === id)!;
  const ps = r.walk_centerline ?? r.centerline,
    width = r.walk_width ?? r.width ?? 0.7;
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1],
      b = ps[i];
    corridors.push(
      rect([
        Math.min(a[0], b[0]) - width / 2,
        Math.max(a[0], b[0]) + width / 2,
        Math.min(a[1], b[1]) - width / 2,
        Math.max(a[1], b[1]) + width / 2,
      ]),
    );
  }
}
export const v4Ground: P[][] = [
  poly(c.walkable_polygon_px),
  ...Object.values(wa.east.walk_px).map(poly),
  ...Object.values(wa.south.walk_px).map(poly),
  ...corridors,
];
// Landing connectors: only bridge-width strip across the 0.4-cell inset gap, within delivered platform top.
v4Ground.push(
  rect([46.76, 47.16, -4.95, -3.65]),
  rect([28.912, 31.612, 12.2, 12.6]),
);
export const v4Circles = Object.entries(c.trees_px).map(([id, t]) => ({
  id,
  center: offset(t.center),
  radius: t.radius_px,
}));
const furnace = wa.east.blocked_uv.furnace_circle;
export function v4Walkable(p: P) {
  if (p[0] < 0 || p[1] < 0 || p[0] >= V4.width || p[1] >= V4.height)
    return false;
  if (!v4Ground.some((g) => contains(p, g))) return false;
  const passage = contains(p, rect(layout.gate_passage_uv));
  if (
    v4Blocked.some(
      (b) =>
        contains(p, b.polygon) &&
        !(passage && b.id.startsWith('gate_pier')) &&
        !(b.id === 'east_grove' && corridors.some((g) => contains(p, g))),
    )
  )
    return false;
  if (
    v4Circles.some(
      (t) => Math.hypot(p[0] - t.center[0], p[1] - t.center[1]) <= t.radius,
    )
  )
    return false;
  const q = toUV(p);
  return (
    Math.hypot(q[0] - furnace.center[0], q[1] - furnace.center[1]) > furnace.r
  );
}
// Navigation uses circumscribed polygons as boundary cuts; occupancy remains analytic.
const circlePoly = (center: P, rx: number, ry = rx): P[] =>
  Array.from({ length: 64 }, (_, i) => [
    center[0] + rx * Math.cos((i * Math.PI) / 32),
    center[1] + ry * Math.sin((i * Math.PI) / 32),
  ]);
export const v4Navigation = [
  ...v4Ground,
  ...v4Blocked.map((b) => b.polygon),
  ...v4Circles.map((c) => circlePoly(c.center, c.radius)),
  Array.from({ length: 96 }, (_, i) =>
    uv(
      furnace.center[0] + furnace.r * Math.cos((i * Math.PI) / 48),
      furnace.center[1] + furnace.r * Math.sin((i * Math.PI) / 48),
    ),
  ),
];
export function v4Nearest(p: P): P {
  if (v4Walkable(p)) return p;
  for (let r = 2; r < 600; r += 2)
    for (let i = 0; i < 128; i++) {
      const q: P = [
        p[0] + r * Math.cos((i * Math.PI) / 64),
        p[1] + r * Math.sin((i * Math.PI) / 64),
      ];
      if (v4Walkable(q)) return q;
    }
  throw Error(`No v4 landing near ${p}`);
}
export const v4Fade = offset(wa.fade.point_px);
export const v4Route = [
  uv(30.262, 7.761),
  uv(30.262, 9.2),
  uv(30.262, 12.2),
  v4Fade,
];
export const v4FadeContains = (p: P) =>
  contains(p, rect(wa.fade.trigger_zone_uv));
// Presentation overrides pending Lore synchronisation; authoritative layout is untouched.
export const v4Queue = (
  [
    [30.2, 0.25],
    [30.85, 0.7],
    [30.4, 1.55],
    [30.45, 2.1],
  ] as P[]
).map((p) => uv(...p));
export const v4ArenaSeats = (
  [
    [38.35, 4.1],
    [37.7, 2.45],
    [39.4, 1.2],
  ] as P[]
).map((p, i) => {
  const point = uv(...p),
    center = uv(...(layout.array_disc_center as P));
  const length = Math.hypot(center[0] - point[0], center[1] - point[1]);
  return {
    id: ['L', 'M', 'R'][i],
    uv: p,
    point,
    facing: [
      (center[0] - point[0]) / length,
      (center[1] - point[1]) / length,
    ] as P,
  };
});
export function adaptV4(base: CoolWorld): CoolWorld {
  const names: Record<string, string> = {
    B_HALL: 'hall',
    B_DORM: 'dorm',
    B_MEDIT: 'array',
    B_ALCHEMY: 'herb',
    B_GARDEN: 'herb',
    B_GATE: 'gate_passage_north',
  };
  const shape: Record<string, string> = {
    B_HALL: 'hall',
    B_DORM: 'dorm_yard',
    B_MEDIT: 'array',
    B_ALCHEMY: 'herb',
    B_GARDEN: 'herb',
    B_GATE: 'gate_pier_L',
  };
  const slots = base.slots.map((s) => {
    const entrance = v4Nearest(
      offset(c.door_points_px[names[s.id] as keyof typeof c.door_points_px]),
    );
    const footprint = {
      polygon: v4Blocked.find((b) => b.id === shape[s.id])!.polygon,
    };
    return {
      ...s,
      entrance,
      front: entrance,
      label: entrance,
      footprint,
      rect: [
        Math.min(...footprint.polygon.map((p) => p[0])),
        Math.min(...footprint.polygon.map((p) => p[1])),
        Math.max(...footprint.polygon.map((p) => p[0])),
        Math.max(...footprint.polygon.map((p) => p[1])),
      ] as [number, number, number, number],
    };
  });
  // No new east-platform job: keep the existing alchemy job at the main-platform garden approach.
  const spots = base.spots.map((s, i) => {
    const choices = [
      ...layout.cushion_block.west_centers,
      ...layout.cushion_block.east_centers,
      ...layout.queue_spots,
    ];
    const p = v4Nearest(uv(...(choices[i % choices.length] as P)));
    return { ...s, point: p, original: p, island: 'platform' };
  });
  return {
    ...base,
    width: V4.width,
    height: V4.height,
    camera: { start: [2350, 1150], startViewWidth: 3000 },
    background: { ...base.background, placeholder: '', polygon: v4Ground[0] },
    slots,
    spots,
    quarry: v4Nearest(offset(c.door_points_px.quarry)),
    expeditionPoint: v4Fade,
    islands: v4Ground.map((walkable, i) => ({
      id: i ? 'area-' + i : 'platform',
      offset: [0, 0] as P,
      walkable,
      obstacles: [],
    })),
    bridges: [],
    zones: [],
    decor: [],
    arenaSeats: v4ArenaSeats.map((s) => s.point),
  };
}
export const v4Layers = (() => {
  const layer = (source: string, position: readonly number[], z: number) => ({
    file: 'world-v4/' + source.replace('.png', '.webp'),
    x: position[0],
    y: position[1],
    z,
  });
  const layers = [
    layer('background/background_world_v2_4997x2320.png', [0, 0], -1100),
    layer(
      'main-platform/main_platform_v4refine_v3_3600x1920.png',
      V4.offset,
      -1090,
    ),
    layer('bridges/east_bridge_v5.png', east.east.world_origin, -1080),
    layer('bridges/south_bridge_v1.png', south.world_origin, -1070),
  ];
  const gate = fg.objects.find((f) => f.filename === 'gate.png')!;
  // Gate and covers participate in actor sorting; their forced ordering forms one stable block.
  for (const f of fg.objects)
    layers.push(
      layer(
        'fg/' + f.filename,
        V4.offset,
        f.filename.startsWith('main_east_mouth_post')
          ? 100000
          : f.sort_baseline_y_world,
      ),
    );
  covers.parts.forEach((p, i) =>
    layers.push(
      layer(
        'bridges/' + p.png,
        p.world_origin,
        Math.max(
          gate.sort_baseline_y_world + 0.01 * (i + 1),
          p.baseline_y_world,
        ),
      ),
    ),
  );
  for (const side of ['east', 'south'] as const)
    layers.push(
      layer(
        `platforms/${side}_platform_v1b.png`,
        platforms['平台'][side]['左上角世界坐标'],
        -1060 + (side === 'south' ? 1 : 0),
      ),
    );
  for (const side of ['east', 'south'] as const)
    layers.push(
      layer(
        `fogband/${side}_fogband_layer_v2.png`,
        platforms['平台'][side]['左上角世界坐标'],
        -1040,
      ),
    );
  return layers.sort((a, b) => a.z - b.z || a.file.localeCompare(b.file));
})();

/** Analytic segment/circle collision; polygon boundary cuts alone approximate circles. */
export function v4SegmentBlocked(a: P, b: P) {
  const hit = (p: P, q: P, c: P, r: number) => {
    const dx = q[0] - p[0],
      dy = q[1] - p[1],
      t = Math.max(
        0,
        Math.min(
          1,
          ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
    return Math.hypot(p[0] + dx * t - c[0], p[1] + dy * t - c[1]) <= r;
  };
  return (
    v4Circles.some((c) => hit(a, b, c.center, c.radius)) ||
    hit(toUV(a), toUV(b), furnace.center as P, furnace.r)
  );
}
