import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = process.argv[2] ?? '/Volumes/Media/immortal-qa/batch4';
await mkdir(`${out}/shots`, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  args: ['--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  acceptDownloads: true,
});
const page = await context.newPage();
const report = {
  method:
    'headed system Chrome, playwright-core, DPR2, CSS zoom .95, vite preview. Directed valid save fixtures use __xianfu.previewSave; position overlays are marked. Natural simulation checked separately.',
  errors: [],
  checks: [],
  shots: [],
};
page.on('pageerror', (e) => report.errors.push(e.message));
const check = (name, data) => {
  report.checks.push({ name, ...data });
  console.log(name, JSON.stringify(data).slice(0, 500));
};
async function shot(name, p = page) {
  await p.screenshot({ path: `${out}/shots/${name}.png` });
  report.shots.push(name + '.png');
}
async function ready() {
  await page.waitForFunction(
    () => window.__mapReady && window.__xianfu && window.__worldV4,
    {},
    { timeout: 120000 },
  );
  await page.evaluate(() => {
    document.documentElement.style.zoom = '.95';
    window.__xianfu.freeze(true);
  });
}
async function close() {
  await page.evaluate(() => {
    const d = document.querySelector('#modal');
    if (d.open) d.close();
  });
}
async function camera(point, zoom = 1) {
  await page.evaluate(
    ({ point, zoom }) =>
      window.__camera.set({ x: point[0], y: point[1], zoom }),
    { point, zoom },
  );
  await page.waitForTimeout(150);
}
async function fixture(save) {
  await close();
  await page.evaluate((save) => window.__xianfu.previewSave(save), save);
  await page.waitForTimeout(100);
}
async function settle() {
  await page.evaluate(() => {
    for (const m of window.__worldV4.motionState())
      window.__worldV4.seek(m.id, m.duration + 2000);
  });
}
try {
  await page.goto('http://127.0.0.1:4186/?debug=1');
  await ready();
  const base = await page.evaluate(() => JSON.parse(window.__xianfu.export()));
  const geometry = await page.evaluate(() => ({
    spots: window.__worldV4.spots,
    stages: window.__worldV4.stages,
    sub: window.__worldV4.subpositions,
    muster: window.__worldV4.muster,
    ring: window.__worldV4.ringPair,
  }));
  check('geometry', {
    spots: geometry.spots.length,
    stages: geometry.stages.length,
    muster: geometry.muster.length,
  });
  // Overview labels annotate the actual rendered scene, never replace it.
  await camera([2498, 1160], 0.3);
  await page.evaluate(({ spots, stages }) => {
    const c = window.__camera.get(),
      rect = document.querySelector('canvas').getBoundingClientRect();
    const layer = document.createElement('div');
    layer.id = 'batch4-labels';
    layer.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:9999';
    for (const s of [...spots, ...stages]) {
      const e = document.createElement('div');
      e.textContent = s.id;
      e.style.cssText = `position:absolute;left:${(rect.x + rect.width / 2 + (s.point[0] - c.x) * c.zoom) / 0.95}px;top:${(rect.y + rect.height / 2 + (s.point[1] - c.y) * c.zoom) / 0.95}px;background:#102529df;color:#fff;font:12px monospace;padding:2px;border-left:3px solid #f0c35d`;
      layer.append(e);
    }
    document.body.append(layer);
  }, geometry);
  await shot('01-spots-标注总览');
  await page.locator('#batch4-labels').evaluate((e) => e.remove());
  // Fixed disciple cards through the ordinary roster UI.
  for (const d of base.world.disciples) {
    await close();
    await page.locator('#roster-open').click();
    await page.locator(`[data-detail="${d.id}"]`).click();
    assert.ok(
      (await page.locator('#modal-body').innerText()).includes(
        base.lifeLines[d.id],
      ),
    );
    await shot(`人生线-弟子卡-${d.name}`);
  }
  await close();
  const legacy = structuredClone(base);
  legacy.world.disciples.forEach((d) => {
    d.stage = '坐化';
    d.remainingSeasons = 0;
  });
  await fixture(legacy);
  await page.locator('#legacy-open').click();
  for (const text of Object.values(base.lifeLines))
    assert.ok((await page.locator('#modal-body').innerText()).includes(text));
  await shot('人生线-传承录-六名固定弟子');
  for (const d of base.world.disciples) {
    const save = structuredClone(base);
    save.world.flags.storyReport = true;
    save.world.disciples.forEach((x) => {
      x.realm.major = x.id === d.id ? '筑基' : '炼气';
    });
    await fixture(save);
    assert.ok(
      (await page.locator('#modal-body').innerText()).includes(
        base.lifeLines[d.id],
      ),
    );
    await shot(`人生线-回顾-${d.name}`);
  }
  check('fixed-lifeLines', { matched: 6, cards: 6, legacy: 6, stories: 6 });
  // Actual simulation recruits: no constructed recruit name or text.
  await fixture(base);
  let recruited;
  for (let i = 0; i < 12 && !recruited; i++) {
    await page.evaluate(() => window.__xianfu.advance(30));
    recruited = await page.evaluate(() =>
      window.__xianfu
        .world()
        .disciples.find(
          (d) => !['d0', 'd1', 'd2', 'd3', 'd4', 'd5'].includes(d.id),
        ),
    );
  }
  assert.ok(recruited, 'natural sim recruit');
  const recruitedSave = await page.evaluate(() =>
    JSON.parse(window.__xianfu.export()),
  );
  await close();
  await page.locator('#roster-open').click();
  await page.locator(`[data-detail="${recruited.id}"]`).click();
  assert.ok(
    (await page.locator('#modal-body').innerText()).includes(
      recruitedSave.lifeLines[recruited.id],
    ),
  );
  await shot('人生线-自然招新弟子');
  check('natural-recruit', {
    id: recruited.id,
    name: recruited.name,
    line: recruitedSave.lifeLines[recruited.id],
    tick: recruitedSave.world.tick,
  });
  // Work fixture uses sim's existing alchemy state and ordinary planner, then samples its real route clock.
  const work = structuredClone(base);
  work.world.tick = 1;
  work.world.buildings.push({
    ...work.world.buildings[0],
    id: 'B_ALCHEMY',
    name: '炼丹房',
    level: 1,
  });
  const alchemist = work.world.disciples[3];
  alchemist.state.behavior = '做工';
  alchemist.state.location = '炼丹房';
  alchemist.state.stepsLeft = 4;
  await fixture(work);
  const assignment = await page.evaluate(() =>
    window.__worldV4.assignments().find((a) => a.id === 'd3'),
  );
  assert.equal(assignment.spot.id, 'E_ALCH_FRONT');
  const motion = await page.evaluate(() =>
    window.__worldV4.motionState().find((m) => m.id === 'd3'),
  );
  assert.ok(motion.transfer, 'long work trip uses bridge fade');
  check('alchemy-route', motion);
  await page.evaluate(({ id, ms }) => window.__worldV4.seek(id, ms), {
    id: 'd3',
    ms: motion.duration + 400,
  });
  await camera(motion.path.at(-1), 1);
  await shot('东台炼丹-桥口渐隐');
  await page.evaluate(({ id, ms }) => window.__worldV4.seek(id, ms), {
    id: 'd3',
    ms: motion.duration + 1200,
  });
  await camera(assignment.point, 1);
  await shot('东台炼丹-炉前渐显');
  await page.evaluate(({ id, ms }) => window.__worldV4.seek(id, ms), {
    id: 'd3',
    ms: motion.duration + 2000,
  });
  await shot('02-东台炉前炼丹-B_ALCHEMY标签');
  assert.ok(
    (await page.evaluate(
      () => window.__mapStats.disciples.find((d) => d.id === 'd3').alpha,
    )) > 0.99,
  );
  // Search game seeds for sword assignments, using production planner and unchanged behavior.
  let sword;
  for (let seed = 0; seed < 30 && !sword; seed++) {
    const f = structuredClone(base);
    f.world.rng.seed = seed;
    f.world.tick = 1;
    f.world.disciples.forEach((d) => {
      d.state.stepsLeft = 6;
    });
    await fixture(f);
    sword = await page.evaluate(() =>
      window.__worldV4
        .assignments()
        .find((a) => a.spot?.id.startsWith('S_SWORD')),
    );
  }
  assert.ok(sword);
  await settle();
  await camera(sword.point, 1);
  await shot('03-南台练剑岗位');
  check('sword-assignment', sword);
  // Pending actual EV_A2 definition with validated role bindings; sim event resolution is untouched.
  const duel = structuredClone(base);
  duel.world.tick = 1;
  duel.world.events = [
    {
      id: 'batch4-a2',
      definitionId: 'EV_A2',
      kind: '争执',
      chain: true,
      roles: { A: 'd0', B: 'd1' },
      createdTick: 1,
      hint: '战书比剑',
      text: '陆青崖与沈墨在擂台比剑',
      options: ['切磋'],
      defaultOption: 0,
      choices: [],
      priority: 1,
    },
  ];
  await fixture(duel);
  await settle();
  await camera(geometry.ring[0], 1);
  await shot('04-EV_A2-擂台及观战');
  const poses = await page.evaluate(() =>
    window.__mapStats.disciples.map((d) => ({
      id: d.id,
      x: d.x,
      y: d.y,
      alpha: d.alpha,
    })),
  );
  check('EV_A2', { poses });
  for (const [i, a] of poses.entries())
    for (const b of poses.slice(i + 1))
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 45.92);
  // Geometry stress arrangements explicitly use debug place, for Iris prop/collision inspection.
  await fixture(base);
  await page.evaluate(() => window.__coolHall.inject(6));
  const ids = await page.evaluate(() =>
    window.__worldV4.motionState().map((m) => m.id),
  );
  await page.evaluate(
    ({ ids, points }) =>
      ids.forEach((id, i) => window.__motionDebug.place(id, points[i], 'talk')),
    { ids, points: geometry.muster },
  );
  await camera(geometry.spots.find((s) => s.id === 'S_MUSTER').point, 1);
  await shot('05-S_MUSTER-六席-几何夹具');
  await fixture(base);
  const social = geometry.sub.filter((s) => s.id.includes('SOCIAL'));
  for (const side of ['E', 'S']) {
    const points = social
      .filter((s) => s.id.startsWith(side))
      .flatMap((s) => s.points);
    await page.evaluate(
      (points) =>
        points.forEach((p, i) =>
          window.__motionDebug.place(`d${i}`, p, 'talk'),
        ),
      points,
    );
    await camera(points[0], 1);
    await shot(`${side}-社交容量偏移-几何夹具`);
  }
  const b8 = await page.evaluate(() => window.__worldV4.arenaSeats);
  if (b8) {
    await page.evaluate(
      (points) =>
        points.forEach((p, i) =>
          window.__motionDebug.place(`d${i}`, p, 'meditate'),
        ),
      b8,
    );
    await camera(b8[1], 1);
    await shot('B8-三座位');
  }
  // Same assembly/sermon state machines with outdoor destinations.
  await fixture(base);
  await page.evaluate(() => window.__coolHall.trigger('第4批室外验收'));
  await page.evaluate(() => {
    for (const s of window.__coolHall.state().assembly.seats)
      window.__motionDebug.place(s.id, s.point, 'talk');
  });
  await page.waitForTimeout(1200);
  await camera([2000, 1000], 0.85);
  await shot('召集-主殿前室外');
  const assembly = await page.evaluate(
    () => window.__coolHall.state().assembly,
  );
  assert.ok(assembly.seats.every((s) => s.inside === false));
  check('outdoor-assembly', assembly);
  await fixture(base);
  await page.evaluate(() => window.__coolHall.sermon(3000));
  await page.evaluate(() => {
    for (const s of window.__coolHall.state().sermon.cushions)
      window.__motionDebug.place(s.id, s.point, 'meditate');
  });
  await page.waitForTimeout(1200);
  await camera([2000, 1000], 0.85);
  await shot('讲道-室外蒲团');
  const sermon = await page.evaluate(() => window.__coolHall.state().sermon);
  assert.equal(sermon.cushions.length, 6);
  check('outdoor-sermon', sermon);
  assert.equal(
    await page.evaluate(() => window.__coolHall.view('main')),
    undefined,
  );
  assert.equal(
    await page.evaluate(() => window.__coolHall.state().floor),
    'auto',
  );
  // Expedition actual route, sample deterministic render clock at passage/bridge/fade/return.
  await fixture(base);
  await page.evaluate(() =>
    window.__motionDebug.place(
      'd0',
      window.__worldV4.uv(30.262, 7.761),
      'talk',
    ),
  );
  const route = await page.evaluate(() => window.__worldV4.expedition('d0'));
  check('expedition-route', route);
  for (const [name, t] of [
    ['门楼通路', 0],
    ['南桥', 0.45],
    ['南台', 0.9],
    ['集合渐隐', 1],
  ]) {
    await page.evaluate(
      (ms) => window.__worldV4.seek('d0', ms),
      route.duration * t + (t === 1 ? 400 : 0),
    );
    await camera([1200, 1550], 1);
    await shot(`出征-${name}`);
  }
  await page.evaluate(
    (ms) => window.__worldV4.seek('d0', ms),
    route.duration + 1000,
  );
  assert.equal(
    await page.evaluate(
      () => window.__mapStats.disciples.find((d) => d.id === 'd0')?.alpha ?? 0,
    ),
    0,
  );
  await page.evaluate(() => window.__worldV4.expedition('d0', 'in'));
  await page.evaluate(() => window.__worldV4.seek('d0', 400));
  await shot('归来-同环位渐显');
  // Five desktop idle features using normal controls.
  await fixture(recruitedSave);
  await close();
  await page.keyboard.press('Backquote');
  assert.equal(await page.locator('#cover').isVisible(), true);
  await shot('摸鱼-老板键');
  await page.keyboard.press('Backquote');
  assert.equal(await page.locator('#game').isVisible(), true);
  await page.locator('#settings-open').click();
  await page.locator('#save-open').click();
  const download = page.waitForEvent('download');
  await page.locator('#download').click();
  await (await download).saveAs(`${out}/evidence/browser-export.json`);
  const text = await page.evaluate(() => window.__xianfu.export());
  await page.locator('#save-text').fill(text);
  await page.locator('#import').click();
  await page.waitForTimeout(200);
  assert.deepEqual(
    (await page.evaluate(() => JSON.parse(window.__xianfu.export()))).lifeLines,
    JSON.parse(text).lifeLines,
  );
  await shot('摸鱼-本地存档导入导出');
  check('save-import-export', { lifeLinesUnchanged: true });
  await close();
  await page.locator('#roster-open').click();
  await page.locator(`[data-detail="${recruited.id}"]`).click();
  await close();
  // PiP moves the real root; verify hidden display lines even when detail is reopened.
  await page.locator('#small').click();
  await page.waitForTimeout(1200);
  const pip = context.pages().find((p) => p !== page);
  assert.ok(pip, 'Document PiP or popup created');
  await pip.setViewportSize({ width: 480, height: 320 });
  await pip.locator('#roster-open').click();
  await pip.locator(`[data-detail="${recruited.id}"]`).click();
  assert.equal(await pip.locator('.life-line:visible').count(), 0);
  await shot('摸鱼-小窗无人生线', pip);
  check('pip', { url: pip.url(), hiddenLifeLines: true });
  await pip.close();
  await page.waitForTimeout(300);
  await close();
  await page.evaluate(() => window.__xianfu.setLastSeen(Date.now() - 600000));
  const beforeOffline = await page.evaluate(() => ({
    tick: window.__xianfu.world().tick,
    lines: JSON.parse(window.__xianfu.export()).lifeLines,
  }));
  await page.reload();
  await ready();
  await page.waitForTimeout(250);
  const afterOffline = await page.evaluate(() => ({
    tick: window.__xianfu.world().tick,
    lines: JSON.parse(window.__xianfu.export()).lifeLines,
  }));
  assert.ok(afterOffline.tick > beforeOffline.tick);
  for (const [id, line] of Object.entries(beforeOffline.lines))
    assert.equal(afterOffline.lines[id], line);
  await shot('摸鱼-时间戳离线补算');
  check('offline', {
    before: beforeOffline.tick,
    after: afterOffline.tick,
    lifeLinesUnchanged: true,
  });
  await close();
  await page.setViewportSize({ width: 480, height: 800 });
  await page.waitForTimeout(300);
  const hint = await page.locator('#compact-event').isVisible();
  await shot('摸鱼-低干扰提示');
  check('low-disturbance', {
    compactHintVisible: hint,
    modalOpen: await page.locator('#modal').evaluate((d) => d.open),
  });
  check('runtime-errors', { count: report.errors.length });
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.failure = e.stack;
  console.error(e);
  process.exitCode = 1;
  await shot('failure').catch(() => {});
} finally {
  await writeFile(
    `${out}/evidence/browser-report.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
