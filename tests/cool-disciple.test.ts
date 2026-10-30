import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  COOL_ACTIONS,
  COOL_CONTACT_SHADOW,
  COOL_WALK_TABLE,
  coolAction,
  coolActionFlip,
  coolAllFrameFiles,
  coolCushionFootOffset,
  coolDiscipleScale,
  coolFrame,
  coolFrameFiles,
  coolFramePlaceholder,
} from '../src/render/cool-disciple';
import { DISCIPLE_HEIGHT } from '../src/render/world-scale';
import { advanceGait, strideLength } from '../src/render/disciple-gait';

const manifest = JSON.parse(
  readFileSync('public/assets/manifest.json', 'utf8'),
) as { groups: { cool: { files: { file: string; size: number[] }[] } } };

describe('cool 弟子帧（08 增补 R3）', () => {
  it('身高比例不变：169 px 母版缩放后等于 DISCIPLE_HEIGHT（56.2）', () => {
    expect(169 * coolDiscipleScale()).toBeCloseTo(DISCIPLE_HEIGHT, 6);
    expect(DISCIPLE_HEIGHT).toBeCloseTo(56.2, 1);
  });
  it('N11 每性别 20 槽齐全（走 8 / 站 4 / 坐椅 4 / 坐蒲团 4），文件都在 manifest 与 public/assets', () => {
    const counts = { walk: 8, stand: 4, sitChair: 4, sitCushion: 4 };
    expect(COOL_ACTIONS.sort()).toEqual(Object.keys(counts).sort());
    const listed = new Map(
      manifest.groups.cool.files.map((f) => [f.file, f.size]),
    );
    for (const g of ['m', 'f']) {
      let n = 0;
      for (const a of COOL_ACTIONS) {
        const files = coolFrameFiles(g, a);
        expect(files).toHaveLength(counts[a]);
        expect(new Set(files).size).toBe(counts[a]);
        n += files.length;
      }
      expect(n).toBe(20);
    }
    for (const f of coolAllFrameFiles()) {
      expect(listed.get(f), f).toEqual([192, 192]);
      expect(existsSync(`public/assets/${f}`), f).toBe(true);
    }
  });
  it('槽表与 manifest 分离：表里不出现尺寸以外的素材元数据，manifest 不含槽位', () => {
    const table = readFileSync('src/render/cool-frames.json', 'utf8');
    expect(table).not.toMatch(/bytes|sha256/);
    expect(JSON.stringify(manifest.groups.cool)).not.toMatch(/"slots"/);
  });
  it('走路 8 槽，按位移驱动：不动不换帧，走一个步幅走完 8 个不同帧', () => {
    expect(COOL_WALK_TABLE).toHaveLength(8);
    const seen = new Set<string>();
    let cycles = 0;
    const step = strideLength() / 16;
    for (let i = 0; i < 16; i++) {
      const g = advanceGait(cycles, step, 0.05, true);
      cycles = g.cycles;
      seen.add(coolFrame('m', 'walk', cycles, i * 1000));
    }
    expect(seen.size).toBe(8);
    expect(cycles).toBeCloseTo(1, 6);
    const still = advanceGait(cycles, 0, 0.05, true);
    expect(still.moving).toBe(false);
    expect(still.cycles).toBe(cycles);
    // 时间不驱动走路帧
    expect(coolFrame('m', 'walk', 0.3, 0)).toBe(
      coolFrame('m', 'walk', 0.3, 99999),
    );
  });
  it('站/坐 4 槽按时间呼吸，一周期走遍 4 帧', () => {
    for (const a of ['stand', 'sitChair', 'sitCushion'] as const) {
      const seen = new Set<string>();
      for (let t = 0; t < 4000; t += 100) seen.add(coolFrame('f', a, 0, t));
      expect(seen.size, a).toBe(4);
    }
  });
  it('N10 坐姿判据：坐椅只在椅坐点 0.5 px 内且已到达；坐蒲团只在蒲团上；其余站/走', () => {
    expect(
      coolAction('idle', { kind: 'chair', arrived: true, offset: 0 }),
    ).toBe('sitChair');
    expect(
      coolAction('idle', { kind: 'chair', arrived: true, offset: 0.6 }),
    ).toBe('stand');
    expect(
      coolAction('idle', { kind: 'chair', arrived: false, offset: 0 }),
    ).toBe('stand');
    expect(
      coolAction('walk-1', { kind: 'chair', arrived: true, offset: 0 }),
    ).toBe('walk');
    expect(
      coolAction('idle', { kind: 'cushion', arrived: true, offset: 0 }),
    ).toBe('sitCushion');
    expect(
      coolAction('idle', { kind: 'station', arrived: true, offset: 0 }),
    ).toBe('stand');
    expect(coolAction('work')).toBe('stand');
    // 打坐（拍板 #3）：坐蒲团帧，帧内自带蒲团
    expect(coolAction('meditate')).toBe('sitCushion');
  });
  it('朝向：走/站画右前，坐椅画左前，坐蒲团正面不翻', () => {
    expect(coolActionFlip('walk', 1)).toBe(1);
    expect(coolActionFlip('walk', -1)).toBe(-1);
    expect(coolActionFlip('stand', -1)).toBe(-1);
    expect(coolActionFlip('sitChair', -1)).toBe(1);
    expect(coolActionFlip('sitChair', 1)).toBe(-1);
    expect(coolActionFlip('sitCushion', -1)).toBe(1);
    expect(COOL_CONTACT_SHADOW).toBe(0x384547);
  });
  it('正式图已到：全部动作非占位；坐蒲团帧蒲团中心对齐脚点偏移 ≈7.7 世界 px', () => {
    for (const a of COOL_ACTIONS) expect(coolFramePlaceholder(a)).toBe(false);
    expect(coolCushionFootOffset()).toBeCloseTo((23 * 56.2) / 169, 1);
  });
});
