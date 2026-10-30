// ?cool=1 UI 冷色皮肤：色值照 Iris《冷色 UI 色板 v1》[UIP]；九宫格取 public/assets/cool/ui/。
// 只在 ?cool=1 时给 <html> 加 cool 类并注入素材地址；默认/classic 不加类、不请求任何 cool/ui 文件。
export const COOL_UI_FILES = {
  panel: 'panel.webp',
  primary: 'button-primary.webp',
  secondary: 'button-secondary.webp',
  danger: 'button-danger.webp',
  plaque: 'plaque.webp',
} as const;

export function applyCoolSkin(root: HTMLElement, base: string) {
  root.classList.add('cool');
  for (const [key, file] of Object.entries(COOL_UI_FILES))
    root.style.setProperty(
      `--ui-${key}`,
      `url("${base}assets/cool/ui/${file}")`,
    );
}
