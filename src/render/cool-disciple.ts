// ?cool=1 弟子 D1（男 m-）/D2（女 f-）新帧：128×192，脚底锚点 (64,186)，站立头顶→脚底 168 px。
// 步态仍由 disciple-gait 的位移累计 cycles 驱动（不按时间播放）。
import { DISCIPLE_SCALE } from './world-scale';

export const COOL_FRAME_BODY = 168; // 母版站立身高（px）
export const COOL_CONTACT_SHADOW = 0x384547;
export const COOL_DISCIPLE_POSES = [
  'stand',
  'sit',
  'walk-1',
  'walk-2',
  'walk-3',
  'walk-4',
] as const;
export type CoolPose = (typeof COOL_DISCIPLE_POSES)[number];
// 走路一个周期 8 槽（需求 走 8 帧）；Iris 本批交 4 关键帧，每帧占 2 槽。
// 8 帧到位后只改此表。
export const COOL_WALK_TABLE: CoolPose[] = [
  'walk-1',
  'walk-1',
  'walk-2',
  'walk-2',
  'walk-3',
  'walk-3',
  'walk-4',
  'walk-4',
];

export const coolDiscipleFile = (gender: string, pose: string) =>
  `cool/disciple/${gender}-${pose}.webp`;

/** 旧姿势 → 新帧：走路按 cycles 取 8 槽；打坐 → sit；其余（劳作/交谈/站立）→ stand（劳作、交谈帧未交付）。 */
export function coolPose(pose: string, cycles: number): CoolPose {
  if (pose.startsWith('walk-')) {
    const slot =
      Math.floor((((cycles % 1) + 1) % 1) * COOL_WALK_TABLE.length) %
      COOL_WALK_TABLE.length;
    return COOL_WALK_TABLE[slot];
  }
  return pose === 'meditate' ? 'sit' : 'stand';
}

/** 身高比例不变：旧帧 96 高画布里人物 93.71 px → 新帧 168 px 对齐到同一世界身高。 */
export const coolDiscipleScale = (height = 96 * DISCIPLE_SCALE) =>
  (height * (93.71 / 96)) / COOL_FRAME_BODY;

/** 新帧走路朝左（3/4 正面），站/坐正面不翻。 */
export const coolSpriteFlip = (file: string, facing: number) =>
  file.includes('walk-') ? -facing || 1 : 1;

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
