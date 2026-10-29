// Absolute sprite scale: on-screen disciple height = 96 × DISCIPLE_SCALE world px.
// Collision foot radius is derived from it by scripts/measure-pedestals.mjs
// (re-run after changing this); WALK_SPEED is sim-facing and not scaled.
export const DISCIPLE_SCALE = 0.6;
export const DISCIPLE_HEIGHT = 93.71 * DISCIPLE_SCALE;
export const WALK_SPEED = 20;
export const WALK_FRAME_MS = ((0.35 * DISCIPLE_HEIGHT) / WALK_SPEED) * 1000;

export function discipleArtFile(gender: string, pose: string) {
  const female =
    gender === '女' && ['walk-step', 'walk-pass', 'meditate'].includes(pose);
  return `disciple/${female ? 'f-' : ''}${pose}-96@2x.webp`;
}
