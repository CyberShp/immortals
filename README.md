# 模拟仙府 · M2 数据与事件 v1.1

纯静态宗门挂机原型。TypeScript 严格模式、Vite、PixiJS v8 小地图与原生 DOM 界面。数据、事件和营造已接入；美术仍为明确标注的占位。v1.1 默认操作的六轮故事与主殿完成率达到门槛；零操作与完整事件节奏仍有缺口，详见 `docs/M2-VALIDATION.md`。

## 运行

需要 Node.js 22.12 及以上、npm。首次安装：

```sh
npm ci
npm run dev
```

项目命令：

```sh
npm run build
npm test
npm run lint
npm run sim -- --seed 42 --rounds 6
npm run preview
```

`build` 先执行 `tsc --noEmit`。`test` 使用 Vitest 单次运行。`lint` 同时检查 ESLint 与 Prettier，`npm run format` 可格式化。`STATUS.md` 保持原样且不参与格式化。

默认十秒一步、三十步一轮、一轮一季。设置中的加速或 `?speed=30` 仅加速前台，范围一至三百倍；离线结算始终使用真实时间。声音默认关闭，当前只保存开关，不播放音频。

## 验证

先运行 `npm run build`，再在单独终端启动 preview：

```sh
npx vite preview --port 4173
# 在另一个终端执行；可选 --soak 运行短时挂机
node scripts/e2e.mjs http://localhost:4173/
node scripts/e2e.mjs http://localhost:4173/ --soak
# 默认 10 分钟墙钟、10 倍加速，可用环境变量调整
SOAK_MIN=10 SOAK_SPEED=10 node scripts/soak-long.mjs http://localhost:4173/
```

脚本使用系统 Chrome，连接给定地址，不启动/停止服务。截图与挂机 JSON 输出到 `docs/screenshots/`。`?debug=1` 才暴露 `window.__xianfu`；包括只读世界快照、推进、导出、重置和修改 lastSeen，供测试离线弹窗。正式 URL 不暴露钩子。沙箱内 Chrome 无法启动；执行者已在沙箱外完成 6 张截图与断言、短 soak，以及 10 分钟墙钟 ×10 加速挂机（`docs/screenshots/soak-long-report.json`）。这些是本轮小修复前的证据，修复后浏览器回归待复跑。

## 目录

| 路径                           | 职责                                                   |
| ------------------------------ | ------------------------------------------------------ |
| `src/sim/`                     | 无浏览器依赖的世界、行为、种子随机、数据校验与离线补算 |
| `src/save/`                    | 存档校验、迁移、事务备份、压缩文本                     |
| `src/app/`                     | 固定步长循环、设置、DOM、可见性与小窗                  |
| `src/render/map.ts`            | Pixi 小地图；色块建筑、圆点弟子、按纵坐标排序          |
| `data/`                        | 开局弟子、资源、容量与特质编号字典                     |
| `scripts/`                     | 无头模拟与浏览器回归                                   |
| `tests/`                       | 确定性、离线边界、存档与迁移测试                       |
| `.github/workflows/deploy.yml` | Pages 构建与发布模板，仅文件，未执行发布               |

## 数据与规则

设计源文件只读引用，不复制进项目：

- `/Volumes/Media/immortal-qa/design/01-gameplay-core.md`
- `/Volumes/Media/immortal-qa/design/03-web-tech-proposal.md`
- `/Volumes/Media/immortal-qa/design/02-systems-and-events.md`（v1.1）
- `/Volumes/Media/immortal-qa/design/02a-design-decisions.md`

## 数据格式

新局来源为 `data/roster.json` 六人、`balance.json` 数值、`buildings.json` 建筑、`traits.json` 特质、`events.json` 事件。`data/initial.json` 仅保留为 M1 样本。所有 JSON 在加载时经 zod 校验，失败显示中文文件与字段路径；具体字段见 `src/sim/schema.ts`、`src/sim/data.ts`。设计依据另含 `/Volumes/Media/immortal-qa/design/art/ART-STYLE-WEB-v1.md`，只引用源路径。

事件采用 `{id, kind, chain, step, roles, trigger, hint, text, options, priority, cooldown, pity, branches}`；`options` 含 label/effects/default/cost/conditions，可选 `costBalance` 引用数值配置。例如 `{"op":"resource","key":"reputation","value":25}` 表示声望至少 25；`{"op":"any","conditions":[...]}` 表示任一条件。效果按 type 进入注册表，普通数值写 JSON，特殊规则才加代码。

`trigger` 包含 `conditions`、`chance`（0～1）、`cadence`（`step` / `round`），可选 `earliestRound`（正整数，省略等同 1）。最早轮次按统计口径 ⌈tick/30⌉ 判定：第 N 轮首步为 tick = (N−1)×30+1。未到门槛时在角色抽取和概率掷骰之前跳过，不消耗随机数、不登记每轮首次合法掷骰，保底也不能绕过门槛。EV_ADV_01 为 3（最早 tick 61），精力门槛 ≥60，每步概率为 30%；EV_ADV_02 为 4（最早 tick 91），仍需离山满 30 步，之后每步概率为 30%。4.3 表 ±1 轮仅约束推演表里程碑。

角色槽可配置 `excludeStoryCast: true` 与 `excludeWithPendingEvent: true`（可选 boolean）；前者排除尚有效故事线的主要角色，后者显式声明队列占用排除，全局同人唯一始终生效。`allowAway` 的已离山者接续旅程时不重验故事线身份，仍须等其他未结事件释放角色才可回山。

弟子新增 `storyLines: ["A", "C"]`，元素限定 A/B/C/D，省略默认 `[]`，招新为空；运行时还合并 chain role binding。全部涉及线终结或当前硬条件角色组合已不存在时释放，临时地点/精力不足不算失效。完整解释及旧存档边界见 `docs/ARCHITECTURE.md` 的“历练主要角色排除：已确认（Lore 2026-10-29 确认）”。

弟子以季存年龄、总寿元和 remainingSeasons；年龄显示向下取整为岁，另显示余寿季数。新局长老为 714/720/6 季；延寿只加总寿元与余寿。招新十二姓名抽签不放回，用尽重置；签池使用记录在世界 flags 中持久化。模拟函数原地修改世界，同 seed 同操作可逐项复现；所有随机调用计数进入存档。自动掌门默认开启，可在设置关闭；方针只指方向，弟子自行选择动作。建筑和事件选项先验条件/成本，不允许负资源。

## 待拍板参数的一处切换

`data/balance.json` 的 `scheduler.autoResolveSteps` 当前为 **30**（候选 10）；`costs.c3BlessStone` 当前为 **0**（候选 10 或 30）。只改 JSON 对应数值，再重新构建/加载即可，无需修改代码。等待步数由 zod 限定为正安全整数，成本为非负安全整数。

C3 选项使用 `"costBalance": {"stone":"c3BlessStone"}` 引用 `balance.costs`，UI 展示、支付判定、默认退路与实际扣款均通过 `optionCost` 读取参数。已用单测验证 10 步超时、10 灵石扣款及不足时退路。正式配置保留 30/0，等指挥官拍板。

事件奖励入库时，丹药小数向下取整，灵石/灵草四舍五入；常规劳作仍按设计保留小数产出，不对整个库存取整。旧存档保持已有年龄、剧情与已锁定选项，不重写历史；验证基于 v1.1 新局。

## 接入新事件

1. 在 `data/events.json` 编写角色条件、触发树、提示/正文、至少一个可用的 ★ 默认项、效果与成本。当前 demo **固定 20 个**，新增范围需同时更新数量契约，不能悄悄扩内容。
2. 角色用 A/B 槽，文案用 `{A}`/`{B}`，三字名代入后提示 ≤16 字、正文 ≤40 字。连锁填写 chain/step 和前置间隔，角色首次选中后沿用。
3. 优先复用 schema 中的条件词和效果类型。确需新效果，在 `schema.ts` 登记 type，并在 `world.ts` 的 handlers 注册结算；禁止把某个新事件 ID 的条件散落进步进循环。
4. 补条件命中/不命中、效果、成本拒绝和链前置测试。运行以下回归，并检查统计中的 null/命中样本数。

```sh
npm test
npm run build
npm run lint
npm run sim -- --seed 42 --rounds 6
npm run sim -- --seeds 100 --rounds 6 --report docs/sim-100.json
npm run sim -- --seeds 100 --rounds 6 --idle --report docs/sim-idle-100.json
```

默认 sim 在事件出现时立即选默认；`--idle` 才是前台 30 步超时处理，两者分别统计。默认成本不足时采用列表中第一个付得起且条件可用的选项（不限定免费），与零操作处理共用逻辑。统计命令成功退出表示模拟正常运行，**不表示节奏/故事目标通过**。统计显式包含至少一次 EV_ADV_01 的局数、ADV_01/02 各自出现局数与首次中位轮次（无命中为 null），并含全部事件首次出现中位轮次（⌈步/30⌉）、命中数、A/B/C/D 完成率、完成线数分布、≥3 条比例和 SEC_02 命中率。具体缺口与 26 条决定对照见 `docs/ARCHITECTURE.md`。

离线分段累计有效时间，再向下取整：十分钟 2 轮、八小时 45 轮、一天 74 轮、七天 160 轮；负时间不补算，七天封顶。每人最多两次成功小突破，不筑基、不坐化，年龄最多八季；离线结束每人修为按当前层截断为 100/150/200，溢出丢弃；离线不新开工程，已开工继续完成。通用事件默认结算，最多保留三个连锁决策节点，汇总含关系档位变化和十条以内提示。

## 方案 2 正式版

Lore 2026-10-29 确认：EV_ADV_01 角色 A 精力门槛 ≥60；ADV_01 与 ADV_02 每步概率均为 30%。最早轮次仍为 3/4，ADV_02 仍须离山满 30 步后逐步等待概率命中。主要角色口径已确认，excludeStoryCast/excludeWithPendingEvent、连锁优先级、6 步间隔、autoResolveSteps=30、c3BlessStone=0 全部保留。

种子 0～99，各 6 轮；统计脚本及口径不变。“至少一次历练”按 ADV_01 入队计数，不等于准行或回山；首次轮次为 ceil(tick/30)，中位数取命中样本排序后的 floor(n/2) 项。全默认出现即选默认（不可支付则走原退路），零操作等 30 步超时。

| 指标                           | 全默认        | 零操作      |
| ------------------------------ | ------------- | ----------- |
| 至少一次历练局数 / 100         | 65            | 82          |
| ADV_01 出现局数 / 首次中位轮次 | 65 / 5        | 82 / 6      |
| ADV_02 出现局数 / 首次中位轮次 | 25 / 5        | 6 / 6       |
| A/B/C/D 完成局数（各 / 100）   | 100/100/99/99 | 0/0/0/84    |
| ≥3 条局数 / 100                | 100           | 0           |
| 完成 0/1/2/3/4 条的局数分布    | 0/0/0/2/98    | 16/84/0/0/0 |
| 主殿 Lv2 局数 / 100            | 100           | 37          |

全默认满足历练 ≥60 局、各线 ≥80%、每局 ≥3 条、主殿 ≥90% 的门槛。零操作仅历练及 D 线达标，A/B/C、≥3 条、主殿均未达标；未追加调参。原始报告为 `docs/sim-100.json` 与 `docs/sim-idle-100.json`，含全部里程碑命中数与首次中位轮次。

## 存档与隐藏

IndexedDB 数据库 `xianfu`、对象仓库 `saves`，`main` 主档、`backup` 一份备份。更新主档和备份在同一事务中完成。每三十秒、页面隐藏及离开页面触发保存；浏览器可能中断退出时的异步写入，最近一次成功保存才是可靠恢复点。主档损坏时尝试备份，两个都坏则显示错误，不自动覆盖。

版本为 `2`，迁移示例支持版本 `1`（相同世界结构，允许缺少 `lastSeen`，补为零）；未知版本拒绝导入。导入先解析、迁移和验证，再备份当前内存进度并原子写入。支持 JSON 文件、JSON 文本及 `XF2:` 前缀的 gzip + base64 文本。压缩、剪贴板 API 不可用时可下载 JSON 或手动复制。启动申请持久存储；清理站点仍可能丢档，应定期导出。

反引号默认切换工作台账，修改标题和 favicon；设置可更换键位、开启失焦隐藏。老板键只在网页或小窗获得焦点时生效。画中画优先使用 Document PiP，否则尝试普通弹窗；小窗只投影主窗口状态，不创建第二套模拟或存档。主窗口关闭后，小窗不承担独立模拟。主页面与小窗都隐藏时停止前台计时，回来统一离线补算。

## 部署到 GitHub Pages

此交付不创建远程、不提交、不推送，也未部署。

1. 由仓库所有者创建或选择仓库并提交代码及 `package-lock.json`。
2. 仓库设置 → Pages → 来源选择 GitHub Actions。
3. 在 `main` 推送或手动触发工作流。工作流使用官方 checkout、setup-node、upload-pages-artifact、deploy-pages。
4. 构建环境 `VITE_BASE=/仓库名/`。默认本地构建 base 为 `./`，部署根域仓库时可调整工作流为 `/`。
5. 发布后由维护者检查实际网页、静态资源路径和存档。当前仅验证本地产物，未验证远程 Pages。

本地可验证子路径构建：

```sh
VITE_BASE=/xianfu-web/ npm run build
```

需用 HTTP 静态服务器访问构建结果；不承诺直接双击 `file://` 可运行。
