# e704264：朝向、步频、台基碰撞三项修复

## 红灯证据与根因

先写 `disciple-facing.test.ts`、`disciple-gait.test.ts`、`pedestal.test.ts`，保持抽出的旧朝向/计时公式，跑出7条失败。随后修复。另在 `/tmp` 只读展开 **e704264**，把两条真实renderer回归测试附到旧版map.test，用旧代码再现：

- bug1：右行实际 sprite.scale.x 为正，而行走源图朝左；`expected 1, received -1`。`/tmp/bugs12-renderer-red.log`，测试 `baseline bug1`。
- bug2：0ms/零位移已显示walk-step；`expected 0, received 1`。同日志，测试 `baseline bug2`。纯函数红灯另显示相同时间速度翻倍仍都是0.43556周期，以及零位移moving=true；`/tmp/bugs12-red.log`。
- bug3：主殿台阶 `[1361.781716,891.492537]` 被判可走；排序锚点930与台基前沿903.526相差26.474；旧入口仍紧贴旧菱形。`/tmp/bug3-red.log` 三条失败。修复前后测试代码保留在测试目录；未运行浏览器。

## 1 朝向

manifest没有朝向字段。检查所有8张原尺寸图及8张96高变体，源素材默认方向如下；idle没有独立图，复用walk-pass。女性work/talk复用共享源图，非不存在的女性专用帧。

| 源姿态（原尺寸与96变体均适用） | 默认方向 | 头部肤色重心相对头部不透明重心/图宽 |
| ------------------------------ | -------- | ----------------------------------- |
| walk-step                      | 左       | -0.0839 / -0.0854                   |
| walk-pass / idle               | 左       | -0.0779 / -0.0789                   |
| work                           | 左       | -0.0466 / -0.0454                   |
| talk                           | 右       | +0.0859 / +0.0894                   |
| meditate                       | 正面     | -0.0066 / -0.0062                   |
| f-walk-step                    | 左       | -0.1342 / -0.1287                   |
| f-walk-pass / female idle      | 左       | -0.1253 / -0.1182                   |
| f-meditate                     | 正面     | +0.0034 / +0.0047                   |

像素测试取顶部45%区域、alpha>=230，肤色阈值r>175/g>105/b>60、r>1.1g、g>1.08b；重心偏移绝对值<0.02判正面，其余按符号验证。它独立验证所有16个文件，不只测试硬编码表。`disciple-facing.ts`用实际vx决定逻辑朝向，|vx|<0.5 world px/s保留上次方向；sprite flip=期望方向×源方向。遮挡alpha采样同步使用相同flip，打坐正面不翻转。

## 2 位移步频

`disciple-gait.ts`：stride=**0.7×当前渲染身高**。默认height=96×0.7=67.2，stride=**47.04 world px**；两张行走帧各占半步幅23.52px。该比例沿用此前每帧约0.35身高的步长意图，但去掉时间驱动。相位累计**实际脚点位移/stride**，包括重规划前最后一小段；不再以计划速度×时间代替实走距离。速度<0.5px/s、零位移时不迈步、不推进相位，行走完成回静止姿态；修炼/做工等正常静止行为保留对应图。没有独立idle美术时使用walk-pass。debug录帧/摆位强制站立walk-pass，不修改sim行为。

`--walk`每100ms采一帧、共60帧/至少6秒；DPR2，每帧256×320，JSON含位置/vx/vy/逻辑朝向/flip/pose/帧号/phase/累计cycles/stride。相位与距离稳定性排除转向跨帧位移抵消及静止样本。新代码强制右、左水平往返，并断言方向一致率100%、相位比值CV<0.1；旧代码缺少任意路径和遥测钩子时降级用既有walkDormToHall，缺失字段记null、报告不支持的指标，不伪造水平往返。关闭弹窗后重新开始录制路径。

```sh
node scripts/e2e.mjs http://127.0.0.1:4173 --walk --walk-tag=before
node scripts/e2e.mjs http://127.0.0.1:4173 --walk --walk-tag=after --headed
node scripts/walk-sheet.mjs --walk-tag=after
```

输出 `/Volumes/Media/GrokBot/workspace/walk-frames/<tag>/{000..059}.png`、motion.json，以及根目录xianfu-walk-<tag>.png（10列只拼接已有截图）。`--headed`可省略以无头运行。before旧版本需使用这次的e2e脚本及e2e-walk模块连接旧预览服务，不能使用旧脚本不存在的参数。

## 3 台基与脚底

`measure-pedestals.mjs`只读现有grounded WebP：用记录在JSON中的语义搜索多边形限制石台/栏杆/台阶区域，alpha>=230，暖中性色/木色像素提取并求外包凸多边形；并入原台基角点，避免漏掉阴影中的边。灵田在旧围栏边35源px带内量木色不透明像素，山门读取现有前景两翼实心木石像素并保留已量的两翼外框。程序只生成几何，未改图。

脚底取各walking-96图锚点上方8px到底部的不透明鞋尖横向最大距离，按默认0.7缩放：男step16.8、男pass7.7、女step14.7、女pass7.7 world px。加1px后向上取整，**footRadius=18px**。外扩采用16方向外切近似，确保最小净距≥18px。山门实体门洞54px不变，脚点可用通道54−36=**18px**，中心线x1566及CELL=10网格仍连通；原北桥→广场走廊未修改，主殿新碰撞最右1548.605<走廊左界1555。

所有覆盖只在`render/world.ts`加载时生成的worldMap中生效，`sourceWorldMap`保留原数据。data/world.json、建筑sprite位置/缩放、原图片均未动。可走判定、导航边界、CELL=10节点、lineClear、spawn/spots投影、建筑目标入口、debug/e2e全部读取同一有效几何。入口沿实测台阶前方留18px脚底半径+10px余量，并验证可走及广场可达。排序改成可见台基前沿y，非土草块底部；按Iris补充原则，主体mask只保留台基顶面以上的屋身/屋顶（静修室前立柱单独保留），台基/台阶/静修室地板与土草都在弟子下方；碰撞独立阻止脚踩台基。

完整**世界坐标多边形**、源像素轮廓、搜索窗口和样本数：`src/render/pedestal-geometry.json`（可由测量脚本复现）。以下为多边形包围盒，不能拿包围盒替代实际多边形寻路：

| 建筑   | 顶点数 | 碰撞包围盒[x0,y0,x1,y1]                          | 新入口              |    排序y |
| ------ | -----: | ------------------------------------------------ | ------------------- | -------: |
| 主殿   |     41 | [1292.086,751.200,1548.605,921.879]              | [1361.782,919.493]  |  903.526 |
| 居舍   |     37 | [1169.794,880.948,1329.646,977.024]              | [1218.566,977.231]  |  958.671 |
| 静修室 |     41 | [1728.271,803.582,1883.125,909.329]              | [1780.411,903.447]  |  890.976 |
| 炼丹房 |     43 | [1678.041,938.772,1790.861,1021.564]             | [1714.411,1021.811] | 1003.211 |
| 灵田   |     54 | [2403.821,763.495,2827.692,1064.642]             | [2542.330,1018.365] | 1046.289 |
| 山门   | 两矩形 | 左[1465,1112,1557,1206]；右[1575,1121,1670,1218] | [1566,1218]         |     1200 |

`node scripts/e2e.mjs http://127.0.0.1:4173 --pedestal` 输出八张xianfu-pedestal-{hall,dorm,meditation,alchemy}-{back,front}-2x.png和报告，规格zoom0.95、DPR2、1280×900。纯render debug钩子最近可走点摆位、强制站立、在UI重绘时保持摆位；reset清除。断言脚点可走及前后z序。`--clean`原碰撞/遮挡断言保留，改读新覆盖表。

默认尺寸下长时采样未发现脚点进入新碰撞；不能据此宣布截图完全无穿模。待外部重点检查的入口/斜栏杆附近局部坐标：main主殿(411.782,299.493)、居舍(268.566,357.231)、静修室(830.411,283.447)、炼丹房(764.411,401.811)、山门(616,598)；east灵田(529.330,497.365)。宽阔灵田斜围栏的身体遮挡仍依赖单一前沿z，需真实截图确认；未追加分柱图层。非默认debug弟子放大到96高时，18px脚底覆盖不承诺仍足够，默认游戏尺寸和本轮截图均不启用该放大。

## 分三次提交的文件/hunk边界

1. **朝向**：disciple-facing.ts、disciple-facing.test.ts；map.ts的方向采样/flip/遮挡采样hunk；map.test.ts的baseline bug1。核心模块不依赖另外两项。
2. **步频**：disciple-gait.ts、disciple-gait.test.ts；e2e-walk.mjs、walk-sheet.mjs、walk-report.test.mjs；map.ts的实测位移/phase/遥测/debug路线hunk；e2e.mjs的--walk/--headed入口；map.test.ts步频与双向真实sprite回归。
3. **台基**：pedestal.ts、pedestal-geometry.json、measure-pedestals.mjs、world.ts、grounded-layers.ts、e2e-pedestal.mjs、pedestal.test.ts；map.ts的建筑/山门z、debug摆位/几何暴露hunk；e2e.mjs的--pedestal入口；clean/grounded/grounded-layers/garden-grounded/map测试中几何与排序预期；本报告、ART-INTEGRATION、STATUS。

共有map.ts/map.test.ts/e2e.mjs有跨项修改，不应整文件都放进第一笔提交。几何旧断言更新为新测量表；山门通道断言改为扣除实体脚底后的18px；炼丹房小图的全部土草前沿已被18px安全间距覆盖，不再强制那里必须出现可走土草像素，主殿仍验证地面分层可走案例。

验证结果：`npm run build`、`npm test`（**34文件351项**）、`npm run lint`通过；四组sim既与368d2d1独立归档输出逐字一致，也与`~/cutwork/baseline368/{sim-HEAD,sim-r100,sim-r100-idle,sim-seeds}.txt`再次diff为空。首屏 **1,606,635 / 2,500,000 bytes**（40文件）；预算未放宽。git diff确认public图片、data和src/sim均无修改。现有真实motion控制器长时用例继续覆盖3种子、idle/work/中断/到达、每种子1200秒；新的摆位/步频/翻转测试也通过。（gI收尾）本轮已在本机Chrome真实运行：`--pedestal`八张截图、`--walk`/`--walk-dirs`四向录帧、`--clean --grounded`、`--bridges`、`--platform`及默认全量e2e均通过；测试数以最终提交为准（见STATUS）。

## Iris补充：四向录帧与before/after完整命令

在原gH改动上继续：stride比例仍为单处0.7，增加周期帧数常量2与半周期位移断言；四栋主体不再包含石台/踏步，静修室地板也在地面层，前柱保留。`--pedestal`除脚点排序外还断言台阶属于地面层且地面z低于弟子。路径与素材事实、旧/新代码行号、方向条说明见 `docs/walk-facts.md`。

以下命令已在本机实际运行。before worktree保持e704264，仅加未提交的QA-only `__legacyRoute`路线钩子（补丁`xianfu-tasks/gI-before-qa-hook.patch`），录制脚本始终取当前工作区版本。

终端1，启动before（若4174已有正确preview则跳过）：

```sh
cd /Volumes/Media/GrokBot/workspace/xianfu-before
npm run build
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort
```

终端2，启动after：

```sh
cd /Volumes/Media/GrokBot/workspace/xianfu-web
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

终端3，用当前脚本连接两个服务：

```sh
cd /Volumes/Media/GrokBot/workspace/xianfu-web
# 六秒before：旧接口降级为居舍到主殿，缺失遥测记null
node scripts/e2e.mjs http://127.0.0.1:4174 --walk --walk-tag=before --headed
node scripts/walk-sheet.mjs --walk-tag=before
# 四向before：借QA-only __legacyRoute同路径录制（无钩子时记supported=false并降级旧路线）
node scripts/e2e.mjs http://127.0.0.1:4174 --walk --walk-dirs --walk-tag=before --headed
node scripts/walk-sheet.mjs --walk-dirs --walk-tag=before
# 六秒after：真正水平右/左往返
node scripts/e2e.mjs http://127.0.0.1:4173 --walk --walk-tag=after --headed
node scripts/walk-sheet.mjs --walk-tag=after
# 四向after：左/右/上/下各3秒及四条/总图
node scripts/e2e.mjs http://127.0.0.1:4173 --walk --walk-dirs --walk-tag=after --headed
node scripts/walk-sheet.mjs --walk-dirs --walk-tag=after
node scripts/e2e.mjs http://127.0.0.1:4173 --pedestal
node scripts/e2e.mjs http://127.0.0.1:4173 --clean
```

去掉`--headed`即无头（本轮均无头）。四向before钩子只设路线，不注入新运动/朝向逻辑；无钩子时不生成方向条，是明确的降级结果。四向路线中心已改到开阔草地(1600,780)，避开其他弟子与建筑。

更新后的提交边界：bug1文件不变；bug2再包括e2e-walk四向逻辑、walk-sheet方向条、walk-report方向/竖向测试和walk-facts；bug3再包括`src/render/grounded-body.json`、grounded-layers与map掩模补充、grounded-layers测试及e2e-pedestal地面层断言。共享e2e入口、文档/STATUS按对应hunk拆分。
