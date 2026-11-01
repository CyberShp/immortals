import { buildCoolHall, type Seat } from './cool-hall';
import { v4Queue, v4Layout, uv, v4Nearest, type P } from './world-v4';
import { v4Cushions } from './v4-spots';
/** Geometry for existing assembly state machine only; never draws or enters an interior. */
export function outdoorHall() {
  const base = buildCoolHall();
  const entrance = v4Nearest(uv(...(v4Layout.doors.hall as P)));
  return {
    ...base,
    entrance,
    stairTop: entrance,
    door: entrance,
    throne: entrance,
    stations: [...v4Queue, ...v4Cushions].slice(0, 16),
    queue: v4Queue,
    lineup: v4Cushions,
    chairs: [],
    guests: [],
    hallZ: entrance[1],
  };
}
export function outdoorSeats(seats: Map<string, Seat>) {
  const points = [...v4Queue, ...v4Cushions];
  let i = 0;
  for (const seat of seats.values()) {
    seat.point = points[i++ % points.length];
    seat.inside = false;
    seat.kind = 'station';
  }
}
