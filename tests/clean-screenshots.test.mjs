import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { clampCamera } from '../src/render/camera';
import { discipleDestinations, worldMap } from '../src/render/world';
import { createWorld } from '../src/sim/world';
import { loadData } from '../src/sim/data';

// Exercise the exact script helpers without importing its CLI/browser launcher.
const source = readFileSync('scripts/e2e.mjs', 'utf8');
const helpers = source
  .split('// BEGIN CLEAN SCREENSHOT HELPERS')[1]
  .split('\n')
  .slice(1)
  .join('\n')
  .split('// END CLEAN SCREENSHOT HELPERS')[0];
const {
  cleanScreenshot,
  cleanCloseupCamera,
  cleanCloseupEvidence,
  cleanOverlaySelector,
} = runInNewContext(
  `${helpers}\n({cleanScreenshot,cleanCloseupCamera,cleanCloseupEvidence,cleanOverlaySelector})`,
  { assert },
);
function pageMock({ stuck = false, reopens = false, delayed = false } = {}) {
  let overlays = 1,
    checks = 0;
  const order = [];
  const sample = { camera: { zoom: 1.5 }, stats: {} };
  const screenshot = vi.fn(async () => {
    order.push('screenshot');
    if (reopens) overlays = 1;
  });
  const page = {
    keyboard: {
      press: vi.fn(async () => {
        order.push('escape');
        if (!stuck && !delayed) overlays = 0;
      }),
    },
    waitForTimeout: vi.fn(async () => {
      order.push('wait');
      if (delayed) overlays = 0;
    }),
    evaluate: vi.fn(async () => {
      order.push('paint');
      return sample;
    }),
    screenshot,
    locator: vi.fn((selector) =>
      selector === '#close'
        ? { isVisible: async () => false }
        : selector === '#map canvas'
          ? { screenshot }
          : {
              count: async () => {
                checks++;
                order.push('overlay-check');
                return overlays;
              },
            },
    ),
  };
  return { page, screenshot, order, sample, checks: () => checks };
}
describe('Clean1 screenshot blockers', () => {
  it('closes the story modal, allows delayed close, and checks again around every capture', async () => {
    const m = pageMock({ delayed: true });
    expect(await cleanScreenshot(m.page, 'main.png')).toEqual(m.sample);
    expect(m.page.keyboard.press).toHaveBeenCalledWith('Escape');
    expect(m.page.waitForTimeout).toHaveBeenCalled();
    expect(m.order.indexOf('paint')).toBeLessThan(
      m.order.indexOf('screenshot'),
    );
    expect(m.order.at(-1)).toBe('overlay-check');
    expect(m.checks()).toBeGreaterThanOrEqual(3);
    expect(m.screenshot).toHaveBeenCalledWith({
      path: 'main.png',
      scale: 'css',
    });
    for (const selector of [
      'dialog:visible',
      '[role="dialog"]:visible',
      '[aria-modal="true"]:visible',
      '#cover:visible',
      '.overlay:visible',
    ])
      expect(cleanOverlaySelector).toContain(selector);
  });
  it('refuses to save a screenshot when any overlay survives closing', async () => {
    const m = pageMock({ stuck: true });
    await expect(cleanScreenshot(m.page, 'main.png')).rejects.toThrow(
      'visible dialog/overlay',
    );
    expect(m.screenshot).not.toHaveBeenCalled();
  });
  it('rejects an overlay reopening during capture and passes real CSS crop coordinates', async () => {
    const m = pageMock({ reopens: true }),
      clip = { x: 350, y: 220, width: 600, height: 360 };
    await expect(cleanScreenshot(m.page, 'close.png', clip)).rejects.toThrow(
      'reopened',
    );
    expect(m.screenshot).toHaveBeenCalledWith({
      path: 'close.png',
      clip,
      scale: 'css',
    });
  });
});
function closeupFixture() {
  const world = createWorld(42, loadData());
  const points = discipleDestinations(world.disciples, 0);
  const disciples = points.map(([x, y], i) => ({
    id: world.disciples[i].id,
    x,
    y,
    alpha: 1,
  }));
  const camera = clampCamera(cleanCloseupCamera(disciples), 1280, 900);
  const sample = {
    camera,
    stats: {
      poses: { meditate: disciples.length },
      disciples: disciples.map((d) => ({
        ...d,
        screenX: 640 + (d.x - camera.x) * camera.zoom,
        screenY: 450 + (d.y - camera.y) * camera.zoom,
      })),
    },
  };
  return { world, sample, canvas: { x: 10, y: 20, width: 1280, height: 900 } };
}
describe('Clean1 actual closeup framing', () => {
  it('fits current tick-zero disciples, a meditation ring and the hall entrance at 48 CSS pixels', () => {
    const { world, sample, canvas } = closeupFixture();
    const evidence = cleanCloseupEvidence(
      sample,
      canvas,
      world,
      worldMap.slots,
      32,
    );
    expect(evidence.screenHeight).toBe(48);
    expect(evidence.visible.length).toBeGreaterThanOrEqual(2);
    expect(evidence.meditating.length).toBeGreaterThan(0);
    expect(evidence.nearEntrance.length).toBeGreaterThan(0);
    expect(evidence.clip).toEqual({ x: 350, y: 290, width: 600, height: 360 });
    expect(sample.camera.zoom / 0.95).toBeGreaterThan(1.5);
  });
  it('rejects the old near-identical zoom, empty crops, clipped feet, hidden and nonmeditating subjects', () => {
    const { world, sample, canvas } = closeupFixture();
    const check = (s) =>
      cleanCloseupEvidence(s, canvas, world, worldMap.slots, 32);
    expect(() =>
      check({ ...sample, camera: { ...sample.camera, zoom: 1 } }),
    ).toThrow('~48 CSS px');
    for (const patch of [{ screenX: -100 }, { screenY: 1000 }, { alpha: 0 }]) {
      expect(() =>
        check({
          ...sample,
          stats: {
            ...sample.stats,
            disciples: sample.stats.disciples.map((d) => ({ ...d, ...patch })),
          },
        }),
      ).toThrow('two complete disciples');
    }
    expect(() =>
      check({ ...sample, stats: { ...sample.stats, poses: { meditate: 0 } } }),
    ).toThrow('seated meditation');
    expect(() => cleanCloseupEvidence(sample, canvas, world, [], 32)).toThrow(
      'near a building entrance',
    );
    expect(() => cleanCloseupCamera([{ x: 1, y: 1, alpha: 0 }])).toThrow(
      'two visible disciples',
    );
  });
});
