export type Camera = { zoom: number; x: number; y: number };
export function clampCamera(c: Camera): Camera {
  const zoom = Math.max(0.2, Math.min(1.5, c.zoom));
  return {
    zoom,
    x: Math.max(320 / zoom, Math.min(3200 - 320 / zoom, c.x)),
    y:
      zoom < 360 / 1400
        ? 700
        : Math.max(180 / zoom, Math.min(1400 - 180 / zoom, c.y)),
  };
}
export function attachCamera(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  repaint: () => void,
) {
  let current = clampCamera({ zoom: 0.45, x: 1500, y: 900 });
  let compactCurrent: Camera = { zoom: 0.2, x: 1600, y: 700 };
  const media = window.matchMedia('(max-width: 480px)');
  const get = () => (media.matches ? { ...compactCurrent } : { ...current });
  const set = (patch: Partial<Camera>) => {
    if (media.matches)
      compactCurrent = clampCamera({ ...compactCurrent, ...patch });
    else current = clampCamera({ ...current, ...patch });
    repaint();
  };
  const panorama = () => set({ zoom: 0.2, x: 1600, y: 700 });
  const controller = { get, set, panorama };
  if (new URLSearchParams(location.search).get('debug') === '1')
    window.__camera = controller;
  const controls = document.createElement('div');
  controls.className = 'camera-controls';
  for (const [text, aria, action] of [
    ['＋', '放大地图', () => set({ zoom: current.zoom + 0.1 })],
    ['－', '缩小地图', () => set({ zoom: current.zoom - 0.1 })],
    ['全景', '地图全景', panorama],
  ] as const) {
    const b = document.createElement('button');
    b.textContent = text;
    b.setAttribute('aria-label', aria);
    b.onclick = action;
    controls.append(b);
  }
  host.append(controls);
  let drag: { id: number; x: number; y: number; camera: Camera } | undefined;
  const down = (e: PointerEvent) => {
    if (media.matches) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, camera: get() };
  };
  const move = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const r = canvas.getBoundingClientRect();
    set({
      x: drag.camera.x - ((e.clientX - drag.x) * 640) / r.width / current.zoom,
      y: drag.camera.y - ((e.clientY - drag.y) * 360) / r.height / current.zoom,
    });
  };
  const up = () => {
    drag = undefined;
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (media.matches) return;
    const r = canvas.getBoundingClientRect(),
      px = ((e.clientX - r.left) * 640) / r.width - 320,
      py = ((e.clientY - r.top) * 360) / r.height - 180;
    const zoom = Math.max(0.2, Math.min(1.5, current.zoom - e.deltaY * 0.0003));
    set({
      zoom,
      x: current.x + px / current.zoom - px / zoom,
      y: current.y + py / current.zoom - py / zoom,
    });
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  media.addEventListener('change', repaint);
  return {
    ...controller,
    compact: () => media.matches,
    destroy: () => {
      controls.remove();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      media.removeEventListener('change', repaint);
      delete window.__camera;
    },
  };
}
declare global {
  interface Window {
    __camera?: {
      get(): Camera;
      set(patch: Partial<Camera>): void;
      panorama(): void;
    };
  }
}
