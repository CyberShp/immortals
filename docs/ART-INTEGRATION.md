# 地图第二轮：Lore 与 Iris 决定

## 来源与边界

素材源 `/Volumes/Media/immortal-qa/design/art/assets/` 仅只读；项目内 26 张原图副本保持字节不变。运行 `npm run assets` 重建衍生图与 manifest。导出采用 sharp lanczos3、WebP quality 90、alphaQuality 100、effort 6；尺寸四舍五入。没有修改 src/sim 或 data 数值。

## Lore 决定

配饰只显示在弟子卡片，不挂地图。地图显示完整名字（最多四个汉字，超出加 …），10.5 逻辑 px 白字深色描边，前排脚下、后排头顶，名字框按最小上下偏移避让。灵根色来自 CONFIG.elements 的 balance.json 颜色；26×8 光环按 root.elements 顺序等分，1px 深色边保证金色可见。标题右侧五色图例在紧凑模式隐藏。

药圃、静修室、炼丹房最高 1 级；t2 导出版保留供后续使用，运行时遵守现有 maxLevel。

## Iris 建筑规则

人物实体 H = 48 × 451/462 = 46.857143 逻辑 px。主殿门高目标 0.6H，其余有门建筑 0.4H。共享函数位于 src/render/layout.ts，导出脚本通过 tsImport 使用同一函数：needed = 目标 × H × 2 / 原图门高；scale = min(max(宽度适配, needed), 1.15 × 宽度适配)。药圃只按宽度适配。

| 建筑   | 最终 scale / 原图 | 相对宽度适配 | 原图门高 @2x px | 最终门高逻辑 px | 门高/H   | 结果   |
| ------ | ----------------- | ------------ | --------------- | --------------- | -------- | ------ |
| 居舍   | 0.402332          | 1.150000     | 62              | 12.472          | 0.266177 | 未达标 |
| 静修室 | 0.515695          | 1.000000     | 78              | 20.112          | 0.429222 | 达标   |
| 药圃   | 0.798535          | 1.000000     | —               | —               | —        | 不参与 |
| 炼丹房 | 0.530233          | 0.950000     | 56              | 14.847          | 0.316846 | 未达标 |
| 主殿   | 0.780952          | 1.104230     | 72              | 28.114          | 0.600000 | 达标   |

锚点按原图底边中心缩放，建筑按底边 y 排序，允许超出地块。

### 炼丹房

旧位置的重叠已经拆分：t1 地块 33 + 名牌 240 = 273；t2 地块 214 + 名牌 284 = 498 逻辑像素。静修室名牌现移到右侧上方，中心锚点 (485,112)，预留位保守框左边 x=450，最长施工名牌左边 x=433.5，均 ≥425。

重新逐像素搜索下移 0–24 后，仍无法完全消除地块重叠，最终两档均采用 **scale 0.530232558（宽度适配的 0.95 倍），下移 24 逻辑 px**。实际 WebP/sharp 逻辑分辨率掩码结果：

| 档位 | 剩余地块重叠像素 | 重叠像素中心范围（逻辑坐标） | 静修室名牌重叠 |
| ---- | ---------------- | ---------------------------- | -------------- |
| t1   | 33               | x=394–407，y=154.5–157.5     | 0              |
| t2   | 214              | x=389–408，y=144.5–157.5     | 0              |

两档不透明底边均到逻辑 y=242，即底图 @2x y=484；按用户提供的悬崖起点约 y≥470，已伸入悬崖约 14 底图像素（7 逻辑 px）。这里只按给定参考线判断，未把悬崖识别伪装成精确地形掩码。门高 14.847px，0.316846H，仍未达 0.4H。manifest 记录分项重叠、位置、底边与悬崖判断。

### 药圃

只对项目导出版裁掉源图 y < 150，273×292 变为 273×142，再乘 218/273 = 0.798535，输出 218×113。脚底锚点 y = round((287−150) × scale) = 109 输出像素。原图副本不动。

小屋和后排栅栏被裁掉，左右栅栏顶端为平切口。如需保留后栅栏，需要 Iris 出无小屋版本。实际导出顶部五行的蓝灰屋顶像素比例测试要求低于 2%。

## 深度与头部可见性

药圃固定为地面层 z=-500，始终在弟子之下；其余建筑和弟子共用世界容器，正常按底边/脚底 y 排序。加载后以逻辑分辨率离屏 canvas 缓存 alpha；头部是人物非透明范围最上方 35%。只考虑 y 排在人物前方的建筑非零 alpha 像素，合并遮挡；可见比例低于 0.6 时逐个越过建筑，直到达标。位置、朝向、姿势或建筑图状态变化时重算，其余帧复用缓存。统计 exposed 为 raisedForVisibility 和调整后的 minHeadVisibility。

Node/sharp 读取 public/assets 实际 WebP，以每 4 逻辑 px 网格遍历所有地点 rect、五种弟子姿势及两个朝向，五栋 t1 同时已建。调整前存在头部不足 0.6 的地点：药圃、静修室、炼丹房、工地:B_GARDEN、工地:B_ALCHEMY。调整后每个样本均要求 ≥ 0.6。此测试不替代浏览器 GPU 绘制验收。

## 镜头、紧凑模式与降级

普通模式默认 zoom 1.5、中心 (300,200)，范围 1–3。pointer 拖动平移，滚轮以指针为中心缩放；角落按钮 ＋ / － / 全景可键盘聚焦，全景为 zoom 1 且居中。夹紧平移不露地图外；小地图固定画布右上角并显示视口框。状态只在内存，不写存档。仅 ?debug=1 暴露 window.__camera.get/set/panorama。

沿用 max-width:480px 紧凑判定，固定全景，隐藏镜头按钮、图例及建筑名牌；弟子改为直径 10px 灵根色点与名字首字，不画全身图。恢复普通尺寸时恢复此前镜头。地图画布禁用 touch-action 与文本选择，滚轮阻止页面滚动。

素材 404 仍回退底图/建筑色块/人物圆点，名字和灵根环独立于素材加载。配饰图标失败保留 ◇。老板键暂停、离线、存档导入导出、事件与设置的原有流程保持。

## 验证与体积

本轮不运行浏览器。scripts/e2e.mjs 保留原 01–06 与 --soak，更新 08–12，新增 13 全景、14 拖动及滚轮；报告每张美术截图的地图/镜头状态以及 manifest 建筑表。首屏字节仍以 Resource Timing decodedBodySize 为准。404 测试补充名字和光环计数。

旧 screenshots 报告属于上一轮，不能作为本轮通过证据；本轮浏览器截图、交互及首屏体积等待外部执行。当前 public/assets 总计 794378 字节（含 manifest），低于 5MB。Node 测试验证真实图片 alpha、裁切、布局、镜头边界及地图调度；sim 输出执行前后逐字比较。

## 第二轮小修验证说明

空地改为每行 3 人、列距 34。名字宽度按 fontSize 10.5 × 字数 × 1.0 + 描边 4px 估算；前排脚下、后排名牌底边放在脚底 y − 显示高度 − 4，碰撞时上下避让。所有地点以 24/48/96 显示高度验证名字互不相交，且不压其他弟子上 35% 头部框。

镜头只在内存，刷新恢复 1.5；01–06 每次截图前统一 set 默认镜头（06 紧凑模式仍强制全景）。新增 15-art-all-built.png 全景 canvas 与 16-art-all-built-zoom.png（zoom 1.5，中心 390,180）脚本；debug artAllBuilt 建好五栋，主殿/居舍 Lv2，其余 Lv1。__mapStats.labelOverlaps 逐项报告所有名牌与其他建筑掩码/名牌的重叠像素，报告包含零值供断言验证覆盖。紧凑模式 buildingLabels=0。

本轮不运行浏览器，15/16 截图与浏览器报告尚未生成，现存截图不是本次验收证据。素材源新增了 portrait/icon 等类别，导出脚本限定既有地图素材清单，避免把其他美术工作混入本轮。

### 地图最后小修（2026-10-29）

弟子姓名避让同时检查建筑与预留位名牌；后排优先贴近头顶4逻辑px，先左右微移（不超过12px），再上移。药圃名牌文字锚点改为(286,150.5)，位于地块上沿。开局与tick 60单测验证姓名框互不重叠、避开全部建筑名牌，且名字中心距其脚底或头顶不超过18逻辑px。

静修室最终采用地块右侧方案：文字左对齐起点(426,129.5)，含描边包围盒左边424、中心y=136。实际t1/t2炼丹房alpha掩码与名牌均不重叠；此前记录的炼丹房与静修室地块本身的残余重叠未在本轮调整。

紧凑圆点直径14 CSS px、首字11 CSS px（白字深描边，圆点居中），同地点横向中心间距16 CSS px；按canvas尺寸及object-fit:contain的实际缩放比反算逻辑尺寸，并在尺寸变化时重绘。09截图及原断言保留，新增markerCssDiameter≥12断言。本轮未运行浏览器，截图与视觉复验待外部执行。

## Bridge1：Iris bridge_v1

复现（不运行浏览器）：

```sh
node scripts/cut-bridge.mjs # 默认只读 ~/cutwork/backup/bridge_v1.jpg；也接受路径参数
npm run world
npm run build
npm test
npm run lint
```

切图脚本按实际 1280×720 原稿标定，而非最初估算框。全图色键距离 18–50 生成 alpha，并反解奶油底混色，板缝也参与抠图；沿桥轴裁掉端头封口绳。两个透明 WebP 的输出尺寸、桥面端中点 anchors、栏杆内净宽、重复段长度、来源 SHA-256 均在 manifest 中。h 净宽 102 源像素、d 净宽 88 源像素，整体等比缩放到 40 世界像素；以轴向中段（h 164 / d 145 源像素）首尾重复后裁短，无非等比拉伸。折点采用重叠后沿角平分线裁口。阴影由已裁好精灵的 alpha 压暗至 25%、模糊 1.2px、偏移 (1,3) 派生，不是新增木栏或绳索结构。

- north：桥头定位点 `(1575,525)` 到主岛 `(1575,735)`，h 旋转 90°；保留直线通路，避免为了透视新增折返。
- west：`(875,995) → (1000,1035) → (1165,960)`，d 与水平翻转 d，小角度旋转适配约 +17.74° / −24.44°。
- east：`(2015,995) → (2180,1050) → (2350,1033)`，d 与 h，约 +18.43° / −5.71°；指定的原第三折点成为东岛桥头，去掉延伸至 `(2400,1015)` 的旧段。

**坐标约定**：上述 points 是桥头对接定位点。为落实“从锚点向岛内压入”，实际桥面在两端沿轴延伸 10px；世界可走多边形包含这 10px。报告同时记录实际精灵 alpha 的轴向范围，测试要求含旋转取整后仍为 8–12px（不把模糊投影算作桥面）。原始岛图在北、西、东岛侧已画有木质引桥，因此这些位置是原图不透明岛面/木引桥，不是纯草地；测试同时核对岛顶可走多边形和原始岛图的非背景像素，不用“JPEG 处处 alpha=255”充数。主岛侧三个接点在草地上。

构建直接用 `build-world.mjs` 从源岛图合成的 canvas 加新桥及派生阴影，整图按原 HEAD 编码：WebP quality 86、effort 6，若超过 1.5MB 则每次降 5，低于 35 报错；小地图从未压缩合成图缩至 320×140，quality 75。两份旧基线 fixture 已删除，构建不读取 Git 或旧世界图。`docs/world-build.json` 记录实际 quality/字节数，`docs/bridge-build.json` 记录变换、接岸和右栏杆 alpha 检查。现有世界几何保持不变，`npm run world` 不重写岛轮廓、资源点或建筑位。

桥外回归测试通过 `git show` 读取 Bridge1 开始时的 HEAD（固定为 `a2b79f6381cf1ae006fed537686651e296433c39`，避免后续提交让比较基线跟着移动）。RGB 通道绝对差按 0–255 统计：主图 MAE ≤1.5、99 分位 ≤8，实测 0.299907／5；小地图 MAE ≤1.5、99 分位 ≤12，实测 1.166200／11。小地图 quality 75 下的缩采样及编码块传播使尾部差异稍高，因此单独使用 12，主图阈值没有放宽。另检查旧拼装桥全部覆盖范围（含 25px 边界）都落在桥区内，并将删除的东桥尾段与原岛图校色像素比较；旧 HEAD 拼装结果会被该检查拒绝。world.json 非桥字段仍逐字对照。

北桥右侧绳索核查：原水平桥的上栏杆在 +90° 旋转后成为右栏杆。中段裁切保留该栏杆，派生阴影先绘制、桥精灵后绘制；无阴影精灵下半段 y=630–743 共 114 行，在 x=1599–1612 范围内每行均有 alpha≥128，缺失行 0。增加源精灵重复段与实际输出的连续性断言，未盲改裁切参数。独立透明预览 `/tmp/xianfu-bridge-north-sprite.png`；世界比例下绳索较细，与浅色背景的对比较弱，仍有旋转透视取舍。

静态预览：`/tmp/xianfu-bridge-panorama.png`、`/tmp/xianfu-bridge-{north,west,east}.png`。已知视觉取舍：北桥旋转后柱子朝向不符合正常俯视透视；西桥拐角有半柱裁口；原图木引桥与新桥的粗细/色调及接缝仍可辨认。端头封口绳从新桥精灵裁掉，但岛图自身已有的木桥结构保留。阴影增强离地感，不能消除透视差异。

外部 Chrome 验收（本次仅写代码并检查语法，未启动浏览器）：

```sh
npm run preview -- --host 127.0.0.1 --port 4173
# 另一个终端；沿用现有 e2e 的 Chrome 配置
node scripts/e2e.mjs http://127.0.0.1:4173 --bridges
```

新增截图保存于 `/Volumes/Media/GrokBot/workspace/xianfu-bridge-panorama.png` 和 `xianfu-bridge-cross-{north,west,east}.png`。可用 `BRIDGE_SCREENSHOT_DIR=/tmp` 改目录。沿用真实寻路/移动采样，将相机放大至 1.5；截图前后要求同一弟子仍在对应桥的离岛段，否则重试，并把两次位置写入 e2e-report 的 `bridgeScreenshots`。三个截图缺任一个即失败；现有 bridgeCrossings 与其他检查保留。

`--bridges` 仅执行现有岛间移动验收和新增截图，报告写至同目录 `xianfu-bridge-report.json`；无该参数执行完整 e2e。主图实测 280,714 字节（quality 86）；首屏预算通过 `node scripts/first-screen-budget.mjs` 检查，静态上界为 1,390,133 字节（39 个文件，包含全部构建 bundle，限额 2,500,000 字节），不替代浏览器 Resource Timing 或完整 e2e。本次仍未启动浏览器。

### Clean1（2026-10-29；B 方案、山门通道与名牌）

主岛改用 `~/cutwork/backup/map_main_clean_v1.jpg`（测试比对 design 原图 SHA-256，只读）；`CLEAN_MAIN_SOURCE` 可覆盖来源。`scripts/clean-main-geometry.json` 保存新草地可走多边形、真实树石障碍及包含崖壁的外轮廓。主岛外轮廓向外羽化 12px，清除外围奶油底；其余三岛及 bridges 几何逐字保留。重测主岛地形是本任务明确授权的几何扩展。世界图有损 quality 86 / effort 6，小地图维持 320×140 / quality 75；取消降质量兜底，预算不变。

主殿保留本地 (490,310)，居舍 (310,350)、静修室 (860,280)、炼丹房 (790,390)，聚会中心 (640,430)，药圃仍在东岛。`scripts/clean-building-scales.json` 固定改动前两个等级的缩放；prebuild 只重算放置与测量，不再反复向 STATUS 追加大段记录。未建位置保留标签及原有交互，不画虚构石框。所有 slot 新增世界坐标 footprint/entrance；药圃保留整个地面占用范围。

主殿采用已确认的 B 方案：位置 (490,310)、两个等级缩放和完整脚印均不变，空路为本地 x=605–700、y=115–430。脚印最右缘 x=603.5，距走廊左边 1.5px。测试同时锁定主殿 rect/footprint、走廊不与任何脚印相交、北桥头至广场中心寻路可达和直线可通行。

山门沿用新底图绘制，仅将原有像素重新分层。逻辑 slot 的 rect/锚点 (619,512) 保留；按图上墙柱量取两翼碰撞矩形：本地 [533,510,589,568] 与 [643,519,702,580]，中心净通道 x=589–643（54px，接近要求的约 60px）。入口改为台阶前的 (616,580)。`slots[].footprint` 兼容单矩形和矩形数组，统一由 `footprintRects` / `inFootprint` 读取；寻路边界、长时间采样、e2e 和静态预览同步处理两翼。

`scripts/clean-gate-art.json` 记录原画裁切范围、遮挡多边形与脚底深度；`scripts/build-gate.mjs` 从最终 world.webp 裁切并抠出屋顶、门楣、立柱和侧翼，生成无损 `map/gate-foreground.webp`，不生成或补画美术像素。门洞透明，所有不透明 RGB 像素与原世界图逐字节相等。该前景以世界脚底 y=1190 排序：北侧弟子被门楣/柱遮住，走到前方后自然盖在前景之前，角色 z 不提升。底图仍在原位，两层不透明像素完全对齐，视觉上是一座山门。测试覆盖南北中心线、两翼密集采样、真实运动控制器 240 帧穿门及前后排序；debug `__gateWalk` 仅修改表现层路线。

建筑阴影为 Pixi 多层深褐椭圆，宽为本体底宽×1.05，高为宽×0.18，中心下移 3px，重叠中心 alpha 约 27.6%，统一在地面之上、建筑之下。弟子脚下同色软阴影；灵根圆环 22×7、alpha 0.6，打坐阴影宽 26。建筑按脚底排序，移除“头部被挡就抬到建筑前面”的提升逻辑。所有去建筑的行为（含居舍休息、静修）以入口为终点，抵达后 350ms 淡出；离开时从入口走出。共享入口允许多位弟子进入，室外落点仍分散。移除已进入者的名字和点击区域。

寻路使用 slot 脚印作为闭区间障碍。原先每 2px 采样 lineClear 会漏掉短拐角穿越，现按所有多边形边界交点切分线段再检查，并拒绝擦过建筑脚印边角。真实表现层运动控制器用 3 种 seed 各采样 1,200 秒（每 250ms 一帧），覆盖闲逛、进门、途中改道与插值；另测试入口/资源点、所有桥头、新图源哈希、两级缩放与炼丹房 alpha 底边。炼丹房底边本地 y≈391/396，逐列底部 alpha 像素到保守草地边界最小距离约 100.7/105.6px，不越悬崖；其右侧仍靠近画死的石头，保留静态预览供视觉判断。

弟子名牌字号从 21 降到 16，固定在人物头顶上方 8 个世界单位，保持水平居中；固定位置若撞到任一建筑图（含山门屋顶）、其他弟子身体或已显示名牌，则暂时隐藏，空出后恢复，文字不漂移。建筑牌字号 22→18，检查人物完整身体而非仅头部；向上让位 20px 仍冲突就隐藏。测试覆盖固定偏移、字号、建筑屋顶、身体/名牌互斥，以及穿门时名牌避让。

本次静态结果：build、lint、2.5MB 首屏预算通过；全量 vitest 298/298，四组 sim 与 `~/cutwork/baseline368/` 逐字一致。首屏清单新增山门前景文件，限额不变；最终字节数以 `node scripts/first-screen-budget.mjs` 为准。旧 Bridge1 图像差分仅排除明确替换的主岛范围，其他区域沿用原阈值。外部生成的 `docs/screenshots/e2e-report.json` 按授权仅修正 Prettier 格式，不作为本次浏览器结果。

静态组合预览：`node scripts/clean-preview.mjs` → `/tmp/xianfu-clean-preview.png`（原素材合成；红框脚印、绿点入口、蓝线可走区、绿框走廊、橙色树石障碍）。没有用脚本生成建筑/地形美术像素。桥头源像素和可走性断言通过，静态图三桥均接草地；北桥直角接岸、栏杆透视与羽化崖壁仍需外部 Chrome 实看。

本次没有启动浏览器、提交或推送。外部验收：

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
# 另一终端
node scripts/e2e.mjs http://127.0.0.1:4173 --clean
```

`--clean` 在两级建筑下分别采样 1,200 帧（walkScale=8），检查脚印、实际弟子 z、建筑屏幕包围盒中的后方遮挡、入口消失，输出 `/Volumes/Media/GrokBot/workspace/xianfu-clean-{panorama,main,disciples-48}.png` 与 `xianfu-clean-report.json`；`CLEAN_SCREENSHOT_DIR` 可覆盖目录。长时采样后额外驱动一名弟子穿过门洞，记录 `portalSamples/gateBehind/gateFront` 并验证两翼和深度关系。三张截图统一关闭弹窗、等待重绘并前后断言无可见 dialog/overlay。截图另开冻结场景：32-unit 精灵在 1.5 倍相机下约 48 CSS px，按实际位置裁 600×360 近景，检查完整弟子、打坐与入口附近落点；正式缩放不变。浏览器结果待外部运行，不以静态预览替代 GPU 验收。

Clean1 改动文件清单：

- 几何：`data/world.json`、`scripts/clean-main-geometry.json`、`scripts/clean-building-scales.json`、`scripts/clean-gate-art.json`。
- 生成脚本：`scripts/build-world.mjs`、`scripts/build-bridges.mjs`、`scripts/world-buildings.mjs`、`scripts/clean-preview.mjs`、`scripts/build-gate.mjs`、`scripts/first-screen-budget.mjs`。
- 表现与寻路：`src/render/map.ts`、`src/render/world.ts`、`src/render/visibility.ts`、`src/render/layout.ts`。
- 验证：`scripts/e2e.mjs`、`tests/clean.test.ts`、`tests/world.test.ts`、`tests/map.test.ts`、`tests/map-round2.test.ts`、`tests/bridge.test.ts`、`tests/clean-names.test.ts`、`tests/clean-screenshots.test.mjs`、`tests/map-final.test.ts`。
- 生成产物：`public/assets/map/world.webp`、`public/assets/map/world-mini.webp`、`public/assets/manifest.json`、`docs/bridge-build.json`、`docs/world-build.json`、`docs/world-buildings.json`、`public/assets/map/gate-foreground.webp`。
- 记录：`STATUS.md`、`docs/ART-INTEGRATION.md`；`docs/screenshots/e2e-report.json` 只做格式修正。

## 步骤A：四栋 grounded 一体切图（基于 0073c92）

桥任务仍暂停；没有读取/恢复 stash，也没有修改桥、世界底图、山门、灵田或任何 sim 数据。四张原稿从 `~/cutwork/backup/{hall,dorm,meditation,alchemy}_grounded_v1.jpg` 读取，实测均为 **1152×864**。本轮只处理原像素：外部背景连通域软色键、按背景衰减反推接触阴影 alpha、去米色污染、7 源像素边缘羽化、裁切与等比缩放。白墙等封闭内部浅色不参与外部色键。没有补画地基/草/石，没有环境滤镜或程序化地面贴花。

`public/assets/building/*-grounded@2x.webp` 保存原分辨率切图；现有 `*-t1-map@2x.webp` / `*-t2-map@2x.webp` 用约 2 倍世界分辨率导出，两级文件字节相同，暂时升级无视觉变化。manifest 记录尺寸、锚点、原稿 SHA256、crop 和 grounded 标记。四栋代码椭圆阴影取消，使用原图自带阴影；灵田原阴影/发光与山门逻辑保留。

### 量法与几何

主体宽度基准取 0073c92 的 `docs/world-buildings.json` t1 `bodyWidth`（现有脚底主体宽测量；主殿是旧 canvas 宽代理）。新图取石台/主体的左右极值，不含土草块：主殿源 x318–854、居舍 x314–886、静修室 x322–870、炼丹房 x321–882。源图到世界等比倍率 = 旧主体宽 / 新主体跨度。地面锚点取羽化后 alpha≥0.8 的最低行 y，以及最低 9 行内该阈值轮廓 x 最小/最大值的中点；因此不是建筑门口，也不是外接框中心。

| 建筑   | 主体源宽 → 世界宽 | 源→世界倍率 | 原稿锚点    | 裁切后锚点  | 固定世界锚点 | 世界入口                  |
| ------ | ----------------- | ----------- | ----------- | ----------- | ------------ | ------------------------- |
| 主殿   | 536 → 215         | 0.401119403 | (633,797)   | (447,746)   | (1440,930)   | (1361.781716,901.492537)  |
| 居舍   | 572 → 120         | 0.209790210 | (648.5,768) | (435.5,666) | (1260,970)   | (1218.566434,959.230769)  |
| 静修室 | 548 → 115         | 0.209854015 | (617,791)   | (425,724)   | (1810,900)   | (1780.410584,885.447080)  |
| 炼丹房 | 561 → 73.242581   | 0.130557185 | (643,801)   | (462,759)   | (1740,1010)  | (1714.410792,1003.810909) |

入口源台阶前沿测点分别为 `(438,701)/(451,669)/(476,674)/(447,677)`，映射到世界后沿屏幕向下加 10px。入口均在可走区、所有脚印外且从广场可达。rect 为覆盖切图并关于固定锚点水平对称的逻辑框；底边中点不变。只改这四栋 `rect/front/footprint/entrance`，世界其余字段与桥/岛几何保持原值，slots 以外文本逐字不变。

石台脚印采用 `{ "polygon": [...] }`，四角按实际可见底座与平行边推算被建筑挡住的后角；没有沿用旧窄矩形，也没有为走廊削脚印。世界坐标依次为：

- 主殿：`(1313.647388,835.736940), (1442.807836,899.113806), (1528.647388,832.929104), (1399.486940,769.552239)`。
- 居舍：`(1189.825175,927.202797), (1263.881119,955.314685), (1309.825175,927.412587), (1235.769231,899.300699)`。
- 静修室：`(1748.093066,853.202555), (1817.764599,888.038321), (1863.093066,856.770073), (1793.421533,821.934307)`。
- 炼丹房：`(1697.960587,979.188504), (1731.252669,1000.991554), (1771.203167,978.927390), (1737.911085,957.124340)`。

`inFootprint` 将多边形边界也视为碰撞；导航线段使用真实多边形边，而非外接矩形。矩形与山门双矩形保持兼容。e2e 用独立点入多边形算法检查采样点，保留入口消失、脚底排序/遮挡断言。近景相机由平均位置改为极值包围盒中心，保证新入口处弟子仍完整入镜。建筑名牌以 grounded 的实体地面锚点+8px 为基准，忽略其下方浅透明阴影尾部，防止居舍牌被无形尾巴推到悬崖外。

### 白边与重叠证据

边缘带定义 alpha 0.05–0.95，同时检查实测背景色及 `#F1E8D4`；RGB 距离小于 30 计为残留米色。要求平均逐像素背景色距 >60、残留比例 <1%（距离越大说明越不像纸底，不是越小越好）。实测原尺寸切图：

| 建筑   | 实测背景 RGB | 边缘平均色距 | 残留比例 | 保留的外部半透明深色阴影像素 |
| ------ | ------------ | ------------ | -------- | ---------------------------- |
| 主殿   | 241,236,230  | 214.12       | 0.080%   | 882                          |
| 居舍   | 242,237,231  | 217.83       | 0.049%   | 2170                         |
| 静修室 | 240,235,229  | 224.21       | 0.017%   | 3218                         |
| 炼丹房 | 241,236,230  | 232.12       | 0.226%   | 991                          |

精确背景/统计以 `scripts/grounded-geometry.json`、`docs/grounded-report.json` 为准；单测同时检查原尺寸与地图变体。地面越界采用保守的源 y≥500、石台多边形外、alpha≥0.05 的土草/灌木区域采样，面积换算为世界像素²；并非靠肉眼声称全部无缝。

- **主殿地面侵入走廊约 596.60 世界像素²**，世界包围范围 x1555.29–1579.79、y823.32–874.84，即本地 x605.29–629.79、y203.32–254.84。石台本体最右 x1528.65，距走廊左边约26.35px；碰撞走廊断言与北桥→广场寻路通过。
- **主殿/居舍 alpha 重叠约 257.76 世界像素²**，位于居舍右上方/主殿左侧土草。其他四栋配对重叠为0。保留实图，未移动坐标或裁掉地面掩盖问题。
- 四栋上述地面区域越出主岛可走区面积均为0；炼丹房底沿的独立逐列崖线检查通过。

`/tmp/xianfu-grounded-overlap.png`：蓝色可走区/北桥走廊、橙色石台脚印、绿点入口、红框越界、紫框相邻图像重叠；副本 `artifacts/xianfu-grounded-overlap.png`（artifacts 沿用现有 gitignore）。另有 `/tmp/xianfu-grounded-main.png` 原图静态合成、`/tmp/xianfu-grounded-cutouts.png` 绿色背景白边检查图。

不满意之处：地面块仍有明确的土草色边界；主殿地面侵入空路、与居舍重叠；按旧 73.24px 主体宽匹配后炼丹房样张显小；锚点固定在地面块前沿，使可见建筑本体比旧图更靠后。四栋只用一版样张，没有升级造型。后角位置来自被遮挡底座平行边推算，不是假装能从图片直接看到。由于地面和建筑共用一个 y 层，侵入走廊的地面块可能遮挡经过该区域的弟子，需外部截图观察；本轮不拆地面、不改坐标。

### 重建和外部验收

```sh
node scripts/cut-grounded.mjs
node scripts/world-buildings.mjs
node scripts/grounded-preview.mjs
npm run build
node scripts/e2e.mjs http://127.0.0.1:4173 --clean
node scripts/e2e.mjs http://127.0.0.1:4173 --grounded
```

`--grounded` 用独立 context 输出 `/Volumes/Media/GrokBot/workspace/xianfu-grounded-{panorama,main,east}.png` 及报告，拍摄前关闭弹窗并检查无 overlay/无未选中弟子名牌；`GROUNDED_SCREENSHOT_DIR` 可改输出目录。也可 `--clean --grounded` 连跑 Clean 专项采样与新截图；完整原 UI 回归仍用单独 `--clean`。本轮未运行浏览器。

本轮验证：`npm run build`、`npm test`（312/312）、`npm run lint` 全过；四组 sim 输出与 `~/cutwork/baseline368/` 逐字一致；首屏静态上界 **1,585,311 / 2,500,000 字节**。测试另覆盖真实多边形边界/包围框角落可通行、原稿哈希、两级像素相同、四栋仅烘焙阴影、sim无副作用、长时运动采样。未提交推送、未动 stash，未改 design/sim/桥。

本轮改动文件：`scripts/cut-grounded.mjs`、`scripts/grounded-geometry.json`、`scripts/grounded-preview.mjs`、`scripts/clean-preview.mjs`、`scripts/world-buildings.mjs`、`scripts/e2e.mjs`；`src/render/world.ts`、`src/render/map.ts`、`src/render/building-labels.ts`；`data/world.json` 的四槽几何；manifest、四张 grounded 原尺寸 WebP、八张 t1/t2-map WebP、`docs/world-buildings.json`、`docs/grounded-report.json`；`tests/grounded.test.ts`、`tests/assets.test.ts`、`tests/clean.test.ts`、`tests/clean-screenshots.test.mjs`、`tests/map-round2.test.ts`、`tests/map.test.ts`、`tests/world.test.ts`；`STATUS.md` 和本文件。

### 步骤A / Lore 边缘与地面遮挡补充

- `scripts/grounded-edge.mjs`：全尺寸与地图缩放结果分别做 1px alpha 最小值内收；对半透明及全透明像素用最近 alpha=255 像素 RGB 外扩。原脚点/裁切测量基准保持不动，避免重新测量使世界入口漂移。保留 7px 羽化与阴影 alpha；外扩会改变阴影边缘 RGB，不能宣称与原稿阴影颜色逐像素一致。
- Sharp 执行抠图、裁切、缩放；最后用现有 Python3/Pillow 11.3 的 WebP lossless + exact 编码（`scripts/encode-grounded.py`），保留 alpha=0 的 RGB。重建环境需要 Pillow，未新增 npm 依赖。t1/t2 仍共图；没有调整 world.webp 的质量配置。
- 编码后 full/map/t2-map 回读检查：透明像素附近 12px（覆盖 7px 羽化带）内若存在全不透明像素，最近颜色距离均值必须 <35，米色比例 <1%；半透明边缘米色比例仍 <1%。四张 full 实测米色比例：hall 0%、dorm 0.0423%、meditation 0%、alchemy 0.0333%。另测内收不扩大 alpha、透明区 RGB 外扩、半透明阴影 alpha 保留。
- 发现真实的可走地面被整栋 sprite 遮挡：遍历 map alpha>=128、y<脚点、且 walkable 的地面像素，分离后免于遮挡的样本分别为 hall 50,783、dorm 10,487、meditation 9,220、alchemy 4,904（每样本约0.25 world px²）；hall 其中1,314个位于北桥走廊。这是静态可走位置采样，不是宣称浏览器真实行走帧已验收。
- 最小分层：沿手量石台左右端—前顶点折线拆下半部。`grounded-layers.ts` 统一定义，主体仍在原脚点 y 深度；地面复用原纹理的互补蒙版，固定 z=-900、eventMode=none，低于所有弟子。主体 alpha 遮挡采样也裁去同一部分；寻路、入口、碰撞、弟子 y 排序均不改。不烘焙 world，不增加纹理请求。上半部侧面灌木仍随主体，保留真实建筑后方遮挡；并非对每株灌木作语义分割。
- 静态合成已改为全部地面先画、主体后画。更新 `/tmp/xianfu-grounded-main.png`、`/tmp/xianfu-grounded-overlap.png`、`artifacts/xianfu-grounded-overlap.png`。内收后原图地面侵走廊仍约480.03 world px²，hall/dorm图像交叠约142.84 world px²；不移动建筑或削碰撞。
- 不加 ColorMatrixFilter：本轮没有足够证据支持按岛整体改色，不拿滤镜掩盖素材问题。
- 指定只读参考 `/Volumes/Media/immortal-qa/design/research-scene-blending.md` 当前不存在，目录检索未找到；未能阅读第3/5条，不声称采纳其内容。实施依据为 Lore 在本轮消息中的明确要求。
- 验证：build/test/lint、四组 sim 字节 diff、首屏预算；不跑浏览器。外部继续执行 `node scripts/e2e.mjs http://127.0.0.1:4173 --clean` 与 `--grounded`，保留全部原 clean 深度/碰撞断言。重点检查石台分层接缝、入口淡出、走廊弟子与侧面灌木。

### 步骤A / 外部验收后尺寸与预算修正

- 根因：`--grounded` 原本就用游戏默认 `96 * 0.7 = 67.2` world px；`--clean` 的普通截图却沿用了48px特写场景的32 world px override。同为0.95相机时，配置屏幕高度分别63.84与30.4 CSS px（2.1倍），并非游戏尺寸回归。
- clean panorama/main 与 grounded panorama/main/east 都清除 URL `discipleHeight`，采用游戏默认尺寸。clean 48px特写重新加载单独32 world px场景，zoom1.5；不会污染普通截图。`__mapStats.discipleScreenHeight` 记录渲染所用高度乘相机倍率，两个main共用默认尺寸断言，容差0.1 CSS px，并拒绝compact模式。旧clean-main会恢复游戏默认大小，不应再作为32px尺寸基准。
- `encode-grounded.py` 改为有损 WebP quality86、alpha_quality100、exact=True；full和map均保留内收与RGB外扩，替代上一段的lossless配置。全尺寸及t1/t2地图文件回读边缘测试全部通过，未放宽阈值。
- 验证：build通过；25文件319测试通过；lint通过；四组sim与baseline368逐字一致；首屏1,544,877 / 2,500,000 bytes，比此前2,236,807减少691,930 bytes，达到1.7MB以内目标。未运行浏览器；外部重跑`--clean`和`--grounded`。原有外部截图与报告保留。
