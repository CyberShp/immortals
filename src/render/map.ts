import platform from '../../scripts/platform-geometry.json';
import { groundedLayer, insideGroundedBody } from './grounded-layers';
import { discipleArtFile } from './world-scale';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from 'pixi.js';
import { DISCIPLE_HEIGHT } from './world-scale';
import { relatedEvents } from '../app/ui-model';
import type { World } from '../sim/world';
import { buildingDefinitions } from '../sim/catalog';
import {
  behaviorPose,
  compactMetrics,
  type NamePoint,
  overheadNames,
  overheadNameFontSize,
  shortName,
  rootRingColors,
  buildingArt,
} from './layout';
import { attachCamera } from './camera';
import {
  visibilityOrder,
  labelOverlaps,
  type LabelOverlap,
  type Mask,
  type Occluder,
} from './visibility';
import manifest from '../../public/assets/manifest.json';
import worldBuildings from '../../docs/world-buildings.json';
import gateArt from '../../scripts/clean-gate-art.json';
import {
  buildingLabelPosition,
  buildingLabelBox,
  layoutBuildingLabels,
} from './building-labels';
export { buildingLabelPosition } from './building-labels';
import {
  worldMap,
  inPolygon,
  walkable,
  inFootprint,
  islandOf,
  segmentDistance,
  DISCIPLE_SCALE,
  WALK_SPEED,
  routeSpeed,
  findPath,
  pathLength,
  alongPath,
  discipleDestinations,
  destinationBuilding,
  walkTimeSeconds,
  type Point,
} from './world';
function plotFoot(id: string): Point {
  const s = worldMap.slots.find((s) => s.id === id)!;
  return [(s.rect[0] + s.rect[2]) / 2, s.rect[3]];
}
// Layered translucent ellipses give a soft edge without a raster art generator.
function groundShadow(width: number, y = 3) {
  const g = new Graphics();
  for (const [size, alpha] of [
    [1, 0.06],
    [0.88, 0.08],
    [0.72, 0.09],
    [0.54, 0.08],
  ])
    g.ellipse(0, y, (width * size) / 2, (width * 0.18 * size) / 2).fill({
      color: 0x3b2a1a,
      alpha,
    });
  return g;
}

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
  path: Point[];
  duration: number;
};
declare global {
  interface Window {
    __labels?: () => {
      id: string;
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
    __mapReady: boolean;
    __mapStats: {
      mode: 'full' | 'compact';
      discipleScreenHeight: number;
      markers: number;
      markerCssDiameter: number;
      buildingLabels: number;
      labelOverlaps: LabelOverlap[];
      rings: number;
      nameLabels: number;
      namedDiscipleIds: string[];
      raisedForVisibility: number;
      minHeadVisibility: number;
      baseLoaded: boolean;
      buildingSprites: number;
      discipleSprites: number;
      fallbacks: number;
      poses: Record<string, number>;
      disciples: {
        id: string;
        x: number;
        y: number;
        z: number;
        alpha: number;
        screenX: number;
        screenY: number;
      }[];
      buildings: {
        id: string;
        z: number;
        x: number;
        y: number;
        width: number;
        height: number;
      }[];
      discipleScale: number;
      walkSpeed: number;
      dormToHallSeconds: number;
      viewport: { width: number; height: number };
      visibleDisciples: number;
    };
  }
}
export async function createMap(
  host: HTMLElement,
  callbacks: {
    card?: (id: string) => void;
    event?: (id: string) => void;
    blank?: () => void;
    frame?: () => void;
  } = {},
) {
  window.__mapReady = false;
  const params = new URLSearchParams(location.search);
  const requestedScale = Number(params.get('walkScale') ?? 1);
  const walkScale =
    params.get('debug') === '1' &&
    Number.isFinite(requestedScale) &&
    requestedScale > 0
      ? Math.min(100, requestedScale)
      : 1;
  const walkSpeed = WALK_SPEED * walkScale;
  if (params.get('debug') === '1')
    Object.assign(window, {
      __world: {
        walkable: (x: number, y: number) => walkable([x, y]),
        islandOf: (x: number, y: number) => islandOf([x, y]),
        bridges: worldMap.bridges,
        platforms: platform.joints,
        platformAt: (x: number, y: number) =>
          platform.joints
            .filter((j) => inPolygon([x, y], j.polygon as Point[]))
            .map((j) => j.id),
        slots: worldMap.slots,
        inFootprint: (x: number, y: number, id: string) =>
          inFootprint(
            [x, y],
            worldMap.slots.find((s) => s.id === id)!.footprint,
          ),
        bridgeAt: (x: number, y: number) =>
          worldMap.bridges
            .filter((b) =>
              b.points
                .slice(1)
                .some(
                  (q, i) =>
                    segmentDistance([x, y], b.points[i], q) <= b.width / 2,
                ),
            )
            .map((b) => b.id),
      },
    });
  const app = new Application();
  await app.init({
    resizeTo: host,
    resolution: devicePixelRatio || 1,
    autoDensity: true,
    background: 0xf1e8d4,
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
    : 96 * DISCIPLE_SCALE;
  const textures = new Map<string, Texture>();
  const entries = new Map(manifest.files.map((f) => [f.file, f]));
  let warned = false;
  const needed = manifest.files.filter(
    (f) => false || f.file.includes('-map@') || f.file.includes('-96@'),
  );
  const mapEntries = [
    { file: 'map/world.webp', size: [3200, 1400], anchor: { x: 0, y: 0 } },
    { file: 'map/world-mini.webp', size: [320, 140], anchor: { x: 0, y: 0 } },
    { file: gateArt.file, size: gateArt.crop.slice(2), anchor: { x: 0, y: 0 } },
  ];
  for (const entry of mapEntries)
    entries.set(entry.file, entry as (typeof manifest.files)[number]);
  Assets.setPreferences({ preferWorkers: false });
  await Promise.all(
    [...needed, ...mapEntries].map(async ({ file }) => {
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
  app.stage.eventMode = 'static';
  app.stage.hitArea = {
    contains: (x: number, y: number) => {
      const r = app.canvas.getBoundingClientRect();
      return x >= 0 && y >= 0 && x <= r.width && y <= r.height;
    },
  };
  app.stage.on('pointertap', () => {
    if (!camera.wasDragged()) {
      select();
      callbacks.blank?.();
    }
  });
  const overlay = new Container();
  app.stage.addChild(overlay);
  const hits = new Map<string, Container>();
  let selectedId: string | undefined;
  let hoveredId: string | undefined;
  function select(id?: string) {
    if (selectedId === id) return;
    selectedId = id;
    cancelFrame();
    paint(performance.now());
  }
  function hover(id?: string) {
    if (hoveredId === id) return;
    hoveredId = id;
    cancelFrame();
    paint(performance.now());
  }
  const hitLayer = new Container();
  app.stage.addChild(hitLayer);
  const mini = new Container();
  app.stage.addChild(mini);
  const masks = new Map<string, Mask>();
  for (const [file, texture] of textures) {
    if (
      !file.includes('-map@') &&
      !file.includes('-96@') &&
      file !== gateArt.file
    )
      continue;
    const entry = entries.get(file)!;
    const scale = file.startsWith('disciple/')
      ? height / 96
      : (worldBuildings.find((b) => b.file === file)?.scale ?? 1);
    const resource = texture.source?.resource;
    if (!resource) continue;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(entry.size[0] * scale);
    canvas.height = Math.round(entry.size[1] * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(
      resource as CanvasImageSource,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const split = groundedLayer(file);
    if (split)
      for (let py = 0; py < canvas.height; py++)
        for (let px = 0; px < canvas.width; px++) {
          if (
            !insideGroundedBody(
              px - entry.anchor.x * scale,
              py - entry.anchor.y * scale,
              split.points,
            )
          )
            rgba[(py * canvas.width + px) * 4 + 3] = 0;
        }
    masks.set(file, {
      width: canvas.width,
      height: canvas.height,
      anchorX: entry.anchor.x * scale,
      anchorY: entry.anchor.y * scale,
      alpha: Uint8Array.from(
        { length: canvas.width * canvas.height },
        (_, i) => rgba[i * 4 + 3],
      ),
    });
  }
  const visibilityCache = new Map<string, ReturnType<typeof visibilityOrder>>();
  const motions = new Map<string, Motion>();
  let frame = 0;
  let frameWindow: Window | null = null;
  const cancelFrame = () => {
    if (frameWindow) frameWindow.cancelAnimationFrame(frame);
    else cancelAnimationFrame(frame);
  };
  const requestFrame = (callback: FrameRequestCallback) => {
    frameWindow = host.ownerDocument?.defaultView ?? null;
    return frameWindow
      ? frameWindow.requestAnimationFrame(callback)
      : requestAnimationFrame(callback);
  };
  let world: World | undefined;
  let paused = false;
  const label = (text: string, size = 9, white = false) =>
    new Text({
      text,
      style: {
        fontSize: size,
        lineHeight: size * 1.25,
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
  const camera = attachCamera(host, app.canvas, () => {
    cancelFrame();
    paint(performance.now());
  });
  mini.eventMode = 'static';
  mini.cursor = 'pointer';
  mini.hitArea = {
    contains: (x: number, y: number) => x >= 0 && x <= 115 && y >= 0 && y <= 65,
  };
  const navigateMini = (e: import('pixi.js').FederatedPointerEvent) => {
    const p = e.getLocalPosition(mini);
    e.stopPropagation();
    camera.set({ x: p.x / (115 / 3200), y: p.y / (115 / 3200) });
  };
  mini.on('pointerdown', (e) => {
    miniDrag = true;
    navigateMini(e);
  });
  mini.on('globalpointermove', (e) => {
    if (miniDrag) navigateMini(e);
  });
  mini.on('pointerup', () => {
    miniDrag = false;
  });
  mini.on('pointerupoutside', () => {
    miniDrag = false;
  });
  let screenLabels: {
    id: string;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[] = [];
  const labelRects = () => screenLabels.map((r) => ({ ...r }));
  if (params.get('debug') === '1') window.__labels = labelRects;
  let lastPaint = 0;
  let lastTap = { id: '', at: 0 };
  let miniDrag = false;
  function paint(now: number) {
    if (!world) return;
    for (const child of scene.removeChildren())
      child.destroy({ children: true });
    for (const child of overlay.removeChildren())
      child.destroy({ children: true });
    for (const child of mini.removeChildren())
      child.destroy({ children: true });
    const followed = motions.get(camera.following() ?? '');
    if (followed)
      camera.track(followed.x, followed.y, Math.min(100, now - lastPaint));
    lastPaint = now;
    const compact = camera.compact(),
      cam = camera.get();
    const bounds = app.canvas.getBoundingClientRect();
    scene.scale.set(cam.zoom);
    scene.position.set(
      bounds.width / 2 - cam.x * cam.zoom,
      bounds.height / 2 - cam.y * cam.zoom,
    );
    const marker = {
      ...compactMetrics(bounds.width, bounds.height),
      diameter: 14,
      fontSize: 11,
      scale: 1,
    };
    const occluders: Occluder[] = [];
    const labels: {
      id: string;
      box: ReturnType<typeof buildingLabelBox>;
      text: Text;
    }[] = [];

    const stats = {
      mode: compact ? ('compact' as const) : ('full' as const),
      discipleScreenHeight: compact ? 0 : height * cam.zoom,
      markers: 0,
      markerCssDiameter: compact ? marker.diameter * marker.scale : 0,
      buildingLabels: 0,
      labelOverlaps: [] as LabelOverlap[],
      rings: 0,
      nameLabels: 0,
      namedDiscipleIds: [] as string[],
      raisedForVisibility: 0,
      minHeadVisibility: 1,
      baseLoaded: textures.has('map/world.webp'),
      buildingSprites: 0,
      discipleSprites: 0,
      fallbacks: 0,
      poses: {} as Record<string, number>,
      disciples: [] as Window['__mapStats']['disciples'],
      buildings: [] as Window['__mapStats']['buildings'],
      discipleScale: DISCIPLE_SCALE,
      walkSpeed,
      dormToHallSeconds: walkTimeSeconds(
        worldMap.slots.find((s) => s.id === 'B_DORM')!.front,
        worldMap.slots.find((s) => s.id === 'B_HALL')!.front,
      ),
      viewport: { width: bounds.width, height: bounds.height },
      visibleDisciples: 0,
    };
    const ground =
      art('map/world.webp', 1) ??
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
    // Round platforms are baked below bridges in world.webp.
    const gate = art(gateArt.file, 1);
    if (gate) {
      gate.position.set(gateArt.crop[0], gateArt.crop[1]);
      gate.zIndex = gateArt.footY;
      scene.addChild(gate);
      const mask = masks.get(gateArt.file);
      if (mask)
        occluders.push({
          key: 'B_GATE',
          mask,
          x: gateArt.crop[0],
          y: gateArt.crop[1],
          z: gateArt.footY,
        });
      stats.buildings.push({
        id: 'B_GATE',
        z: gate.zIndex,
        x: bounds.width / 2 + (gateArt.crop[0] - cam.x) * cam.zoom,
        y: bounds.height / 2 + (gateArt.crop[1] - cam.y) * cam.zoom,
        width: gateArt.crop[2] * cam.zoom,
        height: gateArt.crop[3] * cam.zoom,
      });
    }

    let breathingGlow = false;
    for (const def of buildingDefinitions) {
      const p = worldMap.slots.find((s) => s.id === def.id)!.rect,
        [x, baseY] = plotFoot(def.id);
      let drawX = x,
        y = baseY;
      const b = world.buildings.find((b) => b.id === def.id);
      const group = new Container();
      group.position.set(x, y);
      group.zIndex = baseY;
      // Empty sites keep their label/click target, without painting fictional stone plots.
      if (b) {
        const tier =
          (def.id === 'B_GARDEN' ? b.level : Math.min(b.level, def.maxLevel)) >=
          2
            ? 2
            : 1;
        const file = `building/${buildingArt[b.id]}-t${tier}-map@2x.webp`;
        const placement = worldBuildings.find((b) => b.file === file);
        drawX = placement?.x ?? x;
        y = placement?.y ?? baseY;
        group.position.set(drawX, y);
        group.zIndex = baseY;
        const sprite = art(
          file,
          worldBuildings.find((b) => b.file === file)?.scale ?? 1,
        );
        const mask = masks.get(file);
        if (mask)
          occluders.push({
            key: def.id,
            mask,
            x: drawX,
            y,
            z: baseY,
          });
        if (sprite) {
          if (!('grounded' in entries.get(file)!)) {
            const shadow = groundShadow(
              (placement?.bodyWidth ?? p[2] - p[0]) * 1.05,
            );
            shadow.position.set(drawX, baseY);
            shadow.zIndex = -900;
            scene.addChild(shadow);
          }
          const entry = entries.get(file)!;
          const scale = placement?.scale ?? 1;
          const sb = {
            x: -entry.anchor.x * scale,
            y: -entry.anchor.y * scale,
            width: entry.size[0] * scale,
            height: entry.size[1] * scale,
          };
          stats.buildings.push({
            id: def.id,
            z: group.zIndex,
            x: bounds.width / 2 + (drawX + sb.x - cam.x) * cam.zoom,
            y: bounds.height / 2 + (y + sb.y - cam.y) * cam.zoom,
            width: sb.width * cam.zoom,
            height: sb.height * cam.zoom,
          });
          sprite.alpha = b.level === 0 ? 0.45 : 1;
          const split = groundedLayer(file);
          if (split) {
            const bodyMask = new Graphics()
              .poly(split.points.flat())
              .fill(0xffffff);
            group.addChild(bodyMask);
            sprite.mask = bodyMask;
            const groundGroup = new Container();
            groundGroup.position.set(drawX, y);
            groundGroup.zIndex = -900;
            groundGroup.eventMode = 'none';
            const groundSprite = art(file, scale)!;
            groundSprite.alpha = sprite.alpha;
            const groundMask = new Graphics()
              .rect(sb.x, sb.y, sb.width, sb.height)
              .fill(0xffffff)
              .poly(split.points.flat())
              .cut();
            groundGroup.addChild(groundSprite, groundMask);
            groundSprite.mask = groundMask;
            scene.addChild(groundGroup);
          }
          group.addChild(sprite);
          if (def.id === 'B_GARDEN' && tier === 2 && !split) {
            const glow = art(file, placement?.scale ?? 1);
            if (glow) {
              breathingGlow = true;
              glow.blendMode = 'add';
              glow.alpha = 0.2 + 0.05 * Math.sin((now * Math.PI) / 2500);
              group.addChild(glow);
            }
          }
          stats.buildingSprites++;
        } else {
          group.addChild(
            new Graphics()
              .rect(-(p[2] - p[0]) / 4, -32, p[2] - p[0], 32)
              .fill(b.level === 0 ? 0xc4b596 : 0x758878)
              .poly([-30, -32, 0, -50, 30, -32])
              .fill(0x364e43),
          );
          stats.fallbacks++;
        }
      }
      {
        const text = b
          ? `${b.name} Lv${b.level}${b.targetLevel && b.targetLevel > b.level ? ' ⚒' : ''}`
          : `${def.name}预留位`;
        const t = label(text, 16, true);
        const box = buildingLabelBox(def.id, text);
        // Fit real font/stroke metrics into the ground-safe plaque rectangle.
        // Uniform scaling preserves glyph proportions across platform fonts.
        t.style.lineHeight = 18;
        t.scale.set(
          Math.min(
            1,
            box.width / (t.width || box.width),
            box.height / (t.height || box.height),
          ),
        );
        labels.push({ id: def.id, box, text: t });
        stats.buildingLabels++;
        t.alpha = 1;
        t.anchor.set(0.5, 0);
        t.position.set(...buildingLabelPosition(def.id));
        t.zIndex = 2000;
        scene.addChild(t);
      }
      scene.addChild(group);
    }
    const placedLabels = layoutBuildingLabels(labels);
    for (const placed of placedLabels) {
      const label = labels.find((l) => l.id === placed.id)!;
      label.text.position.x += placed.box.x - label.box.x;
      label.text.position.y += placed.box.y - label.box.y;
      label.box = placed.box;
    }
    if (params.get('debug') === '1')
      Object.assign(window, {
        __gateWalk: (id: string) => {
          const m = motions.get(id);
          if (!m) throw Error('Gate walker absent');
          const from: Point = [1566, 1090],
            to: Point = [1566, 1230];
          const path = findPath(from, to);
          if (!path.length) throw Error('Gate passage unreachable');
          Object.assign(m, {
            x: from[0],
            y: from[1],
            toX: to[0],
            toY: to[1],
            path,
            start: performance.now(),
            duration:
              (pathLength(path) / (routeSpeed(path) * walkScale)) * 1000,
          });
          cancelFrame();
          frame = requestFrame(paint);
          return { from, to, duration: m.duration };
        },
        __worldMotions: () =>
          [...motions.entries()].map(([id, m]) => ({
            id,
            x: m.x,
            y: m.y,
            toX: m.toX,
            toY: m.toY,
          })),
      });
    const namePoints: (NamePoint & { id: string })[] = [];
    let active = false;
    for (const d of world.disciples) {
      const m = motions.get(d.id);
      if (!m) continue;
      const elapsed = Math.max(0, now - m.start);
      const moving = elapsed < m.duration;
      active ||= moving;
      const positionOnPath = alongPath(
        m.path,
        (elapsed / 1000) * routeSpeed(m.path) * walkScale,
      );
      if (positionOnPath[0] !== m.x)
        m.facing = positionOnPath[0] > m.x ? 1 : -1;
      [m.x, m.y] = positionOnPath;
      const group = new Container();
      const position = m;
      group.position.set(position.x, position.y);
      group.zIndex = m.y;
      const pose = behaviorPose(
        d.state.behavior,
        moving,
        (((now - m.start) * routeSpeed(m.path)) / WALK_SPEED) * walkScale,
      );
      stats.poses[pose] = (stats.poses[pose] ?? 0) + 1;
      const entering =
        world.tick > 0 &&
        destinationBuilding(d) &&
        worldMap.slots.some(
          (s) =>
            s.id === destinationBuilding(d) &&
            Math.hypot(m.toX - s.entrance[0], m.toY - s.entrance[1]) < 0.1,
        );
      const alpha =
        entering && !moving ? Math.max(0, 1 - (elapsed - m.duration) / 350) : 1;
      active ||= !!entering && !moving && alpha > 0;
      stats.disciples.push({
        id: d.id,
        x: m.x,
        y: m.y,
        z: group.zIndex,
        alpha,
        screenX: bounds.width / 2 + (m.x - cam.x) * cam.zoom,
        screenY: bounds.height / 2 + (m.y - cam.y) * cam.zoom,
      });
      if (alpha === 0) continue;
      if (
        Math.abs(m.x - cam.x) * cam.zoom <= bounds.width / 2 &&
        Math.abs(m.y - cam.y) * cam.zoom <= bounds.height / 2
      )
        stats.visibleDisciples++;
      let hit = hits.get(d.id);
      if (!hit) {
        hit = new Container();
        hits.set(d.id, hit);
        hitLayer.addChild(hit);
        hit.eventMode = 'static';
        hit.cursor = 'pointer';
        hit.on('pointerover', () => hover(d.id));
        hit.on('pointerout', () => {
          if (hoveredId === d.id) hover();
        });
        hit.on('pointertap', (e) => {
          e.stopPropagation();
          if (camera.wasDragged()) return;
          select(d.id);
          const time = performance.now();
          if (lastTap.id === d.id && time - lastTap.at < 350)
            camera.follow(d.id);
          else callbacks.card?.(d.id);
          lastTap = { id: d.id, at: time };
        });
      }
      hit.position.set(
        bounds.width / 2 + (m.x - cam.x) * cam.zoom,
        bounds.height / 2 + (m.y - cam.y) * cam.zoom,
      );
      const hitHeight = compact ? 14 : height * cam.zoom;
      hit.hitArea = {
        contains: (x: number, y: number) =>
          Math.abs(x) <= Math.max(22, (height * cam.zoom) / 2) &&
          y >= -hitHeight - 6 &&
          y <= 12,
      };
      const colors = rootRingColors(d.root.elements);
      if (!compact)
        group.addChild(groundShadow(pose === 'meditate' ? 26 : 18, 2));
      const ring = new Graphics();
      ring.alpha = compact ? 1 : 0.6;
      colors.forEach((color, i) => {
        const start = (i * Math.PI * 2) / colors.length,
          end = ((i + 1) * Math.PI * 2) / colors.length;
        const points = [0, 0];
        for (let j = 0; j <= 24; j++) {
          const angle = start + ((end - start) * j) / 24;
          points.push(
            Math.cos(angle) * (compact ? marker.diameter / 2 / cam.zoom : 11),
            Math.sin(angle) * (compact ? marker.diameter / 2 / cam.zoom : 3.5),
          );
        }
        ring.poly(points).fill(color);
      });
      ring
        .ellipse(
          0,
          0,
          compact ? marker.diameter / 2 / cam.zoom : 11,
          compact ? marker.diameter / 2 / cam.zoom : 3.5,
        )
        .stroke({ width: 1, color: 0x263f34 });
      group.addChild(ring);
      stats.rings++;
      const file = discipleArtFile(d.gender, pose);
      const sprite = compact ? undefined : art(file, height / 96);
      const mask = masks.get(file);
      if (mask && !compact) {
        const facing = pose === 'meditate' ? 1 : m.facing;
        const key = JSON.stringify([
          file,
          m.x,
          m.y,
          facing,
          occluders.map((b) => [
            b.key,
            b.x,
            b.y,
            b.z,
            b.mask.width,
            b.mask.height,
          ]),
        ]);
        let result = visibilityCache.get(key);
        if (!result) {
          result = visibilityOrder(mask, m.x, m.y, occluders, facing);
          if (visibilityCache.size > 1000) visibilityCache.clear();
          visibilityCache.set(key, result);
        }
        group.zIndex = result.z;
        stats.raisedForVisibility += Number(result.raised);
        stats.minHeadVisibility = Math.min(
          stats.minHeadVisibility,
          result.visible,
        );
      }
      stats.disciples.at(-1)!.z = group.zIndex;
      if (compact) stats.markers++;
      if (sprite) {
        if (pose !== 'meditate') sprite.scale.x *= m.facing;
        group.addChild(sprite);
        stats.discipleSprites++;
      } else if (!compact) {
        group.addChild(new Graphics().circle(0, -8, 9).fill(0x4f8a8b));
        stats.fallbacks++;
      }
      group.alpha = alpha;
      if (d.state.injuredUntil > world.tick) {
        const injuryRing = new Graphics();
        const rx = compact ? marker.diameter / 2 / cam.zoom + 3 / cam.zoom : 30;
        const ry = compact ? rx : 11;
        for (let dash = 0; dash < 12; dash++) {
          const angle = (dash * Math.PI * 2) / 12;
          injuryRing.moveTo(Math.cos(angle) * rx, Math.sin(angle) * ry);
          for (let part = 1; part <= 3; part++) {
            const a = angle + (part / 3) * (Math.PI / 12);
            injuryRing.lineTo(Math.cos(a) * rx, Math.sin(a) * ry);
          }
        }
        injuryRing.stroke({
          color: 0x77756f,
          width: compact ? 1.5 / cam.zoom : 2,
        });
        group.addChild(injuryRing);
      }
      namePoints.push({
        id: d.id,
        x: m.x,
        y: m.y,
        height: compact ? 14 / cam.zoom : height,
        bodyWidth: (entries.get(file)!.size[0] * height) / 96,
        name: shortName(d.name),
      });
      const event = relatedEvents(world, d.id)[0];
      if (event) {
        const dot = new Graphics()
          .circle(
            0,
            compact ? -14 / cam.zoom : -height - 8 / cam.zoom,
            5 / cam.zoom,
          )
          .fill(0xad4937);
        let eventHit = hits.get(`event:${d.id}`);
        if (!eventHit) {
          eventHit = new Container();
          hits.set(`event:${d.id}`, eventHit);
          hitLayer.addChild(eventHit);
          eventHit.eventMode = 'static';
          eventHit.cursor = 'pointer';
          eventHit.hitArea = {
            contains: (x: number, y: number) => Math.hypot(x, y) <= 12,
          };
          eventHit.on('pointertap', (e) => {
            e.stopPropagation();
            if (!camera.wasDragged()) {
              const pending = world && relatedEvents(world, d.id)[0];
              if (pending) callbacks.event?.(pending.id);
            }
          });
        }
        eventHit.position.set(
          hit.position.x,
          hit.position.y - (compact ? 14 : height * cam.zoom + 8),
        );
        group.addChild(dot);
      }
      scene.addChild(group);
    }
    screenLabels = labels
      .filter((l) => l.text.visible && l.text.alpha > 0)
      .map((l) => {
        const r = l.text.getBounds();
        return {
          id: l.id,
          text: l.text.text,
          x: bounds.x + r.x,
          y: bounds.y + r.y,
          width: r.width,
          height: r.height,
        };
      })
      .filter(
        (r) =>
          r.x < bounds.right &&
          r.y < bounds.bottom &&
          r.x + r.width > bounds.left &&
          r.y + r.height > bounds.top,
      );
    stats.labelOverlaps = labelOverlaps(labels, occluders);
    const activeId = namePoints.some((p) => p.id === hoveredId)
      ? hoveredId
      : selectedId;
    const inspected = namePoints.find((p) => p.id === activeId);
    if (inspected) {
      // A deliberate inspection reveals exactly one label, even in a crowd.
      const box = overheadNames([inspected])[0];
      const t = label(inspected.name, overheadNameFontSize, true);
      t.anchor.set(0.5, 0);
      t.position.set(box.x + box.width / 2, box.y);
      t.zIndex = 3000;
      scene.addChild(t);
      stats.nameLabels = 1;
      stats.namedDiscipleIds.push(inspected.id);
    }
    for (const [id, hit] of hits) {
      if (
        !motions.has(id.replace('event:', '')) ||
        stats.disciples.some(
          (d) => d.id === id.replace('event:', '') && d.alpha === 0,
        ) ||
        (id.startsWith('event:') && !relatedEvents(world, id.slice(6)).length)
      ) {
        if (hoveredId === id) hoveredId = undefined;
        hit.destroy();
        hits.delete(id);
      }
    }
    mini.position.set(bounds.width - 125, 76);
    mini.zIndex = 1000;
    mini.addChild(
      new Graphics()
        .rect(0, 0, 115, 65)
        .fill({ color: 0xf1e8d4, alpha: 0.9 })
        .stroke({ width: 1, color: 0x8a8578 }),
    );
    const miniArt = art('map/world-mini.webp', 115 / 320);
    if (miniArt) mini.addChild(miniArt);
    const miniScale = 115 / 3200;
    for (const m of motions.values())
      mini.addChild(
        new Graphics()
          .circle(m.x * miniScale, m.y * miniScale, 2)
          .fill(0x4f8a8b),
      );
    mini.addChild(
      new Graphics()
        .rect(
          Math.max(0, cam.x - bounds.width / 2 / cam.zoom) * miniScale,
          Math.max(0, cam.y - bounds.height / 2 / cam.zoom) * miniScale,
          Math.min(3200, bounds.width / cam.zoom) * miniScale,
          Math.min(1400, bounds.height / cam.zoom) * miniScale,
        )
        .stroke({ width: 1, color: 0xffffff }),
    );
    window.__mapStats = stats;
    callbacks.frame?.();
    app.render();
    window.__mapReady = true;
    if ((active || breathingGlow || !!followed) && !paused)
      frame = requestFrame(paint);
    else frame = 0;
  }
  function draw(w: World) {
    cancelFrame();
    frame = 0;
    paused = host.ownerDocument?.hidden ?? document.hidden;
    world = w;
    const now = performance.now(),
      visible = new Set<string>();
    const visibleDisciples = w.disciples.filter(
      (d) =>
        d.stage !== '坐化' && !d.state.awayUntil && d.state.behavior !== '历练',
    );
    const destinations = discipleDestinations(visibleDisciples, w.tick);
    for (const [i, d] of visibleDisciples.entries()) {
      visible.add(d.id);
      const [x, y] = destinations[i];
      const row = i > 2 ? 1 : 0;
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
          path: [[x, y]],
          duration: 0,
        });
      else {
        m.row = row;
        if (m.toX !== x || m.toY !== y) {
          [m.x, m.y] = alongPath(
            m.path,
            (Math.max(0, now - m.start) / 1000) *
              routeSpeed(m.path) *
              walkScale,
          );
          const path = findPath([m.x, m.y], [x, y]);
          if (!path.length) continue;
          m.path = path;
          m.duration =
            (pathLength(path) / (routeSpeed(path) * walkScale)) * 1000;
          m.row = row;
          m.fromX = m.x;
          m.fromY = m.y;
          m.toX = x;
          m.toY = y;
          m.start = now;
          if (x !== m.x) m.facing = x > m.x ? 1 : -1;
        }
      }
    }
    for (const id of motions.keys()) if (!visible.has(id)) motions.delete(id);
    paint(now);
  }
  const resize =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => {
          app.renderer.resize(host.clientWidth, host.clientHeight);
          cancelFrame();
          paint(performance.now());
        });
  resize?.observe(host);
  return {
    draw,
    follow: (id: string) => camera.follow(id),
    select,
    reset: () => {
      motions.clear();
      selectedId = undefined;
      hoveredId = undefined;
    },
    labels: labelRects,
    position: (id: string) => {
      const m = motions.get(id);
      if (!m) return;
      const c = camera.get(),
        r = app.canvas.getBoundingClientRect();
      return {
        x: r.x + r.width / 2 + (m.x - c.x) * c.zoom,
        y: r.y + r.height / 2 + (m.y - c.y - DISCIPLE_HEIGHT) * c.zoom,
        viewport: {
          width: host.ownerDocument.defaultView!.innerWidth,
          height: host.ownerDocument.defaultView!.innerHeight,
        },
      };
    },
    walkDormToHall: (id: string) => {
      const m = motions.get(id);
      if (!m) throw Error('弟子不在地图');
      const from = worldMap.slots.find((s) => s.id === 'B_DORM')!.front,
        to = worldMap.slots.find((s) => s.id === 'B_HALL')!.front;
      const path = findPath(from, to);
      Object.assign(m, {
        x: from[0],
        y: from[1],
        toX: to[0],
        toY: to[1],
        path,
        start: performance.now(),
        duration: (pathLength(path) / (routeSpeed(path) * walkScale)) * 1000,
      });
      cancelFrame();
      paint(performance.now());
      return { to, duration: m.duration };
    },
    pause: () => {
      paused = true;
      cancelFrame();
      frame = 0;
      paint(performance.now());
      app.stop();
    },
    destroy: () => {
      cancelFrame();
      resize?.disconnect();
      camera.destroy();
      app.destroy(true, { children: true });
    },
  };
}
