import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
const out = process.argv[3] ?? '/Volumes/Media/immortal-qa/integration2';
const scan = JSON.parse(
  await readFile(`${out}/evidence/railing-alpha.json`, 'utf8'),
);
const browser = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  args: ['--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto((process.argv[2] ?? 'http://127.0.0.1:4186') + '/?debug=1');
  await page.waitForFunction(
    () => window.__mapReady && window.__worldV4,
    {},
    { timeout: 120000 },
  );
  const best = scan.best;
  const proof = await page.evaluate(
    ({ point }) => {
      document.documentElement.style.zoom = '.95';
      window.__xianfu.reset();
      window.__xianfu.freeze(true);
      window.__worldV4.captureOnly(true);
      const map = document.querySelector('#map');
      map.style.width = 1600 / 0.95 + 'px';
      map.style.height = 1000 / 0.95 + 'px';
      map.style.zIndex = '9999';
      const d = window.__xianfu
        .world()
        .disciples.find((d) => d.gender !== '女');
      window.__motionDebug.place(d.id, point, 'talk');
      window.__camera.set({ x: point[0], y: point[1], zoom: 1 });
      return { id: d.id, point };
    },
    { point: best.maximumOcclusion.point },
  );
  await page.waitForTimeout(300);
  await page
    .locator('canvas')
    .screenshot({ path: `${out}/shots/occlusion-railing-proof.png` });
  proof.stats = await page.evaluate(
    (id) => window.__mapStats.disciples.find((d) => d.id === id),
    proof.id,
  );
  proof.camera = await page.evaluate(() => window.__camera.get());
  proof.rail = best;
  proof.viewport = await page.evaluate(() => window.__mapStats.viewport);
  // Pan rapidly across the world and inspect errors/fallback counters every animation frame.
  const beforePanRequests = requests.length;
  const frames = await page.evaluate(async () => {
    let rows = [];
    for (let i = 0; i < 480; i++) {
      const targets = [
        [2350, 1150],
        [4400, 1800],
        [600, 2100],
        [0, 0],
        [4997, 0],
        [0, 2320],
        [4997, 2320],
      ];
      const a = targets[Math.floor(i / 60) % targets.length],
        b = targets[(Math.floor(i / 60) + 1) % targets.length];
      const t = (i % 60) / 59;
      const jump = targets[i % targets.length];
      window.__camera.set({
        x: i < 360 ? a[0] + (b[0] - a[0]) * t : jump[0],
        y: i < 360 ? a[1] + (b[1] - a[1]) * t : jump[1],
        zoom: 1,
      });
      await new Promise(requestAnimationFrame);
      rows.push({
        i,
        camera: window.__camera.get(),
        fallbacks: window.__mapStats.fallbacks,
        ready: window.__mapReady,
        textures: window.__worldV4.textureStatus?.() ?? null,
      });
    }
    return rows;
  });
  proof.pan = {
    method:
      '480 rendered frames: 360 pans + 120 instant jumps; first/east/south/four corners; full-world encoded blocks preloaded before first paint',
    frames,
    requestsDuringPan: requests.slice(beforePanRequests),
    missingFrames: frames.filter(
      (f) =>
        f.fallbacks || !f.ready || !f.textures || f.textures.missing.length,
    ).length,
  };
  await writeFile(
    `${out}/evidence/railing-browser.json`,
    JSON.stringify(proof, null, 2),
  );
  const x = (proof.point[0] - proof.camera.x + 800) * 2,
    y = (proof.point[1] - proof.camera.y + 500) * 2;
  await sharp(`${out}/shots/occlusion-railing-proof.png`)
    .extract({
      left: Math.round(x - 150),
      top: Math.round(y - 240),
      width: 300,
      height: 320,
    })
    .resize(900, 960, { kernel: 'nearest' })
    .toFile(`${out}/shots/occlusion-railing-proof-3x.png`);
  console.log(
    JSON.stringify({
      proof: proof.stats,
      missingFrames: proof.pan.missingFrames,
    }),
  );
} finally {
  await browser.close();
}
