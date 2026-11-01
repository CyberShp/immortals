import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = process.argv[2] ?? '/Volumes/Media/immortal-qa/batch4';
await mkdir(`${out}/shots/round2`, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  args: ['--enable-unsafe-swiftshader'],
});
const report = {
  method:
    '有头系统Chrome，DPR2，zoom .95，定向表现层夹具；seek截图单列，原地渐隐使用真实时钟',
  errors: [],
  shots: [],
  checks: [],
};
const p = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
p.on('pageerror', (e) => report.errors.push(e.message));
const shot = async (name) => {
  await p.screenshot({ path: `${out}/shots/round2/${name}.png` });
  report.shots.push(name);
};
const sample = async (name) => {
  const r = await p.evaluate(() => ({
    motions: window.__worldV4.motionState(),
    actors: window.__mapStats.disciples,
    assignments: window.__worldV4.assignments?.(),
  }));
  report.checks.push({ name, ...r });
  return r;
};
const camera = async (point, zoom = 1.4) => {
  await p.evaluate(
    ({ point, zoom }) =>
      window.__camera.set({ x: point[0], y: point[1], zoom }),
    { point, zoom },
  );
  await p.waitForTimeout(100);
};
const place = async (id, point) =>
  p.evaluate(({ id, point }) => window.__motionDebug.place(id, point, 'talk'), {
    id,
    point,
  });
const open = async (port) => {
  await p.goto(`http://127.0.0.1:${port}/?world=v4&debug=1`);
  await p.waitForFunction(
    () => window.__mapReady && window.__worldV4,
    {},
    { timeout: 120000 },
  );
  await p.evaluate(() => {
    document.documentElement.style.zoom = '.95';
    window.__xianfu.reset();
    window.__xianfu.freeze(true);
  });
};
try {
  // Same actor and camera, before and after; the 944b0bf build has the identical forced post depth.
  for (const [phase, port] of [
    ['before', 4187],
    ['after', 4186],
  ]) {
    await open(port);
    for (const [label, coord] of [
      ['渐隐口', [43.76, -4.3]],
      ['前方', [43.9, -4]],
      ['后方', [44.2, -4.6]],
      ['高柱前', [44.55, -4.7]],
    ]) {
      const point = await p.evaluate((q) => window.__worldV4.uv(...q), coord);
      await place('d0', point);
      await camera(point, 2);
      await shot(`东桥口柱-${phase}-${label}`);
      await sample(`post-${phase}-${label}`);
    }
  }
  const base = await p.evaluate(() => JSON.parse(window.__xianfu.export()));
  const fixture = async () => {
    await p.evaluate((s) => window.__xianfu.previewSave(s), base);
    await p.waitForTimeout(50);
  };
  await fixture();
  const g = await p.evaluate(() => ({
    muster: window.__worldV4.muster,
    spots: window.__worldV4.spots,
    seats: window.__worldV4.arenaSeats,
  }));
  assert.equal(g.muster.length, 6);
  const distances = g.muster.map((a, i) => {
    const b = g.muster[(i + 1) % 6];
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  });
  assert.ok(Math.min(...distances) >= 45.92);
  for (let i = 0; i < 6; i++) await place(`d${i}`, g.muster[i]);
  await camera(g.spots.find((s) => s.id === 'S_MUSTER').point, 1.5);
  await p.evaluate(
    ({ points, distances }) => {
      const c = window.__camera.get(),
        canvas = document.querySelector('canvas'),
        r = canvas.getBoundingClientRect(),
        ratio = r.width / canvas.clientWidth;
      const box = document.createElement('div');
      box.id = 'round2-labels';
      box.style.cssText =
        'position:fixed;inset:0;pointer-events:none;z-index:99999';
      const label = (point, text) => {
        const e = document.createElement('div');
        e.textContent = text;
        e.style.cssText = `position:absolute;left:${(r.x + (r.width / 2 + (point[0] - c.x) * c.zoom) * ratio) / 0.95}px;top:${(r.y + (r.height / 2 + (point[1] - c.y) * c.zoom) * ratio) / 0.95}px;background:#102529df;color:white;font:14px monospace`;
        box.append(e);
      };
      points.forEach((a, i) => {
        const b = points[(i + 1) % 6];
        label(a, `席${i + 1}`);
        label(
          [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          `${distances[i].toFixed(2)}px`,
        );
      });
      document.body.append(box);
    },
    { points: g.muster, distances },
  );
  await shot('S_MUSTER-六席-相邻距离标注');
  await p.evaluate(() => document.querySelector('#round2-labels').remove());
  report.checks.push({
    name: 'muster',
    distances,
    min: Math.min(...distances),
  });
  // Seven departures through draw(), not a hand-painted alpha. The seventh stays at its actual main-platform origin.
  await fixture();
  await p.evaluate(() => window.__coolHall.inject(7));
  const ids = await p.evaluate(() =>
    window.__worldV4.motionState().map((m) => m.id),
  );
  const origins = await p.evaluate(() => window.__worldV4.arenaSeats);
  for (let i = 0; i < ids.length; i++) await place(ids[i], origins[i % 3]);
  await p.evaluate((ids) => window.__worldV4.awayFixture(ids, true), ids);
  const departure = await sample('seven-away-start');
  assert.equal(departure.assignments.length, 0);
  const seventh = departure.motions.find((m) => m.id === ids[6]);
  assert.deepEqual(seventh.path, [origins[0], origins[0]]);
  // Advance the other six to their fade to avoid unrelated overlapping origins in the screenshot.
  for (const m of departure.motions.slice(0, 6))
    await p.evaluate(
      ({ id, duration }) => window.__worldV4.seek(id, duration + 1000),
      m,
    );
  await p.evaluate((id) => window.__worldV4.seek(id, 400), ids[6]);
  await camera(origins[0], 1.5);
  await shot('第七人-当前位置渐隐');
  const seventhSample = await sample('seventh-fading');
  assert.ok(seventhSample.actors.find((d) => d.id === ids[6]).alpha > 0);
  for (const m of departure.motions)
    await p.evaluate(
      ({ id, duration }) => window.__worldV4.seek(id, duration + 1000),
      m,
    );
  const away = await sample('away-hidden');
  assert.equal(away.actors.length, 0);
  assert.equal(away.assignments.length, 0);
  // Real-clock fade out/in at both satellite-platform origins.
  for (const [label, id] of [
    ['南台', 'S_SWORD_1'],
    ['东台', 'E_ALCH_FRONT'],
  ]) {
    await fixture();
    const origin = g.spots.find((s) => s.id === id).point;
    await place('d0', origin);
    await camera(origin, 1.6);
    await p.evaluate(() => window.__worldV4.awayFixture(['d0'], true));
    await p.waitForTimeout(300);
    const fading = await sample(`${label}-out`);
    const actor = fading.actors.find((d) => d.id === 'd0');
    assert.ok(actor.alpha > 0 && actor.alpha < 1);
    assert.ok(Math.hypot(actor.x - origin[0], actor.y - origin[1]) < 0.01);
    await shot(`${label}-原地渐隐`);
    await p.waitForTimeout(600);
    assert.ok(
      !(await sample(`${label}-away`)).actors.some((d) => d.id === 'd0'),
    );
    await p.evaluate(() => window.__worldV4.awayFixture(['d0'], false));
    await p.waitForTimeout(300);
    const incoming = (await sample(`${label}-in`)).actors.find(
      (d) => d.id === 'd0',
    );
    assert.ok(incoming.alpha > 0 && incoming.alpha < 1);
    assert.ok(
      Math.hypot(incoming.x - origin[0], incoming.y - origin[1]) < 0.01,
    );
    await shot(`${label}-原点渐显`);
  }
  // Return collision: put a visible actor on the saved origin, verify delayed alpha, then release.
  await fixture();
  const origin = g.spots.find((s) => s.id === 'S_SWORD_1').point;
  await place('d0', origin);
  await p.evaluate(() => window.__worldV4.awayFixture(['d0'], true));
  await p.waitForTimeout(850);
  await place('d1', origin);
  await p.evaluate(() => window.__worldV4.awayFixture(['d0'], false));
  await p.waitForTimeout(200);
  const blocked = await sample('return-occupied');
  assert.equal(blocked.actors.find((d) => d.id === 'd0').alpha, 0);
  assert.equal(blocked.motions.find((d) => d.id === 'd0').returnWaiting, true);
  await place('d1', g.seats[0]);
  await p.waitForTimeout(300);
  const released = await sample('return-released');
  assert.ok(released.actors.find((d) => d.id === 'd0').alpha > 0);
  await camera(origin);
  await shot('归来-占位释放后同点渐显');
  // Two transparent returners must not deadlock by reserving each other as visible occupants.
  await fixture();
  await place('d0', origin);
  await place('d1', origin);
  await p.evaluate(() => window.__worldV4.awayFixture(['d0', 'd1'], true));
  await p.waitForTimeout(850);
  await p.evaluate(() => window.__worldV4.awayFixture(['d0', 'd1'], false));
  await p.waitForTimeout(300);
  const pair = await sample('two-returners-same-origin');
  assert.ok(pair.actors.find((d) => d.id === 'd0').alpha > 0);
  assert.equal(pair.actors.find((d) => d.id === 'd1').alpha, 0);
  assert.equal(pair.motions.find((d) => d.id === 'd1').returnWaiting, true);
  await place('d0', g.seats[0]);
  await p.waitForTimeout(300);
  assert.ok(
    (await sample('second-returner-released')).actors.find((d) => d.id === 'd1')
      .alpha > 0,
  );
  // Main route: deterministic phase samples, preserving gate -> bridge -> south landing and reverse route.
  await fixture();
  const gate = await p.evaluate(() => window.__worldV4.uv(30.262, 7.761));
  await place('d0', gate);
  const route = await p.evaluate(() => window.__worldV4.expedition('d0'));
  for (const [name, t] of [
    ['门楼', 0],
    ['南桥', 0.5],
    ['南台渐隐', 1],
  ]) {
    await p.evaluate(
      (ms) => window.__worldV4.seek('d0', ms),
      route.duration * t + (t === 1 ? 350 : 0),
    );
    const state = await sample(`main-${name}`);
    const m = state.motions.find((d) => d.id === 'd0');
    await camera([m.x, m.y]);
    await shot(`主台出征-${name}`);
  }
  await p.evaluate(
    (ms) => window.__worldV4.seek('d0', ms),
    route.duration + 1000,
  );
  const back = await p.evaluate(() => window.__worldV4.expedition('d0', 'in'));
  await p.waitForTimeout(300);
  const returned = (await sample('main-return')).actors.find(
    (d) => d.id === 'd0',
  );
  assert.ok(returned.alpha > 0 && returned.alpha < 1);
  assert.ok(
    Math.hypot(
      returned.x - route.path.at(-1)[0],
      returned.y - route.path.at(-1)[1],
    ) < 0.01,
  );
  assert.ok(back.path.length > 2);
  await shot('主台归来-南台原退场点渐显');
  await fixture();
  for (let i = 0; i < 3; i++) await place(`d${i}`, g.seats[i]);
  await camera(g.seats[1]);
  await shot('B8-v15-三座位');
  const alchemy = g.spots.find((s) => s.id === 'E_ALCH_FRONT').point;
  await place('d3', alchemy);
  await camera(alchemy);
  await shot('炼丹-v15-炉前与标签锚点');
  report.adaptations = await p.evaluate(
    () => window.__worldV4.adaptationReports,
  );
  assert.deepEqual(report.errors, []);
  report.pass = true;
} catch (e) {
  report.failure = e.stack;
  process.exitCode = 1;
  console.error(e);
} finally {
  await writeFile(
    `${out}/evidence/round2/browser-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
