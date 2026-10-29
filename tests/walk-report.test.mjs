import { expect, it } from 'vitest';
import { summarizeWalk } from '../scripts/e2e-walk.mjs';
it('walk summary measures direction, distance phase and excludes reversal cancellation', () => {
  const frames = [0, 1, 2].map((i) => ({
    x: i * 10,
    y: 0,
    vx: 10,
    facing: 1,
    cycles: i / 4,
  }));
  const stats = summarizeWalk(frames);
  expect(stats.facingAgreement).toBe(1);
  expect(stats.cyclesPerPixel).toBe(0.025);
  expect(stats.phaseRatioCV).toBe(0);
  const changed = [...frames, { x: 10, y: 0, vx: -10, facing: 1, cycles: 1 }];
  expect(summarizeWalk(changed).facingAgreement).toBe(0.75);
  expect(summarizeWalk(changed).phaseSamples).toBe(2);
});
it('legacy captures report missing facing/phase as unavailable', () => {
  const stats = summarizeWalk([
    { x: 0, y: 0, vx: 10 },
    { x: 10, y: 0, vx: 10 },
  ]);
  expect(stats.facingAgreement).toBeNull();
  expect(stats.cyclesPerPixel).toBeNull();
});

it('vertical displacement advances distance phase without fabricating a horizontal facing sample', () => {
  const f = [0, 1, 2].map((i) => ({
    x: 0,
    y: -10 * i,
    vx: 0,
    vy: -10,
    facing: 1,
    cycles: i / 4,
  }));
  expect(summarizeWalk(f).phaseSamples).toBe(2);
  expect(summarizeWalk(f).cyclesPerPixel).toBe(0.025);
  expect(summarizeWalk(f).facingSamples).toBe(0);
});
it('four-direction paths reject detours and reversed labels', async () => {
  const { WALK_DIRECTIONS, straightDirection } =
    await import('../scripts/e2e-walk.mjs');
  for (const d of WALK_DIRECTIONS) {
    expect(straightDirection([d.from, d.to], d)).toBe(true);
    expect(straightDirection([d.to, d.from], d)).toBe(false);
    expect(
      straightDirection([d.from, [d.from[0] + 5, d.from[1] + 5], d.to], d),
    ).toBe(false);
  }
});

it('all four capture routes are genuinely straight and walkable in current navigation', async () => {
  const { findPath, lineClear } = await import('../src/render/world.ts');
  const { WALK_DIRECTIONS, straightDirection } =
    await import('../scripts/e2e-walk.mjs');
  for (const d of WALK_DIRECTIONS) {
    expect(lineClear(d.from, d.to)).toBe(true);
    expect(straightDirection(findPath(d.from, d.to), d)).toBe(true);
  }
});
