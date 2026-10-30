# public/assets/cool/ — 冷色新场景（?cool=1）素材目录

只在地址栏带 `?cool=1` 时加载；默认首屏不加载本目录任何文件（manifest 里单列 `groups.cool`，`firstScreen: false`，
`scripts/first-screen-budget.mjs` 不统计）。旧四岛素材（map/、building/、disciple/、rebuild/）一律不动。

## 现有文件

| 文件                                     | 说明                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene_concept_cool_v1-placeholder.webp` | **占位，待 Iris 正式石台替换。** 由 Iris 概念图 `scene_concept_cool_v1.jpg`（1152×864）经 `scripts/cool-placeholder.mjs` 四边羽化到画布底色后转 webp；作为 cool 世界底图，按 `k` 缩放到石台宽 ≈1600 世界 px。 |

## 交付规格（Iris → Forge）

- **格式**：PNG，文件名 `<部件>_cool_v<N>.png`（例：`hall_cool_v1.png`、`platform_cool_v1.png`），版本号只增不覆盖。
- **底色**：纯品红 `#FF00FF` 实底（不要渐变、不要阴影晕到底色上）。抠图判据 `d = min(R,B) − G`，
  元素之间留 ≥40px 品红间隔；**光晕、水面、云**这类半透明部件改用纯黑底单独出图（screen 叠加）。
- **投影**：2:1 等距（斜边 dy/dx = 0.5，即 `slope: 0.5`），光从左上。
- **分辨率**：建筑按 2x 出图（对应世界 px 的 2 倍）；弟子按 3x 出图，单帧 128×192，脚底锚点 (64,186)。
- **尺度**：以 `src/render/cool-world.json` 的 `k`（暂定 0.6，指挥官未最终拍板）为准；k 改了只改 json，不重出图。
- **每张图配一份同名 `.json` 标注**（坐标均为该 PNG 的像素坐标）：

```json
{
  "file": "hall_cool_v1.png",
  "size": [2048, 1536],
  "slope": 0.5,
  "baseQuad": [
    [412, 1180],
    [1010, 1478],
    [1620, 1176],
    [1018, 880]
  ],
  "groundSplit": [
    [380, 1100],
    [1010, 1400],
    [1650, 1096]
  ],
  "entrance": [1010, 1500],
  "doors": [{ "top": [1010, 980], "bottom": [1010, 1120] }],
  "labelAnchor": [1010, 1510],
  "extraBlock": [],
  "lightFrom": "upper-left",
  "notes": "baseQuad 依次为 左/前/右/后 台基地面角；后角被遮挡时按平行边推算并注明"
}
```

字段含义：`baseQuad` 台基落地四角（左/前/右/后）→ 碰撞脚印；`groundSplit` 地面层/本体分界折线（药田的“地面层 + 前缘栅栏条”同理）；
`entrance` 门口落脚点（弟子进出建筑的终点）；`doors` 门洞上下沿；`labelAnchor` 名牌锚点；`extraBlock` 额外不可走多边形（石狮、香炉等）。

## 换正式素材的步骤（概要，详见 immortal-qa/art-rebuild/cool-rebuild/xianfu-cool-skeleton-notes.md）

1. 正式石台：抠图后放进本目录（webp），改 `cool-world.json` 的 `background.file / size`；
   按新石台标注重描 `walkable / obstacles / slots / spots`（仍用石台源像素坐标，k 换算由代码完成）。
2. 建筑：按标注 json 把 `baseQuad` 写进对应 slot 的 `footprint`、`entrance`、`label`；立绘接入时再替换 map.ts 里沿用的旧立绘占位。
3. 跑 `node scripts/cool-placeholder.mjs` 之类的生成脚本后同步 `public/assets/manifest.json` 的字节数（`tests/assets.test.ts` 校验）。
