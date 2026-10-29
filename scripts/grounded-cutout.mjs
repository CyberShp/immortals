import sharp from 'sharp';
// Shared Step A/B soft key and 7px source feather; artwork pixels only.
export async function groundedCutout(input) {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  if (w !== 1152 || h !== 864) throw Error('expected 1152x864');
  const samples = [[], [], []];
  for (const [sx, sy] of [
    [0, 0],
    [w - 40, 0],
    [0, h - 40],
    [w - 40, h - 40],
  ])
    for (let y = sy; y < sy + 40; y++)
      for (let x = sx; x < sx + 40; x++)
        for (let c = 0; c < 3; c++) samples[c].push(data[(y * w + x) * 3 + c]);
  const bg = samples.map(
    (a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)],
  );
  const distance = new Float32Array(w * h),
    outside = new Uint8Array(w * h),
    queue = new Int32Array(w * h);
  let tail = 0,
    head = 0;
  for (let i = 0; i < w * h; i++)
    distance[i] = Math.hypot(...bg.map((v, c) => data[i * 3 + c] - v));
  const push = (i) => {
    if (!outside[i] && distance[i] < 65) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const i = queue[head++],
      x = i % w,
      y = Math.floor(i / w);
    if (x) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const alpha = new Float32Array(w * h),
    edge = new Float32Array(w * h);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = outside[i]
      ? distance[i] > 12
        ? Math.max(0, ...bg.map((v, c) => (v - data[i * 3 + c]) / v))
        : 0
      : 1;
    edge[i] = alpha[i] > 0.02 ? 1e5 : 0;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x) edge[i] = Math.min(edge[i], edge[i - 1] + 1);
      if (y) edge[i] = Math.min(edge[i], edge[i - w] + 1);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) edge[i] = Math.min(edge[i], edge[i + 1] + 1);
      if (y < h - 1) edge[i] = Math.min(edge[i], edge[i + w] + 1);
    }
  const rgba = Buffer.alloc(w * h * 4);
  let l = w,
    r = 0,
    t = h,
    b = 0,
    solidBottom = 0;
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i],
      fade = Math.min(1, edge[i] / 7),
      final = a * fade;
    for (let c = 0; c < 3; c++)
      rgba[i * 4 + c] = a
        ? Math.max(0, Math.min(255, (data[i * 3 + c] - (1 - a) * bg[c]) / a))
        : 0;
    rgba[i * 4 + 3] = Math.round(final * 255);
    if (final > 0.05) {
      const x = i % w,
        y = Math.floor(i / w);
      l = Math.min(l, x);
      r = Math.max(r, x);
      t = Math.min(t, y);
      b = Math.max(b, y);
    }
    if (final >= 0.8) solidBottom = Math.max(solidBottom, Math.floor(i / w));
  }
  let minX = w,
    maxX = 0;
  for (let y = solidBottom - 8; y <= solidBottom; y++)
    for (let x = 0; x < w; x++)
      if (rgba[(y * w + x) * 4 + 3] >= 204) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
  const anchorSource = [(minX + maxX) / 2, solidBottom];
  l = Math.max(0, l - 2);
  t = Math.max(0, t - 2);
  r = Math.min(w - 1, r + 2);
  b = Math.min(h - 1, b + 2);
  const crop = [l, t, r - l + 1, b - t + 1],
    anchor = { x: anchorSource[0] - l, y: anchorSource[1] - t };

  return { rgba, w, h, bg, crop, anchor, anchorSource };
}
