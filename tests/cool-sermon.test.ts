// 08 增补 R5：大能讲道 demo 纯逻辑（蒲团排布 4.5、流程 4.4、冲突 4.6）。N13/N14/N16/N17 的单测部分。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildCoolHall, type P } from '../src/render/cool-hall';
import {
  SERMON,
  addSermonJoiner,
  cushionAlpha,
  handoffSermon,
  leaveSermon,
  sermonAxes,
  sermonMasterAction,
  sermonMasterAlpha,
  sermonPoint,
  sermonReleaseOrder,
  sermonSeat,
  sermonTick,
  startSermon,
} from '../src/render/cool-sermon';

const hall = buildCoolHall();
const d = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
const ids = (n: number) => Array.from({ length: n }, (_, i) => `D${i + 1}`);

describe('讲道蒲团排布（4.5 公式，按 hall-v2 几何重算）', () => {
  let w: typeof import('../src/render/world');
  beforeAll(async () => {
    vi.resetModules();
    vi.stubGlobal('location', { search: '?cool=1' });
    w = await import('../src/render/world');
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it('N13：24 个蒲团 = 公式、全部可走、两两 ≥28（设计 32）、离入口中轴 >28、资历 1–6 在第 1 排', () => {
    const { n, a } = sermonAxes(hall);
    expect(Math.hypot(...n)).toBeCloseTo(1, 9);
    expect(Math.abs(n[0] * a[0] + n[1] * a[1])).toBeLessThan(0.1);
    const pts = ids(24).map((_, i) => sermonPoint(hall, i));
    // 公式手算：第 1 排 1 号 = 入口 + 40n − 32a。
    const e = hall.entrance;
    expect(
      d(pts[0], [e[0] + 40 * n[0] - 32 * a[0], e[1] + 40 * n[1] - 32 * a[1]]),
    ).toBeLessThan(0.5);
    expect(
      d(pts[5], [e[0] + 40 * n[0] + 96 * a[0], e[1] + 40 * n[1] + 96 * a[1]]),
    ).toBeLessThan(0.5);
    expect(
      d(pts[23], [
        e[0] + 136 * n[0] + 96 * a[0],
        e[1] + 136 * n[1] + 96 * a[1],
      ]),
    ).toBeLessThan(0.5);
    let min = Infinity;
    for (const [i, p] of pts.entries()) {
      expect(w.walkable(p as P), `蒲团 ${i + 1}`).toBe(true);
      const rel = [p[0] - e[0], p[1] - e[1]];
      // 离入口通道中轴（过入口、沿 n 的直线）的垂距。
      expect(Math.abs(rel[0] * n[1] - rel[1] * n[0])).toBeGreaterThan(28);
      for (const q of pts.slice(i + 1)) min = Math.min(min, d(p, q));
    }
    expect(min).toBeGreaterThanOrEqual(28);
    expect(min).toBeCloseTo(32, 0);
    // 资历 1–6 在第 1 排（沿 n 的投影 ≈ 40；a 取台基边方向，与 n 不严格垂直，允许 ±5），7 号起在第 2 排（≈72）。
    const along = (p: readonly number[]) =>
      (p[0] - e[0]) * n[0] + (p[1] - e[1]) * n[1];
    for (const p of pts.slice(0, 6))
      expect(Math.abs(along(p) - 40)).toBeLessThan(5);
    for (const p of pts.slice(6, 12))
      expect(Math.abs(along(p) - 72)).toBeLessThan(5);
    console.log({ sermonCushions: pts, n, a });
  });
});

describe('讲道流程（4.4）与冲突（4.6）', () => {
  it('N14：大能/P9 开场淡入 0.8 s；到齐或 50 s 超时开讲（先拂袖）；讲满 ms 后散场，先拂袖 0.8 s', () => {
    let s = startSermon(hall, ids(9), 5000)!;
    expect(sermonMasterAlpha(s)).toBe(0);
    s = sermonTick(s, 400, false)!;
    expect(sermonMasterAlpha(s)).toBeCloseTo(0.5, 6);
    s = sermonTick(s, 400, false)!;
    expect(sermonMasterAlpha(s)).toBe(1);
    expect(sermonMasterAction(s)).toBe('stand');
    s = sermonTick(s, SERMON.gatherTimeoutMs - 800 - 1, false)!;
    expect(s.phase).toBe('gather');
    s = sermonTick(s, 1, false)!;
    expect(s.phase).toBe('lecture');
    expect(sermonMasterAction(s)).toBe('flick');
    s = sermonTick(s, SERMON.flickMs, false)!;
    expect(sermonMasterAction(s)).toBe('lecture');
    s = sermonTick(s, 5000 - SERMON.flickMs, false)!;
    expect(s.phase).toBe('disperse');
    expect(sermonMasterAction(s)).toBe('flick');
    expect(s.releasedCount).toBe(0);
    const t = startSermon(hall, ids(3));
    expect(t.durationMs).toBe(20_000);
    expect(sermonTick(t, 16, true)!.phase).toBe('lecture');
  });
  it('N16：散场后排先、同排外侧先，间隔 700 ms；蒲团在主人离开后 0.8 s 内淡出；全放完后大能淡出、结束', () => {
    let s = startSermon(hall, ids(9), 1000)!;
    s = sermonTick(s, 16, true)!;
    s = sermonTick(s, 1000, true)!;
    expect(s.phase).toBe('disperse');
    // 9 人：第 2 排 7–9 号（左内 7、右内 8、左中 9）先走：中环先于内环。
    expect(sermonReleaseOrder(s)).toEqual([
      'D9',
      'D7',
      'D8',
      'D5',
      'D6',
      'D3',
      'D4',
      'D1',
      'D2',
    ]);
    s = sermonTick(s, SERMON.flickMs, true)!;
    expect(s.releasedCount).toBe(1);
    expect(s.cushions.get('D9')!.releasedAt).toBe(s.clock);
    expect(sermonSeat(s, 'D9')).toBeUndefined();
    expect(sermonSeat(s, 'D1')).toMatchObject({
      kind: 'cushion',
      index: 0,
      inside: false,
    });
    s = sermonTick(s, 699, true)!;
    expect(s.releasedCount).toBe(1);
    s = sermonTick(s, 1, true)!;
    expect(s.releasedCount).toBe(2);
    expect(cushionAlpha(s, s.cushions.get('D9')!)).toBeCloseTo(
      1 - 700 / 800,
      6,
    );
    s = sermonTick(s, 100, true)!;
    expect(cushionAlpha(s, s.cushions.get('D9')!)).toBe(0);
    let end: typeof s | undefined = s;
    while (end && end.phase === 'disperse') end = sermonTick(end, 100, true);
    expect(end!.phase).toBe('outro');
    expect(sermonMasterAlpha(end!)).toBe(1);
    end = sermonTick(end!, 400, true);
    expect(sermonMasterAlpha(end!)).toBeCloseTo(0.5, 6);
    end = sermonTick(end!, 400, true);
    expect(end).toBeUndefined();
  });
  it('N17：新到者补下一个空蒲团、不重排；离山者空蒲团淡出不补；讲道中召集 → 交接（全员起身、大能淡出）', () => {
    const s = startSermon(hall, ids(7))!;
    const before = new Map([...s.cushions].map(([k, v]) => [k, { ...v }]));
    expect(addSermonJoiner(hall, s, 'N1')).toMatchObject({
      index: 7,
      point: sermonPoint(hall, 7),
    });
    for (const [k, v] of before) expect(s.cushions.get(k)).toEqual(v);
    leaveSermon(s, 'D2');
    expect(sermonSeat(s, 'D2')).toBeUndefined();
    expect(addSermonJoiner(hall, s, 'N2').index).toBe(8);
    sermonTick(s, 300, false);
    handoffSermon(s);
    expect(s.phase).toBe('outro');
    for (const id of s.cushions.keys())
      expect(sermonSeat(s, id)).toBeUndefined();
  });
});
