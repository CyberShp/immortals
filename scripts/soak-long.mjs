// 长时挂机稳定性：真实墙钟 N 分钟（默认 10），时钟加速 speed 倍（默认 10），零操作。
import { chromium } from 'playwright-core';
import { writeFile, mkdir } from 'node:fs/promises';
const base =
  process.argv.find((a) => /^https?:/.test(a)) ?? 'http://localhost:4173/';
const minutes = Number(process.env.SOAK_MIN ?? 10);
const speed = Number(process.env.SOAK_SPEED ?? 10);
const errors = [];
const browser = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 900 } })
).newPage();
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const url = new URL(base);
url.searchParams.set('debug', '1');
url.searchParams.set('speed', String(speed));
await page.goto(url.href);
await page.waitForFunction(() => !!window.__xianfu);
const t0 = Date.now();
const start = await page.evaluate(() => window.__xianfu.world());
const samples = [];
let negative = false;
while (Date.now() - t0 < minutes * 60000) {
  await page.waitForTimeout(30000);
  const w = await page.evaluate(() => window.__xianfu.world());
  if (Object.values(w.resources).some((v) => !Number.isFinite(v) || v < 0))
    negative = true;
  samples.push({
    秒: Math.round((Date.now() - t0) / 1000),
    步: w.tick,
    资源: w.resources,
    已结算: w.flags.resolved,
    弟子数: w.disciples.length,
  });
}
const end = await page.evaluate(() => window.__xianfu.world());
await page.screenshot({ path: 'docs/screenshots/07-soak-end.png' });
const report = {
  通过: errors.length === 0 && !negative && end.tick > start.tick,
  真实分钟: minutes,
  加速倍数: speed,
  推进步数: end.tick - start.tick,
  游戏内分钟: ((end.tick - start.tick) * 10) / 60,
  自动结算事件: end.flags.resolved,
  资源出现负值或非数: negative,
  错误: errors,
  采样: samples,
};
await mkdir('docs/screenshots', { recursive: true });
await writeFile(
  'docs/screenshots/soak-long-report.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ ...report, 采样: samples.length }, null, 2));
await browser.close();
process.exit(report.通过 ? 0 : 1);
