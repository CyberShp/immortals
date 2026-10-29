import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from 'pixi.js';
import type { World } from '../sim/world';
import { buildingDefinitions } from '../sim/catalog';
import {
  behaviorPose,
  discipleSlot,
  nameBox,
  locationRegion,
  buildingLabelPosition,
  buildingArt,
  plotFoot,
  plots,
} from './layout';
import manifest from '../../public/assets/manifest.json';

type Motion = {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
  facing: number;
  row: number;
};
declare global {
  interface Window {
    __mapReady: boolean;
    __mapStats: {
      baseLoaded: boolean;
      buildingSprites: number;
      discipleSprites: number;
      fallbacks: number;
      poses: Record<string, number>;
      disciples: { x: number; y: number }[];
    };
  }
}
export async function createMap(host: HTMLElement) {
  window.__mapReady = false;
  const app = new Application();
  await app.init({
    width: 640,
    height: 360,
    resolution: Math.max(2, devicePixelRatio || 1),
    autoDensity: true,
    background: 0xe3e8d8,
    antialias: true,
    autoStart: false,
  });
  app.stop();
  host.appendChild(app.canvas);
  app.canvas.setAttribute('aria-label', '宗门山地图');
  const requestedHeight = Number(
    new URLSearchParams(location.search).get('discipleHeight'),
  );
  const height = requestedHeight
    ? Math.min(96, Math.max(16, requestedHeight))
    : 48;
  const textures = new Map<string, Texture>();
  const entries = new Map(manifest.files.map((f) => [f.file, f]));
  let warned = false;
  const needed = manifest.files.filter(
    (f) =>
      f.file === 'map/base@2x.webp' ||
      f.file.includes('-map@') ||
      f.file.includes('-96@'),
  );
  Assets.setPreferences({ preferWorkers: false });
  await Promise.all(
    needed.map(async ({ file }) => {
      try {
        textures.set(
          file,
          await Assets.load<Texture>({
            src: import.meta.env.BASE_URL + 'assets/' + file,
            // @2x filenames otherwise make Pixi halve texture dimensions too.
            data: { resolution: 1 },
          }),
        );
      } catch {
        if (!warned) {
          console.warn('部分地图素材不可用，已启用简化绘制。');
          warned = true;
        }
      }
    }),
  );
  const scene = new Container();
  scene.sortableChildren = true;
  app.stage.addChild(scene);
  const motions = new Map<string, Motion>();
  let frame = 0;
  let world: World | undefined;
  let paused = false;
  const label = (text: string, size = 9, white = false) =>
    new Text({
      text,
      style: {
        fontSize: size,
        fill: white ? 0xffffff : 0x263f34,
        fontFamily: 'serif',
        ...(white ? { stroke: { color: 0x263f34, width: 2 } } : {}),
      },
    });
  function art(file: string, scale: number) {
    const texture = textures.get(file),
      entry = entries.get(file);
    if (!texture || !entry) return;
    const sprite = new Sprite(texture);
    sprite.anchor.set(
      entry.anchor.x / entry.size[0],
      entry.anchor.y / entry.size[1],
    );
    sprite.scale.set(scale);
    return sprite;
  }
  function paint(now: number) {
    if (!world) return;
    for (const child of scene.removeChildren())
      child.destroy({ children: true });
    const stats = {
      baseLoaded: textures.has('map/base@2x.webp'),
      buildingSprites: 0,
      discipleSprites: 0,
      fallbacks: 0,
      poses: {} as Record<string, number>,
      disciples: [] as { x: number; y: number }[],
    };
    const ground =
      art('map/base@2x.webp', 0.5) ??
      new Graphics()
        .ellipse(320, 200, 280, 130)
        .fill(0xd1dac3)
        .moveTo(50, 310)
        .lineTo(330, 160)
        .lineTo(490, 70)
        .stroke({ width: 14, color: 0xf5eddc });
    if (!stats.baseLoaded) stats.fallbacks++;
    ground.zIndex = -1000;
    scene.addChild(ground);
    for (const def of buildingDefinitions) {
      const p = plots[buildingArt[def.id]],
        [x, y] = plotFoot(def.id);
      const b = world.buildings.find((b) => b.id === def.id);
      const group = new Container();
      group.position.set(x, y);
      group.zIndex = y;
      if (!b) {
        group.addChild(
          new Graphics()
            .rect(
              p[0] / 2 - x,
              p[1] / 2 - y,
              (p[2] - p[0]) / 2,
              (p[3] - p[1]) / 2,
            )
            .fill({ color: 0xf5eddc, alpha: 0.25 })
            .stroke({ color: 0x8a8578, alpha: 0.5, width: 1 }),
        );
      } else {
        const tier = Math.min(b.level, def.maxLevel) >= 2 ? 2 : 1;
        const sprite = art(
          `building/${buildingArt[b.id]}-t${tier}-map@2x.webp`,
          0.5,
        );
        if (sprite) {
          sprite.alpha = b.level === 0 ? 0.45 : 1;
          group.addChild(sprite);
          stats.buildingSprites++;
        } else {
          group.addChild(
            new Graphics()
              .rect(-(p[2] - p[0]) / 4, -32, (p[2] - p[0]) / 2, 32)
              .fill(b.level === 0 ? 0xc4b596 : 0x758878)
              .poly([-30, -32, 0, -50, 30, -32])
              .fill(0x364e43),
          );
          stats.fallbacks++;
        }
      }
      const t = label(
        b
          ? `${b.name} Lv${b.level}${b.targetLevel && b.targetLevel > b.level ? ' ⚒' : ''}`
          : `${def.name}预留位`,
        11,
        true,
      );
      t.alpha = b ? 1 : 0.8;
      t.anchor.set(0.5, 0);
      t.position.set(...buildingLabelPosition(def.id));
      t.zIndex = 2000;
      scene.addChild(t);
      scene.addChild(group);
    }
    // Separate layer: even the northernmost disciple stays above every building.
    const discipleLayer = new Container();
    discipleLayer.zIndex = 2500;
    discipleLayer.sortableChildren = true;
    scene.addChild(discipleLayer);
    let active = false;
    for (const d of world.disciples) {
      const m = motions.get(d.id);
      if (!m) continue;
      const progress = paused ? 1 : Math.min(1, (now - m.start) / 1200);
      const moving = progress < 1 && (m.fromX !== m.toX || m.fromY !== m.toY);
      active ||= moving;
      m.x = m.fromX + (m.toX - m.fromX) * progress;
      m.y = m.fromY + (m.toY - m.fromY) * progress;
      if (progress === 1) {
        m.fromX = m.toX;
        m.fromY = m.toY;
      }
      const group = new Container();
      group.position.set(m.x, m.y);
      group.zIndex = m.y;
      const pose = behaviorPose(d.state.behavior, moving, now - m.start);
      stats.poses[pose] = (stats.poses[pose] ?? 0) + 1;
      stats.disciples.push({ x: m.x, y: m.y });
      const sprite = art(`disciple/${pose}-96@2x.webp`, height / 96);
      if (sprite) {
        if (pose !== 'meditate') sprite.scale.x *= m.facing;
        group.addChild(sprite);
        stats.discipleSprites++;
      } else {
        group.addChild(new Graphics().circle(0, -8, 9).fill(0x4f8a8b));
        stats.fallbacks++;
      }
      if (d.state.injuredUntil > world.tick) group.alpha = 0.55;
      const t = label(d.name.slice(0, 1), 10, true);
      t.anchor.set(0.5, 0);
      const box = nameBox(m.x, m.y, m.row, height);
      t.position.set(box.x + box.width / 2, box.y);
      t.zIndex = 3000;
      scene.addChild(t);
      discipleLayer.addChild(group);
    }
    const mini = new Container();
    mini.position.set(520, 5);
    mini.zIndex = 1000;
    mini.addChild(
      new Graphics()
        .rect(0, 0, 115, 65)
        .fill({ color: 0xf1e8d4, alpha: 0.9 })
        .stroke({ width: 1, color: 0x8a8578 }),
    );
    for (const b of world.buildings) {
      const [x, y] = plotFoot(b.id);
      mini.addChild(
        new Graphics().rect(x * 0.175, y * 0.175, 4, 3).fill(0x4a5a66),
      );
    }
    for (const m of motions.values())
      mini.addChild(
        new Graphics().circle(m.x * 0.175, m.y * 0.175, 2).fill(0x4f8a8b),
      );
    scene.addChild(mini);
    const rest = world.disciples.filter(
      (d) => d.state.behavior === '休息' && d.remainingSeasons > 0,
    ).length;
    if (rest) {
      const t = label(`Zzz ×${rest}`, 12);
      t.position.set(190, 178);
      t.zIndex = 1000;
      scene.addChild(t);
    }
    window.__mapStats = stats;
    app.render();
    window.__mapReady = true;
    if (active && !paused) frame = requestAnimationFrame(paint);
    else frame = 0;
  }
  function draw(w: World) {
    cancelAnimationFrame(frame);
    frame = 0;
    paused = document.hidden;
    world = w;
    const now = performance.now(),
      occupants = new Map<string, number>(),
      visible = new Set<string>();
    const visibleDisciples = w.disciples.filter(
      (d) =>
        d.stage !== '坐化' &&
        !d.state.awayUntil &&
        d.state.behavior !== '休息' &&
        d.state.behavior !== '历练',
    );
    const counts = new Map<ReturnType<typeof locationRegion>, number>();
    for (const d of visibleDisciples) {
      const region = locationRegion(d.state.location);
      counts.set(region, (counts.get(region) ?? 0) + 1);
    }
    for (const d of visibleDisciples) {
      visible.add(d.id);
      const region = locationRegion(d.state.location);
      const key = region.rect.join(',');
      const i = occupants.get(key) ?? 0;
      occupants.set(key, i + 1);
      const { x, y, row } = discipleSlot(region, i, counts.get(region)!);
      const m = motions.get(d.id);
      if (!m)
        motions.set(d.id, {
          x,
          y,
          fromX: x,
          fromY: y,
          toX: x,
          toY: y,
          start: now,
          facing: 1,
          row,
        });
      else if (m.toX !== x || m.toY !== y) {
        m.row = row;
        m.fromX = m.x;
        m.fromY = m.y;
        m.toX = x;
        m.toY = y;
        m.start = now;
        if (x !== m.x) m.facing = x > m.x ? 1 : -1;
      }
    }
    for (const id of motions.keys()) if (!visible.has(id)) motions.delete(id);
    paint(now);
  }
  return {
    draw,
    pause: () => {
      paused = true;
      cancelAnimationFrame(frame);
      frame = 0;
      paint(performance.now());
      app.stop();
    },
    destroy: () => {
      cancelAnimationFrame(frame);
      app.destroy(true, { children: true });
    },
  };
}
