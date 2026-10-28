# 模拟仙府 · M1 骨架

纯静态宗门挂机原型。TypeScript 严格模式、Vite、PixiJS v8 小地图与原生 DOM 界面。界面、美术和事件均为 M1 占位内容；尚不是三十分钟完整剧情体验。

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

可选浏览器回归（先构建）：

```sh
npx tsx scripts/browser-smoke.ts
```

脚本默认使用 macOS 已安装的 Chrome，可用 `CHROME_PATH` 指向其他位置。仅启动临时静态服务和独立无头浏览器，结束自动关闭。截图与导出样本位于忽略的 `output/playwright/`。

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
- `/Volumes/Media/immortal-qa/design/02-systems-and-events.md`

`data/initial.json` 包含资源、弟子数组和初始建筑。弟子保留设计 1.1 全部字段，额外显式保存 `remainingSeasons`（剩余寿元），避免混淆 `lifespanSeasons`（总寿元）。年龄和寿元单位都是季；阶段由模拟更新。特质使用 Lore 的 `T_*` 编号，中文显示名见 `data/traits.json`。`data/balance.json` 管理仓库上限，其余数值在 `src/sim/config.ts`。数据入口 `loadData` 负责 zod 校验，错误包含文件与字段路径。模拟函数原地修改传入世界，同种子、同操作可复现；`advance` 等价于连续 `step`。

离线分段累计有效时间，再向下取整为轮：十分钟 2 轮、一小时 12 轮、八小时 45 轮、一天 74 轮、七天 160 轮。负时间及非有限值按零处理并标记时钟异常，超过七天截断。离线按轮调用三十步，限制每人两次小突破、不筑基、不坐化、年龄最多推进八季。不足一轮的离线时间不结算。仓库溢出丢弃。

M1 只有一个开局选择事件，自动默认处理和选项界面可运行；完整触发条件、故事链、建筑经营、关系变化与新事件接入文档由 M2 补充。当前全员简化劳作会较快填满灵石库，尚未执行 M2 的经济节奏验收。

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
