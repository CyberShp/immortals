export type Camera = { zoom: number; x: number; y: number };
export function clampCamera(c: Camera, width = 640, height = 360): Camera {
  const zoom = Math.max(
    Math.min(width / 3200, height / 1400),
    Math.min(1.5, c.zoom),
  );
  const axis = (n: number, span: number, size: number) =>
    span >= size ? size / 2 : Math.max(span / 2, Math.min(size - span / 2, n));
  return {
    zoom,
    x: axis(c.x, width / zoom, 3200),
    y: axis(c.y, height / zoom, 1400),
  };
}
export function attachCamera(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  repaint: () => void,
) {
  const size = () => canvas.getBoundingClientRect();
  let current = clampCamera(
    { zoom: size().width / 1440, x: 1500, y: 900 },
    size().width,
    size().height,
  );
  let followed: string | undefined;
  let manual = false;
  let lastSize = `${size().width},${size().height}`;
  const get = () => {
    const r = size(),
      key = `${r.width},${r.height}`;
    if (key !== lastSize) {
      current = clampCamera(
        { ...current, zoom: manual ? current.zoom : r.width / 1440 },
        r.width,
        r.height,
      );
      lastSize = key;
    }
    return { ...current };
  };
  const set = (patch: Partial<Camera>) => {
    manual = true;
    current = clampCamera({ ...get(), ...patch }, size().width, size().height);
    repaint();
  };
  const panorama = () => {
    followed = undefined;
    set({
      zoom: Math.min(size().width / 3200, size().height / 1400),
      x: 1600,
      y: 700,
    });
  };
  const controller = {
    get,
    set,
    panorama,
    follow: (id: string) => {
      followed = id;
      repaint();
    },
    following: () => followed,
  };
  if (new URLSearchParams(location.search).get('debug') === '1')
    window.__camera = controller;
  const controls = document.createElement('div');
  controls.className = 'camera-controls';
  for (const [text, aria, action] of [
    ['＋', '放大地图', () => set({ zoom: get().zoom + 0.1 })],
    ['－', '缩小地图', () => set({ zoom: get().zoom - 0.1 })],
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
  let dragged = false;
  const down = (e: PointerEvent) => {
    dragged = false;
    const r = size();
    if (
      e.clientX - r.left >= r.width - 125 &&
      e.clientY - r.top >= 76 &&
      e.clientY - r.top <= 141
    )
      return;
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, camera: get() };
  };
  const move = (e: PointerEvent) => {
    if (
      !drag ||
      drag.id !== e.pointerId ||
      Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4
    )
      return;
    dragged = true;
    followed = undefined;
    set({
      x: drag.camera.x - (e.clientX - drag.x) / drag.camera.zoom,
      y: drag.camera.y - (e.clientY - drag.y) / drag.camera.zoom,
    });
  };
  const up = () => {
    drag = undefined;
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    followed = undefined;
    const r = size(),
      c = get(),
      px = e.clientX - r.left - r.width / 2,
      py = e.clientY - r.top - r.height / 2;
    const zoom = clampCamera(
      { ...c, zoom: c.zoom - e.deltaY * 0.0003 },
      r.width,
      r.height,
    ).zoom;
    set({
      zoom,
      x: c.x + px / c.zoom - px / zoom,
      y: c.y + py / c.zoom - py / zoom,
    });
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return {
    ...controller,
    wasDragged: () => dragged,
    track: (x: number, y: number, dt: number) => {
      const c = get(),
        factor = 1 - Math.exp(-dt / 180);
      current = clampCamera(
        { ...c, x: c.x + (x - c.x) * factor, y: c.y + (y - c.y) * factor },
        size().width,
        size().height,
      );
    },
    compact: () => size().width <= 480,
    destroy: () => {
      controls.remove();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
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
      follow(id: string): void;
      following(): string | undefined;
    };
  }
}
