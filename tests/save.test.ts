import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  BACKUP,
  MAIN,
  IndexedStorage,
  MemoryStorage,
  SaveManager,
  snapshot,
  migrate,
  encodeText,
  decodeText,
} from '../src/save';
import { createWorld, advance } from '../src/sim/world';
import { loadData } from '../src/sim/data';
const sample = () => snapshot(createWorld(42, loadData()), 123456);
describe('存档与迁移', () => {
  it.each([
    ['内存', () => new MemoryStorage()],
    ['IndexedDB', () => new IndexedStorage()],
  ] as const)('%s 往返与写前备份', async (_name, create) => {
    const storage = create();
    const manager = new SaveManager(storage);
    const a = sample();
    await manager.write(a);
    const b = sample();
    advance(b.world, 30);
    await manager.write(b);
    expect((await manager.load()).save).toEqual(b);
    expect(await storage.read(BACKUP)).toEqual(a);
  });
  it('坏 JSON、坏字段、未来版本导入不覆盖', async () => {
    const store = new MemoryStorage(),
      manager = new SaveManager(store),
      a = sample();
    await manager.write(a);
    for (const text of [
      '{坏数据}',
      JSON.stringify({ ...a, version: 999 }),
      JSON.stringify({ ...a, world: {} }),
    ]) {
      await expect(manager.import(text, a)).rejects.toThrow();
      expect(await store.read(MAIN)).toEqual(a);
      expect(await store.read(BACKUP)).toBeUndefined();
    }
  });
  it('导入前备份当前内存进度而非旧磁盘进度', async () => {
    const store = new MemoryStorage(),
      manager = new SaveManager(store),
      current = sample(),
      incoming = sample();
    advance(current.world, 5);
    await manager.write(incoming);
    await manager.import(JSON.stringify(incoming), current);
    expect(await store.read(BACKUP)).toEqual(current);
  });
  it('版本一迁移到当前版，不篡改模拟状态', () => {
    const a = sample();
    expect(migrate({ ...a, version: 1 })).toEqual(a);
    const old = { version: 1, world: a.world };
    expect(migrate(old).lastSeen).toBe(0);
  });
  it('gzip 文本往返', async () => {
    const a = sample();
    expect(JSON.parse(await decodeText(await encodeText(a)))).toEqual(a);
    await expect(decodeText('XF2:坏文本')).rejects.toThrow('压缩文本');
  });
  it('主档损坏恢复备份，健康备份不会被损坏主档覆盖', async () => {
    const store = new MemoryStorage(),
      manager = new SaveManager(store),
      a = sample();
    await store.write([
      [MAIN, { broken: true }],
      [BACKUP, a],
    ]);
    expect(await manager.load()).toEqual({ save: a, recovered: true });
    await manager.write(a);
    expect(await store.read(BACKUP)).toEqual(a);
  });
  it('并发写入保持先后与上一份备份', async () => {
    const store = new MemoryStorage(),
      manager = new SaveManager(store),
      a = sample(),
      b = sample();
    b.lastSeen++;
    await Promise.all([manager.write(a), manager.write(b)]);
    expect(await store.read(MAIN)).toEqual(b);
    expect(await store.read(BACKUP)).toEqual(a);
  });
});

it('导入后离线结算写回仍保留导入前进度', async () => {
  const storage = new MemoryStorage(),
    manager = new SaveManager(storage);
  const before = sample(),
    incoming = sample();
  advance(before.world, 7);
  await manager.import(JSON.stringify(incoming), before);
  advance(incoming.world, 30);
  await manager.write(incoming, before);
  expect(await storage.read(BACKUP)).toEqual(before);
  expect(await storage.read(MAIN)).toEqual(incoming);
});
