# public/assets/cool/ — 冷色新场景（?cool=1）素材目录

只在地址栏带 `?cool=1` 时加载；默认首屏不加载本目录任何文件（manifest 里单列 `groups.cool`，`firstScreen: false`，
`scripts/first-screen-budget.mjs` 不统计）。旧四岛素材（map/、building/、disciple/、rebuild/）一律不动。

## 现有文件（批次一，`node scripts/cool-assets.mjs` 生成，清单见 manifest `groups.cool`）

| 目录        | 说明                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hall/`     | 主殿 B1/B2 分层：`hall-roof`（外观，分界线以上）、`hall-room`（内景，分界线以上）、`hall-base`（内景台基/栏杆/台阶，常显）、`hall-col-1..6`（殿内六柱）。几何与世界坐标见 `src/render/cool-hall.json`。 |
| `disciple/` | 弟子 D1（男 `m-`）/D2（女 `f-`）：`stand`、`sit`、`walk-1..4`，128×192，脚底锚点 (64,186)，站立头顶→脚底 168 px。                                                                                       |
| `ui/`       | UI 第一批：`panel`（九宫格面板）、`button-primary/secondary/danger`、`bar-stone/herb/pill`（资源条框，槽内填充由代码画）、`plaque`（声望牌）。                                                          |

石台 S1 未交付：地面是代码画的**带标注平面色块占位**，不是素材。旧概念图羽化底图已删除。

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

1. 正式石台：抠图后放进本目录（webp）；`cool-world.json` 批次一起为世界坐标（`coords: "world"`），
   按新石台标注重描 `walkable / obstacles / slots / spots / zones`。
2. 建筑：按标注 json 把 `baseQuad` 写进对应 slot 的 `footprint`、`entrance`、`label`；立绘接入时再替换 map.ts 里沿用的旧立绘占位。
3. 跑 `node scripts/cool-assets.mjs` 后同步 `public/assets/manifest.json` 的字节数（`tests/assets.test.ts` 校验）。

## B5–B9 立绘（批次三，`b5b9/`）

- `gate`（B5 门楼，镜像使门朝左下）、`dorm`（B6 居舍院落）、`alchemy-house` / `alchemy-yard`（B7 丹房本体 / 炉院地面，按丹房多边形切开）、
  `medit`（B8 聚灵阵，360×180 不放大）、`garden`（B9 药田）。只做抠图、几何缩放、裁切、alpha；没有重画像素。
- 由 `node scripts/cool-b5b9-assets.mjs` 从 review 产物（2x alpha PNG）转 webp q90，并写 manifest 的 `anchor`（最低足迹角，px）/`baseQuad`（四角）
  与 `src/render/cool-buildings.json`（位置、缩放 0.5、层：B8/B9/炉院 = 地面层 z −900，B5/B6/丹房 = 按最低足迹角 y 与弟子排序）。
- 碰撞与入口在 `src/render/cool-world.json`（按 Lore 10-b5-b9-layout-v1；B7 丹房按立绘实测），核对脚本 `node --import tsx scripts/cool-b5b9-check.ts`。
- 默认模式不请求 `cool/` 任何素材；cool 组 `firstScreen: false`。
