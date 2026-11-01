import { describe, expect, it, vi, afterAll } from 'vitest';
import { clampCamera } from '../src/render/camera';
import {
  uv,
  toUV,
  v4Walkable,
  v4Route,
  v4Layout,
  v4Layers,
  v4Fade,
  worldV4Enabled,
  v4ArenaSeats,
  v4Queue,
  V4,
} from '../src/render/world-v4';
afterAll(() => vi.unstubAllGlobals());
describe('world v4 presentation', () => {
  it('default and explicit legacy switch', () => {
    expect(worldV4Enabled('')).toBe(true);
    expect(worldV4Enabled('?world=v3')).toBe(false);
    expect(worldV4Enabled('?world=v4&cool=1')).toBe(true);
  });
  it('UV transform round trips and configurable cell height', () => {
    for (const p of [
      [30.262, 13.2],
      [49.91, -6.85],
    ]) {
      const q = toUV(uv(p[0], p[1]));
      expect(q[0]).toBeCloseTo(p[0], 9);
      expect(q[1]).toBeCloseTo(p[1], 9);
    }
    expect(uv(30, 10, 100)[1]).not.toBe(uv(30, 10)[1]);
  });
  it('clamps against full 4997 by 2320 canvas', () => {
    expect(
      clampCamera({ x: 99999, y: 99999, zoom: 1 }, 1000, 800, {
        width: 4997,
        height: 2320,
      }),
    ).toEqual({ x: 4497, y: 1920, zoom: 1 });
  });
  it('all 45 foreground pieces plus two independent covers', () => {
    expect(v4Layers.filter((l) => l.file.includes('/fg/'))).toHaveLength(45);
    const gate = v4Layers.find((l) => l.file.endsWith('/gate.webp'))!;
    for (const l of v4Layers.filter((l) => l.file.includes('end_cover')))
      expect(l.z).toBeGreaterThan(gate.z);
    expect(
      v4Layers.slice(-2).every((l) => l.file.includes('main_east_mouth_post')),
    ).toBe(true);
  });
  it('walkable gate corridor including both edges; piers and drums blocked', () => {
    for (let u = 0; u <= 10; u++)
      for (let j = 0; j <= 45; j++)
        expect(
          v4Walkable(uv(29.762 + u / 10, 7.761 + (j * (12.2 - 7.761)) / 45)),
        ).toBe(true);
    for (const p of [
      [29, 8.5],
      [31, 8.5],
      [29.427, 9.44],
      [31.097, 9.44],
    ])
      expect(v4Walkable(uv(p[0], p[1]))).toBe(false);
  });
  it('room walls and furnace circle block; door and landing remain open', () => {
    for (const p of [
      [48, -7],
      [51.31, -6.85],
      [51.8, -6.85],
    ])
      expect(v4Walkable(uv(p[0], p[1]))).toBe(false);
    for (const p of [
      [49.91, -6.85],
      [47.8, -4.3],
      [30.262, 13.2],
    ])
      expect(v4Walkable(uv(p[0], p[1]))).toBe(true);
  });
  it('preserves the unresolved B8 seats versus array footprint conflict', () => {
    for (const p of Object.values(v4Layout.b8_seats_uv))
      expect(v4Walkable(uv(p[0], p[1]))).toBe(false);
  });
  it('v4 runtime B8 seats are reachable, separated and face the disc', async () => {
    vi.stubGlobal('location', { search: '?world=v4' });
    vi.resetModules();
    const w = await import('../src/render/world');
    expect(w.coolWorld!.arenaSeats).toEqual(v4ArenaSeats.map((s) => s.point));
    const center = uv(...(v4Layout.array_disc_center as [number, number]));
    for (const s of v4ArenaSeats) {
      expect(w.walkable(s.point)).toBe(true);
      expect(
        w.findPath(w.worldMap.slots[0].entrance, s.point).length,
      ).toBeGreaterThan(1);
      const d = Math.hypot(center[0] - s.point[0], center[1] - s.point[1]);
      expect(
        (s.facing[0] * (center[0] - s.point[0])) / d +
          (s.facing[1] * (center[1] - s.point[1])) / d,
      ).toBeGreaterThanOrEqual(Math.cos((5 * Math.PI) / 180));
      for (const other of v4ArenaSeats.filter((o) => o !== s))
        expect(
          Math.hypot(other.point[0] - s.point[0], other.point[1] - s.point[1]),
        ).toBeGreaterThan(28 * V4.actorScale);
    }
  });
  it('v4 queue clears all entrance paths by a scaled body width; all 24 cushions remain walkable', async () => {
    vi.stubGlobal('location', { search: '?world=v4' });
    vi.resetModules();
    const w = await import('../src/render/world');
    const hall = w.worldMap.slots.find((s) => s.id === 'B_HALL')!.entrance;
    const sources = [
      ...w.worldMap.slots
        .filter((s) => s.id !== 'B_HALL')
        .map((s) => s.entrance),
      ...w.worldMap.spots.map((s) => s.point),
      w.coolWorld!.quarry,
      w.coolWorld!.expeditionPoint,
    ];
    const paths = sources.map((p) => w.findPath(p, hall));
    for (const p of v4Queue) {
      expect(w.walkable(p)).toBe(true);
      expect(w.channelClearance(p, paths)).toBeGreaterThan(28 * V4.actorScale);
      for (const q of v4Queue.filter((q) => q !== p))
        expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeGreaterThanOrEqual(
          28 * V4.actorScale,
        );
    }
    for (const p of [
      ...v4Layout.cushion_block.west_centers,
      ...v4Layout.cushion_block.east_centers,
    ])
      expect(w.walkable(uv(p[0], p[1]))).toBe(true);
  });
  it('v4 dorm to hall meets 15 seconds with presentation-only speed', async () => {
    vi.stubGlobal('location', { search: '?world=v4' });
    vi.resetModules();
    const w = await import('../src/render/world');
    expect(w.WALK_SPEED).toBe(48);
    expect(
      w.walkTimeSeconds(
        w.worldMap.slots.find((s) => s.id === 'B_DORM')!.entrance,
        w.worldMap.slots.find((s) => s.id === 'B_HALL')!.entrance,
      ),
    ).toBeLessThanOrEqual(15);
  });
  it('routes from main platform through both bridges and reaches fade and room door', async () => {
    vi.stubGlobal('location', { search: '?world=v4' });
    vi.resetModules();
    const w = await import('../src/render/world');
    const start = w.worldMap.slots[0].entrance;
    for (const to of [uv(47.8, -4.3), uv(49.91, -6.85), v4Fade]) {
      const path = w.findPath(start, to);
      expect(path.length).toBeGreaterThan(1);
      for (let i = 1; i < path.length; i++)
        expect(w.lineClear(path[i - 1], path[i])).toBe(true);
    }
    for (let i = 1; i < v4Route.length; i++)
      expect(w.lineClear(v4Route[i - 1], v4Route[i])).toBe(true);
  });
});
