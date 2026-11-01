import { readFileSync, writeFileSync } from 'node:fs';
import {
  uv,
  toUV,
  v4Walkable,
  v4AdaptationReports,
} from '../src/render/world-v4';
import { musterPositions } from '../src/render/v4-spots';
const [input, output] = process.argv.slice(2);
const data = JSON.parse(readFileSync(input, 'utf8'));
const mask = Buffer.alloc(data.us.length * data.vs.length);
let i = 0;
for (const u of data.us)
  for (const v of data.vs) mask[i++] = +v4Walkable(uv(u, v));
writeFileSync(output + '.bin', mask);
writeFileSync(
  output + '.json',
  JSON.stringify(
    {
      points: data.points.map((p: number[]) => ({
        uv: p,
        ok: v4Walkable(uv(p[0], p[1])),
      })),
      muster: musterPositions(),
      musterUV: musterPositions().map(toUV),
      adaptations: v4AdaptationReports,
    },
    null,
    2,
  ),
);
