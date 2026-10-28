import { z } from 'zod';
const schema = z.object({
  bossKey: z.string().min(1).max(20),
  hideOnBlur: z.boolean(),
  sound: z.boolean(),
  title: z.string().min(1).max(40),
  speed: z.number().min(1).max(300),
});
export type Settings = z.infer<typeof schema>;
export function loadSettings(): Settings {
  let value: unknown;
  try {
    value = JSON.parse(localStorage.getItem('仙府设置') ?? 'null');
  } catch {
    /* 使用默认设置 */
  }
  const result = schema.safeParse(value);
  return result.success
    ? result.data
    : {
        bossKey: '`',
        hideOnBlur: false,
        sound: false,
        title: '模拟仙府',
        speed: 1,
      };
}
export function storeSettings(value: Settings) {
  localStorage.setItem('仙府设置', JSON.stringify(schema.parse(value)));
}
