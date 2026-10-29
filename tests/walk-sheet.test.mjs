import { expect, it } from 'vitest';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
it('sheet CLI composites every fourth frame and falls back without false direction strips', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xianfu-sheet-test-'));
  try {
    for (const tag of ['before', 'after']) {
      const dir = `${root}/walk-frames/${tag}`;
      await mkdir(dir, { recursive: true });
      await copyFile(
        'public/assets/map/world-mini.webp',
        `${dir}/fixture.webp`,
      );
      const frames = Array.from({ length: 30 }, (_, i) => ({
        index: i,
        file: 'fixture.webp',
      }));
      await writeFile(
        `${dir}/directions.json`,
        JSON.stringify(
          tag === 'after'
            ? {
                supported: true,
                directions: ['left', 'right', 'up', 'down'].map((id) => ({
                  id,
                  frames,
                })),
              }
            : { supported: false, reason: 'no setter' },
        ),
      );
      await writeFile(
        `${dir}/motion.json`,
        JSON.stringify({ frames: [...frames, ...frames] }),
      );
      execFileSync(
        process.execPath,
        ['scripts/walk-sheet.mjs', '--walk-dirs', `--walk-tag=${tag}`],
        { env: { ...process.env, WALK_SCREENSHOT_DIR: root } },
      );
    }
    const combined = await sharp(
      `${root}/xianfu-walk-dirs-after.png`,
    ).metadata();
    expect([combined.width, combined.height]).toEqual([2560, 560]);
    for (const d of ['left', 'right', 'up', 'down']) {
      const m = await sharp(
        `${root}/xianfu-walk-dirs-after-${d}.png`,
      ).metadata();
      expect([m.width, m.height]).toEqual([2560, 140]);
    }
    const legacy = await sharp(`${root}/xianfu-walk-before.png`).metadata();
    expect([legacy.width, legacy.height]).toEqual([3200, 840]);
    await expect(
      sharp(`${root}/xianfu-walk-dirs-before-left.png`).metadata(),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
