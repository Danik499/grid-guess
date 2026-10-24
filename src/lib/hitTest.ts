import type { GeoProjection } from "d3";
import { cellAt, type Grid, type GridCell } from "./GridLayer";
import type { Extent } from "./regions";

/** The grid cell at an SVG point, or null if the point is off the map. */
export function cellAtPoint(
  [x, y]: [number, number],
  projection: GeoProjection,
  extent: Extent,
  grid: Grid,
): GridCell | null {
  const lonLat = projection.invert?.([x, y]);
  // Only cells over the map count: points outside the globe invert to
  // something that does not project back to where the pointer is.
  const back = lonLat && projection(lonLat);
  if (!lonLat || !back || Math.hypot(back[0] - x, back[1] - y) > 0.5) {
    return null;
  }
  const [[lon0, lat0], [lon1, lat1]] = extent;
  // The frame can run past 180°, where `invert` gives negative longitudes
  const lon = lonLat[0] < lon0 ? lonLat[0] + 360 : lonLat[0];
  if (lon >= lon1 || lonLat[1] < lat0 || lonLat[1] >= lat1) return null;
  return cellAt(lonLat, grid);
}
