import raw from '../../data/balance.json';
import { z } from 'zod';
import { validate } from './catalog';
// 对每个配置叶子验证类型和有限性，禁止缺字段；键来自完整的发布配置。
function shape(value: unknown): z.ZodType {
  if (typeof value === 'boolean') return z.boolean();
  if (typeof value === 'number') return z.number().finite();
  if (typeof value === 'string') return z.string().min(1);
  if (Array.isArray(value)) return z.array(shape(value[0])).min(1);
  return z
    .object(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          shape(v),
        ]),
      ),
    )
    .strict();
}
export const configSchema = shape(raw).superRefine((value, ctx) => {
  const config = value as typeof raw;
  for (const [path, n, min] of [
    [['scheduler', 'autoResolveSteps'], config.scheduler.autoResolveSteps, 1],
    [['costs', 'c3BlessStone'], config.costs.c3BlessStone, 0],
  ] as const) {
    if (!Number.isSafeInteger(n) || n < min)
      ctx.addIssue({
        code: 'custom',
        path: [...path],
        message: `必须为不小于 ${min} 的安全整数`,
      });
  }
  if (config.names.length !== 12 || new Set(config.names).size !== 12)
    ctx.addIssue({
      code: 'custom',
      path: ['names'],
      message: '姓名池必须有 12 个不同姓名',
    });
});
export const CONFIG = validate(
  configSchema,
  raw,
  'data/balance.json',
) as typeof raw;
