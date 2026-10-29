import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { clampCamera } from '../src/render/camera';
import assets from '../src/render/depth-assets.json';
import {
  DEPTH,
  coverScale,
  depthEnabled,
  depthFiles,
  drift,
  farIslandItems,
  islandShadowEllipses,
  maxTravel,
  mistCoverage,
  mistMaskAt,
  parallaxPoint,
  saturateColor,
} from '../src/render/depth-config';
import manifest from '../public/assets/manifest.json';
const root = new URL('../public/assets/', import.meta.url);

describe('纵深开关 ?depth=1（默认关闭）', () => {
  it('只有 depth=1 才打开', () => {
    expect(depthEnabled('')).toBe(false);
    expect(depthEnabled('?debug=1')).toBe(false);
    expect(depthEnabled('?depth=0')).toBe(false);
    expect(depthEnabled('?depth=true')).toBe(false);
    expect(depthEnabled('?depth=')).toBe(false);
    expect(depthEnabled('?depth')).toBe(false);
    expect(depthEnabled('?depth=1')).toBe(true);
    expect(depthEnabled('?debug=1&depth=1')).toBe(true);
    expect(depthEnabled('?depth=1&depth=0')).toBe(true);
  });
});

describe('纵深参数与 spec 三节一致', () => {
  it('视差、混合、透明度', () => {
    expect(DEPTH.backdrop.parallax).toBe(0.15);
    expect(DEPTH.backdrop.blend).toBe('normal');
    expect(DEPTH.farIslands.parallax).toBe(0.35);
    expect(DEPTH.farIslands.alpha).toBe(0.8);
    expect(DEPTH.farIslands.scale).toBeGreaterThanOrEqual(0.3);
    expect(DEPTH.farIslands.scale).toBeLessThanOrEqual(0.5);
    expect(DEPTH.cloudSea.parallax).toBe(0.6);
    expect(DEPTH.cloudSea.driftPxPerMin).toBeGreaterThanOrEqual(20);
    expect(DEPTH.cloudSea.driftPxPerMin).toBeLessThanOrEqual(40);
    expect(DEPTH.islandShadow).toMatchObject({
      parallax: 0.85,
      blend: 'multiply',
      color: 0x5a5a7a,
      alpha: 0.26,
    });
    expect(DEPTH.light.warm).toEqual({
      color: 0xfff1d0,
      alpha: 0.12,
      blend: 'screen',
    });
    expect(DEPTH.light.cool).toEqual({
      color: 0x3a3a66,
      alpha: 0.1,
      blend: 'multiply',
    });
    expect(DEPTH.light.vignette.alpha).toBe(0.1);
    expect(DEPTH.mist).toMatchObject({
      parallax: 1.15,
      blend: 'screen',
      alpha: 0.35,
    });
    const zs = [
      DEPTH.backdrop.z,
      DEPTH.farIslands.z,
      DEPTH.cloudSea.z,
      DEPTH.islandShadow.z,
      DEPTH.light.z,
      DEPTH.mist.z,
    ];
    expect(zs).toEqual([...zs].sort((a, b) => a - b));
  });
  it('前景雾只在边缘，覆盖 ≤12%', () => {
    expect(mistCoverage()).toBeLessThanOrEqual(DEPTH.mist.maxCoverage);
    expect(DEPTH.mist.maxCoverage).toBe(0.12);
    expect(mistMaskAt(0.5, 0.5)).toBe(0);
    expect(mistMaskAt(0.5, 0.3)).toBe(0);
    expect(mistMaskAt(0, 0.5)).toBe(1);
    expect(mistMaskAt(1, 0.5)).toBe(1);
    expect(mistMaskAt(0.5, 1)).toBe(1);
  });
  it('漂移只依赖渲染时间', () => {
    expect(drift(0, 30)).toBe(0);
    expect(drift(60000, 30)).toBe(30);
    expect(drift(120000, 30)).toBe(60);
  });
});

describe('视差几何', () => {
  const view = { width: 1280, height: 900 };
  it('p=1 与 scene 变换一致', () => {
    const cam = { zoom: 0.9, x: 1234, y: 777 };
    const p = parallaxPoint(500, 300, cam, view, 1);
    // map.ts: scene.position = W/2 − cam.x·zoom，世界点屏幕位置 = 位置 + wx·zoom
    expect(p.x).toBeCloseTo(view.width / 2 - cam.x * cam.zoom + 500 * cam.zoom);
    expect(p.y).toBeCloseTo(
      view.height / 2 - cam.y * cam.zoom + 300 * cam.zoom,
    );
  });
  it('p=0 屏幕固定', () => {
    const a = parallaxPoint(500, 300, { zoom: 0.9, x: 1000, y: 700 }, view, 0);
    const b = parallaxPoint(500, 300, { zoom: 0.9, x: 2200, y: 900 }, view, 0);
    expect(a).toEqual(b);
  });
  it('L0 在任意 zoom 与镜头极限位置都铺满（不露边）', () => {
    const img = DEPTH.backdrop.asset!;
    for (const vp of [
      view,
      { width: 1920, height: 1080 },
      { width: 390, height: 844 },
    ])
      for (const z of [0.2, 0.4, vp.width / 1440, 1, 1.5]) {
        const zoom = clampCamera(
          { zoom: z, x: 1600, y: 700 },
          vp.width,
          vp.height,
        ).zoom;
        const s = coverScale(zoom, vp, img, DEPTH.backdrop.parallax, 1);
        const t = maxTravel(zoom, vp);
        for (const [cx, cy] of [
          [1600 - t.x, 700 - t.y],
          [1600 + t.x, 700 + t.y],
          [1600 - t.x, 700 + t.y],
        ]) {
          const cam = clampCamera({ zoom, x: cx, y: cy }, vp.width, vp.height);
          const c = parallaxPoint(1600, 700, cam, vp, DEPTH.backdrop.parallax);
          expect(c.x - (img.width * s) / 2).toBeLessThanOrEqual(1e-6);
          expect(c.x + (img.width * s) / 2).toBeGreaterThanOrEqual(
            vp.width - 1e-6,
          );
          expect(c.y - (img.height * s) / 2).toBeLessThanOrEqual(1e-6);
          expect(c.y + (img.height * s) / 2).toBeGreaterThanOrEqual(
            vp.height - 1e-6,
          );
        }
      }
  });
  it('四座岛都有落影', () => {
    const e = islandShadowEllipses();
    expect(e).toHaveLength(4);
    for (const s of e) {
      expect(s.rx).toBeGreaterThan(s.ry);
      expect(s.y).toBeGreaterThan(0);
    }
  });
});

describe('纵深素材', () => {
  it('路径带版本号、文件存在、尺寸与哈希一致', async () => {
    for (const [key, l] of Object.entries(assets.layers)) {
      if (!l) continue;
      if ('parts' in l) {
        let total = 0;
        for (const part of l.parts) {
          expect(part.file, key).toMatch(
            /^rebuild\/depth\/[a-z_]+_v\d+_\d+\.webp$/,
          );
          const buf = await readFile(new URL(part.file, root));
          expect(buf.length, part.file).toBe(part.bytes);
          total += buf.length;
          const m = await sharp(buf).metadata();
          expect([m.width, m.height], part.file).toEqual([
            part.width,
            part.height,
          ]);
          expect(m.hasAlpha, part.file).toBe(true);
        }
        expect(total, key).toBe(l.bytes);
      } else {
        expect(l.file, key).toMatch(/^rebuild\/depth\/[a-z_]+_v\d+\.webp$/);
        const buf = await readFile(new URL(l.file, root));
        expect(buf.length, key).toBe(l.bytes);
        const m = await sharp(buf).metadata();
        expect([m.width, m.height], key).toEqual([l.width, l.height]);
      }
      expect(l.sha256).toMatch(/^[0-9a-f]{64}$/);
      // 源图仍在时校验来源哈希（Iris 的目录不在 CI 上时跳过）
      const src = await readFile(l.source).catch(() => null);
      if (src)
        expect(createHash('sha256').update(src).digest('hex'), key).toBe(
          l.sha256,
        );
    }
  });
  it('透明底世界图与原图同尺寸且岛外透明', async () => {
    const buf = await readFile(new URL(DEPTH.world, root));
    expect(buf.length).toBe(assets.world.bytes);
    const m = await sharp(buf).metadata();
    const o = await sharp(
      await readFile(new URL('map/world.webp', root)),
    ).metadata();
    expect([m.width, m.height]).toEqual([o.width, o.height]);
    expect(m.hasAlpha).toBe(true);
    const { data } = await sharp(buf)
      .extractChannel(3)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(0); // 左上角是岛外
  });
  it('depthFiles 只列开关打开时才加载的文件，且文件都在 public/assets 下', async () => {
    const files = depthFiles();
    expect(files[0]).toBe(DEPTH.world);
    expect(new Set(files).size).toBe(files.length);
    for (const f of files) {
      expect(f.startsWith('rebuild/depth/'), f).toBe(true);
      expect((await readFile(new URL(f, root))).length, f).toBeGreaterThan(0);
    }
    expect(
      manifest.files.some((f) => f.file.startsWith('rebuild/depth/')),
    ).toBe(false);
  });
});

describe('纵深第二轮素材', () => {
  it('L0 用最新 backdrop v2；云海用正式素材（非占位）', () => {
    expect(DEPTH.backdrop.asset?.version).toBe(2);
    expect(DEPTH.backdrop.asset?.file).toBe(
      'rebuild/depth/backdrop_sky_far_v2.webp',
    );
    expect(DEPTH.cloudSea.placeholder).toBe(false);
    expect(DEPTH.cloudSea.asset?.file).toBe('rebuild/depth/cloud_sea_v1.webp');
    expect(DEPTH.mist.asset?.file).toBe('rebuild/depth/mist_screen_v1.webp');
  });
  it('远岛切成 5 张，配置 5 个位置，视差/透明度/缩放按 spec', () => {
    expect(DEPTH.farIslands.asset?.parts).toHaveLength(5);
    expect(DEPTH.farIslands).toMatchObject({
      parallax: 0.35,
      alpha: 0.8,
      scale: 0.4,
    });
    const items = farIslandItems();
    expect(items.map((i) => i.part)).toEqual([1, 2, 3, 4, 5]);
    for (const i of items) expect(depthFiles()).toContain(i.file);
  });
  it('云海上缘渐隐无硬边、透明区确为透明', async () => {
    const { data, info } = await sharp(
      await readFile(new URL(DEPTH.cloudSea.asset!.file, root)),
    )
      .extractChannel(3)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const row = (y: number) => {
      let n = 0;
      for (let x = 0; x < info.width; x++) n += data[y * info.width + x];
      return n / info.width;
    };
    expect(row(0)).toBe(0);
    // 行均值逐行变化平缓（上缘消散区没有一刀切）。
    for (let y = 1; y < info.height / 2; y++)
      expect(Math.abs(row(y) - row(y - 1)), `row ${y}`).toBeLessThan(12);
  });
  it('远岛边缘无绿边（半透明像素 G 不明显高于 R/B）', async () => {
    for (const part of DEPTH.farIslands.asset!.parts) {
      const { data } = await sharp(await readFile(new URL(part.file, root)))
        .raw()
        .toBuffer({ resolveWithObject: true });
      let bad = 0,
        edge = 0;
      for (let k = 0; k < data.length; k += 4) {
        if (data[k + 3] === 0 || data[k + 3] === 255) continue;
        edge++;
        if (data[k + 1] - Math.max(data[k], data[k + 2]) > 20) bad++;
      }
      expect(edge, part.file).toBeGreaterThan(0);
      expect(bad / edge, part.file).toBeLessThan(0.01);
    }
  });
  it('天空饱和度参数默认 0.85，公式保持亮度', () => {
    expect(DEPTH.backdrop.skySaturation).toBe(0.85);
    expect(saturateColor(0x808080, 0.85)).toBe(0x808080);
    expect(saturateColor(0x6fb5e5, 1)).toBe(0x6fb5e5);
    const g = saturateColor(0x6fb5e5, 0);
    expect((g >> 16) & 255).toBe(g & 255);
  });
});
