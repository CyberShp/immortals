// 场景纵深的 Pixi 图层（仅 ?depth=1 时由 map.ts 创建）。参数全部来自 depth-config.ts 的 DEPTH。
// back：L0 天空/远峰 → L1 远岛 → L2 云海 → L3 岛落影（都在 scene 之下，透过岛外透明的世界底图可见）。
// front：L5 全局光与暗角 → L6 前景薄雾（在 scene 之上、小地图与 DOM UI 之下）。
import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import {
  DEPTH,
  coverScale,
  drift,
  islandShadowEllipses,
  mistMaskAt,
  parallaxPoint,
  parallaxShift,
  type View,
  type Viewport,
} from './depth-config';

type Source = CanvasImageSource & { width: number; height: number };

function canvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return [c, c.getContext('2d')!] as const;
}

function sourceOf(texture: Texture) {
  return texture.source.resource as Source;
}

/**
 * 黑底白雾（screen 语义）→ 白色 + alpha=亮度：normal 混合下与 screen 数学等价
 * （screen(m,b)=m+b−mb；白色 alpha m：m+b(1−m)）。这样才能套边缘遮罩。
 * mirrorX/mirrorY：拼镜像，让平铺无缝。fadeY：上下边缘再乘一条淡出（云海带用）。
 */
function screenToAlpha(
  texture: Texture,
  { mirrorX = false, mirrorY = false, fadeY = 0 } = {},
) {
  const img = sourceOf(texture);
  const w = img.width,
    h = img.height;
  const [c, g] = canvas(w * (mirrorX ? 2 : 1), h * (mirrorY ? 2 : 1));
  for (let j = 0; j < (mirrorY ? 2 : 1); j++)
    for (let i = 0; i < (mirrorX ? 2 : 1); i++) {
      g.save();
      g.translate(i ? 2 * w : 0, j ? 2 * h : 0);
      g.scale(i ? -1 : 1, j ? -1 : 1);
      g.drawImage(img, 0, 0, w, h);
      g.restore();
    }
  const data = g.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  for (let y = 0; y < c.height; y++) {
    const v = y / (c.height - 1);
    const f = fadeY
      ? Math.min(1, Math.min(v, 1 - v) / fadeY) ** 2 *
        // 上半部淡得更多：云海顶部不要压住崖底。
        Math.min(1, 0.35 + v * 1.3)
      : 1;
    for (let x = 0; x < c.width; x++) {
      const k = (y * c.width + x) * 4;
      const m = (0.299 * p[k] + 0.587 * p[k + 1] + 0.114 * p[k + 2]) / 255;
      p[k] = p[k + 1] = p[k + 2] = 255;
      p[k + 3] = Math.round(m * f * 255);
    }
  }
  g.putImageData(data, 0, 0);
  return Texture.from(c);
}

function gradientTexture(
  draw: (g: CanvasRenderingContext2D, size: number) => void,
  size = 256,
) {
  const [c, g] = canvas(size, size);
  draw(g, size);
  return Texture.from(c);
}

const rgba = (color: number, a: number) =>
  `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${a})`;

export type DepthLayers = ReturnType<typeof createDepthLayers>;

export function createDepthLayers(textures: Map<string, Texture>) {
  const back = new Container();
  const front = new Container();
  for (const c of [back, front]) {
    c.eventMode = 'none';
    c.interactiveChildren = false;
  }
  back.label = 'depth-back';
  front.label = 'depth-front';
  const tex = (file?: string | null) => (file ? textures.get(file) : undefined);

  // L0 天空+远峰+远云海。下面先铺一层“顶色→底色”的竖向渐变兜底（spec：边缘外用天空顶色/云海底色延伸）。
  const bd = DEPTH.backdrop;
  const bdTex = tex(bd.asset?.file);
  const underlay = new Sprite(
    gradientTexture((g, s) => {
      const lg = g.createLinearGradient(0, 0, 0, s);
      lg.addColorStop(0, rgba(bd.asset?.topColor ?? 0xbfd9ec, 1));
      lg.addColorStop(1, rgba(bd.asset?.bottomColor ?? 0xd9d2e6, 1));
      g.fillStyle = lg;
      g.fillRect(0, 0, s, s);
    }, 64),
  );
  underlay.zIndex = bd.z;
  back.addChild(underlay);
  const backdrop = bdTex ? new Sprite(bdTex) : undefined;
  if (backdrop) {
    backdrop.anchor.set(0.5);
    backdrop.alpha = bd.alpha;
    backdrop.blendMode = bd.blend;
    back.addChild(backdrop);
  }

  // L1 远景小浮岛（素材未出时跳过）。
  const fi = DEPTH.farIslands;
  const fiTex = tex(fi.asset?.file);
  const farIslands = fiTex ? new Sprite(fiTex) : undefined;
  if (farIslands) {
    farIslands.anchor.set(0.5);
    farIslands.alpha = fi.alpha;
    farIslands.blendMode = fi.blend;
    back.addChild(farIslands);
  }

  // L2 云海（岛下）。占位时由 mist 样图转成白色 alpha，横向镜像平铺。
  const cs = DEPTH.cloudSea;
  const csRaw = tex(cs.asset?.file);
  const csTex = csRaw
    ? cs.placeholder
      ? screenToAlpha(csRaw, { mirrorX: true, fadeY: 0.18 })
      : csRaw
    : undefined;
  const cloudSea = csTex
    ? new TilingSprite({ texture: csTex, width: 1, height: 1 })
    : undefined;
  if (cloudSea) {
    cloudSea.alpha = cs.alpha;
    // 占位素材已换算成 normal 等价形式。
    cloudSea.blendMode = cs.placeholder ? 'normal' : cs.blend;
    back.addChild(cloudSea);
  }

  // L3 岛落影：软椭圆（径向渐变模拟模糊），multiply。
  const sh = DEPTH.islandShadow;
  const soft = gradientTexture((g, s) => {
    const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(sh.softStart, 'rgba(255,255,255,0.85)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
  });
  const ellipses = islandShadowEllipses();
  const shadows = ellipses.map(() => {
    const s = new Sprite(soft);
    s.anchor.set(0.5);
    s.tint = sh.color;
    s.alpha = sh.alpha;
    s.blendMode = sh.blend;
    back.addChild(s);
    return s;
  });

  // L5 全局光：左上暖光（screen）、右下冷影（multiply）、四角暗角。
  const li = DEPTH.light;
  const warm = new Sprite(
    gradientTexture((g, s) => {
      const lg = g.createLinearGradient(0, 0, s, s);
      lg.addColorStop(0, rgba(li.warm.color, 1));
      lg.addColorStop(0.6, rgba(li.warm.color, 0));
      g.fillStyle = lg;
      g.fillRect(0, 0, s, s);
    }),
  );
  warm.alpha = li.warm.alpha;
  warm.blendMode = li.warm.blend;
  const cool = new Sprite(
    gradientTexture((g, s) => {
      const lg = g.createLinearGradient(s, s, 0, 0);
      lg.addColorStop(0, rgba(li.cool.color, 1));
      lg.addColorStop(0.6, rgba(li.cool.color, 0));
      g.fillStyle = lg;
      g.fillRect(0, 0, s, s);
    }),
  );
  cool.alpha = li.cool.alpha;
  cool.blendMode = li.cool.blend;
  const vignette = new Sprite(
    gradientTexture((g, s) => {
      const r = (s / 2) * Math.SQRT2;
      const rg = g.createRadialGradient(
        s / 2,
        s / 2,
        r * li.vignetteInner,
        s / 2,
        s / 2,
        r,
      );
      rg.addColorStop(0, rgba(li.vignette.color, 0));
      rg.addColorStop(1, rgba(li.vignette.color, 1));
      g.fillStyle = rg;
      g.fillRect(0, 0, s, s);
    }),
  );
  vignette.alpha = li.vignette.alpha;
  vignette.blendMode = li.vignette.blend;
  const light = [warm, cool, vignette];
  if (li.enabled) for (const s of light) front.addChild(s);

  // L6 前景薄雾：四向镜像平铺的白色 alpha 雾 + 左右下边缘遮罩。
  const mi = DEPTH.mist;
  const miRaw = tex(mi.asset?.file);
  const miTex = miRaw
    ? screenToAlpha(miRaw, { mirrorX: true, mirrorY: true })
    : undefined;
  const mistBox = new Container();
  const mist = miTex
    ? new TilingSprite({ texture: miTex, width: 1, height: 1 })
    : undefined;
  const maskSize = 128;
  const mistMask = new Sprite(
    gradientTexture((g, s) => {
      // 遮罩用不透明灰度（Pixi 的 sprite 遮罩取 r 通道），避免预乘后变成 w²。
      const img = g.createImageData(s, s);
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++) {
          const k = (y * s + x) * 4;
          const w = Math.round(mistMaskAt((x + 0.5) / s, (y + 0.5) / s) * 255);
          img.data[k] = img.data[k + 1] = img.data[k + 2] = w;
          img.data[k + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    }, maskSize),
  );
  if (mist) {
    mist.alpha = mi.alpha;
    mistBox.addChild(mist, mistMask);
    mistBox.mask = mistMask;
    front.addChild(mistBox);
  }

  let frozenAt: number | undefined;
  const last: Record<string, unknown> = {};

  function update(cam: View, view: Viewport, now: number) {
    const t = frozenAt ?? now;
    underlay.position.set(0, 0);
    underlay.width = view.width;
    underlay.height = view.height;
    if (backdrop) {
      const s = coverScale(cam.zoom, view, bdTex!, bd.parallax, bd.overscan);
      const shift = parallaxShift(cam, bd.parallax);
      backdrop.scale.set(s);
      backdrop.position.set(
        view.width / 2 + shift.x,
        view.height / 2 + shift.y,
      );
      last.backdrop = {
        x: backdrop.x,
        y: backdrop.y,
        scale: s,
        left: backdrop.x - (bdTex!.width * s) / 2,
        right: backdrop.x + (bdTex!.width * s) / 2,
        top: backdrop.y - (bdTex!.height * s) / 2,
        bottom: backdrop.y + (bdTex!.height * s) / 2,
      };
    }
    if (farIslands) {
      const p = parallaxPoint(1600, 560, cam, view, fi.parallax);
      farIslands.position.set(p.x, p.y);
      farIslands.scale.set(fi.scale * (0.5 + 0.5 * cam.zoom));
    }
    if (cloudSea && csTex) {
      const top = parallaxPoint(0, cs.top, cam, view, cs.parallax);
      const h = cs.height * cam.zoom;
      // 只铺一行云海带（纹理上下已淡出），带以下露 L0 的云海底色。
      cloudSea.position.set(0, top.y);
      cloudSea.width = view.width;
      cloudSea.height = Math.max(1, h);
      const sy = h / csTex.height;
      const sx = (cs.tileWidth * cam.zoom * 2) / csTex.width;
      cloudSea.tileScale.set(sx, sy);
      cloudSea.tilePosition.set(
        top.x + drift(t, cs.driftPxPerMin) * cam.zoom,
        0,
      );
      last.cloudSea = { y: top.y, height: cloudSea.height, sx, sy };
    }
    ellipses.forEach((e, i) => {
      const p = parallaxPoint(e.x, e.y, cam, view, sh.parallax);
      shadows[i].position.set(p.x, p.y);
      shadows[i].width = e.rx * 2 * cam.zoom;
      shadows[i].height = e.ry * 2 * cam.zoom;
    });
    for (const s of light) {
      s.position.set(0, 0);
      s.width = view.width;
      s.height = view.height;
    }
    if (mist && miTex) {
      const p = parallaxPoint(0, 0, cam, view, mi.parallax);
      const k = (mi.tileWidth * cam.zoom * 2) / miTex.width;
      mist.width = view.width;
      mist.height = view.height;
      mist.tileScale.set(k);
      mist.tilePosition.set(p.x + drift(t, mi.driftPxPerMin) * cam.zoom, p.y);
      mistMask.width = view.width;
      mistMask.height = view.height;
      last.mist = { tileX: mist.tilePosition.x, tileY: mist.tilePosition.y };
    }
  }

  return {
    back,
    front,
    update,
    /** 调试：冻结漂移时间（截图对比用）。 */
    freeze(at?: number) {
      frozenAt = at;
    },
    stats: () => ({
      layers: {
        backdrop: !!backdrop,
        farIslands: !!farIslands,
        cloudSea: !!cloudSea,
        cloudSeaPlaceholder: cs.placeholder,
        islandShadows: shadows.length,
        light: li.enabled,
        mist: !!mist,
      },
      ...last,
    }),
  };
}
