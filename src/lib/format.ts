export const formatPercent = (fraction: number) =>
  `${(fraction * 100).toFixed(1)}%`;

export const pointsLabel = (points: number) =>
  `${points} ${points === 1 ? "point" : "points"}`;

/** "40–50°E": a span on one axis, sharing the hemisphere letter where it can. */
function formatSpan(a: number, b: number, pos: string, neg: string) {
  const [lo, hi] = [Math.abs(a), Math.abs(b)].sort((x, y) => x - y);
  if (a >= 0 && b >= 0) return `${lo}–${hi}°${pos}`;
  if (a <= 0 && b <= 0) return `${lo}–${hi}°${neg}`;
  return `${Math.abs(a)}°${a < 0 ? neg : pos}–${Math.abs(b)}°${b < 0 ? neg : pos}`;
}

/** "40–50°E · 20–30°N" for a grid cell. */
export function formatCell({
  lon0,
  lat0,
  lon1,
  lat1,
}: {
  lon0: number;
  lat0: number;
  lon1: number;
  lat1: number;
}) {
  // A cell that wraps past the antimeridian reports lon1 above 180
  const east = lon1 > 180 ? lon1 - 360 : lon1;
  return `${formatSpan(lon0, east, "E", "W")} · ${formatSpan(lat0, lat1, "N", "S")}`;
}
