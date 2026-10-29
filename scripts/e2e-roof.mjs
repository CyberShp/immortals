import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import geometry from '../src/render/roof-fade-geometry.json' with { type: 'json' };

const ZOOM = 0.95,
  DPR = 2;
const frames = (page, n = 2) =>
  page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const tick = (k) =>
          k ? requestAnimationFrame(() => tick(k - 1)) : resolve();
        tick(n);
      }),
    n,
  );

async function open(context, base, roofFade) {
  const page = await context.newPage();
  const errors = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  const url = new URL(base);
  url.searchParams.set('debug', '1');
  if (roofFade) url.searchParams.set('roofFade', '1');
  await page.goto(url.href);
  await page.waitForFunction(() => window.__mapReady && window.__motionDebug);
  await page.evaluate(() => {
    window.__xianfu.freeze(true);
    window.__xianfu.reset();
    window.__xianfu.artAllBuilt(1);
  });
  await frames(page, 3);
  return { page, errors, requests };
}

/** 等到 predicate(state) 成立，返回从调用起的毫秒数。 */
async function waitRoof(page, id, predicate, timeout = 4000) {
  return page.evaluate(
    ({ id, predicate, timeout }) =>
      new Promise((resolve, reject) => {
        const test = new Function('s', `return (${predicate})(s)`);
        const start = performance.now();
        const poll = () => {
          const s = window.__roofFade.state()[id];
          if (test(s)) resolve(performance.now() - start);
          else if (performance.now() - start > timeout)
            reject(
              new Error(`timeout ${id} ${predicate} ${JSON.stringify(s)}`),
            );
          else requestAnimationFrame(poll);
        };
        poll();
      }),
    { id, predicate: predicate.toString(), timeout },
  );
}

/** 记录一次淡变：从 alpha 离开起点到抵达终点的时长（render 时间）。 */
async function measureFade(page, id, from, to, timeout = 8000) {
  return page.evaluate(
    ({ id, from, to, timeout }) =>
      new Promise((resolve, reject) => {
        const start = performance.now();
        let left;
        const samples = [];
        const poll = () => {
          const now = performance.now();
          const { alpha } = window.__roofFade.state()[id];
          samples.push([Math.round(now - start), +alpha.toFixed(3)]);
          if (left === undefined && alpha !== from) left = now;
          if (left !== undefined && alpha === to)
            resolve({ ms: now - left, samples });
          else if (now - start > timeout)
            reject(new Error(`fade timeout ${JSON.stringify(samples)}`));
          else requestAnimationFrame(poll);
        };
        poll();
      }),
    { id, from, to, timeout },
  );
}

export async function verifyRoofFade(browser, base, cleanScreenshot) {
  const output =
    process.env.ROOF_SCREENSHOT_DIR ?? '/Volumes/Media/GrokBot/workspace';
  await mkdir(output, { recursive: true });
  const options = {
    viewport: { width: 640, height: 450 },
    deviceScaleFactor: DPR,
  };
  const report = { buildings: {}, defaultOff: {}, labels: {} };

  // 默认关闭：不请求 roof-fade 素材、不暴露调试接口、无 roof 图层。
  const offContext = await browser.newContext(options);
  let offLabels;
  try {
    const off = await open(offContext, base, false);
    const hasHook = await off.page.evaluate(() => '__roofFade' in window);
    const roofRequests = off.requests.filter((u) => u.includes('roof-fade'));
    offLabels = await off.page.evaluate(() =>
      window.__labels().filter((l) => /^B_/.test(l.id)),
    );
    report.defaultOff = { hasHook, roofRequests };
    assert.equal(hasHook, false);
    assert.deepEqual(roofRequests, []);
    assert.deepEqual(off.errors, []);
  } finally {
    await offContext.close();
  }

  const context = await browser.newContext(options);
  try {
    const { page, errors } = await open(context, base, true);
    await page.waitForFunction(() => window.__roofFade);
    const onLabels = await page.evaluate(() =>
      window.__labels().filter((l) => /^B_/.test(l.id)),
    );
    report.labels = { off: offLabels, on: onLabels };
    assert.deepEqual(onLabels, offLabels, 'building labels must not move');
    const ids = await page.evaluate(() =>
      window.__mapStats.disciples.map((d) => d.id),
    );
    const entrances = await page.evaluate(() =>
      Object.fromEntries(
        window.__world.pedestals.map((p) => [p.id, p.entrance ?? null]),
      ),
    );
    for (const [building, roof] of Object.entries(geometry.buildings)) {
      const occupants = roof.seats.length ? ids.slice(0, 2) : ids.slice(0, 1);
      const entrance = await page.evaluate(
        (b) => window.__world.slots?.find((s) => s.id === b)?.entrance,
        building,
      );
      const anchor = entrance ?? entrances[building];
      assert.ok(anchor, `entrance for ${building}`);
      const top = roof.foundationTop.map(([x, y]) => [
        x + anchor[0],
        y + anchor[1],
      ]);
      const cx = top.reduce((a, p) => a + p[0], 0) / 4,
        cy = top.reduce((a, p) => a + p[1], 0) / 4;
      await page.evaluate(
        ({ cx, cy, zoom }) => window.__camera.set({ x: cx, y: cy, zoom }),
        { cx, cy, zoom: ZOOM },
      );
      await frames(page);
      // 以外观实际包围盒居中（和 pedestal 截图同法）。
      await page.evaluate(
        ({ b, zoom }) => {
          const s = window.__mapStats.buildings.find((s) => s.id === b);
          const cam = window.__camera.get();
          window.__camera.set({
            x: cam.x + (s.x + s.width / 2 - innerWidth / 2) / cam.zoom,
            y: cam.y + (s.y + s.height / 2 - innerHeight / 2) / cam.zoom,
            zoom,
          });
        },
        { b: building, zoom: ZOOM },
      );
      await frames(page);
      const shot = async (stage) =>
        cleanScreenshot(
          page,
          `${output}/xianfu-roofhide-${roof.key}-${stage}-2x.png`,
          undefined,
          undefined,
          'device',
        );
      const ringsBefore = await page.evaluate(() => window.__mapStats.rings);
      // before：弟子站在门前，外观完整。
      const enters = [];
      for (const [i, id] of occupants.entries()) {
        await page.evaluate(
          ({ id, b, delay, pose }) =>
            new Promise((r) => setTimeout(r, delay)).then(() =>
              window.__roofFade.enter(id, b, pose),
            ),
          {
            id,
            b: building,
            delay: i * 250,
            pose: { meditation: 'meditate', alchemy: 'work' }[roof.key],
          },
        );
        enters.push(id);
        if (i === 0) {
          // 进门前截 before（仍在门前空地上，外观 alpha=1）。
          const s = await page.evaluate(
            (b) => window.__roofFade.state()[b],
            building,
          );
          assert.equal(s.alpha, 1);
          await shot('before');
        }
      }
      const hide = await measureFade(page, building, 1, 0);
      await waitRoof(page, building, (s) => s.alpha === 0 && !s.animating);
      // 等所有弟子走到室内站位。
      await page.waitForFunction(
        ({ ids }) =>
          window.__mapStats.disciples
            .filter((d) => ids.includes(d.id))
            .every((d) => d.locomotion === 'idle'),
        { ids: occupants },
        { timeout: 15000 },
      );
      await frames(page, 4);
      const inside = await page.evaluate(
        ({ ids }) =>
          window.__mapStats.disciples.filter((d) => ids.includes(d.id)),
        { ids: occupants },
      );
      const ringsInside = await page.evaluate(() => window.__mapStats.rings);
      const seatErrors = roof.seats.map(([sx, sy], i) => {
        const d = inside[i];
        const w = [sx + anchor[0], sy + anchor[1]];
        return Math.hypot(d.x - w[0], d.y - w[1]) * ZOOM * DPR;
      });
      for (const e of seatErrors) assert.ok(e <= 8, `seat error ${e}`);
      if (roof.seats.length && ringsBefore > 0)
        assert.equal(
          ringsInside,
          ringsBefore - occupants.length,
          'no selection ring on cushions',
        );
      await shot('after');
      if (roof.key === 'meditation') {
        // 静修室在炼丹房身后，炼丹房外观会挡住蒲团：再让一名弟子进炼丹房，
        // 两栋外观都按机制淡出后拍入座图。
        const helper = ids[2];
        await page.evaluate(
          (id) => window.__roofFade.enter(id, 'B_ALCHEMY', 'work'),
          helper,
        );
        await waitRoof(page, 'B_ALCHEMY', (s) => s.alpha === 0 && !s.animating);
        await page.waitForFunction(
          (id) =>
            window.__mapStats.disciples.find((d) => d.id === id).locomotion ===
            'idle',
          helper,
          { timeout: 15000 },
        );
        await frames(page, 4);
        await cleanScreenshot(
          page,
          `${output}/xianfu-roofhide-seat-2x.png`,
          undefined,
          undefined,
          'device',
        );
        await page.evaluate((id) => window.__roofFade.leave(id), helper);
        await waitRoof(page, 'B_ALCHEMY', (s) => s.alpha === 1 && !s.animating);
      }
      // mid：调试 hold 把外观固定在 alpha 0.5（真实淡变只持续 0.3s）。
      await page.evaluate(() => window.__roofFade.hold(0.5));
      await frames(page);
      await shot('mid');
      await page.evaluate(() => window.__roofFade.hold(undefined));
      await frames(page);
      for (const id of occupants)
        await page.evaluate((id) => window.__roofFade.leave(id), id);
      const show = await measureFade(page, building, 0, 1);
      await waitRoof(page, building, (s) => s.alpha === 1 && !s.animating);
      report.buildings[building] = {
        key: roof.key,
        entrance: anchor,
        hideMs: Math.round(hide.ms),
        showMs: Math.round(show.ms),
        seatErrorsDevicePx: seatErrors.map((e) => +e.toFixed(2)),
        ringsBefore,
        ringsInside,
        inside: inside.map((d) => ({ id: d.id, x: d.x, y: d.y, pose: d.pose })),
      };
      // 0.3s / 0.5s，允许一帧左右与采样误差。
      assert.ok(hide.ms >= 230 && hide.ms <= 420, `hide ${hide.ms}`);
      assert.ok(show.ms >= 430 && show.ms <= 620, `show ${show.ms}`);
    }
    report.errors = errors;
    await writeFile(
      `${output}/xianfu-roofhide-report.json`,
      JSON.stringify(report, null, 2) + '\n',
    );
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  return report;
}
