// ?cool=1 自有纵深配置（天空 + 云海三层）。与 ?depth=1（depth-config.ts，按旧四岛校准）完全分开，
// 不改 ?depth=1 现有行为 [FEAS §2.6]。纯表现层：只读镜头，不碰 sim。
// S3「云海三层 + 天空 + 雾带」未交付：asset 全为 null，画带标注的纯色平涂色块占位（无渐变、无纹理，不冒充美术）。
// 素材到位后：填 asset（黑底亮度→alpha 的云按 screen 叠加），视差/位置沿用本表。
import { Container, Graphics, Text } from 'pixi.js';

export type CoolDepthBand = {
  name: string;
  /** 视差：0 = 不随镜头动，1 = 与地面同速。 */
  parallax: number;
  /** 世界 y（色块上沿），镜头在 WORLD 中心时的位置。 */
  y: number;
  height: number;
  color: number;
  alpha: number;
  asset: string | null;
};

export const COOL_DEPTH = {
  /** 视差锚点：镜头在此时各层与世界对齐。 */
  center: { x: 1800, y: 800 },
  sky: {
    name: 'S3 天空',
    parallax: 0.1,
    color: 0xcfdfe5,
    asset: null as string | null,
  },
  clouds: [
    {
      name: 'S3 云海·远层',
      parallax: 0.3,
      y: 1180,
      height: 900,
      color: 0xe6eef0,
      alpha: 1,
      asset: null,
    },
    {
      name: 'S3 云海·中层',
      parallax: 0.55,
      y: 1320,
      height: 900,
      color: 0xedf3f4,
      alpha: 1,
      asset: null,
    },
    {
      name: 'S3 云海·近层',
      parallax: 0.8,
      y: 1460,
      height: 900,
      color: 0xf3f7f8,
      alpha: 1,
      asset: null,
    },
  ] as CoolDepthBand[],
  stroke: 0x9db4ba,
  labelColor: 0x4a656b,
};

type View = { x: number; y: number; zoom: number };
type Viewport = { width: number; height: number };

/** 屏幕 y：镜头在 center 时等于世界 y；偏离时按视差缩放偏移。 */
export function bandScreenY(band: CoolDepthBand, cam: View, view: Viewport) {
  return (
    view.height / 2 +
    (band.y - COOL_DEPTH.center.y) * cam.zoom -
    (cam.y - COOL_DEPTH.center.y) * cam.zoom * band.parallax
  );
}

export function createCoolDepth() {
  const root = new Container();
  root.label = 'cool-depth';
  const sky = new Graphics();
  sky.label = 'cool-sky-placeholder';
  root.addChild(sky);
  const bands = COOL_DEPTH.clouds.map((band) => {
    const g = new Graphics();
    g.label = `cool-cloud-placeholder:${band.name}`;
    const t = new Text({
      text: `${band.name}（未交付·占位色块，视差 ${band.parallax}）`,
      style: { fontSize: 12, fill: COOL_DEPTH.labelColor, fontFamily: 'serif' },
    });
    root.addChild(g, t);
    return { band, g, t };
  });
  const skyText = new Text({
    text: `${COOL_DEPTH.sky.name}（未交付·占位色块）`,
    style: { fontSize: 12, fill: COOL_DEPTH.labelColor, fontFamily: 'serif' },
  });
  root.addChild(skyText);
  const stats = { layers: 1 + bands.length, placeholders: 0, bandY: [0] };
  function update(cam: View, view: Viewport) {
    sky.clear().rect(0, 0, view.width, view.height).fill(COOL_DEPTH.sky.color);
    skyText.position.set(12, 44);
    stats.placeholders = 1;
    stats.bandY = [];
    for (const { band, g, t } of bands) {
      const y = bandScreenY(band, cam, view);
      g.clear()
        .rect(0, y, view.width, band.height * cam.zoom)
        .fill({ color: band.color, alpha: band.alpha })
        .moveTo(0, y)
        .lineTo(view.width, y)
        .stroke({ width: 1, color: COOL_DEPTH.stroke });
      t.position.set(12, y + 4);
      stats.placeholders++;
      stats.bandY.push(Math.round(y));
    }
  }
  return { root, update, stats };
}
