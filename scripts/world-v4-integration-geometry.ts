/** Integration measurements; all coordinates remain presentation-only. */
export {};
(globalThis as { location?: unknown }).location = { search: '?world=v4' };
const w = await import('../src/render/world');
const v = await import('../src/render/world-v4');
const { uv, toUV, v4Layout: l } = v;
type P = [number, number];
function distance(p: P, a: P, b: P) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
      ),
    );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const hall = w.worldMap.slots.find((s) => s.id === 'B_HALL')!.entrance;
const sources = [
  ...w.worldMap.slots.filter((s) => s.id !== 'B_HALL').map((s) => s.entrance),
  ...w.worldMap.spots.map((s) => s.point),
  w.coolWorld!.quarry,
  w.coolWorld!.expeditionPoint,
];
const paths = sources.map((s) => w.findPath(s, hall));
const array = v.v4Blocked.find((b) => b.id === 'array')!;
const border = (p: P, polygon: P[]) =>
  Math.min(
    ...polygon.map((a, i) => distance(p, a, polygon[(i + 1) % polygon.length])),
  );
const roads = l.roads.flatMap((r) => {
  const p = r.walk_centerline ?? r.centerline;
  return p.slice(1).map((b, i) => ({
    a: p[i] as P,
    b: b as P,
    width: r.walk_width ?? r.width ?? r.drawn_width ?? 0.7,
  }));
});
const center = uv(...(l.array_disc_center as P));
const seats = Object.entries(l.b8_seats_uv).map(([id, p]) => {
  const original = uv(...(p as P));
  const candidates = [];
  for (let u = 37; u < 44; u += 0.05)
    for (let z = 0; z < 8; z += 0.05) {
      const q: P = [u, z],
        px = uv(...q);
      if (!w.walkable(px)) continue;
      const clearance = border(q, array.polygon.map(toUV));
      if (clearance < 0.15) continue;
      if (v.v4Blocked.some((b) => border(q, b.polygon.map(toUV)) < 0.15))
        continue;
      const roadClearance = Math.min(
        ...roads.map((r) => distance(q, r.a, r.b) - r.width / 2),
      );
      if (roadClearance < 0.15) continue;
      if (
        w.worldMap.slots.some(
          (s) => Math.hypot(px[0] - s.entrance[0], px[1] - s.entrance[1]) < 50,
        )
      )
        continue;
      candidates.push({
        uv: q.map((n) => +n.toFixed(3)),
        px,
        clearance,
        roadClearance,
        distance: Math.hypot(px[0] - original[0], px[1] - original[1]),
      });
    }
  candidates.sort((a, b) => a.distance - b.distance);
  const chosen = candidates.find((c) => w.findPath(hall, c.px).length > 1)!;
  const d = Math.hypot(center[0] - chosen.px[0], center[1] - chosen.px[1]);
  return {
    id,
    originalUV: p,
    original,
    depthPx: border(original, array.polygon),
    depthUV: border(p as P, array.polygon.map(toUV)),
    suggested: chosen,
    facing: [(center[0] - chosen.px[0]) / d, (center[1] - chosen.px[1]) / d],
  };
});
console.log(
  JSON.stringify(
    {
      seats,
      runtimeSeats: v.v4ArenaSeats.map((s) => ({
        ...s,
        roundTrip: toUV(s.point),
        arrayClearancePx: border(s.point, array.polygon),
        arrayClearanceUV: border(s.uv, array.polygon.map(toUV)),
        minimumPolygonClearanceUV: Math.min(
          ...v.v4Blocked.map((b) => border(s.uv, b.polygon.map(toUV))),
        ),
        minimumCircleClearancePx: Math.min(
          ...v.v4Circles.map(
            (c) =>
              Math.hypot(s.point[0] - c.center[0], s.point[1] - c.center[1]) -
              c.radius,
          ),
        ),
        roadEdgeClearanceUV: Math.min(
          ...roads.map((r) => distance(s.uv, r.a, r.b) - r.width / 2),
        ),
        targetClearancePx: Math.min(
          ...sources.map((p) =>
            Math.hypot(p[0] - s.point[0], p[1] - s.point[1]),
          ),
        ),
        reachable: w.findPath(hall, s.point).length > 1,
        facingErrorDegrees:
          (Math.acos(
            Math.min(
              1,
              Math.max(
                -1,
                (s.facing[0] * (center[0] - s.point[0]) +
                  s.facing[1] * (center[1] - s.point[1])) /
                  Math.hypot(center[0] - s.point[0], center[1] - s.point[1]),
              ),
            ),
          ) *
            180) /
          Math.PI,
      })),
      runtimeQueue: v.v4Queue.map((p) => ({
        point: p,
        uv: toUV(p),
        channelClearance: w.channelClearance(p, paths),
      })),
      queue: l.queue_spots.map((p) => ({
        uv: p,
        px: uv(...(p as P)),
        channelClearance: w.channelClearance(uv(...(p as P)), paths),
      })),
      dormHall: w.walkTimeSeconds(
        w.worldMap.slots.find((s) => s.id === 'B_DORM')!.entrance,
        hall,
      ),
      scaleTimeLimit: (15 * (v.V4.cellWidth / 104)) / v.V4.actorScale,
    },
    null,
    2,
  ),
);
