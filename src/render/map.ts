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
  compactMetrics,
  compactSlot,
  buildingDepth,
  buildingLabelBox,
  type NamePoint,
  discipleSlot,
  placeNames,
  shortName,
  rootRingColors,
  locationRegion,
  buildingLabelPosition,
  buildingArt,
  plotFoot,
  plots,
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
  const overlay = new Container();
  app.stage.addChild(overlay);
  const masks = new Map<string, Mask>();
  for (const [file, texture] of textures) {
    if (!file.includes('-map@') && !file.includes('-96@')) continue;
    const entry = entries.get(file)!;
    const scale = file.startsWith('disciple/') ? height / 96 : 0.5;
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
  let world: World | undefined;
  let paused = false;
  const label = (text: string, size = 9, white = false) =>
    new Text({
      text,
      style: {
        fontSize: size,
        lineHeight: 13,
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
    cancelAnimationFrame(frame);
    paint(performance.now());
  });
  function paint(now: number) {
    if (!world) return;
    for (const child of scene.removeChildren())
      child.destroy({ children: true });
    for (const child of overlay.removeChildren())
      child.destroy({ children: true });
    const compact = camera.compact(),
      cam = camera.get();
    scene.scale.set(cam.zoom);
    scene.position.set(320 - cam.x * cam.zoom, 180 - cam.y * cam.zoom);
    const bounds = app.canvas.getBoundingClientRect();
    const marker = compactMetrics(bounds.width, bounds.height);
    const compactCounts = new Map<ReturnType<typeof locationRegion>, number>();
    const compactIndices = new Map<ReturnType<typeof locationRegion>, number>();
    for (const d of world.disciples)
      if (motions.has(d.id)) {
        const r = locationRegion(d.state.location);
        compactCounts.set(r, (compactCounts.get(r) ?? 0) + 1);
      }
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
        [x, baseY] = plotFoot(def.id);
      let y = baseY;
      const b = world.buildings.find((b) => b.id === def.id);
      const group = new Container();
      group.position.set(x, y);
      group.zIndex = buildingDepth(def.id, y);
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
        const file = `building/${buildingArt[b.id]}-t${tier}-map@2x.webp`;
        const entry = entries.get(file)!;
        y += 'downshift' in entry ? (entry.downshift ?? 0) : 0;
        group.position.set(x, y);
        group.zIndex = buildingDepth(def.id, y);
        const sprite = art(file, 0.5);
        const mask = masks.get(file);
        if (mask)
          occluders.push({
            key: def.id,
            mask,
            x,
            y,
            z: buildingDepth(def.id, y),
          });
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
      if (!compact) {
        const text = b
          ? `${b.name} Lv${b.level}${b.targetLevel && b.targetLevel > b.level ? ' ⚒' : ''}`
          : `${def.name}预留位`;
        const t = label(text, 11, true);
        labels.push({ id: def.id, box: buildingLabelBox(def.id, text) });
        stats.buildingLabels++;
        t.alpha = b ? 1 : 0.8;
        t.anchor.set(def.id === 'B_MEDIT' ? 0 : 0.5, 0);
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
      const region = locationRegion(d.state.location);
      const index = compactIndices.get(region) ?? 0;
      compactIndices.set(region, index + 1);
      const position = compact
        ? compactSlot(region, index, compactCounts.get(region)!, marker.spacing)
        : m;
      group.position.set(position.x, position.y);
      group.zIndex = m.y;
      const pose = behaviorPose(d.state.behavior, moving, now - m.start);
      stats.poses[pose] = (stats.poses[pose] ?? 0) + 1;
      stats.disciples.push({ x: m.x, y: m.y });
      const colors = rootRingColors(d.root.elements);
      const ring = new Graphics();
      colors.forEach((color, i) => {
        const start = (i * Math.PI * 2) / colors.length,
          end = ((i + 1) * Math.PI * 2) / colors.length;
        const points = [0, 0];
        for (let j = 0; j <= 24; j++) {
          const angle = start + ((end - start) * j) / 24;
          points.push(
            Math.cos(angle) * (compact ? marker.diameter / 2 : 13),
            Math.sin(angle) * (compact ? marker.diameter / 2 : 4),
          );
        }
        ring.poly(points).fill(color);
      });
      ring
        .ellipse(
          0,
          0,
          compact ? marker.diameter / 2 : 13,
          compact ? marker.diameter / 2 : 4,
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
        const initial = label(d.name.slice(0, 1), marker.fontSize, true);
        initial.style.lineHeight = marker.fontSize;
        initial.style.stroke = { color: 0x263f34, width: 2 / marker.scale };
        initial.anchor.set(0.5);
        group.addChild(initial);
        stats.nameLabels++;
      } else
        namePoints.push({
          x: m.x,
          y: m.y,
          row: compact ? 0 : m.row,
          height: compact ? 10 : height,
          name: compact ? d.name.slice(0, 1) : shortName(d.name),
        });
      scene.addChild(group);
    }
    placeNames(
      namePoints,
      labels.map((l) => l.box),
    ).forEach((box, i) => {
      const t = label(namePoints[i].name, 10.5, true);
      t.anchor.set(0.5, 0);
      t.position.set(box.x + box.width / 2, box.y + 2);
      t.zIndex = 3000;
      scene.addChild(t);
      stats.nameLabels++;
    });
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
    mini.addChild(
      new Graphics()
        .rect(
          (cam.x - 320 / cam.zoom) * 0.175,
          (cam.y - 180 / cam.zoom) * 0.175,
          (640 / cam.zoom) * 0.175,
          (360 / cam.zoom) * 0.175,
        )
        .stroke({ width: 1, color: 0xffffff }),
    );
    overlay.addChild(mini);
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
      else {
        m.row = row;
        if (m.toX !== x || m.toY !== y) {
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
          cancelAnimationFrame(frame);
          paint(performance.now());
        });
  resize?.observe(app.canvas);
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
      resize?.disconnect();
      camera.destroy();
      app.destroy(true, { children: true });
    },
  };
}
