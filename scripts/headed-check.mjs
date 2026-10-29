// Run externally after npm run build. Never substitutes a PiP shim for native PiP.
import { chromium } from 'playwright-core';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const args = process.argv.slice(2);
const option = (key, fallback) => {
  const i = args.indexOf(key);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--'))
    throw Error(`Missing ${key} value`);
  return args[i + 1];
};
const out = resolve(option('--out', '/Volumes/Media/GrokBot/workspace/'));
const json = resolve(option('--json', '/tmp/xf-headed.json'));
const supplied = option(
  '--url',
  args.find((a) => /^https?:/.test(a)),
);
const url = new URL(supplied || 'http://127.0.0.1:4173');
url.searchParams.set('debug', '1');
const report = {
  url: url.href,
  startedAt: new Date().toISOString(),
  checks: {},
  errors: [],
};
const runFile = promisify(execFile);
let server, browser, page, pip;
let bossKey = 'Backquote';
const shot = (p, name) =>
  p.screenshot({ path: resolve(out, `xianfu-pip-${name}.png`) });
const state = (p) =>
  p.evaluate(() => ({
    focus: document.hasFocus(),
    hasFocus: document.hasFocus(),
    blurCount: window.__blurCount ?? 0,
    title: document.title,
    cover:
      !!document.querySelector('#cover') &&
      !document.querySelector('#cover').hidden,
    gameHidden: document.querySelector('#game')?.hidden,
    width: innerWidth,
    height: innerHeight,
    canvas: (() => {
      const c = document.querySelector('canvas');
      const r = c?.getBoundingClientRect();
      return c
        ? {
            width: c.width,
            height: c.height,
            cssWidth: r.width,
            cssHeight: r.height,
          }
        : null;
    })(),
  }));
async function check(name, fn) {
  const start = report.errors.length;
  const measurements = {};
  try {
    await fn(measurements);
    report.checks[name] = { status: 'pass', measurements };
  } catch (error) {
    report.checks[name] = {
      status: 'fail',
      error: String(error),
      measurements,
    };
  }
  report.checks[name].consoleErrorCount = report.errors
    .slice(start)
    .filter((e) => e.type === 'console').length;
  report.checks[name].pageErrorCount = report.errors
    .slice(start)
    .filter((e) => e.type === 'pageerror').length;
}
async function disableFocusEmulation(context, p) {
  const session = await context.newCDPSession(p);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
}
async function activateOS(script, measurements, key) {
  try {
    const result = await runFile('osascript', ['-e', script], {
      timeout: 10000,
    });
    measurements[key] = { status: 'pass', ...result };
  } catch (error) {
    measurements[key] = {
      status: 'fail',
      error: String(error),
      stdout: error.stdout,
      stderr: error.stderr,
    };
    throw error;
  }
}
async function readyVisible(p) {
  await p.bringToFront();
  if ((await state(p)).cover) await p.keyboard.press(bossKey);
  await p.locator('#game').waitFor({ state: 'visible' });
}
try {
  await mkdir(out, { recursive: true });
  if (!supplied) {
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '4173',
        '--strictPort',
      ],
      {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let serverError;
    server.on('error', (e) => {
      serverError = e;
    });
    let logs = '';
    server.stdout.on('data', (b) => {
      logs += b;
    });
    server.stderr.on('data', (b) => {
      logs += b;
    });
    const deadline = Date.now() + 15000;
    while (!logs.includes('http://127.0.0.1:4173')) {
      if (serverError || server.exitCode !== null || Date.now() > deadline)
        throw Error(`Preview failed: ${serverError || logs}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  browser = await chromium.launch({
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    args: ['--window-size=1440,900'],
  });
  const context = await browser.newContext({
    viewport: null,
  });
  context.setDefaultTimeout(10000);
  context.on('page', (p) => {
    p.on('console', (m) => {
      if (m.type() === 'error')
        report.errors.push({
          type: 'console',
          url: p.url(),
          message: m.text(),
        });
    });
    p.on('pageerror', (e) =>
      report.errors.push({
        type: 'pageerror',
        url: p.url(),
        message: e.message,
      }),
    );
  });
  page = await context.newPage();
  await disableFocusEmulation(context, page);
  await page.goto(url.href);
  await page.waitForFunction(
    () => window.__mapReady && window.__labels && window.__xianfu,
  );
  await page.evaluate(() => window.__xianfu.freeze(true));
  await check('cardAvoid', async (m) => {
    await page.evaluate(() =>
      window.__camera.set({ zoom: 1, x: 1400, y: 940 }),
    );
    // Use the existing presentation-only walking fixture to ensure a disciple is by the dorm.
    m.walk = await page.evaluate(() => {
      const id = window.__mapStats.disciples[0].id;
      return { id, ...window.__xianfu.walkDormToHall(id) };
    });
    await page.waitForFunction(
      (id) => window.__mapStats.disciples.some((d) => d.id === id),
      m.walk.id,
    );
    const point = await page.evaluate((id) => {
      const d = window.__mapStats.disciples.find((d) => d.id === id);
      const c = window.__camera.get(),
        r = document.querySelector('#map canvas').getBoundingClientRect();
      return {
        x: r.x + r.width / 2 + (d.x - c.x) * c.zoom,
        y: r.y + r.height / 2 + (d.y - c.y) * c.zoom - 12,
      };
    }, m.walk.id);
    await page.mouse.click(point.x, point.y);
    await page.getByTestId('disciple-card').waitFor();
    m.samples = [];
    for (const camera of [
      null,
      { zoom: 0.9, x: 1410, y: 930 },
      { zoom: 1.1, x: 1390, y: 950 },
    ]) {
      if (camera) await page.evaluate((c) => window.__camera.set(c), camera);
      await page.waitForTimeout(150);
      const sample = await page.evaluate(() => ({
        card: document
          .querySelector('[data-testid="disciple-card"]')
          .getBoundingClientRect()
          .toJSON(),
        labels: window.__labels(),
        width: innerWidth,
        height: innerHeight,
      }));
      m.samples.push(sample);
      assert.ok(
        sample.labels.some((l) => l.text.includes('居舍')),
        'Dorm label must be visible',
      );
      const c = sample.card;
      assert.ok(
        c.x >= 0 &&
          c.y >= 0 &&
          c.right <= sample.width &&
          c.bottom <= sample.height,
        'Card outside viewport',
      );
      assert.ok(
        sample.labels.every(
          (l) =>
            Math.min(c.right, l.x + l.width) <= Math.max(c.x, l.x) ||
            Math.min(c.bottom, l.y + l.height) <= Math.max(c.y, l.y),
        ),
        'Card overlaps label',
      );
    }
    await shot(page, 'card-avoid');
  });
  await check('pipWindow', async (m) => {
    await readyVisible(page);
    m.supported = await page.evaluate(() => !!window.documentPictureInPicture);
    const opened = context.waitForEvent('page').catch(() => null);
    await page.locator('#small').click(); // Real user activation, never evaluate(requestWindow).
    pip = await opened;
    assert.ok(pip, 'No child page appeared');
    await disableFocusEmulation(context, pip);
    await pip.locator('#map canvas').waitFor();
    await pip.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return c?.width > 0 && c?.height > 0;
    });
    m.native = await page.evaluate(
      () => !!window.documentPictureInPicture?.window,
    );
    m.kind = m.native ? 'native PiP' : 'window.open fallback';
    m.child = await state(pip);
    m.main = await state(page);
    m.dimensions = await pip.evaluate(() => [
      innerWidth,
      innerHeight,
      outerWidth,
      outerHeight,
    ]);
    await shot(pip, 'window');
    await shot(page, 'main');
    assert.ok(m.child.canvas.cssWidth > 0 && m.child.canvas.cssHeight > 0);
    // Allow browser sizing adjustments around the requested 480 x 320 window.
    const [width, height] = m.dimensions;
    assert.ok(
      width >= 200 &&
        width <= 800 &&
        height >= 150 &&
        height <= 600 &&
        width < m.main.width * 0.75 &&
        height < m.main.height * 0.75,
      `PiP must be a small window: ${width}x${height}, main ${m.main.width}x${m.main.height}`,
    );
    assert.ok(
      m.native,
      m.supported
        ? 'Native PiP failed; fallback observed'
        : 'Browser does not support document PiP',
    );
  });
  await check('pipBossKey', async (m) => {
    assert.ok(pip && !pip.isClosed(), 'PiP/window unavailable');
    await readyVisible(pip);
    m.before = await state(pip);
    await pip.keyboard.press(bossKey);
    m.on = await state(pip);
    await shot(pip, 'window-bosskey-on');
    assert.ok(m.on.cover && m.on.gameHidden && m.on.title === '季度工作台账');
    await pip.keyboard.press(bossKey);
    m.off = await state(pip);
    await shot(pip, 'window-bosskey-off');
    assert.ok(
      !m.off.cover && !m.off.gameHidden && m.off.title === m.before.title,
    );
  });
  if (pip && !pip.isClosed()) await pip.close();
  await check('blurHide', async (m) => {
    await readyVisible(page);
    await page.locator('#settings-open').click();
    const configured = await page.locator('[name=bossKey]').inputValue();
    bossKey = configured === '`' ? 'Backquote' : configured;
    m.bossKey = configured;
    await page.locator('[name=hideOnBlur]').check();
    await page.getByRole('button', { name: '保存设置' }).click();
    m.saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem('仙府设置')).hideOnBlur,
    );
    assert.equal(m.saved, true);
    await page.evaluate(() => {
      window.__blurCount = 0;
      window.addEventListener('blur', () => {
        window.__blurCount += 1;
      });
    });
    m.before = await state(page);
    m.browserPid = browser.process?.()?.pid ?? null;
    m.refocusMethod = m.browserPid ? 'bringToFront + OS PID' : 'bringToFront';
    m.manualRestoreRequired = null;
    try {
      await activateOS(
        'tell application "Finder" to activate',
        m,
        'finderActivation',
      );
      try {
        await page.waitForFunction(
          () =>
            window.__blurCount > 0 &&
            !document.hasFocus() &&
            !document.querySelector('#cover').hidden,
          null,
          { polling: 100 },
        );
      } finally {
        m.blurred = await state(page);
      }
      await shot(page, 'blur-hidden');
      assert.ok(
        m.blurred.blurCount > 0 &&
          !m.blurred.hasFocus &&
          m.blurred.cover &&
          m.blurred.gameHidden,
      );
      await page.bringToFront();
      if (m.browserPid) {
        await activateOS(
          `tell application "System Events" to set frontmost of (first process whose unix id is ${m.browserPid}) to true`,
          m,
          'chromeActivation',
        );
      }
      await page.waitForFunction(() => document.hasFocus(), null, {
        polling: 100,
      });
      m.refocused = await state(page);
      m.manualRestoreRequired = m.refocused.cover;
      if (m.manualRestoreRequired) await page.keyboard.press(bossKey);
      m.restored = await state(page);
      await shot(page, 'blur-restored');
      assert.ok(!m.restored.cover && !m.restored.gameHidden);
    } finally {
      m.final = await state(page);
    }
  });
  await check('bossKey', async (m) => {
    await readyVisible(page);
    m.before = await state(page);
    await page.keyboard.press(bossKey);
    m.on = await state(page);
    await shot(page, 'bosskey-on');
    assert.ok(m.on.cover && m.on.gameHidden && m.on.title === '季度工作台账');
    await page.keyboard.press(bossKey);
    m.off = await state(page);
    await shot(page, 'bosskey-off');
    assert.ok(
      !m.off.cover && !m.off.gameHidden && m.off.title === m.before.title,
    );
  });
} catch (error) {
  report.setupError = String(error);
} finally {
  for (const name of [
    'cardAvoid',
    'pipWindow',
    'pipBossKey',
    'blurHide',
    'bossKey',
  ])
    report.checks[name] ??= {
      status: 'fail',
      error: 'Prerequisite/setup failed',
      measurements: {},
      consoleErrorCount: 0,
      pageErrorCount: 0,
    };
  report.consoleErrorCount = report.errors.filter(
    (e) => e.type === 'console',
  ).length;
  report.passed =
    !report.setupError &&
    report.errors.length === 0 &&
    Object.values(report.checks).every((c) => c.status === 'pass');
  await mkdir(dirname(json), { recursive: true });
  await writeFile(json, JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  server?.kill('SIGTERM');
  console.log(
    JSON.stringify(
      { json, passed: report.passed, checks: report.checks },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
}
