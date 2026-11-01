import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = process.argv[2] ?? '/Volumes/Media/immortal-qa/integration2';
const browser = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  args: ['--enable-unsafe-swiftshader'],
});
const results = [];
try {
  for (const [phase, port] of [
    ['before', 4187],
    ['after', 4186],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 2,
    });
    await context.addInitScript(() => {
      performance.now = () => 100000;
      const raf = requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf(() => cb(100000));
    });
    const page = await context.newPage();
    const requests = [],
      errors = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/?world=v3&debug=1`);
    await page.waitForFunction(
      () => window.__mapReady,
      {},
      { timeout: 120000 },
    );
    await page.evaluate(() => {
      document.documentElement.style.zoom = '.95';
      window.__xianfu.reset();
      window.__xianfu.freeze(true);
    });
    await page.waitForTimeout(500);
    await page
      .locator('canvas')
      .screenshot({ path: `${out}/shots/v3-${phase}.png` });
    const result = {
      phase,
      errors,
      v4Requests: requests.filter((r) => r.includes('/assets/world-v4/')),
      runtime: await page.evaluate(() => ({
        v4: !!window.__worldV4,
        cool: !!window.__cool,
        fallbacks: window.__mapStats.fallbacks,
      })),
    };
    assert.deepEqual(errors, []);
    assert.deepEqual(result.v4Requests, []);
    assert.equal(result.runtime.v4, false);
    assert.equal(result.runtime.cool, true);
    results.push(result);
    await context.close();
  }
  const a = await sharp(`${out}/shots/v3-before.png`)
      .ensureAlpha()
      .raw()
      .toBuffer(),
    b = await sharp(`${out}/shots/v3-after.png`).ensureAlpha().raw().toBuffer();
  let differentPixels = 0;
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i += 4)
    if (a.subarray(i, i + 4).compare(b.subarray(i, i + 4))) differentPixels++;
  await writeFile(
    `${out}/evidence/v3-smoke.json`,
    JSON.stringify({ results, differentPixels }, null, 2),
  );
  assert.equal(differentPixels, 0);
  console.log({ differentPixels });
} finally {
  await browser.close();
}
