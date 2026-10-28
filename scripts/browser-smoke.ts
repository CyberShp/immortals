// 临时静态服务与独立浏览器；结束时全部关闭，不接触用户浏览器配置。
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const root = resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const path = resolve(
      root,
      '.' + decodeURIComponent((req.url ?? '/').split('?')[0]),
    );
    if (!path.startsWith(root + '/') && path !== root) {
      res.writeHead(403).end();
      return;
    }
    const file = path === root ? resolve(root, 'index.html') : path;
    res.setHeader(
      'Content-Type',
      (
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
        } as Record<string, string>
      )[extname(file)] ?? 'application/octet-stream',
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('临时服务未启动');
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.locator('#disciples article').first().waitFor();
  assert.equal(await page.locator('#disciples article').count(), 6);
  assert.equal(await page.locator('#map canvas').count(), 1);
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({
    path: 'output/playwright/desktop.png',
    fullPage: true,
  });
  const title = await page.title();
  assert.ok(title.startsWith('(1)'));
  const favicon = await page.locator('link[rel=icon]').getAttribute('href');
  await page.keyboard.press('Backquote');
  assert.equal(await page.title(), '季度工作台账');
  assert.equal(await page.locator('#game').isVisible(), false);
  assert.notEqual(
    await page.locator('link[rel=icon]').getAttribute('href'),
    favicon,
  );
  await page.keyboard.press('Backquote');
  assert.equal(await page.title(), title);
  await page.locator('[data-event]').click();
  await page.locator('[data-choice="1"]').click();
  assert.equal((await page.title()).startsWith('(1)'), false);
  await page.locator('#save-open').click();
  await page.locator('#save-text').fill('{坏数据}');
  await page.locator('#import').click();
  await page.waitForFunction(() =>
    document.querySelector('#save-status')?.textContent?.includes('不是有效'),
  );
  assert.equal(await page.locator('#disciples article').count(), 6);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadPromise;
  await download.saveAs('output/playwright/存档.json');
  const saved = JSON.parse(
    await readFile('output/playwright/存档.json', 'utf8'),
  );
  saved.lastSeen = Date.now() - 8 * 3600000;
  await page.locator('#save-text').fill(JSON.stringify(saved));
  await page.locator('#import').click();
  await page.getByRole('heading', { name: '离线期间发生的事' }).waitFor();
  assert.ok(
    (await page.locator('#modal-body').innerText()).includes('共 45 轮'),
  );
  await page.locator('#offline-ok').click();
  await page.locator('#settings-open').click();
  await page.locator('[name="title"]').fill('山间值班簿');
  await page.locator('[name="bossKey"]').fill('F8');
  await page.locator('[name="speed"]').fill('300');
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.keyboard.press('F8');
  assert.equal(await page.title(), '季度工作台账');
  await page.keyboard.press('F8');
  assert.equal(await page.title(), '山间值班簿');
  const before = await page.locator('#season').innerText();
  await page.waitForFunction(
    (value) => document.querySelector('#season')?.textContent !== value,
    before,
  );
  assert.notEqual(await page.locator('#season').innerText(), before);
  // 强制走不支持画中画时的普通弹窗分支。
  await page.evaluate(() =>
    Object.defineProperty(window, 'documentPictureInPicture', {
      value: undefined,
      configurable: true,
    }),
  );
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#small').click();
  const popup = await popupPromise;
  await popup.getByRole('heading').waitFor();
  assert.ok((await popup.locator('body').innerText()).includes('陆青崖'));
  await popup.close();
  await page.setViewportSize({ width: 480, height: 640 });
  await page.screenshot({
    path: 'output/playwright/compact.png',
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  // 重新加载实际 IndexedDB；离线轮数已写入且设置仍在。
  await page.reload();
  await page.locator('#disciples article').first().waitFor();
  assert.equal(await page.title(), '山间值班簿');
  assert.ok(!(await page.locator('#season').innerText()).includes('第 1 季'));
  assert.deepEqual(errors, []);
  console.log(
    '浏览器验收通过：地图、六人卡片、老板键与图标、事件、坏档保护、下载、八小时离线导入、设置、加速、小窗回退、紧凑布局、重载持久化；无页面异常。',
  );
} finally {
  await browser?.close();
  await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
}
