import sharp from 'sharp';
import { chromium } from 'playwright-core';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out =
  process.argv[3] ?? '/Volumes/Media/immortal-qa/world-v4-intake/shots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  args: ['--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
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
const report = { errors: [], shots: [], resources: [] };
page.on('pageerror', (e) => report.errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`);
});
try {
  await page.goto(
    (process.argv[2] ?? 'http://127.0.0.1:4173') + '/?world=v4&debug=1',
  );
  await page.waitForFunction(
    () => window.__mapReady && window.__xianfu && window.__worldV4,
    {},
    { timeout: 120000 },
  );
  await page.evaluate(() => {
    document.documentElement.style.zoom = '0.95';
    window.__xianfu.reset();
    window.__xianfu.freeze(true);
    window.__worldV4.captureOnly(true);
  });
  await page.waitForTimeout(1000);
  console.log(
    'READY',
    await page.evaluate(() => ({
      stats: window.__mapStats,
      keys: Object.keys(window.__xianfu),
    })),
  );
  const shot = async (name, x, y, zoom = 1) => {
    await page.evaluate(
      ({ x, y, zoom }) => window.__camera.set({ x, y, zoom }),
      { x, y, zoom },
    );
    await page.waitForTimeout(300);
    await page.locator('canvas').screenshot({ path: `${out}/${name}.png` });
    report.shots.push({
      name,
      camera: await page.evaluate(() => window.__camera.get()),
      stats: await page.evaluate(() => window.__mapStats.viewport),
      canvas: await page.locator('canvas').evaluate((c) => ({
        width: c.width,
        height: c.height,
        rect: c.getBoundingClientRect().toJSON(),
      })),
    });
  };
  // DPR 2 full world exceeds an 8192 GPU renderbuffer. Render four exact camera tiles.
  await page.setViewportSize({ width: 2600, height: 1300 });
  const tiles = [];
  for (const [left, top, width, height] of [
    [0, 0, 2499, 1160],
    [2499, 0, 2498, 1160],
    [0, 1160, 2499, 1160],
    [2499, 1160, 2498, 1160],
  ]) {
    await page.evaluate(
      ({ width, height }) => {
        const m = document.querySelector('#map');
        m.style.width = width / 0.95 + 'px';
        m.style.height = height / 0.95 + 'px';
        m.style.zIndex = '9999';
      },
      { width, height },
    );
    await page.waitForTimeout(300);
    await page.evaluate(({ x, y }) => window.__camera.set({ x, y, zoom: 1 }), {
      x: left + width / 2,
      y: top + height / 2,
    });
    await page.waitForTimeout(200);
    const input = await page.locator('canvas').screenshot();
    const meta = await sharp(input).metadata();
    assert.equal(meta.width, width * 2);
    assert.equal(meta.height, height * 2);
    tiles.push({ input, left: left * 2, top: top * 2 });
  }
  await sharp({
    create: { width: 9994, height: 4640, channels: 4, background: '#dce8ec' },
  })
    .composite(tiles)
    .png()
    .toFile(`${out}/01-world-full.png`);
  report.shots.push({
    name: '01-world-full',
    world: [4997, 2320],
    output: [9994, 4640],
    method: 'four camera tiles, DPR 2, zoom .95, no resampling',
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.evaluate(() => {
    const m = document.querySelector('#map');
    m.style.width = 1600 / 0.95 + 'px';
    m.style.height = 1000 / 0.95 + 'px';
  });
  await page.waitForTimeout(400);
  await shot('02-gate-southbridge-closeup', 1190, 1430, 1);
  await shot('03-east-bridge-platform', 3960, 1510, 0.9);
  await shot('04-south-bridge-platform', 1050, 1600, 0.9);
  const id = await page.evaluate(() => window.__mapStats.disciples[0].id);
  await page.evaluate(
    (id) => window.__motionDebug.place(id, window.__worldV4.uv(30.262, 7.761)),
    id,
  );
  const route = await page.evaluate(
    (id) => window.__worldV4.expedition(id),
    id,
  );
  for (const [i, t] of [0, 0.42, 0.85, 1].entries()) {
    await page.evaluate(({ id, ms }) => window.__worldV4.seek(id, ms), {
      id,
      ms: route.duration * t + (i === 3 ? 450 : 0),
    });
    await shot(`05${'abcd'[i]}-expedition-seq`, 1150, 1450, 1);
    const d = await page.evaluate(
      (id) => window.__mapStats.disciples.find((d) => d.id === id),
      id,
    );
    report[`expedition${i}`] = d;
  }
  await page.evaluate((id) => window.__worldV4.seek(id, 1e6), id);
  assert.equal(
    await page.evaluate(
      (id) => window.__mapStats.disciples.find((d) => d.id === id)?.alpha ?? 0,
      id,
    ),
    0,
  );
  const back = await page.evaluate(
    (id) => window.__worldV4.expedition(id, 'in'),
    id,
  );
  report.returnRoute = back;
  await page.evaluate(({ id, ms }) => window.__worldV4.seek(id, ms), {
    id,
    ms: 400,
  });
  await shot('05e-return-fade', 1150, 1450, 1);
  for (const [name, p] of [
    ['06-occlusion-pine', [41.9097910804705, -0.34157431444416986]],
    ['06-occlusion-frontwall', [33.30824364200792, 1.466654735628044]],
    ['06-occlusion-eaves', [22.761951503612178, -3.6811061911262115]],
  ]) {
    const point = await page.evaluate(
      ({ id, p }) => window.__motionDebug.place(id, window.__worldV4.uv(...p)),
      { id, p },
    );
    await shot(name, point[0], point[1], 1.25);
  }
  await shot('07-fogband', 4020, 1900, 0.85);
  report.resources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => ({ name: r.name, bytes: r.encodedBodySize })),
  );
  report.firstLoadBytes = report.resources.reduce((n, r) => n + r.bytes, 0);
  report.stats = await page.evaluate(() => window.__mapStats);
  report.normalExpedition = await page.evaluate(() => {
    window.__xianfu.reset();
    window.__xianfu.freeze(true);
    let outgoing, incoming;
    for (let i = 0; i < 900; i++) {
      window.__xianfu.advance(1);
      const ms = window.__worldV4.motionState();
      if (!outgoing) outgoing = ms.find((m) => m.expedition === 'out');
      if (outgoing)
        incoming = ms.find(
          (m) => m.id === outgoing.id && m.expedition === 'in',
        );
      if (incoming) break;
    }
    return { tick: window.__xianfu.world().tick, outgoing, incoming };
  });
  assert.ok(report.normalExpedition.outgoing, 'sim departure transition');
  assert.ok(report.normalExpedition.incoming, 'sim return transition');
  const old = await context.newPage();
  const oldRequests = [];
  old.on('request', (r) => oldRequests.push(r.url()));
  await old.goto(
    (process.argv[2] ?? 'http://127.0.0.1:4173') + '/?world=v3&debug=1',
  );
  await old.waitForFunction(() => window.__mapReady);
  report.legacy = await old.evaluate(() => ({
    v4: !!window.__worldV4,
    cool: !!window.__cool,
    errors: window.__mapStats.fallbacks,
  }));
  assert.equal(report.legacy.v4, false);
  assert.equal(report.legacy.cool, true);
  assert.equal(
    oldRequests.filter((u) => u.includes('/assets/world-v4/')).length,
    0,
  );
  await old.close();

  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(
    `${out}/browser-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
