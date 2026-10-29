import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.argv.find((a) => /^https?:/.test(a));
if (!base)
  throw new Error('用法：node scripts/e2e.mjs http://localhost:4173 [--soak]');
const soak = process.argv.includes('--soak');
await mkdir('docs/screenshots', { recursive: true });
async function directoryBytes(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map((entry) => {
      const child = `${path}/${entry.name}`;
      return entry.isDirectory()
        ? directoryBytes(child)
        : stat(child).then((s) => s.size);
    }),
  );
  return sizes.reduce((a, b) => a + b, 0);
}
const distTotalBytes = await directoryBytes('dist');
const errors = [];
const screenshotStats = {};
async function prepareArt(page) {
  await page.evaluate(() => {
    window.__xianfu.reset();
    window.__xianfu.advance(59);
  });
  await page.waitForFunction(() => {
    const p = window.__mapStats.poses;
    return p.meditate > 0 && p.work > 0 && p.talk > 0;
  });
  // Step 60 preserves meditation/work/socializing while one disciple changes location.
  await page.evaluate(() => window.__xianfu.advance(1));
  await page.waitForFunction(() => {
    const p = window.__mapStats.poses;
    return (
      p.meditate > 0 &&
      p.work > 0 &&
      p.talk > 0 &&
      (p['walk-step'] || p['walk-pass'])
    );
  });
}
async function recordArt(page, name) {
  const sample = await page.evaluate(() => ({
    tick: window.__xianfu.world().tick,
    ...window.__mapStats,
    camera: window.__camera.get(),
  }));
  screenshotStats[name] = sample;
  return sample;
}
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
  const byteReads = [];
  const firstLoadBytesByType = {};
  const firstLoadResources = [];
  const countResponse = (response) => {
    if (!/^https?:/.test(response.url())) return;
    byteReads.push(
      (async () => {
        const bytes = (await response.body()).length;
        const type = /\.(webp|png)(?:\?|$)/.test(response.url())
          ? 'image'
          : response.request().resourceType();
        firstLoadResources.push({ url: response.url(), bytes, type });
        firstLoadBytesByType[type] = (firstLoadBytesByType[type] ?? 0) + bytes;
      })(),
    );
  };
  page.on('response', countResponse);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const url = new URL(base);
  url.searchParams.set('debug', '1');
  url.searchParams.set('speed', soak ? '100' : '1');
  await page.goto(url.href);
  await page.waitForFunction(() => !!window.__xianfu && window.__mapReady);
  await page.waitForLoadState('networkidle');
  page.off('response', countResponse);
  await Promise.all(byteReads);
  // Playwright response bodies can be empty for fetch()-loaded images, so the
  // byte budget uses the browser's own Resource Timing sizes instead.
  const timing = await page.evaluate(() =>
    [
      ...performance.getEntriesByType('navigation'),
      ...performance.getEntriesByType('resource'),
    ].map((e) => ({
      url: e.name,
      bytes: e.decodedBodySize,
      initiator: e.initiatorType,
    })),
  );
  for (const k of Object.keys(firstLoadBytesByType))
    delete firstLoadBytesByType[k];
  firstLoadResources.length = 0;
  for (const r of timing) {
    if (!/^https?:/.test(r.url)) continue;
    const type = /\.(webp|png)(?:\?|$)/.test(r.url)
      ? 'image'
      : /\.js(?:\?|$)/.test(r.url)
        ? 'script'
        : /\.css(?:\?|$)/.test(r.url)
          ? 'stylesheet'
          : r.initiator === 'navigation'
            ? 'document'
            : r.initiator;
    firstLoadResources.push({ url: r.url, bytes: r.bytes, type });
    firstLoadBytesByType[type] = (firstLoadBytesByType[type] ?? 0) + r.bytes;
  }
  const firstLoadBytes = Object.values(firstLoadBytesByType).reduce(
    (a, b) => a + b,
    0,
  );
  const baseResource = firstLoadResources.find((r) =>
    r.url.endsWith('/assets/map/base@2x.webp'),
  );
  assert.ok(baseResource, 'Base map missing from first-load accounting');
  assert.equal(
    baseResource.bytes,
    (await stat('dist/assets/map/base@2x.webp')).size,
  );
  assert.ok(firstLoadBytes < 5_000_000, `First load: ${firstLoadBytes} bytes`);
  const shot = async (name, fullPage = true) => {
    if (/^0[1-6]-/.test(name)) {
      await page.waitForFunction(() => !!window.__camera && window.__mapReady);
      await page.evaluate(() =>
        window.__camera.set({ zoom: 1.5, x: 300, y: 200 }),
      );
    }
    await recordArt(page, name);
    return page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage });
  };
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
    await page.setViewportSize({ width: 1440, height: 900 });
    const canvas = page.locator('#map canvas');
    const canvasBox = await canvas.boundingBox();
    assert.ok(canvasBox);
    assert.equal(canvasBox.width, 640);
    const stats = await page.evaluate(() => window.__mapStats);
    assert.equal(stats.baseLoaded, true);
    assert.ok(stats.buildingSprites >= 1);
    assert.ok(stats.discipleSprites >= 1);
    assert.equal(stats.fallbacks, 0);
    assert.equal((await page.evaluate(() => window.__camera.get())).zoom, 1.5);
    assert.equal(stats.mode, 'full');
    assert.ok(stats.minHeadVisibility >= 0.6);
    assert.equal(await page.locator('.root-legend i').count(), 5);
    assert.equal(await page.getByText('Iris 第一批素材').count(), 0);
    await recordArt(page, '08-art-main');
    await shot('08-art-main');
    await page.getByRole('button', { name: '地图全景', exact: true }).click();
    assert.equal((await page.evaluate(() => window.__camera.get())).zoom, 1);
    await recordArt(page, '13-art-panorama');
    await shot('13-art-panorama');
    await page.setViewportSize({ width: 480, height: 320 });
    // Let the canvas resize and repaint; an immediate capture shows stale tiles.
    await page.waitForTimeout(800);
    const compact = await recordArt(page, '09-art-compact');
    assert.equal(compact.mode, 'compact');
    assert.ok(compact.markerCssDiameter >= 12);
    assert.equal(compact.discipleSprites, 0);
    assert.equal(compact.buildingLabels, 0);
    const present = await page.evaluate(
      () =>
        window.__xianfu
          .world()
          .disciples.filter(
            (d) =>
              d.stage !== '坐化' &&
              !d.state.awayUntil &&
              d.state.behavior !== '休息' &&
              d.state.behavior !== '历练',
          ).length,
    );
    assert.equal(compact.markers, present);
    await shot('09-art-compact', false);
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepareArt(page);
    assert.ok(
      (await recordArt(page, '10-art-disciples-48')).minHeadVisibility >= 0.6,
    );
    await page.screenshot({
      path: 'docs/screenshots/10-art-disciples-48.png',
      clip: canvasBox,
    });
    await prepareArt(page);
    await page.evaluate(() =>
      window.__camera.set({ zoom: 1.5, x: 300, y: 200 }),
    );
    const zoomStats = await recordArt(page, '11-art-zoom');
    // Scan all possible crop edges to maximize the number of visible disciples.
    let region = { x: 0, y: 0, count: -1 };
    const points = zoomStats.disciples.map((p) => ({
      x: 320 + (p.x - zoomStats.camera.x) * zoomStats.camera.zoom,
      y: 180 + (p.y - zoomStats.camera.y) * zoomStats.camera.zoom,
    }));
    for (const point of points) {
      for (const dx of [20, 200])
        for (const dy of [48, 140]) {
          const x = Math.max(0, Math.min(420, point.x - dx));
          const y = Math.max(0, Math.min(220, point.y - dy));
          const count = points.filter(
            (p) =>
              p.x >= x && p.x <= x + 220 && p.y - 48 >= y && p.y <= y + 140,
          ).length;
          if (count > region.count) region = { x, y, count };
        }
    }
    screenshotStats['11-art-zoom'].region = region;
    await page.screenshot({
      path: 'docs/screenshots/11-art-zoom.png',
      clip: {
        x: canvasBox.x + region.x,
        y: canvasBox.y + region.y,
        width: 220,
        height: 140,
      },
    });
    const beforeDrag = await page.evaluate(() => ({
      camera: window.__camera.get(),
      scroll: window.scrollY,
    }));
    await page.mouse.move(canvasBox.x + 320, canvasBox.y + 180);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 270, canvasBox.y + 150, { steps: 10 });
    await page.mouse.up();
    await page.mouse.wheel(0, -500);
    await page.waitForFunction(
      () => Math.abs(window.__camera.get().zoom - 2) < 1e-9,
    );
    const afterDrag = await page.evaluate(() => ({
      camera: window.__camera.get(),
      scroll: window.scrollY,
    }));
    assert.equal(afterDrag.camera.zoom, 2);
    assert.notEqual(afterDrag.camera.x, beforeDrag.camera.x);
    assert.equal(afterDrag.scroll, beforeDrag.scroll);
    await recordArt(page, '14-art-camera-drag');
    await shot('14-art-camera-drag');
    await page.evaluate(() => {
      window.__xianfu.reset();
      window.__xianfu.artAllBuilt();
      window.__camera.panorama();
    });
    const allBuilt = await recordArt(page, '15-art-all-built');
    assert.equal(allBuilt.buildingSprites, 5);
    assert.equal(allBuilt.buildingLabels, 5);
    const alchemyLabelPairs = allBuilt.labelOverlaps.filter(
      (o) =>
        (o.label === 'B_MEDIT' && o.other === 'B_ALCHEMY') ||
        (o.label === 'B_ALCHEMY' && o.other === 'B_MEDIT'),
    );
    assert.equal(alchemyLabelPairs.length, 3);
    assert.ok(alchemyLabelPairs.every((o) => o.pixels === 0));
    await canvas.screenshot({ path: 'docs/screenshots/15-art-all-built.png' });
    await page.evaluate(() =>
      window.__camera.set({ zoom: 1.5, x: 390, y: 180 }),
    );
    await recordArt(page, '16-art-all-built-zoom');
    await canvas.screenshot({
      path: 'docs/screenshots/16-art-all-built-zoom.png',
    });
    await page.evaluate(() => window.__xianfu.reset());
    await page.setViewportSize({ width: 1280, height: 900 });
    assert.equal((await canvas.boundingBox()).width, 640);
    const artContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const smallArt = await artContext.newPage();
    smallArt.on('pageerror', (e) => errors.push(e.message));
    const smallUrl = new URL(url);
    smallUrl.searchParams.set('discipleHeight', '24');
    await smallArt.goto(smallUrl.href);
    await smallArt.waitForFunction(() => window.__mapReady);
    await smallArt.evaluate(() => window.__camera.panorama());
    await prepareArt(smallArt);
    await recordArt(smallArt, '12-art-disciples-24');
    await smallArt.screenshot({
      path: 'docs/screenshots/12-art-disciples-24.png',
      clip: await smallArt.locator('#map canvas').boundingBox(),
    });
    await artContext.close();
    const fallbackContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const fallbackPage = await fallbackContext.newPage();
    const fallbackErrors = [];
    fallbackPage.on('pageerror', (e) => fallbackErrors.push(e.message));
    await fallbackPage.route('**/assets/**', (route) =>
      route.fulfill({ status: 404, body: 'Missing art' }),
    );
    await fallbackPage.goto(url.href);
    await fallbackPage.waitForFunction(
      () => window.__mapReady && !!window.__xianfu,
    );
    const fallbackStats = await fallbackPage.evaluate(() => window.__mapStats);
    assert.ok(fallbackStats.fallbacks > 0);
    assert.ok(fallbackStats.rings > 0);
    assert.equal(fallbackStats.rings, fallbackStats.nameLabels);
    assert.equal(fallbackStats.baseLoaded, false);
    await fallbackPage.locator('#save-open').click();
    await fallbackPage.locator('#save-text').waitFor();
    await fallbackPage.locator('#close').click();
    await fallbackPage.evaluate(() => {
      window.__xianfu.reset();
      window.__xianfu.advance(12);
    });
    await fallbackPage.locator('#events [data-event]').first().click();
    await fallbackPage.locator('[data-choice]').first().waitFor();
    assert.deepEqual(fallbackErrors, []);
    await fallbackContext.close();
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
    await page.waitForTimeout(800);
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
    await writeFile(
      'docs/screenshots/e2e-report.json',
      JSON.stringify(
        {
          passed: true,
          firstLoadBytes,
          firstLoadBytesByType,
          firstLoadResources,
          distTotalBytes,
          screenshotStats,
          buildingScales: JSON.parse(
            await readFile('public/assets/manifest.json', 'utf8'),
          ).files.filter((f) => f.file.includes('-map@')),
          mapStats: stats,
          fallbackStats,
          errors,
        },
        null,
        2,
      ) + '\n',
    );
    console.log('原六项交互、美术截图、首屏体积及 404 降级断言通过。');
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
