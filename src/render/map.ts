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
  buildingDepth,
  type NamePoint,
  placeNames,
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
import {
  worldMap,
  DISCIPLE_SCALE,
  WALK_SPEED,
  findPath,
  pathLength,
  alongPath,
  discipleDestinations,
  walkTimeSeconds,
  type Point,
} from './world';
function plotFoot(id: string): Point {
  const s = worldMap.slots.find((s) => s.id === id)!;
  return [(s.rect[0] + s.rect[2]) / 2, s.rect[3]];
}
function buildingLabelPosition(id: string): Point {
  const s = worldMap.slots.find((s) => s.id === id)!;
  return id === 'B_ALCHEMY'
    ? [(s.rect[0] + s.rect[2]) / 2, s.rect[3] + 34]
    : id === 'B_MEDIT'
      ? [s.rect[2] + 70, s.rect[1] + 10]
      : [(s.rect[0] + s.rect[2]) / 2, s.rect[1] - 50];
}
function buildingLabelBox(id: string, text: string) {
  const [x, y] = buildingLabelPosition(id);
  return {
    x: x - text.length * 11,
    y: y - 2,
    width: text.length * 22 + 8,
    height: 34,
  };
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
    __mapReady: boolean;
    __mapStats: {
      mode: 'full' | 'compact';
      markers: number;
      markerCssDiameter: number;
      buildingLabels: number;
      labelOverlaps: LabelOverlap[];
      rings: number;
      nameLabels: number;
      raisedForVisibility: number;
      minHeadVisibility: number;
      baseLoaded: boolean;
      buildingSprites: number;
      discipleSprites: number;
      fallbacks: number;
      poses: Record<string, number>;
      disciples: { id: string; x: number; y: number }[];
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
    if (!camera.wasDragged()) callbacks.blank?.();
  });
  const overlay = new Container();
  app.stage.addChild(overlay);
  const hits = new Map<string, Container>();
  const hitLayer = new Container();
  app.stage.addChild(hitLayer);
  const mini = new Container();
  app.stage.addChild(mini);
  const masks = new Map<string, Mask>();
  for (const [file, texture] of textures) {
    if (!file.includes('-map@') && !file.includes('-96@')) continue;
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
    const labels: { id: string; box: ReturnType<typeof buildingLabelBox> }[] =
      [];
    const stats = {
      mode: compact ? ('compact' as const) : ('full' as const),
      markers: 0,
      markerCssDiameter: compact ? marker.diameter * marker.scale : 0,
      buildingLabels: 0,
      labelOverlaps: [] as LabelOverlap[],
      rings: 0,
      nameLabels: 0,
      raisedForVisibility: 0,
      minHeadVisibility: 1,
      baseLoaded: textures.has('map/world.webp'),
      buildingSprites: 0,
      discipleSprites: 0,
      fallbacks: 0,
      poses: {} as Record<string, number>,
      disciples: [] as { id: string; x: number; y: number }[],
      discipleScale: DISCIPLE_SCALE,
      walkSpeed: WALK_SPEED,
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
    let breathingGlow = false;
    for (const def of buildingDefinitions) {
      const p = worldMap.slots.find((s) => s.id === def.id)!.rect,
        [x, baseY] = plotFoot(def.id);
      let drawX = x,
        y = baseY;
      const b = world.buildings.find((b) => b.id === def.id);
      const group = new Container();
      group.position.set(x, y);
      group.zIndex = buildingDepth(def.id, y);
      if (!b) {
        group.addChild(
          new Graphics()
            .rect(p[0] - x, p[1] - y, p[2] - p[0], p[3] - p[1])
            .fill({ color: 0xf5eddc, alpha: 0.25 })
            .stroke({ color: 0x8a8578, alpha: 0.5, width: 1 }),
        );
      } else {
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
        group.zIndex = buildingDepth(def.id, y);
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
            z: buildingDepth(def.id, y),
          });
        if (sprite) {
          sprite.alpha = b.level === 0 ? 0.45 : 1;
          group.addChild(sprite);
          if (def.id === 'B_GARDEN' && tier === 2) {
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
      if (!compact) {
        const text = b
          ? `${b.name} Lv${b.level}${b.targetLevel && b.targetLevel > b.level ? ' ⚒' : ''}`
          : `${def.name}预留位`;
        const t = label(text, 22, true);
        labels.push({ id: def.id, box: buildingLabelBox(def.id, text) });
        stats.buildingLabels++;
        t.alpha = b ? 1 : 0.8;
        t.anchor.set(0.5, 0);
        t.position.set(...buildingLabelPosition(def.id));
        t.zIndex = 2000;
        scene.addChild(t);
      }
      scene.addChild(group);
    }
    stats.labelOverlaps = labelOverlaps(labels, occluders);
    const namePoints: NamePoint[] = [];
    let active = false;
    for (const d of world.disciples) {
      const m = motions.get(d.id);
      if (!m) continue;
      const elapsed = Math.max(0, now - m.start);
      const moving = elapsed < m.duration;
      active ||= moving;
      const positionOnPath = alongPath(m.path, (elapsed / 1000) * WALK_SPEED);
      if (positionOnPath[0] !== m.x)
        m.facing = positionOnPath[0] > m.x ? 1 : -1;
      [m.x, m.y] = positionOnPath;
      const group = new Container();
      const position = m;
      group.position.set(position.x, position.y);
      group.zIndex = m.y;
      const pose = behaviorPose(d.state.behavior, moving, now - m.start);
      stats.poses[pose] = (stats.poses[pose] ?? 0) + 1;
      stats.disciples.push({ id: d.id, x: m.x, y: m.y });
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
        hit.on('pointertap', (e) => {
          e.stopPropagation();
          if (camera.wasDragged()) return;
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
      const ring = new Graphics();
      colors.forEach((color, i) => {
        const start = (i * Math.PI * 2) / colors.length,
          end = ((i + 1) * Math.PI * 2) / colors.length;
        const points = [0, 0];
        for (let j = 0; j <= 24; j++) {
          const angle = start + ((end - start) * j) / 24;
          points.push(
            Math.cos(angle) * (compact ? marker.diameter / 2 / cam.zoom : 26),
            Math.sin(angle) * (compact ? marker.diameter / 2 / cam.zoom : 8),
          );
        }
        ring.poly(points).fill(color);
      });
      ring
        .ellipse(
          0,
          0,
          compact ? marker.diameter / 2 / cam.zoom : 26,
          compact ? marker.diameter / 2 / cam.zoom : 8,
        )
        .stroke({ width: 1, color: 0x263f34 });
      group.addChild(ring);
      stats.rings++;
      const file = `disciple/${pose}-96@2x.webp`;
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
      } else if (!compact) {
        group.zIndex = Math.max(m.y, ...occluders.map((b) => b.z + 0.01));
      }
      if (compact) stats.markers++;
      if (sprite) {
        if (pose !== 'meditate') sprite.scale.x *= m.facing;
        group.addChild(sprite);
        stats.discipleSprites++;
      } else if (!compact) {
        group.addChild(new Graphics().circle(0, -8, 9).fill(0x4f8a8b));
        stats.fallbacks++;
      }
      if (d.state.injuredUntil > world.tick) group.alpha = 0.55;
      if (compact) {
        const initial = label(
          d.name.slice(0, 1),
          marker.fontSize / cam.zoom,
          true,
        );
        initial.style.lineHeight = marker.fontSize / cam.zoom;
        initial.style.stroke = { color: 0x263f34, width: 2 / marker.scale };
        initial.anchor.set(0.5);
        group.addChild(initial);
        stats.nameLabels++;
      } else
        namePoints.push({
          x: m.x,
          y: m.y,
          row: 0,
          height: compact ? 10 : height,
          name: compact ? d.name.slice(0, 1) : shortName(d.name),
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
    placeNames(
      namePoints.map((p) => ({
        ...p,
        x: p.x / 2,
        y: p.y / 2,
        height: (p.height ?? 96) / 2,
      })),
      labels.map(({ box: b }) => ({
        x: b.x / 2,
        y: b.y / 2,
        width: b.width / 2,
        height: b.height / 2,
      })),
    ).forEach((box, i) => {
      const t = label(namePoints[i].name, 21, true);
      t.anchor.set(0.5, 0);
      t.position.set(box.x * 2 + box.width, box.y * 2 + 4);
      t.zIndex = 3000;
      scene.addChild(t);
      stats.nameLabels++;
    });
    for (const [id, hit] of hits) {
      if (
        !motions.has(id.replace('event:', '')) ||
        (id.startsWith('event:') && !relatedEvents(world, id.slice(6)).length)
      ) {
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
            (Math.max(0, now - m.start) / 1000) * WALK_SPEED,
          );
          const path = findPath([m.x, m.y], [x, y]);
          if (!path.length) continue;
          m.path = path;
          m.duration = (pathLength(path) / WALK_SPEED) * 1000;
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
    reset: () => motions.clear(),
    position: (id: string) => {
      const m = motions.get(id);
      if (!m) return;
      const c = camera.get(),
        r = app.canvas.getBoundingClientRect();
      return {
        x: r.width / 2 + (m.x - c.x) * c.zoom,
        y: r.height / 2 + (m.y - c.y - DISCIPLE_HEIGHT) * c.zoom,
        viewport: { width: r.width, height: r.height },
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
        duration: (pathLength(path) / WALK_SPEED) * 1000,
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
