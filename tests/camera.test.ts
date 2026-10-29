import { afterEach, expect, it, vi } from 'vitest';
import { attachCamera } from '../src/render/camera';
afterEach(() => vi.unstubAllGlobals());
function setup(debug = true) {
  const media = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const buttons: { textContent: string; onclick: () => void }[] = [];
  const element = () => ({
    setAttribute: vi.fn(),
    append: (b: (typeof buttons)[number]) => buttons.push(b),
    remove: vi.fn(),
  });
  vi.stubGlobal('window', { matchMedia: () => media });
  vi.stubGlobal('location', { search: debug ? '?debug=1' : '' });
  vi.stubGlobal('document', { createElement: element });
  const events = new Map<string, (e: never) => void>();
  const canvas = {
    addEventListener: (name: string, fn: (e: never) => void) =>
      events.set(name, fn),
    removeEventListener: vi.fn(),
    setPointerCapture: vi.fn(),
    getBoundingClientRect: () => ({
      left: 10,
      top: 20,
      width: 640,
      height: 360,
    }),
  };
  const repaint = vi.fn();
  const camera = attachCamera(
    { append: vi.fn() } as unknown as HTMLElement,
    canvas as unknown as HTMLCanvasElement,
    repaint,
  );
  const fire = (name: string, e: object) =>
    events.get(name)!({ preventDefault: vi.fn(), ...e } as never);
  return { camera, media, buttons, fire, repaint };
}
it('CSS pixel pan and focal zoom, including compact gestures', () => {
  const { camera, fire } = setup();
  const initial = camera.get();
  fire('pointerdown', { pointerId: 1, clientX: 330, clientY: 200 });
  fire('pointermove', { pointerId: 1, clientX: 280, clientY: 170 });
  fire('pointerup', {});
  expect(camera.get().x).toBeCloseTo(initial.x + 50 / initial.zoom);
  const before = camera.get();
  fire('wheel', { clientX: 280, clientY: 170, deltaY: -500 });
  const after = camera.get();
  expect(after.x - 50 / after.zoom).toBeCloseTo(before.x - 50 / before.zoom);
  expect(camera.wasDragged()).toBe(true);
});
it('buttons, panorama, and debug-only hook', () => {
  const { camera, buttons } = setup(false);
  expect(window.__camera).toBeUndefined();
  const zoom = camera.get().zoom;
  buttons[0].onclick();
  expect(camera.get().zoom).toBeCloseTo(zoom + 0.1);
  buttons[1].onclick();
  expect(camera.get().zoom).toBeCloseTo(zoom);
  buttons[2].onclick();
  expect(camera.get()).toEqual({ zoom: 0.2, x: 1600, y: 700 });
  camera.destroy();
});
it('smooth follow is cancelled by drag, without persisting camera', () => {
  const storage = { getItem: vi.fn(), setItem: vi.fn() };
  vi.stubGlobal('localStorage', storage);
  const { camera, fire } = setup();
  camera.follow('d1');
  const before = camera.get();
  camera.track(1800, 900, 50);
  expect(camera.get().x).toBeGreaterThan(before.x);
  expect(camera.get().x).toBeLessThan(1800);
  fire('pointerdown', { pointerId: 1, clientX: 300, clientY: 200 });
  fire('pointermove', { pointerId: 1, clientX: 350, clientY: 200 });
  expect(camera.following()).toBeUndefined();
  expect(storage.setItem).not.toHaveBeenCalled();
  camera.destroy();
});
