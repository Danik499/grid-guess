import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Ring,
} from "polygon-clipping";
import type { Geometry } from "geojson";
import { cellAt, type GridCell } from "./GridLayer";

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

function cellToPlane({ lon0, lat0, lon1, lat1 }: GridCell): MultiPolygon {
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

/** How a country's area is split over the cells of a `step`-degree grid. */
export function computeCountryCells(
  geometry: Geometry,
  step: number,
): CountryCells {
  const country = geometryToPlane(geometry);

  // Lon/lat bounding box, to skip cells that cannot overlap
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const polygon of country) {
    for (const [x, y] of polygon[0]) {
      minLon = Math.min(minLon, x / RAD);
      maxLon = Math.max(maxLon, x / RAD);
      const lat = Math.asin(y) / RAD;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }

  const found: Omit<CellShare, "share">[] = [];
  const first = cellAt([minLon, minLat], step);
  for (let lon = first.lon0; lon < maxLon; lon += step) {
    for (let lat = first.lat0; lat < maxLat; lat += step) {
      const cell = cellAt([lon, lat], step);
      const sr = multiPolygonArea(polygonClipping.intersection(country, cellToPlane(cell)));
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
