import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.argv.find((a) => /^https?:/.test(a));
if (!base)
  throw new Error(
    '用法：node scripts/e2e.mjs http://localhost:4173 [--soak | --bridges]',
  );
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
let walkDormToHallMs;
const islandVisits = { main: 0, north: 0, west: 0, east: 0 };
const bridgeCrossings = {};
const bridgeScreenshots = {};
const bridgeOutput =
  process.env.BRIDGE_SCREENSHOT_DIR ?? '/Volumes/Media/GrokBot/workspace';
const offWalkableSamples = [];
let islandSampleCount = 0;
async function verifyIslandWalking(context, base) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const url = new URL(base);
  url.searchParams.set('debug', '1');
  url.searchParams.set('walkScale', '8');
  await page.goto(url.href);
  await page.waitForFunction(
    () => window.__mapReady && window.__world && window.__xianfu,
  );
  await page.evaluate(() => {
    window.__xianfu.freeze(true);
    window.__xianfu.reset();
    window.__camera.panorama();
  });
  const ids = await page.evaluate(() =>
    window.__world.bridges.map((b) => b.id),
  );
  ids.forEach((id) => (bridgeCrossings[id] = 0));
  await page.screenshot({ path: `${bridgeOutput}/xianfu-bridge-panorama.png` });
  let panorama = false,
    female = false;
  // Preserve sim cadence: one tick per ~1.3s at walkScale=8; sample each 100ms.
  for (let stint = 0; stint < 24; stint++) {
    for (let sample = 0; sample < 12 * 13; sample++) {
      if (sample % 13 === 0)
        await page.evaluate(() => window.__xianfu.advance(1));
      await page.waitForTimeout(100);
      const data = await page.evaluate(() => {
        const motions = window.__worldMotions();
        return motions.map((m) => ({
          ...m,
          walkable: window.__world.walkable(m.x, m.y),
          island: window.__world.islandOf(m.x, m.y),
          bridges: window.__world.bridgeAt(m.x, m.y),
          arrived: Math.hypot(m.x - m.toX, m.y - m.toY) <= 12,
        }));
      });
      islandSampleCount++;
      for (const bridge of ids.filter((id) => !bridgeScreenshots[id])) {
        const candidate = data.find(
          (d) => d.bridges.includes(bridge) && !d.island,
        );
        if (!candidate) continue;
        await page.evaluate((d) => {
          window.__camera.set({ x: d.x, y: d.y, zoom: 1.5 });
          window.__camera.follow(d.id);
        }, candidate);
        await page.waitForTimeout(30);
        const path = `${bridgeOutput}/xianfu-bridge-cross-${bridge}.png`;
        await page.screenshot({ path });
        // The screenshot must straddle two real on-bridge motion samples.
        const after = await page.evaluate(
          ({ id, bridge }) => {
            const m = window.__worldMotions().find((m) => m.id === id);
            return m &&
              window.__world.bridgeAt(m.x, m.y).includes(bridge) &&
              !window.__world.islandOf(m.x, m.y)
              ? m
              : null;
          },
          { id: candidate.id, bridge },
        );
        if (after)
          bridgeScreenshots[bridge] = { path, before: candidate, after };
        await page.evaluate(() => window.__camera.panorama());
      }
      for (const d of data) {
        if (!d.walkable) offWalkableSamples.push({ stint, sample, ...d });
        if (d.arrived && d.island) islandVisits[d.island]++;
        for (const id of d.bridges) bridgeCrossings[id]++;
      }
      assert.equal(
        offWalkableSamples.length,
        0,
        'disciple left walkable geometry',
      );
      if (
        !panorama &&
        new Set(
          data
            .filter((d) => d.arrived)
            .map((d) => d.island)
            .filter(Boolean),
        ).size >= 3
      ) {
        await page.screenshot({
          path: 'docs/screenshots/27-world-islands.png',
        });
        await recordArt(page, '27-world-islands');
        panorama = true;
      }
    }
    if (
      panorama &&
      ['north', 'west', 'east'].every((id) => islandVisits[id] > 0) &&
      ids.every((id) => bridgeCrossings[id] > 0 && bridgeScreenshots[id])
    )
      break;
  }
  for (const id of ['north', 'west', 'east'])
    assert.ok(islandVisits[id] > 0, `no arrival on ${id}`);
  for (const id of ids)
    assert.ok(bridgeCrossings[id] > 0, `no crossing on ${id}`);
  for (const id of ids)
    assert.ok(bridgeScreenshots[id], `no verified bridge screenshot on ${id}`);
  assert.ok(panorama, 'no simultaneous multi-island distribution');
  // Follow a woman during actual walking, so the female walk sprite is exercised.
  for (let n = 0; n < 12 && !female; n++) {
    await page.evaluate(() => window.__xianfu.advance(12));
    const id = await page.evaluate(() => {
      const women = window.__xianfu
        .world()
        .disciples.filter((d) => d.gender === '女');
      return window
        .__worldMotions()
        .find(
          (m) =>
            women.some((d) => d.id === m.id) &&
            Math.hypot(m.x - m.toX, m.y - m.toY) > 24,
        )?.id;
    });
    if (id) {
      await page.evaluate((id) => {
        window.__camera.set({ zoom: 1.2 });
        window.__camera.follow(id);
      }, id);
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'docs/screenshots/28-world-female.png' });
      await recordArt(page, '28-world-female');
      female = true;
    }
  }
  assert.ok(female, 'no female walking sprite available');
  await page.close();
}
async function prepareArt(page) {
  await page.evaluate(() => {
    window.__xianfu.reset();
    window.__xianfu.advance(59);
    window.__xianfu.settleArt();
  });
  await page.waitForFunction(() => {
    const p = window.__mapStats.poses;
    return p.meditate > 0 && p.work > 0 && p.talk > 0;
  });
  // Step 60 preserves meditation/work/socializing while one disciple changes location.
  await page.evaluate(() => window.__xianfu.advance(1));
  await page.waitForFunction(() => {
    const p = window.__mapStats.poses;
    return p['walk-step'] || p['walk-pass'];
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
  if (process.argv.includes('--bridges')) {
    await mkdir(bridgeOutput, { recursive: true });
    await verifyIslandWalking(context, base);
    assert.deepEqual(errors, []);
    await writeFile(
      `${bridgeOutput}/xianfu-bridge-report.json`,
      JSON.stringify(
        {
          bridgeCrossings,
          bridgeScreenshots,
          islandVisits,
          offWalkableSamples,
          errors,
        },
        null,
        2,
      ),
    );
    await browser.close();
    console.log(
      'Bridge crossings and screenshots verified:',
      bridgeScreenshots,
    );
    process.exit(0);
  }
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
  if (!soak) await page.evaluate(() => window.__xianfu.freeze(true));
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
  assert.equal(
    firstLoadResources.filter((r) => r.url.includes('/portrait/')).length,
    0,
    'First screen must not load portraits',
  );
  const firstIcons = firstLoadResources.filter((r) => r.url.includes('/icon/'));
  assert.equal(firstIcons.length, 4);
  assert.ok(
    firstIcons.every((r) =>
      /resource-(stone|herb|pill|fame)-32@2x.webp$/.test(r.url),
    ),
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('#resources img')].length === 4 &&
      [...document.querySelectorAll('#resources img')].every(
        (i) => i.complete && i.naturalWidth === 64,
      ),
  );
  const baseResource = firstLoadResources.find((r) =>
    r.url.endsWith('/assets/map/world.webp'),
  );
  assert.ok(baseResource, 'Base map missing from first-load accounting');
  assert.equal(
    baseResource.bytes,
    (await stat('dist/assets/map/world.webp')).size,
  );
  assert.ok(firstLoadBytes <= 2_500_000, `First load: ${firstLoadBytes} bytes`);
  const shot = async (name, fullPage = true) => {
    if (/^0[1-6]-/.test(name)) {
      await page.waitForFunction(() => !!window.__camera && window.__mapReady);
      await page.evaluate(() =>
        window.__camera.set({ zoom: 0.45, x: 1500, y: 900 }),
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
    assert.equal(canvasBox.width, 1440);
    assert.equal(canvasBox.height, 900);
    const stats = await page.evaluate(() => window.__mapStats);
    assert.equal(stats.baseLoaded, true);
    assert.ok(stats.buildingSprites >= 1);
    assert.ok(stats.discipleSprites >= 1);
    assert.equal(stats.fallbacks, 0);
    assert.equal((await page.evaluate(() => window.__camera.get())).zoom, 1);
    assert.equal(stats.mode, 'full');
    assert.ok(stats.minHeadVisibility >= 0.6);
    assert.equal(await page.locator('#resources .art-icon').count(), 4);
    assert.ok(stats.visibleDisciples >= 3);
    assert.equal(await page.locator('.roster:visible').count(), 0);
    assert.ok(
      await page.evaluate(
        () => document.scrollingElement.scrollHeight <= innerHeight + 1,
      ),
    );
    assert.equal(await page.getByText('Iris 第一批素材').count(), 0);
    await recordArt(page, '08-art-main');
    await shot('08-art-main');
    await shot('20-world-main');
    const first = stats.disciples[0];
    const cam = await page.evaluate(() => window.__camera.get());
    await page.mouse.click(
      720 + (first.x - cam.x) * cam.zoom,
      450 + (first.y - cam.y - 30) * cam.zoom,
    );
    assert.equal(await page.locator('#disciple-card').isVisible(), true);
    await page.waitForFunction(() => {
      const i = document.querySelector('#disciple-card img');
      return i?.complete && i.naturalWidth === 128 && i.width === 64;
    });
    await shot('23-world-card');
    await page.evaluate(() => window.__ui.openRoster());
    assert.equal(await page.locator('.roster-row').count(), 6);
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.roster-row .art-portrait img')]
          .length === 6 &&
        [...document.querySelectorAll('.roster-row .art-portrait img')].every(
          (i) => i.complete && i.naturalWidth === 128 && i.width === 32,
        ),
    );
    // Create a real pending event via the existing simulation hook before the screenshot.
    await page.evaluate(() => {
      window.__xianfu.advance(12);
      window.__ui.openRoster();
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.roster-row .art-icon img')].some(
        (i) => i.complete && i.naturalWidth === 64,
      ),
    );
    assert.ok(
      await page.evaluate(() =>
        [...document.querySelectorAll('.roster-row')].every((row) => {
          const style = getComputedStyle(row);
          const status = row.querySelector('.roster-status');
          const buttons = [...row.querySelectorAll('button')];
          return (
            style.gridTemplateColumns.split(' ').length === 9 &&
            getComputedStyle(status).whiteSpace === 'nowrap' &&
            buttons.every(
              (button) => getComputedStyle(button).whiteSpace === 'nowrap',
            )
          );
        }),
      ),
      'roster must retain nine columns and nonwrapping controls',
    );
    await shot('24-world-roster');
    await page.locator('#modal [data-follow]').first().click();
    await page.waitForFunction(() => {
      const c = window.__camera.get(),
        id = window.__camera.following(),
        d = window.__mapStats.disciples.find((d) => d.id === id);
      return d && Math.hypot(c.x - d.x, c.y - d.y) < 80;
    });
    await page.mouse.move(500, 500);
    await page.mouse.down();
    await page.mouse.move(550, 500);
    await page.mouse.up();
    assert.equal(
      await page.evaluate(() => window.__camera.following()),
      undefined,
    );
    const walk = await page.evaluate(() => {
      window.__xianfu.reset();
      const id = window.__xianfu.world().disciples[0].id;
      const route = window.__xianfu.walkDormToHall(id);
      return { id, ...route, start: performance.now() };
    });
    await page.waitForFunction(
      ({ id, to }) => {
        const d = window.__mapStats.disciples.find((d) => d.id === id);
        return d && Math.hypot(d.x - to[0], d.y - to[1]) < 0.01;
      },
      walk,
      { timeout: 16000, polling: 'raf' },
    );
    walkDormToHallMs = await page.evaluate(
      (start) => performance.now() - start,
      walk.start,
    );
    assert.ok(walkDormToHallMs >= 8000 && walkDormToHallMs <= 15000);

    await page.getByRole('button', { name: '地图全景', exact: true }).click();
    assert.equal(
      (await page.evaluate(() => window.__camera.get())).zoom,
      1440 / 3200,
    );
    await recordArt(page, '13-art-panorama');
    await shot('13-art-panorama');
    await shot('21-world-panorama');
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
              d.state.behavior !== '历练',
          ).length,
    );
    assert.equal(compact.markers, present);
    await shot('09-art-compact', false);
    await shot('22-world-compact', false);
    await page.locator('#roster-open').click();
    assert.equal(await page.locator('.roster-row').count(), 6);
    await page.locator('#close').click();
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
      window.__camera.set({ zoom: 0.45, x: 1500, y: 900 }),
    );
    const zoomStats = await recordArt(page, '11-art-zoom');
    // Scan all possible crop edges to maximize the number of visible disciples.
    let region = { x: 0, y: 0, count: -1 };
    const points = zoomStats.disciples.map((p) => ({
      x: 720 + (p.x - zoomStats.camera.x) * zoomStats.camera.zoom,
      y: 450 + (p.y - zoomStats.camera.y) * zoomStats.camera.zoom,
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
    await page.evaluate(() =>
      window.__camera.set({ zoom: 0.8, x: 1500, y: 800 }),
    );
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
      () => Math.abs(window.__camera.get().zoom - 0.95) < 1e-9,
    );
    const afterDrag = await page.evaluate(() => ({
      camera: window.__camera.get(),
      scroll: window.scrollY,
    }));
    assert.ok(Math.abs(afterDrag.camera.zoom - 0.95) < 1e-9);
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
      window.__camera.set({ zoom: 0.6, x: 1710, y: 950 }),
    );
    await recordArt(page, '16-art-all-built-zoom');
    await canvas.screenshot({
      path: 'docs/screenshots/16-art-all-built-zoom.png',
    });
    for (const tier of [1, 2]) {
      await page.evaluate((tier) => {
        window.__xianfu.artAllBuilt(tier);
        window.__camera.set({ zoom: 1.05, x: 1535, y: 900 });
      }, tier);
      await page.waitForFunction(() => window.__mapStats.buildingSprites === 5);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const name = `${tier === 1 ? '25' : '26'}-world-buildings-t${tier}-zoom`;
      const sample = await recordArt(page, name);
      assert.equal(sample.buildingSprites, 5);
      assert.equal(sample.camera.zoom, 1.05);
      assert.ok(
        (await page.evaluate(() => window.__xianfu.world().buildings)).every(
          (b) => b.level === tier,
        ),
      );
      await canvas.screenshot({ path: `docs/screenshots/${name}.png` });
    }
    await page.evaluate(() => window.__xianfu.reset());
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(() => window.__mapStats.viewport.width === 1280);
    assert.equal((await canvas.boundingBox()).width, 1280);
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
    await fallbackPage.waitForFunction(
      () => document.querySelectorAll('#resources img').length === 0,
    );
    assert.equal(
      await fallbackPage.locator('#resources .art-fallback:visible').count(),
      4,
    );
    await fallbackPage.evaluate(() => window.__ui.openRoster());
    await fallbackPage.waitForFunction(
      () =>
        document.querySelectorAll('.roster-row .art-portrait img').length === 0,
    );
    assert.equal(
      await fallbackPage
        .locator('.roster-row .art-portrait .art-fallback:visible')
        .count(),
      6,
    );
    await fallbackPage.locator('#close').click();
    await fallbackPage.locator('#settings-open').click();
    await fallbackPage.locator('#save-open').click();
    await fallbackPage.locator('#save-text').waitFor();
    await fallbackPage.locator('#close').click();
    await fallbackPage.evaluate(() => {
      window.__xianfu.reset();
      window.__xianfu.advance(12);
    });
    await fallbackPage.locator('#compact-event').click();
    await fallbackPage.locator('[data-choice]').first().waitFor();
    await fallbackPage.waitForFunction(
      () => document.querySelectorAll('.event-title img').length === 0,
    );
    assert.equal(
      await fallbackPage.locator('.event-title .art-fallback:visible').count(),
      1,
    );
    assert.deepEqual(fallbackErrors, []);
    await fallbackContext.close();
    await page.locator('#roster-open').click();
    await page.locator('[data-detail]').filter({ hasText: '林守拙' }).click();
    const elder = page
      .locator('#modal .disciple')
      .filter({ has: page.getByRole('heading', { name: '林守拙' }) });
    await elder.locator('.art-portrait img').waitFor();
    await page.waitForFunction(() => {
      const i = document.querySelector('#modal .disciple .art-portrait img');
      return (
        i?.complete &&
        i.naturalWidth === 256 &&
        i.width === 128 &&
        i.height === 128
      );
    });
    assert.match(await elder.innerText(), /178 岁/);
    assert.match(await elder.innerText(), /余寿 6 季/);
    await shot('01-main');
    await page.locator('#close').click();
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
    await page.evaluate(() => window.__xianfu.freeze(true));
    await shot('03-offline', false);
    await page.locator('#offline-ok').click();
    await page.locator('#settings-open').click();
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
    await page.locator('#settings-open').click();
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
    await page.locator('#compact-event').click();
    await page.locator('[data-choice]').first().waitFor();
    await shot('05-event', false);
    await page.locator('#close').click();
    await page.setViewportSize({ width: 480, height: 320 });
    assert.equal(await page.locator('#modal').isVisible(), false);
    assert.equal(await page.locator('.roster:visible').count(), 0);
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
    for (const usePip of [false, true, 'reject']) {
      await page.evaluate((usePip) => {
        Object.defineProperty(window, 'documentPictureInPicture', {
          configurable: true,
          value: usePip
            ? {
                requestWindow: async () => {
                  if (usePip === 'reject') throw Error('PiP unavailable');
                  return window.open(
                    '',
                    'pip-test',
                    'popup,width=480,height=320',
                  );
                },
              }
            : undefined,
        });
      }, usePip);
      const opened = page.waitForEvent('popup');
      await page.locator('#small').click();
      const child = await opened;
      await child.waitForFunction(
        () => !!document.querySelector('#map canvas'),
      );
      await child.locator('#roster-open').click();
      assert.equal(await child.locator('.roster-row').count(), 6);
      await child.keyboard.press('Escape');
      await child.keyboard.press('Backquote');
      assert.equal(await child.title(), '季度工作台账');
      await child.keyboard.press('Backquote');
      await child.close();
      await page.locator('#map canvas').waitFor();
    }
    await verifyIslandWalking(context, base);
    assert.deepEqual(errors, []);
    await writeFile(
      'docs/screenshots/e2e-report.json',
      JSON.stringify(
        {
          passed: true,
          walkDormToHallMs,
          islandVisits,
          bridgeCrossings,
          bridgeScreenshots,
          offWalkableSamples,
          islandSampleCount,
          smallWindowCoverage: [
            'window.open fallback',
            'PiP requestWindow shim',
            'PiP rejection fallback',
          ],
          nativePipVerified: false,
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
  if (!soak)
    await writeFile(
      'docs/screenshots/e2e-report.json',
      JSON.stringify(
        {
          passed: false,
          errors: [...errors, String(error)],
          islandVisits,
          bridgeCrossings,
          bridgeScreenshots,
          offWalkableSamples,
          islandSampleCount,
          screenshotStats,
        },
        null,
        2,
      ) + '\n',
    );
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
