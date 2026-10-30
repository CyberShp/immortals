// ?cool=1 的单石台世界几何：读取 cool-world.json（概念图源像素），zod 校验后按 k 换算成世界坐标。
// 只被 world.ts / map.ts 等渲染层读取；sim 从不 import render，四组 sim 基线不受影响。
// 注意：本文件不得 import world.ts（world.ts 在模块初始化时读取这里的结果）。
import { z } from 'zod';
import raw from './cool-world.json';
import { coolEnabled } from './cool-config';

type P = [number, number];
const point = z.tuple([z.number().finite(), z.number().finite()]);
const polygon = z.array(point).min(3);
const SIM_SLOTS = ['B_HALL', 'B_DORM', 'B_MEDIT', 'B_ALCHEMY', 'B_GARDEN'];
export const coolWorldSchema = z
  .object({
    k: z.number().positive().max(2),
    world: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    platform: z.object({ center: point, widthAtK1: z.number().positive() }),
    background: z.object({
      file: z.string().regex(/^cool\/.+\.webp$/),
      size: point,
      placeholder: z.string(),
      canvasColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    }),
    camera: z.object({
      start: point,
      startViewWidth: z.number().positive(),
      note: z.string().optional(),
    }),
    walkable: polygon,
    obstacles: z.array(z.object({ id: z.string(), name: z.string(), polygon })),
    decor: z.array(z.object({ id: z.string(), name: z.string(), polygon })),
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
    const t = transformOf(c);
    const [w, h] = c.background.size;
    const [x0, y0] = t([0, 0]),
      [x1, y1] = t([w, h]);
    if (x0 < 0 || y0 < 0 || x1 > c.world.width || y1 > c.world.height)
      ctx.addIssue({
        code: 'custom',
        message: `石台超出世界 ${c.world.width}×${c.world.height}：[${[x0, y0, x1, y1].map(Math.round)}]（k=${c.k}）`,
      });
  });
export type CoolWorldConfig = z.infer<typeof coolWorldSchema>;

/** 源像素 → 世界坐标：概念图整幅按 k×widthAtK1 缩放，中心对齐 platform.center。 */
export function transformOf(
  c: Pick<CoolWorldConfig, 'k' | 'platform' | 'background'>,
) {
  const s = (c.k * c.platform.widthAtK1) / c.background.size[0];
  const ox = c.platform.center[0] - (c.background.size[0] * s) / 2,
    oy = c.platform.center[1] - (c.background.size[1] * s) / 2;
  return ([x, y]: readonly number[]): P => [ox + x * s, oy + y * s];
}

export function buildCoolWorld(input: unknown) {
  const c = coolWorldSchema.parse(input);
  const t = transformOf(c);
  const poly = (p: readonly (readonly number[])[]) => p.map((q) => t(q));
  const s = (c.k * c.platform.widthAtK1) / c.background.size[0];
  const bbox = (p: P[]): [number, number, number, number] => [
    Math.min(...p.map((q) => q[0])),
    Math.min(...p.map((q) => q[1])),
    Math.max(...p.map((q) => q[0])),
    Math.max(...p.map((q) => q[1])),
  ];
  const slots = c.slots.map((slot) => {
    const footprint = poly(slot.footprint);
    const entrance = t(slot.entrance);
    return {
      id: slot.id,
      // rect = 脚印外框；底边中点即占位立绘锚点与排序 y（脚印前角）。
      rect: bbox(footprint),
      front: entrance,
      entrance,
      footprint: { polygon: footprint },
      label: t(slot.label),
      sim: slot.sim,
      concept: slot.concept,
    };
  });
  const [x0, y0] = t([0, 0]);
  return {
    config: c,
    scale: s,
    width: c.world.width,
    height: c.world.height,
    background: {
      ...c.background,
      x: x0,
      y: y0,
      width: c.background.size[0] * s,
      height: c.background.size[1] * s,
      color: Number.parseInt(c.background.canvasColor.slice(1), 16),
    },
    // 初始镜头是世界坐标（不随 k 换算），默认对准石台中心。
    camera: {
      start: c.camera.start as P,
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
      point: t(spot.point),
      original: t(spot.point),
      moved: 0,
    })),
    decor: c.decor.map((d) => ({ ...d, polygon: poly(d.polygon) })),
    quarry: t(c.quarry.point),
    expeditionPoint: t(c.gate.expeditionPoint),
  };
}
export type CoolWorld = ReturnType<typeof buildCoolWorld>;

/** 模块初始化时读一次地址栏；Node/测试环境没有 location 时视为关闭。 */
export const coolActive =
  typeof location !== 'undefined' && coolEnabled(location.search ?? '');
/** 仅在 cool 打开时构建（关闭时不做任何 cool 计算）。 */
export const coolWorld: CoolWorld | null = coolActive
  ? buildCoolWorld(raw)
  : null;
