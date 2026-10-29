import { expect, it } from 'vitest';
import { discipleGroundMarks } from '../src/render/layout';

// 灵根彩环（红/金/青…）是打坐/做工时的“垫”，行走、站立、交谈帧不该出现。
it('root ring only under meditate/work poses in full mode; compact markers keep it', () => {
  for (const pose of ['meditate', 'work'])
    expect(discipleGroundMarks(pose, 57.6, false).ring).toBe(true);
  for (const pose of ['walk-step', 'walk-pass', 'talk'])
    expect(discipleGroundMarks(pose, 57.6, false).ring).toBe(false);
  for (const pose of ['walk-step', 'walk-pass', 'meditate'])
    expect(discipleGroundMarks(pose, 57.6, true).ring).toBe(true);
});

it('every full-mode pose gets a dark-brown contact shadow offset right-down like building shadows', () => {
  for (const pose of ['walk-step', 'walk-pass', 'talk', 'meditate', 'work']) {
    const s = discipleGroundMarks(pose, 57.6, false).shadow!;
    expect(s.color).toBe(0x3b2a1a);
    expect(s.x).toBeGreaterThan(0);
    expect(s.y).toBeGreaterThan(0);
    // 与建筑椭圆阴影同一套参数：中心下移约 3px、扁度 0.18。
    expect(s.y).toBeCloseTo(3, 0);
    expect(s.flatness).toBe(0.18);
    expect(s.width).toBeGreaterThan(10);
    expect(s.width).toBeLessThan(57.6 / 2);
  }
  expect(
    discipleGroundMarks('meditate', 57.6, false).shadow!.width,
  ).toBeGreaterThan(
    discipleGroundMarks('walk-pass', 57.6, false).shadow!.width,
  );
  // 随弟子身高缩放
  expect(discipleGroundMarks('walk-pass', 96, false).shadow!.width).toBeCloseTo(
    (discipleGroundMarks('walk-pass', 57.6, false).shadow!.width * 96) / 57.6,
  );
  expect(discipleGroundMarks('walk-pass', 57.6, true).shadow).toBeUndefined();
});
