// 冷色新场景接入骨架（开发开关 ?cool=1，默认关闭）。纯表现层：不读写 sim 状态、不消耗 sim 随机数。
// 依据：Forge《冷色新场景可行性 v1》§5 第 1 步 + Lore《06 冷色石台决定》。
// 关闭时：world.ts 用原四岛几何、map.ts 不加载任何 cool/ 素材，渲染与改动前逐像素一致。
import { depthEnabled } from './depth-config';
import { roofFadeEnabled } from './roof-fade';

/** 与 depthEnabled / roofFadeEnabled 同一写法：只认 ?cool=1。 */
export function coolEnabled(search: string) {
  return new URLSearchParams(search).get('cool') === '1';
}

export const COOL_SETTINGS = {
  /**
   * cool 打开时是否允许 ?depth=1 的纵深层（天空/云海/落影/雾）。
   * 默认 false：纵深层的落影、底图与雾都按旧四岛世界校准，叠在冷色占位底图上会错位，
   * 正式冷色素材到位后再按新石台重新校准再打开。
   */
  depthWithCool: false as boolean,
  /** 同理：roofFade 的内景/外观对齐旧建筑立绘与旧入口，cool 下默认关闭。 */
  roofFadeWithCool: false as boolean,
};

/** 优先级：cool 先于 depth。cool 关 → 完全按 ?depth=1；cool 开 → 仅当 depthWithCool 为 true 才开纵深。 */
export function depthActive(
  search: string,
  settings: { depthWithCool: boolean } = COOL_SETTINGS,
) {
  return (
    depthEnabled(search) && (!coolEnabled(search) || settings.depthWithCool)
  );
}
/** roofFade 与 cool 的优先级同 depth。 */
export function roofFadeActive(
  search: string,
  settings: { roofFadeWithCool: boolean } = COOL_SETTINGS,
) {
  return (
    roofFadeEnabled(search) &&
    (!coolEnabled(search) || settings.roofFadeWithCool)
  );
}
