import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
export function summarizeWalk(frames) {
  const facing = frames.filter(
    (f) => Math.abs(f.vx ?? 0) > 0.5 && f.facing != null,
  );
  const ratios = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1],
      b = frames[i];
    const distance = Math.hypot(b.x - a.x, b.y - a.y),
      cycles = b.cycles - a.cycles;
    if (
      a.cycles != null &&
      b.cycles != null &&
      distance > 0.1 &&
      cycles >= 0 &&
      Math.hypot(a.vx ?? 0, a.vy ?? 0) > 0.5 &&
      Math.hypot(b.vx ?? 0, b.vy ?? 0) > 0.5 &&
      (a.vx ?? 0) * (b.vx ?? 0) + (a.vy ?? 0) * (b.vy ?? 0) > 0
    )
      ratios.push(cycles / distance);
  }
  const mean = ratios.length
    ? ratios.reduce((a, b) => a + b) / ratios.length
    : null;
  return {
    facingSamples: facing.length,
    facingAgreement: facing.length
      ? facing.filter((f) => f.facing === Math.sign(f.vx)).length /
        facing.length
      : null,
    phaseSamples: ratios.length,
    cyclesPerPixel: mean,
    phaseRatioCV: mean
      ? Math.sqrt(
          ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / ratios.length,
        ) / mean
      : null,
  };
}
export async function verifyWalk(browser, base, cleanScreenshot) {
  const tag =
    process.argv.find((a) => a.startsWith('--walk-tag='))?.split('=')[1] ??
    'after';
  assert.ok(['before', 'after'].includes(tag), '--walk-tag=before|after');
  const root =
    process.env.WALK_SCREENSHOT_DIR ?? '/Volumes/Media/GrokBot/workspace';
  const dir = `${root}/walk-frames/${tag}`;
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 640, height: 450 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  try {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const url = new URL(base);
    url.searchParams.set('debug', '1');
    url.searchParams.delete('discipleHeight');
    await page.goto(url.href);
    await page.waitForFunction(() => window.__mapReady && window.__xianfu);
    await page.evaluate(() => {
      window.__xianfu.freeze(true);
      window.__xianfu.reset();
      window.__camera.set({ x: 1560, y: 1040, zoom: 0.95 });
    });
    const id = await page.evaluate(() => window.__mapStats.disciples[0].id);
    const modern = await page.evaluate(() => !!window.__motionDebug?.route);
    if (tag === 'after')
      assert.ok(modern, 'after capture requires measured motion hooks');
    const trip = await page.evaluate(
      ({ id, modern }) =>
        modern
          ? window.__motionDebug.route(id, [1530, 1040], [1590, 1040])
          : window.__xianfu.walkDormToHall(id),
      { id, modern },
    );
    if (!modern) await page.evaluate((id) => window.__camera.follow(id), id);
    // Reuse modal dismissal/assertion before taking frame clips.
    await cleanScreenshot(
      page,
      `${dir}/setup.png`,
      undefined,
      undefined,
      'device',
    );
    if (modern)
      await page.evaluate(
        (id) => window.__motionDebug.route(id, [1530, 1040], [1590, 1040]),
        id,
      );
    if (!modern)
      await page.evaluate((id) => window.__xianfu.walkDormToHall(id), id);
    const mapBox = await page.locator('#map canvas').boundingBox();
    const start = Date.now(),
      frames = [];
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(Math.max(0, start + i * 100 - Date.now()));
      if (i === 30 && modern)
        await page.evaluate(
          (id) => window.__motionDebug.route(id, [1590, 1040], [1530, 1040]),
          id,
        );
      const sample = await page.evaluate((id) => {
        const d = window.__mapStats.disciples.find((d) => d.id === id);
        return { ...d, time: performance.now(), camera: window.__camera.get() };
      }, id);
      const previous = frames.at(-1),
        dt = previous ? (sample.time - previous.time) / 1000 : 0;
      const vx = sample.vx ?? (dt ? (sample.x - previous.x) / dt : 0),
        vy = sample.vy ?? (dt ? (sample.y - previous.y) / dt : 0);
      const filename = `${String(i).padStart(3, '0')}.png`;
      const clip = {
        x: Math.max(0, Math.min(512, sample.screenX + mapBox.x - 64)),
        y: Math.max(0, Math.min(290, sample.screenY + mapBox.y - 120)),
        width: 128,
        height: 160,
      };
      await page.screenshot({
        path: `${dir}/${filename}`,
        clip,
        scale: 'device',
      });
      frames.push({
        index: i,
        file: filename,
        time: sample.time,
        x: sample.x,
        y: sample.y,
        vx,
        vy,
        facing: sample.facing ?? null,
        flip: sample.flip ?? null,
        pose: sample.pose ?? null,
        frame:
          sample.pose === 'walk-step'
            ? 0
            : sample.pose === 'walk-pass'
              ? 1
              : null,
        phase: sample.phase ?? null,
        cycles: sample.cycles ?? null,
        stride: sample.stride ?? null,
      });
    }
    await page.waitForTimeout(Math.max(0, start + 6000 - Date.now()));
    const summary = summarizeWalk(frames);
    const report = {
      tag,
      modern,
      durationMs: Date.now() - start,
      trip,
      limitations: modern
        ? []
        : [
            'Legacy build has no arbitrary route/facing/phase hook: records existing dorm-to-hall route; unavailable telemetry is null, not inferred.',
          ],
      frames,
      summary,
      errors,
    };
    await writeFile(
      `${dir}/motion.json`,
      JSON.stringify(report, null, 2) + '\n',
    );
    assert.deepEqual(errors, []);
    if (modern) {
      assert.ok(
        frames.some((f) => f.vx > 0.5) && frames.some((f) => f.vx < -0.5),
      );
      assert.equal(summary.facingAgreement, 1);
      assert.ok(
        summary.phaseSamples >= 20,
        'insufficient moving phase samples',
      );
      assert.ok(
        Math.abs(
          summary.cyclesPerPixel - 1 / frames.find((f) => f.stride)?.stride,
        ) < 0.001,
        'phase/distance must match configured stride',
      );
      assert.ok(summary.phaseRatioCV < 0.1, JSON.stringify(summary));
    }
    console.log({ dir, summary, limitations: report.limitations });
  } finally {
    await context.close();
  }
}

// Open grass north of the plaza, >200 world px from every spawned disciple
// and building, so the follow clips contain only the walker.
export const WALK_CENTRE = [1600, 780];
export const WALK_DIRECTIONS = [
  { id: 'left', from: [1630, 780], to: [1570, 780], axis: 0, sign: -1 },
  { id: 'right', from: [1570, 780], to: [1630, 780], axis: 0, sign: 1 },
  { id: 'up', from: [1600, 810], to: [1600, 750], axis: 1, sign: -1 },
  { id: 'down', from: [1600, 750], to: [1600, 810], axis: 1, sign: 1 },
];
export function straightDirection(path, direction) {
  return (
    path.length >= 2 &&
    path.every(
      (p) =>
        Math.abs(p[1 - direction.axis] - direction.from[1 - direction.axis]) <
        1e-6,
    ) &&
    path
      .slice(1)
      .every(
        (p, i) =>
          (p[direction.axis] - path[i][direction.axis]) * direction.sign > 0,
      )
  );
}
export async function verifyWalkDirections(browser, base, cleanScreenshot) {
  const tag =
    process.argv.find((a) => a.startsWith('--walk-tag='))?.split('=')[1] ??
    'after';
  assert.ok(['before', 'after'].includes(tag));
  const root =
      process.env.WALK_SCREENSHOT_DIR ?? '/Volumes/Media/GrokBot/workspace',
    dir = `${root}/walk-frames/${tag}`;
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 640, height: 450 },
    deviceScaleFactor: 2,
  });
  let fallback = false;
  try {
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const url = new URL(base);
    url.searchParams.set('debug', '1');
    url.searchParams.delete('discipleHeight');
    await page.goto(url.href);
    await page.waitForFunction(() => window.__mapReady && window.__xianfu);
    const modern = await page.evaluate(() => !!window.__motionDebug?.route);
    // Before builds may carry the QA-only __legacyRoute hook (route setter only,
    // old facing/animation untouched); see docs/RENDER-BUGFIXES.md.
    const legacyRoute =
      !modern && (await page.evaluate(() => !!window.__legacyRoute));
    if (!modern && !legacyRoute) {
      assert.equal(tag, 'before', 'after requires four-direction route hook');
      const reason =
        'e704264 world() returns a clone; walkDormToHall and gate walk are fixed routes. No supported arbitrary-target setter. Four directions unavailable; fallback motion.json records only dorm-to-hall.';
      await writeFile(
        `${dir}/directions.json`,
        JSON.stringify(
          {
            tag,
            supported: false,
            reason,
            directions: [],
            fallback: 'motion.json',
          },
          null,
          2,
        ) + '\n',
      );
      console.log(reason);
      fallback = true;
    } else {
      await page.evaluate((c) => {
        window.__xianfu.freeze(true);
        window.__xianfu.reset();
        window.__camera.set({ x: c[0], y: c[1], zoom: 0.95 });
      }, WALK_CENTRE);
      await cleanScreenshot(
        page,
        `${dir}/dirs-setup.png`,
        undefined,
        undefined,
        'device',
      );
      const id = await page.evaluate(() => window.__mapStats.disciples[0].id),
        box = await page.locator('#map canvas').boundingBox();
      const directions = [];
      for (const direction of WALK_DIRECTIONS) {
        await mkdir(`${dir}/dirs/${direction.id}`, { recursive: true });
        const trip = await page.evaluate(
          ({ id, d, legacy }) =>
            legacy
              ? window.__legacyRoute(id, d.from, d.to)
              : window.__motionDebug.route(id, d.from, d.to),
          { id, d: direction, legacy: legacyRoute },
        );
        assert.ok(
          straightDirection(trip.path, direction),
          JSON.stringify({ direction, trip }),
        );
        assert.ok(
          Math.abs(trip.duration - 3000) < 1,
          'default speed must take 3 seconds for 60 world px',
        );
        if (legacyRoute)
          // The legacy hook schedules (rather than forces) the next paint.
          await page.evaluate(
            () =>
              new Promise((r) =>
                requestAnimationFrame(() => requestAnimationFrame(r)),
              ),
          );
        const start = Date.now(),
          frames = [];
        for (let i = 0; i < 30; i++) {
          await page.waitForTimeout(Math.max(0, start + i * 100 - Date.now()));
          const s = await page.evaluate(
            (id) => ({
              ...window.__mapStats.disciples.find((d) => d.id === id),
              time: performance.now(),
            }),
            id,
          );
          const file = `dirs/${direction.id}/${String(i).padStart(3, '0')}.png`;
          await page.screenshot({
            path: `${dir}/${file}`,
            scale: 'device',
            clip: {
              x: Math.max(0, Math.min(512, s.screenX + box.x - 64)),
              y: Math.max(0, Math.min(290, s.screenY + box.y - 120)),
              width: 128,
              height: 160,
            },
          });
          const prev = frames.at(-1),
            dt = prev ? (s.time - prev.time) / 1000 : 0;
          if (s.vx == null) {
            // Legacy telemetry has no velocity/facing: derive from positions.
            s.vx = dt ? (s.x - prev.x) / dt : 0;
            s.vy = dt ? (s.y - prev.y) / dt : 0;
          }
          frames.push({
            ...s,
            index: i,
            file,
            frame:
              s.pose === 'walk-step' ? 0 : s.pose === 'walk-pass' ? 1 : null,
          });
        }
        await page.waitForTimeout(Math.max(0, start + 3000 - Date.now()));
        if (legacyRoute) {
          // Old renderer: record only, no fixed-behaviour assertions.
          directions.push({
            ...direction,
            trip,
            frames,
            durationMs: Date.now() - start,
          });
          continue;
        }
        const moving = frames.filter((f) => Math.hypot(f.vx, f.vy) > 0.5);
        assert.ok(
          moving.length >= 20,
          `${direction.id}: too few moving samples`,
        );
        for (const f of moving) {
          assert.ok((direction.axis ? f.vy : f.vx) * direction.sign > 0);
          assert.ok(Math.abs(direction.axis ? f.vx : f.vy) < 0.01);
        }
        if (direction.axis === 1)
          assert.equal(
            new Set(moving.map((f) => f.facing)).size,
            1,
            'vertical movement must preserve horizontal facing',
          );
        const summary = summarizeWalk(frames);
        await writeFile(
          `${dir}/dirs/${direction.id}/frames.json`,
          JSON.stringify({ trip, frames, summary }, null, 2) + '\n',
        );
        assert.ok(summary.phaseSamples >= 20, JSON.stringify(summary));
        assert.ok(summary.phaseRatioCV < 0.1);
        assert.ok(
          Math.abs(summary.cyclesPerPixel - 1 / moving[0].stride) < 0.001,
        );
        if (direction.axis === 0) assert.equal(summary.facingAgreement, 1);
        directions.push({
          ...direction,
          trip,
          frames,
          summary,
          durationMs: Date.now() - start,
        });
      }
      await writeFile(
        `${dir}/directions.json`,
        JSON.stringify(
          {
            tag,
            supported: true,
            hook: legacyRoute ? '__legacyRoute (QA-only)' : '__motionDebug',
            directions,
            errors,
          },
          null,
          2,
        ) + '\n',
      );
      assert.deepEqual(errors, []);
    }
  } finally {
    await context.close();
  }
  if (fallback) await verifyWalk(browser, base, cleanScreenshot);
}
