// ?cool=1 弟子 D1（男 m-）/D2（女 f-）帧（Iris batch2-v1）：192×192，脚底锚点 (96,186)，站立头顶→脚底 169 px。
// 动作 → 帧槽映射在 cool-frames.json（08 增补 3.3：与 manifest 分离，换图只改表与 manifest）。
// 走路由 disciple-gait 的位移累计 cycles 驱动（不按时间播放）；站/坐按时间呼吸。
import frames from './cool-frames.json';
import { DISCIPLE_SCALE } from './world-scale';

export const COOL_FRAMES = frames;
export const COOL_FRAME_SIZE = frames.frame.size as [number, number];
export const COOL_FRAME_ANCHOR = frames.frame.anchor as [number, number];
export const COOL_FRAME_BODY = frames.frame.body; // 母版站立身高（px）
export const COOL_CONTACT_SHADOW = 0x384547;

export type CoolAction = keyof typeof frames.actions;
export const COOL_ACTIONS = Object.keys(frames.actions) as CoolAction[];
type Drawn = 'left' | 'right' | 'front';

const fileOf = (slot: string) => `${frames.dir}${slot}.webp`;
const slotsOf = (gender: string, action: CoolAction) =>
  frames.actions[action].slots.map((s) => fileOf(s.replace('{g}', gender)));

/** 每性别每动作的全部帧文件（走 8 / 站 4 / 坐椅 4 / 坐蒲团 4）。 */
export const coolFrameFiles = (gender: string, action: CoolAction) =>
  slotsOf(gender, action);
export const coolAllFrameFiles = () =>
  [
    ...['m', 'f'].flatMap((g) => COOL_ACTIONS.flatMap((a) => slotsOf(g, a))),
    ...(['stand', 'lecture', 'flick'] as const).flatMap((a) =>
      frames.master[a].slots.map(fileOf),
    ),
  ].filter((f, i, all) => all.indexOf(f) === i);

/** 走路槽表（8 槽）。 */
export const COOL_WALK_TABLE = frames.actions.walk.slots;

/** 坐姿判据（08 增补 4.1-2）：坐椅帧只在椅坐点、坐蒲团帧只在蒲团上；其余一律站/走。 */
export function coolAction(
  pose: string,
  seat?: { kind: string; arrived: boolean; offset: number },
): CoolAction {
  if (pose.startsWith('walk-')) return 'walk';
  if (seat?.arrived && seat.offset <= 0.5) {
    if (seat.kind === 'chair') return 'sitChair';
    if (seat.kind === 'cushion') return 'sitCushion';
  }
  return pose === 'meditate' ? 'sitCushion' : 'stand';
}

/** 帧文件：走路按 cycles 取槽；站/坐按时间（每人相位错开）呼吸。 */
export function coolFrame(
  gender: string,
  action: CoolAction,
  cycles: number,
  now: number,
  seed = 0,
): string {
  const slots = slotsOf(gender, action);
  const a = frames.actions[action];
  const phase =
    a.drive === 'distance'
      ? ((cycles % 1) + 1) % 1
      : ((((now + seed * 977) / ('periodMs' in a ? a.periodMs : 1000)) % 1) +
          1) %
        1;
  return slots[Math.floor(phase * slots.length) % slots.length];
}

/** 当前帧是否仍为占位（仅 ?debug=1 时角标「占位」）。 */
export const coolFramePlaceholder = (action: CoolAction) =>
  frames.actions[action].placeholder;

/** 旧姿势名（行为层）→ 新帧动作，兼容旧调用。 */
export function coolPose(pose: string, cycles: number, now = 0): string {
  return coolFrame('m', coolAction(pose), cycles, now)
    .replace(frames.dir + 'm-', '')
    .replace('.webp', '');
}

/** 身高比例不变：旧帧 96 高画布里人物 93.71 px → 新帧 169 px 对齐到同一世界身高。 */
export const coolDiscipleScale = (height = 96 * DISCIPLE_SCALE) =>
  (height * (93.71 / 96)) / COOL_FRAME_BODY;

/** 画的朝向 + 运动朝向（1 = 向右）→ 水平缩放符号。坐椅按椅子朝向（faceLeft/faceRight）。 */
export function coolActionFlip(action: CoolAction, facing: number): number {
  const drawn = frames.actions[action].drawn as Drawn;
  if (drawn === 'front') return 1;
  const f = facing < 0 ? -1 : 1;
  return drawn === 'right' ? f : -f;
}
export const coolSpriteFlip = (file: string, facing: number) =>
  coolActionFlip(
    file.includes('-walk-')
      ? 'walk'
      : file.includes('-sitchair-')
        ? 'sitChair'
        : file.includes('-sitcushion-')
          ? 'sitCushion'
          : 'stand',
    facing,
  );

/** 坐蒲团帧：蒲团中心在帧内的位置 → 相对脚底锚点的世界偏移（蒲团中心对齐席位点）。 */
export const coolCushionFootOffset = (height?: number) =>
  (COOL_FRAME_ANCHOR[1] - frames.actions.sitCushion.propCentre[1]) *
  coolDiscipleScale(height);

/** 灵根五色（[UIP] --root-*），只用于脚下彩环。 */
export const COOL_ROOT_COLORS: Record<string, string> = {
  金: '#8F7220',
  木: '#26774F',
  水: '#2F73B8',
  火: '#B24A36',
  土: '#7A6548',
};
export const coolRootColors = (elements: readonly string[]) =>
  elements.map((e) => COOL_ROOT_COLORS[e] ?? '#808080');
