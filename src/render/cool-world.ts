// ?cool=1 的单石台世界几何：读取 cool-world.json（批次一起全部为世界坐标，coords=world），zod 校验后直接使用。
// 只被 world.ts / map.ts 等渲染层读取；sim 从不 import render，四组 sim 基线不受影响。
// 注意：本文件不得 import world.ts（world.ts 在模块初始化时读取这里的结果）。
import { z } from 'zod';
import raw from './cool-world.json';
import { coolEnabled } from './cool-config';
import { adaptV4, v4Active } from './world-v4';

type P = [number, number];
const point = z.tuple([z.number().finite(), z.number().finite()]);
const polygon = z.array(point).min(3);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const SIM_SLOTS = ['B_HALL', 'B_DORM', 'B_MEDIT', 'B_ALCHEMY', 'B_GARDEN'];
export const coolWorldSchema = z
  .object({
    coords: z.literal('world'),
    k: z.number().positive().max(2),
    world: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    // S1 石台未验收：地面是带标注的平面色块占位（不是美术）。
    background: z.object({
      placeholder: z.string().min(1),
      canvasColor: color,
      platformColor: color,
      platformStroke: color,
    }),
    platformVisual: polygon,
    camera: z.object({
      start: point,
      startViewWidth: z.number().positive(),
      note: z.string().optional(),
    }),
    walkable: polygon,
    obstacles: z.array(z.object({ id: z.string(), name: z.string(), polygon })),
    decor: z.array(z.object({ id: z.string(), name: z.string(), polygon })),
    zones: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(['ground', 'reserve']),
        name: z.string(),
        polygon,
      }),
    ),
    arenaSeats: z.array(point).length(6),
    slots: z
      .array(
        z.object({
          id: z.string(),
          sim: z.string(),
          concept: z.string(),
          mapping: z.string(),
          footprint: polygon,
          entrance: point,
          label: point,
        }),
      )
      .length(6),
    spots: z
      .array(
        z.object({
          id: z.string(),
          kind: z.enum(['meditate', 'social', 'sword']),
          point,
          where: z.string(),
        }),
      )
      .length(14),
    quarry: z.object({ point, note: z.string() }),
    gate: z.object({ expeditionPoint: point, note: z.string() }),
  })
  .superRefine((c, ctx) => {
    const ids = c.slots.map((s) => s.id).sort();
    if (ids.join() !== [...SIM_SLOTS, 'B_GATE'].sort().join())
      ctx.addIssue({
        code: 'custom',
        message: `slots 必须是 5 个 sim 建筑 + 山门：${ids}`,
      });
    const count = (k: string) => c.spots.filter((s) => s.kind === k).length;
    if (
      count('sword') !== 3 ||
      count('meditate') !== 3 ||
      count('social') !== 8
    )
      ctx.addIssue({
        code: 'custom',
        message: 'spots 须为 sword 3 / meditate 3 / social 8',
      });
    if (new Set(c.spots.map((s) => s.id)).size !== c.spots.length)
      ctx.addIssue({ code: 'custom', message: 'spot id 重复' });
    const all = [...c.platformVisual, ...c.walkable];
    if (
      all.some(
        ([x, y]) => x < 0 || y < 0 || x > c.world.width || y > c.world.height,
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: `石台超出世界 ${c.world.width}×${c.world.height}`,
      });
  });
export type CoolWorldConfig = z.infer<typeof coolWorldSchema>;

export function buildCoolWorld(input: unknown) {
  const c = coolWorldSchema.parse(input);
  const pt = (q: readonly number[]): P => [q[0], q[1]];
  const poly = (p: readonly (readonly number[])[]) => p.map(pt);
  const bbox = (p: P[]): [number, number, number, number] => [
    Math.min(...p.map((q) => q[0])),
    Math.min(...p.map((q) => q[1])),
    Math.max(...p.map((q) => q[0])),
    Math.max(...p.map((q) => q[1])),
  ];
  const slots = c.slots.map((slot) => {
    const footprint = poly(slot.footprint);
    const entrance = pt(slot.entrance);
    return {
      id: slot.id,
      // rect = 脚印外框；底边中点即占位框锚点。
      rect: bbox(footprint),
      front: entrance,
      entrance,
      footprint: { polygon: footprint },
      label: pt(slot.label),
      sim: slot.sim,
      concept: slot.concept,
    };
  });
  const visual = poly(c.platformVisual);
  const [x0, y0, x1, y1] = bbox(visual);
  return {
    config: c,
    scale: 1,
    width: c.world.width,
    height: c.world.height,
    background: {
      placeholder: c.background.placeholder,
      polygon: visual,
      x: x0,
      y: y0,
      width: x1 - x0,
      height: y1 - y0,
      color: Number.parseInt(c.background.canvasColor.slice(1), 16),
      platformColor: Number.parseInt(c.background.platformColor.slice(1), 16),
      platformStroke: Number.parseInt(c.background.platformStroke.slice(1), 16),
    },
    camera: {
      start: pt(c.camera.start),
      startViewWidth: c.camera.startViewWidth,
    },
    islands: [
      {
        id: 'platform',
        offset: [0, 0] as P,
        walkable: poly(c.walkable),
        obstacles: c.obstacles.map((o) => poly(o.polygon)),
      },
    ],
    bridges: [] as {
      id: string;
      points: P[];
      width: number;
      walkable: P[];
    }[],
    slots,
    spots: c.spots.map((spot) => ({
      id: spot.id,
      island: 'platform',
      kind: spot.kind,
      point: pt(spot.point),
      original: pt(spot.point),
      moved: 0,
    })),
    decor: c.decor.map((d) => ({ ...d, polygon: poly(d.polygon) })),
    obstaclesNamed: c.obstacles.map((o) => ({
      ...o,
      polygon: poly(o.polygon),
    })),
    zones: c.zones.map((z) => ({ ...z, polygon: poly(z.polygon) })),
    arenaSeats: poly(c.arenaSeats),
    quarry: pt(c.quarry.point),
    expeditionPoint: pt(c.gate.expeditionPoint),
  };
}
export type CoolWorld = ReturnType<typeof buildCoolWorld>;

/** 模块初始化时读一次地址栏；Node/测试环境没有 location 时视为关闭。 */
export const coolActive =
  v4Active ||
  (typeof location !== 'undefined' &&
    (coolEnabled(location.search ?? '') ||
      new URLSearchParams(location.search).get('world') === 'v3'));
/** 仅在 cool 打开时构建（关闭时不做任何 cool 计算）。 */
export const coolWorld: CoolWorld | null = coolActive
  ? v4Active
    ? adaptV4(buildCoolWorld(raw))
    : buildCoolWorld(raw)
  : null;
