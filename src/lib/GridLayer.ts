import { geoGraticule, range, type GeoGeometryObjects } from "d3";
import type { MultiLineString } from "geojson";
import type { Extent } from "./regions";

/**
 * Cells are `step` degrees square. Grid lines sit at `offset + k * step`
 * (longitude, latitude), so an offset shifts the whole grid.
 */
export interface Grid {
  step: number;
  /** [lon, lat] shift in degrees, each in [0, step). */
  offset: [number, number];
}

export const WORLD: Extent = [
  [-180, -90],
  [180, 90],
];

// Lines are densified to this many degrees so they curve in any projection
const PRECISION = 2.5;

/** First grid line at or below `value`, along an axis with `offset`. */
export const lineBelow = (value: number, step: number, offset: number) =>
  Math.floor((value - offset) / step) * step + offset;

const lineAbove = (value: number, step: number, offset: number) =>
  Math.ceil((value - offset) / step) * step + offset;

export const isWorld = ([[lon0], [lon1]]: Extent) => lon1 - lon0 >= 360;

/**
 * Grows `extent` outward to the nearest grid lines, so the frame is made of
 * whole cells. The world is left as it is.
 */
export function snapExtent(extent: Extent, { step, offset }: Grid): Extent {
  const [[lon0, lat0], [lon1, lat1]] = extent;
  const snappedLat0 = Math.max(lineBelow(lat0, step, offset[1]), -90);
  const snappedLat1 = Math.min(lineAbove(lat1, step, offset[1]), 90);
  if (isWorld(extent)) {
    return [
      [lon0, snappedLat0],
      [lon1, snappedLat1],
    ];
  }
  return [
    [lineBelow(lon0, step, offset[0]), snappedLat0],
    [lineAbove(lon1, step, offset[0]), snappedLat1],
  ];
}

/** Longitudes and latitudes of the grid lines inside `extent`, edges included. */
export function gridLines({ step, offset }: Grid, extent: Extent) {
  const [[lon0, lat0], [lon1, lat1]] = extent;
  return {
    lons: range(lineAbove(lon0, step, offset[0]), lon1 + 1e-9, step),
    lats: range(lineAbove(lat0, step, offset[1]), lat1 + 1e-9, step),
  };
}

/** Densified points from `a` to `b`, both included. */
const densify = (a: number, b: number) => [...range(a, b - 1e-9, PRECISION), b];

/** The inner lines of the grid over `extent`; the edges are the outline's. */
export function createGrid(grid: Grid, extent: Extent): MultiLineString {
  const [[lon0, lat0], [lon1, lat1]] = extent;
  const { lons, lats } = gridLines(grid, extent);
  const inside = (min: number, max: number) => (v: number) =>
    v > min + 1e-9 && v < max - 1e-9;
  return {
    type: "MultiLineString",
    coordinates: [
      ...lons
        .filter(inside(lon0, lon1))
        .map((lon) => densify(lat0, lat1).map((lat) => [lon, lat])),
      ...lats
        .filter(inside(lat0, lat1))
        .map((lat) => densify(lon0, lon1).map((lon) => [lon, lat])),
    ],
  };
}

const rectangle = (extent: Extent) =>
  geoGraticule().extent(extent).precision(PRECISION).outline();

/** Outer border of the grid: the whole sphere for the world. */
export function createGridOutline(extent: Extent): GeoGeometryObjects {
  return isWorld(extent) ? { type: "Sphere" } : rectangle(extent);
}

export interface GridCell {
  /** In [-180, 180); `lon1` goes past 180 when the cell wraps round. */
  lon0: number;
  lat0: number;
  lon1: number;
  lat1: number;
}

/** The grid cell containing a point. */
export function cellAt(
  [lon, lat]: [number, number],
  { step, offset }: Grid,
): GridCell {
  let lon0 = lineBelow(lon, step, offset[0]);
  // The same cell whichever side of the antimeridian `lon` was given on
  lon0 = ((((lon0 + 180) % 360) + 360) % 360) - 180;
  const lat0 = lineBelow(lat, step, offset[1]);
  return {
    lon0,
    lat0: Math.max(lat0, -90),
    lon1: lon0 + step,
    lat1: Math.min(lat0 + step, 90),
  };
}

/** Polygon for a cell. Edges are densified so they follow any projection. */
export function cellOutline({ lon0, lat0, lon1, lat1 }: GridCell) {
  return rectangle([
    [lon0, lat0],
    [lon1, lat1],
  ]);
}
