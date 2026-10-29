// Alpha-only erosion and nearest opaque RGB propagation; never paints artwork.
export function finishEdges(input, width, height, erode = 1) {
  const out = Buffer.from(input),
    n = width * height;
  if (erode)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let a = 255;
        for (let dy = -erode; dy <= erode; dy++)
          for (let dx = -erode; dx <= erode; dx++) {
            const xx = x + dx,
              yy = y + dy;
            a = Math.min(
              a,
              xx < 0 || yy < 0 || xx >= width || yy >= height
                ? 0
                : input[(yy * width + xx) * 4 + 3],
            );
          }
        out[(y * width + x) * 4 + 3] = a;
      }
  const owner = new Int32Array(n).fill(-1),
    queue = new Int32Array(n);
  let head = 0,
    tail = 0;
  for (let i = 0; i < n; i++)
    if (out[i * 4 + 3] === 255) {
      owner[i] = i;
      queue[tail++] = i;
    }
  while (head < tail) {
    const i = queue[head++],
      x = i % width;
    for (const j of [
      x ? i - 1 : -1,
      x < width - 1 ? i + 1 : -1,
      i - width,
      i + width,
    ]) {
      if (j < 0 || j >= n || owner[j] !== -1) continue;
      owner[j] = owner[i];
      queue[tail++] = j;
    }
  }
  for (let i = 0; i < n; i++)
    if (out[i * 4 + 3] < 255 && owner[i] >= 0)
      for (let c = 0; c < 3; c++) out[i * 4 + c] = out[owner[i] * 4 + c];
  return out;
}
