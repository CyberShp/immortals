import manifest from '../../public/assets/manifest.json';
import type { Disciple } from '../sim/data';
const available = new Set(manifest.files.map((f) => f.file));
const failed = new Set<string>();
export const portraitNames: Record<string, string> = {
  陆青崖: 'lu-qingya',
  沈墨: 'shen-mo',
  白芷: 'bai-zhi',
  苏小禾: 'su-xiaohe',
  钱多多: 'qian-duoduo',
  林守拙: 'lin-shouzhuo',
};
export function portraitFile(d: Pick<Disciple, 'name'>, size: number) {
  const name = portraitNames[d.name];
  return name ? `portrait/${name}-${size === 128 ? 256 : 128}@2x.webp` : '';
}
export const eventIcons: Record<string, string> = {
  修炼: 'cultivate',
  做工: 'work',
  社交: 'social',
  情缘: 'romance',
  争执: 'quarrel',
  历练: 'adventure',
  突破: 'breakthrough',
  宗门: 'sect',
};
export const eventIcon = (kind: string) =>
  `event-${eventIcons[kind] ?? 'sect'}`;
export function assetUrl(file: string, files: ReadonlySet<string> = available) {
  return files.has(file) && !failed.has(file)
    ? `${import.meta.env.BASE_URL}assets/${file}`
    : undefined;
}
export function artImage(file: string, size: number, lazy = true) {
  const url = assetUrl(file);
  return url
    ? `<img data-art="${file}" src="${url}" width="${size}" height="${size}" loading="${lazy ? 'lazy' : 'eager'}" alt="">`
    : '';
}
export function icon(name: string, size: 32 | 64 = 32, lazy = true) {
  return `<span class="art-icon" style="--art-size:${size}px" data-icon="${name}"><span class="art-fallback" aria-hidden="true">◇</span>${artImage(`icon/${name}-${size}@2x.webp`, size, lazy)}</span>`;
}
// Capture image errors (they do not bubble), keep the fallback and never retry
// failed files on each simulation render. Unknown manifest files never get a src.
export function installArtFallback(root: HTMLElement) {
  root.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.dataset.art) return;
      failed.add(img.dataset.art);
      img.remove();
    },
    true,
  );
}
