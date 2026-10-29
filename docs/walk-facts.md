# Iris：走路素材与代码事实

范围：修复前为git **e704264**；修复后为本地三笔提交（朝向/步频/台基）后的main。没有改图、建筑坐标或sim。本文可直接复制为 `/Volumes/Media/immortal-qa/xianfu-walk-facts.md`。

## 素材和方向映射

游戏实际加载独立WebP文件，不是sprite sheet，没有行/列坐标。每个水平朝向都使用2帧，右向由同一套左向素材镜像；没有独立右/上/下行走图。

| 性别 | 帧0路径                                       | 帧1路径                                       |
| ---- | --------------------------------------------- | --------------------------------------------- |
| 男   | public/assets/disciple/walk-step-96@2x.webp   | public/assets/disciple/walk-pass-96@2x.webp   |
| 女   | public/assets/disciple/f-walk-step-96@2x.webp | public/assets/disciple/f-walk-pass-96@2x.webp |

上述实际图像均80×96；原尺寸版本分别为同目录`walk-step@2x.webp`、`walk-pass@2x.webp`、`f-walk-step@2x.webp`、`f-walk-pass@2x.webp`，均386×462，运行时不加载这些原尺寸版本。原图与96变体默认均朝左。

| 性别 | 移动方向 | 动画/帧顺序                                           |  帧数 | 镜像规则                     |
| ---- | -------- | ----------------------------------------------------- | ----: | ---------------------------- |
| 男   | 左       | walk-step → walk-pass                                 |     2 | scale.x正，无镜像            |
| 男   | 右       | walk-step → walk-pass                                 |     2 | scale.x负，水平镜像          |
| 男   | 上       | 无上向图，继续最近水平朝向的walk-step → walk-pass     | 2复用 | 上次左：不镜像；上次右：镜像 |
| 男   | 下       | 无下向图，同上                                        | 2复用 | 同上                         |
| 女   | 左       | f-walk-step → f-walk-pass                             |     2 | 无镜像                       |
| 女   | 右       | f-walk-step → f-walk-pass                             |     2 | 水平镜像                     |
| 女   | 上       | 无上向图，继续最近水平朝向的f-walk-step → f-walk-pass | 2复用 | 上次左：不镜像；上次右：镜像 |
| 女   | 下       | 无下向图，同上                                        | 2复用 | 同上                         |

未发生水平移动时初始逻辑方向为右，因此纯竖直首程沿用右向镜像。四方向录制顺序是左→右→上→下，上/下应继续面向右。没有双侧素材，故当前无需“选右图后禁止再翻转”的分支；若Iris新增右向资产，必须同时更新资源选择与源方向元数据，不能继续套左图镜像规则。

停行站立帧=walk-pass（女性f-walk-pass），无独立idle图。正常静止的修炼/做工/社交另用meditate/work/talk；录帧debug固定回站立帧。meditate/f-meditate为正面，work朝左、talk朝右（女性work/talk复用共享图），不套统一反转。16份full/96资源都有独立像素肤色重心方向断言。

## e704264旧代码（用git show核对行号）

- `src/render/world-scale.ts:1–4`：DISCIPLE_SCALE=0.7；旧计算身高93.71×0.7=65.597；WALK_SPEED=20 world px/s；WALK_FRAME_MS=0.35×65.597/20×1000=**1147.9475ms**。
- `src/render/world.ts:356–357`：routeSpeed=max(20, pathLength/80)，长路线会提速以控制时长。
- `src/render/map.ts:159–166`：walkScale默认1；只有debug=1且有效正值才启用，并上限100。实际路径速度=routeSpeed×walkScale。67.2高是默认渲染尺寸，不是旧帧间隔所使用的65.597。
- `src/render/map.ts:689–707`：moving按elapsed<duration；动画输入时间还乘routeSpeed/20×walkScale。`src/render/layout.ts:31–33`以floor(elapsed/WALK_FRAME_MS)%2选2帧。
- 因此旧版**不是完全不随计划速度变化的固定fps**：20px/s、walkScale=1时换帧率约**0.87112帧/s**、2帧一周期约**2.29590s**；一般换帧率=0.87112×routeSpeed/20×walkScale。它依赖计划速度/时间，不检测实际位移，零位移时也能进入walk-step。
- `src/render/map.ts:696–697`：新旧x比较，大于为+1，小于为−1，x相等保持；`1035`还按目的地x预先定朝向；`831`非meditate直接scale.x乘facing。行走源图朝左，导致右行不翻转却面向左。
- 固定居舍→主殿入口：`src/render/map.ts:1075–1092`。`src/app/main.ts:698`附近的world()返回structuredClone，并非可写世界；advance/reset/settleArt不能指定任意坐标。无可用的任意目标setter。

## 当前代码（修复后）

- 唯一stride比例配置：`src/render/disciple-gait.ts:3`，**STRIDE_HEIGHT_RATIO=0.7**。注释明确为Iris初始测量值，后续校正只改这一处。
- 默认渲染身高=96×0.7=**67.2 world px**，每周期位移stride=**47.04 world px**，`WALK_CYCLE_FRAMES=2`（同文件:6），每**23.52 world px**换一帧；`MIN_WALK_SPEED=0.5`（:7）。zoom=z时屏幕周期位移47.04z、屏幕身高67.2z，比例恒为0.7。
- `disciple-gait.ts:8–29` advanceGait：实际distance/stride累计周期；速度<0.5 world px/s不推进；停下回walk-pass站立帧。20px/s时周期2.352s、每1.176s换帧（≈0.85帧/s）；速度翻倍时换帧率翻倍。不是固定时钟播放器。
- 朝向算法：`src/render/disciple-facing.ts:3–13`（defaultFacing源图朝向表:3–5，HORIZONTAL_FACING_EPSILON=0.5:6，horizontalFacing:7–9，spriteFlip=期望朝向×源朝向:10–13）；调用处`src/render/map.ts:793`（由实测vx定朝向）、`:798`（advanceGait）、`:810`（spriteFlip）、`:943`（sprite.scale.x *= flip）。`map.ts:786–810`为实际脚点位移累计。
- 速度：`src/render/world.ts:372–373` routeSpeed=max(20, pathLength/80) world px/s，未改；实际=routeSpeed×walkScale（`map.ts:178–185`，walkScale默认1）。四方向60px路线在默认20 world px/s下各3秒。
- 台基分层：`src/render/grounded-body.json`保存台基顶面折线和静修室前柱的独立掩模；`grounded-layers.ts`将其转换为不改图的运行时mask。屋顶/屋身按脚点y排序，台基/踏步/静修室地板在z=-900地面层。碰撞用实测台基多边形＋18px脚底外扩（`src/render/pedestal-geometry.json`、`world.ts`渲染层worldMap覆盖），不靠遮挡容许脚踩石台。

## 录帧与截图条（本轮真实Chrome运行）

录制：playwright-core＋本机Chrome无头，DPR2，四方向路线以开阔草地(1600,780)为中心：左(1630→1570,780)、右(1570→1630,780)、上(1600,810→750)、下(1600,750→810)，各60 world px、3秒，每100ms取1帧（每方向30帧，256×320 clip跟随弟子）。每4帧取1张（索引0、4、…、28，共8张），只用`scripts/walk-sheet.mjs`里sharp composite横拼，**无文字/标注/手绘**。

- after（main，4173）：`node scripts/e2e.mjs http://127.0.0.1:4173 --walk --walk-dirs --walk-tag=after`，directions.json中左向facing=-1/flip=1（源图本就朝左，不镜像），右向facing=1/flip=-1（镜像为朝右），上/下保持最近水平朝向（右）。六秒模式`--walk`：facingAgreement=1，27个相位样本，cyclesPerPixel=0.021259（=1/47.04），变异系数≈0。
- before（e704264，4174）：e704264没有任意路线setter；为拍同路径四向对照，在独立before worktree（`xianfu-before`，未提交、只在QA用）加了一个只设路线的`window.__legacyRoute(id, from, to)`调试钩子（仿既有__gateWalk，不改旧朝向/动画代码；补丁存`xianfu-tasks/gI-before-qa-hook.patch`）。directions.json记hook='__legacyRoute (QA-only)'，旧版无朝向/相位遥测（frame=null），不做断言。画面可见：向左走用朝右镜像帧、向右走用朝左原帧（倒着走），且换帧按计划时间而非位移。
- 交付：`/Volumes/Media/immortal-qa/xianfu-walk-before.png`、`xianfu-walk-after.png`（各2048×1280，从上到下：左/右/上/下，每行8帧）；分方向条`xianfu-walk-dirs-{before,after}-{left,right,up,down}.png`（各2048×320）。
- 注意：默认20 world px/s下3秒只走60px≈1.28周期，按位移每23.52px换帧，3秒内约2.5次换帧，故每4帧取1的条中步态变化稀疏，这是速度与步幅的真实比例，不是丢帧。
