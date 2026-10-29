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
it('pointer pan and wheel zoom preserve focal world point and block page scroll', () => {
  const { camera, fire } = setup();
  fire('pointerdown', { pointerId: 1, clientX: 330, clientY: 200 });
  fire('pointermove', { pointerId: 1, clientX: 280, clientY: 170 });
  fire('pointerup', {});
  expect(camera.get().x).toBeCloseTo(1611.111111);
  expect(camera.get().y).toBeCloseTo(966.666666);
  const before = camera.get(),
    preventDefault = vi.fn();
  fire('wheel', { clientX: 280, clientY: 170, deltaY: -500, preventDefault });
  const after = camera.get();
  expect(after.zoom).toBeCloseTo(0.6);
  expect(after.x - 50 / 0.6).toBeCloseTo(before.x - 50 / 0.45);
  expect(after.y - 30 / 0.6).toBeCloseTo(before.y - 30 / 0.45);
  expect(preventDefault).toHaveBeenCalled();
});
it('compact is panorama and restores full camera without accepting gestures', () => {
  const { camera, media, fire } = setup();
  const before = camera.get();
  media.matches = true;
  expect(camera.get()).toEqual({ zoom: 0.2, x: 1600, y: 700 });
  fire('wheel', { deltaY: -500 });
  fire('pointerdown', { pointerId: 1 });
  media.matches = false;
  expect(camera.get()).toEqual(before);
  camera.destroy();
  expect(window.__camera).toBeUndefined();
});
it('buttons adjust zoom and panorama; hooks exist only in debug', () => {
  const { camera, buttons } = setup(false);
  expect(window.__camera).toBeUndefined();
  buttons[0].onclick();
  expect(camera.get().zoom).toBeCloseTo(0.55);
  buttons[1].onclick();
  expect(camera.get().zoom).toBeCloseTo(0.45);
  buttons[2].onclick();
  expect(camera.get()).toEqual({ zoom: 0.2, x: 1600, y: 700 });
  camera.destroy();
});

it('camera recreation ignores storage and returns to the default', () => {
  const storage = { getItem: vi.fn(() => '{"zoom":2}'), setItem: vi.fn() };
  vi.stubGlobal('localStorage', storage);
  const first = setup();
  first.camera.set({ zoom: 2 });
  first.camera.destroy();
  const second = setup();
  expect(second.camera.get()).toEqual({ zoom: 0.45, x: 1500, y: 900 });
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
  second.camera.destroy();
});

it('compact minimap navigation has its own clamped close-up camera', () => {
  const { camera, media } = setup();
  const desktop = camera.get();
  media.matches = true;
  camera.set({ zoom: 0.45, x: 2600, y: 1000 });
  expect(camera.get().x).toBeCloseTo(2488.8888889);
  expect(camera.get().zoom).toBe(0.45);
  media.matches = false;
  expect(camera.get()).toEqual(desktop);
  camera.destroy();
});
