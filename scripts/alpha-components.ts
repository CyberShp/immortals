// Eight-connected alpha components; RGB in transparent pixels is irrelevant.
export function alphaComponents(
  data: Uint8Array,
  width: number,
  height: number,
) {
  const seen = new Uint8Array(width * height);
  const groups: number[][] = [];
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || !data[i * 4 + 3]) continue;
    const group = [i];
    seen[i] = 1;
    for (let k = 0; k < group.length; k++) {
      const p = group[k],
        x = p % width,
        y = Math.floor(p / width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy,
            q = ny * width + nx;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= width ||
            ny >= height ||
            seen[q] ||
            !data[q * 4 + 3]
          )
            continue;
          seen[q] = 1;
          group.push(q);
        }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}
export function headSpecks(data: Uint8Array, width: number, height: number) {
  const [body = [], ...rest] = alphaComponents(data, width, height);
  const top = Math.min(...body.map((p) => Math.floor(p / width)));
  return rest
    .filter((g) => g.length <= 3 && g.every((p) => Math.floor(p / width) < top))
    .flat();
}
