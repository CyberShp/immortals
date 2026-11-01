import { writeFile } from 'node:fs/promises';
import fg from '../src/render/world-v4-foreground.json';
import { v4Walkable, toUV, V4 } from '../src/render/world-v4';
const output =
  process.argv[2] ??
  '/Volumes/Media/immortal-qa/integration2/evidence/railing-walk-points.json';
const rails = [];
for (const f of fg.objects.filter((f) => f.filename.startsWith('rail_'))) {
  const b = f.bbox,
    points = [];
  // Exhaustive integer-pixel feet in any possible sprite/alpha overlap, both sides of baseline.
  for (
    let y = Math.floor(b[1] + 200 - 250);
    y <= Math.ceil(b[3] + 200 + 250);
    y++
  )
    for (
      let x = Math.floor(b[0] + 342 - 250);
      x <= Math.ceil(b[2] + 342 + 250);
      x++
    )
      if (v4Walkable([x, y])) points.push([x, y]);
  rails.push({
    file: f.filename,
    bbox: b.map((n, i) => n + (i % 2 ? 200 : 342)),
    baseline: f.sort_baseline_y_world,
    points,
  });
  console.log(f.filename, points.length);
}
await writeFile(
  output,
  JSON.stringify({
    method:
      'all integer-world-pixel feet in rail bbox expanded by complete standing sprite; v4Walkable authoritative predicate',
    actorHeight: 96 * 0.6 * V4.actorScale,
    rails,
    uvExample: toUV([0, 0]),
  }),
);
