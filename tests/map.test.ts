import buildingPlacements from '../docs/world-buildings.json';
import gardenGeometry from '../scripts/garden-geometry.json';
import { buildingDefinitions } from '../src/sim/catalog';
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
  worldMap,
  inFootprint,
  walkTimeSeconds,
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
    handlers = new Map<string, (...args: unknown[]) => void>();
    on(event: string, fn: (...args: unknown[]) => void) {
      this.handlers.set(event, fn);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.(...args);
      return true;
    }
    destroy() {}
  }
  class Graphics extends Container {
    cut() {
      return this;
    }
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
import { createMap, buildingLabelPosition } from '../src/render/map';
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
    const sprite = disciple().children.find(
      (n) => n instanceof Sprite,
    ) as Sprite;
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
    expect(window.__mapStats.disciples[0].x).toBeCloseTo(to[0]);
    expect(window.__mapStats.disciples[0].alpha).toBe(0);
    expect(disciple()).toBeUndefined();
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
    expect(
      (disciple().children.find((n) => n instanceof Sprite) as Sprite).scale.y,
    ).toBe(0.25);
    map.select(w.disciples[0].id);
    const name = scene().children.find((n) => n.zIndex === 3000)!;
    expect(name).toMatchObject({
      alpha: 1,
      options: { style: { fontSize: 16 } },
    });
    for (const label of scene().children.filter((n) => n.zIndex === 2000)) {
      expect(label).toMatchObject({
        options: {
          style: {
            fontSize: 16,
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

it('building plaques are always present and unselected disciple names are absent', async () => {
  const map = await createMap(host);
  const w = createWorld(42, loadData());
  map.draw(w);
  const nodes = scene().children;
  const labels = nodes.filter((n) => n.zIndex === 2000 || n.zIndex === 3000);
  expect(labels.length).toBe(5);
  expect(nodes.filter((n) => n.zIndex === 3000).length).toBe(0);
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
    expect(window.__mapStats.nameLabels).toBe(
      scene().children.filter((n) => n.zIndex === 3000 && n.alpha > 0).length,
    );
    expect(window.__mapStats.minHeadVisibility).toBeGreaterThanOrEqual(0.6);
    map.destroy();
  },
);

it('compact keeps building plaques and defaults to unnamed disciple dots', async () => {
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
    buildingLabels: 5,
    markers: 6,
    markerCssDiameter: 14,
    discipleSprites: 0,
    nameLabels: 0,
  });
  expect(scene().children.filter((n) => n.zIndex === 2000)).toHaveLength(5);
  map.destroy();
});
it.each([false, true])(
  'garden follows its foot depth including fallback (%s)',
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
      scene().children.filter(
        (n) =>
          n.zIndex === worldMap.slots.find((s) => s.id === 'B_GARDEN')!.rect[3],
      ),
    ).toHaveLength(1);
    const garden = scene().children.find(
      (n) =>
        n.zIndex === worldMap.slots.find((s) => s.id === 'B_GARDEN')!.rect[3],
    ) as Container;
    if (!fail) {
      expect(garden.position.x).toBeCloseTo(gardenGeometry.position[0]);
      expect(garden.position.y).toBeCloseTo(gardenGeometry.position[1]);
      const glow = garden.children.find((n) => n.blendMode === 'add');
      expect(glow).toBeUndefined();
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
    expect(trip.duration * multiplier).toBeCloseTo(
      walkTimeSeconds(
        worldMap.slots.find((s) => s.id === 'B_DORM')!.entrance,
        worldMap.slots.find((s) => s.id === 'B_HALL')!.entrance,
      ) * 1000,
    );
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
  expect(
    (disciple().children.find((n) => n instanceof Sprite) as Sprite).alpha,
  ).toBe(1);
  w.disciples[0].state.injuredUntil = 0;
  map.draw(w);
  expect(disciple().alpha).toBe(1);
  expect(disciple().children.length).toBe(injuredChildren - 1);
  map.destroy();
});

it.each([0, 60, 600])(
  'tick %i building plaques stay centered below art and never hide',
  async (tick) => {
    const map = await createMap(host),
      w = createWorld(42, loadData());
    advance(w, tick);
    map.draw(w);
    const plaques = scene().children.filter((n) => n.zIndex === 2000);
    expect(plaques).toHaveLength(5);
    for (const s of worldMap.slots.filter((s) => s.id !== 'B_GATE')) {
      const [x, y] = buildingLabelPosition(s.id);
      expect(x).toBe((s.rect[0] + s.rect[2]) / 2);
      const bottom =
        s.id === 'B_GARDEN'
          ? Math.max(
              ...buildingPlacements
                .filter((b) => b.file.includes('garden'))
                .map((b) => b.bottom),
            )
          : s.rect[3];
      expect(y - bottom).toBe(8);
      const label = plaques.find(
        (n) =>
          Math.abs(n.position.x - x) <= 80 &&
          n.position.y >= y &&
          n.position.y <= y + 24,
      )!;
      expect(label).toBeDefined();
      expect(label.alpha).toBe(1);
    }
    map.destroy();
  },
);
it('hover overrides selection with exactly one head label and restores it on pointer-out', async () => {
  const map = await createMap(host),
    w = createWorld(42, loadData());
  map.draw(w);
  const layer = (mock.apps.at(-1) as Application).stage
    .children[2] as Container;
  const [first, second] = layer.children;
  const baselineDisciples = structuredClone(window.__mapStats.disciples);
  const baselineVisible = window.__mapStats.visibleDisciples;
  expect(baselineVisible).toBeGreaterThanOrEqual(3);
  const assertBodiesUnchanged = () => {
    expect(window.__mapStats.disciples).toEqual(baselineDisciples);
    expect(window.__mapStats.visibleDisciples).toBe(baselineVisible);
  };
  expect(window.__mapStats.nameLabels).toBe(0);
  map.select(w.disciples[0].id);
  assertBodiesUnchanged();
  expect(window.__mapStats.namedDiscipleIds).toEqual([w.disciples[0].id]);
  second.emit('pointerover', {} as never);
  assertBodiesUnchanged();
  expect(window.__mapStats.namedDiscipleIds).toEqual([w.disciples[1].id]);
  first.emit('pointerout', {} as never); // stale out from a different overlapping hit target
  expect(window.__mapStats.namedDiscipleIds).toEqual([w.disciples[1].id]);
  expect(scene().children.filter((n) => n.zIndex === 3000)).toHaveLength(1);
  second.emit('pointerout', {} as never);
  assertBodiesUnchanged();
  expect(window.__mapStats.namedDiscipleIds).toEqual([w.disciples[0].id]);
  map.select();
  expect(window.__mapStats.nameLabels).toBe(0);
  second.emit('pointertap', { stopPropagation: () => {} } as never);
  expect(window.__mapStats.namedDiscipleIds).toEqual([w.disciples[1].id]);
  const label = scene().children.find((n) => n.zIndex === 3000)!;
  const d = window.__mapStats.disciples[1];
  expect(label.position.x).toBe(d.x);
  expect(label.position.y + 20).toBeCloseTo(d.y - 96 * 0.7 - 8);
  (mock.apps.at(-1) as Application).stage.emit('pointertap', {} as never);
  assertBodiesUnchanged();
  expect(window.__mapStats.nameLabels).toBe(0);
  map.select(w.disciples[0].id);
  assertBodiesUnchanged();
  map.reset();
  map.draw(w);
  expect(window.__mapStats.namedDiscipleIds).toEqual([]);
  map.destroy();
});

it('Clean1 actual motion controller samples 3 seeds, idle/work, interruptions and arrivals for 1200 seconds each', async () => {
  let samples = 0,
    arrivals = 0;
  for (const seed of [1, 42, 2026]) {
    const map = await createMap(host),
      w = createWorld(seed, loadData());
    map.draw(w);
    for (let frame = 0; frame < 4800; frame++) {
      mock.now += 250;
      if (frame % 40 === 0) {
        advance(w, 1);
        // Alternate normal sim with deliberate idle and shared-building entrance trips.
        if (frame % 800 < 400)
          for (const d of w.disciples) {
            d.state.behavior = frame % 800 < 200 ? '社交' : '做工';
            d.state.location =
              frame % 800 < 200 ? '空地' : frame % 1600 < 800 ? '主殿' : '药圃';
            d.state.awayUntil = 0;
          }
        map.draw(w);
      }
      for (const [id, callback] of [...mock.frames]) {
        mock.frames.delete(id);
        callback(mock.now);
      }
      for (const d of window.__mapStats.disciples) {
        expect(walkable([d.x, d.y]), `${seed}/${frame}/${d.id}`).toBe(true);
        expect(
          worldMap.slots.some((s) => inFootprint([d.x, d.y], s.footprint)),
        ).toBe(false);
        expect(d.z).toBe(d.y);
        if (d.alpha === 0) arrivals++;
        samples++;
      }
    }
    map.destroy();
    mock.frames.clear();
  }
  expect(samples).toBeGreaterThan(50000);
  expect(arrivals).toBeGreaterThan(0);
}, 60000);

it('gate motion traverses the portal with foot sorting behind and in front of the source-art foreground', async () => {
  vi.stubGlobal('location', { search: '?debug=1' });
  const map = await createMap(host),
    w = world();
  map.draw(w);
  const hooks = window as unknown as {
    __gateWalk: (id: string) => {
      from: number[];
      to: number[];
      duration: number;
    };
  };
  const trip = hooks.__gateWalk(w.disciples[0].id);
  let behind = 0,
    front = 0,
    passage = 0;
  const gateSlot = worldMap.slots.find((s) => s.id === 'B_GATE')!;
  for (let i = 0; i <= 240; i++) {
    mock.now = (trip.duration * i) / 240;
    for (const [id, cb] of [...mock.frames]) {
      mock.frames.delete(id);
      cb(mock.now);
    }
    const d = window.__mapStats.disciples[0];
    expect(walkable([d.x, d.y])).toBe(true);
    expect(inFootprint([d.x, d.y], gateSlot.footprint)).toBe(false);
    expect(d.x).toBe(1566);
    const gate = scene().children.find(
      (n) =>
        n instanceof Sprite &&
        (n.texture as unknown as { src: string }).src.includes(
          'gate-foreground',
        ),
    )!;
    expect(gate.zIndex).toBe(1190);
    expect(disciple().zIndex).toBe(d.y);
    for (const label of scene().children.filter(
      (n) => n.zIndex === 3000 && n.alpha > 0,
    )) {
      const name = (label as unknown as { options: { text: string } }).options
        .text;
      const width = Array.from(name).length * 16 + 4;
      const box = {
        x: label.position.x - width / 2,
        y: label.position.y,
        width,
        height: 20,
      };
      expect(
        intersects(box, { x: 1470, y: 1060, width: 220, height: 150 }),
      ).toBe(false);
      expect(box.y + box.height).toBeCloseTo(d.y - 96 * 0.7 - 8);
    }

    if (d.y < 1190) {
      expect(disciple().zIndex).toBeLessThan(gate.zIndex);
      behind++;
    }
    if (d.y > 1190) {
      expect(disciple().zIndex).toBeGreaterThan(gate.zIndex);
      front++;
    }
    if (d.y >= 1130 && d.y <= 1200) passage++;
  }
  expect(behind).toBeGreaterThan(0);
  expect(front).toBeGreaterThan(0);
  expect(passage).toBeGreaterThan(50);
  expect(window.__mapStats.disciples[0].y).toBe(trip.to[1]);
  map.destroy();
});

it('grounded art uses baked contact shadows; all five use ground layers without ellipses and ground anchors keep depth', async () => {
  const map = await createMap(host),
    w = createWorld(42, loadData());
  w.buildings = buildingDefinitions.map((b) => ({
    ...w.buildings[0],
    id: b.id,
    name: b.name,
    level: 1,
  }));
  map.draw(w);
  expect(scene().children.filter((n) => n.zIndex === -900)).toHaveLength(5);
  expect(
    scene().children.filter((n) => n.zIndex === -900 && n.eventMode === 'none'),
  ).toHaveLength(5);
  for (const id of ['B_HALL', 'B_DORM', 'B_MEDIT', 'B_ALCHEMY']) {
    const slot = worldMap.slots.find((s) => s.id === id)!;
    const b = window.__mapStats.buildings.find((b) => b.id === id)!;
    expect(b.z).toBe(slot.rect[3]);
  }
  expect(window.__mapStats.buildingSprites).toBe(5);
  map.destroy();
});

it('garden entrance trips across three seeds stop outside the fence and fade out', async () => {
  let samples = 0,
    hiddenAtGate = 0;
  const entrance = worldMap.slots.find((s) => s.id === 'B_GARDEN')!.entrance;
  for (const seed of [7, 42, 368]) {
    const map = await createMap(host),
      w = createWorld(seed, loadData());
    advance(w, 1);
    for (const d of w.disciples) {
      d.state.behavior = '做工';
      d.state.location = '药圃';
      d.state.awayUntil = 0;
    }
    map.draw(w);
    for (let frame = 0; frame < 1600; frame++) {
      mock.now += 250;
      for (const [id, callback] of [...mock.frames]) {
        mock.frames.delete(id);
        callback(mock.now);
      }
      for (const d of window.__mapStats.disciples) {
        expect(
          worldMap.slots.some((s) => inFootprint([d.x, d.y], s.footprint)),
        ).toBe(false);
        expect(d.z).toBe(d.y);
        if (
          d.alpha === 0 &&
          Math.hypot(d.x - entrance[0], d.y - entrance[1]) < 1
        )
          hiddenAtGate++;
        samples++;
      }
    }
    map.destroy();
    mock.frames.clear();
  }
  expect(samples).toBeGreaterThan(10000);
  expect(hiddenAtGate).toBeGreaterThan(0);
}, 60000);
