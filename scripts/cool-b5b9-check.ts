// B5–B9 布局核对（Lore 10-b5-b9-layout-v1 预检）：?cool=1 世界下各入口可达、关键通道净宽、讲道蒲团/列队位可走。
// 用法：node --import tsx scripts/cool-b5b9-check.ts
export {};
(globalThis as { location?: unknown }).location = { search: '?cool=1' };
const w = await import('../src/render/world');
const { buildCoolHall } = await import('../src/render/cool-hall');
const { sermonPoint } = await import('../src/render/cool-sermon');
type P = [number, number];
const W = (u: number, v: number): P => [52 * (u - v), 26 * (u + v)];
const UV = ([x, y]: P) => [
  +((x / 52 + y / 26) / 2).toFixed(2),
  +((y / 26 - x / 52) / 2).toFixed(2),
];
const cool = w.coolWorld!;
const hall = cool.slots.find((s) => s.id === 'B_HALL')!.entrance as P;
const out: Record<string, unknown> = {};
const reach: Record<string, unknown> = {};
const targets: [string, P][] = [
  ...cool.slots.map((s) => [`入口 ${s.id}`, s.entrance as P] as [string, P]),
  ...cool.spots.map((s) => [s.id, s.point as P] as [string, P]),
  ['采石点', cool.quarry as P],
  ['历练点', cool.expeditionPoint as P],
  ['东台桥口(43.4,−3.5)→最近可走', w.nearestWalkable(W(43.4, -3.5))],
];
for (const [name, p] of targets) {
  const path = w.findPath(hall, p);
  reach[name] = {
    uv: UV(p),
    walkable: w.walkable(p),
    reachable: path.length >= 2,
    len: +w.pathLength(path).toFixed(0),
  };
}
out.reach = reach;
out.bridgeMouth = {
  point: UV(W(43.4, -3.5)),
  walkable: w.walkable(W(43.4, -3.5)),
  inset: UV(W(43.3, -3.5)),
  insetWalkable: w.walkable(W(43.3, -3.5)),
};
// 通道净宽：沿给定 uv 线段采样（0.01 格），取最长连续可走段（格）。
function run(name: string, a: [number, number], b: [number, number]) {
  const n = 2000;
  let best = 0,
    cur = 0,
    bestFrom = 0,
    from = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = W(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    if (w.walkable(p)) {
      if (!cur) from = t;
      cur++;
      if (cur > best) {
        best = cur;
        bestFrom = from;
      }
    } else cur = 0;
  }
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return {
    name,
    widthTiles: +((best / n) * L).toFixed(2),
    from: [
      +(a[0] + (b[0] - a[0]) * bestFrom).toFixed(2),
      +(a[1] + (b[1] - a[1]) * bestFrom).toFixed(2),
    ],
  };
}
out.passages = [
  run('门楼西墩—院落（v=6.5，u29–31）', [29, 6.5], [31, 6.5]),
  run('门楼东墩—药田（v=6.2，u33–35）', [33, 6.2], [35, 6.2]),
  run('门洞走廊（v=6.9，u31–33.5）', [31, 6.9], [33.5, 6.9]),
  run('演武场—炉院（u=39.5，v−5.5–−3）', [39.5, -5.5], [39.5, -3]),
  run('演武场—药田（u=37.5，v0–3）', [37.5, 0], [37.5, 3]),
  run('东侧通道（v=−3.5，u40–43.6）', [40, -3.5], [43.6, -3.5]),
  run('主殿入口—院落后墙（u=28.3，v1.5–3）', [28.3, 1.5], [28.3, 3]),
  run('院落前（u=25.8，v6.8–7.6）', [25.8, 6.8], [25.8, 7.6]),
];
const h = buildCoolHall();
const bad: unknown[] = [];
for (let i = 0; i < 24; i++) {
  const p = sermonPoint(h, i) as P;
  if (!w.walkable(p)) bad.push({ i: i + 1, uv: UV(p) });
}
out.sermonNotWalkable = bad;
out.lineupNotWalkable = h.lineup
  .filter((p) => !w.walkable(p as P))
  .map((p) => UV(p as P));
console.log(JSON.stringify(out, null, 1));
