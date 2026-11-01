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
  queue: l.queue_spots.map((p) => uv(p[0], p[1])),
  b8: Object.values(l.b8_seats_uv).map((p) => uv(p[0], p[1])),
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
      pass: results.filter((r) => r.pass).length,
      fail: results.filter((r) => !r.pass).length,
    },
    null,
    2,
  ),
);
if (results.some((r) => !r.pass)) process.exitCode = 1;
