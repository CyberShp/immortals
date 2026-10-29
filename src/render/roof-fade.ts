// 封闭房屋屋顶淡出（开发开关 ?roofFade=1）。纯表现层：只读渲染时间，
// 不读写 sim 状态、不消耗 sim 随机数。
import geometry from './roof-fade-geometry.json';

export type Point = [number, number];
export type Affine = {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
};
export type RoofFadeLayer = {
  file: string;
  width: number;
  height: number;
  matrix: Affine;
};
export type RoofFadeBuilding = {
  key: string;
  scale: number;
  doorPx: number;
  exterior: RoofFadeLayer;
  shadow: RoofFadeLayer;
  interior: RoofFadeLayer;
  foundationTop: Point[];
  foundationBottom: Point[];
  sortY: number;
  seats: Point[];
  spots: Point[];
};

export const roofFadeBuildings = geometry.buildings as unknown as Record<
  string,
  RoofFadeBuilding
>;
export const ROOF_HIDE_MS = 300;
export const ROOF_SHOW_MS = 500;
export const INDOOR_INSET = 10;

export function roofFadeEnabled(search: string) {
  return new URLSearchParams(search).get('roofFade') === '1';
}

/** 素材像素 → 世界坐标（以门口脚底点为原点的偏移再加上门口点）。 */
export function layerMatrix(layer: RoofFadeLayer, entrance: Point): Affine {
  return {
    ...layer.matrix,
    tx: layer.matrix.tx + entrance[0],
    ty: layer.matrix.ty + entrance[1],
  };
}

export function offsetPoints(points: Point[], entrance: Point): Point[] {
  return points.map(([x, y]) => [x + entrance[0], y + entrance[1]]);
}

function cross(o: Point, a: Point, b: Point) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** 点在凸多边形内且离每条边都至少 inset。 */
export function insideInset(p: Point, polygon: Point[], inset: number) {
  const area = polygon.reduce(
    (s, a, i) => s + cross([0, 0], a, polygon[(i + 1) % polygon.length]),
    0,
  );
  const sign = Math.sign(area) || 1;
  return polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return (sign * cross(a, b, p)) / len >= inset;
  });
}

/**
 * 室内站位：静修室先占两个蒲团，其余建筑用实测的空地点；
 * 人数超出时取两个实测点之间的点（凸组合，仍在室内），错开不重叠。
 */
export function indoorSpot(
  building: RoofFadeBuilding,
  entrance: Point,
  index: number,
): { point: Point; seat: boolean } {
  const fixed = [
    ...building.seats.map((p) => ({ p, seat: true })),
    ...building.spots.map((p) => ({ p, seat: false })),
  ];
  const at = (p: Point): Point => [p[0] + entrance[0], p[1] + entrance[1]];
  if (index < fixed.length)
    return { point: at(fixed[index].p), seat: fixed[index].seat };
  const k = index - fixed.length;
  const a = fixed[k % fixed.length].p,
    b = fixed[(k + 1) % fixed.length].p;
  const round = Math.floor(k / fixed.length);
  // 0.5, 0.25, 0.75, 0.375, 0.625 …
  const t = [0.5, 0.25, 0.75, 0.375, 0.625][round % 5];
  return {
    point: at([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]),
    seat: false,
  };
}

export const easeInOut = (t: number) =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

export type RoofTween = {
  from: number;
  to: number;
  start: number;
  duration: number;
};

export function roofAlpha(tween: RoofTween | undefined, now: number) {
  if (!tween) return 1;
  if (tween.duration <= 0) return tween.to;
  const t = (now - tween.start) / tween.duration;
  return tween.from + (tween.to - tween.from) * easeInOut(t);
}

export function roofAnimating(tween: RoofTween | undefined, now: number) {
  return !!tween && now < tween.start + tween.duration;
}

/** 有人在室内时 1→0（0.3s），最后一人离开后 0→1（0.5s）；中途反转从当前值接着走。 */
export function retargetRoof(
  tween: RoofTween | undefined,
  occupied: boolean,
  now: number,
): RoofTween | undefined {
  const to = occupied ? 0 : 1;
  const current = roofAlpha(tween, now);
  if ((tween?.to ?? 1) === to) return tween;
  const span = Math.abs(to - current);
  return {
    from: current,
    to,
    start: now,
    duration: (occupied ? ROOF_HIDE_MS : ROOF_SHOW_MS) * span,
  };
}
