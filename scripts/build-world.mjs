import sharp from 'sharp';
import { buildBridges } from './build-bridges.mjs';
const root = '/Volumes/Media/immortal-qa/design/art/concept/';
const target = [241, 232, 212],
  W = 3200,
  H = 1400;
const definitions = [
  {
    id: 'main',
    offset: [950, 620],
    source: 'public/assets/map/base@2x.webp',
    envelope: [
      [285, 170],
      [460, 102],
      [690, 94],
      [820, 174],
      [1040, 230],
      [1100, 310],
      [1090, 375],
      [980, 420],
      [905, 468],
      [800, 490],
      [760, 550],
      [730, 605],
      [580, 665],
      [400, 630],
      [310, 590],
      [430, 542],
      [520, 438],
      [360, 395],
      [170, 355],
      [195, 300],
      [250, 230],
    ],
    holes: [
      [
        [255, 245],
        [290, 239],
        [321, 280],
        [293, 302],
        [249, 291],
      ],
      [
        [855, 363],
        [904, 361],
        [934, 405],
        [873, 417],
      ],
      [
        [1008, 279],
        [1064, 277],
        [1080, 344],
        [1030, 354],
      ],
      [
        [342, 142],
        [381, 140],
        [400, 196],
        [355, 201],
      ],
      [
        [529, 455],
        [710, 459],
        [737, 565],
        [532, 561],
      ],
    ],
  },
  {
    id: 'north',
    offset: [950, 0],
    source: root + 'map_island_north_v1.jpg',
    envelope: [
      [398, 286],
      [441, 253],
      [480, 240],
      [525, 210],
      [581, 190],
      [667, 207],
      [708, 235],
      [785, 261],
      [839, 285],
      [878, 309],
      [873, 341],
      [852, 376],
      [800, 398],
      [775, 426],
      [806, 460],
      [766, 484],
      [734, 509],
      [731, 543],
      [685, 565],
      [624, 554],
      [593, 532],
      [552, 531],
      [527, 502],
      [520, 470],
      [474, 447],
      [437, 420],
      [431, 382],
      [390, 350],
    ],
    holes: [
      [
        [584, 271],
        [626, 253],
        [685, 265],
        [728, 292],
        [715, 335],
        [660, 355],
        [613, 338],
      ],
      [
        [553, 188],
        [630, 183],
        [662, 230],
        [603, 246],
        [558, 226],
      ],
      [
        [448, 247],
        [482, 240],
        [502, 278],
        [466, 289],
      ],
      [
        [738, 244],
        [779, 234],
        [793, 275],
        [749, 282],
      ],
      [
        [493, 355],
        [536, 356],
        [546, 404],
        [502, 407],
      ],
      [
        [717, 379],
        [763, 364],
        [790, 409],
        [739, 426],
      ],
      [
        [739, 291],
        [783, 290],
        [791, 341],
        [747, 344],
      ],
    ],
  },
  {
    id: 'west',
    offset: [0, 570],
    source: root + 'map_island_west_v1.jpg',
    envelope: [
      [306, 265],
      [351, 241],
      [397, 213],
      [496, 168],
      [555, 145],
      [648, 154],
      [720, 176],
      [803, 210],
      [893, 231],
      [943, 246],
      [954, 276],
      [969, 311],
      [968, 340],
      [918, 361],
      [859, 374],
      [843, 395],
      [895, 427],
      [937, 451],
      [988, 460],
      [1010, 483],
      [969, 505],
      [901, 490],
      [880, 460],
      [808, 451],
      [775, 477],
      [723, 487],
      [665, 469],
      [667, 424],
      [615, 396],
      [575, 407],
      [541, 441],
      [463, 426],
      [410, 402],
      [364, 378],
      [330, 351],
    ],
    holes: [
      [
        [403, 153],
        [464, 116],
        [515, 212],
        [484, 253],
        [424, 266],
        [391, 221],
      ],
      [
        [738, 121],
        [808, 80],
        [875, 167],
        [863, 249],
        [783, 268],
        [710, 232],
      ],
      [
        [862, 252],
        [908, 241],
        [936, 320],
        [883, 338],
        [847, 305],
      ],
      [
        [385, 284],
        [427, 279],
        [450, 320],
        [404, 329],
      ],
      [
        [456, 332],
        [483, 324],
        [519, 381],
        [482, 398],
        [441, 374],
      ],
      [
        [645, 132],
        [687, 131],
        [711, 175],
        [667, 179],
      ],
      [
        [640, 429],
        [679, 428],
        [697, 472],
        [657, 475],
      ],
    ],
  },
  {
    id: 'east',
    offset: [2013, 521],
    source: root + 'map_island_east_v1.jpg',
    envelope: [
      [309, 350],
      [375, 318],
      [486, 293],
      [548, 277],
      [598, 245],
      [630, 211],
      [701, 212],
      [775, 237],
      [845, 260],
      [897, 295],
      [959, 314],
      [987, 339],
      [979, 377],
      [946, 407],
      [917, 437],
      [878, 465],
      [848, 500],
      [804, 520],
      [743, 549],
      [678, 579],
      [598, 594],
      [520, 588],
      [458, 561],
      [426, 537],
      [384, 539],
      [346, 558],
      [289, 550],
      [267, 533],
      [301, 518],
      [355, 498],
      [400, 478],
      [381, 454],
      [349, 430],
      [321, 403],
    ],
    holes: [
      [
        [395, 293],
        [470, 278],
        [493, 349],
        [439, 369],
        [395, 356],
      ],
      [
        [542, 233],
        [579, 220],
        [595, 279],
        [557, 287],
      ],
      [
        [670, 197],
        [701, 189],
        [709, 230],
        [676, 237],
      ],
      [
        [747, 246],
        [782, 242],
        [770, 288],
        [782, 319],
        [823, 350],
        [840, 384],
        [805, 394],
        [789, 356],
        [748, 335],
        [730, 303],
      ],
      [
        [788, 427],
        [820, 420],
        [851, 462],
        [825, 483],
        [788, 472],
      ],
      [
        [418, 420],
        [450, 418],
        [472, 445],
        [435, 459],
      ],
    ],
  },
];
function inside([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = poly[i],
      [u, v] = poly[j];
    if (b > y != v > y && x < ((u - a) * (y - b)) / (v - b) + a) c = !c;
  }
  return c;
}
function simplify(p, eps) {
  if (p.length < 3) return p;
  const [a, b] = [p[0], p.at(-1)];
  let best = 0,
    k = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p[i][0] - a[0]) * (b[0] - a[0]) + (p[i][1] - a[1]) * (b[1] - a[1])) /
          ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1),
      ),
    );
    const d = Math.hypot(
      p[i][0] - a[0] - t * (b[0] - a[0]),
      p[i][1] - a[1] - t * (b[1] - a[1]),
    );
    if (d > best) {
      best = d;
      k = i;
    }
  }
  return best > eps
    ? [
        ...simplify(p.slice(0, k + 1), eps).slice(0, -1),
        ...simplify(p.slice(k), eps),
      ]
    : [a, b];
}
function trace(raw, env) {
  const w = 320,
    h = 180;
  let m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * 4 * 1280 + x * 4) * 3,
        [r, g, b] = raw.slice(i, i + 3);
      m[y * w + x] = Number(
        inside([x * 4, y * 4], env) &&
          r > 80 &&
          g > 70 &&
          r > g * 0.88 &&
          b < g * 0.94,
      );
    }
  const morph = (src, r, dilate) =>
    Uint8Array.from(src, (_, i) => {
      const x = i % w,
        y = Math.floor(i / w);
      let v = dilate ? 0 : 1;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const q =
            x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h
              ? src[(y + dy) * w + x + dx]
              : 0;
          v = dilate ? Math.max(v, q) : Math.min(v, q);
        }
      return v;
    });
  m = morph(morph(m, 1, false), 1, true);
  m = morph(morph(m, 5, true), 5, false);
  // Fill colour holes only in the reviewed top-face envelope; obstacles remain explicit holes.
  for (let y = 0; y < h; y++) {
    const xs = [];
    for (let x = 0; x < w; x++) if (m[y * w + x]) xs.push(x);
    if (xs.length)
      for (let x = xs[0]; x <= xs.at(-1); x++)
        m[y * w + x] = Number(inside([x * 4, y * 4], env));
  }
  let largest = [];
  const seen = new Set();
  for (let i = 0; i < m.length; i++)
    if (m[i] && !seen.has(i)) {
      const q = [i];
      seen.add(i);
      for (let k = 0; k < q.length; k++) {
        const p = q[k];
        for (const n of [p - 1, p + 1, p - w, p + w])
          if (
            n >= 0 &&
            n < m.length &&
            m[n] &&
            !seen.has(n) &&
            Math.abs((n % w) - (p % w)) <= 1
          ) {
            seen.add(n);
            q.push(n);
          }
      }
      if (q.length > largest.length) largest = q;
    }
  const set = new Set(largest),
    edges = new Map();
  for (const i of largest) {
    const x = i % w,
      y = Math.floor(i / w);
    for (const [n, a, b] of [
      [i - w, [x, y], [x + 1, y]],
      [i + 1, [x + 1, y], [x + 1, y + 1]],
      [i + w, [x + 1, y + 1], [x, y + 1]],
      [i - 1, [x, y + 1], [x, y]],
    ])
      if (!set.has(n)) edges.set(a.join(','), b);
  }
  const start = [...edges.keys()].sort(
    (a, b) => Number(a.split(',')[1]) - Number(b.split(',')[1]),
  )[0];
  let key = start;
  const contour = [];
  do {
    contour.push(key.split(',').map((n) => Number(n) * 4));
    key = edges.get(key)?.join(',');
  } while (key && key !== start && contour.length < 20000);
  contour.push(contour[0]);
  let result;
  for (let e = 1; e < 30; e += 0.5) {
    result = simplify(contour, e).slice(0, -1);
    if (result.length <= 40) break;
  }
  return result;
}
const canvas = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) canvas.set(target, i * 3);
const calibration = [],
  islands = [];
for (const d of definitions) {
  const { data, info } = await sharp(d.source)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== 1280 || info.height !== 720)
    throw Error(d.source + ' dimensions');
  const samples = [[], [], []];
  for (const [sx, sy] of [
    [0, 0],
    [1240, 0],
    [0, 680],
    [1240, 680],
  ])
    for (let y = sy; y < sy + 40; y++)
      for (let x = sx; x < sx + 40; x++)
        for (let c = 0; c < 3; c++)
          samples[c].push(data[(y * 1280 + x) * 3 + c]);
  const paper = samples.map((a) => a.sort((a, b) => a - b)[3200]);
  const calibrated = Buffer.from(data);
  for (let i = 0; i < data.length; i++) {
    const c = i % 3,
      v = data[i],
      weight = Math.max(0, Math.min(1, (v - 125) / 80));
    calibrated[i] = Math.min(
      255,
      Math.round(v * (1 + (target[c] / paper[c] - 1) * weight)),
    );
  }
  // Feather only the outer paper margin; no artwork lies in these 70px borders.
  for (let y = 0; y < 720; y++)
    for (let x = 0; x < 1280; x++) {
      const wx = x + d.offset[0],
        wy = y + d.offset[1];
      if (wx >= W || wy >= H) continue;
      const fade = Math.min(1, x / 70, y / 70, (1279 - x) / 70, (719 - y) / 70);
      for (let c = 0; c < 3; c++) {
        const v = Math.round(
          target[c] + (calibrated[(y * 1280 + x) * 3 + c] - target[c]) * fade,
        );
        canvas[(wy * W + wx) * 3 + c] = Math.min(
          canvas[(wy * W + wx) * 3 + c],
          v,
        );
      }
    }
  calibration.push({
    id: d.id,
    before: paper,
    after: paper.map((v, c) => Math.round((v * target[c]) / v)),
  });
  islands.push({
    id: d.id,
    offset: d.offset,
    walkable: trace(data, d.envelope),
    obstacles: d.holes,
  });
}
await buildBridges(canvas, islands);
