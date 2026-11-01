import { chromium } from 'playwright-core';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
const out = process.argv[3] ?? '/Volumes/Media/immortal-qa/integration2';
const phase = process.argv[4] ?? 'after';
await mkdir(`${out}/shots`, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  args: ['--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => {
    new MutationObserver(() => {
      if (document.documentElement)
        document.documentElement.style.zoom = '0.95';
    }).observe(document, { childList: true, subtree: true });
  });
  if (process.env.FIXED_CLOCK === '1')
    await context.addInitScript(() => {
      performance.now = () => 100000;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => raf(() => callback(100000));
    });
  if (process.env.V4_BRIDGE_REFERENCE === '1')
    await context.route(
      '**/assets/world-v4/bridges/east_bridge_v5.webp',
      async (route) =>
        route.fulfill({
          contentType: 'image/webp',
          body: await readFile(
            'public/assets/world-v4/bridges/east_bridge_v4.webp',
          ),
        }),
    );
  const page = await context.newPage();
  await page.goto((process.argv[2] ?? 'http://127.0.0.1:4186') + '/?debug=1');
  await page.waitForFunction(
    () => window.__mapReady && window.__xianfu,
    {},
    { timeout: 120000 },
  );
  await page.evaluate(() => {
    window.__xianfu.reset();
    window.__xianfu.freeze(true);
  });
  const report = await page.evaluate(async () => {
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    return {
      method:
        'Resource Timing encodedBodySize at first completed map paint; fresh context; DPR2; CSS zoom .95; 1600x1000; default v4',
      camera: window.__camera.get(),
      viewport: window.__mapStats.viewport,
      resources: performance.getEntriesByType('resource').map((r) => ({
        file: new URL(r.name).pathname,
        bytes: r.encodedBodySize,
        firstScreen: true,
      })),
      navigation: performance.getEntriesByType('navigation')[0].encodedBodySize,
    };
  });
  report.bytes =
    report.navigation + report.resources.reduce((s, r) => s + r.bytes, 0);
  report.limit = 8000000;
  report.pass = report.bytes <= report.limit;
  if (phase === 'after' && !report.pass) process.exitCode = 1;
  for (const r of report.resources) {
    try {
      r.diskBytes = (await stat('dist' + r.file)).size;
    } catch {
      r.diskBytes = null;
    }
  }
  await page.evaluate(() => window.__worldV4.captureOnly(true));
  await page.waitForTimeout(300);
  await page
    .locator('canvas')
    .screenshot({ path: `${out}/shots/05-first-screen-${phase}.png` });
  await writeFile(
    `${out}/evidence/first-screen-${phase}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      bytes: report.bytes,
      pass: report.pass,
      camera: report.camera,
      viewport: report.viewport,
    }),
  );
} finally {
  await browser.close();
}
