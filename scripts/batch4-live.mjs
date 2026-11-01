import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = process.argv[2] ?? '/Volumes/Media/immortal-qa/batch4';
const b = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  args: ['--enable-unsafe-swiftshader'],
});
const p = await b.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const result = {
  method:
    'Default 32.8 world px/s; real performance clock; no seek and no walkScale; sim frozen while observing each presentation trip.',
  errors: [],
  samples: [],
};
p.on('pageerror', (e) => result.errors.push(e.message));
const shot = async (name) => p.screenshot({ path: `${out}/shots/${name}.png` });
const sample = async (label) => {
  const s = await p.evaluate(() => ({
    wall: Date.now(),
    motions: window.__worldV4.motionState(),
    poses: window.__mapStats.disciples,
  }));
  result.samples.push({ label, ...s });
  return s;
};
try {
  await p.goto('http://127.0.0.1:4186/?debug=1');
  await p.waitForFunction(() => window.__mapReady, {}, { timeout: 120000 });
  await p.evaluate(() => {
    document.documentElement.style.zoom = '.95';
    window.__xianfu.reset();
    window.__xianfu.freeze(true);
  });
  const base = await p.evaluate(() => JSON.parse(window.__xianfu.export()));
  for (const d of base.world.disciples) {
    await p.evaluate((id) => {
      window.__ui.closeAll();
      window.__ui.openCard(id);
    }, d.id);
    assert.ok(
      (await p.locator('#disciple-card').innerText()).includes(
        base.lifeLines[d.id],
      ),
    );
    await shot(`人生线-浮动弟子卡-${d.name}`);
  }
  await p.evaluate(() => window.__ui.closeAll());
  const f = structuredClone(base);
  f.world.tick = 1;
  f.world.buildings.push({
    ...f.world.buildings[0],
    id: 'B_ALCHEMY',
    name: '炼丹房',
    level: 1,
  });
  Object.assign(f.world.disciples[3].state, {
    behavior: '做工',
    location: '炼丹房',
    stepsLeft: 4,
  });
  await p.evaluate((f) => {
    window.__xianfu.previewSave(f);
    window.__camera.set({ x: 3544, y: 1416, zoom: 1 });
  }, f);
  const start = await sample('alchemy-start');
  const motion = start.motions.find((m) => m.id === 'd3');
  assert.ok(motion.transfer);
  const startWall = Date.now();
  console.log('real alchemy duration', motion.duration);
  while (Date.now() - startWall < motion.duration + 250)
    await p.waitForTimeout(100);
  const fading = await sample('alchemy-bridge-fade');
  await shot('实时时钟-炼丹桥口渐隐');
  await p.evaluate(() => {
    const q = window.__worldV4.spots.find((s) => s.id === 'E_ALCH_FRONT').point;
    window.__camera.set({ x: q[0], y: q[1], zoom: 1 });
  });
  await p.waitForTimeout(1300);
  const arrived = await sample('alchemy-arrived');
  await shot('实时时钟-炼丹炉前到达');
  const actor = arrived.poses.find((d) => d.id === 'd3');
  assert.ok(
    Math.hypot(
      actor.x - motion.transfer.target[0],
      actor.y - motion.transfer.target[1],
    ) < 0.1,
  );
  assert.equal(actor.alpha, 1);
  result.alchemyWallMs = Date.now() - startWall;
  result.bridgeFadeAlpha = fading.poses.find((d) => d.id === 'd3').alpha;
  await p.evaluate((f) => {
    window.__xianfu.previewSave(f);
    window.__motionDebug.place(
      'd0',
      window.__worldV4.uv(30.262, 7.761),
      'talk',
    );
    window.__camera.set({ x: 1200, y: 1530, zoom: 1 });
  }, base);
  const route = await p.evaluate(() => window.__worldV4.expedition('d0'));
  const outWall = Date.now();
  await shot('实时时钟-出征门楼');
  await p.waitForTimeout(route.duration * 0.45);
  await sample('expedition-bridge');
  await shot('实时时钟-出征南桥');
  while (Date.now() - outWall < route.duration + 350)
    await p.waitForTimeout(50);
  await sample('expedition-fade');
  await shot('实时时钟-出征南台渐隐');
  await p.waitForTimeout(600);
  assert.equal(
    await p.evaluate(
      () => window.__mapStats.disciples.find((d) => d.id === 'd0')?.alpha ?? 0,
    ),
    0,
  );
  await p.evaluate(() => window.__worldV4.expedition('d0', 'in'));
  await p.waitForTimeout(400);
  const back = await sample('return-fade');
  await shot('实时时钟-归来同点渐显');
  const incoming = back.poses.find((d) => d.id === 'd0');
  assert.ok(incoming.alpha > 0 && incoming.alpha < 1);
  const fade = route.path.at(-1);
  assert.ok(Math.hypot(incoming.x - fade[0], incoming.y - fade[1]) < 0.1);
  result.expeditionWallMs = Date.now() - outWall;
  assert.deepEqual(result.errors, []);
  result.pass = true;
} catch (e) {
  result.failure = e.stack;
  process.exitCode = 1;
  console.error(e);
} finally {
  await writeFile(
    `${out}/evidence/live-clock.json`,
    JSON.stringify(result, null, 2),
  );
  await b.close();
}
