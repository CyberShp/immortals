// Existing screenshots only: resize-free contact sheet compositing, no drawn art.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { summarizeWalk } from './e2e-walk.mjs';
const tag =
  process.argv.find((a) => a.startsWith('--walk-tag='))?.split('=')[1] ??
  process.argv[2] ??
  'after';
if (!['before', 'after'].includes(tag))
  throw Error('tag must be before or after');
const root =
    process.env.WALK_SCREENSHOT_DIR ?? '/Volumes/Media/GrokBot/workspace',
  dir = `${root}/walk-frames/${tag}`;
if (process.argv.includes('--walk-dirs')) {
  const directions = JSON.parse(await readFile(`${dir}/directions.json`));
  if (directions.supported) {
    const strips = [];
    for (const d of directions.directions) {
      const frames = d.frames.filter((_, i) => i % 4 === 0);
      const { width, height } = await sharp(
        `${dir}/${frames[0].file}`,
      ).metadata();
      const buffer = await sharp({
        create: {
          width: width * frames.length,
          height,
          channels: 3,
          background: '#f1e8d4',
        },
      })
        .composite(
          frames.map((f, i) => ({
            input: `${dir}/${f.file}`,
            left: i * width,
            top: 0,
          })),
        )
        .png()
        .toBuffer();
      await writeFile(`${root}/xianfu-walk-dirs-${tag}-${d.id}.png`, buffer);
      strips.push({ input: buffer, left: 0, top: strips.length * height });
    }
    const m = await sharp(strips[0].input).metadata();
    await sharp({
      create: {
        width: m.width,
        height: m.height * strips.length,
        channels: 3,
        background: '#f1e8d4',
      },
    })
      .composite(strips)
      .png()
      .toFile(`${root}/xianfu-walk-dirs-${tag}.png`);
    console.log(
      'Four direction strips: left/right/up/down; frames 0,4,8,12,16,20,24,28.',
    );
    process.exit(0);
  }
  console.log(
    `Directions unsupported: ${directions.reason} Generating only legacy contact sheet.`,
  );
}
const report = JSON.parse(await readFile(`${dir}/motion.json`));
const { width, height } = await sharp(
  `${dir}/${report.frames[0].file}`,
).metadata();
await sharp({
  create: {
    width: width * 10,
    height: height * Math.ceil(report.frames.length / 10),
    channels: 3,
    background: '#f1e8d4',
  },
})
  .composite(
    report.frames.map((f, i) => ({
      input: `${dir}/${f.file}`,
      left: (i % 10) * width,
      top: Math.floor(i / 10) * height,
    })),
  )
  .png()
  .toFile(`${root}/xianfu-walk-${tag}.png`);
report.summary = summarizeWalk(report.frames);
await writeFile(`${dir}/motion.json`, JSON.stringify(report, null, 2) + '\n');
console.log(report.summary);
