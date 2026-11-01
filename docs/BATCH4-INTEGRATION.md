# 第 4 批：表现层与数据接入

基线 `944b0bf`，2026-11-01。本批不修改 `src/sim/**`、`data/*.json` 或旧素材。

- `world-v4-layout-v15.json` 为 intake 原件的逐字节副本；v1.4 保留。B8、炉前锚点、两处接缝和出生点由 v1.5 驱动。旧连接带与 v1.5 坐标相同，已替换为 JSON 引用。
- v1.5 的 `queue_spots` 仍与 v1.4 一致，第二点侵入入口通道。暂保留上批已验收的四个 render 候场修正点；完整证据及需要决定项见外部交付清单。不得把这一项写成“已全部取消覆盖”。
- `v4-spots.ts` 负责距离倒数 × 特质偏好（3 倍）的独立流抽签、容量和两步等待退路、卫星台岗位、对剑与观战布局。模拟世界不保存岗位分配。`renderRandom` 不引用 sim RNG。
- S_MUSTER 每圈 6 人，半径从 0.3 格起每圈增加 0.3 格。屏幕水平单位为 UV `(0.7071,-0.7071)`，正交纵轴为 `(0.7071,0.7071)`；不可走候选跳过。社交双人位置为 ±`(0.1767,-0.1767)`，对剑为 ±`(0.424,-0.424)`。
- 桥口渐隐与目的地渐显由表现时钟驱动，行为剩余步数和产出不变；出征与归来沿同一南台环位。旧动作素材继续使用，舞剑、扇火专属新帧不在本批生成。
- `v4-outdoor.ts` 仅为已有召集/讲道状态机提供室外席位。v4 不创建殿内绘制器，殿内 view 调用无效，roofFade 参数也不启用内景。v3 分支保留。
- 人生线在 `display/lifeline.ts` 按 name 叠加，固定弟子不修改 roster。招新用独立种子洗牌，不放回，耗尽重洗。存档版本仍为 2，顶层可选 `lifeLines: Record<弟子id, 文本>`；旧档按入册顺序重放独立抽签并写回。世界本体及 sim schema 不变。
- 弟子浮动卡、详情、传承录与回顾显示人生线；PiP 移入页面时设置 `pip-mode` 隐藏该行，回主窗口时恢复。

验证脚本：

```sh
npm test
npm run build
npm run lint
node --import tsx scripts/world-v4-check.ts
node scripts/batch4-browser.mjs /Volumes/Media/immortal-qa/batch4
node scripts/batch4-live.mjs /Volumes/Media/immortal-qa/batch4
```

浏览器脚本使用系统 Chrome 有头、DPR2、CSS zoom .95、`vite preview` 4186。`batch4-browser` 中角色状态采用经过存档 schema 校验的定向夹具，几何压力站位明确标注；自然招新、导入导出与离线走产品流程。`batch4-live` 按默认步速和真实时钟观察行走与渐隐，不 seek、不加速。完整截图、基线、sim cmp、需要决定项在 `/Volumes/Media/immortal-qa/batch4/INTEGRATED_LIST.md`。
