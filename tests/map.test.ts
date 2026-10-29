import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, createWorld } from '../src/sim/world';
import { loadData } from '../src/sim/data';
import manifest from '../public/assets/manifest.json';

const mock = vi.hoisted(() => ({
  fail: false,
  frames: new Map<number, FrameRequestCallback>(),
  next: 0,
  now: 0,
  apps: [] as unknown[],
}));
vi.mock('pixi.js', () => {
  class Point {
    x = 0;
    y = 0;
    set(x: number, y = x) {
      this.x = x;
      this.y = y;
    }
  }
  class Container {
    children: Container[] = [];
    position = new Point();
    anchor = new Point();
    scale = new Point();
    zIndex = 0;
    alpha = 1;
    y = 0;
    addChild(...nodes: Container[]) {
      this.children.push(...nodes);
    }
    removeChildren() {
      return this.children.splice(0);
    }
    destroy() {}
  }
  class Graphics extends Container {
    ellipse() {
      return this;
    }
    fill() {
      return this;
    }
    moveTo() {
      return this;
    }
    lineTo() {
      return this;
    }
    stroke() {
      return this;
    }
    rect() {
      return this;
    }
    poly() {
      return this;
    }
    circle() {
      return this;
    }
  }
  class Sprite extends Container {
    constructor(public texture: { src: string }) {
      super();
    }
  }
  class Text extends Container {
    constructor(public options: { text: string }) {
      super();
    }
  }
  class Application {
    stage = new Container();
    canvas = { setAttribute: vi.fn() };
    options = {};
    constructor() {
      mock.apps.push(this);
    }
    async init(options: object) {
      this.options = options;
    }
    stop = vi.fn();
    render = vi.fn();
    destroy = vi.fn();
  }
  return {
    Application,
    Container,
    Graphics,
    Sprite,
    Text,
    Assets: {
      setPreferences: vi.fn(),
      load: vi.fn(async (options: { src: string }) => {
        if (mock.fail) throw new Error('404');
        return options;
      }),
    },
  };
});
import { Assets, Application, Sprite, Container } from 'pixi.js';
import { createMap } from '../src/render/map';
const host = { appendChild: vi.fn() } as unknown as HTMLElement;
const world = () => {
  const w = createWorld(42, loadData());
  w.disciples = w.disciples.slice(0, 1);
  Object.assign(w.disciples[0].state, {
    behavior: '修炼',
    location: '空地',
    awayUntil: 0,
  });
  return w;
};
const scene = () =>
  (mock.apps.at(-1) as Application).stage.children[0] as Container;
const disciple = () =>
  (scene().children.find((n) => n.zIndex === 2500) as Container).children.find(
    (g) =>
      (g as Container).children?.some(
        (s) =>
          s instanceof Sprite &&
          (s.texture as unknown as { src: string }).src.includes('disciple/'),
      ),
  ) as Container;
beforeEach(() => {
  mock.fail = false;
  mock.frames.clear();
  mock.apps.length = 0;
  mock.now = 0;
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { hidden: false });
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    const id = ++mock.next;
    mock.frames.set(id, fn);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => mock.frames.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => mock.now);
  vi.mocked(Assets.load).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('map orchestration without browser/GPU', () => {
  it('loads pixel-sized textures, renders sprites and stays idle at rest', async () => {
    const map = await createMap(host);
    map.draw(world());
    expect(window.__mapReady).toBe(true);
    expect(Assets.setPreferences).toHaveBeenCalledWith({
      preferWorkers: false,
    });
    expect(window.__mapStats.poses).toEqual({ meditate: 1 });
    expect(window.__mapStats).toMatchObject({
      baseLoaded: true,
      discipleSprites: 1,
      fallbacks: 0,
    });
    expect(mock.frames.size).toBe(0);
    expect(
      (mock.apps[0] as Application & { options: object }).options,
    ).toMatchObject({
      width: 640,
      height: 360,
      resolution: 2,
      autoStart: false,
    });
    for (const [request] of vi.mocked(Assets.load).mock.calls)
      expect(request).toMatchObject({ data: { resolution: 1 } });
    const sprite = disciple().children[0] as Sprite;
    expect(
      sprite.scale.y *
        manifest.files.find((f) => f.file === 'disciple/meditate-96@2x.webp')!
          .size[1],
    ).toBe(48);
    expect(sprite.anchor.x).toBe(40 / 80);
    expect(sprite.anchor.y).toBe(94 / 96);
    map.destroy();
  });
  it('interpolates movement, pauses at destination and cancels animation', async () => {
    const map = await createMap(host),
      w = world();
    map.draw(w);
    const start = disciple().position.x;
    w.disciples[0].state.location = '采石点';
    map.draw(w);
    expect(mock.frames.size).toBe(1);
    const [id, callback] = [...mock.frames][0];
    mock.frames.delete(id);
    mock.now = 600;
    callback(600);
    expect(disciple().position.x).toBe((start + 385) / 2);
    map.pause();
    expect(disciple().position.x).toBe(385);
    expect(mock.frames.size).toBe(0);
    map.draw(w);
    expect(mock.frames.size).toBe(0);
    map.destroy();
  });
  it('all image failures resolve with fallback drawing and a single warning', async () => {
    mock.fail = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = await createMap(host);
    map.draw(world());
    expect(window.__mapStats.baseLoaded).toBe(false);
    expect(window.__mapStats.fallbacks).toBeGreaterThan(0);
    expect(window.__mapStats.discipleSprites).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    map.destroy();
  });
  it('debug height changes sprite size and hidden draws schedule no animation', async () => {
    vi.stubGlobal('location', { search: '?discipleHeight=24' });
    const map = await createMap(host),
      w = world();
    map.draw(w);
    expect((disciple().children[0] as Sprite).scale.y).toBe(0.25);
    const name = scene().children.find((n) => n.zIndex === 3000)!;
    expect(name).toMatchObject({
      alpha: 1,
      options: { style: { fontSize: 10 } },
    });
    for (const label of scene().children.filter((n) => n.zIndex === 2000)) {
      expect(label).toMatchObject({
        options: {
          style: {
            fontSize: 11,
            fill: 0xffffff,
            stroke: { color: 0x263f34, width: 2 },
          },
        },
      });
    }
    vi.stubGlobal('document', { hidden: true });
    w.disciples[0].state.location = '采石点';
    map.draw(w);
    expect(mock.frames.size).toBe(0);
    expect(disciple().position.x).toBe(385);
    map.destroy();
  });
});

it('draws names above disciples and building labels above buildings', async () => {
  const map = await createMap(host);
  const w = createWorld(42, loadData());
  map.draw(w);
  const nodes = scene().children;
  const labels = nodes.filter((n) => n.zIndex === 2000 || n.zIndex === 3000);
  expect(labels.length).toBe(5 + 6);
  expect(nodes.filter((n) => n.zIndex === 3000).length).toBe(6);
  expect(window.__mapStats.poses).toEqual({ meditate: 6 });
  expect(window.__mapStats.disciples.length).toBe(6);
  map.destroy();
});

it('exposes meditation, work, socializing and walking at the art capture step', async () => {
  const map = await createMap(host);
  const w = createWorld(42, loadData());
  map.draw(w);
  advance(w, 59);
  map.draw(w);
  map.pause();
  advance(w, 1);
  map.draw(w);
  expect(window.__mapStats.poses.meditate).toBeGreaterThan(0);
  expect(window.__mapStats.poses.work).toBeGreaterThan(0);
  expect(window.__mapStats.poses.talk).toBeGreaterThan(0);
  expect(window.__mapStats.poses['walk-step']).toBeGreaterThan(0);
  map.destroy();
});

it.each([false, true])(
  'keeps disciples above buildings with foot ordering (fallback=%s)',
  async (fail) => {
    mock.fail = fail;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = await createMap(host);
    const w = createWorld(42, loadData());
    const locations = ['药圃', '采石点', '静修室', '松下', '主殿', '空地'];
    w.disciples.forEach((d, i) => {
      d.state.location = locations[i];
    });
    map.draw(w);
    const nodes = scene().children;
    const layer = nodes.find((n) => n.zIndex === 2500) as Container;
    expect(layer.sortableChildren).toBe(true);
    expect(scene().sortableChildren).toBe(true);
    expect(layer.children).toHaveLength(6);
    for (const d of layer.children) expect(d.zIndex).toBe(d.position.y);
    const buildings = nodes.filter(
      (n) =>
        n instanceof Container &&
        !(n instanceof Sprite) &&
        n.zIndex > 0 &&
        n.zIndex < 1000,
    );
    expect(buildings).toHaveLength(5);
    for (const b of buildings) {
      expect(layer.zIndex).toBeGreaterThan(b.zIndex);
      for (const label of nodes.filter((n) => n.zIndex === 2000)) {
        expect(label.zIndex).toBeGreaterThan(b.zIndex);
        expect(label.zIndex).toBeLessThan(layer.zIndex);
      }
    }
    for (const name of nodes.filter((n) => n.zIndex === 3000))
      expect(name.zIndex).toBeGreaterThan(layer.zIndex);
    map.destroy();
  },
);
