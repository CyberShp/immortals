// ?cool=1 冷色单石台骨架冒烟（真实 Chrome，DPR 2，1280×900）。只往指定目录写图，不写 docs/。
// 用法：node scripts/e2e-cool.mjs http://127.0.0.1:5199 /Volumes/Media/immortal-qa/depth
// 校验：默认地址不请求任何 cool/ 素材；?cool=1 不请求旧四岛底图/小地图/山门前景/桥/纵深素材（即使同时带 ?depth=1），
// 无报错、底图已载、弟子都在冷色可走区、弟子会走、能点选弟子；输出 overview/center 两张 2x 截图。
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const out = process.argv[3] ?? '/tmp/cool-shots';
const VW = 1280,
  VH = 900;
const CLASSIC = [
  'assets/map/world.webp',
  'assets/map/world-mini.webp',
  'assets/map/gate-foreground',
  'assets/bridge/',
  'assets/rebuild/depth/',
  'assets/rebuild/roof-fade/',
];
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
async function open(search) {
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await page.goto(`${base}/${search}`);
  await page.waitForFunction(
    () => window.__mapReady && window.__camera && window.__xianfu,
  );
  return { ctx, page, errors, requests };
}
const settle = (page, ms = 400) =>
  page
    .evaluate(
      () =>
        new Promise((r) => {
          let k = 3;
          const t = () => (k-- ? requestAnimationFrame(t) : r());
          t();
        }),
    )
    .then(() => page.waitForTimeout(ms));
async function black(path) {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += 3)
    if (data[i] + data[i + 1] + data[i + 2] < 30) n++;
  return n / (info.width * info.height);
}
const report = {};

// 1) 默认：不加载任何 cool 素材。
{
  const { ctx, page, errors, requests } = await open('?debug=1');
  await settle(page);
  const cool = requests.filter((p) => p.includes('/assets/cool/'));
  report.default = {
    coolRequests: cool,
    hasCoolHook: await page.evaluate(() => '__cool' in window),
    errors,
  };
  assert.deepEqual(cool, [], '默认地址请求了 cool 素材');
  assert.equal(report.default.hasCoolHook, false);
  assert.deepEqual(errors, []);
  await ctx.close();
}

// 2) ?cool=1（同时带 depth=1 验证 cool 优先、纵深默认关）。
{
  const { ctx, page, errors, requests } = await open(
    '?debug=1&cool=1&depth=1&roofFade=1',
  );
  await page.evaluate(() => window.__xianfu.artAllBuilt(1));
  await settle(page);
  const info = await page.evaluate(() => ({
    cool: window.__cool && {
      k: window.__cool.k,
      scale: window.__cool.scale,
      depth: window.__cool.depth,
      roofFade: window.__cool.roofFade,
      background: window.__cool.background,
    },
    depthHook: '__depth' in window,
    stats: {
      baseLoaded: window.__mapStats.baseLoaded,
      fallbacks: window.__mapStats.fallbacks,
      buildingSprites: window.__mapStats.buildingSprites,
      buildingLabels: window.__mapStats.buildingLabels,
      dormToHallSeconds: window.__mapStats.dormToHallSeconds,
    },
    camera: window.__camera.get(),
  }));
  assert.ok(info.cool, '__cool 调试钩子缺失');
  assert.equal(info.cool.depth, false, 'cool 下纵深应默认关闭');
  assert.equal(info.cool.roofFade, false, 'cool 下 roofFade 应默认关闭');
  assert.equal(info.depthHook, false);
  assert.ok(info.stats.baseLoaded && info.stats.fallbacks === 0, '底图未加载');
  assert.equal(info.stats.buildingLabels, 5);
  const classic = requests.filter((p) => CLASSIC.some((c) => p.includes(c)));
  assert.deepEqual(classic, [], `cool 下请求了旧四岛/纵深素材 ${classic}`);
  // 批次一：旧概念占位底图已删除，地面改为 Graphics 色块占位（S1 未验收），不应再请求。
  assert.ok(
    !requests.some((p) => p.includes('/assets/cool/scene_concept_cool_v1')),
    '仍在请求已删除的冷色概念占位底图',
  );
  const onPlatform = () =>
    page.evaluate(() =>
      window.__mapStats.disciples.map((d) => ({
        id: d.id,
        x: d.x,
        y: d.y,
        ok: window.__world.walkable(d.x, d.y),
      })),
    );
  const start = await onPlatform();
  assert.ok(start.length >= 3);
  assert.ok(
    start.every((d) => d.ok),
    `开局有弟子不在冷色可走区 ${JSON.stringify(start)}`,
  );
  // 推进 sim 让弟子换目的地，观察几帧：都在可走区内且确有人在走。
  await page.evaluate(() => window.__xianfu.advance(12));
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    samples.push(await onPlatform());
  }
  const off = samples.flat().filter((d) => !d.ok);
  assert.deepEqual(off, [], '行走中有弟子离开冷色可走区');
  const moved = start.filter((d) => {
    const last = samples.at(-1).find((e) => e.id === d.id);
    return last && Math.hypot(last.x - d.x, last.y - d.y) > 5;
  }).length;
  assert.ok(moved >= 1, '没有弟子在走');
  // 截图前停住 sim（弟子仍按已有路线走），先拍 center 再拍全景。
  await page.evaluate(() => window.__xianfu.freeze(true));
  await page.mouse.move(640, 450);
  await settle(page);
  const shots = {};
  for (const name of ['center', 'overview']) {
    if (name === 'overview') {
      await page.click('button[aria-label="地图全景"]');
      await page.mouse.move(5, 450);
    }
    await settle(page);
    const path = `${out}/xianfu-cool-skeleton-${name}-2x.png`;
    await page.screenshot({ path });
    shots[name] = {
      path,
      black: await black(path),
      camera: await page.evaluate(() => window.__camera.get()),
      walking: await page.evaluate(
        () =>
          window.__mapStats.disciples.filter(
            (d) => Math.hypot(d.vx, d.vy) > 0.01,
          ).length,
      ),
    };
    assert.ok(shots[name].black < 0.01, `${path} 疑似黑屏`);
  }
  // 点选：回到默认镜头，点第一个可见弟子头部，弟子卡出现。
  await page.evaluate(() =>
    window.__camera.set({ zoom: innerWidth / 1440, x: 1650, y: 800 }),
  );
  await settle(page, 1500);
  const target = await page.evaluate(() => {
    const d = window.__mapStats.disciples.find(
      (d) =>
        d.screenX > 60 &&
        d.screenX < innerWidth - 200 &&
        d.screenY > 160 &&
        d.screenY < innerHeight - 60,
    );
    return d && { id: d.id, x: d.screenX, y: d.screenY };
  });
  assert.ok(target, '默认镜头里没有可点的弟子');
  const z = (await page.evaluate(() => window.__camera.get())).zoom;
  await page.mouse.click(target.x, target.y - 30 * z);
  await settle(page);
  const card = await page.locator('#disciple-card').isVisible();
  assert.equal(card, true, '点选弟子后弟子卡未出现');
  // dorm→hall 重测：调试钩子按当前几何走一趟（WALK_SPEED 不变），
  // 并在页面内逐帧等弟子真正走到主殿入口，记录墙钟耗时（measuredSeconds）。
  const walk = await page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const r = window.__xianfu.walkDormToHall(id);
        const tick = () => {
          const d = window.__mapStats.disciples.find((e) => e.id === id);
          const t = (performance.now() - t0) / 1000;
          if (d && Math.hypot(d.x - r.to[0], d.y - r.to[1]) < 0.5)
            resolve({ ...r, measuredSeconds: t, arrived: [d.x, d.y] });
          else if (t > 60) resolve({ ...r, timeout: true });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    target.id,
  );
  assert.ok(!walk.timeout, 'dorm→hall 60 s 内未走到主殿入口');
  report.cool = {
    ...info,
    moved,
    shots,
    selected: { ...target, card },
    walkDormToHall: walk,
    coolRequests: [...new Set(requests.filter((p) => p.includes('/cool/')))],
    errors,
  };
  assert.deepEqual(errors, [], 'cool console/pageerror');
  await ctx.close();
}
await browser.close();
await writeFile(
  `${out}/xianfu-cool-skeleton-report.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 1));
