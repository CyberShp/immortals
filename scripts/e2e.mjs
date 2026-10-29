import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.argv.find((a) => /^https?:/.test(a));
if (!base)
  throw new Error('用法：node scripts/e2e.mjs http://localhost:4173 [--soak]');
const soak = process.argv.includes('--soak');
await mkdir('docs/screenshots', { recursive: true });
const errors = [];
let browser;
try {
  browser = await chromium.launch({
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const url = new URL(base);
  url.searchParams.set('debug', '1');
  url.searchParams.set('speed', soak ? '100' : '1');
  await page.goto(url.href);
  await page.waitForFunction(() => !!window.__xianfu);
  const shot = (name, fullPage = true) =>
    page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage });
  if (soak) {
    const start = await page.evaluate(() => window.__xianfu.world());
    const started = Date.now();
    await page.waitForFunction(
      (t) => window.__xianfu.world().tick - t >= 66,
      start.tick,
      { timeout: 90000 },
    );
    const end = await page.evaluate(() => window.__xianfu.world());
    assert.ok(end.tick - start.tick >= 66);
    assert.ok(Number(end.flags.resolved) > Number(start.flags.resolved ?? 0));
    for (const [key, v] of Object.entries(end.resources)) {
      assert.ok(v >= 0 && Number.isFinite(v));
      if (key !== 'reputation')
        assert.ok(
          v <=
            end.capacity[key] *
              (end.buildings.find((b) => b.id === 'B_HALL')?.level || 1),
        );
    }
    assert.deepEqual(errors, []);
    const report = {
      通过: true,
      真实毫秒: Date.now() - started,
      游戏秒: (end.tick - start.tick) * 10,
      步数: end.tick - start.tick,
      自动结算事件: Number(end.flags.resolved ?? 0),
      资源: end.resources,
      错误: errors,
    };
    await writeFile(
      'docs/screenshots/soak-report.json',
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(report);
  } else {
    const elder = page
      .locator('.disciple')
      .filter({ has: page.getByRole('heading', { name: '林守拙' }) });
    assert.match(await elder.innerText(), /178 岁/);
    assert.match(await elder.innerText(), /余寿 6 季/);
    await shot('01-main');
    const title = await page.title();
    await page.keyboard.press('Backquote');
    assert.notEqual(await page.title(), title);
    assert.equal(await page.title(), '季度工作台账');
    await shot('02-boss-key');
    await page.keyboard.press('Backquote');
    await page.evaluate(async () => {
      await window.__xianfu.setLastSeen(Date.now() - 2 * 24 * 3600000);
    });
    await page.reload();
    await page.getByRole('heading', { name: '离线期间发生的事' }).waitFor();
    await shot('03-offline', false);
    await page.locator('#offline-ok').click();
    await page.locator('#save-open').click();
    const downloaded = page.waitForEvent('download');
    await page.locator('#download').click();
    const file = await downloaded;
    const content = await readFile(await file.path(), 'utf8');
    assert.ok(JSON.parse(content).world);
    await page.locator('#save-text').fill(content);
    await page.locator('#import').click();
    await page.waitForFunction(() =>
      document.querySelector('#notice').textContent.includes('存档已导入'),
    );
    await page.locator('#save-open').click();
    const before = await page.evaluate(() => window.__xianfu.world());
    await page.locator('#save-text').fill('{坏数据}');
    await page.locator('#import').click();
    await page.waitForFunction(() =>
      document.querySelector('#save-status').textContent.includes('不是有效'),
    );
    assert.deepEqual(
      await page.evaluate(() => window.__xianfu.world()),
      before,
    );
    await shot('04-export-import', false);
    await page.locator('#close').click();
    await page.evaluate(() => {
      window.__xianfu.reset();
      window.__xianfu.advance(12);
    });
    await page.locator('#events [data-event]').first().click();
    await page.locator('[data-choice]').first().waitFor();
    await shot('05-event', false);
    await page.locator('#close').click();
    await page.setViewportSize({ width: 480, height: 320 });
    assert.equal(await page.locator('#modal').isVisible(), false);
    assert.equal(await page.locator('.disciples').isVisible(), false);
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= 480),
    );
    const hint = page.locator('#compact-event');
    assert.equal(await hint.isVisible(), true);
    const pending = await page.evaluate(() => window.__xianfu.world().events);
    assert.ok(pending.length > 0);
    assert.ok((await hint.innerText()).includes(pending.at(-1).hint));
    assert.ok((await hint.innerText()).includes(`未读 ${pending.length}`));
    assert.equal(await hint.locator('i').isVisible(), true);
    const box = await hint.boundingBox();
    const resources = await page.locator('#resources').boundingBox();
    assert.ok(box && resources);
    assert.ok(box.x >= 0 && box.x + box.width <= 480);
    assert.ok(
      box.y >= resources.y + resources.height && box.y + box.height <= 320,
    );
    await shot('06-compact', false);
    await hint.click();
    await page.locator('[data-choice]').first().waitFor();
    await page.locator('[data-choice]:not([disabled])').first().click();
    assert.equal(await page.locator('#modal').isVisible(), false);
    assert.equal(
      await page.evaluate(
        (id) => window.__xianfu.world().events.some((e) => e.id === id),
        pending.at(-1).id,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log('六项截图与交互断言通过。');
  }
} catch (error) {
  if (soak)
    await writeFile(
      'docs/screenshots/soak-report.json',
      JSON.stringify(
        { 通过: false, 错误: [...errors, String(error)] },
        null,
        2,
      ) + '\n',
    );
  throw error;
} finally {
  await browser?.close();
}
