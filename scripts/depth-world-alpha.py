"""depth 开关（?depth=1）用：从现有 world.webp 程序化生成“岛外透明”的 world_alpha.webp。

只做素材处理（按与纸色的距离 + 连通域 + 去色晕 matte），不手绘、不改岛、不覆盖 world.webp。
用法：/usr/bin/python3 scripts/depth-world-alpha.py [--preview DIR]
依赖：numpy、scipy、Pillow（macOS 自带 /usr/bin/python3 已装）。

算法（参数见下方常量）：
1. d = 像素与纸色 PAPER 的 RGB 距离；d<D0 且与图边连通（或面积≥HOLE 的封闭纸色洞）= 天空背景。
2. 前景不透明度 afg：在“软边带”（离背景 ≤BAND px；或与背景经浅色像素连通、低饱和且离背景 ≤SOFTBAND
   的崖底雾化区；或云区）内按 d 从 D0→D1 线性升到 1；带外一律 1（保护岛内浅色路面/高光）。
3. 去色晕：F = PAPER + (c − PAPER)/afg（把纸色成分反算掉，岛缘颜色不再带米色）。
4. 云：低饱和浅色的云描边经闭运算+填洞+去小块 → 云区，高斯软化后换成半透明白 MIST_WHITE（alpha≤MISTA），
   纸色本体不保留。
5. 合成：A = afg + (1−afg)·mist，颜色按 alpha 加权。
另输出每座岛的落影椭圆（L3 用）到 src/render/depth-shadows.json。
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public/assets/map/world.webp')
OUT = os.path.join(ROOT, 'public/assets/rebuild/depth/world_alpha.webp')
SHADOWS = os.path.join(ROOT, 'src/render/depth-shadows.json')
PAPER = np.array([241, 232, 212.], np.float32)
MIST_WHITE = np.array([250, 250, 250.], np.float32)
D0, D1, BAND = 5.0, 70.0, 20
HOLE = 10
NEAR, CLOSE, MINAREA, SIG, MISTA = 4, 10, 600, 7, 0.6
SOFTSAT, SOFTBAND = 45, 70
QUALITY = 90


def main():
    im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
    d = np.sqrt(((im - PAPER) ** 2).sum(-1))
    mn, mx = im.min(-1), im.max(-1)
    lab, _ = ndi.label(d < D0)
    border = np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    border = border[border > 0]
    sizes = ndi.sum(np.ones_like(d), lab, range(1, lab.max() + 1))
    holes = np.nonzero(sizes >= HOLE)[0] + 1
    ext = np.isin(lab, border) | np.isin(lab, holes)

    core = d >= D1
    nearcore = ndi.distance_transform_edt(~core) <= NEAR
    cloudish = (d >= D0) & (d < 45) & (mx - mn < 32) & (mn >= 175) & ~nearcore
    reg = ndi.binary_closing(cloudish, structure=np.ones((3, 3)), iterations=CLOSE)
    filled = ndi.binary_fill_holes(reg | core) & ~core
    reg = (reg | filled) & ~nearcore
    lab2, n2 = ndi.label(reg)
    s2 = ndi.sum(reg, lab2, range(1, n2 + 1))
    reg = np.isin(lab2, np.nonzero(s2 >= MINAREA)[0] + 1)
    de = ndi.distance_transform_edt(~ext)
    reg &= ~(de > 60)
    mist = np.clip(ndi.gaussian_filter(reg.astype(np.float32), SIG) * 1.6, 0, 1) * MISTA
    mist *= ndi.binary_dilation(reg, iterations=int(2 * SIG))

    labs, _ = ndi.label(d < D1)
    sb = np.unique(labs[ext])
    sb = sb[sb > 0]
    soft = np.isin(labs, sb) & (mx - mn < SOFTSAT) & (de <= SOFTBAND)
    band = (de <= BAND) | reg | soft
    afg = np.where(band, np.clip((d - D0) / (D1 - D0), 0, 1), 1.0)
    F = np.clip(PAPER + (im - PAPER) / np.maximum(afg, 1e-4)[..., None], 0, 255)
    A = afg + (1 - afg) * mist
    C = (afg[..., None] * F + ((1 - afg) * mist)[..., None] * MIST_WHITE) / np.maximum(A, 1e-4)[..., None]
    A = np.where(A < 1 / 255, 0, A)
    rgba = np.dstack([C, A * 255]).round().clip(0, 255).astype(np.uint8)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img = Image.fromarray(rgba)
    img.save(OUT, quality=QUALITY, method=6, alpha_quality=100)

    # L3 落影：每座岛取可走面中段各列，从岛面中线向下找第一个透明像素（崖底），取中位数。
    world = json.load(open(os.path.join(ROOT, 'data/world.json')))
    alpha = rgba[..., 3] > 216  # 只算不透明岛体，不算半透明云雾
    shadows = []
    for isl in world['islands']:
        ox, oy = isl['offset']
        xs = [p[0] + ox for p in isl['walkable']]
        ys = [p[1] + oy for p in isl['walkable']]
        x0, x1 = int(min(xs)), int(max(xs))
        cols = range(int(x0 + 0.2 * (x1 - x0)), int(x1 - 0.2 * (x1 - x0)))
        y0 = int(np.median(ys))
        bottoms = []
        for x in cols:
            gap = np.nonzero(~alpha[y0:, x])[0]  # 从岛面中线向下，第一个透明像素 = 该列崖底
            if gap.size:
                bottoms.append(y0 + int(gap[0]))
        shadows.append({
            'island': isl['id'],
            'cx': round((x0 + x1) / 2),
            'bottom': int(np.median(bottoms)),
            'top': int(min(ys)),
            'width': x1 - x0,
        })
    json.dump({'source': 'scripts/depth-world-alpha.py', 'islands': shadows}, open(SHADOWS, 'w'), ensure_ascii=False, indent=2)
    open(SHADOWS, 'a').write('\n')
    print(json.dumps({'out': OUT, 'bytes': os.path.getsize(OUT), 'transparent': float((A == 0).mean()), 'partial': float(((A > 0) & (A < 1)).mean()), 'shadows': shadows}, ensure_ascii=False))

    if '--preview' in sys.argv:
        pdir = sys.argv[sys.argv.index('--preview') + 1]
        os.makedirs(pdir, exist_ok=True)
        bg = Image.new('RGBA', img.size, (30, 50, 100, 255))
        bg.alpha_composite(Image.open(OUT).convert('RGBA'))
        bg.convert('RGB').save(os.path.join(pdir, 'world_alpha_on_blue.png'))


main()
