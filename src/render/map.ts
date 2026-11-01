import {
  SpotPlanner,
  bridgeTransfer,
  duelPositions,
  v4Cushions,
  satelliteSpots,
  stages,
  subpositions,
  musterPositions,
  expeditionLanding,
  ringPair,
} from './v4-spots';
import { outdoorHall, outdoorSeats } from './v4-outdoor';
import encodedV4 from './world-v4-encoded.json';
import {
  v4ForegroundBounds,
  v4Active,
  v4Assets,
  v4Layers,
  V4,
  uv,
  v4Route,
  v4Fade,
  v4FadeContains,
  v4Spawn,
  v4AdaptationReports,
  v4Island,
} from './world-v4';
import { horizontalFacing, spriteFlip } from './disciple-facing';
import { advanceGait, strideLength } from './disciple-gait';
import { buildingSortY, pedestalGeometry } from './pedestal';
import platform from '../../scripts/platform-geometry.json';
import { groundedLayer, insideGroundedBody } from './grounded-layers';
import { discipleArtFile } from './world-scale';
import {
  COOL_CONTACT_SHADOW,
  COOL_FRAME_ANCHOR,
  COOL_FRAME_SIZE,
  coolAction,
  coolActionFlip,
  coolAllFrameFiles,
  coolChairFile,
  coolMasterFile,
  coolPropFile,
  coolPropEntries,
  coolCushionFootOffset,
  coolDiscipleScale,
  coolFrame,
  coolFramePlaceholder,
  coolRootColors,
} from './cool-disciple';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Matrix,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import {
  INDOOR_INSET,
  indoorSpot,
  insideInset,
  layerMatrix,
  offsetPoints,
  retargetRoof,
  roofAlpha,
  roofAnimating,
  roofFadeBuildings,
  type RoofTween,
} from './roof-fade';
import { DISCIPLE_HEIGHT } from './world-scale';
import {
  coolMotionMs,
  gatherSpeedFactor,
  DOOR_FADE,
  addLateJoiner,
  approachParam,
  assemblyTick,
  buildCoolHall,
  coolRoofAlpha,
  coolRoofUpdate,
  dailySeats,
  detectTriggers,
  outdoorZ,
  planHallRoute,
  retriggerAssembly,
  roofAnimatingCool,
  roofClosed,
  routeStatus,
  seniorityOrder,
  chairEligible,
  snapshotTriggers,
  startAssembly,
  type Assembly,
  type CoolRoof,
  type HallRoute,
  type Seat,
  type TriggerState,
  coolFloorParam,
  type CoolRoom,
} from './cool-hall';
import {
  SERMON,
  addSermonJoiner,
  cushionAlpha,
  handoffSermon,
  leaveSermon,
  sermonMasterAction,
  sermonMasterAlpha,
  sermonSeat,
  sermonTick,
  startSermon,
  type Sermon,
} from './cool-sermon';
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
  discipleGroundMarks,
  buildingArt,
} from './layout';
import { attachCamera } from './camera';
import { DEPTH, depthFiles } from './depth-config';
import { depthActive, roofFadeActive } from './cool-config';
import { createDepthLayers } from './depth-layers';
import { COOL_DEPTH, createCoolDepth } from './cool-depth';
import {
  coolBuildingLayers,
  coolBuildingsFor,
  coolBuildingZ,
} from './cool-buildings';
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
  nearestWalkable,
  spacedLanding,
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
  coolWorld,
  type Point,
} from './world';
function plotFoot(id: string): Point {
  const s = worldMap.slots.find((s) => s.id === id)!;
  return [(s.rect[0] + s.rect[2]) / 2, s.rect[3]];
}
// ?cool=1：排序 y 直接取冷色槽位脚印前角（plotFoot 的 y）；旧台基 sortY 只对四岛世界有效。
const sortY = (id: string, baseY: number) =>
  coolWorld ? baseY : buildingSortY(id, baseY);
// Layered translucent ellipses give a soft edge without a raster art generator.
function groundShadow(width: number, y = 3, color = 0x3b2a1a) {
  const g = new Graphics();
  for (const [size, alpha] of [
    [1, 0.06],
    [0.88, 0.08],
    [0.72, 0.09],
    [0.54, 0.08],
  ])
    g.ellipse(0, y, (width * size) / 2, (width * 0.18 * size) / 2).fill({
      color,
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
  expedition?: 'out' | 'in';
  musterPoint?: Point;
  returnWaiting?: boolean;
  departurePath?: Point[];
  musterSlot?: number;
  transfer?: { target: Point; arrive: number };
  debugControlled?: boolean;
  debugPose?: string;
  directionAt?: number;
  lastPaint?: number;
  pendingDistance?: number;
  cycles?: number;
  /** roofFade：同一建筑内的室内站位序号（仅表现层）。 */
  indoorIndex?: number;
  /** roofFade 调试：把该弟子当作进入此建筑。 */
  roofDebug?: string;
  /** roofFade：门口→室内站位这段表现层小路，换目的地时从这里接着走。 */
  roofIndoor?: { from: Point; to: Point; start: number };
  /** cool 主殿：当前路线的门口位置与殿内/殿外状态（仅表现层）。 */
  coolRoute?: HallRoute;
  /** cool 召集/讲道聚集段走速系数（08 增补 1.1：×1.6）；日常与散场为 undefined（1.0）。 */
  speedFactor?: number;
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
      coolFrames: Record<string, number>;
      coolActions: Record<string, number>;
      coolChairs: number;
      disciples: {
        id: string;
        x: number;
        y: number;
        z: number;
        alpha: number;
        screenX: number;
        screenY: number;
        vx: number;
        vy: number;
        facing: number;
        flip: number;
        phase: number;
        cycles: number;
        pose: string;
        stride: number;
        locomotion: string;
        frame?: string;
        frameFlip?: number;
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
/** 弟子 id → 稳定小整数（站/坐呼吸相位错开用，不碰 sim RNG）。 */
const seedOf = (id: string) =>
  [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7);

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
  // 开发开关：封闭房屋屋顶淡出。默认关闭，关闭时渲染与改动前一致。
  // ?cool=1 时默认关闭（COOL_SETTINGS.roofFadeWithCool）。
  const roofFade = !v4Active && roofFadeActive(location.search);
  // 开发开关：场景纵深（天空/远峰/云海/落影/全局光/前景雾）。默认关闭，关闭时不建任何纵深对象、不加载纵深素材。
  // ?cool=1 优先：cool 打开时纵深默认关闭（COOL_SETTINGS.depthWithCool）。
  const depth = depthActive(location.search);
  // 开发开关：冷色单石台骨架。底图换成占位概念图，不画旧四岛 world.webp、山门前景与桥。
  const cool = coolWorld;
  // cool 的地面是 S1 未验收的平面色块占位（Graphics 绘制），不加载底图文件。
  const groundFile = cool ? '' : depth ? DEPTH.world : 'map/world.webp';
  // cool 主殿 B1/B2 分层与召集全员（纯表现层）。
  const coolHall = cool && !v4Active ? buildCoolHall() : undefined;
  const stageHall = v4Active ? outdoorHall() : coolHall;
  const spotPlanner = new SpotPlanner();
  let coolRoof: CoolRoof = roofClosed();
  let coolRoofHold: number | undefined;
  // v4g 楼层视图：auto = 按殿内有人淡出屋顶、内景为正殿；固定楼层 = 屋顶淡出并保持，显示该层内景。
  let coolFloor: CoolRoom | 'auto' = coolHall
    ? coolFloorParam(location.search)
    : 'auto';
  let coolOccupied = false;
  let dailyMap = new Map<string, Seat>();
  let assembly: Assembly | undefined;
  let assemblyLast: number | undefined;
  const assemblyLog: { at: number; reasons: string[] }[] = [];
  // 08 增补 R5：大能讲道 demo（只由调试钩子触发）。
  let sermon: Sermon | undefined;
  let sermonLast: number | undefined;
  let pendingSermon: number | undefined;
  const sermonLog: { at: number; event: string }[] = [];
  let triggerState: TriggerState | undefined;
  const injected: World['disciples'] = [];
  let lastCoolSeats: Record<string, unknown>[] = [];
  // 08 增补 R6：重寻路分帧（推荐值每帧 ≤4 人）；replanLog 供调试钩子读最大每帧人数与帧间隔。
  const COOL_REPLAN_PER_FRAME = 4;
  let replanBudget = COOL_REPLAN_PER_FRAME;
  const pendingReplans = new Map<
    string,
    { x: number; y: number; ct: CoolTarget | undefined; row: number }
  >();
  const replanLog = { maxPerFrame: 0, total: 0, deferred: 0, maxGapMs: 0 };
  const motionDistance = (m: Motion, elapsed: number) =>
    m.expedition === 'in'
      ? (Math.max(0, elapsed - 800) / 1000) * routeSpeed(m.path) * walkScale
      : m.speedFactor === undefined
        ? (elapsed / 1000) * routeSpeed(m.path) * walkScale
        : (elapsed / 1000) * routeSpeed(m.path) * walkScale * m.speedFactor;
  const assemblyEnabled = params.get('assembly') !== '0';
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
        pedestals: pedestalGeometry.buildings,
        nearestWalkable: (p: Point) => nearestWalkable(p),
        buildingLayerAt: (id: string, x: number, y: number) => {
          const b = pedestalGeometry.buildings.find((b) => b.id === id)!;
          const split = groundedLayer(`building/${b.key}-t1-map@2x.webp`);
          return {
            body:
              !!split &&
              insideGroundedBody(
                x - b.position[0],
                y - b.position[1],
                split.points,
                split.extraPolygons,
              ),
            groundZ: -900,
            bodyZ: buildingSortY(id, b.position[1]),
          };
        },
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
  if (params.get('debug') === '1' && cool)
    Object.assign(window, {
      __cool: {
        k: cool.config.k,
        scale: cool.scale,
        background: cool.background,
        slots: cool.slots,
        spots: cool.spots,
        quarry: cool.quarry,
        expeditionPoint: cool.expeditionPoint,
        platform: cool.islands[0].walkable,
        depth,
        roofFade,
      },
      __coolHall: {
        geometry: coolHall,
        state: () => {
          const now = performance.now();
          return {
            roofAlpha: coolRoofHold ?? coolRoofAlpha(coolRoof, now),
            floor: coolFloor,
            roof: { ...coolRoof },
            occupied: coolOccupied,
            assemblyEnabled,
            assembly: assembly && {
              phase: assembly.phase,
              clock: assembly.clock,
              phaseStart: assembly.phaseStart,
              queued: assembly.queued,
              reasons: [...assembly.reasons],
              released: [...assembly.released],
              seats: [...assembly.seats].map(([id, s]) => ({
                id,
                kind: s.kind,
                index: s.index,
                point: s.point,
                inside: s.inside,
              })),
            },
            log: assemblyLog.map((e) => ({ ...e })),
            sermon: sermon && {
              phase: sermon.phase,
              clock: sermon.clock,
              phaseStart: sermon.phaseStart,
              durationMs: sermon.durationMs,
              queuedAssembly: [...sermon.queuedAssembly],
              masterAlpha: sermonMasterAlpha(sermon),
              masterAction: sermonMasterAction(sermon),
              master: stageHall!.stairTop,
              cushions: [...sermon.cushions].map(([id, c]) => ({
                id,
                index: c.index,
                point: c.point,
                at: c.at,
                releasedAt: c.releasedAt,
                alpha: cushionAlpha(sermon!, c),
              })),
            },
            pendingSermon,
            sermonLog: sermonLog.map((e) => ({ ...e })),
            replans: { ...replanLog, pending: pendingReplans.size },
            paintedAt: lastPaint,
            daily: [...dailyMap].map(([id, s]) => ({
              id,
              kind: s.kind,
              index: s.index,
              point: s.point,
            })),
            disciples: lastCoolSeats.map((e) => ({ ...e })),
            injected: injected.map((d) => d.id),
          };
        },
        /** 调试：手动触发一次召集（等同事件结算触发，不改 sim）。 */
        trigger: (reason = '调试召集') => {
          if (!world || !stageHall) return;
          const list = presentDisciples(world);
          const join = new Map(world.disciples.map((d, i) => [d.id, i]));
          beginAssembly([reason], seniorityOrder(list, join), seatedSet(list));
          draw(world);
        },
        /**
         * 调试：大能讲道 demo（08 增补 4.4，R5）。ms 缺省 20 s。召集中调用返回 'queued'
         * （召集散场结束后开始）；讲道已在进行返回 'running'。不改 sim、不写存档。
         */
        sermon: (ms?: number) => {
          if (!world || !stageHall) return;
          const durationMs = Math.max(0, ms ?? SERMON.defaultMs);
          if (sermon) return 'running';
          if (assembly) {
            pendingSermon = durationMs;
            sermonLog.push({ at: performance.now(), event: 'queued' });
            return 'queued';
          }
          beginSermon(durationMs);
          draw(world);
          return 'started';
        },
        /**
         * 调试注入：表现层复制弟子到总数 n（7.5 #34），不进 sim。opts.major 把前 count 个（缺省全部）
         * 新注入者的大境界改成 major（N6 验收：注入 8 名筑基测椅子坐满，指挥官 2026-10-30 拍板 2）。
         */
        inject: (
          n: number,
          opts?: { major?: '炼气' | '筑基'; count?: number },
        ) => {
          if (!world) return;
          const real = world.disciples.filter((d) => !injected.includes(d));
          const base = real.filter((d) => d.stage !== '坐化');
          while (real.length + injected.length < n) {
            const k = injected.length + 1;
            const src = base[(k - 1) % base.length];
            const clone = structuredClone(src);
            clone.id = `INJ${String(k).padStart(2, '0')}`;
            clone.name = `注入${k}`;
            clone.state = { ...clone.state, awayUntil: 0 };
            if (opts?.major && (opts.count === undefined || k <= opts.count))
              clone.realm = { ...clone.realm, major: opts.major };
            injected.push(clone);
          }
          draw(world);
          return injected.map((d) => d.id);
        },
        /** 调试：清零分帧寻路统计（N19）。 */
        replanReset: () =>
          Object.assign(replanLog, {
            maxPerFrame: 0,
            total: 0,
            deferred: 0,
            maxGapMs: 0,
          }),
        roofHold: (alpha?: number) => {
          coolRoofHold = alpha;
          cancelFrame();
          paint(performance.now());
        },
        /** 调试/一层厅切换：'main' | 'left' | 'right' 固定该厅（屋顶淡出并保持），'auto' 恢复按殿内有人淡出。v6 起没有二层/三层。 */
        view: (floor: CoolRoom | 'auto' = 'auto') => {
          if (!coolHall) return;
          const rooms = coolHall.layers.rooms ?? {};
          coolFloor =
            floor === 'main' || (floor !== 'auto' && rooms[floor])
              ? floor
              : 'auto';
          cancelFrame();
          paint(performance.now());
          return coolFloor;
        },
      },
    });
  const app = new Application();
  await app.init({
    resizeTo: host,
    resolution: devicePixelRatio || 1,
    autoDensity: true,
    background: cool ? cool.background.color : 0xf1e8d4,
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
    : 96 * DISCIPLE_SCALE * (v4Active ? V4.actorScale : 1);
  const textures = new Map<string, Texture>();
  const entries = new Map(manifest.files.map((f) => [f.file, f]));
  let warned = false;
  const needed = manifest.files.filter(
    (f) => (!v4Active && f.file.includes('-map@')) || f.file.includes('-96@'),
  );
  const mapEntries = v4Active
    ? v4Assets.filter((a) => v4Layers.some((l) => l.file === a.file))
    : coolHall
      ? [
          coolHall.layers.base,
          coolHall.layers.room,
          coolHall.layers.roof,
          ...coolHall.layers.columns,
          ...(coolHall.layers.shadow ? [coolHall.layers.shadow] : []),
          ...(coolHall.layers.outerColumns ?? []),
          ...(coolHall.layers.carpet ? [coolHall.layers.carpet] : []),
          ...(coolHall.layers.stairs ?? []),
          ...Object.values(coolHall.layers.rooms ?? {}),
        ].map((l) => ({ file: l.file, size: l.size, anchor: { x: 0, y: 0 } }))
      : [
          { file: groundFile, size: [3200, 1400], anchor: { x: 0, y: 0 } },
          {
            file: 'map/world-mini.webp',
            size: [320, 140],
            anchor: { x: 0, y: 0 },
          },
          {
            file: gateArt.file,
            size: gateArt.crop.slice(2),
            anchor: { x: 0, y: 0 },
          },
        ];
  for (const entry of mapEntries)
    entries.set(entry.file, entry as (typeof manifest.files)[number]);
  Assets.setPreferences({ preferWorkers: false });
  // roofFade 素材只在开关打开时加载，不进首屏。
  const roofEntries = roofFade
    ? Object.values(roofFadeBuildings).flatMap((b) =>
        [b.exterior, b.shadow, b.interior].map((l) => ({ file: l.file })),
      )
    : [];
  // depth 素材同样只在开关打开时加载。
  const depthEntries = depth
    ? depthFiles()
        .filter((file) => file !== groundFile)
        .map((file) => ({ file }))
    : [];
  // ?cool=1：弟子 D1/D2 帧（batch2：192×192，脚底锚点 96,186；槽表见 cool-frames.json）；
  // 遮挡掩码按新帧轮廓重算（08 增补 R3），旧帧仍加载供名牌宽度与回退。
  const coolDiscipleEntries = cool
    ? coolAllFrameFiles().map((file) => ({
        file,
        size: [...COOL_FRAME_SIZE],
        anchor: { x: COOL_FRAME_ANCHOR[0], y: COOL_FRAME_ANCHOR[1] },
      }))
    : [];
  // 08 增补 R2/R5：P7 椅、P8 蒲团、P9 讲道位道具（锚点见 cool-frames.json props）。
  if (cool) coolDiscipleEntries.push(...coolPropEntries());
  // ?cool=1：B5–B9 建筑立绘（cool-buildings.json，左上角锚点）。
  if (cool && !v4Active)
    coolDiscipleEntries.push(
      ...coolBuildingLayers.map((l) => ({
        file: l.file,
        size: [...l.size],
        anchor: { x: 0, y: 0 },
      })),
    );
  for (const entry of coolDiscipleEntries)
    entries.set(entry.file, entry as (typeof manifest.files)[number]);
  const loadList = [
    ...needed,
    ...mapEntries,
    ...roofEntries,
    ...depthEntries,
    ...coolDiscipleEntries,
  ];
  await Promise.all(
    loadList.map(async ({ file }) => {
      try {
        const encoded = v4Active
          ? encodedV4.find((a) => a.file === file)
          : undefined;
        if (encoded) {
          // Assemble source-aligned blocks before uploading ONE texture: no inter-tile
          // filtering seams, unchanged layer identity/z, and every destination is ready.
          const canvas = document.createElement('canvas');
          [canvas.width, canvas.height] = encoded.size;
          const ctx = canvas.getContext('2d')!;
          await Promise.all(
            encoded.tiles.map(async (tile) => {
              if (!('file' in tile) || !tile.file) return;
              const image = new Image();
              image.src = import.meta.env.BASE_URL + 'assets/' + tile.file;
              await image.decode();
              const alphaFile =
                'alphaFile' in tile ? tile.alphaFile : undefined;
              const repairFile =
                'repairFile' in tile ? tile.repairFile : undefined;
              if (alphaFile || repairFile) {
                const block = document.createElement('canvas');
                block.width = tile.width;
                block.height = tile.height;
                const bc = block.getContext('2d', {
                  willReadFrequently: true,
                })!;
                bc.drawImage(image, 0, 0);
                const rgba = bc.getImageData(0, 0, tile.width, tile.height);
                for (const [file, isAlpha] of [
                  [alphaFile, true],
                  [repairFile, false],
                ] as const) {
                  if (!file) continue;
                  const auxiliary = new Image();
                  auxiliary.src = import.meta.env.BASE_URL + 'assets/' + file;
                  await auxiliary.decode();
                  bc.clearRect(0, 0, tile.width, tile.height);
                  bc.drawImage(auxiliary, 0, 0);
                  const data = bc.getImageData(
                    0,
                    0,
                    tile.width,
                    tile.height,
                  ).data;
                  for (let i = 0; i < rgba.data.length; i += 4) {
                    if (isAlpha) rgba.data[i + 3] = data[i];
                    else if (data[i + 3])
                      for (let c = 0; c < 3; c++)
                        rgba.data[i + c] = data[i + c];
                  }
                }
                ctx.putImageData(rgba, tile.x, tile.y);
              } else ctx.drawImage(image, tile.x, tile.y);
            }),
          );
          textures.set(file, Texture.from(canvas));
          return;
        }
        const loaded = await Assets.load<Texture>({
          src: import.meta.env.BASE_URL + 'assets/' + file,
          // @2x filenames otherwise make Pixi halve texture dimensions too.
          data: { resolution: 1 },
        });
        const bbox = v4Active ? v4ForegroundBounds.get(file) : undefined;
        if (bbox && loaded.source.resource) {
          const canvas = document.createElement('canvas');
          canvas.width = bbox[2] - bbox[0];
          canvas.height = bbox[3] - bbox[1];
          canvas
            .getContext('2d')!
            .drawImage(
              loaded.source.resource as CanvasImageSource,
              bbox[0],
              bbox[1],
              canvas.width,
              canvas.height,
              0,
              0,
              canvas.width,
              canvas.height,
            );
          textures.set(file, Texture.from(canvas));
          const entry = entries.get(file)!;
          entries.set(file, {
            ...entry,
            size: [canvas.width, canvas.height],
            anchor: { x: -bbox[0], y: -bbox[1] },
          });
        } else textures.set(file, loaded);
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
  const depthLayers = depth ? createDepthLayers(textures) : undefined;
  // ?cool=1：自有天空/云海层（cool-depth.ts），与 ?depth=1 无关。
  const coolDepth = cool && !v4Active ? createCoolDepth() : undefined;
  if (coolDepth) {
    app.stage.addChildAt(coolDepth.root, 0);
    if (params.get('debug') === '1')
      Object.assign(window, {
        __coolDepth: { config: COOL_DEPTH, stats: coolDepth.stats },
      });
  }
  if (depthLayers) {
    app.stage.addChildAt(depthLayers.back, 0);
    app.stage.addChild(depthLayers.front);
    if (params.get('debug') === '1')
      Object.assign(window, {
        __depth: {
          config: DEPTH,
          stats: depthLayers.stats,
          freeze: (at?: number) => {
            depthLayers.freeze(at);
            cancelFrame();
            paint(performance.now());
          },
        },
      });
  }
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
      !file.startsWith('cool/frames/') &&
      file !== gateArt.file
    )
      continue;
    const entry = entries.get(file)!;
    const scale = file.startsWith('cool/frames/')
      ? coolDiscipleScale(height)
      : file.startsWith('disciple/')
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
              split.extraPolygons,
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
  // roofFade 外观的遮挡掩码（世界 px，左上角对齐变换后的素材左上角）。
  const roofMasks = new Map<string, Mask>();
  for (const [id, roof] of Object.entries(roofFadeBuildings)) {
    const resource = textures.get(roof.exterior.file)?.source?.resource;
    if (!resource) continue;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(
      1,
      Math.round(roof.exterior.width * roof.exterior.matrix.a),
    );
    canvas.height = Math.max(
      1,
      Math.round(roof.exterior.height * roof.exterior.matrix.d),
    );
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(
      resource as CanvasImageSource,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    roofMasks.set(id, {
      width: canvas.width,
      height: canvas.height,
      anchorX: 0,
      anchorY: 0,
      alpha: Uint8Array.from(
        { length: canvas.width * canvas.height },
        (_, i) => rgba[i * 4 + 3],
      ),
    });
  }
  const roofTweens = new Map<string, RoofTween>();
  let roofHold: number | undefined;
  const roofState = () =>
    Object.fromEntries(
      Object.keys(roofFadeBuildings).map((id) => {
        const now = performance.now();
        const tween = roofTweens.get(id);
        return [
          id,
          {
            alpha: roofHold ?? roofAlpha(tween, now),
            target: tween?.to ?? 1,
            animating: roofAnimating(tween, now),
          },
        ];
      }),
    );
  const visibilityCache = new Map<string, ReturnType<typeof visibilityOrder>>();
  const motions = new Map<string, Motion>();
  const expeditionAway = new Set<string>();
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
        // ?cool=1：文字/名牌描边用 [UIP] 主文字色 #1F3338。
        fill: white ? 0xffffff : cool ? 0x1f3338 : 0x263f34,
        fontFamily: 'serif',
        ...(white
          ? { stroke: { color: cool ? 0x1f3338 : 0x263f34, width: 2 } }
          : {}),
      },
    });
  let coolGroundCache: Container | undefined;
  // S1 石台未验收：平面色块 + 描边 + 区域虚框，均带"占位"文字，不冒充美术。
  function coolGround(scale: number, labels: boolean) {
    const c = coolWorld!;
    const g = new Container();
    if (v4Active) {
      for (const l of v4Layers.filter((l) => !labels || l.z < 0)) {
        const sprite = art(l.file, scale);
        if (!sprite) continue;
        sprite.position.set(l.x * scale, l.y * scale);
        g.addChild(sprite);
      }
      return g;
    }
    const flat = (p: Point[]) => p.flatMap(([x, y]) => [x * scale, y * scale]);
    g.addChild(
      new Graphics()
        .poly(flat(c.background.polygon))
        .fill(c.background.platformColor)
        .stroke({
          width: Math.max(1, 3 * scale),
          color: c.background.platformStroke,
        }),
    );
    if (!labels) return g;
    for (const zone of c.zones) {
      const box = new Graphics()
        .poly(flat(zone.polygon))
        .fill({ color: 0xffffff, alpha: zone.kind === 'reserve' ? 0.12 : 0.22 })
        .stroke({ width: 1.5, color: c.background.platformStroke, alpha: 0.9 });
      g.addChild(box);
      const xs = zone.polygon.map((q) => q[0]),
        ys = zone.polygon.map((q) => q[1]);
      const t = label(`${zone.name}（占位）`, 13);
      t.anchor.set(0.5);
      t.alpha = 0.7;
      t.position.set(
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...ys) + Math.max(...ys)) / 2,
      );
      g.addChild(t);
    }
    const note = label(c.background.placeholder, 18);
    note.anchor.set(0.5, 0);
    note.alpha = 0.75;
    note.position.set(
      c.background.x + c.background.width / 2,
      c.background.y + c.background.height + 12,
    );
    g.addChild(note);
    return g;
  }
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
  const camera = attachCamera(
    host,
    app.canvas,
    () => {
      cancelFrame();
      paint(performance.now());
    },
    cool
      ? {
          width: cool.width,
          height: cool.height,
          start: { x: cool.camera.start[0], y: cool.camera.start[1] },
          startViewWidth: cool.camera.startViewWidth,
        }
      : undefined,
  );
  const worldWidth = cool ? cool.width : 3200,
    worldHeight = cool ? cool.height : 1400;
  mini.eventMode = 'static';
  mini.cursor = 'pointer';
  mini.hitArea = {
    contains: (x: number, y: number) => x >= 0 && x <= 115 && y >= 0 && y <= 65,
  };
  const navigateMini = (e: import('pixi.js').FederatedPointerEvent) => {
    const p = e.getLocalPosition(mini);
    e.stopPropagation();
    camera.set({ x: p.x / (115 / worldWidth), y: p.y / (115 / worldWidth) });
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
  const roofIndoor = (
    d: World['disciples'][number],
    m: Motion,
    elapsed: number,
    moving: boolean,
  ) => {
    if (moving || !world || (world.tick <= 0 && !m.roofDebug)) return;
    const id = m.roofDebug ?? destinationBuilding(d);
    const roof = id ? roofFadeBuildings[id] : undefined;
    if (!id || !roof || !textures.has(roof.exterior.file)) return;
    const entrance = worldMap.slots.find((s) => s.id === id)!.entrance as Point;
    if (Math.hypot(m.toX - entrance[0], m.toY - entrance[1]) >= 0.1) return;
    const spot = indoorSpot(roof, entrance, m.indoorIndex ?? 0);
    const leg: [Point, Point] = [entrance, spot.point];
    const walked = ((elapsed - m.duration) / 1000) * walkSpeed;
    const length = pathLength(leg);
    return {
      id,
      leg,
      start: m.start + m.duration,
      point: alongPath(leg, walked),
      moving: walked < length,
      seat: spot.seat && walked >= length,
    };
  };
  let debugPaintTime: number | undefined;
  let lastPaint = 0;
  let lastTap = { id: '', at: 0 };
  let miniDrag = false;
  function paint(now: number) {
    now = debugPaintTime ?? now;
    if (!world) return;
    if (coolHall) {
      for (const [id, r] of [...pendingReplans]) {
        if (replanBudget <= 0) break;
        pendingReplans.delete(id);
        const m = motions.get(id);
        if (!m) continue;
        replanBudget--;
        replanMotion(m, r.x, r.y, r.ct, r.row, now);
      }
      const used = COOL_REPLAN_PER_FRAME - replanBudget;
      replanLog.total += used;
      replanLog.maxPerFrame = Math.max(replanLog.maxPerFrame, used);
      replanLog.deferred = Math.max(replanLog.deferred, pendingReplans.size);
      replanLog.maxGapMs = Math.max(replanLog.maxGapMs, now - lastPaint);
      replanBudget = COOL_REPLAN_PER_FRAME;
    }
    for (const child of scene.removeChildren())
      if (child !== coolGroundCache) child.destroy({ children: true });
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
    depthLayers?.update(cam, bounds, now);
    coolDepth?.update(cam, bounds);
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
      baseLoaded: cool ? true : textures.has(groundFile),
      buildingSprites: 0,
      discipleSprites: 0,
      fallbacks: 0,
      poses: {} as Record<string, number>,
      coolFrames: {} as Record<string, number>,
      coolActions: {} as Record<string, number>,
      coolChairs: 0,
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
      (cool ? (coolGroundCache ??= coolGround(1, true)) : art(groundFile, 1)) ??
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
    if (v4Active)
      for (const l of v4Layers.filter((l) => l.z >= 0)) {
        const sprite = art(l.file, 1);
        if (!sprite) {
          stats.fallbacks++;
          continue;
        }
        sprite.position.set(l.x, l.y);
        sprite.zIndex = l.z;
        sprite.label = l.file;
        scene.addChild(sprite);
      }
    // Round platforms are baked below bridges in world.webp.
    // ?cool=1：B5–B9 立绘（地面层 z=-900；其余按最低足迹角 y 与弟子排序）。门楼不属 sim 建筑，常显。
    const paintCoolBuilding = (id: string, alpha = 1): boolean => {
      if (v4Active) return true;
      if (!cool) return false;
      const layers = coolBuildingsFor(id);
      if (!layers.length || layers.some((l) => !textures.has(l.file)))
        return false;
      for (const l of layers) {
        const sprite = art(l.file, l.scale)!;
        sprite.position.set(l.x, l.y);
        sprite.zIndex = coolBuildingZ(l);
        sprite.alpha = alpha;
        sprite.eventMode = 'none';
        sprite.label = `cool-building:${l.id}`;
        scene.addChild(sprite);
        stats.buildingSprites++;
      }
      const x0 = Math.min(...layers.map((l) => l.x)),
        y0 = Math.min(...layers.map((l) => l.y)),
        x1 = Math.max(...layers.map((l) => l.x + l.size[0] * l.scale)),
        y1 = Math.max(...layers.map((l) => l.y + l.size[1] * l.scale));
      stats.buildings.push({
        id,
        z: Math.max(...layers.map(coolBuildingZ)),
        x: bounds.width / 2 + (x0 - cam.x) * cam.zoom,
        y: bounds.height / 2 + (y0 - cam.y) * cam.zoom,
        width: (x1 - x0) * cam.zoom,
        height: (y1 - y0) * cam.zoom,
      });
      return true;
    };
    if (cool) paintCoolBuilding('B_GATE');
    const gate = cool ? undefined : art(gateArt.file, 1);
    if (gate) {
      gate.position.set(gateArt.crop[0], gateArt.crop[1]);
      gate.zIndex = buildingSortY('B_GATE', gateArt.footY);
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
    // cool 主殿：落影(z=-905) / 台基层(z=hallZ-1) / 台阶层(z=hallZ-1，按楼层) / 内景层(z=-900) / 红毯(z=-899.5)
    // / 金柱(z=柱脚 y) / 外檐柱(z=hallZ-0.5, α=屋顶) / 外观屋顶层(z=hallZ, α=屋顶淡变)。
    // 屋顶完全不透明时不画内景与柱（被屋顶整盖）；只淡屋顶层与外檐柱（二 #14）。
    // v4g 楼层视图：固定楼层时屋顶按"殿内有人"同样淡出并保持；内景换成该层。
    coolRoof = coolRoofUpdate(
      coolRoof,
      coolOccupied || coolFloor !== 'auto',
      now,
    );
    const coolRoofNow = coolRoofHold ?? coolRoofAlpha(coolRoof, now);
    const coolRoomNow: CoolRoom = coolFloor === 'auto' ? 'main' : coolFloor;
    const paintCoolHall = (id: string): boolean => {
      if (!coolHall || id !== 'B_HALL') return false;
      const L = coolHall.layers;
      const add = (l: typeof L.base, z: number, alpha = 1) => {
        const sprite = art(l.file, l.scale);
        if (!sprite) return false;
        sprite.position.set(l.x, l.y);
        sprite.zIndex = z;
        sprite.alpha = alpha;
        sprite.eventMode = 'none';
        scene.addChild(sprite);
        return true;
      };
      if (!textures.has(L.base.file) || !textures.has(L.roof.file))
        return false;
      const floorNow = coolRoofNow < 1 ? coolRoomNow : 'outside';
      if (L.shadow) add(L.shadow, -905);
      add(L.base, coolHall.hallZ - 1);
      for (const s of L.stairs ?? [])
        if (s.floors.includes(floorNow)) add(s, coolHall.hallZ - 1);
      if (coolRoofNow < 1 && coolRoomNow !== 'main')
        add(L.rooms?.[coolRoomNow] ?? L.room, -900);
      if (coolRoofNow < 1 && coolRoomNow === 'main') {
        add(L.room, -900);
        if (L.carpet) add(L.carpet, -899.5);
        for (const c of L.columns) add(c, c.foot[1]);
        // 08 增补 R2：8 把交椅是殿内道具，只在屋顶淡出时随内景画；z 按坐点 y，略在坐者之下。
        for (const c of coolHall.chairs) {
          const chair = art(coolChairFile(c.face), coolDiscipleScale(height));
          if (!chair) continue;
          chair.position.set(c.point[0], c.point[1]);
          chair.zIndex = c.point[1] - 0.25;
          chair.eventMode = 'none';
          chair.label = 'cool-chair';
          scene.addChild(chair);
          stats.coolChairs++;
        }
      }
      if (coolRoofNow > 0) {
        add(L.roof, coolHall.hallZ, coolRoofNow);
        for (const c of L.outerColumns ?? [])
          add(c, coolHall.hallZ - 0.5, coolRoofNow);
      }
      stats.buildingSprites++;
      const x0 = L.roof.x,
        y0 = L.roof.y,
        w = L.base.x + L.base.size[0] * L.base.scale - x0,
        h = L.base.y + L.base.size[1] * L.base.scale - y0;
      stats.buildings.push({
        id,
        z: coolHall.hallZ,
        x: bounds.width / 2 + (x0 - cam.x) * cam.zoom,
        y: bounds.height / 2 + (y0 - cam.y) * cam.zoom,
        width: w * cam.zoom,
        height: h * cam.zoom,
      });
      return true;
    };
    // 屋顶淡出：内景紧贴在原建筑排序层之下（后墙能挡住屋后的弟子），外观在原建筑排序层，
    // 室内弟子抬到两者之上；淡变只改外观 alpha。
    const paintRoofBuilding = (
      id: string,
      level: number,
      group: Container,
    ): boolean => {
      const roof = roofFade ? roofFadeBuildings[id] : undefined;
      if (!roof) return false;
      const exteriorTexture = textures.get(roof.exterior.file),
        interiorTexture = textures.get(roof.interior.file),
        shadowTexture = textures.get(roof.shadow.file);
      if (!exteriorTexture || !interiorTexture) return false;
      const entrance = worldMap.slots.find((s) => s.id === id)!
        .entrance as Point;
      const base = level === 0 ? 0.45 : 1;
      const alpha = roofHold ?? roofAlpha(roofTweens.get(id), now);
      const place = (texture: Texture, layer: typeof roof.exterior) => {
        const sprite = new Sprite(texture);
        const m = layerMatrix(layer, entrance);
        sprite.setFromMatrix(new Matrix(m.a, m.b, m.c, m.d, m.tx, m.ty));
        sprite.eventMode = 'none';
        return sprite;
      };
      if (shadowTexture) {
        const shadow = place(shadowTexture, roof.shadow);
        shadow.zIndex = -905;
        shadow.alpha = base;
        scene.addChild(shadow);
      }
      const interior = place(interiorTexture, roof.interior);
      interior.label = `roof-interior:${id}`;
      interior.zIndex = group.zIndex - 0.5;
      interior.alpha = base;
      interior.visible = alpha < 1;
      scene.addChild(interior);
      const exterior = place(exteriorTexture, roof.exterior);
      exterior.label = `roof-exterior:${id}`;
      exterior.zIndex = group.zIndex;
      exterior.alpha = alpha * base;
      exterior.visible = alpha > 0;
      scene.addChild(exterior);
      const m = layerMatrix(roof.exterior, entrance);
      const mask = roofMasks.get(id);
      if (mask && alpha >= 0.5)
        occluders.push({ key: id, mask, x: m.tx, y: m.ty, z: group.zIndex });
      stats.buildings.push({
        id,
        z: group.zIndex,
        x: bounds.width / 2 + (m.tx - cam.x) * cam.zoom,
        y: bounds.height / 2 + (m.ty - cam.y) * cam.zoom,
        width: roof.exterior.width * m.a * cam.zoom,
        height: roof.exterior.height * m.d * cam.zoom,
      });
      stats.buildingSprites++;
      return true;
    };
    for (const def of buildingDefinitions) {
      const p = worldMap.slots.find((s) => s.id === def.id)!.rect,
        [x, baseY] = plotFoot(def.id);
      let drawX = x,
        y = baseY;
      const b = world.buildings.find((b) => b.id === def.id);
      const group = new Container();
      group.position.set(x, y);
      group.zIndex = sortY(def.id, baseY);
      // Empty sites keep their label/click target, without painting fictional stone plots.
      if (
        b &&
        !paintCoolHall(def.id) &&
        !paintCoolBuilding(def.id, b.level === 0 ? 0.45 : 1) &&
        !paintRoofBuilding(def.id, b.level, group)
      ) {
        const tier =
          (def.id === 'B_GARDEN' ? b.level : Math.min(b.level, def.maxLevel)) >=
          2
            ? 2
            : 1;
        const file = `building/${buildingArt[b.id]}-t${tier}-map@2x.webp`;
        const placement = worldBuildings.find((b) => b.file === file);
        // cool：沿用旧立绘与缩放作占位，但锚到冷色槽位脚印前角，忽略旧四岛的绝对坐标。
        drawX = cool ? x : (placement?.x ?? x);
        y = cool ? baseY : (placement?.y ?? baseY);
        group.position.set(drawX, y);
        group.zIndex = sortY(def.id, baseY);
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
            z: group.zIndex,
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
            for (const poly of split.extraPolygons ?? [])
              bodyMask.poly(poly.flat()).fill(0xffffff);
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
            for (const poly of split.extraPolygons ?? [])
              groundMask.poly(poly.flat()).cut();
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
        ...(v4Active
          ? {
              __worldV4: {
                assignments: () =>
                  [...spotPlanner.assignments].map(([id, a]) => ({ id, ...a })),
                // Presentation-only fixture: exercises draw transitions without writing app/sim/save state.
                awayFixture: (ids: string[], away: boolean) => {
                  if (!world) return;
                  for (const id of ids) {
                    const m = motions.get(id);
                    if (m) m.debugControlled = false;
                  }
                  const changed = world.disciples.map((d) =>
                    ids.includes(d.id)
                      ? {
                          ...d,
                          state: {
                            ...d.state,
                            awayUntil: away ? world!.tick + 100 : 0,
                            behavior: (away
                              ? '历练'
                              : '修炼') as World['disciples'][number]['state']['behavior'],
                          },
                        }
                      : d,
                  );
                  for (let i = 0; i < injected.length; i++)
                    injected[i] =
                      changed.find((d) => d.id === injected[i].id) ??
                      injected[i];
                  draw({ ...world, disciples: changed });
                },
                adaptationReports: v4AdaptationReports,
                arenaSeats: cool?.arenaSeats,
                spots: satelliteSpots,
                stages,
                subpositions: satelliteSpots.map((s) => ({
                  id: s.id,
                  points: subpositions(s),
                })),
                muster: musterPositions(),
                ringPair,
                textureStatus: () => ({
                  expected: v4Layers.length,
                  missing: v4Layers
                    .filter((l) => !textures.has(l.file))
                    .map((l) => l.file),
                  loading: false, // All blocks awaited before the first paint.
                }),
                motionState: () =>
                  [...motions].map(([id, m]) => ({
                    id,
                    expedition: m.expedition,
                    returnWaiting: m.returnWaiting,
                    transfer: m.transfer,
                    toX: m.toX,
                    toY: m.toY,
                    x: m.x,
                    y: m.y,
                    path: m.path,
                    duration: m.duration,
                  })),
                captureOnly: (enabled: boolean) => {
                  mini.visible = !enabled;
                  overlay.visible = !enabled;
                  host
                    .querySelectorAll<HTMLElement>('.camera-controls')
                    .forEach((e) => (e.style.display = enabled ? 'none' : ''));
                  cancelFrame();
                  paint(performance.now());
                },
                layers: v4Layers,
                uv,
                fade: v4Fade,
                expedition: (id: string, direction: 'out' | 'in' = 'out') => {
                  const m = motions.get(id);
                  if (!m) throw Error('Unknown disciple');
                  m.debugControlled = true;
                  debugPaintTime = undefined;
                  startExpedition(
                    m,
                    direction,
                    performance.now(),
                    worldMap.slots[0].entrance,
                  );
                  cancelFrame();
                  frame = requestFrame(paint);
                  return { duration: m.duration, path: m.path };
                },
                seek: (id: string, elapsed: number) => {
                  const m = motions.get(id);
                  if (!m) throw Error('Unknown disciple');
                  debugPaintTime = performance.now();
                  m.start = debugPaintTime - elapsed;
                  cancelFrame();
                  paint(performance.now());
                },
              },
            }
          : {}),
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
            pendingDistance: 0,
            lastPaint: performance.now(),
            start: performance.now(),
            duration:
              (pathLength(path) / (routeSpeed(path) * walkScale)) * 1000,
          });
          cancelFrame();
          frame = requestFrame(paint);
          return { from, to, duration: m.duration };
        },
        __motionDebug: {
          place: (id: string, requested: Point, pose = 'walk-pass') => {
            debugPaintTime = undefined;
            const m = motions.get(id);
            if (!m) throw Error('Unknown disciple');
            const point = nearestWalkable(requested);
            Object.assign(m, {
              debugControlled: true,
              expedition: undefined,
              transfer: undefined,
              debugPose: pose,
              x: point[0],
              y: point[1],
              toX: point[0],
              toY: point[1],
              path: [point],
              duration: 0,
              start: performance.now(),
              pendingDistance: 0,
              lastPaint: performance.now(),
            });
            cancelFrame();
            paint(performance.now());
            return point;
          },
          route: (id: string, from: Point, to: Point) => {
            const m = motions.get(id);
            if (!m) throw Error('Unknown disciple');
            if (!walkable(from) || !walkable(to))
              throw Error('Debug route endpoint blocked');
            const path = findPath(from, to);
            if (!path.length) throw Error('Debug route unreachable');
            Object.assign(m, {
              debugControlled: true,
              expedition: undefined,
              transfer: undefined,
              debugPose: 'walk-pass',
              x: from[0],
              y: from[1],
              toX: to[0],
              toY: to[1],
              path,
              start: performance.now(),
              duration:
                (pathLength(path) / routeSpeed(path) / walkScale) * 1000,
              pendingDistance: 0,
              lastPaint: performance.now(),
            });
            cancelFrame();
            paint(performance.now());
            return { from, to, path, duration: m.duration };
          },
        },
        ...(roofFade
          ? {
              __roofFade: {
                state: roofState,
                hold: (alpha?: number) => {
                  roofHold = alpha;
                  cancelFrame();
                  paint(performance.now());
                },
                /** 调试：让弟子从门前空地走到门口再进屋。 */
                enter: (id: string, building: string, pose?: string) => {
                  const m = motions.get(id);
                  if (!m) throw Error('Unknown disciple');
                  const entrance = worldMap.slots.find(
                    (s) => s.id === building,
                  )!.entrance as Point;
                  const from = nearestWalkable([
                    entrance[0] - 36,
                    entrance[1] + 22,
                  ]);
                  const path = findPath(from, entrance);
                  if (!path.length) throw Error('Entrance unreachable');
                  Object.assign(m, {
                    debugControlled: true,
                    debugPose: pose,
                    roofDebug: building,
                    roofIndoor: undefined,
                    indoorIndex: [...motions.values()].filter(
                      (o) => o !== m && o.roofDebug === building,
                    ).length,
                    x: from[0],
                    y: from[1],
                    toX: entrance[0],
                    toY: entrance[1],
                    path,
                    start: performance.now(),
                    duration:
                      (pathLength(path) / routeSpeed(path) / walkScale) * 1000,
                    pendingDistance: 0,
                    lastPaint: performance.now(),
                  });
                  cancelFrame();
                  paint(performance.now());
                  return { from, entrance, duration: m.duration };
                },
                /** 调试：从当前位置（室内）走回门口再到门前空地。 */
                leave: (id: string) => {
                  const m = motions.get(id);
                  if (!m?.roofDebug) throw Error('Not inside');
                  const entrance = worldMap.slots.find(
                    (s) => s.id === m.roofDebug,
                  )!.entrance as Point;
                  const to = nearestWalkable([
                    entrance[0] - 36,
                    entrance[1] + 22,
                  ]);
                  const path: Point[] = [[m.x, m.y], ...findPath(entrance, to)];
                  Object.assign(m, {
                    roofDebug: undefined,
                    roofIndoor: undefined,
                    toX: to[0],
                    toY: to[1],
                    path,
                    start: performance.now(),
                    duration:
                      (pathLength(path) / routeSpeed(path) / walkScale) * 1000,
                    pendingDistance: 0,
                    lastPaint: performance.now(),
                  });
                  cancelFrame();
                  paint(performance.now());
                  return { to, duration: m.duration };
                },
              },
            }
          : {}),
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
    const roofOccupied = new Set<string>();
    let hallOccupied = false;
    const coolSeats: Record<string, unknown>[] = [];
    for (const d of world.disciples) {
      const m = motions.get(d.id);
      if (!m) continue;
      if (m.returnWaiting) {
        const occupied = [...motions.values()].some(
          (other) =>
            other !== m &&
            !other.returnWaiting &&
            !(
              other.expedition === 'out' &&
              now - other.start >= other.duration + 800
            ) &&
            Math.hypot(other.x - m.x, other.y - m.y) < 45.92,
        );
        m.start = now;
        m.returnWaiting = occupied;
        active ||= occupied;
      }
      const elapsed = Math.max(0, now - m.start);
      const moving = elapsed < m.duration;
      active ||= moving;
      const travelledOnPath = motionDistance(m, elapsed);
      const pathFoot = alongPath(m.path, travelledOnPath);
      // cool 主殿：门口一个身位内淡出/淡入，门内按殿内排序。
      const hallStatus = coolHall
        ? routeStatus(m.coolRoute, travelledOnPath)
        : undefined;
      if (
        hallStatus &&
        (hallStatus.inside || hallStatus.doorDistance < DOOR_FADE)
      )
        hallOccupied = true;
      // roofFade：到门口后不再淡出消失，走一小段表现层路线到室内站位。
      const indoor = roofFade ? roofIndoor(d, m, elapsed, moving) : undefined;
      m.roofIndoor = indoor
        ? { from: indoor.leg[0], to: indoor.leg[1], start: indoor.start }
        : undefined;
      const positionOnPath =
        m.transfer && elapsed >= m.transfer.arrive + 800
          ? m.transfer.target
          : (indoor?.point ?? pathFoot);
      const stepping = moving || !!indoor?.moving;
      active ||= stepping;
      if (indoor) roofOccupied.add(indoor.id);
      const dt = Math.max(0, (now - (m.lastPaint ?? now)) / 1000);
      const directionDt = Math.max(0, (now - (m.directionAt ?? now)) / 1000);
      const vx = directionDt > 0 ? (positionOnPath[0] - m.x) / directionDt : 0,
        vy = directionDt > 0 ? (positionOnPath[1] - m.y) / directionDt : 0;
      m.directionAt = now;
      m.facing = horizontalFacing(vx, m.facing);
      // Accumulate observed foot displacement, not commanded route speed/time.
      const travelled =
        Math.hypot(positionOnPath[0] - m.x, positionOnPath[1] - m.y) +
        (m.pendingDistance ?? 0);
      const gait = advanceGait(m.cycles ?? 0, travelled, dt, stepping, height);
      m.cycles = gait.cycles;
      m.pendingDistance = 0;
      m.lastPaint = now;
      [m.x, m.y] = positionOnPath;
      if (m.expedition === 'out' && elapsed >= m.duration + 800) continue;
      const group = new Container();
      group.position.set(m.x, m.y);
      group.zIndex = m.y;
      const pose = stepping
        ? gait.pose
        : (m.debugPose ??
          (v4Active &&
          (spotPlanner.assignments.get(d.id)?.spot?.id.startsWith('S_SWORD') ||
            spotPlanner.assignments.get(d.id)?.waitingSince !== undefined ||
            spotPlanner.assignments.get(d.id)?.fallback ||
            world.events.some((e) => e.definitionId === 'EV_A2'))
            ? 'talk'
            : behaviorPose(d.state.behavior, false)));
      const renderedFile = discipleArtFile(d.gender, pose);
      const flip = spriteFlip(renderedFile, m.facing);
      stats.poses[pose] = (stats.poses[pose] ?? 0) + 1;
      const entering =
        world.tick > 0 &&
        destinationBuilding(d) &&
        worldMap.slots.some(
          (s) =>
            s.id === destinationBuilding(d) &&
            Math.hypot(m.toX - s.entrance[0], m.toY - s.entrance[1]) < 0.1,
        );
      const expeditionAlpha =
        m.expedition === 'out'
          ? v4FadeContains(positionOnPath) ||
            (m.musterPoint &&
              Math.hypot(
                positionOnPath[0] - m.musterPoint[0],
                positionOnPath[1] - m.musterPoint[1],
              ) < 1)
            ? Math.max(0, 1 - (elapsed - m.duration) / 800)
            : 1
          : m.expedition === 'in'
            ? Math.min(1, elapsed / 800)
            : 1;
      active ||=
        !!m.expedition &&
        expeditionAlpha > 0 &&
        (m.expedition === 'out' || elapsed < 800);
      const transferAlpha = m.transfer
        ? elapsed < m.transfer.arrive
          ? 1
          : elapsed < m.transfer.arrive + 800
            ? 1 - (elapsed - m.transfer.arrive) / 800
            : Math.min(1, (elapsed - m.transfer.arrive - 800) / 800)
        : 1;
      active ||= !!m.transfer && elapsed < m.transfer.arrive + 1600;
      const alpha = Math.min(
        transferAlpha,
        expeditionAlpha,
        !v4Active && !m.expedition && entering && !moving && !indoor
          ? Math.max(0, 1 - (elapsed - m.duration) / 350)
          : 1,
        hallStatus?.alpha ?? 1,
      );
      active ||= !!entering && !moving && alpha > 0 && !indoor;
      if (roofFade)
        for (const [id, roof] of Object.entries(roofFadeBuildings)) {
          const entrance = worldMap.slots.find((s) => s.id === id)!
            .entrance as Point;
          if (
            insideInset(
              [m.x, m.y],
              offsetPoints(roof.foundationTop, entrance),
              INDOOR_INSET,
            )
          )
            roofOccupied.add(id);
        }
      stats.disciples.push({
        id: d.id,
        x: m.x,
        y: m.y,
        z: group.zIndex,
        alpha,
        screenX: bounds.width / 2 + (m.x - cam.x) * cam.zoom,
        screenY: bounds.height / 2 + (m.y - cam.y) * cam.zoom,
        vx,
        vy,
        facing: m.facing,
        flip,
        phase: gait.phase,
        cycles: gait.cycles,
        pose,
        stride: strideLength(height),
        locomotion: gait.moving ? 'walk' : 'idle',
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
      const colors = cool
        ? coolRootColors(d.root.elements)
        : rootRingColors(d.root.elements);
      const file = discipleArtFile(d.gender, pose);
      // ?cool=1：精灵换新帧（身高比例不变：站立头顶→脚底 169 px 缩到 DISCIPLE_HEIGHT）；
      // 动作按坐姿判据（坐椅只在椅坐点、坐蒲团只在蒲团上），遮挡掩码按新帧轮廓。
      const coolSeat = stageHall
        ? (assembly?.seats.get(d.id) ??
          (sermon && sermonSeat(sermon, d.id)) ??
          dailyMap.get(d.id))
        : undefined;
      const coolAct = cool
        ? coolAction(pose, {
            kind: coolSeat?.kind ?? '',
            arrived: !moving,
            offset: Math.hypot(m.x - m.toX, m.y - m.toY),
          })
        : undefined;
      // 坐椅者朝向跟椅子（08 增补 2.3：两侧面向通道，无背面帧）。
      const coolFacing =
        coolAct === 'sitChair' && coolSeat?.face
          ? coolSeat.face === 'left'
            ? -1
            : 1
          : m.facing;
      const coolFile = coolAct
        ? coolFrame(
            d.gender === '女' ? 'f' : 'm',
            coolAct,
            gait.cycles,
            now,
            seedOf(d.id),
          )
        : undefined;
      if (coolAct)
        stats.coolActions[coolAct] = (stats.coolActions[coolAct] ?? 0) + 1;
      const sprite = compact
        ? undefined
        : coolFile
          ? art(coolFile, coolDiscipleScale(height))
          : art(file, height / 96);
      if (coolFile) {
        stats.disciples.at(-1)!.frame = coolFile;
        stats.disciples.at(-1)!.frameFlip = coolActionFlip(
          coolAct!,
          coolFacing,
        );
      }
      if (coolFile)
        stats.coolFrames[coolFile] = (stats.coolFrames[coolFile] ?? 0) + 1;
      const groundMarks = discipleGroundMarks(pose, height, compact);
      if (groundMarks.shadow) {
        const shadow = groundShadow(
          groundMarks.shadow.width,
          0,
          cool ? COOL_CONTACT_SHADOW : groundMarks.shadow.color,
        );
        shadow.position.set(groundMarks.shadow.x, groundMarks.shadow.y);
        shadow.label = 'contact-shadow';
        group.addChild(shadow);
      }
      // Missing art keeps the ring: dot + ring is then the only identity mark.
      const ring = new Graphics();
      ring.label = 'root-ring';
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
      // 坐在蒲团上不画灵根彩环。
      // ?cool=1：灵根环常显。
      if (cool || (groundMarks.ring && !indoor?.seat) || !sprite) {
        group.addChild(ring);
        stats.rings++;
      }
      const mask = masks.get(coolFile ?? file);
      // 室内弟子按脚底 y 排在外观之下，不做“露头抬层”。
      if (mask && !compact && !indoor && !hallStatus?.inside) {
        const facing = coolAct ? coolActionFlip(coolAct, coolFacing) : flip;
        const key = JSON.stringify([
          coolFile ?? file,
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
      // cool 主殿排序：殿内按脚底 y（在台基层、屋顶层之下，柱子按柱脚 y 互相遮挡）；
      // 台阶上画在整座主殿之上；殿外按前缘线规则。
      if (coolHall && hallStatus) {
        const foot: Point = [m.x, m.y];
        const onStairs =
          !hallStatus.inside &&
          !walkable(foot) &&
          approachParam(coolHall, foot).d < 24;
        group.zIndex = hallStatus.inside
          ? m.y
          : onStairs
            ? coolHall.hallZ + 1
            : Math.max(group.zIndex, outdoorZ(coolHall, foot));
        const seat = coolSeat;
        coolSeats.push({
          id: d.id,
          inside: hallStatus.inside,
          onStairs,
          doorAlpha: hallStatus.alpha,
          seat: seat && { kind: seat.kind, index: seat.index },
          arrived: !moving,
          speed: m.speedFactor ?? 1,
          action: coolAct,
          frame: coolFile,
          cycles: gait.cycles,
          x: m.x,
          y: m.y,
          z: group.zIndex,
        });
      }
      // roofFade：室内弟子画在内景与外观之上（外观此时正淡出或已隐藏）。
      if (indoor)
        group.zIndex = Math.max(
          group.zIndex,
          buildingSortY(indoor.id, plotFoot(indoor.id)[1]) + 0.5,
        );
      stats.disciples.at(-1)!.z = group.zIndex;
      if (compact) stats.markers++;
      if (sprite) {
        sprite.scale.x *= coolAct ? coolActionFlip(coolAct, coolFacing) : flip;
        // 坐蒲团帧（帧内含蒲团）：蒲团中心对齐脚点。
        if (coolAct === 'sitCushion') sprite.y += coolCushionFootOffset(height);
        // 仍为占位的动作槽：仅 ?debug=1 角标「占位」（槽表 placeholder 字段）。
        if (
          coolAct &&
          coolFramePlaceholder(coolAct) &&
          params.get('debug') === '1'
        ) {
          const badge = label('占位', 10);
          badge.position.set(0, -height - 4);
          group.addChild(badge);
        }
        group.addChild(sprite);
        stats.discipleSprites++;
      } else if (!compact) {
        group.addChild(new Graphics().circle(0, -8, 9).fill(0x4f8a8b));
        stats.fallbacks++;
      }
      group.alpha = alpha;
      // v4g 厅视图：殿内弟子都在一层正殿；看左右厅时不画（sim 不变，只是不显示）。
      if (
        coolHall &&
        hallStatus?.inside &&
        coolRoomNow !== 'main' &&
        coolRoofNow < 1
      )
        group.visible = false;
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
    if (stageHall && sermon) {
      // 08 增补 R5：P9 讲道位淡光 + 大能 D5 站台阶顶（面向广场 = 正面 3/4，不翻转），
      // 都在屋顶层之上（台阶顶在外观立面之前）；听众蒲团在广场，z 同殿外弟子排序、略在坐者之下。
      const k = coolDiscipleScale(height);
      const ma = sermonMasterAlpha(sermon);
      const st = stageHall.stairTop;
      const spot = art(coolPropFile('sermonSpot'), k);
      if (spot && ma > 0) {
        spot.position.set(st[0], st[1]);
        spot.zIndex = stageHall.hallZ + 0.25;
        spot.alpha = ma;
        spot.eventMode = 'none';
        spot.label = 'cool-sermon-spot';
        scene.addChild(spot);
      }
      const act = sermonMasterAction(sermon);
      const master = art(
        coolMasterFile(
          act,
          act === 'flick' ? sermon.clock - sermon.phaseStart : sermon.clock,
        ),
        k,
      );
      if (master && ma > 0) {
        master.position.set(st[0], st[1]);
        master.zIndex = stageHall.hallZ + 0.5;
        master.alpha = ma;
        master.eventMode = 'none';
        master.label = 'cool-sermon-master';
        scene.addChild(master);
      }
      for (const c of sermon.cushions.values()) {
        const alpha = cushionAlpha(sermon, c);
        if (alpha <= 0) continue;
        const cushion = art(coolPropFile('cushionSermon'), k);
        if (!cushion) continue;
        cushion.position.set(c.point[0], c.point[1]);
        // v4 cushions sit on outdoor ground; v3 hall-front lifting would cover the listeners.
        cushion.zIndex = v4Active
          ? c.point[1] - 0.25
          : outdoorZ(stageHall, c.point) - 0.25;
        cushion.alpha = alpha;
        cushion.eventMode = 'none';
        cushion.label = 'cool-cushion';
        scene.addChild(cushion);
      }
      active = true;
    }
    if (stageHall) {
      coolOccupied = hallOccupied;
      active ||=
        roofAnimatingCool(coolRoof, now) ||
        (hallOccupied || coolFloor !== 'auto') !== (coolRoof.to === 0);
      lastCoolSeats = coolSeats;
      if (assembly && assemblyEnabled) {
        // 召集时钟只在未暂停（未按老板键、页面可见）时走；单帧最多计 100 ms。
        const dt =
          paused || assemblyLast === undefined
            ? 0
            : Math.min(100, now - assemblyLast);
        assemblyLast = now;
        const participants = [...assembly.seats.keys()].filter((id) =>
          motions.has(id),
        );
        const allArrived = participants.every((id) => {
          const m = motions.get(id)!;
          const seat = assembly!.seats.get(id)!;
          return (
            !!seat.point &&
            now - m.start >= m.duration &&
            Math.hypot(m.toX - seat.point[0], m.toY - seat.point[1]) < 0.5
          );
        });
        const before = assembly.released.size;
        const phase = assembly.phase;
        assembly = assemblyTick(assembly, dt, allArrived);
        active = true;
        if (
          !assembly ||
          assembly.released.size !== before ||
          assembly.phase !== phase
        )
          queueMicrotask(() => world && draw(world));
        // 召集中调用的讲道：召集散场结束后开始。
        if (!assembly && pendingSermon !== undefined) {
          const ms = pendingSermon;
          pendingSermon = undefined;
          queueMicrotask(() => {
            if (!sermon && !assembly) beginSermon(ms);
            if (world) draw(world);
          });
        }
      }
      if (sermon) {
        const dt =
          paused || sermonLast === undefined
            ? 0
            : Math.min(100, now - sermonLast);
        sermonLast = now;
        const s = sermon;
        const allArrived = [...s.cushions.keys()].every((id) => {
          const m = motions.get(id);
          const seat = sermonSeat(s, id);
          if (!m || !seat) return true;
          return (
            now - m.start >= m.duration &&
            Math.hypot(m.toX - seat.point![0], m.toY - seat.point![1]) < 0.5
          );
        });
        const phase = s.phase,
          released = s.releasedCount;
        sermon = sermonTick(s, dt, allArrived);
        active = true;
        if (
          sermon &&
          phase === 'lecture' &&
          sermon.phase === 'disperse' &&
          sermon.queuedAssembly.length
        ) {
          handoffSermon(sermon);
          const reasons = sermon.queuedAssembly.splice(0);
          sermonLog.push({ at: now, event: 'handoff' });
          queueMicrotask(() => {
            if (!world) return;
            const list = presentDisciples(world);
            const join = new Map(world.disciples.map((d, i) => [d.id, i]));
            beginAssembly(reasons, seniorityOrder(list, join), seatedSet(list));
            draw(world);
          });
        } else if (
          !sermon ||
          sermon.phase !== phase ||
          sermon.releasedCount !== released
        ) {
          if (!sermon) sermonLog.push({ at: now, event: 'end' });
          queueMicrotask(() => world && draw(world));
        }
      }
    }
    if (roofFade)
      for (const id of Object.keys(roofFadeBuildings)) {
        const next = retargetRoof(
          roofTweens.get(id),
          roofOccupied.has(id),
          now,
        );
        if (next) roofTweens.set(id, next);
        active ||= roofAnimating(next, now);
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
        .fill({ color: cool ? cool.background.color : 0xf1e8d4, alpha: 0.9 })
        .stroke({ width: 1, color: 0x8a8578 }),
    );
    const miniScale = 115 / worldWidth;
    const miniArt = cool
      ? coolGround(miniScale, false)
      : art('map/world-mini.webp', 115 / 320);
    if (miniArt) mini.addChild(miniArt);
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
          Math.min(worldWidth, bounds.width / cam.zoom) * miniScale,
          Math.min(worldHeight, bounds.height / cam.zoom) * miniScale,
        )
        .stroke({ width: 1, color: 0xffffff }),
    );
    window.__mapStats = stats;
    callbacks.frame?.();
    app.render();
    window.__mapReady = true;
    if (
      (active || breathingGlow || !!followed || pendingReplans.size > 0) &&
      !paused
    )
      frame = requestFrame(paint);
    else frame = 0;
  }
  // cool：本次 draw 每个可见弟子的目标点（召集席位 / 日常站位 / sim 落点）。
  function coolPlan(w: World, list: World['disciples'], destinations: Point[]) {
    const hall = stageHall!;
    const joinOrder = new Map(w.disciples.map((d, i) => [d.id, i]));
    const order = () => seniorityOrder(list, joinOrder);
    // 触发只看真实弟子（调试注入的不算入门）。
    const realWorld = injected.length
      ? { ...w, disciples: w.disciples.filter((d) => !injected.includes(d)) }
      : w;
    const reasons = assemblyEnabled
      ? detectTriggers(triggerState, realWorld)
      : [];
    triggerState = snapshotTriggers(realWorld);
    if (reasons.length) beginAssembly(reasons, order(), seatedSet(list));
    if (assembly) {
      const ids = new Set(list.map((d) => d.id));
      // 离山（历练）者不在图上：席位留空不补。
      for (const id of [...assembly.seats.keys()])
        if (!ids.has(id)) assembly.seats.delete(id);
      // 历练归来 / 新入门 / 调试注入：补到最后一个空席位，不整体重排。
      const seated = seatedSet(list);
      for (const id of order())
        if (!assembly.seats.has(id))
          addLateJoiner(
            hall,
            assembly.seats,
            id,
            v4Active ? false : seated(id),
          );
    }
    if (sermon) {
      const ids = new Set(list.map((d) => d.id));
      for (const id of sermon.cushions.keys())
        if (!ids.has(id)) leaveSermon(sermon, id);
      // 讲道期间新入门 / 历练归来 / 注入：补下一个空蒲团，不重排（4.6）。
      if (sermon.phase === 'gather' || sermon.phase === 'lecture')
        for (const id of order())
          if (!sermon.cushions.has(id)) addSermonJoiner(hall, sermon, id);
    }
    const sermonHeld = (id: string) =>
      sermon ? sermonSeat(sermon, id) : undefined;
    const holds = (id: string) =>
      (!!assembly && assembly.seats.has(id) && !assembly.released.has(id)) ||
      !!sermonHeld(id);
    // 日常分流只对没有召集席位的人生效（召集开始即暂停日常规则）。
    const goers = list
      .filter(
        (d) =>
          w.tick > 0 && !holds(d.id) && destinationBuilding(d) === 'B_HALL',
      )
      .map((d) => d.id);
    dailyMap = v4Active ? new Map() : dailySeats(hall, dailyMap, goers);
    if (v4Active) {
      if (assembly) outdoorSeats(assembly.seats);
      if (sermon)
        for (const c of sermon.cushions.values())
          c.point = v4Cushions[c.index % v4Cushions.length];
    }
    const socials = worldMap.spots
      .filter((s) => s.kind === 'social')
      .map((s) => s.point as Point)
      .filter(
        (p) =>
          Math.hypot(p[0] - hall.entrance[0], p[1] - hall.entrance[1]) > 84,
      );
    const overflow = (k: number) =>
      spacedLanding(
        nearestWalkable(socials[k % socials.length]),
        [],
        Math.floor(k / socials.length),
      );
    return list.map((d, i) => {
      const held = holds(d.id)
        ? (sermonHeld(d.id) ?? assembly!.seats.get(d.id))
        : undefined;
      const seat = held ?? dailyMap.get(d.id);
      return {
        point: seat ? (seat.point ?? overflow(seat.index)) : destinations[i],
        inside: !!seat?.inside,
        // 08 增补 1.1：聚集段 ×1.6（含仪式中仍在路上的迟到者）；散场放人后恢复 1.0。
        speedFactor: held ? gatherSpeedFactor() : undefined,
      };
    });
  }
  // 08 增补 2.1：有座资格（demo = 筑基）。
  function seatedSet(list: readonly World['disciples'][number][]) {
    const ids = new Set(list.filter(chairEligible).map((d) => d.id));
    return (id: string) => ids.has(id);
  }
  function presentDisciples(w: World) {
    return w.disciples.filter(
      (d) =>
        d.stage !== '坐化' && !d.state.awayUntil && d.state.behavior !== '历练',
    );
  }
  function beginSermon(durationMs: number) {
    if (!world || !stageHall) return;
    const list = presentDisciples(world);
    const join = new Map(world.disciples.map((d, i) => [d.id, i]));
    sermon = startSermon(stageHall, seniorityOrder(list, join), durationMs);
    if (v4Active)
      for (const c of sermon.cushions.values())
        c.point = v4Cushions[c.index % v4Cushions.length];
    sermonLast = undefined;
    sermonLog.push({ at: performance.now(), event: 'start' });
  }
  function beginAssembly(
    reasons: string[],
    order: string[],
    seated: (id: string) => boolean,
  ) {
    assemblyLog.push({ at: performance.now(), reasons });
    // 讲道中触发召集：讲道结束后直接聚集（从蒲团出发，不先散开）；已在散场则立即交接。
    if (sermon && sermon.phase !== 'outro') {
      sermon.queuedAssembly.push(...reasons);
      if (sermon.phase !== 'disperse') return;
      handoffSermon(sermon);
      reasons = sermon.queuedAssembly.splice(0);
      sermonLog.push({ at: performance.now(), event: 'handoff' });
    }
    if (assembly) for (const r of reasons) retriggerAssembly(assembly, r);
    else {
      assembly = startAssembly(
        stageHall!,
        order,
        reasons.join('、'),
        v4Active ? () => false : seated,
      );
      if (v4Active) outdoorSeats(assembly.seats);
      for (const r of reasons.slice(1)) retriggerAssembly(assembly, r);
      assemblyLast = undefined;
    }
  }
  type CoolTarget = ReturnType<typeof coolPlan>[number];
  function replanMotion(
    m: Motion,
    x: number,
    y: number,
    ct: CoolTarget | undefined,
    row: number,
    now: number,
  ) {
    const previousFoot: [number, number] = [m.x, m.y];
    [m.x, m.y] =
      m.transfer && now - m.start >= m.transfer.arrive + 800
        ? m.transfer.target
        : alongPath(m.path, motionDistance(m, Math.max(0, now - m.start)));
    const indoor = m.roofIndoor;
    if (indoor)
      [m.x, m.y] = alongPath(
        [indoor.from, indoor.to],
        ((now - indoor.start) / 1000) * walkSpeed,
      );
    m.pendingDistance =
      (m.pendingDistance ?? 0) +
      Math.hypot(m.x - previousFoot[0], m.y - previousFoot[1]);
    let path: Point[];
    if (coolHall) {
      // cool 主殿：进出殿走 入口→台阶顶→门→席位 的表现层折线，从当前位置接着走。
      const foot: Point = [m.x, m.y];
      const st = routeStatus(
        m.coolRoute,
        motionDistance(m, Math.max(0, now - m.start)),
      );
      const where = st.inside
        ? 'inside'
        : !walkable(foot) && approachParam(coolHall, foot).d < 24
          ? 'stairs'
          : 'outdoor';
      const route = planHallRoute(
        coolHall,
        foot,
        where,
        [x, y],
        !!ct?.inside,
        findPath,
      );
      if (!route) return;
      path = route.path;
      m.coolRoute = route;
      m.speedFactor = ct?.speedFactor;
    } else {
      // 从室内站位先走回门口，再接正常寻路，不瞬移。
      const outdoor = findPath(indoor ? indoor.from : [m.x, m.y], [x, y]);
      path = indoor && outdoor.length ? [[m.x, m.y], ...outdoor] : outdoor;
    }
    if (!path.length) return;
    m.roofIndoor = undefined;
    m.transfer = undefined;
    m.path = path;
    m.duration = coolMotionMs(
      pathLength(path),
      routeSpeed(path),
      walkScale,
      m.speedFactor,
    );
    m.row = row;
    m.fromX = m.x;
    m.fromY = m.y;
    m.toX = x;
    m.toY = y;
    m.start = now;
  }
  function startExpedition(
    m: Motion,
    direction: 'out' | 'in',
    now: number,
    target?: Point,
  ) {
    const others = [...motions.values()].filter((other) => other !== m);
    const reserved = others.flatMap((other) =>
      other.expedition && other.musterPoint
        ? [other.musterPoint]
        : [[other.x, other.y] as Point],
    );
    if (direction === 'out') {
      const occupiedSlots = new Set(
        others
          .filter((other) => !!other.expedition)
          .map((other) => other.musterSlot),
      );
      m.musterSlot =
        v4Island([m.x, m.y]) === 'main'
          ? ([0, 1, 2, 3, 4, 5].find((i) => !occupiedSlots.has(i)) ?? 6)
          : 6;
    }
    const muster =
      direction === 'out'
        ? expeditionLanding([m.x, m.y], reserved, undefined, m.musterSlot)
        : (m.musterPoint ?? v4Fade);
    m.musterPoint = muster;
    const from: Point = direction === 'out' ? [m.x, m.y] : muster;
    const stationary =
      Math.hypot(from[0] - muster[0], from[1] - muster[1]) < 0.01;
    let route: Point[] = [from, from];
    if (direction === 'out' && !stationary) {
      const approach = findPath(from, v4Route[0]);
      const landing = findPath(v4Fade, muster);
      if (approach.length && landing.length)
        route = [...approach, ...v4Route.slice(1), ...landing.slice(1)];
      else {
        console.warn('v4 expedition route unavailable; fading at origin', {
          from,
          muster,
        });
        m.musterPoint = from;
      }
    }
    if (direction === 'out') m.departurePath = route;
    // Satellite/overflow return stays at origin. Main-platform return retraces its route after fading in.
    if (direction === 'in' && (m.departurePath?.length ?? 0) > 2) {
      route = [...m.departurePath!].reverse();
      if (target) route.push(...findPath(route.at(-1)!, target).slice(1));
    }
    // Occupied landings delay appearance; they never relocate the return.
    Object.assign(m, {
      x: from[0],
      y: from[1],
      fromX: from[0],
      fromY: from[1],
      toX: route.at(-1)![0],
      toY: route.at(-1)![1],
      path: route,
      start: now,
      duration:
        (pathLength(route) / (routeSpeed(route) * walkScale)) * 1000 +
        (direction === 'in' ? 800 : 0),
      expedition: direction,
      returnWaiting: direction === 'in',
      transfer: undefined,
    });
  }
  function draw(w: World) {
    cancelFrame();
    frame = 0;
    paused = host.ownerDocument?.hidden ?? document.hidden;
    // cool 调试注入的弟子只在表现层存在（world 的浅拷贝），不进 sim。
    const real = injected.length
      ? w.disciples.filter((d) => !injected.some((x) => x.id === d.id))
      : w.disciples;
    world = injected.length ? { ...w, disciples: [...real, ...injected] } : w;
    const now = performance.now(),
      visible = new Set<string>();
    const visibleDisciples = world.disciples.filter(
      (d) =>
        d.stage !== '坐化' && !d.state.awayUntil && d.state.behavior !== '历练',
    );
    const departing = new Set<string>();
    if (v4Active)
      for (const d of world.disciples) {
        if (
          d.stage === '坐化' ||
          (!d.state.awayUntil && d.state.behavior !== '历练')
        )
          continue;
        expeditionAway.add(d.id);
        const m = motions.get(d.id);
        if (m) {
          departing.add(d.id);
          if (m.expedition !== 'out') startExpedition(m, 'out', now);
        }
      }
    const destinations = v4Active
      ? spotPlanner.plan(
          world,
          visibleDisciples,
          new Map([...motions].map(([id, m]) => [id, [m.x, m.y] as Point])),
        )
      : discipleDestinations(visibleDisciples, w.tick);
    if (v4Active) {
      const event = world.events.find((e) => e.definitionId === 'EV_A2');
      if (event) {
        const actors = Object.values(event.roles);
        const order = [
          ...actors,
          ...presentDisciples(world)
            .map((d) => d.id)
            .filter((id) => !actors.includes(id)),
        ];
        const points = duelPositions(order.length);
        for (let i = 0; i < visibleDisciples.length; i++) {
          const index = order.indexOf(visibleDisciples[i].id);
          if (index >= 0) destinations[i] = points[index];
        }
      }
    }
    const coolTargets = stageHall
      ? coolPlan(world, visibleDisciples, destinations)
      : undefined;
    const indoorCounts = new Map<string, number>();
    for (const [i, d] of visibleDisciples.entries()) {
      visible.add(d.id);
      const ct = coolTargets?.[i];
      const [x, y] = ct ? ct.point : destinations[i];
      const row = i > 2 ? 1 : 0;
      let m = motions.get(d.id);
      const roofId = roofFade ? destinationBuilding(d) : undefined;
      const indoorIndex =
        roofId && roofFadeBuildings[roofId]
          ? (indoorCounts.get(roofId) ?? 0)
          : undefined;
      if (roofId && indoorIndex !== undefined)
        indoorCounts.set(roofId, indoorIndex + 1);
      if (m?.debugControlled) continue;

      if (v4Active) {
        if (expeditionAway.has(d.id) && !m) {
          m = {
            x: v4Fade[0],
            y: v4Fade[1],
            fromX: v4Fade[0],
            fromY: v4Fade[1],
            toX: v4Fade[0],
            toY: v4Fade[1],
            start: now,
            facing: 1,
            row,
            path: [v4Fade],
            duration: 0,
            expedition: 'out',
          };
          motions.set(d.id, m);
        }
        if (m?.expedition === 'out') {
          expeditionAway.delete(d.id);
          startExpedition(m, 'in', now, [x, y]);
          continue;
        }
        if (
          m?.expedition === 'in' &&
          (m.returnWaiting || now - m.start < m.duration)
        )
          continue;
        if (m) m.expedition = undefined;
      }
      if (m?.transfer && now - m.start < m.transfer.arrive + 1600) continue;
      if (!m && v4Active) {
        m = {
          x: v4Spawn[0],
          y: v4Spawn[1],
          fromX: v4Spawn[0],
          fromY: v4Spawn[1],
          toX: v4Spawn[0],
          toY: v4Spawn[1],
          start: now,
          facing: 1,
          row,
          path: [v4Spawn],
          duration: 0,
        };
        motions.set(d.id, m);
      }
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
          indoorIndex,
          ...(ct?.inside
            ? { coolRoute: { path: [[x, y]], insideBefore: true } }
            : {}),
        });
      else {
        m.row = row;
        m.indoorIndex = indoorIndex;
        // cool：目标不变但聚集提速开/关（如召集席位恰是日常站位）且仍在路上 → 从当前位置重排一段。
        const speedChanged =
          !!coolHall &&
          (m.speedFactor ?? 1) !== (ct?.speedFactor ?? 1) &&
          now - m.start < m.duration;
        if (m.toX !== x || m.toY !== y || speedChanged) {
          // 08 增补 R6：cool 召集/讲道相位切换时重寻路分帧，每帧最多 COOL_REPLAN_PER_FRAME 人，其余顺延到后续帧。
          if (coolHall && replanBudget <= 0) {
            pendingReplans.set(d.id, { x, y, ct, row });
            continue;
          }
          pendingReplans.delete(d.id);
          if (coolHall) replanBudget--;
          replanMotion(m, x, y, ct, row, now);
          if (
            v4Active &&
            !assembly &&
            !sermon &&
            !world.events.some((e) => e.definitionId === 'EV_A2')
          ) {
            const a = spotPlanner.assignments.get(d.id);
            const transfer =
              a?.spot &&
              bridgeTransfer(
                [m.x, m.y],
                [x, y],
                a.spot.island,
                d.state.stepsLeft,
                WALK_SPEED,
              );
            if (transfer?.path.length) {
              m.path = transfer.path;
              m.duration =
                (pathLength(m.path) / (routeSpeed(m.path) * walkScale)) * 1000;
              m.transfer = { target: [x, y], arrive: m.duration };
            }
          }
        } else pendingReplans.delete(d.id);
      }
    }
    for (const id of motions.keys())
      if (!visible.has(id) && !departing.has(id)) motions.delete(id);
    for (const id of pendingReplans.keys())
      if (!visible.has(id)) pendingReplans.delete(id);
    paint(now);
  }
  // depth=1：云海/前景雾缓慢漂移。只在没有整帧重画排队时低频刷新纵深层，再 render 一次。
  let depthTimer = 0,
    depthLast = 0;
  const depthWindow = host.ownerDocument?.defaultView ?? window;
  const depthTick = (now: number) => {
    depthTimer = depthWindow.requestAnimationFrame(depthTick);
    if (!depthLayers || paused || frame !== 0 || !world) return;
    if (now - depthLast < 1000 / DEPTH.animateFps) return;
    depthLast = now;
    depthLayers.update(camera.get(), app.canvas.getBoundingClientRect(), now);
    app.render();
  };
  if (depthLayers) depthTimer = depthWindow.requestAnimationFrame(depthTick);
  const resize =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => {
          const bounds = host.getBoundingClientRect();
          app.renderer.resize(bounds.width, bounds.height);
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
      if (v4Active) {
        spotPlanner.reset();
        injected.length = 0;
        assembly = undefined;
        sermon = undefined;
        triggerState = undefined;
        dailyMap.clear();
      }
      debugPaintTime = undefined;
      expeditionAway.clear();
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
        pendingDistance: 0,
        lastPaint: performance.now(),
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
      if (depthTimer) depthWindow.cancelAnimationFrame(depthTimer);
      resize?.disconnect();
      camera.destroy();
      app.destroy(true, { children: true });
    },
  };
}
