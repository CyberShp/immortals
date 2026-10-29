/** Source inspection: walk/work look left, talk right, meditation is frontal.
 * idle reuses walk-pass; female work/talk reuse the shared male source. */
export function defaultFacing(file: string): -1 | 0 | 1 {
  return file.includes('meditate') ? 0 : file.includes('talk') ? 1 : -1;
}
export const HORIZONTAL_FACING_EPSILON = 0.5; // world px/s; vertical jitter is not a turn.
export function horizontalFacing(vx: number, previous: number) {
  return Math.abs(vx) < HORIZONTAL_FACING_EPSILON ? previous : vx > 0 ? 1 : -1;
}
export function spriteFlip(file: string, facing: number) {
  const source = defaultFacing(file);
  return source === 0 ? 1 : facing * source;
}
