import { intersects } from '../src/render/layout';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, createWorld } from '../src/sim/world';
import { loadData } from '../src/sim/data';
import {
  destination,
  findPath,
  alongPath,
  WALK_SPEED,
  walkable,
} from '../src/render/world';
import manifest from '../public/assets/manifest.json';

const mock = vi.hoisted(() => ({
  fail: false,
  frames: new Map<number, FrameRequestCallback>(),
  next: 0,
  now: 0,
  width: 1440,
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
    on() {
      return this;
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
    style = { lineHeight: 13, stroke: { color: 0, width: 2 } };
    constructor(public options: { text: string }) {
      super();
    }
  }
  class Application {
    stage = new Container();
    canvas = {
      getBoundingClientRect: () => ({ width: mock.width, height: 900 }),
      setAttribute: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
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
const host = {
  appendChild: vi.fn(),
  append: vi.fn(),
} as unknown as HTMLElement;
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
  scene().children.find((g) =>
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
  mock.width = 1440;
  vi.stubGlobal('window', {
    matchMedia: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  vi.stubGlobal('document', {
    hidden: false,
    createElement: () => ({
      getBoundingClientRect: () => ({ width: mock.width, height: 900 }),
      setAttribute: vi.fn(),
      append: vi.fn(),
      remove: vi.fn(),
    }),
  });
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
      resizeTo: host,
      resolution: 1,
      autoStart: false,
    });
    for (const [request] of vi.mocked(Assets.load).mock.calls)
      expect(request).toMatchObject({ data: { resolution: 1 } });
    const sprite = disciple().children[1] as Sprite;
    expect(
      sprite.scale.y *
        manifest.files.find((f) => f.file === 'disciple/meditate-96@2x.webp')!
          .size[1],
    ).toBeCloseTo(96 * 0.7);
    expect(sprite.anchor.x).toBe(40 / 80);
    expect(sprite.anchor.y).toBe(94 / 96);
    map.destroy();
  });
  it('follows the walkable path at fixed speed and cancels animation on pause', async () => {
    const map = await createMap(host),
      w = world();
    map.draw(w);
    const from = destination(w.disciples[0], w.tick);
    w.tick = 1;
    w.disciples[0].state.behavior = '做工';
    w.disciples[0].state.location = '主殿';
    const to = destination(w.disciples[0], w.tick),
      path = findPath(from, to);
    map.draw(w);
    expect(mock.frames.size).toBe(1);
    const [id, callback] = [...mock.frames][0];
    mock.frames.delete(id);
    mock.now = 600;
    callback(600);
    const expected = alongPath(path, WALK_SPEED * 0.6);
    expect(disciple().position.x).toBeCloseTo(expected[0]);
    expect(disciple().position.y).toBeCloseTo(expected[1]);
    expect(walkable(expected)).toBe(true);
    map.pause();
    expect(mock.frames.size).toBe(0);
    mock.now = 60000;
    map.draw(w);
    expect(disciple().position.x).toBeCloseTo(to[0]);
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
    expect((disciple().children[1] as Sprite).scale.y).toBe(0.25);
    const name = scene().children.find((n) => n.zIndex === 3000)!;
    expect(name).toMatchObject({
      alpha: 1,
      options: { style: { fontSize: 21 } },
    });
    for (const label of scene().children.filter((n) => n.zIndex === 2000)) {
      expect(label).toMatchObject({
        options: {
          style: {
            fontSize: 22,
            fill: 0xffffff,
            stroke: { color: 0x263f34, width: 2 },
          },
        },
      });
    }
    vi.stubGlobal('document', { hidden: true });
    const before = disciple().position.x;
    w.tick = 1;
    w.disciples[0].state.behavior = '做工';
    w.disciples[0].state.location = '主殿';
    map.draw(w);
    expect(mock.frames.size).toBe(0);
    expect(disciple().position.x).toBe(before);
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

it('exposes behavior poses at rest and walking on the next transition', async () => {
  const map = await createMap(host),
    w = createWorld(42, loadData());
  advance(w, 59);
  map.draw(w);
  expect(window.__mapStats.poses.meditate).toBeGreaterThan(0);
  expect(window.__mapStats.poses.work).toBeGreaterThan(0);
  expect(window.__mapStats.poses.talk).toBeGreaterThan(0);
  advance(w, 1);
  map.draw(w);
  expect(window.__mapStats.poses['walk-step']).toBeGreaterThan(0);
  map.destroy();
});
it('attached renderer preserves the exact simulation JSON through 200 steps', async () => {
  const map = await createMap(host),
    a = createWorld(42, loadData()),
    b = createWorld(42, loadData());
  for (let i = 0; i < 200; i++) {
    advance(a, 1);
    advance(b, 1);
    mock.now = i * 10000;
    map.draw(a);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }
  map.destroy();
}, 30000);

it.each([false, true])(
  'shares building depth layer (fallback=%s)',
  async (fail) => {
    mock.fail = fail;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = await createMap(host);
    map.draw(createWorld(42, loadData()));
    expect(scene().children.some((n) => n.zIndex === 2500)).toBe(false);
    expect(window.__mapStats.rings).toBe(6);
    expect(window.__mapStats.nameLabels).toBe(6);
    expect(window.__mapStats.minHeadVisibility).toBeGreaterThanOrEqual(0.6);
    map.destroy();
  },
);

it('compact hides building labels and shows only disciple dots and initials', async () => {
  mock.width = 480;
  window.matchMedia = (() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  const map = await createMap(host);
  map.draw(createWorld(42, loadData()));
  expect(window.__mapStats).toMatchObject({
    mode: 'compact',
    buildingLabels: 0,
    markers: 6,
    markerCssDiameter: 14,
    discipleSprites: 0,
    nameLabels: 6,
    labelOverlaps: [],
  });
  expect(scene().children.filter((n) => n.zIndex === 2000)).toHaveLength(0);
  map.destroy();
});
it.each([false, true])(
  'garden is a ground layer including fallback (%s)',
  async (fail) => {
    mock.fail = fail;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = await createMap(host),
      w = world();
    w.buildings.push({
      id: 'B_GARDEN',
      name: '药圃',
      level: 2,
      progress: 0,
      targetLevel: 0,
      builtTick: 0,
      x: 0,
      y: 0,
    });
    w.disciples[0].state.location = '药圃';
    map.draw(w);
    expect(
      scene().children.filter((n) => n.zIndex > -500 && n.zIndex < -499),
    ).toHaveLength(1);
    const garden = scene().children.find(
      (n) => n.zIndex > -500 && n.zIndex < -499,
    ) as Container;
    if (!fail) {
      expect(garden.position.x).toBeCloseTo(2616.24);
      expect(garden.position.y).toBeCloseTo(975.08);
      const glow = garden.children.find((n) => n.blendMode === 'add');
      expect(glow).toBeDefined();
      expect(glow!.alpha).toBeGreaterThanOrEqual(0.15);
      expect(glow!.alpha).toBeLessThanOrEqual(0.25);
    }
    map.destroy();
  },
);

it('new target during a walk replans from the interpolated current point without teleporting', async () => {
  const map = await createMap(host),
    w = world();
  map.draw(w);
  w.tick = 1;
  w.disciples[0].state.behavior = '做工';
  w.disciples[0].state.location = '主殿';
  map.draw(w);
  mock.now = 500;
  const [id, callback] = [...mock.frames][0];
  mock.frames.delete(id);
  callback(500);
  const before = { ...window.__mapStats.disciples[0] };
  w.disciples[0].state.location = '居舍';
  map.draw(w);
  const after = window.__mapStats.disciples[0];
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
  mock.now = 1000;
  const [next, frame] = [...mock.frames][0];
  mock.frames.delete(next);
  frame(1000);
  expect(
    Math.hypot(
      window.__mapStats.disciples[0].x - after.x,
      window.__mapStats.disciples[0].y - after.y,
    ),
  ).toBeLessThanOrEqual(WALK_SPEED * 0.5 + 1e-8);
  map.destroy();
});

for (const [search, multiplier] of [
  ['?debug=1&walkScale=8', 8],
  ['?walkScale=8', 1],
  ['?debug=1&walkScale=NaN', 1],
  ['?debug=1&walkScale=-2', 1],
] as const)
  it(`walkScale only accelerates valid debug requests: ${search}`, async () => {
    vi.stubGlobal('location', { search });
    const map = await createMap(host),
      w = world();
    map.draw(w);
    const trip = map.walkDormToHall(w.disciples[0].id);
    expect(trip.duration * multiplier).toBeCloseTo(9881.20058494918);
    mock.now = trip.duration;
    const [id, callback] = [...mock.frames][0];
    mock.frames.delete(id);
    callback(mock.now);
    const actual = window.__mapStats.disciples[0];
    expect(actual.x).toBeCloseTo(trip.to[0]);
    expect(actual.y).toBeCloseTo(trip.to[1]);
    map.destroy();
  });

it('injury keeps the disciple opaque and adds a separate dashed ring until healed', async () => {
  const map = await createMap(host),
    w = world();
  w.disciples[0].state.injuredUntil = 10;
  map.draw(w);
  expect(disciple().alpha).toBe(1);
  const injuredChildren = disciple().children.length;
  expect((disciple().children[1] as Sprite).alpha).toBe(1);
  w.disciples[0].state.injuredUntil = 0;
  map.draw(w);
  expect(disciple().alpha).toBe(1);
  expect(disciple().children.length).toBe(injuredChildren - 1);
  map.destroy();
});

it.each([0, 60, 600])(
  'tick %i opaque building labels clear every rendered head',
  async (tick) => {
    const map = await createMap(host),
      w = createWorld(42, loadData());
    advance(w, tick);
    map.draw(w);
    const heads = scene().children.flatMap((group) => {
      const sprite = (group as Container).children?.find(
        (s) =>
          s instanceof Sprite &&
          (s.texture as unknown as { src: string }).src.includes('disciple/'),
      ) as Sprite | undefined;
      if (!sprite) return [];
      const src = (sprite.texture as unknown as { src: string }).src;
      const entry = manifest.files.find((f) => src.endsWith(f.file))!;
      const scale = Math.abs(sprite.scale.y);
      return [
        {
          x:
            group.position.x -
            (sprite.scale.x > 0
              ? entry.anchor.x
              : entry.size[0] - entry.anchor.x) *
              scale,
          y: group.position.y - entry.anchor.y * scale,
          width: entry.size[0] * scale,
          height: entry.size[1] * scale * 0.35,
        },
      ];
    });
    expect(heads.length).toBeGreaterThan(0);
    const labels = scene().children.filter((n) => n.zIndex === 2000);
    expect(labels).toHaveLength(5);
    for (const label of labels) {
      const text = (label as unknown as { options: { text: string } }).options
        .text;
      const box = {
        x: label.position.x - text.length * 11,
        y: label.position.y - 2,
        width: text.length * 22 + 8,
        height: 34,
      };
      expect([1, 0.35]).toContain(label.alpha);
      if (label.alpha === 1)
        for (const head of heads) expect(intersects(box, head)).toBe(false);
    }
    map.destroy();
  },
);
