// depth 开关对比截图（真实 Chrome，DPR 2，1280×900）。只往指定目录写图，不写 docs/。
// 用法：node scripts/depth-shots.mjs http://127.0.0.1:5199 /Volumes/Media/immortal-qa/depth
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const out = process.argv[3] ?? '/tmp/depth-shots';
const onTag = process.argv.includes('--on-tag')
  ? process.argv[process.argv.indexOf('--on-tag') + 1]
  : 'on';
const VW = 1280,
  VH = 900;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const PAPER = [241, 232, 212];
async function analyse(path) {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let black = 0,
    paper = 0;
  const n = info.width * info.height;
  // 小地图（屏幕固定 UI，按 spec 不改）底板就是纸色，排除它：CSS (W−125, 76, 115, 65)。
  const dpr = info.width / VW;
  const inMini = (i) => {
    const x = (i % info.width) / dpr,
      y = Math.floor(i / info.width) / dpr;
    return x >= VW - 125 && x <= VW - 10 && y >= 76 && y <= 141;
  };
  for (let i = 0; i < n; i++) {
    const r = data[i * 3],
      g = data[i * 3 + 1],
      b = data[i * 3 + 2];
    if (r + g + b < 30) black++;
    if (Math.hypot(r - PAPER[0], g - PAPER[1], b - PAPER[2]) < 6 && !inMini(i))
      paper++;
  }
  return {
    width: info.width,
    height: info.height,
    black: black / n,
    paper: paper / n,
  };
}
const report = {};
for (const on of [false, true]) {
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${base}/?debug=1${on ? '&depth=1' : ''}`);
  await page.waitForFunction(
    () => window.__mapReady && window.__camera && window.__xianfu,
  );
  await page.evaluate(() => {
    window.__xianfu.freeze(true);
    window.__xianfu.artAllBuilt(1);
  });
  if (on) await page.evaluate(() => window.__depth.freeze(0));
  const settle = async () => {
    await page.evaluate(
      () =>
        new Promise((r) => {
          let k = 3;
          const t = () => (k-- ? requestAnimationFrame(t) : r());
          t();
        }),
    );
    await page.waitForTimeout(400);
  };
  await page.mouse.move(640, 450);
  await settle();
  // --on-tag on2：开启图文件名用 on2（第二轮），关闭图仍为 off。
  const tag = on ? onTag : 'off';
  const z = (await page.evaluate(() => window.__camera.get())).zoom;
  const shots = [
    ['center', null],
    ['cliff', { x: 1000, y: 1000, zoom: z }],
    ['overview', 'button'],
    ...(on
      ? [
          ['parallax-a', { x: 1250, y: 900, zoom: z }],
          ['parallax-b', { x: 1950, y: 900, zoom: z }],
        ]
      : []),
  ];
  for (const [name, cam] of shots) {
    if (cam === 'button') {
      await page.click('button[aria-label="地图全景"]');
      await page.mouse.move(5, 450);
    } else if (cam) await page.evaluate((c) => window.__camera.set(c), cam);
    await settle();
    const path = `${out}/xianfu-depth-${tag}-${name}-2x.png`;
    await page.screenshot({ path });
    const stats = await page.evaluate(() => ({
      camera: window.__camera.get(),
      baseLoaded: window.__mapStats.baseLoaded,
      fallbacks: window.__mapStats.fallbacks,
      depth: window.__depth?.stats(),
    }));
    const pixels = await analyse(path);
    report[`${tag}-${name}`] = { path, ...stats, pixels };
    assert.ok(pixels.black < 0.01, `${path} 疑似黑屏`);
    assert.ok(stats.baseLoaded && stats.fallbacks === 0, `${path} 底图未加载`);
    if (on) {
      const b = stats.depth.backdrop;
      assert.ok(
        b.left <= 0 && b.top <= 0 && b.right >= VW && b.bottom >= VH,
        `${path} L0 露边 ${JSON.stringify(b)}`,
      );
      // 纸色占比只记录不断言：L0 地平线的桃奶油色与纸色接近，计数会误报。
    }
  }
  report[`${tag}-errors`] = errors;
  assert.deepEqual(errors, [], `${tag} console/pageerror`);
  await ctx.close();
}
await browser.close();
await writeFile(
  `${out}/depth-shots-report.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 1));
