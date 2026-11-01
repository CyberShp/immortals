# world-v4 表现层接入清单

仓库：`/Volumes/Media/GrokBot/workspace/xianfu-web`；只做本地提交，不推送。

## 交付状态

55 件运行素材接入，其中45件前景逐件列在后表。世界4997×2320。原始bundle校验全部通过，旧素材未删除、未覆盖。PNG仅无损转WebP，尺寸保持；前景运行时按清单bbox建立显示纹理，减少透明画布显存占用，磁盘素材及世界锚点保持不变。

**接入可运行，不宣称全量验收通过。** v4几何20/21通过；B8三座位与定稿阵法碰撞冲突。全量单测465通过、3项既存v3失败。

## 开关与运行

`npm run build`，再 `npm run preview -- --port 4173`。默认地址为v4；`?world=v4`显式选择；`?world=v3`返回3600×1600冷色旧世界；兼容`?cool=1`旧入口；`?world=classic`返回早期四岛。调试加`&debug=1`。

## 图层与placement

PNG已经是完成仿射后的结果，使用placement中的整数world_origin，**不再次施加源图matrix**。各placement实际原点与任务给定数字一致。east_bridge_v4使用east_bridge_v3_placement；platforms placement中的旧文件名v1按任务明确替换为v1b，保持原点和尺寸。雾带与对应平台同尺寸、同原点。

背景、主台、桥、副台、雾带为负z地面层；其上角色脚底y与前景baseline排序。gate保持世界基线1490.1；左右盖件真实基线为1412.215735/1479.573093，强制提高到gate后的1490.11/1490.12。门楼因此能遮挡走过的弟子，同时盖件不会落到门楼后。两件东桥口原柱z=100000，稳定置顶。这是任务允许的gate与弟子排序例外：平台/雾先画，gate及盖件进入排序组。

基线HEAD：`b3af2710421a10fb0a042a36e96c676699aed5c0`

| 素材原文件                                              | 用途         | 世界左上角   |       图层z | placement/基线来源                               | 状态   |
| ------------------------------------------------------- | ------------ | ------------ | ----------: | ------------------------------------------------ | ------ |
| `background/background_world_v2_4997x2320.png`          | RGB底图      | (0, 0)       |  -1100.0000 | `world_extent/画布`                              | 已接入 |
| `main-platform/main_platform_v4refine_v3_3600x1920.png` | 主台底图     | (342, 200)   |  -1090.0000 | `world_extent/(342,200)`                         | 已接入 |
| `bridges/east_bridge_v4.png`                            | 桥或端盖件   | (3448, 1343) |  -1080.0000 | `bridges/east_bridge_v3_placement.json`          | 已接入 |
| `bridges/south_bridge_v1.png`                           | 桥或端盖件   | (798, 1292)  |  -1070.0000 | `bridges/south_bridge_placement.json`            | 已接入 |
| `platforms/east_platform_v1b.png`                       | 副台         | (3580, 1203) |  -1060.0000 | `platforms/placement.json`                       | 已接入 |
| `platforms/south_platform_v1b.png`                      | 副台         | (188, 1302)  |  -1059.0000 | `platforms/placement.json`                       | 已接入 |
| `fogband/east_fogband_layer_v2.png`                     | 独立透明雾带 | (3580, 1203) |  -1040.0000 | `platforms/placement.json（同平台）`             | 已接入 |
| `fogband/south_fogband_layer_v2.png`                    | 独立透明雾带 | (188, 1302)  |  -1040.0000 | `platforms/placement.json（同平台）`             | 已接入 |
| `fg/tower.png`                                          | 前景遮挡     | (342, 200)   |    768.9000 | `fg/fg_list.json`                                | 已接入 |
| `fg/hall_front.png`                                     | 前景遮挡     | (342, 200)   |    869.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_west_01.png`                                   | 前景遮挡     | (342, 200)   |   1132.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/dorm_4.png`                                         | 前景遮挡     | (342, 200)   |   1176.7000 | `fg/fg_list.json`                                | 已接入 |
| `fg/dorm_1.png`                                         | 前景遮挡     | (342, 200)   |   1178.9000 | `fg/fg_list.json`                                | 已接入 |
| `fg/dorm_yard_frontwall_06.png`                         | 前景遮挡     | (342, 200)   |   1186.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_west_02.png`                                   | 前景遮挡     | (342, 200)   |   1191.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/dorm_yard_frontwall_01.png`                         | 前景遮挡     | (342, 200)   |   1239.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/dorm_yard_frontwall_02.png`                         | 前景遮挡     | (342, 200)   |   1248.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_west_03.png`                                   | 前景遮挡     | (342, 200)   |   1283.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/dorm_yard_frontwall_05.png`                         | 前景遮挡     | (342, 200)   |   1284.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_east_08.png`                                   | 前景遮挡     | (342, 200)   |   1304.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/dorm_gatehouse.png`                                 | 前景遮挡     | (342, 200)   |   1315.5000 | `fg/fg_list.json`                                | 已接入 |
| `fg/dorm_5.png`                                         | 前景遮挡     | (342, 200)   |   1316.7000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_west_04.png`                                   | 前景遮挡     | (342, 200)   |   1328.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/tree_T3.png`                                        | 前景遮挡     | (342, 200)   |   1345.5000 | `fg/fg_list.json`                                | 已接入 |
| `fg/dorm_yard_frontwall_03.png`                         | 前景遮挡     | (342, 200)   |   1358.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/dorm_yard_frontwall_04.png`                         | 前景遮挡     | (342, 200)   |   1358.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/tree_T2.png`                                        | 前景遮挡     | (342, 200)   |   1371.5000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_east_07.png`                                   | 前景遮挡     | (342, 200)   |   1375.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/tree_T5.png`                                        | 前景遮挡     | (342, 200)   |   1431.5000 | `fg/fg_list.json`                                | 已接入 |
| `fg/gate_pine.png`                                      | 前景遮挡     | (342, 200)   |   1444.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/tree_T4.png`                                        | 前景遮挡     | (342, 200)   |   1453.5000 | `fg/fg_list.json`                                | 已接入 |
| `fg/gate.png`                                           | 前景遮挡     | (342, 200)   |   1490.1000 | `fg/fg_list.json`                                | 已接入 |
| `bridges/south_gate_end_cover_v2_left.png`              | 桥或端盖件   | (1101, 1279) |   1490.1100 | `bridges/south_gate_end_cover_v2_placement.json` | 已接入 |
| `bridges/south_gate_end_cover_v2_right.png`             | 桥或端盖件   | (1242, 1344) |   1490.1200 | `bridges/south_gate_end_cover_v2_placement.json` | 已接入 |
| `fg/rail_east_06.png`                                   | 前景遮挡     | (342, 200)   |   1523.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/tree_T1.png`                                        | 前景遮挡     | (342, 200)   |   1525.5000 | `fg/fg_list.json`                                | 已接入 |
| `fg/array_lamp_01.png`                                  | 前景遮挡     | (342, 200)   |   1530.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_mid_01.png`                                    | 前景遮挡     | (342, 200)   |   1568.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/array_lamp_06.png`                                  | 前景遮挡     | (342, 200)   |   1577.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_east_05.png`                                   | 前景遮挡     | (342, 200)   |   1614.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/array_lamp_02.png`                                  | 前景遮挡     | (342, 200)   |   1652.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_mid_02.png`                                    | 前景遮挡     | (342, 200)   |   1665.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/array_lamp_05.png`                                  | 前景遮挡     | (342, 200)   |   1704.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_east_04.png`                                   | 前景遮挡     | (342, 200)   |   1708.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_mid_03.png`                                    | 前景遮挡     | (342, 200)   |   1743.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_east_03.png`                                   | 前景遮挡     | (342, 200)   |   1744.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/array_lamp_03.png`                                  | 前景遮挡     | (342, 200)   |   1804.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/array_lamp_04.png`                                  | 前景遮挡     | (342, 200)   |   1807.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_mid_04.png`                                    | 前景遮挡     | (342, 200)   |   1816.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_east_02.png`                                   | 前景遮挡     | (342, 200)   |   1879.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_mid_05.png`                                    | 前景遮挡     | (342, 200)   |   1894.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_east_01.png`                                   | 前景遮挡     | (342, 200)   |   1956.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/rail_mid_06.png`                                    | 前景遮挡     | (342, 200)   |   1978.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/main_east_mouth_post_high.png`                      | 前景遮挡     | (342, 200)   | 100000.0000 | `fg/fg_list.json`                                | 已接入 |
| `fg/main_east_mouth_post_low.png`                       | 前景遮挡     | (342, 200)   | 100000.0000 | `fg/fg_list.json`                                | 已接入 |

未加载的参考素材：

| 文件                                                         | 状态与原因                    |
| ------------------------------------------------------------ | ----------------------------- |
| `background/background_world_v2_4997x2320_rgba_mainhole.png` | 选RGB底图，主台覆盖中心占位区 |
| `fogband/east_fog_factor_v2.png`                             | 仅参考                        |
| `fogband/south_fog_factor_v2.png`                            | 仅参考                        |
| `view/full_composite_final.png`                              | 只读对照，08右侧              |
| `view/full_composite_gatecover_v2.png`                       | 只读盖件对照                  |
| `layout/world_composite.png`                                 | 只读布局对照                  |

不存在也未查找/加载合并盖件预览、v1盖件。JSON/Markdown均为只读资料；权威v1.4、45件清单、四份placement已复制到src/render，格式化但未改数值。

## v1.4适配明细

- `world-v4-layout.json`保留完整v1.4数据；`world-v4.ts`提供运行适配。格高`V4.cellHeight=80.667`可配置，格宽170.417。公式取JSON高精度a/b/x0/y0，顶裁-33仅一次，之后加(342,200)。
- world/camera使用整幅4997×2320。弟子尺寸及WALK_SPEED仅在v4乘1.64；速度32.8px/s。sim不使用该显示速度。
- 主台使用walkable_polygon_px，副台和桥使用walk_px；东松石区用桥口空地、连接带、R2_bridge和R3_back_trail开槽。树根半径取trees_px；炉心采用UV半径0.6精确圆，线段碰撞解析检查。
- JSON一位小数poly_px与高精度uv有约0.1px舍入差，边界容差仅0.12px。门墩/抱鼓石用原uv_rect重建，通路闭边界可走；整块gate从未作为v4碰撞。
- 桥与内缩台面可走矩形之间有0.4格缝：只在原台面内补桥宽连接带，东u46.76–47.16/v−4.95–−3.65；南u28.912–31.612/v12.2–12.6。没有扩大到围栏外，也没有新增岗位。
- 门点落入整块足迹时，显示入口投影到最近可走位置，未挖掉建筑碰撞。原点见v1.4的collision_px.door_points_px，实际入口逐项见后表与evidence/world-v4-adaptations.json。
- 沿用五个sim建筑id。B_ALCHEMY不新增东台工作点，暂用主台药圃入口作为既有工作行为的显示落点，与B_GARDEN共用；此映射的视觉语义需要上级决定。
- 旧14个日常站位id/kind保留，落点取v1.4蒲团块中的合法点。arenaSeats在v4使用三项B8外缘最近可走点，但没有对应独立演出演示。原B8点仍按整块阵法碰撞阻挡，专项检查明确报失败。
- 出征显示观察sim的awayUntil/历练状态；从当前位置寻路到u30.262/v7.761，然后固定中线经过9.2、12.2，到JSON point_px加偏移=(902.7,1577.4)。在触发区内终点800ms淡出；alpha=0后不提交角色显示对象，保留离山状态用于归来。同点先800ms渐显，再沿逆路线回到行为目标。载入时已离山者归来也走此路径。
- v4不叠加旧机位主殿内景、屋顶淡出、召集/讲道演出及旧B5–B9立绘；完整旧实现仍在v3。v1.4蒲团/候场点做几何验收，但没有冒充v4已经具备旧室内演出。

## 未改动的sim项

`src/sim/**`、`data/*.json`、schema、RNG、事件概率、调度、建筑成本/岗位/产出、寿元、存档格式均未修改；`git diff -- src/sim data`为空。新JSON都在src/render；没有新增东/南台玩法岗位。

## 实际验证

日志和原始报告保存在`evidence/`。

| 命令                                                                           | 实测结果                                                                                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 改动前 npm test                                                                | 44文件：456 passed / 4 failed，27.42s                                                                                                |
| npm run sim -- --seeds 100 --rounds 6 --report /tmp/sim100-before.json         | 100种子基线已保存                                                                                                                    |
| npm run sim -- --seeds 100 --rounds 6 --idle --report /tmp/simidle-before.json | 100种子零操作基线已保存                                                                                                              |
| npm run build                                                                  | tsc + Vite通过；主JS超过500kB告警保留                                                                                                |
| 改动后 npm test                                                                | 45文件：465 passed / 3 failed，31.67s；新增v4的8 tests全过                                                                           |
| npm run lint                                                                   | ESLint + Prettier全过                                                                                                                |
| 同参数sim输出sim100-after/simidle-after                                        | 两份报告cmp与before逐字节一致，零差异                                                                                                |
| node --import tsx scripts/cool-b5b9-check.ts                                   | 输出与改动前逐字节一致；既存不可走蒲团/列队位仍报告，不改旧布局                                                                      |
| node --import tsx scripts/world-v4-check.ts                                    | 20 passed / 1 failed；门楼506采样、东南连通、丹房门/墙/炉心、柱墩/抱鼓石、淡出中线、24蒲团、4候场、14站位与入口均通过；B8原3座位失败 |
| node scripts/world-v4-shots.mjs                                                | 系统Chrome/playwright-core/headless:false/DPR2/页面zoom=.95；资源错误0、脚本错误0；v3冒烟通过且不请求v4素材                          |
| shasum -a 256 -c bundle/SHA256SUMS                                             | 全部OK，见source-check日志                                                                                                           |

基线四失败：素材manifest总字节数、v3列队位距通道、v3蒲团1不可走、v3居舍→主殿27.0479s超过旧15s断言。构建脚本更新manifest总量后第一项消失；其余三项保留，未改测试期望粉饰。

v4实际居舍→主殿约21.15s。真实sim钩子逐步推进到tick289，观察d4出征out和归来in，两条表现路径记录在shots/browser-report.json。动画截图用同一函数的调试时钟抽帧，未称其为真人全程墙钟观察。

首屏encodedBodySize约18.41MB；新增素材约17MB，总public/assets约22.8MB。现有脚本已取消旧5MB硬预算，本次未改阈值；若按5MB历史目标，明确超标。45件透明全画布前景只在运行时抽取清单bbox纹理，不变更磁盘图像尺寸。

## 残余与上级决定

1. 原交付南桥门楼端100px暗灰窄缝、东桥297个淡紫像素：按素材缺陷保留，不修像素。100px是原始残余像素数量，并非100px宽。东桥原柱上沿约25px收口残余也沿用美术报告。
2. 门楼碰撞低置信：v1.4柱墩条目为medium，但整体视觉接地仍按任务要求保留低置信风险；这里只验证数据逻辑，未声称重测通过。
3. **需上级决定：B8三个座位全部在array不可走块内。** 应由布局方选择调整阵法可走足迹或移动座位；未篡改原始布局来消掉失败。
4. **需上级决定：v4主殿内景/召集/讲道。** 本批没有与新外观配准的内景/分层数据，旧机位保留在v3；是否单独提供配准，或采用纯室外演出。
5. **需上级决定：B_ALCHEMY显示落点。** 为遵守东台无新增岗位，本次暂与药圃入口共用；功能数值不变，但同处炼丹房/药圃标签重叠，视觉语义不理想。
6. 素材总表有旧4997×2579记录，与本次世界4997×2320不一致；执行明确的v1.4/用户尺寸。副台PNG下沿可能越界，世界画布自然裁切，未改素材。
7. 旧版全量测试仍3失败，v4专项因B8冲突仍1失败；不得宣称全套绿色。

## 截图说明

全部主验收PNG为DPR2。01=9994×4640，对应4997×2320世界；其余主验收图=3200×2000。01采用四次同世界相机的1:1分块采集，无缩放拼接；单帧超大尺寸截图实测出现裁切，分块避免此问题。采集关闭小地图和镜头按钮，避免拼接重复UI。

08是缩小并排参考：左接入实景，右full_composite_final。参考图没有本次背景/雾且含旧桥版本，不能要求整图零像素差。06松树、屋檐、院墙点根据真实前景alpha和可走判定选取。早期06-occlusion-railing.png是勘察图，未找到满足可走且显著遮挡的护栏点，不计入有效遮挡证明。

- `shots/01-world-full.png`
- `shots/02-gate-southbridge-closeup.png`
- `shots/03-east-bridge-platform.png`
- `shots/04-south-bridge-platform.png`
- `shots/05a-expedition-seq.png`
- `shots/05b-expedition-seq.png`
- `shots/05c-expedition-seq.png`
- `shots/05d-expedition-seq.png`
- `shots/05e-return-fade.png`
- `shots/06-occlusion-eaves.png`
- `shots/06-occlusion-frontwall.png`
- `shots/06-occlusion-pine.png`
- `shots/06-occlusion-railing.png`
- `shots/07-fogband.png`
- `shots/08-reference-side-by-side.png`

## 实际入口适配

| sim建筑   | 世界像素                                | UV                |
| --------- | --------------------------------------- | ----------------- |
| B_HALL    | [1799.0906767432741, 901.4879545620518] | [27.1435, -0.439] |
| B_DORM    | [2338, 1310.3]                          | [35.3736, 1.4665] |
| B_MEDIT   | [2704.3, 1555.8]                        | [40.5664, 2.3604] |
| B_ALCHEMY | [2426.9, 1508.3]                        | [38.3498, 3.3994] |
| B_GARDEN  | [2426.9, 1508.3]                        | [38.3498, 3.3994] |
| B_GATE    | [1366, 1357.9]                          | [30.2601, 7.7603] |

## 本地提交

全部提交号与最终git log/status见外部权威清单 `/Volumes/Media/immortal-qa/world-v4-intake/INTEGRATED_LIST.md`。
