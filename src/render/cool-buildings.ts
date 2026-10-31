// ?cool=1 B5–B9 建筑立绘（门楼/居舍院落/丹房+炉院/聚灵阵/药田）的世界放置：读 cool-buildings.json，zod 校验。
// 纯表现层：碰撞、入口、站位以 cool-world.json 为准；sim 不 import render。
import { z } from 'zod';
import raw from './cool-buildings.json';

const point = z.tuple([z.number().finite(), z.number().finite()]);
const schema = z.object({
  layers: z
    .array(
      z.object({
        id: z.string(),
        slot: z.enum(['B_GATE', 'B_DORM', 'B_ALCHEMY', 'B_MEDIT', 'B_GARDEN']),
        file: z.string().regex(/^cool\/b5b9\/[a-z-]+\.webp$/),
        size: z.tuple([
          z.number().int().positive(),
          z.number().int().positive(),
        ]),
        x: z.number().finite(),
        y: z.number().finite(),
        scale: z.number().positive(),
        layer: z.enum(['ground', 'sort']),
        sortY: z.number().finite(),
        footprintUV: z.array(point).length(4),
      }),
    )
    .min(1),
});
export type CoolBuildingLayer = z.infer<typeof schema>['layers'][number];
export const coolBuildingLayers: CoolBuildingLayer[] = schema.parse(raw).layers;
/** 地面层统一 z（与旧 grounded 地面层一致，弟子总在其上）。 */
export const COOL_GROUND_Z = -900;
export const coolBuildingZ = (l: CoolBuildingLayer) =>
  l.layer === 'ground' ? COOL_GROUND_Z : l.sortY;
export const coolBuildingsFor = (slot: string) =>
  coolBuildingLayers.filter((l) => l.slot === slot);
