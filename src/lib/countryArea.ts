import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Ring,
} from "polygon-clipping";
import type { Geometry } from "geojson";
import { cellAt, lineBelow, type Grid, type GridCell } from "./GridLayer";

const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

/**
 * Areas are measured in a Lambert cylindrical equal-area plane,
 * [lon, lat] -> [lon (radians), sin(lat)]. Meridians and parallels stay
 * straight there, so grid cells are exact rectangles, and planar area is
 * the area on the unit sphere (in steradians), whatever the latitude.
 */
const toPlane = ([lon, lat]: number[]): Pair => [lon * RAD, Math.sin(lat * RAD)];

function geometryToPlane(geometry: Geometry): MultiPolygon {
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  return polygons.map((polygon) => polygon.map((ring) => ring.map(toPlane)));
}

function ringArea(ring: Ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    sum += x0 * y1 - x1 * y0;
  }
  return Math.abs(sum) / 2;
}

/** Area in steradians; the first ring is the outline, the rest are holes. */
function multiPolygonArea(multiPolygon: MultiPolygon) {
  let area = 0;
  for (const [outer, ...holes] of multiPolygon) {
    area += ringArea(outer) - holes.reduce((sum, hole) => sum + ringArea(hole), 0);
  }
  return area;
}

function rectangleToPlane(
  lon0: number,
  lat0: number,
  lon1: number,
  lat1: number,
): MultiPolygon {
  const [x0, y0] = toPlane([lon0, lat0]);
  const [x1, y1] = toPlane([lon1, lat1]);
  return [
    [
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ],
    ],
  ];
}

/** A cell wrapping past 180° becomes two rectangles, one on either side. */
function cellToPlane({ lon0, lat0, lon1, lat1 }: GridCell): MultiPolygon {
  if (lon1 <= 180) return rectangleToPlane(lon0, lat0, lon1, lat1);
  return [
    ...rectangleToPlane(lon0, lat0, 180, lat1),
    ...rectangleToPlane(-180, lat0, lon1 - 360, lat1),
  ];
}

export const cellKey = ({ lon0, lat0 }: GridCell) => `${lon0},${lat0}`;

/** Area of a whole grid cell, in km². */
export function cellAreaKm2(cell: GridCell) {
  return multiPolygonArea(cellToPlane(cell)) * EARTH_RADIUS_KM ** 2;
}

export interface CellShare {
  cell: GridCell;
  /** Area of the country inside the cell, km². */
  areaKm2: number;
  /** Fraction (0-1) of the country's total area that lies in the cell. */
  share: number;
  /** Fraction (0-1) of the cell that the country covers. */
  coverage: number;
}

export type RankedCellShare = CellShare & { rank: number };

export interface CountryCells {
  totalKm2: number;
  /** Cells the country touches, largest share first. */
  cells: CellShare[];
  byKey: Map<string, RankedCellShare>;
}

/** Area of a country, in km². */
export function countryAreaKm2(geometry: Geometry) {
  return multiPolygonArea(geometryToPlane(geometry)) * EARTH_RADIUS_KM ** 2;
}

/** Lon/lat bounding box of a geometry, skipping holes. */
export function countryBounds(geometry: Geometry) {
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const polygon of geometryToPlane(geometry)) {
    for (const [x, y] of polygon[0]) {
      minLon = Math.min(minLon, x / RAD);
      maxLon = Math.max(maxLon, x / RAD);
      const lat = Math.asin(y) / RAD;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

/** How a country's area is split over the cells of `grid`. */
export function computeCountryCells(
  geometry: Geometry,
  grid: Grid,
): CountryCells {
  const country = geometryToPlane(geometry);

  // Only cells within the bounding box can overlap
  const { minLon, maxLon, minLat, maxLat } = countryBounds(geometry);
  const { step, offset } = grid;
  // Walk the grid lines themselves: cells' own bounds wrap and clamp
  const startLon = lineBelow(minLon, step, offset[0]);
  const startLat = lineBelow(minLat, step, offset[1]);

  const found: Omit<CellShare, "share">[] = [];
  // A cell wrapping round 180° is reached from both of its sides
  const seen = new Set<string>();
  for (let lon = startLon; lon < maxLon; lon += step) {
    for (let lat = startLat; lat < maxLat; lat += step) {
      const cell = cellAt([lon, lat], grid);
      const key = cellKey(cell);
      if (seen.has(key)) continue;
      seen.add(key);
      const sr = multiPolygonArea(
        polygonClipping.intersection(country, cellToPlane(cell)),
      );
      if (sr <= 0) continue;
      const areaKm2 = sr * EARTH_RADIUS_KM ** 2;
      found.push({ cell, areaKm2, coverage: areaKm2 / cellAreaKm2(cell) });
    }
  }

  // Cells tile the globe, so their sum is the country's area
  const totalKm2 = found.reduce((sum, c) => sum + c.areaKm2, 0);
  const cells = found
    .map((c) => ({ ...c, share: c.areaKm2 / totalKm2 }))
    .sort((a, b) => b.areaKm2 - a.areaKm2);
  const byKey = new Map(
    cells.map((c, i) => [cellKey(c.cell), { ...c, rank: i + 1 }]),
  );
  return { totalKm2, cells, byKey };
}
