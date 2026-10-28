import { describe, it, expect } from 'vitest';
import { loadData } from '../src/sim/data';
import { createWorld, step, advance } from '../src/sim/world';
import { CONFIG } from '../src/sim/config';
import { applyOffline, computeOffline } from '../src/sim/offline';
import { FixedLoop } from '../src/app/loop';
const world = () => createWorld(42, loadData());
describe('确定性模拟', () => {
  it('同种子、同操作得到相同世界', () => {
    expect(advance(world(), 180)).toEqual(advance(world(), 180));
  });
  it('逐步与批量完全等价', () => {
    const a = world(),
      b = world();
    for (let i = 0; i < 137; i++) step(a);
    expect(a).toEqual(advance(b, 137));
  });
  it('随机状态经序列化后可以接续', () => {
    const a = advance(world(), 73),
      b = JSON.parse(JSON.stringify(a));
    expect(advance(a, 87)).toEqual(advance(b, 87));
  });
  it('自然老去、被动产出、默认事件处理', () => {
    const w = world();
    w.disciples.forEach((d) => {
      d.state.behavior = '休息';
      d.needs.energy = 0;
    });
    const before = w.resources.stone;
    step(w);
    expect(w.resources.stone).toBe(before + 1);
    advance(w, 179);
    expect(w.disciples[5].stage).toBe('坐化');
    expect(w.events).toHaveLength(0);
    expect(w.resources.stone).toBeLessThanOrEqual(w.capacity.stone);
  });
  it('数据错误带文件与字段路径', () => {
    const data = loadData();
    data.disciples[0].needs.energy = 101;
    expect(() => loadData(data)).toThrow(
      /data\/initial.json.*disciples.0.needs.energy/,
    );
  });
  it('固定累加器保留余数，默认十秒一步', () => {
    let ticks = 0;
    const loop = new FixedLoop();
    loop.advance(9999, 1, () => ticks++);
    expect(ticks).toBe(0);
    loop.advance(10002, 1, () => ticks++);
    expect(ticks).toBe(2);
    expect(loop.remainder).toBe(1);
    loop.reset();
    expect(loop.remainder).toBe(0);
  });
});
describe('离线衰减与保护', () => {
  it.each([
    [10 / 60, 2],
    [1, 12],
    [8, 45],
    [24, 74],
    [168, 160],
    [192, 160],
  ])('%s 小时得到 %s 轮', (hours, rounds) => {
    expect(computeOffline(0, hours * 3600000).rounds).toBe(rounds);
  });
  it('八天截断，回拨、无效时间保护', () => {
    expect(computeOffline(0, 192 * 3600000).clamped).toBe('over7d');
    for (const value of [-1, NaN, Infinity, -Infinity])
      expect(computeOffline(0, value)).toMatchObject({
        rounds: 0,
        clamped: 'negative',
      });
    expect(computeOffline(NaN, 0).rounds).toBe(0);
  });
  it('各分段精确积分', () => {
    expect(computeOffline(0, 168 * 3600000).effectiveMs).toBe(13.4 * 3600000);
  });
  it('七天不筑基、不坐化，年龄最多八季，库房截断且汇总最多十条', () => {
    const w = world();
    const before = w.disciples.map((d) => d.ageSeasons);
    w.disciples[0].realm = { major: '炼气', layer: 3, xp: 200 };
    w.disciples[1].remainingSeasons = 1;
    const summary = applyOffline(w, 160, 123);
    expect(w.disciples[0].realm.major).toBe('炼气');
    expect(w.disciples[1].remainingSeasons).toBe(1);
    w.disciples.forEach((d, i) => {
      expect(d.ageSeasons - before[i]).toBe(8);
      expect(d.remainingSeasons).toBeGreaterThanOrEqual(1);
      expect(
        summary.breakthroughs.filter((t) => t.startsWith(d.name)).length,
      ).toBeLessThanOrEqual(2);
    });
    expect(summary.warehouseFull).toBe(true);
    expect(w.resources.stone).toBe(w.capacity.stone);
    expect(summary.hints.length).toBeLessThanOrEqual(10);
    expect(w.tick).toBe(160 * CONFIG.stepsPerRound);
  });
  it('离线种子可复现，零轮不改变随机状态', () => {
    const a = world(),
      b = world();
    expect(applyOffline(a, 74, 123456)).toEqual(applyOffline(b, 74, 123456));
    expect(a).toEqual(b);
    const rng = { ...a.rng };
    applyOffline(a, 0, 999);
    expect(a.rng).toEqual(rng);
  });
  it('拒绝非法轮数', () => {
    expect(() => applyOffline(world(), Infinity, 0)).toThrow();
    expect(() => applyOffline(world(), 161, 0)).toThrow();
  });
});
