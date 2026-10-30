import { describe, expect, it } from 'vitest';
import {
  COOL_CONTACT_SHADOW,
  COOL_WALK_TABLE,
  coolDiscipleScale,
  coolPose,
  coolSpriteFlip,
} from '../src/render/cool-disciple';
import { DISCIPLE_HEIGHT } from '../src/render/world-scale';
import { advanceGait, strideLength } from '../src/render/disciple-gait';

describe('cool 弟子帧', () => {
  it('身高比例不变：168 px 母版缩放后等于 DISCIPLE_HEIGHT', () => {
    expect(168 * coolDiscipleScale()).toBeCloseTo(DISCIPLE_HEIGHT, 6);
  });
  it('走路 8 槽表，4 关键帧各占 2 槽', () => {
    expect(COOL_WALK_TABLE).toHaveLength(8);
    expect(new Set(COOL_WALK_TABLE).size).toBe(4);
  });
  it('步态按位移驱动：不动不换帧，走一个步幅走完 8 槽', () => {
    const seen = new Set<string>();
    let cycles = 0;
    const step = strideLength() / 16;
    for (let i = 0; i < 16; i++) {
      const g = advanceGait(cycles, step, 0.05, true);
      cycles = g.cycles;
      seen.add(coolPose(g.pose, cycles));
    }
    expect(seen.size).toBe(4);
    expect(cycles).toBeCloseTo(1, 6);
    const still = advanceGait(cycles, 0, 0.05, true);
    expect(still.moving).toBe(false);
    expect(still.cycles).toBe(cycles);
  });
  it('姿势映射与朝向', () => {
    expect(coolPose('meditate', 0)).toBe('sit');
    expect(coolPose('work', 0)).toBe('stand');
    expect(coolSpriteFlip('cool/disciple/m-walk-1.webp', 1)).toBe(-1);
    expect(coolSpriteFlip('cool/disciple/m-walk-1.webp', -1)).toBe(1);
    expect(coolSpriteFlip('cool/disciple/m-stand.webp', 1)).toBe(1);
    expect(COOL_CONTACT_SHADOW).toBe(0x384547);
  });
});
