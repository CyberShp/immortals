// 场景纵深（开发开关 ?depth=1，默认关闭）。纯表现层：只读镜头与渲染时间，
// 不读写 sim 状态、不消耗 sim 随机数；关闭时 map.ts 不创建任何纵深对象、不加载任何纵深素材。
// 参数来源：Iris《场景纵深方案 v1》（/Volumes/Media/immortal-qa/art-rebuild/depth/depth-spec-v1.md）
// 第三节“分层与参数”表；每个键旁注明对应的表行。素材路径来自 depth-assets.json
// （scripts/depth-assets.mjs 按最新版本号同步生成），换正式素材不用改这里。
import assets from './depth-assets.json';
import shadows from './depth-shadows.json';

export type DepthBlend = 'normal' | 'screen' | 'multiply';
export type DepthAsset = {
  file: string;
  source: string;
  version: number;
  width: number;
  height: number;
  topColor: number;
  bottomColor: number;
};
export type DepthPart = {
  file: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type DepthPartsAsset = Omit<DepthAsset, 'file'> & { parts: DepthPart[] };
type Layers = typeof assets.layers;
const layer = (key: Exclude<keyof Layers, 'farIslands'>) =>
  (assets.layers[key] ?? null) as DepthAsset | null;
const farParts = (assets.layers.farIslands ?? null) as DepthPartsAsset | null;

/** 世界中心：视差层在此镜头位置与岛对齐（全景镜头即在此）。 */
export const WORLD_CENTER = { x: 1600, y: 700 } as const;
export const WORLD_SIZE = { width: 3200, height: 1400 } as const;

export const DEPTH = {
  /** spec 四节：岛外透明的世界底图（L4）。关闭时仍用 map/world.webp。 */
  world: assets.world.file,
  /** spec 三节 L0 天空+远峰+远云海：视差 0.15，normal。 */
  backdrop: {
    asset: layer('backdrop'),
    z: 0,
    parallax: 0.15,
    blend: 'normal' as DepthBlend,
    alpha: 1,
    /** 铺满时额外放大（防止取整露 1px 边）。 */
    overscan: 1.02,
    /**
     * 天空饱和度倍率（1 = 素材原样，0 = 灰度）。第二轮：默认降约 15% 与米色 UI 协调，Iris 看成图再定。
     * 加载时在 CPU 上对 L0 纹理与兜底渐变做 c' = Y + s·(c − Y)（Y 为 Rec.601 亮度），无逐帧开销。
     */
    skySaturation: 0.85,
  },
  /**
   * spec 三节 L1 远景小浮岛：视差 0.35，normal，alpha 0.8，缩放 0.3–0.5。
   * 素材 far_islands_v1 按连通域切成 5 张（parts，源图从左到右编号 1–5）。
   */
  farIslands: {
    asset: farParts,
    z: 1,
    parallax: 0.35,
    blend: 'normal' as DepthBlend,
    alpha: 0.8,
    /** 相对源图像素的基础缩放（世界 px / 源 px）。 */
    scale: 0.4,
    /** 屏幕缩放 = scale × itemScale × (1 − zoomFollow + zoomFollow·zoom)：远处物体随镜头缩放得更少。 */
    zoomFollow: 0.5,
    /**
     * 每个远岛的位置（视差 0.35 层的世界坐标，岛图中心）与个体缩放。错落排在远峰前、近岛后：
     * 默认镜头左上/右上天空与全景两侧各能看到几座，其余被近岛挡住一部分。
     */
    items: [
      { part: 1, x: 150, y: 150, scale: 1.0 },
      { part: 2, x: 1070, y: 400, scale: 0.85 },
      { part: 3, x: 2050, y: 475, scale: 0.9 },
      { part: 4, x: 2950, y: 225, scale: 0.75 },
      { part: 5, x: 2500, y: 351, scale: 1.05 },
    ],
  },
  /**
   * spec 三节 L2 中景云海（岛下）：视差 0.6，normal，每分钟 20–40 px 横向漂移。
   * 正式素材（cloud_sea_v?，带透明）未出时用 mist_screen 样图占位：黑底白雾按 screen 语义
   * 转成“白色 + alpha=亮度”（与 screen 混合数学等价），所以占位时混合仍记作 screen。
   */
  cloudSea: {
    asset: layer('cloudSea') ?? layer('mist'),
    placeholder: !layer('cloudSea'),
    z: 2,
    parallax: 0.6,
    blend: (layer('cloudSea') ? 'normal' : 'screen') as DepthBlend,
    /** 正式素材自带 alpha（亮度→alpha、反预乘），层 alpha 取 1；占位时 0.85。 */
    alpha: layer('cloudSea') ? 1 : 0.85,
    /**
     * 云海饱和度倍率（1 原样），公式同 backdrop.skySaturation，加载时 CPU 处理一次正式素材（占位不处理）。
     * 2026-10-30 试 0.85：与 1.0 截图逐像素最大差 5/255，肉眼几乎无差别，按 Iris“效果不明显就保持原样”定为 1。
     */
    saturation: 1 as number,
    /**
     * 世界 y：云海带顶边（纹理顶边，素材上 ~39% 为透明的消散区）。主岛/西岛/东岛崖底约 1140–1270，
     * 可见云顶约在 top + 0.39·height ≈ 1000，托住崖底。
     */
    top: layer('cloudSea') ? 720 : 880,
    /** 云海带高度（世界 px，按 zoom 缩放后再乘视差层的缩放）。 */
    height: 760,
    /** 横向平铺一格的世界宽度。 */
    tileWidth: 1700,
    driftPxPerMin: 30,
  },
  /** spec 三节 L3 岛落影：软椭圆 #5a5a7a、alpha 0.18、模糊、视差 0.85、multiply。 */
  islandShadow: {
    z: 3,
    parallax: 0.85,
    blend: 'multiply' as DepthBlend,
    color: 0x5a5a7a,
    /** 第二轮：0.18 → 0.26（Iris 同意）。 */
    alpha: 0.26,
    /** 椭圆中心在崖底下方多少世界 px。 */
    offsetY: 70,
    /** 椭圆半宽 = 岛面宽 × rx；半高 = 岛面宽 × ry。 */
    rx: 0.5,
    ry: 0.11,
    /** 软边：径向渐变从中心不透明到边缘 0 的起始比例（模拟模糊）。 */
    softStart: 0.25,
    islands: shadows.islands,
  },
  /** spec 三节 L5 全局光：视差 0（屏幕固定）。 */
  light: {
    z: 5,
    warm: { color: 0xfff1d0, alpha: 0.12, blend: 'screen' as DepthBlend },
    cool: { color: 0x3a3a66, alpha: 0.1, blend: 'multiply' as DepthBlend },
    vignette: { color: 0x000000, alpha: 0.1, blend: 'normal' as DepthBlend },
    /** 暗角从屏幕中心半径的多少比例开始变暗。 */
    vignetteInner: 0.6,
    enabled: true,
  },
  /** spec 三节 L6 前景薄雾：mist_screen，screen，alpha 0.35，视差 1.15，只贴左右下边缘，覆盖 ≤12%。 */
  mist: {
    asset: layer('mist'),
    z: 6,
    parallax: 1.15,
    blend: 'screen' as DepthBlend,
    alpha: 0.35,
    /** 边缘带：左右各占屏宽比例、底部占屏高比例（带内从外到内线性淡出）。 */
    sideBand: 0.07,
    bottomBand: 0.1,
    maxCoverage: 0.12,
    /** 雾图一格对应的世界宽度（随 zoom 缩放）。 */
    tileWidth: 1500,
    driftPxPerMin: 40,
  },
  /** 漂移动画的刷新率（仅 depth=1 时有这个循环；整帧重画仍由原逻辑负责）。 */
  animateFps: 15,
} as const;

export function depthEnabled(search: string) {
  return new URLSearchParams(search).get('depth') === '1';
}

export type View = { zoom: number; x: number; y: number };
export type Viewport = { width: number; height: number };

/**
 * 视差层位移（屏幕 px）：镜头相对世界中心移动 Δ 时，层移动 −Δ·zoom·p。
 * p=1 与岛同速，p=0 屏幕固定。
 */
export function parallaxShift(cam: View, p: number) {
  return {
    x: -(cam.x - WORLD_CENTER.x) * cam.zoom * p,
    y: -(cam.y - WORLD_CENTER.y) * cam.zoom * p,
  };
}

/** 世界坐标点在视差 p 层上的屏幕位置。p=1 时与 map.ts 的 scene 变换完全一致。 */
export function parallaxPoint(
  wx: number,
  wy: number,
  cam: View,
  view: Viewport,
  p: number,
) {
  const s = parallaxShift(cam, p);
  return {
    x: view.width / 2 + (wx - WORLD_CENTER.x) * cam.zoom + s.x,
    y: view.height / 2 + (wy - WORLD_CENTER.y) * cam.zoom + s.y,
  };
}

/** 在当前 zoom 下镜头离世界中心最远能走多远（与 camera.ts clampCamera 一致）。 */
export function maxTravel(zoom: number, view: Viewport) {
  return {
    x: Math.max(0, (WORLD_SIZE.width - view.width / zoom) / 2),
    y: Math.max(0, (WORLD_SIZE.height - view.height / zoom) / 2),
  };
}

/**
 * 屏幕固定 + 视差平移的整幅背景（L0）要铺满：任何合法镜头位置下都不露边。
 * 返回缩放：图宽高 ≥ 视口 + 2×最大视差位移。
 */
export function coverScale(
  zoom: number,
  view: Viewport,
  image: { width: number; height: number },
  p: number,
  overscan = 1,
) {
  const t = maxTravel(zoom, view);
  const needW = view.width + 2 * t.x * zoom * p;
  const needH = view.height + 2 * t.y * zoom * p;
  return Math.max(needW / image.width, needH / image.height) * overscan;
}

/** L6 边缘雾遮罩在 (u,v)∈[0,1]² 处的权重（左右与底边带内线性淡出，其余 0）。 */
export function mistMaskAt(
  u: number,
  v: number,
  side = DEPTH.mist.sideBand,
  bottom = DEPTH.mist.bottomBand,
) {
  const l = side > 0 ? Math.max(0, 1 - u / side) : 0;
  const r = side > 0 ? Math.max(0, 1 - (1 - u) / side) : 0;
  const b = bottom > 0 ? Math.max(0, 1 - (1 - v) / bottom) : 0;
  return Math.min(1, Math.max(l, r, b));
}

/** 遮罩的平均权重 = 雾最多覆盖的画面比例（spec：≤12%）。 */
export function mistCoverage(samples = 200) {
  let sum = 0;
  for (let j = 0; j < samples; j++)
    for (let i = 0; i < samples; i++)
      sum += mistMaskAt((i + 0.5) / samples, (j + 0.5) / samples);
  return sum / (samples * samples);
}

/** L3 每座岛的落影椭圆（世界坐标）。 */
export function islandShadowEllipses() {
  const c = DEPTH.islandShadow;
  return c.islands.map((i) => ({
    island: i.island,
    x: i.cx,
    y: i.bottom + c.offsetY,
    rx: i.width * c.rx,
    ry: i.width * c.ry,
  }));
}

/** 漂移位移（px），按渲染时间线性增长；不用随机数。 */
export function drift(nowMs: number, pxPerMin: number) {
  return (nowMs / 60000) * pxPerMin;
}

/** 本开关打开时额外加载的素材（相对 assets/）。 */
export function depthFiles() {
  return [
    DEPTH.world,
    ...[DEPTH.backdrop, DEPTH.cloudSea, DEPTH.mist]
      .map((l) => l.asset?.file)
      .filter((f): f is string => !!f),
    ...farIslandItems().map((i) => i.file),
  ].filter((f, i, a) => a.indexOf(f) === i);
}

/** L1 实际要画的远岛（配置 items 里 part 有对应切图的才画）。 */
export function farIslandItems() {
  const parts = DEPTH.farIslands.asset?.parts ?? [];
  return DEPTH.farIslands.items
    .filter((i) => parts[i.part - 1])
    .map((i) => ({ ...i, ...parts[i.part - 1], x: i.x, y: i.y }));
}

/** 饱和度倍率作用在一个 0xRRGGBB 颜色上（与纹理处理同一公式）。 */
export function saturateColor(color: number, s: number) {
  const r = (color >> 16) & 255,
    g = (color >> 8) & 255,
    b = color & 255;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const f = (c: number) =>
    Math.min(255, Math.max(0, Math.round(y + s * (c - y))));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}
