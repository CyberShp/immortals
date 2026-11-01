export {};
(globalThis as { location?: unknown }).location = { search: '?world=v4' };
const w = await import('../src/render/world');
const v = await import('../src/render/world-v4');
const { uv, v4Layout: l } = v;
const origin = w.worldMap.slots[0].entrance;
const results: { name: string; pass: boolean; detail?: unknown }[] = [];
const check = (name: string, pass: boolean, detail?: unknown) =>
  results.push({ name, pass, detail });
const reachable = (p: [number, number]) => w.findPath(origin, p).length >= 2;
check('world size', w.worldMap.width === 4997 && w.worldMap.height === 2320);
let sampled = 0;
const bad: unknown[] = [];
for (let i = 0; i <= 10; i++)
  for (let j = 0; j <= 45; j++) {
    const p = uv(29.762 + i / 10, 7.761 + ((12.2 - 7.761) * j) / 45);
    sampled++;
    if (!w.walkable(p) || !w.lineClear(p, uv(30.262, 7.761))) bad.push(p);
  }
check('gate passage grid walkable and connected', bad.length === 0, {
  sampled,
  bad,
});
for (const [name, p] of [
  ['east landing', uv(47.8, -4.3)],
  ['south landing', uv(30.262, 12.8)],
  ['fade', v.v4Fade],
  ['room door', uv(49.91, -6.85)],
] as [string, [number, number]][])
  check(name, reachable(p), p);
for (const b of v.v4Blocked.filter(
  (b) => b.id.startsWith('gate') || b.id === 'room_walls',
)) {
  const center = b.polygon.reduce(
    (p, q) => [p[0] + q[0] / 4, p[1] + q[1] / 4] as [number, number],
    [0, 0] as [number, number],
  );
  check('blocked ' + b.id, !w.walkable(center));
}
check('furnace blocked', !w.walkable(uv(51.31, -6.85)));
check(
  'expedition centerline',
  v.v4Route.slice(1).every((p, i) => w.lineClear(v.v4Route[i], p)),
);
const groups = {
  cushions: [
    ...l.cushion_block.west_centers,
    ...l.cushion_block.east_centers,
  ].map((p) => uv(p[0], p[1])),
  queue: v.v4Queue,
  b8: w.coolWorld!.arenaSeats,
  stations: w.worldMap.spots.map((s) => s.point),
  entrances: w.worldMap.slots.map((s) => s.entrance),
  quarry: [w.coolWorld!.quarry],
  fade: [v.v4Fade],
};
for (const [name, points] of Object.entries(groups))
  check(
    name + ' footprints',
    points.every((p) => w.walkable(p)),
    points
      .filter((p) => !w.walkable(p))
      .map((p) => ({
        p,
        uv: v.toUV(p),
        blocked: v.v4Blocked
          .filter((b) => v.contains(p, b.polygon))
          .map((b) => b.id),
      })),
  );
check('B8 runtime reachable', w.coolWorld!.arenaSeats.every(reachable));
const segmentDistance = (
  p: [number, number],
  a: [number, number],
  b: [number, number],
) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
      ),
    );
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
};
const center = uv(...(l.array_disc_center as [number, number]));
for (const seat of v.v4ArenaSeats) {
  const margin = Math.min(
    ...v.v4Blocked.flatMap((b) => {
      const ps = b.polygon.map(v.toUV);
      return ps.map((p, i) =>
        segmentDistance(seat.uv, p, ps[(i + 1) % ps.length]),
      );
    }),
  );
  const d = Math.hypot(center[0] - seat.point[0], center[1] - seat.point[1]);
  const dot =
    (seat.facing[0] * (center[0] - seat.point[0]) +
      seat.facing[1] * (center[1] - seat.point[1])) /
    d;
  check(
    'B8 ' + seat.id + ' clearance >=0.15 UV and facing <=5 degrees',
    margin >= 0.15 && dot >= Math.cos((5 * Math.PI) / 180),
    { margin, facing: seat.facing },
  );
}

const spots = await import('../src/render/v4-spots');
for (const spot of spots.satelliteSpots) {
  const points = [spot.point, ...spots.subpositions(spot)];
  check(
    'v1.5 ' + spot.id + ' all subpositions reachable from spawn',
    points.every((p) => w.walkable(p) && w.findPath(v.v4Spawn, p).length > 1),
    { count: points.length },
  );
}
check(
  'v1.5 duel 24 separated',
  spots
    .duelPositions(24)
    .every(
      (p, i, all) =>
        w.walkable(p) &&
        all
          .slice(i + 1)
          .every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= 45.92),
    ),
);
check(
  'v1.5 spawn dorm',
  v.toUV(v.v4Spawn).every((n, i) => Math.abs(n - l.spawn_main_uv.uv[i]) < 1e-8),
);
const rawSeats = Object.values(l['b8_seats_uv_v1.4']).map((p) =>
  uv(p[0], p[1]),
);
const info = {
  name: 'v1.4 历史 B8 冲突保留对照；运行时已读 v1.5',
  conflicts: rawSeats.filter((p) => !w.walkable(p)).length,
  points: rawSeats,
};
check(
  'active targets reachable',
  [
    ...w.worldMap.slots.map((s) => s.entrance),
    ...w.worldMap.spots.map((s) => s.point),
    w.coolWorld!.quarry,
  ].every(reachable),
);
console.log(
  JSON.stringify(
    {
      results,
      info,
      pass: results.filter((r) => r.pass).length,
      fail: results.filter((r) => !r.pass).length,
    },
    null,
    2,
  ),
);
if (results.some((r) => !r.pass)) process.exitCode = 1;
