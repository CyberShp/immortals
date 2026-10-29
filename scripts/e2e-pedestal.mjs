import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function verifyPedestals(
  browser,
  base,
  cleanScreenshot,
  assertDefaultDiscipleSize,
) {
  const output =
    process.env.PEDESTAL_SCREENSHOT_DIR ?? '/Volumes/Media/GrokBot/workspace';
  await mkdir(output, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 640, height: 450 },
    deviceScaleFactor: 2,
  });
  const evidence = [],
    errors = [];
  try {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const url = new URL(base);
    url.searchParams.set('debug', '1');
    url.searchParams.delete('discipleHeight');
    await page.goto(url.href);
    await page.waitForFunction(() => window.__mapReady && window.__motionDebug);
    await page.evaluate(() => {
      window.__xianfu.freeze(true);
      window.__xianfu.reset();
      window.__xianfu.artAllBuilt(1);
    });
    const id = await page.evaluate(() => window.__mapStats.disciples[0].id);
    const buildings = await page.evaluate(() =>
      window.__world.pedestals.filter((b) => b.step),
    );
    for (const b of buildings)
      for (const side of ['back', 'front']) {
        // Back: just behind the right-rear corner (the open pavilion: behind its
        // rear edge), so the body is partly hidden by walls/roof yet visible.
        // Front: below the front edge.
        const corner = side === 'back' && b.key !== 'meditation';
        const edge = b.surface.reduce((a, p) =>
          (
            corner
              ? p[0] - p[1] > a[0] - a[1]
              : side === 'back'
                ? p[1] < a[1]
                : p[1] > a[1]
          )
            ? p
            : a,
        );
        const point =
          side === 'front'
            ? [edge[0], edge[1] + 20]
            : corner
              ? [edge[0] - 12, edge[1] - 26]
              : [edge[0], edge[1] - 20];
        const placed = await page.evaluate(
          ({ id, point, b }) => {
            window.__camera.set({
              x: b.position[0],
              y: b.sortY - 40,
              zoom: 0.95,
            });
            return window.__motionDebug.place(id, point);
          },
          { id, point, b },
        );
        // Re-centre on the building's rendered bounds so the whole pedestal,
        // roof and the placed disciple are inside the 2x capture.
        await page.evaluate(async (bid) => {
          const frames = () =>
            new Promise((r) =>
              requestAnimationFrame(() => requestAnimationFrame(r)),
            );
          for (let pass = 0; pass < 2; pass++) {
            await frames();
            const s = window.__mapStats.buildings.find((s) => s.id === bid);
            const cam = window.__camera.get();
            window.__camera.set({
              x: cam.x + (s.x + s.width / 2 - innerWidth / 2) / cam.zoom,
              y: cam.y + (s.y + s.height / 2 - innerHeight / 2) / cam.zoom,
              zoom: 0.95,
            });
          }
          await frames();
        }, b.id);
        const file = `${output}/xianfu-pedestal-${b.key}-${side}-2x.png`;
        const capture = await cleanScreenshot(
          page,
          file,
          undefined,
          undefined,
          'device',
        );
        assertDefaultDiscipleSize(capture);
        const sample = await page.evaluate(
          ({ id, b }) => {
            const d = window.__mapStats.disciples.find((d) => d.id === id),
              building = window.__mapStats.buildings.find((s) => s.id === b.id);
            return {
              d,
              building,
              walkable: window.__world.walkable(d.x, d.y),
              stepLayer: window.__world.buildingLayerAt(b.id, ...b.step),
            };
          },
          { id, b },
        );
        assert.ok(sample.walkable);
        assert.equal(
          sample.stepLayer.body,
          false,
          'stone/treads must be in the ground layer',
        );
        assert.ok(
          sample.stepLayer.groundZ < sample.d.z,
          'ground must be below both front and back disciples',
        );
        assert.equal(
          sample.d.pose,
          'walk-pass',
          'debug placement must stand, not meditate',
        );
        assert.ok(
          side === 'back'
            ? sample.d.z < sample.building.z
            : sample.d.z > sample.building.z,
          JSON.stringify({ b: b.id, side, sample }),
        );
        const png = await readFile(file);
        assert.equal(png.readUInt32BE(16), 1280);
        assert.equal(png.readUInt32BE(20), 900);
        evidence.push({
          building: b.id,
          side,
          requested: point,
          placed,
          ...sample,
          file,
        });
      }
    await writeFile(
      `${output}/xianfu-pedestal-report.json`,
      JSON.stringify({ evidence, errors }, null, 2) + '\n',
    );
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
