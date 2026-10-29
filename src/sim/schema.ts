import { z } from 'zod';
const scalar = z.union([z.string(), z.number().finite(), z.boolean()]);
const ops = [
  'trait',
  'root',
  'field',
  'any',
  'all',
  'xpFull',
  'resource',
  'building',
  'relation',
  'tag',
  'completed',
  'notCompleted',
  'time',
  'sameLocation',
  'population',
  'vacancy',
  'healthy',
  'returned',
  'signal',
  'alone',
] as const;
export interface Condition {
  op: (typeof ops)[number];
  who?: string;
  key?: string;
  value?: string | number | boolean;
  values?: string[];
  compare?: 'eq' | 'gte' | 'lte' | 'lt' | 'gt';
  conditions?: Condition[];
}
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z
    .object({
      op: z.enum(ops),
      who: z.string().optional(),
      key: z.string().optional(),
      value: scalar.optional(),
      values: z.array(z.string()).optional(),
      compare: z.enum(['eq', 'gte', 'lte', 'lt', 'gt']).optional(),
      conditions: z.array(conditionSchema).optional(),
    })
    .strict()
    .superRefine((c, ctx) => {
      const fail = (message: string) =>
        ctx.addIssue({ code: 'custom', message });
      if (['any', 'all'].includes(c.op) && !c.conditions?.length)
        fail('逻辑条件不能为空');
      if (['trait', 'root'].includes(c.op) && !c.values?.length)
        fail('条件取值不能为空');
      if (
        [
          'field',
          'resource',
          'building',
          'tag',
          'completed',
          'notCompleted',
          'time',
          'signal',
        ].includes(c.op) &&
        !c.key
      )
        fail('缺少条件字段 key');
      if (
        ['field', 'resource', 'building', 'relation', 'population'].includes(
          c.op,
        ) &&
        c.value === undefined
      )
        fail('缺少条件阈值 value');
      if (
        c.op === 'resource' &&
        !['stone', 'herb', 'pill', 'reputation'].includes(c.key ?? '')
      )
        fail('未知资源');
    }),
);
export const effectSchema = z
  .object({
    type: z.enum([
      'resources',
      'need',
      'xp',
      'relation',
      'flag',
      'breakthrough',
      'foundation',
      'wait',
      'coworkRelation',
      'stopAlchemy',
      'depart',
      'adventure',
      'recruit',
      'recruitLater',
      'report',
      'mediate',
      'duel',
      'tag',
      'lifespan',
      'concern',
      'remaining',
      'legacy',
      'inherit',
      'studyTogether',
      'studyApart',
      'retry',
      'treasure',
      'motivation',
      'hallDiscount',
    ]),
    key: z.string().optional(),
    value: scalar.optional(),
    target: z.string().optional(),
    values: z.record(z.string(), z.number()).optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (
      [
        'need',
        'xp',
        'relation',
        'breakthrough',
        'foundation',
        'coworkRelation',
        'stopAlchemy',
        'depart',
        'recruitLater',
        'lifespan',
        'remaining',
        'studyTogether',
        'treasure',
        'motivation',
        'hallDiscount',
      ].includes(f.type) &&
      typeof f.value !== 'number'
    )
      fail('该效果必须有数值 value');
    if (['need', 'flag', 'tag'].includes(f.type) && !f.key)
      fail('该效果缺少 key');
    if (f.type === 'need' && !['energy', 'mood', 'drive'].includes(f.key ?? ''))
      fail('未知需求字段');
    if (f.type === 'flag' && f.value === undefined) fail('标记缺少 value');
    if (f.target && !['A', 'B', 'both', 'all'].includes(f.target))
      fail('未知效果目标');
    if (
      f.type === 'resources' &&
      (!f.values ||
        Object.keys(f.values).some(
          (k) => !['stone', 'herb', 'pill', 'reputation'].includes(k),
        ))
    )
      fail('资源效果字段无效');
  });
export const costSchema = z
  .object({
    stone: z.number().nonnegative().optional(),
    herb: z.number().nonnegative().optional(),
    pill: z.number().nonnegative().optional(),
  })
  .strict();
export const optionSchema = z
  .object({
    label: z.string().min(1),
    effects: z.array(effectSchema),
    default: z.boolean(),
    cost: costSchema,
    costBalance: z
      .object({ stone: z.enum(['c3BlessStone']).optional() })
      .strict()
      .optional(),
    conditions: z.array(conditionSchema),
  })
  .strict();
const optionsSchema = z
  .array(optionSchema)
  .min(2)
  .max(3)
  .refine((o) => o.some((x) => x.default), '缺少★默认项');
const prose = (max: number) =>
  z
    .string()
    .refine(
      (s) =>
        [...s.replaceAll('{A}', '甲乙丙').replaceAll('{B}', '丁戊己')].length <=
        max,
      `代入三字姓名后不得超过${max}字`,
    );
export const eventDefinitionSchema = z
  .object({
    id: z.string().regex(/^EV_/),
    kind: z.enum([
      '修炼',
      '突破',
      '做工',
      '社交',
      '情缘',
      '争执',
      '历练',
      '机缘',
      '宗门',
    ]),
    chain: z.string(),
    step: z.number().int().nonnegative(),
    roles: z.record(
      z.string(),
      z
        .object({
          conditions: z.array(conditionSchema),
          who: z.string().optional(),
          excludeStoryCast: z.boolean().optional(),
          excludeWithPendingEvent: z.boolean().optional(),
          allowAway: z.boolean().optional(),
          allowDead: z.boolean().optional(),
          select: z.enum(['highestRelation']).optional(),
          weights: z
            .array(
              z.object({
                conditions: z.array(conditionSchema),
                value: z.number().positive(),
              }),
            )
            .optional(),
        })
        .strict(),
    ),
    trigger: z.object({
      conditions: z.array(conditionSchema),
      chance: z.number().min(0).max(1),
      cadence: z.enum(['step', 'round']),
      earliestRound: z.number().int().positive().optional(),
    }),
    hint: prose(16),
    text: prose(40),
    options: optionsSchema,
    priority: z.number().int().min(0).max(3),
    cooldown: z.number().nonnegative(),
    pity: z.number().int().nonnegative(),
    branches: z.array(
      z.object({
        conditions: z.array(conditionSchema),
        text: prose(40),
        options: optionsSchema,
      }),
    ),
  })
  .strict();
export const eventsSchema = z
  .array(eventDefinitionSchema)
  .length(20)
  .superRefine((v, c) => {
    if (new Set(v.map((x) => x.id)).size !== 20)
      c.addIssue({ code: 'custom', message: '事件编号重复' });
    for (const [chain, count] of [
      ['', 9],
      ['A', 3],
      ['B', 3],
      ['C', 3],
      ['D', 2],
    ] as const)
      if (v.filter((e) => e.chain === chain).length !== count)
        c.addIssue({
          code: 'custom',
          message: `故事线 ${chain || '通用'} 数量应为 ${count}`,
        });
  });
export const traitsSchema = z
  .array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        accessory: z.string().min(1),
        effects: z.record(z.string(), z.number().finite()),
        relations: z.record(z.string(), z.number().nonnegative()),
        exclusive: z.array(z.string()),
      })
      .strict(),
  )
  .length(10)
  .refine((v) => new Set(v.map((t) => t.id)).size === 10, '特质编号重复');
export const buildingsSchema = z
  .array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        maxLevel: z.number().int().min(1).max(2),
        capacity: z.number().int().positive(),
        cost: costSchema,
        duration: z.number().positive(),
        unlock: z.array(conditionSchema),
        output: z.record(z.string(), z.number().nonnegative()),
        slot: z.tuple([z.number(), z.number()]),
        initialLevel: z.number().int().min(0).max(1),
      })
      .strict(),
  )
  .length(5)
  .refine((v) => new Set(v.map((b) => b.id)).size === 5, '建筑编号重复');
export type EventDefinition = z.infer<typeof eventDefinitionSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type EventOption = z.infer<typeof optionSchema>;
