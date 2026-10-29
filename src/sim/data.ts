import { z } from 'zod';
import balance from '../../data/balance.json';
import { configSchema, CONFIG } from './config';
import { buildingDefinitions } from './catalog';
import roster from '../../data/roster.json';
import { traitDefinitions, validate } from './catalog';
export { traitDefinitions, validate } from './catalog';
export const traitName = (id: string) =>
  traitDefinitions.find((t) => t.id === id)?.name ?? id;
const nat = z.number().int().nonnegative();
const bounded = z.number().min(0).max(100);
export const resourcesSchema = z.object({
  stone: z.number().nonnegative(),
  herb: z.number().nonnegative(),
  pill: z.number().nonnegative(),
  reputation: z.number().nonnegative(),
});
export const discipleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(3),
  storyLines: z.array(z.enum(['A', 'B', 'C', 'D'])).default([]),
  gender: z.enum(['男', '女']),
  ageSeasons: nat,
  lifespanSeasons: nat,
  remainingSeasons: nat,
  stage: z.enum(['少年', '青年', '壮年', '迟暮', '坐化']),
  root: z.object({
    grade: z.enum(['天灵根', '双灵根', '三灵根', '杂灵根']),
    elements: z
      .array(z.enum(['金', '木', '水', '火', '土']))
      .min(1)
      .max(5),
  }),
  realm: z.object({
    major: z.enum(['炼气', '筑基']),
    layer: z.number().int().min(1).max(3),
    xp: z.number().nonnegative(),
  }),
  traits: z
    .array(
      z
        .string()
        .refine(
          (id) => traitDefinitions.some((t) => t.id === id),
          '未知特质编号',
        ),
    )
    .min(1)
    .max(2)
    .refine(
      (ts) =>
        new Set(ts).size === ts.length &&
        ts.every(
          (t) =>
            !traitDefinitions
              .find((d) => d.id === t)
              ?.exclusive.some((x) => ts.includes(x)),
        ),
      '特质重复或互斥',
    ),
  needs: z.object({ energy: bounded, mood: bounded, drive: bounded }),
  relations: z.record(
    z.string(),
    z.object({
      value: z.number().min(-100).max(100),
      tags: z.array(z.string()),
    }),
  ),
  policy: z.enum(['均衡', '专修', '勤工']),
  state: z.object({
    behavior: z.enum(['修炼', '做工', '社交', '休息', '历练']),
    location: z.string(),
    stepsLeft: nat,
    injuredUntil: nat,
    awayUntil: nat,
  }),
  flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  look: z.object({
    body: z.string(),
    hair: z.string(),
    trim: z.string(),
    accessory: z.string(),
  }),
});
export const buildingSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().int().min(0).max(2),
  progress: z.number().nonnegative().default(0),
  targetLevel: z.number().int().min(0).max(2).default(0),
  builtTick: z.number().int().nonnegative().default(0),
  x: z.number(),
  y: z.number(),
});
export const initialSchema = z
  .object({
    resources: resourcesSchema,
    disciples: z.array(discipleSchema).min(1),
    buildings: z.array(buildingSchema),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.disciples.map((d) => d.id)).size !== v.disciples.length)
      ctx.addIssue({
        code: 'custom',
        path: ['disciples'],
        message: '弟子编号重复',
      });
  });
export const balanceSchema = z.object({
  capacity: resourcesSchema.omit({ reputation: true }),
});
export function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path}：不是有效的 JSON`);
  }
}
export function loadData(
  raw: unknown = {
    resources: CONFIG.initial,
    buildings: buildingDefinitions
      .filter((b) => b.initialLevel)
      .map((b) => ({
        id: b.id,
        name: b.name,
        level: b.initialLevel,
        x: b.slot[0],
        y: b.slot[1],
      })),
    disciples: validate(
      z.array(discipleSchema).length(6),
      roster,
      'data/roster.json',
    ),
  },
  rawBalance: unknown = balance,
) {
  return {
    ...validate(initialSchema, raw, 'data/initial.json'),
    balance: validate(
      balanceSchema,
      validate(configSchema, rawBalance, 'data/balance.json'),
      'data/balance.json',
    ),
  };
}
export type GameData = ReturnType<typeof loadData>;
export type Disciple = z.infer<typeof discipleSchema>;
export type Resources = z.infer<typeof resourcesSchema>;
