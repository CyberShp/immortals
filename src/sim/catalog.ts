import traits from '../../data/traits.json';
import buildings from '../../data/buildings.json';
import events from '../../data/events.json';
import { traitsSchema, buildingsSchema, eventsSchema } from './schema';
import { z } from 'zod';
export function validate<T>(
  schema: z.ZodType<T>,
  value: unknown,
  path: string,
): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new Error(
      `${path}：数据无效；${r.error.issues.map((i) => `${i.path.join('.')} 字段不符合约定（${i.code === 'custom' ? i.message : '请检查类型、范围或必填字段'}）`).join('；')}`,
    );
  return r.data;
}
export const traitDefinitions = validate(
  traitsSchema,
  traits,
  'data/traits.json',
);
export const buildingDefinitions = validate(
  buildingsSchema,
  buildings,
  'data/buildings.json',
);
export const eventDefinitions = validate(
  eventsSchema,
  events,
  'data/events.json',
);
