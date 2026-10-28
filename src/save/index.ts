import { z } from 'zod';
import { createStore, get, setMany } from 'idb-keyval';
import { parseJson, validate } from '../sim/data';
import { worldSchema, type World } from '../sim/world';
export const VERSION = 2;
export const saveSchema = z.object({
  version: z.literal(VERSION),
  lastSeen: z.number().nonnegative(),
  world: worldSchema,
});
export type Save = z.infer<typeof saveSchema>;
export const migrations: Record<
  number,
  (value: Record<string, unknown>) => unknown
> = { 1: (value) => ({ ...value, version: 2, lastSeen: value.lastSeen ?? 0 }) };
export function migrate(value: unknown): Save {
  if (!value || typeof value !== 'object') throw new Error('存档：必须是对象');
  let raw = value as Record<string, unknown>;
  if (raw.version === 1) raw = migrations[1](raw) as Record<string, unknown>;
  return validate(saveSchema, raw, '存档');
}
export interface Storage {
  read(key: string): Promise<unknown>;
  write(entries: [string, unknown][]): Promise<void>;
}
export class IndexedStorage implements Storage {
  private store = createStore('xianfu', 'saves');
  read(key: string) {
    return get(key, this.store);
  }
  write(entries: [string, unknown][]) {
    return setMany(entries, this.store);
  }
}
export class MemoryStorage implements Storage {
  values = new Map<string, unknown>();
  async read(key: string) {
    return structuredClone(this.values.get(key));
  }
  async write(entries: [string, unknown][]) {
    for (const [key, value] of entries)
      this.values.set(key, structuredClone(value));
  }
}
export const MAIN = 'main',
  BACKUP = 'backup';
export function snapshot(world: World, lastSeen: number): Save {
  return validate(
    saveSchema,
    { version: VERSION, world: structuredClone(world), lastSeen },
    '存档',
  );
}
export class SaveManager {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(readonly storage: Storage) {}
  async load(): Promise<{ save: Save | null; recovered: boolean }> {
    const main = await this.storage.read(MAIN);
    if (main !== undefined) {
      try {
        return { save: migrate(main), recovered: false };
      } catch {
        const backup = await this.storage.read(BACKUP);
        if (backup !== undefined)
          return { save: migrate(backup), recovered: true };
        throw new Error('主存档损坏，且没有可用备份。请导入已导出的存档。');
      }
    }
    return { save: null, recovered: false };
  }
  write(save: Save, backupOverride?: Save): Promise<void> {
    const checked = migrate(structuredClone(save));
    const operation = this.pending
      .catch(() => {})
      .then(async () => {
        const old = backupOverride ?? (await this.storage.read(MAIN));
        const entries: [string, unknown][] = [];
        if (old !== undefined) {
          try {
            entries.push([BACKUP, migrate(old)]);
          } catch {
            /* 损坏的主档不得覆盖健康备份。 */
          }
        }
        entries.push([MAIN, checked]);
        await this.storage.write(entries);
      });
    this.pending = operation;
    return operation;
  }
  async import(text: string, current: Save): Promise<Save> {
    const candidate = migrate(parseJson(text, '导入存档'));
    await this.write(candidate, current);
    return candidate;
  }
}
export async function encodeText(save: Save): Promise<string> {
  if (typeof CompressionStream === 'undefined')
    throw new Error('此浏览器不支持压缩，请下载 JSON 存档');
  const stream = new Blob([JSON.stringify(save)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return 'XF2:' + btoa(binary);
}
export async function decodeText(text: string): Promise<string> {
  const input = text.trim();
  if (!input.startsWith('XF2:')) return input;
  try {
    const bytes = Uint8Array.from(atob(input.slice(4)), (c) => c.charCodeAt(0));
    return await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).text();
  } catch {
    throw new Error('导入存档：压缩文本损坏或浏览器不支持解压');
  }
}
